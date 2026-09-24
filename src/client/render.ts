import { marked } from 'marked'
import { unlinkFileMailto } from '../core/paths'
import { extractMath, fillMath, type MathChunk } from '../core/math'
import { expandWikilinks } from '../core/wikilinks'
import { mdBlocks } from '../core/mdBlocks'

marked.setOptions({ gfm: true, breaks: true })

/**
 * 🔴 **마크다운 → HTML 은 이 한 곳** (K-1 · 2026-09-19). 채팅(`Md`)과 문서 창(인쇄 사본)이 같은 길을 지난다 —
 *    수식 걷어 내기(core/math) → 위키링크(core/wikilinks) → marked → 수식 끼우기. 같은 입력이면 같은 출력이다.
 */
export function renderMarkdown(text: string, math: ((c: MathChunk) => string) | null = null): string {
  const m = extractMath(text)
  /* AP · 마크다운이 `이름@2x.png` 을 메일로 보고 링크로 감싼다 — 파일 이름이면 되돌린다(`core/paths`) */
  const h = unlinkFileMailto(marked.parse(expandWikilinks(m.text)) as string)
  return fillMath(h, m.chunks, math)
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const blockCache = new Map<string, string>()
/**
 * 스트리밍 중 점진 렌더 (O) — 닫힌 블록은 렌더(블록 단위 캐시 · 문서가 길어져도 새 블록만 파싱), 열린 마지막 블록은 원문(pre-wrap).
 * 🔴 열린 블록을 marked 에 넣으면 «열린 펜스 = 이후 전부 코드» 처럼 한 토큰마다 모양이 뒤집힌다 — 그래서 원문으로 둔다.
 */
export function renderStreaming(text: string): string {
  const { closed, open } = mdBlocks(text)
  const parts = closed.map((b) => { let h = blockCache.get(b); if (h === undefined) { h = renderMarkdown(b); if (blockCache.size > 4000) blockCache.clear(); blockCache.set(b, h) } return h })
  // ⚠ 열린 **펜스**는 처음부터 코드 블록으로 그린다 — 원문(pre-wrap)으로 두면 긴 줄이 여러 줄로 접혔다가 닫히는 순간 한 줄로 줄어 «툭» 한다(실측 폰 83px)
  if (open && /^\s*(```|~~~)/.test(open)) parts.push(renderMarkdown(open))
  else if (open) parts.push(`<div class="openb">${esc(open)}<span class="scaret"></span></div>`)
  else parts.push('<div class="openb"><span class="scaret"></span></div>')
  return parts.join('')
}
