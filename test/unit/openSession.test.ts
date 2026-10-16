import { describe, it, expect } from 'vitest'
import { openSessionOf } from '../../src/core/autoArea'
import { openAnchor } from '../../src/core/unread'

/**
 * CM · 봇을 열 때 어느 세션을 여나 (2026-10-16 · 스크린샷_1222 — 소통 세션만 있는 봇은 빈 창이 떴다)
 * CO · 그 세션을 어느 줄에서 여나 (2026-10-16 Dave — 안 읽은 답은 처음부터)
 */
describe('CM · openSessionOf', () => {
  const chat = (id: string, t: number, x: object = {}) => ({ id, lastActivity: t, ...x })
  it('채팅이 없으면 가장 최근 자동화 세션 — 빈 창은 세션이 아예 없을 때만', () => {
    expect(openSessionOf([chat('comm', 50, { comm: true })])).toBe('comm')
    expect(openSessionOf([chat('r1', 10, { routine: 'a' }), chat('comm', 50, { comm: true })])).toBe('comm')
    expect(openSessionOf([])).toBeUndefined()
  })
  it('채팅이 있으면 채팅 — 소통이 더 최근이어도', () => {
    expect(openSessionOf([chat('comm', 90, { comm: true }), chat('c1', 10)])).toBe('c1')
  })
  it('목록 순서가 아니라 최근 활동으로 고른다(화면은 소통을 맨 위에 올려 둔다)', () => {
    expect(openSessionOf([chat('old', 10), chat('new', 20)])).toBe('new')
  })
  it('CO · 안 읽은 답이 있는 채팅이 먼저', () => {
    expect(openSessionOf([chat('new', 20, { lastReplyAt: 20, readAt: 20 }), chat('old', 10, { lastReplyAt: 10, readAt: 5 })])).toBe('old')
  })
  it('주소에 있는 세션이 이긴다 · 없는 세션이면 규칙대로', () => {
    expect(openSessionOf([chat('a', 20), chat('b', 10)], 'b')).toBe('b')
    expect(openSessionOf([chat('a', 20), chat('b', 10)], 'gone')).toBe('a')
  })
})

describe('CO · openAnchor', () => {
  const u = (t: number) => ({ t, user: true }), b = (t: number) => ({ t, user: false })
  it('안 읽은 답이 없으면 -1(맨 아래)', () => {
    expect(openAnchor([u(1), b(2)], 2, 2)).toBe(-1)
    expect(openAnchor([u(1)], undefined, undefined)).toBe(-1)
  })
  it('읽은 자리 뒤에 봇이 낸 첫 줄 — 사람 말은 건너뛴다', () => {
    expect(openAnchor([u(1), b(2), u(3), b(4), b(5)], 5, 2)).toBe(3)
  })
  it('여러 답이 쌓였으면 첫 새 답에서 연다(루틴·소통)', () => {
    expect(openAnchor([b(2), b(4), b(6)], 6, 3)).toBe(1)
  })
  it('읽은 자리가 없는 옛 세션은 마지막 사람 말 다음 줄', () => {
    expect(openAnchor([u(1), b(2), u(3), b(4), b(5)], 5, undefined)).toBe(3)
  })
  it('시각이 0 인 줄(파일 칩)은 기준으로 삼지 않는다', () => {
    expect(openAnchor([u(1), { t: 0, user: false }, b(4)], 4, undefined)).toBe(2)
  })
})
