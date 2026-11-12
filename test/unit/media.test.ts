import { describe, it, expect } from 'vitest'
import { mediaKind, planCards, type MediaBlock } from '../../src/core/media'
import { bareFileNames } from '../../src/core/paths'

const img = (rel: string) => ({ rel, kind: mediaKind(rel) })
const one = (rel: string, next = false): MediaBlock => ({ refs: [img(rel)], only: true, next })

describe('mediaKind', () => {
  it('확장자로 가른다 — 대소문자 무관 · 모르면 null', () => {
    expect(mediaKind('a/b/소개영상_v2.MP4')).toBe('video')
    expect(mediaKind('낭독.m4a')).toBe('audio')
    expect(mediaKind('썸네일@2x.png')).toBe('image')
    expect(mediaKind('수강안내.pdf')).toBe('pdf')
    expect(mediaKind('기획.docx')).toBeNull()
    expect(mediaKind('폴더/')).toBeNull()
    expect(mediaKind('README')).toBeNull()
  })
  it('파일 이름만 적힌 음성·영상도 칩 후보가 된다 (FILE_EXT)', () => {
    const got = bareFileNames('녹음은 낭독.m4a 와 인트로.webm 에 있어요')   // 왼쪽 낱말까지 넓힌 후보도 함께 나온다 — 어느 것이 있는지는 호스트가 고른다
    expect(got).toContain('낭독.m4a'); expect(got).toContain('인트로.webm')
  })
})

describe('planCards', () => {
  it('혼자 선 블록만 카드가 된다 — 문장 속 참조는 그대로', () => {
    const p = planCards([{ refs: [img('a.png')], only: false }, one('b.mp4'), { refs: [], only: true }])
    expect(p.cards).toEqual([{ type: 'video', rels: ['b.mp4'], at: 1 }])
    expect(p.gone).toEqual([])
  })
  it('한 블록의 그림 여러 장은 한 묶음', () => {
    const p = planCards([{ refs: [img('a.png'), img('b.jpg'), img('c.webp')], only: true }])
    expect(p.cards).toEqual([{ type: 'gallery', rels: ['a.png', 'b.jpg', 'c.webp'], at: 0 }])
  })
  it('이웃한 그림 블록은 앞 묶음에 붙고 그 블록은 사라진다', () => {
    const p = planCards([one('a.png'), one('b.png', true), one('c.png', true), one('d.mp4', true), one('e.png', true)])
    expect(p.cards).toEqual([{ type: 'gallery', rels: ['a.png', 'b.png', 'c.png'], at: 0 }, { type: 'video', rels: ['d.mp4'], at: 3 }, { type: 'image', rels: ['e.png'], at: 4 }])
    expect(p.gone).toEqual([1, 2])
  })
  it('떨어져 있는 그림은 묶지 않는다', () => {
    const p = planCards([one('a.png'), { refs: [], only: false, next: true }, one('b.png', true)])
    expect(p.cards.map((c) => c.type)).toEqual(['image', 'image'])
    expect(planCards([one('a.png'), one('b.png', false)]).cards).toHaveLength(2)   // 형제가 아니면(다른 목록) 따로
  })
  it('섞인 블록 — 그림은 이어진 것끼리, 나머지는 하나씩', () => {
    const p = planCards([{ refs: [img('a.png'), img('b.png'), img('c.mp4'), img('d.m4a'), img('e.pdf')], only: true }])
    expect(p.cards.map((c) => [c.type, c.rels.length])).toEqual([['gallery', 2], ['video', 1], ['audio', 1], ['pdf', 1]])
  })
  it('카드는 cap 까지 — 넘는 블록부터는 손대지 않는다', () => {
    const bl = ['a.mp4', 'b.mp4', 'c.pdf', 'd.m4a', 'e.mp4', 'f.png'].map((r) => one(r, true))
    const p = planCards(bl)
    expect(p.cards.map((c) => c.at)).toEqual([0, 1, 2, 3])
    expect(planCards(bl, 2).cards).toHaveLength(2)
    // 한 블록이 통째로 안 들어가면 그 블록은 쪼개지 않는다
    expect(planCards([one('a.mp4'), { refs: [img('b.mp4'), img('c.mp4')], only: true }], 2).cards).toHaveLength(1)
  })
  it('모르는 종류 · 여러 곳에 걸린 이름이 섞이면 블록째 둔다', () => {
    expect(planCards([{ refs: [img('a.png'), img('b.docx')], only: true }]).cards).toEqual([])
    expect(planCards([{ refs: [{ rel: 'a.png', kind: 'image', multi: true }], only: true }]).cards).toEqual([])
  })
  it('묶음에 붙는 그림은 cap 을 쓰지 않는다', () => {
    const p = planCards([one('v1.mp4'), one('v2.mp4', true), one('v3.mp4', true), one('a.png', true), one('b.png', true), one('c.png', true)])
    expect(p.cards).toHaveLength(4)
    expect(p.cards[3]).toEqual({ type: 'gallery', rels: ['a.png', 'b.png', 'c.png'], at: 3 })
  })
})
