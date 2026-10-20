import { describe, it, expect } from 'vitest'
import { freezeOrder, isLive, liveOrder, liveView } from '../../src/core/liveFind'

/**
 * DF · 찾기(⌘K) «지금 움직이는 세션» 낱줄 (2026-10-20 Dave · 목업 03_디자인/2026-10-20_찾기-실시간-목업 v2 «낱줄»)
 * 움직이는 세션은 다 나오고, 급한 차례(확인 대기 → 일하는 중 → 기다리는 중)로 서며, 연 동안 차례는 그대로다.
 */
const NOW = 1_000_000
const s = (id: string, o: Record<string, unknown> = {}) => ({ id, name: id, state: 'idle', pending: [], lastActivity: 0, ...o }) as any

describe('DF · isLive — 공을 누가 들고 있으면 움직이는 세션', () => {
  it('일하는 중 · 확인 대기 · 턴이 끝났어도 백그라운드가 돌면 움직인다', () => {
    expect(isLive(s('a', { state: 'running' }), NOW)).toBe(true)
    expect(isLive(s('b', { state: 'awaiting_input' }), NOW)).toBe(true)
    expect(isLive(s('c', { state: 'done', bg: 1 }), NOW)).toBe(true)
  })
  it('쉬는 · 끝난 · 문제 난 세션은 아니다', () => {
    expect(isLive(s('a'), NOW)).toBe(false)
    expect(isLive(s('b', { state: 'done' }), NOW)).toBe(false)
    expect(isLive(s('c', { state: 'error' }), NOW)).toBe(false)
  })
})

describe('DF · liveOrder — 급한 차례, 같으면 오래된 것 먼저', () => {
  it('확인 대기 → 일하는 중 → 기다리는 중', () => {
    const xs = [
      s('wait', { state: 'running', inflight: { name: 'mcp__aside__exec', since: NOW - 5_000 }, turnStartedAt: NOW - 90_000 }),
      s('me2', { state: 'running', turnStartedAt: NOW - 10_000 }),
      s('you', { state: 'awaiting_input', turnStartedAt: NOW - 1_000 }),
      s('me1', { state: 'running', turnStartedAt: NOW - 60_000 }),
    ]
    expect(liveOrder(xs, NOW).map((x) => x.id)).toEqual(['you', 'me1', 'me2', 'wait'])
  })
})

describe('DF · freezeOrder — 연 동안 차례는 그대로', () => {
  it('처음엔 받은 차례 그대로 · 새로 붙은 것 없음', () => {
    expect(freezeOrder(null, ['a', 'b'], () => true)).toEqual({ order: ['a', 'b'], added: [] })
  })
  it('끝난 세션도 자리를 지키고, 새로 움직인 세션은 급해도 끝에 붙는다', () => {
    const r = freezeOrder(['a', 'b'], ['c', 'b'], () => true)
    expect(r.order).toEqual(['a', 'b', 'c'])
    expect(r.added).toEqual(['c'])
  })
  it('지워진 세션은 빠진다', () => {
    expect(freezeOrder(['a', 'b'], ['b'], (id) => id !== 'a').order).toEqual(['b'])
  })
})

describe('DF · liveView — 줄의 말 · 색 · 시간', () => {
  it('확인 대기는 노랑 · 권한 이름 · «N째»', () => {
    const v = liveView(s('a', { state: 'awaiting_input', turnStartedAt: NOW - 130_000, pending: [{ displayName: '파일 쓰기' }] }), NOW)
    expect(v).toMatchObject({ cls: 'you', text: '확인해 주세요 · 파일 쓰기', tm: '2분 10초째' })
  })
  it('일하는 중은 주황 · 레일과 같은 활동 줄 · 경과', () => {
    const v = liveView(s('a', { state: 'running', activity: 'Read · Search.tsx', turnStartedAt: NOW - 72_000 }), NOW)
    expect(v).toMatchObject({ cls: 'me', text: 'Read · Search.tsx', tm: '1분 12초' })
    expect(liveView(s('b', { state: 'running', turnStartedAt: NOW }), NOW).text).toBe('생각 중')
  })
  it('남을 기다리면 청록 · 무엇을 기다리는지', () => {
    const v = liveView(s('a', { state: 'running', inflight: { name: 'mcp__aside__exec', summary: 'YouTube Studio', since: NOW - 3_000 }, turnStartedAt: NOW - 190_000 }), NOW)
    expect(v).toMatchObject({ cls: 'other', text: '브라우저 작업을 기다리는 중 · YouTube Studio', tm: '3분 10초' })
  })
  it('연 동안 끝나면 초록 «방금 끝났어요 · N 걸림» · 문제가 나면 빨강', () => {
    expect(liveView(s('a', { state: 'done' }), NOW, 95_000)).toMatchObject({ cls: 'done', text: '방금 끝났어요 · 1분 35초 걸림', tm: '방금' })
    expect(liveView(s('b', { state: 'error', lastError: '연결 끊김' }), NOW, 1_000)).toMatchObject({ cls: 'err', text: '문제 있어요 · 연결 끊김' })
  })
})
