/**
 * 이미지 뷰어의 수학 (M-1 · 2026-09-19) — 화면 좌표 `p` 아래에 있는 그림의 점을 **그 자리에 둔 채** 배율만 바꾼다.
 * 뷰 = translate(x, y) scale(s) (원점 0,0). 순수 함수라 화면(포인터·휠·키)이 어느 경로로 들어와도 같은 답이다.
 */
export interface View { s: number; x: number; y: number }
export const MIN_SCALE = 0.1
export const MAX_SCALE = 8

/** 상자에 맞는 배율 — 원본보다 작을 때만 줄인다(작은 그림을 늘리지 않는다) */
export function fitScale(iw: number, ih: number, bw: number, bh: number): number {
  if (!iw || !ih || !bw || !bh) return 1
  return Math.min(bw / iw, bh / ih, 1)
}
/** 배율 s 로 상자 가운데 */
export function centered(iw: number, ih: number, bw: number, bh: number, s: number): View {
  return { s, x: (bw - iw * s) / 2, y: (bh - ih * s) / 2 }
}
/** 화면 점(px,py) 아래의 그림 점을 고정한 채 배율을 factor 배 */
export function zoomAt(v: View, factor: number, px: number, py: number, min = MIN_SCALE, max = MAX_SCALE): View {
  const s = Math.max(min, Math.min(max, v.s * factor))
  if (s === v.s) return v
  const ux = (px - v.x) / v.s, uy = (py - v.y) / v.s
  return { s, x: px - ux * s, y: py - uy * s }
}
/** 그림이 상자보다 작은 축은 가운데로, 큰 축은 빈 틈이 안 보이게 */
export function clampView(v: View, iw: number, ih: number, bw: number, bh: number): View {
  const w = iw * v.s, h = ih * v.s
  const x = w <= bw ? (bw - w) / 2 : Math.min(0, Math.max(bw - w, v.x))
  const y = h <= bh ? (bh - h) / 2 : Math.min(0, Math.max(bh - h, v.y))
  return { s: v.s, x, y }
}
/** 두 손가락 사이 거리 */
export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y) }
