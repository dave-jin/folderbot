import { describe, it, expect } from 'vitest'
import { parseRules, rulesSection, PARA_PRESET, globMatch, globParents, roleOf, applyNaming } from '../../src/core/rules'
import { parseTodo, addLine, toggleLine, formatLine } from '../../src/core/todo'
import { transition, shouldNotify } from '../../src/core/stateMachine'
import { authVerdict } from '../../src/core/authVerdict'
import { toolSummary, touchedPath } from '../../src/core/chat'

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
