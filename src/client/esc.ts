import { useEffect, useRef } from 'react'

/**
 * ⎋ 로 닫기 — **한 곳에서, 맨 위에 뜬 것 하나만** (2026-11-13 · UX/UI 정리 «고장 여덟»).
 *
 * 종전에는 창마다 `window` 에 keydown 을 따로 걸었다. 그래서 둘이 생겼다(11/12 리뷰 실측).
 * ① 걸기를 잊은 창은 ⎋ 로 안 닫혔다 — 알림 · 세션 정리 · 루틴 편집 · 단축키 · 확인창 · 뒤에서 도는 일 시트 …
 *    (세션 정리는 툴팁이 «닫기 ⎋» 라고 약속하고 있었다).
 * ② 창 위에 창이 뜨면 ⎋ 한 번에 **둘 다** 닫혔다 — 듣는 쪽이 서로를 모른다.
 *
 * 그래서 뜬 것들이 여기 한 줄(스택)에 선다. ⎋ 는 **맨 나중에 선 것 하나**에게만 간다.
 * - 창 · 시트 · 떠 있는 메뉴(`Float`)가 뜰 때 `useEsc(닫는 함수)` 를 부른다. 사라지면 저절로 빠진다.
 * - 안쪽 입력칸이 ⎋ 를 먼저 쓰면(이름 고치기 취소 등) `preventDefault()` 를 불러 둔다 — 그 ⎋ 는 창을 닫지 않는다.
 * - 처리한 ⎋ 에는 `preventDefault()` 표식을 남긴다 — 대화 열의 «⎋ 로 턴 멈추기»(App) 가 같은 ⎋ 로 돌지 않는다.
 *
 * 🔴 창에 `window.addEventListener('keydown', … 'Escape' …)` 를 새로 걸지 않는다 — 여기를 쓴다.
 * ⚠ 듣는 귀는 **모듈을 읽을 때 한 번** 건다. 부품의 effect 보다 먼저 걸려 있어야 같은 ⎋ 를 듣는 다른 귀(폰 화면 닫기 등)가
 *    `defaultPrevented` 로 «이미 처리됐다» 를 볼 수 있다.
 * ⚠ 입력창의 팝오버(모드 · 모델 · 노력 — `App.tsx` `pop`)는 숫자 키와 묶여 있어 제 귀를 그대로 쓴다.
 *    그 귀도 `defaultPrevented` 를 본다 — 안 보면 팝오버 위에 뜬 창을 닫는 ⎋ 한 번에 팝오버까지 닫힌다(2026-11-13 검토).
 */
type Closer = () => void
const stack: Closer[] = []

/** 한 줄에 선다 — 돌려주는 함수를 부르면 빠진다(두 번 불러도 남의 것을 건드리지 않는다) */
export function escPush(f: Closer): () => void {
  stack.push(f)
  return () => { const i = stack.lastIndexOf(f); if (i >= 0) stack.splice(i, 1) }
}

/** 지금 몇 개가 떠 있나 (검사용) */
export const escDepth = () => stack.length

/** ⎋ 하나를 맨 위에 뜬 것에게 넘긴다. 넘겼으면 true */
export function escKey(e: Pick<KeyboardEvent, 'key' | 'isComposing' | 'defaultPrevented' | 'preventDefault'>): boolean {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || !stack.length) return false
  e.preventDefault()
  stack[stack.length - 1]()
  return true
}

if (typeof window !== 'undefined') window.addEventListener('keydown', escKey)

/** 떠 있는 동안 ⎋ 로 닫힌다. `on` 이 false 면 줄에 서지 않는다(늘 붙어 있다가 열릴 때만 그리는 호스트용) */
export function useEsc(onClose: Closer, on = true): void {
  const ref = useRef(onClose); ref.current = onClose
  useEffect(() => { if (!on) return; return escPush(() => ref.current()) }, [on])
}
