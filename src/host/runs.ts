import { appendFileSync, mkdirSync } from 'node:fs'
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
export interface RunEvent { event: 'start' | 'end' | 'timeout'; botId: string; bot: string; routine: string; run: string; ok?: boolean; result?: string; reason?: string; error?: string; ms?: number }

export class RunLog {
  private open = new Map<string, { botId: string; bot: string; routine: string; at: number; timedOut?: boolean }>()
  constructor(private root: string, private copyDir: () => string | undefined, private host: () => string, private log: (s: string) => void = () => {}, private now: () => number = () => Date.now()) {}

  private write(e: RunEvent): void {
    const d = new Date(this.now())
    const month = isoLocal(d).slice(0, 7)
    const line = JSON.stringify({ ts: isoLocal(d), host: this.host(), ...e }) + '\n'
    const targets = [join(this.root, '.folderbot', 'ops', `runs-${month}.jsonl`)]
    const c = this.copyDir(); if (c) targets.push(join(isAbsolute(c) ? c : resolve(this.root, c), `folderbot-${month}.jsonl`))
    for (const f of targets) { try { mkdirSync(join(f, '..'), { recursive: true }); appendFileSync(f, line) } catch (err) { this.log(`실행 기록을 못 썼어요 · ${f} · ${(err as Error).message}`) } }
  }
  start(run: string, botId: string, bot: string, routine: string): void {
    this.open.set(run, { botId, bot, routine, at: this.now() })
    this.write({ event: 'start', botId, bot, routine, run })
  }
  /** 루틴 세션의 턴이 끝났다 — 이 호스트가 시작한 회차만 한 번 적는다 */
  end(run: string, ok: boolean, lastText: string | undefined, error?: string): void {
    const o = this.open.get(run); if (!o) return
    this.open.delete(run)
    const r = routineResult(lastText)
    this.write({ event: 'end', botId: o.botId, bot: o.bot, routine: o.routine, run, ok: ok && r.result !== 'fail', result: ok ? r.result : 'fail', ...(r.reason ? { reason: r.reason } : {}), ...(error ? { error: error.slice(0, 300) } : {}), ms: this.now() - o.at })
  }
  /** 오래 도는 회차를 한 번 적는다 — 호스트가 1분마다 부른다 */
  sweep(): void {
    for (const [run, o] of this.open) if (!o.timedOut && this.now() - o.at > RUN_TIMEOUT_MS) {
      o.timedOut = true
      this.write({ event: 'timeout', botId: o.botId, bot: o.bot, routine: o.routine, run, ms: this.now() - o.at })
    }
  }
}
