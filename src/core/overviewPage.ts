import { goalOf, recentOf } from './overview'

/**
 * 🔴 **폴더 개요 한 장** (2026-11-15 Dave 카드 — 자리는 «문서 칸» · 채우는 법은 «파일에서 그대로»).
 *
 * 11/12 기획이 적은 실패 모습은 «개요가 원본과 다른 말을 한다(봇이 진행률을 지어낸다)» 였다.
 * 그래서 **모델을 부르지 않는다.** 폴더에 이미 적힌 줄을 그대로 옮기고, 덩이마다 어느 파일에서 왔는지를 적는다.
 * 파일에 없는 것은 비워 두고 «없다» 고 말한다 — 채워 넣지 않는다.
 *
 * | 덩이 | 어디서 |
 * |---|---|
 * | 목적 | `CLAUDE.md` 의 «목적» 절 첫 문단 |
 * | 어디까지 왔나 | `state.md` 의 «완료» · «진행 중» · «다음 작업» 절의 줄 |
 * | 내가 나설 곳 | 내 답을 기다리는 세션 · `todo.md` 의 열린 할 일(마감 순) · 제안 수 · 기다리는 일(일반 불릿) |
 * | 최근 만든 것 | 대화에 남은 «파일» 칩 — 이 폴더의 봇이 지난 7일에 쓴 파일 |
 * | 이어진 곳 | 연결 지도의 이웃과 «지난 일에서 가져다 쓸 것» |
 *
 * 🔴 계산은 여기 한 곳이다(호스트가 불러 쓰고 화면은 받아 그린다).
 */

/** 문서 칸의 가짜 경로 — 파일이 아니다. 탭 이름은 «개요» 로 보인다 */
export const OVERVIEW_REL = ':overview'
export const isOverviewRel = (rel: string | null | undefined): boolean => rel === OVERVIEW_REL

export const OV_DONE_MAX = 2
export const OV_ROW_MAX = 3
export const OV_TODO_MAX = 4
export const OV_RECENT_MAX = 6
export const OV_RECENT_DAYS = 7
export const OV_LINK_MAX = 6
/** state.md 가 이만큼 안 바뀌었으면 한 장 맨 위에 알린다 */
export const OV_STALE_DAYS = 3
const CLIP = 90

export interface OvRow { text: string; full?: string; /** 줄 끝의 작은 이름표 — 기다리는 일의 갈래(«확인 필요» · «기다리는 일») */ tag?: string }
export interface OverviewPage {
  /** 한 장의 지문 — 이 값이 달라지면 «그 뒤 바뀐 것이 있어요 · 다시 읽기» */
  ver: string
  purpose?: string
  goal?: string
  /** 출처 파일과 마지막으로 바뀐 시각(없는 파일은 at: null) */
  sources: { name: string; at: number | null }[]
  /** state.md 가 OV_STALE_DAYS 넘게 안 바뀌었다 — 지난 날 수 */
  staleDays?: number
  progress: { done: OvRow[]; doneTotal: number; doing: OvRow[]; doingTotal: number; next: OvRow[]; nextTotal: number; /** state.md 에 그 절이 있나 */ has: { done: boolean; doing: boolean; next: boolean } }
  mine: { asks: { id: string; name: string }[]; todos: { title: string; due?: string; line: number }[]; openTotal: number; proposed: number; waits: OvRow[] }
  recent: { rel: string; at: number }[]
  links: { id: string; label: string; why: string; botId?: string }[]
  past: { label: string; why: string; file?: string }[]
}

/** 굵게 · 코드 · 링크 · 체크 표시를 걷은 한 줄. ⚠ 밑줄(`_`)은 걷지 않는다 — 이 볼트의 경로(`01_받은자료`)가 깨진다 */
export function plainLine(s: string): string {
  return s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\[[ xX>~-]\]\s*/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*{1,3}|`/g, '').replace(/<!--.*?-->/g, '').replace(/\s+/g, ' ').trim()
}
const clip = (s: string): OvRow => (s.length > CLIP ? { text: s.slice(0, CLIP - 1).trimEnd() + '…', full: s } : { text: s })

/**
 * `## 제목` 절의 목록 줄을 읽는다 — 이름에 `key` 가 들어 있는 첫 절. 들여 쓴 하위 줄은 세지 않는다.
 * 절이 없으면 null(«없다» 와 «비었다» 는 다르다).
 */
export function sectionItems(md: string, key: RegExp): string[] | null {
  const lines = md.split('\n')
  let i = lines.findIndex((l) => /^##\s+/.test(l) && key.test(l))
  if (i < 0) return null
  const out: string[] = []
  for (i += 1; i < lines.length; i++) {
    const l = lines[i]
    if (/^##\s+/.test(l)) break
    if (/^(?:[-*+]|\d+[.)])\s+\S/.test(l)) { const t = plainLine(l); if (t) out.push(t) }
  }
  return out
}

/** `CLAUDE.md` 의 «목적» — `## … 목적` 절의 첫 문단. 없으면 undefined */
export function purposeOf(md: string): string | undefined {
  const lines = md.split('\n')
  const i = lines.findIndex((l) => /^#{1,3}\s+/.test(l) && /목적/.test(l))
  if (i < 0) return undefined
  const buf: string[] = []
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k].trim()
    if (/^#{1,6}\s+/.test(l)) break
    if (!l) { if (buf.length) break; continue }
    if (/^(?:[-*+]\s|>|\||\d+[.)]\s)/.test(l)) { if (buf.length) break; buf.push(plainLine(l.replace(/^>\s*/, ''))); break }
    buf.push(l)
  }
  const t = plainLine(buf.join(' '))
  return t ? (t.length > 240 ? t.slice(0, 239).trimEnd() + '…' : t) : undefined
}

/**
 * `todo.md` 의 «기다리는 일» — 체크박스가 아닌 일반 불릿(`- `) 가운데 **기다린다고 적힌 것만**.
 * 볼트 규약은 «남의 답을 기다리는 일은 체크박스로 쓰지 않는다» 인데, 실제 파일의 일반 불릿에는 메모와 원문 인용도 섞여 있다.
 * 그래서 ① «확인 필요 · 확인 대기 · 기다리는 일» 같은 머리 아래의 불릿이거나 ② 줄에 «기다리는 · 답 대기 · 회신 대기» 가 적힌 것만 옮긴다.
 * 메모를 «기다리는 일» 이라고 부르면 그것도 지어낸 말이다.
 */
const WAIT_HEAD = /기다리|확인 필요|확인 대기|답 대기|회신/
const WAIT_LINE = /기다리는|기다림|답 대기|회신 대기/
/** 머리가 «확인 필요» 면 그 이름 그대로, 그 밖은 «기다리는 일» — 파일이 부른 이름을 따른다 */
export const WAIT_TAG = '기다리는 일', CHECK_TAG = '확인 필요'
export function waitsOf(todoMd: string, max = 2): OvRow[] {
  const out: OvRow[] = []
  let done = false, inWait = false, tag = WAIT_TAG
  for (const l of todoMd.split('\n')) {
    const h = /^#{2,4}\s+(.*)$/.exec(l) ?? /^\*\*(.+)\*\*\s*$/.exec(l)
    if (h) { if (/^#/.test(l)) done = /완료/.test(h[1]); inWait = WAIT_HEAD.test(h[1]); tag = /확인 필요|확인 대기/.test(h[1]) ? CHECK_TAG : WAIT_TAG; continue }
    if (done) continue
    if (!/^- (?!\[[ xX]\])\S/.test(l)) continue
    if (!inWait && !WAIT_LINE.test(l)) continue
    const t = plainLine(l)
    if (t) out.push({ ...clip(t), tag: inWait ? tag : WAIT_TAG })
    if (out.length >= max) break
  }
  return out
}

export interface PageIn {
  claudeMd: string | null
  stateMd: string | null; stateAt?: number
  todoMd: string | null; todoAt?: number
  todos: readonly { line: number; done: boolean; title: string; proposed?: boolean; due?: string }[]
  asks: readonly { id: string; name: string }[]
  chips: readonly { t: number; paths: readonly string[] }[]
  root: string
  links: readonly { id: string; label: string; why: string; botId?: string }[]
  past: readonly { label: string; why: string; file?: string }[]
  now: number
}

export function buildOverviewPage(inp: PageIn): OverviewPage {
  const st = inp.stateMd
  const done = st ? sectionItems(st, /완료/) : null
  const doing = st ? sectionItems(st, /진행 중/) : null
  const next = st ? sectionItems(st, /다음 작업|다음 할 일/) : null
  const open = inp.todos.filter((t) => !t.done && !t.proposed)
  // 마감이 있는 것 먼저(이른 날부터) · 그다음 파일에 적힌 차례
  const sorted = [...open].sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : a.line - b.line))
  const since = inp.now - OV_RECENT_DAYS * 86_400_000
  const recent = recentOf(inp.chips.filter((c) => c.t >= since), inp.root, OV_RECENT_MAX)
  const staleDays = st && inp.stateAt ? Math.floor((inp.now - inp.stateAt) / 86_400_000) : 0
  const purpose = inp.claudeMd ? purposeOf(inp.claudeMd) : undefined
  const goal = st ? goalOf(st) : undefined
  const page: Omit<OverviewPage, 'ver'> = {
    ...(purpose ? { purpose } : {}),
    ...(goal ? { goal } : {}),
    sources: [{ name: 'state.md', at: st !== null ? inp.stateAt ?? null : null }, { name: 'todo.md', at: inp.todoMd !== null ? inp.todoAt ?? null : null }],
    ...(staleDays >= OV_STALE_DAYS ? { staleDays } : {}),
    progress: {
      done: (done ?? []).slice(0, OV_DONE_MAX).map(clip), doneTotal: done?.length ?? 0,
      doing: (doing ?? []).slice(0, OV_ROW_MAX).map(clip), doingTotal: doing?.length ?? 0,
      next: (next ?? []).slice(0, OV_ROW_MAX).map(clip), nextTotal: next?.length ?? 0,
      has: { done: done !== null, doing: doing !== null, next: next !== null }
    },
    mine: {
      asks: inp.asks.map((a) => ({ id: a.id, name: a.name })),
      todos: sorted.slice(0, OV_TODO_MAX).map((t) => ({ title: t.title, ...(t.due ? { due: t.due } : {}), line: t.line })),
      openTotal: open.length,
      proposed: inp.todos.filter((t) => !t.done && t.proposed).length,
      waits: inp.todoMd ? waitsOf(inp.todoMd) : []
    },
    recent,
    links: inp.links.slice(0, OV_LINK_MAX).map((l) => ({ ...l })),
    past: inp.past.slice(0, 2).map((p) => ({ ...p }))
  }
  return { ver: verOf(page), ...page }
}

/** 한 장의 지문 — 내용이 같으면 같은 값. (djb2 · 암호용이 아니다) */
export function verOf(page: Omit<OverviewPage, 'ver'>): string {
  const s = JSON.stringify(page)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export type OvChunk = 'progress' | 'mine' | 'recent' | 'links'
export const OV_CHUNK_TITLE: Record<OvChunk, string> = { progress: '어디까지 왔나', mine: '내가 나설 곳', recent: '최근 만든 것', links: '이어진 곳' }
export const OV_CHUNK_SRC: Record<OvChunk, string> = { progress: 'state.md', mine: '세션 · todo.md', recent: '지난 7일 · 이 폴더의 봇이 쓴 파일', links: '연결 지도' }

/** [이 부분 묻기] 로 붙는 덩이의 줄 — 화면이 보이는 것과 같은 줄을 봇에게 보낸다 */
export function chunkLines(page: OverviewPage, c: OvChunk): string[] {
  if (c === 'progress') return [...page.progress.done.map((r) => `✓ ${r.full ?? r.text}`), ...page.progress.doing.map((r) => `● 진행 중 — ${r.full ?? r.text}`), ...page.progress.next.map((r) => `○ 다음 — ${r.full ?? r.text}`)]
  if (c === 'mine') return [...page.mine.asks.map((a) => `내 답 기다림 — «${a.name}» 세션`), ...page.mine.todos.map((t) => `할 일 — ${t.title}${t.due ? ` (마감 ${t.due})` : ''}`), ...page.mine.waits.map((w) => `${w.tag ?? WAIT_TAG} — ${w.full ?? w.text}`), ...(page.mine.proposed ? [`봇의 제안 ${page.mine.proposed}`] : [])]
  if (c === 'recent') return page.recent.map((r) => r.rel)
  return [...page.links.map((l) => `${l.label} — ${l.why}`), ...page.past.map((p) => `지난 일 — ${p.label}${p.file ? ` · ${p.file}` : ''}`)]
}

/** 입력칸 위에 붙은 덩이 — 보낼 때 이 글이 내 말 아래에 인용으로 붙는다 */
export interface AskRef { title: string; src: string; lines: string[] }
export const ASK_REF_DEFAULT = '이 부분을 설명해 줘.'
export function withAskRef(text: string, ref: AskRef | null): string {
  if (!ref) return text
  const body = ref.lines.length ? ref.lines.map((l) => `> - ${l}`).join('\n') : '> (이 덩이는 비어 있어요)'
  return `${text.trim() || ASK_REF_DEFAULT}\n\n> **폴더 개요 · ${ref.title}** (${ref.src})\n${body}`
}
export const askRefOf = (page: OverviewPage, c: OvChunk): AskRef => ({ title: OV_CHUNK_TITLE[c], src: OV_CHUNK_SRC[c], lines: chunkLines(page, c) })
