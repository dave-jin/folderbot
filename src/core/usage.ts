/**
 * 사용량 — **남은 양**으로 본다 (V23, 2026-09-13 Dave).
 *
 * 실측한 것(이 세션에서 직접 확인):
 * · Claude Code 는 `~/.claude/projects/<슬러그>/<세션>.jsonl` 의 어시스턴트 메시지마다 `usage` 를 남긴다 —
 *   input · output · cache_read · cache_creation 토큰과 모델 이름. **비용 필드는 없다**(단가를 곱해야 한다).
 * · 요금제 한도(5시간 창의 몇 %)는 로컬 파일에는 없다. `/usage` 는 CLI 가 서버에 물어 그린다.
 * ⇒ 종전에는 «남은 양 = 내가 정한 예산 − 쓴 양» 으로 **추정**했다.
 *
 * 🔴 **실제 한도를 CLI 에게 묻는다 (BD · 2026-09-27 Dave · 스크린샷_1233).** 추정은 쓸모가 없었다 — 구독에서는 캐시 읽기
 *    토큰이 막대해서 정가로 환산하면 하루 $1438 이 나오고, 5시간 예산 $6.40 이 금세 0 이 되어 실제로는 75% 남았는데
 *    «0% 다 썼어요» 를 띄웠다(Anthropic 문서도 «구독자에게 달러 값은 청구와 무관한 추정» 이라고 한다).
 *    stream-json 제어 요청 `get_usage` 가 `/usage` 와 같은 서버 값(5시간·주간 사용 %·초기화 시각)을 **모델 호출 없이** 준다
 *    (SDK `usage_EXPERIMENTAL…` · 실측 0토큰). `plan` 이 있으면 그것이 정답이고, 달러 추정은 토큰 참고로만 남긴다.
 *    ⛔ OAuth 토큰을 꺼내 `/api/oauth/usage` 를 직접 부르지 않는다 — 자격 증명 중개 금지(약관). CLI 에게 묻는다.
 *
 * ⛔ 뺄셈은 **여기 한 곳에서만** 한다. 메뉴 막대·앱·폰이 각자 계산하면 반올림이 갈려 다른 숫자를 보여 준다.
 */
export interface UsageEvent { t: number; tool: 'claude' | 'codex'; model: string; input: number; output: number; cacheRead: number; cacheWrite: number; /** 기록 파일 이름(CLI 세션 id) — 봇에 귀속시킬 때 쓴다 (L) */ sid?: string }
export interface Budget { window: number; day: number; week: number }
/** 기본 예산(달러) — 설정에서 바꾼다. 한도가 아니라 «내가 정한 선» 이다 */
export const DEFAULT_BUDGET: Budget = { window: 6.4, day: 19.3, week: 100 }
/** 창 길이 — Claude 의 5시간 창을 따른다 */
export const WINDOW_MS = 5 * 60 * 60 * 1000

/** 백만 토큰당 달러. 설정에서 고칠 수 있게 두고, 화면에는 «추정» 이라고 쓴다 */
export const PRICE: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku': { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'codex': { in: 1.25, out: 10, cacheRead: 0.125, cacheWrite: 1.25 },
  _: { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 }
}
/** 모델 이름 → 단가표 열쇠. 못 알아보면 중간값(_)으로 센다 */
export function priceKey(model: string, tool: string): string {
  const m = model.toLowerCase()
  if (tool === 'codex') return 'codex'
  if (m.includes('opus')) return 'claude-opus'
  if (m.includes('sonnet')) return 'claude-sonnet'
  if (m.includes('haiku')) return 'claude-haiku'
  return '_'
}
export function costOf(e: UsageEvent): number {
  const p = PRICE[priceKey(e.model, e.tool)] ?? PRICE._
  return (e.input * p.in + e.output * p.out + e.cacheRead * p.cacheRead + e.cacheWrite * p.cacheWrite) / 1_000_000
}

/** 요금제 한 창 — 서버가 알려 준 **사용 %**(0–100)와 초기화 시각(ms) */
export interface PlanWindow { used: number; resetsAt: number | null }
export interface PlanUsage {
  /** 구독 한도가 있는 계정인가 — API 키·3P 세션은 false */
  available: boolean
  five?: PlanWindow
  week?: PlanWindow
  subscription?: string
  fetchedAt: number
  /** 마지막으로 묻다 실패했으면 그 까닭 — 값은 마지막으로 받은 것을 그대로 쓴다 */
  error?: string
}
/**
 * `get_usage` 제어 응답(또는 `/usage` 의 `usage_report`)을 PlanUsage 로 — 모양이 바뀌어도 아는 칸만 읽는다.
 * 실측(2026-09-27 · CLI 2.1.283): `{ rate_limits_available, subscription_type, rate_limits: { five_hour: { utilization: 25,
 * resets_at: ISO }, seven_day: {…} }, limits: [{ kind: 'session'|'weekly_all', percent, resets_at }] }`
 */
export function parsePlanUsage(raw: unknown, now: number): PlanUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const t = (v: unknown): number | null => { const n = typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : NaN; return Number.isFinite(n) ? n : null }
  const win = (w: unknown): PlanWindow | undefined => {
    if (!w || typeof w !== 'object') return undefined
    const o = w as Record<string, unknown>; const u = Number(o.utilization ?? o.percent)
    return Number.isFinite(u) ? { used: Math.max(0, Math.min(100, Math.round(u))), resetsAt: t(o.resets_at ?? o.resetsAt) } : undefined
  }
  const rl = (r.rate_limits ?? null) as Record<string, unknown> | null
  const limits = (Array.isArray(r.limits) ? r.limits : Array.isArray(rl?.limits) ? rl!.limits : []) as Record<string, unknown>[]
  const five = win(rl?.five_hour) ?? win(limits.find((x) => x.kind === 'session'))
  const week = win(rl?.seven_day) ?? win(limits.find((x) => x.kind === 'weekly_all'))
  const available = r.rate_limits_available === false ? false : !!(five || week)
  return { available, ...(five ? { five } : {}), ...(week ? { week } : {}), ...(r.subscription_type ? { subscription: String(r.subscription_type) } : {}), fetchedAt: now }
}

/** 더 빠듯한 창(사용 % 가 큰 쪽)의 초기화 시각 — 남은 양이 그 창에 묶여 있으니 «다시 채워짐» 도 그 창이다 */
export function bindingReset(plan: PlanUsage | null | undefined): number | null {
  if (!plan?.available) return null
  const w = (plan.week?.used ?? -1) > (plan.five?.used ?? -1) ? plan.week : plan.five ?? plan.week
  return w?.resetsAt ?? null
}

export interface ToolUsage { tool: 'claude' | 'codex'; tokens: number; cost: number; left: number; leftCost: number; budget: number; byModel: { model: string; tokens: number }[] }
/** 봇별 내역(5시간 창) — 호스트가 CLI 세션 id 로 붙인다 (L) */
export interface BotUsage { botId: string; name: string; tokens: number; cost: number; turns: number }
export interface UsageReport {
  now: number
  /** 창이 다시 채워지는 시각 — 창 안 **첫 사용 + 5시간**. 우리가 계산하는 값이라 «추정» 이다 */
  resetAt: number | null
  weekResetAt: number
  tools: ToolUsage[]
  /** 가장 빠듯한 도구의 남은 % — 메뉴 막대 제목처럼 한 숫자만 쓰는 자리에 */
  left: number
  /** `left` 는 예산이 없으면(0) **null** — 화면은 «—» 로 그린다. 0 으로 그리면 «다 썼다» 처럼 읽힌다(스크린샷 1238) */
  day: { cost: number; left: number | null; tokens: number }
  week: { cost: number; left: number | null }
  budget: Budget
  /** 예산의 출처 — 설정 파일(사람이 정함) / 기본값 */
  budgetSource: 'settings' | 'default'
  byBot: BotUsage[]
  /** 서버가 알려 준 실제 요금제 한도 (BD) — 있으면 Claude 의 `left`·`resetAt` 은 이 값이다. 없으면 예산 추정 */
  plan?: PlanUsage
}

const sumTokens = (e: UsageEvent) => e.input + e.output + e.cacheRead + e.cacheWrite
/** 이번 주의 시작 — 월요일 09:00 (현지) */
export function weekStart(now: number): number {
  const d = new Date(now); d.setHours(9, 0, 0, 0)
  const back = (d.getDay() + 6) % 7            // 월=0
  d.setDate(d.getDate() - back)
  if (d.getTime() > now) d.setDate(d.getDate() - 7)
  return d.getTime()
}
export function dayStart(now: number): number { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() }

/**
 * 창·오늘·이번 주를 한 번에 접는다. `tools` 는 **기록이 있는 도구만** 담는다 —
 * Codex 를 안 쓰면 그 줄은 화면에 아예 안 나온다 (2026-09-13 Dave: «Codex가 없으면 아예 안보여야 해»).
 */
export function report(events: UsageEvent[], now: number, budget: Budget = DEFAULT_BUDGET, opts: { budgetSource?: 'settings' | 'default'; botOf?: (sid: string) => { botId: string; name: string } | undefined; plan?: PlanUsage | null } = {}): UsageReport {
  const plan = opts.plan ?? null
  const winFrom = now - WINDOW_MS
  const win = events.filter((e) => e.t >= winFrom)
  const day = events.filter((e) => e.t >= dayStart(now))
  const week = events.filter((e) => e.t >= weekStart(now))
  const tools: ToolUsage[] = []
  for (const tool of ['claude', 'codex'] as const) {
    const mine = win.filter((e) => e.tool === tool)
    const everMine = events.some((e) => e.tool === tool)
    if (!everMine) continue                     // 안 쓴 도구는 줄 자체를 안 만든다
    const cost = mine.reduce((a, e) => a + costOf(e), 0)
    const tokens = mine.reduce((a, e) => a + sumTokens(e), 0)
    const by = new Map<string, number>()
    for (const e of mine) by.set(e.model, (by.get(e.model) ?? 0) + sumTokens(e))
    const leftCost = Math.max(0, budget.window - cost)
    // 🔴 Claude 는 실제 한도가 있으면 그것을 쓴다 — 5시간 창과 주간 창 중 **더 빠듯한 쪽**이 남은 양이다
    const real = tool === 'claude' && plan?.available && (plan.five || plan.week)
      ? 100 - Math.max(plan.five?.used ?? 0, plan.week?.used ?? 0) : null
    tools.push({
      tool, tokens, cost, budget: budget.window, leftCost,
      left: real !== null ? real : budget.window <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((leftCost / budget.window) * 100))),
      byModel: [...by.entries()].map(([model, t]) => ({ model, tokens: t })).sort((a, b) => b.tokens - a.tokens)
    })
  }
  const dayCost = day.reduce((a, e) => a + costOf(e), 0)
  const weekCost = week.reduce((a, e) => a + costOf(e), 0)
  // 봇별 — 창 안 사건을 CLI 세션 id 로 봇에 붙인다. 모르는 기록(사람이 터미널에서 쓴 것)은 «그 밖» 으로 남긴다
  const byBot = new Map<string, BotUsage>()
  if (opts.botOf) for (const e of win) {
    const b = e.sid ? opts.botOf(e.sid) : undefined
    const key = b ? b.botId : '_other'; const cur = byBot.get(key) ?? { botId: key, name: b ? b.name : '그 밖 (터미널 등)', tokens: 0, cost: 0, turns: 0 }
    cur.tokens += sumTokens(e); cur.cost += costOf(e); cur.turns += 1; byBot.set(key, cur)
  }
  return {
    now,
    resetAt: bindingReset(plan) ?? (win.length ? Math.min(...win.map((e) => e.t)) + WINDOW_MS : null),
    weekResetAt: weekStart(now) + 7 * 24 * 3600_000,
    tools,
    left: tools.length ? Math.min(...tools.map((t) => t.left)) : 100,
    day: { cost: dayCost, left: budget.day > 0 ? Math.max(0, budget.day - dayCost) : null, tokens: day.reduce((a, e) => a + sumTokens(e), 0) },
    week: { cost: weekCost, left: budget.week > 0 ? Math.max(0, budget.week - weekCost) : null },
    budget,
    budgetSource: opts.budgetSource ?? 'default',
    byBot: [...byBot.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens),
    ...(plan ? { plan } : {})
  }
}

/** 한 줄(JSONL)을 사건으로 — 망가진 줄은 조용히 버린다(기록이 커지면 잘린 줄이 생긴다) */
export function parseEvent(line: string): UsageEvent | null {
  try {
    const d = JSON.parse(line) as Partial<UsageEvent>
    if (typeof d.t !== 'number' || (d.tool !== 'claude' && d.tool !== 'codex')) return null
    return { t: d.t, tool: d.tool, model: String(d.model ?? ''), input: +(d.input ?? 0), output: +(d.output ?? 0), cacheRead: +(d.cacheRead ?? 0), cacheWrite: +(d.cacheWrite ?? 0), ...(d.sid ? { sid: String(d.sid) } : {}) }
  } catch { return null }
}
