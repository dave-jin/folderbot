import { describe, expect, it } from 'vitest'
import { CUT_WINDOW_MS, cutTurnAtLoad } from '../../src/core/cutTurn'
import { mark, routeLabel, slowSince } from '../../src/host/slow'

/** 🔴 CI-2 (2026-10-16 오케스트레이터 제보) — 켜질 때 끝을 못 본 턴을 가른다. 세 사례는 맥미니 세션 파일 그대로의 꼴이다 */
describe('CI-2 · 끊긴 턴 판정', () => {
  const now = Date.parse('2026-10-16T23:00:00+09:00')
  it('오사카 소통 세션 — 쉬는 중인데 «시작하는 중» 이 남았다 → 끊겼어요', () => {
    expect(cutTurnAtLoad({ state: 'idle', activity: '시작하는 중', turnStartedAt: Date.parse('2026-10-16T22:19:25+09:00') }, now)).toBe('note')
  })
  it('도는 중으로 저장된 턴(충돌 꼴) · 종료 표식(업데이트 적용 꼴) → 끊겼어요', () => {
    expect(cutTurnAtLoad({ state: 'running', turnStartedAt: now - 60_000 }, now)).toBe('note')
    expect(cutTurnAtLoad({ state: 'awaiting_input', activity: '확인 기다리는 중', turnStartedAt: now - 60_000 }, now)).toBe('note')
    expect(cutTurnAtLoad({ state: 'idle', cut: { at: now - 1000 } }, now)).toBe('note')
  })
  it('루틴 회차(10/13 SNS)는 실행 기록 쪽이 닫으므로 글씨만 지운다 · 사람이 이어받은 루틴 세션은 사람 세션처럼', () => {
    expect(cutTurnAtLoad({ state: 'idle', activity: '시작하는 중', routine: 'sns', turnStartedAt: now - 3600_000 }, now)).toBe('quiet')
    expect(cutTurnAtLoad({ state: 'running', routine: 'sns', adopted: true, turnStartedAt: now - 3600_000 }, now)).toBe('note')
  })
  it('이미 오류로 끝난 턴(9/29 모객 · 못 띄움)·7일 넘은 턴은 글씨만 · 멀쩡한 세션은 그대로', () => {
    expect(cutTurnAtLoad({ state: 'error', activity: '시작하는 중', turnStartedAt: now - 3600_000 }, now)).toBe('quiet')
    expect(cutTurnAtLoad({ state: 'idle', activity: '시작하는 중', turnStartedAt: now - CUT_WINDOW_MS - 1 }, now)).toBe('quiet')
    expect(cutTurnAtLoad({ state: 'done', activity: '', turnStartedAt: now - 1000 }, now)).toBe(null)
    expect(cutTurnAtLoad({ state: 'idle' }, now)).toBe(null)
  })
})

describe('CI-3 · 멈춘 동안 무엇이 돌았나', () => {
  it('동기 덩어리가 이벤트 루프를 쥔 시간을 그 일의 이름으로 남긴다', async () => {
    mark('긴 일'); const t = performance.now(); while (performance.now() - t < 450) { /* 막는다 */ }
    mark('짧은 일')
    await new Promise((r) => setImmediate(r))
    const s = slowSince(5000)
    expect(s).toMatch(/^긴 일 \d+ms/)
    expect(s).not.toContain('짧은 일')
  })
  it('경로 이름에서 세션·봇 id 를 지운다', () => {
    expect(routeLabel('GET', '/api/sessions/s_mvazv64r0hbn/chat?v=abc')).toBe('GET /api/sessions/:id/chat')
    expect(routeLabel('POST', '/api/bots/b_mv6jsjcglwch/sessions')).toBe('POST /api/bots/:id/sessions')
  })
})
