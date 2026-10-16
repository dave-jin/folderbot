import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { confirmLine, cronOk, describeCron, isOnce, nextRunOf, onceAt, onceDone, parseWhen, sameOnce } from '../../src/core/when'
import { cronFromText } from '../../src/core/routineText'
import { MISSED_ONCE, Routines } from '../../src/host/routines'
import type { Bot } from '../../src/core/types'

/** 2026-10-17(토) 00:50 — 테스트의 «지금» */
const NOW = new Date(2026, 9, 17, 0, 50)
const ok = (s: string, now = NOW) => { const r = parseWhen(s, now); if (!r.ok) throw new Error('못 읽음: ' + s + ' · ' + JSON.stringify(r)); return r }

/**
 * CR · 한 번만 도는 루틴 (2026-10-17 Dave: «기본 루틴 기능에 1회만 실행되는 루틴 기능도 추가해줘»).
 * 10/12 SNS 봇이 12:30 게시를 세션 안 대기로 걸었다가 세션째 지워져 안 나갔다 — «정해진 시각에 한 번» 을 걸 자리가 없었다.
 */
describe('CR · 한 번만 도는 루틴 — «언제» 에 날짜·때를 쓰면 그 시각에 한 번', () => {
  it('날짜·«내일»·«N분 뒤»·«한 번» 을 한 번짜리 시각으로 읽는다', () => {
    expect(ok('내일 아침 9시')).toMatchObject({ cron: '2026-10-18T09:00', text: '10/18(일) 아침 9시 한 번', once: true })
    expect(ok('10/20 오후 3시').cron).toBe('2026-10-20T15:00')
    expect(ok('10월 20일 15:00').cron).toBe('2026-10-20T15:00')
    expect(ok('2026-10-20 15:00').cron).toBe('2026-10-20T15:00')
    expect(ok('오늘 12:30').cron).toBe('2026-10-17T12:30')
    expect(ok('30분 뒤').cron).toBe('2026-10-17T01:20')
    expect(ok('두 시간 후').cron).toBe('2026-10-17T02:50')
    expect(ok('오후 3시 한 번').cron).toBe('2026-10-17T15:00')
    expect(ok('금요일 오후 3시 한 번').cron).toBe('2026-10-23T15:00')
    expect(ok('다음 주 월요일 9시').cron).toBe('2026-10-19T09:00')
    expect(ok('모레').cron).toBe('2026-10-19T09:00')          // 시각을 안 말하면 아침 9시 — 되읽는 말에 그대로 보인다
    expect(cronOk('2026-10-20T15:00')).toEqual({ ok: true })  // 스케줄러(croner)가 그대로 받는다
    expect(nextRunOf('2026-10-20T15:00', NOW)?.getTime()).toBe(new Date(2026, 9, 20, 15, 0).getTime())
  })

  it('🔴 반복을 뜻하는 말은 그대로 반복이다 — 한 번짜리로 새지 않는다', () => {
    expect(ok('오후 3시').cron).toBe('0 15 * * *')
    expect(ok('일요일 오전 10시').cron).toBe('0 10 * * 0')
    expect(ok('매주 월요일').cron).toBe('0 9 * * 1')
    expect(ok('두 시간에 한 번').cron).toBe('0 */2 * * *')
    expect(ok('하루에 한 번').cron).toBe('0 9 * * *')
    expect(ok('매달 20일 아침 9시').cron).toBe('0 9 20 * *')
    // 리뷰(10/17) — «한 번» 이 들어 있어도 반복을 뜻하면 반복이다. 종전 판에서 넷 다 반복이었다
    expect(ok('주 1회 월요일 9시').cron).toBe('0 9 * * 1')
    expect(ok('월요일 9시 한 번씩').cron).toBe('0 9 * * 1')
    expect(ok('하루 한 번 오후 3시').cron).toBe('0 15 * * *')
    expect(ok('하루 1회 9시').cron).toBe('0 9 * * *')
  })

  it('🔴 «…에 한 번» 은 한 번이다 — 매일·매주로 저장되면 게시 봇이 날마다 올린다', () => {
    expect(ok('10/20 오후 3시에 한 번').cron).toBe('2026-10-20T15:00')
    expect(ok('내일 오전 10시에 한 번').cron).toBe('2026-10-18T10:00')
    expect(ok('금요일 오후 3시에 한 번만').cron).toBe('2026-10-23T15:00')
    expect(ok('오후 3시 30분에 한 번').cron).toBe('2026-10-17T15:30')    // 30분마다가 아니다
    // 한 번짜리 단서를 못 읽었으면 매일로 흘리지 않는다 · 다른 꼴의 날짜도 읽는다
    expect(ok('10.20 오후 3시').cron).toBe('2026-10-20T15:00')
    expect(ok('10-20 15:00').cron).toBe('2026-10-20T15:00')
    expect(ok('다음 주 화 9시').cron).toBe('2026-10-20T09:00')
    expect(parseWhen('다음 주 9시', NOW).ok).toBe(false)
    expect(ok('3일 뒤 오후 2시').cron).toBe('2026-10-20T14:00')
    expect(ok('3일 오후 3시 한 번').cron).toBe('2026-11-03T15:00')        // «한 번» 이라 했으니 묻지 않는다
    expect(ok('내일모레 9시').cron).toBe('2026-10-19T09:00')
    // 주는 월요일에 시작한다 — 일요일의 «다음 주 월요일» 은 내일
    expect(ok('다음 주 월요일 9시', new Date(2026, 9, 18, 10)).cron).toBe('2026-10-19T09:00')
  })

  it('채팅 한 줄에서 만든 루틴 초안도 한 번짜리를 안다 — «내일 아침 9시에 블로그 올려줘» 가 매일이 됐다', () => {
    const g = cronFromText('내일 아침 9시에 블로그 올려줘')
    expect(isOnce(g.cron)).toBe(true)
    expect(g.rest).toBe('블로그 올려줘')
    expect(cronFromText('매주 월요일 9시에 주간 정리').cron).toBe('0 9 * * 1')
  })

  it('지난 시각·없는 날짜는 지어내지 않고 이유를 준다 · «20일» 은 매달인지 이번 한 번인지 되묻는다', () => {
    for (const s of ['10/1 9시', '이번 주 금요일 저녁 8시', '2/30 9시', '오늘']) expect(parseWhen(s, NOW).ok).toBe(false)
    const r = parseWhen('20일 오전 9시', NOW)
    if (r.ok || !('ask' in r)) throw new Error('되물어야 한다')
    expect(r.ask.options.map((o) => o.cron)).toEqual(['0 9 20 * *', '2026-10-20T09:00'])
    expect(ok(r.ask.options[1].text).cron).toBe('2026-10-20T09:00')   // 고른 말을 다시 읽어도 같은 시각
  })

  it('해를 안 말한 날짜가 반년 넘게 지났으면 내년이다 — 12/30 에 쓴 «1/3»', () => {
    const r = ok('1/3 아침 9시', new Date(2026, 11, 30, 10))
    expect(r.cron).toBe('2027-01-03T09:00')
    expect(r.text).toBe('2027/1/3(일) 아침 9시 한 번')
  })

  it('🔴 되읽은 말을 다시 읽으면 같은 시각이다(왕복) — 시트는 사람 말을 저장 문으로 보낸다', () => {
    for (const c of ['2026-10-20T15:00', '2026-10-18T09:00', '2026-10-17T12:00', '2026-10-18T00:00', '2026-10-18T05:30', '2026-10-18T21:00', '2027-01-03T09:00'])
      expect(ok(describeCron(c, NOW)).cron).toBe(c)
  })

  it('🔴 «정오 12시» 를 다시 읽어도 낮 12시다 — 시트를 열고 저장만 해도 정오 루틴이 자정으로 바뀌었다', () => {
    expect(describeCron('0 12 * * *')).toBe('매일 정오 12시')
    expect(ok('매일 정오 12시').cron).toBe('0 12 * * *')
    expect(ok('오전 12시').cron).toBe('0 0 * * *')            // 「오전 12시」 는 여전히 자정
  })

  it('저장된 한 번짜리는 지났어도 검증만 하고 둔다(끝난 루틴) · 되읽는 말·확인 줄', () => {
    expect(ok('2026-10-01T09:00')).toMatchObject({ once: true, past: true })
    expect(parseWhen('2026-02-30T09:00', NOW).ok).toBe(false)
    expect(isOnce('2026-10-20T15:00')).toBe(true); expect(isOnce('0 9 * * *')).toBe(false)
    expect(onceAt('0 9 * * *')).toBeNull()
    expect(onceDone('2026-10-01T09:00', NOW)).toBe(true); expect(onceDone('2026-10-20T15:00', NOW)).toBe(false)
    expect(sameOnce('2026-10-01T09:00', '2026-10-01T09:00:00')).toBe(true); expect(sameOnce('2026-10-01T09:00', undefined)).toBe(false)
    expect(confirmLine('2026-10-20T15:00', NOW)).toBe('10/20(화) 오후 3시에 한 번만 돌립니다. 그 뒤로는 다시 돌지 않아요.')
    expect(confirmLine('2026-10-01T09:00', NOW)).toContain('다시 돌지 않아요')
  })
})

describe('CR · 스케줄러 — 한 번 걸고, 놓쳤으면 한 번 보충한다', () => {
  const bot = (cron: string) => ({ id: 'b', name: 'b', routines: [{ name: 'once', cron, prompt: 'p' }] }) as unknown as Bot

  it('앞날이면 걸고(다음 실행이 그 시각) · 지났으면 걸지 않는다(오류도 아니다)', () => {
    const r = new Routines({ run: () => {}, log: () => {} })
    const fut = bot('2099-01-01T09:00'); r.reschedule([fut])
    expect(fut.routines[0].nextRun).toBe(new Date(2099, 0, 1, 9, 0).getTime())
    expect(fut.routines[0].lastError).toBeUndefined()
    const past = bot('2020-01-01T09:00'); r.reschedule([past])
    expect(past.routines[0].nextRun).toBeUndefined(); expect(past.routines[0].lastError).toBeUndefined()
    r.reschedule([])
  })

  it('🔴 한 번 돈 뒤에는 «다음 실행» 이 남지 않는다 — 다시 짠 시각에 적어 둔 값을 그대로 보여 줬다', async () => {
    const p2 = (n: number) => String(n).padStart(2, '0')
    const t = new Date(Date.now() + 1200)
    const c = `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}`
    let runs = 0
    const r = new Routines({ run: () => { runs++ }, log: () => {} })
    const b = bot(c); r.reschedule([b])
    expect(r.decorate('b', b.routines)[0].nextRun).toBeGreaterThan(Date.now())
    await new Promise((ok) => setTimeout(ok, 2200))
    expect(runs).toBe(1)
    expect(r.decorate('b', b.routines)[0].nextRun).toBeUndefined()
    r.reschedule([])
  })

  it('🔴 기록이 없어도 놓친 한 번짜리는 보충한다(6시간 안) · 이미 돌았거나 창 밖이면 안 한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-once-'))
    const ran: string[] = []
    const mk = () => { const r = new Routines({ run: (_b, x, why) => { ran.push(`${x.name}:${why?.catchup ? 'catchup' : ''}`) }, log: () => {} }); r.file = join(dir, 'routine-runs.json'); return r }
    const b = bot('2026-10-17T00:30')
    expect(mk().catchUp([b], NOW.getTime())).toEqual(['b::once'])          // 반복 루틴이면 «처음 보는 루틴 = 기준선만» 이라 건너뛰었을 자리
    expect(ran).toEqual(['once:catchup'])
    const r2 = mk(); r2.markRun('b', 'once', new Date(2026, 9, 17, 0, 30, 2).getTime())
    expect(mk().catchUp([b], NOW.getTime())).toEqual([])                   // 이미 돌았다
    expect(mk().catchUp([bot('2026-10-16T12:00')], NOW.getTime())).toEqual([])   // 12시간 전 — 창 밖
    expect(mk().catchUp([bot('2026-10-18T09:00')], NOW.getTime())).toEqual([])   // 아직 안 왔다
    rmSync(dir, { recursive: true, force: true })
  })

  it('🔴 지났는데 돈 기록이 없으면 «끝남» 이 아니라 «놓침» 이다 · 켜진 뒤 다시 짤 때 창 안이면 바로 보충한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-once-'))
    const ran: string[] = []
    const r = new Routines({ run: (_b, x) => { ran.push(x.name) }, log: () => {} }); r.file = join(dir, 'routine-runs.json')
    const old = bot('2020-01-01T09:00'); r.reschedule([old])
    expect(r.decorate('b', old.routines)[0].lastError).toBe(MISSED_ONCE)       // 창 밖 — 켜지기 전이어도 놓침
    r.markRun('b', 'once', new Date(2020, 0, 1, 9, 0, 1).getTime())
    expect(r.decorate('b', old.routines)[0].lastError).toBeUndefined()        // 돌았으면 끝난 것
    const t = new Date(Date.now() - 60_000), p2 = (n: number) => String(n).padStart(2, '0')
    const just = bot(`${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}:${p2(t.getMinutes())}`)
    r.reschedule([just]); expect(ran).toEqual([])                              // 켜지기 전 — 보충(catchUp)에 맡긴다
    r.catchUp([], Date.now()); r.reschedule([just]); expect(ran).toEqual(['once'])   // 켜진 뒤 다시 짤 때 놓친 것 — 바로 보충
    r.reschedule([])
    rmSync(dir, { recursive: true, force: true })
  })
})
