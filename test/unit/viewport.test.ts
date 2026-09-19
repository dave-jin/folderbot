import { describe, it, expect } from 'vitest'
import { applyViewport, planViewport } from '../../src/core/viewport'
describe('viewport anchor (I-2 · O · P-4 한 함수)', () => {
  it('입력 중이면 시각 뷰포트를 루트에 · 아니면 변수를 지운다 · 밀린 문서는 되돌린다', () => {
    const p = planViewport(true, { height: 508, offsetTop: 0 }, 844, 0); expect(p.vars).toEqual({ vvh: '508px', vvt: '0px', kbh: '336px' }); expect(p.resetScroll).toBe(false)
    expect(planViewport(true, { height: 508, offsetTop: 40 }, 844, 60).resetScroll).toBe(true)
    expect(planViewport(false, { height: 844, offsetTop: 0 }, 844, 0).vars).toBeNull()
    const set: string[] = [], rem: string[] = []; let scrolled: number[] | null = null
    applyViewport(planViewport(true, { height: 508, offsetTop: 0 }, 844, 60), { setProperty: (k, v) => { set.push(k + '=' + v) }, removeProperty: (k) => { rem.push(k) } }, (x, y) => { scrolled = [x, y] })
    expect(set).toEqual(['--vvh=508px', '--vvt=0px', '--kbh=336px']); expect(scrolled).toEqual([0, 0])
    applyViewport(planViewport(false, { height: 844, offsetTop: 0 }, 844, 0), { setProperty: () => {}, removeProperty: (k) => { rem.push(k) } }, () => {}); expect(rem).toEqual(['--vvh', '--vvt', '--kbh'])
  })
})
