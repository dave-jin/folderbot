import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { formatLetter, letterBatch, parseLetter } from '../../src/core/fbmf'
import { askPatternHits, askTarget, parseBridges, wakeMail, type AskBot } from '../../src/core/bridges'
import { ASK_CARD, ASK_CARD_LINES, ASK_EXIT, ASK_TIMEOUT_DEFAULT, ASK_TIMEOUT_MAX, askKind, askTimeoutSec, exitOf, firstLine, lastAskId, parseAskArgs, peerOfId } from '../../src/core/askCli'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ask } from '../../src/host/index'
import { AskDesk, answerAfter } from '../../src/host/ask'
import { BridgeHub, type Incoming } from '../../src/host/bridge'
import { mailWake, resetMailWakeForTest, MAIL_GAP_MS } from '../../src/host/wake'

/**
 * DA · `folderbot ask` (2026-10-24 Dave «claude -p 처럼 · 범용 CLI · 폴더 봇 직접 · 시키기까지 · 긴급 메일은 자동»).
 * 설계 PARA/2. Area/제품_FolderBot/01_기획/2026-10-24_기획_folderbot-ask-바깥-에이전트-실시간-대화.md(2판)
 */
const BOTS: AskBot[] = [
  { id: 'orch', name: '오케스트레이터', rel: '', orchestrator: true },
  { id: 'b_fb', name: '제품_FolderBot', rel: '2. Area/제품_FolderBot' },
  { id: 'b_sns', name: '사업_SNS', rel: '2. Area/사업_SNS' },
  { id: 'b_p', name: '2026-11_강의-AI', rel: '1. Projects/2026-11_강의-AI' },
]

describe('연결 설정 — may_ask · 메일 깨우기 (core/bridges)', () => {
  it('may_ask 목록과 { mail, from } 을 읽는다 · 틀리면 오류', () => {
    const c = parseBridges(`bridges:\n  - id: halili\n    mailbox: 싱크\n    may_ask: [orch, "2. Area/*"]\n    wake: { mail: dave-cos@mail.grokbot.com, from: cbsjin@gmail.com }\n  - id: bad\n    mailbox: x\n    may_ask: orch\n    wake: { mail: nope }\n`)
    expect(c.peers[0]).toMatchObject({ mayAsk: ['orch', '2. Area/*'], wake: { mail: 'dave-cos@mail.grokbot.com', from: 'cbsjin@gmail.com' } })
    expect(c.peers[1].mayAsk).toEqual([])
    expect(c.peers[1].wake).toBeUndefined()
    expect(c.errors.join(' ')).toMatch(/may_ask 는 목록/)
    expect(c.errors.join(' ')).toMatch(/메일 깨우기/)
  })
  it('옛 설정(웹훅 wake: true)은 그대로 env 파일', () => {
    expect(parseBridges(`bridges:\n  - id: n8n\n    mailbox: m\n    wake: true\n`).peers[0].wake).toEqual({ env: '~/.config/secrets/folderbot-bridge-n8n.env' })
  })
  it('🔴 받는 봇은 늘 된다 · may_ask 글롭 안의 폴더 봇만 바로 · 밖이면 거절', () => {
    const peer = { name: '할일이', deliver: { bot: 'orch', session: 's' }, mayAsk: ['orch', '2. Area/*'] }
    expect(askTarget(peer, BOTS, undefined)).toEqual({ bot: BOTS[0] })
    expect(askTarget(peer, BOTS, 'orch')).toEqual({ bot: BOTS[0] })
    expect(askTarget(peer, BOTS, '제품_FolderBot')).toEqual({ bot: BOTS[1] })          // 폴더 이름
    expect(askTarget(peer, BOTS, '2. Area/사업_SNS/')).toEqual({ bot: BOTS[2] })      // 볼트 경로(끝 / 무시)
    expect(askTarget(peer, BOTS, 'b_fb')).toEqual({ bot: BOTS[1] })                   // id
    const out = askTarget(peer, BOTS, '2026-11_강의-AI')
    expect('error' in out && out.error).toMatch(/may_ask 밖/)
    expect('error' in askTarget(peer, BOTS, '없는폴더')).toBe(true)
    // may_ask 가 비면 받는 봇 하나만
    expect('error' in askTarget({ ...peer, mayAsk: [] }, BOTS, '제품_FolderBot')).toBe(true)
  })
  it('글롭: * 는 한 마디 · ** 는 여러 마디 · 이름 그대로도 된다', () => {
    expect(askPatternHits('2. Area/*', { id: 'x', name: 'y', rel: '2. Area/a/b' })).toBe(false)
    expect(askPatternHits('2. Area/**', { id: 'x', name: 'y', rel: '2. Area/a/b' })).toBe(true)
    expect(askPatternHits('사업_SNS', BOTS[2])).toBe(true)
    expect(askPatternHits('orch', BOTS[1])).toBe(false)
  })
  it('🔴 긴급 메일 본문에는 편지 내용이 없다 — 제목·id·경로·답하는 법만', () => {
    const m = wakeMail({ id: 'halili', name: '할일이' }, { id: '20261024-101500-orch-7c21', kind: 'report', path: '2. Area/x/싱크/from-folderbot/2026-10/20261024-101500-orch-7c21.md', title: '새 규칙 · folderbot ask' })
    expect(m.subject).toBe('[긴급] 새 규칙 · folderbot ask')
    expect(m.body).toContain('20261024-101500-orch-7c21')
    expect(m.body).toContain('folderbot ask --as halili --re 20261024-101500-orch-7c21')
    expect(m.body.split('\n')).toHaveLength(4)
  })
})

describe('긴급 메일 보내기 (host/wake mailWake)', () => {
  it('🔴 gog 로 한 통 · 상대마다 10분에 한 통 · 실패하면 다음에 다시 보낼 수 있다', async () => {
    resetMailWakeForTest()
    const calls: string[][] = []
    const run = async (_b: string, a: string[]) => { calls.push(a) }
    const mail = { subject: '[긴급] x', body: 'b' }
    expect(await mailWake('halili', 'dave-cos@mail.grokbot.com', 'cbsjin@gmail.com', mail, { now: 1000, run })).toEqual({ ok: true })
    expect(calls[0]).toEqual(['gmail', 'send', '-a', 'cbsjin@gmail.com', '--to', 'dave-cos@mail.grokbot.com', '--subject', '[긴급] x', '--body', 'b', '--no-input'])
    const again = await mailWake('halili', 'dave-cos@mail.grokbot.com', 'cbsjin@gmail.com', mail, { now: 1000 + MAIL_GAP_MS - 1, run })
    expect(again).toMatchObject({ ok: false, skipped: true })
    expect(calls).toHaveLength(1)
    expect((await mailWake('halili', 'a@b.co', 'c@d.co', mail, { now: 1000 + MAIL_GAP_MS, run })).ok).toBe(true)
    // 실패는 자리를 비운다
    const bad = async () => { throw new Error('gog: no token') }
    expect(await mailWake('other', 'a@b.co', 'c@d.co', mail, { now: 0, run: bad })).toMatchObject({ ok: false, error: 'gog: no token' })
    expect((await mailWake('other', 'a@b.co', 'c@d.co', mail, { now: 1, run })).ok).toBe(true)
  })
})

describe('FBMF · via ask · delivered live (core/fbmf)', () => {
  it('쓰고 읽으면 같다 · 모르는 칸은 옛 편지처럼 없다', () => {
    const l = { id: '20261024-101500-orch-7c21', from: 'orch', to: 'halili', kind: 'reply' as const, re: '20261024-101400-halili-a3f9', urgent: false, needsHuman: false, via: 'ask' as const, delivered: 'live' as const, created: '2026-10-24T10:15:00+09:00', body: '답' }
    const t = formatLetter(l)
    expect(t).toContain('via: ask\ndelivered: live\n')
    expect(parseLetter(t, { id: l.id, from: 'x' })).toMatchObject(l)
    const old = parseLetter(formatLetter({ ...l, via: undefined, delivered: undefined }), { id: l.id, from: 'x' })
    expect(old.via).toBeUndefined(); expect(old.delivered).toBeUndefined()
  })
  it('🔴 폴더 봇에 바로 온 묶음에는 «자기 봇에게만» 규칙 · ask 편지에는 «기다린다» 규칙', () => {
    const l = parseLetter('---\nfbmf: 1\nid: a\nfrom: halili\nkind: request\nvia: ask\n---\n상황 알려 줘\n', { id: '20261024-101400-halili-a3f9', from: 'halili' })
    const t = letterBatch('할일이', [{ letter: l, rel: 'x.md' }], [], '제품_FolderBot')
    expect(t).toMatch(/제품_FolderBot 봇에 바로 왔다/)
    expect(t).toMatch(/bot_send\(bot: 이 봇 자신\)/)
    expect(t).toMatch(/via="ask" 편지는 상대가 그 자리에서 답을 기다린다/)
    expect(t).toContain('via="ask"')
    const orch = letterBatch('할일이', [{ letter: { ...l, via: undefined }, rel: 'x.md' }])
    expect(orch).not.toMatch(/바로 왔다|기다린다/)
  })
})

describe('CLI 인자 · 끝 상태 (core/askCli)', () => {
  it('인자를 읽는다 · 종류는 re → reply · --no-wait → report · 나머지 request', () => {
    const o = parseAskArgs(['--as', 'halili', '--to', '제품_FolderBot', '이번', '주', '막힌', '것'])
    expect(o).toMatchObject({ as: 'halili', to: '제품_FolderBot', timeout: 50, text: '이번 주 막힌 것', noWait: false })
    expect(askKind(o)).toBe('request')
    expect(askKind(parseAskArgs(['--as', 'halili', '--no-wait', 'x']))).toBe('report')
    expect(askKind(parseAskArgs(['--as', 'halili', '--re', '20261024-101500-orch-7c21', 'x']))).toBe('reply')
    expect(parseAskArgs(['--wait', '20261024-101700-halili-a3f9'])).toMatchObject({ waiting: true, wait: '20261024-101700-halili-a3f9' })
    // id 를 빼면 이 상대의 마지막 ask — 그래서 --as 가 있어야 한다
    for (const a of [['--as', 'halili', '--wait'], ['--wait', '--as', 'halili']]) { const w = parseAskArgs(a); expect(w).toMatchObject({ waiting: true, as: 'halili' }); expect(w.wait).toBeUndefined() }
    expect(() => parseAskArgs(['--wait'])).toThrow(/--as/)
    expect(() => parseAskArgs(['--as', 'halili', '--wait', '아무말'])).toThrow(/편지 id 만/)
    expect(parseAskArgs(['--help']).help).toBe(true)
  })
  it('틀린 인자는 사람 말로 거절', () => {
    expect(() => parseAskArgs(['x'])).toThrow(/--as/)
    expect(() => parseAskArgs(['--as', 'halili'])).toThrow(/보낼 말/)
    expect(() => parseAskArgs(['--as', 'halili', '--re', '../etc', 'x'])).toThrow(/편지 id/)
    expect(() => parseAskArgs(['--as', 'halili', '--token', 'x', 'y'])).toThrow(/모르는 옵션/)   // 토큰은 인자로 받지 않는다
    expect(() => parseAskArgs(['--as', 'halili', '--timeout', '-1', 'x'])).toThrow(/0 이상/)
    expect(() => parseAskArgs(['--as', 'halili', '--timeout', 'abc', 'x'])).toThrow(/0 이상/)
  })
  it('🔴 기다림 — 기본 50초 · 0 은 한 번 보기 · 720 은 그대로 · 900 은 720 으로 줄고 줄였다고 표시 (설계 2판 §6)', () => {
    expect(ASK_TIMEOUT_DEFAULT).toBe(50); expect(ASK_TIMEOUT_MAX).toBe(720)
    expect(parseAskArgs(['--as', 'halili', 'x']).timeout).toBe(50)
    const z = parseAskArgs(['--as', 'halili', '--timeout', '0', 'x']); expect(z.timeout).toBe(0); expect(z.clamped).toBeUndefined()
    const m = parseAskArgs(['--as', 'halili', '--timeout', '720', 'x']); expect(m.timeout).toBe(720); expect(m.clamped).toBeUndefined()
    const big = parseAskArgs(['--as', 'halili', '--timeout', '900', 'x']); expect(big.timeout).toBe(720); expect(big.clamped).toBe(900)
    // 창구도 같은 값 — 없으면 50 · 0 은 0(«|| 기본값» 으로 0 이 50 이 되면 안 된다) · 넘치면 720
    expect(askTimeoutSec(undefined)).toBe(50); expect(askTimeoutSec(0)).toBe(0); expect(askTimeoutSec(900)).toBe(720); expect(askTimeoutSec(-5)).toBe(0); expect(askTimeoutSec('x')).toBe(50)
  })
  it('🔴 끝 상태는 할일이가 외우는 숫자다 — 0 답 · 2 아직 · 3 거절 · 4 꺼짐 · 5 Dave 확인', () => {
    expect(ASK_EXIT).toMatchObject({ answered: 0, pending: 2, refused: 3, hostDown: 4, needsHuman: 5 })
    expect(exitOf(200, { state: 'answered' })).toBe(0)
    expect(exitOf(200, { state: 'sent' })).toBe(0)
    expect(exitOf(200, { state: 'needs_human' })).toBe(5)
    expect(exitOf(200, { state: 'error' })).toBe(3)
    expect(exitOf(200, { state: 'pending' })).toBe(2)
    expect(exitOf(200, {})).toBe(2)   // 첫 줄만 받고 끊겼다 — 일은 계속 돈다
    for (const s of [400, 401, 403, 404, 409, 429, 503]) expect(exitOf(s, {})).toBe(3)
    expect(peerOfId('20261024-101700-halili-a3f9')).toBe('halili')
  })
  it('id 를 놓쳤을 때 — 이 상대가 ask 로 보낸 것 중 가장 늦은 편지', () => {
    const ls = [{ id: '20261024-101700-halili-a3f9', from: 'halili', via: 'ask' }, { id: '20261024-111700-halili-0001', from: 'halili' }, { id: '20261024-121700-n8n-0002', from: 'n8n', via: 'ask' }, { id: '20261024-091700-halili-0003', from: 'halili', via: 'ask' }]
    expect(lastAskId(ls, 'halili')).toBe('20261024-101700-halili-a3f9')
    expect(lastAskId(ls, 'nobody')).toBeUndefined()
    // 같은 초에 둘 — 뒤 네 자리(난수)가 아니라 파일을 쓴 시각으로 가른다(2026-10-25 스모크)
    const same = [{ id: '20261025-085931-halili-372c', from: 'halili', via: 'ask', at: 100 }, { id: '20261025-085931-halili-083c', from: 'halili', via: 'ask', at: 200 }]
    expect(lastAskId(same, 'halili')).toBe('20261025-085931-halili-083c')
    expect(lastAskId([{ ...same[0], id: '20261025-085932-halili-0000', at: 50 }, same[1]], 'halili')).toBe('20261025-085932-halili-0000')   // 초가 다르면 초가 먼저
    expect(firstLine('X', false)).toBe('X')
    expect(JSON.parse(firstLine('X', true, { bot: 'b' }))).toEqual({ id: 'X', state: 'queued', bot: 'b' })
  })
  it('🔴 --help 는 기억 카드다 — 1~8 줄이 전환·시험 묶음 §3 과 한 글자도 다르지 않다', () => {
    // 묶음 §3 원문(10/24 12:40 판) — 고치면 묶음과 함께 고친다
    const KIT = [
      '1. Folder Bot 에 묻거나 시킬 때는 맥미니 셸에서 /Users/dave/.local/bin/folderbot ask 하나만 쓴다. fbmf-write 는 쓰지 않는다.',
      '2. 폴더를 알면: folderbot ask --as halili --to <폴더 이름> "…"   (묻기·시키기·Dave 말 전달 모두)',
      '   폴더를 모르거나 여러 폴더, 새 폴더·옮기기: folderbot ask --as halili "…"   (오케스트레이터)',
      '3. 답이 필요 없는 알림이면 끝에 --no-wait.',
      '4. 셸 대기는 60초로 잡고 부른다. 50초 안에 끝나면 답이 그 자리에 찍힌다(exit 0).',
      '   exit 2 = 아직 일하는 중 → 첫 줄에 찍힌 편지 id 로 같은 슬롯 끝에 folderbot ask --wait <id> 를 한 번만. 그래도 없으면 다음 슬롯에 편지로 읽는다. 되풀이해 부르지 않는다.',
      '   길 줄 알면 처음부터 --no-wait 로 보내고 id 만 받는다. 급하면 --urgent — 답이 날 때 긴급 메일이 깨운다. id 를 놓쳤으면 folderbot ask --wait.',
      '   exit 3 거절(이유가 찍힘) · exit 4 Folder Bot 꺼짐(편지는 남았고 답은 우편함으로) · exit 5 Dave 확인 대기.',
      '5. 그 자리에서 받은 답(머리말 delivered: live)은 슬롯에서 다시 처리하지 않는다.',
      '6. dave-cos@mail.grokbot.com 으로 [긴급] 메일이 오면: 메일 속 편지 id 를 우편함 from-folderbot 에서 읽고, 답은 folderbot ask --as halili --re <id> "…".',
      '7. 셸이 끊겼을 때만 Dropbox 커넥터로 to-folderbot/ 에 편지 파일을 쓴다.',
      '8. 잊었으면 folderbot ask --help.',
    ]
    expect(ASK_CARD_LINES.split('\n')).toEqual(KIT)
    expect(ASK_CARD.split('\n').slice(1, 1 + KIT.length)).toEqual(KIT)
    expect(ASK_CARD).toMatch(/기본 50 · 0 = 한 번만 보기 · 최대 720/)
  })
})

describe('대기 창구 (host/ask AskDesk)', () => {
  it('🔴 기다리는 동안은 live · 시간이 다 되면 ask(답 편지는 그래도 쓴다) · 답하면 null', async () => {
    const d = new AskDesk()
    d.track('L1', { peerId: 'halili', botId: 'orch', sid: 's1' })
    expect(d.state('halili', 'L1')).toEqual({ live: false, wake: false })
    const p = d.wait('L1', 5000)
    expect(d.state('halili', 'L1')).toEqual({ live: true, wake: false })
    expect(d.state('other', 'L1')).toBeNull()
    expect(d.openFor('halili')).toBe(1)
    d.answered('halili', 'L1', { reply: 'R1', rel: 'r.md', answer: '답', needsHuman: false })
    expect(await p).toEqual({ reply: 'R1', rel: 'r.md', answer: '답', needsHuman: false })
    expect(d.state('halili', 'L1')).toBeNull()
    expect(d.openFor('halili')).toBe(0)
    d.track('L2', { peerId: 'halili', botId: 'orch', sid: 's1' })
    expect(await d.wait('L2', 10)).toBeNull()
    expect(d.state('halili', 'L2')).toEqual({ live: false, wake: false })
    // 급한 ask — 기다리는 동안은 깨우지 않고(그 자리에서 받는다), 떠난 뒤에만 깨운다
    d.track('U1', { peerId: 'halili', botId: 'orch', sid: 's1', urgent: true })
    const pu = d.wait('U1', 5000)
    expect(d.state('halili', 'U1')).toEqual({ live: true, wake: false })
    d.cancel('U1'); await pu
    expect(d.state('halili', 'U1')).toEqual({ live: false, wake: true })
    expect(await d.wait('U1', 0)).toBeNull()   // 0 = 한 번 보기 · 바로 끝
    expect(d.pendingIn('s1').map((x) => x.id)).toEqual(['L2', 'U1'])   // 둘 다 아직 답 편지가 없다
    d.fail('L2', '오류'); const p2 = d.wait('L2', 5000); d.answered('halili', 'L2', { reply: 'R2', rel: 'x', answer: '', needsHuman: false })
    expect((await p2)?.error).toBe('오류')
  })
  it('턴의 답 = 그 편지가 든 줄 뒤의 마지막 봇 말 · 아직 안 들어갔으면 null', () => {
    const items = [{ kind: 'user', text: '<letter id="L0">' }, { kind: 'assistant', text: '옛 답' }, { kind: 'user', text: '[편지]\n<letter id="L1" via="ask">' }, { kind: 'tool', text: '' }, { kind: 'assistant', text: '첫 말' }, { kind: 'assistant', text: '마지막 답' }]
    expect(answerAfter(items, 'L1')).toBe('마지막 답')
    expect(answerAfter(items, 'L9')).toBeNull()
    expect(answerAfter([{ kind: 'user', text: '<letter id="L1">' }], 'L1')).toBe('')
    // 뒤 턴(다음 사람 줄 뒤)의 말은 앞 편지의 답이 아니다
    expect(answerAfter([{ kind: 'user', text: '<letter id="L1">' }, { kind: 'assistant', text: 'L1 답' }, { kind: 'user', text: '<letter id="L2">' }, { kind: 'assistant', text: 'L2 답' }], 'L1')).toBe('L1 답')
    expect(answerAfter([{ kind: 'user', text: '<letter id="L1">' }, { kind: 'user', text: '<letter id="L2">' }, { kind: 'assistant', text: 'L2 답' }], 'L1')).toBe('')
  })
})

describe('BridgeHub — ask 바로 배달 · 답 편지 (host/bridge)', () => {
  function fx(deliver?: (items: Incoming[]) => string | null | Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'fb-ask-')), data = mkdtempSync(join(tmpdir(), 'fb-askd-'))
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(join(root, '.claude/bridges.yml'), 'bridges:\n  - id: halili\n    name: 할일이\n    mailbox: 싱크\n    may_ask: ["2. Area/*"]\n    wake: { mail: a@b.co, from: c@d.co }\n')
    const got: Incoming[][] = []
    const wakes: { id: string; title?: string }[] = []
    const desk = new AskDesk()
    const hub = new BridgeHub({ root, dataDir: data, hostNames: () => ['h'], log: () => {}, deliver: (_p, items) => { got.push(items); return deliver ? deliver(items) : 's_chan' }, askState: (p, re) => desk.state(p, re), askAnswered: (p, re, a) => desk.answered(p, re, a), wake: (_p, w) => wakes.push(w) })
    hub.reload()
    return { root, data, hub, got, desk, wakes, done: () => { hub.closeAll(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }) } }
  }
  it('🔴 편지 파일(via: ask · to: 봇)을 쓰고 폴링 없이 바로 넘긴다 · 배달 기록에 남아 폴링이 다시 안 넣는다', () => {
    const f = fx()
    try {
      const out = f.hub.askNow('halili', { text: 'v201 적용됐어?', to: '2. Area/제품_FolderBot' })
      expect(out.sid).toBe('s_chan')
      expect(f.got).toHaveLength(1)
      expect(f.got[0][0].letter).toMatchObject({ id: out.id, via: 'ask', to: '2. Area/제품_FolderBot', kind: 'request' })
      const text = readFileSync(join(f.root, out.rel), 'utf8')
      expect(text).toContain('via: ask')
      expect(readFileSync(join(f.data, 'bridges/halili/delivered.jsonl'), 'utf8')).toContain(`"id":"${out.id}","state":"delivered"`)
      f.hub.scanNow(); f.hub.scanNow()
      expect(f.got).toHaveLength(1)
    } finally { f.done() }
  })
  it('편지마다 다른 세션(봇) — 받은 것만 기록하고 빠진 것은 다음에 다시', () => {
    let n = 0
    const f = fx((items) => (n++ === 0 ? {} : Object.fromEntries(items.map((x) => [x.letter.id, 's_' + x.letter.id]))))
    try {
      const out = f.hub.askNow('halili', { text: 'x', to: 'orch' })
      expect(out.sid).toBeNull()
      expect(existsSyncSafe(join(f.data, 'bridges/halili/delivered.jsonl')) ? readFileSync(join(f.data, 'bridges/halili/delivered.jsonl'), 'utf8') : '').not.toContain(`"id":"${out.id}","state":"delivered"`)
    } finally { f.done() }
  })
  it('🔴 답 편지 — 기다리는 쪽이 있으면 delivered: live 와 함께 돌려주고, 없으면 via: ask 만', async () => {
    const f = fx()
    try {
      const q = f.hub.askNow('halili', { text: '물음', to: 'orch' })
      f.desk.track(q.id, { peerId: 'halili', botId: 'orch', sid: 's_chan' })
      const w = f.desk.wait(q.id, 5000)
      const r = f.hub.send('halili', 'orch', { kind: 'reply', re: q.id, text: '답이에요' })
      const a = await w
      expect(a).toMatchObject({ reply: r.id, answer: '답이에요' })
      const t = readFileSync(join(f.root, r.rel), 'utf8')
      expect(t).toContain('via: ask\ndelivered: live')
      // 두 번째 답은 평범한 편지(이미 답했다)
      const r2 = f.hub.send('halili', 'orch', { kind: 'report', re: q.id, text: '덧붙임' })
      expect(readFileSync(join(f.root, r2.rel), 'utf8')).not.toContain('via: ask')
      // 아무도 안 기다리는 ask
      const q2 = f.hub.askNow('halili', { text: '물음2', to: 'orch' })
      f.desk.track(q2.id, { peerId: 'halili', botId: 'orch', sid: 's_chan' })
      const r3 = f.hub.send('halili', 'orch', { kind: 'reply', re: q2.id, text: '늦은 답' })
      const t3 = readFileSync(join(f.root, r3.rel), 'utf8')
      expect(t3).toContain('via: ask'); expect(t3).not.toContain('delivered: live')
      expect(f.hub.findReply('halili', q2.id)?.letter.id).toBe(r3.id)
    } finally { f.done() }
  })
  it('🔴 --urgent 로 물었는데 기다리는 쪽이 떠난 뒤 답이 나면 그 답 편지로 깨운다 · 그 자리에서 받으면 안 깨운다', async () => {
    const f = fx()
    try {
      const live = f.hub.askNow('halili', { text: '급함 · 빨리', to: 'orch', urgent: true })
      f.desk.track(live.id, { peerId: 'halili', botId: 'orch', sid: 's_chan', urgent: true })
      const w = f.desk.wait(live.id, 5000)
      f.hub.send('halili', 'orch', { kind: 'reply', re: live.id, text: '바로 답' }); await w
      expect(f.wakes).toHaveLength(0)
      const late = f.hub.askNow('halili', { text: '급함 · 느림', to: 'orch', urgent: true })
      f.desk.track(late.id, { peerId: 'halili', botId: 'orch', sid: 's_chan', urgent: true })
      expect(await f.desk.wait(late.id, 0)).toBeNull()   // --timeout 0 · 이미 떠났다
      const r = f.hub.send('halili', 'orch', { kind: 'reply', re: late.id, title: '답', text: '늦은 답' })
      expect(f.wakes).toEqual([expect.objectContaining({ id: r.id, title: '답' })])
      expect(readFileSync(join(f.root, r.rel), 'utf8')).not.toContain('delivered: live')
      // 급하지 않은 ask 는 늦어도 안 깨운다
      const calm = f.hub.askNow('halili', { text: '보통', to: 'orch' })
      f.desk.track(calm.id, { peerId: 'halili', botId: 'orch', sid: 's_chan' })
      f.hub.send('halili', 'orch', { kind: 'reply', re: calm.id, text: '보통 답' })
      expect(f.wakes).toHaveLength(1)
    } finally { f.done() }
  })
  it('🔴 may_send 밖 봇은 못 쓰고, 그 상대의 채널 세션이면 쓴다', () => {
    const f = fx()
    try {
      expect(() => f.hub.send('halili', 'b_fb', { kind: 'report', text: 'x' })).toThrow(/may_send/)
      const r = f.hub.send('halili', 'b_fb', { kind: 'report', text: 'x' }, { channel: true })
      expect(readFileSync(join(f.root, r.rel), 'utf8')).toContain('from: folderbot:b_fb')
      expect(readdirSync(join(f.root, '싱크/from-folderbot')).length).toBe(1)
    } finally { f.done() }
  })
})
describe('🔴 CLI — 편지 id 가 첫 줄이다 · 기다리기 전에 찍는다 (host/index ask · 설계 2판 §7 ①)', () => {
  function vault() {
    const root = mkdtempSync(join(tmpdir(), 'fb-cli-')), data = mkdtempSync(join(tmpdir(), 'fb-clid-'))
    mkdirSync(join(root, '.claude'), { recursive: true })
    const tok = join(data, 'in.env'); writeFileSync(tok, 'TOKEN=unit-token-0123456789\n', { mode: 0o600 })
    writeFileSync(join(root, '.claude/bridges.yml'), `bridges:\n  - id: halili\n    name: 할일이\n    mailbox: 싱크\n    inbound: { env: ${JSON.stringify(tok)} }\n`)
    return { root, data, done: () => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }) } }
  }
  async function run(args: string[], port: number, data: string, root: string) {
    const was = process.env.FOLDERBOT_DATA; process.env.FOLDERBOT_DATA = data
    writeFileSync(join(data, 'host-info.json'), JSON.stringify({ root, port, at: '9999' }))
    const out: { t: number; s: string }[] = [], err: string[] = []
    try { const code = await ask(args, { out: (s) => out.push({ t: Date.now(), s }), err: (s) => err.push(s) }); return { code, out, err } }
    finally { if (was === undefined) delete process.env.FOLDERBOT_DATA; else process.env.FOLDERBOT_DATA = was }
  }
  it('창구가 첫 줄을 주자마자 id 를 찍고, 결과 줄은 나중에 · 받은 본문은 timeout 을 그대로 싣는다', async () => {
    const v = vault(); let gotBody: Record<string, unknown> = {}; let secondAt = 0
    const srv = createServer((req, res) => {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
        gotBody = JSON.parse(b)
        if (req.headers.authorization !== 'Bearer unit-token-0123456789') { res.writeHead(401).end('{}'); return }
        res.writeHead(200, { 'content-type': 'application/x-ndjson' })
        res.write(JSON.stringify({ id: '20261024-130000-halili-ab12', bot: '오케스트레이터', state: 'queued' }) + '\n')
        setTimeout(() => { secondAt = Date.now(); res.end(JSON.stringify({ id: '20261024-130000-halili-ab12', state: 'answered', answer: '답이에요', reply: 'R' }) + '\n') }, 400)
      })
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    try {
      const port = (srv.address() as AddressInfo).port
      const r = await run(['--as', 'halili', '핑'], port, v.data, v.root)
      expect(r.code).toBe(0)
      expect(r.out.map((x) => x.s)).toEqual(['20261024-130000-halili-ab12', '답이에요'])
      expect(r.out[0].t).toBeLessThan(secondAt)   // 결과 줄이 오기 전에 이미 찍었다
      expect(gotBody).toMatchObject({ timeout: 50, wait: true, kind: 'request' })
      // --json 도 첫 줄이 id 다(NDJSON) · 마지막 줄이 결과
      const j = await run(['--as', 'halili', '--json', '--timeout', '900', '핑'], port, v.data, v.root)
      expect(JSON.parse(j.out[0].s)).toMatchObject({ id: '20261024-130000-halili-ab12', state: 'queued' })
      expect(JSON.parse(j.out[j.out.length - 1].s)).toMatchObject({ state: 'answered', answer: '답이에요' })
      expect(gotBody.timeout).toBe(720)
      expect(j.err.join(' ')).toMatch(/720 초로 줄였어요/)
    } finally { srv.close(); v.done() }
  })
  it('결과 줄 없이 끊겨도 id 는 이미 찍혔고 exit 2 · 꺼져 있으면 첫 줄 id 와 exit 4 · 편지가 우편함에', async () => {
    const v = vault()
    const srv = createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/x-ndjson' }); res.write(JSON.stringify({ id: '20261024-130100-halili-cd34', state: 'queued' }) + '\n'); setTimeout(() => res.destroy(), 100) }) })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    try {
      const r = await run(['--as', 'halili', '--timeout', '0', '핑'], (srv.address() as AddressInfo).port, v.data, v.root)
      expect(r.code).toBe(2)
      expect(r.out[0].s).toBe('20261024-130100-halili-cd34')
      expect(r.err.join(' ')).toContain('--wait 20261024-130100-halili-cd34')
    } finally { srv.close() }
    try {
      const d = await run(['--as', 'halili', '--no-wait', '꺼짐'], 1, v.data, v.root)
      expect(d.code).toBe(4)
      expect(d.out[0].s).toMatch(/^\d{8}-\d{6}-halili-[0-9a-f]{4}$/)
      const month = readdirSync(join(v.root, '싱크/to-folderbot'))[0]
      expect(readFileSync(join(v.root, '싱크/to-folderbot', month, `${d.out[0].s}.md`), 'utf8')).toContain('via: ask')
      // id 를 놓쳤으면 --wait 만 — 그 편지를 찾고, 답이 없으면 --timeout 0 으로 한 번 보고 2
      const w = await run(['--as', 'halili', '--wait', '--timeout', '0'], 1, v.data, v.root)
      expect(w.code).toBe(2)
      expect(w.out[0].s).toBe(d.out[0].s)
    } finally { v.done() }
  })
})
function existsSyncSafe(p: string): boolean { try { readFileSync(p); return true } catch { return false } }
