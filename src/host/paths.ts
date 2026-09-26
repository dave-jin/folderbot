import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, posix, resolve, win32 } from 'node:path'
import { DEFAULT_PORT, type PermissionMode } from '../core/types'

export interface HostConfig {
  root: string | null
  port: number
  /** 페어링된 기기 토큰 */
  devices: { id: string; name: string; token: string; createdAt: number; lastSeen: number }[]
  vapid?: { publicKey: string; privateKey: string }
  pushSubs?: { endpoint: string; keys: { p256dh: string; auth: string }; device: string }[]
  quiet?: { from: string; to: string }
  claudeBin?: string
  /** claude setup-token 으로 만든 1년짜리 토큰 — 키체인을 못 읽는 문맥(헤드리스)의 대안 */
  claudeOauthToken?: string
  /** 유휴 워커를 재우기까지의 분 — 0 이면 안 재운다 (루프 4/10 · 기본 60) */
  idleMinutes?: number
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
  /**
   * Claude 새 채팅의 기본 권한 모드 (2026-09-17 Dave: «claude 의 경우 새채팅 기본 권한 설정도 빠져있음»).
   * 세션마다 입력창에서 바꾸는 값의 **출발점**이다 — 루틴은 루틴의 승인 설정이 이긴다(routines.ts). 비면 `default`.
   */
  defaultPermissionMode?: PermissionMode
  /** `codex login` 을 못 쓰는 문맥(헤드리스)의 대안 — 워커 환경에 OPENAI_API_KEY 로 들어간다 */
  openaiApiKey?: string
  /** 메인(호스트) 이름 — 비면 컴퓨터 이름 */
  hostName?: string
}

export function dataDir(opts: { platform?: NodeJS.Platform; home?: string; appData?: string; override?: string } = {}): string {
  if (opts.override ?? process.env.FOLDERBOT_DATA) return (opts.override ?? process.env.FOLDERBOT_DATA)!
  const os = opts.platform ?? platform(), home = opts.home ?? homedir()
  if (os === 'darwin') return posix.join(home, 'Library', 'Application Support', 'folderbot')
  if (os === 'win32') return win32.join(opts.appData ?? process.env.APPDATA ?? win32.join(home, 'AppData', 'Roaming'), 'folderbot')
  return posix.join(home, '.folderbot')
}

export function ensureDir(p: string): string {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
  return p
}

const CONFIG = () => join(ensureDir(dataDir()), 'config.json')

export function loadConfig(): HostConfig {
  try {
    const j = JSON.parse(readFileSync(CONFIG(), 'utf8')) as Partial<HostConfig>
    return { root: j.root ?? null, port: j.port ?? DEFAULT_PORT, devices: j.devices ?? [], vapid: j.vapid, pushSubs: j.pushSubs ?? [], quiet: j.quiet, claudeBin: j.claudeBin, claudeOauthToken: j.claudeOauthToken, defaultModel: j.defaultModel ?? 'claude-fable-5-1', defaultEffort: j.defaultEffort ?? 'high', defaultCodexModel: j.defaultCodexModel, defaultCodexEffort: j.defaultCodexEffort, codexSandbox: j.codexSandbox, openaiApiKey: j.openaiApiKey, hostName: j.hostName }
  } catch {
    return { root: null, port: DEFAULT_PORT, devices: [], pushSubs: [], defaultModel: 'claude-fable-5-1', defaultEffort: 'high' }
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
