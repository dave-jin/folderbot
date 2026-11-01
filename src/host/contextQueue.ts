import type { PlanUsage } from '../core/usage'

/**
 * Haiku 한 줄 줄 — «맥락 상황판» 1단계 (2026-11-01).
 * 카드·묶음·축 일을 **한 번에 하나씩** 부른다. 같은 key 는 디바운스(타이머를 다시 건다), 요금제 창이 80 에 닿으면 멈추고
 * 10분마다 다시 보며, 하루 상한을 넘으면 로컬 자정까지 멈춘다. 밀린 일은 버리지 않고 넣은 차례(디바운스가 끝난 차례)대로 따라잡는다.
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

type Run = () => Promise<boolean>
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

  /** 지금 멈춘 까닭 — 읽을 때마다 새로 잰다 */
  get paused(): null | 'usage' | 'cap' | 'off' {
    if (this.d.off()) return 'off'
    if (this.calls >= this.d.cap()) return 'cap'
    const u = this.d.usage()
    if (u && u.available && ((u.five?.used ?? 0) >= USAGE_STOP || (u.week?.used ?? 0) >= USAGE_STOP)) return 'usage'
    return null
  }

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
    if (this.current !== null || this.ready.length === 0) return
    const why = this.paused
    if (why) { this.armResume(why); return }
    const job = this.ready.shift()!
    this.current = job.key
    void this.exec(job)
  }

  private armResume(why: 'usage' | 'cap' | 'off'): void {
    if (this.resume !== null) return
    const ms = why === 'cap' ? untilMidnight(this.d.now()) : USAGE_RECHECK_MS
    this.resume = this.d.setTimer(() => { this.resume = null; this.pump() }, ms)
  }

  private async exec(job: { key: JobKey; run: Run }): Promise<void> {
    try {
      const called = await job.run()
      if (called) { this.rollDay(); this.count++ }
    } catch (e) {
      this.d.log(`context 일 실패 ${job.key}: ${e instanceof Error ? e.message : String(e)}`)
    }
    this.current = null
    const re = this.again.get(job.key)
    if (re) { this.again.delete(job.key); this.poke(job.key, re.ms, re.run) }
    this.pump()
    if (this.pending() === 0) { const l = this.idlers; this.idlers = []; for (const f of l) f() }
  }
}
