import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EDGE_PX, canStartSwipe, dragProgress, fromLeftEdge, lockOf, scrollableEats, stageOf, swipeVerdict } from '../../src/core/drawer'
describe('H · 반응형 3단계 + 세 칸 띠', () => {
  it('단계는 창 폭으로만 — 1400 넓음 · 900 중간 · 500 좁음 · 경계 1200/768', () => {
    expect([1400, 1200, 1199, 900, 768, 767, 500, 320].map(stageOf)).toEqual(['wide', 'wide', 'mid', 'mid', 'mid', 'narrow', 'narrow', 'narrow'])
  })
  it('띠는 한 칸씩 — 채팅 👉 레일 · 채팅 👈 문서 · 반대로 쓸면 닫힘 · 건너뛰지 않음(문서 열린 채 👉 두 번 → 레일)', () => {
    // Z-2(2026-09-22) · 세 칸 띠는 폐기됐다 — 목적지 판정은 `core/navstack.ts` 로 옮겼고 그 테스트는 navstack.test.ts 다
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
    expect(dragProgress(true, 'left', 150, 300)).toBe(0.5); expect(dragProgress(true, 'right', -150, 300)).toBe(0.5); expect(dragProgress(true, 'left', -50, 300)).toBe(0)
    expect(dragProgress(false, 'left', -150, 300)).toBe(0.5); expect(dragProgress(false, 'right', 150, 300)).toBe(0.5); expect(dragProgress(false, 'right', 900, 300)).toBe(0)
  })
})

describe('AH · 쓸기는 맨 왼쪽 가장자리에서만 (2026-09-24 Dave)', () => {
  it('가장자리 안에서 잡으면 시작하고, 안쪽에서 잡으면 안 시작한다', () => {
    expect(fromLeftEdge(0)).toBe(true)
    expect(fromLeftEdge(EDGE_PX)).toBe(true)
    expect(fromLeftEdge(EDGE_PX + 1)).toBe(false)
    expect(fromLeftEdge(200)).toBe(false)   // 할 일·폴더의 쓸리는 행이 사는 자리 — 여기서 다투면 안 된다
  })
})

/**
 * 폰의 폴더 목록은 화면 전체를 덮는다 (2026-11-13 Dave: «모바일에서 현재 사이드 슬라이딩 방식으로 나오는
 * 폴더블 리스트를 그냥 전체로 보이게 해줘» · 목업 «가 — 전체 폭»).
 * 86% 로 되돌리면 오른쪽에 대화 화면이 다시 비친다. 중간 폭(띠 52px 옆 280px)은 그대로다.
 * 실제 렌더에서의 폭은 스모크(«AD: 왼쪽 서랍 = 봇 목록(홈)»)가 잰다.
 */
describe('폰의 폴더 목록은 전체 폭 (2026-11-13 Dave)', () => {
  const css = readFileSync(resolve(__dirname, '../../src/client/styles.css'), 'utf8')
  const app = readFileSync(resolve(__dirname, '../../src/client/App.tsx'), 'utf8')
  const phone = (() => { const i = css.indexOf('@media (max-width: 767px) {'); expect(i).toBeGreaterThan(-1); return css.slice(i, css.indexOf('\n}', i)) })()
  it('좁음 단계의 왼쪽 서랍 폭은 100% 다', () => {
    const m = phone.match(/\n\s*\.drawer\.left\s*\{\s*width:([^;}]+)[;}]/)
    expect(m?.[1].trim()).toBe('100%')
  })
  it('중간 폭의 왼쪽 서랍은 그대로 280px 이다', () => {
    expect(css).toMatch(/\.app\.smid \.drawer\.left \{ left:52px; width:280px \}/)
  })
  it('쓸어 여는 동안 폭을 못 재면 폰에서는 화면 폭을 쓴다(85% 가 아니다)', () => {
    const line = app.split('\n').find((l) => l.includes('const paintDrag = ')) ?? ''
    expect(line).toContain('window.innerWidth * (phone ? 1 : 0.85)')
  })
  it('홈의 폴더 줄은 어느 폴더인지 표식을 단다 — 목록에서 있던 폴더로 돌아가는 길을 스모크가 실제로 누른다', () => {
    const line = app.split('\n').find((l) => l.includes('const row = <button key={b.id} className={`mrow ')) ?? ''
    expect(line).toContain('data-bot={b.id}')
  })
})
