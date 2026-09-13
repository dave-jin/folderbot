import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

/**
 * 에이전트 제공자 — 어떤 CLI 가 이 맥에 깔려 있나.
 * ⛔ **없는 것은 화면에 안 보인다** (2026-09-13 Dave: «Codex가 없으면 아예 안보여야 해»).
 *    그래서 판정은 «이름이 있나» 가 아니라 **실행 파일이 실제로 있나** 다.
 */
export type { Provider, ProviderId } from '../core/agents'
import type { Provider, ProviderId } from '../core/agents'

const CANDIDATES: Record<ProviderId, string[]> = {
  claude: [join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'],
  codex: [join(homedir(), '.local/bin/codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex', join(homedir(), '.codex/bin/codex')]
}
const ENV_OVERRIDE: Record<ProviderId, string> = { claude: 'FOLDERBOT_CLI_BIN', codex: 'FOLDERBOT_CODEX_BIN' }

function which(id: ProviderId): string | null {
  const ov = process.env[ENV_OVERRIDE[id]]
  if (ov) return existsSync(ov) ? ov : null
  for (const p of CANDIDATES[id]) if (existsSync(p)) return p
  try { const p = execFileSync('which', [id], { encoding: 'utf8' }).trim(); return p && existsSync(p) ? p : null } catch { return null }
}
function version(bin: string): string | null {
  try { return execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 4000 }).trim().split('\n')[0] || null } catch { return null }
}

let cache: { at: number; list: Provider[] } | null = null
/** 깔린 것만 돌려준다. 5분 캐시 — `--version` 은 프로세스를 띄운다 */
export function providers(now = Date.now()): Provider[] {
  if (cache && now - cache.at < 300_000) return cache.list
  const list: Provider[] = []
  for (const [id, name] of [['claude', 'Claude Code'], ['codex', 'Codex']] as [ProviderId, string][]) {
    const bin = which(id)
    if (!bin) continue                                  // 없으면 줄 자체를 안 만든다
    list.push({ id, name, bin, version: version(bin) })
  }
  cache = { at: now, list }
  return list
}
export function providerBin(id: ProviderId): string | null { return providers().find((p) => p.id === id)?.bin ?? null }
