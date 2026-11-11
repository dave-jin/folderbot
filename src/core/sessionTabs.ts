import type { SessionInfo } from './types'
import { sessLocked } from './cleanup'
import { sessionUnread } from './unread'

/**
 * EC · **세션 창 상태 탭** (2026-11-11) — «전체 · 내 답 기다림 · 일하는 중 · 안 읽음 · 쉼».
 *
 * 🔴 **세션 하나는 탭 하나에만 든다**(전체 빼고) — 그래서 네 탭의 수를 더하면 전체다. 차례는 «사람이 먼저 나설 것» 순이다:
 *    내 답 기다림 → 일하는 중 → 안 읽음 → 쉼. 일하는 중인데 지난 답을 안 읽은 세션은 «일하는 중» 이다(AN — 도는 중에는 «가서 봐라» 가 아니다).
 * 🔴 **판정을 새로 짓지 않는다** — 기다림은 상황판 띠 «내 답을 기다림» 과 같은 원천(`awaiting_input`), 일하는 중은 세션 정리의 잠금 사유
 *    (`core/cleanup.sessLocked` 의 «일하는 중 · 뒤에서 도는 중»), 안 읽음은 `core/unread.sessionUnread` 다.
 */
export type SessTab = 'all' | 'wait' | 'work' | 'unread' | 'rest'
export const SESS_TABS: { k: SessTab; t: string }[] = [
  { k: 'all', t: '전체' }, { k: 'wait', t: '내 답 기다림' }, { k: 'work', t: '일하는 중' }, { k: 'unread', t: '안 읽음' }, { k: 'rest', t: '쉼' }
]

type TabFields = Pick<SessionInfo, 'state' | 'lastReplyAt' | 'readAt' | 'bg' | 'queue'>

/** «내 답을 기다림» — 승인·질문 카드가 걸려 사람의 답을 기다린다. 상황판 띠 · 세션 창 탭 · «다음 기다리는 세션» 단축키가 이 하나를 쓴다 */
export function isWaiting(x: Pick<SessionInfo, 'state'>): boolean { return x.state === 'awaiting_input' }

/** 이 세션이 드는 탭(전체 빼고 하나) */
export function sessTabOf(x: TabFields): Exclude<SessTab, 'all'> {
  if (isWaiting(x)) return 'wait'
  const lock = sessLocked(x)
  if (lock === '일하는 중' || lock === '뒤에서 도는 중') return 'work'
  if (sessionUnread(x.lastReplyAt, x.readAt)) return 'unread'
  return 'rest'
}
export function tabMatch(x: TabFields, tab: SessTab): boolean { return tab === 'all' || sessTabOf(x) === tab }
/** 탭마다 몇 개인가 — `all` 은 전체 */
export function tabCounts(list: TabFields[]): Record<SessTab, number> {
  const c: Record<SessTab, number> = { all: list.length, wait: 0, work: 0, unread: 0, rest: 0 }
  for (const x of list) c[sessTabOf(x)]++
  return c
}

/**
 * «내 답을 기다리는» 세션들 — 최근에 움직인 것부터(같으면 id 순 · 차례가 흔들리지 않게).
 * `known` 을 주면 그 봇의 세션만(레일에 없는 봇의 세션은 갈 데가 없다).
 */
export function waitingOrder<S extends Pick<SessionInfo, 'id' | 'botId' | 'state' | 'lastActivity'>>(sessions: S[], known?: (botId: string) => boolean): S[] {
  return sessions.filter((x) => isWaiting(x) && (!known || known(x.botId))).sort((a, b) => b.lastActivity - a.lastActivity || a.id.localeCompare(b.id))
}
/**
 * 다음으로 뛸 기다리는 세션 — 지금 세션이 목록에 있으면 그다음 것(끝이면 처음으로 돈다), 없으면 맨 앞.
 * 기다리는 세션이 지금 세션 하나뿐이면 그 세션을 돌려준다(그 카드로 초점만 옮긴다). 하나도 없으면 null.
 */
export function nextWaiting(ids: string[], cur?: string | null): string | null {
  if (!ids.length) return null
  const i = cur ? ids.indexOf(cur) : -1
  return ids[(i + 1) % ids.length]
}
