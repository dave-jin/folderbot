import { describe, it, expect } from 'vitest'
import { MOOD_RANK, type BotMood } from '../../src/core/unread'

/** AZ (2026-09-25 Dave: «'대기' 항목은 맨 밑으로 보내지 말고 '유휴' 항목보다는 위에») */
describe('상태 정렬 차례', () => {
  it('대기(hold)는 유휴(idle)·절전(sleep)보다 위 — 표에서 빠져 맨 뒤로 가던 것', () => {
    expect(MOOD_RANK.hold).toBeLessThan(MOOD_RANK.idle)
    expect(MOOD_RANK.hold).toBeLessThan(MOOD_RANK.sleep)
  })
  it('확인 대기 → 일하는 중 → 대기 → 문제 → 끝남 → 유휴 → 절전', () => {
    const order = (Object.keys(MOOD_RANK) as BotMood[]).sort((a, b) => MOOD_RANK[a] - MOOD_RANK[b])
    expect(order).toEqual(['wait', 'work', 'hold', 'error', 'done', 'idle', 'sleep'])
  })
})
