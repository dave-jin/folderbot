import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parsePlanUsage, type PlanUsage } from '../core/usage'
import { claudeBin, cleanClaudeEnv } from './session'

/**
 * 실제 요금제 한도 (BD · 2026-09-27 Dave · 스크린샷_1233) — `claude` CLI 에게 `/usage` 와 같은 값을 **묻는다**.
 *
 * · stream-json 제어 요청 `get_usage` 한 번 → `control_response` 한 줄. **모델을 부르지 않는다**(실측 0토큰 · 1초 안팎).
 * · ⛔ OAuth 토큰을 꺼내 `/api/oauth/usage` 를 직접 부르지 않는다 — 앱이 자격 증명을 중개하면 약관 위반이다. CLI 가 묻는다.
 * · 서버 쪽에도 속도 제한이 있다 — 60초보다 자주 묻지 않고, 평소엔 3분마다, 턴이 끝나면 곧바로(60초 문턱 안에서).
 * · 실패하면 **마지막으로 받은 값을 그대로** 쓰고 까닭만 붙인다. 추정치로 바꿔 치우지 않는다.
 * · 이 요청은 SDK 에서 «EXPERIMENTAL» 이다 — 없어지면(`unknown subtype`) `available:false` 가 아니라 `error` 로 남고,
 *   화면은 예산 추정으로 돌아가며 «추정» 이라고 적는다.
 */
const MIN_GAP = 60_000
const STALE = 3 * 60_000
const TIMEOUT = 20_000

let last: PlanUsage | null = null
let lastTry = 0
let inflight: Promise<PlanUsage | null> | null = null

/** CLI 에게 한 번 묻는다 — 격리된 빈 폴더에서, 세션 기록·MCP·사용자 설정 없이 */
export function queryPlan(bin?: string): Promise<PlanUsage | null> {
  return new Promise((resolve) => {
    const cwd = join(tmpdir(), 'folderbot-usage'); try { mkdirSync(cwd, { recursive: true }) } catch { /* */ }
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--no-session-persistence', '--setting-sources', 'project', '--strict-mcp-config']
    let done = false, buf = '', err = ''
    const finish = (v: PlanUsage | null, why?: string) => {
      if (done) return; done = true; clearTimeout(timer)
      try { p.kill() } catch { /* */ }
      if (!v && why) lastError = why
      resolve(v)
    }
    const p = spawn(claudeBin(bin), args, { cwd, env: cleanClaudeEnv() })
    const timer = setTimeout(() => finish(null, '시간 초과'), TIMEOUT)
    p.on('error', (e) => finish(null, e.message))
    p.stderr.on('data', (c: Buffer) => { err += c.toString(); if (err.length > 4000) err = err.slice(-4000) })
    p.stdout.on('data', (c: Buffer) => {
      buf += c.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1)
        let d: { type?: string; response?: { subtype?: string; error?: string; request_id?: string; response?: unknown } }
        try { d = JSON.parse(line) } catch { continue }
        if (d.type !== 'control_response' || d.response?.request_id !== 'fb-usage') continue
        if (d.response.subtype !== 'success') { finish(null, String(d.response.error ?? d.response.subtype ?? '실패')); return }
        const v = parsePlanUsage(d.response.response, Date.now())
        finish(v, v ? undefined : '모르는 응답 모양')
        return
      }
    })
    p.on('close', () => finish(null, err.trim().split('\n').pop() || '응답 없이 끝났다'))
    p.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'fb-usage', request: { subtype: 'get_usage', skip_behaviors: true } }) + '\n')
  })
}
let lastError: string | undefined

/** 지금 가진 값 — 오래됐으면 뒤에서 새로 묻는다(기다리지 않는다). `force` 는 턴이 끝났을 때 */
export function planNow(bin?: string, force = false): PlanUsage | null {
  const now = Date.now()
  const stale = !last || now - last.fetchedAt > STALE
  if ((stale || force) && !inflight && now - lastTry >= MIN_GAP) void refreshPlan(bin)
  return last
}

/** 기다려서 받는다 — 호스트가 켜질 때와 검사가 쓴다 */
export async function refreshPlan(bin?: string): Promise<PlanUsage | null> {
  if (inflight) return inflight
  lastTry = Date.now()
  inflight = queryPlan(bin).then((v) => {
    if (v) { last = v; lastError = undefined } else if (last) last = { ...last, error: lastError }
    inflight = null
    return last
  })
  return inflight
}

/** 검사용 — 모듈 상태를 비운다 */
export function resetPlanForTest(): void { last = null; lastTry = 0; inflight = null; lastError = undefined }
