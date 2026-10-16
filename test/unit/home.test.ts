import { describe, it, expect } from 'vitest'
import { boardRows, findFolders, folderDue, folderGroup, pillEnter, weekTodo, type BoardItem } from '../../src/core/home'

/** CJ · 홈 네 칸 · 할 일 보드 · 폰 알약 폴더 찾기 (2026-10-16 Dave «전부 추천대로») */
const T = new Date(2026, 9, 16, 10)
const bot = (id: string, o: { name?: string; date?: string; precision?: 'day' | 'month' | 'year' | 'none'; todoDue?: string; rel?: string; section?: string; orchestrator?: boolean } = {}) => ({
  id, name: o.name ?? id, displayName: o.name ?? id, rel: o.rel ?? `1. Projects/${o.name ?? id}`, section: o.section ?? 'Projects',
  due: o.date ? { date: o.date, precision: o.precision ?? 'day' } : null, ...(o.todoDue ? { todoDue: o.todoDue } : {}), ...(o.orchestrator ? { orchestrator: true } : {}),
})

describe('할 일 칸 큰 숫자 — 마감 7일 안 폴더의 열린 할 일 (결정 ① ⓒ)', () => {
  const bots = [
    bot('yumi', { name: '유미MCP', date: '2026-10-17' }),          // D-1
    bot('int', { name: '인테리어', date: '2026-10-23' }),           // D-7 — 끝날 포함
    bot('far', { name: '먼 일', date: '2026-10-24' }),              // D-8 — 빠진다
    bot('month', { name: '10월 일', date: '2026-10-01', precision: 'month' }),   // 10/31 끝 — 빠진다
    bot('line', { name: '줄 마감', date: '2026-12', precision: 'month', todoDue: '2026-10-20' }),   // 줄 📅 이 이르다 — 든다
    bot('past', { name: '지난 일', date: '2026-10-10' }),            // 지난 마감 — 아직 안 닫힌 일이라 든다
    bot('area', { name: '영역', section: 'Area' }),                  // 날짜 없음 — 빠진다
    bot('empty', { name: '빈 폴더', date: '2026-10-18' }),           // 열린 것 0 — 빠진다
  ]
  const rows = [{ botId: 'yumi', open: 26 }, { botId: 'int', open: 7 }, { botId: 'far', open: 4 }, { botId: 'month', open: 9 }, { botId: 'line', open: 3 }, { botId: 'past', open: 2 }, { botId: 'area', open: 200 }, { botId: 'empty', open: 0 }]
  it('7일 안(지난 마감 포함) 폴더의 열린 수를 더하고, 볼트 전체(281 같은 수)를 세지 않는다', () => {
    const w = weekTodo(bots, rows, T)
    expect(w.n).toBe(26 + 7 + 3 + 2)
    expect(w.folders).toBe(4)
  })
  it('작은 줄의 폴더는 마감이 가장 이른 곳 — 지난 마감이 맨 앞(레일 «마감일» 정렬과 같다)', () => {
    expect(weekTodo(bots, rows, T).nearest?.id).toBe('past')
    expect(weekTodo(bots.filter((b) => b.id !== 'past'), rows, T).nearest?.id).toBe('yumi')
  })
  it('없으면 0 · null', () => { expect(weekTodo([bot('area', { section: 'Area' })], [{ botId: 'area', open: 5 }], T)).toEqual({ n: 0, folders: 0, nearest: null }) })
  it('folderDue — 줄 마감이 폴더 마감보다 이르면 그것', () => {
    expect(folderDue({ due: { date: '2026-10-01', precision: 'month' }, todoDue: '2026-10-05' })).toBe('2026-10-05')
    expect(folderDue({ due: { date: '2026-10-03', precision: 'day' }, todoDue: '2026-10-05' })).toBe('2026-10-03')
    expect(folderDue({ due: null })).toBeNull()
  })
})

describe('전체 할 일 보드 — 폴더로 묶고 마감 가까운 폴더부터', () => {
  const it_ = (line: number, title: string, by: 'me' | 'bot' = 'me', due?: string, desc = ''): BoardItem => ({ line, title, desc, by, ...(due ? { due } : {}) })
  const bots = [bot('a', { name: '가', date: '2026-10-30' }), bot('b', { name: '나', date: '2026-10-17' }), bot('c', { name: '다', section: 'Area' })]
  const rows = [
    { botId: 'a', items: [it_(3, '사진 받기'), it_(5, '명단 확정', 'bot', '2026-10-20'), it_(9, '정산', 'me', '2026-10-18')] },
    { botId: 'b', items: [it_(2, '심사위원 명단 확정'), it_(4, '진행표 인쇄', 'bot')] },
    { botId: 'c', items: [it_(1, '디캠프 멘토링 정리', 'me', undefined, '자료 묶기')] },
    { botId: 'gone', items: [it_(1, '사라진 봇')] },
  ]
  it('폴더 차례 = byDue (날짜 없는 폴더는 뒤) · 사라진 봇은 뺀다', () => {
    expect(boardRows(bots, rows).map((r) => r.bot.id)).toEqual(['b', 'a', 'c'])
  })
  it('폴더 안: 📅 박힌 줄이 이른 날부터 앞 · 나머지는 파일 차례', () => {
    expect(boardRows(bots, rows).find((r) => r.bot.id === 'a')!.items.map((t) => t.line)).toEqual([9, 5, 3])
  })
  it('거름 — 내가 쓴 것 · 봇이 남긴 것 · 줄이 안 남은 폴더는 빠진다', () => {
    expect(boardRows(bots, rows, 'bot').map((r) => [r.bot.id, r.total])).toEqual([['b', 1], ['a', 1]])
    expect(boardRows(bots, rows, 'me').find((r) => r.bot.id === 'b')!.items.map((t) => t.title)).toEqual(['심사위원 명단 확정'])
  })
  it('검색 — 제목·설명 · 조합 중 한글(«디ㅋ»)도 걸린다', () => {
    expect(boardRows(bots, rows, 'all', '명단').flatMap((r) => r.items.map((t) => t.title))).toEqual(['심사위원 명단 확정', '명단 확정'])
    expect(boardRows(bots, rows, 'all', '디ㅋ').map((r) => r.bot.id)).toEqual(['c'])
    expect(boardRows(bots, rows, 'all', '자료').map((r) => r.bot.id)).toEqual(['c'])
  })
})

describe('폰 알약 — 폴더 찾기 (결정 ③ A안)', () => {
  const bots = [
    bot('orch', { name: '오케스트레이터', orchestrator: true, rel: '' }),
    bot('dc', { name: '디캠프', rel: '3. Resources/2026_멘토링-디캠프', section: 'Resources' }),
    bot('yumi', { name: '유미MCP 바이브해커톤', rel: '1. Projects/2026-10-17_유미MCP' }),
    bot('cfo', { name: '재무_CFO', rel: '2. Area/재무_CFO', section: 'Area' }),
  ]
  it('조합 중인 «디ㅋ» → 디캠프 한 줄', () => { expect(findFolders(bots, '디ㅋ').map((b) => b.id)).toEqual(['dc']) })
  it('경로·칸으로도 걸린다 · 오케스트레이터는 목록에 없다', () => {
    expect(findFolders(bots, '멘토링').map((b) => b.id)).toEqual(['dc'])
    expect(findFolders(bots, 'Area').map((b) => b.id)).toContain('cfo')
    expect(findFolders(bots, '오케스트').map((b) => b.id)).toEqual([])
  })
  it('빈 질의는 아무것도 안 건다', () => { expect(findFolders(bots, '  ')).toEqual([]) })
  it('엔터 — 맞는 폴더가 있으면 맨 위로, 없으면 오케스트레이터에게 친 말을', () => {
    expect(pillEnter(findFolders(bots, '디캠'), '디캠')).toEqual({ go: 'dc' })
    expect(pillEnter(findFolders(bots, '다음 주 강의 일정 정리해 줘'), ' 다음 주 강의 일정 정리해 줘 ')).toEqual({ ask: '다음 주 강의 일정 정리해 줘' })
    expect(pillEnter([], '  ')).toBeNull()
  })
})

describe('폴더 현황 시트 묶음', () => {
  const now = T.getTime(), day = 86_400_000
  it('확인 대기 · 일하는 중이 먼저 · 14일 넘게 안 쓴 것은 오래 쉼', () => {
    expect(folderGroup('awaiting_input', now - 30 * day, now)).toBe('wait')
    expect(folderGroup('running', now - 30 * day, now)).toBe('run')
    expect(folderGroup('idle', now - 13 * day, now)).toBe('rest')
    expect(folderGroup(null, now - 14 * day, now)).toBe('idle')
  })
})
