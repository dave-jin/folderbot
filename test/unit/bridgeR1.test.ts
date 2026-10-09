import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { formatLetter, frontMatterClosed, ignoredLetterName, letterBatch, letterId, monthOf, normId, parseLetter, wrapLetter, LETTER_INLINE_MAX } from '../../src/core/fbmf'
import { channelSpawn, ownsPeer, parseBridges, type PeerDef } from '../../src/core/bridges'
import { routineResult } from '../../src/core/runs'
import { BridgeHub, STABLE_MS, type Incoming } from '../../src/host/bridge'
import { RunLog } from '../../src/host/runs'
import type { Bot } from '../../src/core/types'

/**
 * 연결(Bridge) R1 (2026-10-09 Dave 승인) — 바깥 상대와 편지 파일로 대화한다.
 * 설계 · 검토: PARA/2. Area/제품_FolderBot/01_기획/2026-10-09_기획_외부-에이전트-연결-Bridge.md · …_검토_연결-Bridge.md
 */
const until = async (f: () => boolean, ms = 12000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 50)) } return true }

describe('FBMF — 편지 읽기·쓰기 (core/fbmf)', () => {
  it('id 는 ASCII 이고 달 폴더가 id 에서 나온다', () => {
    const id = letterId(new Date(2026, 9, 9, 17, 15, 0), 'Orch', 'A3F9')
    expect(id).toBe('20261009-171500-orch-a3f9')
    expect(monthOf(id)).toBe('2026-10')
    expect(letterId(new Date(2026, 0, 2, 3, 4, 5), '할일이', '01')).toMatch(/^20260102-030405-x-0100$/)   // 한글 보낸쪽은 ASCII 로 못 바꾸면 x
  })
  it('쓰고 읽으면 같다 · 한글 제목은 title 로 · 콜론이 든 제목도 깨지지 않는다', () => {
    const l = { id: '20261009-171500-orch-a3f9', from: 'orch', to: 'halili', kind: 'reply' as const, title: '카톡 sync: 원인 확인', re: '20261009-140000-halili-1b2c', urgent: true, needsHuman: false, created: '2026-10-09T17:15:00+09:00', body: '본문\n둘째 줄' }
    const back = parseLetter(formatLetter(l), { id: l.id, from: 'x' })
    expect(back).toMatchObject({ ...l })
    expect(back.malformed).toBeUndefined()
  })
  it('머리말 없는 편지도 받는다 — request · 형식 없음', () => {
    const l = parseLetter('그냥 메모입니다', { id: '메모', from: 'halili' })
    expect(l).toMatchObject({ kind: 'request', from: 'halili', body: '그냥 메모입니다', malformed: true })
  })
  it('🔴 id·re 비교는 NFC — 맥 파일 이름(NFD)과 상대가 쓴 re(NFC)가 짝이 맞는다', () => {
    const nfd = '20261009-171500-halili-메모'.normalize('NFD')
    expect(normId(nfd)).toBe('20261009-171500-halili-메모'.normalize('NFC'))
    expect(parseLetter(`---\nfbmf: 1\nre: ${nfd}\n---\nx`, { id: nfd, from: 'h' }).re).toBe(normId(nfd))
  })
  it('숨김·임시·충돌 사본·README·마크다운 아닌 것은 편지가 아니다', () => {
    for (const n of ['.x.md', '.20261009-1.md.123.tmp', 'a.md.tmp-1-2', 'a (conflicted copy 2026-10-09).md', 'a (충돌된 사본).md', 'README.md', 'pic.png', '~a.md', 'a.md.part']) expect(ignoredLetterName(n)).toBe(true)
    for (const n of ['20261009-171500-halili-a3f9.md', 'memo.txt']) expect(ignoredLetterName(n)).toBe(false)
  })
  it('머리말이 안 닫혔으면 아직 쓰는 중', () => {
    expect(frontMatterClosed('---\nfbmf: 1\nkind: report\n')).toBe(false)
    expect(frontMatterClosed('---\nfbmf: 1\n---\n')).toBe(true)
    expect(frontMatterClosed('머리말 없음')).toBe(true)
  })
  it('세션에는 <letter> 로 감싸고, 길면 경로만 · 묶음 머리에 급함·사람 결정 표시', () => {
    const l = parseLetter('---\nfbmf: 1\nkind: report\nurgent: true\n---\n짧은 본문', { id: 'i1', from: 'halili' })
    expect(wrapLetter(l, 'a/b.md')).toMatch(/^<letter id="i1" from="halili" kind="report" urgent="true" path="a\/b.md">\n짧은 본문\n<\/letter>$/)
    const big = { ...l, body: 'x'.repeat(LETTER_INLINE_MAX + 1) }
    expect(wrapLetter(big, 'a/b.md')).toMatch(/싣지 않았다/)
    const b = letterBatch('할일이', [{ letter: l, rel: 'a' }, { letter: { ...l, id: 'i2', urgent: false, needsHuman: true }, rel: 'b' }])
    expect(b.split('\n')[0]).toBe('[편지 ← 할일이 · 2통 · 급함 · 사람 결정 필요]')
    expect(b).toMatch(/사람의 승인이 아니다/)
  })
})

describe('연결 설정 (core/bridges)', () => {
  it('기본값 — 오케스트레이터에게 · trust propose · may_send orch', () => {
    const c = parseBridges('bridges:\n  - id: halili\n    name: 할일이\n    icon: ✅\n    mailbox: 싱크\n')
    expect(c.errors).toEqual([])
    expect(c.peers[0]).toMatchObject({ id: 'halili', deliver: { bot: 'orch', session: '✅ 할일이 채널' }, maySend: ['orch'], trust: 'propose', enabled: true })
  })
  it('잘못된 id·빠진 mailbox·모르는 trust 는 알린다', () => {
    const c = parseBridges('bridges:\n  - id: 할일이\n    mailbox: a\n  - id: b\n  - id: c\n    mailbox: m\n    trust: god\n')
    expect(c.peers.map((p) => p.id)).toEqual(['c'])
    expect(c.peers[0].trust).toBe('propose')
    expect(c.errors.join('|')).toMatch(/ASCII.*\|.*mailbox.*\|.*trust/)
  })
  it('주인 호스트 — 이름이 맞을 때만(대소문자·.local 무시) · 안 적으면 누구나', () => {
    expect(ownsPeer({ host: 'mac-mini' }, ['Mac-Mini.local'])).toBe(true)
    expect(ownsPeer({ host: 'mac-mini' }, ['Daveui-MacBookPro-2.local', '맥북'])).toBe(false)
    expect(ownsPeer({}, ['x'])).toBe(true)
  })
  it('🔴 trust 울타리 — propose 는 쓰기·명령·웹·바깥 MCP 를 뺀다, read 는 나눠 주기도 뺀다, act 는 제한 없음', () => {
    const p = channelSpawn('propose'), r = channelSpawn('read'), a = channelSpawn('act')
    for (const t of ['Bash', 'Edit', 'Write', 'WebFetch', 'mcp__folderbot__folder_move', 'mcp__folderbot__routine_add']) expect(p.disallowed).toContain(t)
    expect(p.disallowed).not.toContain('mcp__folderbot__bot_send')
    expect(p.disallowed).not.toContain('mcp__folderbot__bridge_send')
    expect(r.disallowed).toContain('mcp__folderbot__bot_send')
    expect(r.disallowed).not.toContain('mcp__folderbot__bridge_send')
    expect([p.strictMcp, p.permissionMode]).toEqual([true, 'default'])
    expect(a).toEqual({ permissionMode: 'bypassPermissions', strictMcp: false, disallowed: [] })
  })
})

describe('결과 줄 (core/runs)', () => {
  it('마지막 줄의 결과: ok|fail|skip 을 읽고, 없으면 unknown', () => {
    expect(routineResult('정리했어요.\n\n**결과: ok**')).toEqual({ result: 'ok' })
    expect(routineResult('…\n결과: fail — 카톡 로그인 없음')).toEqual({ result: 'fail', reason: '카톡 로그인 없음' })
    expect(routineResult('결과：skip - 변화 없음')).toEqual({ result: 'skip', reason: '변화 없음' })
    expect(routineResult('다 했어요')).toEqual({ result: 'unknown' })
    expect(routineResult(undefined)).toEqual({ result: 'unknown' })
  })
})

function hubFixture(opts: { peer?: Record<string, unknown>; deliver?: (p: PeerDef, items: Incoming[]) => string | null; host?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fb-br-')), data = mkdtempSync(join(tmpdir(), 'fb-brd-'))
  const mb = join(root, '싱크'); mkdirSync(join(mb, 'to-folderbot', '2026-10'), { recursive: true }); mkdirSync(join(root, '.claude'), { recursive: true })
  const extra = Object.entries(opts.peer ?? {}).map(([k, v]) => `    ${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`).join('\n')
  writeFileSync(join(root, '.claude/bridges.yml'), `bridges:\n  - id: halili\n    name: 할일이\n    icon: ✅\n    mailbox: 싱크\n${extra ? extra + '\n' : ''}`)
  const got: Incoming[][] = []
  const logs: string[] = []
  const hub = new BridgeHub({ root, dataDir: data, hostNames: () => [opts.host ?? 'mac-mini'], log: (m) => logs.push(m), deliver: opts.deliver ?? ((_p, items) => { got.push(items); return 's_chan' }) })
  const inbox = (name: string, text: string, month = '2026-10') => { mkdirSync(join(mb, 'to-folderbot', month), { recursive: true }); writeFileSync(join(mb, 'to-folderbot', month, name), text) }
  return { root, data, mb, hub, got, logs, inbox, done: () => { hub.closeAll(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }) } }
}
const letter = (id: string, extra = '') => `---\nfbmf: 1\nid: ${id}\nfrom: halili\nto: orch\nkind: request\n${extra}---\n${id} 부탁\n`

describe('BridgeHub — 들어오는 편지 (host/bridge)', () => {
  it('🔴 처음 켤 때 이미 있던 편지는 넣지 않고, 그 뒤에 온 편지만 넣는다 · 숨김·임시는 안 넣는다 · 커서가 넘어간다', async () => {
    const f = hubFixture()
    try {
      f.inbox('20261009-100000-halili-0001.md', letter('20261009-100000-halili-0001'))
      f.hub.reload()
      expect(f.got).toHaveLength(0)
      f.inbox('20261009-110000-halili-0002.md', letter('20261009-110000-halili-0002', 'urgent: true\n'))
      f.inbox('.20261009-110001-halili-0003.md.9.tmp', letter('x'))
      f.inbox('20261009-110002-halili-0004.md.tmp-1-2', letter('y'))
      expect(await until(() => f.got.length === 1, STABLE_MS + 8000)).toBe(true)
      expect(f.got[0].map((x) => x.letter.id)).toEqual(['20261009-110000-halili-0002'])
      expect(f.got[0][0].letter.urgent).toBe(true)
      const cur = JSON.parse(readFileSync(join(f.mb, 'cursors/folderbot.json'), 'utf8'))
      expect(cur.last).toBe('20261009-110000-halili-0002'); expect(cur.at).toMatch(/^\d{4}-\d\d-\d\dT/)
    } finally { f.done() }
  }, 20000)
  it('🔴 다시 켜도 두 번 넣지 않고, 꺼진 동안 온 편지는 켜질 때 넣는다 — 배달 기록은 dataDir', async () => {
    const f = hubFixture()
    try {
      f.hub.reload()
      f.inbox('20261009-120000-halili-0005.md', letter('20261009-120000-halili-0005'))
      expect(await until(() => f.got.length === 1, STABLE_MS + 8000)).toBe(true)
      expect(existsSync(join(f.data, 'bridges/halili/delivered.jsonl'))).toBe(true)
      f.hub.closeAll()
      f.inbox('20261009-120500-halili-0009.md', letter('20261009-120500-halili-0009'))   // 꺼진 동안 온 편지
      const got2: Incoming[][] = []
      const hub2 = new BridgeHub({ root: f.root, dataDir: f.data, hostNames: () => ['mac-mini'], log: () => {}, deliver: (_p, items) => { got2.push(items); return 's' } })
      hub2.reload(); hub2.scanNow()
      await new Promise((r) => setTimeout(r, STABLE_MS + 800)); hub2.scanNow()
      expect(got2.flat().map((x) => x.letter.id)).toEqual(['20261009-120500-halili-0009'])   // 켜질 때 들어가고, 이미 넣은 0005 는 다시 안 들어간다
      hub2.closeAll()
    } finally { f.done() }
  }, 20000)
  it('넣을 곳이 없으면(null) 기록하지 않고 다음에 다시 넣는다', async () => {
    let ready = false; const got: string[] = []
    const f = hubFixture({ deliver: (_p, items) => { if (!ready) return null; got.push(...items.map((x) => x.letter.id)); return 's' } })
    try {
      f.hub.reload()
      f.inbox('20261009-130000-halili-0006.md', letter('20261009-130000-halili-0006'))
      await new Promise((r) => setTimeout(r, STABLE_MS + 1500))
      expect(got).toEqual([])
      ready = true; f.hub.scanNow()
      expect(await until(() => got.length === 1, 3000)).toBe(true)
    } finally { f.done() }
  }, 20000)
  it('since 가 있으면 처음 켤 때도 그 뒤에 쓰인 편지는 넣는다', async () => {
    const f = hubFixture({ peer: { since: '2026-10-09T00:00:00+09:00' } })
    try {
      f.inbox('20261001-100000-halili-0007.md', letter('20261001-100000-halili-0007'))
      const old = new Date('2026-10-01T00:00:00Z'); utimesSync(join(f.mb, 'to-folderbot/2026-10/20261001-100000-halili-0007.md'), old, old)
      f.inbox('20261009-140000-halili-0008.md', letter('20261009-140000-halili-0008'))
      f.hub.reload()
      expect(await until(() => f.got.length >= 1, STABLE_MS + 8000)).toBe(true)
      expect(f.got.flat().map((x) => x.letter.id)).toEqual(['20261009-140000-halili-0008'])
    } finally { f.done() }
  }, 20000)
  it('🔴 주인 호스트가 아니면 가져가지 않는다(두 맥이 같은 볼트를 열어도 한 번만)', () => {
    const f = hubFixture({ peer: { host: 'mac-mini' }, host: 'Daveui-MacBookPro-2.local' })
    try {
      f.hub.reload()
      expect(f.hub.status()[0]).toMatchObject({ id: 'halili', owner: false })
      expect(existsSync(join(f.data, 'bridges/halili/delivered.jsonl'))).toBe(false)
      expect(f.logs.join('\n')).toMatch(/mac-mini 호스트가 가져가요/)
    } finally { f.done() }
  })
})

describe('BridgeHub.send — 나가는 편지 (bridge_send)', () => {
  it('from-folderbot/<달>/<id>.md 에 FBMF 로 · 같은 초에 두 번이어도 덮지 않는다 · 임시 파일이 안 남는다', () => {
    const f = hubFixture()
    try {
      f.hub.reload()
      const a = f.hub.send('halili', 'orch', { kind: 'reply', title: '답: 카톡', text: '확인했어요', re: '20261009-110000-halili-0002' })
      const b = f.hub.send('halili', 'orch', { kind: 'report', text: '둘째' })
      expect(a.id).toMatch(/^\d{8}-\d{6}-orch-[0-9a-f]{4}$/); expect(a.id).not.toBe(b.id)
      const dir = join(f.mb, 'from-folderbot', monthOf(a.id))
      expect(readdirSync(dir).sort()).toEqual([`${a.id}.md`, `${b.id}.md`].sort())
      const back = parseLetter(readFileSync(join(dir, `${a.id}.md`), 'utf8'), { id: a.id, from: '?' })
      expect(back).toMatchObject({ id: a.id, from: 'orch', to: 'halili', kind: 'reply', title: '답: 카톡', re: '20261009-110000-halili-0002', urgent: false, needsHuman: false, body: '확인했어요' })
      expect(back.malformed).toBeUndefined()
      expect(a.rel).toBe(`싱크/from-folderbot/${monthOf(a.id)}/${a.id}.md`)
    } finally { f.done() }
  })
  it('may_send 에 없는 봇·모르는 상대·heartbeat·빈 본문은 거절', () => {
    const f = hubFixture()
    try {
      f.hub.reload()
      expect(() => f.hub.send('halili', 'b_cfo', { kind: 'report', text: 'x' })).toThrow(/may_send/)
      expect(() => f.hub.send('nobody', 'orch', { kind: 'report', text: 'x' })).toThrow(/그런 연결이 없어요/)
      expect(() => f.hub.send('halili', 'orch', { kind: 'heartbeat', text: 'x' })).toThrow(/kind/)
      expect(() => f.hub.send('halili', 'orch', { kind: 'report', text: '  ' })).toThrow(/비었어요/)
    } finally { f.done() }
  })
})

describe('BR-1 · 루틴 실행 기록 (host/runs)', () => {
  it('start · end(결과 줄) · timeout 을 볼트와 사본 둘 다에 적는다 · 이 호스트가 시작한 회차만', () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-runs-'))
    let t = Date.parse('2026-10-09T10:00:00+09:00')
    const rl = new RunLog(root, () => '운영/runs', () => 'mac-mini', () => {}, () => t)
    rl.start('s1', 'orch', '오케스트레이터', '정기동기화')
    t += 5000; rl.end('s1', true, '했어요\n결과: fail — 카톡 끊김')
    rl.end('s1', true, '결과: ok')                                  // 두 번째 끝은 안 적는다
    rl.end('s_other', true, '결과: ok')                             // 이 호스트가 시작 안 한 회차
    rl.start('s2', 'b1', 'b1', '느린 루틴'); t += 61 * 60_000; rl.sweep(); rl.sweep()
    const month = '2026-10'
    const main = readFileSync(join(root, `.folderbot/ops/runs-${month}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    const copy = readFileSync(join(root, `운영/runs/folderbot-${month}.jsonl`), 'utf8').trim().split('\n')
    expect(main.map((e) => `${e.event}:${e.run}`)).toEqual(['start:s1', 'end:s1', 'start:s2', 'timeout:s2'])
    expect(main[1]).toMatchObject({ ok: false, result: 'fail', reason: '카톡 끊김', ms: 5000, host: 'mac-mini', routine: '정기동기화' })
    expect(copy).toHaveLength(4)
    rmSync(root, { recursive: true, force: true })
  })
})

/** 채널 세션 — SessionManager + 스텁 CLI. 워커 인자를 보려고 스텁 앞에 인자 기록기를 둔다 */
describe('채널 세션 · 급한 편지 · 묶음 배달 · trust 울타리 (SessionManager)', () => {
  let SessionManager: typeof import('../../src/host/session').SessionManager
  let argLog = ''
  const bot = { id: 'orch', rel: '', abs: tmpdir(), name: '오케스트레이터', section: '', orchestrator: true, startedAt: 0, vendor: 'claude', routines: [] } as unknown as Bot
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-chan-'))
    argLog = join(dir, 'args.log')
    const wrap = join(dir, 'claude-wrap.mjs')
    writeFileSync(wrap, `#!/usr/bin/env node\nimport { appendFileSync } from 'node:fs'\nappendFileSync(${JSON.stringify(argLog)}, JSON.stringify(process.argv.slice(2)) + '\\n')\nawait import(${JSON.stringify(join(process.cwd(), 'test/fixtures/stub-claude.mjs'))})\n`, { mode: 0o755 })
    process.env.FOLDERBOT_DATA = dir
    process.env.FOLDERBOT_CLI_BIN = wrap
    ;({ SessionManager } = await import('../../src/host/session'))
  })
  const users = (sm: InstanceType<typeof SessionManager>, id: string) => sm.items(id).filter((i) => i.kind === 'user').map((i) => (i as { text: string }).text)

  it('상대마다 채널 하나 · 이름 고정 · trust 가 바뀌면 기록이 따라간다', () => {
    const sm = new SessionManager(); sm.botOf = () => bot
    const a = sm.channelOf(bot, 'halili', '✅ 할일이 채널', 'propose'), b = sm.channelOf(bot, 'halili', '다른 이름', 'propose')
    expect(a.id).toBe(b.id); expect(a).toMatchObject({ channel: 'halili', trust: 'propose', named: true, name: '✅ 할일이 채널', permissionMode: 'default' })
    expect(sm.channelOf(bot, 'other', 'x', 'read').id).not.toBe(a.id)
    sm.channelOf(bot, 'halili', '✅ 할일이 채널', 'act')
    expect(a).toMatchObject({ trust: 'act', permissionMode: 'bypassPermissions' })
    expect(sm.list(bot.id).find((x) => x.id === a.id)).toMatchObject({ channel: 'halili' })
  })
  it('🔴 급한 편지는 큐 맨 앞(앞선 급한 것 뒤) · 편지 묶음은 한 턴에 나간다 · 턴 출처는 peer', async () => {
    const sm = new SessionManager(); sm.botOf = () => bot
    const r = sm.channelOf(bot, 'halili', '✅ 할일이 채널', 'propose')
    expect(sm.sendFromBot(r, bot, { text: '느린일 먼저', from: 'peer:halili', t: 1, origin: 'peer', letters: ['a'] })).toBe('sent')
    sm.enqueue(r, { text: '되읊어: 보통1', from: 'peer:halili', t: 2, origin: 'peer', letters: ['b'] })
    sm.enqueue(r, { text: '되읊어: 급함1', from: 'peer:halili', t: 3, origin: 'peer', letters: ['c'], urgent: true })
    sm.enqueue(r, { text: '되읊어: 급함2', from: 'peer:halili', t: 4, origin: 'peer', letters: ['d'], urgent: true })
    expect(r.queue!.map((q) => q.text)).toEqual(['되읊어: 급함1', '되읊어: 급함2', '되읊어: 보통1'])
    expect(r.turnFrom).toBe('peer')
    expect(await until(() => users(sm, r.id).length === 2 && r.state === 'done', 15000)).toBe(true)
    expect(users(sm, r.id)[1]).toBe('되읊어: 급함1\n\n되읊어: 급함2\n\n되읊어: 보통1')   // 셋이 한 턴
    expect(r.turnFrom).toBe('peer')
  }, 20000)
  it('🔴 propose 채널의 워커는 default 모드 명시 · strict MCP · 쓰기·명령 도구를 뺀 채로 뜬다', async () => {
    const sm = new SessionManager(); sm.botOf = () => bot
    sm.mcpUrl = () => '/tmp/none.json'
    const r = sm.channelOf(bot, 'p2', '채널', 'propose')
    sm.send(r, bot, '되읊어: 안녕', undefined, 'peer')
    expect(await until(() => r.state === 'done', 8000)).toBe(true)
    const lines = readFileSync(argLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[])
    const args = lines[lines.length - 1]
    expect(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2)).toEqual(['--permission-mode', 'default'])
    expect(args).toContain('--strict-mcp-config')
    const dis = args[args.indexOf('--disallowedTools') + 1].split(' ')
    for (const t of ['Bash', 'Edit', 'Write', 'mcp__folderbot__folder_move']) expect(dis).toContain(t)
  }, 12000)
})
