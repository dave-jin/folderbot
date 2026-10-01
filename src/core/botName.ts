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

/**
 * 레일 «마감일» 정렬의 열쇠 (2026-10-01 Dave: *«'이름' 소팅 대신 '마감일' 소팅으로»*).
 * 폴더명 날짜는 볼트 규칙상 **마감일**이다. 정밀도가 낮으면 그 기간의 **끝날**로 본다 —
 * `2026-10` 은 10/31, `2026` 은 12/31. 그래야 «10월 중» 이 «10/5» 보다 뒤에 선다.
 * 날짜가 없으면(Area 폴더·규칙 밖 이름) `null`.
 */
export function dueEnd(due?: { date: string; precision: Precision } | null): string | null {
  if (!due || due.precision === 'none' || !due.date) return null
  const [y, mo, d] = due.date.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (due.precision === 'day') return `${y}-${pad(mo)}-${pad(d)}`
  if (due.precision === 'month') return `${y}-${pad(mo)}-${pad(new Date(y, mo, 0).getDate())}`
  return `${y}-12-31`
}

/**
 * 마감이 가까운 것부터 — 지난 마감이 맨 위(아직 안 닫힌 일이다), 날짜 없는 폴더는 뒤에 이름순.
 * 마감이 같으면 날이 박힌 쪽 → 이름순으로 묶어 자리가 흔들리지 않게 한다.
 */
export function byDue<T extends { name: string; due?: { date: string; precision: Precision } | null }>(a: T, b: T): number {
  const ka = dueEnd(a.due), kb = dueEnd(b.due)
  if (ka !== kb) { if (ka === null) return 1; if (kb === null) return -1; return ka < kb ? -1 : 1 }
  const pr = { day: 0, month: 1, year: 2, none: 3 }   // 끝날이 같으면 날이 박힌 쪽이 먼저(10/31 이 «10월» 보다 앞)
  const dp = pr[a.due?.precision ?? 'none'] - pr[b.due?.precision ?? 'none']; if (dp) return dp
  return a.name.localeCompare(b.name, 'ko', { numeric: true, sensitivity: 'base' })
}
