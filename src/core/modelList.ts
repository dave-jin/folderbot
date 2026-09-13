/**
 * 모델 목록 — **고정해 두지 않고 기계에서 받아 온다** (2026-09-13 Dave:
 * *«선택 모델은 claude code 와 codex 모두 미리 설정에 fixed 하지 말고 정보를 받아와서 채워줘»*).
 *
 * 🔴 **박아 둔 목록은 반드시 낡는다.** 그리고 낡은 이름을 CLI 에 넘기면 그 계정에서 **모든 턴이
 *    죽는다** — 바로 앞 라운드의 사고가 그것이었다(`gpt-5.1-codex` / ChatGPT 계정).
 * ⚠ 파일 모양은 CLI 판마다 바뀐다. 그래서 **구조를 외우지 않는다** — JSON 을 통째로 훑어
 *    «모델 이름처럼 생긴 글자» 를 줍는다. 못 주우면 빌트인 목록으로 떨어진다(빈 칸보다 낫다).
 * ⛔ 아무 글자나 줍지 않는다 — 제공자마다 **이름 모양**이 정해져 있다(`MODEL_RE`).
 */

export const MODEL_RE: Record<'claude' | 'codex', RegExp> = {
  claude: /^claude-[a-z0-9][a-z0-9.\-]{2,48}$/i,
  // ⚠ **숫자가 하나는 있어야 한다**(`(?=.*\d)`) — 안 그러면 `codex`·`gpts` 같은 평범한 낱말이
  //    설정 파일 아무 데서나 «모델» 로 주워진다. 그리고 `gpt` 뒤는 `-` 로 시작할 수 있다.
  codex: /^(?=.*\d)(gpt|o\d|codex)[a-z0-9.\-]{1,40}$/i
}

/** JSON 아무 곳에서나 모델 이름을 줍는다 — 키 이름도, 값도 본다 */
export function extractModels(data: unknown, re: RegExp, cap = 40): string[] {
  const out = new Set<string>()
  const seen = new Set<unknown>()
  const walk = (v: unknown, depth: number): void => {
    if (out.size >= cap || depth > 8 || v == null) return
    if (typeof v === 'string') { if (re.test(v)) out.add(v); return }
    if (typeof v !== 'object') return
    if (seen.has(v)) return                 // ⚠ 고리가 있으면 여기서 멈춘다(설정 파일에 흔하다)
    seen.add(v)
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (re.test(k)) out.add(k)            // `{ "gpt-5-codex": {...} }` 처럼 **키가 이름**인 경우
      walk(x, depth + 1)
    }
  }
  walk(data, 0)
  return [...out]
}

/** `--model <M>` 도움말에 값 목록이 적혀 있으면 거기서도 줍는다 (`[possible values: a, b]`) */
export function modelsFromHelp(help: string, re: RegExp): string[] {
  const m = /possible values:\s*([^\]\n]+)/i.exec(help)
  if (!m) return []
  return m[1].split(/[,\s]+/).map((s) => s.trim()).filter((s) => re.test(s))
}

/**
 * 화면에 낼 목록 — **받아 온 것 먼저, 빌트인은 빈 자리를 메운다.**
 * ⚠ 받아 온 이름에는 설명이 없다 — 빌트인에 같은 이름이 있으면 그 설명을 빌려 쓴다.
 * ⚠ 맨 앞의 «CLI 기본»(빈 값)은 늘 남긴다 — 그게 가장 안전한 고름이다.
 */
export interface ModelOpt { v: string; t: string; d?: string }
export function mergeModels(found: string[], builtin: ModelOpt[], cap = 24): ModelOpt[] {
  const byV = new Map(builtin.map((o) => [o.v, o]))
  const out: ModelOpt[] = []
  const blank = builtin.find((o) => !o.v)
  if (blank) out.push(blank)
  for (const v of found) {
    if (out.some((o) => o.v === v)) continue
    const b = byV.get(v)
    out.push(b ?? { v, t: v })
    if (out.length >= cap) break
  }
  for (const b of builtin) {
    if (out.length >= cap) break
    if (!b.v || out.some((o) => o.v === b.v)) continue
    out.push(b)
  }
  return out
}
