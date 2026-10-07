import { Marked, marked, type MarkedExtension } from 'marked'
import { unlinkFileMailto } from '../core/paths'
import { extractMath, fillMath, type MathChunk } from '../core/math'
import { expandWikilinks } from '../core/wikilinks'
import { mdBlocks } from '../core/mdBlocks'

marked.setOptions({ gfm: true, breaks: true })
/**
 * 🔴 **BM · 취소선은 `~~` 두 개일 때만** (2026-10-07). GFM 은 `~` 하나도 취소선으로 읽어서 «3~4일, 5~6명» 이
 *    «3<del>4일, 5</del>6명» 으로 그어졌다 — 한국어에서 `~` 는 범위 표시다. 하나짜리는 글자로 둔다.
 * ⚠ `false` 를 돌려주면 marked 가 원래 해석기로 넘긴다(`~~` 는 그쪽이 그린다). `undefined` 는 «취소선 아님».
 */
const TILDE: MarkedExtension = { tokenizer: { del(src: string) { return src.startsWith('~~') ? false : undefined } } }
marked.use(TILDE)
/**
 * 🔴 **BM-1 · 내 말도 마크다운으로** (2026-10-07 Dave: «채팅창 안에서도 기본적인 마크다운 포맷이 적용되었으면»).
 *    봇의 답과 같은 해석(줄바꿈 = 줄바꿈 · 목록 · 굵게 · 코드 · 링크)이되, **쓴 HTML 은 글자로** 보인다 —
 *    내 말에는 다른 봇이 보낸 말(소통 세션)과 붙여 넣은 글이 섞이므로 `<img onerror>` 같은 것을 그대로 심지 않는다.
 */
const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const userMarked = new Marked({ gfm: true, breaks: true }, TILDE, { renderer: { html(t: { text: string }) { return escHtml(t.text) } } })

/**
 * 🔴 **마크다운 → HTML 은 이 한 곳** (K-1 · 2026-09-19). 채팅(`Md`)과 문서 창(인쇄 사본)이 같은 길을 지난다 —
 *    수식 걷어 내기(core/math) → 위키링크(core/wikilinks) → marked → 수식 끼우기. 같은 입력이면 같은 출력이다.
 */
export function renderMarkdown(text: string, math: ((c: MathChunk) => string) | null = null, user = false): string {
  const m = extractMath(text)
  /* AP · 마크다운이 `이름@2x.png` 을 메일로 보고 링크로 감싼다 — 파일 이름이면 되돌린다(`core/paths`) */
  const h = unlinkFileMailto((user ? userMarked : marked).parse(expandWikilinks(m.text)) as string)
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
