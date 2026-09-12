import type { SessionEvent, SessionState } from './types'

/** 대기 → 일하는 중 → 확인해 주세요 → 끝났어요 / 문제 있어요. 허용되지 않은 전이는 현재 상태 유지. */
export function transition(state: SessionState, event: SessionEvent): SessionState {
  switch (event.kind) {
    case 'user_sent': return 'running'
    case 'permission_requested': return state === 'running' ? 'awaiting_input' : state
    case 'input_provided': return state === 'awaiting_input' ? 'running' : state
    case 'result_received': return event.isError ? 'error' : 'done'
    case 'process_exited':
      if (event.code === 0 && state === 'running') return 'done'
      if (event.code === 143 || event.code === 137) return state === 'running' ? 'idle' : state
      return event.code === 0 || event.code === null ? state : 'error'
    case 'stream_activity': return state === 'awaiting_input' ? state : 'running'
    case 'acknowledged': return state === 'done' || state === 'error' ? 'idle' : state
  }
}

export function shouldNotify(prev: SessionState, next: SessionState): boolean {
  if (prev === next) return false
  return next === 'done' || next === 'awaiting_input' || next === 'error'
}
