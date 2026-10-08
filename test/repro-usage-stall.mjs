#!/usr/bin/env node
/**
 * BO · 사용량을 세는 동안 호스트가 멈추는가 (2026-10-08 Dave: «원격에서 새 세션을 열면 채팅 창이 늦게 열린다»).
 *
 * 맥미니 실측 — 최근 7일 대화 기록 643MB 를 **동기로** 다 읽어 `/api/usage` 한 번에 2.5초 동안 아무 요청도 못 받았다.
 * 턴이 끝날 때마다 모든 화면이 0.8초 뒤 사용량을 물어서, 멈춤이 «답을 읽고 다음 것을 누르는» 순간에 겹쳤다.
 *
 * 여기서는 큰 가짜 기록(기본 80MB)을 둔 호스트에 `/api/usage` 를 묻는 동안 `/api/health` 를 20ms 마다 두드려
 * **가장 늦은 응답**을 잰다. 문턱(기본 150ms)을 넘으면 실패.
 *   node test/repro-usage-stall.mjs            # 빌드(dist/)를 잰다 — 먼저 npm run build
 *   MB=200 LIMIT=150 node test/repro-usage-stall.mjs
 * ⚠ 실제 ~/.claude 를 읽지 않는다 — 홈(FOLDERBOT_HOME)·데이터를 임시 폴더로 갈아 끼운다.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MB = Number(process.env.MB || 150)
const LIMIT = Number(process.env.LIMIT || 150)
const PORT = Number(process.env.PORT || 7391)
const tmp = mkdtempSync(join(tmpdir(), 'fb-stall-'))
const home = join(tmp, 'home'); const data = join(tmp, 'data'); const root = join(tmp, 'vault')
mkdirSync(join(root, '2. Projects/2026-10_예시'), { recursive: true })
writeFileSync(join(root, '2. Projects/2026-10_예시/CLAUDE.md'), '# 예시\n')

// 가짜 기록 — Claude Code 기록처럼 usage 줄(본문 포함)과 긴 도구 결과 줄이 섞인다. 40개 파일로 나눈다
// ⚠ 시각은 파일마다 달라야 한다 — 같은 시각·같은 토큰이면 «같은 턴» 으로 접힌다(usage.ts events())
const now = Date.now()
const filler = '한국어 본문과 코드가 섞인 도구 결과 '.repeat(120)   // 실제 기록처럼 한국어 — utf8 해독 비용까지 흉내 낸다
const usageLine = (t) => JSON.stringify({ type: 'assistant', timestamp: new Date(t).toISOString(), message: { model: 'claude-opus-5', content: [{ type: 'text', text: filler }], usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 5 } } })
const toolLine = () => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: filler }] } })
const FILES = 40; const perFile = Math.ceil((MB * 1024 * 1024) / FILES)
let total = 0, uses = 0
for (let f = 0; f < FILES; f++) {
  const dir = join(home, '.claude', 'projects', `-proj-${f % 8}`); mkdirSync(dir, { recursive: true })
  const lines = []; let size = 0
  while (size < perFile) { const l = (lines.length % 3 === 0) ? usageLine(now - 3600_000 + f * 10_000 + lines.length) : toolLine(); if (lines.length % 3 === 0) uses++; lines.push(l); size += l.length + 1 }
  writeFileSync(join(dir, `s${f}.jsonl`), lines.join('\n') + '\n'); total += size
}
console.log(`가짜 기록 ${FILES}개 · ${(total / 1024 / 1024).toFixed(0)}MB · usage 줄 ${uses}`)

const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: home, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: join(home, '.claude') }
const run = (args) => new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', ...args], { env }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('exit', (c) => (c === 0 ? res(out) : rej(new Error(out)))) })
await run(['init', root])
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
let log = ''; host.stdout.on('data', (d) => (log += d)); host.stderr.on('data', (d) => (log += d))
const base = `http://127.0.0.1:${PORT}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const done = (code) => { host.kill(); rmSync(tmp, { recursive: true, force: true }); process.exit(code) }
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break } catch { /* 아직 */ } await wait(100) }

// 켜진 직후(미리 세기가 있다면 그것까지)부터 /api/usage 답이 올 때까지 **내내** 두드린다 — 멈춤이 언제 오든 잡힌다
let stop = false; const lat = []
const poll = (async () => { while (!stop) { const t = performance.now(); try { await (await fetch(base + '/api/health')).text() } catch { /* */ } lat.push(performance.now() - t); await wait(20) } })()
await wait(Number(process.env.SETTLE || 3000))
const t0 = performance.now(); const j = await (await fetch(base + '/api/usage')).json(); const took = performance.now() - t0
await wait(100); stop = true; await poll
const max = Math.max(...lat)
const tokens = (j.tools ?? []).find((t) => t.tool === 'claude')?.tokens
console.log(`/api/usage ${took.toFixed(0)}ms · 켜진 뒤 /api/health 최대 ${max.toFixed(0)}ms (${lat.length}번) · claude 토큰 ${tokens ?? '없음'}`)
const expect = uses * (10 + 20 + 300 + 5)
if (tokens !== expect) { console.error(`✗ 토큰 합이 틀렸다 — 기대 ${expect} · 받은 ${tokens}`); console.error(log); done(1) }
if (max > LIMIT) { console.error(`✗ 사용량을 세는 동안 호스트가 ${max.toFixed(0)}ms 멈췄다 (문턱 ${LIMIT}ms)`); done(1) }
console.log(`✓ 사용량을 세는 동안에도 호스트가 ${LIMIT}ms 안에 답한다`)
done(0)
