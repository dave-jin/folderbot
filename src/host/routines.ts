import { Cron } from 'croner'
import type { Bot, PermissionMode, RoutineDef } from '../core/types'

export interface RoutineRunner { run: (bot: Bot, r: RoutineDef) => void; log: (msg: string) => void }

/** 루틴 스케줄러 — 봇 목록이 바뀔 때마다 다시 짠다 */
export class Routines {
  private jobs: Cron[] = []
  constructor(private runner: RoutineRunner) {}
  reschedule(bots: Bot[]): void {
    for (const j of this.jobs) j.stop()
    this.jobs = []
    for (const b of bots) for (const r of b.routines) {
      try {
        const job = new Cron(r.cron, { timezone: undefined }, () => this.runner.run(b, r))
        this.jobs.push(job)
      } catch (e) { this.runner.log(`루틴 cron 이 이상해요: ${b.name} · ${r.name} · ${(e as Error).message}`) }
    }
  }
  next(): { bot: string; name: string; at: number }[] {
    return this.jobs.map((j) => ({ bot: '', name: '', at: j.nextRun()?.getTime() ?? 0 }))
  }
}

export function approveToMode(a: RoutineDef['approve']): PermissionMode {
  return a === 'always' ? 'bypassPermissions' : a === 'folder' ? 'acceptEdits' : 'plan'
}
