import { describe, it, expect } from 'vitest'
import { STEER_WHY, steerVerdict } from '../../src/core/steer'
import { SESS_TABS, isWaiting, nextWaiting, sessTabOf, tabCounts, tabMatch, waitingOrder } from '../../src/core/sessionTabs'
import { sessLocked } from '../../src/core/cleanup'
import type { SessionInfo } from '../../src/core/types'

/** EC · «일하는 중에도 말이 통한다» (2026-11-11) — 끼워 넣기 판정 · 세션 창 상태 탭 · 다음 기다리는 세션 */
const S = (o: Partial<SessionInfo>): SessionInfo => ({ id: 's', botId: 'b', name: '메인', state: 'idle', cliSessionId: null, createdAt: 0, lastActivity: 1, alive: false, hibernated: false, pending: [], ...o } as SessionInfo)

describe('끼워 넣기 판정 (core/steer)', () => {
  it('도는 턴에는 넣는다', () => {
    expect(steerVerdict({ vendor: 'claude', state: 'running' })).toEqual({ ok: true })
    expect(steerVerdict({ state: 'running', pending: [] }).ok).toBe(true)
  })
  it('🔴 Codex 세션은 턴 중에 말을 못 받는다 — 보통 말로도 돌리지 않는다(멈추고 보내기가 그 길이다)', () => {
    const v = steerVerdict({ vendor: 'codex', state: 'running' })
    expect(v.ok).toBe(false); expect(v.why).toBe('codex'); expect(v.sendable).toBe(false); expect(v.text).toBe(STEER_WHY.codex)
  })
  it('🔴 승인·질문 카드가 걸려 있으면 넣지 않는다 — 미뤄진 질문만 걸렸으면 턴은 끝났고 보통 말로 보낸다(호스트 mustWait 와 같은 갈림)', () => {
    const card = steerVerdict({ state: 'awaiting_input', pending: [{}] })
    expect(card.ok).toBe(false); expect(card.why).toBe('card'); expect(card.sendable).toBe(false)
    const mixed = steerVerdict({ state: 'awaiting_input', pending: [{ deferred: true }, {}] })
    expect(mixed.why).toBe('card')
    const deferred = steerVerdict({ state: 'awaiting_input', pending: [{ deferred: true }] })
    expect(deferred.ok).toBe(false); expect(deferred.why).toBe('idle'); expect(deferred.sendable).toBe(true)
    // 기다리는 상태인데 걸린 것이 안 보인다(프레임이 늦다) — 넣지 않는 쪽
    expect(steerVerdict({ state: 'awaiting_input', pending: [] }).why).toBe('card')
  })
  it('도는 턴이 없으면(쉼·끝남·오류) 끼워 넣을 데가 없다 — 대신 보통 말로 보낼 수 있다(경주에서 말을 잃지 않는다)', () => {
    for (const st of ['idle', 'done', 'error'] as const) { const v = steerVerdict({ state: st }); expect(v.ok).toBe(false); expect(v.why).toBe('idle'); expect(v.sendable).toBe(true) }
  })
  it('🔴 사람 말이 아닌 대기 줄(봇 말·편지·보고)은 도는 턴이어도 넣지 않는다', () => {
    const v = steerVerdict({ state: 'running', human: false })
    expect(v.ok).toBe(false); expect(v.why).toBe('notHuman'); expect(v.sendable).toBe(false)
  })
})

describe('세션 창 상태 탭 (core/sessionTabs)', () => {
  it('탭은 다섯 — 전체 · 내 답 기다림 · 일하는 중 · 안 읽음 · 쉼', () => {
    expect(SESS_TABS.map((t) => t.t)).toEqual(['전체', '내 답 기다림', '일하는 중', '안 읽음', '쉼'])
  })
  it('🔴 세션 하나는 탭 하나 — 차례는 기다림 → 일하는 중 → 안 읽음 → 쉼', () => {
    expect(sessTabOf(S({ state: 'awaiting_input', lastReplyAt: 9, readAt: 1, bg: 2 }))).toBe('wait')
    expect(sessTabOf(S({ state: 'running', lastReplyAt: 9, readAt: 1 }))).toBe('work')      // 일하는 중인데 지난 답을 안 읽었다 — 일하는 중(AN)
    expect(sessTabOf(S({ state: 'done', bg: 1, lastReplyAt: 9, readAt: 1 }))).toBe('work')  // 턴은 끝났지만 뒤에서 도는 일이 있다
    expect(sessTabOf(S({ state: 'done', lastReplyAt: 9, readAt: 1 }))).toBe('unread')
    expect(sessTabOf(S({ state: 'done', lastReplyAt: 9, readAt: 9 }))).toBe('rest')
    expect(sessTabOf(S({ state: 'idle' }))).toBe('rest')
    expect(sessTabOf(S({ state: 'error', lastReplyAt: 0 }))).toBe('rest')
    // 사람이 멈춰 대기 말만 남은 세션은 쉬는 중이다
    expect(sessTabOf(S({ state: 'idle', queue: [{ text: 'x', from: 'o', t: 1 }] }))).toBe('rest')
  })
  it('판정을 새로 짓지 않는다 — 일하는 중은 세션 정리의 잠금 사유와 같다', () => {
    for (const x of [S({ state: 'running' }), S({ bg: 1 }), S({ state: 'done' }), S({ lastReplyAt: 5, readAt: 1 })]) {
      const lock = sessLocked(x)
      expect(sessTabOf(x) === 'work').toBe(lock === '일하는 중' || lock === '뒤에서 도는 중')
    }
    expect(isWaiting(S({ state: 'awaiting_input' }))).toBe(true); expect(isWaiting(S({ state: 'running' }))).toBe(false)
  })
  it('개수 — 네 탭을 더하면 전체다 · 거르기', () => {
    const list = [S({ id: 'a', state: 'awaiting_input' }), S({ id: 'b', state: 'running' }), S({ id: 'c', bg: 1 }), S({ id: 'd', lastReplyAt: 5 }), S({ id: 'e' }), S({ id: 'f', state: 'done', lastReplyAt: 5, readAt: 6 })]
    const c = tabCounts(list)
    expect(c).toEqual({ all: 6, wait: 1, work: 2, unread: 1, rest: 2 })
    expect(c.wait + c.work + c.unread + c.rest).toBe(c.all)
    expect(list.filter((x) => tabMatch(x, 'work')).map((x) => x.id)).toEqual(['b', 'c'])
    expect(list.filter((x) => tabMatch(x, 'all')).length).toBe(6)
  })
})

describe('다음 기다리는 세션 (core/sessionTabs)', () => {
  const all = [S({ id: 'old', botId: 'x', state: 'awaiting_input', lastActivity: 10 }), S({ id: 'new', botId: 'y', state: 'awaiting_input', lastActivity: 30 }), S({ id: 'run', state: 'running', lastActivity: 99 }), S({ id: 'mid', botId: 'gone', state: 'awaiting_input', lastActivity: 20 })]
  it('기다리는 것만 · 최근에 움직인 것부터 · 모르는 봇의 세션은 뺀다', () => {
    expect(waitingOrder(all).map((x) => x.id)).toEqual(['new', 'mid', 'old'])
    expect(waitingOrder(all, (b) => b !== 'gone').map((x) => x.id)).toEqual(['new', 'old'])
    // 시각이 같으면 id 순 — 차례가 흔들리지 않는다
    expect(waitingOrder([S({ id: 'b', state: 'awaiting_input', lastActivity: 5 }), S({ id: 'a', state: 'awaiting_input', lastActivity: 5 })]).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('🔴 지금 세션이 목록에 있으면 그다음 것으로 돈다 · 없으면 맨 앞 · 하나도 없으면 null', () => {
    const ids = ['new', 'mid', 'old']
    expect(nextWaiting(ids, 'new')).toBe('mid')
    expect(nextWaiting(ids, 'mid')).toBe('old')
    expect(nextWaiting(ids, 'old')).toBe('new')        // 끝이면 처음으로
    expect(nextWaiting(ids, 'elsewhere')).toBe('new')
    expect(nextWaiting(ids, null)).toBe('new')
    expect(nextWaiting(['only'], 'only')).toBe('only') // 기다리는 것이 지금 세션 하나뿐 — 그 카드로 초점만
    expect(nextWaiting([], 'x')).toBe(null)
  })
})
