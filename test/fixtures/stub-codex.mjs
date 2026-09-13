#!/usr/bin/env node
// 가짜 codex CLI — `codex exec --json` 이 내는 이벤트 모양의 최소만 말한다 (테스트 전용).
// ⚠ 진짜 Codex 의 이벤트 이름은 판마다 바뀐다. 여기서 재는 것은 **옮기는 층**(host/codex.ts)이지
//    이름 자체가 아니다 — 이름이 바뀌면 «모르는 줄» 경로로 떨어지고 그것도 검사가 있다.
import { randomUUID } from 'node:crypto'
const argv = process.argv.slice(2)
if (argv[0] === '--version') { process.stdout.write('codex-cli 9.9.9\n'); process.exit(0) }
const resume = argv[0] === 'exec' && argv[1] === 'resume' ? argv[2] : null
const sid = resume ?? `cx-${randomUUID()}`
const prompt = argv[argv.length - 1]
const say = (msg) => process.stdout.write(JSON.stringify({ id: '0', msg }) + '\n')
say({ type: 'session_configured', session_id: sid })
say({ type: 'task_started' })
say({ type: 'exec_command_begin', call_id: 'c1', command: ['bash', '-lc', 'ls'] })
say({ type: 'exec_command_end', call_id: 'c1', exit_code: 0, stdout: 'readme.md\n' })
for (const chunk of [`«${prompt}»`, ' 확인했어요.']) say({ type: 'agent_message_delta', delta: chunk })
say({ type: 'token_count', info: { input_tokens: 120, output_tokens: 40, cached_input_tokens: 900 } })
say({ type: 'wildly_new_event_name', detail: 'x' })   // 표에 없는 줄 — 버리지 않고 흘려보내야 한다
say({ type: 'task_complete', last_agent_message: 'ok' })
process.exit(0)
