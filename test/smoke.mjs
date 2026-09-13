// 원격 왕복 스모크 — 픽스처 볼트 + 스텁 CLI 로 호스트를 띄우고 API·SSE·MCP·화면을 검사한다
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
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
        // 사용량 칩 — 상태바에 «남은 %», 누르면 카드
        if (!(await pg.$('.sb-foot .uchip'))) fail('사용량: 상태바 칩이 없다')
        const chip = await pg.textContent('.sb-foot .uchip'); if (!/남음/.test(chip ?? '')) fail('사용량: 칩이 «남음» 이 아니다 · ' + chip)
        await pg.click('.sb-foot .uchip'); await wait(400)
        if (!(await pg.$('.upop .ucard .ubar .fill'))) fail('사용량: 칩을 눌러도 카드가 없다')
        const uc = await pg.evaluate(() => { const b = document.querySelector('.upop .ucard .ubar'); const f = b.querySelector('.fill'); const pc = document.querySelector('.upop .ucard .urow .pc').textContent; return { w: b.getBoundingClientRect().width, fw: f.getBoundingClientRect().width, pc: parseInt(pc), h: b.getBoundingClientRect().height, codex: document.querySelector('.upop .ucard').textContent.includes('Codex') } })
        if (Math.abs((uc.fw / uc.w) * 100 - uc.pc) > 2) fail('사용량: 막대가 남은 %와 안 맞는다 ' + JSON.stringify(uc))
        if (uc.h < 12) fail('사용량: 막대가 얇다 ' + JSON.stringify(uc))
        if (uc.codex) fail('사용량: 안 쓴 Codex 가 카드에 나온다')
        await pg.screenshot({ path: 'test/tmp/desktop-usage.png' })
        await pg.keyboard.press('Escape'); await pg.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.click())); await wait(300)
        const iconOf = () => pg.evaluate(() => { const el = document.querySelector('.brow .fb'); return { w: el.getBoundingClientRect().width, attr: Number(el.getAttribute('width')) } })
        const before = await iconOf()
        await pg.click('.col.side.left .nav:has-text("설정")'); await pg.waitForSelector('.modal', { timeout: 4000 }); await wait(300)
        const segs = await pg.$$eval('.modal .seg', (ss) => ss.map((x) => x.textContent))
        if (!segs.some((t) => /작게.*보통.*크게/.test(t))) fail('설정에 폴더봇 크기 없음: ' + JSON.stringify(segs))
        await pg.click('.modal .kv:has-text("폴더봇 크기") .seg button:has-text("크게")'); await wait(400)
        await pg.click('.modal .modal-h .ib'); await wait(300)
        const big = await iconOf()
        if (big.attr <= before.attr) fail('폴더봇 «크게» 가 안 커짐 ' + JSON.stringify({ before, big }))
        const rowH = await pg.evaluate(() => document.querySelector('.brow').getBoundingClientRect().height)
        if (rowH < big.attr) fail('줄 높이가 아이콘을 못 담음 ' + JSON.stringify({ rowH, big }))
        await pg.hover('.brow'); await wait(350)
        const hovW = await pg.evaluate(() => document.querySelector('.brow .fb').getBoundingClientRect().width)
        if (hovW < big.w * 1.2) fail('마우스 오버에 안 커짐 ' + JSON.stringify({ big, hovW }))
        await pg.screenshot({ path: 'test/tmp/desktop-rail-big.png' })
        await pg.mouse.move(900, 700); await wait(300)
        await pg.evaluate(() => { localStorage.setItem('fb:icon', 'm'); window.dispatchEvent(new Event('fb:iconsize')) }); await wait(200)

        await pg.keyboard.press('Escape'); await wait(200); if (await pg.$('.pk')) { await pg.click('.pk .modal-h .ib'); await wait(300) }
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

        await pg.screenshot({ path: 'test/tmp/desktop-picker.png' }); await pg.keyboard.press('Escape'); await wait(200); if (await pg.$('.pk')) await pg.click('.pk .modal-h .ib'); await wait(200)
        // 트리 우클릭 — 폴더면 «새 봇 시작» 항목이 있다
        await pg.click('.panel .secb button.trow.dir', { button: 'right' }); await wait(200); const cm = await pg.textContent('.menu.ctx'); if (!/새 봇 시작|에이전트 시작|봇 열기/.test(cm ?? '')) fail('ui tree ctx: ' + cm); await pg.keyboard.press('Escape'); await wait(150)
        // 이름 바꾸기 — prompt() 가 아니라 앱 안 모달 (Electron 은 prompt 를 지원하지 않는다)
        await pg.click('.panel .secb button.trow:not(.dir)', { button: 'right' }); await wait(200); await pg.click('.menu.ctx button:has-text("이름 바꾸기")'); await wait(200)
        if (!(await pg.$('.modal.ask input.askin'))) fail('ui rename modal missing'); await pg.fill('.modal.ask input.askin', 'renamed-by-smoke.md'); await pg.keyboard.press('Enter'); await wait(700)
        if (!/renamed-by-smoke\.md/.test((await pg.textContent('.panel')) ?? '')) fail('ui rename did not apply'); if (await pg.$('.modal.ask')) fail('ui rename modal stuck')
        // 할 일 2.0 — 절 제목이 보이고, 목록은 제목만. 더블클릭하면 그 행에 설명이 펼쳐진다
        if (!/요청 · 할 일/.test((await pg.textContent('.panel')) ?? '')) fail('ui todo sections missing')
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
        await pg.click('.tobot'); await wait(800); if (await pg.$('.tobot')) fail('ui ↓ should hide at bottom')
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
        await pg.click('.mtop .rb'); await wait(300); const mr = await pg.evaluate(() => { const r = document.querySelector('.modal').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight } }); if (!(mr.top >= 0 && mr.bottom <= mr.h)) fail('phone: settings modal out of viewport ' + JSON.stringify(mr)); await pg.screenshot({ path: 'test/tmp/phone-settings.png' }); await pg.click('.modal .modal-h .ib'); await wait(200)
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
          // 탭하면 펼쳐지고 할 일거리가 나온다
          const withDesc = await pg.evaluate(() => { const r = [...document.querySelectorAll('.panel .ptodo')].find((x) => x.querySelector('.sub')); if (!r) return null; r.click(); return r.querySelector('.tt').textContent })
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

        }
        await pg.click('.panel .secb button.trow:not(.dir)'); await wait(600); if (!(await pg.$('.docwrap .dfoot'))) fail('phone: doc page'); await pg.screenshot({ path: 'test/tmp/phone-doc.png' })
        // ── 폰 폴더 고르기 (V17 B안) — 한 단계씩 들어가고, 푸터가 안 넘치고, 이름이 폭을 전부 쓴다 ──
        // 홈으로 — 화면 상태는 React 가 쥐고 있으니 해시를 지우고 **다시 연다**(부팅 시 목록 화면)
        await pg.goto(base + '/'); await pg.waitForSelector('.mhome .mtop', { timeout: 15000 }); await wait(800)
        if (!(await pg.$('.mhome .ucard'))) fail('사용량: 폰 홈에 카드가 없다')
        const pu = await pg.evaluate(() => { const c = document.querySelector('.mhome .ucard'); const r = c.getBoundingClientRect(); const b = c.querySelector('.ubar').getBoundingClientRect(); return { right: r.right, iw: innerWidth, barW: b.width, cardW: r.width } })
        if (pu.right > pu.iw + 1) fail('사용량: 폰 카드가 화면을 넘는다 ' + JSON.stringify(pu))
        if (pu.barW < pu.cardW - 40) fail('사용량: 폰에서 막대가 가로를 안 쓴다 ' + JSON.stringify(pu))
        await pg.screenshot({ path: 'test/tmp/phone-usage.png' })
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
