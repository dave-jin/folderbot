/**
 * V · 알약 독의 자리 (2026-09-22 Dave: *«잡은 상태로 위아래로 드래그해 올리거나 내리는 기능도 있으면 좋겠어»*).
 *
 * 🔴 **독은 화면 밖으로 못 나간다.** 손가락은 끝까지 끌 수 있고 화면 높이는 기기마다 다르므로,
 *    자리를 저장하되 **그릴 때마다 다시 가둔다**(저장값은 비율이 아니라 px 이고, 작은 화면에서 열면 밖으로 나간다).
 * 🔴 **자리는 위쪽 여백(px)이 아니라 «가운데를 기준으로 얼마나»** 로 둔다 — 창 높이가 바뀌어도(키보드·회전)
 *    독이 화면 한가운데 언저리에 남는다. 0 이 기본(정가운데)이고 음수면 위, 양수면 아래.
 */
export const DOCK_MARGIN = 12
/** 끌린 만큼(dy)을 더해 새 오프셋을 내고, 화면 안으로 가둔다 */
export function clampDockOffset(offset: number, viewportH: number, dockH: number, margin = DOCK_MARGIN): number {
  const half = Math.max(0, (viewportH - dockH) / 2 - margin)
  if (!Number.isFinite(offset)) return 0
  return Math.max(-half, Math.min(half, offset))
}
/** 저장값 읽기 — 못 읽거나 숫자가 아니면 가운데 */
export function readDockOffset(raw: string | null): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
/** 끌기가 «자리 옮기기» 였나, 그냥 «탭» 이었나 — 6px 를 넘겨야 옮긴 것으로 본다(탭이 죽으면 안 된다) */
export const DOCK_DRAG_MIN = 6
export function isDockDrag(dy: number): boolean { return Math.abs(dy) >= DOCK_DRAG_MIN }
