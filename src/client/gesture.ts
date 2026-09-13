/**
 * 폰 목록 제스처 — 손가락 하나로 «쓸기 · 집기 · 스크롤» 세 가지를 가른다 (V19, 2026-09-13 Dave 승인분).
 * 판정이 화면 곳곳에 흩어지면 셋이 서로를 잡아먹는다. 여기 순수 함수 한 곳에만 둔다.
 *
 * · 0.35초 안에 **가로로 10px** → 쓸기 (길게 누르기 취소)
 * · 안 움직이고 **0.35초** 지남 → 집기 (그 뒤 가로 움직임은 무시)
 * · **세로로 먼저** 움직임 → 목록 스크롤 (둘 다 취소)
 */
export type Phase = 'none' | 'swipe' | 'drag' | 'scroll'
/** 길게 누르기 문턱 — 이 시간이 지나야 집힌다 */
export const HOLD_MS = 350
/** 쓸기·스크롤로 인정하는 최소 움직임(px) */
export const SLOP = 10

/**
 * 지금 무엇을 하는 중인가. `held` 는 «길게 누르기 시계가 이미 울렸나».
 * 한 번 정해진 국면은 바깥에서 고정한다 — 여기서는 «지금 값으로 보면 무엇인가» 만 답한다.
 */
export function decide(dx: number, dy: number, held: boolean): Phase {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (held) return 'drag'                        // 이미 집혔으면 가로로 흔들어도 집은 채로
  if (ay > ax && ay >= SLOP) return 'scroll'     // 세로가 먼저면 목록에 양보
  if (ax >= SLOP) return 'swipe'
  return 'none'
}

/** 끄는 동안 손가락이 어느 줄 위에 있나 — 줄의 세로 중심과 비교한다. 없으면 맨 끝 */
export function dropIndex(centers: number[], y: number): number {
  for (let i = 0; i < centers.length; i++) if (y < centers[i]) return i
  return centers.length
}
