import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { StreamLine } from '../core/chat'
import { emptyTurnNote, mapCodex, supportedFlags, type CodexEvt } from '../core/codexMap'
import type { PermissionRequest } from '../core/types'
import { providerBin } from './providers'
import { cleanClaudeEnv } from './session'

/**
 * Codex 워커 — `codex exec --json` 한 줄씩을 **Claude 의 stream-json 모양으로 옮긴다**.
 *
 * 🔴 **왜 옮기나**: 화면·저장·알림이 전부 `StreamLine` 하나를 읽는다. 여기서 옮겨 두면
 *    Codex 를 아는 곳이 이 파일 하나뿐이고, 나머지는 어느 CLI 인지 몰라도 된다.
 *
 * ⚠ **Claude 와 다른 두 가지**
 *  1. **턴마다 새 프로세스다.** `codex exec` 는 상주하지 않는다 — 한 번 물어보고 끝난다.
 *     그래서 `send()` 가 프로세스를 띄우고, 두 번째 턴부터 `resume <세션 id>` 를 붙인다.
 *     («상주 워커» 를 전제로 한 절전·회수는 그대로 맞는다 — 뜬 프로세스가 없으면 잘 것도 없다.)
 *  2. **stdio 권한 프로토콜이 없다.** 승인은 Codex 자신의 샌드박스 정책이 정하고 우리가 끼어들
 *     자리가 없다. 그래서 `pending` 은 늘 비어 있고 승인 화면도 안 뜬다.
 *     ⛔ 이걸 «승인이 필요 없다» 로 읽으면 안 된다 — **우리가 못 묻는 것**이라 기본 정책을
 *     읽기 전용(`--sandbox read-only`)으로 두고, 쓰기를 열려면 사람이 설정에서 바꾼다.
 *
 * 🔴 **모르는 줄은 버리지 않는다.** Codex 의 이벤트 이름은 판마다 바뀐다. 표에 없는 줄은
 *    `system/activity` 로 흘려보내고 첫 줄을 `lastError` 에 남긴다 — 이름이 바뀌어도 화면이
 *    조용히 비지 않고, 무엇이 왔는지 보인다.
 */

export interface CodexSpec {
  cwd: string
  resume?: string | null
  model?: string
  /** Codex 의 `model_reasoning_effort` — minimal · low · medium · high (Claude 의 low…max 와 다르다) */
  effort?: string
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  /** `codex login` 을 못 쓰는 문맥의 대안 — 워커 환경에만 넣는다(파일로 안 쓴다) */
  apiKey?: string
}

/** Codex 가 아는 노력 값만 넘긴다 — Claude 의 `xhigh`·`max` 를 넘기면 그 자리에서 죽는다 */
const CODEX_EFFORT = new Set(['minimal', 'low', 'medium', 'high'])

/**
 * 이 판이 아는 깃발 — **한 번만 묻는다**(`codex exec --help`). 못 읽으면 다 있다고 본다.
 * ⛔ 세션마다 묻지 마라 — 턴마다 프로세스를 띄우는 구조라 그때마다 도움말을 읽으면 두 배로 뜬다.
 */
let flagCache: Set<string> | null = null
export function codexFlags(bin: string): Set<string> {
  if (flagCache) return flagCache
  let help = ''
  try { help = String(execFileSync(bin, ['exec', '--help'], { encoding: 'utf8', timeout: 6000, env: cleanClaudeEnv() })) } catch { help = '' }
  flagCache = supportedFlags(help, ['--json', '--sandbox', '--skip-git-repo-check', '--model'])
  return flagCache
}

export class CodexWorker extends EventEmitter {
  cliSessionId: string | null
  lastError = ''
  pending = new Map<string, PermissionRequest>()
  private proc: ChildProcessWithoutNullStreams | null = null
  private spec: CodexSpec
  private text = ''
  private unknown = new Set<string>()

  constructor(spec: CodexSpec) {
    super()
    this.spec = spec
    this.cliSessionId = spec.resume ?? null
  }

  get alive(): boolean { return true }   // 턴 사이에는 프로세스가 없다 — 세션은 살아 있다

  send(prompt: string): boolean {
    if (this.proc) return false
    const bin = providerBin('codex')
    if (!bin) { this.lastError = 'Codex CLI 를 찾지 못했어요'; this.emit('exit', 1, null, this.lastError); return false }
    const flags = codexFlags(bin)
    const args = this.cliSessionId ? ['exec', 'resume', this.cliSessionId] : ['exec']
    // ⚠ **있는 깃발만 넘긴다** — 없는 것을 넘기면 CLI 가 그 자리에서 죽고, 그 죽음은 «답이 안 오는»
    //    모양으로 보인다(`codexFlags` 머리말 · 2026-09-13 Dave 신고).
    if (flags.has('--json')) args.push('--json')
    if (flags.has('--sandbox')) args.push('--sandbox', this.spec.sandbox ?? 'read-only')
    if (flags.has('--skip-git-repo-check')) args.push('--skip-git-repo-check')
    if (this.spec.model && flags.has('--model')) args.push('--model', this.spec.model)
    // ⚠ 노력은 `-c` 로 준다 — Codex 에는 `--effort` 플래그가 없고 설정 키(`model_reasoning_effort`)다.
    //    ⛔ 아는 값만 넘긴다. Claude 의 `xhigh`·`max` 를 그대로 넘기면 CLI 가 그 자리에서 죽는다.
    if (this.spec.effort && CODEX_EFFORT.has(this.spec.effort)) args.push('-c', `model_reasoning_effort="${this.spec.effort}"`)
    args.push(prompt)
    this.text = ''
    // ⚠ 키는 **환경에만** 넣는다 — 사용자의 `~/.codex` 설정 파일을 우리가 고쳐 쓰지 않는다
    const env = { ...cleanClaudeEnv(), ...(this.spec.apiKey ? { OPENAI_API_KEY: this.spec.apiKey } : {}) }
    const p = spawn(bin, args, { cwd: this.spec.cwd, env })
    this.proc = p
    p.stderr.on('data', (d: Buffer) => { this.lastError = (this.lastError + d.toString()).slice(-4000) })
    createInterface({ input: p.stdout }).on('line', (raw) => this.onLine(raw))
    p.on('error', (e) => { this.proc = null; this.lastError = e.message; this.emit('exit', 1, null, e.message) })
    p.on('exit', (code) => {
      this.proc = null
      /**
       * 🔴 **글자 하나 없이 끝났으면 이유를 답 자리에 적는다** (2026-09-13 Dave: «codex 로 실행한
       *    세션에서 답이 안와»). 조용히 비는 것이 제일 나쁘다 — 사람은 «고장났나 · 기다려야 하나» 를
       *    알 수 없고, 우리도 나중에 무엇이 왔는지 못 본다.
       * ⚠ 이건 오류 처리가 아니라 **관측**이다 — 코드가 0 이어도 답이 없으면 적는다(줄 이름이
       *    바뀐 경우가 정확히 그 모양이다).
       */
      if (!this.text.trim()) {
        const note = emptyTurnNote({ code, stderr: this.lastError, unknown: this.unknown })
        this.out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: note }] } })
        this.text = note
      }
      // 턴이 끝났다 — 프로세스가 죽은 것은 «세션 종료» 가 아니다. result 줄로 마감하고 세션은 남긴다
      this.out({ type: 'result', subtype: code === 0 ? 'success' : 'error', is_error: code !== 0, result: this.text, session_id: this.cliSessionId ?? undefined })
    })
    return true
  }

  private onLine(raw: string): void {
    let e: CodexEvt
    try { e = JSON.parse(raw) as CodexEvt } catch { return }
    // ⚠ 옮기기는 **순수 함수 한 곳**에 있다(`core/codexMap.ts`) — Codex 의 줄 모양은 판마다 바뀌므로
    //    진짜 출력 모양을 유닛 검사로 박아 두려고 떼어 냈다.
    const ctx = { sid: this.cliSessionId, text: this.text, unknown: this.unknown }
    for (const line of mapCodex(e, ctx)) this.out(line)
    this.cliSessionId = ctx.sid
    this.text = ctx.text
  }

  private out(line: StreamLine): void { this.emit('line', line) }

  // ── 우리가 끼어들 자리가 없는 것들 — 조용히 아무것도 안 한다 ──
  respondPermission(): void { /* Codex 는 stdio 승인이 없다 */ }
  respondAsk(): void { /* 같음 */ }
  interrupt(): void { this.kill() }
  kill(): void { const p = this.proc; this.proc = null; if (!p) return; try { p.kill('SIGTERM') } catch { /* */ } setTimeout(() => { try { p.kill('SIGKILL') } catch { /* */ } }, 4000).unref() }
}
