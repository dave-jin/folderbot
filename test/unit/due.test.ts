import { describe, it, expect } from 'vitest'
import { dueChipOf, dueText, parseDueWord, quickDues, splitDue } from '../../src/core/due'
import { addLine, editLine, parseTodo, setDueLine, setMetaLine, splitMeta, toggleLine } from '../../src/core/todo'

/** CK-1 · 할 일 줄 마감 (2026-10-16 · 기획안 §2) — 오늘은 2026-10-16(금) */
const T = new Date(2026, 9, 16)

describe('CK-1 · 사람 말 → 날짜', () => {
  it('오늘·내일·모레', () => {
    expect(parseDueWord('오늘', T)).toBe('2026-10-16')
    expect(parseDueWord('내일', T)).toBe('2026-10-17')
    expect(parseDueWord('모레까지', T)).toBe('2026-10-18')
  })
  it('요일 — 오늘 포함 다가오는 날 · 이번 주/다음 주(월요일 시작)', () => {
    expect(parseDueWord('금요일', T)).toBe('2026-10-16')
    expect(parseDueWord('월요일', T)).toBe('2026-10-19')
    expect(parseDueWord('이번 주 금', T)).toBe('2026-10-16')
    expect(parseDueWord('다음 주 월', T)).toBe('2026-10-19')
    expect(parseDueWord('다음주 수요일', T)).toBe('2026-10-21')
  })
  it('M/D · M월 D일 · 지난 날짜면 내년 · D일은 다가오는 날', () => {
    expect(parseDueWord('10/20', T)).toBe('2026-10-20')
    expect(parseDueWord('10월 20일', T)).toBe('2026-10-20')
    expect(parseDueWord('1/5', T)).toBe('2027-01-05')
    expect(parseDueWord('20일', T)).toBe('2026-10-20')
    expect(parseDueWord('3일', T)).toBe('2026-11-03')
    expect(parseDueWord('2/30', T)).toBeNull()
  })
  it('🔴 맨 숫자와 모르는 말은 날짜로 읽지 않는다', () => {
    expect(parseDueWord('20', T)).toBeNull()
    expect(parseDueWord('언젠가', T)).toBeNull()
  })
  it('입력칸 끝의 마감 말만 떼어 낸다', () => {
    expect(splitDue('강의안 넘기기: 디캠프에 PDF 로 내일', T)).toEqual({ text: '강의안 넘기기: 디캠프에 PDF 로', due: '2026-10-17' })
    expect(splitDue('제안서 10/20 까지', T)).toEqual({ text: '제안서', due: '2026-10-20' })
    expect(splitDue('보고서 📅 2026-11-02', T)).toEqual({ text: '보고서', due: '2026-11-02' })
    expect(splitDue('회의실 3', T)).toEqual({ text: '회의실 3' })
    expect(splitDue('내일', T)).toEqual({ text: '내일' })           // 날짜 말만 쓴 줄은 제목
  })
  it('되읽기 · 칩', () => {
    expect(dueText('2026-10-20', T)).toBe('10월 20일(화)')
    expect(dueText('2027-01-05', T)).toBe('2027년 1월 5일(화)')
    expect(dueChipOf('2026-10-16', T)).toEqual({ text: '오늘', tone: 'today' })
    expect(dueChipOf('2026-10-14', T)).toEqual({ text: '2일 지남', tone: 'past' })
    expect(dueChipOf('2026-10-17', T)).toEqual({ text: '내일', tone: 'soon' })
    expect(dueChipOf('2026-10-19', T)).toEqual({ text: 'D-3', tone: 'soon' })
    expect(dueChipOf('2026-10-26', T)).toEqual({ text: 'D-10', tone: 'normal' })
    expect(dueChipOf('2026-12-01', T)).toEqual({ text: '12/1', tone: 'normal' })
  })
  it('빠른 단추 — 금요일이면 «이번 주 금» 은 오늘이라 뺀다', () => {
    expect(quickDues(T).map((q) => q.label)).toEqual(['오늘', '내일', '다음 주 월'])
    expect(quickDues(new Date(2026, 9, 13)).map((q) => q.label)).toEqual(['오늘', '내일', '이번 주 금', '다음 주 월'])
  })
})

describe('CK-1·2·3 · 줄 끝 표식', () => {
  it('📅 · 짝 · 봇/제안 표식을 차례와 상관없이 읽고, 늘 같은 차례로 쓴다', () => {
    expect(splitMeta('강의안: PDF 📅 2026-10-20 <!-- ak:abc --> <!-- bot -->')).toEqual({ text: '강의안: PDF', meta: { by: 'bot', due: '2026-10-20', ak: 'abc' } })
    expect(splitMeta('강의안 📅 2026-10-20 <!-- bot --> <!-- ak:abc -->').meta).toEqual({ by: 'bot', due: '2026-10-20', ak: 'abc' })
    expect(splitMeta('x <!-- bot:proposed -->').meta).toEqual({ by: 'bot', proposed: true })
    expect(splitMeta('x <!-- 메모 -->')).toEqual({ text: 'x <!-- 메모 -->', meta: { by: 'me' } })   // 모르는 주석은 본문
  })
  it('parseTodo 가 마감·짝·제안을 낸다 · 제목에 표식이 안 섞인다', () => {
    const md = '# todo\n- [ ] 강의안 넘기기: PDF 📅 2026-10-20 <!-- bot -->\n- [ ] 제안 하나 <!-- bot:proposed -->\n- [ ] 짝 있음 <!-- ak:u1 -->\n'
    const it = parseTodo(md)
    expect(it[0]).toMatchObject({ title: '강의안 넘기기', desc: 'PDF', due: '2026-10-20', by: 'bot' })
    expect(it[1]).toMatchObject({ title: '제안 하나', by: 'bot', proposed: true })
    expect(it[2]).toMatchObject({ title: '짝 있음', by: 'me', ak: 'u1' })
  })
  it('마감 바꾸기·지우기는 그 줄 끝만 · 편집은 마감·짝을 지킨다', () => {
    const md = '- [ ] 강의안: PDF <!-- ak:u1 --> <!-- bot -->'
    const a = setDueLine(md, 0, '2026-10-20')
    expect(a).toBe('- [ ] 강의안: PDF 📅 2026-10-20 <!-- ak:u1 --> <!-- bot -->')
    expect(setDueLine(a, 0, null)).toBe(md)
    expect(editLine(a, 0, '강의안 v2', 'PDF')).toBe('- [ ] 강의안 v2: PDF 📅 2026-10-20 <!-- ak:u1 --> <!-- bot -->')
    expect(editLine(a, 0, '강의안', 'PDF', null)).toBe(md)
    expect(toggleLine(a, 0, true)).toBe('- [x] 강의안: PDF 📅 2026-10-20 <!-- ak:u1 --> <!-- bot -->')
    expect(setDueLine(md, 0, '내일')).toBe(md)      // 날짜 꼴이 아니면 안 바꾼다
  })
  it('제안 → 정식 · 새 줄에 마감', () => {
    expect(setMetaLine('- [ ] 제안 <!-- bot:proposed -->', 0, { proposed: false })).toBe('- [ ] 제안 <!-- bot -->')
    expect(addLine('# todo\n', '새 일', '', 'me', '', { due: '2026-10-20' })).toContain('- [ ] 새 일 📅 2026-10-20')
    expect(addLine('# todo\n', '봇 제안', '', 'bot', '', { proposed: true })).toContain('- [ ] 봇 제안 <!-- bot:proposed -->')
  })
})

import { byDue } from '../../src/core/botName'
describe('CK-1 · 레일 «마감일» 정렬', () => {
  it('줄 마감이 폴더 마감보다 이르면 그것으로 선다', () => {
    const a = { name: 'a', due: { date: '2026-10-01', precision: 'month' as const } }          // 10/31
    const b = { name: 'b', due: { date: '2026-10-25', precision: 'day' as const } }
    const c = { name: 'c', todoDue: '2026-10-17' }                                              // 폴더 날짜 없음 · 줄이 내일
    expect([a, b, c].sort(byDue).map((x) => x.name)).toEqual(['c', 'b', 'a'])
    expect([b, { ...a, todoDue: '2026-10-20' }].sort(byDue).map((x) => x.name)).toEqual(['a', 'b'])
  })
})
