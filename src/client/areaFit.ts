/**
 * 글에 맞춰 자라는 글 칸(textarea) — 높이 맞추기와 커서 보이기 (2026-11-15 Dave: «AskUserQuestion 혹은 기존 문구 고치기 … 했을때
 * 커서 위치가 화면에 제대로 표시되지 않거나 스크롤 업/다운 되는 현상이 있어»).
 *
 * 🔴 **재는 동안 바깥 높이를 잡아 둔다.** 글 칸의 높이를 재려면 `height:auto` 로 한 번 접어야 하는데, 그 순간 대화가 그만큼 짧아져
 *    브라우저가 대화 스크롤을 «더 못 내려가는 자리» 로 끌어올린다. 높이는 곧 돌아오지만 스크롤은 안 돌아온다 — 그래서 글자를 칠 때마다
 *    브라우저가 커서를 보이려고 내리고(↓) 우리가 재면서 올려(↑) 대화가 위아래로 흔들렸다(실측 `test/caret-scroll.mjs` K8 — 1098 ↔ 1129).
 * 🔴 **자란 뒤에는 커서 줄을 보이는 자리로 굴린다.** 글 칸이 통째로 자라므로 칸 안에는 스크롤이 없다. 붙여 넣은 글의 끝은 입력창 뒤나
 *    화면 아래에 놓이는데, 그 자리를 따라가 주는 것이 없었다.
 */

/** 글 칸의 높이를 글에 맞춘다 — 부모의 높이를 잡아 둔 채 잰다 */
export function fitArea(t: HTMLTextAreaElement): void {
  const hold = t.parentElement
  const was = hold ? hold.style.minHeight : ''
  if (hold) hold.style.minHeight = `${hold.offsetHeight}px`
  t.style.height = 'auto'
  t.style.height = `${t.scrollHeight + 2}px`
  if (hold) hold.style.minHeight = was
}

const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'whiteSpace', 'wordBreak', 'overflowWrap', 'tabSize'] as const

/** 글 칸 안 커서 줄의 화면 자리 — 같은 글꼴 · 같은 폭의 거울 칸에 커서 앞의 글을 넣어 잰다(textarea 는 커서의 자리를 알려 주지 않는다) */
export function areaCaretRect(t: HTMLTextAreaElement): { top: number; bottom: number } {
  const cs = getComputedStyle(t), m = document.createElement('div')
  for (const p of COPY) m.style[p] = cs[p]
  m.style.boxSizing = 'border-box'; m.style.borderStyle = 'solid'; m.style.width = `${t.offsetWidth}px`
  m.style.position = 'fixed'; m.style.top = '0'; m.style.left = '-99999px'; m.style.visibility = 'hidden'; m.style.pointerEvents = 'none'
  m.textContent = t.value.slice(0, t.selectionEnd ?? t.value.length)
  const mark = document.createElement('span'); mark.textContent = '​'; m.appendChild(mark)
  document.body.appendChild(m)
  const y = mark.offsetTop, h = mark.offsetHeight || parseFloat(cs.lineHeight) || 16
  m.remove()
  const top = t.getBoundingClientRect().top + y - t.scrollTop
  return { top, bottom: top + h }
}

/**
 * 대화 안 글 칸의 커서 줄이 **보이는 자리**(머리줄 아래 · 입력창 위)에 오게 대화를 굴린다. 이미 보이면 손대지 않는다.
 * 보이는 자리는 `.chat-body` 의 위아래 안쪽 여백으로 안다 — 그 여백이 곧 머리줄과 입력창(폰은 탭 줄까지)이 덮는 높이다.
 */
export function revealAreaCaret(t: HTMLTextAreaElement): void {
  const sc = t.closest<HTMLElement>('.chat-scroll'); if (!sc) return
  const body = sc.querySelector<HTMLElement>('.chat-body')
  const cs = body ? getComputedStyle(body) : null
  const box = sc.getBoundingClientRect()
  const lo = box.top + (cs ? parseFloat(cs.paddingTop) || 0 : 0) - 14
  // ⚠ 입력창 위 56px 는 글이 흐려지는 구간(`.chat-foot::before`)이다 — 커서 줄이 그 짙은 쪽에 걸리지 않게 한 줄쯤 더 띄운다(실측: 붙여 넣은 끝 줄이 흐리게 보였다)
  const hi = box.bottom - (cs ? parseFloat(cs.paddingBottom) || 0 : 0) - 24
  if (hi - lo < 40) return
  const c = areaCaretRect(t)
  if (c.bottom > hi) sc.scrollTop += c.bottom - hi
  else if (c.top < lo) sc.scrollTop -= lo - c.top
}
