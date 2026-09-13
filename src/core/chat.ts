import type { ChatItem } from './types'

/** stream-json 한 줄 → 대화 항목들. 화면이 아니라 호스트가 정본으로 만든다. */
export interface StreamLine {
  type: string
  subtype?: string
  session_id?: string
  /** 서브에이전트(Task/Agent) 안에서 난 줄이면 부모 tool_use id */
  parent_tool_use_id?: string | null
  message?: { role?: string; content?: Array<Record<string, unknown>>; stop_reason?: string }
  event?: Record<string, unknown>
  duration_ms?: number
  total_cost_usd?: number
  is_error?: boolean
  result?: string
  error?: string
  stop_reason?: string
  deferred_tool_use?: { name?: string; id?: string; input?: Record<string, unknown> }
  /** result 줄 — 이번 턴 토큰. 입력+캐시 = 지금 컨텍스트 크기 */
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  modelUsage?: Record<string, { contextWindow?: number }>
  /** system/init 줄 — CLI 가 아는 슬래시 명령 이름들 */
  slash_commands?: string[]
  /** system/task_started · task_notification · task_updated (백그라운드 Agent) — 2026-09-13 CLI 2.1.269 실측 */
  task_id?: string
  tool_use_id?: string
  is_backgrounded?: boolean
  status?: string
  summary?: string
  patch?: { status?: string }
}

/** result 의 usage → 컨텍스트 사용량. 창 크기는 modelUsage 에서, 없으면 200k */
export function contextOf(line: StreamLine): { used: number; window: number } | null {
  const u = line.usage; if (!u) return null
  const used = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  const win = Math.max(0, ...Object.values(line.modelUsage ?? {}).map((m) => m.contextWindow ?? 0)) || 200_000
  return { used, window: win }
}

export function toolSummary(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (name) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return s('file_path') || s('path')
    case 'Bash': return s('command').slice(0, 120)
    case 'Glob': case 'Grep': return s('pattern') + (s('path') ? ` · ${s('path')}` : '')
    case 'WebFetch': case 'WebSearch': return s('url') || s('query')
    case 'Task': case 'Agent': return s('description') || s('prompt').slice(0, 80)
    case 'TodoWrite': return `${Array.isArray(input.todos) ? (input.todos as unknown[]).length : 0}개 항목`
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string') as string | undefined
      return (first ?? '').slice(0, 100)
    }
  }
}

/** 이 도구가 파일을 만들거나 고쳤다면 그 경로 */
export function touchedPath(name: string, input: Record<string, unknown>): string | null {
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) {
    const p = input.file_path ?? input.path
    return typeof p === 'string' ? p : null
  }
  return null
}

export function assistantText(line: StreamLine): string {
  const parts = line.message?.content ?? []
  return parts.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim()
}

let seq = 0
export function itemId(prefix = 'i'): string {
  seq = (seq + 1) % 1_000_000
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`
}

/**
 * 턴이 끝났거나(result) 워커가 죽었거나 호스트가 다시 떴을 때 — 아직 «진행 중» 으로 남은 항목을 마감한다.
 * 종전엔 호스트 재시작 시 세션 state 만 idle 로 바꾸고 items 는 그대로 둬서, 스트리밍 답·결과 없는 도구·
 * run 상태 서브에이전트가 **영원히 스피너**로 남았다 (2026-09-13 Dave: 업데이트로 호스트가 재시작된 뒤 «실행 중 · 도구 42회»).
 * @returns 바뀐 항목들 (렌더러에 replace 로 밀어 준다)
 */
export function closeOpenItems(items: ChatItem[], reason: 'result' | 'exit' | 'restore'): ChatItem[] {
  const changed: ChatItem[] = []
  const note = reason === 'result' ? undefined : reason === 'exit' ? '세션이 끝나 중단됨' : '호스트가 다시 떠서 중단됨'
  for (const it of items) {
    if ((it.kind === 'assistant' || it.kind === 'thinking') && it.streaming) { it.streaming = false; changed.push(it) }
    else if (it.kind === 'tool' && it.result === undefined && !it.isError) { if (reason === 'result') it.result = ''; else { it.result = note; it.isError = true } changed.push(it) }
    else if (it.kind === 'subagent' && it.status === 'run') { if (reason === 'result') { if (it.bg) continue; it.status = 'done' } else { it.status = 'error'; it.result = note } changed.push(it) }
  }
  return changed
}

/**
 * 접힌 기계 한 줄의 글귀 — 「도구 7회 · 파일 3개 · 12.4초」.
 *
 * ⛔ **도구 이름을 늘어놓지 않는다.** 접힌 상태에서 필요한 건 «얼마나 했나» 뿐이고,
 *    «무엇을 했나» 는 펼쳤을 때 답한다(승인된 「A · 문서처럼」).
 * ⚠ 0.1초 미만은 안 적는다 — 「0.0초」 는 정보가 아니라 잡음이다.
 */
export function machSummary(tools: number, files: number, ms: number): string {
  return [`도구 ${tools}회`, files ? `파일 ${files}개` : '', ms >= 100 ? `${(ms / 1000).toFixed(1)}초` : ''].filter(Boolean).join(' · ')
}
