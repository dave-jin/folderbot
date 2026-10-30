import { describe, it, expect } from 'vitest'
import { pairRuns, groupRuns, classify, daveTodo, planSlots, weekGrid, suggestShift, LOAD_WARN, LOAD_BAD, DEFAULT_MS, type RunEventLike } from '../../src/core/routineBoard'

/**
 * RB-1 · 루틴 관리 페이지의 순수 판정·집계·시간표 (2026-10-30 Dave «이대로 만들기»).
 * 값은 10/30 맥미니 실행 기록(`.folderbot/ops/runs-2026-10.jsonl`)에서 줄였다.
 */
const at = (s: string) => new Date(s).getTime()
const M = 60_000
const ev = (o: Partial<RunEventLike> & { ts: string; event: string }): RunEventLike => o

describe('pairRuns', () => {
  it('start ↔ end 를 짝짓고 timeout·보충·retry 를 가른다', () => {
    const rows = pairRuns([
      ev({ ts: '2026-10-30T00:00:00+09:00', event: 'start', botId: 'b1', routine: 'PARA 결제 확인', run: 'r1' }),
      ev({ ts: '2026-10-30T00:04:11+09:00', event: 'end', botId: 'b1', routine: 'PARA 결제 확인', run: 'r1', result: 'fail', reason: '페이앱 판매자 사이트 로그인 필요', ms: 251172 }),
      ev({ ts: '2026-10-26T03:24:42+09:00', event: 'start', botId: 'b2', routine: 'Pearson', run: 'r2', catchup: '2026-10-26T02:24:00+09:00' }),
      ev({ ts: '2026-10-26T04:30:00+09:00', event: 'timeout', botId: 'b2', routine: 'Pearson', run: 'r2' }),
      ev({ ts: '2026-10-26T05:00:00+09:00', event: 'retry', botId: 'b2', routine: 'Pearson', run: 'r2' }),
      ev({ ts: '2026-10-30T00:20:00+09:00', event: 'start', botId: 'b3', routine: '도는 중', run: 'r3' }),
    ])
    expect(rows).toHaveLength(3)
    const r1 = rows.find((r) => r.run === 'r1')!
    expect(r1).toMatchObject({ botId: 'b1', routine: 'PARA 결제 확인', result: 'fail', reason: '페이앱 판매자 사이트 로그인 필요', ms: 251172, catchup: false })
    expect(r1.end).toBe(at('2026-10-30T00:04:11+09:00'))
    expect(rows.find((r) => r.run === 'r2')).toMatchObject({ result: 'timeout', catchup: true })
    expect(rows.find((r) => r.run === 'r3')!.end).toBeUndefined()
  })
  it('timeout 뒤에 end 가 오면 end 의 결과를 쓴다', () => {
    const [r] = pairRuns([
      ev({ ts: '2026-10-26T03:00:00+09:00', event: 'start', botId: 'b', routine: 'x', run: 'r' }),
      ev({ ts: '2026-10-26T04:01:00+09:00', event: 'timeout', botId: 'b', routine: 'x', run: 'r' }),
      ev({ ts: '2026-10-26T04:10:00+09:00', event: 'end', botId: 'b', routine: 'x', run: 'r', result: 'ok', ms: 70 * M }),
    ])
    expect(r.result).toBe('ok')
  })
})

describe('groupRuns', () => {
  it('aggregate botId 로 묶기 — 폴더 이름이 바뀐 옛 기록도 한 루틴이다', () => {
    const rows = pairRuns([
      ev({ ts: '2026-10-29T09:00:00+09:00', event: 'start', botId: 'yt', bot: '2026-12_유튜브-AI슈퍼휴먼', routine: '웨비나', run: 'a' }),
      ev({ ts: '2026-10-29T09:03:00+09:00', event: 'end', botId: 'yt', bot: '2026-12_유튜브-AI슈퍼휴먼', routine: '웨비나', run: 'a', result: 'fail' }),
      ev({ ts: '2026-10-29T09:13:00+09:00', event: 'start', botId: 'yt', bot: '개인_유튜브-AI슈퍼휴먼', routine: '웨비나', run: 'b' }),
      ev({ ts: '2026-10-29T09:18:00+09:00', event: 'end', botId: 'yt', bot: '개인_유튜브-AI슈퍼휴먼', routine: '웨비나', run: 'b', result: 'fail' }),
    ])
    const g = groupRuns(rows)
    expect(g.get('yt::웨비나')!.map((r) => r.run)).toEqual(['b', 'a'])   // 최신 먼저
  })
})

describe('classify', () => {
  const now = at('2026-10-30T00:30:00+09:00')
  const run = (result: 'ok' | 'fail' | 'skip' | 'unknown' | 'timeout') => ({ run: 'r', botId: 'b', routine: 'x', start: now - 60 * M, end: now - 50 * M, result, catchup: false })
  const rep = { enabled: true, once: false }
  it('꺼 둠이 먼저', () => expect(classify({ enabled: false, once: false }, run('fail'), now).state).toBe('off'))
  it('마지막이 실패·시간 초과면 fail', () => {
    expect(classify(rep, run('fail'), now).state).toBe('fail')
    expect(classify(rep, run('timeout'), now).state).toBe('fail')
  })
  it('주기 오류도 fail', () => expect(classify({ ...rep, error: '주기를 못 읽었어요' }, undefined, now).state).toBe('fail'))
  it('결과 줄 없음은 unknown', () => expect(classify(rep, run('unknown'), now).state).toBe('unknown'))
  it('지난 한 번짜리 — 돌았으면 finished, 안 돌았으면 missed', () => {
    const once = { enabled: true, once: true, onceAt: at('2026-10-28T10:00:00+09:00') }
    expect(classify(once, run('ok'), now).state).toBe('finished')
    expect(classify(once, run('skip'), now).state).toBe('finished')
    expect(classify(once, undefined, now).state).toBe('missed')
    expect(classify(once, run('fail'), now).state).toBe('fail')
  })
  it('classify 첫 회차 — 기록이 없는 반복 루틴은 ok + firstWait', () => expect(classify(rep, undefined, now)).toEqual({ state: 'ok', firstWait: true }))
  it('정상', () => expect(classify(rep, run('skip'), now)).toEqual({ state: 'ok', firstWait: false }))
  it('최종 리뷰 · 반복 루틴이 직전 예정 회차를 건너뛰었고 30분이 지났으면 missed', () => {
    const due = now - 2 * 60 * M   // 직전 예정 22:30 · 마지막 실행은 그보다 앞
    const old = { ...run('ok'), start: due - 24 * 60 * M, end: due - 24 * 60 * M + M }
    expect(classify({ ...rep, prevDue: due }, old, now).state).toBe('missed')
    expect(classify({ ...rep, prevDue: now - 10 * M }, old, now).state).toBe('ok')            // 아직 30분 안 — 줄에서 기다릴 수 있다
    expect(classify({ ...rep, prevDue: due }, { ...old, start: due + 5_000 }, now).state).toBe('ok')   // 그 회차가 돌았다
    expect(classify({ ...rep, prevDue: due }, undefined, now)).toEqual({ state: 'ok', firstWait: true })   // 처음 보는 루틴은 기다림
    expect(classify({ ...rep, prevDue: due }, { ...old, result: 'fail' }, now).state).toBe('fail')   // 실패가 먼저
  })
  it('prevDue — 지금 직전 예정 시각', async () => {
    const { prevDue } = await import('../../src/core/routineBoard')
    expect(prevDue('0 9 * * *', at('2026-10-30T10:00:00+09:00'))).toBe(at('2026-10-30T09:00:00+09:00'))
    expect(prevDue('엉터리', now)).toBeUndefined()
  })
  it('아직 안 온 한 번짜리는 ok', () => expect(classify({ enabled: true, once: true, onceAt: now + 60 * M }, undefined, now)).toEqual({ state: 'ok', firstWait: true }))
})

describe('daveTodo', () => {
  it('사람이 해야 하는 이유를 알아본다', () => {
    expect(daveTodo('페이앱 판매자 사이트 로그인 필요(결제 확인 못 함)')).toBe(true)
    expect(daveTodo('카톡 승인 대기')).toBe(true)
    expect(daveTodo('변화 없음')).toBe(false)
    expect(daveTodo(undefined)).toBe(false)
  })
})

describe('planSlots · 10분 칸마다 같은 순간에 동시에 도는 최대 수', () => {
  const day = at('2026-10-30T00:00:00+09:00')
  it('03:00 에 17분·4분·17초 → 03:00 칸 3 · 03:10 칸 1', () => {
    const s = planSlots([{ start: day + 180 * M, ms: 17 * M }, { start: day + 180 * M, ms: 4 * M }, { start: day + 180 * M, ms: 17_000 }], day)
    expect(s).toHaveLength(144)
    expect(s[18]).toBe(3)
    expect(s[19]).toBe(1)
    expect(s[17]).toBe(0)
  })
  it('같은 칸이어도 시간이 안 겹치면 1이다', () => {
    const s = planSlots([{ start: day + 180 * M, ms: 2 * M }, { start: day + 185 * M, ms: 2 * M }], day)
    expect(s[18]).toBe(1)
  })
  it('기준값', () => { expect(LOAD_WARN).toBe(3); expect(LOAD_BAD).toBe(5); expect(DEFAULT_MS).toBe(5 * M) })
})

describe('weekGrid', () => {
  it('7×24 · 그 시간대의 동시 최댓값', () => {
    const w0 = at('2026-10-23T00:00:00+09:00')
    const r = (s: string, mins: number) => ({ run: s, botId: 'b', routine: s, start: at(s), end: at(s) + mins * M, result: 'ok' as const, catchup: false })
    const g = weekGrid([r('2026-10-23T03:00:00+09:00', 17), r('2026-10-23T03:05:00+09:00', 3), r('2026-10-24T06:00:00+09:00', 7)], w0)
    expect(g).toHaveLength(7); expect(g[0]).toHaveLength(24)
    expect(g[0][3]).toBe(2)
    expect(g[1][6]).toBe(1)
    expect(g[0][4]).toBe(0)
  })
})

describe('suggestShift', () => {
  const day = at('2026-10-30T00:00:00+09:00')
  const plan = [
    { botId: 'para', name: 'PARA 결제 확인', cron: '0 * * * *', ms: 251_172 },
    { botId: 'home', name: '기업문의 챙기기', cron: '0 */3 * * *', ms: 17_000 },
    { botId: 'orch', name: '정기동기화-보내기-새벽', cron: '0 3 * * *', ms: 1_039_000 },
    { botId: 'sns', name: '트렌드 레이더', cron: '0 6 * * *', ms: 429_000 },
    { botId: 'grok', name: '빌드데이 참석확인 기한 10-30', cron: '2026-10-30T12:05', ms: DEFAULT_MS },
  ]
  it('겹친 칸에 가장 많이 걸린 루틴의 분을 가장 작게 옮겨 모두 2 이하로', () => {
    expect(suggestShift(plan, day)).toEqual({ botId: 'para', name: 'PARA 결제 확인', from: '0 * * * *', to: '5 * * * *' })
  })
  it('이미 2 이하이면 null', () => expect(suggestShift(plan.filter((p) => p.botId !== 'para'), day)).toBeNull())
  it('분 칸이 숫자 하나가 아닌 cron 은 후보에서 뺀다', () => {
    const p2 = [{ botId: 'a', name: 'a', cron: '*/30 * * * *', ms: 20 * M }, { botId: 'b', name: 'b', cron: '0,30 * * * *', ms: 20 * M }, { botId: 'c', name: 'c', cron: '*/15 * * * *', ms: 20 * M }]
    expect(suggestShift(p2, day)).toBeNull()
  })
})

describe('RB-5 · diffRoutines — 화면 저장의 전후 비교', () => {
  it('새로 걸림 · 지움 · 시각·켜짐·문구 바뀜 · 안 바뀐 것은 빼기', async () => {
    const { diffRoutines } = await import('../../src/core/routineBoard')
    const before = [{ name: 'a', cron: '0 9 * * *', prompt: 'p' }, { name: 'b', cron: '0 10 * * *', prompt: 'p' }, { name: 'same', cron: '0 1 * * *', prompt: 'p' }]
    const after = [{ name: 'a', cron: '7 9 * * *', prompt: 'q', enabled: false }, { name: 'c', cron: '0 11 * * *', prompt: 'p' }, { name: 'same', cron: '0 1 * * *', prompt: 'p' }]
    const d = diffRoutines(before, after)
    expect(d.map((x) => [x.routine, x.what.split(' · ')[0]])).toEqual([['a', expect.stringMatching(/^시각 .+ → .+/)], ['b', '지움'], ['c', '새로 걸림']])
    expect(d[0].what).toContain('껐음'); expect(d[0].what).toContain('문구 바뀜')
    const { describeCron } = await import('../../src/core/when')
    expect(d[2].what).toBe(`새로 걸림 · ${describeCron('0 11 * * *')}`)   // 작은 지적 · MCP 기록과 같은 문구
  })
})
