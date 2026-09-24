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

describe('AH · 모델 이름표와 목록 주워 오기 (2026-09-24)', () => {
  it('🔴 날짜 꼬리표가 붙어도 제 이름표를 단다 — 종전엔 소문자 대체 이름(「opus 5」)이 떴다', async () => {
    const { modelLabel } = await import('../../src/client/consts')
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabel('claude-opus-5-5-20260401')).toBe('Opus 5.5')
    expect(modelLabel('claude-fable-5-1-20260501')).toBe('Fable 5.1')
    expect(modelLabel('claude-opus-5')).toBe('Opus 5')            // 「더 많은 모델」의 것도 제 이름표
    expect(modelLabel('claude-opus-5-20260101')).toBe('Opus 5')
    // 🔴 5 와 5.5 는 **다른 모델**이다 — 앞자리가 겹친다고 같아지면 안 된다
    expect(modelLabel('claude-opus-5')).not.toBe(modelLabel('claude-opus-5-5'))
  })

  it('CLI 실행파일에서 모델 이름을 주워 온다 (CLI 가 없으면 건너뜀)', async () => {
    const { execSync } = await import('node:child_process')
    let bin = ''
    try { bin = execSync('command -v claude', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* 없음 */ }
    if (!bin) { console.log('  (건너뜀) claude CLI 없음'); return }
    const { modelsFromBinary } = await import('../../src/host/auth')
    const found = modelsFromBinary(bin)
    expect(found.length, '실행파일에서 하나도 못 주웠다').toBeGreaterThan(3)
    expect(found).toContain('claude-opus-5-5')                    // 도움말만 긁던 종전 방식으로는 안 나오던 것
    expect(modelsFromBinary(bin)).toBe(found)                     // 두 번째는 캐시 (200MB 를 다시 안 읽는다)
  })
})

describe('AI · 첫 목록은 호스트 CLI 가 아는 것에서 (2026-09-24)', () => {
  it('종류별 **가장 최신 하나씩**만 첫 목록, 나머지는 더 많은 모델', async () => {
    const { splitModels } = await import('../../src/core/agents')
    const { first, more } = splitModels([
      'claude-opus-5', 'claude-opus-5-5', 'claude-opus-4-8',
      'claude-fable-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5',
    ])
    expect(first.map((m) => m.v)).toEqual(['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5'])
    expect(first.map((m) => m.t)).toEqual(['Fable 5.1', 'Opus 5.5', 'Sonnet 5', 'Haiku 4.5'])
    expect(more.map((m) => m.v)).toContain('claude-opus-5')
    expect(more.map((m) => m.v)).toContain('claude-opus-4-8')
    expect(more.map((m) => m.v)).not.toContain('claude-opus-5-5')   // 첫 목록과 겹치지 않는다
  })

  it('🔴 호스트 CLI 가 낡아 Opus 5.5 를 모르면 **목록에 안 뜬다** — 고를 수 없는 것을 보여 주면 400 이 난다', async () => {
    const { splitModels } = await import('../../src/core/agents')
    const old = splitModels(['claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5'])
    expect(old.first.map((m) => m.v)).toEqual(['claude-opus-5', 'claude-sonnet-5'])
    expect(old.first.map((m) => m.v)).not.toContain('claude-opus-5-5')
  })

  it('5 와 5.5 의 차례를 숫자로 센다 — 글자 순서로 세면 5.5 가 5 보다 앞선다', async () => {
    const { splitModels, modelTitle, modelParts } = await import('../../src/core/agents')
    expect(splitModels(['claude-opus-5-5', 'claude-opus-5']).first[0].v).toBe('claude-opus-5-5')
    expect(splitModels(['claude-opus-5', 'claude-opus-5-5']).first[0].v).toBe('claude-opus-5-5')
    expect(splitModels(['claude-opus-4-10', 'claude-opus-4-9']).first[0].v).toBe('claude-opus-4-10')
    expect(modelTitle('claude-haiku-4-5')).toBe('Haiku 4.5')
    expect(modelParts('claude-opus-5-5-20260401')).toEqual({ fam: 'opus', ver: [5, 5] })
    expect(modelParts('<synthetic>')).toBeNull()
  })

  it('사람이 붙인 설명은 살린다', async () => {
    const { splitModels } = await import('../../src/core/agents')
    const { first } = splitModels(['claude-sonnet-5', 'claude-haiku-4-5'])
    expect(first.find((m) => m.v === 'claude-sonnet-5')?.d).toBe('빠름')
  })
})
