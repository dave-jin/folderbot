import type { SessionState } from './types'

/**
 * 🔴 **CI-2 · 호스트가 다시 뜰 때 끊긴 턴** (2026-10-16 오케스트레이터 제보 — 오사카 봇 소통 세션의 첫 지시 턴이 22:26 업데이트 적용으로
 *    끊겼는데, 다시 뜬 호스트는 상태만 «쉬는 중» 으로 돌려놓고 «시작하는 중» 글씨·턴 시각은 그대로 두었다. 실패 표시도, 알림도 없어
 *    오케스트레이터는 «아무것도 안 한 세션» 으로 봤다. 같은 꼴이 10/13 SNS 루틴 · 9/29 모객 루틴에도 남아 있었다).
 *
 * 턴이 끝나면 `result` 가 활동 글씨를 비운다 — 그러니 켜질 때 글씨가 남아 있거나 상태가 «도는 중» 이면 그 턴은 끝을 못 봤다.
 * - `note` — 대화에 «끊겼어요» 줄을 남기고, 봇·바깥 상대가 시킨 턴이면 오케스트레이터에게 알린다.
 * - `quiet` — 글씨만 지운다. 이미 오류로 끝난 턴(못 띄움 등)이거나, 7일 넘은 턴이거나, 루틴 회차(실행 기록 쪽 `RunLog.recoverInterrupted` 가 닫고 알린다).
 */
export type CutVerdict = 'note' | 'quiet' | null
export const CUT_WINDOW_MS = 7 * 24 * 3600_000
export const CUT_TURN_NOTE = '호스트가 다시 뜨면서(업데이트 적용·앱 재시작) 이 턴이 도중에 끊겼어요 — 다시 돌리지는 않았어요. 위에 남은 것까지가 끊기기 전에 한 일이에요. 이어서 하려면 «이어서 해 줘» 라고 보내 주세요.'

export function cutTurnAtLoad(r: { state: SessionState; activity?: string; turnStartedAt?: number; routine?: string; adopted?: boolean; cut?: { at: number } }, now: number): CutVerdict {
  const live = r.state === 'running' || r.state === 'awaiting_input' || !!r.cut
  if (!live && !r.activity) return null
  if (!live && r.state === 'error') return 'quiet'
  if (r.routine && !r.adopted) return 'quiet'
  const at = r.turnStartedAt ?? r.cut?.at ?? 0
  if (!at || now - at > CUT_WINDOW_MS) return 'quiet'
  return 'note'
}
