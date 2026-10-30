import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Bot } from '../core/types'
import type { ChangeRow } from '../core/routineBoard'
import { NOTE_CLOSE, OPEN_PREFIX, renderNote, replaceBlock } from '../core/routineNote'

/**
 * RB-3 · 루틴 변경 기록(`<볼트>/.folderbot/ops/routine-changes.jsonl` · 누가·언제·무엇·이유)과 폴더별 CLAUDE.md 루틴 구역.
 *  - 오케스트레이터 루틴은 볼트 루트 `CLAUDE.md` 에 쓰지 않는다 — 모든 폴더 봇이 물려받는다. `.claude/orchestrator.md` 에 쓴다.
 *  - 폴더에 CLAUDE.md 가 없으면 만들지 않는다(새로 만드는 것은 Dave 승인 사항) — 페이지가 «CLAUDE.md 없음» 을 띄운다.
 *  - 바뀐 것이 없으면 쓰지 않는다 · 쓰기는 읽고 → 바꿔 끼우고 → 같으면 안 씀 → 임시 파일 → rename.
 */
export class RoutineNotes {
  private rows: ChangeRow[] | null = null
  /** 마지막으로 읽은 기록 파일의 크기·mtime — 다른 맥이 덧붙이면 달라진다 */
  private stamp = ''
  private sigs = new Map<string, string>()
  /** 🔴 최종 리뷰 · 구역은 루틴 주인 호스트만 쓴다(설계 §5 «다른 호스트는 보여 주기만») — 두 맥이 낡은 기록으로 서로 덮어쓰지 않게 */
  constructor(private d: { root: string; log: (m: string) => void; owner?: () => boolean }) {}
  private stat(): string { try { const s = statSync(this.file()); return `${s.size}:${s.mtimeMs}` } catch { return '' } }

  private file(): string { return join(this.d.root, '.folderbot', 'ops', 'routine-changes.jsonl') }
  all(): ChangeRow[] {
    const st = this.stat()
    if (this.rows && st === this.stamp) return this.rows
    this.rows = []; this.stamp = st
    try { if (existsSync(this.file())) for (const l of readFileSync(this.file(), 'utf8').split('\n')) { if (!l.trim()) continue; try { this.rows.push(JSON.parse(l) as ChangeRow) } catch { /* 깨진 줄 */ } } } catch (e) { this.d.log(`루틴 변경 기록을 못 읽었어요: ${(e as Error).message}`) }
    return this.rows
  }
  record(c: ChangeRow): void {
    this.all().push(c)
    try { mkdirSync(dirname(this.file()), { recursive: true }); appendFileSync(this.file(), JSON.stringify(c) + '\n'); this.stamp = this.stat() } catch (e) { this.d.log(`루틴 변경 기록을 못 썼어요: ${(e as Error).message}`) }
  }
  /** 그 봇의 최근 변경 — 최신 먼저 */
  recent(botId: string, n = 5): ChangeRow[] { return this.all().filter((c) => c.botId === botId).sort((a, b) => b.at - a.at).slice(0, n) }
  /** 구역을 쓸 파일 — 없으면 null */
  noteFile(bot: Bot): string | null {
    const f = bot.orchestrator ? join(this.d.root, '.claude', 'orchestrator.md') : join(bot.abs, 'CLAUDE.md')
    return existsSync(f) ? f : null
  }
  /** 봇 목록이 바뀔 때마다 — 루틴(이름·주기·켜짐)이나 변경 기록이 달라진 봇만 다시 쓴다 */
  sync(bots: Bot[]): void {
    if (this.d.owner && !this.d.owner()) return
    for (const b of bots) {
      const routines = b.routines.map((r) => ({ name: r.name, cron: r.cron, enabled: r.enabled !== false }))
      const recent = this.recent(b.id)
      const sig = JSON.stringify([routines, recent.map((c) => c.at)])
      if (this.sigs.get(b.id) === sig) continue
      this.sigs.set(b.id, sig)
      const f = this.noteFile(b); if (!f) continue
      try {
        const text = readFileSync(f, 'utf8')
        const out = replaceBlock(text, renderNote(routines, recent, b.orchestrator ? '.claude/routines.yml' : '.bot.yml'))
        if (out === text) { if (text.includes(OPEN_PREFIX) && !text.includes(NOTE_CLOSE)) this.d.log(`루틴 구역의 닫는 표식(${NOTE_CLOSE})이 없어 건드리지 않았어요 · ${f}`); continue }
        const tmp = `${f}.${process.pid}.tmp`; writeFileSync(tmp, out); renameSync(tmp, f)
      } catch (e) { this.d.log(`루틴 구역을 못 썼어요 · ${f} · ${(e as Error).message}`) }
    }
  }
}
