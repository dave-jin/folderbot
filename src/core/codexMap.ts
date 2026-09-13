import type { StreamLine } from './chat'

/**
 * Codex 이벤트 → 우리 `StreamLine` (순수 로직).
 *
 * 🔴 **Codex 의 줄 모양은 판마다 바뀐다.** 그래서 이 옮기기를 **순수 함수로 떼어** 진짜 출력
 *    모양을 유닛 검사로 박아 둔다 — CLI 가 바뀌어 «답이 안 오는» 일이 다시 나면, 그때 여기 한 곳에
 *    새 모양을 더하면 된다 (2026-09-13 Dave: *«codex 로 실행한 세션에서 답이 안와»*).
 *
 * 지금까지 본 두 갈래:
 *  ① **EventMsg**(옛) — `{ id, msg: { type: 'agent_message', message: '…' } }`
 *  ② **item/turn**(새, codex-cli 0.4x+) — `{ type: 'item.completed', item: { item_type: 'assistant_message', text: '…' } }`
 *
 * ⚠ **글자는 어디 있는지 모른다** — `msg.message` · `msg.text` · `item.text` · `item.content` 중
 *    하나다. 그래서 «있는 곳에서 꺼낸다»(`pick`). 한 자리만 보면 그 판에서만 돌고 다른 판에선 조용히 빈다.
 * ⛔ 모르는 줄을 버리지 않는다 — 이름을 모아 두었다가 «답이 없는 턴» 의 이유로 쓴다.
 */

export interface CodexEvt { id?: string; msg?: Record<string, unknown>; item?: Record<string, unknown>; type?: string; [k: string]: unknown }
export interface CodexCtx { sid: string | null; text: string; unknown: Set<string> }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
/** 여러 자리 중 **처음 값이 있는 곳**을 쓴다 */
function pick(...vs: unknown[]): string { for (const v of vs) { const s = str(v); if (s) return s } return '' }

/** 이 줄이 말하는 «종류» — 새 판은 `item.item_type`, 옛 판은 `msg.type` 이다 */
function kindOf(m: Record<string, unknown>, item: Record<string, unknown>): string {
  return str(item.item_type) || str(item.type) || str(m.type)
}

export function mapCodex(e: CodexEvt, ctx: CodexCtx): StreamLine[] {
  const m = (e.msg ?? e) as Record<string, unknown>
  const item = (e.item ?? (m.item as Record<string, unknown>) ?? {}) as Record<string, unknown>
  const t = str(e.type) || str(m.type)
  const kind = kindOf(m, item)
  const out: StreamLine[] = []

  const sid = pick(m.session_id, m.thread_id, m.conversation_id, e.thread_id, e.session_id, (m as { session?: { id?: string } }).session?.id)
  if (sid) ctx.sid = sid

  // ── 말 (조각) ──
  if (t === 'agent_message_delta' || t === 'response.output_text.delta' || t === 'item.delta' || kind === 'agent_message_delta') {
    const d = pick(m.delta, item.delta, item.text, m.text)
    if (!d) return out
    ctx.text += d
    out.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: d } } } as StreamLine)
    return out
  }
  // ── 말 (완성본) ──
  //    ⚠ 새 판은 `item.completed` 한 줄로만 온다(조각이 없다) — 그때는 이게 유일한 답이다
  if (t === 'agent_message' || t === 'assistant_message' || kind === 'agent_message' || kind === 'assistant_message') {
    const full = pick(m.message, m.text, item.text, item.content, item.message)
    if (full && full !== ctx.text) {
      ctx.text = ctx.text || full
      out.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: full }] } } as StreamLine)
    }
    return out
  }
  // ── 생각 ──
  if (t.startsWith('agent_reasoning') || kind === 'reasoning' || kind === 'agent_reasoning') {
    const d = pick(m.text, m.delta, item.text, item.summary)
    if (d) out.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: d } } } as StreamLine)
    return out
  }
  // ── 도구 — 명령 실행 · 파일 고치기 · MCP ──
  const toolKind = /^(exec_command|patch_apply|mcp_tool_call)/.test(t) ? t : /^(command_execution|file_change|mcp_tool_call)$/.test(kind) ? kind : ''
  if (toolKind) {
    const begin = t.endsWith('_begin') || str(e.type) === 'item.started'
    const id = pick(m.call_id, item.id, m.id, e.id) || `c_${Date.now().toString(36)}`
    const name = /exec|command/.test(toolKind) ? 'Bash' : /patch|file/.test(toolKind) ? 'Edit' : pick(m.tool, item.tool) || 'Tool'
    const cmd = Array.isArray(m.command) ? (m.command as string[]).join(' ') : pick(m.command, item.command, m.description, item.description)
    if (begin) out.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input: name === 'Bash' ? { command: cmd } : ((m.input ?? item.input ?? { description: cmd }) as Record<string, unknown>) }] } } as StreamLine)
    else out.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: Number(m.exit_code ?? item.exit_code ?? 0) !== 0, content: pick(m.stdout, item.stdout, m.output, item.output, m.aggregated_output, item.aggregated_output) }] } } as StreamLine)
    return out
  }
  // ── 토큰 ──
  if (t === 'token_count' || t === 'usage' || t === 'turn.completed') {
    const u = ((m.info ?? m.usage ?? e.usage ?? {}) as Record<string, number>)
    if (u && (u.input_tokens || u.output_tokens)) out.push({ type: 'result', subtype: 'usage', usage: { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_read_input_tokens: u.cached_input_tokens ?? u.cache_read_input_tokens ?? 0 } } as StreamLine)
    return out
  }
  if (t === 'task_started' || t === 'session_configured' || t === 'thread.started') {
    out.push({ type: 'system', subtype: 'init', session_id: ctx.sid ?? undefined } as StreamLine)
    return out
  }
  if (t === 'task_complete' || t === 'item.started') return out   // 마감은 프로세스가 끝날 때 한다
  if (t === 'error' || t === 'stream_error' || t === 'turn.failed') {
    const msg = pick(m.message, (e.error as Record<string, unknown> | undefined)?.message, (m.error as Record<string, unknown> | undefined)?.message) || '알 수 없는 오류'
    ctx.unknown.add(`오류: ${msg.slice(0, 200)}`)
    return out
  }
  // 표에 없는 줄 — 버리지 않고 흘려보낸다(이름이 바뀌어도 화면이 조용히 비지 않게)
  const label = kind || t
  if (label) { ctx.unknown.add(label); out.push({ type: 'system', subtype: 'activity', summary: label } as StreamLine) }
  return out
}

/**
 * 턴이 **글자 하나 없이** 끝났을 때 화면에 낼 말.
 * 🔴 조용히 비는 것이 제일 나쁘다 — 사람은 «고장났나 · 기다려야 하나» 를 알 수 없다.
 *    그래서 무엇이 왔고 무엇으로 끝났는지를 **답 자리에** 적는다.
 */
export function emptyTurnNote(o: { code: number | null; stderr: string; unknown: Set<string> }): string {
  const bits: string[] = ['Codex 가 답 없이 턴을 끝냈어요.']
  if (o.code) bits.push(`끝난 코드 ${o.code}.`)
  const err = o.stderr.trim().split('\n').filter(Boolean).slice(-3).join(' / ')
  if (err) bits.push(`CLI: ${err.slice(0, 300)}`)
  const seen = [...o.unknown].slice(0, 6)
  if (seen.length) bits.push(`받은 줄: ${seen.join(' · ')}`)
  bits.push('설정 › 에이전트 › 연결 진단 을 눌러 보세요.')
  return bits.join('\n')
}

/**
 * `codex exec --help` 에서 **쓸 수 있는 깃발**만 골라낸다.
 *
 * 🔴 **없는 깃발을 넘기면 그 자리에서 죽는다** — 그리고 그 죽음은 «답이 안 오는» 모양으로 보인다.
 *    Codex 는 판마다 깃발이 들고 난다(`--skip-git-repo-check` 가 그런 예다). 그래서 넘기기 전에
 *    **도움말을 한 번 읽고** 있는 것만 쓴다.
 * ⚠ 도움말을 못 읽었으면(`help` 가 비었으면) **다 있다고 본다** — 못 읽었다고 기능을 빼면
 *    멀쩡한 판에서 샌드박스가 통째로 빠진다(그게 더 위험하다).
 */
export function supportedFlags(help: string, want: string[]): Set<string> {
  const out = new Set<string>()
  if (!help.trim()) { for (const w of want) out.add(w); return out }
  for (const w of want) if (help.includes(w)) out.add(w)
  return out
}
