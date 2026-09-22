import { describe, it, expect } from 'vitest'
import { clampDockOffset, isDockDrag, readDockOffset } from '../../src/core/dock'
describe('V · 알약 독 자리', () => {
  it('화면 밖으로 안 나간다 — 가운데 기준 ±(반 높이 − 여백)', () => {
    // 뷰포트 800 · 독 160 → 반 = (800-160)/2 - 12 = 308
    expect(clampDockOffset(0, 800, 160)).toBe(0)
    expect(clampDockOffset(1000, 800, 160)).toBe(308)
    expect(clampDockOffset(-1000, 800, 160)).toBe(-308)
    expect(clampDockOffset(100, 800, 160)).toBe(100)
  })
  it('작은 화면에서 열어도 갇힌다 — 큰 저장값이 그대로 쓰이지 않는다', () => {
    expect(clampDockOffset(308, 400, 160)).toBe(108)   // (400-160)/2-12
    expect(clampDockOffset(50, 100, 160)).toBe(0)      // 독이 화면보다 크면 가운데
  })
  it('저장값이 깨졌으면 가운데', () => {
    expect(readDockOffset(null)).toBe(0); expect(readDockOffset('x')).toBe(0); expect(readDockOffset('-42')).toBe(-42)
    expect(clampDockOffset(NaN, 800, 160)).toBe(0)
  })
  it('6px 를 넘겨야 «옮김» — 그 아래는 탭이다', () => {
    expect(isDockDrag(2)).toBe(false); expect(isDockDrag(-6)).toBe(true); expect(isDockDrag(20)).toBe(true)
  })
})
