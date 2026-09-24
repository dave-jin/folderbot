import { useEffect, useRef } from 'react'
import { EditorSelection, EditorState, StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { markdown, markdownKeymap } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { syntaxTree, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { BARE_URL_RE } from '../core/favicon'
import { GLOBE, faviconNow, onFavicon } from './favicons'
import { formatKeymap, selectionBar, setWikiFiles, slashMenu } from './mdFormat'

/**
 * 라이브 프리뷰 마크다운 편집기 — 서식이 보이는 채로 그 자리에서 고친다.
 * (Rondo 알파의 편집기를 Folder Bot 으로 옮기는 1단계 · 2026-09-13 Dave 「문서 기능 A」 확정)
 *
 * 🔴 **churn 0 — 열고 저장해도 바이트가 그대로다.**
 *    이게 공짜인 이유는 **파싱도 직렬화도 안 하기 때문**이다. 문서는 CodeMirror 의 문자열 그대로이고,
 *    아래 데코레이션은 전부 «보여주기» 일 뿐 문자를 하나도 안 바꾼다.
 *    ⛔ 「마크다운을 파싱해서 다시 써 주는」 기능을 여기에 붙이면 그 순간 이 계약이 깨진다.
 *
 * 🔴 **커서가 없는 줄의 마커만 숨긴다.**
 *    숨김은 `Decoration.replace({})` 라 문자는 doc 에 그대로 남는다 — 선택·복사·좌표가 순정 textarea 와 같다.
 *    커서가 그 줄에 들어오면 마커가 드러나고, 그래서 「모드」가 없다.
 *
 * 🔴 **숨긴 마커 위에 커서가 서면 서식이 조용히 깨진다.**
 *    그래서 숨긴 범위를 `atomicRanges` 로 원자화하고(방향키가 통과·부분 삭제 불가),
 *    그래도 떨어지는 경우를 `transactionFilter` 가 내용 쪽으로 밀어낸다. 두 겹이 필요하다 —
 *    원자 범위만으로는 클릭으로 들어오는 캐럿을 못 막는다(Rondo 실측).
 */

/** 마커로 취급해 숨길 노드 — lezer-markdown 의 이름 그대로 */
const MARK_NODES = new Set(['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark', 'QuoteMark', 'LinkMark', 'URL'])

/**
 * 체크박스 — 눌러서 `[ ]` ↔ `[x]` **한 글자만** 바꾼다.
 * ⛔ 줄을 다시 쓰지 않는다. 한 글자만 갈아야 churn 0 이 유지되고 커서·되돌리기도 안 튄다.
 */
class CheckWidget extends WidgetType {
  constructor(readonly on: boolean, readonly pos: number) { super() }
  eq(o: CheckWidget) { return o.on === this.on && o.pos === this.pos }
  toDOM(view: EditorView) {
    const b = document.createElement('span')
    b.className = `lp-check${this.on ? ' on' : ''}`
    b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', String(this.on))
    b.onmousedown = (e) => {
      e.preventDefault()
      view.dispatch({ changes: { from: this.pos, to: this.pos + 1, insert: this.on ? ' ' : 'x' } })
    }
    return b
  }
  ignoreEvent() { return false }
}

/** 위키링크 라벨 — 대괄호는 숨기고 글자만 링크로 (Rondo 의 확정 표기) */
class WikiWidget extends WidgetType {
  constructor(readonly target: string, readonly open?: (t: string) => void) { super() }
  eq(o: WikiWidget) { return o.target === this.target }
  toDOM() {
    const a = document.createElement('span')
    a.className = 'lp-wiki'; a.textContent = this.target.split('/').pop() ?? this.target; a.title = this.target
    if (this.open) a.onmousedown = (e) => { e.preventDefault(); this.open!(this.target) }
    return a
  }
  ignoreEvent() { return false }
}

/** 단독 줄의 이미지 — 줄 전체를 그림으로 바꾼다 */
/**
 * 단독 줄의 이미지 — 줄 전체를 그림으로 바꾼다.
 * ⚠ **한 번 잰 높이를 기억한다.** 그림은 늦게 도착하는데, 도착하는 순간 아래 글이 통째로 밀린다 —
 *    그 사이에 누른 클릭은 **밀리기 전 자리**로 계산돼서 커서가 엉뚱한 곳에 선다(문서를 처음 열 때 특히).
 *    자리를 미리 잡아 두면 도착해도 아무것도 안 움직인다.
 */
const imgH = new Map<string, number>()
class ImgWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super() }
  eq(o: ImgWidget) { return o.src === this.src }
  toDOM() {
    const w = document.createElement('span'); w.className = 'lp-img'
    const known = imgH.get(this.src)
    if (known) w.style.minHeight = `${known}px`
    const img = document.createElement('img'); img.src = this.src; img.alt = this.alt; img.loading = 'lazy'
    img.onload = () => { const h = Math.round(img.getBoundingClientRect().height); if (h > 8) { imgH.set(this.src, h); w.style.minHeight = '' } }
    w.appendChild(img); return w
  }
}

/**
 * 프론트매터 — 문서 맨 위 `---` 블록을 **작은 라벨 한 줄**로 접는다.
 *
 * 🔴 **문서를 열자마자 YAML 이 먼저 보이면 안 된다.** 그건 문서가 아니라 설정이고, 읽으러 온 사람에게
 *    제일 먼저 보여 줄 것이 아니다. 커서가 그 안에 들어오면 원문이 그대로 돌아온다.
 * ⛔ **YAML 을 파싱해서 다시 쓰지 않는다.** Rondo 는 속성 패널에서 고치면 블록을 통째로 재직렬화하는데,
 *    그 순간 서식이 정규화된다(그쪽도 churn 리스크로 적어 뒀다). 여기서는 **보여 주기만** 한다 —
 *    고치는 것은 커서를 넣어 원문에서. 그래야 churn 0 이 예외 없이 성립한다.
 */
class FmWidget extends WidgetType {
  constructor(readonly summary: string) { super() }
  eq(o: FmWidget) { return o.summary === this.summary }
  toDOM() { const e = document.createElement('span'); e.className = 'lp-fm'; e.textContent = this.summary; e.title = '눌러서 원문 보기'; return e }
  ignoreEvent() { return false }
}

/**
 * 링크 앞 파비콘 — 채팅·입력창과 **같은 캐시**를 본다(`client/favicons.ts`).
 * ⚠ 자리표시자(지구본)를 먼저 놓는다 — 비워 두면 아이콘이 도착할 때마다 글줄이 밀린다.
 * ⚠ 커서가 든 줄에도 그대로 둔다 — 들락날락하면 그게 또 밀림이다.
 */
class FavWidget extends WidgetType {
  constructor(readonly url: string) { super() }
  eq(o: FavWidget) { return o.url === this.url }
  toDOM() {
    const img = favImg(this.url)
    img.classList.add('lp-xl'); img.dataset.href = this.url   // 아이콘을 눌러도 열린다 — 눌리게 생겼는데 안 눌리는 게 가장 나쁘다
    return img
  }
  /** mousedown 이 편집기 핸들러(`linkClick`)까지 올라가야 아이콘 클릭이 링크를 연다 */
  ignoreEvent() { return false }
}
/** 파비콘 한 장 — 지구본으로 시작해 도착하면 같은 자리에서 갈아 끼운다(폭이 안 변한다 → 밀림 없음) */
function favImg(url: string): HTMLImageElement {
  const img = document.createElement('img')
  img.className = 'fvic'; img.alt = ''; img.width = 13; img.height = 13
  const now = faviconNow(url)
  img.src = now ?? GLOBE
  if (now === undefined) onFavicon(url, (d) => { if (d) img.src = d })
  return img
}
const MDLINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g
/**
 * 아이콘 + 링크 첫 글자를 한 묶음으로 — 그 사이에서 줄이 바뀌면 아이콘만 윗줄 끝에 남는다(2026-09-25 디자인 검수 · 채팅의 `.fvw` 와 같은 뜻).
 * `inclusiveStart` 라야 바로 앞(side -1)의 아이콘 위젯까지 같은 묶음에 들어간다.
 */
const FVW = Decoration.mark({ class: 'fvw', inclusiveStart: true })
const firstLen = (t: string): number => (Array.from(t)[0] ?? '').length || 1

/**
 * 바깥 링크는 바깥에서 연다 (2026-09-17 Dave: «문서의 링크도 … 바로 클릭이 가능해야 해»).
 * 길은 `window.open(_blank)` 하나뿐이다 — 데스크톱 셸의 `setWindowOpenHandler` 가 받아 기본 브라우저로 넘기고
 * (`desktop/main.js`), 폰·브라우저에서는 새 탭이다. 채팅 답변(`Sheets.tsx`)과 같은 계약.
 */
function openExt(url: string): void { window.open(url, '_blank', 'noopener,noreferrer') }

/**
 * 본문 링크의 «누르면 열린다» 표식 — **마크**라 문서 글자는 한 자도 안 바뀐다(churn 0).
 * `data-lf/lt` 는 mousedown 에서 «캐럿이 이 링크 안인가» 를 가리는 데 쓴다 — 안이면 누르는 것은 편집이다.
 */
function xlink(url: string, lf: number, lt: number): Decoration {
  // `inclusiveStart` — 링크 앞 아이콘 위젯(side 1)도 같은 마크 안에 들어가야 아이콘과 첫 글자가 한 묶음(`FVW`)으로 이어진다
  return Decoration.mark({ class: 'lp-xl', inclusiveStart: true, attributes: { 'data-href': url, 'data-lf': String(lf), 'data-lt': String(lt), title: url } })
}

/**
 * 링크를 누르면 연다. 캐럿이 **그 링크 안**에 있을 때만 누르는 것이 편집이라 캐럿만 옮긴다(원문이 펴져 있는 상태).
 * ⚠ 보조키(⌘·⌥·⇧·⌃)가 있으면 기본 동작에 맡긴다 — 선택을 넓히는 중일 수 있다.
 */
const linkClick = EditorView.domEventHandlers({
  mousedown: (e, view) => {
    if (e.button !== 0 || e.metaKey || e.altKey || e.shiftKey || e.ctrlKey) return false
    const el = (e.target as HTMLElement | null)?.closest?.('.lp-xl') as HTMLElement | null
    const href = el?.dataset.href
    if (!el || !href) return false
    const lf = Number(el.dataset.lf), lt = Number(el.dataset.lt)
    if (Number.isFinite(lf) && Number.isFinite(lt) && view.state.selection.ranges.some((r) => r.to >= lf && r.from <= lt)) return false
    e.preventDefault()
    openExt(href)
    return true
  }
})

/** `type: reference` · `tags: [PARA, 지침]` → `REFERENCE · PARA · 지침` */
function fmSummary(body: string): string {
  const bits: string[] = []
  for (const line of body.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (!m || !m[2]) continue
    const v = m[2].replace(/^\[|\]$/g, '').trim()
    if (m[1].toLowerCase() === 'type') bits.unshift(v.toUpperCase())
    else if (/^(tags?|status|kind)$/i.test(m[1])) bits.push(...v.split(',').map((x) => x.trim()).filter(Boolean))
  }
  return bits.slice(0, 5).join(' · ') || '속성'
}

// ── 표 — 읽을 땐 진짜 표, 칸을 누르면 그 자리에서 고친다 ─────────────────────────
/**
 * 🔴 **칸 하나를 고치면 그 칸의 글자만 바뀐다.**
 *    Rondo 는 표를 파싱해 통째로 다시 직렬화한다(690줄). 그러면 파이프 간격·정렬 표기가 전부
 *    정규화돼서 **한 칸만 고쳐도 표 전체가 바뀐 diff** 가 난다 = churn. 여기서는 고친 칸의
 *    **문자 범위만** 갈아 끼운다 — 나머지 줄은 손도 안 댄다.
 * ⛔ **행·열 추가도 «끼워 넣기» 뿐이다** — 기존 문자를 옮겨 쓰지 않는다(순수 insert).
 * ⚠ 파이프를 직접 만지고 싶으면 표 위 `⋯`. 커서를 표 안으로 넣어 줄 뿐이고, 「커서가 있는 줄은
 *    안 접는다」는 규칙 하나로 «원문 모드» 가 공짜로 나온다 — 모드 플래그를 따로 두지 않는다.
 */
const SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/**
 * 칸 하나 — `from/to` 는 **다듬은 글자**의 범위, `segFrom/segTo` 는 **파이프 사이 날것**의 범위다.
 * ⚠ 열을 지우거나 끼울 때 필요한 것은 날것 쪽이다 — 파이프까지 한 번에 셈해야 «칸은 지웠는데
 *    파이프만 남은» 표가 안 나온다.
 */
interface Cell { from: number; to: number; text: string; segFrom: number; segTo: number }
interface TRow { cells: Cell[]; lineFrom: number; lineTo: number; endsPipe: boolean }
interface Tbl { from: number; to: number; head: TRow; sep: TRow; body: TRow[]; align: ('' | 'c' | 'r')[]; lines: number[] }

/** 파이프로 칸을 자른다 — `\|` 는 칸 구분이 아니다 */
function splitRow(text: string, base: number): { cells: Cell[]; endsPipe: boolean } {
  const trimmed = text.trim()
  const seg: { s: number; e: number }[] = []
  let s = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '|' || (i > 0 && text[i - 1] === '\\')) continue
    seg.push({ s, e: i }); s = i + 1
  }
  seg.push({ s, e: text.length })
  if (trimmed.startsWith('|')) seg.shift()
  const endsPipe = trimmed.endsWith('|')
  if (endsPipe && seg.length > 1) seg.pop()
  const cells = seg.map(({ s: a, e: b }) => {
    let f = a, t = b
    while (f < t && /\s/.test(text[f])) f++
    while (t > f && /\s/.test(text[t - 1])) t--
    return { from: base + f, to: base + t, text: text.slice(f, t), segFrom: base + a, segTo: base + b }
  })
  return { cells, endsPipe }
}

/** 머리줄 + 구분줄 + 이어지는 줄들 = 표 하나 */
function findTables(state: EditorState): Tbl[] {
  const out: Tbl[] = []
  const row = (l: { text: string; from: number; to: number }): TRow => ({ ...splitRow(l.text, l.from), lineFrom: l.from, lineTo: l.to })
  for (let n = 1; n < state.doc.lines; n++) {
    const h = state.doc.line(n), s = state.doc.line(n + 1)
    if (!h.text.includes('|') || !s.text.includes('-') || !SEP_RE.test(s.text)) continue
    const head = row(h), sep = row(s)
    // ⚠ 칸 수가 같아야 표다 — 안 그러면 `제목` + `---`(setext h2)를 표로 오인한다
    if (head.cells.length < 2 || sep.cells.length !== head.cells.length) continue
    const body: TRow[] = []
    let m = n + 2
    for (; m <= state.doc.lines; m++) {
      const l = state.doc.line(m)
      if (!l.text.trim() || !l.text.includes('|')) break
      body.push(row(l))
    }
    const lines: number[] = []
    for (let i = n; i < m; i++) lines.push(i)
    out.push({
      from: h.from, to: state.doc.line(m - 1).to, head, sep, body, lines,
      align: sep.cells.map((c) => (c.text.startsWith(':') && c.text.endsWith(':') ? 'c' : c.text.endsWith(':') ? 'r' : ''))
    })
    n = m - 1
  }
  return out
}

/** 다시 그린 뒤에 커서를 되돌려 놓을 칸 — 고치면 위젯 DOM 이 통째로 갈리기 때문이다 */
let pendFocus: { r: number; c: number } | null = null

/** ⚠ 손잡이 **앞**(글자 끝)에 캐럿을 둔다 — `selectNodeContents` 로 끝에 두면 `▾` 뒤에 선다 */
function placeEnd(el: HTMLElement): void {
  const txt = Array.from(el.childNodes).filter((n) => !(n.nodeType === 1 && (n as HTMLElement).classList.contains('lp-grip')))
  const r = document.createRange()
  const last = txt[txt.length - 1]
  if (last) { r.setStart(last, last.textContent?.length ?? 0); r.collapse(true) } else { r.selectNodeContents(el); r.collapse(true) }
  const s = getSelection(); s?.removeAllRanges(); s?.addRange(r)
}

/** 칸 글자 → 원문 한 줄 (줄바꿈은 칸을 깨고, `|` 는 칸을 가른다) */
function escCell(s: string): string { return s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim() }

/**
 * 칸의 **글자만** — 손잡이(`.lp-grip`)는 빼고 읽는다.
 * 🔴 손잡이는 `contenteditable=false` 지만 **`textContent` 에는 그대로 들어온다** — 그냥 읽으면
 *    칸마다 `▾`·`⋮` 가 문서에 박힌다(손잡이를 칸 안에 둔 대가다).
 */
function cellText(el: HTMLElement): string {
  let out = ''
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1 && (n as HTMLElement).classList.contains('lp-grip')) continue
    // 링크 조각은 보이는 글(라벨)이 아니라 **원문**(`[글](주소)`)으로 되읽는다 — 안 그러면 주소가 사라진다
    if (n.nodeType === 1 && (n as HTMLElement).classList.contains('lp-cl')) { out += (n as HTMLElement).dataset.md ?? ''; continue }
    out += n.textContent ?? ''
  }
  return out
}
/**
 * 칸 안의 링크 — `[글](주소)` 와 맨 주소를 **파비콘 + 누르면 열리는 조각**으로 (2026-09-17 Dave).
 * 링크가 없으면 글자 하나만 둔다(위 `cellText`·`placeEnd` 와 «손잡이 빼고 전부 글자» 규칙을 그대로 지킨다).
 * ⚠ 조각은 `contenteditable=false` — 캐럿이 안에 못 들어간다. 고치려면 칸에 들어오면 되고, 그때 원문으로 풀린다.
 * ⚠ 누르면 **칸에 포커스가 가기 전에** 연다(mousedown 에서 preventDefault) — 포커스가 가면 원문이 드러나 링크가 사라진다.
 */
function cellNodes(raw: string): Node[] {
  const out: Node[] = []
  const re = new RegExp(`${MDLINK_RE.source}|${BARE_URL_RE.source}`, 'g')
  let last = 0
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const md = m[1] != null
    const url = md ? m[2] : m[0]
    if (m.index > last) out.push(document.createTextNode(raw.slice(last, m.index)))
    const a = document.createElement('span')
    a.className = 'lp-cl'; a.contentEditable = 'false'; a.title = url
    a.dataset.href = url; a.dataset.md = m[0]
    a.appendChild(favImg(url))
    a.appendChild(document.createTextNode(md ? m[1] : m[0]))
    a.onmousedown = (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); openExt(url) }
    out.push(a)
    last = m.index + m[0].length
  }
  if (last < raw.length || !out.length) out.push(document.createTextNode(raw.slice(last)))
  return out
}
/** 칸을 원문에서 다시 그린다 — 손잡이(`.lp-grip`)는 그대로 두고 그 앞을 갈아 끼운다 */
function renderCell(el: HTMLElement, raw: string): void {
  for (const n of Array.from(el.childNodes)) if (!(n.nodeType === 1 && (n as HTMLElement).classList.contains('lp-grip'))) n.remove()
  const grip = el.firstChild
  for (const n of cellNodes(raw)) el.insertBefore(n, grip)
}
/** 글자만 갈아 끼운다 — 손잡이는 그대로 둔다 */
function setCellText(el: HTMLElement, text: string): void {
  for (const n of Array.from(el.childNodes)) if (!(n.nodeType === 1 && (n as HTMLElement).classList.contains('lp-grip'))) n.remove()
  el.insertBefore(document.createTextNode(text), el.firstChild)
}

function commitCell(view: EditorView, cell: Cell, el: HTMLElement): boolean {
  if (el.dataset.done) return false
  const next = escCell(cellText(el))
  if (next === cell.text) return false
  el.dataset.done = '1'
  view.dispatch({ changes: { from: cell.from, to: cell.to, insert: next } })
  return true
}

function tbtn(label: string, title: string, on: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'lp-tb'; b.textContent = label; b.title = title; b.type = 'button'
  b.onmousedown = (e) => { e.preventDefault(); on() }
  return b
}

class TableWidget extends WidgetType {
  constructor(readonly t: Tbl, readonly key: string) { super() }
  eq(o: TableWidget) { return o.key === this.key }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div'); wrap.className = 'lp-tblw'
    const table = document.createElement('table'); table.className = 'lp-tbl'
    const rows = [this.t.head, ...this.t.body]
    const t = this.t
    rows.forEach((r, ri) => {
      const tr = document.createElement('tr')
      r.cells.forEach((cell, ci) => {
        const td = document.createElement(ri === 0 ? 'th' : 'td')
        const a = t.align[ci]
        if (a) td.style.textAlign = a === 'c' ? 'center' : 'right'
        renderCell(td, cell.text.replace(/\\\|/g, '|'))
        td.contentEditable = 'true'
        td.spellcheck = false
        td.dataset.rc = `${ri},${ci}`
        /**
         * 링크가 든 칸은 **편집에 들어갈 때 원문으로 푼다** (2026-09-17 Dave: «표안에 있는 링크 포함해서»).
         * ⚠ 링크 없는 칸은 손대지 않는다 — 글자를 다시 쓰면 클릭이 놓은 캐럿이 무효가 돼 End 를 눌러도
         *    캐럿이 셀 가운데 남는다(Rondo 라운드 246 실측). 푼 칸은 캐럿을 끝에 둔다(조각 잔해에 걸리지 않게).
         * ⚠ 나올 때(blur) 글이 안 바뀌었으면 다시 링크로 그린다 — 바뀌었으면 표가 통째로 다시 그려진다.
         */
        td.onfocus = () => { if (td.querySelector('.lp-cl')) { setCellText(td, cellText(td)); placeEnd(td) } }
        td.onblur = () => { if (!commitCell(view, cell, td)) renderCell(td, cellText(td)) }
        td.onkeydown = (e) => cellKey(e, view, rows, t, ri, ci, cell, td)
        /**
         * 손잡이 — 머리줄 칸에는 **열** 메뉴, 본문 첫 칸 왼쪽에는 **행** 메뉴.
         * ⚠ 손잡이는 `contentEditable` 칸 **안**에 있지만 `contenteditable=false` 라 글자에 안 섞인다.
         *    (밖에 절대배치로 띄우면 칸 폭이 바뀔 때마다 어긋난다.)
         */
        const grip = document.createElement('span')
        grip.className = 'lp-grip'; grip.contentEditable = 'false'; grip.textContent = ri === 0 ? '▾' : '⋮'
        grip.title = ri === 0 ? '이 열' : '이 행'
        if (ri > 0 && ci > 0) grip.style.display = 'none'
        grip.onmousedown = (e) => {
          e.preventDefault(); e.stopPropagation()
          const at = { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY + 6 }
          if (ri === 0) tblMenu(at, [
            { label: '왼쪽에 열 추가', on: () => insCol(view, t, ci) },
            { label: '오른쪽에 열 추가', on: () => insCol(view, t, ci + 1) },
            'hr',
            ...(ci > 0 ? [{ label: '왼쪽으로 옮기기', on: () => swapCol(view, t, ci, ci - 1) }] : []),
            ...(ci < r.cells.length - 1 ? [{ label: '오른쪽으로 옮기기', on: () => swapCol(view, t, ci, ci + 1) }] : []),
            'hr',
            { label: `${t.align[ci] === '' ? '● ' : ''}왼쪽 맞춤`, on: () => setAlign(view, t, ci, '') },
            { label: `${t.align[ci] === 'c' ? '● ' : ''}가운데 맞춤`, on: () => setAlign(view, t, ci, 'c') },
            { label: `${t.align[ci] === 'r' ? '● ' : ''}오른쪽 맞춤`, on: () => setAlign(view, t, ci, 'r') },
            'hr',
            { label: '열 지우기', warn: true, on: () => delCol(view, t, ci) }
          ])
          else {
            const bi = ri - 1
            tblMenu(at, [
              { label: '위에 행 추가', on: () => insRow(view, t, bi) },
              { label: '아래에 행 추가', on: () => insRow(view, t, bi + 1) },
              'hr',
              ...(bi > 0 ? [{ label: '위로 옮기기', on: () => swapRow(view, t, bi, bi - 1) }] : []),
              ...(bi < t.body.length - 1 ? [{ label: '아래로 옮기기', on: () => swapRow(view, t, bi, bi + 1) }] : []),
              'hr',
              { label: '행 지우기', warn: true, on: () => delRow(view, t, bi) }
            ])
          }
        }
        td.appendChild(grip)
        tr.appendChild(td)
      })
      table.appendChild(tr)
    })
    wrap.appendChild(table)
    // 기계는 접는다 — 마우스를 올리거나 칸에 들어와야 나온다 (「A · 문서처럼」)
    const bar = document.createElement('div'); bar.className = 'lp-tbtn'
    bar.appendChild(tbtn('＋행', '맨 아래에 빈 행', () => insRow(view, t, t.body.length)))
    bar.appendChild(tbtn('＋열', '맨 오른쪽에 빈 열', () => insCol(view, t, t.head.cells.length)))
    bar.appendChild(tbtn('⋯', '원문(파이프)으로 고치기', () => { view.dispatch({ selection: { anchor: t.from } }); view.focus() }))
    wrap.appendChild(bar)
    if (pendFocus) {
      const { r, c } = pendFocus; pendFocus = null
      queueMicrotask(() => {
        const el = table.querySelector<HTMLElement>(`[data-rc="${r},${c}"]`)
        if (el) { el.focus(); placeEnd(el) }
      })
    }
    return wrap
  }
  /** ⛔ CodeMirror 가 이 안의 이벤트를 가로채면 contenteditable 이 안 먹는다 */
  ignoreEvent() { return true }
}

function cellKey(e: KeyboardEvent, view: EditorView, rows: TRow[], t: Tbl, ri: number, ci: number, cell: Cell, el: HTMLElement): void {
  if (e.key === 'Escape') { e.preventDefault(); setCellText(el, cell.text.replace(/\\\|/g, '|')); el.blur(); return }
  /**
   * ⏎ 는 **아래 칸으로** — 표를 세로로 채우는 게 가장 흔한 일이다(엑셀·Rondo 와 같은 버릇).
   * ⚠ 맨 아랫줄에서 ⏎ 면 **빈 행을 하나 만들고** 그 첫 칸으로 간다 — 손이 멈추지 않게.
   * ⛔ 칸 안에서 줄바꿈은 못 넣는다(마크다운 표에 줄바꿈이 없다). ⌥⏎ 도 마찬가지다.
   */
  if (e.key === 'Enter') {
    e.preventDefault()
    if (ri >= rows.length - 1) { commitCell(view, cell, el); insRow(view, t, t.body.length); return }
    pendFocus = { r: ri + 1, c: ci }
    if (!commitCell(view, cell, el)) {
      pendFocus = null
      const nx = el.closest('table')?.querySelector<HTMLElement>(`[data-rc="${ri + 1},${ci}"]`)
      if (nx) { nx.focus(); placeEnd(nx) }
    }
    return
  }
  if (e.key !== 'Tab') return
  e.preventDefault()
  let nr = ri, nc = ci + (e.shiftKey ? -1 : 1)
  if (nc < 0) { nr = ri - 1; nc = nr >= 0 ? rows[nr].cells.length - 1 : 0 }
  else if (nc >= rows[ri].cells.length) { nr = ri + 1; nc = 0 }
  // ⚠ 마지막 칸에서 ⇥ 면 새 행 — 표를 가로로 채우다 끝에 닿았을 때도 손이 안 멈춘다
  if (nr >= rows.length && !e.shiftKey) { commitCell(view, cell, el); insRow(view, t, t.body.length); return }
  if (nr < 0 || nr >= rows.length) { el.blur(); return }
  pendFocus = { r: nr, c: nc }
  if (!commitCell(view, cell, el)) {                    // 안 바뀌었으면 다시 안 그려진다 — 직접 옮긴다
    pendFocus = null
    const nx = el.closest('table')?.querySelector<HTMLElement>(`[data-rc="${nr},${nc}"]`)
    if (nx) { nx.focus(); placeEnd(nx) }
  }
}

/* ── 표 편집 — 행·열을 끼우고 지우고 옮기고, 정렬을 준다 (2026-09-13 Dave: «테이블 편집») ──
   🔴 **churn 0 은 여기서도 계약이다.** 표를 다시 직렬화하지 않는다 — 건드리는 문자 범위만 바꾼다.
      한 칸의 정렬을 바꾸면 **구분줄의 그 칸만**, 열을 지우면 **줄마다 그 칸과 파이프 하나만** 바뀐다.
   ⚠ 모든 행 목록은 `[머리줄, 구분줄, …본문]` 순서다 — 열 연산은 셋 다 같이 건드려야 칸 수가 안 어긋난다. */

const allRows = (t: Tbl): TRow[] => [t.head, t.sep, ...t.body]

/** 이 칸 + 구분 파이프 하나를 지우는 범위. 열이 하나뿐이면 null(표가 아니게 된다) */
function colCut(r: TRow, c: number): { from: number; to: number } | null {
  if (r.cells.length <= 1) return null
  const cur = r.cells[Math.min(c, r.cells.length - 1)]
  if (c > 0) return { from: r.cells[c - 1].segTo, to: cur.segTo }   // 앞쪽 파이프까지 함께
  return { from: cur.segFrom, to: r.cells[1].segFrom }              // 맨 왼쪽이면 뒤쪽 파이프까지
}

function delCol(view: EditorView, t: Tbl, c: number): void {
  if (t.head.cells.length <= 1) return
  const changes = allRows(t).map((r) => colCut(r, c)).filter((x): x is { from: number; to: number } => !!x)
  pendFocus = { r: 0, c: Math.max(0, c - 1) }
  view.dispatch({ changes })
}

/** `c` 자리에 빈 열을 끼운다(그 칸의 **왼쪽**). 순수 insert — 기존 글자는 안 옮긴다 */
function insCol(view: EditorView, t: Tbl, c: number): void {
  const changes = allRows(t).map((r, i) => {
    const cell = r.cells[Math.min(c, r.cells.length - 1)]
    const at = c >= r.cells.length ? r.lineTo : cell.segFrom
    if (c >= r.cells.length) return { from: at, insert: r.endsPipe ? (i === 1 ? ' --- |' : '  |') : (i === 1 ? ' | ---' : ' |  ') }
    return { from: at, insert: i === 1 ? ' --- |' : '  |' }
  })
  pendFocus = { r: 0, c }
  view.dispatch({ changes })
}

/** 두 열을 맞바꾼다 — 줄마다 칸 두 개의 글자만 서로 넣는다 */
function swapCol(view: EditorView, t: Tbl, a: number, b: number): void {
  if (a === b) return
  const changes: { from: number; to: number; insert: string }[] = []
  for (const r of allRows(t)) {
    const x = r.cells[a], y = r.cells[b]
    if (!x || !y) continue
    changes.push({ from: x.from, to: x.to, insert: y.text }, { from: y.from, to: y.to, insert: x.text })
  }
  pendFocus = { r: 0, c: b }
  view.dispatch({ changes })
}

/** 정렬 — **구분줄의 그 칸 하나만** 바꾼다 */
function setAlign(view: EditorView, t: Tbl, c: number, a: '' | 'c' | 'r'): void {
  const cell = t.sep.cells[c]
  if (!cell) return
  const dash = cell.text.replace(/:/g, '') || '---'
  view.dispatch({ changes: { from: cell.from, to: cell.to, insert: a === 'c' ? `:${dash}:` : a === 'r' ? `${dash}:` : dash } })
}

/** 행 지우기 — 줄 하나와 그 앞 줄바꿈. ⛔ 머리줄·구분줄은 못 지운다(표가 아니게 된다) */
function delRow(view: EditorView, t: Tbl, bi: number): void {
  const r = t.body[bi]
  if (!r) return
  view.dispatch({ changes: { from: r.lineFrom - 1, to: r.lineTo } })   // 앞 `\n` 까지
}

/** 빈 행을 `bi` 자리에 끼운다(그 행의 **위**). `bi === body.length` 면 맨 아래 */
function insRow(view: EditorView, t: Tbl, bi: number): void {
  const line = '|' + Array(t.head.cells.length).fill('  ').join('|') + '|'
  const prev = bi === 0 ? t.sep : t.body[bi - 1]
  const at = bi >= t.body.length ? (t.body.length ? t.body[t.body.length - 1].lineTo : t.sep.lineTo) : prev.lineTo
  pendFocus = { r: bi + 1, c: 0 }
  view.dispatch({ changes: { from: at, insert: '\n' + line } })
}

/** 두 본문 행을 맞바꾼다 — 줄 글자를 서로 넣는다(칸 수가 달라도 안전하다) */
function swapRow(view: EditorView, t: Tbl, a: number, b: number): void {
  const x = t.body[a], y = t.body[b]
  if (!x || !y) return
  const tx = view.state.doc.sliceString(x.lineFrom, x.lineTo)
  const ty = view.state.doc.sliceString(y.lineFrom, y.lineTo)
  pendFocus = { r: b + 1, c: 0 }
  view.dispatch({ changes: [{ from: x.lineFrom, to: x.lineTo, insert: ty }, { from: y.lineFrom, to: y.lineTo, insert: tx }] })
}

/**
 * 표 손잡이 메뉴 — ⚠ **`document.body` 에 띄운다.** 편집기 안에 두면 스크롤 상자에 잘리고,
 *    CodeMirror 가 제 것으로 알고 이벤트를 가로챈다(`Float.tsx` 와 같은 이유).
 */
function tblMenu(at: { x: number; y: number }, items: ({ label: string; on: () => void; warn?: boolean } | 'hr')[]): void {
  document.querySelector('.lp-tmenu')?.remove()
  const el = document.createElement('div')
  el.className = 'menu ctx lp-tmenu'
  el.style.left = `${Math.round(at.x)}px`; el.style.top = `${Math.round(at.y)}px`
  for (const it of items) {
    if (it === 'hr') { el.appendChild(document.createElement('hr')); continue }
    const b = document.createElement('button')
    if (it.warn) b.className = 'warn'
    b.textContent = it.label
    b.onmousedown = (e) => { e.preventDefault(); close(); it.on() }
    el.appendChild(b)
  }
  const close = () => { el.remove(); document.removeEventListener('mousedown', out, true); window.removeEventListener('scroll', close, true) }
  const out = (e: MouseEvent) => { if (!el.contains(e.target as Node)) close() }
  document.body.appendChild(el)
  const r = el.getBoundingClientRect()
  if (r.bottom > innerHeight - 8) el.style.top = `${Math.round(Math.max(8, at.y - r.height))}px`
  if (r.right > innerWidth - 8) el.style.left = `${Math.round(Math.max(8, innerWidth - r.width - 8))}px`
  setTimeout(() => { document.addEventListener('mousedown', out, true); window.addEventListener('scroll', close, true) }, 0)
}

/**
 * `---` · `***` · `___` → **가로줄** (2026-09-13 Dave). 줄 전체가 마커라 통째로 바꾼다.
 * ⚠ 프론트매터의 `---` 는 건드리지 않는다 — 거기선 구분선이 아니라 **경계**다(위에서 따로 접는다).
 */
class HrWidget extends WidgetType {
  eq() { return true }
  toDOM() { const e = document.createElement('span'); e.className = 'lp-hr'; return e }
}
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s/
const WIKI_RE = /\[\[([^\]|]+)(\|[^\]]*)?\]\]/g
const IMG_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/

/**
 * 🔴 **마우스를 누르고 있는 동안은 아무것도 드러내지 않는다** (Rondo 라운드 324 `dragFreeze` 이식, 2026-09-16 Dave:
 *    «마우스 클릭시 다른곳에 클릭되는 현상»). 클릭 좌표 → 문서 위치 계산은 **누르는 순간의 배치**로 하는데,
 *    캐럿이 들어온 줄이 원문을 드러내며 밀리면 그 계산이 이미 틀린 배치 위에서 이뤄진다(5회 중 1~2회 어긋나는
 *    간헐 사고 — 눈으로 못 잡는 종류). 누르는 동안 얼려 두면 배치가 안 바뀌고, 떼는 순간 드러난다 —
 *    그때는 캐럿의 **문서 위치**가 이미 맞으므로 밀려도 글자를 따라간다.
 */
const setFrozen = StateEffect.define<boolean>()
const frozenField = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setFrozen)) return e.value; return v }
})
const dragFreeze = ViewPlugin.fromClass(class {
  down: () => void; up: () => void
  constructor(readonly view: EditorView) {
    this.down = () => { if (!view.state.field(frozenField, false)) view.dispatch({ effects: setFrozen.of(true) }) }
    this.up = () => { if (view.state.field(frozenField, false)) view.dispatch({ effects: setFrozen.of(false) }) }
    view.contentDOM.addEventListener('mousedown', this.down, true)
    window.addEventListener('mouseup', this.up, true)
  }
  destroy() { this.view.contentDOM.removeEventListener('mousedown', this.down, true); window.removeEventListener('mouseup', this.up, true) }
})

/** 선택이 이 범위에 **닿았나** — 끝점 포함. 링크·이미지·프론트매터처럼 «내용» 인 숨김은 닿으면 원문을 드러낸다 */
function touches(state: EditorState, from: number, to: number, strict = false): boolean {
  if (state.field(frozenField, false)) return false
  return state.selection.ranges.some((r) => (strict ? r.to > from && r.from < to : r.to >= from && r.from <= to))
}

/** 선택이 닿은 줄 번호 — 이 줄에서는 마커를 안 숨긴다 */
function activeLines(state: EditorState): Set<number> {
  if (state.field(frozenField, false)) return new Set()
  const out = new Set<number>()
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number, b = state.doc.lineAt(r.to).number
    for (let n = a; n <= b; n++) out.add(n)
  }
  return out
}

const HIDE = Decoration.replace({})

/**
 * 그림 붙여넣기·끌어다 놓기 (Rondo 이식 B6) — 🔴 **편집기는 업로드를 모른다.**
 * 어디에 둘지·무슨 이름으로 둘지는 문서 열(Doc)이 정하고, 여기는 **받은 경로를 글로 넣을 뿐**이다.
 * ⚠ 넣기 전에 «올리는 중…» 자리표시자를 박고, 끝나면 그 자리를 갈아 끼운다 — 큰 그림은 몇 초가
 *    걸리는데 그동안 화면에 아무 일도 안 일어나면 사람이 한 번 더 붙여넣는다.
 * ⚠ 실패하면 자리표시자를 **지운다** — 남겨 두면 문서에 «올리는 중…» 이 박혀 저장된다.
 */
const pasteRef: { current?: ((f: File) => Promise<string | null>) | undefined } = {}
function imageDrop(): Extension {
  const put = async (view: EditorView, files: File[], at: number) => {
    const up = pasteRef.current
    if (!up) return
    for (const f of files) {
      const mark = `![올리는 중… ${f.name}]()`
      view.dispatch({ changes: { from: at, insert: mark }, selection: { anchor: at + mark.length } })
      const rel = await up(f).catch(() => null)
      const cur = view.state.doc.toString().indexOf(mark)
      if (cur < 0) continue                            // 사람이 그 사이에 지웠다 — 건드리지 않는다
      const done = rel ? `![${f.name.replace(/\.[^.]+$/, '')}](${rel})` : ''
      view.dispatch({ changes: { from: cur, to: cur + mark.length, insert: done } })
      at = cur + done.length
    }
  }
  return EditorView.domEventHandlers({
    paste(e, view) {
      const imgs = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f)
      if (!imgs.length || !pasteRef.current) return false
      e.preventDefault()
      const d = new Date()
      void put(view, imgs.map((f, i) => new File([f], `스크린샷_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${d.getHours()}${String(d.getMinutes()).padStart(2, '0')}${i ? `-${i + 1}` : ''}.${(f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')}`, { type: f.type })), view.state.selection.main.from)
      return true
    },
    drop(e, view) {
      const imgs = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (!imgs.length || !pasteRef.current) return false
      e.preventDefault()
      const at = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.from
      void put(view, imgs, at)
      return true
    }
  })
}

interface BuildOpts { onOpen?: (t: string) => void; rawUrl?: (rel: string) => string }
let opts: BuildOpts = {}
export function setEditorOpts(o: BuildOpts): void { opts = o }

interface Atom { from: number; to: number; block?: boolean }
function build(state: EditorState): { deco: DecorationSet; atoms: Atom[] } {
  const active = activeLines(state)
  const marks: Range<Decoration>[] = []
  const atoms: Atom[] = []
  // ── 표는 제일 먼저 — 접은 표 안에는 다른 데코레이션이 겹치면 안 된다(겹친 replace 는 예외를 던진다) ──
  const skip = new Set<number>()
  for (const tb of findTables(state)) {
    if (tb.lines.some((n) => active.has(n))) continue    // 커서가 안에 있으면 원문 그대로
    for (const n of tb.lines) skip.add(n)
    marks.push(Decoration.replace({ widget: new TableWidget(tb, `${tb.from}:${state.doc.sliceString(tb.from, tb.to)}`), block: true }).range(tb.from, tb.to))
    atoms.push({ from: tb.from, to: tb.to, block: true })
  }
  const tree = syntaxTree(state)
  let link: { from: number; to: number } | null = null
  /**
   * 🔴 **코드는 코드처럼 보인다** (2026-09-25 디자인 검수). 서식 기호(`CodeMark`)를 늘 숨기는 규칙이 펜스의 ``` 까지
   *    숨겨서, 코드 블록이 «`js` 한 줄 + 본문 같은 줄들» 로 흩어져 보였다 — 인라인 코드도 바탕 없이 글자체만 바뀌었다.
   *    채팅(`.md pre`·`.md code`)과 같은 바탕·모서리를 **줄 단위 클래스**로 준다(펜스 줄이 곧 상자의 위·아래 여백이 된다).
   * ⚠ 코드 줄은 아래의 줄 스캔(가로줄·체크박스·링크)에서 뺀다 — 코드 안의 `---` 가 가로줄로, `- [ ]` 가 눌리는 체크박스로 바뀌었다.
   */
  const codeLines = new Set<number>()
  tree.iterate({
    enter: (n) => {
      if (skip.has(state.doc.lineAt(n.from).number)) return false
      if (n.name === 'FencedCode') {
        const a = state.doc.lineAt(n.from).number, z = state.doc.lineAt(n.to).number
        for (let l = a; l <= z; l++) { codeLines.add(l); marks.push(Decoration.line({ class: `lp-code${l === a ? ' lp-code-a' : ''}${l === z ? ' lp-code-z' : ''}` }).range(state.doc.line(l).from)) }
      }
      if (n.name === 'CodeInfo' && n.to > n.from) marks.push(Decoration.mark({ class: 'lp-codeinfo' }).range(n.from, n.to))
      if (n.name === 'InlineCode' && n.to > n.from) marks.push(Decoration.mark({ class: 'lp-ic' }).range(n.from, n.to))
      if (n.name === 'Link') link = { from: n.from, to: n.to }
      // 제목 크기는 **줄 단위 클래스**로 준다 — 토큰에 걸면 «# » 를 치는 순간에는 아직 안 커진다
      const h = /^ATXHeading([1-6])$/.exec(n.name)
      if (h) {
        const line = state.doc.lineAt(n.from)
        marks.push(Decoration.line({ class: `lp-h${h[1]}` }).range(line.from))
        return
      }
      if (n.name === 'Blockquote') {
        for (let p = n.from; p <= n.to;) { const l = state.doc.lineAt(p); marks.push(Decoration.line({ class: 'lp-quote' }).range(l.from)); p = l.to + 1 }
        return
      }
      if (!MARK_NODES.has(n.name)) return
      if (n.to <= n.from) return
      const line = state.doc.lineAt(n.from)
      const hide = (to: number) => { marks.push(HIDE.range(n.from, to)); atoms.push({ from: n.from, to }) }
      /**
       * 🔴 **서식 마커는 커서가 그 줄에 있어도 계속 숨긴다** (2026-09-13 Dave · Rondo `livePreview.tsx` 2455~).
       *    종전에는 커서가 든 줄만 원문을 드러냈는데, 그 순간 **줄이 통째로 오른쪽으로 밀린다** —
       *    그래서 «누른 글자» 와 «커서가 선 글자» 가 달라졌다(Dave: *«최초 클릭하면 위치가 정확하지 않을 때가 있어»*).
       *    클릭 위치는 **누르기 직전의 배치**로 정해지는데 그 직후에 배치가 바뀌니, 드러내는 한 어긋남은 반드시 남는다.
       * ⚠ **`#` 만 친 상태(뒤에 공백 없음)는 그대로 보여 준다** — 아직 제목이 아니고, 사람이 서식에 들어서는 중이다.
       * ⛔ 주소(`URL`·`LinkMark`)는 예외로 **커서 줄에서 드러낸다** — 그건 서식이 아니라 **내용**이라,
       *    안 보이면 오타 난 주소를 고칠 방법이 아예 없다.
       */
      if (n.name === 'HeaderMark') { if (state.doc.sliceString(n.to, n.to + 1) !== ' ') return; hide(n.to + 1); return }
      if (n.name === 'QuoteMark') { hide(state.doc.sliceString(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to); return }
      if (n.name === 'EmphasisMark' || n.name === 'StrikethroughMark' || n.name === 'CodeMark') { hide(n.to); return }
      /**
       * ⛔ **맨 URL 은 숨기면 글자가 통째로 사라진다.** `[글](주소)` 의 주소는 숨겨도 «글» 이 남지만,
       *    그냥 적어 둔 `https://…` 는 그 자체가 보이는 전부다. 여는 괄호 뒤인지로 가른다.
       */
      if (n.name === 'URL' && state.doc.sliceString(n.from - 1, n.from) !== '(') return
      /**
       * 🔴 **줄이 아니라 링크에 닿았을 때만 드러낸다** (2026-09-16 Dave: «화살표 이동시 제대로 위치하지 못하는 현상»).
       *    종전에는 커서가 그 **줄**에 들어오기만 해도 `[글](주소)` 의 괄호·주소가 전부 나와 줄이 통째로 밀렸다 —
       *    ↑↓ 로 지나가기만 해도 캐럿이 옆으로 튀는 것으로 보였다. 링크 **안**에 캐럿이 있을 때만 그 링크를 편다.
       */
      const inLink = link && n.from >= link.from && n.to <= link.to ? link : null
      if (inLink ? touches(state, inLink.from, inLink.to) : active.has(line.number)) return
      hide(n.to)
    }
  })
  // ── 프론트매터 — 맨 위 `---` 블록 (커서가 없을 때만 접는다) ──
  let fmEnd = 0
  if (state.doc.line(1).text.trim() === '---') {
    let end = 0
    for (let n = 2; n <= Math.min(state.doc.lines, 60); n++) { if (state.doc.line(n).text.trim() === '---') { end = n; break } }
    if (end) {
      fmEnd = end
      const from = state.doc.line(1).from, to = state.doc.line(end).to
      // ⚠ 맨 앞(0)에 선 캐럿은 «안» 이 아니다 — ↑ 로 문서 맨 위에 닿을 때마다 YAML 이 펴지면 화살표가 튄 것처럼 보인다
      const touched = touches(state, from, to, true)
      if (!touched) {
        const body = state.doc.sliceString(state.doc.line(2).from, state.doc.line(Math.max(2, end - 1)).to)
        marks.push(Decoration.replace({ widget: new FmWidget(fmSummary(body)) }).range(from, to))
        atoms.push({ from, to })
      }
    }
  }

  // ── 파서가 모르는 것들은 줄을 직접 훑는다 (위키링크·체크박스·단독 이미지) ──
  // ⚠ lezer 는 `[[ ]]` 를 모르고, 체크박스는 한 글자만 갈아야 해서 줄 스캔이 더 정확하다.
  for (let n = 1; n <= state.doc.lines; n++) {
    if (skip.has(n) || codeLines.has(n)) continue
    const line = state.doc.line(n)
    const text = line.text

    // 콜아웃 `> [!note] …` — 표시는 숨기고 줄에 색을 준다 (Obsidian 표기)
    const cal = /^\s*>\s*\[!([a-zA-Z]+)\]\s?/.exec(text)
    if (cal) {
      const kind = cal[1].toLowerCase()
      marks.push(Decoration.line({ class: `lp-cal lp-cal-${['note', 'tip', 'warning', 'danger', 'info', 'success'].includes(kind) ? kind : 'note'}` }).range(line.from))
      const at = line.from + cal[0].indexOf('[')
      const to = line.from + cal[0].length
      marks.push(HIDE.range(at, to))
      atoms.push({ from: at, to })
    }

    // 가로줄 — 프론트매터 안(경계)은 빼고
    if (n > fmEnd && HR_RE.test(text) && text.trim()) {
      marks.push(Decoration.replace({ widget: new HrWidget(), block: true }).range(line.from, line.to))
      atoms.push({ from: line.from, to: line.to, block: true })
      continue
    }

    const img = IMG_LINE_RE.exec(text)
    if (img && !touches(state, line.from, line.to) && opts.rawUrl) {
      const src = opts.rawUrl(img[2])
      if (src) { marks.push(Decoration.replace({ widget: new ImgWidget(src, img[1]), block: false }).range(line.from, line.to)); atoms.push({ from: line.from, to: line.to }); continue }
    }

    const task = TASK_RE.exec(text)
    if (task) {
      const at = line.from + task[1].length
      marks.push(Decoration.replace({ widget: new CheckWidget(task[2] !== ' ', at + 1) }).range(at, at + 3))
      atoms.push({ from: at, to: at + 3 })
    }

    // 링크 앞 파비콘 — `[글](주소)` 는 글 앞에, 맨 URL 은 그 앞에
    // 링크 앞 파비콘 + 누르면 열리는 표식(`xlink`) — `[글](주소)` 는 글에, 맨 URL 은 주소 그 자체에
    MDLINK_RE.lastIndex = 0
    for (let m = MDLINK_RE.exec(text); m; m = MDLINK_RE.exec(text)) {
      const at = line.from + m.index + 1
      marks.push(Decoration.widget({ widget: new FavWidget(m[2]), side: 1 }).range(at))
      marks.push(xlink(m[2], line.from + m.index, line.from + m.index + m[0].length).range(at, at + m[1].length))
      marks.push(FVW.range(at, at + firstLen(m[1])))
    }
    const bare = new RegExp(BARE_URL_RE.source, 'g')
    for (let m = bare.exec(text); m; m = bare.exec(text)) {
      if (text[m.index - 1] === '(') continue          // `[글](주소)` 의 주소 — 위에서 이미 달았다
      const from = line.from + m.index, to = from + m[0].length
      marks.push(Decoration.widget({ widget: new FavWidget(m[0]), side: 1 }).range(from))
      marks.push(xlink(m[0], from, to).range(from, to))
      marks.push(FVW.range(from, from + firstLen(m[0])))
    }

    /**
     * 위키링크 — ⚠ **원자가 아니다.** 원자로 두면 캐럿이 안에 못 들어가 글자를 고칠 길이 없고, 줄에 들어오기만 해도
     *    펴면 ↑↓ 때마다 줄이 밀린다. 옵시디언과 같이 캐럿이 **안**(대괄호 사이)에 있을 때만 원문이다 —
     *    ←→ 로 지나가다 들어가면 펴지고, 나가면 접힌다.
     */
    WIKI_RE.lastIndex = 0
    for (let m = WIKI_RE.exec(text); m; m = WIKI_RE.exec(text)) {
      const from = line.from + m.index, to = from + m[0].length
      if (touches(state, from, to, true)) continue
      marks.push(Decoration.replace({ widget: new WikiWidget(m[1].trim(), opts.onOpen) }).range(from, to))
    }
  }

  marks.sort((a, b) => a.from - b.from || (a.value.spec.class ? -1 : 1))
  return { deco: Decoration.set(marks, true), atoms }
}

const lpField = StateField.define<{ deco: DecorationSet; atoms: Atom[] }>({
  create: build,
  update: (v, tr) => (tr.docChanged || tr.selection || tr.effects.length ? build(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})

/** 숨긴 마커는 통째로 하나 — 방향키가 안쪽에 못 서고 지우면 통째로 지워진다 */
const atomic = EditorView.atomicRanges.of((view) => {
  const b: Range<Decoration>[] = []
  for (const a of view.state.field(lpField).atoms) b.push(HIDE.range(a.from, a.to))
  return Decoration.set(b, true)
})

/**
 * 캐럿이 숨긴 마커 **안**에 떨어지면 밖으로 민다.
 * ⚠ 원자 범위만으로는 부족하다 — 클릭으로 들어오는 캐럿은 `atomicRanges` 를 거치지 않는다.
 * 🔴 **선택의 앵커를 잃지 않는다** (2026-09-16 Dave: «커맨드 + 키보드에서 선택에 문제»). 종전에는 `{ anchor: hit.to }`
 *    하나로 갈아 끼워 ⇧→·⌘⇧→ 로 넓히던 선택이 마커에 닿는 순간 **캐럿 하나로 접혔다.** 머리만 밀고 앵커는 둔다.
 * ⚠ 방향을 본다 — 왼쪽으로 가던 캐럿은 마커 앞으로, 그 외(클릭·오른쪽·↑↓)는 마커 뒤(내용 쪽)로.
 * 🔴 **표를 걸친 선택은 표를 통째로 삼킨다** (Rondo 라운드 325). 표는 블록 위젯이라 위에서 끌어 내리면 `posAtCoords` 가
 *    표 시작을 돌려주고, 그대로 ⌫ 를 누르면 표 앞 줄바꿈만 지워져 표가 평문으로 무너진다.
 */
const caretGuard = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.newSelection.ranges.length !== 1) return tr
  const raw = tr.startState.field(lpField, false)?.atoms
  if (!raw?.length) return tr
  /**
   * ⚠ 원자 범위는 **바뀌기 전 문서** 의 좌표다 — 글자를 넣은 트랜잭션에는 `tr.changes` 로 옮겨서 대야 한다.
   *    안 옮기면 ⏎ 로 새 줄을 만든 캐럿이 옛 좌표의 다음 줄 마커(`## `)에 «들어간» 것으로 보여 그 뒤로 밀린다
   *    (실측: `- 항목` 끝에서 ⏎ → 캐럿이 두 줄 아래 제목으로 튀었다). 사라진 범위는 뺀다.
   */
  const atoms = tr.docChanged ? raw.map((a) => ({ ...a, from: tr.changes.mapPos(a.from, 1), to: tr.changes.mapPos(a.to, -1) })).filter((a) => a.to > a.from) : raw
  if (!atoms.length) return tr
  const sel = tr.newSelection.main
  const prevHead = tr.startState.selection.main.head
  const out = (p: number, left: boolean) => { const a = atoms.find((x) => p > x.from && p < x.to); return a ? (left ? a.from : a.to) : p }
  let head = out(sel.head, sel.head < prevHead)
  let anchor = sel.empty ? head : out(sel.anchor, sel.anchor < sel.head)
  if (anchor !== head) {
    const f = Math.min(anchor, head), t = Math.max(anchor, head)
    for (const a of atoms) {
      if (!a.block) continue
      const cross = (f < a.from && t >= a.from && t <= a.to) || (t > a.to && f >= a.from && f <= a.to)
      if (!cross) continue
      const nf = Math.min(f, a.from), nt = Math.max(t, a.to)
      if (anchor <= head) { anchor = nf; head = nt } else { anchor = nt; head = nf }
    }
  }
  if (head === sel.head && anchor === sel.anchor) return tr
  return [tr, { selection: EditorSelection.range(anchor, head), sequential: true }]
})

/** 유닛테스트 손잡이 — 필터·필드를 DOM 없이 EditorState 만으로 잰다 */
export const _forTest = { lpField, caretGuard, frozenField, build }

const HL = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.6em', fontWeight: '600' },
  { tag: t.heading2, fontSize: '1.3em', fontWeight: '600' },
  { tag: t.heading3, fontSize: '1.12em', fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.monospace, fontFamily: 'var(--mono)' }
])

export interface MdEditorProps {
  /** 파일 원문 — 바뀌면 편집기를 갈아 끼운다(밖에서 바뀐 경우) */
  value: string
  /** 멎고 800ms 뒤 — 자동 저장 */
  onCommit: (text: string) => void
  /** 글자가 바뀔 때마다 — 「저장 안 됨」 표시용 */
  onChange?: (text: string) => void
  readOnly?: boolean
  /**
   * `[[` 자동완성이 고를 목록 — 이 봇 폴더의 문서들(봇 폴더 기준 상대 경로).
   * ⚠ **부를 때 받아 온다**(Promise) — 편집기를 열 때마다 트리를 통째로 들고 있지 않으려고.
   */
  files?: () => Promise<string[]>
  /**
   * 그림을 붙여넣거나 끌어다 놓으면 — 파일로 저장하고 **넣을 경로**를 돌려준다(없으면 null).
   * ⛔ 편집기는 업로드를 모른다 — 어디에 둘지는 문서 열(Doc)이 정한다.
   */
  onPasteImage?: (f: File) => Promise<string | null>
  /**
   * 편집기가 준비되면 **밖에서 쓸 손잡이**를 넘긴다 — 지금은 «그 줄로 가기» 하나뿐이다(목차가 쓴다).
   * ⛔ 편집기 인스턴스를 통째로 넘기지 않는다 — 밖에서 아무 `dispatch` 나 하면 churn 0 계약이 샌다.
   */
  onReady?: (api: { goToLine: (n: number) => void }) => void
  /** 위키링크를 눌렀을 때 — 문서 탭에서 연다 */
  onOpen?: (target: string) => void
  /** 이미지 경로 → 실제로 받을 수 있는 주소 */
  rawUrl?: (rel: string) => string
}

/**
 * ⚠ **CRLF 를 지킨다** — 표시용으로 `\n` 으로 맞추고 저장할 때 되돌린다.
 *    안 그러면 윈도우에서 만든 파일이 열기만 해도 통째로 바뀐다(= churn).
 *    혼합 EOL 은 LF 로 수렴한다 — 한계로 남긴다.
 */
function eolOf(s: string): '\r\n' | '\n' { return /\r\n/.test(s) && !/(^|[^\r])\n/.test(s) ? '\r\n' : '\n' }

export default function MdEditor({ value, onCommit, onChange, readOnly, onOpen, rawUrl, files, onPasteImage, onReady }: MdEditorProps) {
  setEditorOpts({ onOpen, rawUrl })
  // ⚠ 자동완성·붙여넣기는 CodeMirror 확장 안에서 돈다 — React 클로저가 아니라 **모듈 한 곳**을 본다
  //    (편집기는 한 번만 만들어지므로, 여기서 최신 것을 계속 갈아 끼워야 한다)
  setWikiFiles(files)
  pasteRef.current = onPasteImage
  const box = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const commitRef = useRef(onCommit); commitRef.current = onCommit
  const changeRef = useRef(onChange); changeRef.current = onChange
  const initial = useRef(value)
  const eol = useRef<'\r\n' | '\n'>(eolOf(value))

  /**
   * 🔴 **편집기는 한 번만 만든다.**
   *    처음에는 `value` 를 의존성에 뒀는데, `onChange` 가 부모의 `draft` 를 올리면 그 `value` 가 바뀌어
   *    **한 글자 칠 때마다 편집기가 통째로 다시 만들어졌다** — 포커스·커서·되돌리기가 그때마다 날아간다
   *    (스모크가 «Backspace 가 안 먹는다» 로 잡았다. 실제로는 포커스가 body 로 빠져 있었다).
   *    ⛔ 이 이펙트에 `value` 를 다시 넣지 마라. 밖에서 바뀐 글은 아래 두 번째 이펙트가 넣는다.
   */
  useEffect(() => {
    const el = box.current; if (!el) return
    let timer = 0
    const ext: Extension[] = [
      /**
       * ⏎ 는 목록·체크박스·인용을 **이어 쓴다**, 빈 항목에서 ⏎ 는 목록을 끝낸다 (`markdownKeymap`, 2026-09-16).
       * ⚠ `defaultKeymap` 보다 **앞**에 둔다 — 같은 ⏎ 를 기본 키맵이 먼저 먹으면 그냥 줄바꿈이다.
       */
      history(), formatKeymap, keymap.of(markdownKeymap), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      /**
       * 🔴 **문서 안에서 찾기 (⌘F)** — `searchKeymap` 만으로는 안 뜬다. `openSearchPanel` 이 읽는
       *    상태(패널·검색어)는 **`search()` 확장**이 만든다 — 키만 꽂아 두면 명령이 조용히 false 를
       *    돌려주고 아무 일도 안 일어난다(실측: ⌘F 가 먹통).
       * ⚠ 패널은 **위**에 붙인다 — 아래에 두면 폰에서 키보드와 겹친다.
       */
      search({ top: true }),
      // 서식 — `/` 메뉴 · 고른 글 위 막대 · ⌘B/⌘I/⌘K (`mdFormat.ts`)
      slashMenu(), selectionBar(), imageDrop(),
      markdown({ extensions: [GFM] }), syntaxHighlighting(HL), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      /* ⛔ `highlightSelectionMatches()` 를 켜지 않는다 (2026-09-13 Dave: *«어떤 텍스트를 선택하면 같은
         텍스트가 왜 같이 선택되는거야?»*). CodeMirror 의 «찾기» 편의 기능이라 고른 낱말과 **같은 글자를
         문서 전체에서 물들인다** — 코드 편집기에서는 도움이 되지만 글을 쓰는 화면에서는 «내가 고르지
         않은 곳이 골라진 것»처럼 보인다. 찾기는 ⌘F 가 따로 한다. */
      frozenField, dragFreeze, lpField, atomic, caretGuard, linkClick,
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return
        const text = u.state.doc.toString()
        changeRef.current?.(text)
        window.clearTimeout(timer)
        timer = window.setTimeout(() => commitRef.current(eol.current === '\r\n' ? text.replace(/\n/g, '\r\n') : text), 800)
      })
    ]
    /**
     * ⚠ **처음 커서는 프론트매터 뒤에 둔다.** 기본값(0)이면 1번 줄이 «활성» 이라 프론트매터가 안 접히고,
     *    문서를 열자마자 YAML 이 먼저 보인다 — 게다가 사람이 제일 먼저 고칠 곳도 거기가 아니다.
     */
    const doc0 = initial.current.replace(/\r\n/g, '\n')
    let anchor = 0
    if (doc0.startsWith('---\n')) {
      const end = doc0.indexOf('\n---', 4)
      if (end > 0) anchor = Math.min(doc0.length, doc0.indexOf('\n', end + 1) + 1)
    }
    const view = new EditorView({ state: EditorState.create({ doc: doc0, selection: { anchor }, extensions: ext }), parent: el })
    viewRef.current = view
    // QA 손잡이 — 스모크가 캐럿의 **문서 위치**를 읽는다(DOM 선택으로는 위젯 사이 자리를 못 잰다). 제품 코드는 이걸 안 쓴다
    ;(window as unknown as { __fbEditor?: EditorView }).__fbEditor = view
    /**
     * 밖에서 쓸 손잡이 — 목차가 «그 줄로» 부른다.
     * ⚠ `scrollIntoView` 는 **가운데**로 맞춘다(`y: 'center'`) — 맨 위로 붙이면 그 제목이 화면
     *    꼭대기에 걸려 바로 위 문맥이 안 보인다.
     * ⚠ 커서도 함께 옮긴다 — 안 옮기면 곧바로 타이핑했을 때 글이 **딴 곳에** 들어간다.
     */
    onReady?.({
      goToLine: (n: number) => {
        const v = viewRef.current
        if (!v || n < 1 || n > v.state.doc.lines) return
        const line = v.state.doc.line(n)
        v.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
        v.focus()
      }
    })
    view.focus()
    return () => {
      // ⚠ 떠나기 전에 못 낸 저장을 낸다 — 안 그러면 «쓰고 탭을 닫으면 사라진다»
      window.clearTimeout(timer)
      const text = view.state.doc.toString()
      if (text !== initial.current.replace(/\r\n/g, '\n')) commitRef.current(eol.current === '\r\n' ? text.replace(/\n/g, '\r\n') : text)
      view.destroy(); viewRef.current = null
    }
  }, [readOnly])

  /** 밖에서 바뀐 글만 넣는다 — 내가 친 글자는 이미 안에 있으므로 여기서 아무 일도 안 일어난다 */
  useEffect(() => {
    const v = viewRef.current; if (!v) return
    const next = value.replace(/\r\n/g, '\n')
    if (next === v.state.doc.toString()) return
    initial.current = value; eol.current = eolOf(value)
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } })
  }, [value])

  return <div className="mded" ref={box} />
}
