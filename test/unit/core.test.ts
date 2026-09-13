import { describe, it, expect } from 'vitest'
import { parseRules, rulesSection, PARA_PRESET, globMatch, globParents, roleOf, applyNaming } from '../../src/core/rules'
import { parseTodo, addLine, toggleLine, formatLine, editLine, deleteLine } from '../../src/core/todo'
import { transition, shouldNotify } from '../../src/core/stateMachine'
import { authVerdict } from '../../src/core/authVerdict'
import { machSummary } from '../../src/core/chat'
import { AGENT_EFFORTS, AGENT_MODELS, fitsProvider } from '../../src/core/agents'
import { cronFromText, routineName } from '../../src/core/routineText'
import { bestIcon, faviconHost, parentHost, parseIconLinks } from '../../src/core/favicon'
import { toolSummary, touchedPath } from '../../src/core/chat'
import { chosung, hitRange, isChosungQuery, rank, scoreName } from '../../src/core/search'
import { decide, dropIndex } from '../../src/client/gesture'
import { WINDOW_MS, parseEvent, priceKey, report, type UsageEvent } from '../../src/core/usage'

describe('folder rules', () => {
  it('설치한 절을 다시 파싱하면 같은 규칙', () => {
    const md = `# 루트\n\n${rulesSection(PARA_PRESET)}`
    const r = parseRules(md)!
    expect(r.preset).toBe('para')
    expect(r.roles.active).toEqual(['2. Projects/*', '3. Area/*'])
    expect(r.naming.project).toBe('{YYYY}-{MM}_{이름}')
  })
  it('블록이 없으면 null', () => { expect(parseRules('# 아무것도')).toBeNull() })
  it('글롭·역할·부모', () => {
    expect(globMatch('2. Projects/*', '2. Projects/x')).toBe(true)
    expect(globMatch('2. Projects/*', '2. Projects/x/y')).toBe(false)
    expect(globParents(['2. Projects/*', '3. Area/*'])).toEqual(['2. Projects', '3. Area'])
    expect(roleOf(PARA_PRESET, '1. Inbox/foo')).toBe('inbox')
    expect(roleOf(PARA_PRESET, '3. Area/제품_Rondo')).toBe('active')
    expect(roleOf(PARA_PRESET, '5. Archive/old')).toBe('archive')
  })
  it('naming', () => { expect(applyNaming('{YYYY}-{MM}_{이름}', '하이드', new Date(2026, 8, 12))).toBe('2026-09_하이드') })
})

describe('todo.md', () => {
  const md = `# todo\n\n- [ ] PRD v1.0 확정: Q2·Q5 답하기\n- [x] 미니 자동 로그인\n- [ ] 이력 한 줄 남기기: 다음 세션에서 <!-- bot -->\n\n## 완료\n`
  it('파싱 — 제목:설명, 봇 표식', () => {
    const t = parseTodo(md)
    expect(t).toHaveLength(3)
    expect(t[0]).toMatchObject({ title: 'PRD v1.0 확정', desc: 'Q2·Q5 답하기', by: 'me', done: false })
    expect(t[1]).toMatchObject({ title: '미니 자동 로그인', desc: '', done: true })
    expect(t[2]).toMatchObject({ title: '이력 한 줄 남기기', desc: '다음 세션에서', by: 'bot' })
  })
  it('토글은 그 줄만 바꾼다', () => {
    const out = toggleLine(md, 2, true)
    expect(out.split('\n')[2]).toBe('- [x] PRD v1.0 확정: Q2·Q5 답하기')
    expect(out.replace(/\[x\] PRD/, '[ ] PRD')).toBe(md)
  })
  it('추가는 ## 완료 앞', () => {
    const out = addLine(md, '알파 동결 문서', 'PRD v1.0 뒤에', 'me')
    const lines = out.split('\n')
    expect(lines[lines.indexOf('## 완료') - 2]).toBe('- [ ] 알파 동결 문서: PRD v1.0 뒤에')
  })
  it('빈 파일에 추가', () => { expect(addLine('', 'x', '', 'bot')).toContain('- [ ] x <!-- bot -->') })
  it('formatLine', () => { expect(formatLine('a', 'b', 'bot')).toBe('- [ ] a: b <!-- bot -->') })
})

describe('state machine', () => {
  it('흐름', () => {
    let s = transition('idle', { kind: 'user_sent' }); expect(s).toBe('running')
    s = transition(s, { kind: 'permission_requested' }); expect(s).toBe('awaiting_input')
    expect(shouldNotify('running', s)).toBe(true)
    s = transition(s, { kind: 'stream_activity' }); expect(s).toBe('awaiting_input')
    s = transition(s, { kind: 'input_provided' }); expect(s).toBe('running')
    s = transition(s, { kind: 'result_received', isError: false }); expect(s).toBe('done')
    expect(transition('running', { kind: 'process_exited', code: 143 })).toBe('idle')
    expect(transition('running', { kind: 'process_exited', code: 1 })).toBe('error')
  })
})

describe('auth verdict', () => {
  it('토큰이 살아 있는데 false 면 unreadable', () => {
    expect(authVerdict({ asked: true, loggedIn: false, credentialsExpiresAt: Date.now() + 3600_000 })).toBe('unreadable')
    expect(authVerdict({ asked: true, loggedIn: false, credentialsExpiresAt: Date.now() - 1 })).toBe('loggedout')
    expect(authVerdict({ asked: true, loggedIn: true, credentialsExpiresAt: null })).toBe('loggedin')
    expect(authVerdict({ asked: false, loggedIn: false, credentialsExpiresAt: null })).toBe('unknown')
  })
})

describe('chat helpers', () => {
  it('summary/touched', () => {
    expect(toolSummary('Bash', { command: 'npm run qa' })).toBe('npm run qa')
    expect(touchedPath('Edit', { file_path: '/a/b.md' })).toBe('/a/b.md')
    expect(touchedPath('Read', { file_path: '/a/b.md' })).toBeNull()
  })
})

describe('todo edit · delete', () => {
  const md = '# todo\n\n- [ ] 제목: 설명\n- [x] 끝난 일 <!-- bot -->\n\n## 완료\n'
  it('편집은 그 줄만 바꾸고 완료 상태·봇 표식을 지킨다', () => {
    const out = editLine(md, 3, '끝난 일 2', '더 설명')
    expect(out.split('\n')[3]).toBe('- [x] 끝난 일 2: 더 설명 <!-- bot -->')
    expect(out.split('\n')[2]).toBe('- [ ] 제목: 설명')
    expect(editLine(md, 3, '   ', '')).toBe(md)
    expect(editLine(md, 0, 'x', '')).toBe(md)
  })
  it('삭제는 그 줄만 지운다', () => {
    const out = deleteLine(md, 2)
    expect(out).toBe('# todo\n\n- [x] 끝난 일 <!-- bot -->\n\n## 완료\n')
    expect(deleteLine(md, 0)).toBe(md)
  })
})

import { closeOpenItems } from '../../src/core/chat'
describe('closeOpenItems', () => {
  const mk = () => ([
    { id: 'a1', t: 1, kind: 'assistant', text: 'x', streaming: true },
    { id: 't_1', t: 1, kind: 'tool', name: 'Bash', summary: 'ls' },
    { id: 't_2', t: 1, kind: 'tool', name: 'Read', summary: 'a', result: 'ok' },
    { id: 't_3', t: 1, kind: 'subagent', name: '조사', prompt: '', tools: 3, last: '', status: 'run' },
    { id: 't_4', t: 1, kind: 'subagent', name: '끝', prompt: '', tools: 1, last: '', status: 'done' }
  ] as unknown as import('../../src/core/types').ChatItem[])
  it('result — 스트리밍 끝, 결과 없는 도구·run 서브에이전트는 done', () => {
    const items = mk(); const ch = closeOpenItems(items, 'result')
    expect(ch.map((c) => c.id)).toEqual(['a1', 't_1', 't_3'])
    expect((items[3] as { status: string }).status).toBe('done'); expect((items[0] as { streaming?: boolean }).streaming).toBe(false)
  })
  it('restore/exit — 중단으로 표시하고 이유를 남긴다', () => {
    const items = mk(); closeOpenItems(items, 'restore')
    expect((items[1] as { isError?: boolean; result?: string }).isError).toBe(true); expect((items[1] as { result?: string }).result).toMatch(/다시 떠서/)
    expect((items[3] as { status: string; result?: string }).status).toBe('error')
    expect(closeOpenItems(items, 'exit')).toEqual([]) // 두 번 부르면 바뀔 게 없다
  })
  it('result — 백그라운드 서브에이전트는 턴이 끝나도 그대로 둔다', () => {
    const items = [{ id: 't_9', t: 1, kind: 'subagent', name: 'bg', prompt: '', tools: 0, last: '', status: 'run', bg: true }] as unknown as import('../../src/core/types').ChatItem[]
    expect(closeOpenItems(items, 'result')).toEqual([]); expect((items[0] as { status: string }).status).toBe('run')
    closeOpenItems(items, 'restore'); expect((items[0] as { status: string }).status).toBe('error') // 호스트가 죽으면 그 에이전트도 없다
  })
})

import { isDoneSection, moveLine, toggleAndMove } from '../../src/core/todo'
describe('todo 2.0 — 절 · 이동 · 완료', () => {
  const MD = ['# todo', '', '## 요청 · 할 일', '- [ ] 가: 하나', '- [ ] 나', '', '## 진행 중', '- [ ] 다: 셋', '', '## 완료', '- [x] 라'].join('\n')
  it('parseTodo 가 절을 붙인다 — 맨 위 «# todo» 는 절이 아니다', () => {
    const it2 = parseTodo(MD)
    expect(it2.map((t) => [t.title, t.section])).toEqual([['가', '요청 · 할 일'], ['나', '요청 · 할 일'], ['다', '진행 중'], ['라', '완료']])
    expect(it2[0].desc).toBe('하나')
  })
  it('isDoneSection — 한글에 \\b 를 쓰면 안 된다', () => {
    expect(isDoneSection('완료')).toBe(true); expect(isDoneSection('Done')).toBe(true); expect(isDoneSection('진행 중')).toBe(false)
  })
  it('moveLine — 그 줄만 옮기고 절 제목·빈 줄은 그대로', () => {
    const out = moveLine(MD, 4, 3).split('\n')
    expect(out[3]).toBe('- [ ] 나'); expect(out[4]).toBe('- [ ] 가: 하나'); expect(out[2]).toBe('## 요청 · 할 일'); expect(out[9]).toBe('## 완료')
  })
  it('toggleAndMove — 체크하면 완료 절 끝으로, 풀면 제자리', () => {
    const done = toggleAndMove(MD, 7, true)
    const items = parseTodo(done)
    expect(items.find((t) => t.title === '다')?.section).toBe('완료')
    expect(items.find((t) => t.title === '다')?.done).toBe(true)
    const back = toggleAndMove(done, parseTodo(done).find((t) => t.title === '다')!.line, false)
    expect(parseTodo(back).find((t) => t.title === '다')?.section).toBe('완료') // 되돌려도 자리는 그대로
  })
  it('완료 절이 없으면 제자리에서 체크만', () => {
    const md = ['- [ ] 가', '- [ ] 나'].join('\n')
    expect(toggleAndMove(md, 0, true).split('\n')[0]).toBe('- [x] 가')
  })
})

import { SWIPE_DEFAULT, actOf, slotOf } from '../../src/client/swipe'
describe('쓸어서 처리 — 임계와 자리', () => {
  it('25% 미만이면 아무 자리도 아니다(놓으면 제자리)', () => {
    expect(slotOf(30, 300)).toBe(null); expect(slotOf(-30, 300)).toBe(null)
  })
  it('짧게 25~45% · 길게 45%+ · 좌우 구분', () => {
    expect(slotOf(90, 300)).toBe('rightShort'); expect(slotOf(150, 300)).toBe('rightLong')
    expect(slotOf(-90, 300)).toBe('leftShort'); expect(slotOf(-150, 300)).toBe('leftLong')
  })
  it('기본값 — → 짧게 편집 · → 길게 완료 · ← 짧게 메뉴 · ← 길게 삭제', () => {
    expect(actOf(SWIPE_DEFAULT, slotOf(90, 300))).toBe('edit')
    expect(actOf(SWIPE_DEFAULT, slotOf(150, 300))).toBe('done')
    expect(actOf(SWIPE_DEFAULT, slotOf(-90, 300))).toBe('menu')
    expect(actOf(SWIPE_DEFAULT, slotOf(-150, 300))).toBe('delete')
    expect(actOf(SWIPE_DEFAULT, null)).toBe(null)
  })
  it("'없음' 을 고른 자리는 예고도 실행도 하지 않는다", () => {
    expect(actOf({ ...SWIPE_DEFAULT, rightShort: 'none' }, 'rightShort')).toBe(null)
  })
})

/* ── 이름 찾기 (2026-09-13) — 한글이 «아예» 안 찾히던 NFD 사고 ── */
describe('search', () => {
  const NFD = (s: string) => s.normalize('NFD')

  it('맥의 NFD 이름을 NFC 질의로 찾는다 (이 버그가 한글 검색을 통째로 죽였다)', () => {
    expect(NFD('2026-09_트레바리-북클럽').includes('트레바리')).toBe(false) // 원인
    expect(scoreName('트레바리', NFD('2026-09_트레바리-북클럽'))).toBeGreaterThan(0)
  })

  it('가운데 낱말로도 찾는다 — 앞머리만 되던 게 이번 수정의 핵심', () => {
    expect(scoreName('트레바리', '2026-09_트레바리-북클럽')).toBe(60)
    expect(scoreName('2026', '2026-09_트레바리-북클럽')).toBe(80) // 앞머리가 더 높다
    expect(scoreName('2026-09_트레바리-북클럽', '2026-09_트레바리-북클럽')).toBe(100)
  })

  it('대소문자·경로도 본다', () => {
    expect(scoreName('SEOUL', '2026-09-18_AI-Google-Seoul')).toBe(60)
    expect(scoreName('projects', '트레바리', '2. Projects/트레바리')).toBe(40)
  })

  it('초성으로도 찾는다 — ㅌㄹㅂㄹ → 트레바리', () => {
    expect(chosung('트레바리')).toBe('ㅌㄹㅂㄹ')
    expect(scoreName('ㅌㄹㅂㄹ', NFD('2026_트레바리'))).toBe(30)
    expect(isChosungQuery('ㅌㄹㅂㄹ')).toBe(true)
    expect(isChosungQuery('트레')).toBe(false)
  })

  it('안 걸리면 0', () => {
    expect(scoreName('zzzz', '트레바리')).toBe(0)
    expect(scoreName('', '트레바리')).toBe(1) // 빈 질의는 전부 통과
  })

  it('점수순으로 줄을 세운다 — 이름 일치가 경로 일치보다 위', () => {
    const xs = [{ name: '메모', rel: '트레바리/메모' }, { name: '트레바리', rel: '2. Projects/트레바리' }]
    expect(rank('트레바리', xs, (x) => ({ name: x.name, path: x.rel })).map((x) => x.name)).toEqual(['트레바리', '메모'])
  })

  it('걸린 자리를 돌려준다 (굵게 칠하려고)', () => {
    expect(hitRange('트레바리', '2026_트레바리')).toEqual([5, 9])
    expect(hitRange('없음', '2026_트레바리')).toBe(null)
  })
})

/* ── 폰 목록 제스처 — 쓸기·집기·스크롤 가르기 (V19) ── */
describe('gesture', () => {
  it('가로로 먼저 크게 움직이면 쓸기', () => {
    expect(decide(14, 2, false)).toBe('swipe')
    expect(decide(-20, 3, false)).toBe('swipe')
  })
  it('세로가 더 크면 목록 스크롤 — 쓸기도 집기도 아니다', () => {
    expect(decide(4, 18, false)).toBe('scroll')
    expect(decide(-6, -22, false)).toBe('scroll')
  })
  it('조금 움직인 건 아직 아무것도 아니다 (길게 누르기 시계가 돈다)', () => {
    expect(decide(5, 5, false)).toBe('none')
  })
  it('시계가 울렸으면 가로로 흔들어도 집은 채로', () => {
    expect(decide(40, 2, true)).toBe('drag')
    expect(decide(0, 60, true)).toBe('drag')
  })
  it('놓을 자리 — 줄의 세로 중심과 비교', () => {
    const centers = [20, 60, 100]
    expect(dropIndex(centers, 5)).toBe(0)
    expect(dropIndex(centers, 45)).toBe(1)
    expect(dropIndex(centers, 90)).toBe(2)
    expect(dropIndex(centers, 200)).toBe(3)
  })
})

/* ── 사용량 — «남은 양» 으로 본다 (V23) ── */
describe('usage', () => {
  const ev = (o: Partial<UsageEvent> & { t: number }): UsageEvent => ({ tool: 'claude', model: 'claude-opus-5', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...o })
  const NOW = Date.parse('2026-09-13T12:00:00+09:00')

  it('안 쓴 도구는 줄 자체가 없다 (Dave: Codex가 없으면 아예 안 보여야 해)', () => {
    const r = report([ev({ t: NOW - 1000, output: 1000 })], NOW)
    expect(r.tools.map((t) => t.tool)).toEqual(['claude'])
    const r2 = report([ev({ t: NOW - 1000 }), ev({ t: NOW - 900, tool: 'codex', model: 'gpt-5-codex' })], NOW)
    expect(r2.tools.map((t) => t.tool)).toEqual(['claude', 'codex'])
  })

  it('남은 양 = 예산 − 쓴 양 (쓴 양이 아니다)', () => {
    const r = report([ev({ t: NOW - 1000, output: 1_000_000 })], NOW, { window: 100, day: 200, week: 400 })
    expect(r.tools[0].cost).toBeCloseTo(75, 5)   // opus 출력 1M = $75
    expect(r.tools[0].leftCost).toBeCloseTo(25, 5)
    expect(r.tools[0].left).toBe(25)             // 25% «남음»
  })

  it('예산을 넘겨도 음수로 가지 않는다 — 0% 남음', () => {
    const r = report([ev({ t: NOW - 1000, output: 2_000_000 })], NOW, { window: 100, day: 200, week: 400 })
    expect(r.tools[0].left).toBe(0)
    expect(r.tools[0].leftCost).toBe(0)
  })

  it('창 밖(5시간 넘은) 사용은 창 계산에서 빠진다', () => {
    const old = ev({ t: NOW - 6 * 3600_000, output: 1_000_000 })
    const r = report([old], NOW, { window: 100, day: 200, week: 400 })
    expect(r.tools[0].tokens).toBe(0)
    expect(r.tools[0].left).toBe(100)
    expect(r.week.cost).toBeGreaterThan(0)       // 더 넓은 창(이번 주)에는 남아 있다 ("오늘" 은 실행 기기의 시간대를 타므로 쓰지 않는다)
  })

  it('다시 채워지는 시각 = 창 안 첫 사용 + 5시간', () => {
    const first = NOW - 2 * 3600_000
    const r = report([ev({ t: first, output: 10 }), ev({ t: NOW - 60_000, output: 10 })], NOW)
    expect(r.resetAt).toBe(first + WINDOW_MS)
    expect(report([], NOW).resetAt).toBe(null)
  })

  it('가장 빠듯한 도구가 대표 숫자다 — 메뉴 막대는 한 숫자만 쓴다', () => {
    const r = report([ev({ t: NOW - 10, output: 1_000_000 }), ev({ t: NOW - 10, tool: 'codex', model: 'gpt-5-codex', output: 1000 })], NOW, { window: 100, day: 200, week: 400 })
    expect(r.left).toBe(Math.min(...r.tools.map((t) => t.left)))
  })

  it('모델별로 나눠 센다', () => {
    const r = report([ev({ t: NOW - 10, output: 100 }), ev({ t: NOW - 9, model: 'claude-sonnet-5', output: 400 })], NOW)
    expect(r.tools[0].byModel.map((m) => m.model)).toEqual(['claude-sonnet-5', 'claude-opus-5'])
  })

  it('단가는 모델로 고른다 · 모르면 중간값', () => {
    expect(priceKey('claude-opus-5', 'claude')).toBe('claude-opus')
    expect(priceKey('gpt-5-codex', 'codex')).toBe('codex')
    expect(priceKey('무엇인가', 'claude')).toBe('_')
  })

  it('망가진 줄은 조용히 버린다', () => {
    expect(parseEvent('{"t":1,"tool":"claude"}')).not.toBe(null)
    expect(parseEvent('{잘린')).toBe(null)
    expect(parseEvent('{"t":1,"tool":"gemini"}')).toBe(null)
  })
})

describe('machSummary — 접힌 기계 한 줄', () => {
  it('«얼마나 했나» 만 적는다 — 도구 이름은 펼쳤을 때', () => {
    expect(machSummary(7, 3, 12400)).toBe('도구 7회 · 파일 3개 · 12.4초')
  })
  it('파일이 없으면 파일 칸을 빼고, 0.1초 미만은 안 적는다 (0.0초 는 잡음이다)', () => {
    expect(machSummary(1, 0, 40)).toBe('도구 1회')
    expect(machSummary(2, 1, 99)).toBe('도구 2회 · 파일 1개')
    expect(machSummary(2, 1, 100)).toBe('도구 2회 · 파일 1개 · 0.1초')
  })
})

describe('에이전트 목록 — Claude 와 Codex 는 섞이면 안 된다', () => {
  it('이름 체계가 겹치지 않는다', () => {
    const c = AGENT_MODELS.claude.map((m) => m.v), x = AGENT_MODELS.codex.map((m) => m.v)
    expect(c.some((v) => x.includes(v))).toBe(false)
    expect(c.every((v) => fitsProvider('claude', v))).toBe(true)
    expect(x.every((v) => fitsProvider('codex', v))).toBe(true)
  })
  it('상대의 모델은 «맞지 않다» 고 답한다 — 안 넘기고 CLI 기본값에 맡기려고', () => {
    expect(fitsProvider('codex', 'claude-opus-5')).toBe(false)
    expect(fitsProvider('claude', 'gpt-5.1-codex')).toBe(false)
    expect(fitsProvider('codex', undefined)).toBe(false)
  })
  it('노력 단계가 다르다 — Codex 에는 xhigh·max 가 없다', () => {
    const x = AGENT_EFFORTS.codex.map((e) => e.v)
    expect(x).toContain('minimal')
    expect(x).not.toContain('xhigh')
    expect(x).not.toContain('max')
    expect(AGENT_EFFORTS.claude.map((e) => e.v)).toContain('max')
  })
})

describe('cronFromText — 채팅 한 줄에서 루틴 주기 뽑기', () => {
  it('매일 아침 9시가 기본이고, 「매일 아침 8시」 를 읽는다', () => {
    const g = cronFromText('매일 아침 8시에 어제 한 일 정리해 줘')
    expect(g.cron).toBe('0 8 * * *')
    expect(g.label).toBe('매일 08:00')
    expect(g.rest).toContain('어제 한 일 정리')
    expect(g.matched).toBe(true)
  })
  it('요일·평일·주말을 가른다', () => {
    expect(cronFromText('매주 월요일 9시 주간 계획').cron).toBe('0 9 * * 1')
    expect(cronFromText('평일 오전 7시 30분 브리핑').cron).toBe('30 7 * * 1-5')
    expect(cronFromText('주말 오후 6시 정리').cron).toBe('0 18 * * 0,6')
    expect(cronFromText('매월 1일 결산').cron).toBe('0 9 1 * *')
  })
  it('오후를 24시로 옮기고, 못 읽으면 기본값을 쓰되 그렇다고 말한다', () => {
    expect(cronFromText('오후 3시 보고').cron).toBe('0 15 * * *')
    const g = cronFromText('그냥 아무 말')
    expect(g.cron).toBe('0 9 * * *')
    expect(g.matched).toBe(false)
    expect(g.rest).toBe('그냥 아무 말')
  })
  it('이름은 시킬 일의 앞부분에서 만든다', () => {
    expect(routineName('어제 한 일 정리')).toBe('어제 한 일 정리')
    expect(routineName('')).toBe('새 루틴')
    expect(routineName('아주 긴 문장을 쓰면 목록에서 한 줄로 안 보이니까 잘라야 한다').endsWith('…')).toBe(true)
  })
})

describe('favicon — 어느 호스트의 아이콘인가', () => {
  it('열 수 없는 것은 아이콘도 없다', () => {
    expect(faviconHost('https://Example.COM/a?b=1')).toBe('example.com')
    expect(faviconHost('mailto:a@b.com')).toBe(null)
    expect(faviconHost('./img.png')).toBe(null)
    expect(faviconHost('https://ex..com/')).toBe(null)
  })
  it('하위 호스트는 한 단계만 올라간다 — 3라벨에서 멈춘다', () => {
    expect(parentHost('raw.githubusercontent.com')).toBe('githubusercontent.com')
    expect(parentHost('a.b.co.kr')).toBe('b.co.kr')
    expect(parentHost('example.com')).toBe(null)
  })
  it('32 이상 중 가장 작은 것을 고르고, mask-icon 은 뺀다', () => {
    const html = '<link rel="icon" sizes="16x16" href="/s.png"><link rel="icon" sizes="64x64" href="/m.png"><link rel="apple-touch-icon" href="/big.png"><link rel="mask-icon" href="/k.svg">'
    const links = parseIconLinks(html)
    expect(links.length).toBe(4)
    expect(bestIcon(links)).toBe('/m.png')
    expect(bestIcon(parseIconLinks('<link rel="icon" sizes="16x16" href="/s.png">'))).toBe('/s.png')
    expect(bestIcon(parseIconLinks('<link rel="mask-icon" href="/k.svg">'))).toBe(null)
  })
})
