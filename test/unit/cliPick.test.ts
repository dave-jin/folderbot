import { describe, it, expect } from 'vitest'
import { cmpCliVersion, pickNewestCli } from '../../src/core/cliUpdate'

/**
 * AL (2026-09-24 실측) — Dave 의 맥에 `claude` 가 두 벌 깔려 있었고 호스트가 **낡은 쪽**을 집었다.
 * 그 번들에는 `claude-opus-5-5` 가 없어서 모델 목록에 Opus 5.5 가 뜰 수 없었다.
 */
describe('AL · 여러 CLI 중 가장 새 것', () => {
  it('🔴 `claude --version` 의 꼬리 글자에 속지 않는다 — 종전엔 281 과 278 이 같다고 나왔다', () => {
    expect(cmpCliVersion('2.1.281 (Claude Code)', '2.1.278 (Claude Code)')).toBeGreaterThan(0)
    expect(cmpCliVersion('2.1.278 (Claude Code)', '2.1.281 (Claude Code)')).toBeLessThan(0)
    expect(cmpCliVersion('2.1.281 (Claude Code)', '2.1.281 (Claude Code)')).toBe(0)
  })
  it('🔴 Dave 의 실제 상황 — ~/.local 이 먼저여도 판이 새 쪽이 이긴다', () => {
    const got = pickNewestCli([
      { bin: '/Users/dave/.local/bin/claude', version: '2.1.278 (Claude Code)' },
      { bin: '/usr/local/bin/claude', version: '2.1.281 (Claude Code)' },
    ])
    expect(got?.bin).toBe('/usr/local/bin/claude')
  })
  it('판이 같으면 먼저 온 것이 이긴다 — 종전 선호 순서를 지킨다', () => {
    const got = pickNewestCli([{ bin: 'A', version: '2.1.281' }, { bin: 'B', version: '2.1.281' }])
    expect(got?.bin).toBe('A')
  })
  it('판을 못 읽은 후보는 위로 안 올린다 · 하나뿐이면 그것을 쓴다 · 없으면 null', () => {
    expect(pickNewestCli([{ bin: 'A', version: '2.1.278' }, { bin: 'B', version: null }])?.bin).toBe('A')
    expect(pickNewestCli([{ bin: 'B', version: null }])?.bin).toBe('B')
    expect(pickNewestCli([])).toBe(null)
  })
})
