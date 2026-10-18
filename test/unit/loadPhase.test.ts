import { describe, it, expect } from 'vitest'
import { chatPhase, nextPhaseIn, FADE_HOLD_MS, SKEL_AFTER_MS, SYNC_DOT_AFTER_MS } from '../../src/core/loadPhase'

/** CF · 로딩·전환 (2026-10-19 Dave «전부 A» · 목업 03_디자인/2026-10-12_로딩-전환-목업) — 시각 문턱 */
describe('CF · chatPhase', () => {
  it('받았으면 ready', () => { expect(chatPhase(false, true, 9999)).toBe('ready'); expect(chatPhase(false, false, 0)).toBe('ready') })
  it('② 옛 대화가 없으면 150ms 안에는 아무것도 안 띄우고(깜빡임 방지) 그 뒤 회색 줄', () => {
    expect(SKEL_AFTER_MS).toBe(150)
    expect(chatPhase(true, false, 0)).toBe('blank')
    expect(chatPhase(true, false, 149)).toBe('blank')
    expect(chatPhase(true, false, 150)).toBe('skel')
  })
  it('④ 옛 대화가 있으면 0.4초까지 흐리게 남기고, 넘기면 회색 줄', () => {
    expect(FADE_HOLD_MS).toBe(400)
    expect(chatPhase(true, true, 0)).toBe('fade')
    expect(chatPhase(true, true, 399)).toBe('fade')
    expect(chatPhase(true, true, 400)).toBe('skel')
  })
  it('다음 단계까지 남은 시간 — 넘어간 뒤로는 타이머를 안 건다', () => {
    expect(nextPhaseIn(true, true, 100)).toBe(300)
    expect(nextPhaseIn(true, false, 100)).toBe(50)
    expect(nextPhaseIn(true, true, 500)).toBeNull()
    expect(nextPhaseIn(false, true, 0)).toBeNull()
  })
  it('⑤ «맞추는 중» 은 0.4초 안에 끝나면 안 띄운다', () => { expect(SYNC_DOT_AFTER_MS).toBe(400) })
})
