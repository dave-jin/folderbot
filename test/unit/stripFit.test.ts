import { describe, expect, it } from 'vitest'
import { fitTabs, hiddenDot } from '../../src/core/stripFit'

describe('세션 줄 — 한 줄에 몇 개를 세울지', () => {
  it('다 들어가면 전부 세운다(«＋N» 자리는 쓰지 않는다)', () => {
    expect(fitTabs([100, 100, 100], 300, 70, 0)).toEqual([0, 1, 2])
  })
  it('넘치면 «＋N» 자리를 빼고 앞에서부터 채운다', () => {
    // 폭 500 - 단추 70 = 430 → 100 넷
    expect(fitTabs([100, 100, 100, 100, 100, 100], 500, 70, 0)).toEqual([0, 1, 2, 3])
  })
  it('지금 보는 탭이 가려질 자리에 있으면 보이는 마지막 자리와 바꾼다', () => {
    expect(fitTabs([100, 100, 100, 100, 100, 100], 500, 70, 5)).toEqual([0, 1, 2, 5])
  })
  it('지금 보는 탭이 넓으면 들어갈 때까지 뒤에서부터 뺀다', () => {
    // 430 안에 100·100·100·100 → 지금 보는 탭 160 을 넣으려면 둘을 빼야 한다
    expect(fitTabs([100, 100, 100, 100, 160], 500, 70, 4)).toEqual([0, 1, 4])
  })
  it('폭이 탭 하나보다 좁아도 지금 보는 탭은 세운다', () => {
    expect(fitTabs([120, 120, 120], 80, 70, 1)).toEqual([1])
    expect(fitTabs([120, 120, 120], 0, 70, -1)).toEqual([0])
  })
  it('탭이 없으면 빈 목록', () => {
    expect(fitTabs([], 300, 70, -1)).toEqual([])
  })
  it('순서는 바뀌지 않는다', () => {
    const v = fitTabs([90, 90, 90, 90, 90, 90, 90], 400, 60, 6)
    expect([...v].sort((a, b) => a - b)).toEqual(v)
    expect(v).toContain(6)
  })
})

describe('세션 줄 — 가려진 세션의 점', () => {
  it('내 답 기다림 › 일하는 중 › 안 읽음', () => {
    expect(hiddenDot(['', 'unread', 'run', 'wait'])).toBe('wait')
    expect(hiddenDot(['unread', 'run'])).toBe('run')
    expect(hiddenDot(['', 'unread'])).toBe('unread')
    expect(hiddenDot(['', ''])).toBe('')
    expect(hiddenDot([])).toBe('')
  })
})
