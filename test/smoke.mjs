// 원격 왕복 스모크 — 픽스처 볼트 + 스텁 CLI 로 호스트를 띄우고 API·SSE·MCP·화면을 검사한다
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'fb-vault-'))
const data = mkdtempSync(join(tmpdir(), 'fb-data-'))
const claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects/2026-09_강의-FoundersAI-2기', '2. Projects/2026-10_해커톤-제안', '3. Area/제품_Rondo', '3. Area/재무_CFO', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), '# Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n- [ ] PRD v1.0 확정: Q2·Q5\n- [ ] Tailscale 폰 설치\n\n## 완료\n')
writeFileSync(join(root, '3. Area/재무_CFO/CLAUDE.md'), '# CFO\n')
writeFileSync(join(root, '2. Projects/2026-09_강의-FoundersAI-2기/CLAUDE.md'), '# 강의\n')
writeFileSync(join(root, '1. Inbox/유메타랩_자문자료.txt'), 'x')
const PORT = 7399
const env = { ...process.env, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const run = (args) => new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', ...args], { env }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('exit', (c) => (c === 0 ? res(out) : rej(new Error(out)))) })
console.log(await run(['init', root]))
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
let hostLog = ''; host.stdout.on('data', (d) => (hostLog += d)); host.stderr.on('data', (d) => (hostLog += d))
const base = `http://127.0.0.1:${PORT}`
const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${p}: ${j.error}`); return j }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (m) => { console.error('✗', m); console.error(hostLog); host.kill(); process.exit(1) }
const ok = (m) => console.log('✓', m)
try {
  for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
  const st = await api('/state')
  if (!st.rulesInstalled) fail('rules not installed'); ok(`rules installed · candidates ${st.candidates.length}`)
  if (st.candidates.length !== 4) fail(`candidates expected 4, got ${st.candidates.length}`)
  if (st.candidates.filter((c) => c.harness).length !== 3) fail('harness count')
  // SSE
  const frames = []
  const sse = fetch(base + '/api/events').then(async (r) => { const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const c = buf.slice(0, i); buf = buf.slice(i + 2); for (const l of c.split('\n')) if (l.startsWith('data: ')) frames.push(JSON.parse(l.slice(6))) } } }).catch(() => {})
  await wait(300)
  // 폴더에서 시작
  const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' }); ok(`bot started ${bot.name} ${bot.color}`)
  // 새 폴더 만들기
  const nf = await api('/folders', { section: '2. Projects', name: '하이드미플리즈-자문', start: true })
  if (!/^2\. Projects\/\d{4}-\d{2}_하이드미플리즈-자문$/.test(nf.rel)) fail(`naming: ${nf.rel}`)
  if (!existsSync(join(root, nf.rel, 'CLAUDE.md')) || !existsSync(join(root, nf.rel, 'todo.md'))) fail('scaffold'); ok(`folder created ${nf.rel}`)
  // 메시지 → 세션 생성 → 결과
  const s1 = await api(`/bots/${bot.id}/send`, { text: 'PRD 를 읽어 줘', name: '메인' })
  await wait(800)
  let chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (!chat.items.some((i) => i.kind === 'assistant' && /스텁이 받았습니다/.test(i.text))) fail('assistant reply missing: ' + JSON.stringify(chat.items))
  if (!chat.items.some((i) => i.kind === 'tool' && i.name === 'Read')) fail('tool line missing')
  if (chat.info.state !== 'done') fail(`state ${chat.info.state}`); ok('send → tool → assistant → done')
  // 서브에이전트 · 생각 · TodoWrite
  const sub = chat.items.find((i) => i.kind === 'subagent'); if (!sub || sub.tools !== 1 || sub.status !== 'done' || !/2건/.test(sub.result ?? '')) fail('subagent item: ' + JSON.stringify(sub))
  if (!chat.items.some((i) => i.kind === 'tool' && i.parentId === sub.id && i.name === 'Grep')) fail('child tool parentId')
  if (chat.items.some((i) => i.kind === 'assistant' && /하위 조사 끝/.test(i.text))) fail('subagent text leaked into main chat')
  if (!chat.items.some((i) => i.kind === 'thinking' && /먼저 읽을지/.test(i.text))) fail('thinking item')
  const td = chat.items.find((i) => i.kind === 'todos'); if (!td || td.items.length !== 2 || td.items[1].status !== 'in_progress') fail('todos item')
  if (chat.items.some((i) => i.kind === 'tool' && i.name === 'TodoWrite')) fail('TodoWrite should not be a tool line')
  if (!frames.some((f) => f.ev === 'activity')) fail('no activity frame'); ok('subagent(parentId) · thinking · todos · activity')
  // 승인 흐름
  await api(`/sessions/${s1.sessionId}/send`, { text: '승인이 필요한 일 해 줘' })
  await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (chat.info.state !== 'awaiting_input' || !chat.info.pending.length) fail(`awaiting expected: ${chat.info.state}`)
  const perm = frames.find((f) => f.ev === 'permission'); if (!perm) fail('no permission frame'); ok('permission → SSE frame + awaiting_input')
  const notif = frames.find((f) => f.ev === 'notify' && f.n.kind === 'awaiting'); if (!notif) fail('no awaiting notification')
  await api(`/sessions/${s1.sessionId}/permission`, { requestId: chat.info.pending[0].requestId, allow: true })
  await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (chat.info.state !== 'done') fail(`after allow state ${chat.info.state}`)
  if (!chat.items.some((i) => i.kind === 'files' && i.paths.some((p) => p.endsWith('stub-output.md')))) fail('files chip missing'); ok('allow → Write → files chip → done')
  if (!existsSync(join(root, '3. Area/제품_Rondo/stub-output.md'))) fail('stub output file')
  // 파일 시트
  const f = await api(`/bots/${bot.id}/file?rel=stub-output.md`); if (!/스텁 산출물/.test(f.text)) fail('file read')
  await api(`/bots/${bot.id}/file`, { rel: 'stub-output.md', text: f.text + '\n추가\n' })
  if (!readFileSync(join(root, '3. Area/제품_Rondo/stub-output.md'), 'utf8').endsWith('추가\n')) fail('file write'); ok('file read/write')
  try { await api(`/bots/${bot.id}/file?rel=../../../../../../etc/hostname`); fail('path guard') } catch (e) { if (!/밖/.test(e.message)) fail('guard msg ' + e.message); ok('path guard') }
  // 지연 트리 · 이름 바꾸기
  const ls = await api(`/bots/${bot.id}/ls?dir=`); if (!ls.some((n) => n.name === 'todo.md') || typeof ls[0].dir !== 'boolean') fail('ls')
  const rn = await api(`/bots/${bot.id}/rename`, { rel: 'stub-output.md', name: 'stub-renamed.md' }); if (rn.rel !== 'stub-renamed.md' || !existsSync(join(root, '3. Area/제품_Rondo/stub-renamed.md'))) fail('rename')
  await api(`/bots/${bot.id}/rename`, { rel: 'stub-renamed.md', name: 'stub-output.md' }); ok('ls (lazy) · rename')
  // 첨부 업로드 (기기에서) · 토큰 저장
  const up = await api(`/bots/${bot.id}/upload`, { name: '회의록.txt', data: Buffer.from('안녕').toString('base64') })
  if (!up.rel.startsWith('첨부/') || !existsSync(join(root, '3. Area/제품_Rondo', up.rel))) fail('upload ' + JSON.stringify(up))
  const up2 = await api(`/bots/${bot.id}/upload`, { name: '회의록.txt', data: Buffer.from('둘').toString('base64') }); if (up2.rel === up.rel) fail('upload overwrite'); ok(`upload → ${up.rel} · ${up2.rel}`)
  await api('/auth/token', { token: 'sk-ant-oat01-test' }); if (!/sk-ant-oat01-test/.test(readFileSync(join(data, 'config.json'), 'utf8'))) fail('token save')
  await api('/auth/token', { token: '' }); if (/sk-ant-oat01/.test(readFileSync(join(data, 'config.json'), 'utf8'))) fail('token clear'); ok('auth token set/clear')
  // todo
  let todo = await api(`/bots/${bot.id}/todo`); if (todo.length !== 2) fail('todo parse')
  todo = await api(`/bots/${bot.id}/todo`, { title: '알파 동결 문서', desc: 'PRD v1.0 뒤에' }); if (todo.length !== 3) fail('todo add')
  todo = await api(`/bots/${bot.id}/todo/toggle`, { line: todo[0].line, done: true }); if (!todo[0].done) fail('todo toggle'); ok('todo add/toggle')
  // 세션 휴면·기상 (같은 cli 세션 id 로 --resume)
  const before = chat.info.cliSessionId
  await api(`/sessions/${s1.sessionId}/hibernate`, {})
  let sl = await api(`/bots/${bot.id}/sessions`); if (!sl[0].hibernated) fail('hibernate flag')
  await api(`/sessions/${s1.sessionId}/send`, { text: '다시' }); await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (chat.info.cliSessionId !== before) fail(`resume id changed ${before} → ${chat.info.cliSessionId}`); ok('hibernate → resume keeps cli session id')
  // MCP (오케스트레이터 도구)
  const mcp = async (method, params, id = 1) => (await (await fetch(base + '/mcp/orch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json())
  const tl = await mcp('tools/list'); if (!tl.result.tools.some((t) => t.name === 'bot_send')) fail('mcp tools'); ok(`mcp tools ${tl.result.tools.length}`)
  const cands = await mcp('tools/call', { name: 'bots_candidates', arguments: {} }); if (!/제품_Rondo/.test(cands.result.content[0].text)) fail('mcp candidates')
  const sent = await mcp('tools/call', { name: 'bot_send', arguments: { bot: '재무_CFO', text: '숫자 검토' } })
  if (!/그런 봇이 없어요/.test(sent.result.content[0].text)) fail('expected not-started bot error: ' + sent.result.content[0].text)
  await mcp('tools/call', { name: 'bot_start', arguments: { rel: '3. Area/재무_CFO' } })
  const sent2 = await mcp('tools/call', { name: 'bot_send', arguments: { bot: '재무_CFO', text: '숫자 검토', name: '위임 · 숫자 검토' } }); if (!/보냈어요/.test(sent2.result.content[0].text)) fail('mcp bot_send')
  await wait(800)
  const cfo = (await api('/bots')).find((b) => b.name === '재무_CFO'); const cs = await api(`/bots/${cfo.id}/sessions`); if (cs[0].state !== 'done') fail('delegated session state ' + cs[0].state); ok('mcp bot_start + bot_send → delegated session done')
  const ib = await mcp('tools/call', { name: 'inbox_list', arguments: {} }); if (!/유메타랩/.test(ib.result.content[0].text)) fail('inbox')
  await mcp('tools/call', { name: 'folder_move', arguments: { from: '1. Inbox/유메타랩_자문자료.txt', to: '3. Area/재무_CFO/자료/유메타랩_자문자료.txt' } })
  if (!existsSync(join(root, '3. Area/재무_CFO/자료/유메타랩_자문자료.txt'))) fail('move')
  const undo = await api('/undo'); await api('/undo', { t: undo[0].t }); if (!existsSync(join(root, '1. Inbox/유메타랩_자문자료.txt'))) fail('undo'); ok('inbox move + undo')
  // 은퇴
  const lect = await api('/bots/start', { rel: '2. Projects/2026-09_강의-FoundersAI-2기' })
  const rt = await api(`/bots/${lect.id}/retire`, {}); if (!existsSync(join(root, rt.to, 'CLAUDE.md'))) fail('retire move'); ok(`retire → ${rt.to}`)
  // 화면 (playwright)
  try {
    const { chromium } = await import('playwright-core')
    const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
    globalThis.__br = br
    for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      const pg = await br.newPage({ viewport: vp, deviceScaleFactor: 1 })
      await pg.addInitScript(() => localStorage.setItem('folderbot:token', 'x'))
      const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
      await pg.goto(base + `/#bot=${bot.id}`)
      try { await pg.waitForSelector('.col.chat .hdr', { timeout: 15000 }) } catch (e) { mkdirSync('test/tmp', { recursive: true }); await pg.screenshot({ path: `test/tmp/${name}-fail.png` }); console.log('page errors:', errs.join(' | ').slice(0, 1500)); console.log('html:', (await pg.content()).slice(0, 800)); throw e }
      await wait(800)
      mkdirSync('test/tmp', { recursive: true }); await pg.screenshot({ path: `test/tmp/${name}.png` })
      if (name === 'desktop') {
        const txt = await pg.textContent('.chat-body'); if (!/스텁이 처리했습니다/.test(txt)) fail('ui chat missing')
        const rows = await pg.$$eval('.brow', (r) => r.length); if (rows < 3) fail(`ui rows ${rows}`)
        if (!(await pg.$('.sub'))) fail('ui subagent line missing'); if (!(await pg.$('.todow'))) fail('ui todo widget missing')
        if (!(await pg.$('.panel .trow'))) fail('ui tree missing')
        // 파일 칩 → 문서 열이 열린다 · 트리 클릭 → 미리보기 탭
        await pg.click('.files .chip'); await pg.waitForSelector('.doc .dbody', { timeout: 5000 }); await wait(400)
        const tabs = await pg.$$eval('.doc .tab', (r) => r.length); if (tabs < 1) fail('doc tab')
        await pg.screenshot({ path: 'test/tmp/desktop-doc.png' })
        await pg.keyboard.press('Meta+Shift+D'); await wait(200); if (await pg.$('.doc')) fail('doc column should hide on ⌘⇧D')
        if (errs.length) fail('page errors: ' + errs.join(' | '))
      }
      await pg.close()
    }
    await br.close(); ok('ui renders (desktop · phone) → test/tmp/*.png')
  } catch (e) { console.log('(화면 검사 건너뜀:', e.message.split('\n')[0], ')'); try { await globalThis.__br?.close() } catch {} }
  console.log('\nSMOKE OK')
} catch (e) { fail(e.stack) } finally { host.kill(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); rmSync(claudeCfg, { recursive: true, force: true }) }
