/**
 * 🔴 **CF · 로딩·전환 화면 — 기다렸지만 기다린 기분이 안 들게** (2026-10-19 Dave «전부 A» · 목업 `03_디자인/2026-10-12_로딩-전환-목업`).
 *    시각 문턱을 **여기 한 곳**에 둔다 — 화면(App)과 유닛이 같은 값을 읽는다.
 *
 * ② 처음 여는 대화 — 받는 데 150ms 를 넘기면 말풍선 모양 회색 줄(그 안에 오면 아무것도 안 띄운다 · 깜빡임 방지)
 * ④ 봇 전환 — 옛 대화를 흐리게 남겼다가 새 대화로 바꾼다. 400ms 를 넘길 때만 ②의 회색 줄로 갈아 끼운다
 * ⑤ 다시 붙는 중 — 머리줄 작은 점 «맞추는 중». 400ms 안에 끝나면 안 띄운다
 */
export const SKEL_AFTER_MS = 150
export const FADE_HOLD_MS = 400
export const SYNC_DOT_AFTER_MS = 400

export type ChatPhase = 'ready' | 'fade' | 'blank' | 'skel'

/**
 * 대화 칸을 무엇으로 채우나.
 * @param loading 지금 세션의 대화를 아직 못 받았나
 * @param hasPrev 흐리게 남길 옛 대화(다른 세션 · 비어 있지 않음)가 있나
 * @param ms 받기 시작한 뒤 지난 시간
 */
export function chatPhase(loading: boolean, hasPrev: boolean, ms: number): ChatPhase {
  if (!loading) return 'ready'
  if (hasPrev) return ms < FADE_HOLD_MS ? 'fade' : 'skel'
  return ms < SKEL_AFTER_MS ? 'blank' : 'skel'
}
/** 다음 단계로 넘어갈 때까지 남은 시간 — 없으면 null(타이머를 안 건다) */
export function nextPhaseIn(loading: boolean, hasPrev: boolean, ms: number): number | null {
  if (!loading) return null
  const edge = hasPrev ? FADE_HOLD_MS : SKEL_AFTER_MS
  return ms < edge ? edge - ms : null
}
