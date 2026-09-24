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
let pendingReq = null, pendingAsk = null, pendingDeferred = null
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
    // «항상 허용» 이 무엇을 보냈는지 되읊는다 — 호스트가 만든 접두어 규칙이 CLI 까지 오는지 재려고
    const rules = msg.response?.response?.updatedPermissions
    const ruleNote = Array.isArray(rules) && rules.length ? ` · 규칙 ${JSON.stringify(rules.flatMap((u) => (u.rules ?? []).map((r) => r.ruleContent ?? r.toolName)))}` : ''
    const { text } = pendingReq; pendingReq = null
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'stub-t2', name: 'Write', input: { file_path: join(process.cwd(), 'stub-output.md'), content: 'x' } }] } })
    // 🔴 실 CLI 는 tool_use 줄을 내보낸 **뒤에** 파일을 쓴다(권한 확인 → 실행). 그 틈을 그대로 둔다 —
    //    호스트가 «파일 바뀜» 을 너무 일찍 알리면 화면이 빈 폴더를 읽고 끝나던 사고(2026-09-18)를 재려고.
    setTimeout(() => {
      if (allow) { try { writeFileSync(join(process.cwd(), 'stub-output.md'), `# 스텁 산출물\n\n${text}\n`) } catch {} }
      say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'stub-t2', content: allow ? 'ok' : 'denied', is_error: !allow }] } })
      say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: allow ? `스텁이 처리했습니다: ${text.slice(0, 60)}${ruleNote}` : '거부돼서 멈췄어요.' }], stop_reason: 'end_turn' } })
      say({ type: 'result', subtype: 'success', duration_ms: 321, total_cost_usd: 0.001 })
    }, 150)
    return
  }
  if (msg.type !== 'user') return
  /**
   * 🔴 **AX · 미뤄진 질문의 답** — 실 CLI 는 `tool_deferred` 로 턴을 끊고, 답은 호스트가 stdin 에 `tool_result` 로 넣는다.
   *    ⚠ 실 CLI 처럼 **그 tool_result 를 되돌려 내보내지 않는다** — 그래야 «화면의 질문 도구 줄이 영영 돈다»(스크린샷_234)가 재현된다.
   */
  const tr = msg.message?.content?.find?.((b) => b.type === 'tool_result')
  if (tr && pendingDeferred && tr.tool_use_id === pendingDeferred) {
    pendingDeferred = null
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: tr.is_error ? '미룬 질문 취소됨' : `미룬 답 받음: ${tr.content}` }] } })
    // ⚠ 턴을 바로 끝내지 않는다 — 스크린샷_234 는 답 뒤로 6분짜리 턴이 이어지는 동안 질문 줄이 돌았다.
    //    턴 끝(result)은 호스트가 열린 줄을 다 닫으므로, 바로 끝내면 버그가 가려진다.
    setTimeout(() => say({ type: 'result', subtype: 'success', duration_ms: 3000, total_cost_usd: 0.001 }), 3000)
    return
  }
  const rawText = msg.message?.content?.map?.((b) => b.text ?? '').join('') ?? ''
  // J · 메시지 앞의 기기 블록은 떼고 본다(실제 CLI 는 그대로 읽는다). «기기확인» 이면 블록을 그대로 되읊어 검사가 값을 본다
  const cm = /^<folderbot-client\s+[^>]*\/>\s*/.exec(rawText); const clientBlock = cm ? cm[0].trim() : ''; const text = cm ? rawText.slice(cm[0].length) : rawText
  const u = randomUUID().slice(0, 6)
  if (/^기기확인/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: clientBlock ? '기기 블록: `' + clientBlock + '`' : '기기 블록 없음' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 10, total_cost_usd: 0.001 })
    return
  }
  // 「채팅 칩」 검사용 — «되읊어:» 뒤를 답변으로 그대로 돌려준다(경로·파일명이 칩이 되는지 재려고)
  if (/^되읊어:/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: text.slice('되읊어:'.length).trim() }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 10, total_cost_usd: 0.001 })
    return
  }
  // 「봇 답의 첫 줄」 검사용 — 짧은 한 줄 + 빈 줄 + 본문
  if (/머리줄/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '정리했습니다\n\n**4건**을 옮겼고, 중복 2건은 합쳤습니다. 원본 문장은 지우지 않고 상세로 내렸어요.' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  // 「입력창 흔들림」 재현용 — 글자 조각을 3초 동안 40ms 마다 흘려 «답변 스트리밍 중 타이핑» 조건을 만든다
  // O · 마크다운을 조각조각 흘리는 긴 답 — 제목·굵게·목록·펜스 코드·긴 줄. 화면 흔들림(±px 왕복·점프)을 재는 데 쓴다
  if (/마크다운스트리밍/.test(text)) {
    const doc = '## 증상 정리\n\n**증상**: 스트리밍 중에 화면이 흔들린다. 토큰이 도착할 때마다 무언가가 생겼다 사라진다.\n\n### N-3. 여러 장 첨부\n\n- 첫째 줄 — 아주 긴 줄입니다 ' + 'ㄱㄴㄷㄹㅁㅂㅅ'.repeat(12) + ' 끝\n- 둘째 줄 `코드조각` 과 **굵게**\n- 셋째 줄\n\n```js\nconst a = 1\nconst reallyLongLine = "' + 'x'.repeat(140) + '"\n```\n\n1. 하나\n2. 둘\n3. 셋\n\n마무리 문단입니다. 여기까지 오면 끝.\n'
    const parts = []; for (let i = 0; i < doc.length; i += 6) parts.push(doc.slice(i, i + 6))
    let n = 0
    const tick = setInterval(() => {
      if (n >= parts.length) { clearInterval(tick); say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: doc }], stop_reason: 'end_turn' } }); say({ type: 'result', subtype: 'success', duration_ms: 8000, total_cost_usd: 0.001 }); return }
      say({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: parts[n] } } }); n++
    }, 40)
    return
  }
  if (/긴스트리밍/.test(text)) {
    let n = 0; const words = '스트리밍 중에 입력창이 흔들리는지 재는 긴 답변입니다 '.split(' ')
    const tick = setInterval(() => {
      if (n >= 60) { clearInterval(tick); say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '끝' }], stop_reason: 'end_turn' } }); say({ type: 'result', subtype: 'success', duration_ms: 3000, total_cost_usd: 0.001 }); return }
      say({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: words[n % words.length] + ' ' } } }); n++
    }, 50)
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
  // 「mermaid · KaTeX」 검사용 — 그림 펜스와 수식
  if (/그림수식/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '이렇게요\n\n```mermaid\ngraph TD\n  A[시작] --> B[끝]\n```\n\n식은 $E=mc^2$ 이고 블록은\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n돈은 $5 와 $10 그대로.' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 40, total_cost_usd: 0.001 })
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
  if (/미룬질문/.test(text)) {
    const id = `stub-ask-${u}`; pendingDeferred = id
    const input = { questions: [{ question: '미룬 질문은 무엇으로 할까요?', header: '미룸', options: [{ label: '예 안' }, { label: '아니오 안' }] }] }
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input }] } })
    say({ type: 'result', subtype: 'success', stop_reason: 'tool_deferred', deferred_tool_use: { id, name: 'AskUserQuestion', input }, duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  if (/질문/.test(text)) {
    pendingAsk = true
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id: `req-${randomUUID()}`, request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', display_name: 'AskUserQuestion', description: '', input: { questions: [
      { question: '첫 질문은 무엇으로 할까요?', header: '하나', options: [{ label: '가 안', description: '첫째' }, { label: '나 안' }] },
      { question: '둘째 질문은 무엇으로 할까요?', header: '둘', options: [{ label: '다 안' }, { label: '라 안' }] },
      // 여러 개 고르는 질문 (2026-09-20 Dave: «중복 선택이 안되네») — 화면이 토글로 그리는지 재려고 스텁에 둔다
      { question: '함께 켤 것을 모두 고르세요', header: '여럿', multiSelect: true, options: [{ label: '마 안' }, { label: '바 안' }, { label: '사 안' }] }
    ] }, permission_suggestions: [] } }) + '\n')
    return
  }
  // 복합 Bash — 실 CLI 는 이런 명령에 permission_suggestions 를 **비워** 보낸다(«항상 허용» 단추가 사라지던 원인)
  if (/맨손 승인/.test(text)) {
    pendingReq = { text }
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id: `req-${randomUUID()}`, request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Bash', description: '명령을 실행합니다', input: { command: 'cd /tmp/x && npm run qa 2>&1 | tee log.txt' }, permission_suggestions: [] } }) + '\n')
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
