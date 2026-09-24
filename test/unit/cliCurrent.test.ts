import { describe, it, expect } from 'vitest'
import { cliNeedsUpdate, currentCliVersion, requiredCliVersion, cliTooOld } from '../../src/core/cliUpdate'

/** AS (2026-09-25 Dave · 스크린샷_046) — 오류 글 하나로 「업데이트가 필요하다」를 판정할 수 있어야 한다. */
const MSG = "API Error: 400 Claude Code 2.1.278 does not support this model; version 2.1.280 or newer is required. Run 'claude update', or update the Claude desktop app, then try again."

describe('AS · 오류 글에서 지금 판을 읽는다', () => {
  it('🔴 글 하나로 두 판이 다 나온다 — 밖에 물어보지 않아도 판정된다', () => {
    expect(currentCliVersion(MSG)).toBe('2.1.278')
    expect(requiredCliVersion(MSG)).toBe('2.1.280')
    expect(cliTooOld(currentCliVersion(MSG), requiredCliVersion(MSG))).toBe(true)
  })
  it('🔴 «물어본 값이 없어서» 띠가 안 뜨던 것이 이것으로 메워진다', () => {
    expect(cliTooOld(null, requiredCliVersion(MSG))).toBe(false)              // 종전: 조용히 안 뜸
    const fromApi: string | null = null                                    // 물어봤는데 비어서 온 경우
    expect(cliTooOld(fromApi ?? currentCliVersion(MSG), requiredCliVersion(MSG))).toBe(true)
  })
  it('판 얘기가 없는 글에서는 아무것도 지어내지 않는다', () => {
    expect(currentCliVersion('그냥 오류입니다')).toBe(null)
    expect(currentCliVersion('')).toBe(null)
    expect(currentCliVersion(null)).toBe(null)
  })
})

describe('AS · 띠를 띄울지 한 곳에서 정한다', () => {
  it('🔴 물어본 판이 비어도 띤다 — 이것이 배포까지 간 고장이다', () => {
    const r = cliNeedsUpdate(null, ['방금 보냈어요', MSG])
    expect(r.old).toBe(true)
    expect(r.now).toBe('2.1.278')
    expect(r.need).toBe('2.1.280')
  })
  it('물어본 판이 있으면 그것을 쓴다(호스트가 그 사이 올렸을 수 있다)', () => {
    const r = cliNeedsUpdate('2.1.281 (Claude Code)', [MSG])
    expect(r.old).toBe(false)
    expect(r.now).toBe('2.1.281 (Claude Code)')
  })
  it('판 얘기가 없으면 띠를 띄우지 않는다 — 없는 고장을 만들지 않는다', () => {
    expect(cliNeedsUpdate('2.1.278', ['그냥 오류', null, '']).old).toBe(false)
    expect(cliNeedsUpdate(null, []).old).toBe(false)
  })
})
