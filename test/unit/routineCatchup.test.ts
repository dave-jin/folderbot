import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Routines, StartQueue } from '../../src/host/routines'
import type { Bot } from '../../src/core/types'

/**
 * RB-2 · 놓친 회차는 «다음 회차 전까지» 보충 (2026-10-30 Dave 결정) · 켜질 때 동시 2개 · 루틴 주인 호스트만.
 */
const at = (s: string) => new Date(s).getTime()
const bot = (routines: Bot['routines']) => ({ id: 'b', name: 'b', routines }) as unknown as Bot

function mk(dir: string, opts: { owner?: boolean } = {}) {
  const ran: string[] = []
  const r = new Routines({ run: (_b, x, why) => { ran.push(`${x.name}${why?.catchup ? ':catchup' : ''}`) }, log: () => {} })
  r.file = join(dir, 'routine-runs.json')
  if (opts.owner === false) r.owner = () => false
  return { r, ran }
}

describe('RB-2 · 보충 «다음 회차 전까지»', () => {
  let dir = ''
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); vi.useRealTimers() })

  it('13시간 꺼짐 — 매일 루틴 보충', () => {
    dir = mkdtempSync(join(tmpdir(), 'rb2-'))
    const b = bot([{ name: 'a', cron: '0 9 * * *', prompt: 'p' }])
    mk(dir).r.markRun('b', 'a', at('2026-10-28T09:00:05'))
    const { r, ran } = mk(dir)
    expect(r.catchUp([b], at('2026-10-29T22:00:00'))).toEqual(['b::a'])   // 10/29 09:00 회차를 놓치고 13시간 뒤 켜짐 — 옛 판(6시간)은 버렸다
    expect(ran).toEqual(['a:catchup'])
  })
  it('한 번짜리는 6시간 그대로', () => {
    dir = mkdtempSync(join(tmpdir(), 'rb2-'))
    const b = bot([{ name: 'once', cron: '2026-10-28T10:00', prompt: 'p' }])
    const { r, ran } = mk(dir)
    expect(r.catchUp([b], at('2026-10-28T17:00:00'))).toEqual([])
    expect(ran).toEqual([])
  })
  it('catchup:false 는 안 한다', () => {
    dir = mkdtempSync(join(tmpdir(), 'rb2-'))
    const b = bot([{ name: 'a', cron: '0 9 * * *', prompt: 'p', catchup: false }])
    mk(dir).r.markRun('b', 'a', at('2026-10-28T09:00:05'))
    expect(mk(dir).r.catchUp([b], at('2026-10-29T20:00:00'))).toEqual([])
  })
  it('공유 기록이 돌았다고 하면 안 한다 — 다른 호스트가 이미 돌린 회차', () => {
    dir = mkdtempSync(join(tmpdir(), 'rb2-'))
    const b = bot([{ name: 'a', cron: '0 9 * * *', prompt: 'p' }])
    mk(dir).r.markRun('b', 'a', at('2026-10-28T09:00:05'))
    const { r, ran } = mk(dir)
    expect(r.catchUp([b], at('2026-10-29T20:00:00'), (id, name, t) => id === 'b' && name === 'a' && t === at('2026-10-29T09:00:00'))).toEqual([])
    expect(ran).toEqual([])
  })
  it('owner false 면 보충도 스케줄도 안 한다 · 다음 실행은 보인다', () => {
    dir = mkdtempSync(join(tmpdir(), 'rb2-'))
    vi.useFakeTimers({ now: at('2026-10-29T08:58:00') })
    const b = bot([{ name: 'a', cron: '0 9 * * *', prompt: 'p' }])
    const off = mk(dir, { owner: false }), on = mk(dir)
    off.r.reschedule([b]); on.r.reschedule([bot([{ name: 'a', cron: '0 9 * * *', prompt: 'p' }])])
    expect(off.r.status('b', 'a').next).toBe(at('2026-10-29T09:00:00'))
    vi.advanceTimersByTime(5 * 60_000)
    expect(on.ran).toEqual(['a'])          // 대조군 — 주인 호스트는 돈다
    expect(off.ran).toEqual([])
    off.r.markRun('b', 'a', at('2026-10-28T09:00:05'))
    expect(off.r.catchUp([b], at('2026-10-29T20:00:00'))).toEqual([])
  })
})

describe('RB-2 · StartQueue 동시 2개', () => {
  it('예정 시각 이른 것부터 둘만 · 하나 끝나면 다음', async () => {
    const q = new StartQueue(2)
    const started: number[] = []; const done = new Map<number, () => void>()
    for (const t of [50, 10, 40, 20, 30]) q.push(t, () => new Promise<void>((res) => { started.push(t); done.set(t, res) }))
    await Promise.resolve(); await Promise.resolve()
    expect(started).toEqual([10, 20])
    done.get(10)!(); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([10, 20, 30])
    done.get(20)!(); done.get(30)!(); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([10, 20, 30, 40, 50])
  })
  it('job 이 던져도 줄은 계속 간다', async () => {
    const q = new StartQueue(1); const started: number[] = []
    q.push(1, async () => { started.push(1); throw new Error('x') })
    q.push(2, async () => { started.push(2) })
    await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([1, 2])
  })
})

describe('RB-2 · 공유 실행 기록', () => {
  it('RunLog.events 는 지난달·이번 달 파일을 읽는다 · latestStarts 는 루틴마다 가장 늦은 시작', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { RunLog } = await import('../../src/host/runs')
    const { latestStarts } = await import('../../src/core/routineBoard')
    const root = mkdtempSync(join(tmpdir(), 'rb2-runs-')); mkdirSync(join(root, '.folderbot', 'ops'), { recursive: true })
    writeFileSync(join(root, '.folderbot', 'ops', 'runs-2026-09.jsonl'), JSON.stringify({ ts: '2026-09-30T09:00:00+09:00', host: 'macbook', event: 'start', botId: 'b', routine: 'a', run: 'x' }) + '\n')
    writeFileSync(join(root, '.folderbot', 'ops', 'runs-2026-10.jsonl'), JSON.stringify({ ts: '2026-10-29T09:00:01+09:00', host: 'macbook', event: 'start', botId: 'b', routine: 'a', run: 'y' }) + '\n깨진 줄\n')
    const log = new RunLog(root, () => undefined, () => 'mac-mini', () => {}, () => at('2026-10-29T20:00:00'))
    const ev = log.events()
    expect(ev.map((e) => e.run)).toEqual(['x', 'y'])
    expect(latestStarts(ev).get('b::a')).toBe(at('2026-10-29T09:00:01+09:00'))
    rmSync(root, { recursive: true, force: true })
  })
})

/**
 * 최종 리뷰(10/30) · 줄에 선 회차가 같은 루틴을 두 번 돌리지 않는다 — 기다리는 동안 다시 짜기·깨어남·재시도가 같은 루틴을 또 넣거나,
 * 그사이 제시각 회차가 먼저 돌았으면 줄의 것은 건너뛴다 · 제시각에 도는 것도 동시 한도에 든다.
 */
describe('RB-2 · 줄 중복 막기', () => {
  it('같은 열쇠는 줄에 하나만 — 두 번째 push 는 false', async () => {
    const q = new StartQueue(1); const started: string[] = []; let hold!: () => void
    q.push(1, () => new Promise<void>((res) => { started.push('x'); hold = res }), { key: 'b::x' })
    expect(q.push(2, async () => { started.push('a') }, { key: 'b::a' })).toBe(true)
    expect(q.push(3, async () => { started.push('a2') }, { key: 'b::a' })).toBe(false)
    expect(q.has('b::a')).toBe(true)
    await new Promise((r) => setTimeout(r, 0)); hold(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['x', 'a'])
    expect(q.has('b::a')).toBe(false)
  })
  it('차례가 왔을 때 skip() 이 참이면 돌리지 않고 다음으로', async () => {
    const q = new StartQueue(1); const started: number[] = []
    q.push(1, async () => { started.push(1) }, { key: 'k1', skip: () => true })
    q.push(2, async () => { started.push(2) }, { key: 'k2' })
    await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([2])
  })
  it('제시각에 도는 것(busy)도 한도에 든다 · kick 으로 다시 본다', async () => {
    let busy = 2; const q = new StartQueue(2, () => busy); const started: number[] = []
    q.push(1, async () => { started.push(1) })
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([])
    busy = 1; q.kick(); await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([1])
  })
  it('다시 짜기가 줄에서 기다리는 한 번짜리를 또 넣지 않는다', async () => {
    dir0 = mkdtempSync(join(tmpdir(), 'rb2-q-'))
    vi.useFakeTimers({ now: at('2026-10-28T12:00:00') })
    const q = new StartQueue(1, () => 1)   // 자리가 다 차 있다 — 줄에서 기다린다
    const pushed: boolean[] = []
    const r = new Routines({ run: (b, x, why) => { pushed.push(q.push(why?.catchup ?? 0, async () => {}, { key: `${b.id}::${x.name}` })) }, log: () => {} })
    r.file = join(dir0, 'routine-runs.json')
    const b = bot([{ name: 'once', cron: '2026-10-28T10:00', prompt: 'p' }])
    r.catchUp([b], Date.now())
    r.reschedule([bot([{ name: 'once', cron: '2026-10-28T10:00', prompt: 'p' }])])
    r.reschedule([bot([{ name: 'once', cron: '2026-10-28T10:00', prompt: 'p' }])])
    expect(pushed).toEqual([true, false, false])
    vi.useRealTimers(); rmSync(dir0, { recursive: true, force: true })
  })
  it('ranSince — 그 시각 뒤에 이 호스트가 돌렸나', () => {
    dir0 = mkdtempSync(join(tmpdir(), 'rb2-q-'))
    const { r } = mk(dir0)
    r.markRun('b', 'a', 1000)
    expect(r.ranSince('b', 'a', 999)).toBe(true)
    expect(r.ranSince('b', 'a', 1001)).toBe(false)
    rmSync(dir0, { recursive: true, force: true })
  })
})
let dir0 = ''
