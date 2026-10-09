import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BY · 호스트 로그를 날짜별 파일로 (2026-10-09 소통 재설계). 데스크톱 앱은 호스트 로그를 `console.log` 로만 내보내서
 * **패키지된 앱에서는 아무 데도 남지 않았다** — 장애 때 호스트 쪽 기록이 없었다. `<dataDir>/logs/host-YYYY-MM-DD.log` 에 쓰고 7일 지난 것은 지운다.
 * ⚠ 토큰·키를 로그에 쓰지 않는 것은 쓰는 쪽의 몫이다(호스트 로그는 지금 경로·이름·상태만 쓴다).
 */
export class DailyLog {
  private lastSweep = 0
  constructor(private dir: string, private keepDays = 7, private now: () => Date = () => new Date()) {}
  private day(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  write(line: string): void {
    const d = this.now()
    try {
      mkdirSync(this.dir, { recursive: true })
      appendFileSync(join(this.dir, `host-${this.day(d)}.log`), `${d.toTimeString().slice(0, 8)} ${line}\n`)
      if (d.getTime() - this.lastSweep > 3600_000) this.sweep()
    } catch { /* 로그를 못 써도 호스트는 계속 돈다 */ }
  }
  /** @returns 지운 파일 이름 */
  sweep(): string[] {
    this.lastSweep = this.now().getTime()
    const cut = this.day(new Date(this.now().getTime() - this.keepDays * 86400_000)), out: string[] = []
    let names: string[] = []; try { names = readdirSync(this.dir) } catch { return out }
    for (const n of names) { const m = /^host-(\d{4}-\d{2}-\d{2})\.log$/.exec(n); if (m && m[1] < cut) { try { unlinkSync(join(this.dir, n)); out.push(n) } catch { /* */ } } }
    return out
  }
}
