/**
 * 스트리밍 중 점진 렌더 (O · 2026-09-19) — 마크다운을 **닫힌 블록**과 **열린 마지막 블록**으로 가른다.
 * 닫힌 블록은 바로 그리고(한 번 그린 HTML 은 재사용), 열린 것만 원문으로 둔다. 그래서 토큰마다 문서 전체를 다시 파싱하지
 * 않고, 끝났을 때 자리가 크게 바뀌지 않는다.
 * ⚠ 블록 경계는 **빈 줄**이다. 펜스(```) 안의 빈 줄은 경계가 아니다 — 열린 펜스는 통째로 «열린 블록» 이다.
 */
export function mdBlocks(text: string): { closed: string[]; open: string } {
  const lines = text.split('\n')
  const closed: string[] = []; let cur: string[] = []; let fence = false
  for (const ln of lines) {
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence
    if (!fence && ln.trim() === '' && cur.length) { closed.push(cur.join('\n')); cur = []; continue }
    if (!fence && ln.trim() === '') continue
    cur.push(ln)
  }
  // 마지막 조각은 끝에 빈 줄이 와야 닫힌다 — 아직 오고 있는 중이면 열린 블록
  const endsBlank = /\n\s*$/.test(text) && !fence
  if (cur.length && endsBlank) { closed.push(cur.join('\n')); cur = [] }
  return { closed, open: cur.join('\n') }
}
