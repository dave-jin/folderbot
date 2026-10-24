import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'

/**
 * BQ-8 · 상대 깨우기 웹훅 (2026-10-09 Dave 결정: 키는 키체인이 아니라 `~/.config/secrets/folderbot-bridge-<상대>.env` · 0600).
 * 키체인을 안 쓰는 이유: 이 앱은 ad-hoc 서명이라 판이 바뀔 때마다 서명이 달라지고, 앱이 만든 키체인 항목은 업데이트 뒤
 * «접근 허용?» 창을 다시 띄운다 — 새벽에 아무도 못 눌러 깨우기가 조용히 실패한다(검토 §2-⑩).
 *
 * 파일 꼴(KEY=VALUE · `#` 주석):
 *   URL=https://…            # 필수
 *   TOKEN=…                  # 선택 — 있으면 Authorization: Bearer <TOKEN>
 *   HEADER=X-Api-Key         # 선택 — TOKEN 을 이 헤더 이름으로 보낸다
 * 🔴 본문은 보내지 않는다 — `{ id, kind, path, urgent, needs_human }` 만. 상대는 우편함에서 편지를 읽는다.
 * ⛔ 파일 권한이 0600 보다 넓으면 쓰지 않는다(다른 사용자가 읽을 수 있는 키).
 */
export interface WakeEnv { url: string; token?: string; header?: string }

export function expandHome(p: string): string { return p.startsWith('~/') ? `${homedir()}/${p.slice(2)}` : p }

export function readWakeEnv(path: string): WakeEnv {
  const f = expandHome(path)
  if (!existsSync(f)) throw new Error(`깨우기 키 파일이 없어요: ${path}`)
  if ((statSync(f).mode & 0o077) !== 0) throw new Error(`깨우기 키 파일 권한이 넓어요(0600 이어야 해요): ${path}`)
  const kv: Record<string, string> = {}
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line); if (!m || line.trim().startsWith('#')) continue
    kv[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  if (!kv.URL || !/^https?:\/\//.test(kv.URL)) throw new Error(`깨우기 키 파일에 URL 이 없어요: ${path}`)
  return { url: kv.URL, ...(kv.TOKEN ? { token: kv.TOKEN } : {}), ...(kv.HEADER ? { header: kv.HEADER } : {}) }
}

/** BQ-11 · 들어오는 웹훅 토큰 파일(`TOKEN=…` · 0600) — 깨우기 파일과 같은 규칙 */
export function readTokenEnv(path: string): string {
  const f = expandHome(path)
  if (!existsSync(f)) throw new Error(`토큰 파일이 없어요: ${path}`)
  if ((statSync(f).mode & 0o077) !== 0) throw new Error(`토큰 파일 권한이 넓어요(0600 이어야 해요): ${path}`)
  const m = /^\s*TOKEN\s*=\s*(['"]?)(.+?)\1\s*$/m.exec(readFileSync(f, 'utf8'))
  if (!m || m[2].length < 16) throw new Error(`토큰 파일에 16자 넘는 TOKEN 이 없어요: ${path}`)
  return m[2]
}

/** POST 한 번 — 10초. 실패해도 던지지 않고 결과를 돌려준다(편지는 이미 우편함에 있다) */
export async function wakePeer(env: WakeEnv, payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status?: number; error?: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (env.token) { if (env.header) headers[env.header] = env.token; else headers.authorization = `Bearer ${env.token}` }
  try {
    const r = await fetchImpl(env.url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
    return { ok: r.ok, status: r.status }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

/**
 * 🔴 DA · 메일로 깨우기 (2026-10-24 Dave «긴급 메일은 Folder Bot 이 자동으로»).
 * 할일이(Grok Bot)는 «긴급 메일 수신: dave-cos@mail.grokbot.com 에 이메일이 도착할 때» 자동화로 깬다(Dave 스크린샷_1134).
 * 종전에는 오케스트레이터가 급한 편지를 쓴 뒤 Superhuman 으로 손수 보냈다 — 빠뜨리거나 두 번 보낼 수 있었다. 이제 급한 편지 한 통에 메일 한 통을 호스트가 보낸다.
 *  - 받는 사람은 설정(`wake.mail`)에 박힌 한 주소뿐이다. 보내는 길은 `gog gmail send -a <from>`(키는 gog 가 들고 있다 · 인자에 비밀 없음).
 *  - 상대마다 10분에 한 통까지(`MAIL_GAP_MS`) — 급한 편지가 몰려도 메일함을 채우지 않는다. 막힌 것은 결과에 «skip» 으로 남는다.
 *  - 본문은 제목·편지 id·경로·답하는 법만(`core/bridges.wakeMail`). 편지 내용은 싣지 않는다 — 상대는 우편함에서 읽는다.
 * 검사는 `FOLDERBOT_GOG_BIN` 으로 스텁을 꽂는다(진짜 메일을 보내지 않는다).
 */
export const MAIL_GAP_MS = 10 * 60_000
const lastMail = new Map<string, number>()
export function resetMailWakeForTest(): void { lastMail.clear() }
export function gogBin(): string { return process.env.FOLDERBOT_GOG_BIN || '/opt/homebrew/bin/gog' }
export async function mailWake(peerId: string, to: string, from: string, mail: { subject: string; body: string }, o: { now?: number; bin?: string; run?: (bin: string, args: string[]) => Promise<void> } = {}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const now = o.now ?? Date.now()
  const prev = lastMail.get(peerId)
  if (prev !== undefined && now - prev < MAIL_GAP_MS) return { ok: false, skipped: true, error: `${Math.ceil((MAIL_GAP_MS - (now - prev)) / 60_000)}분 안에 이미 한 통 보냈어요` }
  lastMail.set(peerId, now)
  const args = ['gmail', 'send', '-a', from, '--to', to, '--subject', mail.subject, '--body', mail.body, '--no-input']
  const run = o.run ?? ((bin: string, a: string[]) => new Promise<void>((res, rej) => { execFile(bin, a, { timeout: 30_000 }, (e, _out, err) => (e ? rej(new Error(String(err || e.message).trim().split('\n').pop())) : res())) }))
  try { await run(o.bin ?? gogBin(), args); return { ok: true } } catch (e) { lastMail.delete(peerId); return { ok: false, error: (e as Error).message } }
}
