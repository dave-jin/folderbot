import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { retryOn, retryNote, rerunnable } from '../../src/core/routineRetry'
import { changeWhat, pairRuns, pendingRetries, type RunEventLike } from '../../src/core/routineBoard'
import { buildBoard } from '../../src/host/routineBoard'
import { routineRun } from '../../src/host/routines'
import type { Bot, RoutineDef } from '../../src/core/types'

/**
 * 실패한 루틴을 다시 돌린다 — 기본 켬 (2026-11-16 Dave «루틴이 실패하면 자동으로 재실행 되게 하고 싶어» · 카드 답 «전부 기본 켬» · «일괄 재실행 버튼»).
 * 10/9 의 «기본 끔» 을 뒤집었다. 여기서는 판정 · 문구 · 보드 값만 잰다(실제로 두 번 도는지는 `test/routine-retry.mjs`).
 */
const at = (s: string) => new Date(s).getTime()
const E = (ts: string, event: string, botId: string, routine: string, run: string, x: Partial<RunEventLike> = {}): RunEventLike => ({ ts, event, botId, routine, run, ...x })
const bot = (id: string, name: string, routines: RoutineDef[]) => ({ id, name, displayName: name, rel: name, abs: `/v/${name}`, orchestrator: false, routines }) as unknown as Bot

describe('retryOn — 기본 켬', () => {
  it('값이 없으면 켜진 것 · false 만 끔', () => {
    expect(retryOn({})).toBe(true)
    expect(retryOn({ retry: true })).toBe(true)
    expect(retryOn({ retry: false })).toBe(false)
  })
  it('루틴이 없으면 돌리지 않는다', () => {
    expect(retryOn(undefined)).toBe(false)
    expect(retryOn(null)).toBe(false)
  })
  it('호스트는 `retry === true` 로 직접 보지 않는다 — 옛 판정이 남으면 기본 켬이 조용히 꺼진다', () => {
    for (const f of ['src/host/host.ts', 'src/host/mcp.ts', 'src/host/gateway.ts', 'src/host/routineBoard.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toMatch(/\.retry\s*===\s*true|\.retry\s*!==\s*true/)
    }
  })
})

describe('다시 도는 회차가 받는 말', () => {
  it('처음 도는 회차에는 붙지 않는다', () => {
    expect(routineRun({ name: 'n', prompt: 'p' }).text).not.toMatch(/다시 도는 회차/)
  })
  it('다시 도는 회차는 앞 회차가 해 둔 일을 먼저 확인하라는 한 줄을 받는다', () => {
    const t = routineRun({ name: 'n', prompt: '게시해 줘' }, { reason: 'Aside 로그인 필요' }).text
    expect(t.startsWith('게시해 줘')).toBe(true)                       // 원래 문구가 맨 앞에 그대로 — 슬래시 명령으로 시작하는 루틴이 깨지지 않게
    expect(t).toMatch(/다시 도는 회차야 — 앞 회차가 실패했어: Aside 로그인 필요\./)
    expect(t).toMatch(/이미 된 것은 다시 하지 말고 남은 것만 해/)
    expect(t).toMatch(/결과: ok/)                                       // 결과 줄 안내는 그대로
  })
  it('이유를 모르면 이유 없이 · 긴 이유는 200자로 줄이고 줄바꿈을 편다', () => {
    expect(retryNote()).toMatch(/앞 회차가 실패했어\. /)
    const long = retryNote(`첫 줄\n둘째 줄 ${'가'.repeat(400)}`)
    expect(long).not.toMatch(/\n/)
    expect(long.length).toBeLessThan(330)
  })
  it('권한 모드는 처음 회차와 같다', () => {
    expect(routineRun({ name: 'n', prompt: 'p', approve: 'folder' }, {}).mode).toBe(routineRun({ name: 'n', prompt: 'p', approve: 'folder' }).mode)
  })
})

describe('rerunnable — «실패 N개 다시 돌리기» 가 돌리는 것', () => {
  const row = (name: string, o: Partial<{ enabled: boolean; state: string; result: string }>) => ({ botId: 'b', name, enabled: o.enabled ?? true, state: o.state ?? 'fail', ...(o.result ? { last: { result: o.result } } : {}) })
  it('켜져 있고 마지막 회차가 실패나 시간 초과인 것만', () => {
    const got = rerunnable([
      row('실패', { result: 'fail' }), row('시간 초과', { result: 'timeout' }),
      row('성공', { state: 'ok', result: 'ok' }), row('놓침', { state: 'missed' }),
      row('꺼 둠', { enabled: false, state: 'off', result: 'fail' }),
      row('주기 오류', { state: 'fail' }),                                // 기록 없이 «실패» 묶음 — 돌려도 안 풀린다
      row('주기 오류인데 지난 회차는 성공', { state: 'fail', result: 'ok' }),
    ]).map((r) => r.name)
    expect(got).toEqual(['실패', '시간 초과'])
  })
})

describe('보드 — 다시 돌림 표시와 «곧 다시 돌아요»', () => {
  const NOW = at('2026-11-16T10:05:00+09:00')
  const evs: RunEventLike[] = [
    E('2026-11-16T10:00:00+09:00', 'start', 'a', '기업문의', 'a1'), E('2026-11-16T10:01:00+09:00', 'end', 'a', '기업문의', 'a1', { result: 'fail', reason: '네트워크' }),
    E('2026-11-16T10:01:00+09:00', 'retry', 'a', '기업문의', 'a1', { ms: 600_000 }),
    E('2026-11-16T09:00:00+09:00', 'start', 'b', '트렌드', 'b1'), E('2026-11-16T09:01:00+09:00', 'end', 'b', '트렌드', 'b1', { result: 'fail' }),
    E('2026-11-16T09:01:00+09:00', 'retry', 'b', '트렌드', 'b1', { ms: 600_000 }),
    E('2026-11-16T09:11:00+09:00', 'start', 'b', '트렌드', 'b2', { attempt: 2 }), E('2026-11-16T09:12:00+09:00', 'end', 'b', '트렌드', 'b2', { result: 'ok' }),
    E('2026-11-16T08:00:00+09:00', 'start', 'c', '게시', 'c1'), E('2026-11-16T08:01:00+09:00', 'end', 'c', '게시', 'c1', { result: 'fail' }),
    E('2026-11-16T08:01:00+09:00', 'retry', 'c', '게시', 'c1', { ms: 600_000 }),                 // 예정 08:11 이 지났는데 시작이 없다 — 그사이 앱이 다시 떴다
    E('2026-11-16T10:02:00+09:00', 'retry', 'd', '사람이 돌림', 'd0'),                           // 걸어 둔 시간 없는 retry(사람 · 끊긴 회차) — 예약이 아니다
  ]
  it('두 번째 시도는 «다시 돌림» 으로 표시된다', () => {
    const rows = pairRuns(evs)
    expect(rows.find((r) => r.run === 'b2')).toMatchObject({ again: true, result: 'ok' })
    expect(rows.find((r) => r.run === 'b1')!.again).toBeUndefined()
  })
  it('아직 안 돈 예약만 남긴다 — 다시 돌았거나 예정 시각이 지난 것은 뺀다', () => {
    const m = pendingRetries(evs, NOW)
    expect([...m.keys()]).toEqual(['a::기업문의'])
    expect(m.get('a::기업문의')).toBe(at('2026-11-16T10:11:00+09:00'))
  })
  it('보드 줄에 retry 와 retryAt 이 실린다 — 꺼 둔 루틴에는 예약 시각이 없다', () => {
    const bots = [bot('a', '홈페이지', [{ name: '기업문의', cron: '0 * * * *', prompt: 'p' }]), bot('b', 'SNS', [{ name: '트렌드', cron: '0 9 * * *', prompt: 'p' }]), bot('c', '게시', [{ name: '게시', cron: '0 8 * * *', prompt: 'p', retry: false }])]
    const b = buildBoard(bots, (_i, r) => r, evs, [], NOW)
    expect(b.routines.find((r) => r.name === '기업문의')).toMatchObject({ state: 'fail', retry: true, retryAt: at('2026-11-16T10:11:00+09:00') })
    expect(b.routines.find((r) => r.name === '트렌드')).toMatchObject({ state: 'ok', retry: true })
    expect(b.routines.find((r) => r.name === '트렌드')!.retryAt).toBeUndefined()
    expect(b.routines.find((r) => r.name === '게시')).toMatchObject({ state: 'fail', retry: false })
    expect(rerunnable(b.routines).map((r) => r.name).sort()).toEqual(['게시', '기업문의'])
  })
})

describe('변경 기록 — 다시 돌리기를 끄고 켠 것이 남는다', () => {
  const base: RoutineDef = { name: 'n', cron: '0 9 * * *', prompt: 'p' }
  it('끔 · 켬', () => {
    expect(changeWhat(base, { ...base, retry: false })).toBe('실패하면 다시 돌리기 끔')
    expect(changeWhat({ ...base, retry: false }, base)).toBe('실패하면 다시 돌리기 켬')
  })
  it('값 없음과 true 는 같은 뜻이라 바뀐 것이 아니다', () => {
    expect(changeWhat(base, { ...base, retry: true })).toBe('')
  })
})
