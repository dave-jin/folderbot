import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
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
    const r = usageReport()
    const claude = r.tools.find((t) => t.tool === 'claude')
    expect(claude?.tokens).toBe(10 + 500 + 10 + 700)
    expect(r.resetAt).not.toBeNull()
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
