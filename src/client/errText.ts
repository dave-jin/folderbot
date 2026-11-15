/**
 * 🔴 **실패 글의 한 꼴** (2026-11-15 · UX/UI 정리 «말» 걸음의 셋째 묶음).
 *
 * 11/12 리뷰: 실패했을 때 서버가 준 글을 그대로 토스트에 띄우는 곳이 46건, 머리말을 붙인 곳은 10건쯤인데 꼴이 둘이었다
 * («못 올렸어요 — 원문» / «확인 실패 — 원문»). 한 꼴로 모은다 — **«못 ~했어요 — 원문»**.
 * 머리말은 «무엇을 하려다 안 됐는지» 를 화면의 말로 적고, 원문은 까닭을 찾을 실마리로 뒤에 붙인다.
 *
 * ⛔ `say((e as Error).message)` 처럼 원문만 띄우지 않는다(`test/unit/toneRules.test.ts` 가 막는다).
 */
export function errText(head: string, e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim()
  return m ? `${head} — ${m}` : head
}
