import type { ChatItem } from './types'

/** stream-json 한 줄 → 대화 항목들. 화면이 아니라 호스트가 정본으로 만든다. */
export interface StreamLine {
  type: string
  subtype?: string
  session_id?: string
  /** 서브에이전트(Task/Agent) 안에서 난 줄이면 부모 tool_use id */
  parent_tool_use_id?: string | null
  /** system/init 줄 — CLI 가 실제로 쓰는 모델 */
  model?: string
  message?: { role?: string; model?: string; content?: Array<Record<string, unknown>>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }
  event?: Record<string, unknown>
  duration_ms?: number
  total_cost_usd?: number
  is_error?: boolean
  result?: string
  error?: string
  stop_reason?: string
  deferred_tool_use?: { name?: string; id?: string; input?: Record<string, unknown> }
  /** result 줄 — **이번 턴에 쓴 토큰의 합**(여러 번의 API 호출을 더한 값이다 · `contextOf` 머리말) */
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  modelUsage?: Record<string, { contextWindow?: number; inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }>
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

export interface Ctx { used: number; window: number }
const DEFAULT_WINDOW = 200_000

/**
 * 창 크기 — 🔴 **이 세션을 도는 모델의 것**이어야 한다.
 * ⛔ 종전에는 `modelUsage` 전체의 **최댓값**을 썼다 — 서브에이전트가 다른 모델을 한 번만 써도
 *    그쪽 창(예: 1M)이 이 세션의 창인 양 찍혔다(2026-09-15 Dave 제보 화면의 «/ 1000k»).
 * ⚠ 세션 모델을 알면 그 줄을, 모르면 **토큰을 가장 많이 쓴 모델**(주인공)을 고른다.
 */
function windowOf(line: StreamLine, prev?: Ctx | null, model?: string): number {
  const rows = Object.entries(line.modelUsage ?? {}).filter(([, v]) => (v.contextWindow ?? 0) > 0)
  if (!rows.length) return prev?.window ?? DEFAULT_WINDOW
  if (model) {
    const hit = rows.find(([k]) => k === model || k.includes(model) || model.includes(k))
    if (hit) return hit[1].contextWindow as number
  }
  const tok = (v: { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }) =>
    (v.inputTokens ?? 0) + (v.cacheReadInputTokens ?? 0) + (v.cacheCreationInputTokens ?? 0) + (v.outputTokens ?? 0)
  return [...rows].sort((a, b) => tok(b[1]) - tok(a[1]))[0][1].contextWindow as number
}

/**
 * 지금 **컨텍스트가 얼마나 찼나** — 🔴 «이번 프롬프트의 크기» 다.
 *
 * ⛔ **result 줄의 `usage` 를 그대로 쓰면 안 된다.** 그건 이번 턴의 **모든 API 호출을 더한 값**이라
 *    도구를 열 번 돌린 턴에서는 창보다 몇 배 커진다 — 2026-09-15 Dave 화면의 «3483k / 1000k · 100%»
 *    가 바로 그것이다(쓴 적 없는 348만 토큰이 «지금 대화 크기» 로 찍혔다).
 * 🔴 **정본은 assistant 줄의 `message.usage`** 다 — 그 한 번의 호출에 들어간 입력+캐시가 곧 지금
 *    프롬프트의 크기이고, 턴의 **마지막 호출**이 지금 상태다.
 * ⚠ 서브에이전트(`parent_tool_use_id`)의 usage 는 **부르는 쪽이 걸러서** 넘긴다 — 그쪽은 제 작은
 *   문맥이라 이 세션의 크기가 아니다.
 * ⚠ assistant 줄을 한 번도 못 본 턴(도구만 돌고 끝)에서는 이전 값을 지킨다. 그것도 없으면 합계를
 *   창 크기로 잘라 쓴다 — 틀린 숫자를 크게 보여 주느니 «가득» 이 덜 틀리다.
 */
export function contextOf(line: StreamLine, prev?: Ctx | null, model?: string): Ctx | null {
  const win = windowOf(line, prev, model)
  const sum = (u?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }) =>
    (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0)
  if (line.type === 'assistant') {
    const used = sum(line.message?.usage)
    return used > 0 ? { used, window: win } : null
  }
  if (line.type !== 'result') return null
  if (prev?.used) return { used: prev.used, window: win }
  const used = sum(line.usage)
  return used > 0 ? { used: Math.min(used, win), window: win } : null
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

/**
 * 이 줄이 알려 주는 **CLI 가 실제로 쓰는 모델** — 없으면 null.
 * 🔴 사람이 대화에서 `/model …` 로 바꾸면 우리가 넘긴 이름과 **달라진다** (2026-09-15 Dave:
 *    *«모델이 바뀌었지만 하단에 반영이 안되네»*). 답에 찍혀 오는 이름이 지금 도는 모델의 정본이다.
 */
export function modelOf(line: StreamLine): string | null {
  if (line.type === 'assistant') return line.message?.model ? String(line.message.model) : null
  if (line.type === 'system' && line.subtype === 'init') return line.model ? String(line.model) : null
  return null
}
