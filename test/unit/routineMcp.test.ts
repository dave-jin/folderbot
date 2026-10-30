import { describe, it, expect, vi } from 'vitest'
import { handleMcp, mcpTools } from '../../src/host/mcp'
import { boardSummary, type RunRow } from '../../src/core/routineBoard'

/**
 * RB-4 · 오케스트레이터가 모든 봇의 루틴을 바로 고친다 · 이유(why) 필수 · 그 폴더 CLAUDE.md 구역에 남는다 (2026-10-30 Dave 결정).
 */
const call = async (host: unknown, botId: string, name: string, args: Record<string, unknown>) => {
  let out = ''; const res = { writeHead: () => res, end: (b: string) => { out = b } } as never
  await handleMcp(host as never, botId, {} as never, res, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), 's1')
  const j = JSON.parse(out); return { text: j.result?.content?.[0]?.text ?? j.error?.message ?? '', isError: !!j.result?.isError || !!j.error }
}
function mkHost() {
  const orch = { id: 'orch', name: '오케스트레이터', rel: '', abs: '/v', orchestrator: true, routines: [{ name: '정기', cron: '0 3 * * *', prompt: 'p' }] }
  const para = { id: 'b_para', name: '2026-11-07_강의-PARA-AI', rel: '1. Projects/2026-11-07_강의-PARA-AI', abs: '/v/p', orchestrator: false, routines: [{ name: 'PARA 결제 확인', cron: '0 * * * *', prompt: 'p', approve: 'readonly' as const }] }
  const home = { id: 'b_home', name: '사업_이네이트-홈페이지', rel: '2. Area/사업_이네이트-홈페이지', abs: '/v/h', orchestrator: false, routines: [{ name: '기업문의 챙기기', cron: '0 */3 * * *', prompt: 'p' }] }
  const bots = [orch, para, home]
  const saved: { abs: string; routines: unknown[] }[] = []
  const host = {
    version: 't',
    registry: {
      bot: (id: string) => bots.find((b) => b.id === id), bots: () => bots,
      saveRoutines: (b: { abs: string }, routines: { name: string }[]) => { saved.push({ abs: b.abs, routines }); const t = bots.find((x) => x.abs === b.abs)!; (t as { routines: unknown[] }).routines = routines; return routines },
    },
    afterBotsChanged: vi.fn(),
    routines: { decorate: (_id: string, r: unknown[]) => r },
    sessions: { get: () => ({}) },
    runRoutine: vi.fn(() => 's_rt'),
    routineNotes: { record: vi.fn(), sync: vi.fn() },
    routineOverview: vi.fn(() => ({ summary: '요약', problems: [], changes: [] })),
  }
  return { host, saved, para }
}

describe('RB-4 · 루틴 도구의 bot · why', () => {
  it('폴더 봇이 bot 을 주면 거절', async () => {
    const { host } = mkHost()
    const r = await call(host, 'b_home', 'routine_update', { bot: 'b_para', name: 'PARA 결제 확인', when: '매시 7분', why: 'x' })
    expect(r.isError).toBe(true); expect(r.text).toContain('오케스트레이터만')
  })
  it('오케스트레이터가 남의 루틴을 why 없이 고치면 거절', async () => {
    const { host, saved } = mkHost()
    const r = await call(host, 'orch', 'routine_update', { bot: '2026-11-07_강의-PARA-AI', name: 'PARA 결제 확인', when: '매시 7분' })
    expect(r.isError).toBe(true); expect(r.text).toContain('why'); expect(saved).toHaveLength(0)
  })
  it('why 가 있으면 그 봇 루틴이 바뀌고 기록이 한 번 · approve 는 건드리지 않는다', async () => {
    const { host, saved } = mkHost()
    const r = await call(host, 'orch', 'routine_update', { bot: 'b_para', name: 'PARA 결제 확인', when: '매시 7분', why: '정각 겹침 풀기', approve: 'always' })
    expect(r.isError).toBe(false)
    expect(saved[0].abs).toBe('/v/p')
    expect(saved[0].routines).toEqual([expect.objectContaining({ name: 'PARA 결제 확인', cron: '7 * * * *', approve: 'readonly' })])
    expect(host.routineNotes.record).toHaveBeenCalledTimes(1)
    expect(host.routineNotes.record).toHaveBeenCalledWith(expect.objectContaining({ botId: 'b_para', routine: 'PARA 결제 확인', actor: '오케스트레이터', why: '정각 겹침 풀기', what: expect.stringContaining('→') }))
  })
  it('작은 지적 · 이름이 같은 봇이 둘이면 이름으로는 거절 · id·rel 로는 된다', async () => {
    const { host } = mkHost()
    const bots = host.registry.bots() as unknown as { id: string; name: string; rel: string; abs: string; routines: unknown[] }[]
    bots.push({ id: 'b_para2', name: '2026-11-07_강의-PARA-AI', rel: '4. Archive/2026-11-07_강의-PARA-AI', abs: '/v/a', routines: [{ name: 'PARA 결제 확인', cron: '0 * * * *', prompt: 'p' }] })
    const r = await call(host, 'orch', 'routine_update', { bot: '2026-11-07_강의-PARA-AI', name: 'PARA 결제 확인', enabled: false, why: '시험' })
    expect(r.isError).toBe(true); expect(r.text).toContain('4. Archive/2026-11-07_강의-PARA-AI')
    expect((await call(host, 'orch', 'routine_update', { bot: '1. Projects/2026-11-07_강의-PARA-AI', name: 'PARA 결제 확인', enabled: false, why: '시험' })).isError).toBe(false)
  })
  it('최종 리뷰 · 도구로 고치면 기록 뒤에 그 폴더 CLAUDE.md 구역을 바로 다시 쓴다(add · update · remove)', async () => {
    const { host } = mkHost()
    for (const [tool, args] of [['routine_add', { bot: 'b_home', name: '새것', when: '매일 저녁 8시', prompt: 'p', why: '시험' }], ['routine_update', { bot: 'b_home', name: '새것', enabled: false, why: '시험' }], ['routine_remove', { bot: 'b_home', name: '새것', why: '시험' }]] as const) {
      host.routineNotes.record.mockClear(); host.routineNotes.sync.mockClear()
      expect((await call(host, 'orch', tool, args)).isError).toBe(false)
      expect(host.routineNotes.sync).toHaveBeenCalledTimes(1)
      expect(host.routineNotes.sync.mock.invocationCallOrder[0]).toBeGreaterThan(host.routineNotes.record.mock.invocationCallOrder[0])
    }
  })
  it('폴더 봇이 제 루틴을 고치면 «이 폴더 봇» 으로 기록 · why 없어도 된다', async () => {
    const { host } = mkHost()
    expect((await call(host, 'b_home', 'routine_update', { name: '기업문의 챙기기', enabled: false })).isError).toBe(false)
    expect(host.routineNotes.record).toHaveBeenCalledWith(expect.objectContaining({ actor: '이 폴더 봇', what: '껐음' }))
  })
  it('오케스트레이터는 남의 루틴을 지우고(why) 돌리고 볼 수 있다', async () => {
    const { host } = mkHost()
    expect((await call(host, 'orch', 'routine_list', { bot: 'b_home' })).text).toContain('기업문의 챙기기')
    expect((await call(host, 'orch', 'routine_run', { bot: 'b_home', name: '기업문의 챙기기' })).isError).toBe(false)
    expect(host.runRoutine).toHaveBeenCalledWith(expect.objectContaining({ id: 'b_home' }), expect.objectContaining({ name: '기업문의 챙기기' }))
    const rm = await call(host, 'orch', 'routine_remove', { bot: 'b_home', name: '기업문의 챙기기', why: '끝난 일회성 정리' })
    expect(rm.isError).toBe(false)
    expect(host.routineNotes.record).toHaveBeenCalledWith(expect.objectContaining({ what: '지움', why: '끝난 일회성 정리' }))
  })
  it('routines_overview 는 오케스트레이터 목록에만 있다', async () => {
    expect(mcpTools('orch').map((t) => t.name)).toContain('routines_overview')
    expect(mcpTools('b_home').map((t) => t.name)).not.toContain('routines_overview')
    const { host } = mkHost()
    expect((await call(host, 'orch', 'routines_overview', {})).text).toContain('요약')
    expect(host.routineOverview).toHaveBeenCalledTimes(1)
  })
})

describe('RB-4 · boardSummary', () => {
  const at = (s: string) => new Date(s).getTime()
  const r = (s: string, mins: number, result: RunRow['result']): RunRow => ({ run: s, botId: 'b', routine: s, start: at(s), end: at(s) + mins * 60_000, result, catchup: false })
  it('지난 보고 뒤 회수·결과·가장 몰린 때·오늘 예정 겹침', () => {
    const rows = [r('2026-10-29T12:21:00', 11, 'ok'), r('2026-10-29T12:30:00', 1, 'ok'), r('2026-10-29T15:00:00', 1, 'skip'), r('2026-10-30T00:00:00', 4, 'fail'), r('2026-10-29T11:00:00', 1, 'unknown')]
    const slots = new Array(144).fill(1); slots[18] = 3; slots[36] = 3
    expect(boardSummary(rows, at('2026-10-29T11:50:00'), at('2026-10-30T00:26:00'), slots))
      .toBe('지난 보고 뒤 4회 · 성공 2 · 건너뜀 1 · 실패 1 · 결과 없음 0 · 가장 몰린 때 12:30 (2개) · 오늘 예정 겹침 3개 이상 2번 (03·06시)')
  })
  it('돈 회차가 없고 겹침도 없으면 짧게', () => expect(boardSummary([], 0, 1, new Array(144).fill(0))).toBe('지난 보고 뒤 0회'))
})
