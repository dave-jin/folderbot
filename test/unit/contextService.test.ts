import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ContextService, NotOwner, GROUP_BATCH, type ContextHost } from '../../src/host/context'
import { CARD_MARK } from '../../src/core/contextCard'
import { GROUP_MARK, STALL_MS, type FolderTasks } from '../../src/core/contextTasks'
import { AXIS_MARK, continueTarget, type Board } from '../../src/core/contextBoard'
import type { Bot, ChatItem } from '../../src/core/types'
import type { SessionRec } from '../../src/host/session'
import type { OneShotOpts, OneShotResult } from '../../src/host/oneShot'

const DEBOUNCE = 'FOLDERBOT_CONTEXT_DEBOUNCE_MS'
let savedDebounce: string | undefined, savedOff: string | undefined
beforeAll(() => { savedDebounce = process.env[DEBOUNCE]; savedOff = process.env.FOLDERBOT_CONTEXT; process.env[DEBOUNCE] = '0'; delete process.env.FOLDERBOT_CONTEXT })
afterAll(() => {
  if (savedDebounce === undefined) delete process.env[DEBOUNCE]; else process.env[DEBOUNCE] = savedDebounce
  if (savedOff === undefined) delete process.env.FOLDERBOT_CONTEXT; else process.env.FOLDERBOT_CONTEXT = savedOff
})

const bot = (id: string, rel: string, root: string, name: string, extra: Partial<Bot> = {}): Bot => ({
  id, rel, abs: rel ? join(root, rel) : root, name, displayName: name, section: rel.split('/')[0] ?? '', color: '#888',
  orchestrator: id === 'orch', startedAt: 0, vendor: 'claude', routines: [], ...extra
} as Bot)

let seq = 0
const it_ = (kind: 'user' | 'assistant', text: string, t = Date.now()): ChatItem => ({ id: `i${++seq}`, t, kind, text } as ChatItem)

/** 가짜 모델 — 표지로 갈래를 고르고, 부른 프롬프트를 다 적어 둔다 */
function fakeAsk(o: { failCards?: number; card?: (convo: string) => unknown; group?: (cards: { id: string; taskHint: string }[], model: string) => unknown } = {}) {
  const calls: { prompt: string; model: string }[] = []
  let cardFails = o.failCards ?? 0
  const ask = async (prompt: string, opts: OneShotOpts): Promise<OneShotResult> => {
    calls.push({ prompt, model: opts.model })
    if (prompt.startsWith(CARD_MARK)) {
      if (cardFails > 0) { cardFails--; return { ok: false, out: '', ms: 1 } }
      const convo = prompt.slice(prompt.lastIndexOf('\n대화\n'))
      if (o.card) return { ok: true, out: JSON.stringify(o.card(convo)), ms: 1 }
      const hint = convo.includes('접수') ? '접수 폼' : convo.includes('랜딩') ? '랜딩 페이지' : '투표 기능'
      return { ok: true, out: JSON.stringify({ intent: `${hint} 만들기`, done: [], promised: ['배포'], ending: 'running', taskHint: hint }), ms: 1 }
    }
    if (prompt.startsWith(GROUP_MARK)) {
      const lines = prompt.split('\n')
      const at = lines.indexOf('새 카드')
      const cards: { id: string; taskHint: string }[] = []
      for (let i = at + 1; i < lines.length && lines[i].startsWith('{'); i++) cards.push(JSON.parse(lines[i]))
      if (o.group) return { ok: true, ms: 1, out: JSON.stringify(o.group(cards, opts.model)) }
      return { ok: true, ms: 1, out: JSON.stringify({
        assign: cards.map((c) => ({ card: c.id, task: `new:${c.taskHint}` })),
        tasks: cards.map((c) => ({ id: `new:${c.taskHint}`, title: c.taskHint, summary: '요약', missing: '배포' }))
      }) }
    }
    if (prompt.startsWith(AXIS_MARK)) return { ok: true, out: '\n투표 기능을 오늘 닫는다\n', ms: 1 }
    return { ok: false, out: '', ms: 1 }
  }
  return { ask, calls }
}

let root: string, data: string, bots: Bot[], recs: Map<string, SessionRec>, owner: boolean
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fb-ctxsvc-vault-'))
  data = mkdtempSync(join(tmpdir(), 'fb-ctxsvc-data-'))
  bots = [
    bot('orch', '', root, '오케스트레이터'),
    bot('hack1', '1. Projects/2026-11_해커톤', root, '해커톤'),
    bot('web1', '1. Projects/2026-12_웹사이트', root, '웹사이트')
  ]
  for (const b of bots) mkdirSync(b.abs, { recursive: true })
  recs = new Map()
  owner = true
  cap = undefined
})

let cap: number | undefined
function host(): ContextHost {
  return {
    sessions: { all: () => [...recs.values()], items: (id) => recs.get(id)?.items ?? [], get: (id) => recs.get(id) },
    registry: { bots: () => bots, root },
    cfg: { context: cap === undefined ? {} : { dailyCap: cap } },
    ownsRoutines: () => owner,
    routineBoard: () => ({ routines: [] }),
    dataDir: () => data,
    hostName: () => 'mini',
    planNow: () => null,
    log: () => {}
  }
}
const sess = (id: string, botId: string, items: ChatItem[], extra: Partial<SessionRec> = {}): SessionRec => {
  const r = { id, botId, name: '메인', cwd: root, cliSessionId: null, state: 'done', createdAt: 0, lastActivity: Date.now(), items, ...extra } as SessionRec
  recs.set(id, r)
  return r
}
afterEach(() => { vi.useRealTimers() })
const tasksOf = (b: Bot): FolderTasks => JSON.parse(readFileSync(join(b.abs, '.folderbot', 'context', 'tasks.json'), 'utf8'))
const cardFile = (sid: string) => join(data, 'context', 'cards', `${sid}.json`)
const boardFile = () => join(root, '.folderbot', 'context', 'board.json')
const marked = (calls: { prompt: string }[], mark: string) => calls.filter((c) => c.prompt.startsWith(mark))
/** 줄이 상한에 멈추면 idle() 이 끝나지 않는다 — 조건이 설 때까지 조금씩 기다린다 */
const until = async (fn: () => boolean): Promise<boolean> => { for (let i = 0; i < 200; i++) { if (fn()) return true; await new Promise((r) => setTimeout(r, 5)) } return false }
const DAY_MS = 86_400_000

describe('ContextService — 주인 맥', () => {
  it('폴더 봇 세션 턴 끝 → 카드 1장 · 작업 1개 · 볼트에 board.json·board.md', async () => {
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const r = sess('s_a', 'hack1', [it_('user', '투표 기능 만들어 줘'), it_('assistant', '만드는 중이에요')])
    svc.onTurnEnd(r)
    await svc.idle()

    const cards = JSON.parse(readFileSync(cardFile('s_a'), 'utf8'))
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 's_a', botId: 'hack1', channel: 'folder', machine: 'mini', intent: '투표 기능 만들기', llm: true, cursor: r.items[1].id })
    const t = tasksOf(bots[1])
    expect(t.tasks).toHaveLength(1)
    expect(t.tasks[0]).toMatchObject({ title: '투표 기능', cards: ['s_a'] })
    expect(existsSync(boardFile())).toBe(true)
    expect(existsSync(join(root, '.folderbot', 'context', 'board.md'))).toBe(true)
    const b = JSON.parse(readFileSync(boardFile(), 'utf8')) as Board
    expect(b.goals.map((g) => g.botId)).toEqual(['hack1'])
    expect(b.sources.map((s) => s.ok)).toEqual([true, false, false])
    expect(b.axis?.text).toBe('투표 기능을 오늘 닫는다')
    expect(marked(calls, CARD_MARK)).toHaveLength(1)
    expect(marked(calls, GROUP_MARK)).toHaveLength(1)
    // 대화 원문은 볼트로 가지 않는다
    expect(readFileSync(boardFile(), 'utf8')).not.toContain('투표 기능 만들어 줘')
    expect(svc.status()).toMatchObject({ owner: true, paused: null, pending: 0 })
  })

  it('같은 세션 두 번째 턴 → 지난 카드 JSON 을 싣고, 대화는 새 item 만', async () => {
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const r = sess('s_b', 'hack1', [it_('user', '첫 질문 투표'), it_('assistant', '첫 답')])
    svc.onTurnEnd(r)
    await svc.idle()
    r.items.push(it_('user', '두 번째 질문'), it_('assistant', '두 번째 답'))
    svc.onTurnEnd(r)
    await svc.idle()

    const cardCalls = marked(calls, CARD_MARK)
    expect(cardCalls).toHaveLength(2)
    const second = cardCalls[1].prompt
    expect(second).toContain('지난 카드')
    expect(second).toContain('"intent":"투표 기능 만들기"')
    const convo = second.slice(second.lastIndexOf('\n대화\n'))
    expect(convo).toContain('두 번째 질문')
    expect(convo).not.toContain('첫 질문')
    // 이미 작업에 있는 카드라 다시 묶지 않는다
    expect(marked(calls, GROUP_MARK)).toHaveLength(1)
    const cards = JSON.parse(readFileSync(cardFile('s_b'), 'utf8'))
    expect(cards[0].cursor).toBe(r.items[3].id)
  })

  it('오케스트레이터 세션(요청 둘) → 카드 #0·#1 이 각 폴더 작업에 붙는다', async () => {
    const { ask } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const r = sess('s_o', 'orch', [
      it_('user', '[요청 ← 해커톤 · hack1 · s_x] 접수 폼 만들어 줄 수 있어?'),
      it_('assistant', '해커톤 봇에 넘겼어요'),
      it_('user', '[요청 ← 웹사이트 · web1 · s_y] 랜딩 문구 봐 줘'),
      it_('assistant', '웹사이트 봇에 넘겼어요')
    ], { comm: true })
    svc.onTurnEnd(r)
    await svc.idle()

    const cards = JSON.parse(readFileSync(cardFile('s_o'), 'utf8')) as { id: string; botId: string; channel: string }[]
    expect(cards.map((c) => [c.id, c.botId, c.channel])).toEqual([['s_o#0', 'hack1', 'orch'], ['s_o#1', 'web1', 'orch']])
    expect(tasksOf(bots[1]).tasks.flatMap((t) => t.cards)).toEqual(['s_o#0'])
    expect(tasksOf(bots[2]).tasks.flatMap((t) => t.cards)).toEqual(['s_o#1'])
    expect(tasksOf(bots[1]).tasks[0].title).toBe('접수 폼')
  })

  it('루틴 세션 → ask 를 부르지 않고 routine:<이름> 작업이 생긴다', async () => {
    // 축을 막 지었다 — 축 일도 줄에 서지 않아야 ask 가 0번이다
    mkdirSync(join(root, '.folderbot', 'context'), { recursive: true })
    const seeded: Board = { v: 1, at: Date.now(), host: 'mini', period: 'today', since: 0, axis: { text: '이미 있는 축', at: Date.now() }, tally: { done: 0, stalled: 0, added: 0 },
      step: { stalled: { rows: [], more: 0 }, waiting: { rows: [], more: 0 }, routine: { rows: [], more: 0 } }, goals: [], quiet: [], sources: [] }
    writeFileSync(boardFile(), JSON.stringify(seeded))
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const r = sess('s_r', 'hack1', [it_('user', '아침 정리를 해'), it_('assistant', '정리했어요\n결과: ok')], { routine: '아침정리' })
    svc.onTurnEnd(r)
    await svc.idle()

    expect(calls).toHaveLength(0)
    const t = tasksOf(bots[1])
    expect(t.tasks.map((x) => x.id)).toEqual(['routine:아침정리'])
    expect(t.tasks[0]).toMatchObject({ cards: ['s_r'], state: 'done' })
    const cards = JSON.parse(readFileSync(cardFile('s_r'), 'utf8'))
    expect(cards[0]).toMatchObject({ channel: 'routine', llm: false })
    expect((JSON.parse(readFileSync(boardFile(), 'utf8')) as Board).axis?.text).toBe('이미 있는 축')
  })

  it('ask 실패(ok:false) → 카드가 바뀌지 않고 줄은 다음으로 넘어간다 · 다음 턴 끝에 다시 쓴다', async () => {
    const { ask, calls } = fakeAsk({ failCards: 1 })
    const svc = new ContextService(host(), ask)
    const a = sess('s_f', 'hack1', [it_('user', '투표 하나'), it_('assistant', '네')])
    svc.onTurnEnd(a)
    await svc.idle()
    expect(existsSync(cardFile('s_f'))).toBe(false)
    expect(svc.status().pending).toBe(0)

    const b = sess('s_g', 'web1', [it_('user', '랜딩 하나'), it_('assistant', '네')])
    svc.onTurnEnd(b)
    await svc.idle()
    expect(existsSync(cardFile('s_g'))).toBe(true)

    svc.onTurnEnd(a)
    await svc.idle()
    expect(JSON.parse(readFileSync(cardFile('s_f'), 'utf8'))[0].cursor).toBe(a.items[1].id)
    expect(marked(calls, CARD_MARK)).toHaveLength(3)
    // 실패도 한 번 부른 것이다 — 사용 기록에 남는다
    const log = readFileSync(join(data, 'context', 'usage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(log.filter((e) => e.job === 'card').map((e) => e.ok)).toEqual([false, true, true])
  })

  it('묶기가 빠뜨린 새 카드는 loose 로 · 애매한 카드는 Sonnet 에게 한 번 더', async () => {
    const { ask, calls } = fakeAsk({ group: (cards, model) => model === 'haiku'
      ? { assign: cards.filter((c) => c.taskHint === '투표 기능').map((c) => ({ card: c.id, task: 'new:대충', unsure: true })) }
      : { assign: cards.map((c) => ({ card: c.id, task: 'new:투표 집계' })), tasks: [{ id: 'new:투표 집계', title: '투표 집계', summary: '', missing: '' }] } })
    const svc = new ContextService(host(), ask)
    svc.onTurnEnd(sess('s_u', 'hack1', [it_('user', '투표'), it_('assistant', '네')]))
    svc.onTurnEnd(sess('s_l', 'hack1', [it_('user', '랜딩'), it_('assistant', '네')]))
    await svc.idle()
    const t = tasksOf(bots[1])
    expect(t.tasks.map((x) => [x.title, x.cards])).toEqual([['투표 집계', ['s_u']]])
    expect(t.loose).toEqual(['s_l'])
    expect(calls.filter((c) => c.prompt.startsWith(GROUP_MARK)).map((c) => c.model)).toEqual(['haiku', 'sonnet'])
    expect(svc.status().calls).toBe(calls.length)   // Haiku·Sonnet 두 번을 두 번으로 센다(최종 검토 1)
  })

  it('🔴 묶기는 한 번에 GROUP_BATCH 장까지 — 넘치는 새 카드는 다음 묶음으로 넘어가 모두 놓인다(2026-11-02 맥미니 시간 초과)', async () => {
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const n = GROUP_BATCH + 5
    for (let i = 0; i < n; i++) svc.onTurnEnd(sess(`s_b${i}`, 'hack1', [it_('user', '투표'), it_('assistant', '네')]))
    await svc.idle()
    // «새 카드» 칸의 줄만 센다(기존 작업 줄도 {"id" 로 시작한다)
    const sizes = marked(calls, GROUP_MARK).map((c) => { const L = c.prompt.split('\n'); let k = L.indexOf('새 카드') + 1, m = 0; while (k < L.length && L[k].startsWith('{')) { m++; k++ } return m })
    expect(sizes.length).toBeGreaterThan(1)
    expect(Math.max(...sizes)).toBe(GROUP_BATCH)   // 한 번은 꽉 찬 묶음이 갔다 — 나눠 보냈다는 증거
    expect(Math.max(...sizes)).toBeLessThanOrEqual(GROUP_BATCH)
    const t = tasksOf(bots[1])
    const all = new Set([...t.tasks.flatMap((x) => x.cards), ...t.loose])
    for (let i = 0; i < n; i++) expect(all.has(`s_b${i}`)).toBe(true)
  })

  it('🔴 같은 카드가 묶기에 두 번 실패하면 «안 묶임» 으로 — 같은 입력을 다시 보내지 않는다', async () => {
    const base = fakeAsk()
    const calls: string[] = []
    const ask = async (prompt: string, opts: OneShotOpts): Promise<OneShotResult> => {
      if (prompt.startsWith(GROUP_MARK)) { calls.push(prompt); return { ok: false, out: '', ms: 1 } }
      return base.ask(prompt, opts)
    }
    const svc = new ContextService(host(), ask)
    svc.onTurnEnd(sess('s_f1', 'hack1', [it_('user', '투표'), it_('assistant', '네')]))
    await svc.idle()
    expect(calls).toHaveLength(1)
    expect(tasksOf(bots[1]).loose).toEqual([])
    svc.onTurnEnd(sess('s_f2', 'hack1', [it_('user', '랜딩'), it_('assistant', '네')]))   // 다음 신호 — 두 번째 실패
    await svc.idle()
    expect(calls).toHaveLength(2)
    expect(tasksOf(bots[1]).loose).toEqual(['s_f1'])   // 두 번 실패한 카드만
    svc.onTurnEnd(sess('s_f3', 'hack1', [it_('user', '접수'), it_('assistant', '네')]))
    await svc.idle()
    expect(calls[2]).not.toContain('"id":"s_f1"')   // 내려놓은 카드는 다시 안 보낸다
    expect(tasksOf(bots[1]).loose).toEqual(['s_f1', 's_f2'])
  })

  it('오케스트레이터 루틴 세션도 LLM 없이 → routine:<이름> 작업 (cardChannel 이 orch 를 먼저 봐도)', async () => {
    mkdirSync(join(root, '.folderbot', 'context'), { recursive: true })
    const seeded: Board = { v: 1, at: Date.now(), host: 'mini', period: 'today', since: 0, axis: { text: '축', at: Date.now() }, tally: { done: 0, stalled: 0, added: 0 },
      step: { stalled: { rows: [], more: 0 }, waiting: { rows: [], more: 0 }, routine: { rows: [], more: 0 } }, goals: [], quiet: [], sources: [] }
    writeFileSync(boardFile(), JSON.stringify(seeded))
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const r = sess('s_or', 'orch', [it_('user', '정기 동기화'), it_('assistant', '넘겼어요'), it_('user', '두 번째 일'), it_('assistant', '끝\n결과: fail — 우편함 못 읽음')], { routine: '정기동기화' })
    svc.onTurnEnd(r)
    await svc.idle()
    expect(calls).toHaveLength(0)
    const t = tasksOf(bots[0])
    expect(t.tasks.map((x) => [x.id, x.cards])).toEqual([['routine:정기동기화', ['s_or']]])
    expect(JSON.parse(readFileSync(cardFile('s_or'), 'utf8'))).toMatchObject([{ id: 's_or', channel: 'routine', llm: false, ending: 'cut' }])
  })

  it('시간이 지나 정해지는 stalled — 묶기 없이도 board() 가 하다 만 일로 보이고 tasks.json 은 안 바뀐다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const tool = { id: 'tok1', t: Date.now(), kind: 'tool', name: 'Write', summary: '파일 씀', isError: false } as ChatItem
    const { ask } = fakeAsk({ card: () => ({ intent: '투표 만들기', done: [{ text: '폼 만듦', ev: [{ kind: 'tool', ref: 'tok1' }] }], promised: ['배포'], ending: 'finished', taskHint: '투표 기능' }) })
    const svc = new ContextService(host(), ask)
    svc.onTurnEnd(sess('s_t', 'hack1', [it_('user', '투표'), tool, it_('assistant', '폼 만들었어요')]))
    await svc.idle()
    expect(tasksOf(bots[1]).tasks[0].state).toBe('done')
    const before = readFileSync(join(bots[1].abs, '.folderbot', 'context', 'tasks.json'), 'utf8')
    expect(svc.board('today').step.stalled.rows).toEqual([])

    vi.setSystemTime(Date.now() + STALL_MS + 60_000)
    const b = svc.board('today')
    expect(b.step.stalled.rows.map((r) => [r.botId, r.title])).toEqual([['hack1', '투표 기능']])
    expect(b.goals[0].counts.stalled).toBe(1)
    expect(svc.goal('hack1', null).tasks[0].state).toBe('stalled')
    expect(readFileSync(join(bots[1].abs, '.folderbot', 'context', 'tasks.json'), 'utf8')).toBe(before)
  })

  it('조각 카드의 근거는 그 조각 안에서만 — 조각 A 의 성공 도구가 조각 B 를 끝남으로 만들지 않는다', async () => {
    const tool = { id: 'tA', t: Date.now(), kind: 'tool', name: 'Write', summary: '접수 폼 씀', isError: false } as ChatItem
    const { ask } = fakeAsk({ card: () => ({ intent: '일', done: [{ text: '했어요', ev: [{ kind: 'tool', ref: 'tA' }] }], promised: [], ending: 'finished', taskHint: '일' }) })
    const svc = new ContextService(host(), ask)
    sess('s_seg', 'orch', [
      it_('user', '[요청 ← 해커톤 · hack1 · s_x] 접수 폼'), tool, it_('assistant', '했어요'),
      it_('user', '[요청 ← 웹사이트 · web1 · s_y] 랜딩'), it_('assistant', '했어요')
    ], { comm: true })
    svc.onTurnEnd(recs.get('s_seg')!)
    await svc.idle()
    const cards = JSON.parse(readFileSync(cardFile('s_seg'), 'utf8')) as { id: string; done: unknown[]; ending: string; promised: string[] }[]
    expect(cards[0]).toMatchObject({ id: 's_seg#0', ending: 'finished' })
    expect(cards[0].done).toHaveLength(1)
    expect(cards[1]).toMatchObject({ id: 's_seg#1', ending: 'claimed', done: [], promised: ['했어요'] })
  })

  it('🔴 하루 상한은 실제 호출을 센다 — 조각 3개 세션에 상한 2 → 카드 호출 2번 · 남은 조각은 밀린다(최종 검토 1)', async () => {
    cap = 2
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const r = sess('s_cap', 'orch', [
      it_('user', '[요청 ← 해커톤 · hack1 · s_x] 투표 하나'), it_('assistant', '넘겼어요'),
      it_('user', '[요청 ← 웹사이트 · web1 · s_y] 랜딩 하나'), it_('assistant', '넘겼어요'),
      it_('user', '[요청 ← 해커톤 · hack1 · s_z] 접수 하나'), it_('assistant', '넘겼어요')
    ], { comm: true })
    svc.onTurnEnd(r)
    expect(await until(() => svc.status().paused === 'cap')).toBe(true)
    await new Promise((res) => setTimeout(res, 30))
    expect(calls).toHaveLength(2)
    expect(marked(calls, CARD_MARK)).toHaveLength(2)
    expect(svc.status().calls).toBe(2)
    expect((JSON.parse(readFileSync(cardFile('s_cap'), 'utf8')) as { id: string }[]).map((c) => c.id)).toEqual(['s_cap#0', 's_cap#1'])
    expect(svc.status().pending).toBeGreaterThan(0)   // 남은 조각(card:s_cap)과 묶기는 자정 뒤 이어서
  })

  it('조각 카드가 처음이면 마지막 말이 7일보다 오래된 조각은 건너뛴다 — 판의 가장 긴 기간이 7일', async () => {
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    const old = Date.now() - 8 * DAY_MS
    const r = sess('s_old', 'orch', [
      it_('user', '[요청 ← 해커톤 · hack1 · s_x] 투표 하나', old), it_('assistant', '넘겼어요', old + 1000),
      it_('user', '[요청 ← 웹사이트 · web1 · s_y] 랜딩 하나'), it_('assistant', '넘겼어요')
    ], { comm: true })
    svc.onTurnEnd(r)
    await svc.idle()
    expect(marked(calls, CARD_MARK)).toHaveLength(1)
    expect((JSON.parse(readFileSync(cardFile('s_old'), 'utf8')) as { id: string }[]).map((c) => c.id)).toEqual(['s_old#1'])
    expect(svc.status().calls).toBe(calls.length)
  })

  it('🔴 오케스트레이터 조각 카드의 이야기 줄·안 묶인 카드는 주인이 오케스트레이터 — «이어서» 는 오케스트레이터 세션으로(최종 검토 2)', async () => {
    const { ask } = fakeAsk({ group: () => ({ assign: [] }) })   // 모두 «안 묶임» 으로
    const svc = new ContextService(host(), ask)
    svc.onTurnEnd(sess('s_h', 'hack1', [it_('user', '투표', Date.now() - 5000), it_('assistant', '네', Date.now() - 4000)]))
    await svc.idle()
    svc.onTurnEnd(sess('s_oc', 'orch', [it_('user', '[요청 ← 해커톤 · hack1 · s_x] 투표 마무리'), it_('assistant', '넘겼어요')], { comm: true }))
    await svc.idle()
    const g = svc.goal('hack1', null)
    expect(g.story.map((r) => ('sessionId' in r.ref ? [r.ref.sessionId, r.ref.ownerBot] : null))).toEqual([['s_h', 'hack1'], ['s_oc', 'orch']])
    expect(continueTarget(g.story)).toEqual({ bot: 'orch', sessionId: 's_oc' })
    expect(g.loose.map((c) => [c.id, c.ownerBot])).toEqual([['s_h', 'hack1'], ['s_oc#0', 'orch']])
    recs.delete('s_oc')   // 지운 세션 — 주인을 모르면 이어 쓰지 않는다
    expect(continueTarget(svc.goal('hack1', null).story)).toBeNull()
  })

  it('move → 카드가 옮겨지고 고정된다 · reopen → 그 작업이 하다 멈춤으로', async () => {
    const { ask } = fakeAsk()
    const svc = new ContextService(host(), ask)
    svc.onTurnEnd(sess('s_m', 'hack1', [it_('user', '투표'), it_('assistant', '네')]))
    await svc.idle()
    const dest = svc.move('hack1', 's_m', { newTitle: '결과 집계' })
    let t = tasksOf(bots[1])
    const moved = t.tasks.find((x) => x.title === '결과 집계')!
    expect(dest).toBe(moved.id)   // 새 작업 id 를 돌려준다 — 화면이 같은 이름 작업을 다시 찾지 않게
    expect(svc.move('hack1', 's_m', moved.id)).toBe(moved.id)
    expect(moved.cards).toEqual(['s_m'])
    expect(t.pins).toEqual({ s_m: moved.id })
    svc.reopen('hack1', moved.id)
    t = tasksOf(bots[1])
    expect(t.tasks.find((x) => x.id === moved.id)?.state).toBe('stalled')
    svc.snooze('hack1', moved.id)
    expect(tasksOf(bots[1]).snooze[moved.id]).toBeGreaterThan(Date.now())
    expect(() => svc.move('hack1', 's_m', 'no-such-task')).toThrow()
    const g = svc.goal('hack1', moved.id)
    expect(g.goal?.botId).toBe('hack1')
    expect(g.story).toHaveLength(1)
    expect(g.brief).toContain('결과 집계')
  })
})

describe('ContextService — 주인 아님', () => {
  it('onTurnEnd 는 아무것도 안 하고 · board() 는 볼트 파일 그대로 · move 는 NotOwner', async () => {
    owner = false
    mkdirSync(join(root, '.folderbot', 'context'), { recursive: true })
    const seeded: Board = { v: 1, at: 123, host: '맥미니', period: 'today', since: 0, axis: null, tally: { done: 1, stalled: 0, added: 1 },
      step: { stalled: { rows: [], more: 0 }, waiting: { rows: [], more: 0 }, routine: { rows: [], more: 0 } }, goals: [], quiet: ['해커톤'], sources: [] }
    writeFileSync(boardFile(), JSON.stringify(seeded))
    const { ask, calls } = fakeAsk()
    const svc = new ContextService(host(), ask)
    svc.onTurnEnd(sess('s_n', 'hack1', [it_('user', '투표'), it_('assistant', '네')]))
    svc.onFiles('hack1')
    await svc.idle()
    expect(calls).toHaveLength(0)
    expect(existsSync(cardFile('s_n'))).toBe(false)
    expect(svc.board('today')).toEqual(seeded)
    expect(() => svc.move('hack1', 's_n', { newTitle: 'x' })).toThrow(NotOwner)
    expect(() => svc.snooze('hack1', 't')).toThrow(NotOwner)
    expect(() => svc.reopen('hack1', 't')).toThrow('주인 맥(맥미니)에서만 고칠 수 있어요')
    expect(svc.status().owner).toBe(false)
  })

  it('409 글의 주인 이름은 ops.yml host — 판 파일을 쓴 맥이 아니고 이 맥도 아니다(CX-4)', () => {
    owner = false
    mkdirSync(join(root, '.folderbot', 'context'), { recursive: true })
    writeFileSync(boardFile(), JSON.stringify({ v: 1, at: 1, host: '맥북', period: 'today', since: 0, axis: null, tally: { done: 0, stalled: 0, added: 0 },
      step: { stalled: { rows: [], more: 0 }, waiting: { rows: [], more: 0 }, routine: { rows: [], more: 0 } }, goals: [], quiet: [], sources: [] }))
    const svc = new ContextService({ ...host(), routineOwner: () => '다른맥' }, fakeAsk().ask)
    expect(() => svc.move('hack1', 's_n', { newTitle: 'x' })).toThrow('주인 맥(다른맥)에서만 고칠 수 있어요')
    // ops.yml 을 못 읽으면(던짐) 판의 host 로
    const svc2 = new ContextService({ ...host(), routineOwner: () => { throw new Error('x') } }, fakeAsk().ask)
    expect(() => svc2.snooze('hack1', 't')).toThrow('주인 맥(맥북)에서만 고칠 수 있어요')
  })

  it('🔴 goal() 은 저장된 작업 상태를 그대로 — 이 맥 카드로 다시 매기지 않는다 · 목표 카드는 볼트 판에서(최종 검토 3)', () => {
    owner = false
    const ctx = join(bots[1].abs, '.folderbot', 'context')
    mkdirSync(ctx, { recursive: true })
    const task = (id: string, state: string) => ({ id, title: id, state, summary: '', missing: '', cards: [`s_${id}`], lastAt: 1, updatedAt: 1 })
    const stored: FolderTasks = { v: 1, botId: 'hack1', tasks: [task('t1', 'stalled'), task('t2', 'claimed'), task('t3', 'done'), task('t4', 'running')] as FolderTasks['tasks'],
      loose: ['s_l'], pins: {}, fixes: [], snooze: {}, reopened: {}, gap: '', updatedAt: 1 }
    writeFileSync(join(ctx, 'tasks.json'), JSON.stringify(stored))
    mkdirSync(join(root, '.folderbot', 'context'), { recursive: true })
    const g = { botId: 'hack1', folder: '해커톤', goal: '주인 맥이 지은 목표', goalFrom: 'state', due: '', counts: { done: 1, claimed: 1, running: 1, stalled: 1, waiting: 0, todo: 0 },
      gap: null, just: null, next: null, chips: { sessions: 4, routines: 0 }, problem: true, lastAt: 1, tasks: [] }
    writeFileSync(boardFile(), JSON.stringify({ v: 1, at: 1, host: '맥미니', period: 'today', since: 0, axis: null, tally: { done: 1, stalled: 1, added: 0 },
      step: { stalled: { rows: [], more: 0 }, waiting: { rows: [], more: 0 }, routine: { rows: [], more: 0 } }, goals: [g], quiet: [], sources: [] }))
    const svc = new ContextService(host(), fakeAsk().ask)
    const out = svc.goal('hack1', null)
    expect(out.tasks.map((t) => [t.id, t.state])).toEqual([['t1', 'stalled'], ['t2', 'claimed'], ['t3', 'done'], ['t4', 'running']])
    expect(out.goal).toEqual(g)
    expect(out.story).toEqual([])
    expect(out.loose).toEqual([])
  })

  it('볼트 판이 없으면 빈 판에 «아직 주인 맥 판 없음»', () => {
    owner = false
    const svc = new ContextService(host(), fakeAsk().ask)
    const b = svc.board('today')
    expect(b.goals).toEqual([])
    expect(b.sources.some((s) => !s.ok && s.note === '아직 주인 맥 판 없음')).toBe(true)
  })
})
