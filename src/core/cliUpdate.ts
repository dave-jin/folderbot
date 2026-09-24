/**
 * AJ · **CLI 가 낡아서 나는 고장은 화면이 먼저 말한다** (2026-09-24 Dave: *«claude 업데이트가 필요하다면
 * 모바일에서든 데스크톱에서든 claude 업데이트 메뉴가 떠야 돼 · 거기서 바로 진행할 수 있어야 하고»*).
 *
 * 🔴 **왜 필요한가** — 앱은 **호스트의 CLI** 로 돈다. 그 CLI 가 낡으면 새 모델이 400 으로 죽는데,
 *    그 사정은 **오류 글 안에만** 있었다(«Claude Code 2.1.278 does not support this model; version 2.1.280
 *    or newer is required»). 사람은 그 줄을 읽고 어느 기계에 들어가 무엇을 쳐야 하는지 스스로 알아내야 했다.
 * 🔴 판정은 **오류 글 하나**로 한다 — 「최신이 무엇인가」를 밖에 물으러 가지 않는다(네트워크·설치 방식마다 달라 못 믿는다).
 *    CLI 가 «몇 판이 필요하다» 고 정확히 말해 주므로 그 말이 정본이다.
 */

/** 「version 2.1.280 or newer is required」 에서 필요한 판을 읽는다 — 없으면 null */
export function requiredCliVersion(text?: string | null): string | null {
  const s = String(text ?? '')
  if (!/claude code/i.test(s) && !/does not support this model/i.test(s)) return null
  const m = /version\s+(\d+(?:\.\d+)+)\s+or\s+newer/i.exec(s)
  return m ? m[1] : null
}
/** 판 비교 — 글자가 아니라 숫자로 센다(`2.1.9` < `2.1.10`) */
export function cmpCliVersion(a: string, b: string): number {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d }
  return 0
}
/** 지금 판으로 그 모델을 못 돌리나 */
export function cliTooOld(current?: string | null, required?: string | null): boolean {
  if (!current || !required) return false
  return cmpCliVersion(current, required) < 0
}
/** 사람에게 보여 줄 한 줄 */
export function cliUpdateLine(current?: string | null, required?: string | null): string {
  return required ? `Claude CLI 가 낡았어요 — ${current ?? '?'} → ${required} 이상이 필요해요` : 'Claude CLI 를 올릴 수 있어요'
}
