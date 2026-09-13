/**
 * 파비콘 — 순수 로직 (2026-09-13 Dave: *«채팅 / 문서 / 입력화면에서 링크에 파비콘이 나오면 좋겠어»*).
 *
 * ⛔ 여기엔 네트워크도 파일도 없다(core 순수성). 실제로 받아 오는 것은 `host/favicon.ts`,
 *    화면에 얹는 것은 `client/favicons.ts` 다. 여기서 정하는 것은 셋뿐이다:
 *    ① 어느 호스트의 아이콘인가(= 캐시 키이자 요청 단위) ② HTML 에서 어느 `<link>` 를 고를까
 *    ③ 못 찾으면 어디로 물러설까.
 */

/** 맨 URL(자동링크) — 괄호·따옴표에서 끊는다. 마크다운 `(…)` 안의 링크가 닫는 괄호를 삼키지 않게 */
export const BARE_URL_RE = /\bhttps?:\/\/[^\s<>()[\]{}"'`]+/g

/**
 * 캐시 키 = 소문자 호스트. 🔴 **열 수 없는 것은 아이콘도 없다** — `mailto:`·상대경로·파일은 null.
 * ⚠ 호스트로 쓸 수 있는 글자만 통과시킨다. 이 값이 **파일 캐시 이름**으로도 쓰이므로 여기서 한 번에 막는다.
 */
export function faviconHost(url: string): string | null {
  const s = url.trim()
  if (!/^https?:\/\//i.test(s)) return null
  let host: string
  try { host = new URL(s).hostname.toLowerCase() } catch { return null }
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return null
  if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null
  return host
}

/**
 * 한 단계 위 도메인 — `raw.githubusercontent.com` 처럼 **자기 아이콘이 없는 하위 호스트**의 폴백.
 * ⚠ 공개 접미사 목록이 아니라 라벨 수로만 자르므로 **3라벨에서 멈춘다**(`a.b.co.kr` → `b.co.kr`).
 *    더 내려가면 `co.kr` 같은 남의 도메인을 찌른다.
 */
export function parentHost(host: string): string | null {
  const parts = host.split('.')
  if (parts.length <= 2) return null
  const next = parts.slice(1).join('.')
  return next.split('.').length < 2 ? null : next
}

export interface IconLink { href: string; rel: string; sizes: string; type: string }

/** HTML `<head>` 에서 아이콘 `<link>` 를 긁는다 — DOM 파서 없이(호스트에서 돈다) */
export function parseIconLinks(html: string): IconLink[] {
  const out: IconLink[] = []
  const tagRe = /<link\b[^>]*>/gi
  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    const tag = m[0]
    const rel = (attr(tag, 'rel') ?? '').toLowerCase()
    if (!/\bicon\b/.test(rel)) continue
    const href = attr(tag, 'href')
    if (!href) continue
    out.push({ href, rel, sizes: (attr(tag, 'sizes') ?? '').toLowerCase(), type: (attr(tag, 'type') ?? '').toLowerCase() })
  }
  return out
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : null
}

/**
 * 가장 쓸 만한 아이콘 하나. 화면에는 13px 로 그리므로 **32 이상 중 가장 작은 것** → 없으면 가장 큰 것.
 * ⛔ `mask-icon`(사파리 고정 탭)은 단색 실루엣이라 제외한다 — 넣으면 전부 까만 네모가 된다.
 */
export function bestIcon(links: IconLink[]): string | null {
  const ok = links.filter((l) => !/\bmask-icon\b/.test(l.rel))
  if (!ok.length) return null
  const px = (l: IconLink): number => {
    const m = /(\d+)x(\d+)/.exec(l.sizes)
    return m ? Number(m[1]) : /\bapple-touch-icon\b/.test(l.rel) ? 180 : 0
  }
  const big = ok.filter((l) => px(l) >= 32).sort((a, b) => px(a) - px(b))
  if (big.length) return big[0].href
  return ok.slice().sort((a, b) => px(b) - px(a))[0].href
}
