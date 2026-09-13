/**
 * 이름 찾기 — 폴더·파일 이름 한 곳에서만 판정한다 (2026-09-13, Dave 실사고).
 *
 * 🔴 왜 한글이 «아예» 안 찾혔나 — 맥 파일 이름은 디스크에 **NFD**(ㅌ+ㅡ, 자모 분리)로
 * 저장되는데 입력기가 만드는 질의는 **NFC**(트) 다. 코드포인트가 달라 `includes` 가
 * 통째로 실패한다. 그래서 날짜·영문 같은 ASCII 조각만 걸리고 «트레바리» 는 안 걸렸다
 * (Dave: "이니셜부터만 검색이 되네요"). 비교 전에 **양쪽을 NFC 로 맞춘다**.
 * ⛔ 단 파일에 손댈 때 쓰는 경로는 원문 그대로여야 한다 — `host/files.ts` 의 `guard()`
 *    머리말 참조(NFC 로 바꿔 돌려주면 ENOENT).
 */

/** 비교용 정규화 — NFC + 소문자. 경로 접근에는 절대 쓰지 않는다 */
export const norm = (s: string): string => s.normalize('NFC').toLowerCase()

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
/** 초성 줄 — «트레바리» → «ㅌㄹㅂㄹ». 한글이 아닌 글자는 그대로 둔다(섞여 쓸 수 있게) */
export function chosung(s: string): string {
  let out = ''
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)]
    else out += ch.toLowerCase()
  }
  return out
}
/** 질의가 초성으로만(혹은 초성+영숫자로) 이뤄졌나 — 그럴 때만 초성 찾기를 켠다 */
export const isChosungQuery = (q: string): boolean => /[ㄱ-ㅎ]/.test(q) && !/[가-힣]/.test(q)

/** 띄엄띄엄 들어맞나 — «ai gle» 처럼 순서만 맞으면 걸린다(가장 낮은 점수) */
function subseq(q: string, t: string): boolean {
  let i = 0
  for (const c of t) if (c === q[i] && ++i === q.length) return true
  return i === q.length
}

/**
 * 점수 — 0 이면 걸리지 않음. 클수록 위로.
 * 이름 전체일치 100 · 이름 앞머리 80 · **이름 가운데 60** · 경로 가운데 40 · 초성 30 · 띄엄띄엄 10
 * (가운데 일치가 60 인 게 이번 수정의 핵심 — 앞머리만 되던 것을 어디든 되게 한다)
 */
export function scoreName(q: string, name: string, path = name): number {
  const nq = norm(q.trim()); if (!nq) return 1
  const nn = norm(name), np = norm(path)
  if (nn === nq) return 100
  if (nn.startsWith(nq)) return 80
  if (nn.includes(nq)) return 60
  if (np.includes(nq)) return 40
  if (isChosungQuery(nq)) { const cn = chosung(name), cp = chosung(path); if (cn.includes(nq)) return 30; if (cp.includes(nq)) return 25 }
  if (subseq(nq, nn)) return 10
  return 0
}

/** 걸린 자리 — 이름 안에서 [시작, 끝). 없으면 null (굵게 칠하는 데 쓴다) */
export function hitRange(q: string, name: string): [number, number] | null {
  const nq = norm(q.trim()); if (!nq) return null
  const i = norm(name).indexOf(nq)
  // NFC 로 맞춘 문자열과 원문의 길이가 다를 수 있으므로(NFD 이름) 자리는 NFC 기준으로 돌려준다
  return i < 0 ? null : [i, i + nq.length]
}

/** 점수순 정렬 — 같은 점수면 준 순서(보통 최근 변경순)를 지킨다 */
export function rank<T>(q: string, xs: T[], of: (x: T) => { name: string; path?: string }, limit = 200): T[] {
  const scored: { x: T; s: number; i: number }[] = []
  xs.forEach((x, i) => { const { name, path } = of(x); const s = scoreName(q, name, path ?? name); if (s > 0) scored.push({ x, s, i }) })
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map((v) => v.x)
}
