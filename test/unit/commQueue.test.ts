import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Bot } from '../../src/core/types'
import { compactReason, COMPACT_IDLE_MS } from '../../src/core/compact'

/**
 * 봇마다 «🤝 소통» 세션 하나 · 다른 봇의 말은 일하는 중이면 큐 · 자동 압축 (2026-10-02 Dave)
 */
let SessionManager: typeof import('../../src/host/session').SessionManager
const sms: InstanceType<typeof SessionManager>[] = []
beforeAll(async () => {
  process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-comm-'))
  process.env.FOLDERBOT_CLI_BIN = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
  ;({ SessionManager } = await import('../../src/host/session'))
})
afterAll(() => { for (const sm of sms) for (const r of sm.list()) sm.hibernate?.(r.id) })
const bot: Bot = { id: 'b1', rel: '2. Projects/b1', abs: tmpdir(), name: 'b1', section: '2. Projects', orchestrator: false, startedAt: 0, vendor: 'claude', routines: [] } as unknown as Bot
const until = async (f: () => boolean, ms = 5000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 50)) } }
const users = (sm: InstanceType<typeof SessionManager>, id: string) => sm.items(id).filter((i) => i.kind === 'user').map((i) => (i as { text: string }).text)
function mk() { const sm = new SessionManager(); sm.botOf = () => bot; sms.push(sm); return sm }

describe('compactReason — 언제 압축하나', () => {
  const now = 10 * COMPACT_IDLE_MS
  it('턴이 끝났는데 70% 넘으면 · Codex·쿨다운·작은 컨텍스트는 아니다', () => {
    expect(compactReason({ ctx: { used: 140, window: 200 }, lastActivity: now }, 'after', now)).toBe('컨텍스트 70%')
    expect(compactReason({ ctx: { used: 100, window: 200 }, lastActivity: now }, 'after', now)).toBe(null)
    expect(compactReason({ vendor: 'codex', ctx: { used: 190, window: 200 }, lastActivity: now }, 'after', now)).toBe(null)
    expect(compactReason({ ctx: { used: 190, window: 200 }, lastActivity: now, compactedAt: now - 60_000 }, 'after', now)).toBe(null)
  })
  it('소통 세션을 6시간 넘게 쉬었다 다시 쓰면(30% 이상) · 사람 세션은 아니다', () => {
    const old = now - COMPACT_IDLE_MS - 1
    expect(compactReason({ comm: true, ctx: { used: 80, window: 200 }, lastActivity: old }, 'before', now)).toMatch(/소통 세션/)
    expect(compactReason({ ctx: { used: 80, window: 200 }, lastActivity: old }, 'before', now)).toBe(null)
    expect(compactReason({ comm: true, ctx: { used: 20, window: 200 }, lastActivity: old }, 'before', now)).toBe(null)
    expect(compactReason({ comm: true, ctx: { used: 80, window: 200 }, lastActivity: now - 60_000 }, 'before', now)).toBe(null)
  })
})

describe('소통 세션 · 큐 · 자동 압축 (SessionManager + 스텁 CLI)', () => {
  it('봇마다 소통 세션은 하나 — 두 번 불러도 같은 세션', () => {
    const sm = mk()
    const a = sm.commOf(bot, 'orch'), b = sm.commOf(bot, 'other')
    expect(a.id).toBe(b.id); expect(a.comm).toBe(true); expect(a.name).toBe('🤝 소통')
    expect(sm.list(bot.id).filter((x) => x.comm)).toHaveLength(1)
  })
  it('일하는 중에 온 봇의 말은 큐에서 기다렸다가 턴이 끝나면 차례로 나간다', async () => {
    const sm = mk(); const r = sm.commOf(bot, 'orch')
    expect(sm.sendFromBot(r, bot, { text: '느린일 첫째', from: 'orch', t: 1 })).toBe('sent')
    expect(sm.sendFromBot(r, bot, { text: '되읊어: 둘째', from: 'orch', t: 2 })).toBe('queued')
    expect(sm.sendFromBot(r, bot, { text: '되읊어: 셋째', from: 'orch', t: 3 })).toBe('queued')
    expect(sm.list(bot.id).find((x) => x.id === r.id)?.queue?.map((q) => q.text)).toEqual(['되읊어: 둘째', '되읊어: 셋째'])
    expect(users(sm, r.id)).toEqual(['느린일 첫째'])
    await until(() => users(sm, r.id).length === 3 && r.state === 'done', 12000)
    expect(users(sm, r.id)).toEqual(['느린일 첫째', '되읊어: 둘째', '되읊어: 셋째'])
    expect(r.queue).toBeUndefined()
  }, 15000)
  it('사람이 대기 말을 고치고 뺀다 — 빈 글이면 빠진다', () => {
    const sm = mk(); const r = sm.create(bot, 'x'); r.queue = [{ text: 'a', from: 'orch', t: 1 }, { text: 'b', from: 'orch', t: 2 }]
    expect(sm.editQueue(r, 0, 'A').map((q) => q.text)).toEqual(['A', 'b'])
    expect(sm.editQueue(r, 1, '  ').map((q) => q.text)).toEqual(['A'])
    expect(() => sm.editQueue(r, 5, 'z')).toThrow()
  })
  it('턴이 끝났는데 컨텍스트가 70% 를 넘으면 /compact — 그사이 온 말은 압축 뒤에 나간다', async () => {
    const sm = mk(); const r = sm.create(bot, '사람 세션')
    sm.send(r, bot, '되읊어: 시작'); await until(() => r.state === 'done')
    r.ctx = { used: 160_000, window: 200_000 }
    sm.afterTurn(r)
    expect(r.state).toBe('running')
    expect(sm.items(r.id).some((i) => i.kind === 'system' && /자동 압축 — 컨텍스트 80%/.test((i as { text: string }).text))).toBe(true)
    expect(users(sm, r.id)).toEqual(['되읊어: 시작'])   // /compact 는 사람 말로 서지 않는다
    expect(sm.sendFromBot(r, bot, { text: '되읊어: 압축 뒤', from: 'orch', t: 1 })).toBe('queued')
    await until(() => users(sm, r.id).includes('되읊어: 압축 뒤') && r.state === 'done', 8000)
    expect(r.compactedAt).toBeGreaterThan(0)
  }, 12000)
  it('오래 쉰 소통 세션은 쓰기 전에 먼저 압축하고 그 말은 큐에 둔다', async () => {
    const sm = mk(); const r = sm.commOf(bot, 'orch')
    sm.send(r, bot, '되읊어: 옛일'); await until(() => r.state === 'done')
    r.ctx = { used: 80_000, window: 200_000 }; r.lastActivity = Date.now() - COMPACT_IDLE_MS - 60_000
    expect(sm.sendFromBot(r, bot, { text: '되읊어: 새 일', from: 'orch', t: 1 })).toBe('queued')
    expect(sm.items(r.id).some((i) => i.kind === 'system' && /쉰 소통 세션/.test((i as { text: string }).text))).toBe(true)
    await until(() => users(sm, r.id).includes('되읊어: 새 일') && r.state === 'done', 8000)
  }, 12000)
})
