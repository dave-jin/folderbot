import { describe, it, expect } from 'vitest'
import { badgeOn, unreadRing, type BotMood } from '../../src/core/unread'

/** AU (2026-09-25 Dave 승인) — 「끝났고 읽었으면 닷이 없다 · 읽을 게 있을 때만 더블링」 */
describe('AU · 배지는 무슨 일이 있을 때만', () => {
  it('🔴 끝났고 이미 읽었으면 아무것도 없다 — 캡처 2번(PARA AI)의 초록 닷', () => {
    expect(badgeOn('done', false)).toBe(false)
  })
  it('시작 안 함 · 잠듦도 읽을 게 없으면 없다(캡처 1번 NewJob — 종전과 같음)', () => {
    expect(badgeOn('idle', false)).toBe(false)
    expect(badgeOn('sleep', false)).toBe(false)
  })
  it('돌고 있거나 누군가를 기다리면 읽었어도 닷이 있다', () => {
    for (const m of ['work', 'hold', 'wait', 'error'] as BotMood[]) expect(badgeOn(m, false), m).toBe(true)
  })
  it('🔴 읽을 게 있으면 늘 뜨고, 사람 차례일 때만 더블링이다', () => {
    const all: BotMood[] = ['idle', 'work', 'hold', 'wait', 'done', 'sleep', 'error']
    for (const m of all) expect(badgeOn(m, true), m).toBe(true)
    expect(all.filter((m) => unreadRing(m))).toEqual(['idle', 'wait', 'done', 'sleep', 'error'])
  })
})
