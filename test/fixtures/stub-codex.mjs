#!/usr/bin/env node
// 가짜 codex CLI — `codex exec --json` 이 내는 이벤트 모양의 최소만 말한다 (테스트 전용).
// ⚠ 진짜 Codex 의 이벤트 이름은 판마다 바뀐다. 여기서 재는 것은 **옮기는 층**(host/codex.ts)이지
//    이름 자체가 아니다 — 이름이 바뀌면 «모르는 줄» 경로로 떨어지고 그것도 검사가 있다.
import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
const argv = process.argv.slice(2)
if (argv[0] === '--version') { process.stdout.write('codex-cli 9.9.9\n'); process.exit(0) }
/**
 * ⚠ 우리는 넘기기 전에 **부속 명령마다 도움말을 읽어** 있는 깃발만 쓴다 — 그 길도 여기서 잰다.
 * 🔴 **`resume` 은 깃발이 좁다** (진짜 codex 가 그렇다):
 *      Usage: codex exec resume --json <SESSION_ID> [PROMPT]
 *    `--sandbox`·`--skip-git-repo-check` 가 없다. 한 벌로 묶으면 **두 번째 턴부터** 전부 죽는다.
 */
if (argv[0] === 'exec' && argv.includes('--help')) {
  if (argv[1] === 'resume') process.stdout.write('Usage: codex exec resume --json <SESSION_ID> [PROMPT]\n  --json\n  -c <KEY=VALUE>\n')
  else process.stdout.write('Usage: codex exec [OPTIONS] [PROMPT]\n  --json\n  --sandbox <MODE>\n  --skip-git-repo-check\n  --model <M>\n  -c <KEY=VALUE>\n')
  process.exit(0)
}
// 🔴 진짜 codex 처럼 **모르는 깃발에 죽는다** — 안 그러면 이 스텁은 아무 실수도 안 잡는다
{
  const known = new Set(['--json', '--sandbox', '--skip-git-repo-check', '--model', '-c', '--help'])
  const sub = argv[0] === 'exec' && argv[1] === 'resume' ? 'resume' : 'exec'
  const allowed = sub === 'resume' ? new Set(['--json', '-c', '--help']) : known
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('-')) continue
    if (!allowed.has(a)) {
      process.stderr.write(`error: unexpected argument '${a}' found\nUsage: codex ${sub === 'resume' ? 'exec resume --json <SESSION_ID> [PROMPT]' : 'exec [OPTIONS] [PROMPT]'}\n`)
      process.exit(2)
    }
    if (a !== '--json' && a !== '--skip-git-repo-check' && a !== '--help') i++   // 값을 먹는 깃발
  }
}
/**
 * ⚠ 세션 id 는 **깃발 뒤, 프롬프트 앞**이다(`codex exec resume --json <SESSION_ID> [PROMPT]`).
 *    `argv[2]` 로 못 박아 두면 호스트가 자리를 고쳐도 스텁이 눈치를 못 챈다.
 */
const resume = argv[0] === 'exec' && argv[1] === 'resume' ? argv.slice(2).filter((a) => !a.startsWith('-') && !/^model_reasoning_effort=/.test(a))[0] ?? null : null
const sid = resume ?? `cx-${randomUUID()}`
const prompt = argv[argv.length - 1].replace(/^<folderbot-client\s+[^>]*\/>\s*/, '')   // J · 기기 블록은 떼고 본다(실제 CLI 는 그대로 읽는다)
// ⚠ 우리가 무엇을 넘겼는지 **파일로 남긴다** — 모델·노력·샌드박스·키가 실제로 CLI 까지 가는지는
//    이 방법으로만 잴 수 있다(가짜 CLI 는 플래그를 쓰지 않으니 화면에는 흔적이 안 남는다).
if (process.env.FOLDERBOT_CODEX_ARGV) {
  try { appendFileSync(process.env.FOLDERBOT_CODEX_ARGV, JSON.stringify({ argv: [...argv.slice(0, -1), prompt], key: process.env.OPENAI_API_KEY ?? null }) + '\n') } catch {}   // 프롬프트는 기기 블록을 뗀 것으로 남긴다
}
/**
 * 🔴 **진짜 codex 처럼 stdin 이 닫힐 때까지 기다린다** — `codex exec` 는 stdin 이 터미널이 아니면
 *    거기서도 프롬프트를 읽는다. 호스트가 파이프를 안 닫으면 CLI 는 영원히 기다리고, 화면은
 *    «시작하는 중» 에서 멎는다(2026-09-13 Dave 신고). 그 자리를 여기서 잰다 —
 *    호스트가 `stdin.end()` 를 빼먹으면 이 스텁도 답을 안 해서 스모크가 빨개진다.
 */
await new Promise((done) => { process.stdin.resume(); process.stdin.on('end', done); process.stdin.on('error', done) })
const say = (msg) => process.stdout.write(JSON.stringify({ id: '0', msg }) + '\n')
say({ type: 'session_configured', session_id: sid })
say({ type: 'task_started' })
say({ type: 'exec_command_begin', call_id: 'c1', command: ['bash', '-lc', 'ls'] })
say({ type: 'exec_command_end', call_id: 'c1', exit_code: 0, stdout: 'readme.md\n' })
/**
 * 🔴 **새 판(item/turn) 모양도 낸다** — codex-cli 0.4x+ 는 조각 없이 `item.completed` 한 줄로만
 *    답을 준다. 그 글자는 `item.text` 에 있는데 종전 코드는 `msg.text` 만 봐서 **화면이 조용히
 *    비었다**(2026-09-13 Dave: «codex 로 실행한 세션에서 답이 안와»).
 *    한 턴에 두 모양을 섞어 내서 **둘 다** 읽히는지 잰다.
 */
if (/새판/.test(prompt)) {
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: sid }) + '\n')
  process.stdout.write(JSON.stringify({ type: 'item.completed', item: { id: 'i0', item_type: 'assistant_message', text: `«${prompt}» 새 판으로 답했어요.` } }) + '\n')
  process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 7, output_tokens: 2 } }) + '\n')
  process.exit(0)
}
if (/빈턴/.test(prompt)) { process.stderr.write('error: something went wrong\n'); process.exit(3) }   // 답 없이 끝나는 턴
/**
 * 🔴 **계정이 모델을 거절하는 턴** — ChatGPT 계정은 쓸 수 있는 모델이 구독마다 다르다.
 *    우리가 `--model` 을 박아 넘기면 그 계정에서 **모든 턴이 400 으로 죽는다**(2026-09-13 실사고).
 *    여기서는 «--model 이 붙어 오면 거절, 안 붙어 오면 대답» 으로 그 길을 그대로 흉내 낸다 —
 *    호스트가 모델을 빼고 다시 보내는지가 이 한 갈래로 잰다.
 */
if (/모델거절/.test(prompt)) {
  if (argv.includes('--model')) {
    say({ type: 'error', message: `{"type":"error","status":400,"error":{"message":"The '${argv[argv.indexOf('--model') + 1]}' model is not supported when using Codex with a ChatGPT account."}}` })
    process.exit(1)
  }
  say({ type: 'agent_message', message: '기본 모델로 답했어요' })
  process.exit(0)
}
for (const chunk of [`«${prompt}»`, ' 확인했어요.']) say({ type: 'agent_message_delta', delta: chunk })
say({ type: 'token_count', info: { input_tokens: 120, output_tokens: 40, cached_input_tokens: 900 } })
say({ type: 'wildly_new_event_name', detail: 'x' })   // 표에 없는 줄 — 버리지 않고 흘려보내야 한다
say({ type: 'task_complete', last_agent_message: 'ok' })
process.exit(0)
