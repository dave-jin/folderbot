import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { AGENT_MODELS, DEFAULT_MODEL, MORE_MODELS } from '../../src/core/agents'

/** 깔려 있는 `claude` CLI 가 아는 모델 이름들 — 없으면 null(그 기기에서는 건너뛴다) */
function cliModels(): Set<string> | null {
  let bin = ''
  try { bin = realpathSync(execSync('command -v claude', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) } catch { return null }
  if (!bin || !existsSync(bin)) return null
  const buf = readFileSync(bin)
  const found = String(buf).match(/claude-(?:opus|sonnet|haiku|fable|mythos)-[0-9]+(?:-[0-9]+)*/g)
  return found && found.length ? new Set(found) : null
}

describe('AF · 모델 목록은 깔려 있는 CLI 가 정본이다 (2026-09-23)', () => {
  const claudeIds = [...AGENT_MODELS.claude, ...MORE_MODELS.claude].map((m) => m.v)

  it('같은 모델을 두 목록에 두지 않는다 — 고르는 자리가 둘이면 어느 쪽이 맞는지 알 수 없다', () => {
    expect(new Set(claudeIds).size).toBe(claudeIds.length)
  })

  it('첫 목록은 **종류별 최신 하나씩**이다 (Dave 2026-09-14 규칙)', () => {
    const fam = (v: string) => /fable/.test(v) ? 'fable' : /opus/.test(v) ? 'opus' : /sonnet/.test(v) ? 'sonnet' : 'haiku'
    const first = AGENT_MODELS.claude.map((m) => fam(m.v))
    expect(new Set(first).size).toBe(first.length)          // 한 종류에 둘이 서지 않는다
    expect(first).toContain('fable'); expect(first).toContain('opus')
    expect(AGENT_MODELS.claude.find((m) => fam(m.v) === 'opus')?.t).toBe('Opus 5.5')
  })

  it('기본 모델은 첫 목록 안에 있다', () => {
    expect(AGENT_MODELS.claude.map((m) => m.v)).toContain(DEFAULT_MODEL.claude)
  })

  /**
   * 🔴 **이것이 이 파일의 이유다** — Dave 가 «Opus 5.5 가 나왔는데 적용이 안 된다» 고 했을 때
   *    목록이 코드에 박혀 있어 조용히 낡아 있었다. 깔려 있는 CLI 가 모르는 이름은 그 자리에서 죽는다.
   *    ⚠ CLI 가 없는 기기(CI·컨테이너)에서는 잴 수 없으므로 건너뛴다 — 없는 것을 «통과» 로 적지 않는다.
   */
  it('첫 목록의 모델 이름을 CLI 가 전부 안다 (CLI 가 없으면 건너뜀)', () => {
    const known = cliModels()
    if (!known) { console.log('  (건너뜀) 이 기기에 claude CLI 가 없어 대조하지 못했다'); return }
    const base = (v: string) => v.replace(/\[.*\]$/, '')                 // `sonnet-5[1m]` 의 문맥 꼬리표를 뗀다
    const unknown = AGENT_MODELS.claude.map((m) => base(m.v)).filter((v) => !known.has(v) && !known.has(v.replace(/-\d{8}$/, '')))
    expect(unknown, `CLI 가 모르는 모델: ${unknown.join(', ')}`).toEqual([])
  })
})
