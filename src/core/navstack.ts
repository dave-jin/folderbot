/**
 * Z-2 · 쓸기를 «고정 기능» 이 아니라 «온 길» 로 (2026-09-22 Dave 확정 — **A Safari 모델**).
 *
 * 🔴 **고친 것** — 종전에는 화면이 [목록 | 채팅 | 오른쪽] 세 칸이고 **폴더와 문서가 「오른쪽」 한 칸을 같이** 썼다
 *    (`drawer.ts` 의 band). 그래서 ① 문서에서 👉 하면 폴더를 건너뛰고 ② 채팅에서 👈 는 «마지막에 본 쪽» 으로 가고
 *    ③ 문서의 [뒤로] 는 폴더로, 쓸기는 채팅으로 가서 **한 앱에 두 모델이 공존**했다.
 *
 * 🔴 **이제 기준은 하나다 — 사람이 온 길.** 👉 = 뒤로(한 걸음 되돌아감) · 👈 = 앞으로(방금 한 뒤로를 무름).
 *    [뒤로] 버튼·스크림 탭·Esc 도 **같은 `back` 하나**를 부른다. 칸이라는 개념 자체를 없앤다.
 */
export type Page = 'list' | 'chat' | 'panel' | 'doc'
/** `stack` 의 맨 뒤가 지금 보는 쪽이고 **절대 비지 않는다**. `fwd` 의 맨 뒤가 👈 로 갈 곳 */
export type Nav = { stack: Page[]; fwd: Page[] }

export const ROOT: Page = 'list'
export function navInit(hasBot: boolean): Nav { return hasBot ? { stack: [ROOT, 'chat'], fwd: [] } : { stack: [ROOT], fwd: [] } }
export function curOf(n: Nav): Page { return n.stack[n.stack.length - 1] }
export function canBack(n: Nav): boolean { return n.stack.length > 1 }
export function canFwd(n: Nav): boolean { return n.fwd.length > 0 }

/**
 * 어느 쪽으로 간다 — **이미 온 길 위에 있으면 «거기까지 뒤로»** 이고(지나온 쪽은 앞으로 목록에 쌓인다),
 * 처음 가는 쪽이면 **한 걸음 더 들어간다**(앞으로 목록은 버린다. 브라우저와 같다).
 */
export function goTo(n: Nav, p: Page): Nav {
  if (curOf(n) === p) return n
  const i = n.stack.indexOf(p)
  if (i >= 0) return { stack: n.stack.slice(0, i + 1), fwd: [...n.fwd, ...n.stack.slice(i + 1).reverse()] }
  return { stack: [...n.stack, p], fwd: [] }
}
/** 한 걸음 뒤로 — 뿌리(봇 목록)에서는 아무 일도 없다 */
export function back(n: Nav): Nav { return canBack(n) ? { stack: n.stack.slice(0, -1), fwd: [...n.fwd, curOf(n)] } : n }
/** 방금 한 뒤로를 무른다 */
export function fwd(n: Nav): Nav { return canFwd(n) ? { stack: [...n.stack, n.fwd[n.fwd.length - 1]], fwd: n.fwd.slice(0, -1) } : n }

/**
 * 어두워진 채팅 탭 · Esc · [접기] — **«채팅으로 돌아간다»** 다. 「뒤로」와 다르다: 봇 목록은 뒤로 가서 열었으니 닫는 것은 앞이고,
 * 폴더·문서는 앞으로 가서 열었으니 닫는 것은 뒤다. 방금 한 뒤로를 무르는 참이면 `fwd` 를 써서 **온 길을 잃지 않는다**.
 */
export function dismiss(n: Nav): Nav {
  if (curOf(n) === 'chat') return n
  if (n.fwd[n.fwd.length - 1] === 'chat') return fwd(n)
  return goTo(n, 'chat')
}

/** 그 쪽이 화면 어디에 사나 — 채팅은 바닥(서랍 아님) · 봇 목록은 왼쪽 서랍 · 폴더와 문서는 오른쪽 서랍 */
export function sideOf(p: Page): 'left' | 'right' | null { return p === 'list' ? 'left' : p === 'chat' ? null : 'right' }

/**
 * 쓸기 한 번이 무엇을 하나. `dir` 은 손가락이 가는 쪽 — 👉 는 `'r'`(뒤로) · 👈 는 `'l'`(앞으로).
 * `mode` 는 **그림이 어떻게 움직이나**다 — 서랍이 나오면 `open`, 들어가면 `close`,
 * 오른쪽 서랍 안에서 폴더↔문서처럼 **내용만 바뀌면** `swap`(손가락을 따라 움직일 그림이 없다).
 * 갈 데가 없으면 `null`.
 */
export function swipeMove(n: Nav, dir: 'r' | 'l'): { next: Nav; to: Page; side: 'left' | 'right'; mode: 'open' | 'close' | 'swap' } | null {
  const after = dir === 'r' ? back(n) : fwd(n)
  if (after === n) return null
  const from = curOf(n), to = curOf(after)
  const a = sideOf(from), b = sideOf(to)
  if (a === null && b !== null) return { next: after, to, side: b, mode: 'open' }
  if (a !== null && b === null) return { next: after, to, side: a, mode: 'close' }
  return { next: after, to, side: (b ?? a)!, mode: 'swap' }
}
