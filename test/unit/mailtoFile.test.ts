import { describe, it, expect } from 'vitest'
import { unlinkFileMailto } from '../../src/core/paths'

/**
 * AP (2026-09-24 Dave · 스크린샷_2229) — 맥 캡처 도구가 짓는 `… PM@2x.png` 를 마크다운이 **메일 주소**로 보고
 * `<a href="mailto:…">` 로 감쌌다. 그 탓에 ① 칩이 영영 안 생기고 ② 눌러도 메일 앱이 떴다.
 */
describe('AP · 메일로 오인된 파일 이름', () => {
  it('🔴 확장자로 끝나는 「메일」은 링크를 푼다', () => {
    expect(unlinkFileMailto('<p>캡처는 <a href="mailto:PM@2x.png">PM@2x.png</a> 입니다</p>'))
      .toBe('<p>캡처는 PM@2x.png 입니다</p>')
  })
  it('진짜 메일은 그대로 둔다', () => {
    const h = '<p>연락은 <a href="mailto:dave@example.com">dave@example.com</a> 으로</p>'
    expect(unlinkFileMailto(h)).toBe(h)
  })
  it('사람이 손으로 쓴 링크(글자가 주소와 다른 것)는 건드리지 않는다', () => {
    const h = '<a href="mailto:a@b.png">여기로 보내</a>'
    expect(unlinkFileMailto(h)).toBe(h)
  })
  it('여러 개도 한 번에 · 대소문자 무관', () => {
    expect(unlinkFileMailto('<a href="mailto:A@2X.PNG">A@2X.PNG</a> 와 <a href="mailto:b@1x.pdf">b@1x.pdf</a>'))
      .toBe('A@2X.PNG 와 b@1x.pdf')
  })
})
