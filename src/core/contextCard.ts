/**
 * 세션 요약 카드 — «맥락 상황판» 1단계 (2026-11-01).
 * 세션 하나가 **무엇을 하려 했고 · 무엇을 끝냈고(근거 포함) · 무엇을 약속했고 · 어떻게 끝났나** 를 한 장으로 줄인다.
 *
 * ⚠ **순수 모듈이다 — IO 도 모델 호출도 없다.** 프롬프트를 만들고 답을 읽을 뿐, 부르는 일은 뒤 과제가 한다.
 * ⛔ 요약에는 개인 값(주민번호·계좌·연락처·크리덴셜)을 싣지 않는다 — `maskSensitive` 가 파싱 결과의 모든 글 칸에 걸린다.
 */
import type { ChatItem } from './types'

/** 끝맺음 — 설계 §5-2. finished = 끝맺음 말 + 근거 있음 · claimed = 끝났다고 했지만 근거 없음 · cut = 끝맺음 없이 끊김 · waiting_dave = Dave 답 대기 · running = 아직 진행 중 */
export type Ending = 'finished' | 'claimed' | 'cut' | 'waiting_dave' | 'running'
export type EvidenceKind = 'file' | 'commit' | 'letter' | 'tool'
/** 파일·편지 = 볼트 상대 경로 · commit = 해시 · tool = ChatItem id */
export interface Evidence { kind: EvidenceKind; ref: string }
export interface DoneLine { text: string; ev: Evidence[] }
export type CardChannel = 'folder' | 'orch' | 'comm' | 'bridge' | 'routine'
export interface SessionCard {
  /** sessionId 또는 `${sessionId}#${seg}` */
  id: string; sessionId: string; seg?: number
  botId: string; channel: CardChannel; machine: string
  intent: string; done: DoneLine[]; promised: string[]; ending: Ending; taskHint: string
  from: number; to: number; cursor: string; updatedAt: number; llm: boolean
}
export type CardBody = Pick<SessionCard, 'intent' | 'done' | 'promised' | 'ending' | 'taskHint'> & { folder?: string }

/** 스텁이 이 표지로 갈래를 고른다 */
export const CARD_MARK = '[[folderbot:context-card]]'
/** 모델에 보내는 대화의 토큰 상한 — 글자로는 ×2 (한국어 한 토큰 ≈ 한두 글자) */
export const CARD_TOKEN_CAP = 20_000

const MASK = '[가림]'
const ENDINGS: readonly Ending[] = ['finished', 'claimed', 'cut', 'waiting_dave', 'running']
const KINDS: readonly EvidenceKind[] = ['file', 'commit', 'letter', 'tool']

// ── 마스킹 ────────────────────────────────────────────────────────────────────

const RE_RRN = /(?<![\d-])\d{6}-[1-4]\d{6}(?![\d-])/g
const RE_PHONE = /(?<![\d-])01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}(?![\d-])/g
/** 하이픈으로 이은 숫자 덩이 셋 이상 — 숫자 합 10자리 이상일 때만 계좌로 본다(아래 replacer) */
const RE_ACCOUNT = /(?<![\d-])\d{2,6}(?:-\d{2,8}){2,}(?![\d-])/g
const RE_KEY = /\b(?:(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*)/g
const RE_HEX = /(?<![0-9A-Za-z])[0-9a-fA-F]{32,}(?![0-9A-Za-z])/g

/**
 * 개인 값 가리기. ⚠ 날짜(`2026-11-01`)·버전(`v206`)·짧은 커밋 해시(`d8809db`)는 그대로 둔다.
 * 40자 16진수는 전체 커밋 해시라 가리지 않는다(근거 `commit` 의 ref 가 깨지지 않게).
 */
export function maskSensitive(s: string): string {
  return (s ?? '')
    .replace(RE_KEY, MASK)
    .replace(RE_RRN, MASK)
    .replace(RE_PHONE, MASK)
    .replace(RE_ACCOUNT, (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m) || m.replace(/\D/g, '').length < 10 ? m : MASK))
    .replace(RE_HEX, (m) => (m.length === 40 ? m : MASK))
}

// ── 대화 줄이기 ───────────────────────────────────────────────────────────────

/** 커서(마지막으로 요약한 item id) 뒤의 item. 커서가 없거나 못 찾으면 전부 */
export function itemsSince(items: ChatItem[], cursor?: string): ChatItem[] {
  if (!cursor) return items
  const i = items.findIndex((it) => it.id === cursor)
  return i < 0 ? items : items.slice(i + 1)
}

const LINE_MAX = 2000
const oneLine = (s: string, max = LINE_MAX): string => {
  const t = (s ?? '').replace(/\s*\n\s*/g, ' ⏎ ').trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

function lineOf(it: ChatItem): string | null {
  switch (it.kind) {
    case 'user': return `[사람] ${oneLine(it.text)}`
    case 'assistant': return `[봇] ${oneLine(it.text)}`
    case 'tool': return `[도구 ${it.name} ${it.isError ? '오류' : '성공'} #${it.id}] ${oneLine(it.summary)}`
    case 'subagent': return `[서브에이전트 ${it.name} ${it.status} #${it.id}] ${oneLine(it.result ?? it.last ?? '')}`
    case 'files': return `[파일] ${oneLine(it.paths.join(', '))}`
    case 'result': return `[턴 끝 ${it.ok ? '성공' : '오류'}]${it.error ? ' ' + oneLine(it.error, 300) : ''}`
    default: return null          // thinking · todos · rewind · system
  }
}

/**
 * 모델에게 보낼 대화 — 한 item 이 한 줄. 상한(`cap*2` 글자)을 넘으면 **앞을 버리고 뒤를 남긴다**
 * (끝맺음이 뒤에 있다). 버렸으면 첫 줄이 `(앞 N줄 생략)`.
 */
export function transcript(items: ChatItem[], cap = CARD_TOKEN_CAP): string {
  const lines = items.map(lineOf).filter((l): l is string => l !== null)
  const budget = cap * 2
  const all = lines.join('\n')
  if (all.length <= budget) return all
  const room = budget - 20              // 첫 줄(「(앞 N줄 생략)」)과 줄바꿈 자리
  const keep: string[] = []
  let used = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (used + lines[i].length + 1 > room) break
    keep.unshift(lines[i]); used += lines[i].length + 1
  }
  return [`(앞 ${lines.length - keep.length}줄 생략)`, ...keep].join('\n')
}

// ── 프롬프트 · 파싱 ───────────────────────────────────────────────────────────

/** Haiku 에게 보낼 말. 답은 JSON 하나만. 이전 카드가 있으면 그 위에 새 대화를 얹어 고치게 한다 */
export function cardPrompt(prev: CardBody | null, convo: string, meta: { folder: string; candidates?: { id: string; name: string }[] }): string {
  const withFolder = !!meta.candidates?.length
  const example: Record<string, unknown> = {
    intent: '이 세션이 하려던 일 한 문장',
    done: [{ text: '끝낸 일 한 줄', ev: [{ kind: 'file', ref: '1. Projects/폴더/readme.md' }] }],
    promised: ['Dave 나 봇이 하겠다고 한 일'],
    ending: 'finished',
    taskHint: '이 세션이 속한 일감 이름'
  }
  if (withFolder) example.folder = '후보 id 하나'
  return [
    CARD_MARK,
    '아래 대화를 읽고 이 세션의 «요약 카드» 를 만들어 줘.',
    `이 세션의 폴더: ${meta.folder}`,
    '',
    '규칙',
    '- JSON 객체 하나만 답해. 앞뒤 설명·코드 울타리·머리말은 쓰지 마.',
    '- 대화에 없는 것은 쓰지 말 것. 모르면 비울 것(빈 문자열이나 빈 배열). 짐작으로 채우지 마.',
    '- 한국어로, 각 칸은 한 문장 안쪽으로 짧게.',
    '- 주민번호·계좌번호·연락처·비밀번호·토큰 같은 개인 값은 요약에 쓰지 마.',
    '',
    '칸',
    '- intent: 이 세션이 하려던 일.',
    '- done: 실제로 끝난 일. 줄마다 근거 ev 가 있어야 해. 근거 kind 는 file | commit | letter | tool 넷뿐.',
    '  - file = 만들거나 고친 파일의 볼트 상대 경로 · commit = 커밋 해시 · letter = 보낸 편지의 볼트 상대 경로',
    '  - tool = 대화에 보이는 도구 줄의 `#<id>` 에서 id 만(예: `#t12` 면 `t12`)',
    '  - 근거를 댈 수 없는 일은 done 에 넣지 말고 promised 로 보내.',
    '- promised: 하겠다고 했지만 아직 안 끝난 일.',
    '- ending: 이 세션이 어떻게 끝났나. 다섯 값 중 하나.',
    '  - finished = 끝맺음 말이 있고 근거도 있다',
    '  - claimed = 끝났다고 했지만 근거가 없다',
    '  - cut = 끝맺음 없이 끊겼다',
    '  - waiting_dave = Dave 의 답을 기다리는 중이다',
    '  - running = 아직 진행 중이다',
    '- taskHint: 이 세션이 속한 일감을 부를 짧은 이름.',
    ...(withFolder ? [
      '- folder 칸: 이 세션이 실제로 다룬 폴더를 아래 후보에서 골라 id 만 써. 맞는 것이 없으면 빈 문자열.',
      ...meta.candidates!.map((c) => `  - ${c.id}: ${c.name}`)
    ] : []),
    '',
    '형식 예시',
    JSON.stringify(example),
    '',
    ...(prev ? [
      '지난 카드(JSON) — 이번 대화로 바뀐 것만 고쳐서 새 카드를 내. 지난 done 은 이번 대화가 뒤집지 않으면 그대로 둬.',
      JSON.stringify(prev),
      ''
    ] : []),
    '대화',
    convo
  ].join('\n')
}

const text = (v: unknown): string => (typeof v === 'string' ? maskSensitive(v).trim() : '')

function toBody(o: unknown): CardBody | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  if (typeof r.ending !== 'string' || !ENDINGS.includes(r.ending as Ending)) return null
  const done: DoneLine[] = (Array.isArray(r.done) ? r.done : []).flatMap((d: unknown) => {
    const x = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
    const t = text(x.text)
    if (!t) return []
    const ev: Evidence[] = (Array.isArray(x.ev) ? x.ev : []).flatMap((e: unknown) => {
      const y = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
      const ref = text(y.ref)
      return KINDS.includes(y.kind as EvidenceKind) && ref ? [{ kind: y.kind as EvidenceKind, ref }] : []
    })
    return [{ text: t, ev }]
  })
  const body: CardBody = {
    intent: text(r.intent),
    done,
    promised: (Array.isArray(r.promised) ? r.promised : []).map(text).filter(Boolean),
    ending: r.ending as Ending,
    taskHint: text(r.taskHint)
  }
  const folder = text(r.folder)
  if (folder) body.folder = folder
  return body
}

/** 모델 답 → 카드 몸. 울타리·군말을 견딘다. 읽을 수 없거나 `ending` 이 다섯 값 밖이면 null */
export function parseCard(raw: string): CardBody | null {
  const s = raw ?? ''
  const cands: string[] = []
  for (const m of s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) cands.push(m[1])
  const last = s.lastIndexOf('}')
  if (last >= 0) {
    let i = s.indexOf('{')
    for (let n = 0; i >= 0 && i < last && n < 20; n++, i = s.indexOf('{', i + 1)) cands.push(s.slice(i, last + 1))
  }
  for (const c of cands) {
    let o: unknown
    try { o = JSON.parse(c) } catch { continue }
    if (o && typeof o === 'object' && !Array.isArray(o)) return toBody(o)
  }
  return null
}

// ── 루틴 카드 ─────────────────────────────────────────────────────────────────

/** 루틴이 마지막 줄에 쓰는 결과 — `결과: ok` · `결과: fail — 이유` · `결과: skip — 이유` (볼트 CLAUDE.md «핵심 규칙 ③») */
const RESULT_RE = /^[\s>*_`-]*결과\s*[:：]\s*(ok|fail|skip)\b(?:\s*[—–:-]+\s*(.*?))?[\s*_`]*$/i

/**
 * 루틴 세션은 모델 없이 카드를 만든다(`llm:false`) — 결과 줄이 이미 끝맺음이다.
 * ok = finished(근거는 그 글) · fail = cut · skip = finished(건너뛴 이유가 intent) · 결과 줄 없음 = claimed.
 */
export function routineCard(rec: { id: string; botId: string; items: ChatItem[]; lastActivity: number }, routine: string, machine: string, now: number): SessionCard {
  const items = rec.items
  let lastBot: Extract<ChatItem, { kind: 'assistant' }> | undefined
  for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.kind === 'assistant') { lastBot = it; break } }
  let verdict: 'ok' | 'fail' | 'skip' | null = null
  let reason = ''
  let summary = ''
  for (const line of (lastBot?.text ?? '').split('\n')) {
    const m = RESULT_RE.exec(line)
    if (m) { verdict = m[1].toLowerCase() as 'ok' | 'fail' | 'skip'; reason = (m[2] ?? '').trim() }
    else if (!summary && line.trim()) summary = line.replace(/^[\s#>*_`-]+/, '').trim().slice(0, 140)
  }
  const why = reason ? ` — ${reason}` : ''
  let ending: Ending
  let intent: string
  let done: DoneLine[] = []
  if (verdict === 'ok' && lastBot) {
    ending = 'finished'; intent = `${routine} 루틴 실행`
    done = [{ text: summary || `${routine} 루틴 완료`, ev: [{ kind: 'tool', ref: lastBot.id }] }]
  } else if (verdict === 'fail') { ending = 'cut'; intent = `${routine} 루틴 실패${why}` }
  else if (verdict === 'skip') { ending = 'finished'; intent = `${routine} 루틴 건너뜀${why}` }
  else { ending = 'claimed'; intent = `${routine} 루틴 — 결과 줄 없음` }
  return {
    id: rec.id, sessionId: rec.id, botId: rec.botId, channel: 'routine', machine,
    intent: maskSensitive(intent),
    done: done.map((d) => ({ text: maskSensitive(d.text), ev: d.ev })),
    promised: [], ending, taskHint: maskSensitive(`루틴 · ${routine}`),
    from: items[0]?.t ?? rec.lastActivity, to: rec.lastActivity,
    cursor: items[items.length - 1]?.id ?? '', updatedAt: now, llm: false
  }
}
