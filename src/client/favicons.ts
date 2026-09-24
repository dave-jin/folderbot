import { faviconHost } from '../core/favicon'
import { api } from './api'

/**
 * 파비콘 — 화면 쪽 창구 하나 (2026-09-13 Dave).
 *
 * 🔴 **세 곳(채팅 · 문서 · 입력창)이 같은 캐시를 본다.** 각자 받아 오면 같은 호스트를 세 번 두드리고,
 *    무엇보다 **한 화면 안에서 아이콘이 서로 다른 순간에 나타난다**(같은 링크가 문서엔 있고 채팅엔 없는 상태).
 * ⚠ **자리를 비워 두지 않는다.** 먼저 지구본 자리표시자를 그리고 그 자리에 아이콘이 들어온다 —
 *    비워 두면 아이콘이 도착할 때마다 글줄이 옆으로 밀린다(링크가 여럿인 문단에서 특히 사납다).
 *
 * 상태는 셋이다 — `undefined` 아직 모름 · `string` data URL · `null` 없음(자리표시자로 남는다).
 */

const cache = new Map<string, string | null>()
const asked = new Set<string>()
const waiting = new Map<string, Set<(d: string | null) => void>>()

/** 캐시에 있는 값만. 그리는 쪽은 이걸로 **첫 프레임부터** 아이콘을 낸다 */
export function faviconNow(url: string): string | null | undefined {
  const host = faviconHost(url)
  return host ? cache.get(host) : null
}

/** 아직 안 받았으면 받아온다. 같은 호스트는 한 번만 — 링크가 100개여도 도메인 수만큼만 나간다 */
export function requestFavicon(url: string): void {
  const host = faviconHost(url)
  if (!host || cache.has(host) || asked.has(host)) return
  asked.add(host)
  void api<{ data: string | null }>(`/favicon?url=${encodeURIComponent(url)}`)
    .then((r) => settle(host, r.data ?? null))
    .catch(() => settle(host, null))
}

function settle(host: string, data: string | null): void {
  cache.set(host, data)
  const subs = waiting.get(host)
  waiting.delete(host)
  if (subs) for (const cb of subs) cb(data)
}

/** 이 호스트의 아이콘이 정해지면 한 번 알려 준다. ⚠ 값은 호스트당 한 번만 정해지므로 알린 뒤 목록을 버린다 */
export function onFavicon(url: string, cb: (d: string | null) => void): () => void {
  const host = faviconHost(url)
  if (!host) return () => {}
  if (cache.has(host)) { cb(cache.get(host) ?? null); return () => {} }
  let set = waiting.get(host)
  if (!set) { set = new Set(); waiting.set(host, set) }
  set.add(cb)
  requestFavicon(url)
  return () => { set?.delete(cb) }
}

/**
 * 지구본 — 아이콘이 오기 전에도, 끝내 없어도 이 자리가 유지된다.
 * ⚠ 색은 `#666` 그대로 쓴다 — `encodeURIComponent` 가 알아서 `%23` 으로 바꾼다. 종전에는 `%23666` 을 넣어 **두 번** 인코딩돼
 *    SVG 가 `stroke="%23666"`(틀린 색)을 받았고, 선이 안 그려져 **빈칸**만 남았다(2026-09-25 디자인 검수 실측).
 */
export const GLOBE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#666" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M2.2 8h11.6M8 2.2c3 3.4 3 8.2 0 11.6M8 2.2c-3 3.4-3 8.2 0 11.6"/></svg>'
)

/**
 * 링크 앞에 아이콘을 붙인다 — 이미 붙은 것은 건너뛴다.
 * ⚠ DOM 을 직접 만지는 이유: 답변 본문은 `marked` 가 만든 HTML 이라 React 노드가 아니다.
 */
export function decorateLinks(root: HTMLElement): void {
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) {
    if (a.dataset.fv) continue
    const host = faviconHost(a.href)
    if (!host) continue
    a.dataset.fv = '1'
    const img = document.createElement('img')
    img.className = 'fvic'; img.alt = ''; img.width = 13; img.height = 13
    const now = faviconNow(a.href)
    img.src = now ?? GLOBE
    a.insertBefore(img, a.firstChild)
    keepWithText(a, img)
    if (now === undefined) onFavicon(a.href, (d) => { if (d) img.src = d })
  }
}

/**
 * 🔴 **아이콘은 링크 글자와 같은 줄에 선다** (2026-09-25 디자인 검수 · 폰 채팅 실측). 그림과 글자 사이는 줄이 바뀔 수 있는 자리라,
 *    링크가 줄 끝에 걸리면 아이콘(과 밑줄 한 토막)만 윗줄 끝에 남고 주소는 아랫줄로 떨어졌다.
 *    아이콘과 **첫 글자 하나**만 줄바꿈 없는 묶음에 넣는다 — 링크 전체를 묶으면 긴 주소가 폰 폭을 뚫는다.
 * ⚠ U+2060(단어 결합 문자)은 그림 옆에서 안 먹는다(Chromium 실측) — 그래서 묶음을 쓴다.
 */
function keepWithText(a: HTMLElement, img: HTMLImageElement): void {
  const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT)
  let t = w.nextNode() as Text | null
  while (t && !t.data.trim()) t = w.nextNode() as Text | null
  // ⚠ 첫 글자가 `<code>`·`<strong>` 같은 요소 안이면 묶지 않는다 — 아이콘이 그 요소 안으로 들어가 코드 바탕을 입는다
  if (!t || t.parentNode !== a) return
  const lead = t.data.length - t.data.trimStart().length
  // 첫 **글자**(grapheme) — 코드 포인트로 자르면 이모지·NFD 한글이 묶음 경계에서 둘로 갈린다 (리뷰)
  const body = t.data.slice(lead)
  const first = (typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(body)[Symbol.iterator]().next().value?.segment : Array.from(body)[0]) ?? ''
  t.splitText(lead + first.length)          // t 에는 «앞 공백 + 첫 글자» 만 남는다
  const head = t.data.slice(lead)
  t.data = t.data.slice(0, lead)
  const span = document.createElement('span'); span.className = 'fvw'
  span.append(img, head)
  t.parentNode?.insertBefore(span, t.nextSibling)
}
