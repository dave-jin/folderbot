import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ContextStore } from '../../src/host/contextStore'
import type { SessionCard } from '../../src/core/contextCard'
import { emptyTasks } from '../../src/core/contextTasks'
import type { Board } from '../../src/core/contextBoard'

const card = (id: string, o: Partial<SessionCard> = {}): SessionCard => {
  const [sessionId, seg] = id.split('#')
  return {
    id, sessionId, ...(seg !== undefined ? { seg: Number(seg) } : {}), botId: 'b1', channel: 'folder', machine: 'mini',
    intent: '의도', done: [], promised: [], ending: 'finished', taskHint: '', from: 100, to: 200, cursor: 'c', updatedAt: 1, llm: true, ...o
  }
}
const board = (at: number, extra: Partial<Board> = {}): Board => ({
  v: 1, at, host: 'mini', period: 'today', since: 0, axis: null, tally: { done: 0, stalled: 0, added: 0 },
  step: { stalled: { rows: [], more: 0 }, waiting: { rows: [], more: 0 }, routine: { rows: [], more: 0 } },
  goals: [], quiet: [], sources: [], ...extra
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let dataDir: string, vaultRoot: string, botAbs: string, s: ContextStore
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'fb-ctx-data-'))
  vaultRoot = mkdtempSync(join(tmpdir(), 'fb-ctx-vault-'))
  botAbs = join(vaultRoot, '1. Projects', 'b1')
  mkdirSync(botAbs, { recursive: true })
  s = new ContextStore({ dataDir, vaultRoot })
})

describe('ContextStore', () => {
  it('putCard → card 로 되읽히고 새 인스턴스에서도 읽힌다', () => {
    expect(s.card('x')).toBeNull()
    s.putCard(card('x', { intent: '투표 만들기' }))
    expect(s.card('x')?.intent).toBe('투표 만들기')
    expect(new ContextStore({ dataDir, vaultRoot }).card('x')?.intent).toBe('투표 만들기')
    expect(existsSync(join(dataDir, 'context', 'cards', 'x.json'))).toBe(true)
  })

  it('조각 카드(#0·#1)가 한 파일에 같이 산다', () => {
    s.putCard(card('s1#0', { from: 1, to: 2 })); s.putCard(card('s1#1', { from: 3, to: 4 }))
    expect(readdirSync(join(dataDir, 'context', 'cards'))).toEqual(['s1.json'])
    expect(s.cardsOf('s1').map((c) => c.id)).toEqual(['s1#0', 's1#1'])
    expect(s.card('s1#1')?.from).toBe(3)
    s.putCard(card('s1#1', { from: 3, to: 9 }))
    expect(s.cardsOf('s1')).toHaveLength(2)
    expect(new ContextStore({ dataDir, vaultRoot }).card('s1#1')?.to).toBe(9)
  })

  it('folderCards(botId, since) 는 to >= since 만 준다', () => {
    s.putCard(card('a', { to: 100 })); s.putCard(card('b', { to: 200 })); s.putCard(card('c', { to: 300, botId: 'other' }))
    expect(s.folderCards('b1', 150).map((c) => c.id)).toEqual(['b'])
    expect(s.folderCards('b1', 200).map((c) => c.id)).toEqual(['b'])
    expect(s.folderCards('b1', 0).map((c) => c.id).sort()).toEqual(['a', 'b'])
    // 새 인스턴스(디스크에서 읽기)도 같다
    expect(new ContextStore({ dataDir, vaultRoot }).folderCards('b1', 150).map((c) => c.id)).toEqual(['b'])
  })

  it('tasks 는 없으면 emptyTasks, putTasks 같은 값 두 번 → 두 번째는 false 이고 mtime 이 그대로', async () => {
    expect(s.tasks(botAbs, 'b1')).toEqual(emptyTasks('b1'))
    const t = { ...emptyTasks('b1'), gap: '두 개 남음', updatedAt: 1 }
    expect(s.putTasks(botAbs, t)).toBe(true)
    const f = join(botAbs, '.folderbot', 'context', 'tasks.json')
    const m1 = statSync(f).mtimeMs
    await sleep(20)
    expect(s.putTasks(botAbs, { ...t, updatedAt: 999 })).toBe(false)   // updatedAt 만 다름
    expect(statSync(f).mtimeMs).toBe(m1)
    expect(s.tasks(botAbs, 'b1').gap).toBe('두 개 남음')
    expect(s.putTasks(botAbs, { ...t, gap: '하나 남음', updatedAt: 1000 })).toBe(true)
    expect(statSync(f).mtimeMs).toBeGreaterThan(m1)
    expect(s.tasks(botAbs, 'b1').gap).toBe('하나 남음')
  })

  it('putBoard 는 at 만 다르면 안 쓴다 · board.json 과 board.md 를 쓴다', async () => {
    expect(s.board()).toBeNull()
    expect(s.putBoard(board(1), '# 판')).toBe(true)
    const j = join(vaultRoot, '.folderbot', 'context', 'board.json'), md = join(vaultRoot, '.folderbot', 'context', 'board.md')
    expect(readFileSync(md, 'utf8')).toBe('# 판')
    const m1 = statSync(j).mtimeMs, m2 = statSync(md).mtimeMs
    await sleep(20)
    expect(s.putBoard(board(2), '# 판 (다른 시각)')).toBe(false)
    expect(statSync(j).mtimeMs).toBe(m1); expect(statSync(md).mtimeMs).toBe(m2)
    expect(s.board()?.at).toBe(1)
    expect(s.putBoard(board(3, { host: 'book' }), '# 판2')).toBe(true)
    expect(s.board()?.host).toBe('book')
    expect(readFileSync(md, 'utf8')).toBe('# 판2')
  })

  it('markSeen 은 앞 값을 돌려준다', () => {
    expect(s.seen()).toBeNull()
    expect(s.markSeen(10)).toBeNull()
    expect(s.seen()).toBe(10)
    expect(s.markSeen(20)).toBe(10)
    expect(new ContextStore({ dataDir, vaultRoot }).seen()).toBe(20)
  })

  it('usageLog 는 usage.jsonl 에 한 줄씩 쌓는다', () => {
    s.usageLog({ at: 1, job: 'card:a', model: 'haiku', ms: 900, ok: true, chars: 1200 })
    s.usageLog({ at: 2, job: 'axis', model: 'haiku', ms: 50, ok: false, chars: 10 })
    const lines = readFileSync(join(dataDir, 'context', 'usage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => l.job)).toEqual(['card:a', 'axis'])
  })

  it('볼트 쪽 파일에는 대화 원문 글자([사람])가 들어가지 않는다', () => {
    s.putCard(card('x', { intent: '[사람] 안녕 [어시스턴트] 네' }))
    s.putTasks(botAbs, { ...emptyTasks('b1'), gap: '요약' })
    s.putBoard(board(1), '# 판')
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
    const files = walk(vaultRoot)
    expect(files.length).toBe(3)
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toContain('[사람]')
    expect(readFileSync(join(dataDir, 'context', 'cards', 'x.json'), 'utf8')).toContain('[사람]')
  })

  it('폴더가 없으면 putTasks·putBoard 는 안 쓰고 false — 유령 폴더를 만들지 않는다', () => {
    const gone = join(vaultRoot, '4. Archive', 'moved')
    expect(s.putTasks(gone, { ...emptyTasks('b1'), gap: 'x' })).toBe(false)
    expect(existsSync(join(vaultRoot, '4. Archive'))).toBe(false)
    const noVault = join(vaultRoot, 'nope')
    const s2 = new ContextStore({ dataDir, vaultRoot: noVault })
    expect(s2.putBoard(board(1), '# 판')).toBe(false)
    expect(existsSync(noVault)).toBe(false)
  })

  it('JSON 은 맞지만 내용이 깨진 파일은 던지지 않고 무시한다', () => {
    const cdir = join(dataDir, 'context', 'cards')
    mkdirSync(cdir, { recursive: true })
    writeFileSync(join(cdir, 'g.json'), '[null,1,{"id":"x"}]')
    writeFileSync(join(cdir, 'h.json'), JSON.stringify([null, card('h', { botId: 'b1', to: 500 })]))
    const t = new ContextStore({ dataDir, vaultRoot })
    expect(t.card('g')).toBeNull(); expect(t.card('x')).toBeNull(); expect(t.cardsOf('g')).toEqual([])
    expect(t.folderCards('b1', 0).map((c) => c.id)).toEqual(['h'])
    expect(() => t.putCard(card('g', { to: 1 }))).not.toThrow()
    expect(t.cardsOf('g').map((c) => c.id)).toEqual(['g'])
    const tf = join(botAbs, '.folderbot', 'context'); mkdirSync(tf, { recursive: true })
    for (const bad of ['{"v":1}', '{"v":1,"tasks":[],"loose":[],"pins":[]}', '[1]', 'null', '{"v":2,"tasks":[],"loose":[],"pins":{}}']) {
      writeFileSync(join(tf, 'tasks.json'), bad)
      expect(t.tasks(botAbs, 'b1')).toEqual(emptyTasks('b1'))
    }
    const bf = join(vaultRoot, '.folderbot', 'context'); mkdirSync(bf, { recursive: true })
    for (const bad of ['{"v":1}', '{"v":1,"step":null,"goals":[]}', '{"v":1,"step":{},"goals":{}}', '[]', '5']) {
      writeFileSync(join(bf, 'board.json'), bad)
      expect(t.board()).toBeNull()
    }
  })
})
