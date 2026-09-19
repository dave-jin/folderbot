/**
 * H · 반응형 3단계 + 쓸기 내비게이션 — 순수 판정 (2026-09-19 Dave 시안 확정).
 *
 * 🔴 **어느 단계인지는 창 폭으로만 정한다.** 「폰이냐」는 따지지 않는다 — 맥북 창을 줄여도 같은 모습이어야 한다.
 *    넓음 ≥ 1200 · 중간 768–1199 · 좁음 < 768. 값은 시작점이고 배치·서랍·독 위치는 바꾸지 않는다.
 * 🔴 **화면은 [봇 레일 | 채팅 | 문서] 세 칸 띠**다. 쓸기는 띠를 한 칸 옮기고 반대로 쓸면 한 칸 돌아온다 — 건너뛰지 않는다
 *    (문서 보다가 봇을 바꾸려면 👉 두 번). 판정이 화면에 흩어지면 «두 가지 뜻» 이 생겨 못 배운다 — 여기 한 곳에만 둔다.
 */
export type Stage = 'wide' | 'mid' | 'narrow'
export const WIDE_MIN = 1200, MID_MIN = 768
export function stageOf(width: number): Stage { return width >= WIDE_MIN ? 'wide' : width >= MID_MIN ? 'mid' : 'narrow' }

/** 지금 보이는 칸 — 'chat' 은 서랍 없음 · 'left' 는 봇 레일이 덮임 · 'right' 는 문서/패널이 덮임 */
export type Cell = 'chat' | 'left' | 'right'
/** 👉(r) = 오른쪽으로 쓸기 · 👈(l) = 왼쪽으로 쓸기. 칸이 안 바뀌면 그대로 돌려준다 */
export function bandNext(cur: Cell, dir: 'r' | 'l'): Cell {
  if (cur === 'chat') return dir === 'r' ? 'left' : 'right'
  if (cur === 'left') return dir === 'l' ? 'chat' : 'left'
  return dir === 'r' ? 'chat' : 'right'
}

/** 첫 10px 로 방향을 잠근다 — **가로가 세로의 2배**를 넘어야 쓸기(H-3 ②). 아직 모르면 null */
export const LOCK_PX = 10, H_DOMINANCE = 2
export function lockOf(dx: number, dy: number): 'h' | 'v' | null {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax < LOCK_PX && ay < LOCK_PX) return null
  return ax > ay * H_DOMINANCE ? 'h' : 'v'
}

/** 놓았을 때 — 폭의 30% 를 넘게 끌었거나 빠르면(0.5px/ms · 24px 이상) 넘어간다, 아니면 되돌아간다 */
export const OPEN_RATIO = 0.3, FLICK_V = 0.5, FLICK_MIN_PX = 24
export function swipeVerdict(dx: number, dtMs: number, width: number): boolean {
  const ax = Math.abs(dx)
  if (ax >= width * OPEN_RATIO) return true
  return ax >= FLICK_MIN_PX && dtMs > 0 && ax / dtMs >= FLICK_V
}

/**
 * 쓸기를 **시작해도 되는가** (H-3 충돌 회피) — 손가락이 놓인 자리와 기기의 사정만 본다.
 * @param coarse    `pointer: coarse` 또는 터치 지점이 있는 기기 (트랙패드 두 손가락은 wheel 이라 애초에 안 온다)
 * @param selecting 글을 고르는 중(선택이 비어 있지 않다)
 * @param inInput   입력칸·칩·발판·메뉴 위에서 시작
 * @param consumeX  가로로 움직이는 요소(코드 블록·표·확대 이미지·쓸리는 행) 위에서 시작
 */
export function canStartSwipe(o: { coarse: boolean; selecting: boolean; inInput: boolean; consumeX: boolean }): boolean {
  return o.coarse && !o.selecting && !o.inInput && !o.consumeX
}

/**
 * 가로로 스크롤되는 요소가 **그 방향으로 더 갈 수 있으면** 그 요소가 먹는다(H-3 ①). 끝까지 갔으면 서랍 차례다.
 * @param dir 손가락이 가는 방향 — 'l' 이면 내용은 오른쪽 끝을 향해 스크롤된다
 */
export function scrollableEats(el: { scrollWidth: number; clientWidth: number; scrollLeft: number }, dir: 'l' | 'r'): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false
  return dir === 'l' ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0
}

/** 끌리는 동안 서랍이 어디 있나 — 0(닫힘) … 1(열림). 여는 중이면 dx 만큼, 닫는 중이면 1 에서 dx 만큼 */
export function dragProgress(cur: Cell, side: 'left' | 'right', dx: number, drawerW: number): number {
  const opening = cur === 'chat'
  const toward = side === 'left' ? dx : -dx   // 왼쪽 서랍은 오른쪽으로 끌어 열고, 오른쪽 서랍은 왼쪽으로 끌어 연다
  const p = opening ? toward / drawerW : 1 + toward / drawerW
  return Math.max(0, Math.min(1, p))
}
/** 쓸기 방향과 현재 칸으로 **움직일 서랍**과 그 결과 칸 — 움직일 게 없으면 null (레일이 열린 채 또 👉 처럼) */
export function swipeTarget(cur: Cell, dir: 'r' | 'l'): { side: 'left' | 'right'; next: Cell } | null {
  const next = bandNext(cur, dir); if (next === cur) return null
  return { side: cur === 'chat' ? (next === 'left' ? 'left' : 'right') : cur === 'left' ? 'left' : 'right', next }
}
