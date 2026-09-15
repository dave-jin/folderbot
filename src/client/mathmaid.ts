/**
 * mermaid · KaTeX (루프 10/10) — 🔴 **둘 다 늦게 받는다.** mermaid 는 수 MB 라 그림이 있는 답을 처음 볼 때만 받고,
 * KaTeX 도 수식이 처음 나올 때 받는다. 본체 청크에 섞이면 «편집기 지연 로드» 계약과 같은 이유로 회귀다.
 * ⚠ 스트리밍 중에는 그리지 않는다 — 반쯤 온 그림 코드로 그리면 오류 그림이 깜빡인다. 답이 끝난 뒤 한 번.
 */
import type { MathChunk } from '../core/math'

type Katex = { renderToString: (tex: string, o?: { displayMode?: boolean; throwOnError?: boolean }) => string }
let katexP: Promise<Katex> | null = null
export function loadKatex(): Promise<Katex> {
  if (!katexP) katexP = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => (m.default ?? m) as Katex)
  return katexP
}
export const renderMath = (k: Katex) => (c: MathChunk): string => k.renderToString(c.tex, { displayMode: c.display, throwOnError: false })

type Mermaid = { initialize: (o: Record<string, unknown>) => void; render: (id: string, src: string) => Promise<{ svg: string }> }
let mermaidP: Promise<Mermaid> | null = null
let mmdTheme = ''
let mmdN = 0
function loadMermaid(dark: boolean): Promise<Mermaid> {
  if (!mermaidP) mermaidP = import('mermaid').then((m) => (m.default ?? m) as unknown as Mermaid)
  return mermaidP.then((mm) => { const th = dark ? 'dark' : 'default'; if (mmdTheme !== th) { mm.initialize({ startOnLoad: false, theme: th, securityLevel: 'strict', fontFamily: 'inherit' }); mmdTheme = th } return mm })
}

/** `pre > code.language-mermaid` 를 그림으로 — 코드 블록 자리에 svg, 실패하면 코드를 남기고 이유를 한 줄 */
export async function renderMermaid(root: HTMLElement): Promise<number> {
  const codes = Array.from(root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')).filter((c) => !c.dataset.mmd)
  if (!codes.length) return 0
  const dark = document.documentElement.dataset.theme !== 'light'
  const mm = await loadMermaid(dark)
  let n = 0
  for (const code of codes) {
    code.dataset.mmd = '1'
    const pre = code.parentElement as HTMLElement
    const wrap = pre.parentElement?.classList.contains('cbwrap') ? (pre.parentElement as HTMLElement) : pre
    try {
      const { svg } = await mm.render(`mmd-${Date.now()}-${mmdN++}`, code.textContent ?? '')
      const box = document.createElement('div'); box.className = 'mmd'; box.innerHTML = svg
      wrap.replaceWith(box); n++
    } catch (e) {
      const note = document.createElement('div'); note.className = 'mmderr'; note.textContent = `그림을 못 그렸어요 — ${(e as Error).message?.split('\n')[0] ?? ''}`
      wrap.insertAdjacentElement('afterend', note)
    }
  }
  return n
}
