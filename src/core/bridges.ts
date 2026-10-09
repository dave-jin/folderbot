import { parse as parseYaml } from 'yaml'
import { idSlug } from './fbmf'

/**
 * 연결(Bridge) 설정 — 볼트 `.claude/bridges.yml` (연결 R1 · 2026-10-09).
 * 자리를 `.folderbot/` 이 아니라 `.claude/` 로 한 이유: `.folderbot` 은 앱 상태 자리라 폴더 감시가 무시한다 —
 * 사람이 고쳐도 다시 안 읽힌다. 오케스트레이터 루틴(`.claude/routines.yml`) 옆에 두면 같은 감시로 다시 읽힌다.
 *
 * ```yaml
 * runs_copy: "2. Area/개인_비서실/할일이/싱크/운영/runs"   # 선택 — 루틴 실행 기록 사본 자리
 * bridges:
 *   - id: halili                 # ASCII · 편지 id 의 보낸쪽 이름과 같게
 *     name: 할일이
 *     icon: ✅
 *     mailbox: "2. Area/개인_비서실/할일이/싱크"   # 볼트 기준(또는 절대 경로)
 *     deliver_to: { bot: orch, session: "✅ 할일이 채널" }
 *     may_send: [orch]
 *     trust: propose             # read | propose | act
 *     host: mac-mini             # 이 이름의 호스트만 편지를 가져간다(두 맥이 같은 볼트를 열 때 두 번 넣지 않게)
 *     since: 2026-10-09T20:00:00+09:00   # 처음 켤 때 이 시각 뒤의 편지만 넣는다(없으면 이미 있던 편지는 «본 것»)
 * ```
 */
export type Trust = 'read' | 'propose' | 'act'
export const TRUSTS: readonly Trust[] = ['read', 'propose', 'act']

export interface PeerDef {
  id: string
  name: string
  icon: string
  mailbox: string
  deliver: { bot: string; session: string }
  maySend: string[]
  trust: Trust
  host?: string
  since?: number
  enabled: boolean
}
export interface BridgesConfig { peers: PeerDef[]; runsCopy?: string; errors: string[] }

export function parseBridges(text: string): BridgesConfig {
  const errors: string[] = []
  let y: unknown
  try { y = parseYaml(text) } catch (e) { return { peers: [], errors: [`bridges.yml 을 못 읽었어요 — ${(e as Error).message}`] } }
  const doc = (y && typeof y === 'object' ? y : {}) as Record<string, unknown>
  const list = Array.isArray(doc.bridges) ? doc.bridges : []
  const peers: PeerDef[] = []
  const seen = new Set<string>()
  list.forEach((raw, i) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const id = String(r.id ?? '').trim()
    if (!id || idSlug(id) !== id) { errors.push(`${i + 1}번째 연결: id 는 소문자 ASCII·숫자·하이픈이어야 해요(받은 값 «${id}»)`); return }
    if (seen.has(id)) { errors.push(`연결 «${id}» 가 두 번 있어요`); return }
    const mailbox = String(r.mailbox ?? '').trim()
    if (!mailbox) { errors.push(`연결 «${id}»: mailbox 가 없어요`); return }
    seen.add(id)
    const name = String(r.name ?? id).trim() || id
    const icon = String(r.icon ?? '✉️').trim() || '✉️'
    const d = (r.deliver_to && typeof r.deliver_to === 'object' ? r.deliver_to : {}) as Record<string, unknown>
    const trust = TRUSTS.includes(String(r.trust) as Trust) ? (String(r.trust) as Trust) : 'propose'
    if (r.trust !== undefined && trust !== r.trust) errors.push(`연결 «${id}»: trust 는 read · propose · act 중 하나예요 — propose 로 둡니다`)
    const since = r.since === undefined ? undefined : Date.parse(String(r.since))
    if (r.since !== undefined && !Number.isFinite(since)) errors.push(`연결 «${id}»: since 를 시각으로 못 읽었어요`)
    peers.push({
      id, name, icon, mailbox,
      deliver: { bot: String(d.bot ?? 'orch').trim() || 'orch', session: String(d.session ?? `${icon} ${name} 채널`).trim() },
      maySend: Array.isArray(r.may_send) ? (r.may_send as unknown[]).map(String) : ['orch'],
      trust,
      ...(r.host ? { host: String(r.host).trim() } : {}),
      ...(Number.isFinite(since) ? { since } : {}),
      enabled: r.enabled !== false,
    })
  })
  return { peers, ...(doc.runs_copy ? { runsCopy: String(doc.runs_copy) } : {}), errors }
}

/** 이 호스트가 그 연결의 주인인가 — `host` 를 안 적었으면 누구든. 이름은 대소문자·`.local` 을 가리지 않는다 */
export function ownsPeer(peer: Pick<PeerDef, 'host'>, names: string[]): boolean {
  if (!peer.host) return true
  const n = (s: string) => s.toLowerCase().replace(/\.local$/, '').trim()
  return names.filter(Boolean).some((x) => n(x) === n(peer.host!))
}

/** Folder Bot 자기 MCP 도구 이름 — CLI 에는 `mcp__folderbot__<이름>` 으로 보인다 */
const fb = (names: string[]) => names.map((n) => `mcp__folderbot__${n}`)
const WRITE_BUILTINS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch']

/**
 * 🔴 **편지를 받는 채널 세션의 울타리 — trust 를 CLI 인자로 집행한다** (BQ-5 · 2026-10-09).
 *
 * 권한 요청으로 막으면 새어 나간다: 사용자 설정(`~/.claude/settings.json`)이 `Write`·`Edit` 를 «항상 허용» 해 두면
 * CLI 는 묻지도 않고 쓴다(Dave 맥미니 실측 — defaultMode auto · allow 에 Write·Edit). 그래서 세션을 띄울 때
 *  - `--permission-mode default` 를 **명시**하고(설정의 auto/bypass 를 따라가지 않게)
 *  - `--strict-mcp-config` 로 Folder Bot MCP 하나만 붙이고(claude.ai 커넥터 706개가 0개 — 메일 발송 같은 바깥 도구가 사라진다)
 *  - `--disallowedTools` 로 쓰기·명령·웹 도구를 **목록에서 지운다**(맥미니 실측: 도구 목록에서 빠진다).
 * read    — 읽기와 답장(`bridge_send`)만. Folder Bot 도구 중 바꾸는 것은 다 뺀다
 * propose — 읽기 + 봇에게 나눠 주기(`bot_send`)·할 일 남기기. 파일 쓰기·명령·웹·루틴 바꾸기는 뺀다(= 제안만)
 * act     — 제한 없음(`bypassPermissions`). 사람 승인이 필요한 세 도구는 그래도 턴 출처로 막힌다(core/turnGuard)
 * ⚠ 세션 단위다 — 채널 세션에 사람이 직접 쳐도 같은 울타리다. 넓게 하려면 다른 세션을 쓴다.
 */
export function channelSpawn(trust: Trust): { permissionMode: 'default' | 'bypassPermissions'; strictMcp: boolean; disallowed: string[] } {
  if (trust === 'act') return { permissionMode: 'bypassPermissions', strictMcp: false, disallowed: [] }
  const always = fb(['folder_move', 'folder_create', 'bot_retire', 'routine_add', 'routine_update', 'routine_remove', 'orch_ask'])
  if (trust === 'propose') return { permissionMode: 'default', strictMcp: true, disallowed: [...WRITE_BUILTINS, ...always] }
  return { permissionMode: 'default', strictMcp: true, disallowed: [...WRITE_BUILTINS, ...always, ...fb(['bot_send', 'todo_add', 'bot_start', 'bot_stop', 'bots_reorder'])] }
}
