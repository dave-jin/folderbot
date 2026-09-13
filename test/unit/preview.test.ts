import { describe, expect, it } from 'vitest'
import { clean, fallbackMeta, parseMeta } from '../../src/core/preview'

describe('링크 미리보기 — 남의 HTML 에서 무엇을 고를까', () => {
  it('og 를 먼저 쓰고, 없으면 twitter · <title> 로 내려간다', () => {
    const og = parseMeta('<meta property="og:title" content="오지"><title>타이틀</title>')
    expect(og.title).toBe('오지')
    const tw = parseMeta('<meta name="twitter:title" content="트위터"><title>타이틀</title>')
    expect(tw.title).toBe('트위터')
    expect(parseMeta('<title>타이틀</title>').title).toBe('타이틀')
  })

  it('property·name·itemprop 어느 쪽으로 적혀도 같은 통에 들어간다', () => {
    expect(parseMeta('<meta name="description" content="설명">').desc).toBe('설명')
    expect(parseMeta('<meta itemprop="description" content="설명">').desc).toBe('설명')
  })

  // ⚠ 먼저 나온 것이 이긴다 — 본문 뒤쪽의 광고용 메타에 밀리면 엉뚱한 제목이 박힌다
  it('같은 키가 두 번 나오면 앞의 것이 이긴다', () => {
    expect(parseMeta('<meta property="og:title" content="진짜"><meta property="og:title" content="광고">').title).toBe('진짜')
  })

  it('엔티티를 풀고 줄바꿈을 한 칸으로 — 제목에 &amp; 가 보이면 안 된다', () => {
    expect(clean('A &amp; B')).toBe('A & B')
    expect(clean('&#39;따옴표&#x27;')).toBe("'따옴표'")
    expect(clean(' 여러\n   줄 ')).toBe('여러 줄')
  })

  // 🔴 깨진 HTML 에서 멈추면 안 된다 — 모두 옵셔널이고, 없으면 빈 문자열이다
  it('메타가 하나도 없어도 던지지 않는다', () => {
    expect(parseMeta('<html><body>그냥 글</body></html>')).toEqual({ title: '', desc: '', image: null, site: '' })
  })

  it('주소만으로도 박스가 비지 않는다 (fallbackMeta)', () => {
    expect(fallbackMeta('https://stib.ee/6QNO')).toMatchObject({ host: 'stib.ee', title: '6QNO' })
    expect(fallbackMeta('https://www.example.com/')?.host).toBe('example.com')
    expect(fallbackMeta('mailto:a@b.c')).toBeNull()      // 열 수 없는 것은 미리보기도 없다
    expect(fallbackMeta('not a url')).toBeNull()
  })
})
