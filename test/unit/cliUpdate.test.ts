import { describe, expect, it } from 'vitest'
import { cliTooOld, cliUpdateLine, cmpCliVersion, requiredCliVersion } from '../../src/core/cliUpdate'

const REAL = 'Prompt is too long · automatic compaction failed: API Error: 400 Claude Code 2.1.278 does not support this model; version 2.1.280 or newer is required. Run \'claude update\', or update the Claude desktop app, then try again.'

describe('AJ · CLI 가 낡아서 나는 고장 (2026-09-24 Dave 스크린샷)', () => {
  it('🔴 실제로 난 오류 글에서 필요한 판을 읽는다', () => {
    expect(requiredCliVersion(REAL)).toBe('2.1.280')
    expect(cliTooOld('2.1.278', '2.1.280')).toBe(true)
    expect(cliTooOld('2.1.280', '2.1.280')).toBe(false)
    expect(cliTooOld('2.1.281', '2.1.280')).toBe(false)
  })
  it('엉뚱한 오류를 「업데이트 필요」로 읽지 않는다', () => {
    for (const s of ['', 'API Error: 429 rate limit', '파일이 없어요', 'version 2 or newer']) expect(requiredCliVersion(s)).toBeNull()
    expect(cliTooOld(null, '2.1.280')).toBe(false)
    expect(cliTooOld('2.1.278', null)).toBe(false)
  })
  it('판은 글자가 아니라 숫자로 센다 — 2.1.9 < 2.1.10', () => {
    expect(cmpCliVersion('2.1.9', '2.1.10')).toBeLessThan(0)
    expect(cmpCliVersion('2.2', '2.1.999')).toBeGreaterThan(0)
    expect(cmpCliVersion('2.1.280', '2.1.280')).toBe(0)
  })
  it('사람에게 보여 줄 한 줄', () => {
    expect(cliUpdateLine('2.1.278', '2.1.280')).toBe('Claude CLI 가 낡았어요 — 2.1.278 → 2.1.280 이상이 필요해요')
  })
})
