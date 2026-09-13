import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { StreamLine } from '../core/chat'
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

export interface CodexSpec { cwd: string; resume?: string | null; model?: string; sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access' }

/** Codex 이벤트 한 줄 — `{ id, msg: { type, ... } }` 또는 판에 따라 평평한 `{ type, ... }` */
interface CodexEvt { id?: string; msg?: Record<string, unknown>; type?: string; [k: string]: unknown }

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
    const args = this.cliSessionId ? ['exec', 'resume', this.cliSessionId] : ['exec']
    args.push('--json', '--sandbox', this.spec.sandbox ?? 'read-only', '--skip-git-repo-check')
    if (this.spec.model) args.push('--model', this.spec.model)
    args.push(prompt)
    this.text = ''
    const p = spawn(bin, args, { cwd: this.spec.cwd, env: cleanClaudeEnv() })
    this.proc = p
    p.stderr.on('data', (d: Buffer) => { this.lastError = (this.lastError + d.toString()).slice(-4000) })
    createInterface({ input: p.stdout }).on('line', (raw) => this.onLine(raw))
    p.on('error', (e) => { this.proc = null; this.lastError = e.message; this.emit('exit', 1, null, e.message) })
    p.on('exit', (code) => {
      this.proc = null
      // 턴이 끝났다 — 프로세스가 죽은 것은 «세션 종료» 가 아니다. result 줄로 마감하고 세션은 남긴다
      this.out({ type: 'result', subtype: code === 0 ? 'success' : 'error', is_error: code !== 0, result: this.text, session_id: this.cliSessionId ?? undefined })
    })
    return true
  }

  private onLine(raw: string): void {
    let e: CodexEvt
    try { e = JSON.parse(raw) as CodexEvt } catch { return }
    const m = (e.msg ?? e) as Record<string, unknown>
    const t = String(m.type ?? '')
    const sid = m.session_id ?? m.thread_id ?? m.conversation_id ?? (m as { session?: { id?: string } }).session?.id
    if (typeof sid === 'string' && sid) this.cliSessionId = sid

    // 말 — 조각과 완성본
    if (t === 'agent_message_delta' || t === 'item.delta' || t === 'response.output_text.delta') {
      const d = String(m.delta ?? m.text ?? '')
      if (!d) return
      this.text += d
      this.out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: d } } })
      return
    }
    if (t === 'agent_message' || t === 'item.completed' || t === 'assistant_message') {
      const full = String(m.message ?? m.text ?? '')
      if (full && !this.text) { this.text = full; this.out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: full }] } }) }
      return
    }
    // 생각
    if (t === 'agent_reasoning' || t === 'agent_reasoning_delta') {
      const d = String(m.text ?? m.delta ?? '')
      if (d) this.out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: d } } })
      return
    }
    // 도구 — 명령 실행 · 파일 고치기
    if (t === 'exec_command_begin' || t === 'exec_command_end' || t === 'patch_apply_begin' || t === 'patch_apply_end' || t === 'mcp_tool_call_begin' || t === 'mcp_tool_call_end') {
      const begin = t.endsWith('_begin')
      const id = String(m.call_id ?? m.id ?? `c_${Date.now().toString(36)}`)
      const name = t.startsWith('exec') ? 'Bash' : t.startsWith('patch') ? 'Edit' : String(m.tool ?? 'Tool')
      const cmd = Array.isArray(m.command) ? (m.command as string[]).join(' ') : String(m.command ?? m.description ?? '')
      if (begin) this.out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input: name === 'Bash' ? { command: cmd } : (m.input ?? { description: cmd }) }] } })
      else this.out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: Number(m.exit_code ?? 0) !== 0, content: String(m.stdout ?? m.output ?? '') }] } })
      return
    }
    // 토큰 — 사용량·컨텍스트
    if (t === 'token_count' || t === 'usage') {
      const u = (m.info ?? m.usage ?? m) as Record<string, number>
      this.out({ type: 'result', subtype: 'usage', usage: { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_read_input_tokens: u.cached_input_tokens ?? u.cache_read_input_tokens ?? 0 } })
      return
    }
    if (t === 'task_started' || t === 'session_configured' || t === 'thread.started') { this.out({ type: 'system', subtype: 'init', session_id: this.cliSessionId ?? undefined }); return }
    if (t === 'task_complete' || t === 'turn.completed') return   // exit 에서 result 로 마감한다
    if (t === 'error' || t === 'stream_error') { this.lastError = String(m.message ?? raw).slice(0, 500); return }

    // 표에 없는 줄 — 버리지 않고 흘려보낸다 (이름이 바뀌어도 화면이 조용히 비지 않게)
    if (t && !this.unknown.has(t)) { this.unknown.add(t); if (!this.lastError) this.lastError = `Codex: 모르는 줄 «${t}»` }
    if (t) this.out({ type: 'system', subtype: 'activity', summary: t })
  }

  private out(line: StreamLine): void { this.emit('line', line) }

  // ── 우리가 끼어들 자리가 없는 것들 — 조용히 아무것도 안 한다 ──
  respondPermission(): void { /* Codex 는 stdio 승인이 없다 */ }
  respondAsk(): void { /* 같음 */ }
  interrupt(): void { this.kill() }
  kill(): void { const p = this.proc; this.proc = null; if (!p) return; try { p.kill('SIGTERM') } catch { /* */ } setTimeout(() => { try { p.kill('SIGKILL') } catch { /* */ } }, 4000).unref() }
}
