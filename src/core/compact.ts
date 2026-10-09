/**
 * 자동 압축 — 언제 `/compact` 를 돌리나 (2026-10-02 Dave: *«적절한 시점에는 항상 자동 compress 로 토큰을 줄여야 해»*).
 *
 * 압축도 한 턴이다 — 컨텍스트를 한 번 다 읽고 요약을 쓴다. 그래서 «작을 때 자주» 는 손해고, 아래 두 때에만 한다.
 *  ① **턴이 끝났는데 컨텍스트가 70% 또는 15만 토큰을 넘었다**(모든 Claude 세션) — 다음 턴부터 매번 큰 컨텍스트를 다시 읽는 비용을 줄인다.
 *  ② **소통 세션을 6시간 넘게 안 썼다가 다시 쓴다**(컨텍스트 30% 이상일 때) — 봇끼리 오간 말은 서로 상관없는 일이
 *     쌓이므로, 새 일을 받기 전에 지난 것을 요약해 둔다. 잠든 세션을 압축하려고 일부러 깨우지는 않는다(쓸 때만).
 * ⛔ Codex 는 `/compact` 가 없다. ⛔ 방금 압축했으면(10분) 다시 안 한다 — 압축 뒤 측정값이 늦게 오면 고리가 된다.
 */
export const COMPACT_AFTER_RATIO = 0.7
/**
 * BV-1 · **절대값 기준** (2026-10-09 · 소통 재설계). 1M 창에서 70% 는 70만 토큰이라 압축이 사실상 안 돌았다
 * (할일이 채널 56만 토큰 · 열흘에 네 번). 15만 토큰을 넘으면 비율과 상관없이 턴 끝에 압축한다.
 */
export const COMPACT_AFTER_TOKENS = 150_000
export const COMPACT_IDLE_MS = 6 * 3600_000
export const COMPACT_IDLE_RATIO = 0.3
export const COMPACT_COOLDOWN_MS = 10 * 60_000

export interface CompactInput {
  vendor?: 'claude' | 'codex'
  ctx?: { used: number; window: number }
  compactedAt?: number
  lastActivity: number
  comm?: boolean
}

/** 압축할 때면 화면에 적을 이유 한 줄, 아니면 null */
export function compactReason(s: CompactInput, when: 'after' | 'before', now = Date.now()): string | null {
  if (s.vendor === 'codex' || !s.ctx || !s.ctx.window) return null
  if (s.compactedAt && now - s.compactedAt < COMPACT_COOLDOWN_MS) return null
  const ratio = s.ctx.used / s.ctx.window, pct = Math.round(ratio * 100)
  if (when === 'after') {
    if (ratio >= COMPACT_AFTER_RATIO) return `컨텍스트 ${pct}%`
    return s.ctx.used >= COMPACT_AFTER_TOKENS ? `컨텍스트 ${Math.round(s.ctx.used / 1000)}k 토큰(${pct}%)` : null
  }
  if (!s.comm || now - s.lastActivity < COMPACT_IDLE_MS || ratio < COMPACT_IDLE_RATIO) return null
  return `${Math.floor((now - s.lastActivity) / 3600_000)}시간 쉰 소통 세션 · 컨텍스트 ${pct}%`
}
