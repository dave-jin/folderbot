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
/**
 * 🔴 **계정이 안 받아 주는 모델** — 요금제마다 쓸 수 있는 모델이 다르다(긴 문맥은 특히).
 *    `--model` 로 그 이름이 오면 진짜 CLI 처럼 **그 자리에서 죽는다.** 호스트가 모델을 빼고
 *    한 번 더 보내는지가 이 한 갈래로 잰다 (2026-09-14).
 */
if (/못쓰는모델/.test(at('--model') ?? '')) {
  process.stderr.write(`Error: The model '${at('--model')}' is not supported on your plan.\n`)
  process.exit(1)
}
const sessionId = at('--resume') ?? `stub-${randomUUID()}`
/**
 * 🔴 **대화 안에서 모델을 바꾼다** — 진짜 CLI 는 `/model <이름>` 을 받아 그 세션의 모델을 갈고,
 *    그 뒤의 답에는 **바뀐 이름**이 찍혀 온다 (2026-09-15 Dave: «모델이 바뀌었지만 하단에 반영이 안되네»).
 */
let model = at('--model') ?? 'stub'
const say = (o) => process.stdout.write(JSON.stringify({ session_id: sessionId, ...o }) + '\n')
// 트랜스크립트 파일을 흉내 — --resume 판정이 이걸 본다
try { const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-')); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${sessionId}.jsonl`), JSON.stringify({ cwd: process.cwd() }) + '\n') } catch {}
say({ type: 'system', subtype: 'init', model, tools: [], mcp_servers: [], slash_commands: ['compact', 'context', 'review'] })
const rl = createInterface({ input: process.stdin })
let pendingReq = null, pendingAsk = null
rl.on('line', (raw) => {
  let msg; try { msg = JSON.parse(raw) } catch { return }
  /**
   * 🔴 **질문 카드(AskUserQuestion)** — 답이 **어느 질문에 붙어서** 돌아오는지까지 재려고 그대로 되읊는다.
   *    (2026-09-15 Dave: «AskUserQuestion 에서 추가 Text를 입력하면 위에 전체에 나오네» — 화면의
   *    「기타」 칸이 하나뿐이라 모든 질문에 같은 글이 떴고, 보낼 때도 **첫 질문의 답**으로 갔다.)
   */
  if (msg.type === 'control_response' && pendingAsk) {
    pendingAsk = null
    const answers = msg.response?.response?.updatedInput?.answers ?? {}
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: `답변 받음: ${JSON.stringify(answers)}` }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 90, total_cost_usd: 0.001 })
    return
  }
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
  // 「봇 답의 첫 줄」 검사용 — 짧은 한 줄 + 빈 줄 + 본문
  if (/머리줄/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '정리했습니다\n\n**4건**을 옮겼고, 중복 2건은 합쳤습니다. 원본 문장은 지우지 않고 상세로 내렸어요.' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  // 「대기열」 검사용 — 한 턴이 **느리게** 돌아야 그 사이에 보낸 말이 대기열에 쌓인다
  if (/느린일/.test(text)) {
    setTimeout(() => {
      say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '느린 일 끝' }], stop_reason: 'end_turn' } })
      say({ type: 'result', subtype: 'success', duration_ms: 1500, total_cost_usd: 0.001 })
    }, 2500)
    return
  }
  // 「코드 블록 머리줄」 검사용 — 언어가 붙은 펜스
  if (/코드블록/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '이렇게요\n\n```ts\nconst a = 1\n```\n' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  // 「혼자 선 링크 → 박스」 검사용 — 문단 하나가 링크뿐인 답과, 문장 속 링크를 같이 낸다
  if (/링크박스/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '찾았습니다\n\nhttps://example.com/article\n\n자세한 건 https://example.org/docs 를 보세요.' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  if (/백그라운드/.test(text)) {
    // 실제 CLI 2.1.269 의 백그라운드 Agent 이벤트 순서를 그대로 흉내 낸다
    const tid = `stub-bg-${u}`, task = `task-${u}`
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name: 'Agent', input: { description: '백그라운드 조사', prompt: 'PONG 이라고만 답해', subagent_type: 'general-purpose', run_in_background: true } }] } })
    say({ type: 'system', subtype: 'task_started', task_id: task, tool_use_id: tid, description: '백그라운드 조사', is_backgrounded: true, task_type: 'local_agent' })
    say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: [{ type: 'text', text: `Async agent launched successfully.\nagentId: ${task}` }] }] } })
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'LAUNCHED' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 50, total_cost_usd: 0.001 })
    setTimeout(() => {
      say({ type: 'assistant', parent_tool_use_id: tid, message: { role: 'assistant', content: [{ type: 'text', text: 'PONG' }] } })
      say({ type: 'system', subtype: 'task_notification', task_id: task, tool_use_id: tid, status: 'completed', summary: 'PONG', usage: { total_tokens: 10, tool_uses: 0, duration_ms: 700 } })
      say({ type: 'system', subtype: 'init', model: at('--model') ?? 'stub', tools: [], mcp_servers: [], slash_commands: [] })
      say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'GOT: PONG' }], stop_reason: 'end_turn' } })
      say({ type: 'result', subtype: 'success', duration_ms: 60, total_cost_usd: 0.001 })
    }, 700)
    return
  }
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
  if (/질문/.test(text)) {
    pendingAsk = true
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id: `req-${randomUUID()}`, request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', display_name: 'AskUserQuestion', description: '', input: { questions: [
      { question: '첫 질문은 무엇으로 할까요?', header: '하나', options: [{ label: '가 안', description: '첫째' }, { label: '나 안' }] },
      { question: '둘째 질문은 무엇으로 할까요?', header: '둘', options: [{ label: '다 안' }, { label: '라 안' }] }
    ] }, permission_suggestions: [] } }) + '\n')
    return
  }
  if (/승인|permission/.test(text) || process.env.STUB_ASK_PERMISSION) {
    pendingReq = { text }
    const request_id = `req-${randomUUID()}`
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id, request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Bash', description: '명령을 실행합니다', input: { command: 'npm run qa' }, permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash' }] }] } }) + '\n')
    return
  }
  /**
   * 🔴 **컨텍스트를 두 갈래로 흘린다 — 진짜 CLI 처럼** (2026-09-15).
   *    assistant 줄의 usage 는 «이번 호출의 프롬프트 크기»(64k)이고, result 줄의 usage 는
   *    «이번 턴에 쓴 토큰의 합»(348만 — 도구를 여러 번 돌면 창보다 커진다)이다.
   *    modelUsage 에는 서브에이전트가 한 번 쓴 1M 모델도 섞어 둔다.
   *    ⚠ 둘을 헷갈리면 화면에 «3483k / 1000k · 100%» 가 찍힌다(Dave 가 본 그 화면).
   */
  const mset = /^\/model\s+(\S+)/.exec(text.trim())
  if (mset) model = mset[1]
  say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: mset ? `Set model to ${model} for this session only` : `스텁이 받았습니다: ${text.slice(0, 60)}` }], stop_reason: 'end_turn', usage: { input_tokens: 4000, cache_read_input_tokens: 60000, cache_creation_input_tokens: 0, output_tokens: 300 } } })
  say({ type: 'result', subtype: 'success', duration_ms: 123, total_cost_usd: 0.001, usage: { input_tokens: 3483000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 9000 }, modelUsage: { stub: { contextWindow: 200000, inputTokens: 3400000, outputTokens: 9000 }, 'stub-sub[1m]': { contextWindow: 1000000, inputTokens: 500, outputTokens: 40 } } })
})
rl.on('close', () => process.exit(0))
