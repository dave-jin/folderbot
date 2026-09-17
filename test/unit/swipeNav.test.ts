import { describe, it, expect } from 'vitest'
import { navOf } from '../../src/client/swipe'

/** 폰 화면 넘기기 판정 (2026-09-17 Dave) — 대화는 세로 스크롤 화면이라 가로가 분명히 이겨야 넘긴다 */
describe('navOf', () => {
  it('오른쪽으로 충분히 끌면 뒤로', () => expect(navOf(180, 8, 390)).toBe('back'))
  it('왼쪽으로 충분히 끌면 폴더(패널)', () => expect(navOf(-180, -6, 390)).toBe('panel'))
  it('짧으면 아무것도 아니다 (72px · 폭의 22% 미만)', () => { expect(navOf(60, 0, 390)).toBeNull(); expect(navOf(80, 0, 390)).toBeNull() })
  it('넓은 화면에선 폭의 22% 를 넘어야 한다', () => { expect(navOf(100, 0, 800)).toBeNull(); expect(navOf(180, 0, 800)).toBe('back') })
  it('세로가 섞이면(가로 < 세로 × 1.6) 스크롤이지 넘기기가 아니다', () => { expect(navOf(120, 100, 390)).toBeNull(); expect(navOf(120, 60, 390)).toBe('back') })
})
