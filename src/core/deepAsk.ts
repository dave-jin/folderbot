/**
 * 딥링크로 «물을 말» 채우기 (DQ · 2026-11-04 Alfred 봇 요청 → 오케스트레이터 중계 · Dave 카드 답 «지금 만들고 v211 배포»).
 *
 * `folderbot://bot/<id>?ask=<URL 인코딩 글>` (선택 `&s=<sid>`) 로 열면 그 봇의 입력칸에 글이 채워진다.
 * 종전에는 바깥 도구(Alfred)가 질문을 클립보드에 넣고 사람이 ⌘V 로 붙였다.
 *
 * 🔴 **채우기만 한다 — 보내지 않는다.** 바깥 앱 누구나 이 주소를 열 수 있다. 보내는 것은 사람이 Enter 로 한다.
 * 🔴 **쓰다 만 글은 덮지 않는다** — 빈 줄 하나 뒤에 덧붙인다(`joinFill`).
 * ⚠ 4,000자를 넘으면 채우지 않는다(봇 화면만 연다). 잘라서 채우면 사람은 잘린 줄 모르고 보낸다.
 * ⚠ 줄바꿈·탭 말고 제어 문자는 뺀다 — 눈에 안 보이는 글자가 봇에게 가지 않게.
 */
export const MAX_ASK = 4000

/** 받은 글 → 채울 글. 비었거나 너무 길면 null */
export function cleanAsk(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const t = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (!t) return null
  if ([...t].length > MAX_ASK) return null
  return t
}

/** 덧붙일 글의 머리 표식 — 이것으로 시작하면 «빈 줄 하나 뒤에» 붙인다(그 밖의 채우기는 종전대로 한 칸 띄움) */
export const FILL_BLOCK = '\n\n'

/** 입력칸에 이미 있는 글 + 채울 글 */
export function joinFill(cur: string, add: string): string {
  if (add.startsWith(FILL_BLOCK)) {
    const body = add.slice(FILL_BLOCK.length)
    return cur.trim() ? `${cur.replace(/\s+$/, '')}${FILL_BLOCK}${body}` : body
  }
  return cur ? `${cur} ${add}` : add
}
