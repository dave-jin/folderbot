import { describe, it, expect } from 'vitest'
import { expandWikilinks, outsideCode, wikiNames } from '../../src/core/wikilinks'

/** K-1 · 위키링크 (2026-09-19) */
describe('wikilinks', () => {
  it('![[그림]] → img · [[노트]] → 링크 · 별명', () => {
    expect(expandWikilinks('a ![[x.png]] b')).toBe('a <img class="wimg" data-wiki="x.png" alt="x.png"> b')
    expect(expandWikilinks('[[노트]] · [[폴더/노트|별명]]')).toBe('<a class="wlink" data-wiki="노트">노트</a> · <a class="wlink" data-wiki="폴더/노트">별명</a>')
    expect(expandWikilinks('![[문서.md]]')).toBe('<a class="wlink" data-wiki="문서.md">문서.md</a>')   // 그림 확장자가 아니면 링크
  })
  it('코드 안은 그대로', () => {
    const md = '`[[x]]` 와 ```\n![[y.png]]\n``` 밖 [[z]]'
    expect(expandWikilinks(md)).toBe('`[[x]]` 와 ```\n![[y.png]]\n``` 밖 <a class="wlink" data-wiki="z">z</a>')
    expect(wikiNames(md)).toEqual(['z'])
    expect(outsideCode('a `b` c', (s) => s.toUpperCase())).toBe('A `b` C')
  })
  it('이름 목록 — 중복 제거 · 순서', () => {
    expect(wikiNames('![[a.png]] [[b]] [[a.png]] [[b|x]]')).toEqual(['a.png', 'b'])
    expect(expandWikilinks('[[ ]]')).toBe('[[ ]]')
  })
})
