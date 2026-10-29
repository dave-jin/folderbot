import { describe, it, expect } from 'vitest'
import { buildBoard } from '../../src/host/routineBoard'
import type { RunEventLike } from '../../src/core/routineBoard'
import type { Bot, RoutineDef } from '../../src/core/types'

/**
 * RB-5 · 페이지·도구·정기보고가 읽는 보드 한 장 — 10/30 실측을 줄인 기록으로.
 */
const at = (s: string) => new Date(s).getTime()
const NOW = at('2026-10-30T00:26:00')
const bot = (id: string, name: string, routines: RoutineDef[], o: Partial<Bot> = {}) => ({ id, name, displayName: name, rel: name, abs: `/v/${name}`, orchestrator: false, routines, ...o }) as unknown as Bot
const bots = [
  bot('orch', '오케스트레이터', [{ name: '정기동기화-보내기-새벽', cron: '0 3 * * *', prompt: 'p' }], { orchestrator: true, rel: '' }),
  bot('para', '2026-11-07_강의-PARA-AI', [{ name: 'PARA 결제 확인', cron: '0 * * * *', prompt: 'p' }]),
  bot('home', '사업_이네이트-홈페이지', [{ name: '기업문의 챙기기', cron: '0 */3 * * *', prompt: 'p' }]),
  bot('sns', '개인_글쓰기-SNS', [{ name: '트렌드 레이더', cron: '0 6 * * *', prompt: 'p' }]),
  bot('grok', '2026-11-01_행사-GrokBot', [{ name: '빌드데이 오전 안내 10-28', cron: '2026-10-28T10:00', prompt: 'p' }]),
  bot('hide', '사업_자문-하이드미플리즈', [{ name: 'S013 팔로업 수요일', cron: '2026-10-21T10:00', prompt: 'p' }, { name: '꺼 둔 것', cron: '0 10 * * *', prompt: 'p', enabled: false }]),
  bot('empty', '빈 폴더', []),
]
const E = (ts: string, event: string, botId: string, routine: string, run: string, x: Partial<RunEventLike> = {}): RunEventLike => ({ ts, event, botId, routine, run, ...x })
const events: RunEventLike[] = [
  E('2026-10-29T03:00:00+09:00', 'start', 'orch', '정기동기화-보내기-새벽', 'o1'), E('2026-10-29T03:17:19+09:00', 'end', 'orch', '정기동기화-보내기-새벽', 'o1', { result: 'unknown', ms: 1_039_000 }),
  E('2026-10-30T00:00:00+09:00', 'start', 'para', 'PARA 결제 확인', 'p1'), E('2026-10-30T00:04:11+09:00', 'end', 'para', 'PARA 결제 확인', 'p1', { result: 'fail', reason: '페이앱 판매자 사이트 로그인 필요', ms: 251_172 }),
  E('2026-10-30T00:00:00+09:00', 'start', 'home', '기업문의 챙기기', 'h1'), E('2026-10-30T00:00:17+09:00', 'end', 'home', '기업문의 챙기기', 'h1', { result: 'skip', reason: '변화 없음', ms: 17_000 }),
  E('2026-10-29T06:00:00+09:00', 'start', 'sns', '트렌드 레이더', 's1'), E('2026-10-29T06:07:09+09:00', 'end', 'sns', '트렌드 레이더', 's1', { result: 'ok', ms: 429_000 }),
  E('2026-10-28T10:00:00+09:00', 'start', 'grok', '빌드데이 오전 안내 10-28', 'g1'), E('2026-10-28T10:04:00+09:00', 'end', 'grok', '빌드데이 오전 안내 10-28', 'g1', { result: 'ok', ms: 240_000 }),
]
const decorate = (_id: string, r: RoutineDef[]) => r

describe('RB-5 · buildBoard', () => {
  const b = buildBoard(bots, decorate, events, [], NOW, (x) => x.id !== 'sns')
  it('묶음 수와 문제 먼저 정렬', () => {
    expect(b.counts).toEqual({ fail: 1, missed: 1, unknown: 1, finished: 1, off: 1, ok: 2 })
    expect(b.routines[0]).toMatchObject({ name: 'PARA 결제 확인', state: 'fail', daveTodo: true })
    expect(b.routines.map((r) => r.state)).toEqual(['fail', 'missed', 'unknown', 'finished', 'off', 'ok', 'ok'])
    expect(b.total).toBe(7); expect(b.folders).toBe(6)
  })
  it('평균 걸린 시간 · 최근 회차', () => {
    const p = b.routines.find((r) => r.name === 'PARA 결제 확인')!
    expect(p.avgMs).toBe(251_172); expect(p.recent).toHaveLength(1); expect(p.last?.reason).toBe('페이앱 판매자 사이트 로그인 필요')
  })
  it('오늘 몰림 — 03:00 칸 3 (보내기 17분 · PARA 4분 · 기업문의 17초)', () => {
    expect(b.today.slots[18]).toBe(3)
    expect(b.today.blocks.some((x) => x.name === 'PARA 결제 확인' && x.result === 'fail')).toBe(true)
  })
  it('최종 리뷰 · catchup:false 매일 루틴이 이틀 안 돌았으면 놓침', () => {
    const x = buildBoard([bot('d', '매일 폴더', [{ name: '매일 정리', cron: '0 9 * * *', prompt: 'p', catchup: false }])], decorate,
      [E('2026-10-28T09:00:01+09:00', 'start', 'd', '매일 정리', 'd1'), E('2026-10-28T09:03:00+09:00', 'end', 'd', '매일 정리', 'd1', { result: 'ok' })], [], NOW)
    expect(x.routines[0].state).toBe('missed')
  })
  it('몰림 제안 · 한 주 칸 · CLAUDE.md 없는 폴더', () => {
    expect(b.suggest).toMatchObject({ botId: 'para', from: '0 * * * *' })
    expect(b.week.grid).toHaveLength(7)
    expect(b.noteMissing).toEqual(['sns'])
  })
})
