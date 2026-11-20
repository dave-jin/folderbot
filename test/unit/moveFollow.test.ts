import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry, type BotMoved } from '../../src/host/registry'
import type { Bot } from '../../src/core/types'

/**
 * 폴더를 옮겨도 봇이 따라간다 (2026-11-20 · 오케스트레이터 제보 두 건 · Dave 승인).
 * 종전 `move()` 는 폴더만 옮겨 봇 줄의 rel 이 옛 경로로 남았고, 봇이 목록에서 사라졌다(새로 켜면 새 id · 세션 0개).
 */
function vault(): { root: string; reg: Registry } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fb-mv-')))
  writeFileSync(join(root, 'CLAUDE.md'), '')
  for (const d of ['2. Projects/a', '2. Projects/p/q', '5. Archive/old']) mkdirSync(join(root, d), { recursive: true })
  return { root, reg: new Registry(root) }
}
const live = (reg: Registry) => reg.bots().filter((b) => !b.orchestrator)

describe('registry.move — 봇이 따라간다', () => {
  it('🔴 켜진 봇 폴더를 옮기면 같은 id 로 새 경로에 남는다 · moved 신호에 옛·새 절대 경로', () => {
    const { root, reg } = vault()
    const b = reg.start('2. Projects/a')
    const got: BotMoved[][] = []; reg.on('moved', (l: BotMoved[]) => got.push(l))
    const moved = reg.move('2. Projects/a', '2. Projects/a2')
    expect(live(reg).map((x) => [x.id, x.rel])).toEqual([[b.id, '2. Projects/a2']])
    expect(moved).toEqual([{ id: b.id, fromAbs: join(root, '2. Projects/a'), toAbs: join(root, '2. Projects/a2') }])
    expect(got).toHaveLength(1)
    // 볼트 파일에도 남는다 — 다시 읽어도 같은 자리
    expect(live(new Registry(root)).map((x) => [x.id, x.rel])).toEqual([[b.id, '2. Projects/a2']])
  })
  it('상위 폴더째 옮기면 그 안의 봇도 따라간다 · 앞뒤 / 와 NFD 이름도 받는다', () => {
    const { reg } = vault()
    const b = reg.start('2. Projects/p/q')
    reg.move('/2. Projects/p/'.normalize('NFD'), '2. Projects/p2')
    expect(reg.bot(b.id)?.rel).toBe('2. Projects/p2/q')
  })
  it('되돌리면 봇도 원래 자리로 돌아온다', () => {
    const { reg } = vault()
    const b = reg.start('2. Projects/a')
    reg.move('2. Projects/a', '2. Projects/a2')
    reg.undo(reg.undoList()[0].t)
    expect(reg.bot(b.id)?.rel).toBe('2. Projects/a')
  })
  it('봇과 무관한 폴더를 옮기면 moved 를 쏘지 않는다', () => {
    const { reg } = vault()
    reg.start('2. Projects/a')
    let n = 0; reg.on('moved', () => n++)
    expect(reg.move('2. Projects/p', '2. Projects/p9')).toEqual([])
    expect(n).toBe(0)
  })
})

describe('registry.orphans · reattach — 이 판 전에 끊긴 봇 되붙이기', () => {
  /** 옛 판이 한 일을 흉내 — 폴더만 옮기고 되돌리기 기록을 남긴다(봇 줄은 그대로) */
  const oldMove = (root: string, from: string, to: string, t: number) => {
    renameSync(join(root, from), join(root, to))
    mkdirSync(join(root, '.folderbot/undo'), { recursive: true })
    writeFileSync(join(root, '.folderbot/undo', `${t}.json`), JSON.stringify({ t, op: 'move', from, to }))
  }
  it('🔴 새 경로에 이미 새 봇이 있으면 옛 줄을 빼고 그 봇으로 합친다(into) — 옛 봇이 켜진 뒤의 옮기기를 이어 따라간다', () => {
    const { root, reg } = vault()
    const old = reg.start('2. Projects/a')
    oldMove(root, '2. Projects/a', '2. Projects/a2', Date.now() + 10)
    oldMove(root, '2. Projects/a2', '2. Projects/a3', Date.now() + 20)
    const reg2 = new Registry(root)
    expect(live(reg2)).toEqual([])                           // 옛 판의 증상 — 목록에서 빠졌다
    const fresh = reg2.start('2. Projects/a3')               // 옛 판에서 사람이 한 일 — 새로 켰다
    expect(reg2.orphans()).toEqual([{ id: old.id, rel: '2. Projects/a', to: '2. Projects/a3', into: fresh.id }])
    let got: BotMoved[] = []; reg2.on('moved', (l: BotMoved[]) => { got = l })
    const m = reg2.reattach(old.id)
    expect(m).toMatchObject({ id: old.id, into: fresh.id, fromAbs: join(root, '2. Projects/a'), toAbs: join(root, '2. Projects/a3') })
    expect(got).toEqual([m])
    expect(live(reg2).map((x) => x.id)).toEqual([fresh.id])  // 옛 줄은 빠지고 새 봇 하나
    expect(reg2.orphans()).toEqual([])
  })
  it('새 경로가 비어 있으면 옛 봇이 id 그대로 새 경로에 선다', () => {
    const { root, reg } = vault()
    const old = reg.start('2. Projects/a')
    oldMove(root, '2. Projects/a', '2. Projects/a2', Date.now() + 10)
    const reg2 = new Registry(root)
    expect(reg2.reattach(old.id).into).toBeUndefined()
    expect(reg2.bot(old.id)?.rel).toBe('2. Projects/a2')
  })
  it('기록이 없거나 휴지통으로 간 봇은 붙이지 않는다 · 빠진 봇이 아니면 거절', () => {
    const { root, reg } = vault()
    const lost = reg.start('2. Projects/a'), kept = reg.start('2. Projects/p/q')
    renameSync(join(root, '2. Projects/a'), join(root, '2. Projects/몰래'))   // 되돌리기 기록 없이 옮겼다
    const reg2 = new Registry(root)
    expect(reg2.orphans()).toEqual([{ id: lost.id, rel: '2. Projects/a', to: null }])
    expect(() => reg2.reattach(lost.id)).toThrow(/못 찾았어요/)
    expect(() => reg2.reattach(kept.id)).toThrow(/빠진 봇이 아니에요/)
    reg2.trashPath('2. Projects/p/q')
    expect(reg2.orphans().find((o) => o.id === kept.id)?.to).toBeNull()
  })
})

describe('createFolder — 칸 없이는 만들지 않는다', () => {
  it('🔴 section 이 비면 거절하고 볼트 맨 위에 아무것도 안 만든다 · 오류에 쓸 수 있는 칸', () => {
    const { root, reg } = vault()
    expect(() => reg.createFolder('', '2026-12-14_이사')).toThrow(/칸\(section\)을 정해 주세요 — 2\. Projects · 3\. Area/)
    expect(existsSync(join(root, '2026-12-14_이사'))).toBe(false)
    expect(reg.firstActiveSection()).toBe('2. Projects')
    expect(reg.createFolder(reg.firstActiveSection()!, '2026-12-14_이사')).toBe('2. Projects/2026-12-14_이사')
  })
})

describe('retire — 이미 보관 칸이면 봇만 끈다', () => {
  it('🔴 Archive 안 폴더의 봇은 «같은 이름» 으로 실패하지 않고 그 자리에서 꺼진다', () => {
    const { root, reg } = vault()
    const b = reg.start('5. Archive/old')
    expect(reg.retire(b.id)).toBe('5. Archive/old')
    expect(reg.bot(b.id)).toBeUndefined()
    expect(existsSync(join(root, '5. Archive/old'))).toBe(true)
  })
  it('보관 칸에 같은 이름의 다른 폴더가 있으면 그때만 거절한다', () => {
    const { root, reg } = vault()
    mkdirSync(join(root, '5. Archive/a'))
    const b = reg.start('2. Projects/a')
    expect(() => reg.retire(b.id)).toThrow(/같은 이름의 다른 폴더/)
  })
})

describe('SessionManager.rebase · carryTranscript — 세션이 따라간다', () => {
  let SessionManager: typeof import('../../src/host/session').SessionManager
  let carryTranscript: typeof import('../../src/host/session').carryTranscript
  let cfg = ''
  beforeAll(async () => {
    process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-mvdata-'))
    cfg = mkdtempSync(join(tmpdir(), 'fb-mvcfg-')); process.env.CLAUDE_CONFIG_DIR = cfg
    process.env.FOLDERBOT_CLI_BIN = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
    ;({ SessionManager, carryTranscript } = await import('../../src/host/session'))
  })
  const botAt = (id: string, abs: string) => ({ id, rel: '', abs, name: id, section: '', startedAt: 0, vendor: 'claude', routines: [] }) as unknown as Bot

  it('🔴 cwd 가 새 경로로 · into 면 새 봇으로 옮겨 가고 지우지 않는다 · 소통은 가장 최근 것만 남는다 · 지운 표시 파일도 고친다', () => {
    const sm = new SessionManager()
    const oldBot = botAt('b_old', '/v/1. P/2026-11-17_x'), newBot = botAt('b_new', '/v/1. P/2026-11-25_x')
    const nc = sm.commOf(newBot, 'orch')
    const t0 = Date.now(); while (Date.now() - t0 < 3) { /* 옛 소통이 «더 최근» 이어도 새 봇 소통이 남는지 — 시각 비교에 맡기지 않는다 */ }
    const a = sm.create(oldBot, '옛 일'), oc = sm.commOf(oldBot, 'orch')
    const gone = sm.create(oldBot, '지운 일'); sm.remove(gone.id)
    const sub = sm.create({ ...oldBot, abs: '/elsewhere/repo' } as Bot, '코드 자리')   // 볼트 밖 cwd(참조 리포)는 그대로
    const r = sm.rebase('b_old', oldBot.abs, newBot.abs, 'b_new')
    expect(r).toEqual({ sessions: 3, running: 0 })
    expect(sm.get(a.id)).toMatchObject({ botId: 'b_new', cwd: newBot.abs })
    expect(sm.get(sub.id)).toMatchObject({ botId: 'b_new', cwd: '/elsewhere/repo' })
    expect(sm.list('b_old')).toEqual([])
    expect(sm.list('b_new').map((x) => x.id).sort()).toEqual([a.id, oc.id, sub.id, nc.id].sort())
    expect(sm.list('b_new').filter((x) => x.comm).map((x) => x.id)).toEqual([nc.id])   // 새 봇 소통이 남고 옛 것은 «옛 소통»
    expect(sm.list('b_new').find((x) => x.id === oc.id)?.exComm).toBe(true)
    const g = JSON.parse(readFileSync(join(process.env.FOLDERBOT_DATA!, 'sessions', `${gone.id}.json`), 'utf8'))
    expect([g.deleted, g.botId, g.cwd]).toEqual([true, 'b_new', newBot.abs])
  })
  it('into 없이 옮기면 cwd 만 바뀌고 다른 봇 세션은 건드리지 않는다', () => {
    const sm = new SessionManager()
    const b = botAt('b_m', '/v/a'), other = botAt('b_o', '/v/a-other')
    const s1 = sm.create(b, '일'), s2 = sm.create(other, '남의 일')
    expect(sm.rebase('b_m', '/v/a', '/v/a2').sessions).toBe(1)
    expect(sm.get(s1.id)?.cwd).toBe('/v/a2')
    expect(sm.get(s2.id)?.cwd).toBe('/v/a-other')
  })
  it('🔴 CLI 기록이 새 경로 자리에 없으면 복사한다 · 이미 있으면 안 덮는다 · 옛 파일은 남긴다', () => {
    const slug = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-')
    const oldCwd = '/v/1. Projects/2026-11-17_강의-텔로스', newCwd = '/v/1. Projects/2026-11-25_강의-텔로스'
    const od = join(cfg, 'projects', slug(oldCwd)); mkdirSync(join(od, 'sid1', 'subagents'), { recursive: true })
    writeFileSync(join(od, 'sid1.jsonl'), '{"a":1}\n'); writeFileSync(join(od, 'sid1', 'subagents', 'x.jsonl'), 'sub\n')
    expect(carryTranscript(newCwd, 'sid1')).toBe(true)
    const nd = join(cfg, 'projects', slug(newCwd))
    expect(readFileSync(join(nd, 'sid1.jsonl'), 'utf8')).toBe('{"a":1}\n')
    expect(readFileSync(join(nd, 'sid1', 'subagents', 'x.jsonl'), 'utf8')).toBe('sub\n')
    expect(existsSync(join(od, 'sid1.jsonl'))).toBe(true)
    writeFileSync(join(nd, 'sid1.jsonl'), '{"newer":1}\n')
    expect(carryTranscript(newCwd, 'sid1')).toBe(false)
    expect(readFileSync(join(nd, 'sid1.jsonl'), 'utf8')).toBe('{"newer":1}\n')
    expect(carryTranscript(newCwd, 'nope')).toBe(false)
  })
})
