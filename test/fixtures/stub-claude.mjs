#!/usr/bin/env node
// 가짜 claude CLI — 진짜와 같은 stream-json 프로토콜의 최소만 말한다 (테스트 전용)
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { writeFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
const argv = process.argv.slice(2)
const at = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
if (argv[0] === 'auth') { process.stdout.write(JSON.stringify({ loggedIn: process.env.STUB_LOGGED_OUT ? false : true, authMethod: 'claude.ai', email: 'qa@example.com', subscriptionType: 'max' }) + '\n'); process.exit(0) }
/**
 * 맥락 상황판(2026-11-01 · host/context.ts) — 한 번 묻기의 첫 줄 표지(`CARD_MARK`·`GROUP_MARK`·`AXIS_MARK`)로 갈래를 고른다.
 *    답은 호스트 파서(`parseCard`·`parseGroup`)가 읽는 JSON 그대로. 스모크는 **대화 글**로 결과를 고른다:
 *    카드 — `STUB_CUT` 끊김 · `STUB_CLAIM <경로>` 그 파일을 근거로 끝남 · 그 밖은 «끝남» 인데 근거 없음(호스트가 claimed 로 내린다)
 *    묶기 — 새 카드를 모두 «스모크 작업» 에. 새 카드 글에 `STUB_REGROUP` 이 있으면 모두 «딴 작업» 에
 *    축 — 한 문장. 표지가 없으면 null(제목 묻기 갈래로)
 */
function contextReply(inp) {
  const first = inp.split('\n', 1)[0].trim()
  if (first === '[[folderbot:context-card]]') {
    const i = inp.indexOf('\n대화\n')
    const convo = i >= 0 ? inp.slice(i + 4) : ''
    if (/STUB_CUT/.test(convo)) return JSON.stringify({ intent: '스모크 일', done: [], promised: ['마저 하기'], ending: 'cut', taskHint: '스모크 작업' })
    const claim = /STUB_CLAIM (\S+)/.exec(convo)
    if (claim) return JSON.stringify({ intent: '스모크 일', done: [{ text: '다 했어요', ev: [{ kind: 'file', ref: claim[1] }] }], promised: [], ending: 'finished', taskHint: '스모크 작업' })
    // 그 밖 — 사람 말 첫 줄을 intent 로 되읊는다(묶기 갈래가 새 카드 글에서 `STUB_REGROUP` 을 본다)
    const said = /^\[사람\] (.*)$/m.exec(convo)?.[1] ?? ''
    return JSON.stringify({ intent: said.slice(0, 80), done: [], promised: [], ending: 'finished', taskHint: '스모크 작업' })
  }
  if (first === '[[folderbot:context-group]]') {
    const lines = inp.split('\n')
    const from = lines.indexOf('새 카드')
    const cards = []
    for (let k = from + 1; from >= 0 && k < lines.length && lines[k].trim(); k++) { try { const c = JSON.parse(lines[k]); if (c && typeof c.id === 'string') cards.push(c) } catch { /* 카드 줄이 아니다 */ } }
    const title = cards.some((c) => JSON.stringify(c).includes('STUB_REGROUP')) ? '딴 작업' : '스모크 작업'
    return JSON.stringify({ assign: cards.map((c) => ({ card: c.id, task: `new:${title}` })), tasks: [{ id: `new:${title}`, title, summary: '스모크 요약', missing: '' }] })
  }
  if (first === '[[folderbot:context-axis]]') return '오늘은 스모크가 축이다'
  return null
}
/** DC · 세션 제목 한 번 묻기(`titleLLM.ts`) — `-p --output-format text` 로 오면 질문 앞머리로 «“제목: …”» 꼴을 돌려준다(호스트가 꾸밈을 걷는지도 잰다) */
if (at('--output-format') === 'text') {
  let inp = ''; process.stdin.on('data', (c) => { inp += c }); process.stdin.on('end', () => {
    const ctx = contextReply(inp)
    if (ctx !== null) { process.stdout.write(ctx + '\n'); process.exit(0) }
    const q =(/\[질문\] (.*)/.exec(inp)?.[1] ?? '').slice(0, 8)
    if (/제목실패/.test(inp)) { process.stderr.write('boom\n'); process.exit(1) }
    process.stdout.write(`제목: “요약 ${q}”\n`); process.exit(0)
  })
} else {
/**
 * 🔴 **계정이 안 받아 주는 모델** — 요금제마다 쓸 수 있는 모델이 다르다(긴 문맥은 특히).
 *    `--model` 로 그 이름이 오면 진짜 CLI 처럼 **그 자리에서 죽는다.** 호스트가 모델을 빼고
 *    한 번 더 보내는지가 이 한 갈래로 잰다 (2026-09-14).
 */
if (/못쓰는모델/.test(at('--model') ?? '')) {
  process.stderr.write(`Error: The model '${at('--model')}' is not supported on your plan.\n`)
  process.exit(1)
}
/**
 * CL-1 B · 되감기 — 진짜 CLI 처럼 `--resume-session-at <답 uuid> --fork-session` 이면 그 답까지의 기록만 가진 **새 세션**으로 시작한다.
 *    «기억확인» 에는 기록에 남은 사람 말을 되읊어, 되감긴 뒤의 대화가 멈춘 말을 모르는지 검사가 본다.
 */
const tdir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'))
// LM · 스모크가 봇의 시스템 프롬프트(«이어진 폴더» 카드)를 재게 받은 값을 남긴다
if (process.env.STUB_SYSPROMPT_LOG && at('--append-system-prompt')) { try { appendFileSync(process.env.STUB_SYSPROMPT_LOG, JSON.stringify({ cwd: process.cwd(), p: at('--append-system-prompt') }) + '\n') } catch { /* */ } }
const forkAt = argv.includes('--fork-session') ? at('--resume-session-at') : undefined
const sessionId = forkAt ? `stub-fork-${randomUUID()}` : at('--resume') ?? `stub-${randomUUID()}`
/**
 * 🔴 **대화 안에서 모델을 바꾼다** — 진짜 CLI 는 `/model <이름>` 을 받아 그 세션의 모델을 갈고,
 *    그 뒤의 답에는 **바뀐 이름**이 찍혀 온다 (2026-09-15 Dave: «모델이 바뀌었지만 하단에 반영이 안되네»).
 */
let model = at('--model') ?? 'stub'
/**
 * 🔴 **EB · 권한 모드** (2026-11-11 · CLI 2.1.322 실측을 흉내) — 실 CLI 처럼 `system/init` 에 `permissionMode` 를 싣고, 제어 요청
 *    `set_permission_mode` 로 도는 중에 바꾼다. 검사가 갈래를 고르는 스위치는 `<CLAUDE_CONFIG_DIR>/stub-perm.json` 이다(워커가 뜰 때 읽는다):
 *      auto: 'reject'    — `--permission-mode auto` 를 모르는 옛 CLI 처럼 그 자리에서 죽는다
 *      auto: 'downgrade' — auto 를 요청해도 수동(default)으로 뜬다(계정이 Auto 를 못 받는 경우)
 *      auto: 'loose'     — auto 를 요청했는데 그 맥의 설정을 따라 bypassPermissions 로 뜬다(수동보다 느슨하다 — 호스트가 다시 띄워야 한다)
 *      inherit: '<모드>' — 모드 인자 없이 뜨면 이 모드로 뜬다(실 CLI 가 `~/.claude/settings.json` 의 `permissions.defaultMode` 를 따르는 것)
 *      ctl: 'off'        — set_permission_mode 를 모르는 요청이라고 거절한다 · 'silent' — 아예 답하지 않는다(옛 CLI)
 *    실 CLI 그대로: `bypassPermissions` 는 그 모드로 뜬 워커가 아니면 `bypass_not_launched` 로 거절한다 · 모르는 모드는 `invalid_mode`.
 */
const PERM_VALID = ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan']
let permSw = {}; try { permSw = JSON.parse(readFileSync(join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'stub-perm.json'), 'utf8')) } catch { /* 스위치 없음 — 평소 */ }
const permAsked = at('--permission-mode')
if (permAsked === 'auto' && permSw.auto === 'reject') {
  process.stderr.write("error: option '--permission-mode <mode>' argument 'auto' is invalid. Allowed choices are acceptEdits, bypassPermissions, default, dontAsk, plan.\n")
  process.exit(1)
}
const launchedBypass = permAsked === 'bypassPermissions' || argv.includes('--dangerously-skip-permissions')
let permMode = permAsked === 'auto' && permSw.auto === 'downgrade' ? 'default' : permAsked === 'auto' && permSw.auto === 'loose' ? 'bypassPermissions' : permAsked ?? permSw.inherit ?? 'default'
const say = (o) => { if (o.type === 'system' && o.subtype === 'init') o = { ...o, permissionMode: permMode }; process.stdout.write(JSON.stringify({ session_id: sessionId, ...o }) + '\n'); if (o.type === 'assistant') rec({ type: 'assistant', uuid: randomUUID(), message: { content: o.message?.content } }) }
// 트랜스크립트 파일을 흉내 — --resume 판정이 이걸 본다
const tfile = join(tdir, `${sessionId}.jsonl`)
try {
  mkdirSync(tdir, { recursive: true })
  if (forkAt) {
    const old = readFileSync(join(tdir, `${at('--resume')}.jsonl`), 'utf8').split('\n').filter(Boolean)
    const k = old.findIndex((l) => { try { return JSON.parse(l).uuid === forkAt } catch { return false } })
    writeFileSync(tfile, (k >= 0 ? old.slice(0, k + 1) : [JSON.stringify({ cwd: process.cwd() })]).join('\n') + '\n')
  } else if (!existsSync(tfile)) writeFileSync(tfile, JSON.stringify({ cwd: process.cwd() }) + '\n')
} catch {}
const rec = (o) => { try { appendFileSync(tfile, JSON.stringify(o) + '\n') } catch {} }
const memory = () => { try { return readFileSync(tfile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === 'user' && typeof e.text === 'string').map((e) => e.text) } catch { return [] } }
say({ type: 'system', subtype: 'init', model, tools: [], mcp_servers: [], slash_commands: ['compact', 'context', 'review', 'goal', 'loop'] })
const rl = createInterface({ input: process.stdin })
let pendingReq = null, pendingAsk = null, pendingDeferred = null, slowTimer = null, pendingModeReq = null
/**
 * EA · 맡긴 일(2026-11-11 · CLI 2.1.322 실측을 흉내) — 뒤에서 도는 작업들. `stop_task` 가 올 때까지(또는 90초) 돈다.
 *    task_id → { tid(도구 호출 id) · type(local_agent|local_bash) · desc · sub(subagent_type) · timer }
 */
const bgLive = new Map()
let heldTurn = null
/**
 * EC · 끼워 넣기(2026-11-11 · CLI 2.1.322 실측을 흉내) — 턴이 도는 중에 stdin 으로 온 `priority: "next"` 사용자 메시지는 **새 턴을 열지 않고**
 *    그 턴에 든다(실 CLI 는 도는 도구가 끝난 직후 모델에게 보이고, 모델이 같은 턴 안에서 따랐다 — result 한 번).
 *    `느린일` 턴이 도는 동안만 받는다(`steered` 가 배열일 때). 턴 끝의 답에 받은 말과 **받은 priority 값**을 드러낸다 — 검사가 그 글을 본다.
 *    ⚠ 우선순위가 없는 메시지는 종전대로 따로 답한다 — 실 CLI 는 우선순위가 없어도 같은 턴에서 따랐지만(11/11), 스텁은 호스트가
 *      `priority` 를 실제로 실어 보내는지를 재려고 둘을 가른다(안 실으면 답이 따로 서서 검사가 빨개진다).
 *    도는 턴이 없을 때 온 `next` 메시지는 실 CLI 처럼 보통 말이다(새 턴).
 */
let steered = null
const bgList = () => ({ type: 'system', subtype: 'background_tasks_changed', tasks: [...bgLive.entries()].map(([task_id, t]) => ({ task_id, task_type: t.type, ...(t.sub ? { subagent_type: t.sub } : {}), description: t.desc })) })
rl.on('line', (raw) => {
  let msg; try { msg = JSON.parse(raw) } catch { return }
  /**
   * BD · **실제 요금제 한도** — 진짜 CLI 의 stream-json 제어 요청 `get_usage` 와 같은 모양으로 답한다(2.1.283 실측).
   *    `STUB_PLAN=off` 면 옛 CLI 처럼 모르는 요청이라고 거절한다. 값은 `STUB_PLAN_FIVE`·`STUB_PLAN_WEEK`(사용 %).
   */
  if (msg.type === 'control_request' && msg.request?.subtype === 'get_usage') {
    if (process.env.STUB_PLAN === 'off') { say({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: 'Unknown control request subtype: get_usage' } }); return }
    const five = Number(process.env.STUB_PLAN_FIVE ?? 25), week = Number(process.env.STUB_PLAN_WEEK ?? 68)
    say({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response: {
      subscription_type: 'max', rate_limits_available: true,
      rate_limits: { five_hour: { utilization: five, resets_at: new Date(Date.now() + 2 * 3600e3).toISOString() }, seven_day: { utilization: week, resets_at: new Date(Date.now() + 30 * 3600e3).toISOString() } }
    } } })
    return
  }
  /**
   * CL-1 · 멈추기 — 실 CLI(2.1.288)와 같은 순서: control_response(still_queued) → 거절된 도구 결과 → «[Request interrupted…]» → result(error_during_execution · is_error)
   *    느린 턴(`느린일`)만 멈출 수 있다 — 나머지는 이미 끝났다.
   */
  /**
   * EA · 작업 하나 멈추기 — 실 CLI(2.1.322)와 같은 순서: control_response(success) → task_updated{killed} → task_notification{stopped}
   *    → background_tasks_changed(남은 것) → 본 에이전트가 «사용자가 멈췄다» 알림을 받아 한 번 답한다(턴이 끝나 있을 때는 새 턴으로).
   *    모르는 task_id 면 오류로 답한다.
   */
  if (msg.type === 'control_request' && msg.request?.subtype === 'stop_task') {
    const id = String(msg.request.task_id ?? ''); const t = bgLive.get(id)
    if (!t) { say({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: `No task found with ID: ${id}` } }); return }
    clearTimeout(t.timer); bgLive.delete(id)
    say({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response: {} } })
    say({ type: 'system', subtype: 'task_updated', task_id: id, patch: { status: 'killed', end_time: Date.now() } })
    say({ type: 'system', subtype: 'task_notification', task_id: id, tool_use_id: t.tid, status: 'stopped', output_file: '', summary: `${t.desc} — 사용자가 멈춤` })
    say(bgList())
    if (!heldTurn) {
      say({ type: 'system', subtype: 'init', model, tools: [], mcp_servers: [], slash_commands: [] })
      say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `멈춤 확인: ${id}` }], stop_reason: 'end_turn' } })
      say({ type: 'result', subtype: 'success', duration_ms: 20, total_cost_usd: 0.001 })
    }
    return
  }
  // EB · 도는 워커의 모드 바꾸기 — 실 CLI(2.1.322 · 11/11 실측)와 같은 순서: control_response(success · {mode}) → system/status{permissionMode}
  if (msg.type === 'control_request' && msg.request?.subtype === 'set_permission_mode') {
    const mode = String(msg.request.mode ?? '')
    if (permSw.ctl === 'silent') return
    if (permSw.ctl === 'off') { say({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: 'Unknown control request subtype: set_permission_mode' } }); return }
    if (!PERM_VALID.includes(mode)) { say({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: `Cannot set permission mode: must be one of ${PERM_VALID.join(', ')}`, error_code: 'invalid_mode' } }); return }
    if (mode === 'bypassPermissions' && !launchedBypass) { say({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: 'Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions', error_code: 'bypass_not_launched' } }); return }
    permMode = mode
    say({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response: { mode } } })
    say({ type: 'system', subtype: 'status', status: null, permissionMode: mode })
    return
  }
  if (msg.type === 'control_request' && msg.request?.subtype === 'interrupt') {
    say({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response: { still_queued: [] } } })
    if (slowTimer) {
      clearTimeout(slowTimer); slowTimer = null; steered = null
      say({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } })
      rec({ type: 'user', uuid: randomUUID(), message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } })   // 실 CLI 는 기록에도 이 줄을 남긴다(리뷰 10/16)
      say({ type: 'result', subtype: 'error_during_execution', is_error: true, stop_reason: 'tool_use', duration_ms: 100, total_cost_usd: 0, errors: ['[ede_diagnostic] result_type=user'] })
    }
    return
  }
  /**
   * 🔴 **질문 카드(AskUserQuestion)** — 답이 **어느 질문에 붙어서** 돌아오는지까지 재려고 그대로 되읊는다.
   *    (2026-09-15 Dave: «AskUserQuestion 에서 추가 Text를 입력하면 위에 전체에 나오네» — 화면의
   *    「기타」 칸이 하나뿐이라 모든 질문에 같은 글이 떴고, 보낼 때도 **첫 질문의 답**으로 갔다.)
   */
  // EB · «모드대로:» 가 물은 승인의 답 — 거절이면 **받은 사유를 그대로** 되읊는다(승인 시간 초과의 사유가 모델까지 오는지 재려고)
  if (msg.type === 'control_response' && pendingModeReq) {
    const { tool, rest } = pendingModeReq; pendingModeReq = null
    const inner = msg.response?.response ?? {}
    const text = inner.behavior === 'allow' ? `허용 받아 실행: ${tool} (모드 ${permMode})` : `거절 받음: ${inner.message ?? ''}`
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: rest ? `${text}\n\n${rest}` : text }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 60, total_cost_usd: 0.001 })
    return
  }
  if (msg.type === 'control_response' && pendingAsk) {
    pendingAsk = null
    const answers = msg.response?.response?.updatedInput?.answers ?? {}
    // DL · 고친 미리보기 글(annotations)도 되읊는다 — 화면에서 고친 글이 CLI 입력까지 오는지 재려고
    const ann = msg.response?.response?.updatedInput?.annotations
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: `답변 받음: ${JSON.stringify(answers)}${ann ? ` 주석: ${JSON.stringify(ann)}` : ''}` }], stop_reason: 'end_turn' } })
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
    }, !allow && /거부뒤느림/.test(text) ? 2500 : 150)   // EC · «거부뒤느림» — 거부한 뒤에도 턴이 2.5초 더 돈다(거부 직후의 ⎋ 가 턴까지 멈추는지 재려고)
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
    // 결과와 같은 메시지에 사람 글이 실려 오면(채팅으로 답함 · 2026-10-02) 그 글을 답으로 받는다
    const chat = msg.message.content.filter((x) => x.type === 'text').map((x) => x.text).join('').replace(/^<folderbot-client\s+[^>]*\/>\s*/, '')
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: chat ? `채팅 답 받음: ${chat}` : tr.is_error ? '미룬 질문 취소됨' : `미룬 답 받음: ${tr.content}` }] } })
    // ⚠ 턴을 바로 끝내지 않는다 — 스크린샷_234 는 답 뒤로 6분짜리 턴이 이어지는 동안 질문 줄이 돌았다.
    //    턴 끝(result)은 호스트가 열린 줄을 다 닫으므로, 바로 끝내면 버그가 가려진다.
    setTimeout(() => say({ type: 'result', subtype: 'success', duration_ms: 3000, total_cost_usd: 0.001 }), 3000)
    return
  }
  /**
   * 🔴 **미뤄진 질문에 답 없이 채팅만 오면 실 모델처럼 같은 질문을 새 id 로 다시 묻는다** (2026-10-02 Dave: «AskUserQuestion 을
   *    두번씩 동일한 내용을 보낼때가 있어»). 호스트가 남은 질문을 닫지 않으면 이 길로 들어와 카드가 둘 선다.
   */
  if (pendingDeferred && tr && tr.tool_use_id !== pendingDeferred) {
    // CQ · 죽은 질문 앞으로 온 답 — 실 CLI 는 이것을 새 턴으로 받아 지금 걸린 질문까지 버린다
    const id = `stub-cut-C-${randomUUID().slice(0, 6)}`; pendingDeferred = id
    const input = { questions: [{ question: '끊겨서 또 여쭤요 — 무엇으로 할까요?', header: '스택', options: [{ label: '정적 페이지' }] }] }
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input }] } })
    say({ type: 'result', subtype: 'success', stop_reason: 'tool_deferred', deferred_tool_use: { id, name: 'AskUserQuestion', input }, duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  if (pendingDeferred && !tr) {
    const id = `stub-ask-${randomUUID().slice(0, 6)}`; pendingDeferred = id
    const input = { questions: [{ question: '미룬 질문은 무엇으로 할까요?', header: '미룸', options: [{ label: '예 안' }, { label: '아니오 안' }] }] }
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input }] } })
    say({ type: 'result', subtype: 'success', stop_reason: 'tool_deferred', deferred_tool_use: { id, name: 'AskUserQuestion', input }, duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  const rawText = msg.message?.content?.map?.((b) => b.text ?? '').join('') ?? ''
  // J · 메시지 앞의 기기 블록은 떼고 본다(실제 CLI 는 그대로 읽는다). «기기확인» 이면 블록을 그대로 되읊어 검사가 값을 본다
  const cm = /^<folderbot-client\s+[^>]*\/>\s*/.exec(rawText); const clientBlock = cm ? cm[0].trim() : ''; const text = cm ? rawText.slice(cm[0].length) : rawText
  const u = randomUUID().slice(0, 6)
  const before = memory()
  rec({ type: 'user', uuid: randomUUID(), text, message: { content: rawText } })
  // EC · 도는 턴에 끼워 넣은 말 — 새 턴을 열지 않는다(위 `steered` 머리말)
  if (msg.priority === 'next' && steered) { steered.push({ text, priority: msg.priority, block: !!clientBlock }); return }
  if (/기억확인/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: `기억: ${before.join(' | ')}` }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 30, total_cost_usd: 0.001 })
    return
  }
  if (/^기기확인/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: clientBlock ? '기기 블록: `' + clientBlock + '`' : '기기 블록 없음' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 10, total_cost_usd: 0.001 })
    return
  }
  // CC 검사용 — 워커가 받은 글 전체를 돌려준다(갈라 연 채팅의 맥락이 워커에게만 갔는지 재려고)
  if (/전부되읊어/.test(text)) {
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text }], stop_reason: 'end_turn' } })
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
  /**
   * CF-2 · 실 CLI 는 글 **맨 앞이 `/`** 일 때만 슬래시 명령으로 받는다(2.1.288 실측 — 기기 블록이 붙은 `/context` 는 모델이 받아 Bash 를 돌렸다).
   *   그래서 판정은 블록을 뗀 `text` 가 아니라 **받은 글 그대로(`rawText`)** 로 한다.
   */
  const sl = /^\/([a-z][\w:-]*)/i.exec(rawText.trimStart())
  if (sl && (sl[1] === 'goal' || sl[1] === 'loop')) {
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: `슬래시 받음: ${sl[1]}` }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 10, total_cost_usd: 0 })
    return
  }
  const sl2 = /^\/(goal|loop|compact)\b/.exec(text.trimStart())
  if (sl2 && !sl) {
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: `슬래시가 글로 들어옴: ${sl2[1]}` }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 10, total_cost_usd: 0.001 })
    return
  }
  // 자동 압축(2026-10-02) — 실 CLI 처럼 경계 줄과 결과를 낸다. 잠깐 걸려야 «압축 중에 온 말은 큐» 를 잴 수 있다
  if (rawText.trim() === '/compact') {
    setTimeout(() => {
      say({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 150000 } })
      say({ type: 'result', subtype: 'success', duration_ms: 400, total_cost_usd: 0.001 })
    }, 400)
    return
  }
  // CK-3 검사용 — 봇이 Edit 로 todo.md 에 바로 한 줄 쓴다(«제안» 경로를 안 거친 줄). 있던 줄의 설명도 하나 고친다
  if (/할일몰래쓰기|몰래한줄:/.test(text)) {   // `몰래한줄:` — «할 일»·«쓰기» 가 없어 사람 턴 검사에서 할 일 요청으로 안 읽힌다
    const f = join(process.cwd(), 'todo.md'); const id = `stub-e-${u}`
    const nm = /(?:할일몰래쓰기|몰래한줄):(\S+)/.exec(text)?.[1] ?? '봇이 몰래 쓴 줄'   // 사람 턴 검사는 줄 이름을 바꿔 쓴다
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Edit', input: { file_path: f, old_string: '', new_string: `- [ ] ${nm}: Edit 로 바로` } }] } })
    try { const cur = readFileSync(f, 'utf8'); writeFileSync(f, cur.replace('- [ ] 원래 있던 줄: 설명 <!-- bot -->', '- [ ] 원래 있던 줄: 설명 고침(못 한 이유) <!-- bot -->') + `- [ ] ${nm}: Edit 로 바로\n`) } catch {}
    say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } })
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '할 일 썼어요' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  // 「대기열」 검사용 — 한 턴이 **느리게** 돌아야 그 사이에 보낸 말이 대기열에 쌓인다
  if (/느린일/.test(text)) {
    // CI-2 · «중간» 이면 끝나기 전에 답 한 줄을 먼저 낸다 — 턴 도중 저장(호스트가 그 사이 죽어도 남는가)을 잰다
    if (/중간/.test(text)) say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '중간 보고 — 반쯤 했어요' }], stop_reason: 'tool_use' } })
    steered = []
    slowTimer = setTimeout(() => { slowTimer = null
      // EC · 이 턴에 끼워 넣은 말이 있으면 같은 턴의 답에 반영한다(받은 priority 값을 드러낸다)
      const got = steered ?? []; steered = null
      const tail = got.length ? `\n\n끼워 넣은 말 반영(priority=${got.map((g) => g.priority).join(',')}${got.every((g) => g.block) ? ' · 기기 블록 있음' : ''}): ${got.map((g) => g.text).join(' | ')}` : ''
      say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `느린 일 끝${tail}` }], stop_reason: 'end_turn' } })
      say({ type: 'result', subtype: 'success', duration_ms: 1500, total_cost_usd: 0.001 })
    }, /느린일 (\d+)초/.test(text) ? Number(/느린일 (\d+)초/.exec(text)[1]) * 1000 : /느린일 길게/.test(text) ? 8000 : 2500)   // DA · «느린일 55초» — ask 기본 50초를 넘기는 턴
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
  /**
   * EA · «맡긴일 뒤에서» — 백그라운드 에이전트 둘과 뒤에서 도는 셸 하나를 띄운다. 셋 다 `stop_task` 가 올 때까지 돈다(90초 뒤 스스로 끝남).
   *    `턴중` 이 붙으면 턴을 6초 동안 닫지 않는다 — «턴이 도는 중에 하나만 멈추기» 를 잰다. 안 붙으면 바로 턴이 끝난다(«턴이 끝난 뒤 멈추기»).
   *    줄 순서는 실 CLI 2.1.322: tool_use → task_started → tool_result(즉시) → background_tasks_changed.
   */
  if (/맡긴일 뒤에서/.test(text)) {
    const launch = (tid, task, type, desc, sub) => {
      const timer = setTimeout(() => { if (!bgLive.delete(task)) return
        say({ type: 'system', subtype: 'task_notification', task_id: task, tool_use_id: tid, status: 'completed', summary: `${desc} 끝` }); say(bgList()) }, 90000)
      bgLive.set(task, { tid, type, desc, sub, timer })
    }
    const a = { tid: `stub-ag1-${u}`, task: `agt1${u}`, desc: '로그 훑기', sub: 'Explore' }, b = { tid: `stub-ag2-${u}`, task: `agt2${u}`, desc: '문서 조사', sub: 'general-purpose' }, sh = { tid: `stub-sh-${u}`, task: `bash${u}`, desc: '개발 서버 띄우기' }
    for (const g of [a, b]) {
      say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: g.tid, name: 'Agent', input: { description: g.desc, prompt: `${g.desc} 를 해 줘`, subagent_type: g.sub, run_in_background: true } }] } })
      launch(g.tid, g.task, 'local_agent', g.desc, g.sub)
      say({ type: 'system', subtype: 'task_started', task_id: g.task, tool_use_id: g.tid, description: g.desc, subagent_type: g.sub, is_backgrounded: true, task_type: 'local_agent', prompt: `${g.desc} 를 해 줘` })
      say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: g.tid, content: [{ type: 'text', text: `Async agent launched successfully.\nagentId: ${g.task}` }] }] } })
      say(bgList())
    }
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: sh.tid, name: 'Bash', input: { command: 'npm run dev', description: sh.desc, run_in_background: true } }] } })
    launch(sh.tid, sh.task, 'local_bash', sh.desc)
    say({ type: 'system', subtype: 'task_started', task_id: sh.task, tool_use_id: sh.tid, description: sh.desc, is_backgrounded: true, task_type: 'local_bash' })
    say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: sh.tid, content: `Command running in background with ID: ${sh.task}` }] } })
    say(bgList())
    // 첫 에이전트가 도구를 하나 쓴다 — 목록의 «도구 1 · 마지막 한 일» 을 재려고
    say({ type: 'assistant', parent_tool_use_id: a.tid, message: { role: 'assistant', content: [{ type: 'tool_use', id: `stub-agc-${u}`, name: 'Grep', input: { pattern: 'ERROR', path: process.cwd() } }] } })
    say({ type: 'user', parent_tool_use_id: a.tid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `stub-agc-${u}`, content: '3 matches' }] } })
    const end = () => { heldTurn = null
      say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '셋을 맡겼어요 — 끝나면 알려 드릴게요.' }], stop_reason: 'end_turn' } })
      say({ type: 'result', subtype: 'success', duration_ms: 50, total_cost_usd: 0.001 }) }
    if (/턴중/.test(text)) heldTurn = setTimeout(end, 6000); else end()
    return
  }
  /**
   * EA · «맡긴일 긴결과» — 앞에서 도는(백그라운드가 아닌) 서브에이전트가 300자·2000자를 넘는 마크다운 결과를 돌려준다. 끝에 표식(`끝표식-EA9`)이 있다.
   *    실 CLI 처럼 서브에이전트 기록 파일(`<세션 id>/subagents/agent-<task_id>.jsonl`)도 남긴다 — 글 두 덩이 + 도구 호출 + 1.2MB 짜리 도구 결과 한 줄(읽는 쪽이 버려야 한다).
   */
  if (/맡긴일 긴결과/.test(text)) {
    const tid = `stub-rep-${u}`, task = `agt9${u}`
    const report = '## 조사 결과\n\n' + Array.from({ length: 30 }, (_, i) => `- 항목 ${i + 1}: ` + '폴더를 훑어 확인한 사실을 한 줄씩 적는다 '.repeat(3).trim()).join('\n') + '\n\n**결론**: 세 군데를 고치면 된다. 끝표식-EA9'
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name: 'Agent', input: { description: '긴 보고서 쓰기', prompt: '폴더를 훑어 **긴 보고서**를 써 줘', subagent_type: 'general-purpose' } }] } })
    say({ type: 'system', subtype: 'task_started', task_id: task, tool_use_id: tid, description: '긴 보고서 쓰기', subagent_type: 'general-purpose', is_backgrounded: false, task_type: 'local_agent', prompt: '폴더를 훑어 긴 보고서를 써 줘' })
    say({ type: 'assistant', parent_tool_use_id: tid, message: { role: 'assistant', content: [{ type: 'tool_use', id: `stub-repc-${u}`, name: 'Grep', input: { pattern: 'todo', path: process.cwd() } }] } })
    say({ type: 'user', parent_tool_use_id: tid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `stub-repc-${u}`, content: '2 matches' }] } })
    try {
      const dir = join(tdir, sessionId, 'subagents'); mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `agent-${task}.jsonl`), [
        { type: 'user', message: { role: 'user', content: '폴더를 훑어 긴 보고서를 써 줘' } },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '먼저 폴더를 훑어보겠습니다. 기록표식-W1' }, { type: 'tool_use', id: 'x1', name: 'Grep', input: { pattern: 'todo' } }] } },
        { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x1', content: 'y'.repeat(1_200_000) }] } },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: report }] } },
      ].map((x) => JSON.stringify(x)).join('\n') + '\n')
    } catch {}
    say({ type: 'assistant', parent_tool_use_id: tid, message: { role: 'assistant', content: [{ type: 'text', text: '보고서를 다 썼습니다' }] } })
    say({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: [{ type: 'text', text: report }] }] } })
    say({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '보고서를 받았습니다.' }], stop_reason: 'end_turn' } })
    say({ type: 'result', subtype: 'success', duration_ms: 80, total_cost_usd: 0.001 })
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
    }, /느리게/.test(text) ? 5000 : 700)   // «느리게» — 화면이 대기 줄을 다시 그릴 시간을 준다(AB-3 경주 · 2026-10-09)
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
  /**
   * 🔴 **CQ · 질문을 기다리는 동안 하위 에이전트 결과가 먼저 든다** (2026-10-17 · 스크린샷_2346). 실 CLI 는 그 보고를 새 턴으로
   *    돌리며 기다리던 질문을 «결과 없음» 으로 버리고, 모델은 **문구를 바꿔 새 id 로** 다시 묻는다. 그 흐름을 그대로 낸다.
   */
  if (/끼어든질문/.test(text)) {
    const a = `stub-cut-A-${u}`, b = `stub-cut-B-${u}`; pendingDeferred = a
    const qa = { questions: [{ question: '심사 앱 스택은 무엇으로 할까요?', header: '스택', options: [{ label: '정적 페이지' }, { label: '앱 서버' }] }] }
    const qb = { questions: [{ question: '심사 앱 스택을 다시 여쭤요 — 무엇으로 할까요?', header: '스택', options: [{ label: '정적 페이지' }, { label: '앱 서버' }] }] }
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'tool_use', id: a, name: 'AskUserQuestion', input: qa }] } })
    say({ type: 'result', subtype: 'success', stop_reason: 'tool_deferred', deferred_tool_use: { id: a, name: 'AskUserQuestion', input: qa }, duration_ms: 40, total_cost_usd: 0.001 })
    setTimeout(() => {
      pendingDeferred = b
      say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: '하위 에이전트 결과를 받았어요.' }] } })
      say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'tool_use', id: b, name: 'AskUserQuestion', input: qb }] } })
      say({ type: 'result', subtype: 'success', stop_reason: 'tool_deferred', deferred_tool_use: { id: b, name: 'AskUserQuestion', input: qb }, duration_ms: 40, total_cost_usd: 0.001 })
    }, 1200)
    return
  }
  /**
   * DL · 미리보기 질문 (2026-10-26 Dave: «미리 확인하는 내용이 블록에 들어가 예쁘게 · 내가 수정도 · 수정한 게 바로 반영») — 실행 선택지에 보낼 글 전문.
   *    «미룬미리보기» 는 같은 질문을 미뤄진 질문(tool_deferred)으로 낸다.
   */
  const PV_MAIL = '받는 사람: 박찬수 대표\n제목: 11/3 워크숍 확정 안내\n\n대표님, 안녕하세요.\n11/3(월) 오후 2시 워크숍을 확정했습니다.\n\n장소: 성수 A 홀\n준비물: 노트북\n\n진대연 드림'
  const pvInput = { questions: [{ question: '박찬수 대표에게 확정 메일을 보낼까요?', header: '메일', options: [{ label: '실행', description: '아래 글 그대로 보냅니다', preview: PV_MAIL }, { label: '고쳐서 실행' }, { label: '하지 않음' }] }] }
  if (/미룬미리보기/.test(text)) {
    const id = `stub-ask-${u}`; pendingDeferred = id
    say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: pvInput }] } })
    say({ type: 'result', subtype: 'success', stop_reason: 'tool_deferred', deferred_tool_use: { id, name: 'AskUserQuestion', input: pvInput }, duration_ms: 40, total_cost_usd: 0.001 })
    return
  }
  if (/미리보기질문/.test(text)) {
    pendingAsk = true
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id: `req-${randomUUID()}`, request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', display_name: 'AskUserQuestion', description: '', input: pvInput, permission_suggestions: [] } }) + '\n')
    return
  }
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
  /**
   * EB · `모드대로:<도구>` — 실 CLI 처럼 **지금 모드가 정한 대로** 한다(다른 «승인» 갈래는 모드를 모르고 늘 묻는다).
   *    bypassPermissions 는 전부 · acceptEdits 는 편집 도구 · auto 는 «위험» 이 붙지 않은 것을 묻지 않고 실행하고, 그 밖은 승인을 묻는다.
   *    `느리게` 가 붙으면 2.5초 뒤에 판단한다 — 그 사이 모드를 바꾸면 바뀐 모드로 판단한다(«도는 중에 모드 바꾸기» 를 잰다).
   *    `결과줄:<글>` 이 붙으면 답 끝에 그 줄을 덧붙인다(루틴의 `결과: ok` 흉내).
   */
  const byMode = /모드대로:(\S+)/.exec(text)
  if (byMode) {
    const tool = byMode[1]; const rest = /결과줄:(.+)$/m.exec(text)?.[1]?.trim() ?? ''
    const decide = () => { slowTimer = null
      const free = permMode === 'bypassPermissions' || (permMode === 'acceptEdits' && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) || (permMode === 'auto' && !/위험/.test(text))
      if (free) {
        const t = `모드 ${permMode} — 묻지 않고 실행: ${tool}`
        say({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: rest ? `${t}\n\n${rest}` : t }], stop_reason: 'end_turn' } })
        say({ type: 'result', subtype: 'success', duration_ms: 30, total_cost_usd: 0.001 })
        return
      }
      pendingModeReq = { tool, rest }
      process.stdout.write(JSON.stringify({ type: 'control_request', request_id: `req-${randomUUID()}`, request: { subtype: 'can_use_tool', tool_name: tool, display_name: tool, description: '모드가 정한 대로 묻는다', input: tool === 'Bash' ? { command: 'rm -rf build' } : { file_path: join(process.cwd(), 'by-mode.md'), content: 'x' }, permission_suggestions: [] } }) + '\n')
    }
    if (/느리게/.test(text)) slowTimer = setTimeout(decide, 2500); else decide()
    return
  }
  // 복합 Bash — 실 CLI 는 이런 명령에 permission_suggestions 를 **비워** 보낸다(«항상 허용» 단추가 사라지던 원인)
  if (/맨손 승인/.test(text)) {
    pendingReq = { text }
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id: `req-${randomUUID()}`, request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Bash', description: '명령을 실행합니다', input: { command: 'cd /tmp/x && npm run qa 2>&1 | tee log.txt' }, permission_suggestions: [] } }) + '\n')
    return
  }
  // 아무 도구나 승인을 묻게 한다 — `도구승인:mcp__folderbot__todo_add` (연결 채널이 묻지 않고 답하는지 재려고 · 2026-10-11)
  const askTool = /도구승인:(\S+)/.exec(text)
  if (askTool) {
    pendingReq = { text }
    process.stdout.write(JSON.stringify({ type: 'control_request', request_id: `req-${randomUUID()}`, request: { subtype: 'can_use_tool', tool_name: askTool[1], display_name: askTool[1], description: '', input: {}, permission_suggestions: [] } }) + '\n')
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

}
