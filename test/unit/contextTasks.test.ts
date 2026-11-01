import { describe, it, expect } from 'vitest'
import type { SessionCard, Ending } from '../../src/core/contextCard'
import {
  STALL_MS, GROUP_MARK, taskState, groupPrompt, parseGroup, applyGroup, routineTasks, moveCard, reopen, emptyTasks,
  type FolderTasks, type CtxTask, type GroupResult
} from '../../src/core/contextTasks'

const NOW = 10_000_000
const card = (id: string, o: Partial<SessionCard> = {}): SessionCard => ({
  id, sessionId: id, botId: 'hack1', channel: 'folder', machine: 'mini',
  intent: '', done: [], promised: [], ending: 'finished', taskHint: '', from: NOW - 100, to: NOW - 100,
  cursor: '', updatedAt: NOW, llm: true, ...o
})
const ev = [{ kind: 'file' as const, ref: 'a.md' }]
const none = { running: false, waiting: false }
const noProof = { todoDone: false, stateDone: false }
const task = (id: string, cards: string[], o: Partial<CtxTask> = {}): CtxTask => ({
  id, title: id, state: 'todo', summary: '', missing: '', cards, lastAt: 1, updatedAt: 1, ...o
})
const folder = (tasks: CtxTask[], loose: string[] = [], o: Partial<FolderTasks> = {}): FolderTasks =>
  ({ ...emptyTasks('hack1'), tasks, loose, ...o })

describe('taskState', () => {
  it('카드 0장 → todo', () => {
    expect(taskState([], none, noProof, NOW)).toBe('todo')
  })
  it('live.waiting → waiting (카드가 무엇이든)', () => {
    expect(taskState([card('a', { done: [{ text: 'x', ev }] })], { running: false, waiting: true }, { todoDone: true, stateDone: true }, NOW)).toBe('waiting')
  })
  it('live.running → running', () => {
    expect(taskState([card('a', { ending: 'cut' })], { running: true, waiting: false }, noProof, NOW)).toBe('running')
  })
  it('waiting 이 running 보다 먼저', () => {
    expect(taskState([card('a')], { running: true, waiting: true }, noProof, NOW)).toBe('waiting')
  })
  it('todoDone 또는 stateDone → done', () => {
    expect(taskState([card('a', { ending: 'cut' })], none, { todoDone: true, stateDone: false }, NOW)).toBe('done')
    expect(taskState([card('a', { ending: 'claimed' })], none, { todoDone: false, stateDone: true }, NOW)).toBe('done')
  })
  it('마지막 카드 finished + 근거 1개 이상 → done', () => {
    expect(taskState([card('a', { done: [{ text: 'x', ev }] })], none, noProof, NOW)).toBe('done')
  })
  it('마지막 카드 claimed, 또는 finished 인데 근거 0 → claimed', () => {
    expect(taskState([card('a', { ending: 'claimed', done: [{ text: 'x', ev }] })], none, noProof, NOW)).toBe('claimed')
    expect(taskState([card('a', { ending: 'finished', done: [{ text: 'x', ev: [] }] })], none, noProof, NOW)).toBe('claimed')
    expect(taskState([card('a', { ending: 'finished' })], none, noProof, NOW)).toBe('claimed')
  })
  it('마지막 카드 cut → stalled', () => {
    expect(taskState([card('a', { ending: 'cut' })], none, noProof, NOW)).toBe('stalled')
  })
  it('마지막 카드 running 인데 live.running 거짓 → stalled', () => {
    expect(taskState([card('a', { ending: 'running' })], none, noProof, NOW)).toBe('stalled')
  })
  it('마지막 카드는 to 가 가장 큰 카드다 (배열 순서 무관)', () => {
    const late = card('late', { to: NOW - 10, ending: 'cut' })
    const early = card('early', { to: NOW - 5000, done: [{ text: 'x', ev }] })
    expect(taskState([late, early], none, noProof, NOW)).toBe('stalled')
    expect(taskState([early, late], none, noProof, NOW)).toBe('stalled')
  })
  it('promised 가 남고 30분 1초 지나면 stalled — 마지막 카드 끝맺음보다 앞선다', () => {
    const c = card('a', { to: NOW - STALL_MS - 1000, promised: ['남은 일'], done: [{ text: 'x', ev }] })
    expect(taskState([c], none, noProof, NOW)).toBe('stalled')
  })
  it('promised 가 남아도 29분이면 ending 대로', () => {
    const c = card('a', { to: NOW - 29 * 60_000, promised: ['남은 일'], done: [{ text: 'x', ev }] })
    expect(taskState([c], none, noProof, NOW)).toBe('done')
    expect(taskState([{ ...c, ending: 'claimed' }], none, noProof, NOW)).toBe('claimed')
  })
  it('promised 가 남아도 live.waiting·live.running 이 먼저', () => {
    const c = card('a', { to: NOW - STALL_MS - 1000, promised: ['남은 일'] })
    expect(taskState([c], { running: false, waiting: true }, noProof, NOW)).toBe('waiting')
    expect(taskState([c], { running: true, waiting: false }, noProof, NOW)).toBe('running')
  })
  it('마지막 카드 waiting_dave 인데 live.waiting 거짓 → waiting (promised 가 남아 오래돼도)', () => {
    expect(taskState([card('a', { ending: 'waiting_dave' })], none, noProof, NOW)).toBe('waiting')
    const old = card('a', { ending: 'waiting_dave', to: NOW - STALL_MS - 1000, promised: ['답 받고 하기'] })
    expect(taskState([old], none, noProof, NOW)).toBe('waiting')
  })
  it('reopenedAt 이 마지막 카드 to 보다 늦으면 근거가 있어도 stalled', () => {
    const c = card('a', { to: NOW - 1000, done: [{ text: 'x', ev }] })
    expect(taskState([c], none, { todoDone: true, stateDone: true, reopenedAt: NOW - 500 }, NOW)).toBe('stalled')
    expect(taskState([c], none, { ...noProof, reopenedAt: NOW - 500 }, NOW)).toBe('stalled')
  })
  it('reopen 뒤 새 카드가 오면 다시 카드대로', () => {
    const c = card('b', { to: NOW - 100, done: [{ text: 'x', ev }] })
    expect(taskState([c], none, { ...noProof, reopenedAt: NOW - 500 }, NOW)).toBe('done')
  })
  it('reopen 해도 waiting·running 이 먼저', () => {
    const c = card('a', { to: NOW - 1000 })
    expect(taskState([c], { running: true, waiting: false }, { ...noProof, reopenedAt: NOW }, NOW)).toBe('running')
    expect(taskState([c], { running: false, waiting: true }, { ...noProof, reopenedAt: NOW }, NOW)).toBe('waiting')
  })
})

describe('parseGroup', () => {
  const body = { assign: [{ card: 'c1', task: 'new:결과 화면' }, { card: 'c2', task: 't-abc123', unsure: true }], tasks: [{ id: 'new:결과 화면', title: '결과 화면', summary: 's', missing: 'm' }], gap: '투표까지 둘 남음' }
  it('JSON 그대로', () => {
    const r = parseGroup(JSON.stringify(body))
    expect(r?.assign).toHaveLength(2)
    expect(r?.assign[1]).toEqual({ card: 'c2', task: 't-abc123', unsure: true })
    expect(r?.tasks[0].title).toBe('결과 화면')
    expect(r?.gap).toBe('투표까지 둘 남음')
  })
  it('울타리·군말을 견딘다', () => {
    const r = parseGroup('알겠습니다.\n```json\n' + JSON.stringify(body) + '\n```\n이상입니다 {끝}')
    expect(r?.assign).toHaveLength(2)
    expect(parseGroup('결과: ' + JSON.stringify(body) + ' 감사합니다')?.assign).toHaveLength(2)
  })
  it('assign 이 배열이 아니면 null', () => {
    expect(parseGroup('{"assign":"x","tasks":[]}')).toBeNull()
    expect(parseGroup('{"tasks":[]}')).toBeNull()
    expect(parseGroup('JSON 아님')).toBeNull()
    expect(parseGroup('[1,2]')).toBeNull()
  })
  it('tasks 가 없으면 빈 배열, 이상한 항목은 버린다', () => {
    const r = parseGroup('{"assign":[{"card":"c1","task":"x"},{"card":1},"zz"]}')
    expect(r?.tasks).toEqual([])
    expect(r?.assign).toEqual([{ card: 'c1', task: 'x' }])
  })
  it('글 칸은 마스킹하고 자른다', () => {
    const r = parseGroup(JSON.stringify({ assign: [], tasks: [{ id: 't-1', title: 'T', summary: '전화 010-1234-5678 ' + 'x'.repeat(400), missing: '' }], gap: '주민 900101-1234567' }))
    expect(r?.tasks[0].summary).toContain('[가림]')
    expect(r?.tasks[0].summary.length).toBeLessThanOrEqual(300)
    expect(r?.gap).toBe('주민 [가림]')
  })
})

describe('applyGroup', () => {
  const res = (o: Partial<GroupResult>): GroupResult => ({ assign: [], tasks: [], ...o })

  it('new: 가 새 작업을 만들고 id 는 t- 로 시작하는 안정 id 다', () => {
    const r = res({ assign: [{ card: 'c1', task: 'new:결과 화면' }], tasks: [{ id: 'new:결과 화면', title: '결과 화면', summary: '요약', missing: '남은 것' }] })
    const a = applyGroup(emptyTasks('hack1'), r, NOW)
    expect(a.tasks).toHaveLength(1)
    expect(a.tasks[0].id).toMatch(/^t-[0-9a-f]{6}$/)
    expect(a.tasks[0]).toMatchObject({ title: '결과 화면', summary: '요약', missing: '남은 것', cards: ['c1'], state: 'todo' })
    const b = applyGroup(emptyTasks('hack1'), r, NOW + 999)
    expect(b.tasks[0].id).toBe(a.tasks[0].id)
  })
  it('이미 있는 같은 제목의 작업이 있으면 id 를 바꾸지 않고 거기에 얹는다', () => {
    const a = applyGroup(emptyTasks('hack1'), res({ assign: [{ card: 'c1', task: 'new:결과 화면' }] }), NOW)
    const b = applyGroup(a, res({ assign: [{ card: 'c2', task: 'new:결과 화면' }] }), NOW + 1)
    expect(b.tasks).toHaveLength(1)
    expect(b.tasks[0].id).toBe(a.tasks[0].id)
    expect(b.tasks[0].cards).toEqual(['c1', 'c2'])
  })
  it('같은 제목의 new: 가 둘이면 한 작업으로 합친다', () => {
    const r = res({ assign: [{ card: 'c1', task: 'new:결과 화면' }, { card: 'c2', task: 'new: 결과 화면 ' }] })
    const a = applyGroup(emptyTasks('hack1'), r, NOW)
    expect(a.tasks).toHaveLength(1)
    expect(a.tasks[0].cards).toEqual(['c1', 'c2'])
  })
  it('기존 작업의 summary·missing 이 갱신되고 마스킹을 거친다', () => {
    const prev = folder([task('t-aaaaaa', ['c1'], { summary: '옛', missing: '옛' })])
    const a = applyGroup(prev, res({ tasks: [{ id: 't-aaaaaa', title: 't-aaaaaa', summary: '번호 010-1234-5678', missing: '계좌 110-123-456789' }] }), NOW)
    expect(a.tasks[0].summary).toBe('번호 [가림]')
    expect(a.tasks[0].missing).toBe('계좌 [가림]')
    expect(a.tasks[0].updatedAt).toBe(NOW)
  })
  it('todoTitle·stateDoneLine 도 갱신된다', () => {
    const prev = folder([task('t-aaaaaa', ['c1'])])
    const a = applyGroup(prev, res({ tasks: [{ id: 't-aaaaaa', title: 'x', summary: '', missing: '', todoTitle: '투표 만들기', stateDoneLine: '투표 완료' }] }), NOW)
    expect(a.tasks[0]).toMatchObject({ todoTitle: '투표 만들기', stateDoneLine: '투표 완료' })
  })
  it('pins 에 있는 카드는 r.assign 이 다른 작업을 가리켜도 제자리', () => {
    const prev = folder([task('t-aaaaaa', ['c1']), task('t-bbbbbb', [])], [], { pins: { c1: 't-aaaaaa' } })
    const a = applyGroup(prev, res({ assign: [{ card: 'c1', task: 't-bbbbbb' }] }), NOW)
    expect(a.tasks.find((t) => t.id === 't-aaaaaa')?.cards).toEqual(['c1'])
    expect(a.tasks.find((t) => t.id === 't-bbbbbb')?.cards).toEqual([])
    const b = applyGroup(prev, res({ assign: [{ card: 'c1', task: 'new:딴 일' }] }), NOW)
    expect(b.tasks).toHaveLength(2)
    expect(b.tasks.find((t) => t.id === 't-aaaaaa')?.cards).toEqual(['c1'])
  })
  it('pins 가 있고 아직 아무 작업에도 없는 카드는 고정된 작업에 들어간다', () => {
    const prev = folder([task('t-aaaaaa', []), task('t-bbbbbb', [])], ['c1'], { pins: { c1: 't-aaaaaa' } })
    const a = applyGroup(prev, res({ assign: [{ card: 'c1', task: 't-bbbbbb' }] }), NOW)
    expect(a.tasks.find((t) => t.id === 't-aaaaaa')?.cards).toEqual(['c1'])
    expect(a.loose).toEqual([])
  })
  it('알 수 없는 기존 id 를 가리킨 카드는 loose 로', () => {
    const a = applyGroup(folder([task('t-aaaaaa', [])]), res({ assign: [{ card: 'c9', task: 't-zzzzzz' }, { card: 'c8', task: '' }] }), NOW)
    expect(a.loose).toEqual(['c9', 'c8'])
    expect(a.tasks[0].cards).toEqual([])
  })
  it('loose 였던 카드가 배정되면 loose 에서 빠지고, 옛 작업에서도 빠진다', () => {
    const prev = folder([task('t-aaaaaa', ['c1']), task('t-bbbbbb', [])], ['c2'])
    const a = applyGroup(prev, res({ assign: [{ card: 'c2', task: 't-bbbbbb' }, { card: 'c1', task: 't-bbbbbb' }] }), NOW)
    expect(a.loose).toEqual([])
    expect(a.tasks.find((t) => t.id === 't-aaaaaa')?.cards).toEqual([])
    expect(a.tasks.find((t) => t.id === 't-bbbbbb')?.cards).toEqual(['c2', 'c1'])
  })
  it('카드가 0장이 된 작업도 지우지 않는다', () => {
    const prev = folder([task('t-aaaaaa', ['c1'], { todoTitle: '투표 만들기' })])
    const a = applyGroup(prev, res({ assign: [{ card: 'c1', task: 'new:다른 일' }] }), NOW)
    const old = a.tasks.find((t) => t.id === 't-aaaaaa')
    expect(old).toBeDefined()
    expect(old?.cards).toEqual([])
    expect(old?.todoTitle).toBe('투표 만들기')
  })
  it('r.gap 이 있으면 gap 을 갱신하고 마스킹, 없으면 그대로', () => {
    const prev = folder([], [], { gap: '옛 gap' })
    expect(applyGroup(prev, res({ gap: '전화 010-1234-5678 남음' }), NOW).gap).toBe('전화 [가림] 남음')
    expect(applyGroup(prev, res({}), NOW).gap).toBe('옛 gap')
  })
  it('title 도 마스킹한다', () => {
    const a = applyGroup(emptyTasks('x'), res({ assign: [{ card: 'c1', task: 'new:010-1234-5678 연락' }] }), NOW)
    expect(a.tasks[0].title).toBe('[가림] 연락')
  })
  it('pins·fixes·snooze·reopened 를 건드리지 않고 prev 를 바꾸지 않는다', () => {
    const prev = folder([task('t-aaaaaa', ['c1'])], [], { pins: { c1: 't-aaaaaa' }, snooze: { 't-aaaaaa': 5 }, reopened: { 't-aaaaaa': 6 }, fixes: [{ at: 1, cardId: 'c1', from: null, to: 't-aaaaaa' }] })
    const snap = JSON.stringify(prev)
    const a = applyGroup(prev, res({ assign: [{ card: 'c2', task: 'new:z' }] }), NOW)
    expect(JSON.stringify(prev)).toBe(snap)
    expect(a.pins).toEqual(prev.pins); expect(a.snooze).toEqual(prev.snooze); expect(a.reopened).toEqual(prev.reopened); expect(a.fixes).toEqual(prev.fixes)
    expect(a.updatedAt).toBe(NOW)
  })
})

describe('moveCard', () => {
  const prev = folder([task('t-aaaaaa', ['c1']), task('t-bbbbbb', [])])
  it('pins 가 설정되고 옛 작업에서 빠져 새 작업에 들어간다', () => {
    const a = moveCard(prev, 'c1', 't-bbbbbb', NOW)
    expect(a.pins.c1).toBe('t-bbbbbb')
    expect(a.tasks.find((t) => t.id === 't-aaaaaa')?.cards).toEqual([])
    expect(a.tasks.find((t) => t.id === 't-bbbbbb')?.cards).toEqual(['c1'])
    expect(a.fixes).toEqual([{ at: NOW, cardId: 'c1', from: 't-aaaaaa', to: 't-bbbbbb' }])
  })
  it('loose 에서 옮기면 from 은 null', () => {
    const a = moveCard(folder([task('t-aaaaaa', [])], ['c2']), 'c2', 't-aaaaaa', NOW)
    expect(a.loose).toEqual([])
    expect(a.fixes[0]).toMatchObject({ cardId: 'c2', from: null, to: 't-aaaaaa' })
  })
  it('fixes 는 최근 50줄만', () => {
    let f = prev
    for (let i = 0; i < 60; i++) f = moveCard(f, 'c1', i % 2 ? 't-aaaaaa' : 't-bbbbbb', NOW + i)
    expect(f.fixes).toHaveLength(50)
    expect(f.fixes[49].at).toBe(NOW + 59)
    expect(f.fixes[0].at).toBe(NOW + 10)
  })
  it('{newTitle} 이면 새 작업을 만든다', () => {
    const a = moveCard(prev, 'c1', { newTitle: '새 일' }, NOW)
    const n = a.tasks.find((t) => t.title === '새 일')
    expect(n?.id).toMatch(/^t-[0-9a-f]{6}$/)
    expect(n?.cards).toEqual(['c1'])
    expect(a.pins.c1).toBe(n?.id)
    expect(a.tasks.find((t) => t.id === 't-aaaaaa')?.cards).toEqual([])
    expect(a.fixes[0]).toMatchObject({ from: 't-aaaaaa', to: n?.id })
  })
  it('applyGroup 의 new: 와 같은 id 를 만든다', () => {
    const viaMove = moveCard(emptyTasks('x'), 'c1', { newTitle: '새 일' }, NOW)
    const viaGroup = applyGroup(emptyTasks('x'), { assign: [{ card: 'c1', task: 'new:새 일' }], tasks: [] }, NOW)
    expect(viaMove.tasks[0].id).toBe(viaGroup.tasks[0].id)
  })
  it('없는 작업 id 면 바꾸지 않는다', () => {
    expect(moveCard(prev, 'c1', 't-nope00', NOW)).toEqual(prev)
  })
  it('옮긴 뒤 AI 묶기가 덮지 못한다', () => {
    const moved = moveCard(prev, 'c1', 't-bbbbbb', NOW)
    const a = applyGroup(moved, { assign: [{ card: 'c1', task: 't-aaaaaa' }], tasks: [] }, NOW + 1)
    expect(a.tasks.find((t) => t.id === 't-bbbbbb')?.cards).toEqual(['c1'])
  })
})

describe('reopen', () => {
  it('reopened 가 설정되고 fixes 에 to:reopen 한 줄', () => {
    const a = reopen(folder([task('t-aaaaaa', ['c1', 'c2'])]), 't-aaaaaa', NOW)
    expect(a.reopened['t-aaaaaa']).toBe(NOW)
    expect(a.fixes).toHaveLength(1)
    expect(a.fixes[0]).toMatchObject({ at: NOW, from: 't-aaaaaa', to: 'reopen' })
  })
  it('fixes 도 최근 50줄만, 없는 작업이면 그대로', () => {
    let f = folder([task('t-aaaaaa', [])])
    for (let i = 0; i < 55; i++) f = reopen(f, 't-aaaaaa', NOW + i)
    expect(f.fixes).toHaveLength(50)
    const p = folder([])
    expect(reopen(p, 't-none00', NOW)).toEqual(p)
  })
})

describe('routineTasks', () => {
  const r = (id: string, name: string, o: Partial<SessionCard> = {}) =>
    card(id, { channel: 'routine', taskHint: `루틴 · ${name}`, llm: false, ...o })
  it('루틴 카드 둘이 routine:<이름> 한 작업에 모인다', () => {
    const cards = [r('r1', '아침정리', { to: NOW - 500, intent: '아침정리 루틴 실행' }), r('r2', '아침정리', { to: NOW - 100, intent: '아침정리 루틴 실패 — 네트워크', ending: 'cut' })]
    const a = routineTasks(emptyTasks('hack1'), cards, NOW)
    expect(a.tasks).toHaveLength(1)
    expect(a.tasks[0]).toMatchObject({ id: 'routine:아침정리', cards: ['r1', 'r2'], state: 'stalled', lastAt: NOW - 100 })
    expect(a.tasks[0].title).toContain('아침정리')
    expect(a.loose).toEqual([])
  })
  it('다시 돌려도 같은 결과(중복 카드 없음)이고, 다른 루틴은 다른 작업', () => {
    const cards = [r('r1', '아침정리'), r('r3', '저녁정리')]
    const a = routineTasks(emptyTasks('hack1'), cards, NOW)
    const b = routineTasks(a, cards, NOW + 1)
    expect(b.tasks.map((t) => t.id).sort()).toEqual(['routine:아침정리', 'routine:저녁정리'])
    expect(b.tasks.find((t) => t.id === 'routine:아침정리')?.cards).toEqual(['r1'])
  })
  it('루틴이 아닌 카드는 건드리지 않고, LLM 작업은 그대로 둔다', () => {
    const prev = folder([task('t-aaaaaa', ['c1'])])
    const a = routineTasks(prev, [card('c1'), r('r1', '아침정리')], NOW)
    expect(a.tasks.find((t) => t.id === 't-aaaaaa')).toEqual(prev.tasks[0])
    expect(a.tasks.some((t) => t.cards.includes('c1') && t.id.startsWith('routine:'))).toBe(false)
  })
  it('loose 에 있던 루틴 카드는 loose 에서 빠진다', () => {
    const a = routineTasks(folder([], ['r1']), [r('r1', '아침정리')], NOW)
    expect(a.loose).toEqual([])
  })
  it('state 는 reopened 를 반영한다', () => {
    const c = r('r1', '아침정리', { to: NOW - 1000, done: [{ text: 'x', ev }] })
    const a = routineTasks(folder([], [], { reopened: { 'routine:아침정리': NOW - 10 } }), [c], NOW)
    expect(a.tasks[0].state).toBe('stalled')
    expect(routineTasks(emptyTasks('x'), [c], NOW).tasks[0].state).toBe('done')
  })
})

describe('groupPrompt', () => {
  const input = {
    folder: 'hack1', goal: '해커톤 투표까지 마치기',
    newCards: [card('c1', { intent: '결과 화면 만들기', taskHint: '결과 화면', ending: 'claimed' as Ending, promised: ['투표 연결'] })],
    tasks: [task('t-aaaaaa', ['c0'], { title: '투표', summary: '투표 화면', missing: '집계' })],
    todo: [{ title: '투표 만들기', done: false }, { title: '결과 화면', done: true }],
    stateNotes: '현재 목표: 투표',
    fixes: [{ at: 1, cardId: 'c0', from: 't-aaaaaa', to: 't-bbbbbb' }, { at: 2, cardId: 'c5', from: null, to: 't-aaaaaa' }, { at: 3, cardId: '', from: 't-aaaaaa', to: 'reopen' }]
  }
  it('GROUP_MARK 가 든다', () => {
    expect(groupPrompt(input)).toContain(GROUP_MARK)
    expect(GROUP_MARK).toBe('[[folderbot:context-group]]')
  })
  it('fixes 가 «Dave가 고친 예» 로, reopen 은 «안 끝났다고 한 예» 로 들어간다', () => {
    const p = groupPrompt(input)
    expect(p).toContain('Dave가 고친 예')
    expect(p).toContain('c0')
    expect(p).toContain('t-bbbbbb')
    expect(p).toContain('안 끝났다고 한 예')
  })
  it('애매하면 unsure:true 를 달라는 안내가 든다', () => {
    expect(groupPrompt(input)).toContain('unsure:true')
  })
  it('새 카드·기존 작업·할 일·목표가 실린다', () => {
    const p = groupPrompt(input)
    for (const s of ['c1', '결과 화면 만들기', 't-aaaaaa', '투표 화면', '투표 만들기', '해커톤 투표까지 마치기', '현재 목표: 투표']) expect(p).toContain(s)
  })
  it('fixes 가 없으면 예 절을 빼고, 상태 글은 마스킹한다', () => {
    const p = groupPrompt({ ...input, fixes: [], stateNotes: '연락 010-1234-5678' })
    expect(p).not.toContain('Dave가 고친 예')
    expect(p).toContain('연락 [가림]')
    expect(p).not.toContain('010-1234-5678')
  })
})
