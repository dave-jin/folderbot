import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { _forTest } from '../../src/client/MdEditor'

const doc = '# 제목\n\n**굵게** 와 글\n\n[예시](https://example.com/p) 옆 글\n\n| 가 | 나 |\n|---|---|\n| 1 | 2 |\n'
const mk = (anchor = 0) => EditorState.create({ doc, selection: { anchor }, extensions: [markdown({ extensions: [GFM] }), _forTest.frozenField, _forTest.lpField, _forTest.caretGuard] })

describe('caretGuard', () => {
  it('표를 걸친 선택은 표를 통째로 삼킨다', () => {
    const st = mk(doc.indexOf('옆 글'))
    const tFrom = doc.indexOf('| 가'), tTo = doc.indexOf('| 1 | 2 |') + '| 1 | 2 |'.length
    const atoms = st.field(_forTest.lpField).atoms
    expect(atoms.some((a) => a.from === tFrom && a.to === tTo && a.block)).toBe(true)
    const next = st.update({ selection: { anchor: st.selection.main.head, head: tFrom } }).state
    expect(next.selection.main.anchor).toBe(st.selection.main.head)
    expect(next.selection.main.head).toBe(tTo)
  })
  it('숨은 마커에 닿아도 앵커는 남는다', () => {
    const bold = doc.indexOf('굵게')
    const st = mk(bold)
    const next = st.update({ selection: { anchor: bold, head: bold + 3 } }).state   // `**` 안으로 한 글자
    expect(next.selection.main.anchor).toBe(bold)
    expect(next.selection.main.head).toBe(bold + 4)
  })
})
