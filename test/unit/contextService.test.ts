import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ContextService, NotOwner, type ContextHost } from '../../src/host/context'
import { CARD_MARK } from '../../src/core/contextCard'
import { GROUP_MARK, type FolderTasks } from '../../src/core/contextTasks'
import { AXIS_MARK, type Board } from '../../src/core/contextBoard'
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
function fakeAsk(o: { failCards?: number; group?: (cards: { id: string; taskHint: string }[], model: string) => unknown } = {}) {
  const calls: { prompt: string; model: string }[] = []
  let cardFails = o.failCards ?? 0
  const ask = async (prompt: string, opts: OneShotOpts): Promise<OneShotResult> => {
    calls.push({ prompt, model: opts.model })
    if (prompt.startsWith(CARD_MARK)) {
      if (cardFails > 0) { cardFails--; return { ok: false, out: '', ms: 1 } }
      const convo = prompt.slice(prompt.lastIndexOf('\n대화\n'))
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
})

function host(): ContextHost {
  return {
    sessions: { all: () => [...recs.values()], items: (id) => recs.get(id)?.items ?? [], get: (id) => recs.get(id) },
    registry: { bots: () => bots, root },
    cfg: { context: {} },
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
const tasksOf = (b: Bot): FolderTasks => JSON.parse(readFileSync(join(b.abs, '.folderbot', 'context', 'tasks.json'), 'utf8'))
const cardFile = (sid: string) => join(data, 'context', 'cards', `${sid}.json`)
const boardFile = () => join(root, '.folderbot', 'context', 'board.json')
const marked = (calls: { prompt: string }[], mark: string) => calls.filter((c) => c.prompt.startsWith(mark))

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
  })

  it('move → 카드가 옮겨지고 고정된다 · reopen → 그 작업이 하다 멈춤으로', async () => {
    const { ask } = fakeAsk()
    const svc = new ContextService(host(), ask)
    svc.onTurnEnd(sess('s_m', 'hack1', [it_('user', '투표'), it_('assistant', '네')]))
    await svc.idle()
    svc.move('hack1', 's_m', { newTitle: '결과 집계' })
    let t = tasksOf(bots[1])
    const moved = t.tasks.find((x) => x.title === '결과 집계')!
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

  it('볼트 판이 없으면 빈 판에 «아직 주인 맥 판 없음»', () => {
    owner = false
    const svc = new ContextService(host(), fakeAsk().ask)
    const b = svc.board('today')
    expect(b.goals).toEqual([])
    expect(b.sources.some((s) => !s.ok && s.note === '아직 주인 맥 판 없음')).toBe(true)
  })
})
