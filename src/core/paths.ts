/**
 * 답변 속 «경로처럼 보이는 글자» 찾기 — 채팅에서 문서로 바로 건너가기 위한 것.
 *
 * 🔴 **여기서는 «있을 법한 것» 만 고른다. 실제로 있는지는 호스트가 답한다.**
 *    확인 없이 칩을 만들면 죽은 링크가 대화에 쌓이고, 한 번 눌러 본 사람은 다시 안 누른다.
 * ⛔ **URL 을 집지 않는다** — `https://…` 는 이미 링크고, 여기서 또 집으면 링크 위에 링크가 된다.
 * ⛔ **코드·인용 안은 건드리지 않는다** — 그건 화면 쪽(`Md`)이 DOM 을 걸을 때 거른다.
 *    이 함수는 순수하게 «후보 문자열» 만 낸다.
 */

/** 공백 없는 뼈대 — `Area/제품/todo.md` 처럼 확장자로 끝나는 마디 사슬 */
const CORE_RE = /(?:[^\s/`"'()\[\]]+\/)+[^\s/`"'()\[\]]+\.[A-Za-z0-9]{1,8}/g

/** 링크·코드로 이미 쓰인 자리는 후보에서 뺀다 */
const SKIP = [
  /`[^`]*`/g,                 // 인라인 코드
  /```[\s\S]*?```/g,          // 펜스 코드
  /\]\([^)]*\)/g,             // 마크다운 링크의 목적지
  /\bhttps?:\/\/\S+/g,        // URL
  /\bfile:\/\/\S+/g
]

/**
 * 본문에서 경로 후보를 뽑는다 — 나온 순서대로, 한 자리에서는 **긴 것부터**.
 *
 * 🔴 **PARA 폴더 이름에는 공백이 있다**(`3. Area`, `2. Projects`). 공백을 통째로 허용하면 앞 문장까지
 *    삼키므로, 공백 없는 뼈대를 먼저 잡고 **왼쪽으로 최대 두 낱말까지 넓힌 변형**을 함께 낸다.
 *    어느 쪽이 진짜인지는 여기서 정하지 않는다 — **호스트가 «있는 것» 을 골라 준다.**
 * @param max 한 답에서 만들 칩의 상한. 너무 많으면 그것대로 시끄럽다.
 */
export function candidatePaths(text: string, max = 12): string[] {
  if (!text || !text.includes('/')) return []
  let masked = text
  for (const re of SKIP) masked = masked.replace(re, (m) => ' '.repeat(m.length))
  const out: string[] = []
  const seen = new Set<string>()
  const push = (p: string) => { if (p && p.length <= 240 && !seen.has(p)) { seen.add(p); out.push(p) } }
  for (const m of masked.matchAll(CORE_RE)) {
    const core = m[0]; const at = m.index ?? 0
    // 왼쪽으로 두 낱말까지 — `Area/…` → `3. Area/…`
    const left = masked.slice(0, at)
    const words = left.split(/(?<=\s)/).slice(-2).map((w) => w.trimStart())
    for (let n = words.length; n >= 1; n--) {
      const pre = words.slice(-n).join('')
      if (!pre.trim() || /[/`"'()\[\]]/.test(pre) || pre.length > 40) continue
      push(text.slice(at - pre.length, at + core.length))
    }
    push(core)
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

/** 절대 경로를 볼트(또는 봇 폴더) 기준 상대 경로로 — 밖이면 null */
export function relUnder(base: string, p: string): string | null {
  const b = base.replace(/\/+$/, '').normalize('NFC')
  const q = p.normalize('NFC')
  if (q === b) return ''
  if (q.startsWith(b + '/')) return q.slice(b.length + 1)
  return null
}
