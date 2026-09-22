import { Cron } from 'croner'
import type { Bot, PermissionMode, RoutineDef } from '../core/types'
import { cronOk, describeCron } from '../core/when'

export interface RoutineRunner { run: (bot: Bot, r: RoutineDef) => void; log: (msg: string) => void }

/**
 * 루틴 스케줄러 — 봇 목록이 바뀔 때마다 다시 짠다.
 *
 * 🔴 **잘못된 주기를 조용히 삼키지 않는다** (AA-1 · 2026-09-22, 실제 사고 뒤). 종전에는 `new Cron(...)` 이 던진
 *    예외를 try/catch 로 먹고 로그 한 줄만 남겼다 — **화면에는 루틴이 멀쩡히 살아 있는데 한 번도 안 돌았고,
 *    사람은 이틀을 몰랐다.** 이제 실패는 그 루틴에 `lastError` 로 **붙어서 화면까지 간다.**
 * 🔴 **`nextRun` 을 같이 실어 보낸다.** 「다음 실행」 한 칸이 있었으면 사고를 그 자리에서 알아챘다.
 */
export class Routines {
  private jobs: Cron[] = []
  /** `${botId}::${name}` → 마지막 스케줄 결과. 화면으로 나가는 값이라 파일에는 안 쓴다 */
  private state = new Map<string, { error?: string; next?: number }>()
  constructor(private runner: RoutineRunner) {}

  private key(botId: string, name: string): string { return `${botId}::${name}` }

  /**
   * 다시 짜면서 **각 루틴에 결과를 적어 넣는다**(`lastError`·`nextRun`). 이 객체들은 `registry.bots()` 가
   * `.bot.yml` 을 매번 새로 읽어 만든 사본이라 파일로 새지 않는다 — 저장 길목은 `stripRuntime()` 이 한 번 더 막는다.
   */
  reschedule(bots: Bot[]): void {
    for (const j of this.jobs) j.stop()
    this.jobs = []
    this.state.clear()
    for (const b of bots) for (const r of b.routines) {
      delete r.lastError; delete r.nextRun
      if (r.enabled === false) { this.state.set(this.key(b.id, r.name), {}); continue }
      const v = cronOk(r.cron)
      if (!v.ok) {
        r.lastError = v.error
        this.state.set(this.key(b.id, r.name), { error: v.error })
        this.runner.log(`⚠ 루틴이 안 걸렸어요: ${b.name} · ${r.name} · 주기 "${r.cron}" — ${v.error}`)
        continue
      }
      try {
        const job = new Cron(r.cron, { timezone: undefined }, () => this.runner.run(b, r))
        this.jobs.push(job)
        const next = job.nextRun()?.getTime()
        if (next) r.nextRun = next
        this.state.set(this.key(b.id, r.name), { next })
      } catch (e) {
        // cronOk 가 통과했는데도 여기서 터지면 croner 판이 바뀐 것이다 — 그때도 조용히 넘기지 않는다
        const msg = (e as Error).message
        r.lastError = msg
        this.state.set(this.key(b.id, r.name), { error: msg })
        this.runner.log(`⚠ 루틴이 안 걸렸어요: ${b.name} · ${r.name} · ${msg}`)
      }
    }
  }

  /** 화면·도구가 묻는다 — 「이 루틴 지금 어떤가」 */
  status(botId: string, name: string): { error?: string; next?: number } { return this.state.get(this.key(botId, name)) ?? {} }
  /** 한 봇의 루틴 목록에 화면용 값을 얹어 돌려준다(원본은 안 건드린다) */
  decorate(botId: string, routines: RoutineDef[]): RoutineDef[] {
    return routines.map((r) => { const st = this.status(botId, r.name); return { ...r, ...(st.error ? { lastError: st.error } : {}), ...(st.next ? { nextRun: st.next } : {}) } })
  }
  /** 사람이 읽는 한 줄 — 「매일 저녁 8시」 */
  static describe(cron: string): string { return describeCron(cron) }
}

export function approveToMode(a: RoutineDef['approve']): PermissionMode {
  return a === 'always' ? 'bypassPermissions' : a === 'folder' ? 'acceptEdits' : 'plan'
}
