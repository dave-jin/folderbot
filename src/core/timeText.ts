/**
 * 🔴 **시각 · 지난 시각 · 경과를 적는 한 곳** (2026-11-15 · UX/UI 정리 «말» 걸음의 둘째 묶음 «표기»).
 *
 * 11/12 리뷰에서 센 것: 지난 시간을 적는 함수가 일곱 개라 «59분 전» 이 화면에 따라 «방금» 으로도 나왔고,
 * 세션 줄은 12시간제(«오후 3:05»)인데 상황판 · 루틴 · 편지는 24시간제였고, 경과는 도는 동안만 영어 단위(«3m 06s»)였다.
 * 화면이 저마다 짓지 않고 이 셋을 쓴다 — `clock` · `ago` · `elapsedText`.
 *
 * | 무엇 | 꼴 | 규칙 |
 * |---|---|---|
 * | 시각 | `09:05` · `15:05` | 24시간제 · 두 자리 |
 * | 지난 시각 | 방금 · 3분 전 · 2시간 전 · 3일 전 | 1분 미만은 «방금» · 내림(59분 59초 = «59분 전») |
 * | 경과 | 7초 · 3분 6초 · 1시간 5분 | 한글 단위 · 도는 동안과 끝난 뒤가 같은 꼴 |
 *
 * ⛔ 루틴을 «사람 말» 로 되읽는 글(«매일 저녁 8시» — `core/when.ts`)은 이 규칙의 대상이 아니다. 그쪽은 말이고 이쪽은 숫자다.
 */
const p2 = (n: number): string => String(n).padStart(2, '0')
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000

/** 시각 — `09:05` (24시간제) */
export function clock(t: number): string { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }

/** 날짜와 시각 — `11/9 15:05` */
export function dayClock(t: number): string { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${clock(t)}` }

export interface AgoOpts {
  /** 좁은 자리 — «전» 을 붙이지 않는다(«3분» · «2시간»). «방금» · «어제» · 요일 · 날짜는 그대로다 */
  short?: boolean
  /**
   * 하루를 넘긴 것을 적는 법.
   *  - `days`(기본) — 지난 날 수: «3일 전»
   *  - `date` — 달력: «어제» · 요일(이레 안) · «11/9». 오늘인지는 달력 날짜로 가른다(자정을 넘겼으면 한 시간 전이어도 «어제»)
   */
  far?: 'days' | 'date'
}

/**
 * 지난 시각 — «방금» · «3분 전» · «2시간 전» · «3일 전».
 * 🔴 1분 미만만 «방금» 이고 그 위는 **내림**이다. 59분 59초는 «59분 전» 이다(«방금» 도 «1시간 전» 도 아니다).
 */
export function ago(t: number, now = Date.now(), o: AgoOpts = {}): string {
  const diff = Math.max(0, now - t)
  if (diff < MIN) return '방금'
  const tail = o.short ? '' : ' 전'
  const near = (): string => (diff < HOUR ? `${Math.floor(diff / MIN)}분${tail}` : `${Math.floor(diff / HOUR)}시간${tail}`)
  if (o.far === 'date') {
    const d = new Date(t), n = new Date(now)
    const day0 = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const days = Math.round((day0(n) - day0(d)) / DAY)
    if (days <= 0) return near()
    if (days === 1) return '어제'
    if (days < 7) return DOW[d.getDay()]
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  if (diff < DAY) return near()
  return `${Math.floor(diff / DAY)}일${tail}`
}

/** 경과 — «7초» · «3분 6초» · «1시간 5분». 도는 동안에도 끝난 뒤에도 이 꼴이다 */
export function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60); const h = Math.floor(m / 60)
  return h ? `${h}시간 ${m % 60}분` : m ? `${m}분 ${s % 60}초` : `${s}초`
}
