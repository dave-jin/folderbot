import type { TurnFrom } from './turnGuard'

/**
 * 🔴 **EB · 승인 시간 초과 — 사람이 시작하지 않은 턴만** (2026-11-11 Dave 승인 · 기획 «사람이 없어도 안전하게 돈다»).
 *
 * 10/21 에 승인 창 하나에 루틴이 4시간 반 멈춰 있었다 — 루틴과 봇이 시작한 턴에는 그 창을 눌러 줄 사람이 없다.
 * 그래서 루틴(`routine`) · 다른 봇의 말(`bot`) · 바깥 상대의 편지(`peer`)로 시작된 턴에서 승인 요청이 정한 시간 안에
 * 답을 못 받으면 호스트가 **거절**로 답한다(허용이 아니다). 모델은 «N분 동안 사람의 답이 없어 거절됨» 을 받고 다음으로 넘어간다.
 *
 * ⛔ **사람이 보낸 턴(`human`)은 끝까지 기다린다** — 자리를 비운 사이 내가 시킨 일이 거절돼 있으면 안 된다.
 *    누가 시작했는지 모르는 턴(옛 기록 · 값 없음)도 기다린다 — 모르면 종전대로다.
 * ⛔ 질문 카드(AskUserQuestion)는 건드리지 않는다 — 시간 초과는 권한 요청에만 건다.
 * ⚠ 턴 단위다(`core/turnGuard` 와 같은 기준) — 루틴 세션이어도 사람이 이어받아 보낸 턴은 사람 것이다.
 */

/**
 * 기본은 **끄기(0)** — 2026-11-11 Dave 가 카드에서 «끔 (무한정 기다림)» 을 골랐다. 기능은 설정 › 세션 · 사용량 «승인 시간 초과» 에서 켠다(5분 · 10분 · 30분 · 1시간).
 * 처음에는 10분으로 넣었다 — 기본을 다시 켜려면 이 상수 하나만 바꾼다.
 */
export const DEFAULT_APPROVAL_TIMEOUT_MIN = 0
/** 하루를 넘겨 기다리게 두지 않는다 */
export const APPROVAL_TIMEOUT_MAX_MIN = 24 * 60

/** 설정값을 분으로 — 비었거나 이상하면 기본값 · 0 은 끄기 · 하루를 넘지 않는다. ⚠ 분수도 받는다(검사가 0.03분으로 잰다) */
export function approvalTimeoutMin(v: unknown): number {
  if (v === undefined || v === null || v === '') return DEFAULT_APPROVAL_TIMEOUT_MIN
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_APPROVAL_TIMEOUT_MIN
  return Math.min(n, APPROVAL_TIMEOUT_MAX_MIN)
}

/** 이 요청에 시간 초과를 거는가 — 사람이 시작하지 않은 턴의 권한 요청만 */
export function approvalTimeoutApplies(turnFrom: TurnFrom | undefined, req: { ask?: boolean }, minutes: number): boolean {
  if (!(minutes > 0)) return false
  if (req.ask) return false
  return turnFrom === 'routine' || turnFrom === 'bot' || turnFrom === 'peer'
}

/** «10분» · «30초»(1분보다 짧을 때 — 검사) */
export function fmtWait(minutes: number): string {
  return minutes >= 1 ? `${Math.round(minutes * 10) / 10}분` : `${Math.max(1, Math.round(minutes * 60))}초`
}

const WHO: Record<Exclude<TurnFrom, 'human'>, string> = { routine: '루틴이 시작한 턴', bot: '다른 봇의 말로 시작된 턴', peer: '바깥 편지로 시작된 턴' }

/** 모델에게 돌려주는 거절 사유 — 같은 일을 다시 묻지 않고 넘어가게 */
export function approvalDenyMessage(minutes: number): string {
  return `${fmtWait(minutes)} 동안 사람의 답이 없어 거절됐습니다(승인 시간 초과). 사람이 시작하지 않은 턴이라 기다리지 않습니다. 같은 요청을 다시 하지 말고, 이 일은 건너뛴 뒤 «승인이 필요해 하지 못했다» 고 결과에 적으세요.`
}

/** 대화에 남는 시스템 줄 */
export function approvalNote(minutes: number, displayName: string, turnFrom: TurnFrom | undefined): string {
  const who = turnFrom && turnFrom !== 'human' ? WHO[turnFrom] : '사람이 시작하지 않은 턴'
  return `승인 시간 초과 · ${displayName} — ${fmtWait(minutes)} 동안 답이 없어 거절했어요 (${who} · 사람이 보낸 턴은 끝까지 기다려요)`
}

/** 루틴 실행 기록의 이유 한 줄 */
export function approvalRunReason(minutes: number, tools: string[]): string {
  const uniq = [...new Set(tools)]
  return `승인 시간 초과 · ${uniq.slice(0, 3).join(' · ')}${uniq.length > 3 ? ` 외 ${uniq.length - 3}` : ''} (${fmtWait(minutes)} 동안 답 없음)`
}
