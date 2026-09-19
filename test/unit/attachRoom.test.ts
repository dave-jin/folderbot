import { describe, it, expect } from 'vitest'
import { attachRoom } from '../../src/core/attach'
const MB = 1024 * 1024
describe('attachRoom (N-3)', () => {
  it('11개째는 거절 · 50MB 넘는 것은 거절 · 이유가 있다', () => {
    const ten = Array.from({ length: 10 }, () => ({ size: 1 }))
    const r = attachRoom(ten.slice(0, 9), [{ size: 1 }, { size: 1 }]); expect(r.ok.length).toBe(1); expect(r.reason).toMatch(/10개까지/)
    const b = attachRoom([{ size: 30 * MB }], [{ size: 15 * MB }, { size: 10 * MB }, { size: 4 * MB }]); expect(b.ok.map((x) => x.size / MB)).toEqual([15, 4]); expect(b.reason).toMatch(/50MB/)
    expect(attachRoom([], [{ size: 1 }]).reason).toBe('')
  })
})
