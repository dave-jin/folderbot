import { useEffect, useRef } from 'react'
import { EditorState, StateField, type Extension, type Range } from '@codemirror/state'
import { EditorView, Decoration, WidgetType, keymap, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { syntaxTree, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

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
class ImgWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super() }
  eq(o: ImgWidget) { return o.src === this.src }
  toDOM() {
    const w = document.createElement('span'); w.className = 'lp-img'
    const img = document.createElement('img'); img.src = this.src; img.alt = this.alt; img.loading = 'lazy'
    w.appendChild(img); return w
  }
}

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s/
const WIKI_RE = /\[\[([^\]|]+)(\|[^\]]*)?\]\]/g
const IMG_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/

/** 선택이 닿은 줄 번호 — 이 줄에서는 마커를 안 숨긴다 */
function activeLines(state: EditorState): Set<number> {
  const out = new Set<number>()
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number, b = state.doc.lineAt(r.to).number
    for (let n = a; n <= b; n++) out.add(n)
  }
  return out
}

const HIDE = Decoration.replace({})

interface BuildOpts { onOpen?: (t: string) => void; rawUrl?: (rel: string) => string }
let opts: BuildOpts = {}
export function setEditorOpts(o: BuildOpts): void { opts = o }

function build(state: EditorState): { deco: DecorationSet; atoms: { from: number; to: number }[] } {
  const active = activeLines(state)
  const marks: Range<Decoration>[] = []
  const atoms: { from: number; to: number }[] = []
  const tree = syntaxTree(state)
  tree.iterate({
    enter: (n) => {
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
      const line = state.doc.lineAt(n.from)
      if (active.has(line.number)) return
      if (n.to <= n.from) return
      // 제목 마커는 뒤따르는 공백까지 함께 숨긴다 — 안 그러면 제목이 한 칸 밀려 보인다
      let to = n.to
      if (n.name === 'HeaderMark' && state.doc.sliceString(to, to + 1) === ' ') to += 1
      marks.push(HIDE.range(n.from, to))
      atoms.push({ from: n.from, to })
    }
  })
  // ── 파서가 모르는 것들은 줄을 직접 훑는다 (위키링크·체크박스·단독 이미지) ──
  // ⚠ lezer 는 `[[ ]]` 를 모르고, 체크박스는 한 글자만 갈아야 해서 줄 스캔이 더 정확하다.
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const live = active.has(n)
    const text = line.text

    const img = IMG_LINE_RE.exec(text)
    if (img && !live && opts.rawUrl) {
      const src = opts.rawUrl(img[2])
      if (src) { marks.push(Decoration.replace({ widget: new ImgWidget(src, img[1]), block: false }).range(line.from, line.to)); atoms.push({ from: line.from, to: line.to }); continue }
    }

    const task = TASK_RE.exec(text)
    if (task) {
      const at = line.from + task[1].length
      marks.push(Decoration.replace({ widget: new CheckWidget(task[2] !== ' ', at + 1) }).range(at, at + 3))
      atoms.push({ from: at, to: at + 3 })
    }

    if (!live) {
      WIKI_RE.lastIndex = 0
      for (let m = WIKI_RE.exec(text); m; m = WIKI_RE.exec(text)) {
        const from = line.from + m.index, to = from + m[0].length
        marks.push(Decoration.replace({ widget: new WikiWidget(m[1].trim(), opts.onOpen) }).range(from, to))
        atoms.push({ from, to })
      }
    }
  }

  marks.sort((a, b) => a.from - b.from || (a.value.spec.class ? -1 : 1))
  return { deco: Decoration.set(marks, true), atoms }
}

const lpField = StateField.define<{ deco: DecorationSet; atoms: { from: number; to: number }[] }>({
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
 * 캐럿이 숨긴 마커 **안**에 떨어지면 내용 쪽으로 민다.
 * ⚠ 원자 범위만으로는 부족하다 — 클릭으로 들어오는 캐럿은 `atomicRanges` 를 거치지 않는다.
 */
const caretGuard = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr
  const atoms = tr.startState.field(lpField, false)?.atoms
  if (!atoms?.length) return tr
  const head = tr.newSelection.main.head
  const hit = atoms.find((a) => head > a.from && head < a.to)
  if (!hit) return tr
  return [tr, { selection: { anchor: hit.to }, sequential: true }]
})

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

export default function MdEditor({ value, onCommit, onChange, readOnly, onOpen, rawUrl }: MdEditorProps) {
  setEditorOpts({ onOpen, rawUrl })
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
      history(), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      markdown({ extensions: [GFM] }), syntaxHighlighting(HL), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      highlightSelectionMatches(),
      lpField, atomic, caretGuard,
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
    const view = new EditorView({ state: EditorState.create({ doc: initial.current.replace(/\r\n/g, '\n'), extensions: ext }), parent: el })
    viewRef.current = view
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
