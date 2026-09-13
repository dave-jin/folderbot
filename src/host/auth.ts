import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { authVerdict } from '../core/authVerdict'
import type { AuthState } from '../core/types'
import { claudeBin, cleanClaudeEnv } from './session'

function credentialsExpiresAt(): number | null {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  const f = join(dir, '.credentials.json')
  if (!existsSync(f)) return null
  try {
    const j = JSON.parse(readFileSync(f, 'utf8')) as { claudeAiOauth?: { expiresAt?: number } }
    return j.claudeAiOauth?.expiresAt ?? null
  } catch { return null }
}

export function checkAuth(bin?: string): Promise<AuthState> {
  return new Promise((resolve) => {
    execFile(claudeBin(bin), ['auth', 'status', '--json'], { env: cleanClaudeEnv(), timeout: 15000 }, (err, stdout) => {
      const now = Date.now()
      if (err && !stdout) return resolve({ verdict: 'unknown', checkedAt: now, reason: err.message.slice(0, 200) })
      try {
        const j = JSON.parse(String(stdout).trim().split('\n').pop() ?? '{}') as { loggedIn?: boolean; email?: string; subscriptionType?: string }
        const loggedIn = j.loggedIn === true
        return resolve({ verdict: authVerdict({ asked: true, loggedIn, credentialsExpiresAt: loggedIn ? null : credentialsExpiresAt(), now }), email: j.email, plan: j.subscriptionType, checkedAt: now })
      } catch {
        return resolve({ verdict: 'unknown', checkedAt: now, reason: String(stdout).slice(0, 200) })
      }
    })
  })
}

/**
 * Codex 인증 — **우리가 로그인시키지 않는다.** `codex login` 은 브라우저를 여는 대화형 절차라
 * 헤드리스 호스트에서 우리가 대신 해 줄 수 없다. 그래서 여기서는 **상태만 읽고**, 화면은
 * ① 「터미널에서 `codex login`」 을 안내하거나 ② API 키를 받아 워커 환경에 넣는다(Claude 의 장기 토큰과 같은 구조).
 *
 * ⚠ 판정은 **파일이 있나** 다 — `codex` 에 「상태만 알려 주는」 비대화형 명령이 판마다 다르고,
 *    없으면 프로세스가 대화형으로 멈춰 버려서 호스트가 붙잡힌다. 파일은 조용하고 빠르다.
 */
export function codexAuth(apiKey?: string): { ok: boolean; how: 'login' | 'key' | null; where?: string } {
  if (apiKey) return { ok: true, how: 'key' }
  if (process.env.OPENAI_API_KEY) return { ok: true, how: 'key', where: 'OPENAI_API_KEY' }
  const home = process.env.CODEX_HOME ?? join(homedir(), '.codex')
  for (const f of ['auth.json', 'credentials.json']) {
    const p = join(home, f)
    if (existsSync(p)) return { ok: true, how: 'login', where: p }
  }
  return { ok: false, how: null }
}
