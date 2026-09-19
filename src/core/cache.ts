/**
 * 원격 사본 캐시 정리 (M · 2026-09-19) — 상한(기본 2GB)을 넘으면 **오래 안 쓴 것부터** 지운다.
 * 판정은 순수 함수 하나 — 셸(localfs)은 목록을 주고 돌려받은 경로만 지운다.
 */
export interface CacheEntry { path: string; size: number; atime: number }
export const CACHE_LIMIT = 2 * 1024 * 1024 * 1024
/** 지울 경로 목록 — 합계가 limit 아래로 내려올 때까지 atime 오래된 순 */
export function evictPlan(entries: CacheEntry[], limit = CACHE_LIMIT): string[] {
  let total = entries.reduce((a, e) => a + e.size, 0)
  if (total <= limit) return []
  const out: string[] = []
  for (const e of [...entries].sort((a, b) => a.atime - b.atime)) { if (total <= limit) break; out.push(e.path); total -= e.size }
  return out
}
export function fmtBytes(n: number): string { return n >= 1e9 ? `${(n / 1e9).toFixed(1)}GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}MB` : n >= 1e3 ? `${Math.round(n / 1e3)}KB` : `${n}B` }
/** 남은 시간(초) — 속도 0 이면 null */
export function eta(done: number, total: number, bytesPerSec: number): number | null { return bytesPerSec > 0 && total > done ? Math.round((total - done) / bytesPerSec) : null }
