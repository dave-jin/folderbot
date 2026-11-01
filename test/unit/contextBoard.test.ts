import { describe, it, expect } from 'vitest'
import type { SessionCard } from '../../src/core/contextCard'
import { emptyTasks, type CtxTask, type FolderTasks, type TaskState } from '../../src/core/contextTasks'
import type { BoardRoutine } from '../../src/core/routineBoard'
import {
  STEP_ROWS, SNOOZE_MS, FOLD_MS, GOAL_FRESH_MS, AXIS_MARK,
  goalLine, outboxLines, buildBoard, story, brief, renderBoardMd, axisPrompt,
  type FolderInput, type Board
} from '../../src/core/contextBoard'

const DAY = 86_400_000
const NOW = new Date(2026, 10, 1, 12, 0).getTime()
const SINCE = NOW - DAY

const card = (id: string, o: Partial<SessionCard> = {}): SessionCard => ({
  id, sessionId: id, botId: 'hack1', channel: 'folder', machine: 'mini',
  intent: `의도 ${id}`, done: [], promised: [], ending: 'finished', taskHint: '', from: NOW - 1000, to: NOW - 1000,
  cursor: '', updatedAt: NOW, llm: true, ...o
})
const task = (id: string, state: TaskState, o: Partial<CtxTask> = {}): CtxTask => ({
  id, title: `작업 ${id}`, state, summary: `요약 ${id}`, missing: '', cards: [], lastAt: NOW - 1000, updatedAt: NOW, ...o
})
const folder = (o: Partial<Omit<FolderInput, 'tasks'>> & { tasks?: CtxTask[]; snooze?: FolderTasks['snooze']; gap?: string } = {}): FolderInput => {
  const { tasks, snooze, gap, ...rest } = o
  return {
    botId: 'hack1', folder: '해커톤', due: '2026-11-05',
    tasks: { ...emptyTasks('hack1'), tasks: tasks ?? [], snooze: snooze ?? {}, gap: gap ?? '' },
    cards: [card('c0')], goal: { text: '투표까지 마치기', from: 'state' }, outbox: [], ...rest
  }
}
const build = (folders: FolderInput[], o: Partial<Parameters<typeof buildBoard>[0]> = {}): Board =>
  buildBoard({ folders, waiting: [], routines: [], period: 'today', since: SINCE, now: NOW, host: '맥미니', axis: null, sources: [], ...o })
const routine = (name: string, state: BoardRoutine['state'], o: Partial<BoardRoutine> = {}): BoardRoutine => ({
  botId: 'hack1', bot: '해커톤', name, cron: '', when: '', enabled: true, once: false, state, firstWait: false,
  recent: [], daveTodo: false, changes: [],
  last: { run: 'r1', botId: 'hack1', routine: name, start: NOW - 5000, result: 'fail', catchup: false }, ...o
} as BoardRoutine)

describe('상수', () => {
  it('값', () => {
    expect(STEP_ROWS).toBe(3)
    expect(SNOOZE_MS).toBe(7 * DAY)
    expect(FOLD_MS).toBe(14 * DAY)
    expect(GOAL_FRESH_MS).toBe(14 * DAY)
    expect(AXIS_MARK).toBe('[[folderbot:context-axis]]')
  })
})

describe('goalLine', () => {
  const state = '# State\n\n> 마지막 갱신: 2026-10-30\n> 현재 목표: 투표까지 마치기\n\n## 완료\n'
  const claude = '# 제목\n\n## 🎯 목적 (2026-10 확정)\n\n해커톤을 열어 참가자 열 팀이 시제품을 만든다. 두 번째 문장.\n\n## 역할\n'
  it('state 목표가 신선하면 state', () => {
    expect(goalLine(state, NOW - 3 * DAY, claude, NOW)).toEqual({ text: '투표까지 마치기', from: 'state' })
  })
  it('15일 전이면 CLAUDE.md 목적 첫 문장', () => {
    expect(goalLine(state, NOW - 15 * DAY, claude, NOW)).toEqual({ text: '해커톤을 열어 참가자 열 팀이 시제품을 만든다.', from: 'claude' })
  })
  it('mtime 을 모르면 신선하지 않다', () => {
    expect(goalLine(state, null, claude, NOW).from).toBe('claude')
  })
  it('둘 다 없으면 목적 미정', () => {
    expect(goalLine(null, null, null, NOW)).toEqual({ text: '목적 미정', from: 'none' })
    expect(goalLine('# x', NOW, '# y', NOW)).toEqual({ text: '목적 미정', from: 'none' })
  })
  it('빈 현재 목표 줄은 다음 줄을 삼키지 않고 CLAUDE.md 로 넘어간다', () => {
    const empty = '> 현재 목표:\n\n## 완료\n'
    expect(goalLine(empty, NOW, claude, NOW)).toEqual({ text: '해커톤을 열어 참가자 열 팀이 시제품을 만든다.', from: 'claude' })
    expect(goalLine(empty, NOW, null, NOW)).toEqual({ text: '목적 미정', from: 'none' })
  })
  it('민감값은 가린다', () => {
    expect(goalLine('> 현재 목표: 010-1234-5678 에게 연락', NOW, null, NOW).text).not.toContain('1234')
  })
})

describe('outboxLines', () => {
  const md = [
    '# State', '- [10/30 09:00] [보고] 절 밖 줄', '',
    '## 📤 오케스트레이터에게',
    '- [10/31 23:10] [완료] 결과 화면 고침 | 영향 없음 | 제안 | Dave 확인 필요 N',
    '- 형식이 틀린 줄',
    '- [11/1 08:05] [보고] 두 번째',
    '## 다음 절', '- [10/29 01:00] [보고] 또 절 밖'
  ].join('\n')
  it('절 안의 줄만 읽는다', () => {
    const r = outboxLines(md, 2026)
    expect(r).toEqual([
      { at: new Date(2026, 9, 31, 23, 10).getTime(), text: '[완료] 결과 화면 고침' },
      { at: new Date(2026, 10, 1, 8, 5).getTime(), text: '[보고] 두 번째' }
    ])
  })
  it('없는 날짜·시각 줄은 건너뛴다', () => {
    const bad = ['## 📤 오케스트레이터에게', '- [2/30 10:00] [보고] 없는 날', '- [13/1 10:00] [보고] 없는 달', '- [0/5 10:00] [보고] 영월', '- [5/0 10:00] [보고] 영일',
      '- [5/5 24:00] [보고] 스물넷', '- [5/5 10:60] [보고] 육십분', '- [5/31 23:59] [보고] 멀쩡'].join('\n')
    expect(outboxLines(bad, 2026).map((r) => r.text)).toEqual(['[보고] 멀쩡'])
  })
  it('null 이나 절 없음은 빈 배열', () => {
    expect(outboxLines(null, 2026)).toEqual([])
    expect(outboxLines('# x', 2026)).toEqual([])
  })
})

describe('buildBoard — 나설 곳', () => {
  it('stalled 5개 → 3줄 + 외 2, 최근 순', () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => task(`t${n}`, 'stalled', { lastAt: NOW - n * 1000 }))
    const b = build([folder({ tasks })])
    expect(b.step.stalled.rows).toHaveLength(3)
    expect(b.step.stalled.more).toBe(2)
    expect(b.step.stalled.rows.map((r) => r.taskId)).toEqual(['t1', 't2', 't3'])
    expect(b.step.stalled.rows[0]).toMatchObject({ kind: 'stalled', botId: 'hack1', folder: '해커톤', title: '작업 t1', at: NOW - 1000 })
  })
  it('snooze 중인 작업은 나설 곳에서 빠지고 목표 카드에는 남는다', () => {
    const b = build([folder({ tasks: [task('a', 'stalled'), task('b', 'stalled')], snooze: { a: NOW + 1000 } })])
    expect(b.step.stalled.rows.map((r) => r.taskId)).toEqual(['b'])
    expect(b.goals[0].tasks.map((t) => t.id)).toContain('a')
  })
  it('snooze 가 지났으면 다시 오른다', () => {
    const b = build([folder({ tasks: [task('a', 'stalled')], snooze: { a: NOW - 1 } })])
    expect(b.step.stalled.rows).toHaveLength(1)
  })
  it('15일 전 stalled 는 접힌다', () => {
    const b = build([folder({ tasks: [task('old', 'stalled', { lastAt: NOW - 15 * DAY }), task('new', 'stalled')] })])
    expect(b.step.stalled.rows.map((r) => r.taskId)).toEqual(['new'])
  })
  it('claimed 도 하다 만 일에 오르고 줄에 «끝났다고 함»', () => {
    const b = build([folder({ tasks: [task('c', 'claimed')] })])
    expect(b.step.stalled.rows).toHaveLength(1)
    expect(b.step.stalled.rows[0].line).toContain('끝났다고 함')
  })
  it('waiting 은 같은 세션 한 줄 · 최근 것', () => {
    const b = build([folder()], {
      waiting: [
        { botId: 'hack1', folder: '해커톤', sessionId: 's1', name: '세션1', at: NOW - 5000 },
        { botId: 'hack1', folder: '해커톤', sessionId: 's1', name: '세션1', at: NOW - 1000 },
        { botId: 'hack1', folder: '해커톤', sessionId: 's2', name: '세션2', at: NOW - 3000 }
      ]
    })
    expect(b.step.waiting.rows.map((r) => [r.sessionId, r.at])).toEqual([['s1', NOW - 1000], ['s2', NOW - 3000]])
    expect(b.step.waiting.rows[0].kind).toBe('waiting')
  })
  it('waiting 도 3줄 상한', () => {
    const waiting = [1, 2, 3, 4].map((n) => ({ botId: 'h', folder: 'f', sessionId: `s${n}`, name: `n${n}`, at: NOW - n }))
    const b = build([folder()], { waiting })
    expect(b.step.waiting.rows).toHaveLength(3)
    expect(b.step.waiting.more).toBe(1)
  })
  it('루틴은 fail·missed 만, 같은 루틴은 한 줄', () => {
    const b = build([folder()], {
      routines: [routine('아침', 'fail'), routine('아침', 'fail'), routine('저녁', 'missed'), routine('점심', 'ok'), routine('밤', 'unknown'), routine('새벽', 'finished')]
    })
    expect(b.step.routine.rows.map((r) => r.routine).sort()).toEqual(['아침', '저녁'])
    expect(b.step.routine.rows[0].kind).toBe('routine')
  })
})

describe('buildBoard — 목표 카드', () => {
  it('problem 먼저, 그다음 due 오름차순, 상시는 끝', () => {
    const fs = [
      folder({ botId: 'a', folder: 'A', due: null }),
      folder({ botId: 'b', folder: 'B', due: '2026-12-01' }),
      folder({ botId: 'c', folder: 'C', due: '2026-11-03', tasks: [task('x', 'waiting')] }),
      folder({ botId: 'd', folder: 'D', due: '2026-11-02' }),
      folder({ botId: 'e', folder: 'E', due: null, tasks: [task('y', 'stalled')] })
    ]
    const b = build(fs)
    expect(b.goals.map((g) => g.folder)).toEqual(['C', 'E', 'D', 'B', 'A'])
    expect(b.goals.find((g) => g.folder === 'A')!.due).toBe('상시')
  })
  it('since 뒤 카드가 없는 폴더는 quiet', () => {
    const b = build([folder({ cards: [card('old', { to: SINCE - 1 })] }), folder({ folder: '활동', botId: 'z' }), folder({ folder: '빈', botId: 'e', cards: [] })])
    expect(b.goals.map((g) => g.folder)).toEqual(['활동'])
    expect(b.quiet).toEqual(['해커톤', '빈'])
  })
  it('counts 는 여섯 키 · gap · just · next · chips · lastAt', () => {
    const f = folder({
      gap: '투표까지 두 단계 남음',
      tasks: [
        task('d1', 'done', { title: '오래된 끝', lastAt: NOW - 3000 }),
        task('d2', 'claimed', { title: '최근 끝', lastAt: NOW - 500 }),
        task('s1', 'stalled', { title: '멈춘 일', missing: '투표 화면', lastAt: NOW - 800 }),
        task('t1', 'todo', { title: '아직 일', lastAt: NOW - 9000 })
      ],
      cards: [
        card('c1', { sessionId: 's1', to: NOW - 100 }),
        card('c2', { sessionId: 's1', to: NOW - 200 }),
        card('c3', { sessionId: 's2', to: NOW - 300 }),
        card('c4', { sessionId: 'r1', channel: 'routine', taskHint: '아침', to: NOW - 400 }),
        card('c5', { sessionId: 'r2', channel: 'routine', taskHint: '아침', to: NOW - 500 }),
        card('c6', { sessionId: 'r3', channel: 'routine', taskHint: '저녁', to: NOW - 600 }),
        card('c7', { sessionId: 's9', to: SINCE - 5 })
      ]
    })
    const g = build([f]).goals[0]
    expect(g.counts).toEqual({ done: 1, claimed: 1, running: 0, stalled: 1, waiting: 0, todo: 1 })
    expect(g.gap).toBe('투표까지 두 단계 남음')
    expect(g.just).toBe('최근 끝')
    expect(g.next).toBe('투표 화면')
    expect(g.chips).toEqual({ sessions: 2, routines: 2 })
    expect(g.problem).toBe(true)
    expect(g.lastAt).toBe(NOW - 100)
    expect(g.goal).toBe('투표까지 마치기')
    expect(g.goalFrom).toBe('state')
    expect(g.tasks[0]).toEqual({ id: 'd1', title: '오래된 끝', state: 'done', lastAt: NOW - 3000, cards: 0 })
  })
  it('gap 이 비면 null, next 는 missing 이 비면 제목', () => {
    const g = build([folder({ tasks: [task('r', 'running', { title: '도는 일' })] })]).goals[0]
    expect(g.gap).toBeNull()
    expect(g.next).toBe('도는 일')
    expect(g.just).toBeNull()
    expect(g.problem).toBe(false)
  })
})

describe('buildBoard — 리뷰 1회차', () => {
  it('루틴 이름·마감·host·id·sessionId 의 % 도 지운다', () => {
    const f = folder({ due: '100%-마감', tasks: [task('t%1', 'stalled')] })
    const b = build([f], {
      host: '맥%미니', routines: [routine('아침 5%', 'fail')],
      waiting: [{ botId: 'h', folder: 'f', sessionId: 's%1', name: 'n', at: NOW }]
    })
    expect(b.step.routine.rows).toHaveLength(1)
    expect(JSON.stringify(b)).not.toContain('%')
  })
  it('같은 루틴이 여러 번이면 가장 최근 실패 한 줄', () => {
    const run = (start: number, reason: string) => ({ run: String(start), botId: 'hack1', routine: '아침', start, result: 'fail' as const, reason, catchup: false })
    const b = build([folder()], { routines: [routine('아침', 'fail', { last: run(100, '옛 실패') }), routine('아침', 'fail', { last: run(900, '새 실패') }), routine('아침', 'fail', { last: run(500, '중간') })] })
    expect(b.step.routine.rows).toHaveLength(1)
    expect(b.step.routine.rows[0].at).toBe(900)
    expect(b.step.routine.rows[0].line).toContain('새 실패')
  })
})

describe('buildBoard — tally · 일반', () => {
  it('tally: 끝남 · 하다 만 · 새로 생김', () => {
    const f = folder({
      tasks: [
        task('d', 'done', { lastAt: NOW - 100, cards: ['n1'] }),
        task('dOld', 'done', { lastAt: SINCE - 100, cards: ['o1'] }),
        task('s', 'stalled', { lastAt: NOW - 100, cards: ['o2'] }),
        task('c', 'claimed', { lastAt: NOW - 100, cards: ['n2'] })
      ],
      cards: [
        card('n1', { from: NOW - 5000 }), card('o1', { from: SINCE - 9000, to: SINCE - 8000 }),
        card('o2', { from: SINCE - 7000, to: NOW - 100 }), card('n2', { from: NOW - 4000 })
      ]
    })
    expect(build([f]).tally).toEqual({ done: 1, stalled: 2, added: 2 })
  })
  it('판 어디에도 % 가 없다', () => {
    const f = folder({
      tasks: [task('a', 'stalled', { title: '진행 50% 일', summary: '80% 끝', missing: '20% 남음' })],
      gap: '90% 완료', goal: { text: '100% 달성', from: 'state' }
    })
    const b = build([f], { routines: [routine('r', 'fail', { last: { run: '1', botId: 'h', routine: 'r', start: 1, result: 'fail', reason: '5% 실패', catchup: false } })], sources: [{ name: 'x', ok: false, at: null, note: '10%' }] })
    expect(JSON.stringify(b)).not.toContain('%')
  })
  it('메타를 그대로 싣는다', () => {
    const b = build([], { sources: [{ name: '맥북 기록', ok: false, at: null, note: '2단계에서 가져옴' }], axis: { text: '축', at: 5 } })
    expect(b).toMatchObject({ v: 1, at: NOW, host: '맥미니', period: 'today', since: SINCE, axis: { text: '축', at: 5 } })
    expect(b.sources).toHaveLength(1)
    expect(b.goals).toEqual([])
  })
})

describe('story', () => {
  const ev = (kind: 'file' | 'tool', ref: string) => ({ kind, ref })
  const f = folder({
    tasks: [task('T', 'stalled', { cards: ['a', 'b', 'c'] }), task('U', 'todo', { cards: ['d'] })],
    cards: [
      card('a', { sessionId: 'S1', seg: 0, intent: '첫 의도', from: 100, to: 200, done: [{ text: 'x', ev: [ev('file', 'a.md')] }] }),
      card('b', { sessionId: 'S1', seg: 1, intent: '둘째 의도', from: 300, to: 400, ending: 'cut' }),
      card('c', { sessionId: 'S2', intent: '다른 세션', from: 500, to: 600, channel: 'orch', machine: 'macbook' }),
      card('d', { sessionId: 'S3', intent: '남의 작업', from: 50, to: 60 })
    ],
    outbox: [{ at: 450, text: '[완료] 파일 줄' }]
  })
  it('같은 세션 연속 카드는 한 줄, outbox 포함, 시간 순', () => {
    const rows = story(f, null)
    expect(rows.map((r) => r.text)).toEqual(['남의 작업', '첫 의도', '[완료] 파일 줄', '다른 세션'])
    expect(rows.map((r) => r.at)).toEqual([50, 100, 450, 500])
  })
  it('cut 이 섞이면 stalled · 근거 종류를 단다', () => {
    const r = story(f, null).find((x) => x.text === '첫 의도')!
    expect(r.stalled).toBe(true)
    expect(r.ev).toBe('file')
    expect(r.ref).toEqual({ sessionId: 'S1' })
    expect(r.channel).toBe('folder')
  })
  it('근거가 없으면 ev 칸이 없다', () => {
    const r = story(f, null).find((x) => x.text === '다른 세션')!
    expect(r.ev).toBeUndefined()
    expect(r.channel).toBe('orch')
    expect(r.machine).toBe('macbook')
  })
  it('outbox 줄은 file 채널', () => {
    const r = story(f, null).find((x) => x.channel === 'file')!
    expect(r).toMatchObject({ machine: '', stalled: false, ref: { file: 'state.md' }, at: 450 })
  })
  it('taskId 가 있으면 그 작업 카드만 · outbox 제외', () => {
    const rows = story(f, 'T')
    expect(rows.map((r) => r.text)).toEqual(['첫 의도', '다른 세션'])
  })
  it('모르는 taskId → 빈 배열', () => {
    expect(story(f, 'nope')).toEqual([])
  })
})

describe('brief', () => {
  const f = folder({
    tasks: [
      task('T', 'stalled', { title: '투표 화면', summary: '화면 절반', missing: '결과 집계', cards: ['a'] }),
      task('U', 'done', { title: '안내문', summary: '발송 끝', cards: ['b'] })
    ],
    cards: [
      card('a', { done: [{ text: 'x', ev: [{ kind: 'file', ref: '02_작업/vote.md' }, { kind: 'commit', ref: 'abc1234' }] }] }),
      card('b', { done: [{ text: 'y', ev: [{ kind: 'file', ref: '03_산출물/notice.md' }] }] })
    ]
  })
  it('머리 · 목표 · 요약 · 빠진 것 · 근거 경로', () => {
    const t = brief(f, null)
    expect(t.startsWith('## 함께 가는 맥락')).toBe(true)
    expect(t).toContain('투표까지 마치기')
    expect(t).toContain('투표 화면')
    expect(t).toContain('하다 멈춤')
    expect(t).toContain('화면 절반')
    expect(t).toContain('결과 집계')
    expect(t).toContain('02_작업/vote.md')
    expect(t).not.toContain('abc1234')
  })
  it('taskId 가 있으면 그 작업에 집중', () => {
    const t = brief(f, 'T')
    expect(t).toContain('투표 화면')
    expect(t).not.toContain('안내문')
  })
  it('2000자를 넘지 않는다', () => {
    const many = Array.from({ length: 80 }, (_, i) => task(`k${i}`, 'stalled', { title: `긴 작업 이름 ${i} `.repeat(3), summary: '요약 '.repeat(30), missing: '빠진 것 '.repeat(20) }))
    const t = brief(folder({ tasks: many }), null)
    expect(t.length).toBeLessThanOrEqual(2000)
    expect(t.startsWith('## 함께 가는 맥락')).toBe(true)
  })
})

describe('renderBoardMd', () => {
  const f = folder({
    tasks: [task('a', 'stalled', { title: '멈춘 일' }), task('b', 'claimed', { title: '끝났다는 일' }), task('c', 'done'), task('d', 'running'), task('e', 'waiting'), task('g', 'todo')],
    gap: '두 단계 남음'
  })
  const b = build([f, folder({ botId: 'q', folder: '조용', cards: [] })], {
    sources: [{ name: '맥북 기록', ok: false, at: null, note: '2단계에서 가져옴' }, { name: '루틴', ok: true, at: NOW }],
    waiting: [{ botId: 'hack1', folder: '해커톤', sessionId: 's1', name: '세션1', at: NOW - 1000 }],
    routines: [routine('아침', 'fail')]
  })
  const md = renderBoardMd(b)
  it('머리와 순서', () => {
    expect(md.startsWith('# 맥락 상황판')).toBe(true)
    expect(md.indexOf('## 내가 나설 곳')).toBeGreaterThan(0)
    expect(md.indexOf('## 목표')).toBeGreaterThan(md.indexOf('## 내가 나설 곳'))
    expect(md).toContain('하다 만 일')
    expect(md).toContain('내 답 대기')
    expect(md).toContain('어긋난 루틴')
  })
  it('한국어 상태 이름', () => {
    for (const s of ['끝남', '끝났다고 함', '하는 중', '하다 멈춤', '내 답 대기', '아직']) expect(md).toContain(s)
  })
  it('빈 덩이는 없음', () => {
    const empty = renderBoardMd(build([folder()]))
    expect((empty.match(/없음/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
  it('조용한 목표 · 출처 경고 · % 없음', () => {
    expect(md).toContain('조용한 목표 1: 조용')
    expect(md).toContain('⚠ 맥북 기록: 2단계에서 가져옴')
    expect(md).not.toContain('⚠ 루틴')
    expect(md).not.toContain('%')
  })
  it('note 없는 실패는 못 읽음', () => {
    const m = renderBoardMd(build([], { sources: [{ name: 'x', ok: false, at: null }] }))
    expect(m).toContain('⚠ x: 못 읽음')
  })
})

describe('axisPrompt', () => {
  it('표지 · 한국어 · 퍼센트 없음', () => {
    const b = build([folder({ tasks: [task('a', 'stalled', { title: '멈춘 일' })] })])
    const p = axisPrompt(b)
    expect(p).toContain(AXIS_MARK)
    expect(p).toContain('오늘의 축')
    expect(p).toContain('멈춘 일')
    expect(p).toContain('해커톤')
    expect(p).not.toContain('%')
  })
})
