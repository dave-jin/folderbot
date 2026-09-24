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
  /**
   * ⚠ **꼬리 글자를 먼저 뗀다** (AL · 2026-09-24 실측). `claude --version` 은 `"2.1.281 (Claude Code)"` 를 준다 —
   *    그대로 `.` 으로 쪼개면 마지막 조각이 `"281 (Claude Code)"` → `Number()` 가 `NaN` → `|| 0` 이라
   *    **2.1.281 과 2.1.278 이 «같다»고 나온다.** 그래서 앞머리의 숫자 판만 뽑는다.
   */
  const num = (v: string): number[] => (/\d+(?:\.\d+)*/.exec(String(v ?? ''))?.[0] ?? '').split('.').map(Number).map((n) => (Number.isFinite(n) ? n : 0))
  const pa = num(a), pb = num(b)
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

/**
 * 🔴 **AL · 여러 벌이 깔려 있으면 «가장 새 것» 을 쓴다** (2026-09-24 실측).
 *
 * Dave 의 맥에는 `claude` 가 **두 벌** 있었다 —
 *   `~/.local/bin/claude` → 2.1.278 (네이티브 설치본) · `/usr/local/bin/claude` → 2.1.281 (npm 전역).
 * 그런데 호스트는 **후보 경로를 순서대로 훑어 «먼저 있는 것»** 을 집었다. 그래서 늘 낡은 2.1.278 이 이겼고,
 * 그 번들에는 `claude-opus-5-5` 가 **아예 없어서** 모델 목록에 Opus 5.5 가 뜰 수가 없었다
 * (목록은 호스트 CLI 가 아는 것만 보여 준다 — AI 라운드에서 일부러 그렇게 했다).
 * ⛔ 재시작해도 같은 것을 다시 집으므로 **새로고침으로도 안 고쳐진다.** 고를 때 판을 봐야 한다.
 *
 * ⚠ 판을 못 읽은 후보(`null`)는 **진 것으로 친다** — 모르는 것을 위로 올리지 않는다.
 * ⚠ 판이 같으면 **먼저 온 것**이 이긴다(종전 선호 순서를 지킨다).
 */
export function pickNewestCli<T extends { bin: string; version: string | null }>(cands: T[]): T | null {
  let best: T | null = null
  for (const c of cands) {
    if (!c?.bin) continue
    if (!best) { best = c; continue }
    if (!c.version) continue
    if (!best.version || cmpCliVersion(c.version, best.version) > 0) best = c
  }
  return best
}

/**
 * AL · 화면에 쓸 **짧은 판 이름**. `claude --version` 은 `"2.1.281 (Claude Code)"` 를 주고,
 * 스텁·이상한 CLI 는 **JSON 한 줄을 통째로** 뱉기도 한다(실측: 모델 시트 맨 아래 줄이 세 줄로 깨졌다).
 * 숫자 판만 뽑고, 못 찾으면 빈 문자열 — **못 읽은 것을 그럴듯한 말로 채우지 않는다.**
 */
export function cliVersionShort(v?: string | null): string {
  return /\d+(?:\.\d+)+/.exec(String(v ?? ''))?.[0] ?? ''
}
