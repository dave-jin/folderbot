import { describe, it, expect } from 'vitest'
import { OVERVIEW_REL, askRefOf, buildOverviewPage, chunkLines, isOverviewRel, plainLine, purposeOf, sectionItems, waitsOf, withAskRef, type PageIn } from '../../src/core/overviewPage'

/**
 * 🔴 **폴더 개요 한 장** (2026-11-15 Dave 카드 «파일에서 그대로») — 지어내지 않는다.
 * 한 장의 줄은 모두 폴더에 적힌 줄이다. 파일에 없으면 비우고, 봇이 숫자나 요약을 붙이지 않는다.
 */
const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime()
const DAY = 86_400_000
const STATE = `# Project State

> 마지막 갱신: 2026-11-11 09:10
> 상태: 진행 중
> 현재 목표: 슬라이드 4부를 채워 11/19 리허설에 올린다

## 완료
- [x] **기획 확정** (근거: 01_기획/기획.md)
- [x] 커리큘럼 확정
- [x] 대관 계약

## 진행 중
- [ ] 슬라이드 4부 채우기 — 실습 자료 안 대기
  - 하위 줄은 세지 않는다

## 확정된 결정
- 결정: 반나절로 한다

## 다음 작업
1. 리허설(11/19)
2. 강의(11/22)
`
const CLAUDE = `# 강의 — 작업 지침

## 🎯 이 프로젝트의 목적

**PARA 와 AI 를 묶은 반나절 강의를 11/22 에 열고, 수강생이 자기 볼트를 만들어 돌아가게 한다.**
둘째 줄은 같은 문단이다.

- 성공 기준은 따로 있다

## 나의 역할
`
const TODO = `## 요청 · 할 일
- [ ] 실습 자료 안 고르기: 세 안 가운데 하나 — 약 5분
- [ ] 대관처에 인원 확정 알리기 📅 2026-11-15
- 수강료 입금 확인 — 상대 답 기다리는 중
- [ ] 봇이 제안한 줄 <!-- bot:proposed -->

## 완료
- [x] 끝난 일
- 끝난 메모
`
const base = (over: Partial<PageIn> = {}): PageIn => ({
  claudeMd: CLAUDE, stateMd: STATE, stateAt: NOW - 4 * DAY, todoMd: TODO, todoAt: NOW - DAY,
  todos: [{ line: 1, done: false, title: '실습 자료 안 고르기' }, { line: 2, done: false, title: '대관처에 인원 확정 알리기', due: '2026-11-15' }, { line: 4, done: false, title: '봇이 제안한 줄', proposed: true }, { line: 7, done: true, title: '끝난 일' }],
  asks: [{ id: 's1', name: '대관 확인' }],
  chips: [{ t: NOW - DAY, paths: ['/v/강의/02_작업/슬라이드_v5.pdf', '/v/강의/state.md'] }, { t: NOW - 10 * DAY, paths: ['/v/강의/옛것.md'] }],
  root: '/v/강의', links: [{ id: '1. Projects/CCAF', label: '자격증-CCAF', why: '문서 언급 — 3번', botId: 'b1' }], past: [{ label: 'Note App 선정', why: '같은 줄기의 지난 일', file: '폴더-아이콘-표.csv' }], now: NOW, ...over
})

describe('줄 읽기', () => {
  it('굵게 · 체크 · 번호 · 링크 · 주석을 걷는다', () => {
    expect(plainLine('- [x] **기획 확정** (근거: `a.md`)')).toBe('기획 확정 (근거: a.md)')
    expect(plainLine('2. [문서](http://x) 보기 <!-- bot -->')).toBe('문서 보기')
  })
  it('절의 목록 줄만 읽고, 들여 쓴 하위 줄은 세지 않고, 절이 없으면 null', () => {
    expect(sectionItems(STATE, /완료/)).toEqual(['기획 확정 (근거: 01_기획/기획.md)', '커리큘럼 확정', '대관 계약'])
    expect(sectionItems(STATE, /진행 중/)).toEqual(['슬라이드 4부 채우기 — 실습 자료 안 대기'])
    expect(sectionItems(STATE, /다음 작업/)).toEqual(['리허설(11/19)', '강의(11/22)'])
    expect(sectionItems(STATE, /없는 절/)).toBeNull()
    expect(sectionItems('## 완료\n\n## 진행 중\n- [ ] a', /완료/)).toEqual([])
  })
  it('목적은 «목적» 절의 첫 문단이다 — 다음 목록이나 제목에서 멈춘다', () => {
    expect(purposeOf(CLAUDE)).toBe('PARA 와 AI 를 묶은 반나절 강의를 11/22 에 열고, 수강생이 자기 볼트를 만들어 돌아가게 한다. 둘째 줄은 같은 문단이다.')
    expect(purposeOf('# 지침\n\n본문만 있다')).toBeUndefined()
    expect(purposeOf('## 목적\n- 목록으로 적은 목적\n- 둘째')).toBe('목록으로 적은 목적')
  })
  it('기다리는 일은 체크박스가 아닌 불릿 가운데 «기다린다» 고 적힌 것만이다 — 완료 절 아래 것은 뺀다', () => {
    expect(waitsOf(TODO).map((w) => w.text)).toEqual(['수강료 입금 확인 — 상대 답 기다리는 중'])
  })
  it('🔴 메모 불릿을 «기다리는 일» 이라고 부르지 않는다 — «확인 필요» 머리 아래이거나 줄에 그렇게 적혀야 한다', () => {
    const md = '## 요청\n- 그냥 적어 둔 메모\n- 🔴 Dave 원문: 이렇게 해 줘\n- [ ] 할 일\n\n## 확인 필요\n- 대관처 회신\n- [ ] 체크박스는 할 일이다\n\n**확인 대기**\n- 견적서\n\n## 다른 절\n- 여기는 메모\n- 세무사 답 대기\n'
    expect(waitsOf(md, 9).map((w) => w.text)).toEqual(['대관처 회신', '견적서', '세무사 답 대기'])
    expect(waitsOf(md, 9).map((w) => w.tag)).toEqual(['확인 필요', '확인 필요', '기다리는 일'])   // 파일의 머리가 부른 이름을 따른다
    expect(waitsOf('- 메모 하나\n- 메모 둘')).toEqual([])
  })
})

describe('한 장 — 파일에 적힌 것만', () => {
  const p = buildOverviewPage(base())
  it('어디까지 왔나 — 완료는 둘까지 · 진행 중 · 다음 작업 · 전체 수', () => {
    expect(p.progress.done.map((r) => r.text)).toEqual(['기획 확정 (근거: 01_기획/기획.md)', '커리큘럼 확정'])
    expect(p.progress.doneTotal).toBe(3)
    expect(p.progress.doing.map((r) => r.text)).toEqual(['슬라이드 4부 채우기 — 실습 자료 안 대기'])
    expect(p.progress.next.map((r) => r.text)).toEqual(['리허설(11/19)', '강의(11/22)'])
    expect(p.progress.has).toEqual({ done: true, doing: true, next: true })
  })
  it('목적과 현재 목표는 그 줄 그대로', () => {
    expect(p.purpose).toMatch(/^PARA 와 AI 를 묶은/)
    expect(p.goal).toBe('슬라이드 4부를 채워 11/19 리허설에 올린다')
  })
  it('내가 나설 곳 — 답 대기 세션 · 열린 할 일은 마감 먼저 · 제안은 수로만 · 기다리는 일', () => {
    expect(p.mine.asks).toEqual([{ id: 's1', name: '대관 확인' }])
    expect(p.mine.todos.map((t) => t.title)).toEqual(['대관처에 인원 확정 알리기', '실습 자료 안 고르기'])
    expect(p.mine.openTotal).toBe(2)
    expect(p.mine.proposed).toBe(1)
    expect(p.mine.waits.map((w) => w.text)).toEqual(['수강료 입금 확인 — 상대 답 기다리는 중'])
  })
  it('최근 만든 것 — 지난 7일 · 상태 파일은 빼고 · 폴더 기준 경로', () => {
    expect(p.recent).toEqual([{ rel: '02_작업/슬라이드_v5.pdf', at: NOW - DAY }])
  })
  it('이어진 곳과 지난 일은 받은 그대로', () => {
    expect(p.links).toEqual([{ id: '1. Projects/CCAF', label: '자격증-CCAF', why: '문서 언급 — 3번', botId: 'b1' }])
    expect(p.past[0]).toEqual({ label: 'Note App 선정', why: '같은 줄기의 지난 일', file: '폴더-아이콘-표.csv' })
  })
  it('state.md 가 사흘 넘게 안 바뀌었으면 알린다 — 그 안쪽이면 말하지 않는다', () => {
    expect(p.staleDays).toBe(4)
    expect(buildOverviewPage(base({ stateAt: NOW - 2 * DAY })).staleDays).toBeUndefined()
  })
  it('🔴 파일이 없으면 비운다 — 지어내지 않는다', () => {
    const e = buildOverviewPage(base({ claudeMd: null, stateMd: null, stateAt: undefined, todoMd: null, todoAt: undefined, todos: [], asks: [], chips: [], links: [], past: [] }))
    expect(e.purpose).toBeUndefined(); expect(e.goal).toBeUndefined()
    expect(e.progress).toEqual({ done: [], doneTotal: 0, doing: [], doingTotal: 0, next: [], nextTotal: 0, has: { done: false, doing: false, next: false } })
    expect(e.mine).toEqual({ asks: [], todos: [], openTotal: 0, proposed: 0, waits: [] })
    expect(e.sources).toEqual([{ name: 'state.md', at: null }, { name: 'todo.md', at: null }])
    expect(e.staleDays).toBeUndefined()
  })
  it('state.md 에 절이 없으면 «없다» 로 남는다(빈 절과 다르다)', () => {
    const q = buildOverviewPage(base({ stateMd: '> 현재 목표: 하나\n\n## 완료\n' }))
    expect(q.progress.has).toEqual({ done: true, doing: false, next: false })
  })
  it('긴 줄은 줄이고 원문을 따로 든다', () => {
    const long = '가'.repeat(200)
    const q = buildOverviewPage(base({ stateMd: `## 진행 중\n- [ ] ${long}` }))
    expect(q.progress.doing[0].text.length).toBeLessThanOrEqual(90)
    expect(q.progress.doing[0].text.endsWith('…')).toBe(true)
    expect(q.progress.doing[0].full).toBe(long)
  })
  it('지문(ver)은 내용이 같으면 같고, 한 줄이 바뀌면 달라진다 — «그 뒤 바뀐 것» 을 이것으로 안다', () => {
    expect(buildOverviewPage(base()).ver).toBe(p.ver)
    expect(buildOverviewPage(base({ stateMd: STATE.replace('커리큘럼 확정', '커리큘럼 다시 확정') })).ver).not.toBe(p.ver)
    expect(buildOverviewPage(base({ asks: [] })).ver).not.toBe(p.ver)
  })
})

describe('[이 부분 묻기] — 화면에 보인 줄이 그대로 봇에게 간다', () => {
  const p = buildOverviewPage(base())
  it('덩이의 줄', () => {
    expect(chunkLines(p, 'progress')).toEqual(['✓ 기획 확정 (근거: 01_기획/기획.md)', '✓ 커리큘럼 확정', '● 진행 중 — 슬라이드 4부 채우기 — 실습 자료 안 대기', '○ 다음 — 리허설(11/19)', '○ 다음 — 강의(11/22)'])
    expect(chunkLines(p, 'mine')).toEqual(['내 답 기다림 — «대관 확인» 세션', '할 일 — 대관처에 인원 확정 알리기 (마감 2026-11-15)', '할 일 — 실습 자료 안 고르기', '기다리는 일 — 수강료 입금 확인 — 상대 답 기다리는 중', '봇의 제안 1'])
    expect(chunkLines(p, 'recent')).toEqual(['02_작업/슬라이드_v5.pdf'])
    expect(chunkLines(p, 'links')).toEqual(['자격증-CCAF — 문서 언급 — 3번', '지난 일 — Note App 선정 · 폴더-아이콘-표.csv'])
  })
  it('내 말 아래에 인용으로 붙는다 · 말이 없으면 기본 물음 · 덩이가 없으면 그대로', () => {
    const ref = askRefOf(p, 'recent')
    expect(withAskRef('이거 뭐야?', ref)).toBe('이거 뭐야?\n\n> **폴더 개요 · 최근 만든 것** (지난 7일 · 이 폴더의 봇이 쓴 파일)\n> - 02_작업/슬라이드_v5.pdf')
    expect(withAskRef('  ', ref).startsWith('이 부분을 설명해 줘.\n\n> **폴더 개요')).toBe(true)
    expect(withAskRef('그냥 말', null)).toBe('그냥 말')
    expect(withAskRef('x', { title: '이어진 곳', src: '연결 지도', lines: [] })).toContain('> (이 덩이는 비어 있어요)')
  })
  it('가짜 경로는 파일 경로와 겹치지 않는다', () => {
    expect(isOverviewRel(OVERVIEW_REL)).toBe(true)
    expect(isOverviewRel('overview.md')).toBe(false); expect(isOverviewRel(null)).toBe(false)
    expect(OVERVIEW_REL.includes('/')).toBe(false)
  })
})
