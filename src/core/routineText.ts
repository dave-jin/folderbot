/**
 * 채팅에 쓴 한 줄에서 **루틴의 주기**를 뽑는다 (2026-09-13 Dave: *«루틴을 폴더 채팅에서 바로 채팅으로»*).
 *
 * 🔴 **추측한 값은 반드시 사람이 보고 고칠 수 있어야 한다.** 그래서 여기서 하는 일은 «폼을 미리 채워 주는 것»
 *    까지다 — 바로 저장하지 않는다. 잘못 읽어도 손해가 없고, 맞으면 타이핑 세 번이 준다.
 * ⛔ **cron 을 사람이 외우게 하지 않는다.** 「매주 월요일 아침 9시」 라고 쓰면 그게 `0 9 * * 1` 이다.
 * ⚠ 못 읽으면 **조용히 기본값(매일 오전 9시)** 으로 두고 `matched: false` 로 알린다 — 틀린 값을 맞은 척하지 않는다.
 */
export interface CronGuess {
  cron: string
  /** 사람이 읽는 말 — 「매주 월요일 09:00」 */
  label: string
  /** 시각 표현을 걷어낸 나머지 = 루틴이 시킬 일 */
  rest: string
  /** 글에서 실제로 읽어낸 것이 있나 (없으면 기본값을 쓴 것) */
  matched: boolean
}

const DOW: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }
const DOW_NAME = ['일', '월', '화', '수', '목', '금', '토']
/** 말로 된 시각 — 「아침」 은 9시다 */
const WORD_HOUR: [RegExp, number][] = [[/새벽/, 5], [/아침/, 9], [/오전/, 9], [/점심|정오/, 12], [/오후/, 14], [/저녁/, 19], [/밤/, 21]]

export function cronFromText(text: string): CronGuess {
  const t = text.replace(/\s+/g, ' ').trim()
  let matched = false
  let hour = 9, min = 0
  let dom = '*', dow = '*'
  const eaten: string[] = []
  const eat = (re: RegExp) => { const m = re.exec(t); if (m) { eaten.push(m[0]); matched = true } return m }

  // ── 시각: 「9시」 · 「9시 30분」 · 「09:30」 ──
  const hm = eat(/(오전|오후)?\s*(\d{1,2})\s*(?:시|:)\s*(\d{1,2})?\s*분?/)
  if (hm) {
    hour = Number(hm[2]); min = hm[3] ? Number(hm[3]) : 0
    if (hm[1] === '오후' && hour < 12) hour += 12
    if (hm[1] === '오전' && hour === 12) hour = 0
    if (hour > 23) hour = 23
    if (min > 59) min = 59
  } else {
    for (const [re, h] of WORD_HOUR) if (eat(re)) { hour = h; break }
  }

  // ── 주기 ──
  if (eat(/평일|주중/)) dow = '1-5'
  else if (eat(/주말/)) dow = '0,6'
  else {
    const w = eat(/(?:매주|매\s*)?([일월화수목금토])요일/)
    if (w) dow = String(DOW[w[1]])
    else {
      const d = eat(/매달\s*(\d{1,2})\s*일|매월\s*(\d{1,2})\s*일/)
      if (d) dom = String(Number(d[1] ?? d[2]))
      else eat(/매일|날마다/)
    }
  }

  let rest = t
  for (const e of eaten) rest = rest.replace(e, ' ')
  rest = rest.replace(/^\s*(에|마다|에는)\s*/, '').replace(/\s+/g, ' ').trim()

  const hhmm = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  const label = dow === '1-5' ? `평일 ${hhmm}` : dow === '0,6' ? `주말 ${hhmm}` : dow !== '*' ? `매주 ${DOW_NAME[Number(dow)]}요일 ${hhmm}` : dom !== '*' ? `매월 ${dom}일 ${hhmm}` : `매일 ${hhmm}`
  return { cron: `${min} ${hour} ${dom} * ${dow}`, label, rest, matched }
}

/** 루틴 이름 — 시킬 일의 앞부분. 길면 자른다(목록에서 한 줄로 보여야 한다) */
export function routineName(rest: string, fallback = '새 루틴'): string {
  const one = rest.split(/[.\n]/)[0].trim()
  if (!one) return fallback
  return one.length > 22 ? `${one.slice(0, 22)}…` : one
}
