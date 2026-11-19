import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

type Rect = { x?: number; y?: number; width: number; height: number }
const require_ = createRequire(import.meta.url)
const W = require_('../../desktop/macWindows.js') as {
  frontAfterModeChange: (mode: 'same' | 'window', openIds: string[], frontId: string) => { keep: string[]; close: string[] }
  trayOpenTarget: (lastFrontId: string, openIds: string[], activeId: string) => string
  boundsFor: (winByMac: Record<string, Rect>, id: string, displays: { workArea: Rect & { x: number; y: number } }[]) => Rect
  needsReload: (winUrl: string, macUrl: string) => boolean
}
const MAIN = { workArea: { x: 0, y: 25, width: 1800, height: 1100 } }

describe('macWindows — 맥마다 창', () => {
  it('맥마다 창 → 같은 창: 앞 창만 남긴다', () => expect(W.frontAfterModeChange('same', ['A', 'B', 'C'], 'B')).toEqual({ keep: ['B'], close: ['A', 'C'] }))
  it('같은 창 → 맥마다 창: 아무것도 안 닫는다', () => expect(W.frontAfterModeChange('window', ['A'], 'A')).toEqual({ keep: ['A'], close: [] }))
  it('앞 창을 모르면 첫 창을 남긴다', () => expect(W.frontAfterModeChange('same', ['A', 'B'], 'Z')).toEqual({ keep: ['A'], close: ['B'] }))
  it('열린 창이 없으면 빈 값', () => expect(W.frontAfterModeChange('same', [], 'A')).toEqual({ keep: [], close: [] }))
  it('트레이 «열기» 는 마지막 앞 창', () => expect(W.trayOpenTarget('B', ['A', 'B'], 'A')).toBe('B'))
  it('마지막 앞 창이 닫혔으면 지금 맥', () => expect(W.trayOpenTarget('B', ['A'], 'A')).toBe('A'))
  it('맥 창 자리는 맥마다 기억한다', () => expect(W.boundsFor({ A: { x: 10, y: 40, width: 1000, height: 700 }, B: { x: 300, y: 200, width: 900, height: 600 } }, 'B', [MAIN])).toEqual({ x: 300, y: 200, width: 900, height: 600 }))
  it('처음 여는 맥 창은 다른 창에서 28px 비켜 뜬다', () => expect(W.boundsFor({ A: { x: 10, y: 40, width: 1000, height: 700 } }, 'B', [MAIN])).toEqual({ x: 38, y: 68, width: 1000, height: 700 }))
  it('기억이 하나도 없으면 기본 크기', () => expect(W.boundsFor({}, 'B', [MAIN])).toEqual({ width: 1280, height: 860 }))
})

describe('macWindows — 그 맥 창이 다른 화면에 가 있으면 다시 연다', () => {
  it('연결 화면(file://)에 가 있으면 다시', () => expect(W.needsReload('file:///x/connect.html?focus=A', 'http://a:7373')).toBe(true))
  it('그 맥 화면이면 그대로', () => expect(W.needsReload('http://a:7373/#bot=x', 'http://a:7373')).toBe(false))
  it('빈 창이면 다시', () => expect(W.needsReload('', 'http://a:7373')).toBe(true))
})
