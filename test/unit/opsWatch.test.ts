import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseOps, tailLines, OPS_DEFAULT_EVERY_MS } from '../../src/core/ops'
import { parseDuration } from '../../src/core/bridges'
import { OpsWatch, type OpsDeps } from '../../src/host/opsWatch'

/**
 * BZ · 호스트 운영 감시 (2026-10-09 Dave 결정) — launchd 는 TCC 로 볼트를 못 읽고 분리 데몬은 세션 정책이 막아서,
 * 볼트에 이미 닿는 호스트가 `.claude/ops.yml` 의 명령을 주기마다 LLM 없이 돌린다.
 */
function fixture(yml: string, host = 'mac-mini') {
  const root = mkdtempSync(join(tmpdir(), 'fb-ops-')); mkdirSync(join(root, '.claude'))
  writeFileSync(join(root, '.claude/ops.yml'), yml)
  const notes: Parameters<OpsDeps['note']>[0][] = [], alerts: string[] = [], logs: string[] = []
  const w = new OpsWatch({ root, hostNames: () => [host], log: (m) => logs.push(m), note: (e) => notes.push(e), alert: (t) => alerts.push(t), firstDelayMs: 50 })
  return { root, w, notes, alerts, logs, done: () => { w.stop(); rmSync(root, { recursive: true, force: true }) } }
}

describe('BZ · 설정 (core/ops)', () => {
  it('기본 15분 · 60초 · 초 단위 · 꺼짐 · 빠진 명령', () => {
    expect(parseOps('watch:\n  command: ops-watch once\n')).toMatchObject({ watch: { command: 'ops-watch once', everyMs: OPS_DEFAULT_EVERY_MS, timeoutMs: 60_000 }, errors: [] })
    expect(parseOps('host: mac-mini\nwatch: { command: x, every: 5m, timeout: 90s }\n')).toMatchObject({ host: 'mac-mini', watch: { everyMs: 300_000, timeoutMs: 90_000 } })
    expect(parseOps('watch: { command: x, every: 10s, timeout: 60s }\n').watch?.timeoutMs).toBe(10_000)   // 주기보다 길 수 없다
    expect(parseOps('watch: { command: x, enabled: false }\n').watch).toBeUndefined()
    expect(parseOps('watch: { every: 5m }\n').errors.join()).toMatch(/command/)
    expect([parseDuration('60s'), parseDuration('0.5초'), parseDuration('15m')]).toEqual([60_000, 500, 900_000])
    expect(tailLines('a\nb\nc\nd\ne\nf\ng\n', 3)).toBe('e\nf\ng')
  })
})

describe('BZ · OpsWatch — 명령 실행기', () => {
  it('성공·실패를 종료 코드·소요 시간·stderr 끝과 함께 기록한다', async () => {
    const f = fixture('watch: { command: "echo 경고 >&2; exit 0" }\n')
    try {
      f.w.reload(); f.w.stop()
      expect(await f.w.tick()).toEqual({ ok: true, code: 0 })
      expect(f.notes[0]).toMatchObject({ event: 'ops_watch', ok: true, code: 0, command: 'echo 경고 >&2; exit 0', stderr: '경고' })
      expect(f.notes[0].ms).toBeGreaterThanOrEqual(0)
    } finally { f.done() }
  })
  it('🔴 연속 3회 실패하면 한 번만 알리고, 다시 성공하면 «회복» 을 한 번 알린다', async () => {
    const f = fixture('watch: { command: "echo 볼트를 못 읽음 >&2; exit 3" }\n')
    try {
      f.w.reload(); f.w.stop()
      for (let i = 0; i < 4; i++) expect((await f.w.tick()).code).toBe(3)
      expect(f.notes.map((n) => n.ok)).toEqual([false, false, false, false])
      expect(f.alerts).toHaveLength(1)
      expect(f.alerts[0]).toMatch(/^\[운영 감시 실패\].*연속 3회/); expect(f.alerts[0]).toContain('볼트를 못 읽음')
      writeFileSync(join(f.root, '.claude/ops.yml'), 'watch: { command: "true" }\n'); f.w.reload(); f.w.stop()
      await f.w.tick()
      expect(f.alerts).toHaveLength(2); expect(f.alerts[1]).toMatch(/^\[운영 감시 회복\]/)
      await f.w.tick(); expect(f.alerts).toHaveLength(2)
    } finally { f.done() }
  })
  it('시간을 넘으면 끊고 실패(timedOut) · 앞 회차가 돌면 이번 회차는 건너뛴다', async () => {
    const f = fixture('watch: { command: "sleep 3", every: 10m, timeout: 0.4s }\n')
    try {
      f.w.reload(); f.w.stop()
      const a = f.w.tick(); const b = await f.w.tick()
      expect(b.skipped).toBe(true)
      const r = await a
      expect(r.ok).toBe(false); expect(f.notes[0]).toMatchObject({ ok: false, timedOut: true })
      expect(f.notes[0].ms).toBeLessThan(2500)
    } finally { f.done() }
  })
  it('🔴 주기마다 돈다 · 주인 호스트가 아니면 안 돈다', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'fb-opsout-')), 'beat.txt')
    const yml = `host: mac-mini\nwatch: { command: "date +%s%N >> ${out}", every: 0.3s, timeout: 0.3s }\n`
    const other = fixture(yml, 'Daveui-MacBookPro-2.local')
    try { other.w.reload(); await new Promise((r) => setTimeout(r, 900)); expect(existsSync(out)).toBe(false); expect(other.logs.join()).toMatch(/mac-mini 호스트가 돌려요/) } finally { other.done() }
    const f = fixture(yml)
    try {
      f.w.reload(); await new Promise((r) => setTimeout(r, 1200))
      expect(readFileSync(out, 'utf8').trim().split('\n').length).toBeGreaterThanOrEqual(3)
      f.w.stop(); const n = f.notes.length; await new Promise((r) => setTimeout(r, 700)); expect(f.notes.length).toBe(n)   // 끄면 멈춘다
    } finally { f.done() }
  })
})
