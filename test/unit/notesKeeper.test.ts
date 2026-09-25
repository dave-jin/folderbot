import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { createNoteKeeper, DAY } = createRequire(import.meta.url)('../../desktop/notes.js')

/** 2026-09-25 Dave — 원격에서 알림을 누르면 엉뚱한 세션. 원인: 알림 객체가 GC 로 사라져 클릭 처리기가 없어졌다 */
describe('알림 붙잡기 (desktop/notes.js)', () => {
  it('띄운 알림을 붙잡고, 눌리면 놓는다', () => {
    const k = createNoteKeeper(); const a = {}, b = {}
    k.keep(a, 0); k.keep(b, 1)
    expect(k.size()).toBe(2)
    k.release(a); expect(k.size()).toBe(1)
  })
  it('하루 지난 것은 놓는다(셸이 알림 센터에서 걷는다)', () => {
    const k = createNoteKeeper(); const old = {}, now = {}
    k.keep(old, 0)
    expect(k.keep(now, DAY + 1)).toEqual([old])
    expect(k.size()).toBe(1)
  })
  it('너무 많으면 오래된 것부터 놓는다', () => {
    const k = createNoteKeeper({ max: 2 }); const xs = [{}, {}, {}]
    k.keep(xs[0], 1); k.keep(xs[1], 2)
    expect(k.keep(xs[2], 3)).toEqual([xs[0]])
    expect(k.size()).toBe(2)
  })
  it('앱이 꺼질 때는 붙잡은 것 전부를 돌려주고 비운다', () => {
    const k = createNoteKeeper(); const a = {}, b = {}
    k.keep(a, 0); k.keep(b, 0)
    expect(k.all()).toEqual([a, b]); expect(k.size()).toBe(0)
  })
})
