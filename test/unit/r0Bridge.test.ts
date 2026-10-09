import { describe, it, expect, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import { Registry } from '../../src/host/registry'
import { handleMcp } from '../../src/host/mcp'
import { routineRun, approveToMode } from '../../src/host/routines'
import { isBotConfigChange } from '../../src/core/fileWatch'
import { turnBlock } from '../../src/core/turnGuard'
import { McpAuth, mcpGate, bearer } from '../../src/host/mcpAuth'
import { compactReason } from '../../src/core/compact'
import { FolderWatch } from '../../src/host/watch'

/**
 * R0 (2026-10-09 · 연결 설계 검토 §4) — 연결(Bridge) 앞에 먼저 닫는 버그 넷.
 * BK 루틴 저장 위치 · BS 루틴 문구·권한 · BT 로컬 MCP 인증 · BV-1 압축 절대값.
 */
function vault(): { root: string; reg: Registry } {
  const root = mkdtempSync(join(tmpdir(), 'fb-r0-'))
  writeFileSync(join(root, 'CLAUDE.md'), '')
  mkdirSync(join(root, '.claude'), { recursive: true })
  mkdirSync(join(root, '2. Projects/a'), { recursive: true })
  return { root, reg: new Registry(root) }
}
async function mcp(host: unknown, botId: string, sid: string, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  let out = ''
  const res = { writeHead: () => res, end: (b: string) => { out = b } } as never
  await handleMcp(host as never, botId, {} as never, res, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), sid)
  const j = JSON.parse(out)
  return { text: j.result?.content?.[0]?.text ?? j.error?.message ?? '', isError: !!j.result?.isError || !!j.error }
}

describe('BK · 오케스트레이터 루틴은 .claude/routines.yml 에 쓴다', () => {
  it('routine_add 를 세 번 부르면 셋 다 남고 루트 .bot.yml 은 안 생긴다 (BK-완료기준)', async () => {
    const { root, reg } = vault()
    writeFileSync(join(root, '.claude/routines.yml'), 'note: 사람이 적은 키\nroutines: []\n')
    const host = { version: 't', registry: reg, routines: { decorate: (_: string, r: unknown) => r }, afterBotsChanged: vi.fn(), sessions: { get: () => undefined } }
    for (const n of ['하나', '둘', '셋']) {
      const r = await mcp(host, 'orch', '', 'routine_add', { name: n, when: '매일 아침 9시', prompt: `${n} 확인` })
      expect(r.isError, r.text).toBe(false)
    }
    const y = parseYaml(readFileSync(join(root, '.claude/routines.yml'), 'utf8')) as { note: string; routines: { name: string }[] }
    expect(y.routines.map((r) => r.name)).toEqual(['하나', '둘', '셋'])
    expect(y.note).toBe('사람이 적은 키')                                  // 다른 키는 그대로
    expect(existsSync(join(root, '.bot.yml'))).toBe(false)               // 옛 코드는 여기에 썼다
    expect(reg.bot('orch')!.routines.map((r) => r.name)).toEqual(['하나', '둘', '셋'])
    const list = JSON.parse((await mcp(host, 'orch', '', 'routine_list', {})).text) as { name: string }[]
    expect(list.map((r) => r.name)).toEqual(['하나', '둘', '셋'])
    // 지우기·고치기도 같은 파일
    await mcp(host, 'orch', '', 'routine_remove', { name: '둘' })
    await mcp(host, 'orch', '', 'routine_update', { name: '셋', enabled: false })
    const y2 = parseYaml(readFileSync(join(root, '.claude/routines.yml'), 'utf8')) as { routines: { name: string; enabled?: boolean }[] }
    expect(y2.routines.map((r) => `${r.name}:${r.enabled ?? true}`)).toEqual(['하나:true', '셋:false'])
    rmSync(root, { recursive: true, force: true })
  })
  it('폴더 봇은 종전대로 .bot.yml', () => {
    const { root, reg } = vault()
    const b = reg.start('2. Projects/a')
    reg.saveRoutines(b, [{ name: 'x', cron: '0 9 * * *', prompt: 'p' }])
    expect((parseYaml(readFileSync(join(root, '2. Projects/a/.bot.yml'), 'utf8')) as { routines: unknown[] }).routines).toHaveLength(1)
    rmSync(root, { recursive: true, force: true })
  })
  it('routines.yml 을 못 읽으면 덮어쓰지 않고 던진다 · 반쯤 쓰인 파일을 읽어도 직전 목록을 쓴다', () => {
    const { root, reg } = vault()
    const f = join(root, '.claude/routines.yml')
    writeFileSync(f, 'routines:\n  - name: a\n    cron: "0 9 * * *"\n    prompt: p\n')
    expect(reg.bot('orch')!.routines).toHaveLength(1)
    writeFileSync(f, 'routines: [ {name: a')                              // Dropbox 가 반쯤 내려받은 순간
    expect(reg.bot('orch')!.routines).toHaveLength(1)                     // 0 으로 떨어지지 않는다
    expect(() => reg.saveRoutines({ orchestrator: true, abs: root }, [])).toThrow(/덮어쓰지 않았어요/)
    expect(readFileSync(f, 'utf8')).toBe('routines: [ {name: a')
    rmSync(root, { recursive: true, force: true })
  })
  it('BK-2 · .claude/routines.yml 이 바뀌면 «설정 바뀜» 신호', () => {
    expect(isBotConfigChange('.claude/routines.yml')).toBe(true)
    expect(isBotConfigChange('.bot.yml')).toBe(true)
    expect(isBotConfigChange('.claude/skills/routines.yml')).toBe(false)
    expect(isBotConfigChange('2. Projects/a/.claude/routines.yml')).toBe(false)
  })
})

describe('BS · 루틴 문구와 권한 모드는 같은 값에서', () => {
  it('approve 를 안 적으면 bypass 이고, 문구도 「제안만 하라」 가 아니다', () => {
    const r = routineRun({ name: 'n', prompt: 'p' })
    expect(r.mode).toBe('bypassPermissions')
    expect(r.text).not.toMatch(/파일을 고치지 말고 제안만/)
  })
  it('readonly 면 plan + 「제안만」, folder 면 acceptEdits + 「이 폴더 안」', () => {
    expect(routineRun({ name: 'n', prompt: 'p', approve: 'readonly' })).toMatchObject({ mode: 'plan', text: expect.stringMatching(/제안만 하고/) })
    expect(routineRun({ name: 'n', prompt: 'p', approve: 'folder' })).toMatchObject({ mode: 'acceptEdits', text: expect.stringMatching(/이 폴더 안 파일만/) })
    expect(approveToMode(undefined)).toBe(routineRun({ name: 'n', prompt: 'p' }).mode)
  })
  it('사람이 아닌 턴에서는 folder_move·folder_create·bot_retire 를 거절한다', () => {
    for (const from of ['routine', 'bot', 'peer'] as const) for (const t of ['folder_move', 'folder_create', 'bot_retire']) expect(turnBlock(t, from)).toMatch(/사람이 시킨 턴/)
    expect(turnBlock('folder_move', 'human')).toBe(null)
    expect(turnBlock('folder_move', undefined)).toBe(null)               // 출처 모름(옛 세션) = 종전 동작
    expect(turnBlock('bot_send', 'routine')).toBe(null)
  })
  it('MCP 에서 실제로 막힌다 — 루틴 턴의 folder_move 는 reg.move 를 부르지 않는다', async () => {
    const move = vi.fn()
    const recs: Record<string, { turnFrom?: string }> = { s_rt: { turnFrom: 'routine' }, s_me: { turnFrom: 'human' } }
    const host = { version: 't', registry: { move, bots: () => [] }, sessions: { get: (id: string) => recs[id] }, afterBotsChanged: vi.fn() }
    const blocked = await mcp(host, 'orch', 's_rt', 'folder_move', { from: 'a', to: 'b' })
    expect(blocked.isError).toBe(true); expect(blocked.text).toMatch(/예약된 루틴/); expect(move).not.toHaveBeenCalled()
    const ok = await mcp(host, 'orch', 's_me', 'folder_move', { from: 'a', to: 'b' })
    expect(ok.isError).toBe(false); expect(move).toHaveBeenCalledWith('a', 'b')
  })
})

describe('BT · 로컬 MCP 인증', () => {
  it('토큰은 봇·세션마다 다르고, 다시 만들어도 같다(재시작·잠든 세션 깨우기)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-mcpk-'))
    const a = new McpAuth(dir), b = new McpAuth(dir)
    expect(a.token('orch', 's1')).toBe(b.token('orch', 's1'))
    expect(a.token('orch', 's1')).not.toBe(a.token('orch', 's2'))
    expect(a.token('orch', 's1')).not.toBe(a.token('b_x', 's1'))
    expect(a.check('orch', 's1', a.token('orch', 's1'))).toBe(true)
    expect(a.check('orch', 's2', a.token('orch', 's1'))).toBe(false)      // 남의 세션 토큰으로는 못 들어온다
    expect(a.check('orch', 's1', '')).toBe(false)
    expect(statSync(join(dir, 'mcp.key')).mode & 0o777).toBe(0o600)
    rmSync(dir, { recursive: true, force: true })
  })
  it('워커에 넘기는 설정은 0600 파일이고 Authorization 헤더가 들어 있다(argv 에 토큰이 없다)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-mcpk-'))
    const a = new McpAuth(dir)
    const f = a.configFile('orch', 's_1', 7373)
    expect(f.startsWith(dir)).toBe(true)
    expect(statSync(f).mode & 0o777).toBe(0o600)
    const j = JSON.parse(readFileSync(f, 'utf8'))
    expect(j.mcpServers.folderbot).toEqual({ type: 'http', url: 'http://127.0.0.1:7373/mcp/orch?sid=s_1', headers: { Authorization: `Bearer ${a.token('orch', 's_1')}` } })
    rmSync(dir, { recursive: true, force: true })
  })
  it('브라우저(Origin) · JSON 아닌 본문은 문 앞에서 거절', () => {
    expect(mcpGate({ origin: 'https://evil.example', 'content-type': 'application/json' })?.code).toBe(403)
    expect(mcpGate({ 'content-type': 'text/plain' })?.code).toBe(415)
    expect(mcpGate({})?.code).toBe(415)
    expect(mcpGate({ 'content-type': 'application/json; charset=utf-8' })).toBe(null)
    expect(bearer({ authorization: 'Bearer abc' })).toBe('abc')
    expect(bearer({ authorization: 'Basic abc' })).toBe('')
  })
})

describe('BV-1 · 압축 절대값 15만 토큰', () => {
  it('1M 창에서 16만이면 압축, 10만이면 아니다 · 70% 규칙은 그대로', () => {
    const now = Date.now()
    expect(compactReason({ ctx: { used: 160_000, window: 1_000_000 }, lastActivity: now }, 'after', now)).toMatch(/160k 토큰/)
    expect(compactReason({ ctx: { used: 100_000, window: 1_000_000 }, lastActivity: now }, 'after', now)).toBe(null)
    expect(compactReason({ ctx: { used: 140, window: 200 }, lastActivity: now }, 'after', now)).toBe('컨텍스트 70%')
    expect(compactReason({ vendor: 'codex', ctx: { used: 900_000, window: 1_000_000 }, lastActivity: now }, 'after', now)).toBe(null)
  })
})

describe('감시가 오류로 끊기면 다시 건다 (10/9 검토 §2-③)', () => {
  it('error 뒤 retryMs 가 지나면 같은 폴더를 다시 감시한다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-wretry-'))
    const w = new FolderWatch(() => {})
    w.retryMs = 50
    w.sync([{ id: 'r', abs: root }])
    const ws = (w as unknown as { ws: Map<string, { w: { emit: (e: string, x: Error) => void } }> }).ws
    const first = ws.get('r')!
    first.w.emit('error', new Error('boom'))
    expect(ws.has('r')).toBe(false)
    await new Promise((r) => setTimeout(r, 200))
    expect(ws.has('r')).toBe(true)
    expect(ws.get('r')).not.toBe(first)
    w.close(); rmSync(root, { recursive: true, force: true })
  })
})
