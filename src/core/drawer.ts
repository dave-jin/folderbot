/**
 * H · 반응형 3단계 + 쓸기 내비게이션 — 순수 판정 (2026-09-19 Dave 시안 확정).
 *
 * 🔴 **어느 단계인지는 창 폭으로만 정한다.** 「폰이냐」는 따지지 않는다 — 맥북 창을 줄여도 같은 모습이어야 한다.
 *    넓음 ≥ 1200 · 중간 768–1199 · 좁음 < 768. 값은 시작점이고 배치·서랍·독 위치는 바꾸지 않는다.
 * 🔴 **어디로 가는지는 여기가 정하지 않는다** — 2026-09-22(Z-2)에 세 칸 띠(band)를 버리고 «온 길(스택)» 로 갔다.
 *    목적지는 `core/navstack.ts` 하나가 정하고, 이 파일은 **손가락을 읽는 일**(방향 잠금 · 넘길지 말지 · 그림 위치)만 맡는다.
 */
export type Stage = 'wide' | 'mid' | 'narrow'
export const WIDE_MIN = 1200, MID_MIN = 768
export function stageOf(width: number): Stage { return width >= WIDE_MIN ? 'wide' : width >= MID_MIN ? 'mid' : 'narrow' }

/**
 * AH · **쓸기는 맨 왼쪽 가장자리에서만 시작한다** (2026-09-24 Dave: *«할 일 같은 경우에는 슬라이드가 조금 겹치는
 * 동작이 있어 · 정말 맨 왼쪽 끝에서 잡아서 당겼을 때만 동작하게»*). 화면 어디서나 잡히면 **쓸리는 행**(할 일 · 폴더 행)과
 * 손가락을 두고 다툰다 — 둘 다 가로로 끌기 때문이다. 가장자리는 그 다툼이 없는 유일한 자리다.
 * ⚠ iOS Safari 의 왼쪽 가장자리는 브라우저 «뒤로 가기» 라 ☰ 이 보험이다(홈 화면 앱으로 띄우면 안 겹친다).
 */
export const EDGE_PX = 24
export function fromLeftEdge(x: number): boolean { return x <= EDGE_PX }

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
export function dragProgress(opening: boolean, side: 'left' | 'right', dx: number, drawerW: number): number {
  const toward = side === 'left' ? dx : -dx   // 왼쪽 서랍은 오른쪽으로 끌어 열고, 오른쪽 서랍은 왼쪽으로 끌어 연다
  const p = opening ? toward / drawerW : 1 + toward / drawerW
  return Math.max(0, Math.min(1, p))
}
