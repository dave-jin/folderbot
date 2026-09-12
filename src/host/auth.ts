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
