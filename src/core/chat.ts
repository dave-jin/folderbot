import type { ChatItem } from './types'

/** stream-json 한 줄 → 대화 항목들. 화면이 아니라 호스트가 정본으로 만든다. */
export interface StreamLine {
  type: string
  subtype?: string
  session_id?: string
  message?: { role?: string; content?: Array<Record<string, unknown>>; stop_reason?: string }
  event?: Record<string, unknown>
  duration_ms?: number
  total_cost_usd?: number
  is_error?: boolean
  result?: string
  error?: string
  stop_reason?: string
  deferred_tool_use?: { name?: string; id?: string; input?: Record<string, unknown> }
}

export function toolSummary(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (name) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return s('file_path') || s('path')
    case 'Bash': return s('command').slice(0, 120)
    case 'Glob': case 'Grep': return s('pattern') + (s('path') ? ` · ${s('path')}` : '')
    case 'WebFetch': case 'WebSearch': return s('url') || s('query')
    case 'Task': case 'Agent': return s('description') || s('prompt').slice(0, 80)
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
