// 원격 왕복 스모크 — 픽스처 볼트 + 스텁 CLI 로 호스트를 띄우고 API·SSE·MCP·화면을 검사한다
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'fb-vault-'))
const data = mkdtempSync(join(tmpdir(), 'fb-data-'))
const claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects/2026-09_강의-창업스쿨-2기', '2. Projects/2026-10_해커톤-제안', '3. Area/제품_Rondo', '3. Area/재무_CFO', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), '# Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 요청 · 할 일\n- [ ] PRD v1.0 확정: Q2·Q5\n- [ ] Tailscale 폰 설치\n- [ ] 무응답 3건 후속 연락: 9/1 발송분이 엿새째 무응답. ① 가상 대표에게 문자 ② 예시 기관에 「총 1회」 적용 범위 문의 ③ 답을 보고 다음 회차를 정한다\n\n## 진행 중\n- [ ] 표지 문구 3안: 편집자에게 보냄\n\n## 완료\n')
writeFileSync(join(root, '3. Area/재무_CFO/CLAUDE.md'), '# CFO\n')
writeFileSync(join(root, '2. Projects/2026-09_강의-창업스쿨-2기/CLAUDE.md'), '# 강의\n')
writeFileSync(join(root, '1. Inbox/예시랩_자문자료.txt'), 'x')
writeFileSync(join(root, '3. Area/제품_Rondo', '_MAP_전체구조.md'.normalize('NFD')), '# map\n') // 맥 파일명처럼 NFD
// 맥 파일명처럼 NFD 인, 깊고 뒤쪽에 있는 폴더 — «가운데 낱말로 검색» 회귀 방어 (2026-09-13)
mkdirSync(join(root, '5. Archive', '2025-04_트레바리-북클럽'.normalize('NFD'), '01_기획'), { recursive: true })
mkdirSync(join(root, '.projectbot'), { recursive: true }); writeFileSync(join(root, '.projectbot/marker.txt'), 'legacy')
const PORT = 7399
const fbHome = mkdtempSync(join(tmpdir(), 'fb-home-'))
// 사용량 픽스처 — 창 안(5시간) 두 줄. ⚠ Dave 의 실제 ~/.claude 를 읽지 않게 홈을 갈아 끼운다
mkdirSync(join(fbHome, '.folderbot'), { recursive: true })
writeFileSync(join(fbHome, '.folderbot/usage.jsonl'),
  [{ t: Date.now() - 90 * 60 * 1000, tool: 'claude', model: 'claude-opus-5', input: 1200, output: 9000, cacheRead: 240000, cacheWrite: 3000 },
   { t: Date.now() - 10 * 60 * 1000, tool: 'claude', model: 'claude-sonnet-5', input: 900, output: 4000, cacheRead: 80000, cacheWrite: 1000 }].map((x) => JSON.stringify(x)).join('\n') + '\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
/**
 * 🔴 **포트가 이미 잡혀 있으면 그 자리에서 멈춘다** (2026-09-13 실사고).
 *    앞선 실패로 남은 호스트가 같은 포트를 잡고 있으면, 우리는 «건강한 응답» 을 받고 **옛 코드를**
 *    검사하게 된다. 고친 것이 안 고쳐진 것처럼 보이고, 원인을 코드에서 한참 찾게 된다(실제로 그랬다).
 */
const portFree = (port) => new Promise((res) => { const srv = createServer(); srv.once('error', () => res(false)); srv.listen(port, '127.0.0.1', () => srv.close(() => res(true))) })
const needPort = async (port, what) => { if (!(await portFree(port))) fail(`${what}: 포트 ${port} 를 누가 쓰고 있어요 — 앞선 검사의 호스트가 남았는지 보세요(그 프로세스를 재면 옛 코드를 재는 셈입니다)`) }

const run = (args) => new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', ...args], { env }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('exit', (c) => (c === 0 ? res(out) : rej(new Error(out)))) })
console.log(await run(['init', root]))
await needPort(PORT, '메인 호스트')
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
  if (!existsSync(join(root, '.folderbot/marker.txt')) || existsSync(join(root, '.projectbot'))) fail('state dir migration .projectbot → .folderbot'); ok('state dir .projectbot → .folderbot')
  if (st.candidates.length !== 4) fail(`candidates expected 4, got ${st.candidates.length}`)
  if (st.candidates.filter((c) => c.harness).length !== 3) fail('harness count')
  // SSE
  const frames = []
  const sse = fetch(base + '/api/events').then(async (r) => { const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const c = buf.slice(0, i); buf = buf.slice(i + 2); for (const l of c.split('\n')) if (l.startsWith('data: ')) frames.push(JSON.parse(l.slice(6))) } } }).catch(() => {})
  await wait(300)
  // 폴더에서 시작
  const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' }); ok(`bot started ${bot.name} ${bot.color}`)
  // 새 폴더 만들기
  const nf = await api('/folders', { section: '2. Projects', name: '예시고객-자문', start: true })
  if (!/^2\. Projects\/\d{4}-\d{2}_예시고객-자문$/.test(nf.rel)) fail(`naming: ${nf.rel}`)
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
  // 컨텍스트 사용량 (result.usage) · 슬래시 목록 (파일 + CLI init)
  if (!chat.info.ctx || chat.info.ctx.used !== 64000 || chat.info.ctx.window !== 200000) fail('ctx: ' + JSON.stringify(chat.info.ctx))
  mkdirSync(join(root, '3. Area/제품_Rondo/.claude/skills/standup'), { recursive: true }); writeFileSync(join(root, '3. Area/제품_Rondo/.claude/skills/standup/SKILL.md'), '---\nname: standup\ndescription: 어제 한 일·오늘 할 일 정리\n---\n# standup\n')
  mkdirSync(join(root, '.claude/commands'), { recursive: true }); writeFileSync(join(root, '.claude/commands/status.md'), '봇 현황 한 줄\n')
  const slc = await api(`/bots/${bot.id}/slash?sid=${s1.sessionId}`)
  if (!slc.some((c) => c.name === 'standup' && c.kind === 'skill' && c.scope === 'folder' && /어제/.test(c.desc))) fail('slash skill: ' + JSON.stringify(sl))
  if (!slc.some((c) => c.name === 'status' && c.kind === 'command' && c.scope === 'root')) fail('slash root command')
  if (!slc.some((c) => c.name === 'compact' && c.kind === 'cli')) fail('slash cli'); ok(`ctx ${chat.info.ctx.used}/${chat.info.ctx.window} · slash ${slc.length}`)
  // 세션 설정 — 유휴면 워커를 내리고(절전) 같은 id 로 이어서 뜬다 · 모델이 init 에 반영
  const cfg1 = await api(`/sessions/${s1.sessionId}/settings`, { model: 'claude-sonnet-5', permissionMode: 'plan' })
  if (cfg1.model !== 'claude-sonnet-5' || cfg1.permissionMode !== 'plan' || !cfg1.hibernated) fail('settings: ' + JSON.stringify(cfg1))
  const idBefore = cfg1.cliSessionId
  // 백그라운드 서브에이전트: 턴이 끝나도(LAUNCHED) «실행 중» 이고 세션은 bg=1 → 알림이 오면 끝남 + 결과, 이어서 새 턴이 스스로 열린다
  await api(`/sessions/${s1.sessionId}/send`, { text: '백그라운드 조사' }); await wait(350)
  { const its = (await api(`/sessions/${s1.sessionId}/chat`)).items; const sa = its.filter((x) => x.kind === 'subagent').pop(); if (!sa || !sa.bg || sa.status !== 'run') fail('bg agent should stay running after launch: ' + JSON.stringify(sa))
    const si = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === s1.sessionId); if (!si || si.bg !== 1) fail('session bg count ' + JSON.stringify(si)) }
  await wait(1200)
  { const its = (await api(`/sessions/${s1.sessionId}/chat`)).items; const sa = its.filter((x) => x.kind === 'subagent').pop(); if (!sa || sa.status !== 'done' || sa.result !== 'PONG') fail('bg agent should finish via task_notification: ' + JSON.stringify(sa))
    const last = its.filter((x) => x.kind === 'assistant').pop(); if (!last || !/GOT: PONG/.test(last.text)) fail('bg follow-up turn missing: ' + JSON.stringify(last))
    const si = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === s1.sessionId); if (!si || si.bg !== 0 || si.state === 'running') fail('session after bg ' + JSON.stringify(si)); ok('background agent: launch → running → notification → done → follow-up') }
  await api(`/sessions/${s1.sessionId}/send`, { text: '설정 바꾼 뒤' }); await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (chat.info.cliSessionId !== idBefore || chat.info.model !== 'claude-sonnet-5' || !chat.info.alive) fail('settings resume: ' + JSON.stringify(chat.info)); ok('session settings → hibernate → resume with new model')
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
  let todo = await api(`/bots/${bot.id}/todo`); if (todo.length !== 4) fail('todo parse')
  todo = await api(`/bots/${bot.id}/todo`, { title: '알파 동결 문서', desc: 'PRD v1.0 뒤에' }); if (todo.length !== 5) fail('todo add')
  { const target = todo[0]; todo = await api(`/bots/${bot.id}/todo/toggle`, { line: target.line, done: true }); const t2 = todo.find((t) => t.title === target.title); if (!t2 || !t2.done) fail('todo toggle: ' + JSON.stringify(todo.map((t) => [t.title, t.done]))) } ok('todo add/toggle')
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
  const ib = await mcp('tools/call', { name: 'inbox_list', arguments: {} }); if (!/예시랩/.test(ib.result.content[0].text)) fail('inbox')
  await mcp('tools/call', { name: 'folder_move', arguments: { from: '1. Inbox/예시랩_자문자료.txt', to: '3. Area/재무_CFO/자료/예시랩_자문자료.txt' } })
  if (!existsSync(join(root, '3. Area/재무_CFO/자료/예시랩_자문자료.txt'))) fail('move')
  const undo = await api('/undo'); await api('/undo', { t: undo[0].t }); if (!existsSync(join(root, '1. Inbox/예시랩_자문자료.txt'))) fail('undo'); ok('inbox move + undo')
  // 어디서든 시작 — Resources 의 깊은 폴더 · 그 안에 새 폴더 · ls 에 하네스/봇/역할
  mkdirSync(join(root, '4. Resources/2026_브랜딩-DAVE/02_링크드인'), { recursive: true })
  const deep = await api('/bots/start', { rel: '4. Resources/2026_브랜딩-DAVE/02_링크드인' })
  if (deep.section !== '4. Resources' || deep.name !== '02_링크드인' || !existsSync(join(root, deep.rel, 'CLAUDE.md'))) fail('deep start ' + JSON.stringify(deep))
  const nf2 = await api('/folders', { section: '4. Resources/2026_브랜딩-DAVE', name: '03_뉴스레터', start: true }); if (nf2.rel !== '4. Resources/2026_브랜딩-DAVE/03_뉴스레터' || !nf2.bot) fail('folder anywhere ' + JSON.stringify(nf2))
  const vls = await api('/bots/orch/ls?dir='); const res4 = vls.find((n) => n.name === '4. Resources'); if (!res4 || res4.role !== 'reference' || (vls.find((n) => n.name === '2. Projects') ?? {}).role !== 'active') fail('ls role ' + JSON.stringify(vls))
  const dirs = await api('/bots/orch/dirs?depth=6')
  if (!dirs.every((n) => n.dir)) fail('dirs: 파일이 섞였다')
  if (!dirs.find((n) => n.rel.normalize('NFC') === '5. Archive/2025-04_트레바리-북클럽')) fail('dirs: 깊은 NFD 폴더 없음')
  if (!dirs.find((n) => n.rel.normalize('NFC') === '5. Archive/2025-04_트레바리-북클럽/01_기획')) fail('dirs: 4단계 아래 없음')
  ok('dirs index · 폴더만 · 깊이 · NFD')
  const dls = await api(`/bots/orch/ls?dir=${encodeURIComponent('4. Resources/2026_브랜딩-DAVE')}`); if (!dls.find((n) => n.name === '02_링크드인' && n.botId === deep.id && n.harness === true)) fail('ls botId/harness ' + JSON.stringify(dls)); ok('start anywhere · folder anywhere · ls annotations')
  // 이름 — 메인/원격 · 호스트 이름 설정
  let st2 = await api('/state'); if (!st2.hostName || !st2.device?.main) fail('names default ' + JSON.stringify({ h: st2.hostName, d: st2.device }))
  await api('/names', { hostName: '서재 미니' }); st2 = await api('/state'); if (st2.hostName !== '서재 미니' || st2.device.name !== '서재 미니') fail('names set'); await api('/names', { hostName: '' }); ok('host name default → set → reset')
  // 할 일 편집 · 삭제
  let td2 = await api(`/bots/${bot.id}/todo/edit`, { line: todo[1].line, title: '알파 동결 문서 v2', desc: '내일' }); const ed = td2.find((t) => t.line === todo[1].line); if (!ed || ed.title !== '알파 동결 문서 v2' || ed.desc !== '내일') fail('todo edit ' + JSON.stringify(td2))
  td2 = await api(`/bots/${bot.id}/todo/delete`, { line: todo[1].line }); if (td2.some((t) => t.title === '알파 동결 문서 v2')) fail('todo delete'); ok('todo edit · delete')
  // 할 일 2.0 — 절(section) 파싱 · 끌어서 이동 · 체크하면 완료 절로 내려간다
  {
    // 앞 단계에서 지웠을 수 있으니 그 절에 두 줄을 확보한다 (새 할 일은 절 안 마지막에 붙는다)
    await api(`/bots/${bot.id}/todo`, { title: '이동 검사 A', desc: '첫째', section: '요청 · 할 일' })
    await api(`/bots/${bot.id}/todo`, { title: '이동 검사 B', desc: '둘째', section: '요청 · 할 일' })
    const its = await api(`/bots/${bot.id}/todo`)
    if (!its.some((t) => t.section === '요청 · 할 일') || !its.some((t) => t.section === '진행 중')) fail('todo sections: ' + JSON.stringify(its.map((t) => t.section)))
    const sec1 = its.filter((t) => t.section === '요청 · 할 일')
    if (sec1.length < 2) fail('todo add with section: ' + JSON.stringify(its.map((t) => [t.title, t.section])))
    const first = sec1[0]; const second = sec1[1]
    const moved = await api(`/bots/${bot.id}/todo/move`, { line: second.line, before: first.line })
    if (moved.filter((t) => t.section === '요청 · 할 일')[0].title !== second.title) fail('todo move: ' + JSON.stringify(moved.map((t) => t.title)))
    const wip = moved.find((t) => t.section === '진행 중')
    const after = await api(`/bots/${bot.id}/todo/toggle`, { line: wip.line, done: true })
    const nowDone = after.find((t) => t.title === wip.title)
    if (!nowDone || !nowDone.done || !/완료/.test(nowDone.section)) fail('todo check should move into 완료: ' + JSON.stringify(nowDone))
    ok('todo 2.0 — 절 · 이동 · 체크하면 완료 절로')
  }
  // 은퇴
  const lect = await api('/bots/start', { rel: '2. Projects/2026-09_강의-창업스쿨-2기' })
  const rt = await api(`/bots/${lect.id}/retire`, {}); if (!existsSync(join(root, rt.to, 'CLAUDE.md'))) fail('retire move'); ok(`retire → ${rt.to}`)
  // 화면 (playwright)
  try {
    const { chromium } = await import('playwright-core')
    const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
    globalThis.__br = br
    for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      const pg = await br.newPage({ viewport: vp, deviceScaleFactor: 1 })
      await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
      if (name === 'phone') await pg.addInitScript(() => {
        // iOS 키보드 흉내 — 시각 뷰포트 높이만 줄어든다(레이아웃 뷰포트는 그대로: 홈화면 앱·iOS 26 의 동작)
        const H = window.innerHeight, W = window.innerWidth, t = new EventTarget()
        const vv = { width: W, height: H, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1, addEventListener: t.addEventListener.bind(t), removeEventListener: t.removeEventListener.bind(t), dispatchEvent: t.dispatchEvent.bind(t) }
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
        window.__kb = (h) => { vv.height = H - h; vv.offsetTop = 0; vv.dispatchEvent(new Event('resize')) }
        // iOS 는 포커스된 칸을 보이려고 «시각 뷰포트를 아래로 민다» — 그때 offsetTop 이 커진다(2026-09-13 2차 사고의 방아쇠)
        window.__kbOff = (h, top) => { vv.height = H - h; vv.offsetTop = top; vv.dispatchEvent(new Event('resize')) }
        // 레이아웃 뷰포트까지 함께 줄어드는 판(iOS 26 · Android) — 이때 innerHeight − vv.height 는 0 이다
        Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => window.__ih ?? H })
        window.__kbBoth = (h) => { window.__ih = H - h; vv.height = H - h; vv.offsetTop = 0; vv.dispatchEvent(new Event('resize')) }
        window.__kbReset = () => { window.__ih = H; vv.height = H; vv.offsetTop = 0; vv.dispatchEvent(new Event('resize')) }
      })
      const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
      await pg.goto(base + `/#bot=${bot.id}`)
      /**
       * 🔴 **보기 설정을 매 판 같은 자리에서 시작한다.**
       *    목차·글자 크기·정렬 갈래·숨김 파일은 `localStorage` 에 남는다 — Electron 프로필이 판을
       *    넘어 살아 있으므로, **앞 판이 켜 둔 값이 다음 판의 좌표를 바꾼다**(목차를 켜면 편집기가
       *    190px 밀린다). 그게 «어떤 날은 되고 어떤 날은 안 되는» 표 검사의 실체였다.
       * ⚠ 지우고 **다시 불러야** 한다 — 앱은 뜰 때 한 번 읽는다.
       */
      await pg.evaluate(() => { for (const k of ['fb:toc', 'fb:docfs', 'fb:docw', 'fb:railsort', 'fb:thidden', 'fb:tsort', 'fb:theme']) localStorage.removeItem(k) })
      await pg.reload()
      try { await pg.waitForSelector('.col.chat .hdr', { timeout: 15000 }) } catch (e) { mkdirSync('test/tmp', { recursive: true }); await pg.screenshot({ path: `test/tmp/${name}-fail.png` }); console.log('page errors:', errs.join(' | ').slice(0, 1500)); console.log('html:', (await pg.content()).slice(0, 800)); throw e }
      await wait(800)
      mkdirSync('test/tmp', { recursive: true }); await pg.screenshot({ path: `test/tmp/${name}.png` })
      if (name === 'desktop') {
        const txt = await pg.textContent('.chat-body'); if (!/스텁이 처리했습니다/.test(txt)) fail('ui chat missing')
        const rows = await pg.$$eval('.brow', (r) => r.length); if (rows < 3) fail(`ui rows ${rows}`)
        if (!(await pg.$('.sub'))) fail('ui subagent line missing'); if (!(await pg.$('.todow'))) fail('ui todo widget missing')
        if (!(await pg.$('.panel .trow'))) fail('ui tree missing')
        if (!(await pg.$('.chat-hdr.glass')) || !(await pg.$('.composer .cbar')) || !(await pg.$('.ring'))) fail('ui composer bar / glass header missing')
        if (!(await pg.$('.sb-foot .mr.main'))) fail('ui main badge')
        // 테마 — 설정에서 라이트로 바꾸면 토큰이 갈리고 배경이 밝아진다 (다시 다크로 되돌린다)
        {
          const darkBg = await pg.$eval('#root', (e) => getComputedStyle(e).backgroundColor)
          await pg.evaluate(() => { localStorage.setItem('fb:theme', 'light'); document.documentElement.dataset.theme = 'light' }); await wait(150)
          const lightBg = await pg.$eval('#root', (e) => getComputedStyle(e).backgroundColor)
          const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return (r + g + b) / 3 }
          if (!(lum(lightBg) > 200 && lum(darkBg) < 60)) fail(`ui theme: dark=${darkBg} light=${lightBg}`)
          const txt = await pg.$eval('.brow .n', (e) => getComputedStyle(e).color); if (lum(txt) > 120) fail('ui theme: text should be dark on light bg ' + txt)
          await pg.screenshot({ path: 'test/tmp/desktop-light.png' })
          await pg.evaluate(() => { localStorage.setItem('fb:theme', 'dark'); document.documentElement.dataset.theme = 'dark' }); await wait(150)
        }
        // 표정 C — 아이콘 안에 눈 그룹, 상태가 있으면 모서리 배지. 행 옆의 별도 점은 없다
        if (!(await pg.$('.brow .fb .eyes'))) fail('ui folderbot eyes group'); if (await pg.$('.brow > .dot')) fail('ui rail should not have a separate dot')
        const hdrBg = await pg.$eval('.chat-hdr', (e) => getComputedStyle(e).backgroundColor); if (/rgba\(\d+, \d+, \d+, 0/.test(hdrBg)) fail('ui chat header should be opaque: ' + hdrBg)
        // 열 최소 폭 — 저장된 레이아웃이 과해도(목록 480 · 문서 1100) 대화 열은 360 이상, 문서 열은 380 이상
        {
          const pg3 = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
          await pg3.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.setItem('fb:layout', JSON.stringify({ sb: 480, rp: 290, doc: 1100, sbOpen: true, rpOpen: true, sbPin: true, rpPin: true, secH: { sessions: 120, todo: 128 } })) })
          await pg3.goto(base + `/#bot=${bot.id}`); await pg3.waitForSelector('.col.chat .hdr', { timeout: 15000 }); await wait(500)
          await pg3.click('.panel .secb button.trow:not(.dir)'); await wait(700)
          const lw = await pg3.evaluate(() => { const q = (s) => document.querySelector(s)?.getBoundingClientRect().width ?? 0; return { chat: q('.cols > .col.chat'), doc: q('.docwrap'), sb: q('.col.side.left'), rp: q('.rpwrap'), win: innerWidth } })
          if (!(lw.chat >= 360 && lw.doc >= 380 && lw.doc > 0)) fail('ui column min widths ' + JSON.stringify(lw))
          await pg3.screenshot({ path: 'test/tmp/desktop-minwidth.png' }); await pg3.close()
        }
        // 권한 관문 — 데스크톱 브리지를 흉내 내 띄운다: 필수가 빠지면 화면 전체, 켜지면 [계속]
        {
          const pg2 = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
          await pg2.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          await pg2.addInitScript(() => {
            const items = [{ id: 'full-disk', required: true, probeable: true, status: 'missing' }, { id: 'notifications', required: true, probeable: false, status: 'unknown' }]
            window.__perm = items
            window.folderbotDesktop = { version: '0.0.0', perms: { list: async () => window.__perm, open: async () => ({ ok: true }), ack: async (id, ok) => { window.__perm = window.__perm.map((p) => p.id === id ? { ...p, status: ok ? 'granted' : 'missing' } : p); return window.__perm }, reset: async () => window.__perm, test: async () => ({ ok: true }), relaunch: () => {}, onChange: () => () => {} }, update: { state: async () => ({ current: '0.0.0', staged: null, downloading: false, checking: false, lastCheck: 0, lastError: '', deferred: false, busy: 0, host: false }), check: async () => ({}), apply: () => {}, onChange: () => () => {} } }
          })
          await pg2.goto(base + `/#bot=${bot.id}`); await pg2.waitForSelector('.perm-gate', { timeout: 10000 }); await wait(300); await pg2.screenshot({ path: 'test/tmp/desktop-perms-0.png' })
          const gt = await pg2.textContent('.perm-gate'); if (!/전체 디스크 접근/.test(gt) || !/알림/.test(gt) || !/필수/.test(gt)) fail('ui perm gate rows: ' + gt)
          // 🔴 **첫 화면에서 에이전트 연결까지** (2026-09-13 Dave) — 권한을 다 켜도 에이전트가 안 붙어
          //    있으면 앱은 아무것도 못 한다. ⛔ 다만 여기서 **막지는 않는다**(로그인은 터미널의 일이다).
          if (!/Claude Code/.test(gt) || !/Codex/.test(gt)) fail('첫 화면에 에이전트 연결 줄이 없다: ' + gt.slice(0, 300))
          if (!(await pg2.$('.perm-gate button.on[disabled]'))) fail('ui perm gate continue should be disabled')
          await pg2.click('.perm-gate button:has-text("테스트 알림 보내기")'); await pg2.click('.perm-gate button:has-text("보였어요")'); await wait(200)
          await pg2.evaluate(() => { window.__perm = window.__perm.map((p) => p.id === 'full-disk' ? { ...p, status: 'granted' } : p) }); await pg2.click('.perm-gate button:has-text("다시 확인")'); await wait(300)
          if (await pg2.$('.perm-gate button.on[disabled]')) { await pg2.screenshot({ path: 'test/tmp/desktop-perms-fail.png' }); fail('ui perm gate continue still disabled · ' + (await pg2.evaluate(() => JSON.stringify(window.__perm))) + ' · ' + (await pg2.textContent('.perm-gate')).slice(0, 400)) }
          await pg2.screenshot({ path: 'test/tmp/desktop-perms.png' }); await pg2.click('.perm-gate button.on'); await wait(300); if (await pg2.$('.perm-gate')) fail('ui perm gate did not close')
          await pg2.close()
        }
        // 버전 칩을 누르면 확인 — 브라우저 화면에선 안내 토스트
        await pg.click('.sb-foot .bd.upd'); await wait(200); const vt = await pg.textContent('.toast'); if (!/업데이트/.test(vt ?? '')) fail('ui version chip toast: ' + vt)
        // 레일 순서 — 섹션은 관제 → 2 → 3 → 4, 행은 이름 내림차순(날짜 최신 먼저), 활동으로 자리가 안 바뀐다
        const order = await pg.evaluate(() => Array.from(document.querySelectorAll('.sb-list > div')).map((sec) => ({ s: sec.querySelector('.secl')?.textContent, n: Array.from(sec.querySelectorAll('.brow .n .mid')).map((e) => e.textContent) })))
        const secNames = order.map((o) => o.s); const sorted = [...secNames].sort((a, b) => (a === '관제' ? -1 : b === '관제' ? 1 : a.localeCompare(b, 'ko', { numeric: true })))
        if (JSON.stringify(secNames) !== JSON.stringify(sorted)) fail('ui section order ' + secNames.join(' | '))
        for (const o of order) { const d = [...o.n].sort((a, b) => b.localeCompare(a, 'ko', { numeric: true, sensitivity: 'base' })); if (JSON.stringify(o.n) !== JSON.stringify(d)) fail(`ui row order in ${o.s}: ${o.n.join(' | ')}`) }
        // NFD 파일명이 자모 분리 없이 합쳐져 보인다
        const nfdName = await pg.$$eval('.panel .trow .n', (els) => els.map((e) => e.textContent).find((t) => t && t.includes('_MAP_'))); if (!nfdName || nfdName !== nfdName.normalize('NFC') || !/전체구조/.test(nfdName)) fail('ui NFD name: ' + JSON.stringify(nfdName))
        // 이름은 가운데 말줄임 — 꼬리(.mt)가 남아 있다
        if (!(await pg.$('.brow .n .mid .mt')) || !(await pg.$('.panel .trow .n .mid'))) fail('ui mid ellipsis')
        // 레일 행 호버 → 상세 카드(경로 · 상태 · 세션) · 떠나면 사라진다
        await pg.hover('.brow'); await wait(600); const hc = await pg.textContent('.hcard'); if (!hc || !/세션|메시지를 보내면/.test(hc) || !/할 일/.test(hc)) fail('ui hover card: ' + hc)
        await pg.mouse.move(700, 300); await wait(200); if (await pg.$('.hcard')) fail('ui hover card stuck')
        // 폴더 선택 = 트리: 1단계 폴더가 뜨고 활성 폴더는 펼쳐져 있다 · Resources 를 펼치면 하위가 보인다
        await pg.click('.nav'); await pg.waitForSelector('.pk [data-rel]', { timeout: 5000 }); await wait(500)
        const top = await pg.$$eval('.pk [data-rel]', (r) => r.map((x) => x.getAttribute('data-rel'))); if (!top.includes('4. Resources') || !top.includes('3. Area/제품_Rondo')) fail('ui picker tree: ' + top.join(','))
        await pg.click('.pk [data-rel="4. Resources"] .cv'); await wait(500); const top2 = await pg.$$eval('.pk [data-rel]', (r) => r.map((x) => x.getAttribute('data-rel'))); if (!top2.includes('4. Resources/2026_브랜딩-DAVE')) fail('ui picker expand: ' + top2.join(','))
        const ft = await pg.evaluate(() => { const f = document.querySelector('.pk .modal-f'); return f.getBoundingClientRect().height }); if (ft > 70) fail('ui picker footer wraps ' + ft)
        // 🔴 폴더 찾기 — 가운데 낱말·NFD·초성 (2026-09-13 Dave: "'트레바리' 같은 경우에는 아예 검색이 안 돼요")
        await pg.fill('.pk .search input', '트레바리'); await wait(700)
        const hit = await pg.$$eval('.pk [data-rel]', (r) => r.map((x) => x.getAttribute('data-rel').normalize('NFC')))
        if (!hit.includes('5. Archive/2025-04_트레바리-북클럽')) fail('ui picker 가운데 낱말 검색: ' + hit.join(','))
        if (!(await pg.$('.pk .hit'))) fail('ui picker 걸린 자리 강조 없음')
        const hl = await pg.evaluate(() => { const h = document.querySelector('.pk .hit'); const row = h.closest('.trow'); return { hit: getComputedStyle(h).color, row: getComputedStyle(row).color, txt: h.textContent } })
        if (hl.txt.normalize('NFC') !== '트레바리' || hl.hit === hl.row) fail('ui picker 강조 색/범위: ' + JSON.stringify(hl))
        await pg.fill('.pk .search input', 'ㅌㄹㅂㄹ'); await wait(700)
        const cho = await pg.$$eval('.pk [data-rel]', (r) => r.map((x) => x.getAttribute('data-rel').normalize('NFC')))
        if (!cho.includes('5. Archive/2025-04_트레바리-북클럽')) fail('ui picker 초성 검색: ' + cho.join(','))
        await pg.fill('.pk .search input', '트레바리'); await wait(500); await pg.screenshot({ path: 'test/tmp/desktop-picker-search.png' })
        await pg.fill('.pk .search input', ''); await wait(300); if (await pg.$('.pk')) { await pg.click('.pk .modal-h .ib'); await wait(300) }
        // 레일 폴더봇 크기 — 설정에서 고르고(작게·보통·크게), 마우스를 올리면 한 번 더 커진다
        // (2026-09-13 Dave: «너무 작게 보여서 귀여운 폴더 표정이 잘 안 보여» · «마우스 오버했을 때는 크게 보이면 더 좋아»)
        // 왼쪽 아래 — 두 줄이고, 아무것도 잘리지 않는다 (2026-09-13 Dave: «메뉴가 짤린다»)
        const foot = await pg.evaluate(() => {
          const f = document.querySelector('.sb-foot'); const fr = f.getBoundingClientRect()
          const rows = f.querySelectorAll(':scope > div').length
          const clipped = [...f.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > fr.right + 1 || r.left < fr.left - 1) }).map((e) => e.className || e.tagName)
          return { rows, clipped: clipped.slice(0, 4), h: fr.height, w: fr.width, sw: f.scrollWidth }
        })
        if (foot.clipped.length) fail('왼쪽 아래: 잘리는 것이 있다 ' + JSON.stringify(foot))
        if (foot.sw > foot.w + 1) fail('왼쪽 아래: 가로로 넘친다 ' + JSON.stringify(foot))
        await pg.locator('.sb-foot').screenshot({ path: 'test/tmp/desktop-foot.png' })
        // ⛔ 맥의 사용량은 **메뉴바에서만** 본다 (2026-09-13 Dave) — 앱 안 상태바에 다시 들어오면 회귀다
        if (await pg.$('.sb-foot .uchip')) fail('사용량: 맥 상태바에 칩이 돌아왔다 — 메뉴바 전용이다')
        if (await pg.$('.upop')) fail('사용량: 맥 앱 안에 카드가 떠 있다 — 메뉴바 전용이다')
        await pg.keyboard.press('Escape'); await pg.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.click())); await wait(300)
        const iconOf = () => pg.evaluate(() => { const el = document.querySelector('.brow .fb'); return { w: el.getBoundingClientRect().width, attr: Number(el.getAttribute('width')) } })
        const before = await iconOf()
        await pg.click('.col.side.left .nav:has-text("설정")'); await pg.waitForSelector('.modal.setw', { timeout: 4000 }); await wait(300)
        // 설정 V25 — 왼쪽 목차 · 한 화면에 한 가지 (2026-09-13 Dave 승인)
        {
          const navs = await pg.$$eval('.snav .nv', (ns) => ns.map((n) => n.textContent.trim()))
          for (const want of ['일반', '호스트 · 연결', '에이전트', '하네스', '사용량', '화면', '할 일', '알림', '권한 · 보안'])
            if (!navs.includes(want)) fail('설정 목차에 «' + want + '» 가 없다 ' + JSON.stringify(navs))
          // 줄은 늘 세 칸 — 조작 자리가 왼쪽 글보다 오른쪽에 있고, 칸 밖으로 안 나간다
          await pg.click('.snav .nv:has-text("사용량")'); await wait(300)
          const three = await pg.evaluate(() => [...document.querySelectorAll('.sp-b .setr')].filter((r) => r.querySelector('.c')).map((r) => {
            const p = r.getBoundingClientRect(), t = r.querySelector('.tx').getBoundingClientRect(), c = r.querySelector('.c').getBoundingClientRect()
            return { t: r.dataset.t, ok: c.left >= t.right - 1 && c.right <= p.right + 1 }
          }))
          if (!three.length || three.some((x) => !x.ok)) fail('설정: 조작 자리가 흔들린다 ' + JSON.stringify(three.filter((x) => !x.ok)))
          if (!(await pg.$('.sp-b .setr[data-t="턴마다 기록하기"]'))) fail('설정 › 사용량: 훅 줄이 없다')
          // 에이전트 — 깔린 CLI · 커넥터 · 스킬이 범위 칩과 함께
          await pg.click('.snav .nv:has-text("에이전트")'); await wait(500)
          const ag = await pg.textContent('.sp-b'); if (!/Claude Code/.test(ag)) fail('설정 › 에이전트: 깔린 CLI 가 없다')
          if (!(await pg.$('.sp-b .hitem .scp'))) fail('설정 › 에이전트: 범위 칩이 없다')
          if (!/Folder Bot/.test(ag)) fail('설정 › 에이전트: 내장 커넥터가 없다')
          await pg.screenshot({ path: 'test/tmp/desktop-settings-agents.png' })
          // 하네스 — 폴더별 표(보기 전용). 고치는 버튼이 있으면 계약 위반이다
          await pg.click('.snav .nv:has-text("하네스")'); await wait(500)
          if (!(await pg.$('.sp-b .htab .hrow'))) fail('설정 › 하네스: 표가 비었다')
          const hz = await pg.textContent('.sp-b .htab'); if (!/CLAUDE\.md/.test(hz)) fail('설정 › 하네스: CLAUDE.md 칸이 없다 · ' + hz.slice(0, 120))
          if (await pg.$('.sp-b .htab button')) fail('설정 › 하네스: 보기 전용인데 고치는 버튼이 있다')
          await pg.screenshot({ path: 'test/tmp/desktop-settings-harness.png' })
          // 검색 — 제목과 설명을 함께 찾는다
          await pg.fill('.snav .sfind input', '토큰'); await wait(300)
          const found = await pg.$$eval('.snav .nv', (ns) => ns.map((n) => n.textContent))
          if (!found.some((t) => /토큰/.test(t))) fail('설정 검색: «토큰» 이 안 걸린다 ' + JSON.stringify(found))
          await pg.fill('.snav .sfind input', ''); await wait(200)
          await pg.click('.snav .nv:has-text("화면")'); await wait(300)
        }
        // 🔴 표식은 **이름 줄**에 산다 (V24 C 안, 2026-09-13 Dave 선택) — 아이콘 모서리는 상태 배지의 자리다
        {
          const css = await pg.evaluate(() => [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText) } catch { return [] } }).join('\n'))
          if (/\.bface/.test(css)) fail('표식이 아이콘 모서리로 돌아갔다(.bface 부활) — 상태 배지와 겹친다')
          if (!/\.vmk/.test(css)) fail('이름 줄 표식(.vmk) 규칙이 없다')
          if (await pg.$('.bface')) fail('표식이 아이콘 모서리에 붙어 있다')
        }
        // 원격에 «메인 것» 을 안 보여 준다 — 이 화면은 메인이라 훅 버튼이 있어야 한다(반대편 판정의 기준점)
        {
          await pg.click('.snav .nv:has-text("사용량")'); await wait(400)
          const hook = await pg.$('.sp-b .setr[data-t="턴마다 기록하기"] .c button')
          const isMain = await pg.evaluate(() => /메인/.test(document.querySelector('.sb-foot')?.textContent ?? ''))
          if (isMain && !hook) fail('메인인데 훅 설치 버튼이 없다')
          if (!isMain && hook) fail('원격인데 훅 설치 버튼이 있다 — 메인의 ~/.claude 를 고치는 줄이다')
          await pg.click('.snav .nv:has-text("화면")'); await wait(200)
        }
        const segs = await pg.$$eval('.sp-b .seg', (ss) => ss.map((x) => x.textContent))
        if (!segs.some((t) => /작게.*보통.*크게/.test(t))) fail('설정에 폴더봇 크기 없음: ' + JSON.stringify(segs))
        await pg.click('.sp-b .setr[data-t="폴더봇 크기"] .seg button:has-text("크게")'); await wait(400)
        await pg.click('.sp-h .ib'); await wait(300)
        const big = await iconOf()
        if (big.attr <= before.attr) fail('폴더봇 «크게» 가 안 커짐 ' + JSON.stringify({ before, big }))
        const rowH = await pg.evaluate(() => document.querySelector('.brow').getBoundingClientRect().height)
        if (rowH < big.attr) fail('줄 높이가 아이콘을 못 담음 ' + JSON.stringify({ rowH, big }))
        await pg.hover('.brow'); await wait(350)
        const hovW = await pg.evaluate(() => document.querySelector('.brow .fb').getBoundingClientRect().width)
        if (hovW < big.w * 1.2) fail('마우스 오버에 안 커짐 ' + JSON.stringify({ big, hovW }))
        // 🔴 **실행 중인** 봇도 커져야 한다 — 돌고 있는 애니메이션이 같은 속성을 쓰면 호버가 통째로 무시된다
        //    (2026-09-13 Dave: «애니메이션이 동작하는 폴더봇은 마우스 오버를 할 때 확대가 안 되네»)
        {
          await pg.evaluate(() => { const f = document.querySelector('.brow .fb'); f.classList.add('fb-work') })
          await pg.mouse.move(900, 700); await wait(250)
          const rest = await pg.evaluate(() => document.querySelector('.brow .fb').getBoundingClientRect().width)
          await pg.hover('.brow'); await wait(400)
          const runHov = await pg.evaluate(() => {
            const f = document.querySelector('.brow .fb')
            return { w: f.getBoundingClientRect().width, anim: getComputedStyle(f).animationName }
          })
          if (runHov.anim === 'none') fail('실행 중 애니메이션이 안 붙었다 — 검사가 무의미하다 ' + JSON.stringify(runHov))
          if (runHov.w < rest * 1.2) fail('실행 중인 폴더봇이 마우스 오버에 안 커진다(애니메이션과 같은 속성을 쓴다?) ' + JSON.stringify({ rest, runHov }))
          await pg.evaluate(() => document.querySelector('.brow .fb').classList.remove('fb-work'))
        }
        await pg.screenshot({ path: 'test/tmp/desktop-rail-big.png' })
        await pg.mouse.move(900, 700); await wait(300)
        await pg.evaluate(() => { localStorage.setItem('fb:icon', 'm'); window.dispatchEvent(new Event('fb:iconsize')) }); await wait(200)

        await pg.keyboard.press('Escape'); await wait(200); if (await pg.$('.pk')) { await pg.click('.pk .modal-h .ib'); await wait(300) }
        // 🔴 **churn 0** — 라이브 프리뷰로 열고 한 글자 쳤다 지워도 **바이트가 그대로** 여야 한다
        //    (「문서 기능 A」의 첫 계약. 파싱·직렬화를 안 하기 때문에 공짜지만, 공짜인지 실제로 잰다)
        {
          const rel = 'churn.md'
          const abs = join(root, '3. Area/제품_Rondo', rel)
          // ⚠ 제목이 **둘** 이어야 목차 단추가 나온다(하나짜리 문서에 목차는 자리만 먹는다)
          const src = ['---', 'type: reference', 'tags: [PARA, 지침]', '---', '', '# 제목', '', '**굵게** 와 *기울임* 과 `코드`.', '', '- [ ] 할 일', '- 항목', '', '## 두 번째 제목', '', '---', '', '> 인용', '', '> [!note] 콜아웃 줄', '', '[[위키링크]] 와 https://example.com', ''].join('\n')
          // ⚠ API 로 만든다 — 파일을 직접 쓰면 호스트가 모르고 트리가 안 새로 그려진다
          await api(`/bots/${bot.id}/file`, { rel, text: src })
          const before = readFileSync(abs)
          await wait(900)
          const opened = await pg.evaluate((r) => { const hit = [...document.querySelectorAll('.trow')].find((x) => (x.textContent ?? '').includes(r)); if (hit) { hit.click(); return true } return false }, rel)
          if (!opened) fail('churn 0: 트리에 새 파일이 안 나타난다')
          // 🔴 **보기/편집이 한 화면이다** — 문서를 열면 바로 라이브 프리뷰 편집기다(모드 전환이 없다)
          await pg.waitForSelector('.mded .cm-content', { timeout: 9000 }); await wait(700)
          if (await pg.$('.dbody .md')) fail('한 화면: 읽기용 marked 본문이 아직 따로 있다 — 둘을 오가면 싱크가 사람 몫이 된다')
          // 라이브 프리뷰가 실제로 걸렸나 — 제목 줄에 줄 클래스가 붙고, 커서 밖의 «#» 는 숨는다
          const lp = await pg.evaluate(() => ({
            h1: !!document.querySelector('.mded .lp-h1'),
            text: document.querySelector('.mded .cm-content')?.textContent ?? ''
          }))
          if (!lp.h1) fail('라이브 프리뷰: 제목 줄 클래스(.lp-h1)가 없다 ' + JSON.stringify(lp).slice(0, 200))
          // 🔴 **누른 자리에 커서가 선다** (2026-09-13 Dave: «최초 클릭하면 위치가 정확하지 않을 때가 있어»)
          //    ⛔ 서식 마커를 커서 줄에서 드러내면 줄이 밀려서, 클릭 좌표와 커서 좌표가 반드시 어긋난다.
          {
            const vis = await pg.evaluate(() => document.querySelector('.mded .cm-content')?.textContent ?? '')
            if (/##|\*\*/.test(vis)) fail('마커: 화면에 서식 기호가 보인다 ' + JSON.stringify(vis.slice(0, 120)))
            if (!/https:\/\/example\.com/.test(vis)) fail('맨 URL 이 통째로 사라졌다 — 숨기면 안 되는 것이다 ' + JSON.stringify(vis.slice(0, 160)))
            // 🔴 재는 것은 «커서가 정확히 어느 글자냐» 가 아니라 **줄이 안 밀리느냐** 다.
            //    커서는 원래 가장 가까운 글자 경계로 붙는다(제목은 한 글자가 24px 라 그만큼 떨어질 수 있다).
            //    어긋남의 진짜 원인은 밀림이고, 밀리지 않으면 누른 자리와 고치는 자리가 같다.
            const lineBox = (want) => pg.evaluate((w) => {
              const l = [...document.querySelectorAll('.mded .cm-line')].find((x) => x.textContent.includes(w))
              if (!l) return null
              const r = l.getBoundingClientRect()
              const t = l.firstChild && l.firstChild.nodeType === 3 ? l.firstChild : null
              const rg = document.createRange(); let tx = null
              if (t) { rg.selectNodeContents(t); tx = rg.getBoundingClientRect().left }
              return { x: r.left, y: r.top + r.height / 2, w: r.width, tx }
            }, want)
            for (const want of ['제목', '굵게']) {
              const before = await lineBox(want)
              if (!before) fail(`마커: «${want}» 줄을 못 찾았다`)
              await pg.mouse.click(before.x + Math.min(30, before.w / 2), before.y); await wait(350)
              const after = await lineBox(want)
              if (!after) fail(`마커: 클릭 뒤 «${want}» 줄이 사라졌다`)
              if (Math.abs((after.tx ?? 0) - (before.tx ?? 0)) > 0.6) fail(`마커: «${want}» 줄이 클릭에 밀렸다 ${JSON.stringify({ before: before.tx, after: after.tx })} — 누른 자리와 커서가 어긋난다`)
              const sel = await pg.evaluate(() => { const s2 = window.getSelection(); return s2 && s2.rangeCount ? 1 : 0 })
              if (!sel) fail(`마커: «${want}» 을 눌렀는데 커서가 안 생겼다`)
            }
            const after = await pg.evaluate(() => document.querySelector('.mded .cm-content')?.textContent ?? '')
            if (/##|\*\*/.test(after)) fail('마커: 커서가 들어가니 서식 기호가 나왔다 ' + JSON.stringify(after.slice(0, 120)))
            // 🔴 **↑↓ 는 지금 보고 있는 칸의 것** (2026-09-13 Dave: «문서에서 위아래로 가려는데 파일 선택이 움직인다»)
          //    편집기는 contenteditable 이라 «입력칸이 아니면 글 쓰는 중이 아니다» 는 옛 판정에 안 걸렸다.
          {
            const tab0 = await pg.evaluate(() => document.querySelector('.dtb .nm')?.textContent ?? '')
            await pg.keyboard.press('ArrowDown'); await wait(300)
            await pg.keyboard.press('ArrowUp'); await wait(300)
            const tab1 = await pg.evaluate(() => document.querySelector('.dtb .nm')?.textContent ?? '')
            if (tab1 !== tab0) fail(`↑↓: 문서 안에서 눌렀는데 다른 파일로 넘어갔다 ${tab0} → ${tab1}`)
            ok('↑↓ 는 문서 안에서 커서를 옮긴다 (파일 선택이 안 따라간다)')
          }
          // `---` 는 가로줄로 (2026-09-13 Dave)
          if (!(await pg.$('.mded .lp-hr'))) fail('`---` 가 가로줄이 안 됐다')
          ok('편집기 — 누른 자리에 커서가 선다(서식 마커는 계속 숨는다)')
          }
          // 위젯 — 체크박스 · 위키링크. ⛔ 체크박스는 **한 글자만** 갈아야 churn 이 안 난다
          const w = await pg.evaluate(() => ({ check: document.querySelectorAll('.mded .lp-check').length, wiki: document.querySelectorAll('.mded .lp-wiki').length }))
          if (!w.check) fail('위젯: 체크박스가 안 그려졌다 ' + JSON.stringify(w))
          if (!w.wiki) fail('위젯: 위키링크가 안 그려졌다 ' + JSON.stringify(w))
          // 프론트매터는 접혀서 작은 라벨 한 줄 — 문서를 열자마자 YAML 이 먼저 보이면 안 된다
          const fm = await pg.evaluate(() => { const e = document.querySelector('.mded .lp-fm'); return { has: !!e, text: e?.textContent ?? '' } })
          if (!fm.has) fail('프론트매터: 안 접혔다 — 열자마자 YAML 이 보인다')
          if (!/REFERENCE/.test(fm.text)) fail('프론트매터: 요약이 이상하다 ' + JSON.stringify(fm))
          {
            const raw0 = readFileSync(abs, 'utf8')
            await pg.click('.mded .lp-check'); await wait(1400)
            const raw1 = readFileSync(abs, 'utf8')
            if (raw1 === raw0) fail('체크박스: 눌러도 파일이 안 바뀐다')
            const d = [...raw0].filter((c, i) => c !== raw1[i]).length
            if (raw0.length !== raw1.length || d !== 1) fail('체크박스: 한 글자만 바뀌어야 한다(줄을 다시 썼다?) ' + JSON.stringify({ len0: raw0.length, len1: raw1.length, d }))
            if (!/- \[x\] 할 일/.test(raw1)) fail('체크박스: 체크 표시가 안 들어갔다 ' + JSON.stringify(raw1.slice(0, 120)))
            await pg.click('.mded .lp-check'); await wait(1400)
            if (readFileSync(abs, 'utf8') !== raw0) fail('체크박스: 되돌리면 원래대로여야 한다')
            ok('편집기 위젯 — 체크박스(한 글자만) · 위키링크')
          }
          await pg.click('.mded .cm-content')
          await pg.keyboard.press('End'); await pg.keyboard.type('x'); await wait(250)
          await pg.keyboard.press('Backspace')
          await wait(1700)                                   // 자동 저장(800ms) 이 끝나길
          const after = readFileSync(abs)
          if (!before.equals(after)) fail('churn 0: 열고 쳤다 지웠는데 바이트가 바뀌었다\n--- 전\n' + JSON.stringify(before.toString()) + '\n--- 후\n' + JSON.stringify(after.toString()))
          ok('churn 0 — 라이브 프리뷰로 열고 저장해도 바이트가 그대로')
          // 🔴 **서식 — 글자를 외우지 않아도 된다** (2026-09-13 Dave: «# 같은 마크다운 단축어, 선택시 상단 메뉴»)
          //    ⚠ 단추가 하는 일은 «글자 넣기» 다 — 파일에는 `**굵게**` 가 그대로 들어간다(churn 0 이 그대로 산다).
          {
            // 고른 글 위 막대 — 고른 것이 있을 때만 뜬다
            const on0 = await pg.evaluate(() => document.querySelector('.mdbar')?.classList.contains('on') ?? null)
            if (on0 === null) fail('서식: 막대가 아예 없다')
            if (on0) fail('서식: 아무것도 안 골랐는데 막대가 떠 있다 — 조용한 문서가 아니게 된다')
            // ⚠ 선택은 **진짜로** 만든다 — DOM Range 를 손으로 만들면 CodeMirror 가 자기 상태로 안 받는다
            const line = await pg.evaluate(() => { const l = [...document.querySelectorAll('.mded .cm-line')].find((x) => x.textContent.includes('항목')); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 } })
            if (!line) fail('서식: «항목» 줄을 못 찾았다')
            // ⚠ 더블클릭 = 낱말 고르기. `Home` 뒤 Shift→ 로 고르면 **불릿(`- `)** 이 잡힌다(실제로 그랬다)
            await pg.mouse.dblclick(line.x + 18, line.y); await wait(500)
            const bar = await pg.evaluate(() => { const b = document.querySelector('.mdbar'); return { on: b?.classList.contains('on'), n: b?.querySelectorAll('button').length } })
            if (!bar.on) fail('서식: 글을 골랐는데 막대가 안 뜬다 ' + JSON.stringify(bar) + ' · 콘솔=' + JSON.stringify(errs.slice(-3)))
            if (!bar.n || bar.n < 6) fail('서식: 막대에 단추가 모자라다 ' + JSON.stringify(bar))
            await pg.click('.mdbar button.b'); await wait(1500)
            const bold = readFileSync(abs, 'utf8')
            if (!/\*\*항목\*\*/.test(bold)) fail('서식: 굵게가 파일에 안 들어갔다 ' + JSON.stringify(bold))
            // `/` 메뉴 — 줄 앞에서만 뜬다
            await pg.evaluate(() => { const c = document.querySelector('.mded .cm-content'); c.focus() })
            await pg.keyboard.press('Control+End'); await pg.keyboard.press('Enter'); await pg.keyboard.type('/')
            await wait(600)
            const menu = await pg.evaluate(() => { const t = document.querySelector('.cm-tooltip-autocomplete'); return t ? [...t.querySelectorAll('li')].map((x) => x.textContent) : null })
            if (!menu || !menu.length) fail('서식: `/` 메뉴가 안 뜬다')
            if (!menu.some((x) => /체크박스/.test(x ?? ''))) fail('서식: `/` 메뉴에 체크박스가 없다 ' + JSON.stringify(menu))
            await pg.keyboard.press('Escape'); await pg.keyboard.press('Backspace'); await wait(400)
            /**
             * 🔴 **`[[` 자동완성** (Rondo 이식 B5) — 이 폴더의 문서를 골라 넣는다.
             * ⚠ 목록은 편집기가 모른다(어느 폴더인지는 문서 열이 안다) — 한 번 받아 캐시한다.
             */
            await pg.keyboard.type('[[')
            await wait(800)
            const wiki = await pg.evaluate(() => { const t = document.querySelector('.cm-tooltip-autocomplete'); return t ? [...t.querySelectorAll('li')].map((x) => x.textContent) : null })
            if (!wiki || !wiki.length) fail('`[[` 자동완성이 안 뜬다')
            if (!wiki.some((x) => /todo|CLAUDE|readme/i.test(x ?? ''))) fail('`[[` 자동완성에 이 폴더 문서가 없다 ' + JSON.stringify(wiki.slice(0, 6)))
            await pg.keyboard.press('Escape'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await wait(400)
            ok('서식 — 고른 글 위 막대 · `/` 메뉴 · `[[` 문서 고르기')
          }
          /**
           * 🔴 **문서 목차 · 글자 크기 · 문서 안에서 찾기** (Rondo 이식 B4·B9·B10).
           * ⚠ ⌘F 는 **편집기의 것**이 이겨야 한다(단축키 계약) — 파일 목록의 거르기가 열리면 회귀다.
           * ⚠ 목차는 편집기와 **형제**여야 한다 — 안에 넣으면 CodeMirror 가 제 DOM 으로 알고 지운다.
           */
          {
            // 목차 — 제목이 둘 이상이어야 단추가 나온다
            const tocBtn = '.dtb .r .ib[title="목차"]'
            if (!(await pg.$(tocBtn))) fail('목차: 단추가 없다 (제목이 둘 이상인 문서인데도)')
            await pg.click(tocBtn); await wait(400)
            const tocTxt = await pg.evaluate(() => { const n = document.querySelector('.dtoc'); return n ? { in: !!document.querySelector('.mded .dtoc'), items: [...n.querySelectorAll('button')].map((b) => b.textContent) } : null })
            if (!tocTxt) fail('목차: 안 열린다')
            if (tocTxt.in) fail('🔴 목차가 편집기 안에 있다 — CodeMirror 가 지운다')
            if (!tocTxt.items.some((t) => /제목/.test(t ?? ''))) fail('목차: 제목이 안 들어왔다 ' + JSON.stringify(tocTxt.items))
            // 눌러서 그 줄로 — 커서가 그 제목 줄에 선다
            await pg.click('.dtoc button'); await wait(400)
            const at = await pg.evaluate(() => document.querySelector('.mded .cm-activeLine, .mded .cm-line')?.textContent ?? '')
            if (!at) fail('목차: 눌러도 편집기가 반응이 없다')
            await pg.click(tocBtn); await wait(300)   // 다시 접는다(이어지는 검사의 좌표가 흔들리지 않게)
            // 글자 크기 — ⋯ 메뉴에서 줄이면 CSS 변수가 따라간다
            await pg.click('.dtb .r .ib[title="더 보기"]'); await wait(400)
            const before = await pg.evaluate(() => getComputedStyle(document.querySelector('.mded .cm-scroller')).fontSize)
            await pg.click('.menu .mrow .mb:has-text("−")'); await wait(300)
            const after = await pg.evaluate(() => getComputedStyle(document.querySelector('.mded .cm-scroller')).fontSize)
            if (parseFloat(after) >= parseFloat(before)) fail(`글자 크기: 줄어들지 않았다 ${before} → ${after}`)
            // ⚠ 줄인 글자 크기를 **되돌린다** — 남기면 뒤 검사의 줄 높이·좌표가 달라진다
            await pg.click('.menu .mrow .mb:has-text("＋")'); await wait(250)
            await pg.keyboard.press('Escape'); await wait(300)
            // ⌘F — 편집기 안에서는 편집기의 찾기가 뜬다
            await pg.evaluate(() => document.querySelector('.mded .cm-content').focus())
            // ⚠ CodeMirror 의 `Mod` 는 **맥에서만 ⌘** 다 — 리눅스로 도는 이 검사에서는 ⌃ 를 눌러야 한다
            //    (우리 손으로 만든 단축키는 `metaKey || ctrlKey` 라 둘 다 먹어서 이 차이가 여기서만 드러난다)
            await pg.keyboard.press('Control+f'); await wait(600)
            const find = await pg.evaluate(() => ({ cm: !!document.querySelector('.mded .cm-search'), tree: !!document.querySelector('.tfilter') }))
            if (!find.cm) fail('문서 찾기: ⌘F 로 편집기 찾기가 안 뜬다')
            if (find.tree) fail('🔴 ⌘F 가 문서 안인데 파일 목록 거르기가 열렸다 — 단축키가 칸을 안 본다')
            await pg.keyboard.press('Escape'); await wait(300)
            ok('문서 — 목차 · 글자 크기 · ⌘F 는 편집기의 것')
          }
          // 콜아웃 — `> [!note]` 는 표시를 숨기고 줄에 색을 준다
          if (!(await pg.$('.mded .lp-cal'))) fail('콜아웃이 안 그려졌다')
          // ⚠ 열어 둔 채로 파일을 지우면 문서 열이 다시 읽으며 404 를 낸다 — 먼저 다른 파일로 옮긴다
          await pg.evaluate(() => { const t = [...document.querySelectorAll('.trow')].find((x) => /todo\.md/.test(x.textContent ?? '')); t?.click() })
          await wait(700)
          try { rmSync(abs) } catch {}
          await wait(400)
        }
        // 🔴 **Canvas — Obsidian 의 .canvas 를 보고 고친다** (2026-09-13 Dave: «편집 기능까지 다 만들어줘»)
        {
          const rel = '보드.canvas'
          const abs = join(root, '3. Area/제품_Rondo', rel)
          const src = JSON.stringify({
            nodes: [
              { id: '1111111111111111', type: 'text', x: 0, y: 0, width: 200, height: 80, text: '첫 칸', zzz: 'keep' },
              { id: '2222222222222222', type: 'text', x: 320, y: 0, width: 200, height: 80, text: '둘째 칸' }
            ],
            edges: [{ id: '3333333333333333', fromNode: '1111111111111111', toNode: '2222222222222222', toEnd: 'arrow' }],
            myExt: { keep: true }
          }, null, '\t')
          await api(`/bots/${bot.id}/file`, { rel, text: src })
          await wait(900)
          const opened = await pg.evaluate((r) => { const hit = [...document.querySelectorAll('.trow')].find((x) => (x.textContent ?? '').includes(r)); if (hit) { hit.click(); return true } return false }, rel)
          if (!opened) fail('캔버스: 트리에 안 나타난다')
          await pg.waitForSelector('.cvs', { timeout: 8000 }); await wait(700)
          const shape = await pg.evaluate(() => ({
            nodes: document.querySelectorAll('.cvs-n').length,
            edges: document.querySelectorAll('.cvs-edges path[marker-end]').length,
            raw: !!document.querySelector('.mded, .dbody pre.raw')     // 원문으로 떨어지면 안 된다
          }))
          if (shape.raw) fail('캔버스: 원문(JSON)으로 떨어졌다 — 갈래를 못 가렸다')
          if (shape.nodes !== 2 || shape.edges !== 1) fail('캔버스: 노드·엣지가 안 그려졌다 ' + JSON.stringify(shape))
          // 노드를 끌어 옮기면 저장된다. ⛔ 모르는 필드(zzz·myExt)는 그대로 남아야 한다
          const box = await pg.evaluate(() => { const n = document.querySelector('.cvs-n'); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
          await pg.mouse.move(box.x, box.y); await pg.mouse.down()
          await pg.mouse.move(box.x + 60, box.y + 40, { steps: 6 }); await pg.mouse.up()
          let saved = null
          for (let i = 0; i < 40; i++) { saved = JSON.parse(readFileSync(abs, 'utf8')); if (saved.nodes[0].x !== 0) break; await wait(150) }
          if (saved.nodes[0].x === 0) fail('캔버스: 끌어 옮겼는데 저장이 안 됐다')
          if (saved.nodes[0].zzz !== 'keep' || !saved.myExt?.keep) fail('캔버스: 모르는 필드를 버렸다 ' + JSON.stringify(saved).slice(0, 200))
          if (!readFileSync(abs, 'utf8').includes('\t"nodes"')) fail('캔버스: 탭 들여쓰기가 아니다 — Obsidian 과 diff 가 난다')
          ok('Canvas — 노드·엣지를 그리고, 끌어 옮기면 저장되고, 모르는 필드는 남는다')
          await pg.evaluate(() => { const t = [...document.querySelectorAll('.trow')].find((x) => /todo\.md/.test(x.textContent ?? '')); t?.click() })
          await wait(700)
          try { rmSync(abs) } catch {}
          await wait(300)
        }
        // 🔴 표 — 읽을 땐 진짜 표, 칸을 고치면 **그 칸의 글자만** 바뀐다 (Rondo 는 통째로 다시 쓴다 = churn)
        {
          const rel = 'tbl.md'
          const abs = join(root, '3. Area/제품_Rondo', rel)
          const src = ['# 표', '', '| 이름 | 값 |', '| --- | ---: |', '| 가 | 1 |', '| 나 | 2 |', ''].join('\n')
          await api(`/bots/${bot.id}/file`, { rel, text: src })
          await wait(900)
          const opened = await pg.evaluate((r) => { const hit = [...document.querySelectorAll('.trow')].find((x) => (x.textContent ?? '').includes(r)); if (hit) { hit.click(); return true } return false }, rel)
          if (!opened) fail('표: 트리에 새 파일이 안 나타난다')
          await pg.waitForSelector('.mded .cm-content', { timeout: 9000 }); await wait(700)
          const shape = await pg.evaluate(() => {
            const t = document.querySelector('.mded .lp-tbl')
            if (!t) return { has: false }
            const rows = [...t.querySelectorAll('tr')]
            // ⚠ 칸 안에는 편집 손잡이(.lp-grip)가 함께 산다 — 사람이 읽는 글자는 그걸 뺀 것이다
            //    (제품도 같은 규칙으로 읽는다: MdEditor 의 `cellText`)
            const txt = (c) => [...c.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('lp-grip'))).map((n) => n.textContent).join('')
            const head = [...rows[0].children].map(txt)
            return { has: true, rows: rows.length, head, edit: rows[1].children[0].isContentEditable, align: getComputedStyle(rows[1].children[1]).textAlign, pipe: (document.querySelector('.mded .cm-content')?.textContent ?? '').includes('| 가 |') }
          })
          if (!shape.has) fail('표: 안 접혔다 — 파이프가 그대로 보인다')
          if (shape.rows !== 3 || shape.head.join() !== '이름,값') fail('표: 모양이 다르다 ' + JSON.stringify(shape))
          if (!shape.edit) fail('표: 칸이 그 자리에서 안 고쳐진다(contenteditable 아님)')
          if (shape.align !== 'right') fail('표: `---:` 정렬이 안 따라왔다 ' + JSON.stringify(shape))
          if (shape.pipe) fail('표: 원문 파이프가 같이 보인다(접기가 덜 됐다)')
          /**
           * 칸 하나 고치기 — 파일에서 **그 칸만** 달라져야 한다.
           * ⚠ **한 단계씩 확인하고 넘어간다.** 종전에는 «클릭 → End → 타이핑 → 다른 데 클릭» 을 쭉
           *    이어 붙였는데, 위젯이 그 사이에 다시 그려지면 포커스가 날아가 **타이핑이 허공에 떨어졌다**
           *    (이 검사가 가끔 빨개진 이유다 — 제품이 아니라 검사가 무른 것이었다).
           */
          const cellSel = '.mded .lp-tbl tr:nth-child(2) td:nth-child(2)'
          const cellNow = (sel) => pg.evaluate((s2) => { const c = document.querySelector(s2); return c ? [...c.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('lp-grip'))).map((n) => n.textContent).join('') : null }, sel)
          await pg.click(cellSel)
          await pg.waitForFunction((s2) => document.activeElement === document.querySelector(s2), cellSel, { timeout: 5000 })
          await pg.keyboard.press('End'); await pg.keyboard.type('9')
          for (let i = 0; i < 30 && (await cellNow(cellSel)) !== '19'; i++) await wait(100)
          if ((await cellNow(cellSel)) !== '19') fail('표: 칸에 글자가 안 들어갔다 · ' + JSON.stringify(await cellNow(cellSel)))
          await pg.click('.mded .lp-h1')
          // ⚠ 자동 저장은 **멎고 800ms 뒤**다 — 고정 대기로 재면 느린 날에 빨개진다(실제로 한 번 갈렸다). 값이 될 때까지 기다린다.
          const untilFile = async (want, what) => { let got = ''; for (let i = 0; i < 60; i++) { got = readFileSync(abs, 'utf8'); if (got === want) return; await wait(150) } fail(`${what}\n--- 기대\n` + JSON.stringify(want) + '\n--- 실제\n' + JSON.stringify(got)) }
          const want = src.replace('| 가 | 1 |', '| 가 | 19 |')
          await untilFile(want, '표: 칸만 바뀌어야 한다(표를 통째로 다시 썼다?)')
          // ＋행 — 순수 끼워 넣기
          await pg.hover('.mded .lp-tblw')
          await pg.click('.mded .lp-tb:has-text("＋행")')
          await untilFile(want.replace('| 나 | 2 |', '| 나 | 2 |\n|  |  |'), '표: ＋행이 끼워 넣기가 아니다')
          /**
           * 🔴 **표 편집 — 행·열·정렬** (2026-09-13 Dave: «테이블 편집»).
           * ⚠ churn 0 은 여기서도 계약이다 — 정렬을 바꾸면 **구분줄의 그 칸만**, 열을 지우면
           *    줄마다 **그 칸과 파이프 하나만** 바뀐다. 표를 다시 직렬화하면 그 자리에서 걸린다.
           */
          {
            const withRow = want.replace('| 나 | 2 |', '| 나 | 2 |\n|  |  |')
            // 정렬 — 첫 열을 가운데로. 구분줄 한 칸만 바뀐다
            await pg.hover('.mded .lp-tbl th:nth-child(1)')
            await pg.click('.mded .lp-tbl th:nth-child(1) .lp-grip'); await wait(250)
            const menu = await pg.textContent('.lp-tmenu')
            for (const w of ['왼쪽에 열 추가', '오른쪽으로 옮기기', '가운데 맞춤', '열 지우기']) if (!(menu ?? '').includes(w)) fail(`열 메뉴에 «${w}» 가 없다 · ` + menu)
            await pg.click('.lp-tmenu button:has-text("가운데 맞춤")')
            await untilFile(withRow.replace(/\|\s*---\s*\|/, '| :---: |'), '표: 정렬이 구분줄 한 칸만 바꾸지 않았다')
            const center = await pg.evaluate(() => getComputedStyle(document.querySelectorAll('.mded .lp-tbl tr')[1].children[0]).textAlign)
            if (center !== 'center') fail('표: 가운데 맞춤이 화면에 안 왔다 · ' + center)
            // 행 지우기 — 방금 넣은 빈 행을 다시 뺀다(줄 하나 + 앞 줄바꿈만)
            await pg.hover('.mded .lp-tbl tr:nth-child(4) td:nth-child(1)')
            await pg.click('.mded .lp-tbl tr:nth-child(4) td:nth-child(1) .lp-grip'); await wait(250)
            const rmenu = await pg.textContent('.lp-tmenu')
            for (const w of ['위에 행 추가', '위로 옮기기', '행 지우기']) if (!(rmenu ?? '').includes(w)) fail(`행 메뉴에 «${w}» 가 없다 · ` + rmenu)
            await pg.click('.lp-tmenu button:has-text("행 지우기")')
            await untilFile(want.replace(/\|\s*---\s*\|/, '| :---: |'), '표: 행 지우기가 줄 하나만 빼지 않았다')
          }
          // ⋯ — 커서를 표 안에 넣으면 원문(파이프)으로 풀린다. 「모드」가 아니라 커서 규칙 하나다
          await pg.hover('.mded .lp-tblw')
          await pg.click('.mded .lp-tb:has-text("⋯")'); await wait(500)
          const raw = await pg.evaluate(() => ({ tbl: !!document.querySelector('.mded .lp-tbl'), text: document.querySelector('.mded .cm-content')?.textContent ?? '' }))
          if (raw.tbl) fail('표: ⋯ 를 눌러도 원문으로 안 풀린다')
          if (!raw.text.includes('| 가 | 19 |')) fail('표: 원문에 파이프가 안 보인다 ' + JSON.stringify(raw.text.slice(0, 120)))
          ok('표 — 칸 · 행 · 열 · 정렬을 그 자리에서, 바뀌는 건 그 문자뿐 · ⋯ 로 원문')
          // 외부 앱으로 열기 — ⋯ 안이 아니라 바깥 아이콘 (2026-09-13 Dave)
          if (!(await pg.$('.dtb .r .ib[title$="열기"]'))) fail('문서 도구: «외부로 열기» 아이콘이 바깥에 없다')
          // 🔴 **편집 중에 다른 문서로 옮겨도 그 글이 새 문서를 덮지 않는다** (2026-09-13 실사고 — todo.md 가 표로 덮였다)
          const todoAbs = join(root, '3. Area/제품_Rondo', 'todo.md')
          const todo0 = readFileSync(todoAbs, 'utf8')
          await pg.evaluate(() => { const t = [...document.querySelectorAll('.trow')].find((x) => /todo\.md/.test(x.textContent ?? '')); t?.click() })
          await wait(1800)
          if (readFileSync(todoAbs, 'utf8') !== todo0) fail('문서 이동: 편집하던 글이 새 문서에 덮여 썼다\n--- 지금\n' + JSON.stringify(readFileSync(todoAbs, 'utf8').slice(0, 200)))
          ok('문서를 옮겨도 편집하던 글이 따라오지 않는다')
          try { rmSync(abs) } catch {}
          await wait(400)
        }
        // 🔴 답변 속 경로가 칩이 된다 — 있는 파일만 (2026-09-13 Dave: «채팅에서 문서 선택으로 바로 이동»)
        {
          // ⚠ 이름을 `ok` 로 두지 마라 — 전역 `ok()` 를 가려서 같은 블록의 성공 보고가 그 자리에서 터진다
          const ex = await api(`/bots/${bot.id}/exists`, { rels: ['todo.md', '없는파일.md', '../밖.md'] })
          if (ex['todo.md'] !== true) fail('exists: 있는 파일을 없다고 한다 ' + JSON.stringify(ex))
          if (ex['없는파일.md'] !== false) fail('exists: 없는 파일을 있다고 한다 ' + JSON.stringify(ex))
          if (ex['../밖.md'] !== false) fail('exists: 루트 밖이 새어 나간다 ' + JSON.stringify(ex))
          // 화면 — 스텁이 되돌려 주는 문장 안의 경로 중 **있는 것만** 칩이 된다
          await pg.fill('.composer textarea', '첨부/회의록.txt 와 없는폴더/없음.md 를 봐')
          await pg.keyboard.press('Meta+Enter')
          let chip = null
          for (let i = 0; i < 40; i++) { chip = await pg.evaluate(() => { const c = [...document.querySelectorAll('.chat-body .pchip')]; return { n: c.length, titles: c.map((x) => x.title), last: (document.querySelector('.chat-body .md:last-of-type')?.textContent ?? '') } }); if (chip.n) break; await wait(300) }
          if (!chip.n) fail('경로 칩: 있는 파일이 칩이 안 됐다 ' + JSON.stringify(chip))
          if (!chip.titles.some((t) => t.endsWith('첨부/회의록.txt'))) fail('경로 칩: 엉뚱한 것이 칩이 됐다 ' + JSON.stringify(chip))
          if (chip.titles.some((t) => t.includes('없는폴더'))) fail('경로 칩: 없는 파일이 칩이 됐다 — 죽은 링크가 쌓인다 ' + JSON.stringify(chip))
          await pg.fill('.composer textarea', ''); await wait(400)
          // 🔴 **링크 앞에 파비콘** (2026-09-13 Dave) — 자리표시자를 먼저 놓으므로 인터넷이 없어도 자리는 있다.
          //    ⛔ 비워 두고 도착할 때 넣으면 글줄이 그때마다 옆으로 밀린다.
          {
            await pg.fill('.composer textarea', 'https://example.com 을 봐 줘')
            const chip = await pg.evaluate(() => { const c = document.querySelector('.lchips .lchip'); return c ? { t: c.textContent, ic: !!c.querySelector('img.fvic') } : null })
            if (!chip || !chip.ic) fail('입력창: 쓰는 중인 주소에 아이콘 칩이 없다 ' + JSON.stringify(chip))
            if (!/example\.com/.test(chip.t ?? '')) fail('입력창: 칩이 도메인을 안 보여 준다 ' + JSON.stringify(chip))
            await pg.keyboard.press('Meta+Enter')
            let fv = 0
            for (let i = 0; i < 40; i++) { fv = await pg.evaluate(() => document.querySelectorAll('.chat-body .md a img.fvic').length); if (fv) break; await wait(300) }
            if (!fv) fail('채팅: 답 속 링크에 파비콘 자리가 없다')
            await pg.fill('.composer textarea', ''); await wait(300)
            ok('링크 파비콘 — 채팅 · 문서 · 입력창이 같은 캐시를 본다')
          }
          /**
           * 🔴 **혼자 선 링크는 박스, 글 속 링크는 밑줄** (2026-09-13 Dave: *«링크와 첨부 모두 rondo 처럼
           *    채팅 안에 박스로 만들어지고 그 박스에 마우스 오버했을때 미리보기»*).
           * ⚠ 문장 가운데 링크까지 박스가 되면 글이 끊긴다 — 그건 밑줄로 남아야 한다.
           * ⚠ 미리보기 카드는 **body 에** 뜬다(말풍선 안이면 대화의 overflow 에 잘린다).
           */
          {
            await pg.fill('.composer textarea', '링크박스 테스트')
            await pg.keyboard.press('Meta+Enter')
            let box = null
            for (let i = 0; i < 40; i++) {
              box = await pg.evaluate(() => {
                const bs = [...document.querySelectorAll('.chat-body .md a.linkbox')]
                const inline = [...document.querySelectorAll('.chat-body .md p a[href^="http"]')]
                return { n: bs.length, t: bs[0]?.querySelector('.t')?.textContent ?? '', h: bs[0]?.querySelector('.h')?.textContent ?? '', ic: !!bs[0]?.querySelector('img.fvic'), inline: inline.length }
              })
              if (box.n) break
              await wait(300)
            }
            if (!box.n) fail('링크 박스: 혼자 선 링크가 박스가 안 됐다 ' + JSON.stringify(box))
            if (!box.ic) fail('링크 박스: 파비콘 자리가 없다 ' + JSON.stringify(box))
            if (!/example\.com/.test(box.h)) fail('링크 박스: 호스트가 안 보인다 ' + JSON.stringify(box))
            if (!box.inline) fail('링크 박스: 글 속 링크까지 박스로 삼켰다 — 문장이 끊긴다 ' + JSON.stringify(box))
            // 오버 → 미리보기 카드가 **body 에** 뜬다
            await pg.hover('.chat-body .md a.linkbox')
            let hp = null
            for (let i = 0; i < 20; i++) { hp = await pg.evaluate(() => { const c = document.querySelector('.hovprev'); return c ? { body: c.parentElement === document.body, pos: getComputedStyle(c).position, t: c.querySelector('.t')?.textContent ?? '' } : null }); if (hp) break; await wait(150) }
            if (!hp) fail('미리보기: 오버해도 카드가 안 뜬다')
            if (!hp.body) fail('미리보기: 카드가 body 에 안 붙었다 — 대화 overflow 에 잘린다 ' + JSON.stringify(hp))
            if (hp.pos !== 'fixed') fail('미리보기: position 이 fixed 가 아니다 ' + JSON.stringify(hp))
            await pg.fill('.composer textarea', ''); await wait(300)
            ok('링크 박스 — 혼자 선 링크만 박스 · 오버하면 body 에 미리보기')
          }
          /**
           * 🔴 **코드 블록에 언어 이름과 복사 단추** (Rondo 이식 B3).
           * ⚠ 머리줄은 `pre` **밖**에 있어야 한다 — 안에 두면 코드 글자에 섞여 **복사에 딸려 온다**.
           */
          {
            await pg.fill('.composer textarea', '코드블록 테스트')
            await pg.keyboard.press('Meta+Enter')
            let cb = null
            for (let i = 0; i < 40; i++) {
              cb = await pg.evaluate(() => {
                const w = document.querySelector('.chat-body .md .cbwrap')
                if (!w) return null
                const pre = w.querySelector('pre')
                return { lang: w.querySelector('.cbbar .lg')?.textContent ?? '', cp: !!w.querySelector('.cbbar .cp'), inPre: !!pre?.querySelector('.cbbar'), code: (pre?.textContent ?? '').trim() }
              })
              if (cb) break
              await wait(300)
            }
            if (!cb) fail('코드 블록: 머리줄이 안 붙었다')
            if (cb.lang !== 'ts') fail('코드 블록: 언어 이름이 없다 ' + JSON.stringify(cb))
            if (!cb.cp) fail('코드 블록: 복사 단추가 없다 ' + JSON.stringify(cb))
            if (cb.inPre) fail('🔴 코드 블록: 머리줄이 pre 안에 있다 — 복사에 딸려 온다 ' + JSON.stringify(cb))
            if (cb.code !== 'const a = 1') fail('코드 블록: 코드 글자에 다른 게 섞였다 ' + JSON.stringify(cb))
            await pg.fill('.composer textarea', ''); await wait(300)
            ok('코드 블록 — 언어 이름 · 복사 단추 (코드 글자에는 안 섞인다)')
          }
        }
        // 🔴 채팅 외양은 **cursor 스타일**이다 (2026-09-13 Dave: «이전 스타일이 더 나»).
        //    사람 말은 상자 안에 왼쪽으로, 봇 말은 폭 제한 없는 평범한 본문.
        //    ✅ 남긴 것은 기계 접기(.mach)와 문서 링크칩(.pchip)뿐 — 그 둘은 Dave 가 콕 집어 원했다.
        {
          const look = await pg.evaluate(() => {
            const u = document.querySelector('.umsg')
            const md = document.querySelector('.chat-body .amsg .md')
            const body = document.querySelector('.chat-body')
            const cs = (e) => (e ? getComputedStyle(e) : null)
            return {
              umsgBg: u ? cs(u).backgroundColor : null,
              umsgAlign: u ? cs(u).textAlign : null,
              mdMax: md ? cs(md).maxWidth : null,
              lede: md ? parseFloat(getComputedStyle(md.querySelector('p') ?? md).fontSize) : 0,
              gap: body ? parseFloat(cs(body).rowGap) : null,
              sep: document.querySelectorAll('.chat-body .tsep').length,
              mach: document.querySelectorAll('.mach').length,
              toolLines: document.querySelectorAll('.chat-body > .tool').length
            }
          })
          const clear = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
          if (clear(look.umsgBg)) fail('cursor 스타일: 사람 말의 상자가 없다 ' + JSON.stringify(look))
          if (look.umsgAlign === 'right') fail('cursor 스타일: 사람 말이 아직 오른쪽 정렬이다 ' + JSON.stringify(look))
          if (look.gap !== 16) fail('cursor 스타일: 턴 사이가 16px 이 아니다 ' + JSON.stringify(look))
          if (look.mdMax !== 'none') fail('cursor 스타일: 봇 말에 읽기 폭 제한이 남아 있다 ' + JSON.stringify(look))
          if (look.sep) fail('cursor 스타일: 턴 경계선이 남아 있다 ' + JSON.stringify(look))
          if (look.lede > 15) fail('cursor 스타일: 답의 첫 줄이 아직 크다(머리줄이 남았다) ' + JSON.stringify(look))
          if (look.toolLines) fail('기계 접기: 도구가 대화에 펴져 있다 ' + JSON.stringify(look))
          if (!look.mach) fail('기계 접기: 접힌 줄(.mach)이 없다 ' + JSON.stringify(look))
          const machTx = await pg.textContent('.mach')
          if (!/도구 \d+회/.test(machTx ?? '')) fail('기계 접기: 접힌 줄이 «도구 N회» 가 아니다 ' + machTx)
          ok('채팅은 cursor 스타일 · 기계 접기와 링크칩만 남는다')
        }
        // 🔴 쓰다 만 메시지는 새로고침해도 남는다 (2026-09-13 Dave: «앱을 껐다가 켜면 날라가»)
        {
          await pg.fill('.composer textarea', '쓰다 만 메시지')
          await wait(600)                                  // 지연 저장(300ms)이 끝나길 기다린다
          const keys = await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fb:draft:')))
          if (!keys.length) fail('초안: localStorage 에 안 남았다')
          if (!/:.+:/.test(keys[0])) fail('초안: 키가 봇·세션으로 안 갈렸다 ' + JSON.stringify(keys))
          await pg.reload({ waitUntil: 'domcontentloaded' }); await pg.waitForSelector('.composer textarea', { timeout: 8000 }); await wait(1200)
          const back = await pg.inputValue('.composer textarea')
          if (back !== '쓰다 만 메시지') fail('초안: 새로고침 뒤 안 돌아왔다 · ' + JSON.stringify(back))
          // 보내면 지워진다
          await pg.fill('.composer textarea', ''); await wait(600)
          const left = await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fb:draft:')).length)
          if (left) fail('초안: 비웠는데 키가 남아 있다 ' + left)
        }
        // 지침 · 하네스 — 한 줄에 «아이콘 · 이름 · 범위» (2026-09-13 Dave: «지침과 하네스쪽 디자인도 깨져 있어»)
        //    클래스만 붙이고 CSS 를 안 써서 아이콘이 한 줄, 이름·범위가 붙어 흘렀다
        {
          await pg.click('.panel .sech:has-text("지침 · 하네스")'); await wait(900)
          const hz = await pg.evaluate(() => {
            const rows = [...document.querySelectorAll('.panel .hz')]
            if (!rows.length) return null
            return rows.slice(0, 6).map((r) => {
              const rb = r.getBoundingClientRect()
              const ic = r.querySelector('svg')?.getBoundingClientRect()
              const n = r.querySelector('.n')?.getBoundingClientRect()
              const sc = r.querySelector('.sc')?.getBoundingClientRect()
              return { h: rb.height, sameLine: !ic || !n || Math.abs((ic.top + ic.height / 2) - (n.top + n.height / 2)) < 6, gap: n && sc ? sc.left - n.right : 99, right: sc ? rb.right - sc.right : 99 }
            })
          })
          if (!hz) fail('지침 · 하네스: 줄이 하나도 없다')
          const bad = hz.filter((r) => r.h > 44 || !r.sameLine || r.gap < 2)
          if (bad.length) fail('지침 · 하네스: 줄이 깨졌다(아이콘·이름·범위가 한 줄이 아니거나 붙어 있다) ' + JSON.stringify(bad))
          await pg.click('.panel .sech:has-text("지침 · 하네스")'); await wait(300)
        }
        // 세션 삭제 버튼 — 행에 있고, 누르면 한 번 묻고, 목록에서 사라진다. 원래 보던 세션은 건드리지 않는다
        const keep = (await pg.textContent('.panel .srow.on .n')).trim()
        await pg.click('.panel .sech:has-text("세션") .tools .ib'); await wait(1000) // 지울 세션 하나 더 만든다
        const names = await pg.$$eval('.panel .srow .n', (r) => r.map((x) => x.textContent.trim()))
        const victim = names.find((n) => n !== keep)
        if (!victim) fail('세션 삭제 UI: 지울 세션이 안 생김 ' + JSON.stringify(names))
        const row = `.panel .srow:has(.n:text-is("${victim}"))`
        if (!(await pg.$(`${row} .del`))) fail('세션 삭제 UI: 삭제 버튼 없음')
        pg.once('dialog', (d) => d.dismiss())          // 취소하면 안 지운다
        await pg.click(`${row} .del`); await wait(700)
        if (!(await pg.$(row))) fail('세션 삭제 UI: 취소했는데 지워졌다')
        pg.once('dialog', (d) => d.accept())
        await pg.click(`${row} .del`); await wait(1200)
        if (await pg.$(row)) fail('세션 삭제 UI: 확인했는데 안 지워졌다 · ' + victim)
        const back = await pg.$$eval('.panel .srow .n', (r) => r.map((x) => x.textContent.trim()))
        if (!back.includes(keep)) fail('세션 삭제 UI: 남겨야 할 세션이 사라졌다 ' + JSON.stringify({ keep, back }))
        await pg.click(`.panel .srow:has(.n:text-is("${keep}"))`); await wait(1000)
        await pg.click('.col.side.left .nav:has-text("폴더 선택")'); await pg.waitForSelector('.pk [data-rel]', { timeout: 5000 }); await wait(300)

        // 🔴 **라이트 테마에서 글자가 배경에 묻히지 않는다** (2026-09-13 Dave: «여기서 시작 이 안 보여»)
        //    `color:#111` 처럼 박아 두면 --w 가 #111 인 라이트에서 배경과 글자가 같은 색이 된다.
        //    ⚠ 칠해진(불투명) 단추만 잰다 — 투명 단추는 부모 배경을 물려받아 여기서 잴 값이 아니다.
        {
          const bad = await pg.evaluate(() => {
            const root = document.documentElement
            const was = root.getAttribute('data-theme')
            root.setAttribute('data-theme', 'light')
            const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a] = [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]]; if (a < 1) return null; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
            const out = []
            for (const el of document.querySelectorAll('button, .btn, a.menu-a')) {
              const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue
              const cs = getComputedStyle(el)
              const bg = lum(cs.backgroundColor), fg = lum(cs.color)
              if (bg === null || fg === null) continue                 // 투명 배경 = 부모 것, 여기서 안 잰다
              const ratio = (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05)
              if (ratio < 3) out.push({ t: (el.textContent ?? '').trim().slice(0, 20), cls: el.className, bg: cs.backgroundColor, fg: cs.color, ratio: +ratio.toFixed(2) })
            }
            if (was) root.setAttribute('data-theme', was); else root.removeAttribute('data-theme')
            return out
          })
          if (bad.length) fail('라이트 테마: 글자가 배경에 묻힌 단추 ' + JSON.stringify(bad))
          ok('라이트 테마에서 단추 글자가 다 보인다')
        }
        await pg.screenshot({ path: 'test/tmp/desktop-picker.png' }); await pg.keyboard.press('Escape'); await wait(200); if (await pg.$('.pk')) await pg.click('.pk .modal-h .ib'); await wait(200)
        // 🔴 **채팅에 쓴 한 줄이 그대로 루틴이 된다** (2026-09-13 Dave: «폴더 채팅에서 바로 루틴 생성»)
        //    ⛔ 저장은 사람이 누른다 — 주기는 글에서 «읽어낸» 추측이라, 조용히 저장하면 엉뚱한 시각에 봇이 혼자 일한다.
        {
          await pg.fill('.composer textarea', '매주 월요일 아침 8시에 지난주 한 일 정리해 줘')
          await pg.click('.cbar button[title="첨부"]'); await wait(200)
          await pg.click('.cpop.plus .prow2:has-text("루틴으로 만들기")'); await wait(500)
          const sheet = await pg.evaluate(() => {
            const s = document.querySelector('.sheet'); if (!s) return null
            const v = [...s.querySelectorAll('input, textarea')].map((x) => x.value)
            return { name: v[0] ?? '', cron: v.find((x) => /^\d+ \d+ /.test(x)) ?? '', prompt: [...s.querySelectorAll('textarea')].map((x) => x.value).join(' ') }
          })
          if (!sheet) fail('루틴: 편집 화면이 안 떴다')
          if (sheet.cron !== '0 8 * * 1') fail('루틴: 「매주 월요일 아침 8시」 를 못 읽었다 ' + JSON.stringify(sheet))
          if (!/지난주 한 일 정리/.test(sheet.prompt)) fail('루틴: 시킬 일이 안 담겼다 ' + JSON.stringify(sheet))
          if (!/지난주/.test(sheet.name)) fail('루틴: 이름이 비었다 ' + JSON.stringify(sheet))
          // 저장하지 않고 닫으면 아무 일도 없어야 한다
          await pg.click('.sheet-h .btn:has-text("취소")'); await wait(400)
          const after = (await api('/bots')).find((b) => b.id === bot.id)
          if ((after?.routines ?? []).some((r) => /지난주/.test(r.name))) fail('루틴: 안 눌렀는데 저장됐다')
          await pg.fill('.composer textarea', ''); await wait(200)
          ok('채팅 한 줄 → 루틴 (주기까지 읽어서 채워 준다 · 저장은 사람이)')
        }
        // 🔴 **맥 기본 단축키** (2026-09-13 Dave: «키보드 단축키를 전 영역에 적용해줘. 맥 기본 단축키로»)
        //    ⛔ 맨 글자 단축키는 두지 않는다 — 글 쓰는 화면이 대부분이라 치는 순간 명령이 돈다.
        {
          const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
          await pg.keyboard.press(`${mod}+Slash`); await wait(350)
          if (!(await pg.$('.modal.keys'))) fail('단축키: ⌘/ 로 표가 안 뜬다')
          const rows = await pg.$$eval('.modal.keys .krow .kk', (r) => r.map((x) => x.textContent))
          for (const want of ['⌘,', '⌘K', '⌘N', '⌘Z']) if (!rows.includes(want)) fail(`단축키 표에 ${want} 가 없다 ` + JSON.stringify(rows))
          await pg.keyboard.press('Escape'); await wait(250)
          await pg.keyboard.press(`${mod}+Comma`); await wait(500)
          if (!(await pg.$('.snav'))) fail('단축키: ⌘, 로 설정이 안 열린다')
          await pg.keyboard.press('Escape'); await wait(300)
          // ⛔ 입력칸에서 글을 칠 때는 단축키가 돌면 안 된다 — ⌘ 없이 치는 글자는 그냥 글자다
          await pg.fill('.composer textarea', 'nk,/')
          if (await pg.$('.modal.keys')) fail('단축키: 글자를 쳤는데 명령이 돌았다')
          await pg.fill('.composer textarea', ''); await wait(200)
          /**
           * 🔴 **⏎ 로는 안 보낸다** (2026-09-14 Dave: *«엔터 칠때 입력이 되면 안돼. 샌드버튼을 눌러야
           *    전송되게 해줘»*). 이 앱에 쓰는 글은 한 줄 채팅이 아니라 **지시문**이라, ⏎ 한 번에
           *    반쯤 쓴 말이 나가 버리는 일이 잦았다(폰에서는 자판의 ⏎ 가 바로 그 자리에 있다).
           * ⚠ 보내는 길은 **⌘⏎ 와 보내기 단추** 둘뿐이다.
           */
          {
            await pg.fill('.composer textarea', '엔터로는 안 나간다')
            await pg.keyboard.press('Enter'); await wait(500)
            const still = await pg.inputValue('.composer textarea')
            if (!still.includes('엔터로는 안 나간다')) fail('🔴 ⏎ 로 보내졌다 — 반쯤 쓴 말이 나간다 · ' + JSON.stringify(still))
            if (!/\n/.test(still)) fail('⏎ 가 줄바꿈도 안 했다 · ' + JSON.stringify(still))
            await pg.fill('.composer textarea', ''); await wait(200)
            ok('⏎ 로는 안 나간다 — 보내기는 ⌘⏎ 와 단추뿐')
          /**
           * 🔴 **계정이 안 받아 주는 모델이면 모델 없이 한 번 더** (2026-09-14).
           *    Codex 에서 먼저 겪은 일이 Claude 에서도 난다 — 요금제마다 쓸 수 있는 모델이 다르고,
           *    긴 문맥(1M) 같은 것은 특히 그렇다. 모델 하나 때문에 **턴이 통째로 죽는 것**이 제일 나쁘다.
           */
          {
            const rj = await api(`/bots/${bot.id}/sessions`, { name: '모델거절-claude', model: '못쓰는모델-x' })
            await api(`/sessions/${rj.id}/send`, { text: '거절 테스트' })
            let c = null
            for (let i = 0; i < 80; i++) { c = await api(`/sessions/${rj.id}/chat`); if (c.items.some((x) => x.kind === 'assistant')) break; await wait(250) }
            if (!c.items.some((x) => x.kind === 'system' && /이 계정에서 못 써요/.test(x.text ?? ''))) fail('모델 거절(Claude): 무슨 일이 났는지 안 알려 준다 ' + JSON.stringify(c.items.map((x) => [x.kind, (x.text ?? '').slice(0, 40)])))
            if (!c.items.some((x) => x.kind === 'assistant' && /스텁이 받았습니다/.test(x.text ?? ''))) fail('🔴 모델 거절(Claude): 모델 없이 다시 안 보냈다 ' + JSON.stringify(c.items.map((x) => [x.kind, (x.text ?? '').slice(0, 40)])))
            await api(`/sessions/${rj.id}`, undefined, 'DELETE').catch(() => {})
            ok('모델 거절 — Claude 도 모델 없이 한 번 더 보낸다')
          }
          }
          /**
           * 🔴 **대기 메시지를 고칠 수 있다** (2026-09-14 Dave: «현재 대기 메시지 수정이 안돼»).
           *    아직 안 보낸 말이다 — 못 고치면 지우고 처음부터 다시 쓰는 수밖에 없다.
           * ⚠ 여기의 ⏎ 는 «고치기 끝» 이다(보내기가 아니다).
           */
          {
            // 돌고 있는 동안 보내면 대기열로 간다 — 스텁이 도는 사이에 두 번 보낸다
            await pg.fill('.composer textarea', '느린일 하나')
            await pg.keyboard.press('Meta+Enter'); await wait(80)
            await pg.fill('.composer textarea', '대기에 들어갈 말')
            await pg.keyboard.press('Meta+Enter'); await wait(300)
            await pg.waitForSelector('.queue .tx', { timeout: 6000 }).catch(() => {})
            const q = await pg.$('.queue .tx')
            if (!q) fail('대기 메시지: 돌고 있는데 보낸 말이 대기열에 안 들어갔다')
            {
              await q.click(); await wait(250)
              await pg.fill('.queue .qin', '고친 말')
              await pg.keyboard.press('Enter'); await wait(300)
              const after = await pg.textContent('.queue .tx')
              if (!/고친 말/.test(after ?? '')) fail('대기 메시지: 고친 글이 안 남았다 · ' + after)
              ok('대기 메시지 — 눌러서 고친다')
            }
            // ⚠ 대기열을 비우고 나간다 — 안 그러면 느린 턴이 끝나며 그 말이 진짜로 나간다
            await pg.click('.queue button:not(.tx)').catch(() => {})
            await pg.fill('.composer textarea', ''); await wait(200)
          }
          /**
           * ⛔ **생각 줄에는 중단 단추가 없다** (2026-09-14 Dave) — 입력줄의 것과 겹친다.
           *    같은 일을 하는 단추가 한 화면에 둘이면 둘 다 «진짜 그건가» 를 한 번씩 생각하게 만든다.
           */
          if (await pg.$('.live .stop')) fail('🔴 생각 줄에 중단 단추가 되살아났다')
          ok('맥 기본 단축키 — ⌘, 설정 · ⌘/ 표 · 글 칠 때는 안 돈다')
          /**
           * 🔴 **명령 팔레트 ⌘P** (Rondo 이식 D1) — 폴더 · 문서 · 세션 · 명령이 한 목록에 선다.
           * ⛔ 되돌리기 어려운 일(지우기·은퇴)은 **여기 있으면 안 된다** — 손이 빠른 자리라
           *    한 글자 잘못 치고 ⏎ 를 누르면 그대로 실행된다.
           */
          await pg.keyboard.press('Meta+p'); await wait(500)
          const pal = await pg.evaluate(() => {
            const m = document.querySelector('.modal.pal')
            if (!m) return null
            return { rows: [...m.querySelectorAll('.prow')].map((r) => r.textContent ?? ''), on: m.querySelectorAll('.prow.on').length }
          })
          if (!pal) fail('팔레트: ⌘P 로 안 뜬다')
          if (pal.rows.length < 5) fail('팔레트: 목록이 너무 짧다 ' + JSON.stringify(pal.rows))
          if (!pal.rows.some((r) => /설정/.test(r))) fail('팔레트: 명령이 없다 ' + JSON.stringify(pal.rows.slice(0, 6)))
          if (pal.rows.some((r) => /지우기|은퇴|삭제/.test(r))) fail('🔴 팔레트에 되돌리기 어려운 일이 있다 ' + JSON.stringify(pal.rows))
          if (pal.on !== 1) fail('팔레트: 고른 줄이 하나가 아니다 ' + pal.on)
          // 글자를 치면 걸러지고, ↓ 로 내려가고, ⎋ 로 닫힌다
          await pg.fill('.modal.pal .pq input', '설정'); await wait(300)
          const filtered = await pg.evaluate(() => [...document.querySelectorAll('.modal.pal .prow')].map((r) => r.textContent ?? ''))
          if (!filtered.length || !filtered.every((r) => /설정/.test(r))) fail('팔레트: 거르기가 안 듣는다 ' + JSON.stringify(filtered))
          await pg.keyboard.press('Escape'); await wait(300)
          if (await pg.$('.modal.pal')) fail('팔레트: ⎋ 로 안 닫힌다')
          ok('명령 팔레트 ⌘P — 폴더 · 문서 · 세션 · 명령 (되돌리기 어려운 일은 없다)')
        }
        /**
         * ⛔ **고른 줄에 주황 네모가 씌워지면 안 된다** (2026-09-13 Dave: *«선택시 생기는 오렌지 박스는
         *    없애줘. 불필요해»*). 맥의 강조색이 주황이면 크롬 기본 초점 테두리가 그 색으로 나온다.
         * ⚠ 같은 라운드에 «회사 표식은 세션 이름 오른쪽에» 도 넣었지만 **여기서는 못 잰다** —
         *    표식은 깔린 제공자가 둘 이상일 때만 그린다(Brand.tsx 의 오래된 계약: «Codex가 없으면
         *    아예 안보여야 해»). 이 스모크 호스트에는 Claude 하나뿐이라 마크업이 아예 없다.
         *    ⛔ 그 계약을 이 검사 하나 때문에 풀지 마라 — 두 제공자 호스트는 아래 «에이전트 고르기»
         *    블록에 따로 있고, 거기에는 화면이 안 붙어 있다.
         */
        {
          // ⚠ 재는 것은 «테두리가 있나» 가 아니라 «**시스템이 칠하는 테두리**인가» 다. 크롬 기본값은
          //    `outline: -webkit-focus-ring-color auto` → 계산값 `auto` 이고, 그 색이 맥의 강조색(주황)이다.
          //    우리는 그걸 끄고 키보드 초점에만 **우리 색 1px** 를 남겼다.
          const ring = await pg.evaluate(() => { const e = document.querySelector('.brow'); e.focus(); const c = getComputedStyle(e); return { style: c.outlineStyle, w: c.outlineWidth, color: c.outlineColor } })
          if (ring.style === 'auto') fail('초점 테두리: 시스템 강조색 네모가 그대로다 ' + JSON.stringify(ring))
          if (ring.style !== 'none' && ring.w !== '1px') fail('초점 테두리: 우리 선이 1px 가 아니다 ' + JSON.stringify(ring))
          const marks = await pg.evaluate(() => ({ menu: document.querySelectorAll('.menu .vmk').length, side: document.querySelectorAll('.srow .vmk').length, rows: document.querySelectorAll('.srow').length }))
          if (marks.rows && marks.side && marks.side !== marks.rows) fail('회사 표식: 우측 세션 목록에 빠진 줄이 있다 ' + JSON.stringify(marks))
          ok('주황 초점 네모 없음 · 회사 표식은 세션 줄마다')
        }
        /**
         * 🔴 **레일 차례 — 끌어 놓기 · 상태별** (2026-09-13 Dave: *«각 폴더가 위아래로 드래그 드롭으로
         *    소팅이 안돼. 그리고 상태별로도 소팅되면 좋겠어. (상위 폴더 PARA는 유지)»*).
         * ⚠ 섹션(PARA)은 갈래를 무엇으로 바꾸든 **그대로**여야 한다 — 여기서 정하는 건 섹션 안의 차례뿐이다.
         * ⚠ 끌어 놓은 차례는 **볼트에 남는다**(기기마다 달라지면 «내가 옮긴 게 어디 갔지» 가 된다).
         */
        {
          const secsOf = () => pg.evaluate(() => [...document.querySelectorAll('.sb-list .secl')].map((e) => e.textContent))
          const namesOf = () => pg.evaluate(() => [...document.querySelectorAll('.sb-list .brow .n')].map((e) => e.textContent))
          const before = await secsOf()
          if (!(await pg.$('.sortbar'))) fail('레일: 정렬 갈래 막대가 없다')
          await pg.click('.sortbar button:has-text("상태")'); await wait(300)
          if (JSON.stringify(await secsOf()) !== JSON.stringify(before)) fail('상태 정렬이 PARA 섹션을 흩었다 · ' + JSON.stringify(await secsOf()))
          await pg.click('.sortbar button:has-text("이름")'); await wait(300)
          // 끌어 놓기는 API 로 잰다 — 화면 드래그는 붙였다 떼는 타이밍이 기기마다 달라 조용히 무른 검사가 된다
          const ids = (await api('/bots')).filter((b) => !b.orchestrator).map((b) => b.id)
          if (ids.length >= 2) {
            const want = [ids[1], ids[0], ...ids.slice(2)]
            await api('/bots/reorder', { ids: want })
            const got = (await api('/bots')).filter((b) => !b.orchestrator).map((b) => b.id)
            if (JSON.stringify(got) !== JSON.stringify(want)) fail('레일 차례: 호스트가 안 기억한다 ' + JSON.stringify({ want, got }))
            // ⚠ 모르는 id 는 무시하고 빠진 것은 뒤에 붙는다 — 낡은 목록을 보내도 봇이 사라지면 안 된다
            await api('/bots/reorder', { ids: ['없는봇', ids[0]] })
            const kept = (await api('/bots')).filter((b) => !b.orchestrator).map((b) => b.id)
            if (kept.length !== ids.length) fail('레일 차례: 낡은 목록을 보냈더니 봇이 사라졌다 ' + JSON.stringify(kept))
            if (kept[0] !== ids[0]) fail('레일 차례: 보낸 id 가 맨 앞으로 안 왔다 ' + JSON.stringify(kept))
          }
          await pg.click('.sortbar button:has-text("직접")'); await wait(400)
          if (!(await namesOf()).length) fail('직접 정렬: 목록이 비었다')
          if (JSON.stringify(await secsOf()) !== JSON.stringify(before)) fail('직접 정렬이 PARA 섹션을 흩었다')
          await pg.click('.sortbar button:has-text("이름")'); await wait(300)
          ok('레일 차례 — 이름 · 직접(볼트에 남음) · 상태 · PARA 섹션은 그대로')
        }
        // 🔴 **레일 우클릭 — 지우기(연결 해지) · 은퇴** (2026-09-13 Dave 정정)
        //    ⛔ «지우기» 는 **폴더를 건드리지 않는다** — 레일에서만 덜어낸다. 폴더가 사라지면 회귀다.
        {
          // ⚠ 첫 줄은 **관제(오케스트레이터)** 다 — 그 줄에는 지우기·은퇴가 없다(있으면 볼트를 지운다)
          await pg.click('.sb-list .brow:has-text("제품_Rondo")', { button: 'right' }); await wait(300)
          const mtx = await pg.textContent('.menu.ctx')
          if (!/지우기/.test(mtx ?? '')) fail('레일 우클릭: 지우기 항목이 없다 · ' + mtx)
          if (/폴더 삭제/.test(mtx ?? '')) fail('레일 우클릭: 폴더를 지우는 항목이 되살아났다 · ' + mtx)
          if (!/은퇴/.test(mtx ?? '')) fail('레일 우클릭: 은퇴가 사라졌다 · ' + mtx)
          await pg.keyboard.press('Escape'); await wait(200)
          // 실제 동작은 API 로 잰다 — 화면에서 지우면 이어지는 검사들이 쓰는 봇이 사라진다
          const tmpRel = '2. Projects/2026-09_덜어낼폴더'
          mkdirSync(join(root, tmpRel), { recursive: true })
          const tb = await api('/bots/start', { rel: tmpRel })
          await api(`/bots/${tb.id}/stop`, {})
          if ((await api('/bots')).some((b) => b.id === tb.id)) fail('지우기: 레일에 아직 남아 있다')
          if (!existsSync(join(root, tmpRel))) fail('🔴 지우기가 폴더를 지웠다 — 연결만 끊어야 한다')
          ok('레일 우클릭 — 지우기는 연결만 끊는다(폴더는 그대로) · 은퇴는 남아 있다')
        }
        // 🔴 **파일 휴지통 · 옮기기** — 트리에서 치우고 끌어 놓는 길(A6·A7·A8)
        {
          const f1 = await api(`/bots/${bot.id}/new`, { dir: '', name: '치울메모', kind: 'note' })
          const f2 = await api(`/bots/${bot.id}/new`, { dir: '', name: '옮길메모', kind: 'note' })
          const d1 = await api(`/bots/${bot.id}/new`, { dir: '', name: '받을폴더', kind: 'folder' })
          const mv = await api(`/bots/${bot.id}/move`, { rels: [f2.rel], dir: d1.rel })
          if (mv.failed.length || !mv.moved.length) fail('옮기기: 실패 ' + JSON.stringify(mv))
          if (!existsSync(join(root, '3. Area/제품_Rondo', d1.rel, '옮길메모.md'))) fail('옮기기: 목적지에 없다')
          if (existsSync(join(root, '3. Area/제품_Rondo', f2.rel))) fail('옮기기: 원래 자리가 그대로다')
          const tr = await api(`/bots/${bot.id}/trash`, { rels: [f1.rel] })
          if (!tr.to.length || !/^\.folderbot\/trash\//.test(tr.to[0])) fail('휴지통: 안 갔다 ' + JSON.stringify(tr))
          if (existsSync(join(root, '3. Area/제품_Rondo', f1.rel))) fail('휴지통: 원래 자리가 그대로다')
          if (!existsSync(join(root, tr.to[0]))) fail('휴지통: 거기에도 없다 — 진짜로 지웠다')
          // ⛔ 봇 폴더 밖으로는 못 나간다
          const esc = await api(`/bots/${bot.id}/trash`, { rels: ['../../어딘가'] })
          if (esc.to.length) fail('🔴 휴지통이 봇 폴더 밖을 치웠다')
          try { rmSync(join(root, '3. Area/제품_Rondo', d1.rel), { recursive: true }) } catch {}
          ok('파일 휴지통 · 옮기기 — 봇 폴더 안에서만, 지우지 않고 옮긴다')
        }
        /**
         * 🔴 **다시 연결** (2026-09-13 Dave: *«현재 연결된 claude code 나 codex 를 재 연결하는 기능이 없어»*).
         *    도구 목록·인증은 **워커가 뜰 때 고정된다** — 터미널에서 로그인을 새로 해도 이미 떠 있는
         *    세션에는 안 닿는다. 그래서 워커만 내리고 **대화·세션 id 는 남긴다**.
         * ⛔ 일하는 중인 워커는 그 자리에서 안 죽인다(턴이 끝나면 내려간다).
         */
        {
          const before = await api(`/bots/${bot.id}/sessions`)
          const r = await api('/auth/reconnect', {})
          if (typeof r.now !== 'number' || typeof r.pending !== 'number') fail('다시 연결: 몇 개를 다뤘는지 안 알려 준다 ' + JSON.stringify(r))
          const after = await api(`/bots/${bot.id}/sessions`)
          if (after.length !== before.length) fail('🔴 다시 연결이 세션을 지웠다 — 일꾼만 내려야 한다 ' + JSON.stringify({ b: before.length, a: after.length }))
          const chat = await api(`/sessions/${before[0].id}/chat`)
          if (!chat.items.length) fail('🔴 다시 연결이 대화를 지웠다')
          /**
           * 🔴 **진단** (2026-09-13 Dave: «상황을 어떻게 알아보고 알려줄까?») — 사람이 전령이 되면 안 된다.
           * ⛔ **열쇠가 들어가면 안 된다** — 이 글은 채팅에 붙여넣게 된다. 토큰·API 키 값은 빼고
           *    «있음/없음» 과 크기·시각까지만.
           */
          const dg = await api('/auth/diagnose')
          for (const want of ['[Claude Code]', '[Codex]', 'CODEX_HOME', '바이너리']) if (!dg.text.includes(want)) fail(`진단에 «${want}» 가 없다\n` + dg.text)
          if (/sk-ant-|sk-[A-Za-z0-9]{20}|oat01/.test(dg.text)) fail('🔴 진단에 열쇠 값이 들어갔다')
          ok('다시 연결 — 일꾼만 내리고 세션·대화는 남는다 · 진단은 열쇠 없이 상황만')
        }
        /**
         * 🔴 **화면 문구는 범용이어야 한다** (2026-09-13 Dave: *«이 프로덕트는 누구나 쓰는
         *    프로덕트이기 때문에 … 범용 문구가 써있어야 해»*).
         * ⛔ 특정 서비스 이름(Akiflow 등)을 예로 박으면 «그 서비스를 쓰는 사람의 도구» 처럼 읽힌다.
         *    우리가 말할 수 있는 것은 «이 맥에 깔린 것을 그대로 쓴다» 까지다.
         */
        {
          await pg.keyboard.press('Meta+,'); await wait(600)
          await pg.click('.modal.setw .nv:has-text("에이전트")').catch(() => {})
          await wait(600)
          const txt = await pg.textContent('.modal.setw')
          if (/Akiflow|아키플로/.test(txt ?? '')) fail('설정 문구에 특정 서비스 이름이 박혀 있다')
          if (!/이 맥에 설치된 MCP/.test(txt ?? '')) fail('설정: «이 맥에 설치된 MCP…» 범용 문구가 없다')
          await pg.keyboard.press('Escape'); await wait(300)
          ok('화면 문구는 범용 — 특정 서비스 이름을 안 박는다')
        }
        /**
         * 🔴 **답 아래 줄은 아이콘만** (2026-09-13 Dave) — 글자를 빼고 툴팁이 말한다.
         * ⛔ **복사는 원격에서 조용히 안 됐다** — `navigator.clipboard` 는 보안 컨텍스트에만 있고,
         *    폰·다른 맥이 여는 `http://100.x.x.x:7373` 에는 **그 객체가 없다**(`?.` 라 오류도 안 났다).
         *    그래서 그 객체를 지운 채로도 복사가 되는지(대체 길) 를 여기서 잰다.
         */
        {
          const row = await pg.evaluate(() => {
            const r = document.querySelector('.acts-row')
            if (!r) return null
            const bs = [...r.querySelectorAll('button')]
            return { n: bs.length, texts: bs.map((b) => (b.textContent ?? '').trim()), titles: bs.map((b) => b.title), icons: bs.filter((b) => b.querySelector('svg')).length }
          })
          if (!row || !row.n) fail('답 아래 줄이 없다')
          if (row.texts.some(Boolean)) fail('답 아래 줄에 글자가 남았다(아이콘만이어야 한다) · ' + JSON.stringify(row))
          if (row.icons !== row.n) fail('답 아래 줄에 아이콘 없는 단추가 있다 ' + JSON.stringify(row))
          if (!row.titles.every(Boolean)) fail('아이콘 단추에 툴팁이 없다 — 무엇을 하는지 알 길이 없다 ' + JSON.stringify(row))
          // 비보안 컨텍스트 흉내 — clipboard 를 지우고도 복사가 되어야 한다
          const fell = await pg.evaluate(async () => {
            const real = navigator.clipboard
            Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
            const ta = document.createElement('textarea'); document.body.appendChild(ta)
            document.querySelector('.acts-row button')?.click()
            await new Promise((r) => setTimeout(r, 300))
            const said = document.querySelector('.toast, .say')?.textContent ?? ''
            ta.remove()
            Object.defineProperty(navigator, 'clipboard', { value: real, configurable: true })
            return said
          })
          if (/못 했어요/.test(fell)) fail('복사: 비보안 컨텍스트(원격)에서 대체 길이 안 돈다 · ' + fell)
          ok('답 아래 줄은 아이콘만 · 복사는 원격(비보안)에서도 된다')
        }
        /**
         * 🔴 **트리 — 여럿 고르기 · 끌어다 옮기기 · 휴지통 · 숨김 파일 · ⌘Z** (Rondo 이식 A6·A7·A8·A10·A12).
         * ⚠ 고르는 기준은 **보이는 줄**이다 — 접힌 폴더 속까지 고르면 사람이 안 본 것을 지운다.
         * ⚠ 휴지통은 **지우지 않고 옮긴다** — ⌘Z(`/api/undo`)가 제자리로 되돌린다.
         */
        {
          // ① 숨김 파일 — 기본은 안 보이고, 켜면 보인다. ⛔ `.folderbot` 같은 기계 폴더는 켜도 안 보인다
          writeFileSync(join(root, '3. Area/제품_Rondo', '.숨은메모.md'), '숨김')
          const plain = await api(`/bots/${bot.id}/ls?dir=`)
          if (plain.some((n) => n.name === '.숨은메모.md')) fail('숨김 파일: 끄고도 보인다')
          const all = await api(`/bots/${bot.id}/ls?dir=&all=1`)
          if (!all.some((n) => n.name === '.숨은메모.md')) fail('숨김 파일: 켜도 안 보인다')
          if (all.some((n) => n.name === '.folderbot')) fail('숨김 파일: 기계 폴더(.folderbot)까지 보인다')
          rmSync(join(root, '3. Area/제품_Rondo', '.숨은메모.md'))
          // ② 여럿 고르기 — ⌘ 클릭으로 둘을 고르고, 우클릭 메뉴가 «N개 고름» 을 말한다
          // ⚠ 선택자를 `.trow` 로만 두면 **Inbox 절의 줄**까지 잡힌다(거기엔 클릭 동작이 없다) —
          //    파일 절의 것은 `.panel .secb button.trow` 다. 실제로 «0개 골라짐» 으로 한 번 물렸다.
          const FROW = '.panel .secb button.trow:not(.dir)'
          await pg.click(FROW, { modifiers: ['Meta'] }); await wait(150)
          await pg.click(`${FROW} >> nth=1`, { modifiers: ['Meta'] }); await wait(200)
          const two = await pg.evaluate(() => document.querySelectorAll('.trow.sel').length)
          if (two !== 2) fail('여럿 고르기: ⌘ 클릭으로 두 줄이 안 골라진다 · ' + two)
          await pg.click('.trow.sel', { button: 'right' }); await wait(300)
          const cmenu = await pg.textContent('.menu.ctx')
          if (!/2개 고름/.test(cmenu ?? '')) fail('여럿 고르기: 메뉴가 개수를 안 말한다 · ' + cmenu)
          if (!/휴지통으로/.test(cmenu ?? '')) fail('트리 메뉴에 «휴지통으로» 가 없다 · ' + cmenu)
          await pg.keyboard.press('Escape'); await wait(200)
          await pg.click(FROW); await wait(200)   // 맨 클릭 한 번이면 고른 것이 풀린다
          // ③ 휴지통 → ⌘Z — API 로 잰다(확인 대화상자는 화면에서 못 누른다)
          const gone = await api(`/bots/${bot.id}/new`, { dir: '', name: '되돌릴메모', kind: 'note' })
          const tr = await api(`/bots/${bot.id}/trash`, { rels: [gone.rel] })
          if (existsSync(join(root, '3. Area/제품_Rondo', gone.rel))) fail('휴지통: 원래 자리가 그대로다')
          const ul = await api('/undo')
          if (!ul.length || ul[0].to !== tr.to[0]) fail('되돌리기: 방금 치운 것이 목록 맨 위에 없다 ' + JSON.stringify(ul.slice(0, 2)))
          await api('/undo', { t: ul[0].t })
          if (!existsSync(join(root, '3. Area/제품_Rondo', gone.rel))) fail('🔴 되돌리기가 파일을 제자리로 못 돌렸다')
          rmSync(join(root, '3. Area/제품_Rondo', gone.rel))
          ok('트리 — 여럿 고르기 · 휴지통 · ⌘Z 되돌리기 · 숨김 파일')
        }
        // 🔴 **호스트 자신의 열쇠(this-mac)는 기기 목록에 안 보인다** (2026-09-13 Dave)
        //    ⛔ 목록에 두면 «끊기» 가 달리는데, 누르면 지금 보고 있는 창이 제 권한을 끊는다.
        {
          const st = await api('/state')
          if (st.devices.some((d) => d.name === 'this-mac')) fail('기기 목록에 this-mac 이 보인다 ' + JSON.stringify(st.devices))
        }
        // 🔴 **Finder 급 파일 조작** (2026-09-13 Dave: «finder에서 보기 · 새 노트/새 폴더 · 복사»)
        {
          // 새 노트 — `.md` 는 자동으로 붙고, 같은 이름이 있으면 비킨다
          const n1 = await api(`/bots/${bot.id}/new`, { dir: '', name: '메모', kind: 'note' })
          if (n1.rel !== '메모.md') fail('새 노트: .md 가 안 붙었다 ' + JSON.stringify(n1))
          if (!existsSync(join(root, '3. Area/제품_Rondo', '메모.md'))) fail('새 노트: 파일이 안 생겼다')
          const n2 = await api(`/bots/${bot.id}/new`, { dir: '', name: '메모', kind: 'note' })
          if (n2.rel !== '메모 2.md') fail('새 노트: 같은 이름을 덮어썼다(되돌릴 수 없는 일이다) ' + JSON.stringify(n2))
          // 새 폴더 — 확장자를 붙이지 않는다
          const f1 = await api(`/bots/${bot.id}/new`, { dir: '', name: '새 폴더', kind: 'folder' })
          if (f1.rel !== '새 폴더' || !existsSync(join(root, '3. Area/제품_Rondo', '새 폴더'))) fail('새 폴더: 안 만들어졌다 ' + JSON.stringify(f1))
          // 복제 — 「이름 사본」
          writeFileSync(join(root, '3. Area/제품_Rondo', '메모.md'), '내용')
          const c1 = await api(`/bots/${bot.id}/copy`, { rel: '메모.md' })
          if (c1.rel !== '메모 사본.md') fail('복제: 이름이 다르다 ' + JSON.stringify(c1))
          if (readFileSync(join(root, '3. Area/제품_Rondo', '메모 사본.md'), 'utf8') !== '내용') fail('복제: 내용이 안 따라왔다')
          // ⛔ 루트 밖은 막힌다
          let blocked = false
          try { await api(`/bots/${bot.id}/new`, { dir: '../..', name: '밖', kind: 'note' }) } catch { blocked = true }
          if (!blocked) fail('새 노트: 루트 밖에 만들어졌다')
          // 화면 — 우클릭 메뉴에 새 항목들이 있다
          await pg.click('.panel .secb button.trow:not(.dir)', { button: 'right' }); await wait(300)
          const mtx = await pg.textContent('.menu.ctx')
          for (const want of ['새 노트', '새 폴더', '복제', '경로 복사 (폴더 기준)']) if (!(mtx ?? '').includes(want)) fail(`파일 메뉴에 «${want}» 가 없다 · ` + mtx)
          await pg.keyboard.press('Escape'); await wait(200)
          for (const f of ['메모.md', '메모 2.md', '메모 사본.md']) { try { rmSync(join(root, '3. Area/제품_Rondo', f)) } catch {} }
          try { rmSync(join(root, '3. Area/제품_Rondo', '새 폴더'), { recursive: true }) } catch {}
          ok('파일 조작 — 새 노트(.md 자동·안 덮어씀) · 새 폴더 · 복제 · 메뉴')
        }
        // 🔴 **팝업은 절(section) 경계를 넘어 보인다** (2026-09-13 Dave: «지금 팝업이 짤리니깐»)
        //    ⛔ `z-index` 로는 못 푼다 — 잘림은 쌓임 순서가 아니라 **부모의 overflow** 라서, 밖으로 나가야 한다.
        {
          await pg.click('.panel .secb button.trow:not(.dir)', { button: 'right' }); await wait(300)
          const m = await pg.evaluate(() => {
            const el = document.querySelector('.menu.ctx'); if (!el) return null
            const r = el.getBoundingClientRect()
            const sec = el.closest('.sec, .secb')          // 절 안에 남아 있으면 거기서 잘린다
            const vis = r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.top >= -1
            return { inSec: !!sec, body: el.parentElement?.parentElement === document.body, pos: getComputedStyle(el).position, vis, h: r.height }
          })
          if (!m) fail('팝업: 우클릭 메뉴가 안 떴다')
          if (m.inSec) fail('팝업: 아직 절 안에 있다 — 거기서 잘린다 ' + JSON.stringify(m))
          if (m.pos !== 'fixed') fail('팝업: 고정 위치가 아니다 ' + JSON.stringify(m))
          if (!m.vis) fail('팝업: 화면 밖으로 나갔다 ' + JSON.stringify(m))
          if (m.h < 40) fail('팝업: 높이가 잘렸다 ' + JSON.stringify(m))
          await pg.keyboard.press('Escape'); await wait(200)
          if (await pg.$('.menu.ctx')) fail('팝업: ⎋ 로 안 닫힌다')
          ok('팝업은 절 경계를 넘어 body 에 뜬다 (⎋ · 바깥 클릭 · 스크롤에 닫힌다)')
        }
        // 트리 우클릭 — 폴더면 «새 봇 시작» 항목이 있다
        await pg.click('.panel .secb button.trow.dir', { button: 'right' }); await wait(200); const cm = await pg.textContent('.menu.ctx'); if (!/새 봇 시작|에이전트 시작|봇 열기/.test(cm ?? '')) fail('ui tree ctx: ' + cm); await pg.keyboard.press('Escape'); await wait(150)
        // 이름 바꾸기 — prompt() 가 아니라 앱 안 모달 (Electron 은 prompt 를 지원하지 않는다)
        await pg.click('.panel .secb button.trow:not(.dir)', { button: 'right' }); await wait(200); await pg.click('.menu.ctx button:has-text("이름 바꾸기")'); await wait(200)
        if (!(await pg.$('.modal.ask input.askin'))) fail('ui rename modal missing'); await pg.fill('.modal.ask input.askin', 'renamed-by-smoke.md'); await pg.keyboard.press('Enter'); await wait(700)
        if (!/renamed-by-smoke\.md/.test((await pg.textContent('.panel')) ?? '')) fail('ui rename did not apply'); if (await pg.$('.modal.ask')) fail('ui rename modal stuck')
        // 할 일 2.0 — 절 제목이 보이고, 목록은 제목만. 더블클릭하면 그 행에 설명이 펼쳐진다
        if (!/요청 · 할 일/.test((await pg.textContent('.panel')) ?? '')) fail('ui todo sections missing · 트리=' + JSON.stringify(await pg.$$eval('.panel .secb button.trow', (r) => r.map((x) => x.textContent.trim()))) + ' · 패널=' + JSON.stringify(((await pg.textContent('.panel')) ?? '').slice(0, 300)))
        const withDesc = await pg.$('.todo .mk')
        if (!withDesc) fail('ui todo: row with desc should show a › mark')
        if (await pg.$('.todo .dsc')) fail('ui todo: desc must be hidden until opened')
        const rowEl = await pg.$('.todo:has(.mk)'); await rowEl.dblclick(); await wait(200)
        if (!(await pg.$('.todo.on .dsc'))) fail('ui todo: double-click should reveal the description')
        await rowEl.dblclick(); await wait(150); if (await pg.$('.todo .dsc')) fail('ui todo: second double-click should collapse')
        // 편집 — 한 칸에 «제목: 설명»
        await pg.hover('.todo'); await pg.click('.todo .tools button[title="편집"]'); await wait(200)
        if (!(await pg.$('.todo.edit .ein'))) fail('ui todo edit box'); const cur = await pg.inputValue('.todo.edit .ein'); if (!/:/.test(cur) && !/PRD/.test(cur)) fail('ui todo edit value: ' + cur)
        await pg.fill('.todo.edit .ein', 'PRD v1.0 확정 (편집됨): Q2·Q5'); await pg.keyboard.press('Enter'); await wait(600)
        if (!/편집됨/.test((await pg.textContent('.panel')) ?? '')) fail('ui todo edit save')
        if (!(await pg.$('.sech .ib.mdb'))) fail('ui todo: todo.md button missing')
        const cbar = await pg.textContent('.composer .cbar'); if (!/Fable 5.1|Sonnet 5/.test(cbar) || !/자동|계획/.test(cbar) || !/높음/.test(cbar)) fail('ui cbar labels: ' + cbar)
        // 슬래시 자동완성 → 스킬이 뜬다 · @ → 파일이 뜬다
        await pg.fill('.composer textarea', '/st'); await wait(300); const sp = await pg.textContent('.cpop'); if (!/standup/.test(sp ?? '') || !/status/.test(sp ?? '')) fail('ui slash popup: ' + sp)
        // 🔴 문장 중간의 / 도 자동완성이 떠야 한다 (2026-09-13 Dave: «입력 중간에 / 를 입력해도»)
        await pg.fill('.composer textarea', '안녕 /st'); await wait(400)
        const midp = await pg.textContent('.cpop').catch(() => null)
        if (!midp || !/standup/.test(midp)) fail('문장 중간 «/» 에 스킬 목록이 안 뜬다 · ' + midp)
        await pg.keyboard.press('Enter'); await wait(300)
        const midv = await pg.inputValue('.composer textarea')
        if (!/^안녕 \/standup $/.test(midv)) fail('문장 중간 «/» 를 고르면 앞 문장이 사라진다 · ' + JSON.stringify(midv))
        // 경로의 슬래시에는 안 뜬다
        await pg.fill('.composer textarea', 'src/cli'); await wait(400)
        if (await pg.$('.cpop')) fail('경로의 «/» 에 목록이 떴다')
        await pg.fill('.composer textarea', ''); await wait(200)
        await pg.keyboard.press('Escape'); await pg.fill('.composer textarea', '@todo'); await wait(600); const ap = await pg.textContent('.cpop'); if (!/todo\.md/.test(ap ?? '')) fail('ui @ popup: ' + ap)
        await pg.keyboard.press('Enter'); await wait(200); const ta = await pg.inputValue('.composer textarea'); if (!/@todo\.md /.test(ta)) fail('ui @ insert: ' + ta); if (!(await pg.$('.chat-foot .files .chip'))) fail('ui @ attach chip')
        await pg.fill('.composer textarea', '')
        // 모드 팝업 · 모델 팝업
        await pg.click('.cbar .cbtn'); await wait(150); if (!/편집 자동 수락/.test((await pg.textContent('.cpop')) ?? '')) fail('ui mode popup'); await pg.keyboard.press('Escape')
        // ↓ 최근으로 — 위로 스크롤하면 뜨고, 직전 질문이 고정된다
        await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop = 0 }); await wait(400)
        if (!(await pg.$('.tobot'))) fail('ui ↓ button'); if (await pg.$('.pinq')) fail('ui pinned question should not show while the question is below')
        // 고정 질문은 답이 화면보다 길 때만 — 창을 낮춰서 질문을 지나쳐 본다
        await pg.setViewportSize({ width: 1440, height: 260 }); await wait(200)
        await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); const u = document.querySelector('.umsg.last'); el.scrollTop = u.offsetTop + u.offsetHeight + 60 }); await wait(400)
        if (!(await pg.$('.pinq'))) { console.log('DBG', JSON.stringify(await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); const u = document.querySelector('.umsg.last'); const r = el.getBoundingClientRect(); const ur = u?.getBoundingClientRect(); return { st: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight, rootTop: r.top, uTop: ur?.top, uBottom: ur?.bottom, uOff: u?.offsetTop, n: document.querySelectorAll('.umsg').length } }))); await pg.screenshot({ path: 'test/tmp/desktop-scrolled.png' }); fail('ui pinned question') }
        await pg.screenshot({ path: 'test/tmp/desktop-scrolled.png' })
        await pg.setViewportSize({ width: 1440, height: 900 }); await wait(200)
        await pg.evaluate(() => { document.querySelector('.chat-scroll').scrollTop = 0 }); await wait(300)
        // 🔴 **「최근으로」 단추는 다가가면 도망가지 않는다** (2026-09-13 Dave)
        //    ⛔ DOM 에서 빼고 다시 넣지 않는다(등장 애니메이션이 다시 돌아 4px 씩 튄다) — 투명도만 낮춘다.
        {
          const on = await pg.evaluate(() => { const e = document.querySelector('.tobot'); const r = e.getBoundingClientRect(); return { off: e.classList.contains('off'), anim: getComputedStyle(e).animationName, x: r.x, y: r.y } })
          if (on.off) fail('↓: 위로 올렸는데 안 뜬다 ' + JSON.stringify(on))
          if (on.anim !== 'none') fail('↓: 등장 애니메이션이 남아 있다 — 다시 뜰 때마다 자리가 튄다 ' + JSON.stringify(on))
          await pg.hover('.tobot'); await wait(600)
          const after = await pg.evaluate(() => { const r = document.querySelector('.tobot').getBoundingClientRect(); return { x: r.x, y: r.y } })
          if (Math.abs(after.x - on.x) > 0.5 || Math.abs(after.y - on.y) > 0.5) fail('↓: 마우스를 올리니 자리가 움직였다 ' + JSON.stringify({ on, after }))
        }
        await pg.click('.tobot'); await wait(900)
        if (!(await pg.evaluate(() => document.querySelector('.tobot')?.classList.contains('off')))) fail('ui ↓ should hide at bottom')
        // 파일 칩 → 문서 열이 열린다 · 트리 클릭 → 미리보기 탭
        await pg.click('.files .chip'); await pg.waitForSelector('.doc .dbody', { timeout: 5000 }); await wait(400)
        const tabs = await pg.$$eval('.doc .tab', (r) => r.length); if (tabs < 1) fail('doc tab')
        await pg.screenshot({ path: 'test/tmp/desktop-doc.png' })
        await pg.keyboard.press('Meta+Shift+D'); await wait(500); if (await pg.$('.doc')) fail('doc column should hide on ⌘⇧D · tabs=' + (await pg.$$eval('.doc .tab', (r) => r.length)) + ' · focus=' + (await pg.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className)))
        if (errs.length) fail('page errors: ' + errs.join(' | '))
      }
      if (name === 'phone') {
        if (await pg.$('.mtabs')) fail('phone: tab bar should be gone')
        if (!(await pg.$('.chat-hdr .rb')) || !(await pg.$('.cchips')) || !(await pg.$('.composer .plusb'))) fail('phone: round buttons / chips / pill composer')
        // 위 헤더는 불투명(페이드 없음) — 글이 밑으로 비치지 않는다
        const hb = await pg.$eval('.chat-hdr', (e) => getComputedStyle(e).backgroundImage + '|' + getComputedStyle(e).backgroundColor); if (/gradient/.test(hb) || /rgba\(\d+, \d+, \d+, 0\)/.test(hb)) fail('phone: header should be opaque ' + hb)
        // 헤더 알약의 봇 이름이 잘리지 않는다 (짧은 이름은 전부, 알약은 남는 폭을 쓴다)
        const bp = await pg.evaluate(() => { const b = document.querySelector('.bpill b'); const p = document.querySelector('.bpill'); return { text: b.textContent, sw: b.scrollWidth, cw: b.clientWidth, pw: p.getBoundingClientRect().width, hw: document.querySelector('.chat-hdr').getBoundingClientRect().width } })
        if (!(bp.cw > 40 && bp.sw <= bp.cw + 1 && /제품_Rondo/.test(bp.text))) fail('phone: header pill name clipped ' + JSON.stringify(bp))
        // 키보드: 입력칸에 포커스 → 시각 뷰포트 336px 축소 → 루트가 그만큼 줄고 컴포저는 그 바닥, 헤더는 숨고, 마지막 말은 컴포저 위에 보인다
        await pg.focus('.composer textarea'); await pg.evaluate(() => window.__kb(336)); await wait(500)
        const kbm = await pg.evaluate(() => { const r = document.querySelector('#root').getBoundingClientRect(); const c = document.querySelector('.composer').getBoundingClientRect(); const items = document.querySelectorAll('.chat-body > *'); const last = items[items.length - 1].getBoundingClientRect(); const hdr = getComputedStyle(document.querySelector('.chat-hdr')).display; return { kb: document.querySelector('.app').classList.contains('kb'), rootH: r.height, compBottom: c.bottom, compTop: c.top, lastBottom: last.bottom, hdr, ih: innerHeight } })
        if (!kbm.kb || Math.abs(kbm.rootH - (kbm.ih - 336)) > 2 || kbm.compBottom > kbm.ih - 336 + 1 || kbm.hdr !== 'none' || kbm.lastBottom > kbm.compTop + 1) fail('phone: keyboard layout ' + JSON.stringify(kbm))
        await pg.screenshot({ path: 'test/tmp/phone-kb.png' })
        await pg.evaluate(() => window.__kb(0)); await pg.evaluate(() => document.activeElement.blur()); await wait(400)
        const kbr = await pg.evaluate(() => ({ kb: document.querySelector('.app').classList.contains('kb'), rootH: document.querySelector('#root').getBoundingClientRect().height, ih: innerHeight, hdr: getComputedStyle(document.querySelector('.chat-hdr')).display }))
        if (kbr.kb || Math.abs(kbr.rootH - kbr.ih) > 2 || kbr.hdr === 'none') fail('phone: keyboard restore ' + JSON.stringify(kbr))
        // 🔴 입력창은 어떤 경우에도 화면 밖으로 나가지 않는다 — 시각 뷰포트가 실제보다 크다고 보고해도(과대 보고) 루트는 화면 높이를 넘지 않는다
        await pg.evaluate(() => window.__kb(-120)); await wait(300)
        const over = await pg.evaluate(() => ({ rootH: document.querySelector('#root').getBoundingClientRect().height, ih: innerHeight, compBottom: document.querySelector('.composer').getBoundingClientRect().bottom }))
        if (over.rootH > over.ih + 1 || over.compBottom > over.ih + 1) fail('phone: composer must stay on screen ' + JSON.stringify(over))
        await pg.evaluate(() => window.__kb(0)); await wait(200)
        // 🔴 iOS 가 시각 뷰포트를 아래로 밀어도(offsetTop) «키보드가 닫혔다» 고 착각하지 않는다
        //    종전 식은 offsetTop 을 빼서 140 아래로 떨어졌고, --vvh 를 지워 컴포저가 키보드 밑에 묻혔다
        //    (2026-09-13 Dave: «다시 키보드 올라갔을 때 채팅 화면 타이핑 위치 안 잡혀»)
        await pg.focus('.composer textarea'); await pg.evaluate(() => window.__kbOff(336, 300)); await wait(400)
        const push = await pg.evaluate(() => { const r = document.querySelector('#root').getBoundingClientRect(); const c = document.querySelector('.composer').getBoundingClientRect(); return { kb: document.querySelector('.app').classList.contains('kb'), rootTop: r.top, rootH: r.height, compBottom: c.bottom, ih: innerHeight, vh: visualViewport.height, top: visualViewport.offsetTop } })
        if (!push.kb) fail('phone: 밀린 시각 뷰포트를 «닫힘» 으로 착각 ' + JSON.stringify(push))
        if (Math.abs(push.rootH - push.vh) > 2 || Math.abs(push.rootTop - push.top) > 2) fail('phone: 밀린 만큼 루트가 안 따라감 ' + JSON.stringify(push))
        if (push.compBottom > push.top + push.vh + 1) fail('phone: 밀렸을 때 컴포저가 보이는 영역 밖 ' + JSON.stringify(push))
        await pg.evaluate(() => window.__kb(0)); await pg.evaluate(() => document.activeElement.blur()); await wait(300)

        // 🔴 레이아웃 뷰포트까지 줄어드는 판에서도 루트는 보이는 만큼이다
        //    종전에는 «키보드가 140px 이상 먹었을 때만» 맞췄는데, 이 판에서는 innerHeight − vv.height 가 0 이라
        //    «닫혔다» 로 떨어지고 루트가 100dvh 로 돌아갔다 — 그 dvh 는 키보드를 모르니 대화가 안 올라온다
        //    (2026-09-13 Dave 3차 스크린샷 · 그 라운드에 넣었던 interactive-widget 메타가 이 상황을 만들었다)
        await pg.focus('.composer textarea'); await pg.evaluate(() => window.__kbBoth(336)); await wait(500)
        const both = await pg.evaluate(() => { const r = document.querySelector('#root').getBoundingClientRect(); const c = document.querySelector('.composer').getBoundingClientRect(); return { rootH: r.height, compBottom: c.bottom, vh: visualViewport.height, ih: innerHeight } })
        if (Math.abs(both.rootH - both.vh) > 2) fail('phone: 레이아웃까지 줄어든 판에서 루트가 안 맞음 ' + JSON.stringify(both))
        if (both.compBottom > both.vh + 1) fail('phone: 대화·입력창이 키보드 위로 안 올라옴 ' + JSON.stringify(both))
        // 🔴 화장도 같은 판정을 쓴다 — 이 판(covered === 0)에서 문턱을 쓰면 칩이 남고 `--sab` 만큼 떠 있다
        //    (2026-09-13 Dave 4차 스크린샷: «키보드랑 입력창 사이에 여백이 너무 넓어»)
        const cos = await pg.evaluate(() => {
          const app = document.querySelector('.app')
          const c = document.querySelector('.composer').getBoundingClientRect()
          const foot = document.querySelector('.chat-foot')
          return { kb: app.classList.contains('kb'), chips: [...document.querySelectorAll('.cchips')].some((e) => e.getBoundingClientRect().height > 0), pad: parseFloat(getComputedStyle(foot).paddingBottom), gap: visualViewport.height - c.bottom, covered: Math.max(0, innerHeight - visualViewport.height) }
        })
        if (cos.covered !== 0) fail('phone: __kbBoth 가 레이아웃까지 줄이지 않았다 ' + JSON.stringify(cos))
        if (!cos.kb) fail('phone: 레이아웃까지 줄어든 판에서 «키보드 화장» 이 안 켜진다(문턱 부활?) ' + JSON.stringify(cos))
        if (cos.chips) fail('phone: 키보드 위에 모델 칩이 남아 있다 ' + JSON.stringify(cos))
        if (cos.pad > 10) fail('phone: 입력창 아래 여백이 넓다(--sab 를 그대로 비워 뒀다) ' + JSON.stringify(cos))
        if (cos.gap > 12) fail('phone: 입력창과 키보드 사이가 뜬다 ' + JSON.stringify(cos))
        await pg.evaluate(() => window.__kbReset()); await pg.evaluate(() => document.activeElement.blur()); await wait(400)

        // 입력칸을 누르면 대화가 맨 아래로 붙는다 — «무엇에 답하는지» 가 보여야 한다
        await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop = 0 }); await wait(200)
        await pg.focus('.composer textarea'); await pg.evaluate(() => window.__kb(336)); await wait(900)
        const stick = await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); return { d: el.scrollHeight - el.scrollTop - el.clientHeight, sh: el.scrollHeight, ch: el.clientHeight } })
        if (stick.sh > stick.ch + 20 && stick.d > 20) fail('phone: 키보드가 올라와도 맨 아래로 안 붙음 ' + JSON.stringify(stick))
        await pg.evaluate(() => window.__kb(0)); await pg.evaluate(() => document.activeElement.blur()); await wait(300)

        // iOS 26 이 키보드를 내린 뒤 시각 뷰포트를 60px 덜 돌려줘도(입력 중 아님) 루트는 전체 높이를 유지한다 — 아래 빈 띠 없음
        await pg.evaluate(() => window.__kb(60)); await wait(300)
        const stuck = await pg.evaluate(() => ({ rootH: document.querySelector('#root').getBoundingClientRect().height, ih: innerHeight, compBottom: document.querySelector('.composer').getBoundingClientRect().bottom }))
        if (Math.abs(stuck.rootH - stuck.ih) > 2 || stuck.ih - stuck.compBottom > 24) fail('phone: stale visual viewport left a bottom gap ' + JSON.stringify(stuck))
        await pg.evaluate(() => window.__kb(0)); await wait(200)
        await pg.click('.chat-hdr .rb'); await wait(300); if (!(await pg.$('.mhome .mcards')) || (await pg.$$eval('.mrow', (r) => r.length)) < 3) fail('phone: home cards/rows'); await pg.screenshot({ path: 'test/tmp/phone-home.png' })
        if (!(await pg.$('.mrow .l1 b .mid .mt'))) fail('phone: home row names should use middle ellipsis')
        const ov = await pg.evaluate(() => { const m = document.querySelector('.mscroll'); return { sw: m.scrollWidth, cw: m.clientWidth, dw: document.documentElement.scrollWidth, iw: innerWidth } }); if (ov.sw > ov.cw || ov.dw > ov.iw) fail('phone: horizontal overflow ' + JSON.stringify(ov))
        await pg.click('.mtop .rb'); await pg.waitForSelector('.setp', { timeout: 4000 }); await wait(300)
        {
          const rows = await pg.$$eval('.setp .sec-row', (r) => r.map((x) => x.textContent))
          if (rows.length < 9) fail('폰 설정: 목차가 목록이 아니다 ' + JSON.stringify(rows))
          const mr = await pg.evaluate(() => { const r = document.querySelector('.setp').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight } })
          if (!(mr.top >= 0 && mr.bottom <= mr.h + 1)) fail('phone: settings out of viewport ' + JSON.stringify(mr))
          await pg.screenshot({ path: 'test/tmp/phone-settings.png' })
          await pg.click('.setp .sec-row:has-text("화면")'); await wait(300)
          if (!(await pg.$('.setp .setr[data-t="테마"]'))) fail('폰 설정: 한 칸으로 안 들어간다')
          const ov2 = await pg.evaluate(() => ({ dw: document.documentElement.scrollWidth, iw: innerWidth }))
          if (ov2.dw > ov2.iw) fail('폰 설정: 가로로 넘친다 ' + JSON.stringify(ov2))
          await pg.click('.setp-h .ib'); await wait(250)          // 뒤로 → 목록
          await pg.click('.setp-h .ib:last-child'); await wait(250) // 닫기
        }
        // 알림 — 버튼 줄이 화면 맨 아래에 붙는다 (2026-09-13 Dave: «하단 메뉴가 맨 아래에 · 여백 조정»)
        {
          await pg.click('.mtop .rb:has(.bd), .mtop .rb >> nth=1'); await pg.waitForSelector('.nmodal', { timeout: 4000 }); await wait(400)
          const nf = await pg.evaluate(() => {
            const m = document.querySelector('.nmodal').getBoundingClientRect()
            const f = document.querySelector('.nmodal .modal-f').getBoundingClientRect()
            const b = document.querySelector('.nmodal .modal-b').getBoundingClientRect()
            return { gap: m.bottom - f.bottom, bodyH: b.height, mh: m.height, fTop: f.top, ih: innerHeight }
          })
          if (nf.gap > 24) fail('폰 알림: 버튼 줄 아래가 비었다 ' + JSON.stringify(nf))
          if (nf.bodyH < nf.mh * 0.5) fail('폰 알림: 목록이 화면 중간에서 끊긴다 ' + JSON.stringify(nf))
          await pg.screenshot({ path: 'test/tmp/phone-notify.png' })
          await pg.click('.nmodal .modal-h .ib'); await wait(250)
        }
        await pg.click('.mrow'); await wait(300); await pg.click('.chat-hdr .rb:last-child'); await wait(300); if (!(await pg.$('.rpwrap .rb'))) fail('phone: panel page'); await pg.screenshot({ path: 'test/tmp/phone-panel.png' })
        // 쓸어서 처리 — 행 도구는 없고, 오른쪽으로 길게 쓸면 완료된다 (터치 흉내)
        {
          if (!(await pg.$('.panel .swwrap'))) { // 오케스트레이터는 인박스를 쓴다 — 할 일이 있는 봇으로 옮긴다
            await pg.click('.rpwrap .rb'); await wait(250); await pg.click('.chat-hdr .rb'); await wait(350)
            for (const r of await pg.$$('.mrow')) { if (/제품_Rondo/.test((await r.textContent()) ?? '')) { await r.click(); break } }
            await wait(400); await pg.click('.chat-hdr .rb:last-child'); await wait(450)
          }
          await pg.waitForSelector('.panel .swwrap .swrow', { timeout: 5000 })
          const box = await pg.$eval('.panel .swwrap .swrow', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
          if (await pg.$('.panel .todo .tools')) fail('phone: row tools should be replaced by swipe')
          const title = await pg.$eval('.panel .swwrap .tt', (e) => e.textContent)
          const cy = box.y + box.h / 2
          await pg.dispatchEvent('.panel .swwrap .swrow', 'pointerdown', { pointerId: 7, pointerType: 'touch', clientX: box.x + 20, clientY: cy, buttons: 1 })
          for (const f of [0.1, 0.3, 0.55, 0.6]) await pg.dispatchEvent('.panel .swwrap .swrow', 'pointermove', { pointerId: 7, pointerType: 'touch', clientX: box.x + 20 + box.w * f, clientY: cy, buttons: 1 })
          await wait(120); const hint = await pg.textContent('.panel .swwrap .swhint'); if (!/완료/.test(hint ?? '')) fail('phone: swipe hint should say 완료 · ' + hint)
          await pg.dispatchEvent('.panel .swwrap .swrow', 'pointerup', { pointerId: 7, pointerType: 'touch', clientX: box.x + 20 + box.w * 0.6, clientY: cy })
          await wait(700)
          const done = await pg.$$eval('.panel .todo.done .tt', (r) => r.map((e) => e.textContent))
          const items = await pg.textContent('.panel')
          if (!(done.includes(title) || /완료/.test(items ?? ''))) fail('phone: swipe right-long should complete · ' + JSON.stringify({ title, done }))
          await pg.screenshot({ path: 'test/tmp/phone-swipe.png' })
          // ── 새 폰 할 일 (V19) — 행 생김새 · 오른쪽 여백 · 길게 눌러 옮기기 · 편집 시트 ──
          await pg.waitForSelector('.panel .ptodo', { timeout: 5000 })
        // 🔴 끊겼다 붙는 동안 바뀐 파일이 화면에 온다 (2026-09-13 Dave: «원격 모바일에서 수정된 파일이 바로 적용이 안 돼»)
        //    맥은 SSE 가 안 끊겨 프레임으로 최신이 됐고, 폰은 그 프레임을 놓친 채 /state 만 다시 읽어 할 일이 낡아 있었다.
        {
          const relBot = await pg.evaluate(() => location.hash)   // 지금 보고 있는 봇은 그대로 둔다
          const todoFile = join(root, '3. Area/제품_Rondo/todo.md')
          const before = readFileSync(todoFile, 'utf8')
          await pg.evaluate(() => { window.__sseOff?.() })         // 없으면 아래 오프라인 흉내로 끊는다
          await pg.context().setOffline(true); await wait(600)
          writeFileSync(todoFile, before.replace('## 요청 · 할 일\n', '## 요청 · 할 일\n- [ ] 끊긴-사이-에-생긴-할일: 다시 붙으면 보여야 한다\n'))
          await wait(700)
          await pg.context().setOffline(false)
          await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
          let seen = false
          for (let i = 0; i < 40; i++) { if (/끊긴-사이-에-생긴-할일/.test((await pg.textContent('body')) ?? '')) { seen = true; break } await wait(300) }
          writeFileSync(todoFile, before)                          // 원상복구
          if (!seen) fail('다시 붙어도 할 일이 안 온다 — 재접속 때 화면이 든 것을 다시 안 읽는다 ' + relBot)
          await wait(500)
        }

          const shape = await pg.evaluate(() => {
            const row = document.querySelector('.panel .ptodo'); const r = row.getBoundingClientRect()
            const ring = row.querySelector('.ring').getBoundingClientRect()
            const tt = row.querySelector('.tt').getBoundingClientRect()
            return { h: r.height, right: r.right - tt.right, ring: Math.round(ring.width), chev: !!row.querySelector('.mk'), chip: !!row.querySelector('.byb') }
          })
          if (shape.ring < 20 || shape.ring > 24) fail('폰 할 일: 동그란 체크 22px 아님 ' + JSON.stringify(shape))
          if (shape.h > 66) fail('폰 할 일: 줄이 너무 높다 ' + JSON.stringify(shape))
          if (shape.right > 20) fail('폰 할 일: 오른쪽 여백이 남는다(제목이 폭을 다 안 쓴다) ' + JSON.stringify(shape))
          if (shape.chev || shape.chip) fail('폰 할 일: 꺾쇠·칩이 남아 있다 ' + JSON.stringify(shape))
          const one = await pg.evaluate(() => { const d = document.querySelector('.panel .ptodo .dsub'); if (!d) return null; const a = d.querySelector('.ar').getBoundingClientRect(); const t = d.querySelector('.tx').getBoundingClientRect(); return { dy: Math.abs(a.top - t.top), h: d.getBoundingClientRect().height } })
          if (one && (one.dy > 4 || one.h > 26)) fail('폰 할 일: ↳ 와 설명이 두 줄로 갈렸다(클래스 이름 겹침?) ' + JSON.stringify(one))
          // 탭하면 펼쳐지고 할 일거리가 나온다
          const withDesc = await pg.evaluate(() => { const r = [...document.querySelectorAll('.panel .ptodo')].find((x) => x.querySelector('.dsub')); if (!r) return null; r.click(); return r.querySelector('.tt').textContent })
          await wait(400)
          if (withDesc && !(await pg.$('.panel .ptodo.on .acts button'))) fail('폰 할 일: 탭해도 안 펼쳐진다 · ' + withDesc)
          if (withDesc) { await pg.click('.panel .ptodo.on'); await wait(300) }
          // 길게 눌러 끌어 옮기기 — 순서가 실제로 바뀐다
          const before = await pg.$$eval('.panel .ptodo .tt', (e) => e.map((x) => x.textContent.trim()))
          if (before.length >= 2) {
            const bx = await pg.$eval('.panel .swwrap .swrow', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
            const sy = bx.y + bx.h / 2
            await pg.dispatchEvent('.panel .swwrap .swrow', 'pointerdown', { pointerId: 9, pointerType: 'touch', clientX: bx.x + 30, clientY: sy, buttons: 1 })
            await wait(480) // 0.35초 문턱을 넘긴다 → 집힌다
            if (!(await pg.$('.panel .swwrap.lift'))) fail('폰 할 일: 길게 눌러도 안 집힌다')
            for (const dy of [20, 50, 80, 110]) await pg.dispatchEvent('.panel .swwrap .swrow', 'pointermove', { pointerId: 9, pointerType: 'touch', clientX: bx.x + 30, clientY: sy + dy, buttons: 1 })
            await wait(120)
            await pg.dispatchEvent('.panel .swwrap .swrow', 'pointerup', { pointerId: 9, pointerType: 'touch', clientX: bx.x + 30, clientY: sy + 110 })
            await wait(1000)
            const after = await pg.$$eval('.panel .ptodo .tt', (e) => e.map((x) => x.textContent.trim()))
            if (JSON.stringify(before) === JSON.stringify(after)) fail('폰 할 일: 끌어 옮겼는데 순서가 그대로 ' + JSON.stringify({ before, after }))
            await pg.screenshot({ path: 'test/tmp/phone-todo-drag.png' })
          }
          // 편집 시트 — 제목·상세·절이 한 화면, 저장하면 반영된다
          await pg.click('.panel .sech:has-text("할 일") .tools .ib >> nth=0'); await wait(600)
          if (!(await pg.$('.tsheet.esheet .fld input'))) fail('폰 할 일: 편집 시트가 안 열린다')
          const secs = await pg.$$eval('.tsheet.esheet .fsec .seg button', (b) => b.map((x) => x.textContent.trim()))
          if (secs.length < 2) fail('폰 할 일: 시트에 절 고르기가 없다 ' + JSON.stringify(secs))
          await pg.fill('.tsheet.esheet .fld input', '시트로 만든 할 일')
          await pg.fill('.tsheet.esheet .fld textarea', '상세도 같이')
          await pg.screenshot({ path: 'test/tmp/phone-todo-sheet.png' })
          await pg.click('.tsheet.esheet .fbtn .ok'); await wait(1200)
          const made = await pg.$$eval('.panel .ptodo .tt', (e) => e.map((x) => x.textContent.trim()))
          if (!made.includes('시트로 만든 할 일')) fail('폰 할 일: 시트로 추가가 안 된다 ' + JSON.stringify(made))
          const md = readFileSync(join(root, '3. Area/제품_Rondo/todo.md'), 'utf8')
          if (!/시트로 만든 할 일: 상세도 같이/.test(md)) fail('폰 할 일: todo.md 에 «제목: 상세» 로 안 적혔다')
          // 🔴 편집 시트는 키보드 위에 앉는다 — 앞서 고친 --vvh 를 그대로 쓴다
          await pg.click('.panel .sech:has-text("할 일") .tools .ib >> nth=0'); await wait(600)
          await pg.focus('.tsheet.esheet .fld input'); await pg.evaluate(() => window.__kb(336)); await wait(600)
          const sk = await pg.evaluate(() => { const sh = document.querySelector('.tsheet.esheet').getBoundingClientRect(); const ok2 = document.querySelector('.tsheet.esheet .fbtn .ok').getBoundingClientRect(); const inp = document.querySelector('.tsheet.esheet .fld input').getBoundingClientRect(); return { sheetBottom: sh.bottom, okBottom: ok2.bottom, inpTop: inp.top, vh: visualViewport.height, top: visualViewport.offsetTop } })
          if (sk.okBottom > sk.top + sk.vh + 1) fail('폰 편집 시트: 저장 버튼이 키보드 밑에 묻힌다 ' + JSON.stringify(sk))
          if (sk.inpTop < sk.top - 1) fail('폰 편집 시트: 제목 칸이 화면 위로 잘린다 ' + JSON.stringify(sk))
          await pg.screenshot({ path: 'test/tmp/phone-todo-sheet-kb.png' })
          await pg.evaluate(() => window.__kb(0)); await pg.evaluate(() => document.activeElement.blur()); await wait(300)
          await pg.click('.tsheet.esheet .fbtn .cancel'); await wait(400)
          // 라이트 테마에서도 행·시트가 읽힌다
          await pg.evaluate(() => { localStorage.setItem('fb:theme', 'light'); document.documentElement.dataset.theme = 'light' }); await wait(400)
          const lt = await pg.evaluate(() => { const r = document.querySelector('.panel .ptodo'); const c = getComputedStyle(r.querySelector('.tt')).color; const b = getComputedStyle(r).backgroundColor; const ring = getComputedStyle(r.querySelector('.ring')).borderTopColor; return { c, b, ring } })
          const L = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b }
          if (Math.abs(L(lt.c) - L(lt.b)) < 60) fail('폰 할 일 라이트: 제목이 배경에 묻힌다 ' + JSON.stringify(lt))
          if (Math.abs(L(lt.ring) - L(lt.b)) < 25) fail('폰 할 일 라이트: 체크 테두리가 안 보인다 ' + JSON.stringify(lt))
          await pg.screenshot({ path: 'test/tmp/phone-todo-light.png' })
          await pg.evaluate(() => { localStorage.setItem('fb:theme', 'dark'); document.documentElement.dataset.theme = 'dark' }); await wait(300)

        }
        await pg.click('.panel .secb button.trow:not(.dir)'); await wait(600); if (!(await pg.$('.docwrap .dfoot'))) fail('phone: doc page'); await pg.screenshot({ path: 'test/tmp/phone-doc.png' })
        // ── 폰 폴더 고르기 (V17 B안) — 한 단계씩 들어가고, 푸터가 안 넘치고, 이름이 폭을 전부 쓴다 ──
        // 홈으로 — 화면 상태는 React 가 쥐고 있으니 해시를 지우고 **다시 연다**(부팅 시 목록 화면)
        await pg.goto(base + '/'); await pg.waitForSelector('.mhome .mtop', { timeout: 15000 }); await wait(800)
        // 폰 첫 화면은 **한 줄 띠** 다 — 카드는 누를 때만 (2026-09-13 Dave: «너무 커»)
        if (!(await pg.$('.mhome .ustrip'))) fail('사용량: 폰 홈에 한 줄 띠가 없다')
        if (await pg.$('.mhome .ucard')) fail('사용량: 폰 홈에 카드가 그대로 있다(띠여야 한다)')
        const pu = await pg.evaluate(() => { const st = document.querySelector('.mhome .ustrip'); const r = st.getBoundingClientRect(); return { right: r.right, iw: innerWidth, h: r.height, barW: st.querySelector('.bar').getBoundingClientRect().width } })
        if (pu.right > pu.iw + 1) fail('사용량: 폰 띠가 화면을 넘는다 ' + JSON.stringify(pu))
        if (pu.h > 44) fail('사용량: 폰 띠가 너무 높다 ' + JSON.stringify(pu))
        if (pu.barW < 30) fail('사용량: 폰 띠의 막대가 안 보인다 ' + JSON.stringify(pu))
        await pg.click('.mhome .ustrip'); await wait(500)
        if (!(await pg.$('.tsheet.usheet .ucard .ubar'))) fail('사용량: 띠를 눌러도 카드 시트가 안 뜬다')
        await pg.screenshot({ path: 'test/tmp/phone-usage-sheet.png' })
        await pg.evaluate(() => document.querySelector('.backdrop').click()); await wait(400)
        await pg.screenshot({ path: 'test/tmp/phone-usage.png' })
        // ── 빡센 폰 QA: 라이트 테마 · 좁은 폭 · 안전 영역 · 가로 넘침 ──
        const lum2 = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b }
        for (const th of ['light', 'dark']) {
          await pg.evaluate((t) => { localStorage.setItem('fb:theme', t); document.documentElement.dataset.theme = t }, th); await wait(400)
          const v = await pg.evaluate(() => {
            const bad = []
            for (const el of document.querySelectorAll('.mhome *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > innerWidth + 1 || r.left < -1)) bad.push((el.className || el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)) }
            const st = document.querySelector('.mhome .ustrip')
            return { bad: bad.slice(0, 4), scrollW: document.documentElement.scrollWidth, iw: innerWidth, cardBg: st ? getComputedStyle(st).backgroundColor : '', pc: st ? getComputedStyle(st.querySelector('b')).color : '', bodyBg: getComputedStyle(document.body).backgroundColor }
          })
          if (v.bad.length) fail(`폰 ${th}: 가로로 넘치는 것 ` + JSON.stringify(v.bad))
          if (v.scrollW > v.iw + 1) fail(`폰 ${th}: 가로 스크롤이 생긴다 ` + JSON.stringify(v))
          const dark = lum2(v.bodyBg) < 90
          if ((th === 'light') === dark) fail(`폰 ${th}: 배경이 테마와 반대 ` + v.bodyBg)
          // 카드 글자가 배경에 묻히지 않는가
          if (v.pc && Math.abs(lum2(v.pc) - lum2(v.cardBg)) < 40) fail(`폰 ${th}: 사용량 숫자가 배경에 묻힌다 ` + JSON.stringify(v))
          await pg.screenshot({ path: `test/tmp/phone-home-${th}.png` })
        }
        // 아주 좁은 폰(320px)에서도 안 깨진다
        await pg.setViewportSize({ width: 320, height: 640 }); await wait(600)
        const narrow = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, card: !!document.querySelector('.mhome .ucard') }))
        if (narrow.sw > narrow.iw + 1) fail('폰 320px: 가로 스크롤 ' + JSON.stringify(narrow))
        await pg.screenshot({ path: 'test/tmp/phone-320.png' })
        await pg.setViewportSize({ width: 390, height: 844 }); await wait(500)

        await pg.evaluate(() => { const b = [...document.querySelectorAll('.mhome .mtop .rb')].pop(); b.click() })
        await pg.waitForSelector('.pk.phone .ph-row', { timeout: 8000 }); await wait(400)
        const pf = await pg.evaluate(() => { const f = document.querySelector('.pk.phone .ph-f').getBoundingClientRect(); const g = document.querySelector('.pk.phone .ph-f .go').getBoundingClientRect(); const r = document.querySelector('.pk.phone .ph-row'); const rb = r.getBoundingClientRect(); const nm = r.querySelector('.n').getBoundingClientRect(); return { fw: f.width, iw: innerWidth, goH: g.height, goRight: g.right, rowH: rb.height, gapRight: rb.right - nm.right } })
        if (pf.goRight > pf.iw + 1) fail('폰 피커: 버튼이 화면을 넘는다 ' + JSON.stringify(pf))
        if (pf.goH < 44) fail('폰 피커: 시작 버튼이 너무 작다 ' + JSON.stringify(pf))
        if (pf.rowH < 54) fail('폰 피커: 줄이 손가락에 안 닿는다 ' + JSON.stringify(pf))
        if (pf.gapRight > 42) fail('폰 피커: 이름 오른쪽이 너무 빈다 ' + JSON.stringify(pf))
        await pg.screenshot({ path: 'test/tmp/phone-picker.png' })
        // 한 단계 들어가면 빵부스러기가 자란다
        const c0 = await pg.$$eval('.pk.phone .ph-c span', (e) => e.length)
        await pg.click('.pk.phone .ph-row >> nth=0'); await wait(700)
        const c1 = await pg.$$eval('.pk.phone .ph-c span', (e) => e.length)
        if (c1 <= c0) fail('폰 피커: 들어갔는데 빵부스러기가 그대로 ' + JSON.stringify({ c0, c1 }))
        if (!/여기서 시작|봇 열기/.test(await pg.textContent('.pk.phone .ph-f .go'))) fail('폰 피커: 시작 버튼 문구')
        // 돋보기로 어느 깊이든 한 번에 — 초성도
        await pg.click('.pk.phone .ph-h .rb >> nth=1'); await wait(300)
        await pg.fill('.pk.phone .ph-s input', 'ㅌㄹㅂㄹ'); await wait(800)
        const hits = await pg.$$eval('.pk.phone .ph-row[data-rel]', (e) => e.map((x) => x.getAttribute('data-rel').normalize('NFC')))
        if (!hits.includes('5. Archive/2025-04_트레바리-북클럽')) fail('폰 피커: 초성 검색 ' + JSON.stringify(hits))
        await pg.screenshot({ path: 'test/tmp/phone-picker-search.png' })
        await pg.click('.pk.phone .ph-h .rb >> nth=-1'); await wait(400)

        if (errs.length) fail('page errors: ' + errs.join(' | '))
      }
      await pg.close()
    }
    await br.close(); ok('ui renders (desktop · phone) → test/tmp/*.png')
  } catch (e) { try { await globalThis.__br?.close() } catch {} if (/executablePath|Executable doesn't exist|Cannot find (module|package) 'playwright/.test(String(e.message))) console.log('(화면 검사 건너뜀 — 브라우저 없음:', e.message.split('\n')[0], ')'); else fail('ui: ' + e.stack.split('\n').slice(0, 4).join(' | ')) }
  // ── 에이전트 제공자 — 깔린 것만 나온다 (Dave: Codex가 없으면 아예 안보여야 해) ──
  {
    const ps = await api('/agents')
    if (!Array.isArray(ps)) fail('제공자: 목록이 아니다')
    for (const x of ps) { if (!x.bin) fail('제공자: 실행 파일 없이 줄이 생겼다 ' + JSON.stringify(x)) }
    if (ps.some((x) => x.id === 'codex') && !existsSync(ps.find((x) => x.id === 'codex').bin)) fail('제공자: 없는 codex 가 나왔다')
    ok(`에이전트 제공자 ${ps.length}개 — 깔린 것만`)
  }

  // ── HTML 은 제 갈래로 · 외부 앱 열기는 루트 밖을 막는다 ──
  {
    await api(`/bots/${bot.id}/file`, { rel: 'report.html', text: '<!doctype html><h1>리포트</h1>' })
    const d = await api(`/bots/${bot.id}/file?rel=report.html`)
    if (d.kind !== 'html') fail('HTML: 원문 텍스트로 떨어졌다 — 브라우저처럼 못 본다 · kind=' + d.kind)
    let blocked = false
    try { await api(`/bots/${bot.id}/open`, { rel: '../../밖.md' }) } catch { blocked = true }
    if (!blocked) fail('외부 앱 열기: 루트 밖이 새어 나간다')
    ok('HTML 갈래 · 외부 앱 열기(루트 밖 차단)')
  }

  // ── 번들 계약 — 편집기는 **지연 로드**다 (문서를 한 번도 안 연 폰이 마크다운 파서를 받으면 안 된다) ──
  {
    const dir = join(process.cwd(), 'dist/client/assets')
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')) : []
    const ed = files.filter((f) => /MdEditor/.test(f))
    // ⚠ 화면이 둘이 되면서(본 앱 + 메뉴바 패널) 본체 청크 이름이 `index-` → `main-` 으로 바뀌었다
    const main = files.filter((f) => /^main-/.test(f))
    const tray = files.filter((f) => /^tray-/.test(f))
    if (!ed.length) fail('번들: 편집기가 별도 청크가 아니다 — 지연 로드가 깨졌다 ' + JSON.stringify(files))
    if (!main.length) fail('번들: 본체 청크를 못 찾겠다 ' + JSON.stringify(files))
    if (!tray.length) fail('번들: 메뉴바 패널 청크가 없다 — tray.html 이 빌드에서 빠졌다 ' + JSON.stringify(files))
    if (!existsSync(join(process.cwd(), 'dist/client/tray.html'))) fail('번들: tray.html 이 안 나왔다')
    const mainSrc = readFileSync(join(dir, main[0]), 'utf8')
    if (/@codemirror\/state|cm-content/.test(mainSrc)) fail('번들: CodeMirror 가 본체에 섞였다 — 문서를 안 열어도 받게 된다')
    ok(`번들 — 편집기 지연 로드 (본체 ${Math.round(readFileSync(join(dir, main[0])).length / 1024)}KB · 편집기 ${Math.round(readFileSync(join(dir, ed[0])).length / 1024)}KB)`)
  }

  // ── 하네스 — 폴더마다 쓸 수 있는 지침·스킬·커넥터 (V25). ⛔ 설정에서는 보기만 한다 ──
  {
    const rows = await api('/harness')
    if (!Array.isArray(rows) || !rows.length) fail('하네스: 표가 비었다')
    const r = rows.find((x) => x.rel === bot.rel) ?? rows[0]
    for (const k of ['rel', 'name', 'section', 'claudeMd', 'agentsMd', 'skills', 'mcp', 'by']) if (!(k in r)) fail('하네스: ' + k + ' 없음 ' + JSON.stringify(r))
    if (!r.claudeMd) fail('하네스: 시작하면서 깔아 준 CLAUDE.md 를 못 본다 ' + JSON.stringify(r))
    const d = await api(`/harness?rel=${encodeURIComponent(r.rel)}`)
    if (!Array.isArray(d.mcpList) || !d.mcpList.some((m) => m.scope === 'builtin')) fail('하네스: 내장 커넥터가 없다 ' + JSON.stringify(d.mcpList))
    if (d.mcp !== d.mcpList.length || d.skills !== d.skillList.length) fail('하네스: 세는 수와 목록 길이가 다르다 ' + JSON.stringify({ mcp: d.mcp, n: d.mcpList.length }))
    const g = await api('/harness/global')
    if (!g.mcp.some((m) => m.scope === 'builtin')) fail('하네스(전역): 내장 커넥터가 없다')
    ok(`하네스 — 폴더 ${rows.length}개 · 커넥터 ${d.mcp} · 스킬 ${d.skills}`)
  }

  // ── 시작할 때 에이전트 고르기 (V24) — 둘 이상일 때만 묻는다 ──
  {
    const sh = join(process.cwd(), 'test/fixtures/stub-codex.mjs'); chmodSync(sh, 0o755)
    const p2 = PORT + 3
    const argvLog = join(root, '.folderbot', 'codex-argv.log')
    mkdirSync(join(root, '.folderbot'), { recursive: true })
    await needPort(p2, '두 번째 호스트')
    const two = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(p2)], { env: { ...env, FOLDERBOT_CODEX_BIN: sh, FOLDERBOT_CODEX_ARGV: argvLog }, stdio: 'ignore' })
    try {
      for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${p2}/api/health`); break } catch { await wait(250) } }
      const ps2 = await (await fetch(`http://127.0.0.1:${p2}/api/agents`)).json()
      if (ps2.length !== 2 || !ps2.some((x) => x.id === 'codex')) fail('고르기: 둘이 깔렸는데 목록이 ' + JSON.stringify(ps2.map((x) => x.id)))
      if (!/9\.9\.9/.test(ps2.find((x) => x.id === 'codex').version ?? '')) fail('고르기: codex 버전을 못 읽었다 ' + JSON.stringify(ps2))
      // 🔴 **폴더 하나 = 줄 하나.** 벤더는 폴더가 아니라 **세션**의 성질이다 (2026-09-13 Dave 재정의) —
      //    같은 폴더를 다른 에이전트로 또 시작해도 봇은 하나고, 이름에 «· Codex» 를 박지 않는다.
      const api2 = async (path, body) => { const r = await fetch(`http://127.0.0.1:${p2}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${path}: ${j.error}`); return j }
      const b1 = await api2('/bots/start', { rel: '3. Area/재무_CFO', provider: 'claude' })
      const b2 = await api2('/bots/start', { rel: '3. Area/재무_CFO', provider: 'codex' })
      if (b1.id !== b2.id) fail('폴더 하나 = 줄 하나: 벤더가 다르다고 봇이 또 생겼다')
      const both = (await api2('/bots')).filter((b) => b.rel === '3. Area/재무_CFO')
      if (both.length !== 1) fail('폴더 하나 = 줄 하나: 줄이 ' + both.length + '개다 ' + JSON.stringify(both.map((b) => b.name)))
      if (both[0].name !== '재무_CFO') fail('폴더 이름에 회사를 박지 않는다 ' + both[0].name)
      // 🔴 **세션마다 에이전트를 고른다** — Claude 로 시작한 폴더 안에 Codex 세션을 만든다
      const cxs = await api2(`/bots/${b1.id}/sessions`, { name: '코덱스', vendor: 'codex' })
      if (cxs.vendor !== 'codex') fail('세션 벤더: 고른 값이 안 남았다 ' + JSON.stringify(cxs))
      // Codex 로 한 턴 — `codex exec --json` 을 우리 stream 모양으로 옮긴다 (host/codex.ts)
      await api2(`/sessions/${cxs.id}/send`, { text: '안녕' })
      const cs = { sessionId: cxs.id }
      let cchat = null
      for (let i = 0; i < 50; i++) { cchat = await api2(`/sessions/${cs.sessionId}/chat`); if ((cchat.items ?? []).some((x) => /확인했어요/.test(x.text ?? ''))) break; await wait(250) }
      const items = cchat?.items ?? []
      if (!items.some((x) => x.kind === 'tool')) fail('Codex: 도구 카드가 안 생겼다 ' + JSON.stringify(items.map((x) => x.kind)))
      if (!items.some((x) => /«안녕» 확인했어요/.test(x.text ?? ''))) fail('Codex: 답이 안 왔다 ' + JSON.stringify(items.slice(-3)))
      if (!/^cx-/.test(cchat.info?.cliSessionId ?? '')) fail('Codex: 세션 id 를 못 물고 왔다 ' + cchat.info?.cliSessionId)
      // 두 번째 턴은 같은 세션을 이어 간다 (codex exec resume <id>)
      await api2(`/sessions/${cs.sessionId}/send`, { text: '이어서' })
      let c2 = null
      for (let i = 0; i < 50; i++) { c2 = await api2(`/sessions/${cs.sessionId}/chat`); if ((c2.items ?? []).some((x) => /«이어서»/.test(x.text ?? ''))) break; await wait(250) }
      if (c2.info.cliSessionId !== cchat.info.cliSessionId) fail('Codex: 두 번째 턴이 새 세션으로 갔다')
      // 같은 폴더의 다른 세션은 Claude 다 — 한 폴더 안에 둘이 섞여 산다
      const mix = await api2(`/bots/${b1.id}/sessions`, { name: '클로드', vendor: 'claude' })
      if (mix.vendor !== 'claude') fail('세션 벤더: 같은 폴더의 다른 세션이 Claude 가 아니다 ' + JSON.stringify(mix))
      // 🔴 **Codex 도 Claude 와 동급이다** (2026-09-13 Dave) — 기본 모델 · 노력 · 권한(샌드박스) · 키.
      //    ⚠ 값이 **CLI 까지 실제로 가는지**는 가짜 CLI 가 남긴 argv 로만 잴 수 있다.
      await api2('/defaults', { model: 'gpt-5.1-codex-mini', effort: 'high', agent: 'codex' })
      await api2('/codex', { sandbox: 'workspace-write', apiKey: 'sk-test-key' })
      const st2 = await api2('/state')
      if (st2.defaults.model === 'gpt-5.1-codex-mini') fail('기본값: Codex 것이 Claude 칸을 덮었다 — 섞으면 Claude 세션이 죽는다')
      if (st2.defaults.codex?.model !== 'gpt-5.1-codex-mini' || st2.defaults.codex?.effort !== 'high') fail('기본값: Codex 칸이 안 남았다 ' + JSON.stringify(st2.defaults))
      if (st2.defaults.codex?.sandbox !== 'workspace-write') fail('Codex 권한: 샌드박스가 안 남았다 ' + JSON.stringify(st2.defaults.codex))
      if (!st2.defaults.codex?.auth?.ok || st2.defaults.codex.auth.how !== 'key') fail('Codex 인증: 키를 넣었는데 «안 됨» 이다 ' + JSON.stringify(st2.defaults.codex?.auth))
      const cx2 = await api2(`/bots/${b1.id}/sessions`, { name: '코덱스2', vendor: 'codex' })
      if (cx2.model !== 'gpt-5.1-codex-mini' || cx2.effort !== 'high') fail('새 Codex 세션이 Codex 기본값으로 안 떴다 ' + JSON.stringify(cx2))
      await api2(`/sessions/${cx2.id}/send`, { text: '노력 검사' })
      let lines = []
      for (let i = 0; i < 50; i++) { lines = existsSync(argvLog) ? readFileSync(argvLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; if (lines.some((l) => l.argv.includes('노력 검사'))) break; await wait(200) }
      const run = lines.find((l) => l.argv.includes('노력 검사'))
      if (!run) fail('Codex: CLI 를 안 불렀다')
      const a = run.argv.join(' ')
      if (!/--model gpt-5\.1-codex-mini/.test(a)) fail('Codex: 모델이 CLI 로 안 갔다 ' + a)
      if (!/-c model_reasoning_effort="high"/.test(a)) fail('Codex: 노력이 CLI 로 안 갔다(플래그가 아니라 -c 설정 키다) ' + a)
      if (!/--sandbox workspace-write/.test(a)) fail('Codex: 샌드박스가 CLI 로 안 갔다 ' + a)
      if (run.key !== 'sk-test-key') fail('Codex: API 키가 워커 환경에 안 들어갔다 ' + run.key)
      // ⛔ Claude 의 노력 단계(xhigh·max)는 Codex 에 넘기지 않는다 — 넘기면 그 자리에서 죽는다
      await api2(`/sessions/${cx2.id}/settings`, { effort: 'max' })
      await api2(`/sessions/${cx2.id}/send`, { text: '모르는 노력' })
      let l2 = []
      for (let i = 0; i < 50; i++) { l2 = readFileSync(argvLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); if (l2.some((l) => l.argv.includes('모르는 노력'))) break; await wait(200) }
      const run2 = l2.find((l) => l.argv.includes('모르는 노력'))
      if (run2 && /model_reasoning_effort/.test(run2.argv.join(' '))) fail('Codex: 모르는 노력 값을 그대로 넘겼다 ' + run2.argv.join(' '))
      ok('Codex 동급 — 기본 모델 · 노력 · 샌드박스 · API 키가 CLI 까지 간다')
      /**
       * 🔴 **새 판(item/turn) 모양도 읽는다** — codex-cli 0.4x+ 는 조각 없이 `item.completed` 한 줄로
       *    답을 주고, 글자는 `item.text` 에 있다. 종전에는 `msg.text` 만 봐서 **화면이 조용히 비었다**
       *    (2026-09-13 Dave: «codex 로 실행한 세션에서 답이 안와»).
       */
      const nx = await api2(`/bots/${b1.id}/sessions`, { name: '새판', vendor: 'codex' })
      await api2(`/sessions/${nx.id}/send`, { text: '새판 테스트' })
      let nxChat = null
      for (let i = 0; i < 60; i++) { nxChat = await api2(`/sessions/${nx.id}/chat`); if (nxChat.items.some((x) => x.kind === 'assistant' && /새 판으로 답했어요/.test(x.text ?? ''))) break; await wait(250) }
      if (!nxChat.items.some((x) => x.kind === 'assistant' && /새 판으로 답했어요/.test(x.text ?? ''))) fail('Codex 새 판: item.completed 의 답이 화면에 안 왔다 ' + JSON.stringify(nxChat.items.map((x) => [x.kind, (x.text ?? '').slice(0, 40)])))
      /**
       * 🔴 **답 없이 끝난 턴은 이유를 답 자리에 적는다** — 조용히 비는 것이 제일 나쁘다.
       *    사람은 «고장났나 · 기다려야 하나» 를 알 수 없고, 우리도 나중에 무엇이 왔는지 못 본다.
       */
      const ep = await api2(`/bots/${b1.id}/sessions`, { name: '빈턴', vendor: 'codex' })
      await api2(`/sessions/${ep.id}/send`, { text: '빈턴 테스트' })
      let epChat = null
      for (let i = 0; i < 60; i++) { epChat = await api2(`/sessions/${ep.id}/chat`); if (epChat.items.some((x) => x.kind === 'assistant' && /답 없이/.test(x.text ?? ''))) break; await wait(250) }
      const note = epChat.items.find((x) => x.kind === 'assistant' && /답 없이/.test(x.text ?? ''))
      if (!note) fail('빈 턴: 이유를 안 적었다 — 화면이 조용히 빈다 ' + JSON.stringify(epChat.items.map((x) => [x.kind, (x.text ?? '').slice(0, 40)])))
      if (!/something went wrong/.test(note.text)) fail('빈 턴: CLI 가 한 말이 안 들어갔다 ' + note.text)
      /**
       * 🔴 **Codex 의 `/clear` 는 우리가 처리한다** (2026-09-13 Dave: «codex 에서는 /clear 와 같은
       *    메시지도 동작을 안해»). `codex exec` 는 한 턴짜리라 «세션 명령» 이 없다 — 그 글자가
       *    **프롬프트로** 들어가 엉뚱한 답이 왔다.
       * ⚠ `/clear` 의 뜻은 «이어가기를 끊는다» 다. 대화 기록은 **안 지운다**(사람이 쓴 말은 사람 것).
       * ⛔ 목록에 Claude 의 명령이 섞이면 안 된다 — 고르는 순간 그 글자가 프롬프트로 들어간다.
       */
      {
        const cl = await api2(`/bots/${b1.id}/sessions`, { name: '클리어', vendor: 'codex' })
        await api2(`/sessions/${cl.id}/send`, { text: '첫 말' })
        for (let i = 0; i < 60; i++) { const c = await api2(`/sessions/${cl.id}/chat`); if (c.items.some((x) => x.kind === 'assistant')) break; await wait(250) }
        const before = await api2(`/sessions/${cl.id}/chat`)
        if (!before.info.cliSessionId) fail('/clear: 첫 턴 뒤에 이어갈 세션 id 가 없다')
        await api2(`/sessions/${cl.id}/send`, { text: '/clear' })
        await wait(700)
        const after = await api2(`/sessions/${cl.id}/chat`)
        if (after.info.cliSessionId) fail('🔴 /clear 가 이어가기를 안 끊었다 ' + after.info.cliSessionId)
        if (after.items.length < before.items.length) fail('🔴 /clear 가 대화 기록을 지웠다 — 사람이 쓴 말은 사람 것이다')
        if (!after.items.some((x) => x.kind === 'system' && /새 대화로/.test(x.text ?? ''))) fail('/clear: 무슨 일이 났는지 안 알려 준다 ' + JSON.stringify(after.items.slice(-2)))
        // 목록 — Codex 세션에는 Claude 의 명령이 안 보인다
        const menu = await api2(`/bots/${b1.id}/slash?sid=${cl.id}`)
        const names = menu.map((c) => c.name)
        if (!names.includes('clear')) fail('Codex 슬래시 목록에 clear 가 없다 ' + JSON.stringify(names))
        if (names.includes('compact') || names.includes('review')) fail('🔴 Codex 목록에 Claude 의 명령이 섞였다 ' + JSON.stringify(names))
        ok('Codex — /clear 가 이어가기를 끊고, 목록에 Claude 의 명령이 안 섞인다')
      }
      /**
       * 🔴 **두 번째 턴(resume)** — `codex exec resume` 는 깃발이 좁다(`--sandbox` 가 없다).
       *    한 벌로 묶어 넘겼더니 **첫 턴은 멀쩡하고 두 번째 턴부터** 전부 죽었다
       *    («tip: to pass '--sandbox' as a value…» · 2026-09-13 Dave 실측).
       * ⚠ 스텁이 진짜 codex 처럼 **모르는 깃발에 죽으므로**, 이 한 번이 그 자리를 지킨다.
       */
      const rs = await api2(`/bots/${b1.id}/sessions`, { name: '이어가기', vendor: 'codex' })
      await api2(`/sessions/${rs.id}/send`, { text: '첫 턴' })
      let rsChat = null
      for (let i = 0; i < 60; i++) { rsChat = await api2(`/sessions/${rs.id}/chat`); if (rsChat.items.some((x) => x.kind === 'assistant' && /첫 턴/.test(x.text ?? ''))) break; await wait(250) }
      if (!rsChat.items.some((x) => x.kind === 'assistant' && /첫 턴/.test(x.text ?? ''))) fail('이어가기: 첫 턴부터 답이 없다')
      await api2(`/sessions/${rs.id}/send`, { text: '둘째 턴' })
      for (let i = 0; i < 60; i++) { rsChat = await api2(`/sessions/${rs.id}/chat`); if (rsChat.items.some((x) => x.kind === 'assistant' && /둘째 턴/.test(x.text ?? ''))) break; await wait(250) }
      const second = rsChat.items.filter((x) => x.kind === 'assistant').map((x) => x.text ?? '')
      if (!second.some((t) => /둘째 턴/.test(t))) fail('🔴 이어가기(resume): 둘째 턴에 답이 없다 — 깃발을 그대로 넘겼나 ' + JSON.stringify(second.slice(-2)))
      /**
       * 🔴 **계정이 모델을 거절하면 모델 없이 한 번 더 보낸다** (2026-09-13 Dave 신고).
       *    ChatGPT 계정은 쓸 수 있는 모델이 구독마다 다른데 우리가 이름을 박아 넘겨 **모든 턴이
       *    400 으로 죽었다**. CLI 는 제 계정에 맞는 것을 안다 — 맡긴다.
       */
      const mj = await api2(`/bots/${b1.id}/sessions`, { name: '모델거절', vendor: 'codex', model: 'gpt-5.1-codex' })
      await api2(`/sessions/${mj.id}/send`, { text: '모델거절 테스트' })
      let mjChat = null
      for (let i = 0; i < 80; i++) { mjChat = await api2(`/sessions/${mj.id}/chat`); if (mjChat.items.some((x) => x.kind === 'assistant' && /기본 모델로 답했어요/.test(x.text ?? ''))) break; await wait(250) }
      if (!mjChat.items.some((x) => x.kind === 'assistant' && /기본 모델로 답했어요/.test(x.text ?? ''))) fail('모델 거절: 모델 없이 다시 보내지 않았다 ' + JSON.stringify(mjChat.items.map((x) => [x.kind, (x.text ?? '').slice(0, 60)])))
      ok('Codex — 옛 판 · 새 판(item/turn) 둘 다 읽고, 답 없는 턴은 이유를 적고, 거절당한 모델은 빼고 다시 보낸다')
      ok('에이전트 고르기 — 폴더 하나 = 줄 하나 · 벤더는 세션마다 · Codex 로 한 턴')
    } finally { two.kill() }
  }

  // ── 사용량 — 남은 양 · 훅 설치 · 예산 (V23) ──
  {
    const u = await api('/usage')
    if (!u.tools.length) fail('사용량: 픽스처를 못 읽었다')
    if (u.tools.some((t) => t.tool === 'codex')) fail('사용량: 안 쓴 Codex 가 줄로 나왔다')   // Dave: 없으면 아예 안 보여야 해
    const c = u.tools[0]
    if (c.left !== Math.max(0, Math.min(100, Math.round((c.leftCost / c.budget) * 100)))) fail('사용량: 남은 %가 남은 금액과 안 맞는다 ' + JSON.stringify(c))
    if (!(c.leftCost <= c.budget)) fail('사용량: 남은 금액이 예산을 넘는다 ' + JSON.stringify(c))
    if (!u.resetAt || u.resetAt <= u.now) fail('사용량: 다시 채워지는 시각이 과거다 ' + JSON.stringify({ resetAt: u.resetAt, now: u.now }))
    if (u.left !== Math.min(...u.tools.map((t) => t.left))) fail('사용량: 대표 숫자가 가장 빠듯한 도구가 아니다')
    // 예산을 바꾸면 남은 %도 함께 바뀐다 (뺄셈은 호스트 한 곳에서만)
    await api('/usage/budget', { window: 1000 })
    const u2 = await api('/usage')
    if (u2.tools[0].left <= c.left) fail('사용량: 예산을 키웠는데 남은 %가 안 늘었다 ' + JSON.stringify({ a: c.left, b: u2.tools[0].left }))
    await api('/usage/budget', { window: 6.4 })
    // 훅 설치·제거 — settings.json 을 합쳐 쓰고 백업을 남긴다
    const before = existsSync(join(fbHome, '.claude/settings.json')) ? readFileSync(join(fbHome, '.claude/settings.json'), 'utf8') : ''
    await api('/usage/hook', { on: true })
    const st1 = await api('/usage'); if (!st1.hook) fail('사용량: 훅 설치가 안 잡힌다')
    const j = JSON.parse(readFileSync(join(fbHome, '.claude/settings.json'), 'utf8'))
    if (!JSON.stringify(j.hooks.Stop).includes('usage-hook')) fail('사용량: settings.json 에 Stop 훅이 없다')
    if (!existsSync(join(fbHome, '.folderbot/usage-hook.mjs'))) fail('사용량: 훅 스크립트가 없다')
    await api('/usage/hook', { on: false })
    const st2 = await api('/usage'); if (st2.hook) fail('사용량: 훅 제거가 안 된다')
    const j2 = JSON.parse(readFileSync(join(fbHome, '.claude/settings.json'), 'utf8'))
    if (JSON.stringify(j2.hooks.Stop).includes('usage-hook')) fail('사용량: 제거했는데 훅이 남았다')
    void before
    ok('사용량 — 남은 양 · 예산 반영 · 훅 설치/제거')
  }

  // ── 세션 삭제 — 워커가 내려가고, 목록에서 사라지고, **호스트를 다시 띄워도 안 돌아온다** (2026-09-13 Dave 요청)
  {
    const b = await api('/bots')
    const target = b.find((x) => x.rel === '3. Area/제품_Rondo') ?? b[0]
    const made = await api(`/bots/${target.id}/sessions`, { name: '지울 세션' })
    let list = await api(`/bots/${target.id}/sessions`)
    if (!list.find((x) => x.id === made.id)) fail('세션 삭제: 만든 세션이 목록에 없다')
    await api(`/sessions/${made.id}`, undefined, 'DELETE')
    list = await api(`/bots/${target.id}/sessions`)
    if (list.find((x) => x.id === made.id)) fail('세션 삭제: 지웠는데 목록에 남았다')
    const gone = await fetch(base + `/api/sessions/${made.id}/chat`); if (gone.status !== 404) fail('세션 삭제: 지운 세션이 아직 읽힌다 ' + gone.status)
    // 호스트 재시작 — «지웠다» 표식을 안 읽으면 여기서 되살아난다
    host.kill(); await wait(900)
    const host2 = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
    host2.stdout.on('data', (d) => (hostLog += d)); host2.stderr.on('data', (d) => (hostLog += d))
    for (let i = 0; i < 60; i++) { try { await api('/state'); break } catch { await wait(250) } }
    const after = await api(`/bots/${target.id}/sessions`)
    host2.kill()
    if (after.find((x) => x.id === made.id)) fail('세션 삭제: 호스트를 다시 띄우니 되살아났다')
    ok('세션 삭제 → 목록·기록에서 사라지고 재시작에도 안 돌아온다')
  }

  console.log('\nSMOKE OK')
} catch (e) { fail(e.stack) } finally { host.kill(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); rmSync(claudeCfg, { recursive: true, force: true }); rmSync(fbHome, { recursive: true, force: true }) }
