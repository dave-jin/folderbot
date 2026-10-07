import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * 입력창 — **글 속에 칩이 선다** (2026-09-15 Dave: «칩이 채팅 창 안으로 들어가야 해», Rondo 입력창과 같은 꼴).
 *
 * 🔴 **모델은 그대로 글자열이다.** 첨부는 글 속 `@이름` 토큰이고, 이 칸은 그 토큰을 **칩으로 그릴 뿐**이다.
 *    보내기·슬래시·@ 고르기·캐럿 계산은 종전 textarea 시절의 `text`·`caret` 를 그대로 쓴다 — 그래서 이 파일이 하는 일은
 *    «DOM ↔ 글자열» 왕복 둘뿐이다: `serialize`(DOM → 글) 와 `render`(글 → DOM).
 * ⚠ CodeMirror 를 안 쓴 이유 — 번들 계약(«편집기는 지연 로드, 본체에 CodeMirror 를 섞지 않는다»). 입력창은 첫 화면에
 *    있어야 하므로 contenteditable 로 직접 한다. 평평한 구조(글자 · <br> · 칩)만 허용해 왕복을 단순하게 지킨다.
 * ⚠ **한글 조합 중에는 DOM 을 다시 그리지 않는다** — 조합 중에 노드를 갈아끼우면 IME 가 끊겨 «안녕» 이 «ㅇ» 으로 남는다.
 *    조합이 끝난 뒤 한 번 맞춘다.
 * ⚠ 칩은 `contenteditable=false` 라 ⌫ 한 번에 통째로 지워진다(크롬이 원자로 다룬다). × 단추는 없다.
 */
export interface ChipInfo { abs: string; dir?: boolean; folder?: string; busy?: boolean; icon: ReactNode }
export interface InlineInputHandle { focus: () => void; setSelection: (pos: number) => void; el: () => HTMLDivElement | null }
interface Props {
  value: string
  chips: Record<string, ChipInfo>
  placeholder?: string
  className?: string
  onChange: (text: string, caret: number) => void
  onCaret: (caret: number) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  onFocus?: () => void
  onChipClick?: (name: string) => void
}

const TOKEN = /@([^\s@]+)/g

const BLOCK = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'UL', 'OL'])
/**
 * DOM → 글. 평소에는 평평하다: 글자 · <br>(줄바꿈) · 칩(`@이름`). 맨 끝의 <br> 은 크롬이 두는 자리표라 셈하지 않는다.
 * 🔴 **BM-1 · 낯선 요소 속 줄바꿈을 살린다** (2026-10-07 Dave · IMG_2304). 붙여넣기·폰 키보드가 줄을 `<div>`·`<p>` 로 나누거나
 *    `<span>…<br>…</span>` 로 감싸 넣으면, 종전에는 그 요소의 `textContent` 만 이어 붙여 **줄바꿈이 통째로 사라진 채 보내졌다**
 *    (실제로 «정리:• 크진 않지만 …• 이번 행사의 …» 가 한 줄로 저장됐다). 이제 안까지 내려가며 블록은 줄로, <br> 은 줄바꿈으로 센다.
 *    목록 칸(<li>)은 마크다운 목록(`- `)으로 남긴다. 화면은 다음 그리기(`render`)에서 다시 평평해진다.
 */
export function serialize(el: HTMLElement): string {
  let out = ''
  let pendingNL = false
  const put = (s: string) => { if (!s) return; if (pendingNL) { if (!out.endsWith('\n')) out += '\n'; pendingNL = false } out += s }
  const walk = (parent: Node, top: boolean) => {
    const kids = Array.from(parent.childNodes)
    kids.forEach((n, i) => {
      if (n.nodeType === Node.TEXT_NODE) { put(n.textContent ?? ''); return }
      if (!(n instanceof HTMLElement)) return
      if (n.dataset.chip !== undefined) { put(`@${n.dataset.chip}`); return }
      if (n.tagName === 'BR') {
        // 맨 끝 <br> 은 자리표 — 맨 위에서는 늘, 블록 안에서는 앞에 글이 있을 때
        if (i === kids.length - 1 && (top || i > 0)) return
        pendingNL = false; out += '\n'; return
      }
      if (BLOCK.has(n.tagName)) {
        if (out && !out.endsWith('\n')) out += '\n'
        pendingNL = false
        if (n.tagName === 'LI') out += n.parentElement?.tagName === 'OL' ? `${Array.from(n.parentElement.children).indexOf(n) + 1}. ` : '- '
        walk(n, false)
        pendingNL = true
        return
      }
      walk(n, false)   // <span>·<b> 같은 글 속 요소 — 안의 글과 줄바꿈을 그대로
    })
  }
  walk(el, true)
  return out
}

/** 캐럿의 글자열 자리 — 앞에 있는 노드들의 길이를 더한다 */
function caretOf(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return serialize(el).length
  const r = sel.getRangeAt(0)
  if (!el.contains(r.startContainer)) return serialize(el).length
  let pos = 0
  for (const n of Array.from(el.childNodes)) {
    if (n === r.startContainer) return pos + r.startOffset
    if (n.contains(r.startContainer)) return pos + (n.nodeType === Node.TEXT_NODE ? r.startOffset : 0)
    if (n.nodeType === Node.TEXT_NODE) pos += (n.textContent ?? '').length
    else if (n instanceof HTMLElement) pos += n.dataset.chip !== undefined ? n.dataset.chip.length + 1 : n.tagName === 'BR' ? 1 : (n.textContent ?? '').length
    if (r.startContainer === el && Array.from(el.childNodes).indexOf(n) === r.startOffset - 1) return pos
  }
  return pos
}

function placeCaret(el: HTMLElement, pos: number): void {
  const sel = window.getSelection(); if (!sel) return
  const range = document.createRange()
  let left = pos
  const kids = Array.from(el.childNodes)
  for (const n of kids) {
    const len = n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '').length : n instanceof HTMLElement && n.dataset.chip !== undefined ? n.dataset.chip.length + 1 : n instanceof HTMLElement && n.tagName === 'BR' ? 1 : (n.textContent ?? '').length
    if (left <= len) {
      if (n.nodeType === Node.TEXT_NODE) { range.setStart(n, left); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); return }
      // 칩·<br> 안에는 못 들어간다 — 앞(0)이면 그 앞, 아니면 그 뒤
      const idx = kids.indexOf(n) + (left === 0 ? 0 : 1)
      range.setStart(el, idx); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); return
    }
    left -= len
  }
  range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range)
}

/** 글 → 자식 목록(구조 비교용). `@이름` 이 칩 목록에 있으면 칩, 아니면 글자 그대로 */
function tokens(value: string, chips: Record<string, ChipInfo>): { t: 'text' | 'chip'; s: string }[] {
  const out: { t: 'text' | 'chip'; s: string }[] = []
  let last = 0; let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(value))) {
    if (!chips[m[1]]) continue
    if (m.index > last) out.push({ t: 'text', s: value.slice(last, m.index) })
    out.push({ t: 'chip', s: m[1] }); last = m.index + m[0].length
  }
  if (last < value.length) out.push({ t: 'text', s: value.slice(last) })
  return out
}
function structure(el: HTMLElement): { t: 'text' | 'chip'; s: string }[] {
  const out: { t: 'text' | 'chip'; s: string }[] = []
  for (const n of Array.from(el.childNodes)) {
    if (n instanceof HTMLElement && n.dataset.chip !== undefined) out.push({ t: 'chip', s: n.dataset.chip })
    else {
      const s = n instanceof HTMLElement && n.tagName === 'BR' ? '\n' : (n.textContent ?? '')
      const prev = out[out.length - 1]
      if (prev && prev.t === 'text') prev.s += s; else out.push({ t: 'text', s })
    }
  }
  // 맨 끝의 자리표 <br>
  const last = out[out.length - 1]; if (last && last.t === 'text' && last.s.endsWith('\n') && !serializeEndsNL(el)) last.s = last.s.slice(0, -1)
  return out.filter((x) => x.s.length)
}
function serializeEndsNL(el: HTMLElement): boolean { return serialize(el).endsWith('\n') }
/**
 * 🔴 **끝 줄바꿈에는 자리표 `<br>` 이 있어야 보인다** (I-1 · 2026-09-19 실측 `test/repro-enter.mjs`).
 *    pre-wrap 에서 텍스트 끝의 `\n` 은 **줄로 그려지지 않는다** — 그래서 ⇧⏎ 한 번은 값에만 남고 화면은 그대로였고,
 *    이어서 글자를 치면 크롬이 그 `\n` 을 흡수해 **줄바꿈이 사라졌다**(«두 번 눌러야 줄이 바뀐다» 의 실체 — IME 가 아니다).
 *    `render()` 는 «구조가 같으면 손대지 않는다» 라 자리표를 못 붙였다. 그래서 자리표는 **여기 한 곳**에서 맞춘다 —
 *    끝이 `\n` 이면 `<br>` 을 두고, 아니면 남은 자리표를 뗀다(크롬이 스스로 둔 자리표는 serialize 가 이미 셈하지 않는다).
 */
export function ensureTail(el: HTMLElement): void {
  const kids = Array.from(el.childNodes)
  const last = kids[kids.length - 1]
  const lastIsBr = !!last && last.nodeName === 'BR'
  const body = lastIsBr ? kids[kids.length - 2] : last
  const endsNL = !!body && body.nodeType === Node.TEXT_NODE && (body.textContent ?? '').endsWith('\n')
  if (endsNL && !lastIsBr) el.appendChild(document.createElement('br'))
  else if (!endsNL && lastIsBr && kids.length > 1 && body && body.nodeType === Node.TEXT_NODE) last.remove()
}
const same = (a: { t: string; s: string }[], b: { t: string; s: string }[]) => a.length === b.length && a.every((x, i) => x.t === b[i].t && x.s === b[i].s)

export const InlineInput = forwardRef<InlineInputHandle, Props>(function InlineInput({ value, chips, placeholder, className, onChange, onCaret, onKeyDown, onFocus, onChipClick }, ref) {
  const el = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const roots = useRef<Map<HTMLElement, Root>>(new Map())
  const latest = useRef({ value, chips, onChange, onCaret, onChipClick }); latest.current = { value, chips, onChange, onCaret, onChipClick }

  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus({ preventScroll: true }),   // P-4 · Safari 가 포커스 때 문서를 밀지 않게
    setSelection: (pos) => { const e = el.current; if (!e) return; e.focus({ preventScroll: true }); placeCaret(e, pos) },
    el: () => el.current
  }), [])

  /** 글 → DOM. 구조가 이미 같으면 손대지 않는다(캐럿·IME 보호) */
  const render = () => {
    const e = el.current; if (!e || composing.current) return
    const want = tokens(latest.current.value, latest.current.chips)
    const chipsChanged = Array.from(e.querySelectorAll<HTMLElement>('[data-chip]')).some((c) => { const info = latest.current.chips[c.dataset.chip ?? '']; return !info || c.dataset.busy !== (info.busy ? '1' : '') })
    if (!chipsChanged && same(structure(e), want)) { e.dataset.value = latest.current.value; ensureTail(e); return }
    const pos = document.activeElement === e ? caretOf(e) : -1
    for (const r of roots.current.values()) r.unmount(); roots.current.clear()
    e.replaceChildren()
    for (const t of want) {
      if (t.t === 'text') { e.appendChild(document.createTextNode(t.s)); continue }
      const info = latest.current.chips[t.s]
      const span = document.createElement('span')
      span.className = `ichip ${info.dir ? 'dir' : ''} ${info.busy ? 'busy' : ''}`
      span.contentEditable = 'false'; span.dataset.chip = t.s; span.dataset.busy = info.busy ? '1' : ''; span.title = info.abs
      span.onclick = () => latest.current.onChipClick?.(t.s)
      const root = createRoot(span); roots.current.set(span, root)
      root.render(<>{info.busy ? <span className="spin" /> : info.icon}<span className="nm">{t.s}{info.dir ? '/' : ''}</span>{info.folder ? <span className="fb">{info.folder}</span> : null}</>)
      e.appendChild(span)
    }
    // 끝이 줄바꿈이거나 칩이면 크롬이 빈 줄·뒤 자리를 안 그린다 — 자리표 <br>
    const lastKid = e.lastChild
    if (!lastKid || (lastKid.nodeType === Node.TEXT_NODE && (lastKid.textContent ?? '').endsWith('\n'))) e.appendChild(document.createElement('br'))
    e.dataset.value = latest.current.value
    if (pos >= 0) placeCaret(e, Math.min(pos, latest.current.value.length))
  }
  useEffect(render, [value, chips])
  /*
   * BM-1 · 폰 키보드의 줄 넣기도 우리가 넣는다 — 한글 조합 중에 누른 ⏎ 는 keydown 이 IME 몫이라 아래 onKeyDown 을 지나쳐
   *    브라우저가 `<div>` 를 만든다(insertParagraph). 그 길을 `\n` 하나로 바꾼다. 조합 중이면 확정 뒤에 넣는다.
   */
  useEffect(() => {
    const e = el.current; if (!e) return
    const f = (ev: InputEvent) => {
      if (ev.inputType !== 'insertParagraph' && ev.inputType !== 'insertLineBreak') return
      ev.preventDefault()
      if (composing.current) nlAfterCompose.current = true; else insertText('\n')
    }
    e.addEventListener('beforeinput', f)
    return () => e.removeEventListener('beforeinput', f)
  })
  useEffect(() => () => { for (const r of roots.current.values()) r.unmount() }, [])

  const emit = () => { const e = el.current; if (!e) return; const t = serialize(e); e.dataset.value = t; latest.current.onChange(t, caretOf(e)) }
  const insertText = (s: string) => {
    const e = el.current; if (!e) return
    const sel = window.getSelection(); if (!sel || !sel.rangeCount || !e.contains(sel.getRangeAt(0).startContainer)) { e.focus(); placeCaret(e, serialize(e).length) }
    const r = window.getSelection()!.getRangeAt(0); r.deleteContents()
    const pos = caretOf(e)
    const node = document.createTextNode(s); r.insertNode(node)
    // ⚠ 글자 노드 한가운데 넣으면 크롬이 노드를 **셋으로 쪼갠다**(«abc» · «\n» · «») — 빈 꼬리가 남아 끝 판정이 틀렸다(실측).
    //   합친 뒤 자리표를 맞추고 캐럿은 글자 수로 다시 놓는다 (I-1)
    e.normalize()
    ensureTail(e)   // ⇧⏎ 로 끝에 넣은 줄바꿈이 **그 자리에서** 보이게
    placeCaret(e, pos + s.length)
    emit()
  }
  /**
   * 조합 중의 ⇧⏎ (I-1) — 크롬은 keydown 을 `isComposing` 으로 IME 에 넘기고 조합만 확정한다(줄은 안 넣는다).
   * 그래서 «한 번 더» 눌러야 했다. 키를 기억해 두었다가 `compositionend` 에서 줄을 넣는다 — 한 번에 «확정 + 줄».
   * ⚠ Safari 는 순서가 반대다(compositionend → keydown, isComposing=false) — 그쪽은 아래 onKeyDown 이 그대로 처리한다.
   */
  const nlAfterCompose = useRef(false)

  return <div ref={el} className={`cin ${className ?? ''}`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder={placeholder ?? ''} data-value={value}
    onInput={emit}
    onCompositionStart={() => { composing.current = true }}
    onCompositionEnd={() => { composing.current = false; emit(); if (nlAfterCompose.current) { nlAfterCompose.current = false; insertText('\n') } requestAnimationFrame(render) }}
    onKeyUp={() => { const e = el.current; if (e) latest.current.onCaret(caretOf(e)) }}
    onClick={() => { const e = el.current; if (e) latest.current.onCaret(caretOf(e)) }}
    onFocus={onFocus}
    onKeyDown={(e) => {
      onKeyDown?.(e)
      // 조합 중의 ⇧⏎ — IME 가 키를 먹고 조합만 확정한다. 줄은 compositionend 에서 우리가 넣는다(브라우저 기본 삽입은 막는다 — 두 번 들어간다)
      if (e.nativeEvent.isComposing) { if (e.key === 'Enter' && e.shiftKey) { nlAfterCompose.current = true; e.preventDefault() } return }
      if (e.defaultPrevented) return
      // 줄 바꿈은 우리가 넣는다 — 크롬의 <div> 쪼개기를 막아 구조를 평평하게 지킨다
      if (e.key === 'Enter') { e.preventDefault(); insertText('\n') }
    }}
    onPaste={(e) => {
      // 그림은 바깥(.composer)이 받아 올린다 — 글만 우리가 평문으로 넣는다
      const items = Array.from(e.clipboardData.items)
      if (items.some((i) => i.type.startsWith('image/'))) return
      const t = e.clipboardData.getData('text/plain'); if (!t) return
      e.preventDefault(); insertText(t)
    }}
  />
})
