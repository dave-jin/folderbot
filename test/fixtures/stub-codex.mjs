#!/usr/bin/env node
// 가짜 codex CLI — `codex exec --json` 이 내는 이벤트 모양의 최소만 말한다 (테스트 전용).
// ⚠ 진짜 Codex 의 이벤트 이름은 판마다 바뀐다. 여기서 재는 것은 **옮기는 층**(host/codex.ts)이지
//    이름 자체가 아니다 — 이름이 바뀌면 «모르는 줄» 경로로 떨어지고 그것도 검사가 있다.
import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
const argv = process.argv.slice(2)
if (argv[0] === '--version') { process.stdout.write('codex-cli 9.9.9\n'); process.exit(0) }
const resume = argv[0] === 'exec' && argv[1] === 'resume' ? argv[2] : null
const sid = resume ?? `cx-${randomUUID()}`
const prompt = argv[argv.length - 1]
// ⚠ 우리가 무엇을 넘겼는지 **파일로 남긴다** — 모델·노력·샌드박스·키가 실제로 CLI 까지 가는지는
//    이 방법으로만 잴 수 있다(가짜 CLI 는 플래그를 쓰지 않으니 화면에는 흔적이 안 남는다).
if (process.env.FOLDERBOT_CODEX_ARGV) {
  try { appendFileSync(process.env.FOLDERBOT_CODEX_ARGV, JSON.stringify({ argv, key: process.env.OPENAI_API_KEY ?? null }) + '\n') } catch {}
}
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
