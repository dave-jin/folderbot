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
writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n- [ ] PRD v1.0 확정: Q2·Q5\n- [ ] Tailscale 폰 설치\n- [ ] 무응답 3건 후속 연락: 9/1 발송분이 엿새째 무응답. ① 가상 대표에게 문자 ② 예시 기관에 「총 1회」 적용 범위 문의(담당자 두 명 공동 수신) ③ 답을 보고 다음 회차를 정한다. 9/7(월) 오전에 배치\n\n## 완료\n')
writeFileSync(join(root, '3. Area/재무_CFO/CLAUDE.md'), '# CFO\n')
writeFileSync(join(root, '2. Projects/2026-09_강의-창업스쿨-2기/CLAUDE.md'), '# 강의\n')
writeFileSync(join(root, '1. Inbox/예시랩_자문자료.txt'), 'x')
writeFileSync(join(root, '3. Area/제품_Rondo', '_MAP_전체구조.md'.normalize('NFD')), '# map\n') // 맥 파일명처럼 NFD
mkdirSync(join(root, '.projectbot'), { recursive: true }); writeFileSync(join(root, '.projectbot/marker.txt'), 'legacy')
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
  let todo = await api(`/bots/${bot.id}/todo`); if (todo.length !== 3) fail('todo parse')
  todo = await api(`/bots/${bot.id}/todo`, { title: '알파 동결 문서', desc: 'PRD v1.0 뒤에' }); if (todo.length !== 4) fail('todo add')
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
  const dls = await api(`/bots/orch/ls?dir=${encodeURIComponent('4. Resources/2026_브랜딩-DAVE')}`); if (!dls.find((n) => n.name === '02_링크드인' && n.botId === deep.id && n.harness === true)) fail('ls botId/harness ' + JSON.stringify(dls)); ok('start anywhere · folder anywhere · ls annotations')
  // 이름 — 메인/원격 · 호스트 이름 설정
  let st2 = await api('/state'); if (!st2.hostName || !st2.device?.main) fail('names default ' + JSON.stringify({ h: st2.hostName, d: st2.device }))
  await api('/names', { hostName: '서재 미니' }); st2 = await api('/state'); if (st2.hostName !== '서재 미니' || st2.device.name !== '서재 미니') fail('names set'); await api('/names', { hostName: '' }); ok('host name default → set → reset')
  // 할 일 편집 · 삭제
  let td2 = await api(`/bots/${bot.id}/todo/edit`, { line: todo[1].line, title: '알파 동결 문서 v2', desc: '내일' }); const ed = td2.find((t) => t.line === todo[1].line); if (!ed || ed.title !== '알파 동결 문서 v2' || ed.desc !== '내일') fail('todo edit ' + JSON.stringify(td2))
  td2 = await api(`/bots/${bot.id}/todo/delete`, { line: todo[1].line }); if (td2.some((t) => t.title === '알파 동결 문서 v2')) fail('todo delete'); ok('todo edit · delete')
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
      await pg.addInitScript(() => localStorage.setItem('folderbot:token', 'x'))
      if (name === 'phone') await pg.addInitScript(() => {
        // iOS 키보드 흉내 — 시각 뷰포트 높이만 줄어든다(레이아웃 뷰포트는 그대로: 홈화면 앱·iOS 26 의 동작)
        const H = window.innerHeight, W = window.innerWidth, t = new EventTarget()
        const vv = { width: W, height: H, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1, addEventListener: t.addEventListener.bind(t), removeEventListener: t.removeEventListener.bind(t), dispatchEvent: t.dispatchEvent.bind(t) }
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
        window.__kb = (h) => { vv.height = H - h; vv.dispatchEvent(new Event('resize')) }
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
        // 열 최소 폭 — 저장된 레이아웃이 과해도(목록 480 · 문서 1100) 대화 열은 360 이상, 문서 열은 380 이상
        {
          const pg3 = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
          await pg3.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:layout', JSON.stringify({ sb: 480, rp: 290, doc: 1100, sbOpen: true, rpOpen: true, sbPin: true, rpPin: true, secH: { sessions: 120, todo: 128 } })) })
          await pg3.goto(base + `/#bot=${bot.id}`); await pg3.waitForSelector('.col.chat .hdr', { timeout: 15000 }); await wait(500)
          await pg3.click('.panel .secb button.trow:not(.dir)'); await wait(700)
          const lw = await pg3.evaluate(() => { const q = (s) => document.querySelector(s)?.getBoundingClientRect().width ?? 0; return { chat: q('.cols > .col.chat'), doc: q('.docwrap'), sb: q('.col.side.left'), rp: q('.rpwrap'), win: innerWidth } })
          if (!(lw.chat >= 360 && lw.doc >= 380 && lw.doc > 0)) fail('ui column min widths ' + JSON.stringify(lw))
          await pg3.screenshot({ path: 'test/tmp/desktop-minwidth.png' }); await pg3.close()
        }
        // 권한 관문 — 데스크톱 브리지를 흉내 내 띄운다: 필수가 빠지면 화면 전체, 켜지면 [계속]
        {
          const pg2 = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
          await pg2.addInitScript(() => { localStorage.setItem('folderbot:token', 'x') })
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
        // 할 일 행 — 글이 오른쪽 끝까지(도구 자리를 미리 비우지 않음) · 긴 행은 2줄에서 잘리고 «…더» 로 펼친다
        const tg = await pg.evaluate(() => { const r = document.querySelector('.todo'); const t = r.querySelector('.tt'); return r.getBoundingClientRect().right - t.getBoundingClientRect().right }); if (tg > 16) fail('ui todo right gap ' + tg)
        if (!(await pg.$('.todo.clamp.over .more'))) fail('ui todo clamp/more missing'); const hBefore = await pg.$eval('.todo.clamp.over', (e) => e.getBoundingClientRect().height)
        await pg.click('.todo.clamp.over .more'); await wait(150); const hAfter = await pg.$eval('.todo .fold', (e) => e.closest('.todo').getBoundingClientRect().height); if (!(hAfter > hBefore + 10)) fail(`ui todo expand ${hBefore} → ${hAfter}`)
        await pg.click('.todo .fold'); await wait(150); if (await pg.$('.todo .fold')) fail('ui todo fold')
        // 폴더 선택 = 트리: 1단계 폴더가 뜨고 활성 폴더는 펼쳐져 있다 · Resources 를 펼치면 하위가 보인다
        await pg.click('.nav'); await pg.waitForSelector('.pk [data-rel]', { timeout: 5000 }); await wait(500)
        const top = await pg.$$eval('.pk [data-rel]', (r) => r.map((x) => x.getAttribute('data-rel'))); if (!top.includes('4. Resources') || !top.includes('3. Area/제품_Rondo')) fail('ui picker tree: ' + top.join(','))
        await pg.click('.pk [data-rel="4. Resources"] .cv'); await wait(500); const top2 = await pg.$$eval('.pk [data-rel]', (r) => r.map((x) => x.getAttribute('data-rel'))); if (!top2.includes('4. Resources/2026_브랜딩-DAVE')) fail('ui picker expand: ' + top2.join(','))
        const ft = await pg.evaluate(() => { const f = document.querySelector('.pk .modal-f'); return f.getBoundingClientRect().height }); if (ft > 70) fail('ui picker footer wraps ' + ft)
        await pg.screenshot({ path: 'test/tmp/desktop-picker.png' }); await pg.keyboard.press('Escape'); await wait(200); if (await pg.$('.pk')) await pg.click('.pk .modal-h .ib'); await wait(200)
        // 트리 우클릭 — 폴더면 «새 봇 시작» 항목이 있다
        await pg.click('.panel .secb button.trow.dir', { button: 'right' }); await wait(200); const cm = await pg.textContent('.menu.ctx'); if (!/새 봇 시작|에이전트 시작|봇 열기/.test(cm ?? '')) fail('ui tree ctx: ' + cm); await pg.keyboard.press('Escape'); await wait(150)
        // 이름 바꾸기 — prompt() 가 아니라 앱 안 모달 (Electron 은 prompt 를 지원하지 않는다)
        await pg.click('.panel .secb button.trow:not(.dir)', { button: 'right' }); await wait(200); await pg.click('.menu.ctx button:has-text("이름 바꾸기")'); await wait(200)
        if (!(await pg.$('.modal.ask input.askin'))) fail('ui rename modal missing'); await pg.fill('.modal.ask input.askin', 'renamed-by-smoke.md'); await pg.keyboard.press('Enter'); await wait(700)
        if (!/renamed-by-smoke\.md/.test((await pg.textContent('.panel')) ?? '')) fail('ui rename did not apply'); if (await pg.$('.modal.ask')) fail('ui rename modal stuck')
        // 할 일 — 제목을 누르면 편집, ⏎ 저장
        await pg.click('.todo .tt.link'); await wait(150); if (!(await pg.$('.todo.edit input'))) fail('ui todo edit'); await pg.fill('.todo.edit input', 'Tailscale 폰 설치 (편집됨)'); await pg.keyboard.press('Enter'); await wait(500); if (!/편집됨/.test((await pg.textContent('.panel')) ?? '')) fail('ui todo edit save')
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
        await pg.keyboard.press('Meta+Shift+D'); await wait(200); if (await pg.$('.doc')) fail('doc column should hide on ⌘⇧D')
        if (errs.length) fail('page errors: ' + errs.join(' | '))
      }
      if (name === 'phone') {
        if (await pg.$('.mtabs')) fail('phone: tab bar should be gone')
        if (!(await pg.$('.chat-hdr .rb')) || !(await pg.$('.cchips')) || !(await pg.$('.composer .plusb'))) fail('phone: round buttons / chips / pill composer')
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
        // iOS 26 이 키보드를 내린 뒤 시각 뷰포트를 60px 덜 돌려줘도(입력 중 아님) 루트는 전체 높이를 유지한다 — 아래 빈 띠 없음
        await pg.evaluate(() => window.__kb(60)); await wait(300)
        const stuck = await pg.evaluate(() => ({ rootH: document.querySelector('#root').getBoundingClientRect().height, ih: innerHeight, compBottom: document.querySelector('.composer').getBoundingClientRect().bottom }))
        if (Math.abs(stuck.rootH - stuck.ih) > 2 || stuck.ih - stuck.compBottom > 24) fail('phone: stale visual viewport left a bottom gap ' + JSON.stringify(stuck))
        await pg.evaluate(() => window.__kb(0)); await wait(200)
        await pg.click('.chat-hdr .rb'); await wait(300); if (!(await pg.$('.mhome .mcards')) || (await pg.$$eval('.mrow', (r) => r.length)) < 3) fail('phone: home cards/rows'); await pg.screenshot({ path: 'test/tmp/phone-home.png' })
        const ov = await pg.evaluate(() => { const m = document.querySelector('.mscroll'); return { sw: m.scrollWidth, cw: m.clientWidth, dw: document.documentElement.scrollWidth, iw: innerWidth } }); if (ov.sw > ov.cw || ov.dw > ov.iw) fail('phone: horizontal overflow ' + JSON.stringify(ov))
        await pg.click('.mtop .rb'); await wait(300); const mr = await pg.evaluate(() => { const r = document.querySelector('.modal').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight } }); if (!(mr.top >= 0 && mr.bottom <= mr.h)) fail('phone: settings modal out of viewport ' + JSON.stringify(mr)); await pg.screenshot({ path: 'test/tmp/phone-settings.png' }); await pg.click('.modal .modal-h .ib'); await wait(200)
        await pg.click('.mrow'); await wait(300); await pg.click('.chat-hdr .rb:last-child'); await wait(300); if (!(await pg.$('.rpwrap .rb'))) fail('phone: panel page'); await pg.screenshot({ path: 'test/tmp/phone-panel.png' })
        await pg.click('.panel .secb button.trow:not(.dir)'); await wait(600); if (!(await pg.$('.docwrap .dfoot'))) fail('phone: doc page'); await pg.screenshot({ path: 'test/tmp/phone-doc.png' })
        if (errs.length) fail('page errors: ' + errs.join(' | '))
      }
      await pg.close()
    }
    await br.close(); ok('ui renders (desktop · phone) → test/tmp/*.png')
  } catch (e) { try { await globalThis.__br?.close() } catch {} if (/executablePath|Executable doesn't exist|Cannot find (module|package) 'playwright/.test(String(e.message))) console.log('(화면 검사 건너뜀 — 브라우저 없음:', e.message.split('\n')[0], ')'); else fail('ui: ' + e.stack.split('\n').slice(0, 4).join(' | ')) }
  console.log('\nSMOKE OK')
} catch (e) { fail(e.stack) } finally { host.kill(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); rmSync(claudeCfg, { recursive: true, force: true }) }
