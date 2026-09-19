import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../src/client/render'

/** K-1 · 채팅과 문서 창이 같은 렌더러를 쓴다 — 같은 입력 → 같은 출력 (Sheets.Md 와 Doc 인쇄 사본이 둘 다 이 함수를 부른다) */
describe('renderMarkdown', () => {
  it('위키링크 · 수식 · 마크다운이 한 길을 지난다', () => {
    const md = '# 제목\n\n![[x.png]] 그리고 [[노트]] · `[[코드]]`'
    const a = renderMarkdown(md), b = renderMarkdown(md)
    expect(a).toBe(b)
    expect(a).toContain('<h1>제목</h1>')
    expect(a).toContain('<img class="wimg" data-wiki="x.png" alt="x.png">')
    expect(a).toContain('<a class="wlink" data-wiki="노트">노트</a>')
    expect(a).toContain('<code>[[코드]]</code>')
  })
})
