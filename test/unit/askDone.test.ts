import { describe, it, expect } from 'vitest'
import { askSummary } from '../../src/core/askDone'
import { askReply, askResultText } from '../../src/core/askPreview'

const input = { questions: [
  { question: '어느 장면에서 가장 아쉬우셨나요?', header: '아쉬운 장면', multiSelect: true, options: [{ label: '만든 것을 바로 못 본다' }, { label: '긴 글이 구조가 안 보인다' }, { label: '폴더 전체가 안 보인다' }, { label: '남에게 보여 줄 때' }] },
  { question: '어떤 모습으로 생각하셨나요?', header: '개요 페이지', options: [{ label: '자동 한 장 + 옆 채팅 (추천)' }, { label: 'readme 를 그림처럼 보기' }, { label: '봇이 그때그때 만드는 페이지' }] },
  { question: '어디까지 풀어 줄까요?', header: '자유도·안전', options: [{ label: '정해진 블록 + 격리된 미니 창 (추천)' }, { label: '정해진 블록만' }] }
] }
const [Q1, Q2, Q3] = input.questions.map((q) => q.question)

describe('askSummary', () => {
  it('호스트가 쓴 답 글과 왕복한다 — 여럿 고르기 + 직접 쓴 글(쉼표·따옴표 포함)', () => {
    const answers = { [Q1]: '만든 것을 바로 못 본다, 남에게 보여 줄 때, 답한 뒤 "뭘 답했는지", 내용이 안 보인다.', [Q2]: '자동 한 장 + 옆 채팅 (추천)', [Q3]: '정해진 블록 + 격리된 미니 창 (추천)' }
    const s = askSummary(input, askResultText(answers))!
    expect(s.partial).toBe(false)
    expect(s.rows.map((r) => r.header)).toEqual(['아쉬운 장면', '개요 페이지', '자유도·안전'])
    expect(s.rows[0].picks).toEqual(['만든 것을 바로 못 본다', '남에게 보여 줄 때'])
    expect(s.rows[0].free).toBe('답한 뒤 "뭘 답했는지", 내용이 안 보인다.')
    expect(s.rows[0].rest).toEqual(['긴 글이 구조가 안 보인다', '폴더 전체가 안 보인다'])
    expect(s.rows[1]).toMatchObject({ picks: ['자동 한 장 + 옆 채팅 (추천)'], free: '', edited: false, rest: ['readme 를 그림처럼 보기', '봇이 그때그때 만드는 페이지'] })
    expect(s.rows[2].picks).toEqual(['정해진 블록 + 격리된 미니 창 (추천)'])
  })
  it('CLI 가 쓴 머리말이어도 읽는다', () => {
    const s = askSummary(input, `User has answered your questions: "${Q2}"="readme 를 그림처럼 보기", "${Q3}"="정해진 블록만". You can now continue with these answers in mind.`)!
    expect(s.rows.map((r) => r.picks[0])).toEqual(['readme 를 그림처럼 보기', '정해진 블록만'])
    expect(s.partial).toBe(true)   // 첫 질문의 답이 글에 없다
  })
  it('하나 고르기에서 선택지에 없는 답은 직접 쓴 글이다', () => {
    const s = askSummary(input, askResultText({ [Q2]: '둘 다 섞어서, 폴더마다 다르게' }))!
    expect(s.rows[0]).toMatchObject({ picks: [], free: '둘 다 섞어서, 폴더마다 다르게' })
  })
  it('미리보기를 고쳐서 답했으면 edited — 고친 글·주석은 답에 섞이지 않는다', () => {
    const r = askReply({ [Q1]: '남에게 보여 줄 때', [Q2]: '자동 한 장 + 옆 채팅 (추천)', [Q3]: '정해진 블록만' }, { [Q2]: { block: { owner: '자동 한 장 + 옆 채팅 (추천)', text: '원래 글' }, text: '고친 글 "따옴표", 쉼표' } })
    const s = askSummary(input, askResultText(r.answers, r.annotations))!
    expect(s.rows[1]).toMatchObject({ picks: ['자동 한 장 + 옆 채팅 (추천)'], free: '', edited: true })
    expect(s.rows[2]).toMatchObject({ picks: ['정해진 블록만'], edited: false })
    expect(s.partial).toBe(false)
  })
  it('2000자에서 잘린 답은 partial — 읽은 데까지만 보인다', () => {
    const full = askResultText({ [Q1]: '만든 것을 바로 못 본다', [Q2]: '자동 한 장 + 옆 채팅 (추천)', [Q3]: '정해진 블록만' })
    const cut = full.slice(0, full.indexOf(Q3) + Q3.length + 6)   // 셋째 답이 중간에서 끊김
    const s = askSummary(input, cut)!
    expect(s.partial).toBe(true)
    expect(s.rows).toHaveLength(3)
    expect(s.rows[1].picks).toEqual(['자동 한 장 + 옆 채팅 (추천)'])
    expect(askSummary(input, full.slice(0, full.indexOf(Q2) - 3))!.rows).toHaveLength(1)
  })
  it('못 읽으면 null — 화면은 종전 도구 줄로 돌아간다', () => {
    expect(askSummary(input, '사용자가 질문을 취소했습니다. 반복하지 말고 진행하세요.')).toBeNull()
    expect(askSummary(input, '')).toBeNull()
    expect(askSummary(input, undefined)).toBeNull()
    expect(askSummary({}, askResultText({ [Q2]: 'x' }))).toBeNull()
    expect(askSummary(undefined, 'x')).toBeNull()
  })
  it('이름이 겹치는 선택지 — 긴 이름이 먼저다', () => {
    const inp = { questions: [{ question: 'Q', multiSelect: true, options: [{ label: '실행' }, { label: '실행, 고쳐서' }, { label: '하지 않음' }] }] }
    expect(askSummary(inp, askResultText({ Q: '실행, 고쳐서, 하지 않음' }))!.rows[0].picks).toEqual(['실행, 고쳐서', '하지 않음'])
  })
  it('옛 CLI 의 꼬리 문장도 답에 섞이지 않는다 · 답 글 그대로(answer)를 함께 준다', () => {
    const inp = { questions: [{ question: 'Q', options: [{ label: '가' }, { label: '나' }] }] }
    const r = askSummary(inp, 'User has answered your questions: "Q"="가". You can now continue with the user\'s answers in mind.')!
    expect(r.partial).toBe(false)
    expect(r.rows[0].picks).toEqual(['가'])
    expect(r.rows[0].answer).toBe('가')
  })
})
