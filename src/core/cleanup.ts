import type { SessionInfo } from './types'
import { sessionUnread } from './unread'

/**
 * 세션 정리 (2026-10-02 Dave: *«전체 세션을 보고 일괄로 유휴 상태나 안쓰는 세션들을 지우는 기능»* · 시안 B).
 * 화면(정리 창)과 메뉴의 «정리 가능 N» 이 같은 판정을 쓰도록 여기 한 곳에 둔다.
 */
export type SessKind = '소통' | '루틴' | '봇끼리' | '사람'
export const CLEAN_IDLE_MS = 7 * 24 * 3600_000

export function sessKind(x: Pick<SessionInfo, 'comm' | 'routine' | 'delegated' | 'name'>): SessKind {
  if (x.comm) return '소통'
  if (x.routine) return '루틴'
  // 2026-10-02 이전의 봇끼리 세션은 출처 표식이 없을 수 있어 이름 앞머리로도 본다
  if (x.delegated || /^(위임 ·|요청 ←)/.test(x.name)) return '봇끼리'
  return '사람'
}

/** 지울 수 없는 세션 — 🔴 일하는 중·답 기다림·안 읽음·백그라운드가 도는 것·대기 말이 있는 것. 지우면 일·답이 사라진다 */
export function sessLocked(x: Pick<SessionInfo, 'state' | 'lastReplyAt' | 'readAt' | 'bg' | 'queue'>): string | null {
  if (x.state === 'running') return '일하는 중'
  if (x.state === 'awaiting_input') return '답 기다림'
  if ((x.bg ?? 0) > 0) return '뒤에서 도는 중'
  if (x.queue?.length) return '대기 말 있음'
  if (sessionUnread(x.lastReplyAt, x.readAt)) return '안 읽음'
  return null
}

export type CleanFilter = 'old' | 'bot' | 'routine' | 'done' | 'all'
export const CLEAN_FILTER_LABEL: Record<CleanFilter, string> = { old: '7일 넘게 안 씀', bot: '봇끼리 대화', routine: '루틴', done: '끝남', all: '모든 세션' }
/** 처음 열 때 골라 두는 거름 — 시안 B */
export const CLEAN_DEFAULT: CleanFilter[] = ['old', 'bot']

/** 거름에 걸리는가 — 켠 거름 중 **하나라도** 맞으면 보인다(«모든 세션» 은 다) */
export function cleanMatch(x: SessionInfo, on: CleanFilter[], now = Date.now()): boolean {
  if (on.includes('all')) return true
  const k = sessKind(x)
  return (on.includes('old') && now - x.lastActivity >= CLEAN_IDLE_MS)
    || (on.includes('bot') && k === '봇끼리')
    || (on.includes('routine') && k === '루틴')
    || (on.includes('done') && (x.state === 'done' || x.state === 'idle' || x.state === 'error'))
}

/** 처음부터 체크해 두는가 — 거름에 걸리고, 잠기지 않았고, 소통 세션이 아닌 것(소통 세션은 봇마다 하나라 일부러 고를 때만) */
export function cleanPreselect(x: SessionInfo, on: CleanFilter[], now = Date.now()): boolean {
  return cleanMatch(x, on, now) && !sessLocked(x) && sessKind(x) !== '소통'
}

/** 메뉴의 «정리 가능 N» — 기본 거름으로 열었을 때 체크될 수 */
export function cleanableCount(all: SessionInfo[], now = Date.now()): number {
  return all.filter((x) => cleanPreselect(x, CLEAN_DEFAULT, now)).length
}
