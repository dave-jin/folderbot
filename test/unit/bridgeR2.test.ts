import { describe, it, expect, beforeAll, vi } from 'vitest'
import { chmodSync, mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { missedSince, Routines, CATCHUP_WINDOW_MS } from '../../src/host/routines'
import { parseBridges, parseDuration, channelSpawn } from '../../src/core/bridges'
import { rotateReason, ROTATE_AFTER_MS } from '../../src/core/compact'
import { readWakeEnv, wakePeer } from '../../src/host/wake'
import { BridgeHub } from '../../src/host/bridge'
import { handleMcp, mcpTools, resetOrchAskForTest } from '../../src/host/mcp'
import type { Bot } from '../../src/core/types'

/**
 * 연결(Bridge) R2 (2026-10-09 Dave 승인) — 놓친 회차 보충 · 재시도 · routine_run · orch_report · 깨우기 · 끊김 · 채널 갈아타기.
 */
const H = 3600_000
const until = async (f: () => boolean, ms = 12000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 50)) } return true }

describe('BR-2 · 놓친 회차 (missedSince · Routines.catchUp)', () => {
  const at = (s: string) => new Date(s).getTime()
  it('마지막 실행 뒤 예정 시각이 지났고 6시간 안이면 그 시각, 아니면 null', () => {
    expect(missedSince('0 9 * * *', at('2026-10-08T09:00:05'), at('2026-10-09T10:00:00'))).toBe(at('2026-10-09T09:00:00'))
    expect(missedSince('0 9 * * *', at('2026-10-08T09:00:05'), at('2026-10-09T16:00:00'))).toBe(null)      // 7시간 지났다 — 창 밖
    expect(missedSince('0 9 * * *', at('2026-10-09T09:00:03'), at('2026-10-09T10:00:00'))).toBe(null)      // 이미 돌았다
    expect(missedSince('없는 식', 0, Date.now())).toBe(null)
    expect(CATCHUP_WINDOW_MS).toBe(6 * H)
  })
  it('처음 보는 루틴은 기준선만 · 기록이 있으면 보충 · catchup:false·꺼진 루틴은 안 한다 · 기록은 파일에 남는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-catch-'))
    const ran: string[] = []
    const mk = () => { const r = new Routines({ run: (b, x, why) => { ran.push(`${x.name}:${why?.catchup ? 'catchup' : ''}`) }, log: () => {} }); r.file = join(dir, 'routine-runs.json'); return r }
    const bot = { id: 'b', name: 'b', routines: [{ name: 'a', cron: '0 9 * * *', prompt: 'p' }, { name: 'no', cron: '0 9 * * *', prompt: 'p', catchup: false }, { name: 'off', cron: '0 9 * * *', prompt: 'p', enabled: false }] } as unknown as Bot
    const now = new Date('2026-10-09T10:00:00').getTime()
    expect(mk().catchUp([bot], now)).toEqual([])                          // 처음 — 기준선만
    const r2 = mk(); r2.markRun('b', 'a', new Date('2026-10-08T09:00:00').getTime()); r2.markRun('b', 'no', new Date('2026-10-08T09:00:00').getTime())
    expect(mk().catchUp([bot], now)).toEqual(['b::a'])                    // 다른 인스턴스(= 다시 켠 호스트)가 파일로 안다
    expect(ran).toEqual(['a:catchup'])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('연결 설정 R2 칸 — wake · expect_every · fallback_notify', () => {
  it('wake: true 면 ~/.config/secrets/folderbot-bridge-<id>.env · 기간은 m·h·숫자(분)', () => {
    const c = parseBridges('bridges:\n  - id: halili\n    mailbox: m\n    wake: true\n    expect_every: 150m\n    fallback_notify: { command: "/bin/echo" }\n  - id: b\n    mailbox: m\n    wake: { env: /x/y.env }\n    expect_every: nope\n')
    expect(c.peers[0]).toMatchObject({ wake: { env: '~/.config/secrets/folderbot-bridge-halili.env' }, expectEveryMs: 150 * 60_000, fallbackNotify: '/bin/echo' })
    expect(c.peers[1].wake).toEqual({ env: '/x/y.env' })
    expect(c.errors.join()).toMatch(/expect_every/)
    expect([parseDuration('2h'), parseDuration(90), parseDuration('30분'), parseDuration('x')]).toEqual([2 * H, 90 * 60_000, 30 * 60_000, null])
  })
  it('편지 울타리에 routine_run 도 막힌다(propose)', () => { expect(channelSpawn('propose').disallowed).toContain('mcp__folderbot__routine_run') })
})

describe('BQ-8 · 깨우기 웹훅 (host/wake)', () => {
  it('🔴 키 파일 권한이 0600 보다 넓으면 쓰지 않는다 · URL 없으면 거절 · 따옴표 벗김', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-wake-')); const f = join(dir, 'w.env')
    writeFileSync(f, 'URL=https://example.test/hook\nTOKEN="abc"\n'); chmodSync(f, 0o644)
    expect(() => readWakeEnv(f)).toThrow(/0600/)
    chmodSync(f, 0o600)
    expect(readWakeEnv(f)).toEqual({ url: 'https://example.test/hook', token: 'abc' })
    writeFileSync(f, '# 주석\nTOKEN=x\n'); chmodSync(f, 0o600)
    expect(() => readWakeEnv(f)).toThrow(/URL/)
    expect(() => readWakeEnv(join(dir, 'none.env'))).toThrow(/없어요/)
    rmSync(dir, { recursive: true, force: true })
  })
  it('본문 없이 {id,kind,path} 만 · Bearer 또는 지정 헤더 · 실패해도 던지지 않는다', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const ok = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return { ok: true, status: 202 } }) as unknown as typeof fetch
    expect(await wakePeer({ url: 'https://h/x', token: 't1' }, { id: 'i', kind: 'incident', path: 'p' }, ok)).toEqual({ ok: true, status: 202 })
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer t1')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: 'i', kind: 'incident', path: 'p' })
    await wakePeer({ url: 'https://h/x', token: 't2', header: 'X-Api-Key' }, {}, ok)
    expect((calls[1].init.headers as Record<string, string>)['X-Api-Key']).toBe('t2')
    const bad = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    expect(await wakePeer({ url: 'https://h/x' }, {}, bad)).toEqual({ ok: false, error: 'ECONNRESET' })
  })
})

function hub(yml: string, deps: Partial<ConstructorParameters<typeof BridgeHub>[0]> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fb-br2-')), data = mkdtempSync(join(tmpdir(), 'fb-br2d-'))
  mkdirSync(join(root, '싱크/to-folderbot'), { recursive: true }); mkdirSync(join(root, '.claude'), { recursive: true })
  writeFileSync(join(root, '.claude/bridges.yml'), yml)
  const h = new BridgeHub({ root, dataDir: data, hostNames: () => ['mac-mini'], log: () => {}, deliver: () => 's', ...deps })
  return { root, h, done: () => { h.closeAll(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }) } }
}

describe('BQ-8 · bridge_send 가 급한 편지면 깨운다 · 상대 끊김/회복', () => {
  it('urgent 이고 wake 가 있을 때만 깨운다(본문 없이)', () => {
    const wake = vi.fn()
    const f = hub('bridges:\n  - id: halili\n    mailbox: 싱크\n    wake: true\n', { wake })
    try {
      f.h.reload()
      f.h.send('halili', 'orch', { kind: 'report', text: '보통' })
      expect(wake).not.toHaveBeenCalled()
      const s = f.h.send('halili', 'orch', { kind: 'incident', text: '장애', urgent: true, needsHuman: true })
      expect(wake).toHaveBeenCalledTimes(1)
      expect(wake.mock.calls[0][1]).toEqual({ id: s.id, kind: 'incident', path: s.rel, urgent: true, needs_human: true })
    } finally { f.done() }
  })
  it('🔴 expect_every 넘게 조용하면 한 번만 «끊김», 상대 커서가 갱신되면 한 번 «회복»', () => {
    let t = Date.now()
    const stale = vi.fn(), alive = vi.fn()
    const f = hub('bridges:\n  - id: halili\n    mailbox: 싱크\n    expect_every: 150m\n', { onStale: stale, onAlive: alive, now: () => t })
    try {
      f.h.reload()
      expect(stale).not.toHaveBeenCalled()                                 // 켜자마자 울리지 않는다(연 시각 기준)
      t += 151 * 60_000; f.h.scanNow(); f.h.scanNow()
      expect(stale).toHaveBeenCalledTimes(1)
      mkdirSync(join(f.root, '싱크/cursors/halili'), { recursive: true })
      const c = join(f.root, '싱크/cursors/halili/20261009-120000.json'); writeFileSync(c, '{}'); utimesSync(c, new Date(t), new Date(t))   // 덮어쓰기 못 하는 상대 — 새 파일
      f.h.scanNow(); f.h.scanNow()
      expect(alive).toHaveBeenCalledTimes(1)
    } finally { f.done() }
  })
})

describe('BU · orch_report (MCP)', () => {
  const orch = { id: 'orch', name: '오케스트레이터', orchestrator: true, routines: [] }
  const cfo = { id: 'b_cfo', name: '재무_CFO', rel: '3. Area/재무_CFO', routines: [{ name: '월말', cron: '0 9 1 * *', prompt: 'p' }] }
  const call = async (host: unknown, botId: string, sid: string, name: string, args: Record<string, unknown>) => {
    let out = ''; const res = { writeHead: () => res, end: (b: string) => { out = b } } as never
    await handleMcp(host as never, botId, {} as never, res, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), sid)
    const j = JSON.parse(out); return { text: j.result?.content?.[0]?.text ?? j.error?.message ?? '', isError: !!j.result?.isError || !!j.error }
  }
  it('폴더 봇이 남기면 호스트가 받는다 · 오케스트레이터는 못 쓴다 · 시간당 20건 · routine_run 은 제 폴더 루틴만', async () => {
    resetOrchAskForTest()
    const orchReport = vi.fn(() => 'held'), runRoutine = vi.fn(() => 's_rt')
    const host = { version: 't', registry: { bot: (id: string) => [orch, cfo].find((b) => b.id === id), bots: () => [orch, cfo] }, sessions: { get: () => ({}) }, orchReport, runRoutine }
    expect(mcpTools('b_cfo').map((t) => t.name)).toEqual(expect.arrayContaining(['orch_report', 'routine_run']))
    const r = await call(host, 'b_cfo', 's1', 'orch_report', { kind: 'done', text: '9월 계산서 발행 끝' })
    expect(r.isError).toBe(false); expect(r.text).toMatch(/5분 안에/)
    expect(orchReport).toHaveBeenCalledWith(cfo, 'done', '9월 계산서 발행 끝', false, 's1')
    expect((await call(host, 'orch', 's2', 'orch_report', { kind: 'done', text: 'x' })).isError).toBe(true)
    expect((await call(host, 'b_cfo', 's1', 'orch_report', { kind: 'gossip', text: 'x' })).isError).toBe(true)
    for (let i = 0; i < 19; i++) await call(host, 'b_cfo', 's1', 'orch_report', { kind: 'report', text: `${i}` })
    expect((await call(host, 'b_cfo', 's1', 'orch_report', { kind: 'report', text: '21번째' })).text).toMatch(/20건까지/)
    const rr = await call(host, 'b_cfo', 's1', 'routine_run', { name: '월말' })
    expect(rr.text).toMatch(/s_rt/); expect(runRoutine).toHaveBeenCalledWith(cfo, cfo.routines[0])
    expect((await call(host, 'b_cfo', 's1', 'routine_run', { name: '없음' })).isError).toBe(true)
  })
})

describe('BV-2 · 채널 갈아타기', () => {
  it('15만 토큰 또는 7일이면 갈아탄다', () => {
    const now = Date.now()
    expect(rotateReason({ ctx: { used: 160_000, window: 1_000_000 }, createdAt: now }, now)).toMatch(/160k/)
    expect(rotateReason({ ctx: { used: 10_000, window: 1_000_000 }, createdAt: now - ROTATE_AFTER_MS }, now)).toMatch(/7일/)
    expect(rotateReason({ ctx: { used: 10_000, window: 1_000_000 }, createdAt: now }, now)).toBe(null)
  })
  describe('SessionManager + 스텁 CLI', () => {
    let SessionManager: typeof import('../../src/host/session').SessionManager
    const bot = { id: 'orch', rel: '', abs: tmpdir(), name: '오케스트레이터', section: '', orchestrator: true, startedAt: 0, vendor: 'claude', routines: [] } as unknown as Bot
    beforeAll(async () => {
      process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-rot-'))
      process.env.FOLDERBOT_CLI_BIN = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
      ;({ SessionManager } = await import('../../src/host/session'))
    })
    it('🔴 인수인계를 한 턴 쓰고 → 같은 이름의 새 채널 → 그사이 온 편지는 새 채널로 옮겨 인수인계와 함께 나간다 · 옛 세션은 이름에 날짜', async () => {
      const sm = new SessionManager(); sm.botOf = () => bot
      const r = sm.channelOf(bot, 'halili', '✅ 할일이 채널', 'propose')
      sm.send(r, bot, '되읊어: 첫 편지', undefined, 'peer')
      expect(await until(() => r.state === 'done')).toBe(true)
      r.ctx = { used: 160_000, window: 1_000_000 }
      sm.afterTurn(r)
      expect(r.rotating).toBe(true)
      sm.enqueue(r, { text: '되읊어: 갈아타는 사이 온 편지', from: 'peer:halili', t: 1, origin: 'peer', letters: ['x1'] })
      expect(await until(() => !r.rotating && r.channel === undefined)).toBe(true)
      const nr = sm.channelOf(bot, 'halili', '✅ 할일이 채널', 'propose')
      expect(nr.id).not.toBe(r.id); expect(nr.name).toBe('✅ 할일이 채널'); expect(r.name).toMatch(/^✅ 할일이 채널 · ~\d+\/\d+$/)
      expect(await until(() => sm.items(nr.id).some((i) => i.kind === 'user'))).toBe(true)
      const first = (sm.items(nr.id).find((i) => i.kind === 'user') as { text: string }).text
      expect(first).toMatch(/^\[이전 채널 인수인계\]\n/); expect(first).toContain(`이전 채널 세션: ${r.id}`); expect(first).toContain('갈아타는 사이 온 편지')
      expect(nr.handover).toBeUndefined()
    }, 25000)
  })
})
