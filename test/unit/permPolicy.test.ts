import { describe, it, expect } from 'vitest'
import { autoAllows, fallbackRules, rulesLabel } from '../../src/core/permPolicy'

/**
 * 권한 정책 (2026-09-18 Dave: «중간에 권한을 바꿨는데 그 이후에도 계속 실행하기 전에 물어보네 …
 * 처음에 디폴트가 오토였는데도 허용해줘야 되는 상황이 너무 많아»)
 *  - 모드는 스폰 인자라 살아 있는 워커에는 못 넣는다 → 그 턴은 호스트가 모드 대신 답한다(autoAllows)
 *  - CLI 가 «항상 허용» 규칙 제안을 안 주면(복합 Bash) 호스트가 만든다(fallbackRules)
 */
describe('autoAllows — 호스트가 모드를 대신 집행한다', () => {
  it('항상 허용이면 질문(AskUserQuestion) 빼고 전부', () => {
    expect(autoAllows('bypassPermissions', 'Bash')).toBe(true)
    expect(autoAllows('bypassPermissions', 'Write')).toBe(true)
    expect(autoAllows('bypassPermissions', 'mcp__x__y')).toBe(true)
    expect(autoAllows('bypassPermissions', 'AskUserQuestion')).toBe(false)
  })
  it('편집 자동 수락이면 편집 도구만', () => {
    for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) expect(autoAllows('acceptEdits', t)).toBe(true)
    expect(autoAllows('acceptEdits', 'Bash')).toBe(false)
    expect(autoAllows('acceptEdits', 'WebFetch')).toBe(false)
  })
  it('자동·계획·미정이면 아무것도 대신 답하지 않는다', () => {
    expect(autoAllows('default', 'Bash')).toBe(false)
    expect(autoAllows('plan', 'Edit')).toBe(false)
    expect(autoAllows(undefined, 'Write')).toBe(false)
  })
})

describe('fallbackRules — CLI 제안이 비면 호스트가 세션 규칙을 만든다', () => {
  const rules = (r: ReturnType<typeof fallbackRules>) => r.flatMap((u) => u.rules.map((x) => x.ruleContent ?? x.toolName))
  it('복합 Bash 는 조각마다 첫 낱말 접두어 규칙 — cd · npm · tee', () => {
    const r = fallbackRules('Bash', { command: 'cd /tmp/x && npm run qa 2>&1 | tee log.txt; git status || true' })
    expect(rules(r)).toEqual(['cd:*', 'npm:*', 'tee:*', 'git:*', 'true:*'])
    expect(r[0]).toMatchObject({ type: 'addRules', behavior: 'allow', destination: 'session' })
    expect(r[0].rules[0].toolName).toBe('Bash')
  })
  it('환경변수 대입은 명령이 아니다 · 같은 낱말은 한 번만', () => {
    expect(rules(fallbackRules('Bash', { command: 'FOO=1 npm test && npm run build' }))).toEqual(['npm:*'])
  })
  it('첫 낱말을 못 믿으면(따옴표·치환) 도구 전체', () => {
    expect(rules(fallbackRules('Bash', { command: '"$(which node)" x.js' }))).toEqual(['Bash'])
    expect(rules(fallbackRules('Bash', {}))).toEqual(['Bash'])
  })
  it('Bash 아닌 도구는 도구 전체 · 질문은 규칙이 없다', () => {
    expect(rules(fallbackRules('Edit', { file_path: 'a.md' }))).toEqual(['Edit'])
    expect(rules(fallbackRules('mcp__folderbot__todo', {}))).toEqual(['mcp__folderbot__todo'])
    expect(fallbackRules('AskUserQuestion', {})).toEqual([])
  })
})

describe('rulesLabel — 무엇을 허용하는지 사람 말로', () => {
  it('Bash(cd:*) · Bash(npm:*) 꼴', () => {
    expect(rulesLabel(fallbackRules('Bash', { command: 'cd x && npm i' }))).toBe('Bash(cd:*) · Bash(npm:*)')
    expect(rulesLabel(fallbackRules('Write', {}))).toBe('Write')
  })
  it('CLI 가 준 제안(모양이 다를 수 있다)도 읽는다 · 못 읽으면 빈 문자열', () => {
    expect(rulesLabel([{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm run qa:*' }] }])).toBe('Bash(npm run qa:*)')
    expect(rulesLabel([{ foo: 1 }])).toBe('')
  })
})
