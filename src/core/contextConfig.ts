/**
 * 설정 › 세션 · 사용량 «상황판» 의 저장 본문 검사 — `POST /api/context/config` (2026-11-01).
 * `off` 는 참·거짓, `dailyCap` 은 1 이상의 정수 또는 `null`(비움 = 키를 지워 호스트 기본값 500 · Ruling 16). 둘 다 없으면 거절.
 */
export type ContextConfigPatch = { off?: boolean; dailyCap?: number | null }

export function contextConfigBody(b: Record<string, unknown>): ContextConfigPatch | { error: string } {
  const o: ContextConfigPatch = {}
  if (b.off !== undefined) { if (typeof b.off !== 'boolean') return { error: 'off 는 참·거짓' }; o.off = b.off }
  if (b.dailyCap !== undefined) {
    const n = b.dailyCap
    if (n === null) o.dailyCap = null
    else if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return { error: 'dailyCap 은 1 이상의 정수(비우려면 null)' }
    else o.dailyCap = n
  }
  if (!Object.keys(o).length) return { error: 'off 나 dailyCap 이 필요해요' }
  return o
}
