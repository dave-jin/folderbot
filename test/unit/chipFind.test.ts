import { describe, it, expect } from 'vitest'
import { findChips } from '../../src/core/chipFind'

/** CA · 글 속 `@이름` 칩은 아는 이름과 맞춰 찾는다 (2026-10-11 Dave 스크린샷_2326) */
describe('findChips (CA)', () => {
  it('공백·괄호가 든 이름도 통째로 찾는다', () => {
    const n = 'x 회의록 (최종)_2026.txt'
    expect(findChips(`아래로 만들어 줘.\n@${n} `, [n])).toEqual([{ index: 11, end: 12 + n.length, name: n }])
  })
  it('긴 이름부터 — 짧은 이름이 긴 이름의 앞부분을 먹지 않는다', () => {
    const r = findChips('@a.txt 사본.txt 와 @a.txt', ['a.txt', 'a.txt 사본.txt'])
    expect(r.map((h) => h.name)).toEqual(['a.txt 사본.txt', 'a.txt'])
  })
  it('이름 뒤는 공백·@·끝이어야 한다 — 종전 규칙과 같다', () => {
    expect(findChips('@a.txt, 그리고', ['a.txt'])).toEqual([])
    expect(findChips('@a.txt@b.md', ['a.txt', 'b.md']).map((h) => h.name)).toEqual(['a.txt', 'b.md'])
  })
  it('모르는 이름·빈 목록은 칩이 아니다', () => {
    expect(findChips('@누구 안녕', ['a.txt'])).toEqual([])
    expect(findChips('@a.txt', [])).toEqual([])
  })
})
