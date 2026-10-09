import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingHttpHeaders } from 'node:http'
import { join } from 'node:path'

/**
 * 🔴 **BT · 로컬 MCP 인증** (2026-10-09 · 연결 설계 검토 §2-⑭).
 *
 * 종전 `/mcp/<봇>` 은 «loopback 인가» 만 봤다. 봇 id 는 경로, 세션 id 는 쿼리라서 **아무 sid 로 `/mcp/orch` 를 부르면
 * 오케스트레이터 도구(폴더 이동·봇 은퇴·bot_send)를 다 쓸 수 있었고**, content-type 도 안 봐서 **이 맥의 브라우저에
 * 뜬 아무 웹 페이지가 text/plain POST 로 부를 수도 있었다**(CSRF — 응답은 못 읽어도 일은 벌어진다).
 *
 * 그래서 세 겹으로 막는다.
 *  ① `Origin` 헤더가 붙은 요청은 거절 — 브라우저는 붙이고, CLI 는 안 붙인다
 *  ② `content-type: application/json` 만 — 브라우저가 사전 확인(preflight) 없이 보낼 수 없는 형식
 *  ③ 세션 토큰 `HMAC(호스트 비밀, botId \n sid)` — 저장할 것이 없고, 잠든 세션을 다시 띄워도·호스트를 다시 켜도 같다
 *
 * ⚠ 막는 것은 **브라우저 · 다른 사용자 · 실수**다. 같은 사용자의 프로세스(폴더 봇의 Bash 포함)는 같은 파일을 읽을 수 있다 —
 *    같은 uid 안의 격리는 이 층에서 못 한다. 그래도 토큰을 argv 대신 0600 파일로 넘겨 `ps` 로는 안 보이게 한다
 *    (macOS `ps` 는 다른 사용자의 argv 도 보여 준다).
 */
export class McpAuth {
  private key: Buffer | null = null
  constructor(private dir: string) {}

  /** 호스트 비밀 — `<dataDir>/mcp.key`(0600). 없으면 만든다 */
  private secret(): Buffer {
    if (this.key) return this.key
    const f = join(this.dir, 'mcp.key')
    if (existsSync(f)) this.key = Buffer.from(readFileSync(f, 'utf8').trim(), 'base64url')
    if (!this.key || this.key.length < 32) {
      mkdirSync(this.dir, { recursive: true })
      this.key = randomBytes(32)
      writeFileSync(f, this.key.toString('base64url'), { mode: 0o600 })
      chmodSync(f, 0o600)
    }
    return this.key
  }
  token(botId: string, sid: string): string { return createHmac('sha256', this.secret()).update(`${botId}\n${sid}`).digest('base64url') }
  check(botId: string, sid: string, presented: string): boolean {
    const a = Buffer.from(this.token(botId, sid)), b = Buffer.from(presented)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  /** 워커에 넘길 `--mcp-config` 파일 — 세션마다 하나, 0600. 경로를 돌려준다 */
  configFile(botId: string, sid: string, port: number): string {
    const dir = join(this.dir, 'mcp'); mkdirSync(dir, { recursive: true, mode: 0o700 })
    const f = join(dir, `${sid.replace(/[^\w-]/g, '_') || 'none'}.json`)
    const cfg = { mcpServers: { folderbot: { type: 'http', url: `http://127.0.0.1:${port}/mcp/${encodeURIComponent(botId)}?sid=${encodeURIComponent(sid)}`, headers: { Authorization: `Bearer ${this.token(botId, sid)}` } } } }
    writeFileSync(f, JSON.stringify(cfg), { mode: 0o600 }); chmodSync(f, 0o600)
    return f
  }
}

/** ①② — 문 앞에서 거절할 이유(상태 코드와 말), 통과면 null. 토큰(③)은 부른 쪽이 `McpAuth.check` 로 본다 */
export function mcpGate(h: IncomingHttpHeaders): { code: number; error: string } | null {
  if (h.origin !== undefined) return { code: 403, error: 'browser origin not allowed' }
  const ct = String(h['content-type'] ?? '').toLowerCase()
  if (!ct.startsWith('application/json')) return { code: 415, error: 'content-type must be application/json' }
  return null
}
/** `Authorization: Bearer <토큰>` 에서 토큰만 */
export function bearer(h: IncomingHttpHeaders): string { const a = String(h.authorization ?? ''); return a.startsWith('Bearer ') ? a.slice(7) : '' }
