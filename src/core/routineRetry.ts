import type { RoutineDef } from './types'

/**
 * 🔴 **실패한 루틴 회차를 다시 돌린다 — 기본 켬** (2026-11-16 Dave: *«루틴이 실패하면 자동으로 재실행 되게 하고 싶어»* · 카드 답 «전부 기본 켬»).
 *    10/9 에 넣은 재시도(BR-2)는 «기본 끔» 이었고 켜는 스위치가 화면에도 봇 도구에도 없었다 — 루틴 44개 중 켜진 것 0개 · 두 달 동안 재실행 0번.
 *    이제 `retry: false` 를 적은 루틴만 다시 돌지 않는다(같은 일을 두 번 하면 안 되는 루틴).
 * ⚠ 횟수는 그대로다 — 10분 뒤 한 번. 두 번째도 실패하면 더 돌리지 않는다.
 * ⚠ 다시 도는 회차는 `retryNote()` 한 줄을 받는다 — 앞 회차가 해 둔 일을 먼저 확인하고 남은 것만 한다.
 */
export function retryOn(r: Pick<RoutineDef, 'retry'> | null | undefined): boolean {
  return !!r && r.retry !== false
}

/** 다시 도는 회차의 문구 끝에 붙는 말 — 처음과 같은 말만 받으면 이미 보낸 것을 또 보낸다 */
export function retryNote(reason?: string): string {
  const why = String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  return `(이건 다시 도는 회차야 — 앞 회차가 실패했어${why ? `: ${why}` : ''}. 앞 회차가 이미 해 둔 일(보낸 것 · 올린 것 · 고친 파일)이 있는지 먼저 확인하고, 이미 된 것은 다시 하지 말고 남은 것만 해.)`
}

/** 보드 한 줄에서 이 판정이 읽는 칸 — `core/routineBoard` 의 BoardRoutine 과 모양이 같다 */
export interface RerunRow { botId: string; name: string; enabled: boolean; state: string; last?: { result: string; reason?: string } }

/**
 * «실패 N개 다시 돌리기» 가 돌리는 것 — 켜져 있고, **마지막 회차가 실패(또는 시간 초과)로 끝난** 루틴.
 * ⚠ 주기를 못 읽어 «실패» 묶음에 든 루틴은 뺀다 — 돌려도 그 문제는 안 풀린다(주기를 고쳐야 한다).
 */
export function rerunnable<T extends RerunRow>(routines: T[]): T[] {
  return routines.filter((r) => r.enabled && r.state === 'fail' && (r.last?.result === 'fail' || r.last?.result === 'timeout'))
}
