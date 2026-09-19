import { describe, it, expect } from 'vitest'
import { freshness, cachePathFor, placeholderName } from '../../src/core/localOpen'

/**
 * 원격에서 파일 열기 (E · 2026-09-19 Dave 1안 확정) — «이 기기의 볼트 루트 + 볼트 기준 상대 경로 = 같은 파일».
 * 순수 판정만 여기서: 후보 경로 만들기 · 후보 순위(껍데기 폴더는 1순위가 아니다) · 신선도 · 캐시 자리.
 */
describe('freshness — 호스트와 내 사본이 같은가', () => {
  const host = { size: 100, head: 'abc' }
  it('같음 · 다름 · 없음 · 자리표시자', () => {
    expect(freshness(host, { exists: true, size: 100, head: 'abc' })).toBe('same')
    expect(freshness(host, { exists: true, size: 100, head: 'xyz' })).toBe('differs')
    expect(freshness(host, { exists: true, size: 99, head: 'abc' })).toBe('differs')
    expect(freshness(host, { exists: false })).toBe('missing')
    expect(freshness(host, { exists: false, placeholder: true })).toBe('placeholder')
  })
})

describe('cachePathFor · placeholderName', () => {
  it('캐시는 userData 아래 호스트 이름 · rel — Dropbox 폴더 밖 · 위로 못 올라간다', () => {
    expect(cachePathFor('/ud', 'Mini', '3. Area/x/a.pdf')).toBe('/ud/remote-cache/Mini/3. Area/x/a.pdf')
    expect(cachePathFor('/ud', 'Mini', '../../etc/passwd')).toBe('/ud/remote-cache/Mini/etc/passwd')
    expect(cachePathFor('/ud', 'a/b', 'x')).toBe('/ud/remote-cache/a_b/x')
  })
  it('iCloud 자리표시자 이름', () => { expect(placeholderName('/v/docs/a.pdf')).toBe('/v/docs/.a.pdf.icloud') })
})
