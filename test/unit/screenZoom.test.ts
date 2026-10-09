import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

/** BP · ⌘+ · ⌘− · ⌘0 — 화면 확대 단계 (2026-10-09 Dave) */
const require_ = createRequire(import.meta.url)
const { STEPS, clampZoom, stepZoom, zoomPct } = require_('../../desktop/zoom.js') as {
  STEPS: number[]; clampZoom: (v: unknown) => number; stepZoom: (cur: unknown, dir: number) => number; zoomPct: (z: unknown) => number
}

describe('화면 확대 단계 (BP)', () => {
  it('브라우저와 같은 눈금으로 한 걸음씩 — 100 → 110 → 125, 100 → 90 → 80', () => {
    expect(stepZoom(1, 1)).toBe(1.1); expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.9); expect(stepZoom(0.9, -1)).toBe(0.8)
  })
  it('끝에서는 더 안 간다 · ⌘0 은 실제 크기', () => {
    expect(stepZoom(2, 1)).toBe(2); expect(stepZoom(0.67, -1)).toBe(0.67)
    expect(stepZoom(1.75, 0)).toBe(1)
  })
  it('눈금 사이 값이면 그 방향의 다음 눈금으로', () => {
    expect(stepZoom(1.3, 1)).toBe(1.5); expect(stepZoom(1.3, -1)).toBe(1.25)
  })
  it('저장값이 이상하면 1 · 범위 밖은 끝으로', () => {
    expect(clampZoom(undefined)).toBe(1); expect(clampZoom('x')).toBe(1); expect(clampZoom(-2)).toBe(1)
    expect(clampZoom(9)).toBe(STEPS.at(-1)); expect(clampZoom(0.1)).toBe(STEPS[0])
    expect(zoomPct(1.25)).toBe(125)
  })
})
