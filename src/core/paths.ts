/**
 * 답변 속 «경로처럼 보이는 글자» 찾기 — 채팅에서 문서로 바로 건너가기 위한 것.
 *
 * 🔴 **여기서는 «있을 법한 것» 만 고른다. 실제로 있는지는 호스트가 답한다.**
 *    확인 없이 칩을 만들면 죽은 링크가 대화에 쌓이고, 한 번 눌러 본 사람은 다시 안 누른다.
 * ⛔ **URL 을 집지 않는다** — `https://…` 는 이미 링크고, 여기서 또 집으면 링크 위에 링크가 된다.
 *
 * 🔴 **인라인 코드 안의 경로는 «집는다»** (2026-09-15 Dave: *«답변 내용안에는 바로 클릭가능한 칩이 없어»*).
 *    종전에는 `` `…` `` 안을 통째로 걸렀는데 — **에이전트는 파일 이름을 거의 언제나 백틱으로 감싼다.**
 *    그래서 「칩이 되는 경로」가 실제 답변에서는 거의 안 생겼다(스스로 만든 사각지대였다).
 *    백틱은 **글자 하나짜리 울타리**일 뿐이므로 공백으로 바꿔 놓고 본다 — 그래야 `` `3. Area/…` `` 처럼
 *    백틱 바로 뒤에서 시작하는 경로도 왼쪽 낱말(`3. `)까지 제대로 넓혀진다.
 * ⛔ **펜스 코드(```)는 여전히 안 건드린다** — 거긴 예시 코드지 이 볼트의 파일이 아니다.
 */

/**
 * 공백 없는 뼈대 — 마디 사슬. 🔴 **파일뿐 아니라 폴더도, 상대뿐 아니라 절대도** (2026-09-15 Dave:
 * *«채팅 본문에서 폴더 및 파일 칩 … 구현이 안되어 있어»*). 종전 규칙은 «확장자로 끝나는 상대 경로» 만
 * 잡아서, 에이전트가 흔히 쓰는 `/Users/…/PARA/3. Area/x.md`(절대) 와 `2. Projects/2026-09_강의`(폴더) 가
 * 후보조차 안 됐다. 폴더 후보는 시끄럽지만(«입력/출력» 도 걸린다) **있는지는 호스트가 가른다** — 없는 건
 * 칩이 안 된다. 여기서 미리 거르려 들면 진짜 폴더까지 같이 잃는다.
 */
const CORE_RE = /\/?(?:[^\s/`"'()\[\]]+\/)+[^\s/`"'()\[\]]*/g

/** 링크·펜스 코드로 이미 쓰인 자리는 후보에서 뺀다 (길이는 그대로 두고 공백으로 덮는다) */
const SKIP = [
  /```[\s\S]*?```/g,          // 펜스 코드 — 예시 코드지 이 볼트의 파일이 아니다
  /\]\([^)]*\)/g,             // 마크다운 링크의 목적지
  /\bhttps?:\/\/\S+/g,        // URL
  /\bfile:\/\/\S+/g,
  /`/g                        // ⚠ 인라인 코드는 **울타리만** 지운다 — 안쪽 경로는 후보로 남는다
]

/**
 * 본문에서 경로 후보를 뽑는다 — 나온 순서대로, 한 자리에서는 **긴 것부터**.
 *
 * 🔴 **PARA 폴더 이름에는 공백이 있다**(`3. Area`, `2. Projects`). 공백을 통째로 허용하면 앞 문장까지
 *    삼키므로, 공백 없는 뼈대를 먼저 잡고 **왼쪽으로 최대 두 낱말까지 넓힌 변형**을 함께 낸다.
 *    어느 쪽이 진짜인지는 여기서 정하지 않는다 — **호스트가 «있는 것» 을 골라 준다.**
 * @param max 한 답에서 만들 칩의 상한. 너무 많으면 그것대로 시끄럽다.
 */
export function candidatePaths(text: string, max = 20): string[] {
  if (!text || !text.includes('/')) return []
  let masked = text
  for (const re of SKIP) masked = masked.replace(re, (m) => ' '.repeat(m.length))
  const out: string[] = []
  const seen = new Set<string>()
  const push = (p: string) => { if (p && p.length <= 240 && !seen.has(p)) { seen.add(p); out.push(p) } }
  for (const m of masked.matchAll(CORE_RE)) {
    let core = m[0]; const at = m.index ?? 0
    core = core.replace(/[.,;:!?…]+$/, '')                      // 문장 끝 부호는 경로가 아니다
    if (core.endsWith('/')) core = core.slice(0, -1)             // «폴더/» 는 «폴더»
    if (!core || core === '/' || !/[^\s/]/.test(core)) continue
    // ⚠ 절대 경로는 왼쪽이 아니라 **오른쪽**으로 넓힌다 — 앞의 낱말은 문장이고, 뒤의 낱말이 «3. Area» 의 나머지다.
    //   `/Users/…/PARA/3. Area/x.md` 는 공백에서 끊기므로 다음 낱말을 최대 세 번 이어 붙인 변형을 **긴 것부터** 낸다.
    if (core.startsWith('/')) {
      const exts: string[] = []
      let end = at + m[0].length
      for (let n = 0; n < 3; n++) {
        const tail = /^ ([^\s/`"'()\[\]]+(?:\/[^\s`"'()\[\]]*)*)/.exec(masked.slice(end))
        // ⚠ 이어 붙일 낱말은 «경로처럼 생겨야» 한다(슬래시나 확장자) — 아니면 뒤따르는 문장까지 삼킨다
        if (!tail || !(/\//.test(tail[1]) || /\.[A-Za-z0-9]{1,8}$/.test(tail[1]))) break
        end += tail[0].length
        exts.push(text.slice(at, end).replace(/[.,;:!?…]+$/, '').replace(/\/$/, ''))
      }
      for (const e of exts.reverse()) push(e)
      push(core); if (out.length >= max) break; continue
    }
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
