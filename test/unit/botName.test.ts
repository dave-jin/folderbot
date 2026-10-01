import { describe, it, expect } from 'vitest'
import { parseFolderName, dueChip, dueEnd, byDue, DEFAULT_TYPES } from '../../src/core/botName'

/**
 * 레일 이름 파생 (F · 2026-09-19 Dave 1안 확정) — 폴더명 `YYYY[-MM[-DD]]_[타입-]이름` 을 파싱만 한다.
 * 규칙 밖 이름은 그대로 title 이고, 파서가 실패해 빈 이름이 되는 일은 없다.
 */
const P = (n: string) => parseFolderName(n, DEFAULT_TYPES)
const today = new Date(2026, 8, 19) // 2026-09-19

describe('parseFolderName — 요청서의 예시 6개', () => {
  it('2026-10-05_강의-이브레인 → 이브레인 · 강의 · 10/5 D-16', () => {
    expect(P('2026-10-05_강의-이브레인')).toEqual({ date: '2026-10-05', precision: 'day', type: '강의', title: '이브레인' })
    expect(dueChip('2026-10-05', 'day', today)).toEqual({ text: '10/5 D-16', tone: 'normal' })
  })
  it('2026-09-30_책쓰기-천재ADHD → 천재ADHD · 책쓰기 · 9/30 D-11', () => {
    expect(P('2026-09-30_책쓰기-천재ADHD')).toEqual({ date: '2026-09-30', precision: 'day', type: '책쓰기', title: '천재ADHD' })
    expect(dueChip('2026-09-30', 'day', today)!.text).toBe('9/30 D-11')
  })
  it('2026-09-18_AI-Hub-Seoul → AI Hub Seoul · (타입 없음) · 9/18 지남', () => {
    expect(P('2026-09-18_AI-Hub-Seoul')).toEqual({ date: '2026-09-18', precision: 'day', type: '', title: 'AI Hub Seoul' })
    expect(dueChip('2026-09-18', 'day', today)).toEqual({ text: '9/18 지남', tone: 'past' })
  })
  it('2026-09_멋사-클로드강의 → 멋사 클로드강의 · 9월 (「멋사」는 타입이 아니다)', () => {
    expect(P('2026-09_멋사-클로드강의')).toEqual({ date: '2026-09', precision: 'month', type: '', title: '멋사 클로드강의' })
    expect(dueChip('2026-09', 'month', today)).toEqual({ text: '9월', tone: 'normal' })
  })
  it('2026_멘토링-디캠프 → 디캠프 · 멘토링 · 2026', () => {
    expect(P('2026_멘토링-디캠프')).toEqual({ date: '2026', precision: 'year', type: '멘토링', title: '디캠프' })
    expect(dueChip('2026', 'year', today)).toEqual({ text: '2026', tone: 'normal' })
  })
  it('사업_이네이트 (규칙 밖) → 그대로', () => {
    expect(P('사업_이네이트')).toEqual({ date: '', precision: 'none', type: '', title: '사업_이네이트' })
    expect(dueChip('', 'none', today)).toBeNull()
  })
})

describe('parseFolderName — 가장자리', () => {
  it('빈 이름·날짜만·구분자만 — 빈 title 은 절대 없다', () => {
    expect(P('').title).toBe('')
    expect(P('2026-09-30_').title).toBe('2026-09-30_')
    expect(P('2026-09-30').title).toBe('2026-09-30')
    expect(P('_강의').title).toBe('_강의')
  })
  it('타입만 있고 이름이 없으면 타입이 곧 이름', () => {
    expect(P('2026-10_강의')).toEqual({ date: '2026-10', precision: 'month', type: '', title: '강의' })
  })
  it('지난 월·D-3 이내 강조', () => {
    expect(dueChip('2026-08', 'month', today)!.tone).toBe('past')
    expect(dueChip('2026-09-21', 'day', today)).toEqual({ text: '9/21 D-2', tone: 'soon' })
    expect(dueChip('2026-09-19', 'day', today)).toEqual({ text: '9/19 D-day', tone: 'soon' })
    expect(dueChip('2026-09-22', 'day', today)!.tone).toBe('soon')
    expect(dueChip('2026-09-23', 'day', today)!.tone).toBe('normal')
    expect(dueChip('2025', 'year', today)!.tone).toBe('past')
  })
  it('잘못된 날짜(13월·32일)는 규칙 밖으로 본다', () => {
    expect(P('2026-13-01_강의-x').precision).toBe('none')
    expect(P('2026-09-32_강의-x').precision).toBe('none')
  })
  it('타입 목록은 바꿀 수 있다', () => {
    expect(parseFolderName('2026-09_사업-이네이트', ['사업']).type).toBe('사업')
  })
})

describe('byDue — 레일 «마감일» 정렬 (2026-10-01)', () => {
  const b = (name: string) => { const p = parseFolderName(name); return { name, due: p.precision === 'none' ? undefined : { date: p.date, precision: p.precision } } }
  it('마감이 가까운 것부터 · 지난 마감이 맨 위 · 월·연은 그 기간 끝날 · 날짜 없으면 뒤에 이름순', () => {
    const names = ['제품_FolderBot', '2026_멘토링-디캠프', '2026-10_해커톤-제안', '2026-10-05_행사-발표', '2026-07_자격증-CCAF', '기반_워크스테이션', '2026-10-31_마감']
    expect(names.map(b).sort(byDue).map((x) => x.name)).toEqual(['2026-07_자격증-CCAF', '2026-10-05_행사-발표', '2026-10-31_마감', '2026-10_해커톤-제안', '2026_멘토링-디캠프', '기반_워크스테이션', '제품_FolderBot'])
  })
  it('dueEnd — 정밀도별 끝날 · 2월 윤년', () => {
    expect(dueEnd({ date: '2028-02', precision: 'month' })).toBe('2028-02-29')
    expect(dueEnd({ date: '2026', precision: 'year' })).toBe('2026-12-31')
    expect(dueEnd(undefined)).toBe(null)
  })
})
