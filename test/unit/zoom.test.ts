import { describe, it, expect } from 'vitest'
import { centered, clampView, fitScale, zoomAt } from '../../src/core/zoom'
import { evictPlan, eta, fmtBytes } from '../../src/core/cache'

describe('zoom (M-1)', () => {
  it('맞춤 배율은 원본을 넘지 않는다', () => { expect(fitScale(2000, 1000, 500, 500)).toBe(0.25); expect(fitScale(100, 100, 500, 500)).toBe(1) })
  it('커서 아래 점이 그대로다', () => {
    const v = centered(1000, 800, 500, 400, 0.5)          // {s:.5, x:0, y:0}
    const z = zoomAt(v, 2, 200, 100)
    // 화면 (200,100) 아래 그림 점 (400,200) 은 확대 뒤에도 (200,100) 에 있다
    expect(z.s).toBe(1); expect(z.x + 400 * z.s).toBeCloseTo(200); expect(z.y + 200 * z.s).toBeCloseTo(100)
    expect(zoomAt(v, 100, 0, 0).s).toBe(8); expect(zoomAt(v, 0.001, 0, 0).s).toBe(0.1)
  })
  it('작으면 가운데 · 크면 틈 없이', () => {
    expect(clampView({ s: 0.25, x: -99, y: 7 }, 1000, 800, 500, 400)).toEqual({ s: 0.25, x: 125, y: 100 })
    expect(clampView({ s: 2, x: 50, y: -5000 }, 1000, 800, 500, 400)).toEqual({ s: 2, x: 0, y: -1200 })
  })
})
describe('cache (M)', () => {
  it('상한을 넘으면 오래된 것부터 지운다', () => {
    const e = [{ path: 'a', size: 600, atime: 3 }, { path: 'b', size: 500, atime: 1 }, { path: 'c', size: 400, atime: 2 }]
    expect(evictPlan(e, 1000)).toEqual(['b'])
    expect(evictPlan(e, 300)).toEqual(['b', 'c', 'a'])
    expect(evictPlan(e, 2000)).toEqual([])
  })
  it('용량·남은 시간 표기', () => { expect(fmtBytes(2.5e9)).toBe('2.5GB'); expect(fmtBytes(1500)).toBe('2KB'); expect(eta(50, 100, 25)).toBe(2); expect(eta(50, 100, 0)).toBeNull() })
})
