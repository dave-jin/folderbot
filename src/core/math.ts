/**
 * 수식 뽑기 (루프 10/10) — 마크다운을 그리기 **전에** `$…$`·`$$…$$` 를 자리표로 바꿔 둔다.
 *
 * 🔴 왜 미리 뽑나 — marked 는 `_`·`\` 를 강조·이스케이프로 먹는다. `$a_1 + b_2$` 를 그대로 주면
 *    `a<em>1 + b</em>2` 가 되어 KaTeX 가 받을 수식이 남지 않는다. 그래서 먼저 걷어 내고, 그린 뒤에 끼워 넣는다.
 * ⚠ 코드 안(펜스 · 인라인 백틱)의 `$` 는 건드리지 않는다 — 셸 변수 `$HOME` 이 수식이 되면 안 된다.
 * ⚠ 인라인 `$…$` 는 **한 줄 안**이고 양끝이 공백이 아니며, 닫는 `$` 뒤에 숫자가 오지 않아야 한다 — «$5 와 $10» 은 돈이다.
 * ⚠ 자리표는 사용자 영역 글자(U+E000·U+E001)로 감싼 번호다 — marked 가 통째로 지나보낸다.
 */
export interface MathChunk { tex: string; display: boolean }
export const MATH_OPEN = '\uE000'
export const MATH_CLOSE = '\uE001'
export const placeholder = (i: number): string => `${MATH_OPEN}${i}${MATH_CLOSE}`

export function extractMath(text: string): { text: string; chunks: MathChunk[] } {
  if (!text.includes('$')) return { text, chunks: [] }
  const chunks: MathChunk[] = []
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    // 펜스 코드 — 닫힐 때까지 그대로
    if ((i === 0 || text[i - 1] === '\n') && text.startsWith('```', i)) {
      const end = text.indexOf('\n```', i + 3)
      const stop = end < 0 ? n : Math.min(n, end + 4)
      out += text.slice(i, stop); i = stop; continue
    }
    const c = text[i]
    if (c === '`') { // 인라인 코드
      const end = text.indexOf('`', i + 1)
      const stop = end < 0 ? n : end + 1
      out += text.slice(i, stop); i = stop; continue
    }
    if (c === '\\' && text[i + 1] === '$') { out += '$'; i += 2; continue }   // `\$` 는 달러 글자
    if (c === '$') {
      if (text[i + 1] === '$') {
        const end = text.indexOf('$$', i + 2)
        if (end > i + 1) {
          const tex = text.slice(i + 2, end).trim()
          if (tex) { chunks.push({ tex, display: true }); out += placeholder(chunks.length - 1); i = end + 2; continue }
        }
      } else {
        const end = text.indexOf('$', i + 1)
        if (end > i + 1) {
          const tex = text.slice(i + 1, end)
          const after = text[end + 1] ?? ''
          if (!tex.includes('\n') && !/^\s|\s$/.test(tex) && !/\d/.test(after)) { chunks.push({ tex, display: false }); out += placeholder(chunks.length - 1); i = end + 1; continue }
        }
      }
    }
    out += c; i++
  }
  return { text: out, chunks }
}

/** 그린 HTML 의 자리표를 렌더 결과로(또는 못 그렸으면 원문으로) 되돌린다 */
export function fillMath(html: string, chunks: MathChunk[], render: ((c: MathChunk) => string) | null): string {
  if (!chunks.length) return html
  return html.replace(new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, 'g'), (_m, k: string) => {
    const c = chunks[Number(k)]; if (!c) return ''
    if (render) { try { return render(c) } catch { /* 아래 원문으로 */ } }
    const esc = c.tex.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    return c.display ? `<pre class="mathsrc">$$${esc}$$</pre>` : `<code class="mathsrc">$${esc}$</code>`
  })
}
