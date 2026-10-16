/**
 * 🔴 **CN · 폴더봇 몸 색은 사람이 고른다 · 주황은 오케스트레이터만** (2026-10-16 Dave: *«오케스트레이터 색깔이기도 하니까 그 색깔은
 *    고유 색상으로 지정하고 … 오케스트레이터 고유 색상만 제외하고 사용자가 원하는 대로 지정 및 변경 할 수 있으면 좋겠어»*).
 * 종전에는 봇을 켠 순서대로 10색을 돌려 줬다(뜻 없음). 상태는 얼굴 모서리 **배지**가 말하므로, 몸 색은 사람이 알아보는 표지다.
 * ⚠ 판은 12색 고정이다 — 자유 색(hex 입력)은 주황을 피하기 어렵고 어두운 화면에서 안 보이는 색이 나온다(기획안 §8).
 * ⚠ 앰버(`#e0a93e`)는 작은 크기에서 주황과 헷갈려 판에서 뺐다. 옛 앰버 봇은 호스트가 뜰 때 **한 번** 가장 덜 쓰인 색으로 옮긴다.
 */
export const ORCH_COLOR = '#e08850'
export const OLD_AMBER = '#e0a93e'
export const PALETTE: { hex: string; name: string }[] = [
  { hex: '#6ea6f7', name: '파랑' }, { hex: '#8fb8ff', name: '하늘' }, { hex: '#7d86f0', name: '남색' }, { hex: '#b18cf2', name: '보라' },
  { hex: '#d9a0ff', name: '라일락' }, { hex: '#f0a8c0', name: '분홍' }, { hex: '#3fc1c9', name: '청록' }, { hex: '#5fd3b5', name: '민트' },
  { hex: '#34c77b', name: '초록' }, { hex: '#9ad0a0', name: '세이지' }, { hex: '#f2c14e', name: '노랑' }, { hex: '#8a9bb0', name: '회청' },
]
export const PALETTE_HEX = PALETTE.map((p) => p.hex)

function hsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null
  const n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  return { h: (h + 360) % 360, s, l }
}
/** 오케스트레이터 주황 언저리인가 — 색상각 10–35° · 채도 높음. `.bot.yml` 에 손으로 적은 색도 이걸로 거른다 */
export function isOrchLike(hex: string): boolean {
  const c = hsl(hex); if (!c) return false
  return c.h >= 10 && c.h <= 35 && c.s >= 0.45 && c.l >= 0.35 && c.l <= 0.8
}
/** 사람이 고를 수 있는 색인가 — 판 안의 12색만 */
export function colorAllowed(hex: string): boolean {
  return PALETTE_HEX.includes(hex.toLowerCase())
}
/** 지금 쓰는 색들을 보고 가장 덜 쓰인 판 색 — 같으면 판 순서. 새 봇과 옛 앰버 옮기기가 쓴다 */
export function leastUsed(used: string[]): string {
  const n = new Map(PALETTE_HEX.map((h) => [h, 0]))
  for (const u of used) { const k = u.toLowerCase(); if (n.has(k)) n.set(k, n.get(k)! + 1) }
  let best = PALETTE_HEX[0]
  for (const h of PALETTE_HEX) if (n.get(h)! < n.get(best)!) best = h
  return best
}
