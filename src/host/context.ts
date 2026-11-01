import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Bot, ChatItem, SessionState } from '../core/types'
import type { PlanUsage } from '../core/usage'
import type { BoardRoutine } from '../core/routineBoard'
import { parseTodo } from '../core/todo'
import { cardPrompt, itemsSince, maskSensitive, parseCard, routineCard, transcript, type CardBody, type SessionCard } from '../core/contextCard'
import { VAULT_OPS, cardChannel, needsSplit, segmentFolder, splitSegments } from '../core/contextSegment'
import { applyGroup, groupPrompt, moveCard, parseGroup, reopen as reopenTask, taskState, routineTasks, type CtxTask, type FolderTasks, type GroupInput, type GroupResult, type TaskState } from '../core/contextTasks'
import { SNOOZE_MS, axisPrompt, brief, buildBoard, goalLine, outboxLines, renderBoardMd, story, type Board, type FolderInput, type GoalCard, type Period, type StoryRow } from '../core/contextBoard'
import { oneShot } from './oneShot'
import { settleCard } from './evidence'
import { AXIS_MIN_GAP_MS, CARD_DEBOUNCE_MS, ContextQueue, GROUP_DEBOUNCE_MS } from './contextQueue'
import { ContextStore } from './contextStore'
import type { SessionRec } from './session'

/**
 * 맥락 상황판 서비스 — «맥락 상황판» 1단계 (2026-11-01).
 * 턴이 끝난 세션을 카드로 줄이고(Haiku) · 폴더마다 작업으로 묶고(Haiku, 애매하면 Sonnet 한 번 더) · 판을 다시 지어 볼트에 둔다.
 *
 * 🔒 **볼트 쓰기와 모델 호출은 주인 맥만** (`ownsRoutines()`). 주인이 아니면 볼트 `board.json` 을 읽어 보여 주기만 하고 고치기는 `NotOwner`.
 * ⛔ 대화 원문은 볼트로 가지 않는다 — 카드는 앱 데이터, 볼트에는 요약(`tasks.json`·`board.json`·`board.md`)만.
 * ⚠ 호스트에서 받는 것은 `ContextHost` 하나다 — 유닛이 가짜로 채운다. 모델 호출(`ask`)도 주입한다.
 */
export interface ContextHost {
  readonly sessions: { all(): SessionRec[]; items(id: string): ChatItem[]; get(id: string): SessionRec | undefined }
  readonly registry: { bots(): Bot[]; readonly root: string }
  readonly cfg: { context?: { off?: boolean; dailyCap?: number } }
  ownsRoutines(): boolean
  routineBoard(): { routines: BoardRoutine[] }
  dataDir(): string
  hostName(): string
  planNow(): PlanUsage | null
  log(m: string): void
}
export type AskFn = typeof oneShot

/** 주인 맥이 아닌 곳에서 고치려 했다 — 게이트웨이가 409 로 바꾼다 */
export class NotOwner extends Error {
  constructor(readonly owner: string) { super(`주인 맥(${owner})에서만 고칠 수 있어요`); this.name = 'NotOwner' }
}

const DAY = 86_400_000
const HOUR = 3_600_000
const START_WINDOW_MS = 7 * DAY
const DEFAULT_CAP = 500
const AXIS_MAX = 200
const VAULT_OPS_NAME = '볼트 운영'
const ONE_SHOT_DIR = 'folderbot-context'
const CARD_SYSTEM = '너는 대화 기록을 «요약 카드» JSON 하나로 바꾸는 도구다. JSON 객체 하나만 답한다.'
const GROUP_SYSTEM = '너는 요약 카드들을 폴더의 작업으로 묶는 도구다. JSON 객체 하나만 답한다.'
const AXIS_SYSTEM = '너는 상황판을 보고 «오늘의 축» 한 문장을 쓰는 도구다. 문장 하나만 답한다.'
const STATES: readonly TaskState[] = ['done', 'claimed', 'running', 'stalled', 'waiting', 'todo']
/** state.md 「완료」 줄의 근거 — `근거` 글자 · 경로(`a/b`) · 파일 확장자 · 링크 */
const PROOF_RE = /근거|[^\s/]+\/[^\s/]+|\.(?:md|json|ts|tsx|js|py|pdf|txt|html|csv|xlsx|docx|pptx|hwpx?|png|jpe?g)\b|https?:\/\//i

export class ContextService {
  readonly store: ContextStore
  private q: ContextQueue
  private axis: Board['axis'] = null

  constructor(private h: ContextHost, private ask: AskFn = oneShot) {
    this.store = new ContextStore({ dataDir: h.dataDir(), vaultRoot: h.registry.root })
    this.q = new ContextQueue({
      now: () => Date.now(),
      usage: () => h.planNow(),
      cap: () => this.cap(),
      off: () => this.off(),
      setTimer: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t },
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      log: (m) => this.log(m)
    })
    this.axis = this.guard('판 읽기', () => this.store.board()?.axis ?? null, null)
  }

  // ── 설정 ───────────────────────────────────────────────────────────────────

  private cap(): number { const c = this.h.cfg.context?.dailyCap; return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : DEFAULT_CAP }
  private off(): boolean { return process.env.FOLDERBOT_CONTEXT === '0' || this.h.cfg.context?.off === true }
  private owner(): boolean { try { return this.h.ownsRoutines() } catch { return false } }
  /** 시험 전용 덮어쓰기 — 스모크가 2분을 기다릴 수 없다(Ruling 2) */
  private delay(kind: 'card' | 'group'): number {
    const raw = process.env.FOLDERBOT_CONTEXT_DEBOUNCE_MS
    const v = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
    if (Number.isFinite(v) && v >= 0) return v
    return kind === 'card' ? CARD_DEBOUNCE_MS : GROUP_DEBOUNCE_MS
  }
  private log(m: string): void { try { this.h.log(m) } catch { /* 로그가 던져도 산다 */ } }
  /** 호스트 쪽 진입점은 던지지 않는다 — 상황판 실패가 세션·파일 감시를 넘어뜨리면 안 된다 */
  private guard<T>(what: string, fn: () => T, fallback: T): T {
    try { return fn() } catch (e) { this.log(`맥락 상황판 · ${what} 실패: ${e instanceof Error ? e.message : String(e)}`); return fallback }
  }

  // ── 진입점 ─────────────────────────────────────────────────────────────────

  /** 주인이면 최근 7일 세션 중 카드가 없거나 cursor 가 뒤처진 것을 최신 순으로 줄에 세운다 */
  start(): void {
    this.guard('시작', () => {
      if (!this.owner() || this.off()) return
      const now = Date.now()
      const known = new Set(this.h.registry.bots().map((b) => b.id))
      const recent = this.h.sessions.all()
        .filter((r) => known.has(r.botId) && r.state !== 'running' && r.lastActivity >= now - START_WINDOW_MS)
        .sort((a, b) => b.lastActivity - a.lastActivity)
      for (const r of recent) {
        const items = this.h.sessions.items(r.id)
        const last = items[items.length - 1]
        if (!last || this.store.cardsOf(r.id).some((c) => c.cursor === last.id)) continue
        this.pokeCard(r.id)
      }
    }, undefined)
  }

  /** 루틴 세션 → 바로 루틴 카드(LLM 없음) · 그 밖 → `card:<id>` 2분 디바운스 */
  onTurnEnd(r: SessionRec): void {
    this.guard('턴 끝', () => {
      if (!this.owner() || this.off()) return
      if (isRoutine(r)) this.routineCardNow(r)
      else this.pokeCard(r.id)
    }, undefined)
  }

  /** 폴더 파일(todo·state)이 바뀌었을 수 있다 — `group:<botId>` 1분 디바운스 */
  onFiles(botId: string): void {
    this.guard('파일 신호', () => {
      if (!this.owner() || this.off()) return
      if (!this.h.registry.bots().some((b) => b.id === botId)) return
      this.pokeGroup(botId)
    }, undefined)
  }

  /** 주인 = 지금 카드·작업으로 지은 판 · 주인 아님 = 볼트 board.json(없으면 빈 판) */
  board(period: Period, since?: number): Board {
    const now = Date.now()
    const from = since ?? (period === 'today' ? now - DAY : period === 'week' ? now - 7 * DAY : (this.store.seen() ?? now - 7 * DAY))
    if (!this.owner()) return this.store.board() ?? this.emptyBoard(period, from, now)
    return this.compose(period, from, now)
  }

  /** 목표 펼치기 — 그 폴더의 목표 카드 · 작업 · 안 묶인 카드 · 이야기 · 함께 가는 맥락 */
  goal(botId: string, taskId: string | null): { goal: GoalCard | null; tasks: CtxTask[]; loose: SessionCard[]; story: StoryRow[]; brief: string } {
    const bot = this.botOf(botId)
    const now = Date.now()
    const f = this.folderInput(bot, now)
    const one = (since: number) => buildBoard({ folders: [f], waiting: [], routines: [], period: 'week', since, now, host: this.h.hostName(), axis: null, sources: [] }).goals[0] ?? null
    const byId = new Map(f.cards.map((c) => [c.id, c] as const))
    return {
      goal: one(now - 7 * DAY) ?? one(0),
      tasks: f.tasks.tasks,
      loose: f.tasks.loose.map((id) => byId.get(id)).filter((c): c is SessionCard => !!c),
      story: story(f, taskId),
      brief: brief(f, taskId)
    }
  }

  /** 카드를 다른 작업(또는 새 작업)으로 옮기고 고정한다 · 옮겨 간 작업 id 를 돌려준다(새 작업이면 방금 만든 id) */
  move(botId: string, cardId: string, to: string | { newTitle: string }): string {
    const f = this.edit(botId, (f, now) => {
      if (!placed(f).has(cardId) && this.store.card(cardId)?.botId !== botId) throw new Error('그 카드가 이 폴더에 없어요')
      const next = moveCard(f, cardId, to, now)
      if (next === f) throw new Error('옮길 작업이 없어요')
      return next
    })
    return f.pins[cardId]
  }

  /** [놔둬] — 나설 곳에서 7일 뺀다 */
  snooze(botId: string, taskId: string): void {
    this.edit(botId, (f, now) => {
      if (!f.tasks.some((t) => t.id === taskId)) throw new Error('그런 작업이 없어요')
      return { ...f, snooze: { ...f.snooze, [taskId]: now + SNOOZE_MS }, updatedAt: now }
    })
  }

  /** «안 끝났어» — 그 폴더 판을 바로 다시 짓는다 */
  reopen(botId: string, taskId: string): void {
    this.edit(botId, (f, now) => {
      const next = reopenTask(f, taskId, now)
      if (next === f) throw new Error('그런 작업이 없어요')
      return next
    })
  }

  /** 상황판을 열었다 — 지난번 연 시각을 돌려준다(«자리를 비운 사이» 의 기준) */
  seen(): { prev: number | null } { return { prev: this.store.markSeen(Date.now()) } }

  status(): { owner: boolean; paused: ContextQueue['paused']; calls: number; pending: number } {
    return { owner: this.owner(), paused: this.q.paused, calls: this.q.calls, pending: this.q.pending() }
  }

  idle(): Promise<void> { return this.q.idle() }

  // ── 줄 ─────────────────────────────────────────────────────────────────────

  private pokeCard(sid: string): void { this.q.poke(`card:${sid}`, this.delay('card'), () => this.cardJob(sid)) }
  private pokeGroup(botId: string): void { this.q.poke(`group:${botId}`, this.delay('group'), () => this.groupJob(botId)) }

  /** 모델 한 번 — 성공이든 실패든 사용 기록 한 줄 */
  private async call(job: 'card' | 'group' | 'axis', model: 'haiku' | 'sonnet', prompt: string, system: string): Promise<{ ok: boolean; out: string }> {
    let r: { ok: boolean; out: string; ms: number }
    try { r = await this.ask(prompt, { model, system, dir: ONE_SHOT_DIR }) } catch (e) { this.log(`맥락 상황판 · 모델 호출 오류(${job}): ${e instanceof Error ? e.message : String(e)}`); r = { ok: false, out: '', ms: 0 } }
    this.guard('사용 기록', () => this.store.usageLog({ at: Date.now(), job, model, ms: r.ms, ok: r.ok, chars: prompt.length }), undefined)
    return r
  }

  // ── 카드 ───────────────────────────────────────────────────────────────────

  private routineCardNow(r: SessionRec): void {
    if (!this.h.registry.bots().some((b) => b.id === r.botId)) return
    const items = this.h.sessions.items(r.id)
    if (!items.length) return
    const c = routineCard({ id: r.id, botId: r.botId, items, lastActivity: r.lastActivity }, r.routine ?? '', this.h.hostName(), Date.now())
    this.store.putCard(c)
    this.pokeGroup(r.botId)
  }

  /** `card:<sid>` — 조각마다 새 item 만 요약한다. 실패하면 카드를 그대로 둔다(다음 턴 끝에 다시). 모델을 불렀으면 true */
  private async cardJob(sid: string): Promise<boolean> {
    if (!this.owner()) return false
    const r = this.h.sessions.get(sid)
    if (!r) return false
    if (isRoutine(r)) { this.routineCardNow(r); return false }   // 오케스트레이터 루틴도 — cardChannel 은 orch 를 먼저 본다
    const ch = cardChannel(r)
    const bots = this.h.registry.bots()
    if (!bots.some((b) => b.id === r.botId)) return false
    const items = this.h.sessions.items(sid)
    const split = needsSplit(ch)
    const segs = split ? splitSegments(items) : items.length ? [items] : []
    const keys = botKeys(bots)
    const candidates = bots.map((b) => ({ id: b.id, name: nameOf(b) }))
    let called = false
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]
      const id = split ? `${sid}#${i}` : sid
      const prev = this.store.card(id)
      const fresh = itemsSince(seg, prev?.cursor)
      if (!fresh.length) continue
      const convo = transcript(fresh)
      if (!convo.trim()) continue
      // 폴더 봇 세션은 그 폴더 일이다. 오케스트레이터 세션만 조각마다 폴더를 가린다(머리 → bot_send → 지난 카드 → Haiku → 볼트 운영)
      let folder: string | null = r.botId !== VAULT_OPS ? r.botId : segmentFolder(seg, keys)
      if (!folder && prev && prev.botId !== VAULT_OPS && keys.has(prev.botId)) folder = prev.botId
      const prompt = cardPrompt(prev ? bodyOf(prev) : null, convo, folder
        ? { folder: nameOf(bots.find((b) => b.id === folder)) }
        : { folder: '아직 모름 — 아래 후보에서 골라 줘', candidates })
      const res = await this.call('card', 'haiku', prompt, CARD_SYSTEM)
      called = true
      const body = res.ok ? parseCard(res.out) : null
      if (!body) { this.log(`맥락 카드를 못 만들었어요 — 다음 턴 끝에 다시: ${id}`); break }
      const settled = settleCard(body, { vaultRoot: this.h.registry.root, items: seg })   // 조각의 근거는 그 조각 안에서만(Ruling 20)
      const picked = folder ?? (settled.folder ? keys.get(settled.folder.trim()) : undefined) ?? VAULT_OPS
      const last = seg[seg.length - 1]
      this.store.putCard({
        id, sessionId: sid, ...(split ? { seg: i } : {}), botId: picked, channel: ch, machine: this.h.hostName(),
        intent: settled.intent, done: settled.done, promised: settled.promised, ending: settled.ending, taskHint: settled.taskHint,
        from: prev?.from ?? seg[0].t, to: last.t, cursor: last.id, updatedAt: Date.now(), llm: true
      })
      this.pokeGroup(picked)
      if (prev && prev.botId !== picked) this.pokeGroup(prev.botId)   // 폴더가 바뀐 카드 — 옛 폴더 작업에서도 빼야 한다
    }
    return called
  }

  // ── 묶기 ───────────────────────────────────────────────────────────────────

  /** `group:<botId>` — 새 카드만 묶고(루틴은 LLM 없이) 상태를 다시 매긴 뒤 판을 다시 짓는다. 모델을 불렀으면 true */
  private async groupJob(botId: string): Promise<boolean> {
    if (!this.owner()) return false
    const bot = this.h.registry.bots().find((b) => b.id === botId)
    if (!bot) return false
    const now = Date.now()
    const cards = this.store.folderCards(botId, 0)
    const byId = new Map(cards.map((c) => [c.id, c] as const))
    let f = this.dropMoved(this.tasksOf(bot), botId)
    const have = placed(f)
    const fresh = cards.filter((c) => !have.has(c.id)).sort((a, b) => a.from - b.from)
    const routines = fresh.filter((c) => c.channel === 'routine')
    if (routines.length) f = routineTasks(f, routines, now)
    const news = fresh.filter((c) => c.channel !== 'routine')
    const facts = this.facts(bot)
    let called = false
    if (news.length) {
      const input: GroupInput = {
        folder: nameOf(bot), goal: goalLine(facts.state, facts.stateMtime, facts.claude, now).text, newCards: news, tasks: f.tasks,
        todo: facts.todo.map((t) => ({ title: t.title, done: t.done })), stateNotes: facts.state ?? '', fixes: f.fixes
      }
      const ids = new Set(news.map((c) => c.id))
      const res = await this.call('group', 'haiku', groupPrompt(input), GROUP_SYSTEM)
      called = true
      let g = res.ok ? onlyCards(parseGroup(res.out), ids) : null
      if (g) {
        const unsure = new Set(g.assign.filter((a) => a.unsure).map((a) => a.card))
        if (unsure.size) {
          const again = await this.call('group', 'sonnet', groupPrompt({ ...input, newCards: news.filter((c) => unsure.has(c.id)) }), GROUP_SYSTEM)
          const g2 = again.ok ? onlyCards(parseGroup(again.out), unsure) : null
          if (g2) g = mergeUnsure(g, g2, unsure)
        }
        f = applyGroup(f, g, now)
        // Ruling 6 — 모델이 빠뜨린 새 카드는 «안 묶임» 으로
        const now2 = placed(f)
        const lost = news.filter((c) => !now2.has(c.id)).map((c) => c.id)
        if (lost.length) f = { ...f, loose: [...f.loose, ...lost] }
      } else this.log(`맥락 작업 묶기를 못 했어요 — 다음 신호에 다시: ${nameOf(bot)}`)
    }
    f = this.restate(f, byId, facts, now)
    this.store.putTasks(bot.abs, f)
    const b = this.persistBoard(now)
    this.maybeAxis(b, now)
    return called
  }

  /** 다른 폴더로 옮겨 간 카드(카드의 botId 가 이 폴더가 아님)는 이 폴더 작업에서 뺀다 */
  private dropMoved(f: FolderTasks, botId: string): FolderTasks {
    const gone = (id: string): boolean => { const c = this.store.card(id); return !!c && c.botId !== botId }
    if (!f.loose.some(gone) && !f.tasks.some((t) => t.cards.some(gone))) return f
    return { ...f, loose: f.loose.filter((id) => !gone(id)), tasks: f.tasks.map((t) => (t.cards.some(gone) ? { ...t, cards: t.cards.filter((id) => !gone(id)) } : t)) }
  }

  /** 모든 작업의 상태를 카드·지금 세션·todo·state 로 다시 매긴다(Ruling 6) */
  private restate(f: FolderTasks, byId: Map<string, SessionCard>, facts: Facts, now: number): FolderTasks {
    const tasks = f.tasks.map((t) => {
      const cs = t.cards.map((id) => byId.get(id)).filter((c): c is SessionCard => !!c)
      const proof = {
        todoDone: !!t.todoTitle && facts.todo.some((x) => x.done && (x.title.trim() === t.todoTitle || maskSensitive(x.title).trim() === t.todoTitle)),
        stateDone: stateDone(facts.state, t.stateDoneLine),
        ...(f.reopened[t.id] !== undefined ? { reopenedAt: f.reopened[t.id] } : {})
      }
      const state = taskState(cs, this.liveOf(cs), proof, now)
      const lastAt = cs.length ? Math.max(...cs.map((c) => c.to)) : t.lastAt
      return state === t.state && lastAt === t.lastAt ? t : { ...t, state, lastAt, updatedAt: now }
    })
    return tasks.every((t, i) => t === f.tasks[i]) ? f : { ...f, tasks }
  }

  /** 지금 도는 / 내 답을 기다리는 세션 — 조각 세션은 마지막 조각만 그 세션의 지금을 말한다 */
  private liveOf(cs: SessionCard[]): { running: boolean; waiting: boolean } {
    let running = false, waiting = false
    for (const c of cs) {
      const st: SessionState | undefined = this.h.sessions.get(c.sessionId)?.state
      if (st !== 'running' && st !== 'awaiting_input') continue
      if (c.seg !== undefined && this.store.cardsOf(c.sessionId).some((x) => (x.seg ?? -1) > c.seg!)) continue
      if (st === 'running') running = true; else waiting = true
    }
    return { running, waiting }
  }

  // ── 축 ─────────────────────────────────────────────────────────────────────

  private maybeAxis(b: Board, now: number): void {
    if (this.axis && now - this.axis.at < AXIS_MIN_GAP_MS) return
    const rows = b.step.stalled.rows.length + b.step.waiting.rows.length + b.step.routine.rows.length
    if (!b.goals.length && !rows) return
    this.q.poke('axis', 0, () => this.axisJob())
  }

  /** «오늘의 축» 한 문장 — 실패하면 앞 축을 그대로 둔다(Ruling 17) */
  private async axisJob(): Promise<boolean> {
    if (!this.owner()) return false
    const res = await this.call('axis', 'haiku', axisPrompt(this.compose('today', Date.now() - DAY, Date.now())), AXIS_SYSTEM)
    const line = res.ok ? res.out.split('\n').map((l) => l.trim()).find(Boolean) : undefined
    if (line) {
      const now = Date.now()
      this.axis = { text: maskSensitive(line).slice(0, AXIS_MAX), at: now }
      this.persistBoard(now)
    } else this.log('오늘의 축을 못 지었어요 — 앞 축을 그대로 둬요')
    return true
  }

  // ── 판 ─────────────────────────────────────────────────────────────────────

  /**
   * 볼트에 두는 판은 «오늘» 이다. `since` 를 시 단위로 내린다 — 내용이 같으면 다시 쓰지 않게(`putBoard` 는 `at` 만 빼고 비교한다).
   * @returns 지은 판
   */
  private persistBoard(now: number): Board {
    const b = this.compose('today', Math.floor((now - DAY) / HOUR) * HOUR, now)
    this.guard('판 쓰기', () => this.store.putBoard(b, renderBoardMd(b)), false)
    return b
  }

  private compose(period: Period, since: number, now: number): Board {
    const bots = this.h.registry.bots()
    const folders = bots.map((b) => this.folderInput(b, now))
    const names = new Map(bots.map((b) => [b.id, nameOf(b)] as const))
    const waiting = this.h.sessions.all()
      .filter((r) => r.state === 'awaiting_input' && names.has(r.botId))
      .map((r) => ({ botId: r.botId, folder: names.get(r.botId)!, sessionId: r.id, name: r.name, at: r.lastActivity }))
    const routines = this.guard('루틴 판', () => this.h.routineBoard().routines, [] as BoardRoutine[])
    const lastCard = folders.reduce((m, f) => f.cards.reduce((n, c) => Math.max(n, c.updatedAt), m), 0)
    const host = this.h.hostName()
    return buildBoard({
      folders, waiting, routines, period, since, now, host, axis: this.axis,
      sources: [
        { name: `${host} Folder Bot 세션`, ok: true, at: lastCard || null },
        { name: '맥북 기록', ok: false, at: null, note: '2단계에서 가져옴' },
        { name: '할일이 우편함', ok: false, at: null, note: '2단계' }
      ]
    })
  }

  private emptyBoard(period: Period, since: number, now: number): Board {
    return buildBoard({ folders: [], waiting: [], routines: [], period, since, now, host: this.h.hostName(), axis: null,
      sources: [{ name: '주인 맥 판', ok: false, at: null, note: '아직 주인 맥 판 없음' }] })
  }

  /**
   * 판·목표 펼치기의 폴더 한 칸. 작업 상태는 **메모리에서만** 지금 시각으로 다시 매긴다(Ruling 19) —
   * «약속이 남은 채 30분 조용» 같은 시간 판정은 묶기 일이 다시 돌지 않아도 판에 나와야 한다. tasks.json 은 쓰지 않는다.
   */
  private folderInput(bot: Bot, now: number): FolderInput {
    const facts = this.facts(bot)
    const cards = this.store.folderCards(bot.id, 0)
    const tasks = this.restate(this.tasksOf(bot), new Map(cards.map((c) => [c.id, c] as const)), facts, now)
    return {
      botId: bot.id, folder: nameOf(bot), due: bot.due?.date ?? null, tasks, cards,
      goal: goalLine(facts.state, facts.stateMtime, facts.claude, now),
      outbox: outboxLines(facts.state, new Date(now).getFullYear())
    }
  }

  // ── 작은 도구 ──────────────────────────────────────────────────────────────

  private botOf(botId: string): Bot {
    const bot = this.h.registry.bots().find((b) => b.id === botId)
    if (!bot) throw Object.assign(new Error('그런 폴더가 없어요'), { code: 'not-found' })
    return bot
  }

  /** Dave 의 손질 — 주인만 · 상태를 다시 매기고 쓰고 판을 바로 다시 짓는다 */
  private edit(botId: string, fn: (f: FolderTasks, now: number) => FolderTasks): FolderTasks {
    if (!this.owner()) throw new NotOwner(this.store.board()?.host || this.h.hostName())
    const bot = this.botOf(botId)
    const now = Date.now()
    const f = fn(this.tasksOf(bot), now)
    const byId = new Map(this.store.folderCards(bot.id, 0).map((c) => [c.id, c] as const))
    this.store.putTasks(bot.abs, this.restate(f, byId, this.facts(bot), now))
    this.persistBoard(now)
    return f
  }

  /** 볼트의 tasks.json — 저장소는 맨 위 모양만 본다. 원소까지 걸러 던지지 않게 한다 */
  private tasksOf(bot: Bot): FolderTasks { return safeTasks(this.store.tasks(bot.abs, bot.id), bot.id) }

  private facts(bot: Bot): Facts {
    const stateF = join(bot.abs, 'state.md')
    const state = readText(stateF)
    let stateMtime: number | null = null
    try { stateMtime = statSync(stateF).mtimeMs } catch { /* 없음 */ }
    const todoMd = readText(join(bot.abs, 'todo.md'))
    return { state, stateMtime, claude: readText(join(bot.abs, 'CLAUDE.md')), todo: todoMd ? parseTodo(todoMd) : [] }
  }
}

interface Facts { state: string | null; stateMtime: number | null; claude: string | null; todo: { title: string; done: boolean }[] }

/** 루틴 세션(사람이 이어받지 않은 것)은 LLM 없이 — 갈래(orch·comm…)보다 먼저 본다 */
const isRoutine = (r: SessionRec): boolean => !!r.routine && !r.adopted

function readText(f: string): string | null { try { return readFileSync(f, 'utf8') } catch { return null } }

const nameOf = (b: Bot | undefined): string => (!b ? VAULT_OPS_NAME : b.orchestrator ? VAULT_OPS_NAME : b.displayName || b.name)

/** «botId · 이름 · 표시 이름 · 상대 경로 → botId» — `segmentFolder` 와 카드 folder 칸을 정본 id 로 푼다 */
function botKeys(bots: Bot[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const b of bots) for (const k of [b.id, b.name, b.displayName, b.rel]) if (k && !m.has(k)) m.set(k, b.id)
  return m
}

const bodyOf = (c: SessionCard): CardBody => ({ intent: c.intent, done: c.done, promised: c.promised, ending: c.ending, taskHint: c.taskHint })

function placed(f: FolderTasks): Set<string> { return new Set([...f.tasks.flatMap((t) => t.cards), ...f.loose]) }

/** 새 카드가 아닌 것을 가리킨 배정은 버린다 — 이미 묶인 카드를 모델이 함부로 옮기지 않게 */
function onlyCards(g: GroupResult | null, ids: Set<string>): GroupResult | null {
  return g ? { ...g, assign: g.assign.filter((a) => ids.has(a.card)) } : null
}

/** 애매했던 카드는 Sonnet 의 배정으로 바꾼다. Sonnet 이 빠뜨린 카드는 Haiku 의 배정 그대로 */
function mergeUnsure(g: GroupResult, g2: GroupResult, unsure: Set<string>): GroupResult {
  const re = new Map(g2.assign.map((a) => [a.card, { card: a.card, task: a.task }] as const))
  return {
    assign: g.assign.map((a) => (unsure.has(a.card) && re.has(a.card) ? re.get(a.card)! : a)),
    tasks: [...g.tasks, ...g2.tasks],
    ...(g.gap ?? g2.gap ? { gap: g.gap ?? g2.gap } : {})
  }
}

/** state.md 「완료」 절에 그 줄이 그대로 있고 근거(글자·경로)가 붙었나 */
function stateDone(md: string | null, line: string | undefined): boolean {
  const strip = (s: string) => s.trim().replace(/^[-*]\s*(?:\[[ xX]\]\s*)?/, '').trim()
  const want = line ? strip(line) : ''
  if (!md || !want) return false
  let inside = false
  for (const raw of md.split('\n')) {
    if (/^##\s/.test(raw)) { inside = /^##\s+(?:\S+\s+)?완료\s*$/.test(raw.trim()); continue }
    if (!inside) continue
    const l = strip(raw)
    if (!l || !(l.includes(want) || maskSensitive(l).includes(want))) continue
    if (PROOF_RE.test(l)) return true
  }
  return false
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function numMap(v: unknown): Record<string, number> {
  return isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' && Number.isFinite(x))) as Record<string, number> : {}
}

function safeTasks(t: FolderTasks, botId: string): FolderTasks {
  const tasks = (Array.isArray(t.tasks) ? t.tasks : []).flatMap((x: unknown): CtxTask[] => {
    if (!isObj(x) || typeof x.id !== 'string' || !x.id) return []
    const task: CtxTask = {
      id: x.id, title: str(x.title) || x.id, state: STATES.includes(x.state as TaskState) ? (x.state as TaskState) : 'todo',
      summary: str(x.summary), missing: str(x.missing), cards: Array.isArray(x.cards) ? x.cards.filter((c): c is string => typeof c === 'string') : [],
      lastAt: num(x.lastAt), updatedAt: num(x.updatedAt)
    }
    if (typeof x.todoTitle === 'string') task.todoTitle = x.todoTitle
    if (typeof x.stateDoneLine === 'string') task.stateDoneLine = x.stateDoneLine
    return [task]
  })
  return {
    v: 1, botId, tasks,
    loose: (Array.isArray(t.loose) ? t.loose : []).filter((c): c is string => typeof c === 'string'),
    pins: isObj(t.pins) ? Object.fromEntries(Object.entries(t.pins).filter(([, x]) => typeof x === 'string')) as Record<string, string> : {},
    fixes: (Array.isArray(t.fixes) ? t.fixes : []).filter((x): x is FolderTasks['fixes'][number] => isObj(x) && typeof x.cardId === 'string' && typeof x.to === 'string' && typeof x.at === 'number'),
    snooze: numMap(t.snooze), reopened: numMap(t.reopened), gap: str(t.gap), updatedAt: num(t.updatedAt)
  }
}
