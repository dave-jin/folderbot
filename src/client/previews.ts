import type { LinkMeta } from '../core/preview'
import { fallbackMeta } from '../core/preview'
import { faviconHost } from '../core/favicon'
import { GLOBE, faviconNow, onFavicon } from './favicons'
import { api, token } from './api'

/**
 * 링크·첨부 박스와 **마우스 오버 미리보기** (2026-09-13 Dave: *«링크와 첨부 모두 rondo 처럼
 * 채팅 안에 박스로 만들어지고 그 박스에 마우스 오버했을때 미리보기가 되어야해»*).
 *
 * 🔴 **DOM 을 직접 만든다.** 답변 본문은 `marked` 가 만든 HTML 문자열이라 React 노드가 아니다
 *    (`favicons.decorateLinks` 와 같은 자리·같은 이유). 그래서 박스도 미리보기도 여기서 만든다.
 * 🔴 **미리보기 카드는 `document.body` 에 붙인다** — 말풍선 안에 두면 대화 목록의 `overflow` 에
 *    잘린다(`Float.tsx` 가 팝업에서 겪은 그 문제 그대로다). 좌표는 뜰 때 한 번 잰다.
 * ⚠ **박스는 «그 줄에 링크 하나뿐» 일 때만 만든다.** 문장 속 링크까지 박스로 만들면 글이 끊긴다 —
 *    그건 밑줄 링크 그대로 두고 **오버했을 때만** 같은 카드를 띄운다.
 * ⚠ 자리표시자를 먼저 그린다(제목 = 주소) — 메타가 도착해 글자가 바뀌어도 **박스 크기는 그대로**라
 *    대화가 덜컹이지 않는다.
 */

const cache = new Map<string, LinkMeta | null>()
const asked = new Set<string>()
const waiting = new Map<string, Set<(m: LinkMeta | null) => void>>()

export function previewNow(url: string): LinkMeta | null | undefined { return cache.get(url) }

export function onPreview(url: string, cb: (m: LinkMeta | null) => void): () => void {
  if (!faviconHost(url)) return () => {}
  if (cache.has(url)) { cb(cache.get(url) ?? null); return () => {} }
  let set = waiting.get(url)
  if (!set) { set = new Set(); waiting.set(url, set) }
  set.add(cb)
  if (!asked.has(url)) {
    asked.add(url)
    void api<{ meta: LinkMeta | null }>(`/preview?url=${encodeURIComponent(url)}`)
      .then((r) => settle(url, r.meta ?? null))
      .catch(() => settle(url, null))
  }
  return () => { set?.delete(cb) }
}

function settle(url: string, meta: LinkMeta | null): void {
  cache.set(url, meta)
  const subs = waiting.get(url); waiting.delete(url)
  if (subs) for (const cb of subs) cb(meta)
}

/* ── ① 혼자 선 링크 → 박스 ───────────────────────────────────────────────── */

/**
 * 문단 하나가 링크 하나뿐이면 그 문단을 **박스**로 바꾼다.
 * ⛔ 이미 박스인 것, 문서칩(`.pchip`), 코드 안은 건드리지 않는다.
 */
export function boxifyLinks(root: HTMLElement): void {
  for (const p of Array.from(root.querySelectorAll<HTMLElement>('p'))) {
    if (p.dataset.lb) continue
    const as = p.querySelectorAll('a[href^="http"]')
    if (as.length !== 1) continue
    const a = as[0] as HTMLAnchorElement
    if ((p.textContent ?? '').trim() !== (a.textContent ?? '').trim()) continue // 글 속 링크는 그대로 둔다
    if (!faviconHost(a.href)) continue
    p.dataset.lb = '1'
    p.replaceWith(linkBox(a.href))
  }
}

/** 링크 박스 하나 — 파비콘 · 제목 · 설명 · 호스트. 누르면 바깥 브라우저로 (`target=_blank`) */
export function linkBox(url: string): HTMLElement {
  const base = fallbackMeta(url)
  const el = document.createElement('a')
  el.className = 'linkbox'; el.href = url; el.target = '_blank'; el.rel = 'noreferrer noopener'
  el.dataset.fv = '1' // ⛔ `decorateLinks` 가 여기에 파비콘을 또 넣지 않게 — 박스는 제 것을 이미 갖고 있다
  el.innerHTML = '<span class="tx"><span class="t"></span><span class="d"></span><span class="u"><img class="fvic" alt="" width="13" height="13"><span class="h"></span></span></span>'
  const t = el.querySelector('.t') as HTMLElement
  const d = el.querySelector('.d') as HTMLElement
  const h = el.querySelector('.h') as HTMLElement
  const ic = el.querySelector('img.fvic') as HTMLImageElement
  t.textContent = base?.title || url
  h.textContent = base?.host || url
  ic.src = faviconNow(url) ?? GLOBE
  onFavicon(url, (data) => { if (data) ic.src = data })
  onPreview(url, (m) => {
    if (!m) return
    t.textContent = m.title || m.host
    d.textContent = m.desc
    h.textContent = m.site && m.site !== m.host ? `${m.site} · ${m.host}` : m.host
    if (m.image && !el.querySelector('img.th')) {
      const img = document.createElement('img')
      img.className = 'th'; img.alt = ''; img.src = m.image
      el.insertBefore(img, el.firstChild)
      el.classList.add('has-th')
    }
  })
  hoverable(el, { kind: 'link', url })
  return el
}

/* ── ② 마우스 오버 미리보기 ─────────────────────────────────────────────── */

export type Target = { kind: 'link'; url: string } | { kind: 'file'; botId: string; rel: string }
const DELAY = 320
let card: HTMLElement | null = null
let timer = 0
let owner: HTMLElement | null = null

/** 이 요소에 오버하면 카드를 띄운다. ⚠ 같은 요소에 두 번 걸지 않는다 */
export function hoverable(el: HTMLElement, t: Target): void {
  if (el.dataset.hp) return
  el.dataset.hp = '1'
  el.addEventListener('mouseenter', () => { window.clearTimeout(timer); timer = window.setTimeout(() => show(el, t), DELAY) })
  el.addEventListener('mouseleave', () => { window.clearTimeout(timer); if (owner === el) hide() })
  el.addEventListener('click', hide)
}

export function hide(): void {
  window.clearTimeout(timer)
  card?.remove(); card = null; owner = null
}

function show(el: HTMLElement, t: Target): void {
  if (!el.isConnected) return
  hide()
  owner = el
  card = document.createElement('div')
  card.className = 'hovprev'
  document.body.appendChild(card)
  place(el)
  if (t.kind === 'link') fillLink(card, t.url)
  else void fillFile(card, t.botId, t.rel)
  // ⚠ 스크롤·창 크기가 바뀌면 좌표가 틀어진다 — 따라다니게 하지 말고 **닫는다**(Float 와 같은 규칙)
  const off = () => { window.removeEventListener('scroll', off, true); window.removeEventListener('resize', off); hide() }
  window.addEventListener('scroll', off, true); window.addEventListener('resize', off)
}

const W = 320
function place(el: HTMLElement): void {
  if (!card) return
  const r = el.getBoundingClientRect()
  const x = Math.min(Math.max(8, r.left), window.innerWidth - W - 8)
  card.style.left = `${Math.round(x)}px`
  // 아래에 자리가 없으면 위로 — 카드 높이는 내용이 정하므로 다 그린 뒤 한 번 더 본다
  card.style.top = `${Math.round(r.bottom + 8)}px`
  requestAnimationFrame(() => {
    if (!card) return
    const h = card.offsetHeight
    if (r.bottom + 8 + h > window.innerHeight - 8) card.style.top = `${Math.round(Math.max(8, r.top - 8 - h))}px`
  })
}

function fillLink(box: HTMLElement, url: string): void {
  const base = fallbackMeta(url)
  box.innerHTML = '<div class="b"><div class="t"></div><div class="d"></div><div class="u"><img class="fvic" alt="" width="13" height="13"><span class="h"></span></div></div>'
  const t = box.querySelector('.t') as HTMLElement
  const d = box.querySelector('.d') as HTMLElement
  const h = box.querySelector('.h') as HTMLElement
  const ic = box.querySelector('img.fvic') as HTMLImageElement
  t.textContent = base?.title || url
  h.textContent = base?.host || url
  d.textContent = '불러오는 중…'
  ic.src = faviconNow(url) ?? GLOBE
  onFavicon(url, (data) => { if (data) ic.src = data })
  onPreview(url, (m) => {
    if (!box.isConnected) return
    if (!m) { d.textContent = '미리 볼 수 없는 주소예요'; return }
    t.textContent = m.title || m.host
    d.textContent = m.desc || '설명이 없어요'
    h.textContent = m.host
    if (m.image) {
      const img = document.createElement('img')
      img.className = 'th'; img.alt = ''; img.src = m.image
      box.insertBefore(img, box.firstChild)
      box.classList.add('has-th')
    }
  })
}

const IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i
/** 첨부·문서 칩 — 이미지는 그림을, 글은 **앞부분 몇 줄**을 보여 준다 */
async function fillFile(box: HTMLElement, botId: string, rel: string): Promise<void> {
  const name = rel.split('/').pop() ?? rel
  box.innerHTML = '<div class="b"><div class="t"></div><div class="d">여는 중…</div><div class="u"><span class="h"></span></div></div>'
  const t = box.querySelector('.t') as HTMLElement
  const d = box.querySelector('.d') as HTMLElement
  const h = box.querySelector('.h') as HTMLElement
  t.textContent = name
  h.textContent = rel
  if (IMG_RE.test(rel)) {
    const img = document.createElement('img')
    img.className = 'th'; img.alt = ''
    img.src = `/api/bots/${botId}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(token())}`
    box.insertBefore(img, box.firstChild)
    box.classList.add('has-th')
    d.remove()
    return
  }
  try {
    // ⚠ `/file` 이 아니라 `/peek` 이다 — 없는 파일에 404 를 받으면 콘솔에 빨간 줄이 남는다(끌 수 없다).
    //    오버 미리보기는 곁다리 읽기라 «없음» 도 정상 응답이어야 한다(gateway 의 `peek` 머리말).
    const r = await api<{ text?: string; kind?: string }>(`/bots/${botId}/peek?rel=${encodeURIComponent(rel)}`)
    if (!box.isConnected) return
    const text = (r.text ?? '').replace(/^---\n[\s\S]*?\n---\n/, '').trim()
    if (!text) { d.textContent = r.kind === 'none' ? '없는 파일이에요' : r.kind === 'binary' ? '미리 볼 수 없는 파일이에요' : '빈 파일이에요'; return }
    const pre = document.createElement('pre')
    pre.className = 'peek'
    pre.textContent = text.split('\n').slice(0, 12).join('\n')
    d.replaceWith(pre)
  } catch {
    if (box.isConnected) d.textContent = '열 수 없는 파일이에요'
  }
}

/** React 쪽 편의 — `ref={hoverRef({…})}`. ⚠ 매 렌더 새 함수지만 `hoverable` 이 한 번만 건다 */
export function hoverRef(t: Target) { return (el: HTMLElement | null): void => { if (el) hoverable(el, t) } }

/** 본문 안 **글 속 링크**에도 같은 카드를 건다 (박스로 바꾸지는 않는다) */
export function hoverLinks(root: HTMLElement): void {
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]'))) {
    if (a.classList.contains('linkbox')) continue
    hoverable(a, { kind: 'link', url: a.href })
  }
}

/* ── 코드 블록 — 언어 이름 · 복사 (Rondo 이식 B3) ──────────────────────────────
   🔴 **코드는 읽으려고 쓰는 게 아니라 가져가려고 쓴다.** 답 속의 코드를 끌어서 고르는 일이
      제일 흔한데, 긴 블록은 스크롤과 싸워야 한다 — 단추 하나면 끝난다.
   ⚠ 언어 이름은 `marked` 가 붙인 `language-…` 클래스에서 읽는다. 없으면 줄만 그린다. */
export function decorateCode(root: HTMLElement, copy: (s: string) => Promise<boolean>, say?: (m: string) => void): void {
  for (const pre of Array.from(root.querySelectorAll<HTMLElement>('pre'))) {
    if (pre.dataset.cb) continue
    const code = pre.querySelector('code')
    if (!code) continue
    pre.dataset.cb = '1'
    const lang = (/language-([\w+#-]+)/.exec(code.className ?? '')?.[1] ?? '').toLowerCase()
    const bar = document.createElement('div')
    bar.className = 'cbbar'
    const l = document.createElement('span'); l.className = 'lg'; l.textContent = lang
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cp'; b.textContent = '복사'; b.title = '이 블록을 복사'
    b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation()
      const ok = await copy(code.textContent ?? '')
      b.textContent = ok ? '복사됨' : '실패'
      say?.(ok ? '코드를 복사했어요' : '복사를 못 했어요')
      setTimeout(() => { b.textContent = '복사' }, 1400)
    }
    bar.append(l, b)
    // ⚠ `pre` **안**에 넣지 않는다 — 그러면 코드 글자에 섞여 복사·선택에 딸려 온다
    pre.parentElement?.insertBefore(Object.assign(document.createElement('div'), { className: 'cbwrap' }), pre)
    const wrap = pre.previousElementSibling as HTMLElement
    wrap.append(bar, pre)
  }
}
