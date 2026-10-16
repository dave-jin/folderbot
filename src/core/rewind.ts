/**
 * 🔴 **CL-1 · 고쳐 다시 B — 되감기** (기획안 §5 · 결정 ④ «A 로 먼저 내고 B 는 스파이크 뒤»).
 * 실 CLI(2.1.301) 스파이크(10/16): `--resume <id> --resume-session-at <답 uuid> --fork-session` 이면 그 답 **직후**로 대화를 갈라
 * 새 세션 id 로 이어간다. 「사과 → 바나나로 바꿔」 뒤 첫 답 직후로 되감아 「비밀 단어?」 를 물으니 «사과» 였다 — 뒤의 말은 모른다.
 * 원래 기록(jsonl)은 그대로 남는다. 파일은 되돌리지 않는다(대화만 되감긴다).
 *
 * 여기서는 CLI 기록에서 «멈춘 사람 말» 과 그 **바로 앞 답** 을 찾는다.
 *  - 멈춘 말이 기록에 없으면(멈추기가 너무 빨랐다) `null` — 화면은 A(이어서 고치기)로 간다. 엉뚱한 자리로 되감지 않는다.
 *  - 그 앞에 답이 없으면(세션 첫 말을 멈췄다) `{ fresh: true }` — 이어갈 대화가 없으니 새로 시작한다.
 */
type Entry = { type?: string; uuid?: string; isMeta?: boolean; isCompactSummary?: boolean; isSidechain?: boolean; message?: { content?: unknown } }
const textOf = (c: unknown): string | null => {
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return null
  if (c.some((x) => x && typeof x === 'object' && (x as { type?: string }).type === 'tool_result')) return null   // 도구 결과 줄은 사람 말이 아니다
  return c.map((x) => (x && typeof x === 'object' && (x as { type?: string }).type === 'text' ? String((x as { text?: unknown }).text ?? '') : '')).join('')
}
const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()
/** 멈추면 실 CLI 가 기록에 남기는 사람 줄(`[Request interrupted by user]` · `… for tool use]`) — 사람이 한 말이 아니다(리뷰 10/16) */
const INTERRUPTED = /^\[Request interrupted by user/
/**
 * 되감아 이어도 되는 답 — 글이 있고 `tool_use` 가 없는 줄. 도구를 부르다 멈춘 답 직후로 가르면 결과 없는 `tool_use` 가 남아
 * API 가 거절할 수 있다(리뷰 10/16). 내용을 모르는 옛 줄은 받는다.
 */
const resumable = (e: Entry): boolean => {
  const c = e.message?.content
  if (!Array.isArray(c)) return true
  const ty = (x: unknown) => (x && typeof x === 'object' ? (x as { type?: string }).type : undefined)
  return !c.some((x) => ty(x) === 'tool_use') && c.some((x) => ty(x) === 'text')
}
export function rewindPoint(entries: readonly Entry[], stoppedText: string): { at: string } | { fresh: true } | null {
  const want = squash(stoppedText).slice(0, 300); if (!want) return null
  let k = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type !== 'user' || e.isMeta || e.isCompactSummary || e.isSidechain) continue
    const t = textOf(e.message?.content); if (t === null || INTERRUPTED.test(t.trim())) continue
    k = squash(t).includes(want) ? i : -2   // 가장 늦은 사람 말이 멈춘 말이어야 한다
    break
  }
  if (k < 0) return null
  for (let i = k - 1; i >= 0; i--) { const e = entries[i]; if (e.type === 'assistant' && !e.isSidechain && e.uuid && resumable(e)) return { at: e.uuid } }
  return { fresh: true }
}
