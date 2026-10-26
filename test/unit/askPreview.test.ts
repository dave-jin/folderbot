import { describe, it, expect } from 'vitest'
import { activePreview, askEcho, askReply, askResultText, cleanAnnotations, EDIT_MARK, EDIT_NOTE, monoText, sameText, type AskQuestion } from '../../src/core/askPreview'

/**
 * DL · 질문 카드의 미리보기 블록 (2026-10-26 Dave: *«미리 확인하는 내용이 블록에 들어가 예쁘게 · 내가 수정도 · 수정한 게 바로 반영돼서»*).
 *    박찬수 대표 확정 메일 카드가 «보낼까요?» 만 보였고 초안은 접힌 «생각» 줄에 숨었다(스크린샷_1706) — 카드가 `preview` 를 안 읽었다.
 */
const MAIL = '받는 사람: 박찬수 대표\n\n대표님, 안녕하세요.\n11/3 확정입니다.'
const q: AskQuestion = { question: '보낼까요?', options: [{ label: '실행', preview: MAIL }, { label: '고쳐서 실행' }, { label: '하지 않음' }] }

describe('activePreview — 지금 보일 블록', () => {
  it('아무것도 안 골랐으면 글이 있는 첫 선택지', () => { expect(activePreview(q, [])).toEqual({ owner: '실행', text: MAIL }) })
  it('🔴 글 없는 선택지(«고쳐서 실행»)를 골라도 블록이 사라지지 않는다 — 고치던 글이 날아가면 안 된다', () => {
    expect(activePreview(q, ['고쳐서 실행'], '실행')).toEqual({ owner: '실행', text: MAIL })
  })
  it('글이 다른 선택지를 고르면 그 글로 바뀐다', () => {
    const q2: AskQuestion = { question: 'x', options: [{ label: 'A', preview: 'aa' }, { label: 'B', preview: 'bb' }] }
    expect(activePreview(q2, ['B'])?.text).toBe('bb')
    expect(activePreview(q2, [], 'B')?.text).toBe('bb')
  })
  it('질문 자체에 붙은 글도 블록이 된다', () => { expect(activePreview({ question: 'x', preview: '본문', options: [{ label: 'a' }, { label: 'b' }] }, [])).toEqual({ owner: '', text: '본문' }) })
  it('글이 하나도 없으면 블록 없음(종전 카드 그대로)', () => { expect(activePreview({ question: 'x', options: [{ label: 'a' }, { label: 'b' }] }, ['a'])).toBeNull() })
  it('빈 글·공백 글은 블록이 아니다', () => { expect(activePreview({ question: 'x', options: [{ label: 'a', preview: '  \n' }, { label: 'b' }] }, [])).toBeNull() })
})

describe('askReply — 고친 글이 답에 실린다', () => {
  const block = { owner: '실행', text: MAIL }
  it('안 고쳤으면 종전과 같다 — annotations 없음 · 표시 없음', () => {
    expect(askReply({ '보낼까요?': '실행' }, { '보낼까요?': undefined })).toEqual({ answers: { '보낼까요?': '실행' } })
    expect(askReply({ '보낼까요?': '실행' }, { '보낼까요?': { block, text: MAIL + '\n\n' } })).toEqual({ answers: { '보낼까요?': '실행' } })   // 끝 줄바꿈만 다르면 안 고친 것
  })
  it('🔴 고쳤으면 답 끝에 « (고친 글로)» + annotations[질문] = { preview: 고친 전문, notes }', () => {
    const fixed = MAIL.replace('11/3', '11/4')
    const r = askReply({ '보낼까요?': '실행' }, { '보낼까요?': { block, text: fixed } })
    expect(r.answers['보낼까요?']).toBe('실행' + EDIT_MARK)
    expect(r.annotations).toEqual({ '보낼까요?': { preview: fixed, notes: EDIT_NOTE } })
  })
  it('답이 없는 질문의 고친 글은 싣지 않는다(보내기 단추가 막혀 있어야 할 자리)', () => {
    expect(askReply({}, { '보낼까요?': { block, text: 'x' } })).toEqual({ answers: {} })
  })
  it('여러 질문 — 고친 질문에만 붙는다', () => {
    const r = askReply({ a: '실행', b: '예' }, { a: { block, text: 'new' }, b: undefined })
    expect(r.answers).toEqual({ a: '실행' + EDIT_MARK, b: '예' })
    expect(Object.keys(r.annotations ?? {})).toEqual(['a'])
  })
})

describe('호스트 쪽', () => {
  it('cleanAnnotations — 글자만 · 답 있는 질문만 · 상한', () => {
    expect(cleanAnnotations(undefined, { a: 'x' })).toBeUndefined()
    expect(cleanAnnotations([1], { a: 'x' })).toBeUndefined()
    expect(cleanAnnotations({ a: { preview: 'p', notes: 3 }, z: { preview: 'q' } }, { a: 'x' })).toEqual({ a: { preview: 'p' } })
    expect(cleanAnnotations({ a: { preview: 'x'.repeat(70000) } }, { a: 'x' })?.a.preview?.length).toBe(65536)
  })
  it('🔴 미뤄진 질문의 답 글에 고친 전문이 실린다 — 종전 JSON 은 답만 실었다', () => {
    const t = askResultText({ '보낼까요?': '실행' + EDIT_MARK }, { '보낼까요?': { preview: '고친 본문\n둘째 줄', notes: EDIT_NOTE } })
    expect(t).toContain('"보낼까요?"="실행 (고친 글로)"')
    expect(t).toContain('selected preview:\n고친 본문\n둘째 줄')
    expect(t).toContain(`notes: ${EDIT_NOTE}`)
    expect(askResultText({ q: 'a' })).toBe('Your questions have been answered: "q"="a". You can now continue with these answers in mind.')
  })
  it('대화 줄에는 고른 답 + 고친 전문', () => {
    expect(askEcho({ a: '실행 (고친 글로)' }, { a: { preview: '본문' } })).toBe('실행 (고친 글로)\n\n고친 글:\n본문')
    expect(askEcho({ a: '예', b: '아니오' })).toBe('예 · 아니오')
  })
})

describe('그리기', () => {
  it('상자 그림·코드 울타리는 고정폭, 메일 본문은 본문 글꼴', () => {
    expect(monoText('┌──┐\n│ a │')).toBe(true)
    expect(monoText('```\ncode\n```')).toBe(true)
    expect(monoText(MAIL)).toBe(false)
  })
  it('sameText — CRLF·끝 공백만 다르면 같다', () => { expect(sameText('a\r\nb  \n', 'a\nb')).toBe(true); expect(sameText('a', 'b')).toBe(false) })
})
