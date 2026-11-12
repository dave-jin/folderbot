/**
 * 🔴 **BM-4 · 답 속 HTML 거르개** (2026-11-12 Dave 결정 «정해진 블록 + 격리된 미니 창» — 날 HTML 은 걸러 낸다).
 *
 * 봇 답(마크다운)에 섞인 HTML 이 화면에 그대로 심겼다 — 스모크에서 `<img onerror>` 가 실제로 실행됐다.
 * 웹 글을 요약하다 끌려온 HTML 이 화면의 토큰에 닿을 수 있다.
 *
 * **원칙 하나: 전부 글자로 돌리고, 허용한 태그만 우리가 다시 짓는다.**
 *   - `<` 는 기본이 `&lt;` 다. 그 자리에서 «온전한 태그 꼴» 이 읽히고 이름이 허용 목록에 있을 때만 태그를 낸다.
 *   - 허용 태그도 **원문을 통과시키지 않는다** — 속성을 읽어 허용한 것만 `이름="값"` 으로 다시 쓴다.
 *     그래서 출력에 있는 태그는 전부 이 파일이 지은 것이다(`on*`·`style`·`id` 가 샐 길이 없다).
 *   - 닫힌 주석(`<!-- … -->`)은 통째로 지운다(내용을 내지 않는다).
 *   - 못 읽는 꼴(닫히지 않은 태그 · 닫히지 않은 주석 · `<!` · `<?`)은 `<` 한 글자만 글자로 바꾸고 **바로 다음 글자부터 다시 읽는다** —
 *     `<x <script>` 처럼 겹친 것도 하나씩 판정된다.
 *
 * ⚠ DOM 을 쓰지 않는다 — `renderMarkdown` 은 node 유닛(`render.test.ts`)에서도 돈다.
 * ⚠ 속성 순서는 원문 그대로 둔다 — 같은 입력이면 같은 출력(K-1)이고, 위키링크가 내는 `<img class="wimg" data-wiki=…>` 가 글자 그대로 남는다.
 * ⚠ KaTeX·mermaid 가 만든 HTML 은 여기를 지나지 않는다(수식은 거른 **뒤**에 끼우고, mermaid 는 그린 뒤 DOM 에서 바꾼다).
 */

/** 속성 없이도 뜻이 있는 글 태그 — marked 가 내는 것 + 글에 흔한 것 */
const TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'br', 'em', 'strong', 'del', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input', 'details', 'summary', 'kbd', 'sub', 'sup', 'mark', 'span', 'div', 'u', 's', 'b', 'i', 'small'])
/** 닫는 태그가 없는 것 — `</br>` 같은 것은 버린다 */
const VOID = new Set(['hr', 'br', 'img', 'input'])
/** 태그별 허용 속성(공통 `title` · `class` 는 아래에서 따로 본다) */
const ATTRS: Record<string, string[]> = {
  a: ['href', 'data-wiki'],
  img: ['src', 'alt', 'width', 'height', 'data-wiki'],
  th: ['align', 'colspan', 'rowspan'], td: ['align', 'colspan', 'rowspan'],
  ol: ['start'], details: ['open'], input: ['type', 'checked', 'disabled']
}
/** 🔴 `class` 는 우리 화면이 아는 것만 — 봇 답이 `class="card"` 로 권한 카드 모양을 흉내 내지 못하게 */
const CLASS_OK = /^(?:language-[\w+#.-]{1,40}|wlink|wimg|mathsrc|task-list-item|contains-task-list)$/
const SCHEME_OK = new Set(['http', 'https', 'mailto', 'tel'])
const DATA_IMG = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]*$/i

// 온전한 태그 한 개 — 따옴표 안의 `>` 는 태그를 닫지 않는다. `y`(sticky)로 «바로 이 자리» 에서만 읽는다.
const TAG_AT = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+(?:[^"'>]|"[^"]*"|'[^']*')*)?)\s*\/?>/y
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** 수식 자리표(core/math `placeholder`) — 속성 값 안에 남으면 거른 **뒤** KaTeX HTML 이 속성 안에 끼워져 마크업이 깨진다(`![$a$](x.png)` 의 alt) */
const MATH_PH = /\uE000\d+\uE001/g
const escAttr = (v: string) => v.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 브라우저가 속성 값에서 푸는 엔티티를 **한 번만** 푼다 — `jav&#x61;script:` 를 그대로 두면 검사를 지나간다.
 * ⚠ `&amp;` 는 글자 `&` 다 — 스킴 글자가 아니므로 검사용 자리표(`|`)로 바꾼다. 다시 풀지 않는다(`&amp;colon;` 은 글자 «&colon;» 이지 `:` 이 아니다).
 *    그래서 `[R&D](R&D.md)`(marked 가 `R&amp;D.md` 로 낸다)가 살아남는다. 이름 엔티티는 그대로 둔다 — 아래에서 주소 앞부분에 남아 있으면 버린다.
 */
function decodeOnce(v: string): string {
  return v.replace(/&(#x[0-9a-f]+|#[0-9]+|amp);?/gi, (_m, n: string) => {
    if (n[0] !== '#') return '|'
    const c = n[1] === 'x' || n[1] === 'X' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10)
    return Number.isFinite(c) && c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''
  })
}

/**
 * 주소 값이 안전한가 — http(s) · mailto · tel · 상대 경로 · `#`. 그림만 `data:image/…;base64` 를 더 받는다.
 * ⚠ 브라우저는 주소 앞의 공백·제어문자를 버리고, 스킴 가운데 낀 탭·줄바꿈도 버린다 — 같은 식으로 깎은 뒤 본다.
 * ⚠ 스킴 자리에 이름 엔티티(`&colon;` · `&Tab;`)가 남아 있으면 무엇으로 풀릴지 여기서 다 알 수 없다 — 버린다.
 */
export function safeUrl(raw: string, img = false): boolean {
  const v = decodeOnce(raw).replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '')
  if (!v) return true
  const head = v.split(/[/?#]/, 1)[0]
  if (/&[a-z]/i.test(head)) return false   // 풀리지 않은 이름 엔티티(`&colon;` · `&Tab;`)가 스킴 자리에 있다
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v)
  if (!m) return true   // 상대 경로 · `#자리` · `//host` (지금 화면의 스킴을 따른다)
  const scheme = m[1].toLowerCase()
  if (SCHEME_OK.has(scheme)) return true
  return img && scheme === 'data' && DATA_IMG.test(v)
}

function buildTag(name: string, rawAttrs: string): string | null {
  const allow = ATTRS[name] ?? []
  const out: string[] = []; const seen = new Set<string>()
  let type = ''
  ATTR.lastIndex = 0
  for (let m = ATTR.exec(rawAttrs); m; m = ATTR.exec(rawAttrs)) {
    const key = m[1].toLowerCase(); const val = (m[2] ?? m[3] ?? m[4] ?? '').replace(MATH_PH, '')
    if (seen.has(key)) continue   // 같은 속성이 둘이면 브라우저는 앞의 것을 쓴다 — 우리도 앞의 것만
    seen.add(key)
    if (key === 'class') { const cls = val.split(/\s+/).filter((c) => CLASS_OK.test(c)); if (cls.length) out.push(`class="${cls.join(' ')}"`); continue }
    if (key === 'title') { out.push(`title="${escAttr(val)}"`); continue }
    if (!allow.includes(key)) continue
    if (key === 'href') { if (safeUrl(val)) out.push(`href="${escAttr(val)}"`); continue }
    if (key === 'src') { if (safeUrl(val, true)) out.push(`src="${escAttr(val)}"`); continue }
    if (key === 'width' || key === 'height' || key === 'colspan' || key === 'rowspan' || key === 'start') { if (/^\d{1,4}$/.test(val)) out.push(`${key}="${val}"`); continue }
    if (key === 'align') { if (/^(left|right|center)$/i.test(val)) out.push(`align="${val.toLowerCase()}"`); continue }
    if (key === 'type') { type = val.toLowerCase(); if (type === 'checkbox') out.push('type="checkbox"'); continue }
    if (key === 'checked' || key === 'disabled' || key === 'open') { out.push(`${key}=""`); continue }
    out.push(`${key}="${escAttr(val)}"`)   // alt · data-wiki
  }
  if (name === 'input') { if (type !== 'checkbox') return null; if (!seen.has('disabled')) out.push('disabled=""') }   // 체크박스만 · 늘 눌리지 않게
  return `<${name}${out.length ? ' ' + out.join(' ') : ''}>`
}

export function sanitizeHtml(html: string): string {
  if (!html.includes('<')) return html
  let out = ''; let i = 0
  for (;;) {
    const lt = html.indexOf('<', i)
    if (lt < 0) { out += html.slice(i); break }
    out += html.slice(i, lt)
    // 주석은 통째로 지운다 — 글자로 돌리면 봇이 인용한 todo 줄의 `<!-- bot -->` 꼬리표가 화면에 드러난다(거르기 전에는 안 보이던 것). 닫히지 않은 주석은 아래에서 글자가 된다
    if (html.startsWith('<!--', lt)) { const end = html.indexOf('-->', lt + 4); if (end >= 0) { i = end + 3; continue } }
    TAG_AT.lastIndex = lt
    const m = TAG_AT.exec(html)
    const name = m ? m[2].toLowerCase() : ''
    if (!m || !TAGS.has(name)) { out += '&lt;'; i = lt + 1; continue }
    if (m[1]) { out += VOID.has(name) ? '' : `</${name}>`; i = lt + m[0].length; continue }
    const built = buildTag(name, m[3] ?? '')
    if (built === null) { out += '&lt;'; i = lt + 1; continue }
    out += built; i = lt + m[0].length
  }
  return out
}
