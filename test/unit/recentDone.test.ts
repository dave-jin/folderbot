import { describe, it, expect } from 'vitest'
import { recentDone, badgeOn, unreadRing, RECENT_MS } from '../../src/core/unread'

/** BH · 방금 끝난 최신 3(2시간 안)은 읽은 뒤에도 초록 원닷 (2026-09-27 Dave 확정: «최신 3개 + 2시간 안») */
const NOW = Date.parse('2026-09-27T09:00:00Z')
const m = (min: number) => NOW - min * 60_000

describe('recentDone (BH)', () => {
  it('끝난 시각이 가장 최근인 것부터 3개까지', () => {
    const r = recentDone([{ id: 'a', mood: 'done', doneAt: m(5) }, { id: 'b', mood: 'done', doneAt: m(10) }, { id: 'c', mood: 'idle', doneAt: m(1) }, { id: 'd', mood: 'sleep', doneAt: m(30) }, { id: 'e', mood: 'done', doneAt: m(60) }], NOW)
    expect([...r].sort()).toEqual(['a', 'b', 'c'])
  })
  it('2시간이 지난 것은 3개 안이어도 뺀다', () => {
    const r = recentDone([{ id: 'a', mood: 'done', doneAt: m(30) }, { id: 'old', mood: 'done', doneAt: NOW - RECENT_MS - 1 }], NOW)
    expect([...r]).toEqual(['a'])
  })
  it('도는 중·기다림·확인 대기·오류는 이미 제 닷이 있어 후보가 아니다', () => {
    const r = recentDone([{ id: 'w', mood: 'work', doneAt: m(1) }, { id: 'h', mood: 'hold', doneAt: m(1) }, { id: 'q', mood: 'wait', doneAt: m(1) }, { id: 'x', mood: 'error', doneAt: m(1) }, { id: 'n', mood: 'done' }], NOW)
    expect(r.size).toBe(0)
  })
})

describe('badgeOn — 읽은 뒤에는 링 없이 원닷 (BH)', () => {
  it('끝났고 읽었으면: 최신이면 원닷, 아니면 없음 · 링은 안 읽음일 때만', () => {
    expect(badgeOn('done', false, true)).toBe(true)
    expect(badgeOn('done', false, false)).toBe(false)
    expect(badgeOn('done', true, false)).toBe(true)
    expect(unreadRing('done')).toBe(true)   // 링은 FolderBot 이 `unread && unreadRing(mood)` 로만 두른다
  })
})
