import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, appendFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * L · 원격 usage 패널이 0 (2026-09-19) — 호스트가 `~/.claude/projects` 를 훑을 때 **파일 400개 상한**에 먼저 걸리면
 * 최근 기록이 목록에 못 들어와 «아직 쓴 게 없어요» 가 된다. 기록이 많은 사람(Dave)의 볼트를 흉내 낸다.
 */
const home = mkdtempSync(join(tmpdir(), 'fb-usage-home-'))
process.env.FOLDERBOT_HOME = home
const line = (t: number, out = 100) => JSON.stringify({ timestamp: new Date(t).toISOString(), message: { model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + '\n'

beforeAll(() => {
  const now = Date.now(); const old = now - 30 * 24 * 3600_000
  for (let i = 0; i < 450; i++) { const d = join(home, '.claude', 'projects', `-old-${i % 50}`); mkdirSync(d, { recursive: true }); const f = join(d, `s${i}.jsonl`); writeFileSync(f, line(old)); utimesSync(f, old / 1000, old / 1000) }
  const d = join(home, '.claude', 'projects', '-zz-recent'); mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'fresh.jsonl'), line(now - 60_000, 500) + line(now - 30_000, 700))
})

describe('usage scan (L)', () => {
  it('오래된 기록이 400개를 넘어도 최근 기록은 셈에 든다', async () => {
    const { usageReport } = await import('../../src/host/usage')
    const r = await usageReport()
    const claude = r.tools.find((t) => t.tool === 'claude')
    expect(claude?.tokens).toBe(10 + 500 + 10 + 700)
    expect(r.resetAt).not.toBeNull()
  })
})

/**
 * BO · 기록은 «새로 붙은 줄만» 읽는다 (2026-10-08 맥미니 실측 — 7일치 643MB 를 통째로 다시 읽어 호스트가 2.5초씩 멈췄다).
 * 다시 센 값이 «처음부터 다 읽은 값» 과 같아야 하고, 읽은 바이트는 덧붙인 만큼만 늘어야 한다.
 */
describe('usage 증분 훑기 (BO)', () => {
  const dir = () => join(home, '.claude', 'projects', '-bo-inc')
  const claudeTokens = async () => { const { usageReport, invalidateUsage } = await import('../../src/host/usage'); invalidateUsage(); const r = await usageReport(); return r.tools.find((t) => t.tool === 'claude')?.tokens ?? 0 }
  it('덧붙인 줄만 읽고, 합은 처음부터 다 읽은 값과 같다', async () => {
    const { scanStats } = await import('../../src/host/usage')
    const base = await claudeTokens()
    mkdirSync(dir(), { recursive: true }); const f = join(dir(), 'inc.jsonl')
    const now = Date.now()
    writeFileSync(f, line(now - 50_000, 1000) + line(now - 40_000, 2000))
    expect(await claudeTokens()).toBe(base + 1010 + 2010)
    const before = scanStats.bytesRead
    const add = line(now - 20_000, 4000)
    // 덜 쓰인 줄(줄 끝 없음)은 세지 않고, 마저 쓰이면 그때 센다 — CLI 가 쓰는 도중에 읽어도 반쪽 줄을 버리지 않는다
    appendFileSync(f, add.slice(0, 30))
    expect(await claudeTokens()).toBe(base + 1010 + 2010)
    appendFileSync(f, add.slice(30))
    expect(await claudeTokens()).toBe(base + 1010 + 2010 + 4010)
    // 처음 두 줄을 다시 읽지 않았다 — 반쪽 줄 30바이트를 두 번 읽은 것까지만 더 읽는다
    expect(scanStats.bytesRead - before).toBe(Buffer.byteLength(add) + 30)
  })
  it('파일을 덮어써 줄었으면 처음부터 다시 센다', async () => {
    const base = await claudeTokens()
    const f = join(dir(), 'inc.jsonl'); const was = statSync(f).size
    writeFileSync(f, line(Date.now() - 10_000, 7))
    expect(statSync(f).size).toBeLessThan(was)
    expect(await claudeTokens()).toBe(base - (1010 + 2010 + 4010) + 17)
  })
  it('한국어가 조각 경계에 걸려도 깨지지 않는다 (2MB 넘는 파일)', async () => {
    const base = await claudeTokens()
    const f = join(dir(), 'big.jsonl'); const now = Date.now()
    const pad = JSON.stringify({ type: 'user', message: { content: '한국어 본문 '.repeat(5000) } }) + '\n'
    let body = ''; let n = 0
    while (Buffer.byteLength(body) < 5 * 1024 * 1024) { body += pad + line(now - 100_000 + n, 1); n++ }
    writeFileSync(f, body)
    expect(await claudeTokens()).toBe(base + n * 11)
  })
  it('7일 밖으로 나간 파일은 셈에서 빠진다', async () => {
    const base = await claudeTokens()
    const f = join(dir(), 'big.jsonl'); const old = Date.now() - 8 * 24 * 3600_000
    utimesSync(f, old / 1000, old / 1000)
    expect(await claudeTokens()).toBeLessThan(base)
  })
  it('동시에 여러 번 물어도 기록은 한 번만 읽는다', async () => {
    const { usageReport, invalidateUsage, scanStats } = await import('../../src/host/usage')
    const f = join(dir(), 'once.jsonl'); writeFileSync(f, line(Date.now() - 5_000, 3))
    invalidateUsage(); const before = scanStats.bytesRead
    await Promise.all([usageReport(), usageReport(), usageReport()])
    expect(scanStats.bytesRead - before).toBe(statSync(f).size)
  })
})

import { report, type UsageEvent } from '../../src/core/usage'
describe('usage report (L)', () => {
  const now = Date.now()
  const ev = (sid: string, out: number, t = now - 60_000): UsageEvent => ({ t, tool: 'claude', model: 'claude-opus-5', input: 0, output: out, cacheRead: 0, cacheWrite: 0, sid })
  it('예산이 0 이면 남은 값은 null(화면은 —) · 출처를 안다', () => {
    const r = report([ev('a', 10)], now, { window: 6.4, day: 19.3, week: 0 }, { budgetSource: 'settings' })
    expect(r.week.left).toBeNull(); expect(r.day.left).not.toBeNull(); expect(r.budgetSource).toBe('settings')
    expect(report([], now).budgetSource).toBe('default')
  })
  it('봇별 내역 — 세션 id 로 붙이고 모르는 것은 «그 밖»', () => {
    const r = report([ev('s1', 100), ev('s1', 50), ev('s2', 10), ev('x', 1)], now, undefined, { botOf: (sid) => (sid === 's1' ? { botId: 'b1', name: '재무' } : sid === 's2' ? { botId: 'b2', name: '기획' } : undefined) })
    expect(r.byBot.map((b) => [b.botId, b.name, b.tokens, b.turns])).toEqual([['b1', '재무', 150, 2], ['b2', '기획', 10, 1], ['_other', '그 밖 (터미널 등)', 1, 1]])
  })
})
