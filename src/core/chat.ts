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
