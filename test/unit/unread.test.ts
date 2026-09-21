import { describe, it, expect } from 'vitest'
import { botUnread, sessionUnread, shouldMarkRead, unreadCount } from '../../src/core/unread'
describe('S · 읽음/안 읽음', () => {
  it('답이 읽은 지점보다 뒤면 안 읽음 · 답이 없으면 안 읽음이 아니다', () => {
    expect(sessionUnread(200, 100)).toBe(true)
    expect(sessionUnread(100, 200)).toBe(false)
    expect(sessionUnread(100, 100)).toBe(false)   // 같은 시각 = 그 답까지 봤다
    expect(sessionUnread(200, undefined)).toBe(true)
    expect(sessionUnread(undefined, undefined)).toBe(false)
    expect(sessionUnread(undefined, 500)).toBe(false)
  })
  it('폴더는 세션 중 하나라도 안 읽었으면 안 읽음', () => {
    const read = { lastReplyAt: 10, readAt: 20 }, unread = { lastReplyAt: 30, readAt: 20 }
    expect(botUnread([read, read])).toBe(false)
    expect(botUnread([read, unread])).toBe(true)
    expect(botUnread([])).toBe(false)
    expect(unreadCount([read, unread, unread])).toBe(2)
  })
  it('읽음은 맨 아래 + 턴이 끝난 뒤 + 아직 안 읽었을 때만 적는다', () => {
    const base = { atBottom: true, streaming: false, lastReplyAt: 200, readAt: 100 }
    expect(shouldMarkRead(base)).toBe(true)
    expect(shouldMarkRead({ ...base, atBottom: false })).toBe(false)     // 위로 올려 봤다
    expect(shouldMarkRead({ ...base, streaming: true })).toBe(false)     // 아직 자라는 중
    expect(shouldMarkRead({ ...base, readAt: 300 })).toBe(false)         // 이미 읽음 — 다시 안 쓴다
    expect(shouldMarkRead({ ...base, lastReplyAt: undefined })).toBe(false)
  })
})
