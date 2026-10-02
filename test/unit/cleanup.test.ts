import { describe, it, expect } from 'vitest'
import { sessKind, sessLocked, cleanMatch, cleanPreselect, cleanableCount, CLEAN_IDLE_MS } from '../../src/core/cleanup'
import type { SessionInfo } from '../../src/core/types'

/** 세션 정리 판정 (2026-10-02 · 시안 B) — 화면과 메뉴 숫자와 호스트가 같은 판정을 쓴다 */
const now = 100 * CLEAN_IDLE_MS
const S = (o: Partial<SessionInfo>): SessionInfo => ({ id: 's', botId: 'b', name: '메인', state: 'idle', cliSessionId: null, createdAt: 0, lastActivity: now, alive: false, hibernated: false, pending: [], ...o } as SessionInfo)

describe('세션 정리 판정', () => {
  it('종류 — 소통 · 루틴 · 봇끼리(표식 또는 옛 이름) · 사람', () => {
    expect(sessKind(S({ comm: true }))).toBe('소통')
    expect(sessKind(S({ routine: 'r' }))).toBe('루틴')
    expect(sessKind(S({ delegated: true }))).toBe('봇끼리')
    expect(sessKind(S({ name: '위임 · 14:02' }))).toBe('봇끼리')
    expect(sessKind(S({ name: '요청 ← 해커톤' }))).toBe('봇끼리')
    expect(sessKind(S({}))).toBe('사람')
  })
  it('🔴 잠김 — 일하는 중 · 답 기다림 · 뒤에서 도는 중 · 대기 말 · 안 읽음', () => {
    expect(sessLocked(S({ state: 'running' }))).toBe('일하는 중')
    expect(sessLocked(S({ state: 'awaiting_input' }))).toBe('답 기다림')
    expect(sessLocked(S({ bg: 1 }))).toBe('뒤에서 도는 중')
    expect(sessLocked(S({ queue: [{ text: 'x', from: 'o', t: 1 }] }))).toBe('대기 말 있음')
    expect(sessLocked(S({ lastReplyAt: 5, readAt: 1 }))).toBe('안 읽음')
    expect(sessLocked(S({ lastReplyAt: 5, readAt: 9 }))).toBe(null)
  })
  it('거름은 «하나라도» · 처음 체크는 거름 ∧ 안 잠김 ∧ 소통 아님', () => {
    const old = S({ lastActivity: now - CLEAN_IDLE_MS - 1 })
    expect(cleanMatch(old, ['old'], now)).toBe(true)
    expect(cleanMatch(S({}), ['old'], now)).toBe(false)
    expect(cleanMatch(S({ delegated: true }), ['old', 'bot'], now)).toBe(true)
    expect(cleanMatch(S({}), ['all'], now)).toBe(true)
    expect(cleanPreselect(S({ comm: true, lastActivity: 0 }), ['old'], now)).toBe(false)
    expect(cleanPreselect(S({ delegated: true, state: 'running' }), ['bot'], now)).toBe(false)
    expect(cleanableCount([old, S({ delegated: true }), S({}), S({ comm: true, lastActivity: 0 })], now)).toBe(2)
  })
})
