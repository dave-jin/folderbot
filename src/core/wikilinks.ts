/**
 * 위키링크 (K-1 · 2026-09-19) — `![[그림.png]]` · `[[노트]]` · `[[노트|별명]]` 을 마크다운이 그릴 수 있는 HTML 로 바꾼다.
 *
 * 🔴 **채팅과 문서 창이 같은 함수를 쓴다.** 한쪽에만 규칙을 두면 «문서에서는 그림인데 채팅에서는 대괄호» 가 된다(스크린샷 1236).
 * 🔴 **코드 안은 손대지 않는다** — 펜스(```)와 인라인(`…`) 안의 `[[ ]]` 는 예시다. 마스킹이 아니라 **조각을 갈라** 코드 조각은 그대로 잇는다.
 * ⚠ 여기서는 **이름만** 단다(`data-wiki`). 어디에 있는지(rel)·있는지는 호스트가 답하므로, 화면이 그린 뒤 `/exists` 로 채운다 —
 *    순수 함수를 유지해야 문서 창(인쇄 사본)과 유닛테스트가 그대로 쓸 수 있다.
 */
const WIKI = /(!?)\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]*))?\]\]/g
const IMG_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)$/i

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

/** 코드(펜스·인라인) 밖의 조각에만 `f` 를 적용한다 */
export function outsideCode(md: string, f: (s: string) => string): string {
  const out: string[] = []
  const re = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g
  let last = 0; let m: RegExpExecArray | null
  while ((m = re.exec(md))) { out.push(f(md.slice(last, m.index)), m[0]); last = m.index + m[0].length }
  out.push(f(md.slice(last)))
  return out.join('')
}

/** `![[x]]`·`[[x]]` 이름 목록(코드 밖, 중복 제거, 순서대로) */
export function wikiNames(md: string): string[] {
  const names: string[] = []; const seen = new Set<string>()
  outsideCode(md, (s) => { for (const m of s.matchAll(WIKI)) { const n = m[2].trim(); if (n && !seen.has(n)) { seen.add(n); names.push(n) } } return s })
  return names
}

/**
 * 위키링크 → HTML. `![[x.png]]` 은 `<img class="wimg" data-wiki="x.png" alt="x.png">`(src 는 호스트가 찾은 뒤),
 * `[[노트]]`·`[[노트|별명]]` 은 `<a class="wlink" data-wiki="노트">별명</a>`. 그림 확장자가 아닌 `![[문서.md]]` 는 링크로 둔다.
 */
export function expandWikilinks(md: string): string {
  return outsideCode(md, (s) => s.replace(WIKI, (_m, bang: string, raw: string, alias?: string) => {
    const name = raw.trim(); if (!name) return _m
    const label = (alias ?? '').trim() || name.replace(/^.*\//, '')
    if (bang && IMG_EXT.test(name)) return `<img class="wimg" data-wiki="${esc(name)}" alt="${esc(name)}">`
    return `<a class="wlink" data-wiki="${esc(name)}">${esc(label)}</a>`
  }))
}
