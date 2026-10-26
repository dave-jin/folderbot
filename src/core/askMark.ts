/**
 * 🔴 DB · **ask 세션은 자동화 묶음에 숨지 않는다** (2026-10-25 Dave «계획대로 두 자리»).
 *    `folderbot ask` 로 온 말은 그 상대의 채널 세션으로 들어가고, 채널 세션은 접힌 «자동화» 묶음에 산다(`core/autoArea`).
 *    그래서 Dave 는 «폴더봇이 답했다» 는 걸 알고 열어 봐도 어느 세션인지 찾지 못했다.
 * 세션 기록에 «누가 · 언제 · 어느 편지» 를 남기고(`asks`), 그 편지의 턴이 끝나면 «답함» 으로 닫는다.
 * 화면은 이 판정 하나로 ① 왼쪽 목록(폰은 첫 화면) 맨 위 줄 ② 그 봇 세션 목록 맨 위로 올린다.
 * ⚠ 영역 판정(`sessArea`)은 바꾸지 않는다 — 정리·이어받기 규칙은 그대로고, 화면에서 자리만 잠깐 옮긴다.
 */
export interface AskMark {
  /** 묻는 편지 id */
  id: string
  /** 묻는 상대 이름(«할일이») */
  by: string
  at: number
  /** 그 편지의 턴이 끝난 시각 */
  doneAt?: number
  /** 턴이 오류로 끝났다 */
  err?: boolean
  /**
   * Dave 가 그 세션을 열었다(맨 위 줄·세션 줄을 눌렀거나 다른 길로 들어왔다).
   * ⚠ 읽음(`readAt`)으로 갈음하지 않는다 — 폰·좁은 창은 폴더 목록이 대화 위에 서랍으로 덮일 뿐이라,
   *   목록을 보는 동안에도 아래 대화가 «맨 아래까지 봄» 으로 읽음을 적는다(2026-10-25 캡처에서 답하자마자 사라졌다).
   */
  seen?: boolean
}

/** 답한 뒤 맨 위에 남는 시간 */
export const ASK_SHOW_MS = 10 * 60_000
/** 끝내 안 닫힌 «묻는 중» 은 하루 뒤 버린다(호스트가 그사이 내려갔다 등) */
export const ASK_STALE_MS = 24 * 3600_000
/** 세션마다 남기는 표시 수 */
export const ASK_KEEP = 6

export interface AskBadge { state: 'asking' | 'answered'; by: string; at: number; doneAt?: number; err?: boolean; letter: string }

/**
 * 지금 이 세션을 맨 위로 올릴까 — 묻는 중이 하나라도 있으면 «묻는 중»(가장 먼저 시작한 것),
 * 아니면 10분 안에 답했고 아직 안 연 것이 있으면 «답함»(가장 최근 것). 둘 다 아니면 null(원래 자리).
 */
export function askBadge(x: { asks?: AskMark[] }, now = Date.now()): AskBadge | null {
  const list = x.asks ?? []
  const open = list.filter((m) => m.doneAt == null && now - m.at < ASK_STALE_MS).sort((a, b) => a.at - b.at)[0]
  if (open) return { state: 'asking', by: open.by, at: open.at, letter: open.id }
  const done = list
    .filter((m) => m.doneAt != null && now - m.doneAt < ASK_SHOW_MS && !m.seen)
    .sort((a, b) => b.doneAt! - a.doneAt!)[0]
  return done ? { state: 'answered', by: done.by, at: done.at, doneAt: done.doneAt, ...(done.err ? { err: true } : {}), letter: done.id } : null
}

/** 새 ask 를 단다 — 같은 편지면 다시 달지 않는다 · 오래된 것부터 덜어 `ASK_KEEP` 개 */
export function askAdd(list: AskMark[] | undefined, m: { id: string; by: string; at: number }): AskMark[] {
  const cur = list ?? []
  if (cur.some((x) => x.id === m.id)) return cur
  return [...cur, { id: m.id, by: m.by, at: m.at }].slice(-ASK_KEEP)
}

/**
 * 턴이 끝났다 — 이미 세션에 들어간 편지(`entered`)의 «묻는 중» 을 닫는다. 아직 큐에 있는 편지는 그 턴이 끝날 때 닫힌다.
 * @returns 바꿨으면 true
 */
export function askClose(list: AskMark[] | undefined, entered: (letterId: string) => boolean, o: { now: number; err?: boolean }): boolean {
  let changed = false
  for (const m of list ?? []) {
    if (m.doneAt != null || !entered(m.id)) continue
    m.doneAt = o.now; if (o.err) m.err = true
    changed = true
  }
  return changed
}

/** Dave 가 열었다 — 답한 표시를 내린다(묻는 중은 그대로 · 아직 기다리는 중이니까) */
export function askSeen(list: AskMark[] | undefined): boolean {
  let changed = false
  for (const m of list ?? []) if (m.doneAt != null && !m.seen) { m.seen = true; changed = true }
  return changed
}

/** 맨 위에 올릴 세션들 — 시작한 순서대로(먼저 물은 것이 위) */
export function askLifted<T extends { asks?: AskMark[] }>(sessions: T[], now = Date.now()): { s: T; b: AskBadge }[] {
  return sessions.map((s) => ({ s, b: askBadge(s, now) })).filter((x): x is { s: T; b: AskBadge } => !!x.b).sort((a, b) => a.b.at - b.b.at)
}

/** 받침이 있으면 «이», 없으면 «가» — 한글이 아니면 «가» */
export function iGa(name: string): string {
  const c = name.trim().slice(-1).charCodeAt(0)
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? '이' : '가'
  return '가'
}

/** 줄 머리말 — «할일이가 묻는 중» · «답함 · 방금» · «답함 · 3분 전» · «끝남 · 오류» */
export function askLabel(b: AskBadge, now = Date.now()): string {
  if (b.state === 'asking') return `${b.by}${iGa(b.by)} 묻는 중`
  if (b.err) return '끝남 · 오류'
  const min = Math.floor((now - (b.doneAt ?? now)) / 60_000)
  return `답함 · ${min < 1 ? '방금' : `${min}분 전`}`
}
