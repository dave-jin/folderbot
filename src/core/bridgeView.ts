import { parseDocument, isSeq, YAMLSeq } from 'yaml'
import { idSlug, isoLocal, type LetterKind } from './fbmf'
import { TRUSTS, parseDuration, type Trust } from './bridges'
import type { FolderRules } from './types'
import { PALETTE_HEX, colorAllowed } from './botColor'

/**
 * 연결(Bridge) 화면 — 레일 «연결» 절 · 편지 스레드 · 새 연결 마법사가 읽는 순수 함수 (BQ-9 · BQ-10 · 2026-10-19 Dave «A·A»).
 * 목업 `PARA/2. Area/제품_FolderBot/03_디자인/2026-10-09_연결-목업/연결-목업.html` ①A · ②A.
 * 호스트(`host/bridge.ts`)가 파일을 읽어 이 꼴로 만들고, 화면(`client/Bridges.tsx`)은 받아 그리기만 한다 — 뺄셈은 한 곳에서.
 */

/** 스레드의 편지 한 통 — 들어온 것(in · 상대가 씀)과 나간 것(out · Folder Bot 이 씀) */
export interface LetterView {
  id: string
  dir: 'in' | 'out'
  from: string
  to?: string
  kind: LetterKind
  title?: string
  re?: string
  urgent: boolean
  needsHuman: boolean
  /** 쓴 시각(ms) — 머리말 created → id 의 시각 → 파일 수정 시각 순으로 */
  at: number
  body: string
  /** 본문이 길어 앞만 실었다 */
  cut?: boolean
  /** 볼트 기준 경로(볼트 밖 우편함이면 절대 경로) */
  rel: string
  malformed?: boolean
  /** in · 채널 세션에 넣은 시각 · 처음 켤 때 있던 편지라 «본 것» 으로만 적었다 */
  delivered?: number
  baseline?: boolean
  /** out · 상대 커서가 이 편지를 지났다 — 그 커서를 쓴 시각 */
  readAt?: number
  /** out · 급한 편지라 상대 웹훅을 불렀다(이번 실행에서만 안다) */
  wake?: { ok: boolean; status?: number }
}

/** 레일 한 줄 · 스레드 머리 */
export interface PeerView {
  id: string
  name: string
  icon: string
  trust: Trust
  mailbox: string
  host?: string
  /** 이 호스트가 편지를 가져가나(`host:` 가 다른 맥이면 읽기만) */
  owner: boolean
  deliverBot: string
  deliverSession: string
  /** 그 상대의 채널 세션(있으면) — «채널 세션 열기» */
  channelSid?: string
  maySend: string[]
  expectEveryMs?: number
  stale: boolean
  /** 상대의 마지막 신호(커서 갱신·편지) — 못 봤으면 null */
  lastSignal: number | null
  /** 사람이 스레드를 마지막으로 연 뒤 들어온 편지 수 */
  unread: number
  /** 그 안 읽은 편지 중 «사람 결정» 이 붙은 것 — 얼굴이 «확인» 이 된다 */
  needs: number
  /** 사람이 직접 쓴 편지를 상대가 아직 안 읽었다(상대 커서가 못 지났다) — 얼굴이 «기다림» 이 된다 */
  pending: boolean
  /** 말풍선 캐릭터 몸 색 — `peerColor` */
  color: string
  /** 이번 달·지난달 편지 수(들어온 것 + 나간 것) */
  letters: number
  last?: { title?: string; at: number; dir: 'in' | 'out' }
  inbound: boolean
  wake: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
/** `20261009-201500-…` → 그 로컬 시각(ms). 날짜로 시작하지 않으면 NaN */
export function stampMs(id: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id)
  if (!m) return NaN
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime()
}
/** 편지의 시각 — 머리말 `created` 가 정본, 없으면 id, 그것도 없으면 파일 시각 */
export function letterAt(created: string | undefined, id: string, mtime: number): number {
  const c = created ? Date.parse(created) : NaN
  if (Number.isFinite(c)) return c
  const s = stampMs(id)
  return Number.isFinite(s) ? s : mtime
}

/** 스레드 순서 — 시각 오름차순, 같으면 id. 최근 `limit` 통만 */
export function orderThread(list: LetterView[], limit = 150): LetterView[] {
  return [...list].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(-limit)
}

/**
 * 상대가 내 편지를 읽었나 — 상대 커서 `{ last, at }` 의 `last` 가 그 편지 id 보다 같거나 뒤면 읽은 것이다(README «커서»).
 * id 는 시각으로 시작하므로 글자 순서가 곧 시간 순서다. 커서가 없으면 아무것도 안 읽은 것으로 둔다.
 */
export function markRead(out: LetterView[], cursor: { last?: string; at?: number } | null): LetterView[] {
  if (!cursor?.last) return out
  const last = cursor.last
  return out.map((l) => (l.dir === 'out' && l.id <= last ? { ...l, readAt: cursor.at } : l))
}

/**
 * 안 읽은 편지 수 — 사람이 스레드를 마지막으로 연 시각 뒤에 **도착한** «들어온» 편지.
 * 도착 = 채널 세션에 넣은 시각(`delivered`) → 호스트가 처음 본 시각(`seen(id)`) → 쓴 시각 순. 처음 켤 때 «본 것» 으로 적은 편지는 세지 않는다.
 * ⚠ 쓴 시각(created)만 보면 Dropbox 가 늦게 내려 준 편지·시계가 다른 상대의 편지가 영영 안 읽음이 안 된다.
 */
export function unreadOf(list: Pick<LetterView, 'id' | 'dir' | 'at' | 'delivered' | 'baseline'>[], seenAt: number, seen?: (id: string) => number | undefined): number {
  return list.filter((l) => l.dir === 'in' && !l.baseline && Math.max(l.delivered ?? 0, seen?.(l.id) ?? 0, l.at) > seenAt).length
}

/**
 * 상대 아이콘 — 폴더 봇과 같은 얼굴·배지에 **몸만 말풍선**(2026-10-19 Dave «B 말풍선» · 목업 `03_디자인/2026-10-19_연결-스레드-목업/연결-통일성-목업.html`).
 * 몸 색은 봇과 같은 12색 판에서 — `bridges.yml` 의 `color:` 가 있으면 그것, 없으면 id 로 정해 기기마다 같다.
 * ⛔ 옛 «어두운 칸에 이모지» 는 버렸다 — 레일에서 혼자 다른 앱처럼 보였다(Dave «통일성이 없잖아»).
 */
export function peerColor(id: string, color?: string): string {
  if (color && colorAllowed(color)) return color.toLowerCase()
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE_HEX[h % PALETTE_HEX.length]
}

/**
 * 상대 얼굴 — 봇 얼굴과 같은 말(`FolderBot` 의 Mood). 무거운 것부터:
 * 끊김 → 오류 · 사람 결정이 붙은 안 읽은 편지 → 확인 · 안 읽은 편지 → 끝남(+링) · 내 편지를 상대가 아직 안 읽음 → 기다림 · 그 밖 → 쉼.
 * 쉬는 상대에는 배지가 없다 — 옛 화면의 «늘 붙은 초록 점» 은 뜻이 없었다.
 */
export type PeerMood = 'idle' | 'hold' | 'wait' | 'done' | 'error'
export function peerMood(p: Pick<PeerView, 'stale' | 'needs' | 'unread' | 'pending'>): PeerMood {
  if (p.stale) return 'error'
  if (p.needs > 0) return 'wait'
  if (p.unread > 0) return 'done'
  if (p.pending) return 'hold'
  return 'idle'
}

/** «3분 전» · «2시간 전» · «3일 전» — 끊김·마지막 신호 표시용 */
export function agoText(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms)
  if (d < 60_000) return '방금'
  if (d < 3600_000) return `${Math.floor(d / 60_000)}분`
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}시간`
  return `${Math.floor(d / 86400_000)}일`
}

/* ── 새 연결 마법사 (BQ-10 · 목업 ②A) ─────────────────────────────────────── */

export type PresetId = 'grok-bot' | 'generic-file' | 'webhook'
export interface Preset {
  id: PresetId
  icon: string
  title: string
  /** 카드 아래 한 줄 — 목업 문구 그대로 */
  sub: string
  /** 처음 채워 둘 이름·id */
  name: string
  peerId: string
  expectEvery?: string
  inbound: boolean
  wake: boolean
}
export const PRESETS: readonly Preset[] = [
  { id: 'grok-bot', icon: '✅', title: 'Grok Bot 루틴', sub: '클라우드 비서 · 셸 또는 Dropbox 커넥터로 파일을 쓴다 · 끊김 감지 150분', name: 'Grok 비서', peerId: 'grok', expectEvery: '150m', inbound: false, wake: false },
  { id: 'generic-file', icon: '📄', title: '파일만 쓰는 상대', sub: '다른 맥 스크립트·자동화 · 폴더만 같이 보면 된다', name: '파일 상대', peerId: 'files', inbound: false, wake: false },
  { id: 'webhook', icon: '🔗', title: '웹훅 상대', sub: 'n8n·Zapier 처럼 HTTP 로 넣는 상대 · 같은 tailnet 에서만', name: '자동화', peerId: 'automation', inbound: true, wake: false },
]
export const presetOf = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[1]

/** 폴더 이름으로 쓸 수 있게 — 경로 구분자·앞 점·제어 문자를 걷는다 */
export function folderSafe(name: string): string {
  return name.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/^\.+/, '').replace(/\s+/g, ' ').trim()
}

/**
 * 추천 우편함 자리 — 목업 ②A 의 예(`2. Area/비서/싱크`)를 일반화했다: **상시 영역(Area) 칸 아래 «상대 이름/싱크»**.
 * 상대와 주고받는 일은 끝나는 날이 없는 «상시 운영» 이라 Area 에 둔다. 볼트 규칙에 Area 칸이 없으면(Johnny Decimal 등) 루트의 `연결/`.
 */
export function defaultMailbox(rules: FolderRules | null, name: string): string {
  const leaf = folderSafe(name) || '상대'
  const act = rules?.roles.active ?? []
  const parents = act.map((g) => g.replace(/\/\*+$/, '')).filter((g) => g && !g.includes('*'))
  const area = parents.find((g) => /area|영역/i.test(g)) ?? (parents.length > 1 ? parents[parents.length - 1] : undefined)
  return `${area ?? '연결'}/${leaf}/싱크`
}

/** 우편함 경로 검사 — 볼트 안 상대 경로만(절대 경로·`..`·숨김 폴더 금지). 문제가 없으면 null */
export function mailboxProblem(mb: string): string | null {
  const t = mb.trim().replace(/\/+$/, '')
  if (!t) return '우편함 폴더를 정해 주세요'
  if (t.startsWith('/') || /^[a-z]:/i.test(t) || t.startsWith('~')) return '볼트 안의 폴더만 쓸 수 있어요(볼트 기준 경로)'
  if (t.split('/').some((s) => s === '..' || s === '.' || !s.trim())) return '경로에 .. 이나 빈 칸을 쓸 수 없어요'
  if (t.split('/').some((s) => s.startsWith('.'))) return '숨김 폴더(점으로 시작) 안에는 만들 수 없어요'
  return null
}

/** 다른 상대와 안 겹치는 id — `grok` 이 있으면 `grok-2` */
export function freeId(want: string, taken: string[]): string {
  const base = idSlug(want) === 'x' && !/^x$/i.test(want) ? 'peer' : idSlug(want)
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`
}

export interface NewBridge {
  preset: PresetId
  id: string
  name: string
  icon: string
  mailbox: string
  deliverBot: string
  trust: Trust
  /** 이 호스트 이름 — 두 맥이 같은 볼트를 열어도 한 번만 가져가게 */
  host?: string
  /** 만든 시각 — 이 뒤에 쓰인 편지부터 넣는다 */
  since?: string
  expectEvery?: string
  inbound?: boolean
  wake?: boolean
}

/** 마법사 입력 검사 — 문제 목록(비면 통과) */
export function newBridgeProblems(b: NewBridge, taken: { ids: string[]; mailboxes: string[] }): string[] {
  const out: string[] = []
  if (!b.id || idSlug(b.id) !== b.id) out.push('id 는 소문자 영문·숫자·하이픈이어야 해요(편지 파일 이름에 들어가요)')
  else if (taken.ids.includes(b.id)) out.push(`id «${b.id}» 는 이미 있어요`)
  if (!b.name.trim()) out.push('이름을 정해 주세요')
  const mp = mailboxProblem(b.mailbox); if (mp) out.push(mp)
  else if (taken.mailboxes.some((m) => m.replace(/\/+$/, '').normalize('NFC') === b.mailbox.trim().replace(/\/+$/, '').normalize('NFC'))) out.push('다른 연결이 이미 그 우편함을 써요 — 한 우편함은 한 상대만')
  if (!TRUSTS.includes(b.trust)) out.push('신뢰 수준은 read · propose · act 중 하나예요')
  if (!b.deliverBot.trim()) out.push('편지를 받을 봇을 정해 주세요')
  if (b.expectEvery && parseDuration(b.expectEvery) === null) out.push('끊김 감지는 150m · 2h 처럼 적어 주세요')
  return out
}

/**
 * `.claude/bridges.yml` 에 연결 하나를 덧붙인 새 글 — 사람이 적어 둔 주석·다른 키는 그대로 둔다(yaml Document).
 * 파일이 없으면 머리 주석과 함께 새로 쓴다.
 */
export function addBridgeYaml(text: string | null, b: NewBridge): string {
  const entry: Record<string, unknown> = {
    id: b.id, name: b.name.trim(), icon: b.icon || '✉️', preset: b.preset,
    mailbox: b.mailbox.trim().replace(/\/+$/, ''),
    deliver_to: { bot: b.deliverBot, session: `${b.icon || '✉️'} ${b.name.trim()} 채널` },
    may_send: [b.deliverBot],
    trust: b.trust,
    ...(b.host ? { host: b.host } : {}),
    ...(b.since ? { since: b.since } : {}),
    ...(b.expectEvery ? { expect_every: b.expectEvery } : {}),
    ...(b.wake ? { wake: true } : {}),
    ...(b.inbound ? { inbound: true } : {}),
  }
  if (!text || !text.trim()) {
    const doc = parseDocument('bridges: []\n')
    doc.commentBefore = ' 연결(Bridge) — 바깥 상대와 편지 파일로 대화한다. 설정 › 연결 에서 만들었다. 규약은 각 우편함의 README.md'
    ;(doc.get('bridges') as YAMLSeq).add(doc.createNode(entry))
    ;(doc.get('bridges') as YAMLSeq).flow = false
    return doc.toString({ lineWidth: 0 })
  }
  const doc = parseDocument(text)
  if (doc.errors.length) throw new Error(`bridges.yml 을 못 읽어서 덧붙이지 않았어요 — ${doc.errors[0].message}`)
  if (doc.contents === null || doc.contents === undefined) doc.contents = doc.createNode({}) as never
  let seq = doc.get('bridges')
  if (!isSeq(seq)) { doc.set('bridges', doc.createNode([])); seq = doc.get('bridges') }
  ;(seq as YAMLSeq).flow = false
  ;(seq as YAMLSeq).add(doc.createNode(entry))
  return doc.toString({ lineWidth: 0 })
}

/** 상대에게 줄 한 줄 — 목업 ②A ③ 문구 그대로 */
export function handoffLine(mailbox: string): string { return `${mailbox.trim().replace(/\/+$/, '')}/README.md 를 읽고 그대로 따라 해 줘.` }

/**
 * 우편함 README — 규약(FBMF v1) + 이 상대용 예시. 상대는 이것만 읽고 따라 한다.
 * ⚠ 볼트에 이미 README 가 있으면 덮지 않는다(호스트가 판단) — 사람이 고쳐 둔 규약이 정본이다.
 */
export function mailboxReadme(b: NewBridge, o: { deliverName: string; port?: number; now?: Date }): string {
  const mb = b.mailbox.trim().replace(/\/+$/, '')
  const d = o.now ?? new Date()
  const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  const ex = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}00-${b.id}-a3f9`
  const lines = [
    `# 우편함 규약 — FBMF v1 (Folder Bot Message Format)`,
    '',
    `> 이 파일이 규약 정본이다. Folder Bot 설정 › 연결 에서 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 에 만들었다. **이 파일만 읽고 따라 하면 된다.**`,
    `> 이 우편함의 상대는 **${b.name.trim()}**(id \`${b.id}\`) 하나다. Folder Bot 쪽 창구는 **${o.deliverName}** 이다.`,
    '',
    '## 왜 편지 파일인가',
    '',
    'Folder Bot 화면을 대신 눌러 말을 넣는 길은 잘 깨지고 위험하다. 그래서 **편지 한 통 = 파일 하나**로 주고받는다. **한 파일은 한 쪽만 쓴다** — Dropbox 처럼 여러 기기가 같은 폴더를 봐도 충돌이 나지 않는다.',
    '',
    '## 폴더',
    '',
    '| 폴더 | 누가 쓰나 | 무엇 |',
    '|---|---|---|',
    `| \`to-folderbot/YYYY-MM/\` | **${b.name.trim()}만** | ${b.name.trim()} → Folder Bot 편지 |`,
    '| `from-folderbot/YYYY-MM/` | **Folder Bot 만** | Folder Bot → 상대 편지 |',
    `| \`cursors/\` | 각자 자기 파일만 | \`${b.id}.json\` = ${b.name.trim()}가 어디까지 읽었나 · \`folderbot.json\` = Folder Bot 이 어디까지 읽었나 |`,
    '',
    '- 편지는 처음부터 그 달 폴더에 쓴다. 다 읽은 편지도 **옮기지 않고 지우지 않는다.** 읽었다는 표시는 커서로만 한다.',
    '- Dropbox 를 쓰면 이 폴더를 «오프라인 사용 가능»으로 둔다(온라인 전용 자리표시 파일은 읽을 때 늦다).',
    '',
    '## 편지 파일',
    '',
    `**파일 이름 = 편지 id + \`.md\`.** id 는 ASCII 만 쓴다: \`YYYYMMDD-HHMMSS-<보낸쪽>-<4자리 16진>\` — 예: \`${ex}.md\``,
    '(한글 파일 이름은 맥에서 NFC·NFD 로 갈려 회신 짝이 안 맞는다. 한글 제목은 머리말 `title:` 에 쓴다.)',
    '',
    '```markdown',
    '---',
    'fbmf: 1',
    `id: ${ex}`,
    `from: ${b.id}`,
    `to: ${b.deliverBot}`,
    'kind: request',
    'title: 확인 부탁',
    're: 20261009-140000-orch-1b2c      # 회신일 때만',
    'urgent: false                      # true = 바로 봐야 함',
    'needs_human: false                 # true = 사람 결정이 필요함',
    `created: ${isoLocal(d)}   # «쓴» 시각`,
    '---',
    '본문. 짧게 쓴다. 긴 자료는 경로로 건다.',
    '```',
    '',
    '| kind | 뜻 |',
    '|---|---|',
    '| `request` | 해 달라는 부탁. 받는 쪽이 `reply` 로 답한다 |',
    '| `reply` | 앞 편지(`re:`)에 대한 답 |',
    '| `report` | 알아야 할 사실. 답이 필요 없다 |',
    '| `done` | 끝난 일. 같은 일의 앞 편지가 있으면 `re:` 로 건다 |',
    '| `incident` | 장애 |',
    '| `briefing` | 정기 브리핑 |',
    '',
    '- **고치지 않는다.** 틀렸으면 새 편지를 쓰고 `re:` 로 건다.',
    '- 머리말 없는 편지도 받는다(`kind: request` 로 본다). 그래도 머리말을 쓰는 게 원칙이다.',
    '- **반쯤 쓴 파일을 보이지 않게** — 점으로 시작하는 임시 이름(`.x.tmp`)에 다 쓴 뒤 최종 이름으로 옮긴다.',
    '- 편지에 개인 연락처·계좌번호·키를 쓰지 않는다.',
    `- Folder Bot 쪽 편지의 \`from\` — \`${b.deliverBot}\`(받는 봇) · \`folderbot:<봇 id>\`(다른 폴더 봇) · \`human\`(Folder Bot 을 쓰는 사람이 화면에서 직접 쓴 편지).`,
    '',
    '## 커서',
    '',
    '```json',
    `{ "last": "${ex.replace(`-${b.id}-`, `-${idSlug(b.deliverBot)}-`)}", "at": "${isoLocal(d)}" }`,
    '```',
    '',
    `- ${b.name.trim()}는 \`from-folderbot/\` 을 읽은 뒤 \`cursors/${b.id}.json\` 을 갱신한다. 읽을 편지가 없어도 \`at\` 을 갱신한다 — **이 시각이 곧 하트비트다.**${b.expectEvery ? ` ${b.expectEvery} 넘게 안 바뀌면 Folder Bot 이 «상대 끊김» 으로 본다.` : ''}`,
    `- 덮어쓰기를 못 하는 도구로는 \`cursors/${b.id}/<YYYYMMDD-HHMMSS>.json\` 처럼 새 파일을 만든다. 가장 최근 것을 쓴다.`,
    '- 늦게 내려온 옛 편지를 놓치지 않게, 커서보다 24시간 앞부터 다시 훑고 이미 처리한 id 는 건너뛴다.',
    '- Folder Bot 은 받은 편지를 처리하면 `cursors/folderbot.json` 을 갱신한다(15분마다 하트비트도).',
    '',
  ]
  if (b.preset === 'grok-bot') lines.push(
    '## Grok 루틴에서 쓰는 법',
    '',
    '- 루틴이 돌 때마다: ① `from-folderbot/` 의 이번 달·지난달 폴더에서 커서 뒤 편지를 읽는다 ② 할 일이 있으면 `to-folderbot/<달>/` 에 편지를 쓴다 ③ 커서를 갱신한다.',
    '- **Mac 셸이 닿으면** 셸로 쓴다 — 임시 파일에 쓰고 `mv` 로 옮긴다.',
    '- **셸이 끊기면 Dropbox 커넥터로 «새 파일 만들기»만** 한다(덮어쓰기·삭제·이동은 하지 않는다). 커서도 `cursors/' + b.id + '/<시각>.json` 새 파일로.',
    `- 편지는 Folder Bot 의 «${b.icon} ${b.name.trim()} 채널» 세션으로 들어간다. 그 세션은 신뢰 수준 \`${b.trust}\` 의 울타리 안에서 답한다.`,
    '',
  )
  if (b.preset === 'generic-file') lines.push(
    '## 스크립트에서 쓰는 법',
    '',
    '```bash',
    `MB="<볼트>/${mb}"; ID="$(date +%Y%m%d-%H%M%S)-${b.id}-$(openssl rand -hex 2)"`,
    `mkdir -p "$MB/to-folderbot/${ym}"`,
    `printf -- '---\\nfbmf: 1\\nid: %s\\nfrom: ${b.id}\\nkind: report\\ntitle: 백업 끝\\n---\\n오늘 백업이 끝났어요.\\n' "$ID" > "$MB/to-folderbot/${ym}/.$ID.tmp"`,
    `mv "$MB/to-folderbot/${ym}/.$ID.tmp" "$MB/to-folderbot/${ym}/$ID.md"`,
    '```',
    '',
  )
  if (b.preset === 'webhook') lines.push(
    '## 웹훅으로 넣는 법',
    '',
    `파일을 못 쓰는 상대는 HTTP 로 넣는다. 받은 내용은 Folder Bot 이 \`to-folderbot/\` 에 편지 파일로 만들고, 그 뒤는 파일로 온 편지와 같다.`,
    '',
    '```bash',
    `curl -X POST http://<호스트 맥의 tailnet 주소>:${o.port ?? 7373}/api/bridges/${b.id}/messages \\`,
    `  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \\`,
    `  -d '{"kind":"report","title":"주문 들어옴","text":"새 주문 1건","urgent":false}'`,
    '```',
    '',
    `- 토큰은 호스트 맥의 \`~/.config/secrets/folderbot-bridge-${b.id}-in.env\` 에 \`TOKEN=…\`(16자 이상 · 권한 0600)으로 둔다. Folder Bot 은 이 파일을 만들지 않는다 — 사람이 만든다.`,
    '- **이 맥과 같은 tailnet 에서 온 요청만** 받는다. 공개 주소로 열지 않는다. 상대마다 시간당 60통까지다.',
    '- Folder Bot 이 보내는 답은 여전히 `from-folderbot/` 의 파일이다.',
    '',
  )
  if (b.wake) lines.push(
    '## 깨우기',
    '',
    `Folder Bot 이 급한 편지(\`urgent: true\`)를 쓰면 상대 웹훅을 부른다. 본문은 보내지 않고 \`{id, kind, path, urgent, needs_human}\` 만 보낸다. 주소·키는 호스트 맥의 \`~/.config/secrets/folderbot-bridge-${b.id}.env\`(\`URL=…\` · \`TOKEN=…\` · 권한 0600)에 사람이 둔다.`,
    '',
  )
  return lines.join('\n')
}
