/**
 * 링크 미리보기 — 순수 로직 (2026-09-13 Dave: *«링크와 첨부 모두 rondo 처럼 채팅 안에 박스로
 * 만들어지고 그 박스에 마우스 오버했을때 미리보기가 되어야해»*).
 *
 * ⛔ 여기엔 네트워크가 없다(core 순수성). 받아 오는 것은 `host/preview.ts`, 그리는 것은
 *    `client/previews.ts` 다. 여기서 정하는 것은 «받아 온 HTML 에서 무엇을 고를까» 하나뿐이다.
 * ⚠ **DOM 파서를 쓰지 않는다** — 이 코드는 호스트(Node)에서도 돈다. `favicon.ts` 와 같은 수법으로
 *    태그를 정규식으로 훑는다. 남의 HTML 이 깨져 있어도 여기서 멈추면 안 되므로 **모두 옵셔널**이다.
 */

export interface LinkMeta {
  url: string
  host: string
  title: string
  desc: string
  image: string | null
  site: string
}

/** `<meta>` 한 벌에서 골라 쓰는 순서 — og → twitter → 평범한 것 */
const PICK = {
  title: ['og:title', 'twitter:title'],
  desc: ['og:description', 'twitter:description', 'description'],
  image: ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src'],
  site: ['og:site_name', 'application-name']
}

export function parseMeta(html: string): { title: string; desc: string; image: string | null; site: string } {
  const metas = collectMetas(html)
  const first = (keys: string[]): string => { for (const k of keys) { const v = metas.get(k); if (v) return v } return '' }
  const title = first(PICK.title) || tagText(html, 'title')
  return { title: clean(title), desc: clean(first(PICK.desc)), image: first(PICK.image) || null, site: clean(first(PICK.site)) }
}

/** `property`·`name`·`itemprop` 중 무엇으로 적혔든 같은 통에 넣는다 — 사이트마다 다르게 쓴다 */
function collectMetas(html: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /<meta\b[^>]*>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const tag = m[0]
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop') ?? '').toLowerCase()
    const val = attr(tag, 'content')
    if (!key || !val) continue
    if (!out.has(key)) out.set(key, val) // ⚠ 먼저 나온 것이 이긴다 — 본문 뒤쪽의 광고용 메타에 안 밀리게
  }
  return out
}

function tagText(html: string, name: string): string {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(html)
  return m ? m[1] : ''
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" }
/** 엔티티를 풀고 줄바꿈·연속 공백을 한 칸으로. ⚠ 안 풀면 제목에 `&amp;` 가 그대로 보인다 */
export function clean(s: string): string {
  return s
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, e: string) => {
      const k = e.toLowerCase()
      if (ENT[k]) return ENT[k]
      if (k.startsWith('#x')) { const n = parseInt(k.slice(2), 16); return Number.isFinite(n) ? String.fromCodePoint(n) : all }
      if (k.startsWith('#')) { const n = Number(k.slice(1)); return Number.isFinite(n) ? String.fromCodePoint(n) : all }
      return all
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** 주소만 보고 만드는 최소 미리보기 — 받아오기 전에도, 끝내 못 받아도 박스가 비지 않는다 */
export function fallbackMeta(url: string): LinkMeta | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (!/^https?:$/.test(u.protocol)) return null
  const path = decodeURIComponent(u.pathname).replace(/\/$/, '')
  return { url, host: u.hostname.replace(/^www\./, ''), title: path.split('/').filter(Boolean).pop() ?? u.hostname, desc: '', image: null, site: '' }
}
