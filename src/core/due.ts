/**
 * 🔴 **CK-1 · 할 일 줄 하나의 마감** (2026-10-16 Dave 요청 · «추천대로» 확정 · 기획안 §2).
 * 표기는 줄 끝(표식 앞)의 `📅 YYYY-MM-DD` 하나 — 옵시디언 Tasks 와 같은 모양이라 어디서 열어도 뜻이 보인다.
 * 날짜만 쓴다(시각 없음 — Akiflow `deadline` 도 날짜만). **마감 = 바깥에서 정해진 날**이고 봇이 지어내지 않는다.
 * 사람 말(«내일»·«10/20»·«금요일»)을 날짜로 바꿀 때는 `when.ts` 처럼 **되읽어 확인**시킨다 — 「10월 20일(화) 마감」.
 * ⚠ 맨 숫자(«20»)는 날짜로 읽지 않는다 — 「회의실 3」 같은 줄이 마감을 얻으면 안 된다. 날짜는 «20일» 처럼 말한다.
 */
const DOW = '일월화수목금토'
const p2 = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => { const x = day0(d); x.setDate(x.getDate() + n); return x }
export const DUE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 「10월 20일(화)」 — 해가 다르면 해를 붙인다 */
export function dueText(date: string, today = new Date()): string {
  const [y, m, d] = date.split('-').map(Number); const w = DOW[new Date(y, m - 1, d).getDay()]
  return `${y !== today.getFullYear() ? `${y}년 ` : ''}${m}월 ${d}일(${w})`
}

/** 마감 칩 — `오늘`(주황) · `N일 지남`(빨강) · `내일`·`D-2`·`D-3`(강조) · 그 뒤는 `D-N`, 2주 넘으면 `M/D` */
export function dueChipOf(date: string, today = new Date()): { text: string; tone: 'today' | 'past' | 'soon' | 'normal' } | null {
  if (!DUE_RE.test(date ?? '')) return null
  const [y, m, d] = date.split('-').map(Number)
  const days = Math.round((new Date(y, m - 1, d).getTime() - day0(today).getTime()) / 86_400_000)
  if (days < 0) return { text: `${-days}일 지남`, tone: 'past' }
  if (days === 0) return { text: '오늘', tone: 'today' }
  if (days === 1) return { text: '내일', tone: 'soon' }
  if (days <= 3) return { text: `D-${days}`, tone: 'soon' }
  if (days <= 14) return { text: `D-${days}`, tone: 'normal' }
  return { text: `${m}/${d}`, tone: 'normal' }
}

/** 이번 주(월요일 시작)의 그 요일 */
function weekDay(today: Date, dow: number, plusWeeks: number): Date {
  const t = day0(today); const mon = addDays(t, -((t.getDay() + 6) % 7))
  return addDays(mon, ((dow + 6) % 7) + plusWeeks * 7)
}

/** 날짜 고르기 단추 — 오늘 · 내일 · 이번 주 금(지났으면 안 보임) · 다음 주 월 */
export function quickDues(today = new Date()): { label: string; date: string }[] {
  const out = [{ label: '오늘', date: ymd(today) }, { label: '내일', date: ymd(addDays(today, 1)) }]
  const fri = weekDay(today, 5, 0); if (fri.getTime() > addDays(today, 1).getTime()) out.push({ label: '이번 주 금', date: ymd(fri) })
  out.push({ label: '다음 주 월', date: ymd(weekDay(today, 1, 1)) })
  return out
}

/**
 * 마감 말 한 덩이를 날짜로. 못 읽으면 null(지어내지 않는다).
 * 오늘·내일·모레 · 이번 주/다음 주 X(요일) · X요일(오늘 포함 다가오는 날) · M/D · M월 D일 · D일(다가오는 날) · YYYY-MM-DD
 */
export function parseDueWord(raw: string, today = new Date()): string | null {
  const s = raw.trim().replace(/\s+/g, ' ').replace(/\s*(까지|마감)$/, '')
  if (!s) return null
  const t = day0(today)
  if (s === '오늘') return ymd(t)
  if (s === '내일') return ymd(addDays(t, 1))
  if (s === '모레') return ymd(addDays(t, 2))
  let m = /^(이번|다음|담)\s?주\s?([일월화수목금토])(?:요일)?$/.exec(s)
  if (m) return ymd(weekDay(t, DOW.indexOf(m[2]), m[1] === '이번' ? 0 : 1))
  m = /^([일월화수목금토])요일$/.exec(s)
  if (m) { const want = DOW.indexOf(m[1]); return ymd(addDays(t, (want - t.getDay() + 7) % 7)) }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})\s?\/\s?(\d{1,2})$/.exec(s) ?? /^(\d{1,2})월\s?(\d{1,2})일$/.exec(s)
  if (m) {
    const mo = +m[1], d = +m[2]
    const v = valid(t.getFullYear(), mo, d); if (!v) return null
    return v < ymd(t) ? valid(t.getFullYear() + 1, mo, d) : v      // 이미 지난 날짜면 내년
  }
  m = /^(\d{1,2})일$/.exec(s)
  if (m) {
    const d = +m[1]
    const v = valid(t.getFullYear(), t.getMonth() + 1, d)
    if (v && v >= ymd(t)) return v
    const nx = new Date(t.getFullYear(), t.getMonth() + 1, 1)
    return valid(nx.getFullYear(), nx.getMonth() + 1, d)
  }
  return null
}
function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const x = new Date(y, m - 1, d)
  return x.getMonth() === m - 1 ? ymd(x) : null
}

const TAIL = /(?:^|\s)((?:이번|다음|담)\s?주\s?[일월화수목금토](?:요일)?|[일월화수목금토]요일|오늘|내일|모레|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s?\/\s?\d{1,2}|\d{1,2}월\s?\d{1,2}일|\d{1,2}일)(\s*(?:까지|마감))?\s*$/
/**
 * 입력칸 끝의 마감 말을 떼어 낸다 — «강의안 넘기기: 디캠프에 PDF 로 내일» → 본문 + 2026-10-17.
 * 끝에 이미 `📅 날짜` 가 있으면 그것을 쓴다. 날짜 말이 없으면 due 없음.
 */
export function splitDue(input: string, today = new Date()): { text: string; due?: string } {
  const raw = input.trimEnd()
  const em = /\s*📅\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(raw)
  if (em) return { text: raw.slice(0, em.index).trimEnd(), due: em[1] }
  const m = TAIL.exec(raw)
  if (!m) return { text: raw }
  const due = parseDueWord(m[1], today)
  if (!due) return { text: raw }
  const rest = raw.slice(0, m.index).trimEnd().replace(/[\s,·:]+$/, '')
  if (!rest) return { text: raw }           // 날짜 말만 쓴 줄은 제목이다
  return { text: rest, due }
}
