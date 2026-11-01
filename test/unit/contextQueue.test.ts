import { describe, it, expect } from 'vitest'
import { ContextQueue, CARD_DEBOUNCE_MS, GROUP_DEBOUNCE_MS, USAGE_RECHECK_MS, type QueueDeps } from '../../src/host/contextQueue'
import type { PlanUsage } from '../../src/core/usage'

/** 가짜 시계·타이머 — advance 가 기한이 된 타이머를 시각 순으로 돌리고 그때마다 마이크로태스크를 비운다 */
function rig(o: { usage?: () => PlanUsage | null; cap?: () => number; off?: () => boolean; start?: number } = {}) {
  let now = o.start ?? new Date(2026, 10, 1, 12, 0, 0).getTime()
  let seq = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const logs: string[] = []
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise<void>((r) => setImmediate(r)) }
  const deps: QueueDeps = {
    now: () => now,
    usage: o.usage ?? (() => null),
    cap: o.cap ?? (() => 500),
    off: o.off ?? (() => false),
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id },
    clearTimer: (t) => { timers.delete(t as number) },
    log: (m) => { logs.push(m) }
  }
  const advance = async (ms: number) => {
    const target = now + ms
    for (;;) {
      let nextId = -1, nextAt = Infinity
      for (const [id, t] of timers) if (t.at <= target && t.at < nextAt) { nextAt = t.at; nextId = id }
      if (nextId < 0) break
      const t = timers.get(nextId)!
      timers.delete(nextId)
      now = Math.max(now, t.at)
      t.fn()
      await flush()
    }
    now = target
    await flush()
  }
  return { deps, advance, flush, logs, timers, setNow: (n: number) => { now = n }, nowMs: () => now }
}
const MIN = 60_000

describe('ContextQueue', () => {
  it('같은 key 를 1분 간격으로 세 번 poke → 마지막 뒤 2분에 한 번만 돈다', async () => {
    const r = rig(); const q = new ContextQueue(r.deps)
    let n = 0
    const run = async () => { n++; return true }
    q.poke('card:a', CARD_DEBOUNCE_MS, run)
    await r.advance(MIN)
    q.poke('card:a', CARD_DEBOUNCE_MS, run)
    await r.advance(MIN)
    q.poke('card:a', CARD_DEBOUNCE_MS, run)
    await r.advance(CARD_DEBOUNCE_MS - 1)
    expect(n).toBe(0)
    expect(q.pending()).toBe(1)
    await r.advance(1)
    expect(n).toBe(1)
    await q.idle()
    expect(q.pending()).toBe(0)
    await r.advance(10 * MIN)
    expect(n).toBe(1)
  })

  it('서로 다른 key 셋 → 한 번에 하나씩, 앞 것이 끝나야 다음이 시작한다', async () => {
    const r = rig(); const q = new ContextQueue(r.deps)
    let active = 0, maxActive = 0
    const order: string[] = []
    const gates: Record<string, () => void> = {}
    const mk = (name: string) => () => new Promise<boolean>((res) => {
      active++; maxActive = Math.max(maxActive, active); order.push(name)
      gates[name] = () => { active--; res(true) }
    })
    q.poke('card:a', 0, mk('a')); q.poke('card:b', 0, mk('b')); q.poke('card:c', 0, mk('c'))
    await r.advance(0)
    expect(order).toEqual(['a'])
    gates.a(); await r.flush()
    expect(order).toEqual(['a', 'b'])
    gates.b(); await r.flush()
    expect(order).toEqual(['a', 'b', 'c'])
    gates.c(); await r.flush()
    expect(maxActive).toBe(1)
    await q.idle()
  })

  it('디바운스가 끝난 차례대로 돈다(FIFO)', async () => {
    const r = rig(); const q = new ContextQueue(r.deps)
    const order: string[] = []
    const mk = (n: string) => async () => { order.push(n); return true }
    q.poke('card:slow', 5 * MIN, mk('slow'))
    q.poke('group:fast', 1 * MIN, mk('fast'))
    await r.advance(6 * MIN)
    expect(order).toEqual(['fast', 'slow'])
  })

  it('도는 중인 key 를 다시 poke 하면 잃지 않고 끝난 뒤(디바운스 후) 다시 돈다', async () => {
    const r = rig(); const q = new ContextQueue(r.deps)
    let gate!: () => void; let n = 0
    const run = () => new Promise<boolean>((res) => { n++; gate = () => res(true) })
    q.poke('card:a', 0, run)
    await r.advance(0)
    expect(n).toBe(1)
    q.poke('card:a', MIN, run)
    expect(q.pending()).toBe(1)
    gate(); await r.flush()
    expect(n).toBe(1)
    await r.advance(MIN)
    expect(n).toBe(2)
    gate(); await q.idle()
    expect(n).toBe(2)
  })

  it('usage 81 → paused usage, 아무것도 안 돈다. 10분 뒤 50 → 밀린 셋이 넣은 차례대로', async () => {
    let used = 81
    const r = rig({ usage: () => ({ available: true, five: { used, resetsAt: null }, fetchedAt: 0 }) })
    const q = new ContextQueue(r.deps)
    const order: string[] = []
    const mk = (n: string) => async () => { order.push(n); return true }
    q.poke('card:a', 0, mk('a')); q.poke('card:b', 0, mk('b')); q.poke('group:c', 0, mk('c'))
    await r.advance(0)
    expect(q.paused).toBe('usage')
    expect(order).toEqual([])
    await r.advance(USAGE_RECHECK_MS - 1)
    expect(order).toEqual([])
    used = 50
    await r.advance(1)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(q.paused).toBeNull()
  })

  it('주간 창만 80 이어도 멈춘다', async () => {
    const r = rig({ usage: () => ({ available: true, five: { used: 10, resetsAt: null }, week: { used: 80, resetsAt: null }, fetchedAt: 0 }) })
    const q = new ContextQueue(r.deps)
    let n = 0
    q.poke('card:a', 0, async () => { n++; return true })
    await r.advance(0)
    expect(q.paused).toBe('usage'); expect(n).toBe(0)
  })

  it('usage null · available:false 는 막지 않는다', async () => {
    for (const u of [null, { available: false, five: { used: 99, resetsAt: null }, fetchedAt: 0 } as PlanUsage]) {
      const r = rig({ usage: () => u }); const q = new ContextQueue(r.deps)
      let n = 0
      q.poke('card:a', 0, async () => { n++; return true })
      await r.advance(0)
      expect(n).toBe(1); expect(q.paused).toBeNull()
    }
  })

  it('cap 2 → LLM 을 부른 일 둘 뒤 paused cap · false 를 돌려준 일은 수에 안 든다', async () => {
    const r = rig({ cap: () => 2 }); const q = new ContextQueue(r.deps)
    const ran: string[] = []
    const mk = (n: string, v: boolean) => async () => { ran.push(n); return v }
    q.poke('card:r1', 0, mk('r1', false)); q.poke('card:r2', 0, mk('r2', false))
    q.poke('card:a', 0, mk('a', true)); q.poke('card:b', 0, mk('b', true)); q.poke('card:c', 0, mk('c', true))
    await r.advance(0)
    expect(ran).toEqual(['r1', 'r2', 'a', 'b'])
    expect(q.calls).toBe(2)
    expect(q.paused).toBe('cap')
    expect(q.pending()).toBe(1)
  })

  it('cap 으로 멈춘 줄은 로컬 자정 뒤에 다시 돌고 calls 가 0 으로 돌아간다', async () => {
    const r = rig({ cap: () => 1, start: new Date(2026, 10, 1, 23, 0, 0).getTime() }); const q = new ContextQueue(r.deps)
    const ran: string[] = []
    const mk = (n: string) => async () => { ran.push(n); return true }
    q.poke('card:a', 0, mk('a')); q.poke('card:b', 0, mk('b'))
    await r.advance(0)
    expect(ran).toEqual(['a']); expect(q.paused).toBe('cap')
    await r.advance(59 * MIN)
    expect(ran).toEqual(['a'])
    await r.advance(2 * MIN)                 // 자정을 넘김
    expect(ran).toEqual(['a', 'b'])
    expect(q.calls).toBe(1)
  })

  it('off() → 아무것도 안 돈다, 풀리면 돈다', async () => {
    let off = true
    const r = rig({ off: () => off }); const q = new ContextQueue(r.deps)
    let n = 0
    q.poke('card:a', 0, async () => { n++; return true })
    await r.advance(0)
    expect(q.paused).toBe('off'); expect(n).toBe(0)
    off = false
    await r.advance(USAGE_RECHECK_MS)
    expect(n).toBe(1)
  })

  it('run 이 던지거나 reject 해도 로그를 남기고 다음 일로 넘어간다', async () => {
    const r = rig(); const q = new ContextQueue(r.deps)
    const ran: string[] = []
    q.poke('card:a', 0, async () => { throw new Error('boom') })
    q.poke('card:b', 0, () => { throw new Error('sync boom') })
    q.poke('card:c', 0, async () => { ran.push('c'); return true })
    await r.advance(0)
    await q.idle()
    expect(ran).toEqual(['c'])
    expect(r.logs.some((l) => l.includes('card:a') && l.includes('boom'))).toBe(true)
    expect(r.logs.some((l) => l.includes('card:b') && l.includes('sync boom'))).toBe(true)
    expect(q.calls).toBe(1)
  })

  it('usage() 가 던져도 처리 안 된 거부 없이 로그를 남기고, 멈춘 뒤 다시 보면 돈다', async () => {
    let boom = true
    const r = rig({ usage: () => { if (boom) throw new Error('usage down'); return null } })
    const q = new ContextQueue(r.deps)
    const unhandled: unknown[] = []
    const onU = (e: unknown) => { unhandled.push(e) }
    process.on('unhandledRejection', onU)
    try {
      let n = 0
      q.poke('card:a', 0, async () => { n++; return true })
      await r.advance(0)
      expect(n).toBe(0)
      expect(q.pending()).toBe(1)
      expect(r.logs.some((l) => l.includes('usage down'))).toBe(true)
      boom = false
      await r.advance(USAGE_RECHECK_MS)
      expect(n).toBe(1)
      await q.idle()
      await r.flush()
      expect(unhandled).toEqual([])
    } finally { process.off('unhandledRejection', onU) }
  })

  it('cap()·off() 가 던져도 같다 · log 가 던져도 줄은 산다', async () => {
    let boom = true
    const r = rig({ cap: () => { if (boom) throw new Error('cap down'); return 500 } })
    const orig = r.deps.log
    r.deps.log = (m) => { orig(m); throw new Error('log down') }
    const q = new ContextQueue(r.deps)
    let n = 0
    q.poke('card:a', 0, async () => { n++; return true })
    await r.advance(0)
    expect(n).toBe(0); expect(q.paused).toBeNull()
    boom = false
    await r.advance(USAGE_RECHECK_MS)
    expect(n).toBe(1)
  })

  it('group 디바운스 상수', () => { expect(GROUP_DEBOUNCE_MS).toBe(60_000) })
})
