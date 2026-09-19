import { useEffect, useState } from 'react'

/**
 * 폰 «쓸어서 처리» (V16, Dave 승인 2026-09-13) — 행에 붙어 있던 도구 아이콘 대신 좌·우 × 짧게·길게 네 동작.
 * 설정에서 각 자리에 무엇을 놓을지 고른다. 판정과 기본값은 여기 한 곳에만 있다(화면은 결과만 그린다).
 */
export type SwipeAct = 'edit' | 'done' | 'menu' | 'delete' | 'delegate' | 'expand' | 'none' | 'pin' | 'unlink' | 'retire'
export type SwipeSlot = 'rightShort' | 'rightLong' | 'leftShort' | 'leftLong'
export type SwipeCfg = Record<SwipeSlot, SwipeAct> & { haptics: boolean }

export const SWIPE_DEFAULT: SwipeCfg = { rightShort: 'edit', rightLong: 'done', leftShort: 'menu', leftLong: 'delete', haptics: true }
/**
 * 폰 홈 **폴더 행** 쓸기 (2026-09-18 Dave: «모바일 화면에서 todo 처럼 슬라이딩으로 기본값 고정해서») —
 * 데스크톱 레일 우클릭의 세 가지(맨 위에 고정 · 지우기(연결 해지) · 은퇴)를 폰에서는 쓸어서 한다.
 * ⛔ 자리는 **고정**이다 — 설정에 노출하지 않는다. 짧게·길게 오른쪽은 둘 다 고정(가장 자주 하는 일 · 되돌리기 쉬움),
 *    왼쪽 짧게는 메뉴(세 가지 전부), 왼쪽 길게만 은퇴(확인창을 거친다). 지우기(연결 해지)는 메뉴에서만 — 쓸기 한 번에
 *    레일에서 사라지는 일은 두지 않는다.
 */
export const FOLDER_SWIPE: SwipeCfg = { rightShort: 'pin', rightLong: 'pin', leftShort: 'menu', leftLong: 'retire', haptics: true }
/** 임계 — 행 너비의 몇 %를 넘어야 «짧게»·«길게» 가 예고되나 */
export const SHORT = 0.25, LONG = 0.45

export const ACT_LABEL: Record<SwipeAct, string> = { edit: '편집', done: '완료', menu: '메뉴', delete: '삭제', delegate: '맡기기', expand: '펼치기', none: '없음', pin: '고정', unlink: '지우기', retire: '은퇴' }
export const ACT_ICON: Record<SwipeAct, string> = { edit: 'edit', done: 'check', menu: 'more', delete: 'x', delegate: 'sub', expand: 'chevd', none: 'x', pin: 'pin', unlink: 'x', retire: 'archive' }
/** 예고 색 — 무엇이 일어날지 손을 떼기 전에 색으로 먼저 말한다 */
export const ACT_COLOR: Record<SwipeAct, string> = { edit: '#4a90d9', done: 'var(--done)', menu: '#8b7fd4', delete: 'var(--err)', delegate: '#d9a13f', expand: 'var(--t3)', none: 'transparent', pin: '#4a90d9', unlink: 'var(--err)', retire: '#d9a13f' }

/** 지금 끌린 거리(px)와 행 너비로 어느 자리인지 — 넘지 못했으면 null(놓으면 제자리) */
export function slotOf(dx: number, width: number): SwipeSlot | null {
  const r = Math.abs(dx) / Math.max(1, width)
  if (r < SHORT) return null
  const long = r >= LONG
  return dx > 0 ? (long ? 'rightLong' : 'rightShort') : long ? 'leftLong' : 'leftShort'
}
/**
 * 폰 화면 넘기기 (2026-09-17 Dave: «화면을 눌러서 오른쪽으로 슬라이딩하면 뒤로 가기, 왼쪽으로 슬라이딩하면 폴더로 이동»).
 * 🔴 **가로가 세로를 분명히 이겨야 한다** — 대화는 세로로 스크롤하는 화면이라, 비스듬한 스크롤을 넘기기로 읽으면
 *    글을 읽다가 화면이 날아간다. 세로의 1.6배 이상 가로로 움직였고, 72px 또는 화면 폭의 22% 를 넘어야 한다.
 * @returns 'back'(오른쪽으로 끌었다 = 뒤로) · 'panel'(왼쪽으로 = 이 폴더에서) · null(아무것도 아님)
 */
export const NAV_MIN_PX = 72, NAV_MIN_RATIO = 0.22, NAV_DOMINANCE = 1.6
export function navOf(dx: number, dy: number, width: number): 'back' | 'panel' | null {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax < Math.max(NAV_MIN_PX, width * NAV_MIN_RATIO)) return null
  if (ax < ay * NAV_DOMINANCE) return null
  return dx > 0 ? 'back' : 'panel'
}
/** 그 자리에 놓인 동작 — 'none' 이면 아무 일도 없다(예고도 안 한다) */
export function actOf(cfg: SwipeCfg, slot: SwipeSlot | null): SwipeAct | null {
  if (!slot) return null
  const a = cfg[slot]
  return a === 'none' ? null : a
}

export function readSwipe(): SwipeCfg {
  try { return { ...SWIPE_DEFAULT, ...(JSON.parse(localStorage.getItem('fb:swipe') ?? '{}') as Partial<SwipeCfg>) } } catch { return SWIPE_DEFAULT }
}
export function useSwipeCfg(): [SwipeCfg, (c: SwipeCfg) => void] {
  const [cfg, set] = useState<SwipeCfg>(readSwipe)
  useEffect(() => { const f = () => set(readSwipe()); window.addEventListener('fb:swipecfg', f); return () => window.removeEventListener('fb:swipecfg', f) }, [])
  const save = (c: SwipeCfg) => { localStorage.setItem('fb:swipe', JSON.stringify(c)); set(c); window.dispatchEvent(new Event('fb:swipecfg')) }
  return [cfg, save]
}
export function buzz(on: boolean, ms = 12): void { if (on && typeof navigator !== 'undefined' && navigator.vibrate) try { navigator.vibrate(ms) } catch { /* 무시 */ } }
