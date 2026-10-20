/**
 * 🔴 **DF · 찾기(⌘K) «지금 움직이는 세션» 낱줄** (2026-10-20 Dave: *«최근 5개 폴더안에는 5개만 나오는게 아니라 현재 동작하고 있는 건
 *    무조건 다보여야 해. 그리고 현재 상태도 실시간으로»* → 목업 `03_디자인/2026-10-20_찾기-실시간-목업` v2 → *«낱줄 세션만 디자인으로 진행해줘»*).
 *
 * - 움직이는 세션 = 공을 누가 들고 있는 세션(`core/waiting.holderOf` 가 none 이 아닌 것) — 확인 대기 · 일하는 중 · 남을 기다리는 중.
 *   루틴 세션도 도는 동안에는 선다. 개수는 자르지 않는다.
 * - **낱줄** — 폴더와 상관없이 급한 차례(확인 대기 → 일하는 중 → 기다리는 중), 같으면 오래된 것 먼저. 폴더 이름은 줄 오른쪽에 작게.
 * - **연 동안에는 차례가 그대로다** — 끝난 세션은 «방금 끝났어요 · N 걸림» 으로 자리를 지키고, 새로 움직인 세션은 끝에 붙는다
 *   (`freezeOrder`). 줄이 눈앞에서 뛰면 고르던 줄을 놓친다.
 * - 줄의 말은 레일과 같은 값에서 나온다 — 레일·헤더·대기 줄이 서로 다른 말을 하지 않게(AB).
 *
 * ⚠ 순수 함수 — 화면(`client/Search.tsx`)과 유닛이 같은 판정을 쓴다.
 */
import { elapsedText, holderOf, holdHeader, type Holder } from './waiting'
import type { SessionInfo } from './types'

export type LiveCls = Exclude<Holder, 'none'> | 'done' | 'err' | 'none'
export interface LiveView { cls: LiveCls; text: string; tm: string; since: number }

type S = Pick<SessionInfo, 'state' | 'inflight' | 'bg' | 'pending' | 'activity' | 'turnStartedAt' | 'lastActivity' | 'name' | 'lastError'>

/** 이 세션이 지금 움직이나 */
export function isLive(x: S, now = Date.now()): boolean {
  return holderOf(x.state, x.inflight, now, x.bg ?? 0) !== 'none'
}
/** 경과를 재는 시각 — 이번 턴 시작 · 없으면 돌던 도구 · 마지막 활동 */
export function liveSince(x: S): number {
  return x.turnStartedAt ?? x.inflight?.since ?? x.lastActivity ?? 0
}

const URG: Record<Holder, number> = { you: 0, me: 1, other: 2, none: 3 }
/** 급한 차례 — 확인 대기 → 일하는 중 → 기다리는 중 · 같으면 오래된 것 먼저 */
export function liveOrder<T extends S & { id: string }>(xs: T[], now = Date.now()): T[] {
  const h = (x: T) => URG[holderOf(x.state, x.inflight, now, x.bg ?? 0)]
  return [...xs].sort((a, b) => h(a) - h(b) || liveSince(a) - liveSince(b))
}

/**
 * 연 동안 차례를 묶는다 — `prev` 는 열 때(또는 지난 그리기의) 차례. 사라진 세션은 빼고, 새로 움직인 세션은 급한 차례로 끝에 붙인다.
 * 돌려준 `added` 는 이번에 새로 붙은 것(화면이 잠깐 빛낸다).
 */
export function freezeOrder(prev: string[] | null, live: string[], exists: (id: string) => boolean): { order: string[]; added: string[] } {
  if (!prev) return { order: [...live], added: [] }
  const kept = prev.filter(exists)
  const seen = new Set(kept)
  const added = live.filter((id) => !seen.has(id))
  return { order: [...kept, ...added], added }
}

/**
 * 줄에 쓸 말 · 색 · 시간. `took` 은 연 동안 끝난 세션이 걸린 시간(화면이 끝난 걸 본 순간 잰다).
 * - 확인 대기: «확인해 주세요 · 권한 이름» · «N분 M초째»
 * - 일하는 중: 지금 하는 일 한 줄(레일과 같은 `activity`) · 경과
 * - 남을 기다리는 중: «브라우저 작업을 기다리는 중 · 요약» · 경과
 */
export function liveView(x: S, now = Date.now(), took?: number): LiveView {
  const since = liveSince(x)
  const holder = holderOf(x.state, x.inflight, now, x.bg ?? 0)
  const el = elapsedText(now - since)
  if (holder === 'you') return { cls: 'you', text: `확인해 주세요 · ${x.pending?.[0]?.displayName || '답을 기다려요'}`, tm: `${el}째`, since }
  if (holder === 'me') return { cls: 'me', text: x.activity || '생각 중', tm: el, since }
  if (holder === 'other') return { cls: 'other', text: `${holdHeader(holder, x.inflight, x.bg ?? 0)}${x.inflight?.summary ? ` · ${x.inflight.summary}` : ''}`, tm: el, since }
  if (x.state === 'error') return { cls: 'err', text: `문제 있어요${x.lastError ? ` · ${x.lastError}` : ''}`, tm: '방금', since }
  if (took != null) return { cls: 'done', text: `방금 끝났어요 · ${elapsedText(took)} 걸림`, tm: '방금', since }
  return { cls: 'none', text: '', tm: '', since }
}
