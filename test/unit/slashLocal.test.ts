import { describe, expect, it } from 'vitest'
import { CODEX_LOCAL, parseLocalSlash } from '../../src/core/slashLocal'

describe('우리가 직접 처리하는 슬래시 — Codex', () => {
  it('아는 명령만 잡는다', () => {
    expect(parseLocalSlash('/clear', CODEX_LOCAL)).toEqual({ name: 'clear', rest: '' })
    expect(parseLocalSlash('  /new  ', CODEX_LOCAL)).toEqual({ name: 'new', rest: '' })
    expect(parseLocalSlash('/compact', CODEX_LOCAL)).toBeNull()   // Codex 에 없는 일이다
    expect(parseLocalSlash('/모르는것', CODEX_LOCAL)).toBeNull()
  })

  // ⚠ 명령 뒤에 글이 붙으면 그 글은 **새 대화의 첫 말**이다
  it('뒤에 붙은 글을 따로 돌려준다', () => {
    expect(parseLocalSlash('/clear 그리고 다시 시작해', CODEX_LOCAL)).toEqual({ name: 'clear', rest: '그리고 다시 시작해' })
  })

  // ⛔ 글 속의 `/` 는 명령이 아니다 — 경로·분수·URL 이 전부 걸린다
  it('글 속 슬래시는 안 잡는다', () => {
    expect(parseLocalSlash('a/b 를 봐 줘', CODEX_LOCAL)).toBeNull()
    expect(parseLocalSlash('이 /clear 는 글자다', CODEX_LOCAL)).toBeNull()
    expect(parseLocalSlash('/Users/dave/x 를 열어', CODEX_LOCAL)).toBeNull()
  })
})
