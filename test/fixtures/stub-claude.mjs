#!/usr/bin/env node
// 가짜 claude CLI — 진짜와 같은 stream-json 프로토콜의 최소만 말한다 (테스트 전용)
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
const argv = process.argv.slice(2)
const at = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
if (argv[0] === 'auth') { process.stdout.write(JSON.stringify({ loggedIn: process.env.STUB_LOGGED_OUT ? false : true, authMethod: 'claude.ai', email: 'qa@example.com', subscriptionType: 'max' }) + '\n'); process.exit(0) }
const sessionId = at('--resume') ?? `stub-${randomUUID()}`
const say = (o) => process.stdout.write(JSON.stringify({ session_id: sessionId, ...o }) + '\n')
// 트랜스크립트 파일을 흉내 — --resume 판정이 이걸 본다
try { const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-')); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${sessionId}.jsonl`), JSON.stringify({ cwd: process.cwd() }) + '\n') } catch {}
say({ type: 'system', subtype: 'init', model: at('--model') ?? 'stub', tools: [], mcp_servers: [], slash_commands: ['compact', 'context', 'review'] })
const rl = createInterface({ input: process.stdin })
let pendingReq = null
rl.on('line', (raw) => {
  let msg; try { msg = JSON.parse(raw) } catch { return }
  if (msg.type === 'control_response' && pendingReq) {
    const allow = msg.response?.response?.behavior === 'allow'
    const { text } = pendingReq; pendingReq = null
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'stub-t2', name: 'Write', input: { file_path: join(process.cwd(), 'stub-output.md'), content: 'x' } }] } })
    if (allow) { try { writeFileSync(join(process.cwd(), 'stub-output.md'), `# 스텁 산출물\n\n${text}\n`) } catch {} }
    say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'stub-t2', content: allow ? 'ok' : 'denied', is_error: !allow }] } })
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: allow ? `스텁이 처리했습니다: ${text.slice(0, 60)}` : '거부돼서 멈췄어요.' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 321, total_cost_usd: 0.001 })
    return
  }
  if (msg.type !== 'user') return
  const text = msg.message?.content?.map?.((b) => b.text ?? '').join('') ?? ''
  const u = randomUUID().slice(0, 6)
  say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `stub-t1-${u}`, name: 'Read', input: { file_path: join(process.cwd(), 'readme.md') } }] } })
  say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `stub-t1-${u}`, content: '(readme)' }] } })
  say({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '무엇을 먼저 읽을지 정한다' } } })
  say({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '생각 중…' } } })
  // 서브에이전트 — Task 안의 줄은 parent_tool_use_id 를 단다
  say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `stub-task-${u}`, name: 'Task', input: { description: '하위 조사', prompt: '폴더를 훑어 요약해' } }] } })
  say({ type: 'assistant', parent_tool_use_id: `stub-task-${u}`, message: { role: 'assistant', content: [{ type: 'tool_use', id: `stub-c1-${u}`, name: 'Grep', input: { pattern: 'todo', path: process.cwd() } }] } })
  say({ type: 'user', parent_tool_use_id: `stub-task-${u}`, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `stub-c1-${u}`, content: '2 matches' }] } })
  say({ type: 'assistant', parent_tool_use_id: `stub-task-${u}`, message: { role: 'assistant', content: [{ type: 'text', text: '하위 조사 끝' }] } })
  say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `stub-task-${u}`, content: '하위 조사 결과: 2건' }] } })
  say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `stub-todo-${u}`, name: 'TodoWrite', input: { todos: [{ content: '읽기', status: 'completed', activeForm: '읽는 중' }, { content: '답 쓰기', status: 'in_progress', activeForm: '답 쓰는 중' }] } }] } })
  say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `stub-todo-${u}`, content: 'ok' }] } })
  if (/승인|permission/.test(text) || process.env.STUB_ASK_PERMISSION) {
    pendingReq = { text }
    const request_id = `req-${randomUUID()}`
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id, request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Bash', description: '명령을 실행합니다', input: { command: 'npm run qa' }, permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash' }] }] } }) + '\n')
    return
  }
  say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `스텁이 받았습니다: ${text.slice(0, 60)}` }], stop_reason: 'end_turn' } })
  say({ type: 'result', subtype: 'success', duration_ms: 123, total_cost_usd: 0.001, usage: { input_tokens: 4000, cache_read_input_tokens: 60000, cache_creation_input_tokens: 0, output_tokens: 300 }, modelUsage: { stub: { contextWindow: 200000 } } })
})
rl.on('close', () => process.exit(0))
