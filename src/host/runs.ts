import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { isoLocal } from '../core/fbmf'
import { RUN_TIMEOUT_MS, routineResult } from '../core/runs'

/**
 * BR-1 · 루틴 실행 기록 (2026-10-09). 종전엔 실패 기록이 300건 상한 알림 목록과 휘발되는 콘솔뿐이라,
 * 감시기(ops-watch)가 「루틴이 돌았나·실패했나」를 볼 원천이 없었다.
 *  - `<볼트>/.folderbot/ops/runs-YYYY-MM.jsonl` — 한 줄 = 한 사건(start · end · timeout)
 *  - 사본: `.claude/bridges.yml` 의 `runs_copy` 폴더에 `folderbot-YYYY-MM.jsonl` (감시기가 읽는 자리)
 * 쓰는 것은 그 루틴을 돌린 호스트 하나다(루틴은 호스트에서만 돈다).
 */
export interface RunEvent { event: 'start' | 'end' | 'timeout' | 'retry' | 'peer_stale' | 'peer_ok' | 'wake' | 'report' | 'ops_watch'; botId?: string; bot?: string; routine?: string; run?: string; ok?: boolean; result?: string; reason?: string; error?: string; ms?: number; attempt?: number; catchup?: string; peer?: string; [k: string]: unknown }

/** CI · 호스트가 다시 떠서 끊긴 회차의 끝 사유 — 감시기·화면이 이 말로 가른다 */
export const INTERRUPTED_REASON = '호스트 재시작으로 중단'

export class RunLog {
  private open = new Map<string, { botId: string; bot: string; routine: string; at: number; timedOut?: boolean }>()
  constructor(private root: string, private copyDir: () => string | undefined, private host: () => string, private log: (s: string) => void = () => {}, private now: () => number = () => Date.now()) {}

  /** 루틴 회차 밖의 사건(연결 끊김·깨우기·재시도 예약)도 같은 기록에 남긴다 — 감시기가 한 곳만 읽게 */
  note(e: RunEvent): void { this.write(e) }
  private write(e: RunEvent): void {
    const d = new Date(this.now())
    const month = isoLocal(d).slice(0, 7)
    const line = JSON.stringify({ ts: isoLocal(d), host: this.host(), ...e }) + '\n'
    const targets = [join(this.root, '.folderbot', 'ops', `runs-${month}.jsonl`)]
    const c = this.copyDir(); if (c) targets.push(join(isAbsolute(c) ? c : resolve(this.root, c), `folderbot-${month}.jsonl`))
    for (const f of targets) { try { mkdirSync(join(f, '..'), { recursive: true }); appendFileSync(f, line) } catch (err) { this.log(`실행 기록을 못 썼어요 · ${f} · ${(err as Error).message}`) } }
  }
  start(run: string, botId: string, bot: string, routine: string, extra: { attempt?: number; catchup?: number } = {}): void {
    this.open.set(run, { botId, bot, routine, at: this.now() })
    this.write({ event: 'start', botId, bot, routine, run, ...(extra.attempt && extra.attempt > 1 ? { attempt: extra.attempt } : {}), ...(extra.catchup ? { catchup: isoLocal(new Date(extra.catchup)) } : {}) })
  }
  /** 루틴 세션의 턴이 끝났다 — 이 호스트가 시작한 회차만 한 번 적는다 */
  /** @returns 적었으면 그 결과(재시도 판단에 쓴다), 이 호스트가 시작 안 한 회차면 null */
  end(run: string, ok: boolean, lastText: string | undefined, error?: string): { ok: boolean; result: string } | null {
    const o = this.open.get(run); if (!o) return null
    this.open.delete(run)
    const r = routineResult(lastText)
    const out = { ok: ok && r.result !== 'fail', result: ok ? r.result : 'fail' }
    this.write({ event: 'end', botId: o.botId, bot: o.bot, routine: o.routine, run, ...out, ...(r.reason ? { reason: r.reason } : {}), ...(error ? { error: error.slice(0, 300) } : {}), ms: this.now() - o.at })
    return out
  }
  /**
   * RB · 지난달·이번 달 실행 기록을 통째로 읽는다(모든 호스트 것 · 시각 순) — 루틴 보드·공유 «이미 돌았나» 판단이 쓴다.
   *    깨진 줄은 건너뛴다. 파일이 없으면 빈 목록.
   */
  events(): (RunEvent & { ts: string; host?: string })[] {
    const now = new Date(this.now())
    const months = [isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7), isoLocal(now).slice(0, 7)]
    const out: (RunEvent & { ts: string; host?: string })[] = []
    for (const m of months) {
      const f = join(this.root, '.folderbot', 'ops', `runs-${m}.jsonl`)
      if (!existsSync(f)) continue
      let text = ''; try { text = readFileSync(f, 'utf8') } catch (e) { this.log(`실행 기록을 못 읽었어요 · ${f} · ${(e as Error).message}`); continue }
      for (const line of text.split('\n')) { if (!line.trim()) continue; try { const e = JSON.parse(line); if (e && typeof e.ts === 'string' && e.event) out.push(e) } catch { /* 깨진 줄 */ } }
    }
    return out
  }
  /**
   * 🔴 **CI · 켜질 때 한 번 — 시작만 적히고 끝이 없는 회차를 닫는다** (2026-10-13 오케스트레이터 제보).
   *    10/13 12:00 SNS 게시 루틴이 2분 뒤 업데이트 적용(앱 재시작)으로 끊겼다. 세션은 «쉬는 중» 으로 돌아왔고(session.ts 생성자 —
   *    다시 뜬 호스트에는 워커가 없다) 기록에는 start 만 남아, 감시기는 7시간 넘게 «실행 중» 으로만 봤다. Dave 가 승인한 게시가 조용히 빠졌다.
   *    끝을 적는 `open` 은 메모리에만 있으니, 이 호스트가 시작하고 끝을 못 적은 회차는 켜지는 순간 전부 «끊긴 회차» 다.
   * ⚠ 다른 호스트가 시작한 회차는 안 건드린다(그 호스트가 적는다) · 이번 달과 지난달 파일만 · `windowMs` 보다 오래된 것은 둔다.
   * @returns 닫은 회차(시작 시각 · 몇 번째 시도) — 재시도·알림은 호스트가 정한다
   */
  recoverInterrupted(windowMs = 7 * 24 * 3600_000): { run: string; botId: string; bot: string; routine: string; at: number; attempt: number }[] {
    const now = new Date(this.now()), me = this.host()
    const months = [isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7), isoLocal(now).slice(0, 7)]
    const starts = new Map<string, { botId: string; bot: string; routine: string; at: number; attempt: number }>(), ended = new Set<string>()
    for (const m of months) {
      const f = join(this.root, '.folderbot', 'ops', `runs-${m}.jsonl`)
      if (!existsSync(f)) continue
      let text = ''; try { text = readFileSync(f, 'utf8') } catch (e) { this.log(`실행 기록을 못 읽었어요 · ${f} · ${(e as Error).message}`); continue }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let e: RunEvent & { ts?: string; host?: string }; try { e = JSON.parse(line) } catch { continue }
        if (!e.run) continue
        if (e.event === 'end') ended.add(e.run)
        else if (e.event === 'start' && e.host === me && e.botId && e.routine) starts.set(e.run, { botId: e.botId, bot: e.bot ?? e.botId, routine: e.routine, at: Date.parse(e.ts ?? '') || 0, attempt: e.attempt ?? 1 })
      }
    }
    const out: { run: string; botId: string; bot: string; routine: string; at: number; attempt: number }[] = []
    for (const [run, s] of starts) {
      if (ended.has(run) || this.open.has(run) || this.now() - s.at > windowMs) continue
      this.write({ event: 'end', botId: s.botId, bot: s.bot, routine: s.routine, run, ok: false, result: 'fail', reason: INTERRUPTED_REASON, interrupted: true, ms: Math.max(0, this.now() - s.at) })
      out.push({ run, ...s })
    }
    return out
  }
  /** 오래 도는 회차를 한 번 적는다 — 호스트가 1분마다 부른다 */
  sweep(): void {
    for (const [run, o] of this.open) if (!o.timedOut && this.now() - o.at > RUN_TIMEOUT_MS) {
      o.timedOut = true
      this.write({ event: 'timeout', botId: o.botId, bot: o.bot, routine: o.routine, run, ms: this.now() - o.at })
    }
  }
}
