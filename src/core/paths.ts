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
/** 파일명만 적힌 것(«설명서.pdf») — 알려진 확장자로 끝나는 낱말. 폴더는 호스트가 찾는다(봇 폴더 → 참조 폴더 → 볼트) (G · 2026-09-19) */
/** 알려진 확장자 — `BARE_RE` 와 「메일로 오인된 파일 이름」 판정이 **같은 목록**을 쓴다(두 벌이 되면 한쪽이 낡는다) */
export const FILE_EXT = 'pdf|png|jpe?g|gif|webp|svg|md|txt|docx?|pptx?|xlsx?|hwp|csv|json|zip|mp4|mov|key|numbers|pages|canvas'
const BARE_RE = new RegExp(String.raw`(?<![\/\w.\-@])[^\s/\`"'()\[\]<>|:]{1,120}\.(?:${FILE_EXT})(?![\w.\-])`, 'gi')

/**
 * 🔴 **AP · 파일 이름이 메일 주소로 오인돼 링크가 되는 것을 되돌린다** (2026-09-24 Dave · 스크린샷_2229).
 *
 * 맥 캡처 도구는 `CleanShot … PM@2x.png` 처럼 **`@` 가 든 이름**을 짓는다. 마크다운(GFM)은 그걸
 * `이름@도메인.확장자` 로 보고 **`<a href="mailto:PM@2x.png">`** 로 감싼다. 그러면 두 가지가 한꺼번에 망가진다 —
 *   ① 링크 안은 칩으로 안 바꾸므로 **파일 칩이 영영 안 생기고**
 *   ② 눌러도 파일이 아니라 **메일 앱이 뜬다.**
 * ⚠ 진짜 메일은 건드리지 않는다 — 끝이 **우리가 아는 파일 확장자**일 때만 되돌린다(`dave@example.com` 은 그대로).
 */
const MAILTO_FILE = new RegExp(String.raw`<a href="mailto:([^"]*\.(?:${FILE_EXT}))">([^<]*)</a>`, 'gi')
export function unlinkFileMailto(html: string): string {
  return String(html ?? '').replace(MAILTO_FILE, (m, href, text) => (String(text).trim() === String(href).trim() ? text : m))
}
export function bareFileNames(text: string, max = 20): string[] {
  if (!text) return []
  let masked = text
  for (const re of SKIP) masked = masked.replace(re, (m) => ' '.repeat(m.length))
  const out: string[] = []
  const push = (v: string) => { if (v && v.length <= 160 && !out.includes(v)) out.push(v) }
  for (const m of masked.matchAll(BARE_RE)) {
    const core = m[0], at = m.index ?? 0
    /**
     * 🔴 **AP · 이름에 띄어쓰기가 여럿이어도 통째로 잡는다** (2026-09-24 Dave · 스크린샷_2229 —
     *    `CleanShot 2026-09-24 at 10.25.19 PM@2x.png` 가 칩이 안 됐다). 맥 캡처 도구가 이렇게 짓는다.
     * ⚠ AK 에서 고친 것은 **슬래시가 든 경로**뿐이었고, 슬래시 없는 맨 이름에는 왼쪽으로 넓히는 길이
     *    **아예 없었다**(주석에는 있다고 적혀 있었다) — 공백에서 그냥 끊겨 없는 파일을 가리켰다.
     * ⚠ **어디까지가 이름인지는 글만 봐서는 못 정한다.** 그래서 정하지 않는다 — 1낱말·2낱말·… 변형을
     *    함께 내고 **호스트가 «있는 것» 을 고른다**(화면이 그중 가장 긴 것을 칩으로 쓴다).
     * ⚠ 멈추는 자리 셋 — ① `@`(적어 넣기 표식)를 만나면 그 뒤부터가 이름이고 거기서 끝 ② 다섯 낱말
     *    ③ 파일 이름에 못 오는 글자. 안 그러면 앞 문장을 통째로 삼킨다.
     */
    const vars: string[] = []
    let start = at
    for (let n = 0; n < 5; n++) {
      const w = /(\S+)[ \t]$/.exec(masked.slice(0, start))
      if (!w) break
      const word = w[1]
      if (/[/`"'()\[\]<>|:]/.test(word)) break
      start -= w[0].length
      vars.push(text.slice(start, at + core.length).replace(/^@/, ''))
      if (word.startsWith('@')) break                  // 적어 넣기 표식 — 여기가 이름의 시작이다
    }
    for (const v of vars.reverse()) push(v)             // 긴 것부터
    push(core)
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

export function candidatePaths(text: string, max = 20): string[] {
  if (!text) return []
  if (!text.includes('/')) return bareFileNames(text, max)
  let masked = text
  for (const re of SKIP) masked = masked.replace(re, (m) => ' '.repeat(m.length))
  const out: string[] = []
  const seen = new Set<string>()
  const push = (p: string) => { if (p && p.length <= 240 && !seen.has(p)) { seen.add(p); out.push(p) } }
  for (const b of bareFileNames(masked, max)) push(b)
  for (const m of masked.matchAll(CORE_RE)) {
    let core = m[0]; const at = m.index ?? 0
    core = core.replace(/[.,;:!?…]+$/, '')                      // 문장 끝 부호는 경로가 아니다
    if (core.endsWith('/')) core = core.slice(0, -1)             // «폴더/» 는 «폴더»
    if (!core || core === '/' || !/[^\s/]/.test(core)) continue
    // P-2 · 경로처럼 안 생긴 것은 후보도 아니다 — «3/5»·«10개/50MB»(숫자 조각뿐) · «A/B»(한 글자 조각뿐). 확장자가 있거나 절대 경로면 그대로
    if (!core.startsWith('/') && !/\.[A-Za-z0-9]{1,8}$/.test(core)) { const segs = core.split('/'); if (segs.every((g) => /^\d+[^\s/]{0,2}$/.test(g))) continue }
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
    /**
     * 🔴 **AK · 파일 이름의 공백을 넘어 이어 붙인다** (2026-09-24 Dave: *«파일명에 띄어쓰기가 되어 있거나 한글이
     *    있을 때 파일 칩이 제대로 안 보인다»*). 한글은 애초에 통과했고 — 막던 것은 **공백**이었다:
     *    `첨부/스크린샷 2026-09-23.png` 는 `첨부/스크린샷` 에서 끊겨, 있지도 않은 파일을 가리키는 칩이 됐다.
     *    절대 경로는 이미 오른쪽으로 넓히고 있었는데(바로 위) **상대 경로만 빠져 있었다.**
     * ⚠ 아무 낱말이나 삼키지 않는다 — 이어 붙일 조각이 **확장자로 끝날 때만**(`… .png`) 잇는다.
     */
    let rend = -1
    if (!/\.[A-Za-z0-9]{1,8}$/.test(core)) {
      let end = at + m[0].length
      for (let n = 0; n < 3; n++) {
        const tail = /^ ([^\s/`"'()\[\]]+)/.exec(masked.slice(end))
        if (!tail) break
        end += tail[0].length
        if (/\.[A-Za-z0-9]{1,8}$/.test(tail[1])) { rend = end; break }
      }
    }
    // 왼쪽으로 두 낱말까지 — `Area/…` → `3. Area/…`. **오른쪽으로 넓힌 끝과 조합한다** (둘 다 필요한 것이
    //   `2. Projects/…/01_기획 초안.md` 다 — 왼쪽엔 `2. `, 오른쪽엔 ` 초안.md` 가 붙는다). 긴 것부터 낸다.
    const left = masked.slice(0, at)
    const words = left.split(/(?<=\s)/).slice(-2).map((w) => w.trimStart())
    for (const e of rend > 0 ? [rend, at + core.length] : [at + core.length]) {
      for (let n = words.length; n >= 1; n--) {
        const pre = words.slice(-n).join('')
        if (!pre.trim() || /[/`"'()\[\]]/.test(pre) || pre.length > 40) continue
        push(text.slice(at - pre.length, e).replace(/[.,;:!?…]+$/, ''))
      }
      push(text.slice(at, e).replace(/[.,;:!?…]+$/, ''))
    }
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

/**
 * 절대 경로 → **봇 폴더 기준** 상대 경로 (C·D · 2026-09-19). 봇 폴더 안이면 그대로, 볼트 안·폴더 밖이면 `../` 로,
 * 볼트 밖이면 null(문서 창은 볼트 안만 연다). 호스트의 문서 API 는 `../` 섞인 rel 을 그대로 받는다.
 */
export function botRelOf(botAbs: string, root: string, abs: string): string | null {
  const inBot = relUnder(botAbs, abs); if (inBot !== null) return inBot
  const inVault = relUnder(root, abs); if (inVault === null) return null
  const fromBot = relUnder(root, botAbs); if (fromBot === null) return null
  const ups = fromBot ? fromBot.split('/').length : 0
  return `${'../'.repeat(ups)}${inVault}`
}
