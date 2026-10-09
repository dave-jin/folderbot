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

/** POST 한 번 — 10초. 실패해도 던지지 않고 결과를 돌려준다(편지는 이미 우편함에 있다) */
export async function wakePeer(env: WakeEnv, payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status?: number; error?: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (env.token) { if (env.header) headers[env.header] = env.token; else headers.authorization = `Bearer ${env.token}` }
  try {
    const r = await fetchImpl(env.url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
    return { ok: r.ok, status: r.status }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}
