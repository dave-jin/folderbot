import { marked } from 'marked'
import { extractMath, fillMath, type MathChunk } from '../core/math'
import { expandWikilinks } from '../core/wikilinks'

marked.setOptions({ gfm: true, breaks: true })

/**
 * 🔴 **마크다운 → HTML 은 이 한 곳** (K-1 · 2026-09-19). 채팅(`Md`)과 문서 창(인쇄 사본)이 같은 길을 지난다 —
 *    수식 걷어 내기(core/math) → 위키링크(core/wikilinks) → marked → 수식 끼우기. 같은 입력이면 같은 출력이다.
 */
export function renderMarkdown(text: string, math: ((c: MathChunk) => string) | null = null): string {
  const m = extractMath(text)
  const h = marked.parse(expandWikilinks(m.text)) as string
  return fillMath(h, m.chunks, math)
}
