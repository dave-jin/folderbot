/**
 * 레일 이름 파생 (F · 2026-09-19 Dave 1안 확정 — «폴더명은 마감 데이터라 바꿀 수 없으니 표시 이름만 따로 만든다»).
 *
 * 폴더명 `YYYY[-MM[-DD]]_[타입-]이름` 을 **파싱만** 한다 — 항상 같은 결과, 비용 0, 폴더명과 어긋날 일 없음.
 *  - date: `_` 앞까지. 세 정밀도(연·월·일). 달·날이 범위 밖이면 규칙 밖으로 본다.
 *  - type: `_` 뒤 첫 `-` 앞 조각이 **타입 목록**에 있을 때만 뗀다(«멋사» 는 타입이 아니다).
 *  - title: 나머지. `-` 는 공백으로. ⛔ 빈 title 은 없다 — 규칙 밖 이름은 통째로 title 이다.
 * 정렬·검색·`rel` 은 폴더명 기준 그대로다. 여기서 만든 것은 **표시** 뿐이다.
 */
export type Precision = 'day' | 'month' | 'year' | 'none'
export interface ParsedName { date: string; precision: Precision; type: string; title: string }

/** 볼트 규칙 yaml 에 `types:` 가 없을 때 쓰는 기본 목록 */
export const DEFAULT_TYPES = ['강의', '컨설팅', '코칭', '멘토링', '모임', '행사', '책쓰기', '자격증']

const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

function validDate(y: number, m?: number, d?: number): boolean {
  if (m !== undefined && (m < 1 || m > 12)) return false
  if (d !== undefined) { const last = new Date(y, m!, 0).getDate(); if (d < 1 || d > last) return false }
  return true
}

export function parseFolderName(name: string, types: string[] = DEFAULT_TYPES): ParsedName {
  const raw = name.normalize('NFC')
  const none: ParsedName = { date: '', precision: 'none', type: '', title: raw }
  const us = raw.indexOf('_')
  if (us <= 0 || us === raw.length - 1) return none
  const head = raw.slice(0, us), rest = raw.slice(us + 1)
  const m = DATE_RE.exec(head); if (!m) return none
  const y = Number(m[1]), mo = m[2] === undefined ? undefined : Number(m[2]), d = m[3] === undefined ? undefined : Number(m[3])
  if (!validDate(y, mo, d)) return none
  const precision: Precision = d !== undefined ? 'day' : mo !== undefined ? 'month' : 'year'
  const dash = rest.indexOf('-')
  const first = dash > 0 ? rest.slice(0, dash) : ''
  let type = '', body = rest
  if (first && types.includes(first)) { type = first; body = rest.slice(dash + 1) }
  const title = body.replace(/-+/g, ' ').replace(/\s+/g, ' ').trim() || rest
  return { date: head, precision, type, title }
}

export interface DueChip { text: string; tone: 'normal' | 'soon' | 'past' }

/** 날짜 칩 — 정밀도별 `M/D D-n` · `M월` · `YYYY`. 지난 날짜는 «지남» 흐림, D-3 이내는 강조 */
export function dueChip(date: string, precision: Precision, today = new Date()): DueChip | null {
  if (precision === 'none' || !date) return null
  const [y, mo, d] = date.split('-').map(Number)
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (precision === 'day') {
    const due = new Date(y, mo - 1, d)
    const days = Math.round((due.getTime() - t0.getTime()) / 86_400_000)
    if (days < 0) return { text: `${mo}/${d} 지남`, tone: 'past' }
    return { text: `${mo}/${d} ${days === 0 ? 'D-day' : `D-${days}`}`, tone: days <= 3 ? 'soon' : 'normal' }
  }
  if (precision === 'month') {
    const past = y < t0.getFullYear() || (y === t0.getFullYear() && mo < t0.getMonth() + 1)
    return { text: `${mo}월`, tone: past ? 'past' : 'normal' }
  }
  return { text: String(y), tone: y < t0.getFullYear() ? 'past' : 'normal' }
}
