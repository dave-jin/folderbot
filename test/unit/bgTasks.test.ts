import { describe, expect, it } from 'vitest'
import { LineCutter, TASK_HISTORY, TextTail, agentIdIn, applyTaskLine, assistantTextsOf, canStopTask, capTasks, closeRunningTasks, groupTasks, resultPreview, startAgentTask, taskKindOf, taskStatusOf, taskTook, upsertTask, validTaskId, type BgTask } from '../../src/core/bgTasks'

const NOW = 1_700_000_000_000
const agent = (id: string, o: Partial<BgTask> = {}): BgTask => ({ id, toolUseId: id, kind: 'agent', name: `일 ${id}`, bg: false, status: 'run', startedAt: NOW, tools: 0, ...o })

describe('EA · 맡긴 일 — 작업 id', () => {
  it('🔴 경로가 될 수 있는 글자는 id 가 아니다 — 이 id 로 파일 이름을 만든다', () => {
    for (const bad of ['../../x', '..', 'a/b', 'a\\b', 'a.b', 'a b', '%2e%2e', '', 'ab', '-abc', '_abc', 'x'.repeat(81), null, undefined, 12345, { id: 'abc' }]) expect(validTaskId(bad)).toBe(false)
    for (const ok of ['add0ad5ca7b332aeb', 'toolu_01AbCdEf', 'stub-bg-1a2b3c', 'task-9f8e7d', 'b1ocw0xbe', 'abc']) expect(validTaskId(ok)).toBe(true)
  })
  it('도구 결과 꼬리의 agentId 를 읽는다 — 이상한 값은 안 받는다', () => {
    expect(agentIdIn('결과입니다\nagentId: add0ad5ca7b332aeb (이어서 쓰려면 …)')).toBe('add0ad5ca7b332aeb')
    expect(agentIdIn('Async agent launched successfully.\nagentId: task-1a2b3c')).toBe('task-1a2b3c')
    expect(agentIdIn('agentId: ../../etc')).toBeUndefined()
    expect(agentIdIn('본문 속 agentId: 는 줄 머리가 아니면 안 읽는다 agentId: abcdef')).toBeUndefined()
    expect(agentIdIn(undefined)).toBeUndefined()
  })
})

describe('EA · 맡긴 일 — 목록', () => {
  it('종류와 상태 말을 우리 말로 옮긴다', () => {
    expect(taskKindOf('local_agent')).toBe('agent'); expect(taskKindOf('local_bash')).toBe('shell'); expect(taskKindOf('뭔가새것')).toBe('other'); expect(taskKindOf(undefined)).toBe('other')
    expect(taskStatusOf('completed', true)).toBe('done'); expect(taskStatusOf('stopped', true)).toBe('stopped'); expect(taskStatusOf('killed', false)).toBe('stopped')
    expect(taskStatusOf('failed', false)).toBe('error'); expect(taskStatusOf('running', false)).toBeNull(); expect(taskStatusOf(undefined, false)).toBeNull()
    expect(taskStatusOf('모르는말', true)).toBe('error')   // 끝 알림인데 모르는 말 — 실패 쪽
  })

  it('봇이 에이전트를 부르면 시작 신호 전에 줄이 선다 · 같은 호출은 두 번 안 선다', () => {
    const a = startAgentTask([], { toolUseId: 'toolu_1aa', name: '하위 조사', subagentType: 'Explore', cliSid: 'sid-1' }, NOW)
    expect(a.task).toMatchObject({ id: 'toolu_1aa', kind: 'agent', name: '하위 조사', subagentType: 'Explore', status: 'run', bg: false, cliSid: 'sid-1' })
    expect(a.task?.taskId).toBeUndefined()
    const again = startAgentTask(a.tasks, { toolUseId: 'toolu_1aa', name: '다른 이름' }, NOW + 5)
    expect(again.task).toBeNull(); expect(again.tasks).toBe(a.tasks)
    // 끝난 줄에 같은 id 가 또 오면(재시도) 새로 시작한 것이다 — 줄은 하나로 남는다
    const redo = startAgentTask([{ ...a.tasks[0], status: 'done', endedAt: NOW + 1 }], { toolUseId: 'toolu_1aa', name: '다시' }, NOW + 9)
    expect(redo.tasks).toHaveLength(1); expect(redo.task).toMatchObject({ status: 'run', startedAt: NOW + 9, name: '다시' })
    expect(startAgentTask([], { toolUseId: '../../x', name: 'x' }, NOW).task).toBeNull()
  })

  it('시작 신호(task_started)가 도구 호출 줄에 task_id 를 붙인다 — 멈출 수 있게 된다', () => {
    const a = startAgentTask([], { toolUseId: 'toolu_1aa', name: '하위 조사', bg: true }, NOW)
    expect(canStopTask(a.tasks[0])).toBe(false)
    const b = applyTaskLine(a.tasks, { subtype: 'task_started', task_id: 'task-777', tool_use_id: 'toolu_1aa', description: '하위 조사', is_backgrounded: true, task_type: 'local_agent', subagent_type: 'general-purpose' }, NOW + 10, 'sid-9')
    expect(b.tasks).toHaveLength(1)
    expect(b.changed[0]).toMatchObject({ id: 'toolu_1aa', taskId: 'task-777', bg: true, subagentType: 'general-purpose', cliSid: 'sid-9', startedAt: NOW })
    expect(canStopTask(b.tasks[0])).toBe(true)
  })

  it('줄 없이 온 시작 신호(뒤에서 도는 셸)는 새 줄이 된다', () => {
    const b = applyTaskLine([], { subtype: 'task_started', task_id: 'bash-123', tool_use_id: 'toolu_sh1', description: 'npm run dev', is_backgrounded: true, task_type: 'local_bash' }, NOW)
    expect(b.tasks[0]).toMatchObject({ id: 'toolu_sh1', taskId: 'bash-123', kind: 'shell', name: 'npm run dev', bg: true, status: 'run' })
    expect(applyTaskLine([], { subtype: 'task_started', task_id: '../x', tool_use_id: 'a/b' }, NOW).tasks).toHaveLength(0)   // 이상한 id 는 줄이 안 된다
  })

  it('🔴 멈추면 «멈춤» 이다 — task_updated{killed} → task_notification{stopped}. «실패» 로 덮지 않는다', () => {
    let t = applyTaskLine([agent('toolu_1aa', { taskId: 'task-777', bg: true })], { subtype: 'task_updated', task_id: 'task-777', patch: { status: 'killed' } }, NOW + 500).tasks
    expect(t[0]).toMatchObject({ status: 'stopped', endedAt: NOW + 500 })
    t = applyTaskLine(t, { subtype: 'task_notification', task_id: 'task-777', tool_use_id: 'toolu_1aa', status: 'stopped', summary: '사용자가 멈췄다' }, NOW + 600).tasks
    expect(t[0]).toMatchObject({ status: 'stopped', endedAt: NOW + 500, summary: '사용자가 멈췄다' })
    // 멈춘 뒤 «failed» 알림이 와도 멈춤은 멈춤이다
    const u = applyTaskLine([agent('toolu_2bb', { taskId: 'task-888', status: 'stopped', endedAt: NOW })], { subtype: 'task_notification', task_id: 'task-888', status: 'failed' }, NOW + 9).tasks
    expect(u[0].status).toBe('stopped')
  })

  it('끝 알림이 요약을 싣고 온다 — 2000자까지', () => {
    const t = applyTaskLine([agent('toolu_1aa', { taskId: 'task-777', bg: true })], { subtype: 'task_notification', task_id: 'task-777', status: 'completed', summary: 'ㄱ'.repeat(5000) }, NOW + 900).tasks
    expect(t[0].status).toBe('done'); expect(t[0].summary).toHaveLength(2000); expect(t[0].endedAt).toBe(NOW + 900)
  })

  it('🔴 background_tasks_changed 가 «아직 도는가» 의 정본이다 — 목록에서 빠진 백그라운드 줄은 닫히고, 모르는 것은 새로 선다', () => {
    const have = [agent('toolu_1aa', { taskId: 'task-1aa', bg: true }), agent('toolu_2bb', { taskId: 'task-2bb', bg: true }), agent('toolu_3cc', { taskId: 'task-3cc', bg: false }), agent('toolu_4dd', { bg: true })]
    const r = applyTaskLine(have, { subtype: 'background_tasks_changed', tasks: [{ task_id: 'task-2bb', task_type: 'local_agent', description: '둘' }, { task_id: 'bash-9zz', task_type: 'local_bash', description: 'tail -f log' }] }, NOW + 1000)
    const by = Object.fromEntries(r.tasks.map((t) => [t.id, t]))
    expect(by['toolu_1aa']).toMatchObject({ status: 'done', endedAt: NOW + 1000 })   // 목록에 없다 → 닫힌다
    expect(by['toolu_2bb'].status).toBe('run')                                       // 목록에 있다 → 그대로
    expect(by['toolu_3cc'].status).toBe('run')                                       // 앞에서 도는 것은 그 목록에 원래 없다 → 안 닫는다
    expect(by['toolu_4dd'].status).toBe('run')                                       // task_id 를 아직 모르는 줄 → 안 닫는다
    expect(by['bash-9zz']).toMatchObject({ kind: 'shell', name: 'tail -f log', bg: true, status: 'run', taskId: 'bash-9zz' })
    expect(r.changed.map((t) => t.id).sort()).toEqual(['bash-9zz', 'toolu_1aa'])
    // 바뀐 것이 없으면 같은 배열을 돌려준다(헛 프레임을 안 쏜다)
    const same = applyTaskLine(r.tasks, { subtype: 'background_tasks_changed', tasks: [{ task_id: 'task-2bb' }, { task_id: 'bash-9zz' }] }, NOW + 2000)
    expect(same.changed).toHaveLength(0); expect(same.tasks).toBe(r.tasks)
  })

  it('닫아 둔 줄에 끝 알림이 늦게 오면 알림이 이긴다(멈춘 것인지 끝난 것인지는 알림이 안다)', () => {
    const closed = applyTaskLine([agent('toolu_1aa', { taskId: 'task-1aa', bg: true })], { subtype: 'background_tasks_changed', tasks: [] }, NOW + 100).tasks
    expect(closed[0].status).toBe('done')
    const late = applyTaskLine(closed, { subtype: 'task_notification', task_id: 'task-1aa', status: 'stopped', summary: '멈춤' }, NOW + 200).tasks
    expect(late[0]).toMatchObject({ status: 'stopped', endedAt: NOW + 100, summary: '멈춤' })
  })

  it('돌던 것을 뒤로 보내면(task_updated is_backgrounded) 백그라운드가 된다', () => {
    const t = applyTaskLine([agent('toolu_1aa', { taskId: 'task-1aa' })], { subtype: 'task_updated', task_id: 'task-1aa', patch: { is_backgrounded: true } }, NOW).tasks
    expect(t[0]).toMatchObject({ bg: true, status: 'run' })
  })

  it('🔴 워커가 없으면 그 작업도 없다 — 호스트를 다시 켜도 «도는 중» 이 남지 않는다', () => {
    const r = closeRunningTasks([agent('toolu_1aa'), agent('toolu_2bb', { status: 'done', endedAt: NOW - 5, summary: '끝' })], NOW + 50, '호스트가 다시 떠서 중단됨')
    expect(r.tasks[0]).toMatchObject({ status: 'stopped', endedAt: NOW + 50, summary: '호스트가 다시 떠서 중단됨' })
    expect(r.tasks[1]).toMatchObject({ status: 'done', summary: '끝' })
    expect(r.changed).toHaveLength(1)
    expect(closeRunningTasks(r.tasks, NOW + 99, 'x').changed).toHaveLength(0)
  })

  it('끝난 것은 30개까지 — 도는 것은 다 남고, 오래전에 끝난 것부터 빠진다', () => {
    const many = Array.from({ length: 40 }, (_, i) => agent(`fin_${String(i).padStart(2, '0')}`, { status: 'done', endedAt: NOW + i }))
    const run = Array.from({ length: 5 }, (_, i) => agent(`run_${i}`))
    const out = capTasks([...many, ...run])
    expect(out.filter((t) => t.status === 'run')).toHaveLength(5)
    expect(out.filter((t) => t.status !== 'run')).toHaveLength(TASK_HISTORY)
    expect(out.some((t) => t.id === 'fin_09')).toBe(false); expect(out.some((t) => t.id === 'fin_10')).toBe(true)
    expect(upsertTask(out, agent('fin_new', { status: 'done', endedAt: NOW + 999 })).some((t) => t.id === 'fin_10')).toBe(false)
  })

  it('화면의 두 묶음 — 도는 중은 시작한 순서, 끝남은 방금 끝난 것이 위', () => {
    const g = groupTasks([agent('b', { startedAt: NOW + 2 }), agent('a', { startedAt: NOW + 1 }), agent('x', { status: 'done', endedAt: NOW + 5 }), agent('y', { status: 'stopped', endedAt: NOW + 9 })])
    expect(g.running.map((t) => t.id)).toEqual(['a', 'b']); expect(g.finished.map((t) => t.id)).toEqual(['y', 'x'])
  })

  it('걸린 시간을 사람 말로', () => {
    expect(taskTook({ startedAt: NOW, endedAt: NOW + 400 }, NOW)).toBe('1초 미만')
    expect(taskTook({ startedAt: NOW, endedAt: NOW + 65_000 }, NOW)).toBe('1분 5초')
    expect(taskTook({ startedAt: NOW }, NOW + 3_700_000)).toBe('1시간 1분')
  })
})

describe('EA · 서브에이전트가 쓴 글 — 기록 파일 읽기', () => {
  const line = (o: unknown) => JSON.stringify(o)
  it('assistant 줄의 text 블록만 모은다 — 도구 호출·사람 줄·깨진 줄은 아니다', () => {
    expect(assistantTextsOf(line({ type: 'assistant', message: { content: [{ type: 'text', text: '첫 글' }, { type: 'tool_use', name: 'Read', input: {} }, { type: 'text', text: '  ' }, { type: 'text', text: '둘째 글' }] } }))).toEqual(['첫 글', '둘째 글'])
    expect(assistantTextsOf(line({ type: 'user', message: { content: [{ type: 'text', text: '사람 말 "assistant" 흉내' }] } }))).toEqual([])
    expect(assistantTextsOf(line({ type: 'assistant', message: { content: '글자 하나로 온 본문입니다' } }))).toEqual(['글자 하나로 온 본문입니다'])
    expect(assistantTextsOf('{"type":"assistant","message":{"content":[{"type":"text","te')).toEqual([])
    expect(assistantTextsOf('')).toEqual([])
  })

  it('🔴 조각으로 들어와도 줄이 맞고, 상한을 넘는 줄은 통째로 버린다(메모리에 안 쥔다)', () => {
    const c = new LineCutter(50)
    const got: string[] = []
    const big = 'x'.repeat(500)
    const src = `짧은 줄 하나\n${big}\n둘째 줄\n`
    for (let i = 0; i < src.length; i += 7) got.push(...c.push(src.slice(i, i + 7)))
    got.push(...c.end())
    expect(got).toEqual(['짧은 줄 하나', '둘째 줄'])
    expect(c.dropped).toBe(1)
    // 줄바꿈 없이 끝난 마지막 줄도 나온다
    const d = new LineCutter(50); expect([...d.push('가\n나'), ...d.end()]).toEqual(['가', '나'])
  })

  it('🔴 끝에서부터 상한까지만 든다 — 개수와 글자 수 둘 다', () => {
    const t = new TextTail(3, 1000)
    for (let i = 0; i < 10; i++) t.push(`글 ${i}`)
    expect(t.result()).toEqual({ texts: ['글 7', '글 8', '글 9'], total: 10, truncated: true })
    const b = new TextTail(100, 30)
    b.push('가'.repeat(20)); b.push('나'.repeat(20))
    expect(b.result().texts).toEqual(['나'.repeat(20)]); expect(b.result().truncated).toBe(true)
    const one = new TextTail(100, 30); one.push('다'.repeat(100))
    expect(one.result().texts[0]).toHaveLength(30); expect(one.result().texts[0].startsWith('…')).toBe(true); expect(one.result().truncated).toBe(true)
    const small = new TextTail(); small.push('하나'); expect(small.result()).toEqual({ texts: ['하나'], total: 1, truncated: false })
  })

  it('카드의 결과 앞머리 — 600자·12줄까지, 넘치면 more', () => {
    expect(resultPreview('짧은 결과')).toEqual({ text: '짧은 결과', more: false })
    const long = resultPreview('가'.repeat(900))
    expect(long.more).toBe(true); expect(long.text).toHaveLength(601)
    const lines = resultPreview(Array.from({ length: 30 }, (_, i) => `줄 ${i}`).join('\n'))
    expect(lines.more).toBe(true); expect(lines.text.split('\n')).toHaveLength(12)
    expect(resultPreview(undefined)).toEqual({ text: '', more: false })
  })
})
