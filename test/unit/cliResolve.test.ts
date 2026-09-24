import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { providerBin, forgetProviders } from '../../src/host/providers'
import { claudeBin } from '../../src/host/session'

/**
 * 🔴 **AT · 판을 확인하는 claude 와 턴을 띄우는 claude 가 같아야 한다** (2026-09-25 Dave: *«무조건 모델이나
 *    실행환경에서의 claude 버전만 확인하면 되는거 아니야?»*).
 * 실제 사고: 미니에 claude 가 두 벌(2.1.278 · 2.1.281). 목록은 `providers()`(가장 새 판)로 만들어 Opus 5.5 를
 * 내줬는데, 턴은 `claudeBin()`(먼저 있는 경로 = 2.1.278)으로 띄워 **400 · does not support this model** 이 났다.
 * 확인한 것과 실행한 것이 달랐다 — 이 검사는 둘이 **늘 같은 파일**을 가리키는지 잰다.
 */
let dir = ''
const fake = (name: string, ver: string) => {
  const d = join(dir, name); mkdirSync(d, { recursive: true })
  const f = join(d, 'claude'); writeFileSync(f, `#!/bin/sh\necho "${ver} (Claude Code)"\n`); chmodSync(f, 0o755)
  return f
}
const saved = { bin: process.env.FOLDERBOT_CLI_BIN, cands: process.env.FOLDERBOT_CLAUDE_CANDIDATES }
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fb-cli-')); delete process.env.FOLDERBOT_CLI_BIN; forgetProviders() })
afterEach(() => {
  rmSync(dir, { recursive: true, force: true }); forgetProviders()
  if (saved.bin === undefined) delete process.env.FOLDERBOT_CLI_BIN; else process.env.FOLDERBOT_CLI_BIN = saved.bin
  if (saved.cands === undefined) delete process.env.FOLDERBOT_CLAUDE_CANDIDATES; else process.env.FOLDERBOT_CLAUDE_CANDIDATES = saved.cands
})

describe('AT · 확인하는 claude = 실행하는 claude', () => {
  it('🔴 낡은 판이 먼저 있어도 턴은 새 판으로 띄운다 — 미니에서 난 400 그대로', () => {
    const old = fake('local', '2.1.278'), neu = fake('npm', '2.1.281')
    process.env.FOLDERBOT_CLAUDE_CANDIDATES = [old, neu].join(':')      // 종전 순서: ~/.local 이 먼저
    expect(providerBin('claude')).toBe(neu)
    expect(claudeBin()).toBe(neu)                                         // 종전: old 를 집었다
  })
  it('새 판이 먼저 있으면 그것 — 둘은 언제나 같은 파일', () => {
    const neu = fake('local', '2.1.290'), old = fake('npm', '2.1.278')
    process.env.FOLDERBOT_CLAUDE_CANDIDATES = [neu, old].join(':')
    expect(claudeBin()).toBe(providerBin('claude'))
    expect(claudeBin()).toBe(neu)
  })
  it('사람이 정해 준 경로(설정·환경변수)는 그대로 이긴다', () => {
    const a = fake('a', '2.1.278'), b = fake('b', '2.1.281')
    process.env.FOLDERBOT_CLAUDE_CANDIDATES = [a, b].join(':')
    expect(claudeBin(a)).toBe(a)
    process.env.FOLDERBOT_CLI_BIN = a
    expect(claudeBin()).toBe(a)
  })
})
