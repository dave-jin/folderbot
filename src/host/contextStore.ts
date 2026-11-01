import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite, ensureDir } from './paths'
import type { SessionCard } from '../core/contextCard'
import { emptyTasks, type FolderTasks } from '../core/contextTasks'
import type { Board } from '../core/contextBoard'

/**
 * 맥락 상황판 저장소 — «맥락 상황판» 1단계 (2026-11-01).
 * - 카드(대화에서 뽑은 요약) · 본 시각 · Haiku 사용 기록은 **앱 데이터** `<dataDir>/context/` — 이 맥 것이라 Dropbox 로 안 나간다.
 * - 폴더 작업(`tasks.json`)은 그 봇 폴더 `.folderbot/context/`, 판(`board.json`·`board.md`)은 볼트 `.folderbot/context/` — 요약만 간다.
 * ⛔ 대화 원문은 볼트 쪽 파일에 쓰지 않는다. 같은 값이면 다시 쓰지 않는다(파일 감시가 자기 쓰기에 다시 깨어나지 않게).
 */
export class ContextStore {
  private dataDir: string
  private vaultRoot: string
  /** sessionId → 그 세션의 카드·조각 전부 */
  private cache = new Map<string, SessionCard[]>()
  private allLoaded = false

  constructor(o: { dataDir: string; vaultRoot: string }) { this.dataDir = o.dataDir; this.vaultRoot = o.vaultRoot }

  private ctx(): string { return join(this.dataDir, 'context') }
  private cardFile(sessionId: string): string { return join(this.ctx(), 'cards', `${sessionId.replace(/[^\w.-]/g, '_')}.json`) }

  // ── 카드 ───────────────────────────────────────────────────────────────────

  private load(sessionId: string): SessionCard[] {
    const hit = this.cache.get(sessionId)
    if (hit) return hit
    const cards = this.readCards(this.cardFile(sessionId))
    this.cache.set(sessionId, cards)
    return cards
  }
  private readCards(f: string): SessionCard[] {
    try { const j = JSON.parse(readFileSync(f, 'utf8')) as unknown; return Array.isArray(j) ? (j as SessionCard[]) : [] } catch { return [] }
  }

  card(id: string): SessionCard | null {
    return this.load(id.split('#')[0]).find((c) => c.id === id) ?? null
  }
  cardsOf(sessionId: string): SessionCard[] { return [...this.load(sessionId)] }

  putCard(c: SessionCard): void {
    const cards = this.load(c.sessionId).filter((x) => x.id !== c.id)
    cards.push(c)
    cards.sort((a, b) => (a.seg ?? -1) - (b.seg ?? -1))
    this.cache.set(c.sessionId, cards)
    ensureDir(join(this.ctx(), 'cards'))
    atomicWrite(this.cardFile(c.sessionId), JSON.stringify(cards))
  }

  folderCards(botId: string, since: number): SessionCard[] {
    this.loadAll()
    const out: SessionCard[] = []
    for (const cards of this.cache.values()) for (const c of cards) if (c.botId === botId && c.to >= since) out.push(c)
    return out
  }
  private loadAll(): void {
    if (this.allLoaded) return
    const dir = join(this.ctx(), 'cards')
    let names: string[] = []
    try { names = readdirSync(dir) } catch { /* 아직 카드가 없다 */ }
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      const cards = this.readCards(join(dir, n))
      const sid = cards[0]?.sessionId
      if (sid !== undefined && !this.cache.has(sid)) this.cache.set(sid, cards)
    }
    this.allLoaded = true
  }

  // ── 폴더 작업 ──────────────────────────────────────────────────────────────

  private tasksFile(botAbs: string): string { return join(botAbs, '.folderbot', 'context', 'tasks.json') }
  tasks(botAbs: string, botId: string): FolderTasks {
    const t = readJson<FolderTasks>(this.tasksFile(botAbs))
    return t && t.v === 1 ? t : emptyTasks(botId)
  }
  /** `updatedAt` 은 비교에서 뺀다 — 값이 같으면 쓰지 않고 false */
  putTasks(botAbs: string, t: FolderTasks): boolean {
    const f = this.tasksFile(botAbs)
    const old = readJson<FolderTasks>(f)
    if (old && same({ ...old, updatedAt: 0 }, { ...t, updatedAt: 0 })) return false
    ensureDir(join(botAbs, '.folderbot', 'context'))
    atomicWrite(f, JSON.stringify(t, null, 2))
    return true
  }

  // ── 판 ─────────────────────────────────────────────────────────────────────

  private boardDir(): string { return join(this.vaultRoot, '.folderbot', 'context') }
  board(): Board | null {
    const b = readJson<Board>(join(this.boardDir(), 'board.json'))
    return b && b.v === 1 ? b : null
  }
  /** `at` 은 비교에서 뺀다 — 판 내용이 같고 board.md 가 있으면 쓰지 않고 false */
  putBoard(b: Board, md: string): boolean {
    const dir = this.boardDir(), jf = join(dir, 'board.json'), mf = join(dir, 'board.md')
    const old = readJson<Board>(jf)
    if (old && existsSync(mf) && same({ ...old, at: 0 }, { ...b, at: 0 })) return false
    ensureDir(dir)
    atomicWrite(jf, JSON.stringify(b, null, 2))
    atomicWrite(mf, md)
    return true
  }

  // ── 본 시각 · 사용 기록 ────────────────────────────────────────────────────

  seen(): number | null {
    const j = readJson<{ at?: unknown }>(join(this.ctx(), 'seen.json'))
    return j && typeof j.at === 'number' ? j.at : null
  }
  markSeen(at: number): number | null {
    const prev = this.seen()
    ensureDir(this.ctx())
    atomicWrite(join(this.ctx(), 'seen.json'), JSON.stringify({ at }))
    return prev
  }

  usageLog(e: { at: number; job: string; model: string; ms: number; ok: boolean; chars: number }): void {
    ensureDir(this.ctx())
    appendFileSync(join(this.ctx(), 'usage.jsonl'), JSON.stringify(e) + '\n')
  }
}

function readJson<T>(f: string): T | null {
  try { const j = JSON.parse(readFileSync(f, 'utf8')) as unknown; return j && typeof j === 'object' ? (j as T) : null } catch { return null }
}

/** 키 순서와 상관없이 같은 값인가 */
function same(a: unknown, b: unknown): boolean { return canon(a) === canon(b) }
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x))
}
