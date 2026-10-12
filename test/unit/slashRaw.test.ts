import { describe, it, expect } from 'vitest'
import { isCliSlash } from '../../src/core/clientCtx'

/** CF-2 · 실 CLI 는 글 맨 앞이 `/이름` 일 때만 명령으로 받는다 — 아는 이름일 때만 기기 블록 없이 보낸다 (2026-10-12) */
describe('CF-2 isCliSlash', () => {
  const known = ['goal', 'loop', 'compact', 'example-skills:pdf']
  it('아는 명령은 맨 글로', () => {
    expect(isCliSlash('/goal 테스트 통과까지', known)).toBe(true)
    expect(isCliSlash('  /loop', known)).toBe(true)
    expect(isCliSlash('/example-skills:pdf a.pdf', known)).toBe(true)
  })
  it('경로·모르는 이름·중간의 슬래시는 일반 말', () => {
    expect(isCliSlash('/Users/dave/x 봐', known)).toBe(false)
    expect(isCliSlash('/tmp 정리해', known)).toBe(false)
    expect(isCliSlash('/goals', known)).toBe(false)
    expect(isCliSlash('이거 /goal 로 해', known)).toBe(false)
  })
})
