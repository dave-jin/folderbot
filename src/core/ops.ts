import { parse as parseYaml } from 'yaml'
import { parseDuration } from './bridges'

/**
 * BZ · 호스트 운영 감시 설정 — 볼트 `.claude/ops.yml` (2026-10-09 Dave 결정).
 *
 * 볼트 감시기(`ops-watch`)를 15분마다 돌리려 했는데 ① launchd 프로세스는 TCC 때문에 Dropbox 볼트를 못 읽었고
 * (10/9 실측 Operation not permitted) ② 분리 데몬은 세션 권한 정책이 막았다. 그래서 볼트에 이미 닿는 **Folder Bot 호스트가**
 * 정해진 주기마다 명령 하나를 LLM 없이 실행한다. 호스트는 «명령 실행기» 일 뿐이고, 무엇을 검사할지는 명령이 정한다.
 *
 * ```yaml
 * host: mac-mini                 # 이 이름의 호스트에서만 돈다(없으면 어디서나)
 * watch:
 *   command: /Users/dave/.local/bin/ops-watch once
 *   every: 15m                   # 기본 15m
 *   timeout: 60s                 # 기본 60s — 넘으면 끊고 실패로 적는다
 * ```
 */
export interface OpsConfig { host?: string; watch?: { command: string; everyMs: number; timeoutMs: number }; errors: string[] }

export const OPS_DEFAULT_EVERY_MS = 15 * 60_000
export const OPS_DEFAULT_TIMEOUT_MS = 60_000
/** 연속 이만큼 실패하면 오케스트레이터에게 알린다 */
export const OPS_ALERT_AFTER = 3

export function parseOps(text: string): OpsConfig {
  let y: unknown
  try { y = parseYaml(text) } catch (e) { return { errors: [`ops.yml 을 못 읽었어요 — ${(e as Error).message}`] } }
  const doc = (y && typeof y === 'object' ? y : {}) as Record<string, unknown>
  const errors: string[] = []
  const out: OpsConfig = { errors, ...(doc.host ? { host: String(doc.host).trim() } : {}) }
  const w = doc.watch
  if (w === undefined || w === null) return out
  if (typeof w !== 'object') { errors.push('watch 는 { command, every, timeout } 이에요'); return out }
  const r = w as Record<string, unknown>
  const command = String(r.command ?? '').trim()
  if (!command) { errors.push('watch.command 가 없어요'); return out }
  const every = r.every === undefined ? OPS_DEFAULT_EVERY_MS : parseDuration(r.every)
  const timeout = r.timeout === undefined ? OPS_DEFAULT_TIMEOUT_MS : parseDuration(r.timeout)
  if (every === null) errors.push('watch.every 를 못 읽었어요(예: 15m)')
  if (timeout === null) errors.push('watch.timeout 을 못 읽었어요(예: 60s)')
  if (r.enabled === false) return out
  out.watch = { command, everyMs: every ?? OPS_DEFAULT_EVERY_MS, timeoutMs: Math.min(timeout ?? OPS_DEFAULT_TIMEOUT_MS, every ?? OPS_DEFAULT_EVERY_MS) }
  return out
}

/** stderr 끝 몇 줄 — 실행 기록에 싣는다(길면 자른다) */
export function tailLines(s: string, n = 5, max = 600): string {
  const lines = s.replace(/\s+$/, '').split(/\r?\n/).slice(-n).join('\n')
  return lines.length > max ? lines.slice(-max) : lines
}
