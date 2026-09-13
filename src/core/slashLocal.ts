/**
 * **우리가 직접 처리하는 슬래시 명령** (2026-09-13 Dave: *«codex 에서는 /clear 와 같은 메시지도
 * 동작을 안해»*).
 *
 * 🔴 **Claude 는 CLI 가 처리하고, Codex 는 아무도 처리하지 않았다.** `codex exec` 는 한 턴짜리
 *    명령이라 «세션 명령» 이라는 개념이 없다 — `/clear` 를 보내면 그냥 **그 글자를 프롬프트로**
 *    받아 «무슨 뜻인지 모르겠다» 고 답했다. 슬래시 메뉴에는 떠 있는데 아무 일도 안 나니,
 *    사람은 «고장난 앱» 으로 읽는다.
 * ⛔ 없는 기능을 있는 척하지 않는다 — 우리가 **정말로 할 수 있는 것**만 목록에 둔다.
 *    `/clear` 는 «이어가기를 끊는다» 로 진짜 뜻이 있고, `/compact` 는 Codex 에 없는 일이라 뺀다.
 */
export interface LocalCmd { name: string; desc: string }

/** Codex 세션에서 우리가 처리하는 것들 — 이 목록이 곧 화면에 뜨는 목록이다 */
export const CODEX_LOCAL: LocalCmd[] = [
  { name: 'clear', desc: '새 대화로 — 여기까지의 맥락을 끊습니다' },
  { name: 'new', desc: '새 대화로 (clear 와 같음)' }
]

/** 앞머리가 슬래시 명령인가 — 줄 하나가 통째로 그 명령일 때만 (글 속 `/` 는 건드리지 않는다) */
export function parseLocalSlash(text: string, list: LocalCmd[]): { name: string; rest: string } | null {
  const m = /^\/([a-z][\w:-]*)\s*([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  const name = m[1].toLowerCase()
  if (!list.some((c) => c.name === name)) return null
  return { name, rest: m[2].trim() }
}
