import { describe, expect, it } from 'vitest'
import { parseStatus } from '../../src/host/auth'

/**
 * 🔴 실사고 (2026-09-13 Dave 진단) — CLI 2.1.270 은 **들여쓴 여러 줄 JSON** 을 뱉는데
 * 우리는 «마지막 줄» 만 잘라서 파싱했다. 마지막 줄은 `}` 하나라 판정이 `unknown` 으로 떨어졌고,
 * 로그인이 멀쩡한데도 «키체인을 못 읽음» 이 되어 장기 토큰이 계속 실렸다.
 */
describe('claude auth status 읽기', () => {
  const real = `{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projects": []
}`

  it('여러 줄 JSON 을 읽는다', () => {
    expect(parseStatus(real)?.loggedIn).toBe(true)
  })

  it('한 줄 JSON 도 그대로 읽는다 (옛 판)', () => {
    expect(parseStatus('{"loggedIn":false}')?.loggedIn).toBe(false)
  })

  // ⚠ CLI 가 앞에 경고 한 줄을 찍는 판이 있다 — 통째로 파싱하면 그때 터진다
  it('앞뒤에 다른 글이 섞여도 읽는다', () => {
    expect(parseStatus(`warning: something\n${real}\n`)?.authMethod).toBe('claude.ai')
    expect(parseStatus(`${real}\nbye`)?.loggedIn).toBe(true)
  })

  it('JSON 이 없으면 null — 억지로 읽지 않는다', () => {
    expect(parseStatus('command not found')).toBeNull()
    expect(parseStatus('')).toBeNull()
    expect(parseStatus('{ 망가진')).toBeNull()
  })

  // ⛔ 정규식으로 loggedIn 만 긁으면 `false` 도 참으로 읽는다
  it('loggedIn:false 를 참으로 읽지 않는다', () => {
    expect(parseStatus('{\n  "loggedIn": false\n}')?.loggedIn).toBe(false)
  })
})
