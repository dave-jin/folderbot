import { sessionUnread } from './unread'

/**
 * CC · **자동화 영역** (2026-10-12 Dave: *«채널 소통, 루틴 등 자동화 섹션은 내가 채팅하는 영역과 별개로 동작해야 해.
 *    이 영역은 정기적으로 자동 정리되어야 해»*). 계기는 같은 날 12:00 사고다 — 사람이 08:00 루틴 세션에 답해 11:32 까지
 *    일했는데, 같은 봇의 다른 루틴이 돌면서 «봇마다 끝난 루틴 세션 2개» 규칙으로 그 세션과 백그라운드 작업을 지웠다.
 * 어느 세션이 어느 영역인지, 무엇을 지워도 되는지를 **여기 한 곳**에서 정한다(화면·호스트·유닛이 같은 판정을 쓴다).
 */
export type Area = 'chat' | 'auto'
export type AutoKind = '소통' | '채널' | '루틴' | '봇끼리'

export interface AreaFacts {
  comm?: boolean
  channel?: string
  routine?: string
  delegated?: boolean
  /** 사람이 이어받아 채팅으로 옮긴 세션 — 무엇에서 왔든 채팅이다 */
  adopted?: boolean
  /** 갈아탄 옛 채널(BV-2) — 종전에는 `channel` 을 지워 사람 세션처럼 보였다 */
  exChannel?: boolean
  /** 봇마다 하나만 남긴 소통 세션의 나머지 */
  exComm?: boolean
}

/** 자동화 세션의 종류 — 채팅 세션이면 null */
export function autoKind(x: AreaFacts): AutoKind | null {
  if (x.adopted) return null
  if (x.comm || x.exComm) return '소통'
  if (x.channel || x.exChannel) return '채널'
  if (x.routine) return '루틴'
  if (x.delegated) return '봇끼리'
  return null
}
export function sessArea(x: AreaFacts): Area { return autoKind(x) ? 'auto' : 'chat' }

/**
 * 사람이 자동화 세션에 말을 보내면 어떻게 하나.
 * - `adopt` — 그 세션을 채팅으로 옮긴다(하던 일·백그라운드 작업·맥락을 그대로 잇는다). 루틴·봇끼리·옛 채널·옛 소통
 * - `fork` — 새 채팅 세션을 갈라 연다. 🤝 소통·연결 채널은 봇마다 하나여야 해서 옮길 수 없다
 * - `none` — 이미 채팅 세션
 */
export function takeoverMode(x: AreaFacts): 'adopt' | 'fork' | 'none' {
  if (!autoKind(x)) return 'none'
  return x.comm || x.channel ? 'fork' : 'adopt'
}

/** 루틴마다 남기는 수 · 자동 세션 수명 · 최근 활동 유예 */
export const AUTO_KEEP_PER_ROUTINE = 2
export const AUTO_MAX_IDLE_MS = 7 * 24 * 3600_000
export const AUTO_GRACE_MS = 30 * 60_000

export interface DropFacts extends AreaFacts {
  id: string
  state: string
  lastActivity: number
  lastReplyAt?: number
  readAt?: number
  bg?: number
  queue?: unknown[]
}

/** 🔴 지우면 안 되는 자동 세션 — 일하는 중·답 기다림·백그라운드 작업·대기 말·최근 30분 안 활동 */
export function autoHeld(x: DropFacts, now = Date.now()): boolean {
  return x.state === 'running' || x.state === 'awaiting_input' || (x.bg ?? 0) > 0 || !!x.queue?.length || now - x.lastActivity < AUTO_GRACE_MS
}

/**
 * 정리할 자동 세션 id. 루틴이 돌 때와 매시간 부른다.
 * ① 채팅 영역·살아 있는 소통·살아 있는 채널은 손대지 않는다(소통은 자동 압축, 채널은 갈아타기가 맡는다)
 * ② 루틴은 **루틴마다** 최근 2개 — 넘친 것 중 잡혀 있지 않고 안 읽은 답이 없는 것
 * ③ 마지막 활동 뒤 7일 지난 자동 세션 — 안 읽은 답이 있어도(자동화 영역은 사람이 안 보는 곳이라 안 읽음이 영영 안 풀린다)
 */
export function autoToDrop(sessions: DropFacts[], now = Date.now()): string[] {
  const out = new Set<string>()
  const auto = sessions.filter((x) => autoKind(x) && !x.comm && !x.channel && !autoHeld(x, now))
  for (const x of auto) if (now - x.lastActivity >= AUTO_MAX_IDLE_MS) out.add(x.id)
  for (const id of routinesToDrop(sessions, AUTO_KEEP_PER_ROUTINE, now)) out.add(id)
  return [...out]
}

/**
 * ② 만 — 루틴마다 최근 `keep` 개를 남긴다(AI · 2026-09-24 «루틴 세션은 둘까지» 를 루틴 단위로 고침).
 * 🔴 잡힌 것(도는 중·확인 대기·백그라운드·대기 말·30분 안)과 안 읽은 답은 걷지 않고, 남길 자리에 먼저 센다.
 */
export function routinesToDrop(sessions: DropFacts[], keep = AUTO_KEEP_PER_ROUTINE, now = Date.now()): string[] {
  const by = new Map<string, DropFacts[]>()
  for (const x of sessions) if (autoKind(x) === '루틴') by.set(x.routine!, [...(by.get(x.routine!) ?? []), x])
  const out: string[] = []
  for (const mine of by.values()) {
    const busy = (s: DropFacts) => autoHeld(s, now) || sessionUnread(s.lastReplyAt, s.readAt)
    const idle = mine.filter((s) => !busy(s)).sort((a, b) => b.lastActivity - a.lastActivity)
    const room = Math.max(0, keep - mine.filter(busy).length)
    out.push(...idle.slice(room).map((s) => s.id))
  }
  return out
}

/**
 * 갈라 여는 새 채팅의 인수인계 — 자동화 세션의 최근 대화(사람·봇 말)를 짧게 옮긴다.
 * 원문 전체는 `bot_sessions` 로 읽을 수 있으니 세션 id 를 함께 적는다.
 */
export function forkHandover(name: string, id: string, items: { kind: string; text?: string }[], max = 6000): string {
  const lines: string[] = []
  let used = 0
  for (let i = items.length - 1; i >= 0 && lines.length < 12; i--) {
    const it = items[i]
    if ((it.kind !== 'user' && it.kind !== 'assistant') || !it.text?.trim()) continue
    const t = `${it.kind === 'user' ? '받은 말' : '봇'}: ${it.text.trim().slice(0, 1500)}`
    if (used + t.length > max) break
    lines.unshift(t); used += t.length
  }
  return `이 채팅은 자동화 세션 «${name}»(${id})에서 갈라졌어요. 그 세션의 최근 대화:\n\n${lines.join('\n\n') || '(옮길 대화 없음)'}\n\n(원문 전체는 bot_sessions 로 ${id} 를 읽으세요. 이 채팅에서는 사람의 말에 답하세요.)`
}

/**
 * 호스트가 뜰 때 한 번 — 옛 세션 이관. 바꿨으면 true(파일에 다시 쓴다).
 * ① 사람이 말을 보낸 루틴 세션 → 채팅으로(`adopted`). 사람 말은 `turnFrom=human` 이거나 기기 표식(`from`)이 붙은 사람 줄이다
 *    — 루틴 프롬프트는 기기 표식 없이 들어간다
 * ② 연결 상대의 신뢰 수준(`trust`)은 남았는데 `channel` 이 없는 세션 = 갈아탄 옛 채널 → `exChannel`
 */
export function migrateArea(r: { routine?: string; adopted?: boolean; turnFrom?: string; items: { kind: string; from?: unknown }[]; trust?: string; channel?: string; exChannel?: boolean }): boolean {
  let changed = false
  if (r.routine && !r.adopted && (r.turnFrom === 'human' || r.items.some((it) => it.kind === 'user' && it.from))) { r.adopted = true; changed = true }
  if (r.trust && !r.channel && !r.exChannel && !r.adopted) { r.exChannel = true; changed = true }
  return changed
}

/** 봇마다 소통 세션은 하나 — 가장 최근 것을 뺀 나머지 id */
export function extraComms(rs: { id: string; botId: string; comm?: boolean; lastActivity: number }[]): string[] {
  const by = new Map<string, { id: string; lastActivity: number }[]>()
  for (const r of rs) if (r.comm) by.set(r.botId, [...(by.get(r.botId) ?? []), r])
  return [...by.values()].flatMap((l) => l.sort((a, b) => b.lastActivity - a.lastActivity).slice(1).map((r) => r.id))
}
