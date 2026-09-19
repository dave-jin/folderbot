import { describe, it, expect } from 'vitest'
import { bandNext, canStartSwipe, dragProgress, lockOf, scrollableEats, stageOf, swipeTarget, swipeVerdict } from '../../src/core/drawer'
describe('H · 반응형 3단계 + 세 칸 띠', () => {
  it('단계는 창 폭으로만 — 1400 넓음 · 900 중간 · 500 좁음 · 경계 1200/768', () => {
    expect([1400, 1200, 1199, 900, 768, 767, 500, 320].map(stageOf)).toEqual(['wide', 'wide', 'mid', 'mid', 'mid', 'narrow', 'narrow', 'narrow'])
  })
  it('띠는 한 칸씩 — 채팅 👉 레일 · 채팅 👈 문서 · 반대로 쓸면 닫힘 · 건너뛰지 않음(문서 열린 채 👉 두 번 → 레일)', () => {
    expect(bandNext('chat', 'r')).toBe('left'); expect(bandNext('chat', 'l')).toBe('right')
    expect(bandNext('left', 'l')).toBe('chat'); expect(bandNext('left', 'r')).toBe('left')
    expect(bandNext('right', 'r')).toBe('chat'); expect(bandNext('right', 'l')).toBe('right')
    expect(bandNext(bandNext('right', 'r'), 'r')).toBe('left')
    expect(swipeTarget('chat', 'l')).toEqual({ side: 'right', next: 'right' }); expect(swipeTarget('right', 'r')).toEqual({ side: 'right', next: 'chat' }); expect(swipeTarget('left', 'r')).toBeNull()
  })
  it('잠금 — 가로가 세로의 2배를 넘어야 쓸기 · 10px 전에는 모른다', () => {
    expect(lockOf(3, 2)).toBeNull(); expect(lockOf(30, 5)).toBe('h'); expect(lockOf(30, 20)).toBe('v'); expect(lockOf(4, 40)).toBe('v'); expect(lockOf(21, 10)).toBe('h'); expect(lockOf(20, 10)).toBe('v')
  })
  it('놓기 — 30% 넘으면 열림 · 30% 미만이면 되돌아감 · 빠르게 튕기면 30% 미만이어도 열림', () => {
    expect(swipeVerdict(120, 600, 390)).toBe(true)     // 30.7%
    expect(swipeVerdict(100, 600, 390)).toBe(false)    // 25.6% 느리게
    expect(swipeVerdict(60, 80, 390)).toBe(true)       // 0.75px/ms 튕김
    expect(swipeVerdict(12, 10, 390)).toBe(false)      // 너무 짧다
  })
  it('시작 조건 — 터치 기기에서만 · 글 고르는 중 아님 · 입력칸·가로 요소 위 아님', () => {
    expect(canStartSwipe({ coarse: true, selecting: false, inInput: false, consumeX: false })).toBe(true)
    expect(canStartSwipe({ coarse: false, selecting: false, inInput: false, consumeX: false })).toBe(false)
    expect(canStartSwipe({ coarse: true, selecting: true, inInput: false, consumeX: false })).toBe(false)
    expect(canStartSwipe({ coarse: true, selecting: false, inInput: true, consumeX: false })).toBe(false)
    expect(canStartSwipe({ coarse: true, selecting: false, inInput: false, consumeX: true })).toBe(false)
  })
  it('가로 스크롤 요소는 끝까지 간 뒤에야 서랍 — 코드 블록 안에서 왼쪽 쓸기는 스크롤이 먹는다', () => {
    const code = { scrollWidth: 800, clientWidth: 350, scrollLeft: 0 }
    expect(scrollableEats(code, 'l')).toBe(true); expect(scrollableEats(code, 'r')).toBe(false)
    expect(scrollableEats({ ...code, scrollLeft: 450 }, 'l')).toBe(false); expect(scrollableEats({ ...code, scrollLeft: 450 }, 'r')).toBe(true)
    expect(scrollableEats({ scrollWidth: 350, clientWidth: 350, scrollLeft: 0 }, 'l')).toBe(false)
  })
  it('끌리는 동안 — 여는 중 0→1 · 닫는 중 1→0 · 범위 밖은 자른다', () => {
    expect(dragProgress('chat', 'left', 150, 300)).toBe(0.5); expect(dragProgress('chat', 'right', -150, 300)).toBe(0.5); expect(dragProgress('chat', 'left', -50, 300)).toBe(0)
    expect(dragProgress('left', 'left', -150, 300)).toBe(0.5); expect(dragProgress('right', 'right', 150, 300)).toBe(0.5); expect(dragProgress('right', 'right', 900, 300)).toBe(0)
  })
})
