import { useEffect, useState } from 'react'

/**
 * 폰 «쓸어서 처리» (V16, Dave 승인 2026-09-13) — 행에 붙어 있던 도구 아이콘 대신 좌·우 × 짧게·길게 네 동작.
 * 설정에서 각 자리에 무엇을 놓을지 고른다. 판정과 기본값은 여기 한 곳에만 있다(화면은 결과만 그린다).
 */
export type SwipeAct = 'edit' | 'done' | 'menu' | 'delete' | 'delegate' | 'expand' | 'none'
export type SwipeSlot = 'rightShort' | 'rightLong' | 'leftShort' | 'leftLong'
export type SwipeCfg = Record<SwipeSlot, SwipeAct> & { haptics: boolean }

export const SWIPE_DEFAULT: SwipeCfg = { rightShort: 'edit', rightLong: 'done', leftShort: 'menu', leftLong: 'delete', haptics: true }
/** 임계 — 행 너비의 몇 %를 넘어야 «짧게»·«길게» 가 예고되나 */
export const SHORT = 0.25, LONG = 0.45

export const ACT_LABEL: Record<SwipeAct, string> = { edit: '편집', done: '완료', menu: '메뉴', delete: '삭제', delegate: '맡기기', expand: '펼치기', none: '없음' }
export const ACT_ICON: Record<SwipeAct, string> = { edit: 'edit', done: 'check', menu: 'more', delete: 'x', delegate: 'sub', expand: 'chevd', none: 'x' }
/** 예고 색 — 무엇이 일어날지 손을 떼기 전에 색으로 먼저 말한다 */
export const ACT_COLOR: Record<SwipeAct, string> = { edit: '#4a90d9', done: 'var(--done)', menu: '#8b7fd4', delete: 'var(--err)', delegate: '#d9a13f', expand: 'var(--t3)', none: 'transparent' }

/** 지금 끌린 거리(px)와 행 너비로 어느 자리인지 — 넘지 못했으면 null(놓으면 제자리) */
export function slotOf(dx: number, width: number): SwipeSlot | null {
  const r = Math.abs(dx) / Math.max(1, width)
  if (r < SHORT) return null
  const long = r >= LONG
  return dx > 0 ? (long ? 'rightLong' : 'rightShort') : long ? 'leftLong' : 'leftShort'
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
