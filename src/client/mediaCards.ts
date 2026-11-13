import { MEDIA_CAP, mediaKind, planCards, type MediaBlock, type MediaCard } from '../core/media'
import { MINI_MAX, miniDoc, miniOutside } from '../core/visualBlocks'
import { token } from './api'

/**
 * 말풍선 안 미디어 카드 (2026-11-12 Dave: *«파일이나 이미지 동영상 등은 채팅 창 안에서 바로 재생도 할 수 있으면 좋겠어»*).
 *
 * 🔴 **DOM 을 직접 만든다** — 답 본문은 `marked` 가 만든 HTML 문자열이다(`previews.ts` 의 링크 박스와 같은 자리·같은 이유).
 *    `Sheets.decorate()` 가 «실제로 있는 파일» 을 칩(`.pchip`·`code.code-path`)으로 바꾼 **바로 뒤**에 돈다 — 있는지 모르는 것은 카드가 되지 않는다.
 * 🔴 **누를 때까지 받지 않는다** — 영상·음성은 `preload="none"`, 그림은 `loading="lazy"`. 긴 대화와 폰이 느려지지 않는다.
 * ⚠ **자리는 미리 잡는다** — 그림·영상 상자는 높이가 고정이라 내용이 도착해도 대화가 덜컹이지 않는다.
 * ⚠ 무엇을 카드로 펼칠지는 여기서 정하지 않는다 — `core/media.planCards` 가 정한다(혼자 선 블록 · 이웃 그림 묶기 · 답 하나에 넷까지).
 */
const SEP = /[\s,·•、|/:—–-]+/g
const rawUrl = (botId: string, rel: string) => `/api/bots/${botId}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(token())}`
const baseName = (rel: string) => rel.replace(/\/+$/, '').split('/').pop() || rel
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }

const REF = '.pchip[data-rel]:not(.dir), code.code-path[data-rel]'

/** 답의 블록들 — 블록 안에 다른 블록이 든 것(`li > p`·`li > ul`)은 안쪽 것이 블록이다 */
function blocksOf(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('p, li')).filter((b) => !b.closest('blockquote, table, pre, .mcard') && !b.querySelector('p, ul, ol, pre, table, blockquote'))
}

function readBlock(b: HTMLElement, prev: HTMLElement | null): MediaBlock {
  const refs = Array.from(b.querySelectorAll<HTMLElement>(REF)).map((r) => ({ rel: r.dataset.rel ?? '', kind: mediaKind(r.dataset.rel ?? ''), multi: r.dataset.multi === '1' }))
  // 참조를 뺀 나머지 글이 구분 글자뿐인가 — 그림(`img`)·링크가 섞였으면 혼자 선 블록이 아니다
  const copy = b.cloneNode(true) as HTMLElement
  for (const r of Array.from(copy.querySelectorAll(REF))) r.remove()
  const only = !copy.querySelector('img, a, video, audio') && (copy.textContent ?? '').replace(SEP, '') === ''
  // 이웃 — 같은 부모의 바로 다음 형제(목록 안의 `p` 는 `li` 끼리 본다)
  const outer = (x: HTMLElement) => (x.tagName === 'P' && x.parentElement?.tagName === 'LI' ? (x.parentElement as HTMLElement) : x)
  const next = !!prev && outer(prev).nextElementSibling === outer(b)
  return { refs, only, next }
}

function footer(name: string, right?: HTMLElement): HTMLElement {
  const ft = el('div', 'mc-ft'); const nm = el('span', 'nm', name); nm.title = name; ft.appendChild(nm)
  if (right) { ft.appendChild(el('span', 'sp')); ft.appendChild(right) }
  return ft
}
const openBtn = (rel: string, open: (rel: string) => void): HTMLButtonElement => { const b = el('button', 'mc-open', '문서 창'); b.type = 'button'; b.title = '문서 창에서 열기'; b.addEventListener('click', (e) => { e.preventDefault(); open(rel) }); return b }

function picture(botId: string, rel: string, open: (rel: string) => void, cls: string): HTMLButtonElement {
  const b = el('button', cls); b.type = 'button'; b.title = baseName(rel); b.dataset.rel = rel
  const im = el('img'); im.loading = 'lazy'; im.decoding = 'async'; im.alt = baseName(rel); im.src = rawUrl(botId, rel)
  // 못 받은 그림은 깨진 아이콘 대신 이름을 보인다 — 눌러서 여는 길은 그대로다
  im.addEventListener('error', () => { b.classList.add('bad'); im.remove(); b.appendChild(el('span', 'mc-bad', baseName(rel))) })
  b.appendChild(im)
  b.addEventListener('click', (e) => { e.preventDefault(); open(rel) })
  return b
}

/**
 * 격리된 미니 창 (2026-11-13 · 시각화 채팅 둘째 묶음) — 봇이 자유롭게 만든 html 을 말풍선 안에서 연다.
 *
 * 🔴 **틀은 문서 창의 html 보기보다 좁다.** 파일 글을 머리말 토큰으로 받아 `srcdoc` 으로 넣는다 — 틀 안의 글은 제 주소에서 토큰을 읽을 수 없고
 *    (`about:srcdoc`), 같은 출처도 아니라 볼트 · 부모 화면 · 저장소에 닿지 못한다. 거기에 «바깥 주소도 못 부른다» 는 정책을 맨 앞에 끼운다(`core/visualBlocks.miniDoc`).
 *    틀이 스스로 바깥 주소로 **가는** 것은 앱 문서의 `frame-src 'self'` 가 막는다(`client/index.html` · 2026-11-13 독립 검토에서 재현).
 * ⛔ `sandbox` 에 `allow-same-origin` · `allow-popups` · `allow-top-navigation` 을 더하지 않는다. `src=` 로 원본 주소를 넣지 않는다(주소에 토큰이 붙는다).
 * 🔴 **누를 때까지 받지도 돌리지도 않는다** — 긴 대화를 열 때마다 봇이 만든 스크립트가 저절로 돌면 화면이 멈출 수 있다. 자리는 미리 잡아 둔다(열어도 높이가 그대로다).
 */
async function loadMini(botId: string, rel: string): Promise<{ text?: string; why?: string }> {
  const big = '파일이 커서 여기서는 열지 않아요 — 문서 창에서 여세요'
  try {
    const r = await fetch(`/api/bots/${botId}/raw?rel=${encodeURIComponent(rel)}`, { headers: { authorization: `Bearer ${token()}` } })
    if (!r.ok) return { why: '파일을 못 받았어요 — 문서 창에서 열어 보세요' }
    if (Number(r.headers.get('content-length') ?? 0) > MINI_MAX) return { why: big }
    const text = await r.text()
    return text.length > MINI_MAX ? { why: big } : { text }
  } catch { return { why: '파일을 못 받았어요 — 문서 창에서 열어 보세요' } }
}
function mini(botId: string, rel: string, open: (rel: string) => void): HTMLElement {
  const name = baseName(rel); const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
  const box = el('div', 'mcard mc-html'); box.dataset.mcard = 'html'
  const bar = el('div', 'mc-hbar'); const dots = el('span', 'dots'); dots.innerHTML = '<i></i><i></i><i></i>'
  const nm = el('span', 'nm', name); nm.title = rel
  bar.append(dots, nm, el('span', 'lock', '격리됨 · 볼트와 화면에 못 닿아요'))
  const body = el('div', 'mc-hbox')
  const run = el('button', 'mc-run', '미니 창 열기'); run.type = 'button'; run.setAttribute('aria-label', `${name} 미니 창 열기`)
  const idle = '누르면 이 자리에서 열려요'
  const note = el('span', 'mc-hnote', idle)
  const where = dir ? `${dir}/ 에 파일로 있어요` : '이 폴더에 파일로 있어요'
  // 닫기 — 열린 틀을 걷고 덮개로 돌아간다(틀 안 스크립트도 같이 멈춘다). 열려 있을 때만 보인다
  const shut = el('button', 'mc-open mc-shut', '닫기'); shut.type = 'button'; shut.title = '미니 창 닫기'; shut.hidden = true
  const acts = el('span', 'mc-acts'); acts.append(shut, openBtn(rel, open))
  const ft = footer(where, acts); const ftName = ft.querySelector<HTMLElement>('.nm')
  const say = (t: string) => { if (ftName) { ftName.textContent = t; ftName.title = t } }
  const close = (why: string, bad: boolean) => { body.replaceChildren(run, note); body.classList.remove('mc-hon', 'mc-hbusy'); body.classList.toggle('mc-hbad', bad); note.textContent = why; shut.hidden = true; say(where) }
  shut.addEventListener('click', (e) => { e.preventDefault(); close(idle, false) })
  run.addEventListener('click', (e) => {
    e.preventDefault(); if (body.classList.contains('mc-hbusy')) return
    body.classList.remove('mc-hbad'); body.classList.add('mc-hbusy'); note.textContent = '여는 중…'
    void loadMini(botId, rel).then((got) => {
      body.classList.remove('mc-hbusy')
      if (got.text == null) { note.textContent = got.why ?? ''; body.classList.add('mc-hbad'); return }   // 단추는 남는다 — 다시 누르면 다시 받는다
      const f = el('iframe', 'mc-hframe'); f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('referrerpolicy', 'no-referrer'); f.title = name; f.srcdoc = miniDoc(got.text)
      /*
       * 🔴 `srcdoc` 틀은 **한 번만** load 한다. 두 번째 load 는 틀이 다른 주소로 갔다는 뜻이다(링크 · `location.href` · `meta refresh`).
       *    바깥 주소로 가는 것은 앱 문서의 `frame-src 'self'` 가 막지만(`client/index.html`), 막힌 틀에는 브라우저의 오류 쪽이 남는다 — 걷고 덮개로 돌아간다.
       *    머리 줄에 «격리됨» 이 붙은 채로 남의 문서가 보이는 일이 없어야 한다.
       */
      let loads = 0
      f.addEventListener('load', () => { if (++loads > 1) close('미니 창이 다른 주소로 가려 해서 닫았어요', true) })
      body.replaceChildren(f); body.classList.add('mc-hon'); shut.hidden = false
      if (miniOutside(got.text)) say('바깥 자료(글꼴 · 라이브러리 · 옆 파일)는 막혀 있어요 — 다 보려면 문서 창')
    })
  })
  body.append(run, note)
  box.append(bar, body, ft)
  return box
}

function build(card: MediaCard, botId: string, open: (rel: string) => void): HTMLElement {
  const rel = card.rels[0]; const name = baseName(rel)
  const box = el('div', `mcard mc-${card.type}`); box.dataset.mcard = card.type
  if (card.type === 'image') { box.appendChild(picture(botId, rel, open, 'mc-pic')); box.appendChild(footer(name)); return box }
  if (card.type === 'gallery') {
    const n = card.rels.length; const show = card.rels.slice(0, 4)
    const grid = el('div', `mc-grid n${show.length}`)
    show.forEach((r, i) => { const c = picture(botId, r, open, 'mc-cell'); if (i === 3 && n > 4) { const more = el('span', 'mc-more', `+${n - 4}`); c.appendChild(more) } grid.appendChild(c) })
    box.appendChild(grid); box.appendChild(footer(`그림 ${n}장`, el('span', 'm', '누르면 문서 창에서 열려요'))); return box
  }
  if (card.type === 'video') {
    const vb = el('div', 'mc-vbox'); const v = el('video'); v.controls = true; v.preload = 'none'; v.playsInline = true; v.setAttribute('playsinline', ''); v.src = rawUrl(botId, rel)
    const play = el('button', 'mc-play'); play.type = 'button'; play.setAttribute('aria-label', `${name} 재생`); play.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" fill="currentColor"/></svg>'
    // 덮개는 «아직 안 받았다» 는 표시다 — 누르면 그때 받기 시작하고, 재생이 시작되면 사라진다
    play.addEventListener('click', (e) => { e.preventDefault(); vb.classList.add('on'); void v.play().catch(() => vb.classList.add('err')) })
    v.addEventListener('play', () => vb.classList.add('on'))
    v.addEventListener('error', () => { vb.classList.add('err'); vb.classList.remove('on') })
    vb.appendChild(v); vb.appendChild(play); vb.appendChild(el('span', 'mc-err', '이 기기에서는 재생하지 못했어요 — 문서 창이나 바깥 앱으로 열어 보세요'))
    box.appendChild(vb); box.appendChild(footer(name, openBtn(rel, open))); return box
  }
  if (card.type === 'audio') {
    const a = el('audio'); a.controls = true; a.preload = 'none'; a.src = rawUrl(botId, rel)
    box.appendChild(a); box.appendChild(footer(name, openBtn(rel, open))); return box
  }
  if (card.type === 'html') return mini(botId, rel, open)
  // PDF — 첫 쪽을 그리려면 답을 그릴 때 PDF 를 받아야 한다. 받지 않고 쪽 모양만 보인다(누르면 문서 창)
  const b = el('button', 'mc-pdfb'); b.type = 'button'; b.dataset.rel = rel
  const pg = el('span', 'mc-pg'); pg.innerHTML = '<i class="h"></i><i></i><i></i><i class="s"></i><i></i>'
  const tx = el('span', 'tx'); tx.appendChild(el('b', undefined, name)); tx.appendChild(el('span', undefined, 'PDF · 누르면 문서 창에서 열려요'))
  b.appendChild(pg); b.appendChild(tx); b.addEventListener('click', (e) => { e.preventDefault(); open(rel) })
  box.appendChild(b); return box
}

/**
 * 혼자 선 미디어 참조를 카드로 바꾼다. 여러 번 불려도 같은 답에 카드가 겹쳐 생기지 않는다 —
 * 이미 만든 카드 수만큼 한도(cap)에서 빼고, 카드가 된 블록에는 칩이 남아 있지 않다.
 */
export function cardify(root: HTMLElement, botId: string, open: (rel: string) => void): number {
  const had = root.querySelectorAll('.mcard').length
  const bs = blocksOf(root)
  if (!bs.length) return 0
  const plan = planCards(bs.map((b, i) => readBlock(b, i ? bs[i - 1] : null)), Math.max(0, MEDIA_CAP - had))
  if (!plan.cards.length) return 0
  const byBlock = new Map<number, MediaCard[]>()
  for (const c of plan.cards) byBlock.set(c.at, [...(byBlock.get(c.at) ?? []), c])
  for (const [i, cards] of byBlock) {
    const b = bs[i]
    const wrap = el('div', 'mcset');   /* ⚠ `mcards` 는 폰 홈 타일의 이름이다 — `.mcards button { height:118px … }` 가 카드 안 단추로 샜다(11/12 폰 캡처) */ for (const c of cards) wrap.appendChild(build(c, botId, open))
    if (b.tagName === 'LI') { b.classList.add('mcli'); b.replaceChildren(wrap) } else b.replaceWith(wrap)
  }
  for (const i of plan.gone) { const b = bs[i]; const li = b.tagName === 'P' && b.parentElement?.tagName === 'LI' ? b.parentElement : b; li.remove() }
  // 카드만 남은 목록은 글머리표를 숨긴다
  for (const ul of Array.from(root.querySelectorAll<HTMLElement>('ul, ol'))) if (ul.children.length && Array.from(ul.children).every((c) => c.classList.contains('mcli'))) ul.classList.add('mclist')
  return plan.cards.length
}
