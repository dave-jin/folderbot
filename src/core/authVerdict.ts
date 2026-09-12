import type { AuthState } from './types'

/**
 * `claude auth status --json` 의 답을 3갈래로 가른다.
 * ⛔ loggedIn:false 를 «로그아웃» 으로 바로 읽지 않는다 — 자격증명 파일의 만료가 미래면
 *    «이 문맥에선 못 읽음(unreadable)» 이다 (Mac mini 헤드리스 실측).
 */
export function authVerdict(input: {
  asked: boolean
  loggedIn: boolean
  credentialsExpiresAt: number | null
  now?: number
}): AuthState['verdict'] {
  if (!input.asked) return 'unknown'
  if (input.loggedIn) return 'loggedin'
  const now = input.now ?? Date.now()
  if (input.credentialsExpiresAt && input.credentialsExpiresAt > now) return 'unreadable'
  return 'loggedout'
}
