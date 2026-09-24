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
import { pickNewestCli } from '../core/cliUpdate'

const CANDIDATES: Record<ProviderId, string[]> = {
  claude: [join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'],
  codex: [join(homedir(), '.local/bin/codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex', join(homedir(), '.codex/bin/codex')]
}
const ENV_OVERRIDE: Record<ProviderId, string> = { claude: 'FOLDERBOT_CLI_BIN', codex: 'FOLDERBOT_CODEX_BIN' }

/**
 * 🔴 **AL · 여러 벌이 깔려 있으면 «가장 새 것» 을 쓴다** (2026-09-24 Dave 실측).
 *    종전에는 후보를 순서대로 훑어 **먼저 있는 것**을 집었다. Dave 의 맥에는 `~/.local/bin/claude`(2.1.278)와
 *    `/usr/local/bin/claude`(2.1.281)가 함께 있었고, 늘 낡은 쪽이 이겼다. 그 번들엔 `claude-opus-5-5` 가
 *    **아예 없어서** 모델 목록에 Opus 5.5 가 뜰 수 없었다 — «재시작해도 그대로» 의 정체가 이것이다.
 * ⚠ 판을 읽으려면 프로세스를 띄워야 한다. 그래서 **후보가 둘 이상일 때만** 전부 재고, 하나면 그대로 쓴다.
 */
function candidates(id: ProviderId): string[] {
  const ov = process.env[ENV_OVERRIDE[id]]
  if (ov) return existsSync(ov) ? [ov] : []
  const out = CANDIDATES[id].filter((p) => existsSync(p))
  try { const p = execFileSync('which', [id], { encoding: 'utf8' }).trim(); if (p && existsSync(p) && !out.includes(p)) out.push(p) } catch { /* 없으면 없는 대로 */ }
  return out
}
function resolve(id: ProviderId): { bin: string; version: string | null; others: { bin: string; version: string | null }[] } | null {
  const cands = candidates(id)
  if (!cands.length) return null
  if (cands.length === 1) return { bin: cands[0], version: version(cands[0]), others: [] }
  const withVer = cands.map((bin) => ({ bin, version: version(bin) }))
  const best = pickNewestCli(withVer)
  if (!best) return null
  return { bin: best.bin, version: best.version, others: withVer.filter((c) => c.bin !== best.bin) }
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
    const r = resolve(id)
    if (!r) continue                                    // 없으면 줄 자체를 안 만든다
    list.push({ id, name, bin: r.bin, version: r.version, others: r.others })
  }
  cache = { at: now, list }
  return list
}
export function providerBin(id: ProviderId): string | null { return providers().find((p) => p.id === id)?.bin ?? null }
/** AL · 「새로고침」 — 다음 호출이 후보를 다시 훑고 판을 다시 읽게 한다 */
export function forgetProviders(): void { cache = null }
