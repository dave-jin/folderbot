import { describe, it, expect } from 'vitest'
import { unreadRing, type BotMood } from '../../src/core/unread'

/**
 * AN (2026-09-24 Dave) — 「안 읽은 게 있지만 **끝나지 않은** 상태에서는 더블링이 나오면 안 된다」.
 * 규칙은 색이 아니라 **「사람이 볼 차례인가」** 다.
 */
describe('AN · 안 읽음 링은 사람 차례일 때만', () => {
  it('🔴 도는 중에는 링이 없다 — 봇이 일하는 중(주황) · 남을 기다리는 중(청록)', () => {
    expect(unreadRing('work')).toBe(false)
    expect(unreadRing('hold')).toBe(false)
  })
  it('🔴 사람이 볼 차례면 링이 있다 — 끝남(초록) · 네 차례(노랑) · 오류(빨강)', () => {
    expect(unreadRing('done')).toBe(true)
    expect(unreadRing('wait')).toBe(true)
    expect(unreadRing('error')).toBe(true)
  })
  it('배지가 없는 상태(쉬는 중·잠듦)에서 안 읽은 답이 있으면 그것은 끝난 것이다 — 링', () => {
    expect(unreadRing('idle')).toBe(true)
    expect(unreadRing('sleep')).toBe(true)
  })
  it('모든 상태가 둘 중 하나로 갈린다 — 빠진 값이 없다', () => {
    const all: BotMood[] = ['idle', 'work', 'hold', 'wait', 'done', 'sleep', 'error']
    expect(all.filter((m) => unreadRing(m)).length + all.filter((m) => !unreadRing(m)).length).toBe(all.length)
    expect(all.filter((m) => !unreadRing(m))).toEqual(['work', 'hold'])
  })
})
