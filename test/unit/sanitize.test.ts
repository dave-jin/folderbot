import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import { safeUrl, sanitizeHtml } from '../../src/core/sanitize'
import { relImage, renderMarkdown } from '../../src/client/render'

/** BM-4 · 답 속 HTML 거르개 — «전부 글자로 돌리고 허용한 태그만 다시 짓는다» */
describe('sanitizeHtml', () => {
  it('이벤트 속성·style·id 는 사라지고 태그는 남는다', () => {
    expect(sanitizeHtml('<img src=x onerror="window.__xss=1">')).toBe('<img src="x">')
    expect(sanitizeHtml('<b style="position:fixed" id="a" onclick="x()">굵게</b>')).toBe('<b>굵게</b>')
    expect(sanitizeHtml("<a href='https://a.b/c?d=1&amp;e=2' onmouseover=x>링크</a>")).toBe('<a href="https://a.b/c?d=1&amp;e=2">링크</a>')
  })
  it('모르는 태그는 글자로 보인다', () => {
    expect(sanitizeHtml('<script>alert(1)</script>')).toBe('&lt;script>alert(1)&lt;/script>')
    expect(sanitizeHtml('<iframe src="https://x"></iframe><svg onload=x><style>*{}</style>')).not.toMatch(/<(iframe|svg|style)/i)
    expect(sanitizeHtml('<!-- 주석 --><?php x ?><!DOCTYPE html>')).not.toContain('<')
    expect(sanitizeHtml('<SCRIPT SRC=//x></SCRIPT><ScRiPt>')).not.toMatch(/<script/i)
  })
  it('꼴이 어긋난 태그 · 겹친 태그도 하나씩 판정한다', () => {
    expect(sanitizeHtml('<img src=x onerror=alert(1)')).toBe('&lt;img src=x onerror=alert(1)')           // 닫히지 않음
    expect(sanitizeHtml('<b <script>alert(1)</script>>')).not.toMatch(/<script/i)
    expect(sanitizeHtml('<img title="a>b" onerror=x src=y>')).toBe('<img title="a&gt;b" src="y">')          // 따옴표 안의 > 는 태그를 닫지 않는다
    expect(sanitizeHtml('<img src="x"onerror="alert(1)">')).not.toMatch(/onerror="/)
    expect(sanitizeHtml('<img/src=x/onerror=alert(1)>')).not.toMatch(/<img[^>]*onerror/)
    expect(sanitizeHtml('<br/><hr /></br>')).toBe('<br><hr>')
  })
  it('주소는 http·mailto·상대 경로만 — javascript: 는 어떻게 감춰도 버린다', () => {
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'jav&#x61;script:alert(1)', 'jav&#97script:alert(1)', 'javascript&colon;alert(1)', '&#106;avascript:x', 'vbscript:x', 'data:text/html,<script>', 'file:///etc/passwd', '\u0001javascript:x']) {
      expect(safeUrl(bad), bad).toBe(false)
      expect(sanitizeHtml(`<a href="${bad.replace(/"/g, '&quot;')}">x</a>`), bad).toBe('<a>x</a>')
    }
    for (const ok of ['https://a.b', 'http://a.b/c?d=e&f=g', 'mailto:a@b.c', 'tel:010', '/abs/path', '../rel.png', '#자리', 'a/b:c.png', '']) expect(safeUrl(ok), ok).toBe(true)
    expect(safeUrl('data:image/png;base64,iVBORw0KGgo=', true)).toBe(true)
    expect(safeUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false)             // 링크로는 안 된다
    expect(safeUrl('data:image/svg+xml;base64,PHN2Zz4=', true)).toBe(false)      // svg 는 스크립트를 품는다
  })
  it('class 는 화면이 아는 것만 남는다', () => {
    expect(sanitizeHtml('<div class="card perm">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHtml('<code class="language-ts evil">x</code>')).toBe('<code class="language-ts">x</code>')
  })
  it('체크박스가 아닌 input 은 글자로 · 체크박스는 늘 못 누른다', () => {
    expect(sanitizeHtml('<input type="text" value="x">')).toMatch(/^&lt;input/)
    expect(sanitizeHtml('<input type="checkbox" checked>')).toBe('<input type="checkbox" checked="" disabled="">')
  })
  it('글에 흔한 태그는 살아남는다', () => {
    expect(sanitizeHtml('<details open><summary>더</summary>a<br>b <kbd>⌘J</kbd> H<sub>2</sub>O</details>')).toBe('<details open=""><summary>더</summary>a<br>b <kbd>⌘J</kbd> H<sub>2</sub>O</details>')
  })
  it('marked 가 내는 것은 한 글자도 바뀌지 않는다', () => {
    const md = '# 제목\n\n**굵게** *기울임* ~~취소~~ `코드` [링크](https://a.b "제목")\n\n![그림](https://a.b/x.png)\n\n- [x] 한 일\n- [ ] 할 일\n\n1. 하나\n2. 둘\n\n> 인용\n\n| 왼 | 가운데 | 오른 |\n|:--|:-:|--:|\n| a | b | c |\n\n```ts\nconst a = "<b>" && 1 < 2\n```\n\n---\n'
    const html = marked.parse(md, { gfm: true, breaks: true }) as string
    expect(sanitizeHtml(html)).toBe(html)
  })
})

describe('renderMarkdown · 거르개가 끼워진 뒤', () => {
  it('봇 답의 날 HTML 은 실행되지 않는 꼴로 나온다', () => {
    const h = renderMarkdown('요약입니다 <img src=x onerror="window.__xss=1">\n\n<script>window.__xss=1</script>\n\n[눌러요](javascript:alert(1))')
    expect(h).not.toMatch(/onerror\s*=/i)
    expect(h).not.toMatch(/<script/i)
    expect(h).not.toMatch(/href="javascript/i)
    expect(h).toContain('<img src="x">')
  })
  it('위키링크 · 수식 · 코드는 그대로다', () => {
    const h = renderMarkdown('![[x.png]] [[노트|별명]] 그리고 $a<b$\n\n```html\n<img onerror=x>\n```')
    expect(h).toContain('<img class="wimg" data-wiki="x.png" alt="x.png">')
    expect(h).toContain('<a class="wlink" data-wiki="노트">별명</a>')
    expect(h).toContain('&lt;img onerror=x&gt;')
    expect(h).toContain('mathsrc')
  })
  it('닫힌 주석은 통째로 사라진다 — 닫히지 않은 주석은 글자가 되고 그 뒤는 다시 판정된다', () => {
    expect(sanitizeHtml('앞 <!-- bot --> 뒤')).toBe('앞  뒤')
    expect(sanitizeHtml('<!-- <script>x</script> --><b>ok</b>')).toBe('<b>ok</b>')
    expect(sanitizeHtml('<!-- 안 닫힘 <img src=x onerror=1>')).toBe('&lt;!-- 안 닫힘 <img src="x">')
  })
  it('`&amp;` 가 든 상대 주소와 메일은 살아남고, 스킴 자리의 이름 엔티티는 버린다', () => {
    expect(safeUrl('R&amp;D.md')).toBe(true)
    expect(safeUrl('mailto:a&amp;b@x.com')).toBe(true)
    expect(safeUrl('x?a=1&amp;b=2')).toBe(true)
    expect(safeUrl('javascript&colon;alert(1)')).toBe(false)
    expect(safeUrl('java&Tab;script:alert(1)')).toBe(false)
    expect(safeUrl('java&#x73;cript:alert(1)')).toBe(false)
    expect(safeUrl('&#106;avascript:alert(1)')).toBe(false)
    expect(renderMarkdown('[R&D](R&D.md)')).toContain('<a href="R&amp;D.md">')
  })
  it('속성 값에 든 수식 자리표는 지운다 — 거른 뒤 KaTeX HTML 이 속성 안에 끼지 않게', () => {
    const h = renderMarkdown('![$a$](https://x.test/p.png)', () => '<span class="katex" title="x">a</span>')
    expect(h).toContain('<img src="https://x.test/p.png" alt="">')
    expect(h).not.toContain('katex')
  })
  it('`![](상대경로.png)` 는 위키 그림과 같은 길로 — 바깥 주소와 그림 아닌 것은 그대로', () => {
    expect(renderMarkdown('![차트](out/차트 1.png)')).not.toContain('wimg')   // 공백이 든 주소는 마크다운 그림이 아니다
    expect(renderMarkdown('![차트](out/chart.png)')).toContain('<img class="wimg" data-wiki="out/chart.png" alt="차트">')
    expect(renderMarkdown('![](./a%20b.png)')).toContain('data-wiki="a b.png" alt="a b.png"')
    expect(renderMarkdown('![x](https://x.test/a.png)')).toContain('<img src="https://x.test/a.png" alt="x">')
    expect(relImage('data:image/png;base64,AAAA')).toBeNull()
    expect(relImage('//x.test/a.png')).toBeNull()
    expect(relImage('notes/readme.md')).toBeNull()
  })
})
