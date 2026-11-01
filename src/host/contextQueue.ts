import type { PlanUsage } from '../core/usage'

/**
 * Haiku 한 줄 줄 — «맥락 상황판» 1단계 (2026-11-01).
 * 카드·묶음·축 일을 **한 번에 하나씩** 부른다. 같은 key 는 디바운스(타이머를 다시 건다), 요금제 창이 80 에 닿으면 멈추고
 * 10분마다 다시 보며, 하루 상한을 넘으면 로컬 자정까지 멈춘다. 밀린 일은 버리지 않고 넣은 차례(디바운스가 끝난 차례)대로 따라잡는다.
 * 🔴 상한은 **일이 아니라 모델 호출**을 센다(최종 검토 1) — 일 하나가 조각마다 부르므로, 일이 부를 때마다 `charge()` 하고
 *    부르기 전에 `blocked()` 를 본다. 막히면 일이 스스로 멈추고 같은 key 를 다시 poke 한다.
 *
 * ⚠ 시계·타이머·사용량·실행기를 전부 주입받는다 — 진짜 `setTimeout` 을 쓰지 않아 유닛이 시간을 직접 몬다.
 */
export type JobKey = string                          // `card:<sessionId>` · `group:<botId>` · 'axis'
export interface QueueDeps {
  now(): number
  usage(): PlanUsage | null
  cap(): number
  off(): boolean
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(t: unknown): void
  log(m: string): void
}
export const CARD_DEBOUNCE_MS = 120_000
export const GROUP_DEBOUNCE_MS = 60_000
export const USAGE_STOP = 80
export const USAGE_RECHECK_MS = 600_000
export const AXIS_MIN_GAP_MS = 30 * 60_000

type Run = () => Promise<unknown>
interface Waiting { run: Run; timer: unknown }

const dayOf = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
/** 다음 로컬 자정까지 남은 ms (최소 1) */
const untilMidnight = (ms: number): number => { const d = new Date(ms); return Math.max(1, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - ms) }

export class ContextQueue {
  private waiting = new Map<JobKey, Waiting>()                       // 디바운스 중
  private ready: { key: JobKey; run: Run }[] = []                    // 디바운스가 끝나 차례를 기다림(FIFO)
  private current: JobKey | null = null
  private again = new Map<JobKey, { ms: number; run: Run }>()        // 도는 중에 다시 poke 된 key
  private count = 0
  private day: string
  private resume: unknown = null
  private idlers: (() => void)[] = []

  constructor(private d: QueueDeps) { this.day = dayOf(d.now()) }

  /** 오늘 부른 수 — 로컬 날짜가 바뀌면 0 */
  get calls(): number { this.rollDay(); return this.count }
  private rollDay(): void {
    const day = dayOf(this.d.now())
    if (day !== this.day) { this.day = day; this.count = 0 }
  }

  /** 모델을 한 번 부를 때마다 — 일 하나가 여러 번 부르면 그만큼 센다 */
  charge(): void { this.rollDay(); this.count++ }
  /** 지금 모델을 불러도 되나 — 꺼짐·상한·사용량 80 이면 막는다. 못 재면 부르지 않는다 */
  blocked(): boolean { const { why, err } = this.check(); return err || why !== null }

  /** 지금 멈춘 까닭 — 읽을 때마다 새로 잰다. 재다 실패하면 null(`check` 가 로그를 남긴다) */
  get paused(): null | 'usage' | 'cap' | 'off' { return this.check().why }

  /** 주입받은 값이 던져도 밖으로 새지 않는다 — `err` 면 «지금은 돌릴 수 없음» 으로 다룬다 */
  private check(): { why: null | 'usage' | 'cap' | 'off'; err: boolean } {
    try {
      if (this.d.off()) return { why: 'off', err: false }
      if (this.calls >= this.d.cap()) return { why: 'cap', err: false }
      const u = this.d.usage()
      if (u && u.available && ((u.five?.used ?? 0) >= USAGE_STOP || (u.week?.used ?? 0) >= USAGE_STOP)) return { why: 'usage', err: false }
      return { why: null, err: false }
    } catch (e) {
      this.safeLog(`context 줄 점검 실패: ${e instanceof Error ? e.message : String(e)}`)
      return { why: null, err: true }
    }
  }
  private safeLog(m: string): void { try { this.d.log(m) } catch { /* 로그가 던져도 줄은 산다 */ } }

  pending(): number { return this.waiting.size + this.ready.length + (this.current !== null ? 1 : 0) }

  /** 줄이 빌 때까지 — 멈춘 동안은 풀린 뒤까지 기다린다 */
  idle(): Promise<void> {
    if (this.pending() === 0) return Promise.resolve()
    return new Promise((res) => { this.idlers.push(res) })
  }

  poke(key: JobKey, delayMs: number, run: Run): void {
    if (this.current === key) { this.again.set(key, { ms: delayMs, run }); return }
    const queued = this.ready.find((j) => j.key === key)
    if (queued) { queued.run = run; return }                         // 이미 차례를 기다리는 일은 새 실행기로만 바꾼다
    const w = this.waiting.get(key)
    if (w) this.d.clearTimer(w.timer)
    const timer = this.d.setTimer(() => {
      if (this.waiting.get(key)?.timer !== timer) return
      const cur = this.waiting.get(key)!
      this.waiting.delete(key)
      this.ready.push({ key, run: cur.run })
      this.pump()
    }, Math.max(0, delayMs))
    this.waiting.set(key, { run, timer })
  }

  private pump(): void {
    try {
      if (this.current !== null || this.ready.length === 0) return
      const { why, err } = this.check()
      if (err) { this.armResume('usage'); return }                 // 못 잰 동안은 돌리지 않고 평소 주기로 다시 본다
      if (why) { this.armResume(why); return }
      const job = this.ready.shift()!
      this.current = job.key
      this.exec(job).catch((e) => this.safeLog(`context 줄 오류 ${job.key}: ${e instanceof Error ? e.message : String(e)}`))
    } catch (e) {
      this.safeLog(`context 줄 오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private armResume(why: 'usage' | 'cap' | 'off'): void {
    if (this.resume !== null) return
    const ms = why === 'cap' ? untilMidnight(this.d.now()) : USAGE_RECHECK_MS
    this.resume = this.d.setTimer(() => { this.resume = null; this.pump() }, ms)
  }

  private async exec(job: { key: JobKey; run: Run }): Promise<void> {
    try {
      await job.run()
    } catch (e) {
      this.safeLog(`context 일 실패 ${job.key}: ${e instanceof Error ? e.message : String(e)}`)
    }
    this.current = null
    const re = this.again.get(job.key)
    if (re) { this.again.delete(job.key); this.poke(job.key, re.ms, re.run) }
    this.pump()
    if (this.pending() === 0) { const l = this.idlers; this.idlers = []; for (const f of l) f() }
  }
}
