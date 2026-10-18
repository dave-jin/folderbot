import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { addBridgeYaml, defaultMailbox, freeId, handoffLine, letterAt, mailboxProblem, mailboxReadme, markRead, newBridgeProblems, orderThread, peerColor, peerMood, stampMs, unreadOf, PRESETS, type LetterView, type NewBridge } from '../../src/core/bridgeView'
import { parseBridges } from '../../src/core/bridges'
import { parseLetter } from '../../src/core/fbmf'
import { PARA_PRESET, JD_PRESET } from '../../src/core/rules'
import { BridgeHub, HUMAN_FROM } from '../../src/host/bridge'
import { PALETTE_HEX } from '../../src/core/botColor'

/**
 * 연결(Bridge) 화면 — BQ-9 레일 «연결» 절·편지 스레드 · BQ-10 새 연결 마법사 (2026-10-19 Dave «A·A»).
 * 목업 `PARA/2. Area/제품_FolderBot/03_디자인/2026-10-09_연결-목업/연결-목업.html` ①A · ②A.
 */
const L = (o: Partial<LetterView>): LetterView => ({ id: 'x', dir: 'in', from: 'h', kind: 'report', urgent: false, needsHuman: false, at: 0, body: '', rel: '', ...o })

describe('스레드 순수 함수 (core/bridgeView)', () => {
  it('편지 시각 — created → id 의 시각 → 파일 시각', () => {
    expect(stampMs('20261009-201500-halili-a3f9')).toBe(new Date(2026, 9, 9, 20, 15, 0).getTime())
    expect(Number.isNaN(stampMs('메모'))).toBe(true)
    expect(letterAt('2026-10-09T20:15:00+09:00', 'x', 5)).toBe(Date.parse('2026-10-09T20:15:00+09:00'))
    expect(letterAt(undefined, '20261009-201500-halili-a3f9', 5)).toBe(new Date(2026, 9, 9, 20, 15).getTime())
    expect(letterAt(undefined, '메모', 5)).toBe(5)
  })
  it('시간순 · 최근 N통만', () => {
    const list = [L({ id: 'b', at: 2 }), L({ id: 'a', at: 1 }), L({ id: 'c', at: 3 })]
    expect(orderThread(list).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(orderThread(list, 2).map((x) => x.id)).toEqual(['b', 'c'])
  })
  it('🔴 읽음 — 상대 커서의 last 가 그 편지 id 와 같거나 뒤면 읽은 것(나간 편지만)', () => {
    const out = [L({ id: '20261009-200000-orch-0001', dir: 'out' }), L({ id: '20261009-210000-orch-0002', dir: 'out' }), L({ id: '20261009-200000-halili-0003', dir: 'in' })]
    const r = markRead(out, { last: '20261009-200000-orch-0001', at: 99 })
    expect(r.map((x) => x.readAt)).toEqual([99, undefined, undefined])
    expect(markRead(out, null)).toBe(out)
  })
  it('안 읽음 = 사람이 연 뒤에 «도착한» 들어온 편지 · 처음 켤 때 본 것은 빼고', () => {
    expect(unreadOf([L({ at: 5 }), L({ at: 10 }), L({ at: 11, dir: 'out' })], 6)).toBe(1)
    expect(unreadOf([L({ at: 5, delivered: 9 })], 6)).toBe(1)                     // 5시에 썼지만 9시에 들어왔다(늦게 내려온 편지)
    expect(unreadOf([L({ id: 'a', at: 5 })], 6, () => 8)).toBe(1)                 // 배달 기록이 없는 호스트 — 처음 본 시각
    expect(unreadOf([L({ at: 10, baseline: true })], 6)).toBe(0)
  })
})

describe('새 연결 마법사 (core/bridgeView)', () => {
  it('세 종류 — grok-bot · generic-file · webhook (목업 문구)', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['grok-bot', 'generic-file', 'webhook'])
    expect(PRESETS[0]).toMatchObject({ title: 'Grok Bot 루틴', expectEvery: '150m' })
    expect(PRESETS[2]).toMatchObject({ inbound: true })
  })
  it('추천 우편함 — Area 칸 아래 «이름/싱크» (목업 ②A 의 2. Area/비서/싱크)', () => {
    const dave = { ...PARA_PRESET, roles: { ...PARA_PRESET.roles, active: ['1. Projects/*', '2. Area/*'] } }
    expect(defaultMailbox(dave, '비서')).toBe('2. Area/비서/싱크')
    expect(defaultMailbox(PARA_PRESET, '할일이')).toBe('3. Area/할일이/싱크')
    expect(defaultMailbox(JD_PRESET, 'n8n')).toBe('연결/n8n/싱크')        // Area 칸이 없으면 루트의 연결/
    expect(defaultMailbox(null, 'a/b')).toBe('연결/a b/싱크')              // 경로 구분자는 폴더 이름에서 걷는다
  })
  it('우편함 경로 — 볼트 안 상대 경로만', () => {
    for (const bad of ['', '/Users/x', '~/x', '../x', 'a/../b', '.claude/x', 'a//b']) expect(mailboxProblem(bad)).not.toBeNull()
    expect(mailboxProblem('2. Area/비서/싱크')).toBeNull()
  })
  it('id — 겹치면 -2 · 한글 이름이면 peer', () => {
    expect(freeId('grok', ['grok'])).toBe('grok-2')
    expect(freeId('grok', ['grok', 'grok-2'])).toBe('grok-3')
    expect(freeId('할일이', [])).toBe('peer')
  })
  it('검사 — id·이름·우편함·겹침', () => {
    const ok: NewBridge = { preset: 'grok-bot', id: 'grok', name: 'Grok', icon: '✅', mailbox: '2. Area/비서/싱크', deliverBot: 'orch', trust: 'propose' }
    expect(newBridgeProblems(ok, { ids: [], mailboxes: [] })).toEqual([])
    expect(newBridgeProblems({ ...ok, id: 'Grok!' }, { ids: [], mailboxes: [] }).join()).toMatch(/소문자/)
    expect(newBridgeProblems(ok, { ids: ['grok'], mailboxes: [] }).join()).toMatch(/이미/)
    expect(newBridgeProblems(ok, { ids: [], mailboxes: ['2. Area/비서/싱크/'] }).join()).toMatch(/한 우편함은 한 상대만/)
  })
  it('🔴 bridges.yml 에 덧붙인다 — 사람이 쓴 주석·다른 키·다른 연결은 그대로, 결과는 parseBridges 가 읽는다', () => {
    const before = '# 내 메모 — 지우지 마\nruns_copy: "운영/runs"\nbridges:\n  - id: halili   # 할일이\n    name: 할일이\n    mailbox: 싱크\n'
    const b: NewBridge = { preset: 'webhook', id: 'n8n', name: '자동화(n8n)', icon: '🔗', mailbox: '2. Area/자동화/싱크/', deliverBot: 'orch', trust: 'read', host: 'mac-mini', since: '2026-10-19T09:00:00+09:00', inbound: true }
    const after = addBridgeYaml(before, b)
    expect(after).toMatch(/# 내 메모 — 지우지 마/); expect(after).toMatch(/# 할일이/); expect(after).toMatch(/runs_copy: "?운영\/runs"?/)
    const cfg = parseBridges(after)
    expect(cfg.errors).toEqual([])
    expect(cfg.peers.map((p) => p.id)).toEqual(['halili', 'n8n'])
    expect(cfg.peers[1]).toMatchObject({ name: '자동화(n8n)', icon: '🔗', mailbox: '2. Area/자동화/싱크', trust: 'read', host: 'mac-mini', maySend: ['orch'], deliver: { bot: 'orch', session: '🔗 자동화(n8n) 채널' }, inbound: { env: '~/.config/secrets/folderbot-bridge-n8n-in.env' } })
    expect(cfg.runsCopy).toBe('운영/runs')
    // 파일이 없으면 새로 — 머리 주석 + 한 줄
    const fresh = addBridgeYaml(null, { ...b, inbound: false, expectEvery: '150m' })
    expect(parseBridges(fresh).peers[0]).toMatchObject({ id: 'n8n', expectEveryMs: 150 * 60_000 })
    expect(() => addBridgeYaml('bridges: [\n', b)).toThrow(/못 읽어서/)
  })
  it('README — FBMF v1 규약 + 그 상대용 예시 · 상대에게 줄 한 줄', () => {
    const b: NewBridge = { preset: 'grok-bot', id: 'grok', name: '비서', icon: '✅', mailbox: '2. Area/비서/싱크', deliverBot: 'orch', trust: 'propose', expectEvery: '150m' }
    const r = mailboxReadme(b, { deliverName: '오케스트레이터', now: new Date(2026, 9, 19, 9, 30) })
    expect(r).toMatch(/^# 우편함 규약 — FBMF v1/)
    expect(r).toMatch(/`cursors\/grok\.json`/); expect(r).toMatch(/Dropbox 커넥터/); expect(r).toMatch(/150m 넘게/)
    expect(r).toMatch(/`human`/)                                            // 사람이 화면에서 쓴 편지의 보낸쪽
    // README 의 예시 편지는 그대로 FBMF 로 읽힌다
    const ex = /```markdown\n([\s\S]*?)```/.exec(r)![1]
    const exl = parseLetter(ex, { id: 'x', from: 'y' }); expect(exl).toMatchObject({ from: 'grok', kind: 'request', to: 'orch' }); expect(exl.malformed).toBeUndefined()
    expect(mailboxReadme({ ...b, preset: 'webhook', id: 'n8n' }, { deliverName: 'o', port: 7373 })).toMatch(/api\/bridges\/n8n\/messages/)
    expect(mailboxReadme({ ...b, preset: 'generic-file' }, { deliverName: 'o' })).toMatch(/mv "\$MB\/to-folderbot/)
    expect(handoffLine('2. Area/비서/싱크/')).toBe('2. Area/비서/싱크/README.md 를 읽고 그대로 따라 해 줘.')
  })
})

describe('상대 얼굴 — 말풍선 캐릭터 (2026-10-19 Dave «B 말풍선» · 통일성 목업)', () => {
  it('몸 색 — bridges.yml 의 color(봇 색 판 안) → 없으면 id 로 판에서 · 기기마다 같다', () => {
    expect(peerColor('halili', '#F0A8C0')).toBe('#f0a8c0')
    expect(PALETTE_HEX).toContain(peerColor('halili'))
    expect(peerColor('halili')).toBe(peerColor('halili'))
    expect(PALETTE_HEX).toContain(peerColor('halili', '#e08850'))   // 오케스트레이터 주황은 판 밖 — id 색으로
    const { peers, errors } = parseBridges('bridges:\n  - id: a\n    mailbox: m\n    color: "#5fd3b5"\n  - id: b\n    mailbox: n\n    color: "#e08850"\n')
    expect(peers[0].color).toBe('#5fd3b5'); expect(peers[1].color).toBeUndefined(); expect(errors.join(' ')).toMatch(/color/)
  })
  it('🔴 얼굴 — 끊김 > 사람 결정 > 안 읽음 > 상대가 내 편지 안 읽음 > 쉼 · 쉬면 배지 없음(옛 «늘 초록 점» 폐기)', () => {
    const b = { stale: false, needs: 0, unread: 0, pending: false }
    expect(peerMood(b)).toBe('idle')
    expect(peerMood({ ...b, pending: true })).toBe('hold')
    expect(peerMood({ ...b, pending: true, unread: 2 })).toBe('done')
    expect(peerMood({ ...b, unread: 2, needs: 1 })).toBe('wait')
    expect(peerMood({ ...b, unread: 2, needs: 1, stale: true })).toBe('error')
  })
})

/** 지금 달 폴더 — 스레드는 이번 달·지난달만 본다 */
const NOW = new Date(2026, 9, 19, 12, 0, 0).getTime()
function fixture(yml?: string, host = 'mac-mini') {
  const root = mkdtempSync(join(tmpdir(), 'fb-bui-')), data = mkdtempSync(join(tmpdir(), 'fb-buid-'))
  mkdirSync(join(root, '.claude'), { recursive: true })
  if (yml !== undefined) writeFileSync(join(root, '.claude/bridges.yml'), yml)
  const changes: number[] = []
  const clock = { t: NOW }
  const hub = new BridgeHub({ root, dataDir: data, hostNames: () => [host], log: () => {}, deliver: () => 's_chan', onChange: () => changes.push(1), now: () => clock.t })
  return { root, data, hub, changes, clock, done: () => { hub.closeAll(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }) } }
}

describe('BridgeHub — 화면 (host/bridge)', () => {
  it('스레드 — 들어온 편지(처음 켤 때 있던 것은 «본 것») · 나간 편지(상대 커서로 읽음) · 시간순', () => {
    const f = fixture('bridges:\n  - id: halili\n    name: 할일이\n    icon: ✅\n    mailbox: 싱크\n    host: mac-mini\n')
    try {
      const mb = join(f.root, '싱크')
      mkdirSync(join(mb, 'to-folderbot/2026-10'), { recursive: true }); mkdirSync(join(mb, 'from-folderbot/2026-10'), { recursive: true }); mkdirSync(join(mb, 'cursors'), { recursive: true })
      writeFileSync(join(mb, 'to-folderbot/2026-10/20261019-090000-halili-0001.md'), '---\nfbmf: 1\nfrom: halili\nkind: request\ntitle: 카톡 sync 확인\nurgent: true\n---\n원인 봐 주세요\n')
      writeFileSync(join(mb, 'from-folderbot/2026-10/20261019-091000-orch-0002.md'), '---\nfbmf: 1\nfrom: orch\nkind: reply\nre: 20261019-090000-halili-0001\n---\n봤어요\n')
      writeFileSync(join(mb, 'from-folderbot/2026-10/20261019-100000-orch-0003.md'), '---\nfbmf: 1\nfrom: orch\nkind: incident\nneeds_human: true\n---\n정기동기화 실패\n')
      writeFileSync(join(mb, 'from-folderbot/2026-10/.20261019-110000-orch-0004.md.1.tmp'), '---\nfbmf: 1\n')   // 쓰는 중인 임시 파일 — 안 보인다
      writeFileSync(join(mb, 'cursors/halili.json'), JSON.stringify({ last: '20261019-091000-orch-0002', at: '2026-10-19T09:30:00+09:00' }))
      f.hub.reload()
      const t = f.hub.thread('halili')!
      expect(t.letters.map((l) => [l.dir, l.id.slice(-4)])).toEqual([['in', '0001'], ['out', '0002'], ['out', '0003']])
      expect(t.letters[0]).toMatchObject({ title: '카톡 sync 확인', urgent: true, baseline: true, rel: '싱크/to-folderbot/2026-10/20261019-090000-halili-0001.md' })
      expect(t.letters[1].readAt).toBe(Date.parse('2026-10-19T09:30:00+09:00'))
      expect(t.letters[2]).toMatchObject({ needsHuman: true }); expect(t.letters[2].readAt).toBeUndefined()
      expect(t.peer).toMatchObject({ id: 'halili', owner: true, letters: 3, stale: false, lastSignal: Date.parse('2026-10-19T09:30:00+09:00') })
      expect(f.hub.thread('nope')).toBeNull()
    } finally { f.done() }
  })
  it('🔴 안 읽음 — 처음 보면 지금을 «본 시각» 으로(옛 편지를 쏟지 않는다) · 그 뒤 편지만 센다 · 열면 걷힌다', () => {
    const f = fixture('bridges:\n  - id: halili\n    name: 할일이\n    mailbox: 싱크\n')
    try {
      const inDir = join(f.root, '싱크/to-folderbot/2026-10'); mkdirSync(inDir, { recursive: true })
      writeFileSync(join(inDir, '20261019-090000-halili-0001.md'), '---\nfbmf: 1\nkind: report\n---\n옛 편지\n')
      f.hub.reload()
      expect(f.hub.views()[0].unread).toBe(0)
      writeFileSync(join(inDir, '20261019-130000-halili-0002.md'), '---\nfbmf: 1\nkind: report\n---\n새 편지\n')   // NOW(12:00) 뒤에 쓴 편지
      expect(f.hub.views()[0].unread).toBe(1)
      expect(f.hub.views()[0]).toMatchObject({ needs: 0, pending: false })
      writeFileSync(join(inDir, '20261019-131000-halili-0003.md'), '---\nfbmf: 1\nkind: request\nneeds_human: true\n---\n정해 주세요\n')
      expect(f.hub.views()[0]).toMatchObject({ unread: 2, needs: 1 })
      expect(PALETTE_HEX).toContain(f.hub.views()[0].color)
      const outDir = join(f.root, '싱크/from-folderbot/2026-10'); mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, '20261019-120500-orch-0004.md'), '---\nfbmf: 1\nfrom: orch\nkind: report\n---\n봇 보고\n')
      expect(f.hub.views()[0].pending).toBe(false)   // 봇·감시기 편지는 «기다림» 이 아니다 — 사람이 쓴 것만
      writeFileSync(join(outDir, '20261019-121000-human-0005.md'), `---\nfbmf: 1\nfrom: ${HUMAN_FROM}\nkind: report\n---\n이건 뭐야?\n`)
      expect(f.hub.views()[0].pending).toBe(true)
      mkdirSync(join(f.root, '싱크/cursors'), { recursive: true }); writeFileSync(join(f.root, '싱크/cursors/halili.json'), JSON.stringify({ last: '20261019-121000-human-0005', at: '2026-10-19T12:20:00+09:00' }))
      expect(f.hub.views()[0].pending).toBe(false)
      f.hub.markSeen('halili')
      expect(existsSync(join(f.data, 'bridges/halili/seen.json'))).toBe(true)
    } finally { f.done() }
  })
  it('🔴 늦게 내려온 편지 — 사람이 연 뒤에 도착했으면 «쓴 시각» 이 앞이어도 안 읽음 · 다시 켜도 옛 편지는 안 쏟아진다', () => {
    const yml = 'bridges:\n  - id: halili\n    name: 할일이\n    mailbox: 싱크\n    host: 다른-맥\n'   // 배달 기록이 없는 호스트(읽기만)
    const f = fixture(yml)
    try {
      const inDir = join(f.root, '싱크/to-folderbot/2026-10'); mkdirSync(inDir, { recursive: true })
      writeFileSync(join(inDir, '20261019-080000-halili-0001.md'), '---\nfbmf: 1\nkind: report\n---\n옛 편지\n')
      f.hub.reload()
      expect(f.hub.views()[0].unread).toBe(0)                  // 본 시각 = 12:00
      f.clock.t = NOW + 60_000
      writeFileSync(join(inDir, '20261019-110000-halili-0002.md'), '---\nfbmf: 1\nkind: report\ncreated: 2026-10-19T11:00:00+09:00\n---\n11시에 썼는데 12:01 에 내려옴\n')
      expect(f.hub.views()[0].unread).toBe(1)
      // 다시 켠 호스트(새 허브) — 처음 훑을 때는 쓴 시각으로 본다
      const hub2 = new BridgeHub({ root: f.root, dataDir: f.data, hostNames: () => ['mac-mini'], log: () => {}, deliver: () => null, now: () => NOW + 120_000 })
      hub2.reload(); f.hub.markSeen('halili')
      expect(hub2.views()[0].unread).toBe(0)
      hub2.closeAll()
    } finally { f.done() }
  })
  it('사람이 쓴 편지 — from human · may_send 와 무관 · reply 는 re 필수 · 화면에 알린다', () => {
    const f = fixture('bridges:\n  - id: halili\n    name: 할일이\n    mailbox: 싱크\n    may_send: [orch]\n')
    try {
      f.hub.reload(); f.changes.length = 0
      const out = f.hub.sendHuman('halili', { kind: 'request', text: '내일 아침 브리핑에 넣어 줘', urgent: true })
      expect(out.id).toMatch(/^20261019-120000-human-[0-9a-f]{4}$/)
      const txt = readFileSync(join(f.root, out.rel), 'utf8')
      expect(parseLetter(txt, { id: out.id, from: 'x' })).toMatchObject({ from: HUMAN_FROM, to: 'halili', kind: 'request', urgent: true })
      expect(f.changes.length).toBeGreaterThan(0)
      expect(() => f.hub.sendHuman('halili', { kind: 'reply', text: 'x' })).toThrow(/re/)
      expect(() => f.hub.sendHuman('halili', { kind: 'heartbeat', text: 'x' })).toThrow(/kind/)
      expect(() => f.hub.sendHuman('halili', { kind: 'report', text: '  ' })).toThrow(/비었/)
      expect(() => f.hub.sendHuman('halili', { kind: 'reply', re: 'x\nurgent: true', text: 'x' })).toThrow(/한 줄/)   // 머리말 줄을 지어내지 못한다
      expect(f.hub.thread('halili')!.letters.at(-1)).toMatchObject({ dir: 'out', from: 'human' })
    } finally { f.done() }
  })
  it('🔴 새 연결 — 우편함 폴더 넷 · README · bridges.yml 한 줄 · 다시 읽기. 이미 있는 README 는 덮지 않는다', () => {
    const f = fixture()
    try {
      const b: NewBridge = { preset: 'grok-bot', id: 'grok', name: '비서', icon: '✅', mailbox: '2. Area/비서/싱크', deliverBot: 'orch', trust: 'propose', host: 'mac-mini', since: '2026-10-19T12:00:00+09:00', expectEvery: '150m' }
      const r = f.hub.create(b, { deliverName: '오케스트레이터' })
      expect(r).toMatchObject({ mailbox: '2. Area/비서/싱크', readme: '2. Area/비서/싱크/README.md', readmeKept: false, configFile: '.claude/bridges.yml' })
      expect(r.created.sort()).toEqual(['2. Area/비서/싱크', '2. Area/비서/싱크/cursors', '2. Area/비서/싱크/from-folderbot', '2. Area/비서/싱크/to-folderbot'])
      expect(readFileSync(join(f.root, r.readme), 'utf8')).toMatch(/FBMF v1/)
      expect(f.hub.cfg.peers.map((p) => p.id)).toEqual(['grok'])               // 다시 읽었다
      expect(f.hub.status()[0]).toMatchObject({ owner: true })
      // 같은 id · 같은 우편함은 거절
      expect(() => f.hub.create(b, { deliverName: 'o' })).toThrow(/이미/)
      // README 가 이미 있는 자리 — 사람이 고친 규약을 덮지 않는다
      mkdirSync(join(f.root, '공유/싱크'), { recursive: true }); writeFileSync(join(f.root, '공유/싱크/README.md'), '# 내 규약\n')
      const r2 = f.hub.create({ ...b, id: 'n8n', preset: 'webhook', mailbox: '공유/싱크', inbound: true }, { deliverName: 'o' })
      expect(r2.readmeKept).toBe(true); expect(readFileSync(join(f.root, '공유/싱크/README.md'), 'utf8')).toBe('# 내 규약\n')
      expect(parseBridges(readFileSync(join(f.root, '.claude/bridges.yml'), 'utf8')).peers.map((p) => p.id)).toEqual(['grok', 'n8n'])
      expect(() => f.hub.create({ ...b, id: 'x1', mailbox: '../밖' }, { deliverName: 'o' })).toThrow(/\.\./)
    } finally { f.done() }
  })
  it('읽을 수 없는 bridges.yml 은 덮어쓰지 않는다', () => {
    const f = fixture('bridges: [\n  broken')
    try {
      expect(() => f.hub.create({ preset: 'generic-file', id: 'a', name: 'a', icon: '📄', mailbox: 'a/싱크', deliverBot: 'orch', trust: 'read' }, { deliverName: 'o' })).toThrow(/못 읽어요/)
      expect(readFileSync(join(f.root, '.claude/bridges.yml'), 'utf8')).toBe('bridges: [\n  broken')
      expect(existsSync(join(f.root, 'a/싱크'))).toBe(false)
    } finally { f.done() }
  })
})
