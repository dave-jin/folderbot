import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { EditorSelection, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, keymap, type ViewUpdate } from '@codemirror/view'

/**
 * 서식 — 마크다운을 **글자로 외우지 않아도 되게** (2026-09-13 Dave: «# 같은 마크다운 단축어, 선택시 상단 메뉴»).
 *
 * 🔴 **문서는 끝까지 마크다운이다.** 여기서 하는 일은 사람이 칠 글자를 대신 넣어 주는 것뿐이고,
 *    파일에는 `**굵게**` 가 그대로 들어간다 — churn 0 계약이 그대로 산다(MdEditor 머리말).
 * ⚠ 서식 단추가 하는 일과 사람이 손으로 치는 일이 **같은 결과**여야 한다. 그래서 전부 «글자 넣기» 로 구현한다.
 */

/** 선택을 `**…**` 로 감싸거나 이미 감싸져 있으면 푼다. 선택이 없으면 표시만 넣고 그 사이에 커서를 둔다 */
export function toggleWrap(view: EditorView, mark: string): boolean {
  const changes = view.state.changeByRange((r) => {
    const doc = view.state.doc
    const before = doc.sliceString(Math.max(0, r.from - mark.length), r.from)
    const after = doc.sliceString(r.to, Math.min(doc.length, r.to + mark.length))
    if (before === mark && after === mark) {
      // 이미 감싸져 있다 — 푼다
      return {
        changes: [{ from: r.from - mark.length, to: r.from }, { from: r.to, to: r.to + mark.length }],
        range: EditorSelection.range(r.from - mark.length, r.to - mark.length)
      }
    }
    const text = doc.sliceString(r.from, r.to)
    return {
      changes: { from: r.from, to: r.to, insert: `${mark}${text}${mark}` },
      range: text
        ? EditorSelection.range(r.from + mark.length, r.to + mark.length)
        : EditorSelection.cursor(r.from + mark.length)
    }
  })
  view.dispatch(changes, { scrollIntoView: true, userEvent: 'input.format' })
  return true
}

/** 줄 앞에 `> ` · `- [ ] ` 같은 표시를 넣거나 뺀다 (여러 줄을 골랐으면 전부) */
export function setBlockPrefix(view: EditorView, prefix: string): boolean {
  const { state } = view
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n)
  }
  const all = [...lines].map((n) => state.doc.line(n))
  const has = all.every((l) => l.text.startsWith(prefix))
  view.dispatch({
    changes: all.map((l) => (has
      ? { from: l.from, to: l.from + prefix.length, insert: '' }
      : { from: l.from, to: l.from, insert: prefix })),
    userEvent: 'input.format'
  })
  return true
}

/** 제목 — 누를 때마다 H1 → H2 → H3 → 없음 */
export function cycleHeading(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const m = /^(#{1,6})\s/.exec(line.text)
  const next = !m ? '# ' : m[1].length >= 3 ? '' : `${'#'.repeat(m[1].length + 1)} `
  view.dispatch({ changes: { from: line.from, to: line.from + (m ? m[0].length : 0), insert: next }, userEvent: 'input.format' })
  return true
}

/** `[고른 글](주소)` — 주소 자리에 커서를 둔다 */
export function insertLink(view: EditorView): boolean {
  const r = view.state.selection.main
  const text = view.state.doc.sliceString(r.from, r.to)
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: `[${text}]()` },
    selection: { anchor: r.from + text.length + 3 },
    userEvent: 'input.format'
  })
  return true
}

const TABLE = ['| 열 1 | 열 2 | 열 3 |', '| --- | --- | --- |', '|  |  |  |', '|  |  |  |', ''].join('\n')

interface Slash { label: string; detail: string; keys: string; insert: string; back?: number }
const SLASH: Slash[] = [
  { label: '제목 1', detail: '# 큰 제목', keys: 'h1 heading 제목', insert: '# ' },
  { label: '제목 2', detail: '## 중간 제목', keys: 'h2 heading 제목', insert: '## ' },
  { label: '제목 3', detail: '### 작은 제목', keys: 'h3 heading 제목', insert: '### ' },
  { label: '체크박스', detail: '- [ ] 할 일', keys: 'todo check task 체크 할일', insert: '- [ ] ' },
  { label: '불릿 목록', detail: '- 항목', keys: 'bullet list ul 목록', insert: '- ' },
  { label: '번호 목록', detail: '1. 항목', keys: 'number ordered ol 번호', insert: '1. ' },
  { label: '표', detail: '3×3 — 칸을 눌러 고친다', keys: 'table 표 테이블', insert: TABLE },
  { label: '인용', detail: '> 인용문', keys: 'quote 인용', insert: '> ' },
  { label: '콜아웃', detail: '> [!note] 강조 상자', keys: 'callout note 콜아웃', insert: '> [!note] ' },
  { label: '코드 블록', detail: '``` 코드 ```', keys: 'code fence 코드', insert: '```\n\n```', back: 4 },
  { label: '구분선', detail: '---', keys: 'divider hr rule 구분선', insert: '---\n' }
]

/** `/` 로 시작하는 줄에서만 뜬다 — 글 가운데의 «and/or» 같은 슬래시에 끼어들지 않게 */
const SLASH_OK = /^\s*(?:(?:[-*+] (?:\[[ xX]\] )?|\d+\. |> )\s*)*$/

function slashSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const head = line.text.slice(0, ctx.pos - line.from)
  const m = /\/([^/\s]*)$/.exec(head)
  if (!m) return null
  if (!SLASH_OK.test(head.slice(0, m.index))) return null
  /**
   * ⚠ **`from` 은 슬래시 «다음» 이다.** 슬래시부터로 주면 CodeMirror 가 걸러 낼 글자에 `/` 가 들어가서
   *    라벨과 하나도 안 맞고 **목록이 통째로 비어 버린다**(그래서 메뉴가 안 뜬다 — 실제로 그랬다).
   *    넣을 때는 슬래시까지 지워야 하므로 `apply` 안에서 `slashAt` 을 따로 쓴다.
   */
  const slashAt = line.from + m.index
  const from = slashAt + 1
  const options: Completion[] = SLASH.map((s) => ({
    label: s.label,
    detail: s.detail,
    // ⚠ 후보를 찾는 글자는 한국어·영어 둘 다 — 사람이 `/todo` 로도 `/할일` 로도 친다
    apply: (v: EditorView) => {
      v.dispatch({ changes: { from: slashAt, to: ctx.pos, insert: s.insert }, selection: { anchor: slashAt + s.insert.length - (s.back ?? 0) }, userEvent: 'input.format' })
    },
    boost: 0,
    section: undefined,
    type: 'keyword',
    // 검색어를 라벨에 실어 준다(직접 매칭)
    displayLabel: s.label,
    filterText: `${s.label} ${s.keys}`
  } as unknown as Completion))
  return { from, options, validFor: /^[^/\s]*$/ }
}

export function slashMenu(): Extension {
  return autocompletion({ override: [slashSource], icons: false, defaultKeymap: true, activateOnTyping: true })
}

export const formatKeymap = keymap.of([
  { key: 'Mod-b', run: (v) => toggleWrap(v, '**') },
  { key: 'Mod-i', run: (v) => toggleWrap(v, '*') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-Shift-x', run: (v) => toggleWrap(v, '~~') },
  { key: 'Mod-Shift-7', run: (v) => setBlockPrefix(v, '- [ ] ') },
  { key: 'Mod-Shift-.', run: (v) => setBlockPrefix(v, '> ') }
])

const BTNS: { t: string; title: string; run: (v: EditorView) => boolean; cls?: string }[] = [
  { t: 'H', title: '제목 — 누를 때마다 H1 → H2 → H3 → 없음', run: cycleHeading },
  { t: 'B', title: '굵게 ⌘B', cls: 'b', run: (v) => toggleWrap(v, '**') },
  { t: 'I', title: '기울임 ⌘I', cls: 'i', run: (v) => toggleWrap(v, '*') },
  { t: 'S', title: '취소선', cls: 's', run: (v) => toggleWrap(v, '~~') },
  { t: '<>', title: '코드', run: (v) => toggleWrap(v, '`') },
  { t: '링크', title: '링크 ⌘K', run: insertLink },
  { t: '❝', title: '인용', run: (v) => setBlockPrefix(v, '> ') },
  { t: '☐', title: '체크박스', run: (v) => setBlockPrefix(v, '- [ ] ') }
]

/**
 * 고른 글 위에 뜨는 서식 막대.
 * 🔴 **고른 것이 있을 때만 뜬다** — 늘 떠 있으면 «조용한 문서» 가 아니게 된다.
 * ⚠ 위치는 선택의 **시작 줄 위**. 화면 위로 넘치면 아래로 내린다.
 * ⛔ 막대를 누를 때 선택이 풀리면 안 된다 — `mousedown` 을 막는다.
 */
export function selectionBar(): Extension {
  return ViewPlugin.fromClass(class {
    bar: HTMLDivElement
    constructor(readonly view: EditorView) {
      this.bar = document.createElement('div')
      this.bar.className = 'mdbar'
      this.bar.onmousedown = (e) => e.preventDefault()
      for (const b of BTNS) {
        const el = document.createElement('button')
        el.textContent = b.t; el.title = b.title; el.type = 'button'
        if (b.cls) el.className = b.cls
        el.onclick = () => { b.run(view); view.focus() }
        this.bar.appendChild(el)
      }
      view.dom.appendChild(this.bar)
      this.schedule()
    }
    /**
     * ⛔ **`update()` 안에서 화면 치수를 읽지 않는다.** `coordsAtPos` 는 레이아웃을 읽는 호출이라
     *    갱신 도중에 부르면 CodeMirror 가 «Reading the editor layout isn't allowed during an update» 로
     *    **플러그인을 통째로 내린다** — 그러면 막대가 조용히 사라진다(실제로 그렇게 사라졌다).
     *    재는 것은 `requestMeasure` 의 `read`, 고치는 것은 `write` — 그게 이 프레임워크의 계약이다.
     */
    update(u: ViewUpdate) { if (u.selectionSet || u.docChanged || u.geometryChanged) this.schedule() }
    schedule() {
      this.view.requestMeasure({
        read: () => {
          const r = this.view.state.selection.main
          if (r.empty || this.view.state.readOnly) return null
          const c = this.view.coordsAtPos(r.from)
          if (!c) return null
          const box = this.view.dom.getBoundingClientRect()
          return { left: Math.max(8, c.left - box.left), top: Math.max(4, c.top - box.top + this.view.scrollDOM.scrollTop - 38) }
        },
        write: (m: { left: number; top: number } | null) => {
          if (!m) { this.bar.classList.remove('on'); return }
          this.bar.classList.add('on')
          this.bar.style.left = `${m.left}px`
          this.bar.style.top = `${m.top}px`
        }
      })
    }
    destroy() { this.bar.remove() }
  })
}
