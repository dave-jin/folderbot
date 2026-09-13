import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_PORT } from '../core/types'

export interface HostConfig {
  root: string | null
  port: number
  /** 페어링된 기기 토큰 */
  devices: { id: string; name: string; token: string; createdAt: number; lastSeen: number }[]
  vapid?: { publicKey: string; privateKey: string }
  pushSubs?: { endpoint: string; keys: { p256dh: string; auth: string }; device: string }[]
  quiet?: { from: string; to: string }
  botLimit?: number
  claudeBin?: string
  /** claude setup-token 으로 만든 1년짜리 토큰 — 키체인을 못 읽는 문맥(헤드리스)의 대안 */
  claudeOauthToken?: string
  /** 새 세션의 기본 모델·생각 레벨 — 바꾸면 다음 세션부터 */
  defaultModel?: string
  defaultEffort?: string
  /**
   * Codex 쪽 기본값 — 🔴 **Claude 것과 섞으면 안 된다.** 이름 체계가 달라서 Claude 모델 이름을
   * Codex 에 넘기면 그 자리에서 죽는다(core/agents.ts 의 `fitsProvider`).
   */
  defaultCodexModel?: string
  defaultCodexEffort?: string
  /** Codex 샌드박스 — 우리가 승인 화면을 못 띄우므로 이 값이 곧 권한 정책이다 */
  codexSandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  /** `codex login` 을 못 쓰는 문맥(헤드리스)의 대안 — 워커 환경에 OPENAI_API_KEY 로 들어간다 */
  openaiApiKey?: string
  /** 메인(호스트) 이름 — 비면 컴퓨터 이름 */
  hostName?: string
}

export function dataDir(): string {
  if (process.env.FOLDERBOT_DATA) return process.env.FOLDERBOT_DATA
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'folderbot')
  return join(homedir(), '.folderbot')
}

export function ensureDir(p: string): string {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
  return p
}

const CONFIG = () => join(ensureDir(dataDir()), 'config.json')

export function loadConfig(): HostConfig {
  try {
    const j = JSON.parse(readFileSync(CONFIG(), 'utf8')) as Partial<HostConfig>
    return { root: j.root ?? null, port: j.port ?? DEFAULT_PORT, devices: j.devices ?? [], vapid: j.vapid, pushSubs: j.pushSubs ?? [], quiet: j.quiet, botLimit: j.botLimit ?? 8, claudeBin: j.claudeBin, claudeOauthToken: j.claudeOauthToken, defaultModel: j.defaultModel ?? 'claude-fable-5-1', defaultEffort: j.defaultEffort ?? 'high', defaultCodexModel: j.defaultCodexModel, defaultCodexEffort: j.defaultCodexEffort, codexSandbox: j.codexSandbox, openaiApiKey: j.openaiApiKey, hostName: j.hostName }
  } catch {
    return { root: null, port: DEFAULT_PORT, devices: [], pushSubs: [], botLimit: 8, defaultModel: 'claude-fable-5-1', defaultEffort: 'high' }
  }
}

/** tmp+rename 원자 쓰기 — 같은 폴더 안에서 (Dropbox·크로스볼륨 안전) */
export function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

export function saveConfig(c: HostConfig): void {
  atomicWrite(CONFIG(), JSON.stringify(c, null, 2))
}

export function absRoot(c: HostConfig): string {
  if (!c.root) throw new Error('root not set — run: folderbot init <folder>')
  return resolve(c.root)
}
