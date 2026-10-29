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
