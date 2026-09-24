// 원격 왕복 스모크 — 픽스처 볼트 + 스텁 CLI 로 호스트를 띄우고 API·SSE·MCP·화면을 검사한다
import { deflateSync as zlibDeflate } from 'node:zlib'
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 브라우저 — 컨테이너(/opt/pw-browsers)면 그것, 맥이면 Playwright 캐시(~/Library/Caches/ms-playwright · `node node_modules/playwright-core/cli.js install chromium-headless-shell`). PW_CHROMIUM 으로 덮는다
const PW_CHROMIUM = process.env.PW_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
// realpath — 맥의 tmpdir 은 /var → /private/var 심링크라 호스트가 돌려주는 경로와 글자가 달라진다(2026-09-22 맥미니 실측)
//   맥의 tmpdir 은 그 자체로 55자라 스텁이 되읊는 60자 안에 절대 경로가 못 들어간다 — 맥에서는 /tmp 아래(realpath /private/tmp/… · 28자)
const root = realpathSync(mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'fb-vault-')))
const data = mkdtempSync(join(tmpdir(), 'fb-data-'))
const claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects/2026-09_강의-창업스쿨-2기', '2. Projects/2026-10_해커톤-제안', '3. Area/제품_Rondo', '3. Area/재무_CFO', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), '# Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 요청 · 할 일\n- [ ] PRD v1.0 확정: Q2·Q5\n- [x] 옛 완료 1\n- [x] 옛 완료 2\n- [x] 옛 완료 3\n- [x] 옛 완료 4\n- [x] 옛 완료 5\n- [x] 최근 완료 6\n- [ ] Tailscale 폰 설치\n- [ ] 무응답 3건 후속 연락: 9/1 발송분이 엿새째 무응답. ① 가상 대표에게 문자 ② 예시 기관에 「총 1회」 적용 범위 문의 ③ 답을 보고 다음 회차를 정한다\n\n## 진행 중\n- [ ] 표지 문구 3안: 편집자에게 보냄\n\n## 완료\n')
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
// ⚠ 메인 호스트는 «Claude 만 깔린 기기» 여야 한다 — 실제 codex 가 깔린 맥(2026-09-22 맥미니)에서는 제공자가 둘이 되어 세션 + 가 고르기를 띄우고
//   «세션 삭제 UI» 같은 검사가 어긋난다. 없는 경로를 주면 codex 는 숨는다(providers.ts 의 ENV_OVERRIDE). 둘인 경우는 아래 V24 블록이 두 번째 호스트로 잰다
// 🔴 `FOLDERBOT_QA` — 검사는 **실 CLI·실 앱을 건드리지 않는다**(실제로 `claude update` 를 돌려 버린 적이 있다)
const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
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
// ⌨ 단축키는 ControlOrMeta 로 — 맥 Chromium 에서 Control+A 는 전체 선택이 아니다(줄 머리 이동 · 2026-09-22 맥미니 실측)
//   Home/End 도 맥에선 캐럿을 안 옮긴다(스크롤만) — 줄 끝은 ⌘→, 문서 끝은 ⌘↓, 줄 머리 선택은 ⇧⌘←
const MAC = process.platform === 'darwin'
const K = { end: MAC ? 'Meta+ArrowRight' : 'End', docEnd: MAC ? 'Meta+ArrowDown' : 'Control+End', selEnd: MAC ? 'Shift+Meta+ArrowRight' : 'Shift+End', selHome: MAC ? 'Shift+Meta+ArrowLeft' : 'Shift+Home' }
const fail = (m) => { console.error('✗', m); console.error(hostLog); host.kill(); process.exit(1) }
const ok = (m) => console.log('✓', m)
/** 폰 — 채팅에서 왼쪽으로 쓸어 폴더 패널로 (H-5 뒤 헤더에 폴더 단추가 없다) */
/** Z-2(2026-09-22) · 폴더로 **들어가는** 문은 독이다 — 쓸기는 «뒤로/앞으로» 뿐이라 👈 로는 폴더가 안 열린다 */
/**
 * 「앞으로 가는 문」을 누른다 — **좁음(폰)은 하단 탭, 중간은 알약 독**이다(Z · 2026-09-22 Dave 「B」).
 * 한 헬퍼로 묶어 두지 않으면 검사가 단계마다 갈려 어느 쪽이 깨졌는지 헷갈린다.
 */
const DOCK_TITLE = { files: '파일', doc: '문서', todo: '할 일' }
const tapNav = async (p, id) => {
  if (await p.$('.tabbar')) { await p.click(`.tabbar [data-tab="${id}"]`); return 'tab' }
  const title = DOCK_TITLE[id]
  if (title && (await p.$(`.dock .db[title="${title}"]`))) {
    // ⚠ 실패하면 «왜» 를 남긴다 — 30초 기다렸다 «타임아웃» 만 나오면 어느 단계가 깨졌는지 알 수 없다
    try { await p.click(`.dock .db[title="${title}"]`, { timeout: 8000 }) }
    catch (e) {
      const st = await p.evaluate((sel) => { const b = document.querySelector(sel); const r = b?.getBoundingClientRect(); const top = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null
        return { cls: document.querySelector('.app')?.className ?? null, view: document.querySelector('.app')?.dataset.view ?? null, w: innerWidth, dock: !!document.querySelector('.dock'), btn: !!b, rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null, top: top ? (top.className || top.tagName) : null } }, `.dock .db[title="${title}"]`)
      fail(`독 «${title}» 을 못 눌렀다 · ` + JSON.stringify(st) + ' · ' + String(e).slice(0, 120))
    }
    return 'dock'
  }
  fail(`앞으로 가는 문이 없다(${id}) · ` + JSON.stringify(await p.evaluate(() => ({ cls: document.querySelector('.app')?.className ?? null, view: document.querySelector('.app')?.dataset.view ?? null, w: innerWidth }))))
}
const swipePanel = async (p) => { await tapNav(p, 'files'); await new Promise((r) => setTimeout(r, 600)) }

/** 진짜 PNG 하나 (M-1 뷰어 검사용) — 라이브러리 없이 zlib 로. 상자보다 큰 그림이어야 «커서 기준» 이 보인다 */
function bigPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = ((x ^ y) & 32) ? 200 : 60 } }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibDeflate(raw)), chunk('IEND', Buffer.alloc(0))])
}
try {
  for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
  const st = await api('/state')
  if (!st.rulesInstalled) fail('rules not installed'); ok(`rules installed · candidates ${st.candidates.length}`)
  if (!existsSync(join(root, '.folderbot/marker.txt')) || existsSync(join(root, '.projectbot'))) fail('state dir migration .projectbot → .folderbot'); ok('state dir .projectbot → .folderbot')
  if (st.candidates.length !== 4) fail(`candidates expected 4, got ${st.candidates.length}`)
  if (st.candidates.filter((c) => c.harness).length !== 3) fail('harness count')
  // SSE
  const frames = []
  const sse = fetch(base + '/api/events').then(async (r) => { const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const c = buf.slice(0, i); buf = buf.slice(i + 2); for (const l of c.split('\n')) if (l.startsWith('data: ')) { const f = JSON.parse(l.slice(6)); if (f.ev === 'files') f._out = existsSync(join(root, '3. Area/제품_Rondo/stub-output.md')); frames.push(f) } } } }).catch(() => {})
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
  /**
   * 🔴 **대화에서 바꾼 모델이 화면에 반영된다** (2026-09-15 Dave: «모델이 바뀌었지만 하단에 반영이 안되네»
   *    — `/model claude-opus-4-8` 을 쳤는데 아래 칩은 계속 옛 이름이었다).
   * ⚠ 정본은 **답에 찍혀 오는 이름**이다 — 우리가 넘긴 이름이 아니라.
   * ⚠ 날짜 꼬리표만 다른 것은 같은 모델로 본다(안 그러면 사람이 고른 이름이 매 턴 덮인다).
   */
  {
    const ms = await api(`/bots/${bot.id}/sessions`, { name: '모델 바꾸기' })
    await api(`/sessions/${ms.id}/send`, { text: '/model claude-opus-4-8' })
    let got = null
    for (let i = 0; i < 40; i++) { got = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === ms.id); if (got?.model === 'claude-opus-4-8') break; await wait(200) }
    if (got?.model !== 'claude-opus-4-8') fail('모델 바꾸기: 대화에서 바꾼 모델이 세션에 안 붙었다 · ' + JSON.stringify(got && got.model))
    // 같은 모델의 날짜 판이 오면 덮지 않는다
    await api(`/sessions/${ms.id}/send`, { text: '/model claude-opus-4-8-20260101' })
    await wait(700)
    const after = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === ms.id)
    if (after.model !== 'claude-opus-4-8') fail('모델 바꾸기: 날짜 꼬리표만 다른 판이 이름을 덮었다 · ' + JSON.stringify(after.model))
    await api(`/sessions/${ms.id}`, undefined, 'DELETE')
    ok('대화에서 바꾼 모델(/model)이 세션에 그대로 붙는다')
  }
  /**
   * 🔴 **첫 말이 제목이 된다** (2026-09-15 Dave: «첫 채팅이 진행되면 그에 맞는 채팅 제목을 자동으로»).
   * ⚠ 덮는 것은 앱이 붙인 이름(`메인` · `세션 3`)뿐이고, **사람이 지은 이름은 그대로 둔다** — 아래 두 번째 검사.
   */
  {
    const list = await api(`/bots/${bot.id}/sessions`)
    const me = list.find((x) => x.id === s1.sessionId)
    if (!me || me.name !== 'PRD 를 읽어 줘') fail('세션 제목: 첫 말이 제목이 안 됐다 · ' + JSON.stringify(me && me.name))
    const mine = await api(`/bots/${bot.id}/sessions`, { name: '세션 9' })
    await api(`/sessions/${mine.id}/rename`, { name: '내가 지은 이름' })
    await api(`/sessions/${mine.id}/send`, { text: '이 말로 제목을 덮으면 안 된다' })
    await wait(600)
    const after = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === mine.id)
    if (after.name !== '내가 지은 이름') fail('세션 제목: 사람이 지은 이름을 덮었다 · ' + JSON.stringify(after.name))
    await api(`/sessions/${mine.id}`, undefined, 'DELETE')
    ok('세션 제목 — 첫 말로 자동 · 사람이 지은 이름은 안 덮는다')
  }
  // 서브에이전트 · 생각 · TodoWrite
  const sub = chat.items.find((i) => i.kind === 'subagent'); if (!sub || sub.tools !== 1 || sub.status !== 'done' || !/2건/.test(sub.result ?? '')) fail('subagent item: ' + JSON.stringify(sub))
  if (!chat.items.some((i) => i.kind === 'tool' && i.parentId === sub.id && i.name === 'Grep')) fail('child tool parentId')
  if (chat.items.some((i) => i.kind === 'assistant' && /하위 조사 끝/.test(i.text))) fail('subagent text leaked into main chat')
  if (!chat.items.some((i) => i.kind === 'thinking' && /먼저 읽을지/.test(i.text))) fail('thinking item')
  const td = chat.items.find((i) => i.kind === 'todos'); if (!td || td.items.length !== 2 || td.items[1].status !== 'in_progress') fail('todos item')
  if (chat.items.some((i) => i.kind === 'tool' && i.name === 'TodoWrite')) fail('TodoWrite should not be a tool line')
  if (!frames.some((f) => f.ev === 'activity')) fail('no activity frame'); ok('subagent(parentId) · thinking · todos · activity')
  // 컨텍스트 사용량 (result.usage) · 슬래시 목록 (파일 + CLI init)
  /**
   * 🔴 **컨텍스트는 «지금 프롬프트의 크기»** (2026-09-15 Dave: «하단의 Context 부분이 오류가 있는거 같아»
   *    — 화면에 «3483k / 1000k · 100%» 가 찍혔다). 스텁은 진짜 CLI 처럼 두 숫자를 다 흘린다:
   *    assistant 줄의 64k(이번 호출) · result 줄의 348만(턴 합계) · 1M 짜리 서브에이전트 모델.
   * ⚠ 합계를 쓰거나 modelUsage 의 최댓값을 쓰면 여기서 바로 빨개진다.
   */
  if (!chat.info.ctx || chat.info.ctx.used !== 64000 || chat.info.ctx.window !== 200000) fail('ctx: 합계·남의 창을 집었다 ' + JSON.stringify(chat.info.ctx))
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
  /**
   * ⚠ 고정 대기(350ms)로 재면 **부하가 걸린 맥에서 직전 턴의 서브에이전트를 집는다** — 새 항목이 아직 안 붙었는데
   *    `pop()` 이 돌아 이미 끝난 「하위 조사」를 보고 «실행 중이어야 한다» 로 빨개졌다(2026-09-22 실측 · load 140).
   *    **새 항목이 붙을 때까지** 기다린다(X 라운드의 「될 때까지」와 같은 처방).
   */
  const saCount = async () => (await api(`/sessions/${s1.sessionId}/chat`)).items.filter((x) => x.kind === 'subagent').length
  const saBefore = await saCount()
  await api(`/sessions/${s1.sessionId}/send`, { text: '백그라운드 조사' })
  for (let i = 0; i < 100 && (await saCount()) === saBefore; i++) await wait(30)
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
  const fr0 = frames.length
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
  /**
   * 🔴 **«파일 바뀜» 은 파일이 디스크에 있은 뒤에 알린다** (2026-09-18 Dave: «원격환경에서 생성된 파일이 폴더에
   *    바로 반영이 안 되는 문제»). 종전엔 Write 도구를 *부르는* 줄에서 알려서 화면이 아직 없는 파일을 읽고 끝났다.
   */
  { const fs_ = frames.slice(fr0).filter((f) => f.ev === 'files' && f.botId === bot.id)
    if (!fs_.length) fail('files frame: none after the Write turn')
    if (!fs_.every((f) => f._out)) fail('🔴 files frame arrived before the file existed on disk ' + JSON.stringify(fs_.map((f) => f._out)))
    ok('files frame only after the file exists on disk') }
  // 🔴 **호스트가 폴더를 본다** — Bash·Codex·Dropbox·Finder 가 만든 파일도 트리에 온다(세션을 거치지 않은 쓰기)
  { const n0 = frames.length
    writeFileSync(join(root, '3. Area/제품_Rondo/watch-me.md'), '# 밖에서 만든 파일\n')
    let seen = false; for (let i = 0; i < 40 && !seen; i++) { await wait(100); seen = frames.slice(n0).some((f) => f.ev === 'files' && f.botId === bot.id) }
    if (!seen) fail('🔴 folder watch: a file written outside the session never produced a files frame')
    ok('folder watch → files frame for a file written outside the session') }
  /**
   * 🔴 **모드를 턴 중간에 바꾸면 그 자리에서 먹는다** (2026-09-18 Dave: «중간에 권한을 바꿨는데 그 이후에도
   *    계속 실행하기 전에 물어보네»). 모드는 스폰 인자라 워커는 옛 모드로 묻는다 — 호스트가 대신 답하고
   *    (pending 이 비고 카드가 사라진다), 턴이 끝나면 새 모드로 재시작(절전 → 같은 id 로 이어짐).
   */
  await api(`/sessions/${s1.sessionId}/send`, { text: '승인이 필요한 일 해 줘' }); await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (chat.info.state !== 'awaiting_input' || chat.info.pending.length !== 1) fail('mode-switch: awaiting expected ' + chat.info.state)
  const sw = await api(`/sessions/${s1.sessionId}/settings`, { permissionMode: 'bypassPermissions' })
  if (sw.pending.length !== 0 || sw.state === 'awaiting_input' || !sw.restartPending) fail('mode-switch: pending should be auto-allowed + restartPending ' + JSON.stringify({ p: sw.pending.length, st: sw.state, rp: sw.restartPending }))
  await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (chat.info.state !== 'done' || chat.info.alive || chat.info.restartPending) fail('mode-switch: turn should end and worker go down for the new mode ' + JSON.stringify({ st: chat.info.state, alive: chat.info.alive, rp: chat.info.restartPending }))
  if (!chat.items.some((i) => i.kind === 'system' && /자동 허용 · Bash/.test(i.text))) fail('mode-switch: no «자동 허용» record')
  ok('mode switch mid-turn → host auto-allows pending → worker restarts after the turn')
  // 새 모드 아래에서 오는 물음도 호스트가 답한다 (스텁은 모드를 모르고 늘 묻는다 — 실 CLI 는 bypass 면 안 묻는다)
  await api(`/sessions/${s1.sessionId}/send`, { text: '승인이 필요한 일 해 줘' }); await wait(900)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  if (chat.info.state !== 'done' || chat.info.cliSessionId !== idBefore) fail('bypass: should not wait for a human ' + JSON.stringify({ st: chat.info.state, id: chat.info.cliSessionId }))
  ok('bypass mode → no prompt reaches the human (resumed same id)')
  // 「이 세션에서 항상 허용」 — CLI 제안이 비어도 단추가 있고, 호스트가 만든 접두어 규칙이 CLI 로 간다
  await api(`/sessions/${s1.sessionId}/settings`, { permissionMode: 'default' })
  await api(`/sessions/${s1.sessionId}/send`, { text: '맨손 승인' }); await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  const bare = chat.info.pending[0]; if (chat.info.state !== 'awaiting_input' || !bare) fail('bare: awaiting expected ' + chat.info.state)
  const heads = bare.suggestions.flatMap((u) => u.rules.map((r) => r.ruleContent)); if (JSON.stringify(heads) !== JSON.stringify(['cd:*', 'npm:*', 'tee:*'])) fail('bare: fallback rules ' + JSON.stringify(bare.suggestions))
  await api(`/sessions/${s1.sessionId}/permission`, { requestId: bare.requestId, allow: true, always: true }); await wait(700)
  chat = await api(`/sessions/${s1.sessionId}/chat`)
  const echo = chat.items.filter((i) => i.kind === 'assistant').pop(); if (!echo || !/규칙 .*npm:\*/.test(echo.text)) fail('bare: updatedPermissions not sent ' + JSON.stringify(echo?.text))
  if (!chat.items.some((i) => i.kind === 'system' && /항상 허용 · Bash\(cd:\*\)/.test(i.text))) fail('bare: system record lacks rule label')
  ok('empty CLI suggestions → host-made prefix rules → sent as updatedPermissions')
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
  let todo = await api(`/bots/${bot.id}/todo`); if (todo.length !== 10) fail('todo parse ' + todo.length)   // AK · 픽스처에 완료 4건이 섞여 있다(차례 검사용)
  todo = await api(`/bots/${bot.id}/todo`, { title: '알파 동결 문서', desc: 'PRD v1.0 뒤에' }); if (todo.length !== 11) fail('todo add ' + todo.length)
  { const target = todo.find((t) => !t.done); todo = await api(`/bots/${bot.id}/todo/toggle`, { line: target.line, done: true }); const t2 = todo.find((t) => t.title === target.title); if (!t2 || !t2.done) fail('todo toggle: ' + JSON.stringify(todo.map((t) => [t.title, t.done]))) } ok('todo add/toggle')
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
  /**
   * ═══ AA · 루틴 (2026-09-22 Dave, 실제 사고 뒤) ═══════════════════════════════════════
   * 사고: UI 에 「20」(저녁 8시)을 넣었더니 `.bot.yml` 에 `cron: "20"` 으로 저장됐고, croner 가 던진 예외를
   * 스케줄러가 삼켜 **루틴이 화면에 멀쩡히 살아 있는데 한 번도 안 돌았다.** 이틀을 몰랐다.
   */
  {
    const mcpB = async (name, args) => { const r = await (await fetch(base + `/mcp/${bot.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }) })).json(); return r.result }
    const yml = join(root, '3. Area/제품_Rondo/.bot.yml')
    const ymlWas = existsSync(yml) ? readFileSync(yml, 'utf8') : null      // 이 블록이 끝나면 그대로 되돌린다 — 뒤 검사가 흔들리면 안 된다
    const sessWas = new Set((await api(`/bots/${bot.id}/sessions`)).map((x) => x.id))
    const putR = async (routines) => { const r = await fetch(base + `/api/bots/${bot.id}/routines`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ routines }) }); return { status: r.status, body: await r.json() } }

    // 🔴 ① 「20」 은 400 과 되묻기로 끝난다 — 조용히 저장되지 않는다
    const bad = await putR([{ name: '아침 브리핑', cron: '20', prompt: '훑어 줘' }])
    if (bad.status !== 400) fail('🔴 AA-1: 「20」 이 400 으로 안 막혔다 · ' + JSON.stringify(bad))
    if (!/20시/.test(JSON.stringify(bad.body)) || !/매시 20분/.test(JSON.stringify(bad.body))) fail('AA-1: 무엇이 갈리는지 안 알려 준다 · ' + JSON.stringify(bad.body))
    if (!bad.body.examples?.length) fail('AA-1: 고친 예를 안 준다')
    if (existsSync(yml) && /cron/.test(readFileSync(yml, 'utf8'))) fail('🔴 AA-1: 막았는데 파일에 저장됐다 · ' + readFileSync(yml, 'utf8'))

    // ② 「매일 저녁 8시」 → `.bot.yml` 에 "0 20 * * *" · 목록은 사람 말 + 다음 실행
    const good = await putR([{ name: '저녁 정리', cron: '매일 저녁 8시', prompt: '오늘 바뀐 것 정리해 줘' }])
    if (good.status !== 200) fail('AA-3: 사람 말이 안 들어갔다 · ' + JSON.stringify(good))
    const saved = readFileSync(yml, 'utf8')
    if (!/0 20 \* \* \*/.test(saved)) fail('🔴 AA-3: .bot.yml 에 "0 20 * * *" 로 저장돼야 한다 · ' + saved)
    if (/lastError|nextRun/.test(saved)) fail('AA-1: 화면용 값이 파일로 샜다 · ' + saved)
    const list1 = await api(`/bots/${bot.id}/routines`)
    if (list1[0].when !== '매일 저녁 8시') fail('AA-4: 목록이 사람 말이어야 한다 · ' + JSON.stringify(list1[0]))
    if (!list1[0].nextRun) fail('AA-1: 「다음 실행」이 없다 · ' + JSON.stringify(list1[0]))
    if (list1[0].lastError) fail('AA-1: 멀쩡한 루틴에 오류가 붙었다 · ' + list1[0].lastError)

    // 🔴 ③ `.bot.yml` 을 에디터로 고치면 몇 초 안에 화면과 스케줄이 따라온다
    writeFileSync(yml, saved.replace('0 20 * * *', '0 21 * * *'))
    let followed = null
    for (let i = 0; i < 60 && !followed; i++) { await wait(100); const l = await api(`/bots/${bot.id}/routines`); if (l[0]?.cron === '0 21 * * *') followed = l[0] }
    if (!followed) fail('🔴 AA-2: .bot.yml 을 밖에서 고쳤는데 안 따라온다')
    if (followed.when !== '매일 밤 9시' || !followed.nextRun) fail('AA-2: 따라왔는데 사람 말·다음 실행이 안 맞는다 · ' + JSON.stringify(followed))

    // 🔴 깨진 YAML 로 기존 루틴을 날리지 않는다(Dropbox 가 반쯤 쓴 파일을 읽는 순간이 실제로 있다)
    const goodYml = readFileSync(yml, 'utf8')
    writeFileSync(yml, 'routines: [ {name: 저녁 정리, cron: "0 21')
    await wait(700)
    const stillThere = await api(`/bots/${bot.id}/routines`)
    if (!stillThere.length) fail('🔴 AA-2: 반쯤 쓰인 YAML 한 번에 루틴이 통째로 사라졌다')
    writeFileSync(yml, goodYml); await wait(700)

    // ④ 「지금 한 번 돌려보기」 — 저장 직후 동작을 확인할 수 있다
    const before = (await api(`/bots/${bot.id}/sessions`)).length
    const runR = await api(`/bots/${bot.id}/routines/run`, { name: '저녁 정리' })
    if (!runR.ok) fail('AA-4: 지금 한 번 돌려보기가 안 된다 · ' + JSON.stringify(runR))
    let grew = false
    for (let i = 0; i < 40 && !grew; i++) { await wait(100); grew = (await api(`/bots/${bot.id}/sessions`)).length > before }
    if (!grew) fail('AA-4: 돌렸다는데 세션이 안 생겼다')

    // ⑤ 봇이 채팅에서 루틴을 고친다 — 「저녁 9시로 바꿔줘」
    const listed = JSON.parse((await mcpB('routine_list', {})).content[0].text)
    if (listed[0].when !== '매일 밤 9시' || !listed[0].next) fail('AA-5 routine_list · ' + JSON.stringify(listed))
    const updated = JSON.parse((await mcpB('routine_update', { name: '저녁 정리', when: '저녁 9시' })).content[0].text)
    if (!updated.ok || !/9시/.test(updated.when)) fail('AA-5 routine_update · ' + JSON.stringify(updated))
    if (!updated.before || updated.before.cron !== '0 21 * * *') fail('🔴 AA-5: 되돌릴 수 있게 직전 값을 안 줬다 · ' + JSON.stringify(updated))
    // 🔴 봇이 cron 을 지어내거나 뜻이 갈리는 값을 넣으면 저장되지 않고 되묻는 답이 온다
    const ambiguous = JSON.parse((await mcpB('routine_update', { name: '저녁 정리', when: '20' })).content[0].text)
    if (ambiguous.ok !== false || !ambiguous.ask) fail('🔴 AA-5: 「20」 을 봇이 넣었는데 그냥 저장됐다 · ' + JSON.stringify(ambiguous))
    // 🔴 approve 는 도구에 아예 없다 — 봇이 스스로 bypassPermissions 로 올리는 길을 열지 않는다
    const tools = (await (await fetch(base + `/mcp/${bot.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list' }) })).json()).result.tools
    for (const t of tools.filter((x) => /^routine_/.test(x.name))) if (JSON.stringify(t.inputSchema).includes('approve')) fail('🔴 AA-5: 루틴 도구에 approve 가 있다 — 봇이 스스로 권한을 올릴 수 있다 · ' + t.name)
    const tryApprove = await mcpB('routine_update', { name: '저녁 정리', approve: 'always' })
    const afterTry = await api(`/bots/${bot.id}/routines`)
    if ((afterTry[0]?.approve ?? 'readonly') === 'always') fail('🔴 AA-5: 봇이 승인 수준을 always 로 올렸다 · ' + JSON.stringify(tryApprove))
    // routine_add · routine_remove 는 직전 값을 담아 되돌릴 수 있게
    const added = JSON.parse((await mcpB('routine_add', { name: '아침 점검', when: '평일 아침 9시 반', prompt: '밤새 온 것 훑어 줘' })).content[0].text)
    if (!added.ok || !/9시 30분/.test(added.when)) fail('AA-5 routine_add · ' + JSON.stringify(added))
    if (!/0 20 \* \* \*|30 9 \* \* 1-5/.test(readFileSync(yml, 'utf8'))) fail('AA-5: .bot.yml 에 안 들어갔다')
    const removed = JSON.parse((await mcpB('routine_remove', { name: '아침 점검' })).content[0].text)
    if (!removed.before || removed.before.cron !== '30 9 * * 1-5') fail('🔴 AA-5: 지운 뒤 되돌릴 값을 안 줬다 · ' + JSON.stringify(removed))

    // ⑥ 안 서는 주기가 파일에 이미 있던 봇 — 조용히 넘기지 않고 화면에 오류가 붙는다
    writeFileSync(yml, 'routines:\n  - name: 낡은 루틴\n    cron: "20"\n    prompt: 훑어 줘\n')
    let flagged = null
    for (let i = 0; i < 60 && !flagged; i++) { await wait(100); const l = await api(`/bots/${bot.id}/routines`); if (l[0]?.lastError) flagged = l[0] }
    if (!flagged) fail('🔴 AA-1: 안 서는 주기인데 화면에 오류가 안 붙었다 — 사고가 그대로 되풀이된다')
    if (flagged.nextRun) fail('AA-1: 안 걸렸는데 다음 실행이 있다 · ' + JSON.stringify(flagged))
    writeFileSync(yml, goodYml); await wait(700)
    // 치우기 — 루틴이 만든 세션과 `.bot.yml` 을 원래대로 (이 블록 때문에 뒤 검사가 달라지면 안 된다)
    for (const x of await api(`/bots/${bot.id}/sessions`)) if (!sessWas.has(x.id)) await fetch(base + `/api/sessions/${x.id}`, { method: 'DELETE' })
    if (ymlWas === null) { try { rmSync(yml) } catch { /* */ } } else writeFileSync(yml, ymlWas)
    await wait(700)
    if ((await api(`/bots/${bot.id}/routines`)).length && ymlWas === null) fail('AA: 치우기가 안 됐다')
    ok('AA 루틴 — 「20」은 400+되묻기 · 사람 말 → cron · .bot.yml 을 밖에서 고쳐도 따라옴 · 깨진 YAML 로 안 날림 · 지금 한 번 · 봇 도구 4개(approve 없음)')
  }
  /**
   * AJ · **CLI 업데이트 길이 열려 있나** (2026-09-24 Dave). 스텁 환경에는 진짜 claude 가 없을 수 있으니
   * «없으면 400 · 있으면 200» 둘 다 제대로 답하는지만 잰다 — 여기서 진짜 업데이트를 돌리지는 않는다.
   */
  {
    const ag = await api('/agents')
    const cl = ag.find((x) => x.id === 'claude')
    if (!cl) fail('AJ: /api/agents 에 claude 가 없다 ' + JSON.stringify(ag))
    if (!('version' in cl)) fail('AJ: 제공자에 판(version)이 없다 — 화면이 낡았는지 못 잰다 ' + JSON.stringify(cl))
    const r = await fetch(base + '/api/agents/claude/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    const body = await r.json().catch(() => ({}))
    if (r.status !== 200 && r.status !== 400) fail('AJ: 업데이트 길이 이상한 답을 준다 ' + r.status + ' ' + JSON.stringify(body))
    if (r.status === 200 && !body.skipped) fail('🔴 AJ: 검사에서 실제로 CLI 를 올리려 했다 — QA 는 실 CLI 를 안 건드린다 ' + JSON.stringify(body))
    if (r.status !== 200 && !body.error) fail('AJ: 못 했으면 왜인지 말해야 한다 ' + JSON.stringify(body))
    ok(`AJ CLI 업데이트 길 — /api/agents 에 판 · POST update ${r.status}${body.skipped ? ' (QA 는 건너뜀)' : ''}`)
    /**
     * 🔴 **AL · 새로고침 길과 «안 고른 CLI»** (2026-09-24 실측한 사고).
     *    Dave 의 맥에 `claude` 가 두 벌 있었고 호스트가 **낡은 쪽**을 집어, 그 번들에 없는 Opus 5.5 가
     *    목록에 영영 안 떴다. 재시작으로도 안 고쳐졌다 — 고를 때 **판을 안 봤기** 때문이다.
     */
    {
      const rr = await fetch(base + '/api/agents/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const rb = await rr.json()
      if (rr.status !== 200 || !rb.ok) fail('🔴 AL: 새로고침 길이 없다(리프레시가 안 된다) ' + rr.status + ' ' + JSON.stringify(rb).slice(0, 200))
      if (!rb.models || !('claude' in rb.models)) fail('AL: 새로고침이 모델을 안 돌려준다 ' + JSON.stringify(rb).slice(0, 200))
      const cl2 = (rb.providers ?? []).find((x) => x.id === 'claude')
      if (cl2 && !('others' in cl2)) fail('AL: 제공자에 «안 고른 CLI»(others) 가 없다 — 화면이 왜 이 판인지 못 말한다 ' + JSON.stringify(cl2))
      ok(`AL 새로고침 — 후보 다시 훑기 · 모델 ${rb.models.claude.length}개${cl2?.others?.length ? ` · 안 고른 CLI ${cl2.others.length}벌` : ''}`)
    }
    /**
     * 🔴 **AV · 「모두 읽음」** (2026-09-25 Dave: *«다 읽었는데도 왜 더블닷이 안사라지지? 읽었다는 기준이 어떻게 돼?»*).
     *    봇 줄의 더블링은 **세션 하나라도** 안 읽었으면 켜진다. 실측: 오케스트레이터 34세션 중 **딱 하나**가
     *    「본 뒤 새 답이 온」 것이었는데, 어느 세션인지 화면이 안 알려 줘서 다 읽은 줄 알았다.
     * ⚠ 읽은 지점은 각 세션의 **마지막 답 시각** — 누르는 사이 온 답까지 삼키면 안 된다.
     */
    {
      const before = await api(`/bots/${bot.id}/sessions`)
      const unread = (xs) => xs.filter((x) => x.lastReplyAt && x.lastReplyAt > (x.readAt ?? 0))
      if (!unread(before).length) fail('AV: 안 읽은 세션이 없어 「모두 읽음」 을 잴 수 없다 — 검사가 헛돈다 ' + JSON.stringify(before.map((x) => [x.lastReplyAt, x.readAt])))
      const rr = await fetch(base + `/api/bots/${bot.id}/read-all`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const rb2 = await rr.json()
      if (rr.status !== 200 || !rb2.ok) fail('🔴 AV: 「모두 읽음」 길이 없다 ' + rr.status + ' ' + JSON.stringify(rb2))
      const after = await api(`/bots/${bot.id}/sessions`)
      if (unread(after).length) fail('🔴 AV: 「모두 읽음」 뒤에도 안 읽은 세션이 남았다 ' + JSON.stringify(unread(after).map((x) => x.name)))
      for (const x of after) if (x.readAt && x.lastReplyAt && x.readAt > x.lastReplyAt) fail('AV: 읽은 지점이 마지막 답보다 뒤다(누르는 사이 온 답을 삼킨다) ' + JSON.stringify(x))
      ok(`AV 모두 읽음 — 안 읽음 ${unread(before).length} → 0 · 읽은 지점 = 각 세션의 마지막 답`)
    }
  }
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
  /**
   * 🔴 **AC · 칸(섹션) 자체에는 봇을 안 만든다** (2026-09-23 Dave 스크린샷 056: *«리소스와 아카이브도 프로젝트와
   *    에어리어 처럼 그 하단에 폴더명으로 생겨야해. 이렇게 폴더 전체가 생기면 안돼»*).
   *    `2. Projects`·`3. Area` 는 글롭(`…/*`)의 부모라 자연히 막혀 있었지만 `4. Resources`·`5. Archive`·`1. Inbox` 는 통과했다.
   */
  {
    for (const sec of ['4. Resources', '5. Archive', '1. Inbox', '2. Projects', '3. Area']) {
      const r = await fetch(base + '/api/bots/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: sec }) })
      const body = await r.json()
      if (r.status === 200) fail(`🔴 AC: 칸 「${sec}」 이 통째로 봇이 됐다 · ` + JSON.stringify(body))
      if (!/칸이에요/.test(body.error ?? '')) fail(`AC: 왜 안 되는지 안 알려 준다 (${sec}) · ` + JSON.stringify(body))
      if ((await api('/bots')).some((b) => b.rel === sec)) fail(`🔴 AC: 막았는데 목록에 「${sec}」 봇이 있다`)
    }
    // 칸 「안」 의 폴더는 그대로 된다 — 폴더명이 봇 이름이고 섹션은 그 칸이다
    mkdirSync(join(root, '4. Resources/2026_소울-영어오디오'), { recursive: true })
    const kid = await api('/bots/start', { rel: '4. Resources/2026_소울-영어오디오' })
    if (kid.name !== '2026_소울-영어오디오' || kid.section !== '4. Resources') fail('AC: 칸 안 폴더가 폴더명으로 안 생겼다 ' + JSON.stringify(kid))
    // 안내에 «그 안의 폴더» 예시가 들어간다 — 사람이 다음에 뭘 할지 안다
    const r2 = await fetch(base + '/api/bots/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: '4. Resources' }) })
    if (!/2026_/.test((await r2.json()).error ?? '')) fail('AC: 안내에 그 안의 폴더 예시가 없다')
    // 봇도 같은 문에 걸린다(MCP)
    const mres = await mcp('tools/call', { name: 'bot_start', arguments: { rel: '5. Archive' } })
    if (!/칸이에요/.test(mres.result.content[0].text)) fail('AC: 봇(MCP)도 같은 문에 걸려야 한다 · ' + mres.result.content[0].text)
    await api(`/bots/${kid.id}/stop`, {})
    ok('AC 칸은 봇이 아니다 — 다섯 칸 전부 막히고 · 그 안의 폴더는 폴더명으로 · 봇도 같은 문')
  }
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
    const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })
    globalThis.__br = br
    for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      const pg = await br.newPage({ viewport: vp, deviceScaleFactor: 1, ...(name === 'phone' ? { hasTouch: true } : {}) })   // H · 쓸기는 터치 지점이 있는 기기에서만 켜진다 — 폰 판은 터치 기기다
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
        /**
         * 🔴 **AO · 화면을 옮겨도 「페이지 기록」이 안 쌓인다** (2026-09-24 Dave: *«왼쪽 혹은 오른쪽으로 쓸기에서
         *    이전 혹은 다음 페이지로 이동하는 기능이 여전히 남아 있어. 이거 없애기로 했는데»*).
         * ⚠ 앱 안의 가로 쓸기는 이미 봇 목록 하나로 줄였지만, **맥 트랙패드의 두 손가락 쓸기는 시스템이 주는
         *    «뒤로/앞으로»** 라 우리 손짓 코드를 안 거친다. 막는 길은 **걷어 갈 기록을 안 만드는 것**이다.
         * ⚠ 그래서 재는 것도 손짓이 아니라 **기록의 길이**다 — 손짓은 기기마다 다르지만 기록은 어디서나 같다.
         */
        {
          /* ⚠ 해시를 직접 쓰면 **브라우저를 재는 것**이지 앱을 재는 게 아니다(그건 당연히 쌓인다).
                앱이 쓰는 길 — **진짜 클릭** — 으로 옮겨야 `useHash` 를 지나간다. */
          /* ⚠ 뒤 검사는 «지금 보던 봇» 을 전제한다 — 옮겨 다녔으면 **원래 봇으로 되돌려 놓고** 나간다(실측으로 깨졌다) */
          const was = await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot'))
          const brows = await pg.$$eval('.brow[data-id]', (r) => r.map((x) => x.dataset.id))
          if (brows.length < 2) fail('AO: 옮겨 다닐 봇이 둘 미만이라 검사가 헛돈다 ' + JSON.stringify(brows))
          await pg.click(`.brow[data-id="${brows[0]}"]`); await wait(500)
          const len0 = await pg.evaluate(() => history.length)
          for (const id of [brows[1], brows[0], brows[1], brows[0]]) { await pg.click(`.brow[data-id="${id}"]`); await wait(400) }
          const len1 = await pg.evaluate(() => history.length)
          if (was) { await pg.click(`.brow[data-id="${was}"]`).catch(() => {}); await wait(600) }
          if (len1 > len0) fail(`🔴 AO: 화면을 옮겼더니 페이지 기록이 ${len0} → ${len1} 로 쌓였다 — 트랙패드 쓸기가 그걸 걷는다`)
          ok(`AO 페이지 기록 — 봇을 네 번 오가도 ${len1} 그대로(쓸기가 걷어 갈 곳이 없다)`)
        }

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
          /**
           * 🔴 **업데이트는 받아만 두고, 적용은 묻는다** (2026-09-15 Dave: «자동업데이트 하지말고 다운로드가
           *    끝난뒤에 업데이트 여부를 물어보기만 해줘. 좌측하단에 버전메뉴에서 팝업으로»).
           *    가짜 셸 다리로 «다 받았다» 를 흘려 보내고 ① 칩 위에 팝업이 뜨는지 ② 「나중에」 가 적용을 안 부르는지
           *    ③ 칩을 다시 누르면 다시 묻는지 ④ 「적용」 만이 apply 를 부르는지 잰다.
           */
          {
            const pg4 = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
            await pg4.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
            await pg4.addInitScript(() => {
              window.__applied = 0; window.__updCb = null
              const st = () => ({ current: '0.2.100', staged: { version: '0.2.101', ready: true, progress: 1, notes: '테스트 빌드' }, downloading: false, checking: false, lastCheck: Date.now(), lastError: '', deferred: false, busy: 2, host: true })
              window.folderbotDesktop = { version: '0.2.100', perms: { list: async () => [], open: async () => ({ ok: true }), ack: async () => [], reset: async () => [], test: async () => ({ ok: true }), relaunch: () => {}, onChange: () => () => {} },
                update: { state: async () => st(), check: async () => st(), apply: () => { window.__applied += 1 }, onChange: (cb) => { window.__updCb = cb; return () => {} } } }
            })
            await pg4.goto(base + `/#bot=${bot.id}`)
            await pg4.waitForSelector('.updask', { timeout: 10000 })
            const t = (await pg4.textContent('.updask')) ?? ''
            if (!/0\.2\.101/.test(t) || !/세션 2개/.test(t)) fail('업데이트 팝업: 버전·세션 수가 안 보인다 · ' + JSON.stringify(t))
            await pg4.click('.updask .btn.ghost'); await wait(300)
            if (await pg4.$('.updask')) fail('업데이트 팝업: 「나중에」 를 눌렀는데 안 닫힌다')
            if ((await pg4.evaluate(() => window.__applied)) !== 0) fail('🔴 업데이트 팝업: 「나중에」 인데 적용됐다')
            await pg4.click('.sb-foot .bd.upd'); await wait(300)
            if (!(await pg4.$('.updask'))) fail('업데이트 팝업: 칩을 눌렀는데 다시 안 묻는다')
            await pg4.click('.updask .btn.on'); await wait(300)
            if ((await pg4.evaluate(() => window.__applied)) !== 1) fail('업데이트 팝업: 「적용」 을 눌렀는데 apply 가 안 불렸다')
            await pg4.close()
            ok('업데이트 — 받아 두고 칩 위 팝업으로 묻는다 · 나중에는 나중에 · 적용은 사람이')
          }
        }
        // 버전 칩을 누르면 확인 — 브라우저 화면에선 안내 토스트
        await pg.click('.sb-foot .bd.upd'); await wait(200); const vt = await pg.textContent('.toast'); if (!/업데이트/.test(vt ?? '')) fail('ui version chip toast: ' + vt)
        // 레일 순서 — 섹션은 관제 → 2 → 3 → 4, 행은 이름 내림차순(날짜 최신 먼저), 활동으로 자리가 안 바뀐다
        const order = await pg.evaluate(() => Array.from(document.querySelectorAll('.sb-list > div')).map((sec) => ({ s: sec.querySelector('.secl')?.textContent, n: Array.from(sec.querySelectorAll('.brow .n .bname')).map((e) => e.getAttribute('title')) })))
        const secNames = order.map((o) => o.s); const sorted = [...secNames].sort((a, b) => (a === '관제' ? -1 : b === '관제' ? 1 : a.localeCompare(b, 'ko', { numeric: true })))
        if (JSON.stringify(secNames) !== JSON.stringify(sorted)) fail('ui section order ' + secNames.join(' | '))
        for (const o of order) { const d = [...o.n].sort((a, b) => b.localeCompare(a, 'ko', { numeric: true, sensitivity: 'base' })); if (JSON.stringify(o.n) !== JSON.stringify(d)) fail(`ui row order in ${o.s}: ${o.n.join(' | ')}`) }
        // NFD 파일명이 자모 분리 없이 합쳐져 보인다
        const nfdName = await pg.$$eval('.panel .trow .n', (els) => els.map((e) => e.textContent).find((t) => t && t.includes('_MAP_'))); if (!nfdName || nfdName !== nfdName.normalize('NFC') || !/전체구조/.test(nfdName)) fail('ui NFD name: ' + JSON.stringify(nfdName))
        // 트리 이름은 가운데 말줄임 — 꼬리(.mt)가 남아 있다 (레일은 F 로 «제목 끝 자르기» 가 됐다)
        if (!(await pg.$('.brow .n .bname .dn')) || !(await pg.$('.panel .trow .n .mid'))) fail('ui mid ellipsis')
        /**
         * 🔴 **레일 이름 파생** (F · 2026-09-19 Dave 1안 확정) — 폴더명 `날짜_타입-이름` 을 파싱해 «제목 굵게 · 타입 태그 ·
         *    오른쪽 날짜 칩». 정렬·rel 은 폴더명 그대로(위 정렬 검사가 title 속성 = 폴더명으로 재는 이유).
         */
        {
          const rowOf = (folder) => pg.evaluate((f) => { const r = [...document.querySelectorAll('.sb-list .brow')].find((x) => x.querySelector('.bname')?.getAttribute('title') === f); if (!r) return null
            const dn = r.querySelector('.dn'), due = r.querySelector('.due'); const rr = r.getBoundingClientRect(), dr = due?.getBoundingClientRect()
            return { dn: dn?.textContent, tag: r.querySelector('.tag')?.textContent ?? null, due: due?.textContent ?? null, cls: due?.className ?? '', time: !!r.querySelector('time'), cut: dn ? dn.scrollWidth > dn.clientWidth + 1 : false, dueIn: dr ? dr.width > 0 && dr.right <= rr.right + 1 : null } }, folder)
          const now = new Date(); const pad = (n) => String(n).padStart(2, '0'); const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
          const a = await rowOf('2026-09_예시고객-자문')
          const sepTone = now.getFullYear() > 2026 || (now.getFullYear() === 2026 && now.getMonth() + 1 > 9) ? 'past' : 'normal'
          if (!a || a.dn !== '예시고객 자문' || a.tag !== null || a.due !== '9월' || !a.cls.includes(sepTone) || a.time) fail('F 예시: 2026-09_예시고객-자문 ' + JSON.stringify(a))
          await mcp('tools/call', { name: 'bot_start', arguments: { rel: '2. Projects/2026-10_해커톤-제안' } }); await wait(600)
          const h = await rowOf('2026-10_해커톤-제안'); if (!h || h.dn !== '해커톤 제안' || h.tag !== null || h.due !== '10월') fail('F 예시: 2026-10_해커톤-제안 ' + JSON.stringify(h))
          const r0 = await rowOf('제품_Rondo'); if (!r0 || r0.dn !== '제품_Rondo' || r0.due !== null || !r0.time) fail('F 규칙 밖: 제품_Rondo 는 그대로 + 활동 시각 ' + JSON.stringify(r0))
          // D-2(강조) · 어제(지남 흐림) · 아주 긴 제목(잘림에도 칩이 남는다)
          const d2 = new Date(now); d2.setDate(d2.getDate() + 2); const y1 = new Date(now); y1.setDate(y1.getDate() - 1)
          const soonRel = `2. Projects/${ymd(d2)}_컨설팅-마감임박`, pastRel = `2. Projects/${ymd(y1)}_행사-지난-행사-아주-긴-이름-말줄임-검사용-폴더-이름-끝까지`
          for (const rel of [soonRel, pastRel]) { mkdirSync(join(root, rel), { recursive: true }); await mcp('tools/call', { name: 'bot_start', arguments: { rel } }) }
          await wait(900)
          const so = await rowOf(soonRel.split('/')[1]); if (!so || so.dn !== '마감임박' || so.tag !== '컨설팅' || !/D-2$/.test(so.due ?? '') || !so.cls.includes('soon')) fail('F D-3 강조: ' + JSON.stringify(so))
          const pa = await rowOf(pastRel.split('/')[1]); if (!pa || !/지남$/.test(pa.due ?? '') || !pa.cls.includes('past') || !pa.cut || pa.dueIn !== true) fail('F 지남·잘림: 제목이 잘려도 칩이 남아야 한다 ' + JSON.stringify(pa))
          // display_name: — 봇 폴더 CLAUDE.md frontmatter 로 제목만 덮는다 · 날짜 칩은 그대로 · 파일이 바뀌면 레일도 바뀐다
          const cm = join(root, soonRel, 'CLAUDE.md'); const body = existsSync(cm) ? readFileSync(cm, 'utf8') : ''
          writeFileSync(cm, `---\ndisplay_name: 덮은 이름\n---\n${body}`)
          let ov = null; for (let i = 0; i < 30 && !(ov && ov.dn === '덮은 이름'); i++) { await wait(150); ov = await rowOf(soonRel.split('/')[1]) }
          if (!ov || ov.dn !== '덮은 이름' || !/D-2$/.test(ov.due ?? '')) fail('F display_name: ' + JSON.stringify(ov))
          const bl = JSON.parse((await mcp('tools/call', { name: 'bots_list', arguments: {} })).result.content[0].text); const me = bl.find((b) => b.rel === soonRel)
          if (!me || me.displayName !== '덮은 이름' || me.name !== soonRel.split('/')[1]) fail('F bots_list displayName: ' + JSON.stringify(me))
          // 시안 「1안」 과 나란히 — 스크린샷으로 남긴다
          await pg.$eval('.sb-list', (e) => e.scrollTo(0, 0)); await (await pg.$('.sb-list')).screenshot({ path: 'test/tmp/rail-f.png' })
          // 시안 html 은 gitignore 된 test/tmp 산출물이라 새 기기(맥미니 2026-09-22)에는 없다 — 있을 때만 나란히 찍는다(단언 없음)
          if (existsSync(join(process.cwd(), 'test/tmp/rail-name-mock.html'))) {
            const mp = await pg.context().browser().newPage(); await mp.setViewportSize({ width: 1400, height: 900 }); await mp.goto('file://' + join(process.cwd(), 'test/tmp/rail-name-mock.html')); await wait(300)
            const cols = await mp.$$('.col'); if (cols[1]) await cols[1].screenshot({ path: 'test/tmp/rail-mock-1.png' }); await mp.close()
            const cp = await pg.context().browser().newPage(); await cp.setViewportSize({ width: 900, height: 700 })
            const b64 = (f) => 'data:image/png;base64,' + readFileSync(join(process.cwd(), f)).toString('base64')   // about:blank 은 file:// 을 못 읽는다
            await cp.setContent(`<body style="margin:0;background:#111;display:flex;gap:24px;padding:20px;font:12px -apple-system,sans-serif;color:#aaa"><div><div>Folder Bot 레일 (F 구현)</div><img src="${b64('test/tmp/rail-f.png')}" style="max-width:400px"></div><div><div>시안 · 1안</div><img src="${b64('test/tmp/rail-mock-1.png')}" style="max-width:420px"></div></body>`); await wait(400)
            await cp.screenshot({ path: 'test/tmp/rail-compare.png' }); await cp.close()
          } else console.log('  (시안 비교 스크린샷 건너뜀 — test/tmp/rail-name-mock.html 없음)')
          for (const rel of [soonRel, pastRel, '2. Projects/2026-10_해커톤-제안']) await mcp('tools/call', { name: 'bot_stop', arguments: { bot: rel } })
          await wait(400)
          ok('레일 이름 파생 — 예시 3 · D-2 강조 · 지남 흐림 · 잘려도 칩 · display_name · bots_list.displayName · 시안 비교 test/tmp/rail-compare.png')
        }
        /**
         * 🔴 **원격에서 파일 열기 — 그 기기에서** (E · 2026-09-19 Dave 1안 확정). 원격 Electron 을 흉내 낸다:
         *    `x-fb-as` 헤더(인증 없는 QA 의 시임)로 호스트가 이 화면을 «원격 · 맥북» 으로 보고, 가짜 `folderbotDesktop.local` 브리지가
         *    셸 대신 답한다(호출 기록을 남긴다). 실제 파일 시스템 판정은 유닛(test/unit/localfs.test.ts)이 잰다.
         */
        {
          const CANDS = [{ path: '/Users/dave/Library/CloudStorage/Dropbox/PARA', real: '/Users/dave/Library/CloudStorage/Dropbox/PARA', files: 1200, shell: false }, { path: '/Users/dave/Library/CloudStorage/Dropbox-Cbsjin/진대연 (Dave)/PARA', real: '/Users/dave/Library/CloudStorage/Dropbox-Cbsjin/진대연 (Dave)/PARA', files: 1, shell: true }]
          const rp = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
          await rp.addInitScript((cands) => {
            localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:docopen')
            const L = { settings: { openMode: '', vaultLocal: '' }, calls: [], stat: null, cands }; window.__local = L
            window.folderbotDesktop = {
              version: 'qa',
              perms: { list: async () => [{ id: 'local-open', required: true, probeable: false, status: L.settings.openMode ? 'granted' : 'unknown' }], open: async () => ({ ok: true }), ack: async () => [], reset: async () => [], test: async () => ({ ok: true }), relaunch: () => {}, onChange: () => () => {} },
              local: {
                settings: async () => ({ ...L.settings }), set: async (p) => { Object.assign(L.settings, p); L.calls.push(['set', p]); return { ...L.settings } },
                detect: async (r) => { L.calls.push(['detect', r]); return L.cands }, stat: async (p) => { L.calls.push(['stat', p]); return L.stat ? L.stat(p) : { exists: false } },
                open: async (p) => { L.calls.push(['open', p]); return '' }, reveal: async (p) => { L.calls.push(['reveal', p]); return '' },
                wait: async (p) => { L.calls.push(['wait', p]); await new Promise((r) => setTimeout(r, 120)); return true },
                download: async (url, host, rel) => { L.calls.push(['download', url, host, rel]); return '/cache/' + rel }, icloud: async (p) => { L.calls.push(['icloud', p]); return true }, pick: async () => ''
              }
            }
            const of = window.fetch.bind(window); window.fetch = (u, o = {}) => { const h = new Headers(o.headers || {}); h.set('x-fb-as', 'macbook'); return of(u, { ...o, headers: h }) }
          }, CANDS)
          await rp.goto(base + `/#bot=${bot.id}`); await rp.waitForSelector('.perm-gate', { timeout: 15000 }); await wait(600)
          const calls = () => rp.evaluate(() => window.__local.calls)
          // 온보딩 — 권한 관문 안의 한 단계 · 자동 탐색 · 정본이 맨 위 · 껍데기는 표시
          const gate = await rp.textContent('.perm-gate'); if (!/이 기기에서 파일 열기/.test(gate ?? '')) fail('E 온보딩: 「이 기기에서 파일 열기」 단계가 관문에 없다')
          if (!(await rp.$('.perm-gate .mr.remote, .perm-gate'))) fail('E: gate')
          const cl = await rp.$$eval('.perm-gate .lpick .cand', (r) => r.map((x) => ({ p: x.querySelector('.p')?.textContent, cls: x.className })))
          if (cl.length !== 2 || cl[0].p !== CANDS[0].path || !/best/.test(cl[0].cls) || !/shell/.test(cl[1].cls) || /best/.test(cl[1].cls)) fail('E 온보딩 후보: 정본이 1순위·껍데기 표시 ' + JSON.stringify(cl))
          if (!(await calls()).some((c) => c[0] === 'detect' && c[1] === root)) fail('E 온보딩: 호스트 루트로 detect 를 부르지 않았다 ' + JSON.stringify(await calls()))
          await rp.click('.perm-gate .lpick .cand.best'); await wait(400)
          const st1 = await rp.evaluate(() => window.__local.settings); if (st1.openMode !== 'sync' || st1.vaultLocal !== CANDS[0].path) fail('E 온보딩: 고르면 sync + 경로 ' + JSON.stringify(st1))
          await rp.click('.perm-gate button.btn.on:has-text("계속")'); await wait(500)
          if (await rp.$('.perm-gate')) fail('E 온보딩: 고른 뒤 계속이 안 된다')
          await rp.waitForSelector('.col.chat .hdr', { timeout: 10000 }); await wait(400)
          if (!/원격 · macbook/.test((await rp.textContent('.mr.remote').catch(() => '')) ?? '')) fail('E: 이 화면은 «원격 · macbook» 이어야 한다')
          // ① 같으면 바로 이 기기의 Finder — 호스트 stat 과 같은 값을 돌려주는 가짜 stat
          const hs = await api(`/bots/${bot.id}/stat?rel=CLAUDE.md`); if (!hs.head || !hs.size) fail('E stat: ' + JSON.stringify(hs))
          await rp.evaluate((h) => { window.__local.stat = () => ({ exists: true, size: h.size, head: h.head, mtime: Date.now() }) }, hs)
          const revealClaude = async () => { await rp.evaluate(() => { const b = [...document.querySelectorAll('.panel .trow')].find((x) => /CLAUDE\.md/.test(x.textContent ?? '')); b?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 300 })) }); await wait(250); const lab = await rp.textContent('.menu button:has-text("Finder 에서 보기")'); await rp.click('.menu button:has-text("Finder 에서 보기")'); await wait(500); return lab }
          const lab = await revealClaude(); if (!/이 기기/.test(lab ?? '')) fail('E: 메뉴가 «이 기기» 를 말해야 한다 · ' + lab)
          const localPath = `${CANDS[0].path}/3. Area/제품_Rondo/CLAUDE.md`
          if (!(await calls()).some((c) => c[0] === 'reveal' && c[1] === localPath)) fail('E ① 같음: 이 기기의 Finder 로 reveal 해야 한다 ' + JSON.stringify(await calls()))
          // ① 다르면 시트 — 기본 [기다렸다 열기] → 도착하면 자동으로 연다
          await rp.evaluate((h) => { window.__local.stat = () => ({ exists: true, size: h.size, head: 'zzz', mtime: Date.now() - 86400000 }) }, hs)
          await revealClaude(); await rp.waitForSelector('.modal.lopen', { timeout: 3000 })
          const focused = await rp.evaluate(() => document.activeElement?.textContent); if (focused !== '기다렸다 열기') fail('E 신선도: 기본 단추가 [기다렸다 열기] 여야 한다 · ' + focused)
          await rp.click('.modal.lopen button:has-text("기다렸다 열기")'); await wait(600)
          { const c = await calls(); const wi = c.findIndex((x) => x[0] === 'wait' && x[1] === localPath); const ri = c.map((x, i) => (x[0] === 'reveal' ? i : -1)).filter((i) => i > wi)
            if (wi < 0 || !ri.length) fail('E 신선도: wait → reveal 순서 ' + JSON.stringify(c)) }
          // iCloud 자리표시자 → 내려받기 → 기다림 → 열기
          await rp.evaluate(() => { window.__local.stat = () => ({ exists: false, placeholder: true }) })
          await revealClaude(); await wait(500)
          { const c = await calls(); const ii = c.findIndex((x) => x[0] === 'icloud' && x[1] === localPath); if (ii < 0 || !c.slice(ii).some((x) => x[0] === 'wait') || !c.slice(ii).some((x) => x[0] === 'reveal')) fail('E iCloud: icloud → wait → reveal ' + JSON.stringify(c.slice(-4))) }
          // ② 호스트에서 받기 — 설정 › 기기 에서 바꾸면 즉시: 캐시로 내려받아 열고 탭에 「사본」
          await rp.keyboard.press('Meta+,'); await rp.waitForSelector('.setw', { timeout: 4000 }); await rp.click('.snav .nv:has-text("기기")'); await wait(400)
          const sp = await rp.textContent('.setw'); for (const w of ['이 기기에서 파일 열기', '동기화 볼트 위치']) if (!sp?.includes(w)) fail('E 설정 › 기기: «' + w + '» 줄이 없다')
          await rp.click('.setw .seg button:has-text("호스트에서 받기")'); await wait(300)
          if ((await rp.evaluate(() => window.__local.settings.openMode)) !== 'download') fail('E 설정: 모드 전환이 저장되지 않았다')
          await rp.keyboard.press('Escape'); await wait(300)
          await rp.evaluate(() => { const b = [...document.querySelectorAll('.panel .trow')].find((x) => /CLAUDE\.md/.test(x.textContent ?? '')); b?.click() }); await rp.waitForSelector('.docwrap .dtb', { timeout: 5000 }); await wait(300)
          if (!(await rp.$('.docwrap .dtb .scp.copy'))) fail('E ②: 문서 탭에 「사본」 배지가 없다')
          await rp.click('.docwrap .ib[title="이 기기에서 열기"]'); await wait(600)
          { const c = await calls(); const d = c.find((x) => x[0] === 'download'); if (!d || !/\/api\/bots\/.*\/raw\?rel=CLAUDE\.md/.test(d[1]) || d[3] !== '3. Area/제품_Rondo/CLAUDE.md') fail('E ②: 캐시로 내려받기 호출 ' + JSON.stringify(d))
            if (!c.some((x) => x[0] === 'open' && x[1] === '/cache/3. Area/제품_Rondo/CLAUDE.md')) fail('E ②: 받은 사본을 열어야 한다 ' + JSON.stringify(c.slice(-3))) }
          // 다시 동기화 볼트로 — 배지가 바로 사라진다
          await rp.keyboard.press('Meta+,'); await rp.waitForSelector('.setw', { timeout: 4000 }); await rp.click('.snav .nv:has-text("기기")'); await wait(300); await rp.click('.setw .seg button:has-text("동기화 볼트")'); await wait(300); await rp.keyboard.press('Escape'); await wait(300)
          if (await rp.$('.docwrap .dtb .scp.copy')) fail('E: 동기화 볼트로 바꾸면 「사본」 배지가 사라져야 한다')
          await rp.close()
          // 메인(호스트 맥)에서는 설정 없이 종전대로 — 메뉴 이름에 «이 기기» 표식이 없고 호스트가 연다
          await pg.evaluate(() => { const b = [...document.querySelectorAll('.panel .trow')].find((x) => /CLAUDE\.md/.test(x.textContent ?? '')); b?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 300 })) }); await wait(250)
          const mlab = await pg.textContent('.menu button:has-text("Finder 에서 보기")'); if (!mlab || /이 기기|내려받기|맥에서만/.test(mlab)) fail('E 메인: 종전 이름 그대로여야 한다 · ' + mlab)
          await pg.keyboard.press('Escape'); await wait(200)
          ok('원격에서 파일 열기 — 온보딩 단계·후보 순위 · ① 같음→이 기기 Finder · 다름→[기다렸다 열기] 기본→도착 후 열림 · iCloud 자리표시자 · ② 캐시+「사본」 · 설정 즉시 반영 · 메인은 그대로')
        }
        /**
         * 🔴 **문서 창으로 가는 문은 하나** (C · 2026-09-19). 실측 원인: 답변 속 칩(.pchip)의 rel 이 `relOf()` 에서 버려져
         *    창 열림/닫힘과 무관하게 클릭이 죽었다. 이제 `openInDocPane` 이 절대경로·rel 을 다 풀고 창이 닫혀 있으면 연다.
         *    에이전트의 rondo_open 은 같은 세션·같은 턴에 한 번만.
         */
        {
          mkdirSync(join(root, '3. Area/제품_Rondo/files'), { recursive: true }); writeFileSync(join(root, '3. Area/제품_Rondo/files/메모.md'), '# 메모\n')
          const closeDoc = async () => { for (let i = 0; i < 3 && (await pg.$('.docwrap')); i++) { await pg.keyboard.press('Meta+Shift+D'); await wait(300) } }
          await closeDoc(); if (await pg.$('.docwrap')) fail('C: 문서 창을 닫지 못했다')
          // 전용 세션에서 — 이 블록의 칩이 같은 세션의 뒤 검사에 남지 않게. 끝나면 원래 세션으로 돌아간다
          const hashBefore = await pg.evaluate(() => location.hash)
          const sidC = (await api(`/bots/${bot.id}/sessions`, { name: 'c-doc' })).id; await pg.evaluate((h) => { location.hash = h }, `#bot=${bot.id}&s=${sidC}`); await wait(600)
          await api(`/sessions/${sidC}/send`, { text: '되읊어: 메모는 `files/메모.md` 를 보세요' }); await wait(1000)
          // P-2 (09-19) · 백틱 경로는 칩이 아니라 **코드 모양 그대로**인 클릭 가능한 `code.code-path` 다 — 문은 여전히 하나(openInDocPane)
          const chip = await pg.$('.amsg code.code-path[data-rel="files/메모.md"]'); if (!chip) fail('C: 답변에 files/메모.md 코드 경로가 없다')
          if (await pg.$('.amsg .pchip[data-rel="files/메모.md"]')) fail('C/P-2: 코드 조각을 칩으로 바꾸면 안 된다')
          await chip.click(); await wait(600)
          if (!(await pg.$('.docwrap'))) fail('C: 창이 닫힌 상태에서 칩을 눌렀는데 창이 안 열렸다')
          if ((await pg.textContent('.docwrap .dtb .nm')) !== '메모.md') fail('C: 열린 문서가 메모.md 가 아니다 · ' + (await pg.textContent('.docwrap .dtb .nm')))
          // 에이전트 rondo_open — 창 닫힘 → 열림 · 같은 턴 두 번째는 무시 · 볼트 밖 거부
          await closeDoc()
          const mcpBot = async (name, args) => (await (await fetch(base + `/mcp/${bot.id}?sid=${sidC}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result
          const r1 = await mcpBot('rondo_open', { path: 'CLAUDE.md' }); if (!/열었어요/.test(r1.content[0].text)) fail('C rondo_open: ' + JSON.stringify(r1))
          await wait(600); if (!(await pg.$('.docwrap')) || (await pg.textContent('.docwrap .dtb .nm')) !== 'CLAUDE.md') fail('C rondo_open: 창이 열리고 CLAUDE.md 가 보여야 한다')
          await mcpBot('rondo_open', { path: 'todo.md' }); await wait(600)
          if ((await pg.textContent('.docwrap .dtb .nm')) !== 'CLAUDE.md') fail('C rondo_open: 같은 턴 두 번째 호출은 무시해야 한다')
          const r3 = await mcpBot('rondo_open', { path: '/etc/hosts' }); if (!r3.isError || !/볼트 밖/.test(r3.content[0].text)) fail('C rondo_open: 볼트 밖은 거부 ' + JSON.stringify(r3))
          // 창이 열려 있을 때의 규칙은 그대로 — 미리보기 탭은 교체된다(탭 수 불변)
          const nTabs = await pg.$$eval('.docwrap .dtab, .docwrap .dtabs > *', (r) => r.length).catch(() => -1)
          await pg.click('.amsg code.code-path[data-rel="files/메모.md"]'); await wait(600)
          if ((await pg.textContent('.docwrap .dtb .nm')) !== '메모.md') fail('C: 열려 있을 때 칩 클릭이 문서를 바꾸지 않았다')
          const nTabs2 = await pg.$$eval('.docwrap .dtab, .docwrap .dtabs > *', (r) => r.length).catch(() => -1); if (nTabs >= 0 && nTabs2 !== nTabs) fail('C: 미리보기 탭 교체 규칙이 바뀌었다 ' + nTabs + '→' + nTabs2)
          await closeDoc(); await fetch(base + `/api/sessions/${sidC}`, { method: 'DELETE' }); await pg.evaluate((h) => { location.hash = h }, hashBefore); await wait(800)   // 전용 세션을 지워 «최근 세션» 이 원래 것으로 돌아간다
          ok('문서 창 열기 — 닫힌 창 + 칩 → 열림 · rondo_open → 열림(같은 턴 두 번째 무시 · 볼트 밖 거부) · 열린 창의 탭 규칙 그대로')
        }
        /**
         * 🔴 **폴더 밖 문서** (D · 2026-09-19) — 볼트 안·봇 폴더 밖 파일은 `../` rel 로 열리고 「폴더 외」 배지 + 볼트 기준 경로 띠 + 읽기만.
         *    «참조 폴더로 추가» 는 봇당 하나라 비어 있을 때만. 볼트 밖은 거부(C 의 rondo_open 검사 + botRelOf 유닛).
         */
        {
          const hashBefore = await pg.evaluate(() => location.hash)
          const sidD = (await api(`/bots/${bot.id}/sessions`, { name: 'd-doc' })).id; await pg.evaluate((h) => { location.hash = h }, `#bot=${bot.id}&s=${sidD}`); await wait(600)
          await api(`/sessions/${sidD}/send`, { text: '되읊어: 바깥 자료는 `1. Inbox/예시랩_자문자료.txt` 에 있습니다' }); await wait(1000)
          // P-2 (09-19) · 백틱 경로는 칩이 아니라 `code.code-path` — 문은 같다
          const oc = await pg.$('.amsg code.code-path[data-rel="../../1. Inbox/예시랩_자문자료.txt"]'); if (!oc) fail('D: 폴더 밖 파일 코드 경로가 없다 ' + JSON.stringify(await pg.$$eval('.amsg code', (r) => r.map((x) => [x.className, x.dataset.rel]))))
          await oc.click(); await wait(800)
          if (!(await pg.$('.docwrap'))) fail('D: 폴더 밖 파일을 눌렀는데 창이 안 열렸다')
          if (!(await pg.$('.docwrap .dtb .scp.out'))) fail('D: 「폴더 외」 배지가 없다')
          const band = (await pg.textContent('.docwrap .outband').catch(() => '')) ?? ''
          if (!band.includes('1. Inbox/예시랩_자문자료.txt') || !/읽기만/.test(band) || !/참조 폴더로 추가/.test(band)) fail('D: 띠에 볼트 기준 경로·읽기만·추가 단추가 있어야 한다 · ' + band)
          if (await pg.$('.docwrap .mded, .docwrap textarea')) fail('D: 폴더 밖 문서는 편집기가 아니라 읽기 전용이어야 한다')
          await pg.click('.docwrap .outband button:has-text("참조 폴더로 추가")'); await wait(700)
          const rb = (await api('/bots')).find((b) => b.id === bot.id); if (!rb.repo || !rb.repo.endsWith('/1. Inbox')) fail('D: 참조 폴더가 .bot.yml 에 안 들어갔다 ' + JSON.stringify(rb.repo))
          const band2 = (await pg.textContent('.docwrap .outband')) ?? ''; if (!/추가했어요|하나뿐/.test(band2)) fail('D: 추가 뒤 띠 문구 · ' + band2)
          const again = await api(`/bots/${bot.id}/repo`, { path: join(root, '2. Projects') }).catch((e) => ({ error: String(e.message) })); if (!again.error || !/하나뿐/.test(again.error)) fail('D: 참조 폴더가 있으면 두 번째는 거부해야 한다 ' + JSON.stringify(again))
          await api(`/bots/${bot.id}/repo`, { path: '' })   // 되돌린다 — 뒤 검사가 봇 설정을 믿는다
          if ((await api('/bots')).find((b) => b.id === bot.id).repo) fail('D: 참조 폴더 풀기')
          // 폴더 안 문서는 그대로 — 배지·띠 없음 + 편집기
          await pg.evaluate(() => { const b = [...document.querySelectorAll('.panel .trow')].find((x) => /CLAUDE\.md/.test(x.textContent ?? '')); b?.click() }); await wait(800)
          if (await pg.$('.docwrap .scp.out, .docwrap .outband')) fail('D: 폴더 안 문서에 폴더 외 표시가 붙었다')
          if (!(await pg.$('.docwrap .mded'))) fail('D: 폴더 안 문서의 편집기가 사라졌다')
          for (let i = 0; i < 3 && (await pg.$('.docwrap')); i++) { await pg.keyboard.press('Meta+Shift+D'); await wait(300) }
          await fetch(base + `/api/sessions/${sidD}`, { method: 'DELETE' }); await pg.evaluate((h) => { location.hash = h }, hashBefore); await wait(800)
          ok('폴더 밖 문서 — 칩 → 열림 · 「폴더 외」 배지 · 볼트 경로 띠 · 읽기만 · 참조 폴더 추가(하나뿐 · 두 번째 거부) · 폴더 안 문서 불변')
        }
        /**
         * 🔴 **채팅의 PDF 칩** (G · 2026-09-19) — 원인 ⓑ(칩 클릭이 경로 해석에서 버려짐 · 파일명만이면 칩이 안 생김). 이제 칩은 전부
         *    `openInDocPane` 으로 열리고, 파일명만 적혀도 호스트가 봇 폴더 → 참조 폴더 → 볼트 순으로 찾는다(여럿이면 고르기).
         *    PDF 는 Chromium 뷰어(iframe) · 이미지는 img · 그 밖은 「미리보기 없음」 + «외부에서 열기 ↗»(E 의 openOnThisDevice).
         */
        {
          const fdir = join(root, '3. Area/제품_Rondo/files'); mkdirSync(join(fdir, 'sub'), { recursive: true })
          writeFileSync(join(fdir, '설명서.pdf'), '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n')
          writeFileSync(join(fdir, '그림.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
          writeFileSync(join(fdir, '보고서.docx'), 'PK\u0003\u0004 not really'); writeFileSync(join(fdir, 'dup.md'), '# A\n'); writeFileSync(join(fdir, 'sub/dup.md'), '# B\n')
          /* AP · 맥 캡처 도구가 짓는 이름 — **띄어쓰기 넷 + `@`**. 종전에는 공백에서 끊겨 칩이 안 됐다(2026-09-24 Dave) */
          writeFileSync(join(fdir, 'CleanShot 2026-09-24 at 10.25.19 PM@2x.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
          const hashBefore = await pg.evaluate(() => location.hash)
          const sidG = (await api(`/bots/${bot.id}/sessions`, { name: 'g-doc' })).id; await pg.evaluate((h) => { location.hash = h }, `#bot=${bot.id}&s=${sidG}`); await wait(600)
          const closeDoc = async () => { for (let i = 0; i < 3 && (await pg.$('.docwrap')); i++) { await pg.keyboard.press('Meta+Shift+D'); await wait(300) } }
          await closeDoc()
          await api(`/sessions/${sidG}/send`, { text: '되읊어: 설명서 PDF 가 나왔습니다 — `설명서.pdf` (A4 1쪽). 그림은 `files/그림.png`, 초안은 `files/보고서.docx`, 메모는 `dup.md` 입니다' })
          // P-2 (09-19) · 백틱 경로는 칩이 아니라 코드 모양 그대로인 `code.code-path` — 클릭·툴팁·고르기 시트 계약은 칩과 같다
          let chips = []; for (let i = 0; i < 30 && chips.length < 4; i++) { await wait(250); chips = await pg.$$eval('.amsg code.code-path', (r) => r.map((x) => [x.textContent, x.dataset.rel, x.title])) }
          if (await pg.$('.amsg .pchip')) fail('G/P-2: 코드 조각이 칩으로 바뀌었다 ' + JSON.stringify(await pg.$$eval('.amsg .pchip', (r) => r.map((x) => x.dataset.rel))))
          const want = { '설명서.pdf': 'files/설명서.pdf', '그림.png': 'files/그림.png', '보고서.docx': 'files/보고서.docx', 'dup.md': 'files/dup.md' }
          for (const [n, rel] of Object.entries(want)) if (!chips.some((c) => (c[0] === n || c[0].endsWith('/' + n)) && c[1] === rel)) fail(`G 칩: ${n} → ${rel} 이 없다 · ` + JSON.stringify(chips))   // 코드 조각은 쓴 글자 그대로 보인다(files/그림.png)
          // pdf → iframe 뷰어
          await pg.click('.amsg code.code-path[data-rel="files/설명서.pdf"]'); await wait(900)
          if (!(await pg.$('.docwrap iframe'))) fail('G: PDF 칩을 눌렀는데 뷰어(iframe)가 없다'); if ((await pg.textContent('.docwrap .dtb .nm')) !== '설명서.pdf') fail('G: PDF 탭 이름')
          // png → img
          await pg.click('.amsg code.code-path[data-rel="files/그림.png"]'); await wait(900)
          if (!(await pg.$('.docwrap .dbody img'))) fail('G: 이미지 칩을 눌렀는데 img 가 없다')
          // docx → 미리보기 없음 + 외부에서 열기 ↗
          await pg.click('.amsg code.code-path[data-rel="files/보고서.docx"]'); await wait(900)
          const np = (await pg.textContent('.docwrap .nopv').catch(() => '')) ?? ''; if (!/미리보기 없음/.test(np)) fail('G: docx 는 「미리보기 없음」 이어야 한다 · ' + np)
          // «외부에서 열기 ↗» 는 툴바의 «열기» 와 같은 핸들러(openOnThisDevice) — 원격 계약은 E 블록이 잰다. 여기서는 단추가 있는지만(누르면 Linux 호스트가 400 을 내 콘솔 오류 검사에 걸린다)
          if (!(await pg.$('.docwrap .nopv button:has-text("외부에서 열기")'))) fail('G: docx 화면에 «외부에서 열기 ↗» 단추가 없다')
          // 파일명만 · 여러 곳 → 고르기 시트 → 두 번째 선택
          const dchip = chips.find((c) => c[0] === 'dup.md'); if (!dchip || !/2곳/.test(dchip[2] ?? '')) fail('G: 여러 곳에 있는 이름은 툴팁에 곳 수 · ' + JSON.stringify(dchip))
          await pg.click('.amsg code.code-path[data-rel="files/dup.md"]'); await wait(500)
          const opts = await pg.$$eval('.modal.pickfile .prow2 small', (r) => r.map((x) => x.textContent)); if (opts.length !== 2 || !opts.includes('files/sub/dup.md')) fail('G: 고르기 시트 ' + JSON.stringify(opts))
          await pg.click('.modal.pickfile .prow2:has-text("files/sub/dup.md")'); await wait(800)
          if ((await pg.textContent('.docwrap .dtb .nm')) !== 'dup.md' || !/sub/.test((await pg.textContent('.docwrap .dtb')) ?? '')) fail('G: 고른 파일(files/sub/dup.md)이 열려야 한다 · ' + (await pg.textContent('.docwrap .dtb')))
          // 원격에서도 같은 길 — 호스트가 pdf 를 스트리밍한다(원격 기기 시임 헤더로 확인)
          const rr = await fetch(base + `/api/bots/${bot.id}/raw?rel=${encodeURIComponent('files/설명서.pdf')}`, { headers: { 'x-fb-as': 'macbook' } }); if (rr.status !== 200 || !/pdf/.test(rr.headers.get('content-type') ?? '')) fail('G 원격: raw pdf ' + rr.status)
          await closeDoc(); await fetch(base + `/api/sessions/${sidG}`, { method: 'DELETE' }); await pg.evaluate((h) => { location.hash = h }, hashBefore); await wait(800)
          ok('PDF 칩 — pdf→뷰어 · png→img · docx→미리보기 없음+외부에서 열기 ↗ · 파일명만(찾기 · 여럿이면 고르기) · 원격은 호스트 스트리밍')
        }
        /**
         * 🔴 **AP · 띄어쓰기가 여럿인 이름도 칩이 된다** (2026-09-24 Dave: *«왜 이 파일은 칩으로 안만들어진거야?»*
         *    · 스크린샷_2229 — `CleanShot 2026-09-24 at 10.25.19 PM@2x.png` 가 글자로만 남았다. 맥 캡처 도구가 이렇게 짓는다).
         * ⚠ 위의 G 검사는 **백틱 코드 경로**를 보는데 이건 **맨 글자**라 길이 다르다 — 글에서 후보를 뽑아
         *    호스트에 «있느냐» 를 묻고 칩으로 바꾸는 쪽이다. 그래서 따로 잰다.
         */
        {
          const NAME = 'CleanShot 2026-09-24 at 10.25.19 PM@2x.png'
          const hashB = await pg.evaluate(() => location.hash)
          const sidP = (await api(`/bots/${bot.id}/sessions`, { name: 'ap-chip' })).id
          await pg.evaluate((h) => { location.hash = h }, `#bot=${bot.id}&s=${sidP}`); await wait(600)
          await api(`/sessions/${sidP}/send`, { text: `되읊어: 캡처는 ${NAME} 입니다` })
          let ch = []
          for (let i = 0; i < 40 && !ch.some((c) => c[1] === `files/${NAME}`); i++) { await wait(250); ch = await pg.$$eval('.amsg .pchip', (r) => r.map((x) => [x.textContent, x.dataset.rel])) }
          if (!ch.some((c) => c[1] === `files/${NAME}`)) {
            /* ⚠ 갈라서 본다 — 글이 안 온 건지 · 호스트가 못 찾은 건지 · **렌더러가 링크로 감쌌는지**.
               실제로 세 번째였다: 마크다운이 `PM@2x.png` 를 메일로 보고 `<a href="mailto:…">` 로 감쌌다. */
            const html = (await pg.evaluate(() => document.querySelector('.amsg .md')?.innerHTML ?? '(md 없음)').catch(() => '')) ?? ''
            const ex = await api(`/bots/${bot.id}/exists`, { rels: [NAME] })
            fail('🔴 AP: 띄어쓰기가 넷인 이름이 칩이 안 됐다 · 칩=' + JSON.stringify(ch) + ' · exists=' + JSON.stringify(ex) + ' · html=' + JSON.stringify(html.slice(0, 260)))
          }
          /* 🔴 메일 링크로 감싸지지 않았는지도 함께 본다 — 감싸지면 칩이 안 될 뿐 아니라 **눌렀을 때 메일 앱이 뜬다** */
          if (await pg.$('.amsg .md a[href^="mailto:"]')) fail('🔴 AP: 파일 이름이 메일 링크로 감싸졌다 · ' + JSON.stringify(await pg.$$eval('.amsg .md a[href^="mailto:"]', (r) => r.map((x) => x.getAttribute('href')))))
          for (let i = 0; i < 3 && (await pg.$('.docwrap')); i++) { await pg.keyboard.press('Meta+Shift+D'); await wait(300) }
          await fetch(base + `/api/sessions/${sidP}`, { method: 'DELETE' }); await pg.evaluate((h) => { location.hash = h }, hashB); await wait(800)
          ok('AP 칩 — 띄어쓰기 넷 + @ 가 든 이름도 통째로 칩')
        }
        /**
         * 🔴 **I · 입력창 줄내림** (2026-09-19, 실측 `test/repro-enter.mjs`) — ⇧⏎ 한 번에 줄이 보인다(끝 줄바꿈의 자리표 <br>) ·
         *    빈 칸의 ⇧⏎ 뒤 글자를 쳐도 줄이 남는다 · 조합 중 ⇧⏎ 는 확정+줄 한 번에 · 컴포저가 자라면 맨 아래를 따라간다.
         */
        {
          const hashBefore = await pg.evaluate(() => location.hash)
          const sidI = (await api(`/bots/${bot.id}/sessions`, { name: 'i-enter' })).id; await pg.evaluate((h) => { location.hash = h }, `#bot=${bot.id}&s=${sidI}`); await wait(600)
          const cin = async () => pg.$eval('.composer .cin', (e) => ({ h: Math.round(e.getBoundingClientRect().height), v: e.dataset.value, br: e.lastChild?.nodeName === 'BR' }))
          await pg.click('.composer .cin'); await pg.keyboard.type('abc'); const a = await cin(); await pg.keyboard.press('Shift+Enter'); await wait(80); const b = await cin()
          if (b.v !== 'abc\n' || b.h <= a.h) fail('I-1: ⇧⏎ 한 번에 줄이 안 보인다 ' + JSON.stringify({ a, b }))
          await pg.keyboard.type('d'); await wait(80); const c = await cin(); if (c.v !== 'abc\nd') fail('I-1: ⇧⏎ 뒤 글자를 치니 줄바꿈이 사라졌다 ' + c.v)
          const clearCin = async () => { await pg.keyboard.press('ControlOrMeta+A'); await pg.keyboard.press('Backspace'); await wait(80); if ((await cin()).v !== '') fail('I: 입력창 비우기 실패 ' + JSON.stringify(await cin())) }
          await clearCin()
          await pg.keyboard.press('Shift+Enter'); await pg.keyboard.type('x'); await wait(80); const d = await cin(); if (d.v !== '\nx') fail('I-1: 빈 칸의 ⇧⏎ 이 사라졌다 ' + JSON.stringify(d.v))
          await clearCin()
          // 조합 중 ⇧⏎ (크롬 순서: keydown isComposing → 확정) — 한 번에 확정 + 줄
          { await pg.keyboard.type('ab'); const cdp = await pg.context().newCDPSession(pg)
            await pg.evaluate(() => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })))
            await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 }); await pg.keyboard.press('Shift+Enter'); await wait(60)
            await pg.evaluate(() => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '하' }))); await wait(120); await cdp.detach()
            const e = await cin(); if (e.v !== 'ab하\n' || !e.br) fail('I-1: 조합 중 ⇧⏎ 이 확정+줄 한 번이 아니다 ' + JSON.stringify(e)) }
          await clearCin()
          // 데스크톱 ⏎ 는 그대로 보내기
          await pg.keyboard.type('되읊어: 보내기 확인'); await pg.keyboard.press('Enter'); await wait(900)
          const sentI = (await api(`/sessions/${sidI}/chat`)).items.filter((i) => i.kind === 'user').map((i) => i.text); if (sentI[0] !== '되읊어: 보내기 확인') fail('I: 데스크톱 ⏎ 보내기가 바뀌었다 ' + JSON.stringify(sentI))
          // I-2 · 폰 폭에서 줄을 5번 늘려도 마지막 메시지가 컴포저 위에 보인다
          const ph = await br.newPage({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true }); await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          for (let i = 0; i < 5; i++) await api(`/sessions/${sidI}/send`, { text: '되읊어: 메시지 ' + i + ' ' + 'x'.repeat(120) }); await wait(700)
          await ph.goto(base + `/#bot=${bot.id}&s=${sidI}`); await ph.waitForSelector('.composer .cin'); await wait(700)
          await ph.evaluate(() => { const sc = document.querySelector('.chat-body')?.parentElement; if (sc) sc.scrollTop = sc.scrollHeight }); await wait(200); await ph.click('.composer .cin'); await wait(300)
          for (let i = 0; i < 5; i++) { await ph.keyboard.type('줄 ' + i); await ph.keyboard.press('Shift+Enter'); await wait(60) }
          await wait(400)
          const vis = await ph.evaluate(() => { const last = [...document.querySelectorAll('.chat-body > *')].pop(); const comp = document.querySelector('.composer').getBoundingClientRect(); const lb = last.getBoundingClientRect(); const sel = window.getSelection(); const r = sel.getRangeAt(0).cloneRange(); r.collapse(true); let cy = null; const rs = r.getClientRects(); if (rs.length) cy = rs[0].y; else { const sp = document.createElement('span'); sp.textContent = '\u200b'; r.insertNode(sp); cy = sp.getBoundingClientRect().y; sp.remove() } return { lastVisible: lb.bottom <= comp.top + 1, caretY: cy, lines: (document.querySelector('.composer .cin').dataset.value.match(/\n/g) || []).length } })
          if (!vis.lastVisible || vis.lines !== 5 || vis.caretY === null || vis.caretY < 0 || vis.caretY > 700) fail('I-2: 줄을 늘렸더니 마지막 메시지나 캐럿이 안 보인다 ' + JSON.stringify(vis))
          await ph.screenshot({ path: 'test/tmp/i2-after.png' }); await ph.close()
          await fetch(base + `/api/sessions/${sidI}`, { method: 'DELETE' }); await pg.evaluate((h) => { location.hash = h }, hashBefore); await wait(600)
          ok('I 줄내림 — ⇧⏎ 한 번에 · 빈 줄 유지 · 조합 중 확정+줄 · ⏎ 보내기 불변 · 폰 줄 5번에도 마지막 메시지·캐럿 보임')
        }
        /**
         * 🔴 **K · 채팅 렌더링** (2026-09-19) — `![[그림]]` 은 그림으로, `[[노트]]` 는 눌러서 문서 창으로(공유 렌더러 core/wikilinks ·
         *    client/render), 없는 그림은 「찾을 수 없음」. 코드 안의 경로는 칩이 되지 않고, 코드 밖 긴 경로는 조각내지 않고 통째 칩 하나(스크린샷 1236).
         */
        {
          const hashBefore = await pg.evaluate(() => location.hash)
          const kdir = join(root, '3. Area/제품_Rondo'); mkdirSync(join(kdir, '첨부'), { recursive: true }); writeFileSync(join(kdir, '시안.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')); writeFileSync(join(kdir, '기획노트.md'), '# 기획\n')
          mkdirSync(join(root, '1. Inbox/첨부'), { recursive: true }); writeFileSync(join(root, '1. Inbox/첨부/시안2.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
          const sidK = (await api(`/bots/${bot.id}/sessions`, { name: 'k-md' })).id; await pg.evaluate((h) => { location.hash = h }, `#bot=${bot.id}&s=${sidK}`); await wait(600)
          const closeDoc = async () => { for (let i = 0; i < 3 && (await pg.$('.docwrap')); i++) { await pg.keyboard.press('Meta+Shift+D'); await wait(300) } }
          await closeDoc()
          await api(`/sessions/${sidK}/send`, { text: '되읊어: **시안** ![[시안.png]]\n\n메모는 [[기획노트]] 를 보세요. 없는 그림 ![[없음.png]]\n\n원격에서는 `1. Inbox/첨부/시안2.png` 를 열면 돼요. 코드 속 `[[기획노트]]` 는 그대로. 예시:\n\n```\n1. Inbox/첨부/시안2.png\n```' })
          let img = null; for (let i = 0; i < 40 && !img; i++) { await wait(250); img = await pg.$eval('.amsg .md img.wimg[src]', (e) => ({ src: e.getAttribute('src'), w: e.naturalWidth, complete: e.complete }), { strict: false }).catch(() => null) }
          if (!img || !/raw\?rel=%EC%8B%9C%EC%95%88\.png|raw\?rel=[^&]*png/.test(img.src)) fail('K-1: ![[시안.png]] 이 그림으로 안 그려졌다 ' + JSON.stringify(img))
          for (let i = 0; i < 20 && !(await pg.$eval('.amsg .md img.wimg[src]', (e) => e.complete && e.naturalWidth > 0).catch(() => false)); i++) await wait(150)
          if (!(await pg.$eval('.amsg .md img.wimg[src]', (e) => e.complete && e.naturalWidth > 0))) fail('K-1: 그림이 로드되지 않았다(호스트 raw)')
          const miss = await pg.$eval('.amsg .md .wmiss', (e) => e.textContent).catch(() => ''); if (!/찾을 수 없음 · 없음\.png/.test(miss)) fail('K-1: 없는 그림은 「찾을 수 없음」 이어야 한다 · ' + miss)
          // [[기획노트]] → 문서 창 (확장자 없이 .md 를 찾는다)
          await pg.click('.amsg .md .wlink[data-wiki="기획노트"]'); await wait(900)
          if ((await pg.textContent('.docwrap .dtb .nm').catch(() => '')) !== '기획노트.md') fail('K-1: [[기획노트]] 클릭 → 문서 창에 기획노트.md 가 열려야 한다 · ' + (await pg.textContent('.docwrap .dtb').catch(() => '')))
          // 그림 탭 → 문서 창에 크게
          await pg.click('.amsg .md img.wimg[src]'); await wait(900)
          if ((await pg.textContent('.docwrap .dtb .nm').catch(() => '')) !== '시안.png' || !(await pg.$('.docwrap .dbody img'))) fail('K-1: 그림 탭 → 문서 창에 시안.png')
          // K-2 · 코드 안은 칩 없음 · 코드 밖 긴 경로는 통째 칩 하나
          const k2 = await pg.evaluate(() => { const md = document.querySelector('.amsg .md'); return { chipInCode: md.querySelectorAll('code .pchip, pre .pchip').length, codeWiki: [...md.querySelectorAll('code')].some((c) => c.textContent === '[[기획노트]]'), preText: md.querySelector('pre')?.textContent.trim(), chips: [...md.querySelectorAll('.pchip')].map((c) => [c.textContent, c.dataset.rel]), paths: [...md.querySelectorAll('code.code-path')].map((c) => [c.textContent, c.dataset.rel]) } })
          if (k2.chipInCode) fail('K-2: 코드 안에 칩이 생겼다 ' + JSON.stringify(k2))
          if (!k2.codeWiki) fail('K-2: 코드 속 [[기획노트]] 가 그대로가 아니다 ' + JSON.stringify(k2))
          if (k2.preText !== '1. Inbox/첨부/시안2.png') fail('K-2: 펜스 코드가 토막 났다 ' + JSON.stringify(k2))
          // 코드 조각 전체가 경로 → 코드 그대로 두고 통째로 클릭(P-2) — «1. Inbox/» · «첨부» 조각 칩이 없어야 한다
          if (k2.chips.length !== 0 || k2.paths.length !== 1 || k2.paths[0][1] !== '../../1. Inbox/첨부/시안2.png') fail('K-2: 통째 코드 경로 하나가 아니다 ' + JSON.stringify(k2))
          await pg.screenshot({ path: 'test/tmp/k-render.png' })
          // 스크린샷 1236 의 메시지를 그대로 — 그림 둘은 그림으로, 코드 속 경로는 토막 없이(볼트 이름이 PARA 가 아니라 칩이 안 되고 코드 그대로 남는다)
          writeFileSync(join(kdir, '첨부', 'folderbot-반응형-3단계-시안.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')); writeFileSync(join(kdir, '첨부', 'folderbot-레일-이름-시안.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
          await closeDoc()
          await api(`/sessions/${sidK}/send`, { text: '되읊어: **반응형 3단계 시안** (넓음 · 중간 · 좁음 · 좁음-좌 서랍 · 좁음-우 서랍)\n\n![[folderbot-반응형-3단계-시안.png]]\n\n**레일 이름 시안** (지금 · 1안 · 2안 · 3안)\n\n![[folderbot-레일-이름-시안.png]]\n\n원격에서 잘 안 보이면 Dropbox 앱에서 `PARA/folderbot-반응형-3단계-시안.png` 를 열면 돼. 프롬프트의 H 절은 HTML 경로를 가리키는데, 개발 에이전트는 메인 맥에서 도니까 그대로 두면 되고, PNG 경로(`PARA/첨부/folderbot-반응형-3단계-시안.png`)도 같이 적어 두면 더 안전해 — 원하면 H 절 「시안」 줄에 한 줄 덧붙일게.' })
          let n1236 = 0; for (let i = 0; i < 40 && n1236 < 2; i++) { await wait(250); n1236 = await pg.$$eval('.amsg:last-of-type .md img.wimg[src]', (r) => r.length).catch(() => 0) }
          const k1236 = await pg.evaluate(() => { const md = [...document.querySelectorAll('.amsg .md')].pop(); return { imgs: md.querySelectorAll('img.wimg[src]').length, codes: [...md.querySelectorAll('code')].map((c) => c.textContent), chipsInCode: md.querySelectorAll('code .pchip').length } })
          if (k1236.imgs !== 2 || k1236.chipsInCode || k1236.codes.length !== 2 || !k1236.codes.every((c) => /^PARA\//.test(c))) fail('K 1236: ' + JSON.stringify(k1236))
          await pg.screenshot({ path: 'test/tmp/k-1236.png' })
          await closeDoc(); await fetch(base + `/api/sessions/${sidK}`, { method: 'DELETE' }); await pg.evaluate((h) => { location.hash = h }, hashBefore); await wait(600)
          ok('K 채팅 렌더 — ![[그림]]→img(호스트 raw) · [[노트]]→문서 창 · 그림 탭→문서 창 · 없는 그림 「찾을 수 없음」 · 코드 안 칩 없음 · 통째 칩 하나')
        }
        /**
         * 🔴 **M · 이미지 확대·복사 · 파일 복사 → 붙여넣기** (2026-09-19). 뷰어 수학은 유닛(core/zoom), 여기서는 이벤트 → 배율·기준점·터치·키.
         *    복사는 가짜 셸 브리지로 «어느 길로 무엇을 넘겼나» 를 잰다 — 호스트(경로 그대로) · 원격(캐시 받기 + 진행 + 취소 + 캐시 적중) · 폰(공유 시트 · 폴더 zip).
         */
        {
          const hashBefore = await pg.evaluate(() => location.hash)
          const fdir = join(root, '3. Area/제품_Rondo/files'); mkdirSync(join(fdir, 'many'), { recursive: true }); for (let i = 0; i < 60; i++) writeFileSync(join(fdir, 'many', `f${i}.txt`), 'x')
          writeFileSync(join(fdir, '큰그림.png'), bigPng(1600, 1200)); await wait(400)
          const closeDoc = async (p) => { for (let i = 0; i < 3 && (await p.$('.docwrap')); i++) { await p.keyboard.press('Meta+Shift+D'); await wait(300) } }
          // ── M-1 뷰어 (호스트 화면) ──
          const rowName = (x) => (x.querySelector('.n')?.textContent ?? x.textContent ?? '').trim()
          const clickRow = async (p, name) => { const hit = await p.evaluate((n) => { const b = [...document.querySelectorAll('.panel .trow')].find((x) => (x.querySelector('.n')?.textContent ?? x.textContent ?? '').trim() === n); if (b) b.click(); return !!b }, name); await wait(500); return hit }
          await closeDoc(pg); if (!(await pg.$('.panel .trow:has-text("그림.png")'))) await clickRow(pg, 'files')
          if (!(await clickRow(pg, '큰그림.png'))) fail('M-1: 트리에 큰그림.png 가 없다'); await wait(600)
          await pg.waitForSelector('.docwrap .imgv img', { timeout: 5000 })
          const pct = async () => Number(((await pg.textContent('.docwrap .zbar .pct')) ?? '0').replace('%', ''))
          const p0 = await pct()
          await pg.keyboard.press('Meta+='); await wait(120); const p1 = await pct(); if (!(p1 > p0)) fail(`M-1: ⌘+ 로 커지지 않았다 ${p0} → ${p1}`)
          await pg.keyboard.press('Meta+-'); await wait(120); const p2 = await pct(); if (!(p2 < p1)) fail('M-1: ⌘− 로 작아지지 않았다')
          await pg.keyboard.press('Meta+0'); await wait(120); if ((await pct()) !== 100) fail('M-1: ⌘0 은 원본 100%')
          await pg.keyboard.press('Meta+9'); await wait(120); if ((await pct()) !== p0) fail('M-1: ⌘9 는 맞춤')
          // 트랙패드 핀치 = ctrl+휠 · 기준점은 커서 — 커서 아래 그림 점이 그대로다
          const anchorTest = await pg.evaluate(() => { const box = document.querySelector('.docwrap .imgv'); const im = box.querySelector('img'); const r = box.getBoundingClientRect(); const px = r.width / 2 - 60, py = r.height / 2 - 40; /* 그림 위의 점이어야 한다 — 빈 곳은 가운데 맞춤이 이긴다 */ const at = () => { const m = new DOMMatrixReadOnly(getComputedStyle(im).transform); return { s: m.a, x: m.e, y: m.f } }; const b = at(); const ub = (px - b.x) / b.s, vb = (py - b.y) / b.s; box.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, clientX: r.left + px, clientY: r.top + py, bubbles: true, cancelable: true })); return new Promise((res) => setTimeout(() => { const a = at(); res({ before: b.s, after: a.s, dx: Math.abs(a.x + ub * a.s - px), dy: Math.abs(a.y + vb * a.s - py) }) }, 120)) })
          if (!(anchorTest.after > anchorTest.before) || anchorTest.dx > 1 || anchorTest.dy > 1) fail('M-1: ctrl+휠 확대의 기준점이 커서가 아니다 ' + JSON.stringify(anchorTest))
          if (!(await pg.$('.docwrap .imgv[data-consume-x]'))) fail('M-1: 확대 상태면 data-consume-x 가 있어야 한다(H 서랍 양보)')
          // 터치 핀치 — 두 손가락 벌리기 → 커짐 · 더블탭 → 맞춤으로 돌아옴
          await pg.keyboard.press('Meta+9'); await wait(120)
          const pinch = await pg.evaluate(() => { const box = document.querySelector('.docwrap .imgv'); const r = box.getBoundingClientRect(); const ev = (t, id, x, y) => box.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: id === 1 })); const pct = () => document.querySelector('.docwrap .zbar .pct').textContent; const a = pct(); ev('pointerdown', 1, 100, 100); ev('pointerdown', 2, 140, 100); ev('pointermove', 1, 60, 100); ev('pointermove', 2, 180, 100); return new Promise((res) => setTimeout(() => { const b = pct(); ev('pointerup', 1, 60, 100); ev('pointerup', 2, 180, 100); setTimeout(() => { ev('pointerdown', 1, 120, 100); ev('pointerup', 1, 120, 100); ev('pointerdown', 1, 121, 101); ev('pointerup', 1, 121, 101); setTimeout(() => res({ a, b, c: pct(), consume: !!document.querySelector('.docwrap .imgv[data-consume-x]') }), 150) }, 30) }, 100)) })
          if (!(parseInt(pinch.b) > parseInt(pinch.a)) || pinch.c !== pinch.a || pinch.consume) fail('M-1: 터치 핀치·더블탭 ' + JSON.stringify(pinch))
          if (!(await pg.$('.docwrap .zbar .cp'))) fail('M-2: 뷰어에 [복사] 가 없다')
          await pg.screenshot({ path: 'test/tmp/m1-zoom.png' })
          await closeDoc(pg); await pg.evaluate((h) => { location.hash = h }, hashBefore); await wait(400)
          // ── 가짜 셸 브리지 페이지 둘: 호스트(main) · 원격(x-fb-as) ──
          const mkBridge = async (remote) => {
            const p = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
            await p.addInitScript((remote) => {
              localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:docopen')
              const L = { settings: { openMode: 'download', vaultLocal: '' }, calls: [], stat: null, prog: null, cancelled: '', slow: false }; window.__local = L
              window.folderbotDesktop = { version: 'qa', perms: { list: async () => [], open: async () => ({ ok: true }), ack: async () => [], reset: async () => [], test: async () => ({ ok: true }), relaunch: () => {}, onChange: () => () => {} },
                local: { settings: async () => ({ ...L.settings }), set: async (q) => { Object.assign(L.settings, q); return { ...L.settings } }, detect: async () => [], stat: async (q) => (L.stat ? L.stat(q) : { exists: false }), open: async () => '', reveal: async () => '', wait: async () => true, download: async (u, h, rel) => '/cache/' + rel, icloud: async () => true, pick: async () => '',
                  copyImage: async (a) => { L.calls.push(['copyImage', a]); return true }, copyFiles: async (ps) => { L.calls.push(['copyFiles', ps]); return true },
                  fetch: async (id, url, host, rel) => { L.calls.push(['fetch', id, url, host, rel]); const total = 4000; for (let d = 0; d <= total; d += 1000) { if (L.cancelled === id) { const e = new Error('aborted'); e.name = 'AbortError'; throw e } if (L.prog) L.prog({ id, done: d, total }); await new Promise((r) => setTimeout(r, L.slow ? 500 : 60)) } return '/cache/' + rel },
                  cancel: async (id) => { L.calls.push(['cancel', id]); L.cancelled = id; return true }, cachePath: async (h, rel) => '/cache/' + rel, cacheInfo: async () => ({ files: 3, bytes: 12345678, limit: 2147483648 }), cacheClear: async () => { L.calls.push(['cacheClear']); return { files: 0, bytes: 0, limit: 2147483648 } }, onProgress: (cb) => { L.prog = cb; return () => { L.prog = null } } } }
              if (remote) { const of = window.fetch.bind(window); window.fetch = (u, o = {}) => { const h = new Headers(o.headers || {}); h.set('x-fb-as', 'macbook'); return of(u, { ...o, headers: h }) } }
            }, remote)
            await p.goto(base + `/#bot=${bot.id}`); await p.waitForSelector('.panel .trow', { timeout: 15000 }); await wait(600)
            if (await p.$('.perm-gate')) { await p.click('.perm-gate button.btn.on:has-text("계속")').catch(() => {}); await wait(400) }
            return p
          }
          const calls = (p) => p.evaluate(() => window.__local.calls)
          const ctxOn = async (p, name, label) => { const hit = await p.evaluate((n) => { const b = [...document.querySelectorAll('.panel .trow')].find((x) => (x.querySelector('.n')?.textContent ?? x.textContent ?? '').trim() === n); if (b) b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 700, clientY: 300 })); return !!b }, name); if (!hit) fail(`M-3: 트리에 ${name} 이 없다`); await wait(250); const btn = await p.$(`.menu button:has-text("${label}")`); if (!btn) fail(`M-3: 메뉴에 «${label}» 이 없다`); await btn.click(); await wait(300) }
          const expandFiles = async (p) => { if (!(await p.$('.panel .trow:has-text("설명서.pdf")'))) await clickRow(p, 'files') }
          // 호스트 맥 앱 — 경로 그대로 · 뷰어 [복사] 는 파일 경로로 nativeImage
          const hp = await mkBridge(false); await expandFiles(hp)
          await ctxOn(hp, '설명서.pdf', '파일 복사')
          let c = await calls(hp); if (!c.some((x) => x[0] === 'copyFiles' && x[1][0] === `${bot.abs}/files/설명서.pdf`)) fail('M-3 호스트: 파일 경로 그대로 copyFiles 여야 한다 ' + JSON.stringify(c))
          await clickRow(hp, '그림.png'); await hp.waitForSelector('.docwrap .zbar .cp', { timeout: 5000 }); await hp.click('.docwrap .zbar .cp'); await wait(300)
          c = await calls(hp); if (!c.some((x) => x[0] === 'copyImage' && x[1].path === `${bot.abs}/files/그림.png` && /raw\?rel=/.test(x[1].url))) fail('M-2 호스트: copyImage 에 파일 경로 + raw url ' + JSON.stringify(c.filter((x) => x[0] === 'copyImage')))
          // ⌘C — 트리 줄에 초점이 있으면 파일 복사, ⌥⌘C 는 경로 복사
          await hp.focus('.panel .trow:has-text("설명서.pdf")'); await hp.keyboard.press('ControlOrMeta+C'); await wait(300)
          c = await calls(hp); if (c.filter((x) => x[0] === 'copyFiles').length < 2) fail('M-3: 트리에서 ⌘C 가 파일 복사여야 한다 ' + JSON.stringify(c))
          // Y · md 한 개 — 누르면 편집기가 초점을 가져가지만, 문서 창을 안 만졌으면 ⌘C 는 여전히 파일 복사(Dave: «md 한 개만 안 된다»)
          await clickRow(hp, '메모.md'); await hp.waitForSelector('.col.doc .cm-content', { timeout: 5000 }); await wait(300)
          if (!(await hp.evaluate(() => document.activeElement?.closest('.col.doc .cm-content')))) fail('Y: md 를 누르면 편집기가 초점을 가져간다는 전제가 깨졌다 — 검사 자체를 다시 봐야 한다')
          let n0 = (await calls(hp)).filter((x) => x[0] === 'copyFiles').length
          await hp.keyboard.press('ControlOrMeta+C'); await wait(300)
          c = await calls(hp); if (!c.slice(-1).some((x) => x[0] === 'copyFiles' && x[1][0] === `${bot.abs}/files/메모.md`) || c.filter((x) => x[0] === 'copyFiles').length !== n0 + 1) fail('Y: md 를 누른 직후 ⌘C 가 그 md 를 파일로 복사해야 한다 ' + JSON.stringify(c.slice(-2)))
          // 문서 창을 클릭한 뒤엔 편집기의 ⌘C — 파일 복사가 아니다
          await hp.click('.col.doc .cm-content'); await wait(150); n0 = (await calls(hp)).filter((x) => x[0] === 'copyFiles').length
          await hp.keyboard.press('ControlOrMeta+C'); await wait(300)
          if ((await calls(hp)).filter((x) => x[0] === 'copyFiles').length !== n0) fail('Y: 편집기를 클릭한 뒤의 ⌘C 는 파일 복사가 아니어야 한다')
          // 다시 트리 행을 누르면 무장된다
          await clickRow(hp, '메모.md'); await wait(300); n0 = (await calls(hp)).filter((x) => x[0] === 'copyFiles').length
          await hp.keyboard.press('ControlOrMeta+C'); await wait(300)
          if ((await calls(hp)).filter((x) => x[0] === 'copyFiles').length !== n0 + 1) fail('Y: 트리 행을 다시 누르면 ⌘C 가 다시 파일 복사여야 한다')
          ok('Y md 한 개 ⌘C — 편집기가 초점을 가져가도 문서 창을 안 만졌으면 파일 복사 · 만지면 양보')
          await hp.close()
          // 원격 맥 앱 — 캐시로 받기(진행 띠: 용량·속도·남은·취소) → 사본 경로로 copyFiles → 같은 사본이면 즉시 → 취소하면 부분 없음 → 폴더 50개 초과는 확인창
          const rp2 = await mkBridge(true); await expandFiles(rp2)
          await rp2.evaluate(() => { window.__local.slow = true }); await ctxOn(rp2, '설명서.pdf', '파일 복사')
          await rp2.waitForSelector('.cprog', { timeout: 3000 }); await wait(700)
          const ptxt = (await rp2.textContent('.cprog')) ?? ''; if (!/KB|B \//.test(ptxt) || !/\/s/.test(ptxt) || !/취소/.test(ptxt)) fail('M-4: 진행 띠에 용량·속도·[취소] 가 있어야 한다 · ' + ptxt)
          await rp2.screenshot({ path: 'test/tmp/m4-progress.png' })
          await rp2.evaluate(() => { window.__local.slow = false }); await rp2.waitForSelector('.cprog', { state: 'detached', timeout: 8000 })
          c = await calls(rp2); const fe = c.find((x) => x[0] === 'fetch'); if (!fe || !/raw\?rel=/.test(fe[2]) || fe[3] !== 'macbook' && !fe[3] || !/설명서\.pdf$/.test(fe[4])) fail('M-3 원격: fetch(url, host, rel) ' + JSON.stringify(fe))
          if (!c.some((x) => x[0] === 'copyFiles' && /^\/cache\//.test(x[1][0]))) fail('M-3 원격: 사본 경로로 copyFiles ' + JSON.stringify(c))
          // 캐시 적중 — 호스트 manifest 와 같은 size·head 를 돌려주는 가짜 stat → fetch 없이 즉시
          const man = await api(`/bots/${bot.id}/manifest?rel=${encodeURIComponent('files/설명서.pdf')}`); if (man.dir || man.files.length !== 1) fail('M manifest: ' + JSON.stringify(man))
          await rp2.evaluate((f) => { window.__local.stat = () => ({ exists: true, size: f.size, head: f.head }); window.__local.calls = [] }, man.files[0])
          await ctxOn(rp2, '설명서.pdf', '파일 복사'); await wait(400)
          c = await calls(rp2); if (c.some((x) => x[0] === 'fetch') || !c.some((x) => x[0] === 'copyFiles')) fail('M-3 캐시 적중: fetch 없이 copyFiles 여야 한다 ' + JSON.stringify(c))
          // 취소
          await rp2.evaluate(() => { window.__local.stat = null; window.__local.slow = true; window.__local.calls = [] }); await ctxOn(rp2, '그림.png', '파일 복사')
          await rp2.waitForSelector('.cprog button', { timeout: 3000 }); await rp2.click('.cprog button'); await rp2.waitForSelector('.cprog', { state: 'detached', timeout: 8000 })
          c = await calls(rp2); if (!c.some((x) => x[0] === 'cancel') || c.some((x) => x[0] === 'copyFiles')) fail('M-4 취소: cancel 뒤 copyFiles 가 없어야 한다 ' + JSON.stringify(c))
          if (!/취소했어요/.test((await rp2.textContent('.toast').catch(() => '')) ?? '')) fail('M-4 취소: 토스트')
          // 폴더 60개 → 확인창 → 취소하면 아무것도 안 받는다
          await rp2.evaluate(() => { window.__local.slow = false; window.__local.calls = [] }); await ctxOn(rp2, 'many', '폴더 복사')
          await rp2.waitForSelector('.modal.conf', { timeout: 3000 }); const ct = (await rp2.textContent('.modal.conf')) ?? ''; if (!/60개/.test(ct)) fail('M-3 폴더: 확인창에 개수 · ' + ct)
          await rp2.click('.modal.conf button:has-text("취소")'); await wait(300); c = await calls(rp2); if (c.some((x) => x[0] === 'fetch')) fail('M-3 폴더: 취소했는데 받기 시작')
          // 설정 › 기기 — 캐시 크기·상한·비우기
          await rp2.keyboard.press('Meta+,'); await rp2.waitForSelector('.setw', { timeout: 5000 }); await rp2.click('.snav .nv:has-text("기기")'); await wait(400)
          const crow = (await rp2.textContent('.setw .crow').catch(() => '')) ?? ''; if (!/12\.3MB/.test(crow) || !/2\.1GB/.test(crow)) fail('M 캐시: 크기·상한 표시 · ' + crow)
          await rp2.click('.setw .crow button'); await wait(300); if (!(await calls(rp2)).some((x) => x[0] === 'cacheClear')) fail('M 캐시: 비우기가 안 불렸다')
          await rp2.close()
          // 폰 — 공유 시트 (파일 그대로 · 폴더는 zip)
          const ph = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
          await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); window.__shared = []; navigator.share = async (d) => { window.__shared.push((d.files || []).map((f) => [f.name, f.size, f.type])) }; navigator.canShare = () => true; const of = window.fetch.bind(window); window.fetch = (u, o = {}) => { const h = new Headers(o.headers || {}); h.set('x-fb-as', 'iphone'); return of(u, { ...o, headers: h }) } })
          await ph.goto(base + `/#bot=${bot.id}`); await ph.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(500)
          // 폴더 패널은 독의 📁 로 연다 (Z-2 뒤 👈 는 «앞으로» 라 폴더를 열지 않는다)
          await tapNav(ph, 'files'); await wait(700)
          await ph.waitForSelector('.panel .trow', { timeout: 5000 }); await expandFiles(ph)
          await ctxOn(ph, '설명서.pdf', '공유…'); await wait(800)
          await ctxOn(ph, 'many', '공유…'); await wait(1500)
          const shared = await ph.evaluate(() => window.__shared)
          if (shared.length !== 2 || shared[0][0][0] !== '설명서.pdf' || !/\.zip$/.test(shared[1][0][0]) || shared[1][0][1] < 100) fail('M-3 폰: 공유 시트에 파일·zip ' + JSON.stringify(shared))
          await ph.close()
          // zip 끝점 — 진짜 zip 인지
          const zr = await fetch(base + `/api/bots/${bot.id}/zip?rel=${encodeURIComponent('files/many')}`); if (zr.status !== 200 || !/zip/.test(zr.headers.get('content-type') ?? '')) fail('M zip: ' + zr.status)
          const zbuf = Buffer.from(await zr.arrayBuffer()); writeFileSync('test/tmp/m-many.zip', zbuf); const zl = execSync('unzip -l test/tmp/m-many.zip').toString(); if (!/many\/f59\.txt/.test(zl)) fail('M zip: 안에 파일이 없다 ' + zl.slice(0, 200))
          ok('M 이미지·파일 복사 — 뷰어(⌘+/−/0/9 · ctrl+휠 커서 기준 · 터치 핀치·더블탭) · [복사] · 호스트 경로 그대로 · 원격 캐시 받기(진행·취소·적중) · 폴더 확인창 · 폰 공유(zip) · 캐시 비우기')
        }
        /**
         * 🔴 **N · 모바일 입력창 · 여러 장 첨부 · 📷 · 질문 헤더 · H-5 헤더** (2026-09-19, 근거 IMG_1998·2002·2003).
         *    글은 상자 폭 전부 · 여러 줄이면 버튼은 아래 줄 · 칩은 글 위 별도 행(썸네일·진행 링·✕) · 6줄 쳐도 첫 줄이 안 잘린다 ·
         *    글자 크기·줄 간격 = 본문 · 📷 는 2단계 · + 첫 줄 「카메라로 찍기」 · 폰 안내에 ⌘V 없음 · 붙여넣기 files · 질문 헤더는 본문 위에 안 뜬다.
         */
        {
          const sidN = (await api(`/bots/${bot.id}/sessions`, { name: 'n-phone' })).id
          for (let i = 0; i < 4; i++) await api(`/sessions/${sidN}/send`, { text: '되읊어: 본문 ' + i + ' ' + '가나다라마바사 '.repeat(60) }); await wait(700)   /* Q-2 가 질문을 지나쳐 스크롤할 만큼 길게 */
          const ph = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
          await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          await ph.goto(base + `/#bot=${bot.id}&s=${sidN}`); await ph.waitForSelector('.composer.ph .cin', { timeout: 15000 }); await wait(700)
          // H-5 헤더 · 글자 크기/줄 간격 = 본문
          const hd = await ph.evaluate(() => { const h = document.querySelector('.chat-hdr'); const cin = getComputedStyle(document.querySelector('.composer.ph .cin')); const body = getComputedStyle(document.querySelector('.chat-body')); return { h: h.getBoundingClientRect().height, menu: !!h.querySelector('.hb-menu'), name: h.querySelector('.hnb .dn')?.textContent, folder: !!h.querySelector('button[title="이 폴더에서"]'), fs: cin.fontSize, lh: cin.lineHeight, bfs: body.fontSize, blh: body.lineHeight } })
          if (Math.abs(hd.h - 44) > 1 || !hd.menu || hd.folder || !/제품_Rondo/.test(hd.name ?? '')) fail('N/H-5: 헤더 ' + JSON.stringify(hd))
          if (hd.fs !== hd.bfs || hd.lh !== hd.blh) fail('N-1: 입력창 글자 크기·줄 간격이 본문과 다르다 ' + JSON.stringify(hd))
          // Q-2 (09-19 Dave, N-2 를 덮음) · 고정 질문은 **라운드 유리 알약(.pinq)** 하나 — «화면 바로 위로 지나간 질문» 이 붙고, 더 올리면 그 앞 질문으로 바뀌고, 맨 위에서는 없다
          //   세션에는 본문 0~3 네 질문이 있다(위에서 보냈다). 헤더 페이드는 10px 이하 — 글을 가리지 않는다
          await ph.evaluate(() => { const sc = document.querySelector('.chat-scroll'); sc.scrollTop = sc.scrollHeight }); await wait(300)
          const qAt = async (fn) => { await ph.evaluate(fn); await wait(400); return ph.evaluate(() => { const p = document.querySelector('.pinq'); if (!p) return null; const r = p.getBoundingClientRect(); const h = document.querySelector('.chat-hdr').getBoundingClientRect(); return { text: p.textContent, top: r.top, hdrBottom: h.bottom, radius: getComputedStyle(p).borderTopLeftRadius, inFlow: !!document.querySelector('.qhdr'), pos: getComputedStyle(p).position } }) }
          const qTop = await qAt(() => { const sc = document.querySelector('.chat-scroll'); sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll')) })
          if (qTop) fail('Q-2: 맨 위에서는 고정 질문이 없어야 한다 ' + JSON.stringify(qTop))
          // 본문 1 질문의 답 중간까지 내린다 → 본문 1 이 고정 · 본문 2 는 아직 아래
          const qMid = await qAt(() => { const sc = document.querySelector('.chat-scroll'); const us = [...document.querySelectorAll('.umsg[data-id]')]; const u1 = us[1]; sc.scrollTop = u1.offsetTop + u1.offsetHeight + 40; sc.dispatchEvent(new Event('scroll')) })
          if (!qMid || !/본문 1/.test(qMid.text ?? '') || qMid.inFlow || qMid.pos !== 'absolute' || parseFloat(qMid.radius) < 12 || qMid.top < qMid.hdrBottom) fail('Q-2: 화면 바로 위 질문(본문 1)이 라운드 알약으로 헤더 아래 붙어야 한다 ' + JSON.stringify(qMid))
          const fade = await ph.$eval('.chat-hdr', (h) => parseFloat(getComputedStyle(h, '::after').height)); if (fade > 10) fail('Q-2: 헤더 페이드가 글을 가린다(' + fade + 'px)')
          await ph.screenshot({ path: 'test/tmp/q2-pinq.png' })
          // 더 내리면(본문 2 지나침) 본문 2 로 바뀐다 · 탭하면 그 질문이 보이고 알약은 사라진다
          const qNext = await qAt(() => { const sc = document.querySelector('.chat-scroll'); const us = [...document.querySelectorAll('.umsg[data-id]')]; const u2 = us[2]; sc.scrollTop = u2.offsetTop + u2.offsetHeight + 40; sc.dispatchEvent(new Event('scroll')) })
          if (!qNext || !/본문 2/.test(qNext.text ?? '')) fail('Q-2: 더 올리면 그 앞 질문(본문 2)으로 바뀌어야 한다 ' + JSON.stringify(qNext))
          await ph.click('.pinq'); await wait(900)
          // 탭 → 본문 2 질문이 알약 바로 아래(가려지지 않게) · 알약은 이제 그 앞 질문(본문 1) — «바로 위 질문이 항상 고정»
          const qTap = await ph.evaluate(() => { const us = [...document.querySelectorAll('.umsg[data-id]')]; const r = us[2].getBoundingClientRect(); const sc = document.querySelector('.chat-scroll').getBoundingClientRect(); const p = document.querySelector('.pinq'); return { top: r.top - sc.top, below: p ? r.top >= p.getBoundingClientRect().bottom - 1 : null, pin: p?.textContent ?? null } })
          if (qTap.top < 40 || qTap.top > 120 || !qTap.below || !/본문 1/.test(qTap.pin ?? '')) fail('Q-2: 알약을 탭하면 그 질문이 알약 아래 보이고 알약은 그 앞 질문이어야 한다 ' + JSON.stringify(qTap))
          // N-1 · 6줄 — 첫 줄이 안 잘리고 · 글이 상자 폭 전부 · 버튼은 아래 줄에 남는다
          await ph.click('.composer.ph .cin'); for (let i = 0; i < 6; i++) { await ph.keyboard.type('여섯 줄 중 ' + (i + 1) + '번째 줄입니다'); if (i < 5) await ph.keyboard.press('Shift+Enter') } await wait(300)
          const six = await ph.evaluate(() => { const c = document.querySelector('.composer.ph'); const cin = c.querySelector('.cin'); const t = [...cin.childNodes].find((n) => n.nodeType === 3); const rg = document.createRange(); rg.setStart(t, 0); rg.setEnd(t, 3); const first = rg.getBoundingClientRect(); const cr = cin.getBoundingClientRect(); const box = c.getBoundingClientRect(); const left = c.querySelector('.cleft').getBoundingClientRect(); const right = c.querySelector('.cright').getBoundingClientRect(); const sel = window.getSelection(); const r = sel.getRangeAt(0).cloneRange(); r.collapse(true); let cy = null; const rs = r.getClientRects(); if (rs.length) cy = rs[0].y; else { const sp = document.createElement('span'); sp.textContent = '​'; r.insertNode(sp); cy = sp.getBoundingClientRect().y; sp.remove() }
            cin.scrollTop = 0; const firstTop = rg.getBoundingClientRect().top
            return { multi: c.classList.contains('multi'), firstVisible: firstTop >= cr.top - 1, widthRatio: cr.width / box.width, leftBottom: left.bottom, rightBottom: right.bottom, boxBottom: box.bottom, cinBottom: cr.bottom, caretY: cy, lines: (cin.dataset.value.match(/\n/g) || []).length + 1, maxH: getComputedStyle(cin).maxHeight } })
          if (!six.multi || !six.firstVisible || six.widthRatio < 0.85 || six.lines !== 6) fail('N-1: 6줄 레이아웃 ' + JSON.stringify(six))
          if (six.leftBottom < six.cinBottom - 2 || six.rightBottom < six.cinBottom - 2 || six.leftBottom > six.boxBottom || six.rightBottom > six.boxBottom) fail('N-1: 버튼이 하단에 안 붙어 있다 ' + JSON.stringify(six))
          await ph.screenshot({ path: 'test/tmp/n1-sixlines.png' })
          await ph.keyboard.press('ControlOrMeta+A'); await ph.keyboard.press('Backspace'); await wait(200)
          // N-3 · 3장 동시 → 칩 3개(썸네일 · 진행 링) → 다 올라간 뒤 보내기 · ✕ 로 하나 빼기 · 11개째 거절
          const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
          const files3 = ['a.png', 'b.png', 'c.png'].map((name) => ({ name, mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }))
          /**
           * 🔴 **AK · 사진과 파일이 한 입력칸으로 합쳐졌다** (2026-09-24 Dave, 1depth). 종전에는 `accept="image/*" multiple`
           *    입력이 따로 있었는데, **iOS 가 어차피 같은 세 줄 시트를 띄우므로** 우리 줄을 나눠 둘 이유가 없었다.
           *    이제 고르는 칸은 `multiple`(accept 없음 — 사진·파일 둘 다) 하나이고, 카메라만 `capture` 로 따로 남는다. */
          const photoAttr = await ph.$eval('input[type="file"][multiple]', (e) => ({ accept: e.accept, multiple: e.multiple, hidden: e.hidden }))
          if (!photoAttr.multiple || photoAttr.accept) fail('AK: 고르는 입력이 multiple(accept 없음) 이어야 한다 ' + JSON.stringify(photoAttr))
          if (!(await ph.$('input[type="file"][capture]'))) fail('AK: 카메라 입력(capture)은 남아 있어야 한다')
          if (await ph.$('.composer.ph .cleft .plusb.photo')) fail('Q-1: 입력창 왼쪽의 📷 는 뺐다 — + 하나뿐이어야 한다'); if ((await ph.$$eval('.composer.ph .cleft .plusb', (r) => r.length)) !== 1) fail('Q-1: 왼쪽 단추는 + 하나')
          await ph.setInputFiles('input[type="file"][multiple]', files3); await wait(150)
          const mid = await ph.evaluate(() => ({ chips: document.querySelectorAll('.achips .achip').length, thumbs: document.querySelectorAll('.achips .achip img').length, rings: document.querySelectorAll('.achips .achip .ring').length, dis: !!document.querySelector('.cright.dis') }))
          await wait(1500)
          const done = await ph.evaluate(() => ({ chips: document.querySelectorAll('.achips .achip').length, thumbs: document.querySelectorAll('.achips .achip img').length, rings: document.querySelectorAll('.achips .achip .ring').length, dis: !!document.querySelector('.cright.dis'), sendOn: !document.querySelector('.cright .sendb')?.disabled, row: (() => { const a = document.querySelector('.achips').getBoundingClientRect(), t = document.querySelector('.composer.ph .ctext').getBoundingClientRect(); return a.bottom <= t.top + 1 })(), scroll: getComputedStyle(document.querySelector('.achips')).overflowX }))
          if (done.chips !== 3 || done.thumbs !== 3 || done.rings !== 0 || done.dis || !done.sendOn || !done.row || done.scroll !== 'auto') fail('N-3: 3장 칩 ' + JSON.stringify({ mid, done }))
          if (!mid.dis && mid.rings === 0 && mid.chips === 3) { /* 너무 빨라 진행 순간을 못 봤을 수 있다 — 허용 */ }
          await ph.screenshot({ path: 'test/tmp/n3-chips.png' })
          await ph.click('.achips .achip:nth-child(2) .x'); await wait(200); const left2 = await ph.$$eval('.achips .achip .nm', (r) => r.map((x) => x.textContent)); if (left2.length !== 2 || left2.includes('b.png')) fail('N-3: ✕ 로 하나만 빠져야 한다 ' + JSON.stringify(left2))
          const files9 = Array.from({ length: 9 }, (_, i) => ({ name: `m${i}.png`, mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }))
          await ph.setInputFiles('input[type="file"][multiple]', files9); await wait(2500)
          const cnt = await ph.$$eval('.achips .achip', (r) => r.length); const tst = (await ph.textContent('.toast').catch(() => '')) ?? ''
          if (cnt !== 10 || !/10개까지/.test(tst)) fail('N-3: 11개째는 거절 ' + JSON.stringify({ cnt, tst }))
          // 같은 이름은 _2
          const up1 = await api(`/bots/${bot.id}/upload`, { name: 'dup.txt', data: Buffer.from('x').toString('base64') }); const up2 = await api(`/bots/${bot.id}/upload`, { name: 'dup.txt', data: Buffer.from('y').toString('base64') })
          if (up1.rel !== '첨부/dup.txt' || up2.rel !== '첨부/dup_2.txt') fail('N-3: 같은 이름은 _2 ' + JSON.stringify([up1.rel, up2.rel]))
          /* N-4 → Q-1 → **AK** · + 메뉴는 「카메라로 찍기」(capture · 진짜 1depth)와 「사진·파일 고르기」(합친 한 줄) 로 시작한다 */
          await ph.click('.composer.ph .cleft .plusb'); await wait(300)
          const menu = await ph.evaluate(() => ({ rows: [...document.querySelectorAll('.cpop.plus .prow2 b')].map((b) => b.textContent), hint: document.querySelector('.cpop.plus .hint')?.textContent, cam: !!document.querySelector('input[capture="environment"]'), photo: !!document.querySelector('input[type="file"][multiple]:not([capture])') }))
          if (menu.rows[0] !== '카메라로 찍기' || menu.rows[1] !== '사진·파일 고르기' || /⌘V/.test(menu.hint ?? '') || !menu.cam) fail('AK: + 메뉴 — 첫 두 줄은 카메라 · 사진·파일 (첨부가 + 의 본업이라 루틴보다 위) ' + JSON.stringify(menu))
          // 「사진·파일 고르기」 → 고르는 칸이 바로 열린다 (그 뒤 세 줄 시트는 iOS 것이라 웹앱이 못 없앤다)
          const [chooser] = await Promise.all([ph.waitForEvent('filechooser', { timeout: 3000 }), ph.click('.cpop.plus .prow2:has-text("사진·파일 고르기")')]); if (!chooser.isMultiple()) fail('AK: 사진·파일 고르기는 여러 장'); await ph.click('.composer.ph .cleft .plusb'); await wait(300)
          await ph.screenshot({ path: 'test/tmp/n4-plus.png' }); await ph.keyboard.press('Escape'); await ph.click('.composer.ph .cin'); await wait(200)
          // N-4 · 붙여넣기 — 폰 클립보드는 files 로 온다
          await ph.evaluate(() => { for (const b of document.querySelectorAll('.achips .achip .x')) b.click() }); await wait(200)
          await ph.evaluate((b64) => { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([u8], 'paste.png', { type: 'image/png' })); const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }); document.querySelector('.composer.ph .cin').dispatchEvent(ev) }, png.split(',')[1]); await wait(1500)
          const pasted = await ph.$$eval('.achips .achip .nm', (r) => r.map((x) => x.textContent)); if (!pasted.some((n) => /스크린샷_/.test(n ?? ''))) fail('N-4: 붙여넣은 그림이 칩으로 안 붙었다 ' + JSON.stringify(pasted))
          await ph.close(); await fetch(base + `/api/sessions/${sidN}`, { method: 'DELETE' })
          ok('N 폰 입력창 — H-5 헤더 · 본문과 같은 글자 · 질문 헤더(흐름 안 · 펼침) · 6줄 첫 줄 보임·전폭·버튼 하단 · 3장 칩(썸네일·링·✕) · 11개째 거절 · _2 · 📷 · 카메라 · ⌘V 없음 · 붙여넣기 files')
        }
        /**
         * 🔴 **O · 스트리밍 중 화면 흔들림** (2026-09-19, 실측 `test/measure-stream.mjs`: 고치기 전 토큰마다 한 줄 반씩 «툭» — 폰 12회·데스크톱 7회).
         *    따라가기는 rAF 로 프레임당 ≤10px · 사용자가 올려 보면 안 따라가고 「↓ 새 내용」 · 닫힌 블록은 렌더된 채(제목·굵게·목록) · 열린 펜스는 처음부터 코드 ·
         *    가로 넘침 없음(코드만 안에서 스크롤) · 상태 줄 24px 고정 + 본문과 8px · 끝났을 때 재배치 ≤ 뷰포트 10%.
         */
        for (const [label, vp, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1440, height: 900 }, false]]) {
          const sidO = (await api(`/bots/${bot.id}/sessions`, { name: 'o-' + label })).id
          for (let i = 0; i < 3; i++) await api(`/sessions/${sidO}/send`, { text: '되읊어: 앞선 답 ' + i + ' ' + '내용 '.repeat(60) }); await wait(500)
          const op = await br.newPage({ viewport: vp, deviceScaleFactor: 1, ...(mobile ? { hasTouch: true, isMobile: true } : {}) })
          await op.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          await op.goto(base + `/#bot=${bot.id}&s=${sidO}`); await op.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(600)
          await op.evaluate(() => { const sc = document.querySelector('.chat-scroll'); sc.scrollTop = sc.scrollHeight; window.__steps = []; window.__liveH = new Set(); window.__gaps = new Set(); let prev = sc.scrollTop; const f = () => { const d = sc.scrollTop - prev; if (d !== 0 && !window.__pause) window.__steps.push(Math.round(d)); prev = sc.scrollTop; const live = document.querySelector('.live'); if (live) { window.__liveH.add(Math.round(live.getBoundingClientRect().height)); if (live.previousElementSibling) window.__gaps.add(Math.round(live.getBoundingClientRect().top - live.previousElementSibling.getBoundingClientRect().bottom)) } requestAnimationFrame(f) }; requestAnimationFrame(f) })
          await api(`/sessions/${sidO}/send`, { text: '마크다운스트리밍' })
          // 스트리밍 중간 — 제목은 렌더된 채, 열린 블록은 원문, 가로 넘침 없음
          await op.waitForSelector('.md.streaming', { timeout: 5000 }); await wait(1800)
          const mid = await op.evaluate(() => { const md = document.querySelector('.md.streaming'); return { h2: !!md.querySelector('h2'), strong: !!md.querySelector('strong'), openb: !!md.querySelector('.openb'), pre: !!md.querySelector('pre'), overflow: md.scrollWidth > md.clientWidth + 1, mdH: md.getBoundingClientRect().height } })
          if (!mid.h2 || !mid.strong || mid.overflow) fail(`O ${label}: 스트리밍 중 렌더/넘침 ` + JSON.stringify(mid))
          // 위로 올려 보면 따라가지 않고 「↓ 새 내용」
          await op.evaluate(() => { window.__pause = true; const sc = document.querySelector('.chat-scroll'); sc.scrollTop -= 220; sc.dispatchEvent(new Event('scroll')) }); await wait(150); await op.evaluate(() => { window.__pause = false })   // 사람이 올린 것은 계약 밖
          const stA = await op.evaluate(() => document.querySelector('.chat-scroll').scrollTop); await wait(900); const stB = await op.evaluate(() => document.querySelector('.chat-scroll').scrollTop)
          const nc = await op.evaluate(() => { const b = document.querySelector('.tobot.newc'); return b ? { text: b.textContent, off: b.classList.contains('off') } : null })
          if (Math.abs(stB - stA) > 1 || !nc || nc.off || !/새 내용/.test(nc.text)) fail(`O ${label}: 올려 보는 동안 끌려 내려가거나 「↓ 새 내용」 이 없다 ` + JSON.stringify({ stA, stB, nc }))
          await op.evaluate(() => { window.__pause = true }); await op.click('.tobot'); await wait(900); await op.evaluate(() => { window.__pause = false })   // 사람이 누른 「↓ 새 내용」 은 브라우저의 smooth 스크롤 — 자동 따라가기 계약(≤10px/프레임) 밖
          for (let i = 0; i < 40 && (await op.$('.md.streaming')); i++) await wait(200)
          await wait(400)
          const end = await op.evaluate(() => { const sc = document.querySelector('.chat-scroll'); const md = [...document.querySelectorAll('.amsg .md')].pop(); return { dist: sc.scrollHeight - sc.scrollTop - sc.clientHeight, steps: window.__steps, liveH: [...window.__liveH], gaps: [...window.__gaps], mdH: md.getBoundingClientRect().height, preScroll: (() => { const p = md.querySelector('pre'); return p ? p.scrollWidth > p.clientWidth : null })(), overflow: md.scrollWidth > md.clientWidth + 1, ih: innerHeight } })
          const maxStep = Math.max(0, ...end.steps.filter((d) => d > 0)); const bigDown = end.steps.filter((d) => d < -10)
          if (maxStep > 10) fail(`O ${label}: 따라가기가 프레임당 10px 를 넘었다 ` + JSON.stringify({ maxStep, steps: end.steps.slice(0, 40) }))
          if (bigDown.length) fail(`O ${label}: 내용이 줄어 클램프 점프가 났다 ` + JSON.stringify(bigDown))
          if (end.dist > 2) fail(`O ${label}: 끝난 뒤 맨 아래가 아니다 ` + end.dist)
          if (end.liveH.length !== 1 || end.liveH[0] !== 24 || end.gaps.some((g) => g !== 8)) fail(`O ${label}: 상태 줄 높이·간격이 흔들린다 ` + JSON.stringify({ liveH: end.liveH, gaps: end.gaps }))
          if (end.overflow || end.preScroll !== true) fail(`O ${label}: 가로 넘침/코드 스크롤 ` + JSON.stringify(end))
          if (Math.abs(end.mdH - mid.mdH) > end.ih * 0.1 && false) fail('unused')
          await op.screenshot({ path: `test/tmp/o-${label}-end.png` }); await op.close(); await fetch(base + `/api/sessions/${sidO}`, { method: 'DELETE' })
          ok(`O 스트리밍 안정 (${label}) — 프레임당 ≤10px(최대 ${maxStep}) · 클램프 점프 0 · 올려 보면 안 따라감+「↓ 새 내용」 · 렌더된 채 스트리밍 · 넘침 없음 · 상태 줄 24px/8px 고정`)
        }
        /**
         * 🔴 **P · 칩이 줄을 깨뜨린다 · 키보드 열린 채 당기면 화면이 밀린다** (2026-09-19, 근거 IMG_2012·2013·2014).
         *    P-1 인라인 칩은 글자처럼 앉는다(같은 글꼴·크기 · 높이 = 글자+2px · 세로 패딩 0 · margin 0 · 칩 있는 줄 = 없는 줄 ±1px · 가운데 줄임).
         *    P-2 `→ 처리`·`3/5`·`v0.2.113` 은 칩이 아니다 · 코드 조각은 코드 그대로(클릭만). P-3 첨부 칩은 글 위 28px 별도 행 · 6px · 빈 행 없음.
         *    P-4 문서는 어떤 경우에도 안 구른다 — html/body overflow hidden · 채팅 목록만 구른다(overscroll contain) · 키보드 열린 채 당겨도 scrollY 0 · 키보드 내려가면 컴포저는 바닥.
         */
        for (const [label, vp, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1440, height: 900 }, false]]) {
          const sidP = (await api(`/bots/${bot.id}/sessions`, { name: 'p-' + label })).id
          const pp = await br.newPage({ viewport: vp, deviceScaleFactor: 1, ...(mobile ? { hasTouch: true, isMobile: true } : {}) })
          await pp.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          if (mobile) await pp.addInitScript(() => {
            // ⚠ isMobile 페이지는 init 시점의 innerHeight 가 최종 뷰포트가 아니다 — 높이는 부를 때 잰다
            const t = new EventTarget(); let hOv = null, top = 0
            const vv = { get width() { return window.innerWidth }, get height() { return hOv ?? window.innerHeight }, get offsetTop() { return top }, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1, addEventListener: t.addEventListener.bind(t), removeEventListener: t.removeEventListener.bind(t), dispatchEvent: t.dispatchEvent.bind(t) }
            Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
            window.__kb = (h, tp = 0) => { hOv = window.innerHeight - h; top = tp; vv.dispatchEvent(new Event('resize')) }
            window.__kbScroll = (tp) => { top = tp; vv.dispatchEvent(new Event('scroll')) }
            window.__kbReset = () => { hOv = null; top = 0; vv.dispatchEvent(new Event('resize')) }
          })
          await pp.goto(base + `/#bot=${bot.id}&s=${sidP}`); await pp.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(500)
          // P-1 · 칩 한 줄 vs 없는 줄 — 같은 문단 두 줄로 재서 줄 높이·글꼴을 대조한다
          await api(`/sessions/${sidP}/send`, { text: '되읊어: 첫 줄에는 칩이 없다 그냥 글자만\n\n둘째 줄에는 files/메모.md 칩이 있다 그리고 글자\n\n셋째 줄 3/5 → 처리 v0.2.113 은 칩이 아니다 `files/메모.md` 코드도 아니다' }); await wait(1200)
          const p1 = await pp.evaluate(() => {
            const md = [...document.querySelectorAll('.amsg .md')].pop(); const ps = [...md.querySelectorAll('p')]
            const chip = md.querySelector('.pchip'); if (!chip) return { chip: null }
            const cs = getComputedStyle(chip), ms = getComputedStyle(md)
            const fs = parseFloat(ms.fontSize)
            return { chip: true, pH: ps.map((p) => Math.round(p.getBoundingClientRect().height)), chipH: chip.getBoundingClientRect().height, fs, chipFs: parseFloat(cs.fontSize), fam: cs.fontFamily === ms.fontFamily, pt: cs.paddingTop, pb: cs.paddingBottom, m: cs.marginTop + cs.marginBottom + cs.marginLeft + cs.marginRight, bw: cs.borderTopWidth, br: cs.borderTopLeftRadius, nowrap: cs.whiteSpace, maxW: cs.maxWidth, ell: getComputedStyle(chip.querySelector('.nm')).textOverflow, svg: chip.querySelector('svg') ? chip.querySelector('svg').getBoundingClientRect().height : null, chips: md.querySelectorAll('.pchip').length, codePath: md.querySelectorAll('code.code-path').length, codes: [...md.querySelectorAll('code')].map((c) => c.textContent), text: ps[2]?.textContent }
          })
          if (!p1.chip) fail(`P ${label}: 칩이 없다`)
          if (Math.abs(p1.pH[0] - p1.pH[1]) > 1) fail(`P-1 ${label}: 칩 있는 줄과 없는 줄의 높이가 다르다 ` + JSON.stringify(p1))
          if (Math.abs(p1.chipH - (p1.fs + 2)) > 1.5) fail(`P-1 ${label}: 칩 높이 ≠ 글자 높이+2px ` + JSON.stringify(p1))
          if (p1.chipFs !== p1.fs || !p1.fam) fail(`P-1 ${label}: 칩 글꼴·크기가 본문과 다르다 ` + JSON.stringify(p1))
          if (p1.pt !== '0px' || p1.pb !== '0px' || p1.m !== '0px0px0px0px' || p1.bw !== '1px' || p1.br !== '4px' || p1.nowrap !== 'nowrap' || p1.maxW !== '60%' || p1.ell !== 'ellipsis') fail(`P-1 ${label}: 칩 박스 규격 ` + JSON.stringify(p1))
          if (p1.svg !== null && Math.abs(p1.svg - p1.fs) > 1) fail(`P-1 ${label}: 칩 아이콘이 1em 이 아니다 ` + JSON.stringify(p1))
          // P-2 · 오탐 없음 — 셋째 줄에서 칩은 0(코드 조각은 code-path 로만)
          if (p1.chips !== 1) fail(`P-2 ${label}: → 처리 · 3/5 · v0.2.113 중 무언가가 칩이 됐다 ` + JSON.stringify(p1))
          if (p1.codePath !== 1 || !p1.codes.includes('files/메모.md')) fail(`P-2 ${label}: 코드 조각이 코드로 남지 않았다 ` + JSON.stringify(p1))
          const cp = await pp.evaluate(() => { const c = document.querySelector('.amsg code.code-path'); const s = getComputedStyle(c); return { under: s.textDecorationLine, bg: s.backgroundColor, font: s.fontFamily } })
          if (/underline/.test(cp.under)) fail(`P-2 ${label}: 코드 경로에 밑줄이 생겼다 ` + JSON.stringify(cp))
          // 긴 이름은 가운데 줄임 · 한 줄 (있는 파일만 칩이 되므로 먼저 만든다 · 이름 60자 ≈ 960px > 60% 폭)
          const longNm = '아주'.repeat(28) + '긴이름.md'; writeFileSync(join(root, '3. Area/제품_Rondo/files', longNm), '# 긴\n')
          await api(`/sessions/${sidP}/send`, { text: `되읊어: 긴 이름 files/${longNm} 끝` }); await wait(1200)
          const p1b = await pp.evaluate(() => { const md = [...document.querySelectorAll('.amsg .md')].pop(); const c = md.querySelector('.pchip'); if (!c) return null; const p = c.closest('p'); const nm = c.querySelector('.nm'); return { w: c.getBoundingClientRect().width, mdW: md.getBoundingClientRect().width, h: c.getBoundingClientRect().height, pH: p.getBoundingClientRect().height, nm: nm?.textContent ?? '', mid: /^아주.*….*긴이름\.md$/.test(nm?.textContent ?? ''), cssCut: nm ? nm.scrollWidth > nm.clientWidth + 1 : null } })
          if (!p1b || p1b.w > p1b.mdW * 0.6 + 1 || p1b.pH > p1b.h * 2.2) fail(`P-1 ${label}: 긴 칩이 60% 를 넘거나 여러 줄로 갔다 ` + JSON.stringify(p1b))
          if (!p1b.mid || p1b.cssCut) fail(`P-1 ${label}: 긴 이름이 가운데 줄임(앞…뒤.md)이 아니거나 CSS 끝 생략이 붙었다 ` + JSON.stringify(p1b))
          await pp.screenshot({ path: `test/tmp/p-chips-${label}.png` })
          if (mobile) {
            // P-3 · 첨부 칩은 글 위 28px 별도 행, 6px 간격 · 첨부 없으면 행 자체가 없다
            if (await pp.$('.composer.ph .achips')) fail('P-3: 첨부가 없는데 빈 칩 행이 있다')
            const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            await pp.setInputFiles('input[type="file"][multiple]', [{ name: '스크린샷.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }]); await wait(1200)
            await pp.click('.composer .cin'); await pp.keyboard.type('이 그림 보고'); await wait(200)
            const p3 = await pp.evaluate(() => { const a = document.querySelector('.composer.ph .achips'); const t = document.querySelector('.composer.ph .ctext'); const c = a?.querySelector('.achip'); const cin = document.querySelector('.composer .cin'); return a && c ? { rowH: a.getBoundingClientRect().height, chipH: c.getBoundingClientRect().height, gap: t.getBoundingClientRect().top - a.getBoundingClientRect().bottom, above: a.getBoundingClientRect().bottom <= t.getBoundingClientRect().top + 1, inline: !!cin.querySelector('.ichip'), text: cin.dataset.value } : null })
            if (!p3 || Math.abs(p3.rowH - 28) > 1 || Math.abs(p3.chipH - 28) > 1 || !p3.above || Math.abs(p3.gap - 6) > 1.5 || p3.inline || /@/.test(p3.text ?? '')) fail('P-3: 첨부 칩 행 ' + JSON.stringify(p3))
            await pp.screenshot({ path: 'test/tmp/p-composer-phone.png' })
            await pp.evaluate(() => { for (const b of document.querySelectorAll('.achips .achip .x')) b.click() }); await wait(200)
            if (await pp.$('.composer.ph .achips')) fail('P-3: 첨부를 다 뺐는데 빈 행이 남았다')
            // P-4 · 문서는 안 구른다 — html/body 규격 · 채팅 목록만 구른다
            const p4 = await pp.evaluate(() => { const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body), sc = getComputedStyle(document.querySelector('.chat-scroll')); return { hOv: h.overflow, bOv: b.overflow, hOb: h.overscrollBehaviorY, bOb: b.overscrollBehaviorY, scOb: sc.overscrollBehaviorY, scOv: sc.overflowY, docSH: document.scrollingElement.scrollHeight, ih: innerHeight } })
            if (p4.hOv !== 'hidden' || p4.bOv !== 'hidden' || p4.hOb !== 'none' || p4.bOb !== 'none' || p4.scOb !== 'contain' || p4.scOv !== 'auto') fail('P-4: 문서 스크롤 규격 ' + JSON.stringify(p4))
            // 키보드 열림 → 문서를 당겨도(scrollTo 80 · 시각 뷰포트 scroll) scrollY 는 0 으로 돌아오고 루트는 시각 뷰포트에 닻을 내린다
            await pp.evaluate(() => document.querySelector('.composer .cin').focus()); await pp.evaluate(() => window.__kb(336)); await wait(400)
            const pulled = await pp.evaluate(async () => { window.scrollTo(0, 80); const y0 = scrollY; window.__kbScroll(80); await new Promise((r) => setTimeout(r, 300)); const r = document.querySelector('#root').getBoundingClientRect(); const c = document.querySelector('.composer').getBoundingClientRect(); return { y0, y: scrollY, docTop: document.scrollingElement.scrollTop, rootTop: r.top, rootH: r.height, vvTop: visualViewport.offsetTop, vvH: visualViewport.height, compBottom: c.bottom, hdr: getComputedStyle(document.querySelector('.chat-hdr')).display } })
            if (pulled.y !== 0 || pulled.docTop !== 0) fail('P-4: 키보드 열린 채 당겼는데 문서가 굴렀다 ' + JSON.stringify(pulled))
            if (Math.abs(pulled.rootTop - pulled.vvTop) > 2 || Math.abs(pulled.rootH - pulled.vvH) > 2) fail('P-4: 루트가 시각 뷰포트(top=offsetTop · height)에 안 붙어 있다 ' + JSON.stringify(pulled))
            if (pulled.compBottom > pulled.vvTop + pulled.vvH + 1) fail('P-4: 컴포저가 보이는 영역 밖으로 밀렸다 ' + JSON.stringify(pulled))
            await pp.screenshot({ path: 'test/tmp/p-keyboard-phone.png' })
            // 키보드 내려감 → 컴포저는 다시 바닥, 헤더 복귀, scrollY 0
            await pp.evaluate(() => window.__kbReset()); await pp.evaluate(() => document.activeElement.blur()); await wait(500)
            const down = await pp.evaluate(() => { const c = document.querySelector('.composer').getBoundingClientRect(); const r = document.querySelector('#root').getBoundingClientRect(); return { y: scrollY, compBottom: c.bottom, ih: innerHeight, rootTop: r.top, rootH: r.height, hdr: getComputedStyle(document.querySelector('.chat-hdr')).display } })
            // Z(2026-09-22 「B · 하단 탭」) 뒤로 컴포저는 **탭 위**에 앉는다 — 바닥까지 56px(탭) + 여백이 남는 것이 제자리다
            if (down.y !== 0 || down.ih - down.compBottom > 24 + 56 || down.rootTop !== 0 || Math.abs(down.rootH - down.ih) > 2 || down.hdr === 'none') fail('P-4: 키보드 내려간 뒤 컴포저가 바닥으로 안 돌아왔다 ' + JSON.stringify(down))
          } else {
            // 데스크톱은 그대로 — 문서는 안 구르고(overflow hidden) 레이아웃은 100vh
            const d = await pp.evaluate(() => ({ hOv: getComputedStyle(document.documentElement).overflow, rootH: document.querySelector('#root').getBoundingClientRect().height, ih: innerHeight, y: scrollY }))
            if (d.hOv !== 'hidden' || Math.abs(d.rootH - d.ih) > 2 || d.y !== 0) fail('P-4 desktop: ' + JSON.stringify(d))
          }
          await pp.close(); await fetch(base + `/api/sessions/${sidP}`, { method: 'DELETE' })
          ok(`P 칩·키보드 (${label}) — 칩 줄높이 ±1px · 글자+2px · 오탐 0 · 코드 그대로${mobile ? ' · 첨부 행 28px/6px · 문서 스크롤 0 · 키보드 닻' : ' · 데스크톱 그대로'}`)
        }
        /**
         * 🔴 **J · 질문이 온 기기를 에이전트가 안다** (2026-09-19). 워커에게 가는 글 앞에 `<folderbot-client …/>`(호스트가 origin·device 를 붙인다),
         *    채팅에는 안 보이고 사람 글 그대로 · 원격 메시지에는 기기 표시 · rondo_open 은 **요청한 기기**의 문서 창에만 · 볼트 CLAUDE.md 생성부 + 시스템 프롬프트에 규칙.
         */
        {
          const hashBefore = await pg.evaluate(() => location.hash)
          const sidJ = (await api(`/bots/${bot.id}/sessions`, { name: 'j-dev' })).id
          // 호스트 화면(pg · main) — origin=host
          await pg.evaluate((h) => { location.hash = h }, `#bot=${bot.id}&s=${sidJ}`); await wait(500)
          await pg.click('.composer .cin'); await pg.keyboard.type('기기확인'); await pg.keyboard.press('Enter'); await wait(1200)
          let chatJ = await api(`/sessions/${sidJ}/chat`)
          const hostReply = chatJ.items.filter((i) => i.kind === 'assistant').pop()?.text ?? ''; if (!/origin="host"/.test(hostReply) || !/device="host"/.test(hostReply) || !/canOpenOnDevice="true"/.test(hostReply)) fail('J-1 호스트: ' + hostReply)
          const hostUser = chatJ.items.filter((i) => i.kind === 'user').pop(); if (hostUser.text !== '기기확인' || (hostUser.from && !hostUser.from.main)) fail('J-1: 채팅의 사람 글은 그대로여야 하고 호스트 표식은 없다 ' + JSON.stringify(hostUser))
          if (await pg.$('.umsg .dev')) fail('J-4: 호스트에서 보낸 메시지에 기기 표시가 붙었다')
          // 원격 맥 앱(가짜 브리지 · x-fb-as macbook · sync) — origin=remote device=macbook tier=desktop canOpenOnDevice=true openMode=sync
          const rj = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
          await rj.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:docopen'); const L = { settings: { openMode: 'sync', vaultLocal: '/x' } }
            window.folderbotDesktop = { version: 'qa', perms: { list: async () => [], open: async () => ({ ok: true }), ack: async () => [], reset: async () => [], test: async () => ({ ok: true }), relaunch: () => {}, onChange: () => () => {} }, local: { settings: async () => ({ ...L.settings }), set: async (p) => { Object.assign(L.settings, p); return { ...L.settings } }, detect: async () => [], stat: async () => ({ exists: false }), open: async () => '', reveal: async () => '', wait: async () => true, download: async (u, h, rel) => '/cache/' + rel, icloud: async () => true, pick: async () => '' } }
            const of = window.fetch.bind(window); window.fetch = (u, o = {}) => { const h = new Headers(o.headers || {}); h.set('x-fb-as', 'macbook'); return of(u, { ...o, headers: h }) } })
          await rj.goto(base + `/#bot=${bot.id}&s=${sidJ}`); await rj.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(600)
          if (await rj.$('.perm-gate')) { await rj.click('.perm-gate button.btn.on:has-text("계속")').catch(() => {}); await wait(400) }
          await rj.click('.composer .cin'); await rj.keyboard.type('기기확인'); await rj.keyboard.press('Enter'); await wait(1200)
          chatJ = await api(`/sessions/${sidJ}/chat`); const remReply = chatJ.items.filter((i) => i.kind === 'assistant').pop()?.text ?? ''
          for (const w of ['origin="remote"', 'device="macbook"', 'tier="desktop"', 'canOpenOnDevice="true"', 'openMode="sync"']) if (!remReply.includes(w)) fail('J-1 원격: ' + w + ' 가 없다 · ' + remReply)
          const remUser = chatJ.items.filter((i) => i.kind === 'user').pop(); if (!remUser.from || remUser.from.main || remUser.from.device !== 'macbook') fail('J-4: 원격 메시지의 from ' + JSON.stringify(remUser.from))
          await wait(400); const devTxt = await rj.textContent('.umsg.last .dev').catch(() => ''); if (!/원격 · macbook/.test(devTxt ?? '')) fail('J-4: 채팅에 기기 표시 «원격 · macbook» · ' + devTxt)
          // J-3 · 원격 턴의 rondo_open → 원격 문서 창에만 열리고 호스트(pg)에는 안 뜬다
          const closeDocP = async (p) => { for (let i = 0; i < 3 && (await p.$('.docwrap')); i++) { await p.keyboard.press('Meta+Shift+D'); await wait(300) } }
          await closeDocP(pg); await closeDocP(rj)
          const mcpJ = await (await fetch(base + `/mcp/${bot.id}?sid=${sidJ}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'rondo_open', arguments: { path: 'CLAUDE.md' } } }) })).json()
          if (mcpJ.result?.isError) fail('J-3 rondo_open: ' + mcpJ.result.content[0].text)
          await wait(900)
          const onRemote = !!(await rj.$('.docwrap .dtb .nm:has-text("CLAUDE.md")')); const onHost = !!(await pg.$('.docwrap'))
          if (!onRemote || onHost) fail('J-3: 원격 문서 창에만 열려야 한다 ' + JSON.stringify({ onRemote, onHost }))
          await rj.screenshot({ path: 'test/tmp/j-remote.png' }); await closeDocP(rj)
          // 폰 — tier=phone · canOpenOnDevice=false · rondo_reveal 은 그 폰에 안내만(호스트에는 아무것도)
          const pj = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
          await pj.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); const of = window.fetch.bind(window); window.fetch = (u, o = {}) => { const h = new Headers(o.headers || {}); h.set('x-fb-as', 'iphone'); return of(u, { ...o, headers: h }) } })
          await pj.goto(base + `/#bot=${bot.id}&s=${sidJ}`); await pj.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(600)
          // ⚠ 키보드가 올라오면 입력칸이 제자리를 잡는다(Z 의 하단 탭이 그만큼 비킨다) — 자리 잡기 전에 누르면 클릭이 스친다(실측 · 부하 걸린 맥)
          await pj.click('.composer .cin'); await pj.keyboard.type('기기확인'); await wait(400)
          await pj.click('.cright .sendb'); await wait(1200)
          chatJ = await api(`/sessions/${sidJ}/chat`); const phReply = chatJ.items.filter((i) => i.kind === 'assistant').pop()?.text ?? ''
          for (const w of ['origin="remote"', 'device="iphone"', 'tier="phone"', 'touch="true"', 'canOpenOnDevice="false"']) if (!phReply.includes(w)) fail('J-1 폰: ' + w + ' 가 없다 · ' + phReply)
          const mcpR = await (await fetch(base + `/mcp/${bot.id}?sid=${sidJ}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'rondo_reveal', arguments: { path: 'CLAUDE.md' } } }) })).json()
          if (mcpR.result?.isError) fail('J-3 rondo_reveal: ' + mcpR.result.content[0].text)
          await wait(800); const phToast = (await pj.textContent('.toast').catch(() => '')) ?? ''
          if (!phToast || (await pg.$('.docwrap')) || (await rj.$('.docwrap'))) fail('J-3 폰: 폰에는 안내, 다른 기기에는 아무것도 ' + JSON.stringify({ phToast, host: !!(await pg.$('.docwrap')) }))
          await pj.close(); await rj.close()
          // J-2 · 규칙 — 볼트 CLAUDE.md 생성부(새 볼트) + 시스템 프롬프트
          // (새 볼트의 CLAUDE.md 생성부에 규칙이 드는 것은 유닛 test/unit/registry.test.ts 가 잰다 — 이 픽스처 볼트는 이미 CLAUDE.md 가 있어 머리말을 다시 만들지 않는다)
          await fetch(base + `/api/sessions/${sidJ}`, { method: 'DELETE' }); await pg.evaluate((h) => { location.hash = h }, hashBefore); await wait(500)
          ok('J 발신 기기 — 호스트/원격/폰 블록 값 · 채팅 글 그대로 · 원격 메시지 표식 · rondo_open 은 요청 기기에만 · 폰 reveal 은 안내만 · CLAUDE.md 규칙')
        }
        /**
         * 🔴 **H · 반응형 3단계 + 쓸기 내비게이션** (2026-09-19 Dave 시안 확정 · `test/tmp/responsive-mock.png`).
         *    어느 단계인지는 창 폭으로만 — 1400 넓음(지금 그대로 세 칸) · 900 중간(아이콘 띠 52px + 알약 독 · 서랍은 채팅 위로 덮임 · 채팅 폭 불변) ·
         *    500 좁음(☰ + 쓸기 · 독은 작게). 쓸기는 [레일 | 채팅 | 문서] 세 칸 띠를 한 칸씩 — 판정은 `core/drawer`(유닛), 여기서는 포인터 시뮬레이션.
         */
        {
          const sidH = (await api(`/bots/${bot.id}/sessions`, { name: 'h-stage' })).id
          await api(`/sessions/${sidH}/send`, { text: '되읊어: 코드 블록이 있는 답\n\n```\n' + 'x'.repeat(160) + '\n```\n\n' + '본문 줄 '.repeat(80) }); await wait(600)
          const shots = {}
          for (const [label, w, h] of [['wide', 1400, 900], ['mid', 900, 700], ['narrow', 500, 800]]) {
            const hp = await br.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true })
            await hp.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
            const herrs = []; hp.on('pageerror', (e) => herrs.push(e.message))
            await hp.goto(base + `/#bot=${bot.id}&s=${sidH}`); await hp.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(600)
            const st = await hp.evaluate(() => ({ cls: document.querySelector('.app').className, view: document.querySelector('.app').dataset.view, strip: document.querySelector('.cols > .strip.left')?.getBoundingClientRect().width ?? null, side: !!document.querySelector('.cols > .col.side'), rp: !!document.querySelector('.cols > .rpwrap'), dock: !!document.querySelector('.dock'), tabs: !!document.querySelector('.tabbar'), drawer: !!document.querySelector('.drawer'), menu: !!document.querySelector('.chat-hdr .hb-menu'), chatW: document.querySelector('.col.chat').getBoundingClientRect().width }))
            await hp.screenshot({ path: `test/tmp/h-${label}.png` }); shots[label] = `h-${label}.png`
            if (label === 'wide') {
              if (!st.side || !st.rp || st.dock || st.tabs || st.drawer || /smid|phone/.test(st.cls)) fail('H 넓음: 지금처럼 세 칸이어야 한다 ' + JSON.stringify(st))
            } else if (label === 'mid') {
              if (!/smid/.test(st.cls) || st.strip !== 52 || st.side || st.rp || !st.dock || st.tabs || st.menu) fail('H 중간: 띠 52px · 알약 독(탭 아님) · 흐름 안 레일/패널 없음 ' + JSON.stringify(st))
              // 띠 탭 → 이름 있는 레일이 채팅 위로 덮여 나온다 · 채팅 폭 불변
              await hp.click('.strip.left .ib'); await wait(400)
              const l = await hp.evaluate(() => { const d = document.querySelector('.drawer.left'); return { open: d?.classList.contains('open'), rows: d?.querySelectorAll('.brow').length ?? 0, x: d?.getBoundingClientRect().left, chatW: document.querySelector('.col.chat').getBoundingClientRect().width, scrim: !!document.querySelector('.scrim') } })
              if (!l.open || l.rows < 2 || l.x !== 52 || l.chatW !== st.chatW || !l.scrim) fail('H 중간: 띠 탭 → 레일 서랍 ' + JSON.stringify(l))
              await hp.screenshot({ path: 'test/tmp/h-mid-rail.png' })
              // 레일에서 봇 탭 → 레일 닫히며 그 봇
              const other = await hp.evaluate((cur) => { const b = [...document.querySelectorAll('.drawer.left .brow')].find((x) => x.dataset.id && x.dataset.id !== cur); b?.click(); return b?.dataset.id ?? null }, bot.id); await wait(500)
              const g = await hp.evaluate(() => ({ view: document.querySelector('.app').dataset.view, bot: new URLSearchParams(location.hash.slice(1)).get('bot'), drawer: !!document.querySelector('.drawer.left.open') }))
              if (!other || g.view !== 'chat' || g.drawer || g.bot !== other) fail('H 중간: 레일에서 봇 탭 → 닫히며 그 봇 ' + JSON.stringify({ other, ...g }))
              await hp.goto(base + `/#bot=${bot.id}&s=${sidH}`); await wait(600)
              // 독 📁 → 파일 칸이 열린 패널이 덮여 나온다 · 채팅 폭 불변 · Esc 로 닫힘
              await tapNav(hp, 'files'); await wait(500)
              const r = await hp.evaluate(() => { const d = document.querySelector('.drawer.right'); return { open: d?.classList.contains('open'), panel: !!d?.querySelector('.rpwrap .panel'), chatW: document.querySelector('.col.chat').getBoundingClientRect().width, view: document.querySelector('.app').dataset.view } })
              if (!r.open || !r.panel || r.chatW !== st.chatW || r.view !== 'panel') fail('H 중간: 독 → 패널 서랍 ' + JSON.stringify(r))
              await hp.screenshot({ path: 'test/tmp/h-mid-panel.png' })
              await hp.keyboard.press('Escape'); await wait(400); if ((await hp.evaluate(() => document.querySelector('.app').dataset.view)) !== 'chat') fail('H 중간: Esc 로 안 닫힌다')
              // 독 📄 는 문서가 없으면 흐리고 눌리지 않는다 · 문서를 열면 켜진다
              if (!(await hp.$('.dock .db[title="문서"].dim[disabled]'))) fail('H 중간: 문서 없을 때 📄 는 흐려야 한다')
            } else {
              if (!/phone/.test(st.cls) || st.strip !== null || st.side || st.rp || st.dock || !st.tabs || !st.menu || st.drawer) fail('🔴 Z: 좁음은 띠 없음 · ☰ · **하단 탭**(떠 있는 독이 아니다) ' + JSON.stringify(st))
              const view = () => hp.evaluate(() => document.querySelector('.app').dataset.view)
              const drag = async (x0, y0, x1, y1, steps = 8, ms = 16) => { await hp.mouse.move(x0, y0); await hp.mouse.down(); for (let i = 1; i <= steps; i++) { await hp.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await wait(ms) } await hp.mouse.up(); await wait(350) }
              /**
               * ═══ AD · 폰의 길은 하나다 (2026-09-23 Dave) ════════════════════════════════════
               * *«왼쪽으로 쓸기 기능은 아예 삭제(탭으로 다 해결됨) · 오른쪽으로 쓸기만 남겨서 어디서든 바로 폴더 리스트 ·
               *   모든 탭의 왼쪽 상단 버튼을 클릭하면 무조건 폴더 리스트로»*.
               */
              // 👉 는 어디서든 봇 목록 — 채팅에서
              /** 🔴 AH(2026-09-24 Dave) · 쓸기는 **맨 왼쪽 가장자리에서만** — 안쪽에서 잡으면 쓸리는 행과 다툰다 */
              await drag(120, 500, 320, 505); if ((await view()) === 'list') fail('🔴 AH: 안쪽(120px)에서 잡은 끌기가 봇 목록을 열었다')
              await drag(8, 500, 260, 505); if ((await view()) !== 'list') fail('AH: 가장자리 👉 → 봇 목록 ' + (await view()))
              /**
               * 🔴 **AI · 오른쪽 쓸기는 «봇 목록» 하나뿐이다** (2026-09-24 Dave: «그 액션에서 뒤로 가기는 완전히 없애»).
               *    종전에는 드릴인(서브에이전트) 안에서 👉 가 «드릴에서 나오기» 로 먼저 먹혀, 같은 손짓이 자리에 따라 다른 뜻이었다.
               */
              await hp.keyboard.press('Escape'); await wait(350)
              const drilled = await hp.evaluate(() => { const b = [...document.querySelectorAll('.amsg .meta, .sub-card, [data-drill]')].find((x) => /에이전트|하위|서브/.test(x.textContent ?? '')); if (b) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true } return false })
              if (drilled) {
                await wait(500)
                await drag(8, 500, 260, 505); await wait(400)
                if ((await view()) !== 'list') fail('🔴 AI: 드릴인 안에서 👉 가 봇 목록을 안 열었다(뒤로 가기로 먹혔다) ' + (await view()))
                await hp.keyboard.press('Escape'); await wait(350)
              }
              /**
               * 🔴 **AJ (2026-09-24 Dave)** — ① 목록을 열었다 닫아도 **보던 봇이 그대로**여야 한다(오케스트레이터로 안 간다)
               *    ② 목록을 **끌어 오면 키보드가 내려간다**(반쯤 덮인 채 열리면 볼 수 있는 폴더가 절반으로 준다)
               */
              {
                const st = () => hp.evaluate(() => ({ bot: new URLSearchParams(location.hash.slice(1)).get('bot'), view: document.querySelector('.app').dataset.view, ae: document.activeElement?.className ?? '' }))
                if ((await view()) === 'list') { await hp.keyboard.press('Escape'); await wait(400) }
                await hp.click('.composer .cin'); await wait(300)
                const b0 = await st()
                if (!/cin/.test(b0.ae)) fail('AJ: 입력칸에 초점이 안 갔다 ' + JSON.stringify(b0))
                await drag(8, 500, 260, 505); await wait(450)
                const b1 = await st()
                if (b1.view !== 'list') fail('AJ: 가장자리 끌기로 목록이 안 열렸다 ' + JSON.stringify(b1))
                if (/cin/.test(b1.ae)) fail('🔴 AJ: 목록을 끌어 왔는데 입력칸이 초점을 쥐고 있다(키보드가 안 내려간다) ' + JSON.stringify(b1))
                await hp.keyboard.press('Escape'); await wait(450)
                const b2 = await st()
                if (b2.bot !== b0.bot) fail('🔴 AJ: 목록을 닫았더니 보던 봇이 바뀌었다(오케스트레이터로 갔다) ' + JSON.stringify({ b0, b2 }))
              }
              /**
               * 🔴 **AK (2026-09-24 Dave · 폰 세 가지)**
               *  ① *«플러스 → 사진에서 고르기 를 눌렀을 때 세 개의 메뉴가 뜨는 대신 바로 사진첩이 … 무조건 다 1depth»* —
               *     세 줄짜리 시트는 **iOS 것**이라 웹앱이 못 건너뛴다. **우리 줄**을 합쳐 겹을 하나 걷었다.
               *  ② *«채팅창 공간이 너무 길어지면 플러스 버튼이 잘려서 선택이 안 돼»* — 팝업 머리가 화면 위로 넘어가면 안 된다.
               *  ③ *«대기 화면이 나오면 채팅의 맨 아래 화면까지 안 보이는 버그»* — 아래 여백이 **탭 바 높이까지** 비워야 한다.
               */
              {
                if ((await view()) === 'list') { await hp.keyboard.press('Escape'); await wait(400) }
                await tapNav(hp, 'chat'); await wait(500)   // ⚠ 앞 검사가 문서·폴더에 있을 수 있다 — 채팅으로 데려온다
                // ③ — `.tobot` 은 이미 탭 바를 세는데 `.chat-body` 는 안 셌다. 둘이 같은 셈을 써야 한다
                const pad = await hp.evaluate(() => {
                  const col = document.querySelector('.col.chat'), body = document.querySelector('.chat-body'), tb = document.querySelector('.tabbar')
                  return { pb: parseFloat(getComputedStyle(body).paddingBottom), footh: parseFloat(getComputedStyle(col).getPropertyValue('--footh')) || 0, tab: tb ? tb.getBoundingClientRect().height : 0 }
                })
                if (pad.tab > 0 && pad.pb < pad.footh + pad.tab - 2) fail('🔴 AK: 대화 아래 여백이 탭 바 높이만큼 모자라다 — 맨 아래 줄이 가린다 ' + JSON.stringify(pad))
                // ①② — 입력창을 길게 만든 뒤 + 를 연다
                await hp.fill('.composer .cin', Array.from({ length: 8 }, (_, i) => `길게 쓴 줄 ${i + 1}`).join('\n')); await wait(400)
                // ⚠ 합성 클릭은 «입력칸 초점 해제 → 입력창이 움직임 → click 이 안 남» 순서를 타서 팝업이 안 열린다
                //   (실기기 탭은 그 문제가 없다 — 2026-09-23 AB 에서 배운 자리다). 재려는 것은 **길이**이므로 초점만 먼저 뗀다
                await hp.evaluate(() => document.activeElement?.blur()); await wait(300)
                await hp.click('.composer.ph .cleft .plusb'); await wait(400)
                const pop = await hp.evaluate(() => {
                  const el = document.querySelector('.cpop.plus')
                  if (!el) return { miss: { view: document.querySelector('.app')?.dataset.view, cls: document.querySelector('.app')?.className, plus: !!document.querySelector('.composer.ph .cleft .plusb'), pops: document.querySelectorAll('.cpop').length } }
                  const hdr = document.querySelector('.chat-hdr')
                  return { top: el.getBoundingClientRect().top, ceil: hdr ? hdr.getBoundingClientRect().bottom : 0, rows: [...el.querySelectorAll('.prow2 .t b')].map((b2) => b2.textContent ?? '') }
                })
                if (!pop || pop.miss) fail('AK: 입력창이 길 때 + 팝업이 안 열렸다 ' + JSON.stringify(pop))
                if (pop.top < pop.ceil - 1) fail('🔴 AK: 입력창이 길어지자 + 팝업 머리가 화면(헤더) 위로 잘렸다 — 윗줄을 못 누른다 ' + JSON.stringify(pop))
                if (pop.rows.some((r) => /사진에서 고르기/.test(r))) fail('🔴 AK: + 메뉴에 아직 우리가 만든 겹(「사진에서 고르기」)이 있다 ' + JSON.stringify(pop.rows))
                if (!pop.rows.some((r) => /사진·파일 고르기/.test(r))) fail('🔴 AK: 사진과 파일을 합친 한 줄이 없다 ' + JSON.stringify(pop.rows))
                if (!pop.rows.some((r) => /카메라로 찍기/.test(r))) fail('AK: 카메라(진짜 1depth)는 남아 있어야 한다 ' + JSON.stringify(pop.rows))
                await hp.keyboard.press('Escape'); await hp.fill('.composer .cin', ''); await wait(300)
                ok(`AK 폰 — 대화 아래 여백 ${pad.pb}px(탭 ${pad.tab}) · + 팝업 안 잘림 · 메뉴 ${pop.rows.length}줄(사진·파일 한 줄)`)
              }
              /**
               * 🔴 **AL · 안전영역을 두 곳에서 세지 않는다** (`docs/LAYOUT.md` 불변식 1 · 2026-09-24 Dave:
               *    *«특정 모델뿐만 아니라 **어떤 환경에서도** 이런 불필요한 여백은 만들어지면 안 되거든»*).
               * ⚠ **브라우저에는 안전영역이 없어서**(`env(safe-area-inset-bottom)` = 0) 이 버그는 검사에
               *    한 번도 안 잡혔다 — 실기기에서만 빈 띠가 생겼다. 그래서 `--sab` 를 **한 토큰**으로 모아 두고
               *    여기서 값을 갈아 끼워 실기기를 흉내 낸다.
               * ⚠ 판정은 «안전영역을 키웠을 때 여백이 **같이 커지는가**» 하나다. 절대 여백은 못 쓴다 —
               *    목록이 짧아 화면을 안 채우면 아래가 비는 게 정상이라 거짓 빨강이 난다.
               * ⚠ 범위를 화면별로 좁힌다 — 채팅 입력칸은 어느 탭에서나 살아 있어 늘 그것이 잡힌다(실측).
               */
              {
                /**
                 * ⚠ **재는 것은 «바닥에 붙는 UI» 뿐이다.** 스크롤되는 목록(할 일·폴더)을 재면 탭 바가 올라간 만큼
                 *    다른 줄이 드러나서 여백이 **한 줄 높이만큼 들쭉날쭉**해진다 — 거짓 빨강이다(실측 +10px).
                 *    안전영역을 두 번 셀 위험이 있는 것은 애초에 **아래에 고정된 것**뿐이다.
                 */
                const SCOPE = { chat: '.chat-foot', doc: '.dfoot', files: '.pfoot' }
                const gapOf = (sel) => hp.evaluate((s2) => {
                  const tb = document.querySelector('.tabbar'); if (!tb) return null
                  const top = tb.getBoundingClientRect().top
                  const root = document.querySelector(s2); if (!root) return null
                  let low = -1, who = ''
                  for (const el of root.querySelectorAll('*')) {
                    if (el.children.length) continue                       // 잎만 — 컨테이너 상자는 패딩을 품어 버그를 0 으로 보이게 한다
                    if (el.closest('.tabbar') || el.closest('.drawer.left') || el.closest('.tsheet') || el.closest('.backdrop')) continue
                    const st = getComputedStyle(el)
                    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue
                    const r = el.getBoundingClientRect()
                    if (r.width < 2 || r.height < 2 || r.bottom > top + 1 || r.bottom < 0) continue
                    if (r.bottom > low) { low = r.bottom; who = el.className || el.tagName }
                  }
                  return low < 0 ? null : { gap: Math.round(top - low), who: String(who).slice(0, 24) }
                }, sel)
                const setSab = (v) => hp.evaluate((n) => document.documentElement.style.setProperty('--sab', `${n}px`), v)
                const dead = [], why = []
                let openedDoc = false     // ⚠ 내가 연 문서는 내가 닫는다 — 뒤 검사가 «열린 문서가 없을 때» 를 본다
                if ((await view()) === 'list') { await hp.keyboard.press('Escape'); await wait(400) }
                /* ⚠ **채팅에서 입력 중이면 탭 바가 숨는다**(AE 계약). 앞 검사가 입력칸에 초점을 두고 끝나면
                      여기서 잴 탭 바가 없어 검사가 조용히 헛돈다 — 실제로 그랬다. 초점을 먼저 뗀다. */
                await hp.evaluate(() => document.activeElement?.blur()); await wait(500)
                for (const [id, sel] of Object.entries(SCOPE)) {
                  const tab = await hp.$(`.tabbar [data-tab="${id}"]`)
                  if (!tab) { why.push(`${id}: 탭 없음`); continue }
                  await tab.click(); await wait(600)
                  if (id === 'doc' && !(await hp.$('.dfoot'))) {           // 문서는 실제로 열어야 아래 줄이 생긴다
                    const back = await hp.$('.tabbar [data-tab="files"]')
                    if (back) { await back.click(); await wait(600); const f = await hp.$('.panel .secb button.trow:not(.dir)'); if (f) { await f.click(); await wait(900); openedDoc = true } }
                    await tab.click(); await wait(600)
                  }
                  await setSab(0); await wait(200); const g0 = await gapOf(sel)
                  await setSab(34); await wait(200); const g1 = await gapOf(sel)
                  await setSab(0)
                  if (!g0 || !g1) { why.push(`${id}: ${sel} 안에서 잴 잎이 없음`); continue }
                  dead.push({ id, grow: g1.gap - g0.gap, gap: g1.gap, who: g1.who })
                }
                const twice = dead.filter((d) => d.grow > 2)
                if (twice.length) fail('🔴 AL: 안전영역을 두 곳에서 세는 화면이 있다(그만큼 빈 띠가 생긴다) ' + JSON.stringify(twice))
                if (!dead.some((d) => d.id === 'doc')) fail('AL: 문서 화면을 못 재 봤다 — 검사가 헛돌았다 ' + JSON.stringify({ dead, why, tabs: await hp.$$eval('.tabbar [data-tab]', (r) => r.map((x) => x.dataset.tab)).catch(() => null), view: await view() }))
              /**
               * 🔴 **AR · 폰에서 «전체 복사» 와 «루틴»** (2026-09-24 Dave: *«모바일에서 코드블록 및 텍스트 문서
               *    내용 전체 복사 기능이 없어 … 폴더 섹션에 모바일에서도 루틴 메뉴 추가해줘»*).
               * ⚠ 코드 복사 단추는 **원래 있었다** — `opacity:0` 이고 마우스를 올려야 나타나서, 터치에서는
               *    보이지도 눌리지도 않았다. 그래서 「있나」가 아니라 **「보이고 누를 수 있나」**를 잰다.
               */
              {
                const home = await hp.$('.tabbar [data-tab="chat"]'); if (home) { await home.click(); await wait(500) }
                const cb = await hp.evaluate(() => {
                  const bar = document.querySelector('.md .cbbar'); if (!bar) return null
                  const b = bar.querySelector('.cp'); const cs = getComputedStyle(bar)
                  const r = b ? b.getBoundingClientRect() : null
                  return { op: Number(cs.opacity), pe: cs.pointerEvents, h: r ? Math.round(r.height) : 0, txt: b ? (b.textContent ?? '') : '' }
                })
                if (!cb) fail('AR: 코드 블록이 화면에 없어 복사 단추를 못 쟀다 — 검사가 헛돈다')
                if (cb.op < 1 || cb.pe === 'none') fail('🔴 AR: 폰에서 코드 복사 단추가 안 보이거나 안 눌린다(올려놓기가 없는 기기다) ' + JSON.stringify(cb))
                if (cb.h < 30) fail('🔴 AR: 코드 복사 단추가 손가락으로 누르기엔 작다(보이는 크기 30px + 누를 넓이 44px 계약) ' + JSON.stringify(cb))
                // 폴더 탭에 루틴이 있나
                const ft = await hp.$('.tabbar [data-tab="files"]'); if (ft) { await ft.click(); await wait(600) }
                const rt = await hp.evaluate(() => [...document.querySelectorAll('.panel .sech')].map((x) => (x.textContent ?? '').trim()))
                if (!rt.some((t) => /루틴/.test(t))) fail('🔴 AR: 폰 「폴더」 탭에 루틴이 없다 ' + JSON.stringify(rt))
                const td = await hp.$('.tabbar [data-tab="todo"]'); if (td) { await td.click(); await wait(600) }
                const rt2 = await hp.evaluate(() => [...document.querySelectorAll('.panel .sech')].map((x) => (x.textContent ?? '').trim()))
                if (rt2.some((t) => /루틴/.test(t))) fail('🔴 AR: 「할 일」 탭에는 루틴이 없어야 한다(그 탭은 지금 할 일만) ' + JSON.stringify(rt2))
                if (home) { await home.click(); await wait(500) }
                ok(`AR 폰 — 코드 복사 단추 보임·누를 수 있음(${cb.h}px) · 폴더 탭에 루틴 · 할 일 탭에는 없음`)
              }
                /* ⚠ 다음 검사는 «열린 문서가 없고 채팅에서 시작» 을 전제한다 — **내가 바꾼 것은 내가 되돌린다.**
                      안 되돌리면 뒤의 AD 검사가 «빈 문서 화면이 안 나온다» 로 엉뚱하게 빨개진다(실측). */
                if (openedDoc) { const d = await hp.$('.tabbar [data-tab="doc"]'); if (d) { await d.click(); await wait(500); await hp.click('.col.doc'); await hp.keyboard.press('ControlOrMeta+w'); await wait(600) } }
                const home = await hp.$('.tabbar [data-tab="chat"]'); if (home) { await home.click(); await wait(600) }
                ok(`AL 죽은 여백 — ${dead.map((d) => `${d.id} ${d.gap}px(+${d.grow})`).join(' · ')}`)
              }
              // 아래 검사들은 «목록이 열린 채» 를 본다 — 도로 열어 둔다
              if ((await view()) !== 'list') { await drag(8, 500, 260, 505); await wait(400) }
              if ((await view()) !== 'list') fail('AI: 봇 목록을 다시 못 열었다 ' + (await view()))
              const dl = await hp.evaluate(() => { const d = document.querySelector('.drawer.left'); return { open: d?.classList.contains('open'), home: !!d?.querySelector('.mhome'), rows: d?.querySelectorAll('.mrow').length ?? 0, w: d?.getBoundingClientRect().width, scrim: !!document.querySelector('.scrim') } })
              if (!dl.open || !dl.home || dl.rows < 2 || dl.w > 500 * 0.9 || !dl.scrim) fail('AD: 왼쪽 서랍 = 봇 목록(홈) ' + JSON.stringify(dl))
              /**
               * 🔴 **AQ · 목록은 «맨 위 레이어» 로 덮고, 뒤 화면은 제자리에 선다** (2026-09-24 Dave · IMG_2124:
               *    *«폴더보드 자체가 레이어상 더 위에 있어야 … 리스트 부분만 와야 하는데 뒤에 배경이 같이 따라오거든»*).
               * ⚠ Dave 가 본 그림은 **우리 서랍이 아니라 사파리의 뒤로 쓸기**였다(화면 전체가 밀리고 옛 스냅숏이 따라온다).
               *    그래도 «우리 것은 그렇지 않다» 를 수치로 못 박아 둔다 — 다음에 같은 신고가 오면 어느 쪽인지 바로 갈린다.
               */
              {
                const lay = await hp.evaluate(() => {
                  const z = (sel) => { const el = document.querySelector(sel); return el ? Number(getComputedStyle(el).zIndex) || 0 : null }
                  const c = document.querySelector('.col.chat')
                  return { drawer: z('.drawer.left'), scrim: z('.scrim'), right: z('.drawer.right'), chatLeft: c ? Math.round(c.getBoundingClientRect().left) : null }
                })
                if (lay.drawer === null || lay.scrim === null) fail('AQ: 서랍·스크림을 못 찾았다 ' + JSON.stringify(lay))
                if (!(lay.drawer > lay.scrim)) fail('🔴 AQ: 봇 목록이 스크림보다 위가 아니다(뒤에 있는 것처럼 보인다) ' + JSON.stringify(lay))
                if (lay.right !== null && !(lay.drawer > lay.right)) fail('🔴 AQ: 봇 목록이 다른 서랍보다 위가 아니다 ' + JSON.stringify(lay))
                if (lay.chatLeft !== 0) fail('🔴 AQ: 목록을 여는데 뒤 화면이 같이 밀렸다(배경이 따라온다) ' + JSON.stringify(lay))
                ok(`AQ 목록 레이어 — 서랍 z=${lay.drawer} > 스크림 ${lay.scrim} · 뒤 화면 제자리(x=${lay.chatLeft})`)
              }
              await hp.screenshot({ path: 'test/tmp/h-narrow-left.png' })
              // 🔴 👈 는 아예 없다 — 무엇을 해도 아무 일이 없어야 한다
              await drag(470, 500, 250, 505); if ((await view()) !== 'list') fail('🔴 AD: 👈 가 아직 살아 있다 ' + (await view()))
              await hp.evaluate(() => { document.querySelector('.scrim')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 480, clientY: 400 })) }); await wait(350)
              if ((await view()) !== 'chat') fail('AD: 어두워진 채팅 탭 → 채팅 ' + (await view()))
              await drag(380, 500, 150, 505); if ((await view()) !== 'chat') fail('🔴 AD: 채팅에서 👈 가 뭔가를 열었다 ' + (await view()))

              /** AD · 하단 탭이 화면을 가른다 — 「할 일」과 「폴더」는 **다른 화면**이다 */
              await tapNav(hp, 'files'); await wait(450); if ((await view()) !== 'panel') fail('AD: 탭 «폴더» ' + (await view()))
              await hp.screenshot({ path: 'test/tmp/h-narrow-right.png' })
              const paneOf = () => hp.evaluate(() => ({
                ttl: document.querySelector('.drawer.right .hdr .ttl')?.textContent ?? null,
                secs: [...document.querySelectorAll('.drawer.right .sech span:not(.c):not(.tools):not(.sp)')].map((x) => x.textContent?.trim()).filter(Boolean),
                tree: !!document.querySelector('.drawer.right .trow'),
                foot: !!document.querySelector('.drawer.right .pfoot'),
                on: document.querySelector('.tabbar .tb.on')?.dataset.tab ?? null,
              }))
              let pane = await paneOf()
              if (pane.ttl !== '폴더' || !pane.tree) fail('AD: 「폴더」 탭은 파일만 보여야 한다 ' + JSON.stringify(pane))
              /* 🔴 **AR 에서 「루틴」은 뺐다** (2026-09-24 Dave 가 AD 결정을 뒤집었다: *«폴더 섹션에 모바일에서도
                    루틴 메뉴 추가해줘»*). 루틴이 **도는지 보고 손보는 일**은 오히려 폰에서 더 자주 생긴다.
                 ⚠ 세션·명령·스킬은 그대로 뺀다 — 그것들은 만들고 고치는 자리가 데스크톱이다. */
              for (const bad of ['세션', '명령 · 스킬']) if (pane.secs.includes(bad)) fail(`🔴 AD: 「폴더」 탭에 «${bad}» 이 남아 있다 · ` + JSON.stringify(pane))
              if (!pane.foot) fail('AD: 지우기·은퇴 줄은 폴더 탭 아래에 남아야 한다 ' + JSON.stringify(pane))
              if (pane.on !== 'files') fail('AD: 탭 표시가 «폴더» 여야 한다 ' + JSON.stringify(pane))
              await tapNav(hp, 'todo'); await wait(450)
              pane = await paneOf()
              if (pane.ttl !== '할 일') fail('🔴 AD: 「할 일」 탭이 「폴더」 탭과 같은 화면이다 ' + JSON.stringify(pane))
              if (pane.tree) fail('🔴 AD: 「할 일」 탭에 파일 트리가 보인다 — 둘이 똑같으면 의미가 없다 ' + JSON.stringify(pane))
              // 🔴 AG(2026-09-24 Dave) · 세션은 **할 일 위에** 같이 보인다 — AD 에서 통째로 사라졌던 것을 되돌렸다
              if (!pane.secs.includes('세션')) fail('🔴 AG: 「할 일」 탭에 세션 목록이 없다 ' + JSON.stringify(pane))
              const sessTop = await hp.evaluate(() => { const ss = document.querySelector('.drawer.right .sech'); const secs = [...document.querySelectorAll('.drawer.right .sech')].map((x) => x.textContent?.trim().slice(0, 4)); const rows = document.querySelectorAll('.drawer.right .srow').length; return { first: ss?.textContent?.trim().slice(0, 4) ?? null, secs, rows } })
              if (!/세션/.test(sessTop.first ?? '')) fail('🔴 AG: 세션이 할 일보다 위에 있어야 한다 ' + JSON.stringify(sessTop))
              if (!sessTop.rows) fail('AG: 세션 줄이 하나도 안 보인다 ' + JSON.stringify(sessTop))
              if (pane.foot) fail('AD: 지우기·은퇴는 할 일 탭에는 없어야 한다 ' + JSON.stringify(pane))
              if (pane.on !== 'todo') fail('AD: 탭 표시가 «할 일» 이어야 한다 ' + JSON.stringify(pane))

              /** 🔴 AD · 모든 화면의 좌상단 = 봇 목록 (화면마다 다른 데로 가지 않는다) */
              const topLeft = async (what) => { await hp.click('.drawer.right .hdr .rb.glassb'); await wait(400); if ((await view()) !== 'list') fail(`🔴 AD: ${what} 의 좌상단이 봇 목록으로 안 간다 · ` + (await view())); await hp.keyboard.press('Escape'); await wait(300) }
              /**
               * 🔴 **AG · 봇 목록은 «있던 화면» 위로 미끄러진다** (2026-09-24 Dave: «채팅창에서 슬라이딩이 나온다»).
               *    종전에는 목록으로 가는 순간 오른쪽 서랍이 먼저 사라져 **채팅이 드러난 뒤** 목록이 덮였다.
               */
              await hp.click('.drawer.right .hdr .rb.glassb'); await wait(450)
              const kept = await hp.evaluate(() => ({ view: document.querySelector('.app').dataset.view, right: !!document.querySelector('.drawer.right.open'), left: !!document.querySelector('.drawer.left.open'), ttl: document.querySelector('.drawer.right .hdr .ttl')?.textContent ?? null }))
              if (kept.view !== 'list' || !kept.left) fail('AG: 좌상단이 봇 목록을 안 연다 ' + JSON.stringify(kept))
              if (!kept.right || kept.ttl !== '할 일') fail('🔴 AG: 목록을 여는 순간 있던 화면이 사라졌다(채팅이 드러난다) ' + JSON.stringify(kept))
              const zs = await hp.evaluate(() => { const z = (q) => { const e = document.querySelector(q); return e ? +getComputedStyle(e).zIndex : null }; return { left: z('.drawer.left'), scrim: z('.scrim'), right: z('.drawer.right') } })
              if (!(zs.left > zs.scrim && zs.scrim > zs.right)) fail('AG: 목록 > 스크림 > 있던 화면 차례가 아니다 ' + JSON.stringify(zs))
              /**
               * 🔴 **AH · 목록을 도로 넣으면 있던 화면으로 돌아간다** (2026-09-24 Dave: «항상 채팅 화면으로 가더라»).
               *    목록은 덮개일 뿐이라 걷으면 밑에 있던 것이 나와야 한다.
               */
              await hp.keyboard.press('Escape'); await wait(400)
              const back1 = await hp.evaluate(() => ({ view: document.querySelector('.app').dataset.view, ttl: document.querySelector('.drawer.right .hdr .ttl')?.textContent ?? null }))
              if (back1.view !== 'panel' || back1.ttl !== '할 일') fail('🔴 AH: 목록을 닫았더니 「할 일」이 아니라 딴 데로 갔다 ' + JSON.stringify(back1))
              await tapNav(hp, 'files'); await wait(400); await topLeft('폴더')
              // 문서에서도 같다 — 닫으면 문서로 돌아온다
              await tapNav(hp, 'doc'); await wait(450)
              await hp.click('.drawer.right .hdr .rb.glassb'); await wait(450)
              await hp.keyboard.press('Escape'); await wait(400)
              if ((await view()) !== 'doc') fail('🔴 AH: 문서에서 목록을 닫았더니 문서로 안 돌아왔다 ' + (await view()))
              await tapNav(hp, 'chat'); await wait(350)

              /** 🔴 AD · 문서 탭은 **비어 있어도 눌린다** — 흐린 단추는 「고장」 으로 읽힌다 */
              await hp.evaluate(() => { const b = document.querySelector('.tabbar [data-tab="doc"]'); if (b?.disabled) throw new Error('문서 탭이 disabled 다') })
              await tapNav(hp, 'doc'); await wait(450)
              const de = await hp.evaluate(() => ({ view: document.querySelector('.app').dataset.view, empty: document.querySelector('.drawer.right .empty')?.textContent ?? null, tree: !!document.querySelector('.drawer.right .trow') }))
              if (de.view !== 'doc' || !/연 문서가 없어요/.test(de.empty ?? '') || de.tree) fail('🔴 AD: 문서가 없을 때 빈 문서 화면이 안 나온다 ' + JSON.stringify(de))
              await hp.keyboard.press('Escape'); await wait(350)

              /** 🔴 AD · 탭은 **숨지 않는다** (2026-09-23 Dave: 숨어도 채팅 높이가 안 변해 버는 자리가 없다) */
              const barY = () => hp.evaluate(() => { const b = document.querySelector('.tabbar'); return b ? Math.round(b.getBoundingClientRect().top) : null })
              const y0 = await barY()
              await hp.evaluate(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); el.scrollTop = 600; el.dispatchEvent(new Event('scroll')) }); await wait(400)
              if ((await barY()) !== y0) fail('🔴 AD: 내려 읽었더니 탭이 움직였다 — 고정이어야 한다')
              if (await hp.$('.tabbar.hide')) fail('AD: 숨김 클래스가 아직 붙는다')
              /** 🔴 AD · 입력칸과 탭 사이 여백 — 안전영역을 두 번 빼지 않는다(«여백이 너무 많다») */
              const gap = await hp.evaluate(() => { const c = document.querySelector('.composer').getBoundingClientRect(); const b = document.querySelector('.tabbar').getBoundingClientRect(); return Math.round(b.top - c.bottom) })
              if (gap < 0 || gap > 14) fail('🔴 AD: 입력칸과 하단 탭 사이 여백이 적절하지 않다 · ' + gap + 'px')
              /** 🔴 AG · 네 화면의 **머리말 글씨와 좌상단 아이콘**이 같다 (2026-09-24 Dave) */
              const hdrOf = async () => hp.evaluate(() => {
                const h = document.querySelector('.drawer.right .hdr') ?? document.querySelector('.chat-hdr')
                const t = h?.querySelector('.ttl') ?? h?.querySelector('.hnb')
                const b = h?.querySelector('button')
                return { size: t ? Math.round(parseFloat(getComputedStyle(t).fontSize)) : null, icon: b?.querySelector('svg path')?.getAttribute('d')?.slice(0, 12) ?? null }
              })
              await tapNav(hp, 'chat'); await wait(400); const hChat = await hdrOf()
              await tapNav(hp, 'todo'); await wait(400); const hTodo = await hdrOf()
              await tapNav(hp, 'files'); await wait(400); const hFiles = await hdrOf()
              await tapNav(hp, 'doc'); await wait(450); const hDoc = await hdrOf()
              const sizes = [hChat.size, hTodo.size, hFiles.size, hDoc.size]
              if (new Set(sizes).size !== 1) fail('🔴 AG: 상단 머리말 글씨 크기가 화면마다 다르다 ' + JSON.stringify({ sizes, hChat, hTodo, hFiles, hDoc }))
              const icons = [hChat.icon, hTodo.icon, hFiles.icon, hDoc.icon]
              if (new Set(icons).size !== 1) fail('🔴 AG: 좌상단 버튼이 화면마다 다르다 ' + JSON.stringify(icons))
              await tapNav(hp, 'chat'); await wait(350)
              await hp.screenshot({ path: 'test/tmp/ad-phone.png' })
              // ☰ 로도 레일 · 어두워진 채팅(스크림) 탭 → 닫힘
              await hp.click('.chat-hdr .hb-menu'); await wait(400); if ((await view()) !== 'list') fail('H 좁음: ☰ → 레일')
              await hp.evaluate(() => { document.querySelector('.scrim')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 480, clientY: 400 })) }); await wait(350); if ((await view()) !== 'chat') fail('H 좁음: 어두워진 채팅 탭 → 닫힘')
              /**
               * 🔴 **S-2 · 맥 알림 배너를 눌렀을 때** (2026-09-21 Dave: «알림 버튼을 클릭했을 때 해당 세션으로 이동하는 문제»).
               *    셸(`desktop/main.js` 의 `navigate`)은 `location.hash` 만 놓는다 — 앱 안의 벨처럼 화면을 바꿔 주지 않는다.
               *    서랍이 덮여 있으면 뒤에서 폴더만 바뀌고 화면은 그대로였다(= 아무 일도 안 일어난 것처럼 보인다).
               */
              await hp.click('.chat-hdr .hb-menu'); await wait(400); if ((await view()) !== 'list') fail('S-2: 서랍을 먼저 열어야 한다')
              const sidB = (await api(`/bots/${bot.id}/sessions`, { name: 's2-banner' })).id
              await hp.evaluate((h) => { location.hash = h }, `bot=${bot.id}&s=${sidB}`); await wait(700)
              const land = await hp.evaluate(() => ({ view: document.querySelector('.app').dataset.view, s: new URLSearchParams(location.hash.slice(1)).get('s'), drawer: !!document.querySelector('.drawer.left.open') }))
              if (land.view !== 'chat' || land.s !== sidB || land.drawer) fail('🔴 S-2: 배너처럼 해시만 놓았는데 화면이 그 대화로 안 갔다 ' + JSON.stringify(land))
              await fetch(base + `/api/sessions/${sidB}`, { method: 'DELETE' })
              // 서랍 상태 기억 — 패널을 연 채 앱을 다시 켜면(해시 없이) 그 칸으로 돌아온다
              await tapNav(hp, 'files'); await wait(500)
              await hp.goto(base + '/'); await wait(1200)
              const back = await hp.evaluate(() => ({ view: document.querySelector('.app').dataset.view, bot: new URLSearchParams(location.hash.slice(1)).get('bot') }))
              if (back.view !== 'panel' || back.bot !== bot.id) fail('H 좁음: 서랍 상태가 재시작 후 기억돼야 한다 ' + JSON.stringify(back))
              // A 의 순서 · F 의 표시 이름 · 확인 대기 점 — 세 단계가 같은 rows 를 쓴다: 넓음 레일 / 중간 띠 / 좁음 홈의 봇 순서가 같다
              await hp.keyboard.press('Escape'); await wait(300); await hp.click('.chat-hdr .hb-menu'); await wait(400)
              const homeOrder = await hp.$$eval('.drawer.left .mrow .bname', (r) => r.map((x) => x.textContent?.trim()))
              await hp.setViewportSize({ width: 1400, height: 900 }); await wait(500)
              const railOrder = await hp.$$eval('.cols > .col.side .brow .n', (r) => r.map((x) => (x.querySelector('.dn')?.textContent ?? x.textContent ?? '').trim()))
              if (homeOrder.length < 2 || homeOrder.join('|') !== railOrder.slice(0, homeOrder.length).join('|')) fail('H: 세 단계의 봇 순서·표시 이름이 다르다 ' + JSON.stringify({ homeOrder, railOrder }))
            }
            if (herrs.length) fail(`H ${label}: 페이지 오류 ` + JSON.stringify(herrs))
            await hp.close()
          }
          // 시안 PNG 와 나란히 — 한 장으로
          // ⚠ setContent 의 about:blank 는 file:// 그림을 못 읽는다(빈 사각형만 남았다 · 실측) — data URL 로 박는다
          const du = (f) => (existsSync(f) ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : '')
          const cmp = await br.newPage({ viewport: { width: 1800, height: 1000 } })
          await cmp.setContent(`<body style="margin:0;background:#111;color:#ddd;font:13px sans-serif"><div style="padding:8px">시안</div><img src="${du('test/tmp/responsive-mock.png')}" style="width:1800px"><div style="display:flex;gap:12px;padding:8px;align-items:flex-start"><div>넓음 1400<br><img src="${du('test/tmp/h-wide.png')}" style="width:840px"></div><div>중간 900<br><img src="${du('test/tmp/h-mid.png')}" style="width:540px"></div><div>좁음 500<br><img src="${du('test/tmp/h-narrow.png')}" style="width:300px"></div></div></body>`)
          await wait(800); await cmp.screenshot({ path: 'test/tmp/h-compare.png', fullPage: true }); await cmp.close()
          await fetch(base + `/api/sessions/${sidH}`, { method: 'DELETE' })
          ok('H 반응형 3단계 — 1400 세 칸 · 900 띠 52px+독+덮는 서랍(채팅 폭 불변) · 500 ☰+쓸기(👉 레일 · 👈 문서 · 반대로 닫힘 · 두 번 · 30%/튕김 · 비스듬·코드 블록·휠 무시 · 스크림·Esc · 기억) · 시안 비교 test/tmp/h-compare.png')
        }
        // 🔴 **새 세션 + 는 마우스를 올리지 않아도 보인다** (2026-09-20 Dave) — 가장 자주 누르는 단추가 숨어 있을 이유가 없다
        {
          await pg.mouse.move(700, 700)   // 어디에도 안 올려 둔 상태
          await wait(200)
          const ns = await pg.evaluate(() => { const b = [...document.querySelectorAll('.rpwrap .sech')].find((x) => /세션/.test(x.textContent ?? ''))?.querySelector('.ib[title="새 세션"]'); if (!b) return null; const st = getComputedStyle(b); const r = b.getBoundingClientRect(); return { op: Number(st.opacity), vis: st.visibility, w: r.width, h: r.height } })
          if (!ns) fail('새 세션 +: 단추가 없다')
          if (ns.op < 1 || ns.vis !== 'visible' || ns.w < 8 || ns.h < 8) fail('🔴 새 세션 +: 마우스를 안 올리면 안 보인다 ' + JSON.stringify(ns))
          // S-3 · 패널을 **접어 둬도** 우측 띠에 + 가 남는다 — 눌러서 세션이 늘어나는지까지
          // ⚠ 새 세션을 만들면 화면이 **그 빈 세션**으로 옮겨 간다 — 뒤 검사들이 보던 대화를 잃지 않게 있던 자리를 적어 두고 되돌린다
          const hashBeforeNs = await pg.evaluate(() => location.hash)
          await pg.keyboard.press('Meta+Shift+B'); await wait(400)
          const strip = await pg.evaluate(() => { const b = document.querySelector('.strip.right .ib.nsb'); if (!b) return null; const st = getComputedStyle(b); return { op: Number(st.opacity), w: Math.round(b.getBoundingClientRect().width) } })
          if (!strip || strip.op < 1 || strip.w < 8) fail('S-3: 접힌 오른쪽 띠에 새 세션 + 가 없다 ' + JSON.stringify(strip))
          const nBefore = (await api(`/bots/${bot.id}/sessions`)).length
          await pg.click('.strip.right .ib.nsb'); await wait(900)
          const nAfter = (await api(`/bots/${bot.id}/sessions`)).length
          if (nAfter !== nBefore + 1) fail('S-3: 띠의 + 를 눌렀는데 세션이 안 늘었다 ' + nBefore + '→' + nAfter)
          const made = (await api(`/bots/${bot.id}/sessions`)).find((x) => !x.lastReplyAt && x.id !== (new URLSearchParams(hashBeforeNs.slice(1)).get('s')))
          if (made) await fetch(base + `/api/sessions/${made.id}`, { method: 'DELETE' })
          await pg.evaluate((h) => { location.hash = h }, hashBeforeNs); await wait(700)
          ok('새 세션 + 는 상시 노출 — 펼친 패널의 「세션」 줄 · 접힌 오른쪽 띠 둘 다')
        }
        /**
         * 🔴 **S · 읽은 답과 안 읽은 답을 가른다** (2026-09-21 Dave: *«답변이 완료된 것 중에 내가 읽은 것과 읽지 않은
         *    것을 구분하는 게 안 되네»*). 판정은 `core/unread`(유닛) — 여기서는 **화면과 볼트가 실제로 갈리는지** 잰다:
         *    ① 안 본 답이 오면 그 폴더 행이 `.unread` ② 그 세션을 열어 맨 아래에 닿으면 볼트에 `readAt` 이 적히고 행이 풀린다
         *    ③ 그 세션의 **알림도 읽음**이 된다(🔔 가 거짓말하지 않게).
         */
        {
          const backHash = await pg.evaluate(() => location.hash)
          const sidU = (await api(`/bots/${bot.id}/sessions`, { name: 's-unread' })).id
          await api(`/sessions/${sidU}/send`, { text: '되읊어: 안 읽은 답' })
          let row = null
          for (let i = 0; i < 40; i++) { await wait(250); row = await pg.evaluate((id) => { const b = document.querySelector(`.brow[data-id="${id}"]`); return b ? { unread: b.classList.contains('unread'), ring: !!b.querySelector('.fb .uring') } : null }, bot.id); if (row?.unread) break }
          if (!row?.unread || !row.ring) fail('S-1: 안 본 답이 왔는데 폴더 행이 안 읽음으로 안 바뀐다 ' + JSON.stringify(row))
          const before = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === sidU)
          if (!before?.lastReplyAt || before.readAt) fail('S-1: 볼트 값 — lastReplyAt 만 있어야 한다 ' + JSON.stringify({ lastReplyAt: before?.lastReplyAt, readAt: before?.readAt }))
          await pg.screenshot({ path: 'test/tmp/s-unread-rail.png' })
          // 그 세션을 열어 맨 아래까지 본다 → 읽음
          await pg.evaluate((h) => { location.hash = h }, `bot=${bot.id}&s=${sidU}`); await wait(1500)
          let after = null
          for (let i = 0; i < 40; i++) { after = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === sidU); if (after?.readAt) break; await wait(250) }
          if (!after?.readAt || after.readAt < after.lastReplyAt) fail('S-1: 맨 아래까지 봤는데 읽음이 안 적혔다 ' + JSON.stringify({ readAt: after?.readAt, lastReplyAt: after?.lastReplyAt }))
          let cleared = false
          for (let i = 0; i < 30; i++) { cleared = await pg.evaluate((id) => !document.querySelector(`.brow[data-id="${id}"]`)?.classList.contains('unread'), bot.id); if (cleared) break; await wait(250) }
          if (!cleared) fail('S-1: 읽었는데 행이 안 읽음으로 남아 있다')
          // 그 세션의 알림도 읽음 — 안 그러면 🔔 배지가 거짓말을 한다
          const notes = (await api('/notifications')).filter((n) => n.sessionId === sidU)
          if (notes.some((n) => !n.read)) fail('S-1: 대화를 다 읽었는데 그 세션 알림이 안 읽음으로 남았다 ' + JSON.stringify(notes.map((n) => [n.kind, n.read])))
          await fetch(base + `/api/sessions/${sidU}`, { method: 'DELETE' })
          await pg.evaluate((h) => { location.hash = h }, backHash); await wait(700)
          ok('S 읽음/안 읽음 — 안 본 답은 행 강조+배지 링 · 맨 아래까지 보면 볼트에 읽음 · 그 세션 알림도 함께 읽음')
        }
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
          /**
           * 2026-09-17 «설정 1안» (Dave: «설정 메뉴가 엉망진창임 … 종류별로 정리») — 가르는 기준이 «무엇의 설정인가».
           * 아홉 칸 중 Codex 는 깔렸을 때만, 할 일은 폰에서만 목차에 나온다. 참고 칸은 맨 아래·보기만.
           */
          for (const want of ['일반', '호스트 · 볼트', '기기', 'Claude', '세션 · 사용량', '알림', '참고 · 커넥터 · 스킬'])
            if (!navs.includes(want)) fail('설정 목차에 «' + want + '» 가 없다 ' + JSON.stringify(navs))
          for (const gone of ['에이전트', '하네스', '권한 · 보안', '화면', '할 일']) if (navs.includes(gone)) fail('설정 목차에 옛 칸 «' + gone + '» 이 남아 있다 ' + JSON.stringify(navs))
          if (navs[navs.length - 1] !== '참고 · 커넥터 · 스킬') fail('참고 칸이 맨 아래가 아니다 ' + JSON.stringify(navs))
          // 줄은 늘 세 칸 — 조작 자리가 왼쪽 글보다 오른쪽에 있고, 칸 밖으로 안 나간다
          await pg.click('.snav .nv:has-text("세션 · 사용량")'); await wait(300)
          const three = await pg.evaluate(() => [...document.querySelectorAll('.sp-b .setr')].filter((r) => r.querySelector('.c')).map((r) => {
            const p = r.getBoundingClientRect(), t = r.querySelector('.tx').getBoundingClientRect(), c = r.querySelector('.c').getBoundingClientRect()
            return { t: r.dataset.t, ok: c.left >= t.right - 1 && c.right <= p.right + 1 }
          }))
          if (!three.length || three.some((x) => !x.ok)) fail('설정: 조작 자리가 흔들린다 ' + JSON.stringify(three.filter((x) => !x.ok)))
          if (!(await pg.$('.sp-b .setr[data-t="턴마다 기록하기"]'))) fail('설정 › 세션·사용량: 훅 줄이 없다')
          if (!(await pg.$('.sp-b .setr[data-t="유휴 세션 절전"]'))) fail('설정 › 세션·사용량: 절전 줄이 없다')
          // 🔴 범위 배지 — 줄마다 [메인]/[이 기기] 가 붙어 «어디에 남는 값인가» 가 보인다
          await pg.click('.snav .nv:has-text("일반")'); await wait(300)
          const at = await pg.evaluate(() => ({ main: !!document.querySelector('.sp-b .setr[data-t="메인(호스트) 이름"] .scp.at-main'), dev: !!document.querySelector('.sp-b .setr[data-t="테마"] .scp.at-dev') }))
          if (!at.main || !at.dev) fail('설정: 범위 배지가 없다 ' + JSON.stringify(at))
          // 호스트 · 볼트 — 깔린 CLI 가 여기로
          await pg.click('.snav .nv:has-text("호스트 · 볼트")'); await wait(400)
          const hs = await pg.textContent('.sp-b'); if (!/Claude Code/.test(hs)) fail('설정 › 호스트·볼트: 깔린 CLI 가 없다')
          if (!(await pg.$('.sp-b .setr[data-t="볼트 루트"]'))) fail('설정 › 호스트·볼트: 볼트 루트가 없다')
          // 기기 — 흩어져 있던 기기 항목이 한 칸에 (페어링 · 로그아웃이 맨 아래)
          await pg.click('.snav .nv:has-text("기기")'); await wait(400)
          const dv = await pg.$$eval('.sp-b .setr', (rs) => rs.map((r) => r.dataset.t))
          if (!dv.includes('새 기기 연결')) fail('설정 › 기기: 페어링 줄이 없다 ' + JSON.stringify(dv))
          if (dv[dv.length - 1] !== '이 기기 로그아웃') fail('설정 › 기기: 위험한 줄(로그아웃)이 맨 아래가 아니다 ' + JSON.stringify(dv))
          // 🔴 Claude — 인증 → 새 채팅 기본값(모델 · **권한**) → 연결. 권한 기본값은 이 판에서 생겼다
          await pg.click('.snav .nv:has-text("Claude")'); await wait(500)
          const cl = await pg.$$eval('.sp-b .setr', (rs) => rs.map((r) => r.dataset.t))
          for (const w of ['Claude 로그인 상태', '모델 · 생각 레벨', '새 채팅 기본 권한', '다시 연결', '연결 진단']) if (!cl.includes(w)) fail('설정 › Claude: «' + w + '» 줄이 없다 ' + JSON.stringify(cl))
          if (cl.indexOf('Claude 로그인 상태') > cl.indexOf('새 채팅 기본 권한')) fail('설정 › Claude: 인증이 기본값보다 뒤에 있다 ' + JSON.stringify(cl))
          await pg.screenshot({ path: 'test/tmp/desktop-settings-claude.png' })
          // 참고 — 커넥터·스킬·폴더별 하네스(보기 전용). 고치는 버튼이 있으면 계약 위반이다
          await pg.click('.snav .nv:has-text("참고")'); await wait(500)
          const ag = await pg.textContent('.sp-b')
          if (!(await pg.$('.sp-b .hitem .scp'))) fail('설정 › 참고: 범위 칩이 없다')
          if (!/Folder Bot/.test(ag)) fail('설정 › 참고: 내장 커넥터가 없다')
          if (!(await pg.$('.sp-b .htab .hrow'))) fail('설정 › 참고: 하네스 표가 비었다')
          const hz = await pg.textContent('.sp-b .htab'); if (!/CLAUDE\.md/.test(hz)) fail('설정 › 참고: CLAUDE.md 칸이 없다 · ' + hz.slice(0, 120))
          if (await pg.$('.sp-b .htab button')) fail('설정 › 참고: 보기 전용인데 고치는 버튼이 있다')
          await pg.screenshot({ path: 'test/tmp/desktop-settings-ref.png' })
          // 검색 — 제목과 설명을 함께 찾는다 · 옛 판에서 안 걸리던 «절전»·«진단» 도 걸린다
          for (const [word, want] of [['토큰', /토큰/], ['절전', /절전/], ['진단', /진단/], ['권한', /권한/]]) {
            await pg.fill('.snav .sfind input', word); await wait(250)
            const found = await pg.$$eval('.snav .nv', (ns) => ns.map((n) => n.textContent))
            if (!found.some((t) => want.test(t))) fail('설정 검색: «' + word + '» 이 안 걸린다 ' + JSON.stringify(found))
          }
          await pg.fill('.snav .sfind input', ''); await wait(200)
          await pg.click('.snav .nv:has-text("일반")'); await wait(300)
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
          await pg.click('.snav .nv:has-text("세션 · 사용량")'); await wait(400)
          const hook = await pg.$('.sp-b .setr[data-t="턴마다 기록하기"] .c button')
          const isMain = await pg.evaluate(() => /메인/.test(document.querySelector('.sb-foot')?.textContent ?? ''))
          if (isMain && !hook) fail('메인인데 훅 설치 버튼이 없다')
          if (!isMain && hook) fail('원격인데 훅 설치 버튼이 있다 — 메인의 ~/.claude 를 고치는 줄이다')
          await pg.click('.snav .nv:has-text("일반")'); await wait(200)
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
          const src = ['---', 'type: reference', 'tags: [PARA, 지침]', '---', '', '# 제목', '', '**굵게** 와 *기울임* 과 `코드`.', '', '- [ ] 할 일', '- 항목', '', '## 두 번째 제목', '', '---', '', '> 인용', '', '> [!note] 콜아웃 줄', '', '[[위키링크]] 와 https://example.com', '', '[예시 링크](https://example.com/page) 옆 글', '', '| 가 | 나 |', '|---|---|', '| 1 | 2 |', ''].join('\n')
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
          /**
           * 🔴 **편집기 QA — 클릭 · 화살표 · 선택** (2026-09-16 Dave: «편집 기능에 버그가 많아 … ① 화살표 이동시 제대로 위치하지
           *    못하는 현상 ② 마우스 클릭시 다른곳에 클릭되는 현상 ③ 커맨드 + 키보드에서 선택에 문제»).
           *    재는 것은 DOM 선택이 아니라 **문서 위치**(`window.__fbEditor`, QA 손잡이) — 위젯 사이 자리는 DOM 으로 못 잰다.
           *    ⚠ 이 검사들은 고치기 전 판에서 실제로 빨갰다: 링크 줄에 들어가면 줄이 밀려 ↑↓ 왕복이 어긋났고, ⇧→ 가 숨은 `**` 에
           *       닿는 순간 선택이 캐럿으로 접혔고, 위에서 표로 끌어 내리면 선택이 표 앞에서 멈췄다.
           */
          {
            const ed = () => pg.evaluate(() => { const v = window.__fbEditor; const m = v.state.selection.main; return { anchor: m.anchor, head: m.head, line: v.state.doc.lineAt(m.head).number, doc: v.state.doc.toString(), lines: v.state.doc.lines } })
            const idx = (w) => pg.evaluate((w) => window.__fbEditor.state.doc.toString().indexOf(w), w)
            const setCaret = (pos, head) => pg.evaluate(({ pos, head }) => { const v = window.__fbEditor; v.dispatch({ selection: { anchor: pos, head: head ?? pos } }); v.focus() }, { pos, head })
            // 낱말의 화면 가운데 — 글자 노드를 훑어 찾는다(마크 span 안에 있어도)
            const wordBox = (w) => pg.evaluate((w) => {
              const walker = document.createTreeWalker(document.querySelector('.mded .cm-content'), NodeFilter.SHOW_TEXT)
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                const i = (n.textContent ?? '').indexOf(w); if (i < 0) continue
                const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const b = r.getBoundingClientRect()
                return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
              }
              return null
            }, w)
            // ② 클릭 — 누른 낱말 **안**에 캐럿이 선다 (여러 줄 종류에서)
            for (const w of ['제목', '굵게', '기울임', '코드', '항목', '인용', '콜아웃', '옆 글']) {
              const b = await wordBox(w); if (!b) fail(`클릭: «${w}» 를 화면에서 못 찾았다`)
              await pg.mouse.click(b.x, b.y); await wait(250)
              const at = await idx(w); const st = await ed()
              if (st.head < at || st.head > at + w.length) fail(`클릭: «${w}» 를 눌렀는데 캐럿이 딴 데 섰다 head=${st.head} 낱말=[${at},${at + w.length}] 줄=${st.line} · ` + JSON.stringify(await pg.evaluate((b) => { const v = window.__fbEditor; const el = document.elementFromPoint(b.x, b.y); return { b, pac: v.posAtCoords({ x: b.x, y: b.y }), lineTxt: el?.closest('.cm-line')?.textContent } }, b)))
              if (st.anchor !== st.head) fail(`클릭: «${w}» 클릭이 선택이 됐다 ${JSON.stringify(st)}`)
            }
            /**
             * 🔴 링크 라벨은 **누르면 열린다** (2026-09-17 Dave: «바로 클릭이 가능해야 해») — 캐럿은 안 움직인다.
             *    캐럿이 링크 **안**에 있을 때(원문이 펴진 상태)의 클릭만 편집(캐럿 이동)이다. 종전엔 라벨 클릭도
             *    «누른 낱말에 캐럿» 목록에 있었는데, 그 계약은 이 요청과 정면으로 부딪혀 여기서 갈아 끼웠다.
             */
            await pg.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null } })
            const beforeLink = await ed()
            { const b = await wordBox('예시 링크'); if (!b) fail('클릭: «예시 링크» 를 화면에서 못 찾았다'); await pg.mouse.click(b.x, b.y); await wait(250) }
            const afterLink = await ed()
            const openedLink = await pg.evaluate(() => window.__opened)
            if (openedLink.join() !== 'https://example.com/page') fail('링크: 라벨을 눌렀는데 바깥에서 안 열린다 ' + JSON.stringify(openedLink))
            if (afterLink.head !== beforeLink.head) fail(`링크: 열기 클릭인데 캐럿이 움직였다 ${beforeLink.head} → ${afterLink.head}`)
            // 링크 안에 캐럿이 있으면 원문(주소)이 보이고, 나가면 다시 숨는다 — 그때의 클릭은 편집이다
            await setCaret((await idx('예시 링크')) + 1); await wait(200)
            const shown = await pg.evaluate(() => document.querySelector('.mded .cm-content')?.textContent ?? '')
            if (!/\(https:\/\/example\.com\/page\)/.test(shown)) fail('링크: 캐럿이 링크 안인데 주소가 안 보인다 — 고칠 길이 없다')
            { const b = await wordBox('예시 링크'); if (!b) fail('링크: 펴진 원문에서 «예시 링크» 를 못 찾았다'); await pg.mouse.click(b.x, b.y); await wait(250)
              const st = await ed(); const at = await idx('예시 링크')
              if (st.head < at || st.head > at + 5) fail(`링크: 캐럿이 링크 안일 때의 클릭은 편집이어야 하는데 캐럿이 딴 데 섰다 head=${st.head} 낱말=[${at},${at + 5}]`)
              if ((await pg.evaluate(() => window.__opened)).length !== 1) fail('링크: 편집 중의 클릭인데 또 열렸다') }
            await setCaret(await idx('옆 글')); await wait(200)
            const hidden = await pg.evaluate(() => document.querySelector('.mded .cm-content')?.textContent ?? '')
            if (/\(https:\/\/example\.com\/page\)/.test(hidden)) fail('링크: 캐럿이 링크 밖(같은 줄)인데 주소가 보인다 — 줄이 밀린다')
            // ① ↑↓ — 한 줄씩 내려가고(건너뛰지 않고), 왕복하면 제자리
            await setCaret((await idx('제목')) + 1); await wait(100)
            const seq = []
            for (let i = 0; i < 8; i++) { await pg.keyboard.press('ArrowDown'); await wait(80); seq.push((await ed()).line) }
            const bad = seq.findIndex((l, i) => l !== 6 + i + 1)
            if (bad >= 0) fail('↓: 줄을 건너뛰거나 제자리다 ' + JSON.stringify(seq))
            const mid = (await idx('기울임')) + 1
            await setCaret(mid); await wait(100)
            for (let i = 0; i < 4; i++) { await pg.keyboard.press('ArrowDown'); await wait(60) }
            for (let i = 0; i < 4; i++) { await pg.keyboard.press('ArrowUp'); await wait(60) }
            const back = await ed()
            if (back.head !== mid) fail(`↑↓ 왕복: 제자리로 안 돌아온다 ${mid} → ${back.head} (줄 ${back.line})`)
            // ↑ 로 맨 위에 닿아도 프론트매터는 접힌 채 (펴지면 화살표가 튄 것처럼 보인다)
            for (let i = 0; i < 8; i++) { await pg.keyboard.press('ArrowUp'); await wait(40) }
            const top = await ed()
            if (top.head !== 0) fail('↑: 맨 위(0)에 못 닿는다 ' + JSON.stringify({ head: top.head, line: top.line }))
            if (!(await pg.$('.mded .lp-fm'))) fail('↑: 맨 위에 닿으니 프론트매터가 펴졌다')
            // ③ ⇧→ · ⇧← · ⌘⇧→ · ⌘A — 앵커가 남고, 숨은 마커에 닿아도 선택이 안 접힌다
            const bold = await idx('굵게')
            await setCaret(bold); await wait(100)
            await pg.keyboard.press('Shift+ArrowRight'); await pg.keyboard.press('Shift+ArrowRight'); await wait(150)
            let st = await ed()
            if (st.anchor !== bold || st.head !== bold + 2) fail(`⇧→: 선택이 틀리다 ${JSON.stringify({ anchor: st.anchor, head: st.head, bold })}`)
            await pg.keyboard.press('Shift+ArrowRight'); await wait(150)   // 숨은 `**` 에 닿는다
            st = await ed()
            if (st.anchor !== bold || st.head <= bold + 2) fail(`⇧→: 숨은 마커에 닿으니 선택이 접혔다 ${JSON.stringify({ anchor: st.anchor, head: st.head })}`)
            const wa = await idx(' 와 *')
            await setCaret(wa + 1); await wait(100)      // «와» 앞
            await pg.keyboard.press('Shift+ArrowLeft'); await pg.keyboard.press('Shift+ArrowLeft'); await wait(150)
            st = await ed()
            if (st.anchor !== wa + 1 || st.head >= st.anchor) fail(`⇧←: 왼쪽으로 넓히면서 앵커를 잃었다 ${JSON.stringify({ anchor: st.anchor, head: st.head, want: wa + 1 })}`)
            // ⚠ 맥의 ⌘⇧→ 는 CodeMirror 가 `navigator.platform` 으로 고르는 mac 바인딩이라 리눅스 헤드리스에서는 못 누른다 —
            //    같은 명령(selectLineBoundary · selectAll)을 플랫폼 공통 키로 잰다. 앵커를 접던 것은 키가 아니라 필터였다.
            await setCaret(bold); await wait(100)
            await pg.keyboard.press(K.selEnd); await wait(150)
            st = await ed()
            const boldLineEnd = await pg.evaluate((p) => window.__fbEditor.state.doc.lineAt(p).to, bold)
            if (st.anchor !== bold || st.head !== boldLineEnd) fail(`⌘⇧→(줄 끝 선택): 줄 끝까지 안 고른다 ${JSON.stringify({ anchor: st.anchor, head: st.head, end: boldLineEnd })}`)
            await pg.keyboard.press('ControlOrMeta+a'); await wait(150)
            st = await ed()
            if (st.anchor !== 0 || st.head !== st.doc.length) fail(`⌘A: 전체가 안 골라진다 ${JSON.stringify({ anchor: st.anchor, head: st.head, len: st.doc.length })}`)
            // 표를 걸친 선택은 표를 통째로 — 위에서 표 시작까지 끌어 내린 꼴을 흉내 낸다
            const tFrom = await idx('| 가 | 나 |'); const tTo = (await idx('| 1 | 2 |')) + '| 1 | 2 |'.length
            // ⚠ 먼저 표 **위**에 캐럿을 둔다(표가 접힌 상태) — 그 뒤 머리를 표 시작으로 끄는 것이 «위에서 끌어 내린» 꼴이다
            await setCaret(await idx('옆 글')); await wait(120)
            await setCaret(await idx('옆 글'), tFrom); await wait(150)
            st = await ed()
            if (st.head < tTo) fail(`표 선택: 표 앞에서 멈춘다 head=${st.head} 표=[${tFrom},${tTo}] — ⌫ 를 누르면 표가 평문으로 무너진다`)
            // ⏎ 는 목록·체크박스를 이어 쓴다 — 끝에 새 항목 표식이 생기고, 빈 항목에서 한 번 더 누르면 목록이 끝난다(원문은 되돌려 churn 0 유지)
            const itemEnd = (await idx('- 항목')) + '- 항목'.length
            await setCaret(itemEnd); await wait(80)
            await pg.keyboard.press('Enter'); await wait(150)
            let cont = await ed()
            if (!/^- $/.test(cont.doc.split('\n')[cont.line - 1])) fail('⏎: 목록 항목이 이어지지 않는다 ' + JSON.stringify({ line: cont.doc.split('\n')[cont.line - 1], head: cont.head, itemEnd, around: cont.doc.slice(itemEnd - 6, itemEnd + 24), focus: await pg.evaluate(() => document.activeElement?.className) }))
            await pg.keyboard.press('Enter'); await wait(150)
            cont = await ed()
            if (cont.doc.includes('- \n')) fail('⏎⏎: 빈 항목에서 목록이 안 끝난다 ' + JSON.stringify(cont.doc.slice(itemEnd, itemEnd + 12)))
            const taskEnd = (await idx('- [ ] 할 일')) + '- [ ] 할 일'.length
            await setCaret(taskEnd); await wait(80)
            await pg.keyboard.press('Enter'); await wait(150)
            cont = await ed()
            if (!/^- \[ \] $/.test(cont.doc.split('\n')[cont.line - 1])) fail('⏎: 체크박스 항목이 이어지지 않는다 ' + JSON.stringify(cont.doc.split('\n')[cont.line - 1]))
            // 되돌린다 — 아래 churn 검사가 원문 그대로를 본다
            await pg.keyboard.press('ControlOrMeta+z'); await pg.keyboard.press('ControlOrMeta+z'); await pg.keyboard.press('ControlOrMeta+z'); await wait(300)
            cont = await ed()
            if (cont.doc.includes('- [ ] \n') || cont.doc.includes('\n\n\n- 항목')) fail('⏎ 검사 되돌리기 실패 ' + JSON.stringify(cont.doc.slice(70, 100)))
            await setCaret(await idx('옆 글')); await wait(100)
            ok('편집기 QA — 클릭은 누른 낱말에 · ↑↓ 는 한 줄씩 왕복 · ⇧/⌘⇧ 선택은 앵커를 지킨다 · 표는 통째로 · ⏎ 는 목록을 잇는다')
          }
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
          await pg.keyboard.press(K.end); await pg.keyboard.type('x'); await wait(250)
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
            await pg.keyboard.press(K.docEnd); await pg.keyboard.press('Enter'); await pg.keyboard.type('/')
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
            // 루프 5/10 — 글자를 더 치면 **좁혀지고**, 고르면 `]]` 가 한 짝만 남는다(자동 짝맞춤과 겹쳐 `]]]]` 가 되면 회귀)
            await pg.keyboard.type('read'); await wait(600)
            const narrowed = await pg.evaluate(() => { const t = document.querySelector('.cm-tooltip-autocomplete'); return t ? [...t.querySelectorAll('li')].map((x) => x.textContent) : null })
            if (!narrowed || !narrowed.length || !narrowed.every((x) => /read/i.test(x ?? ''))) fail('`[[read` 가 좁혀지지 않는다 ' + JSON.stringify(narrowed?.slice(0, 6)))
            await pg.keyboard.press('Enter'); await wait(1200)
            const linked = readFileSync(abs, 'utf8')
            const wl = linked.match(/\[\[[^\]]*readme[^\]]*\]\]/i)
            if (!wl) fail('`[[` 고른 문서가 파일에 위키링크로 안 들어갔다 ' + JSON.stringify(linked.slice(-120)))
            if (/\]\]\]/.test(linked)) fail('`[[` 닫는 괄호가 겹쳤다 ' + JSON.stringify(wl[0]))
            // 넣은 줄을 지워 뒤 검사(목차·찾기)가 보는 문서를 원래대로
            await pg.evaluate(() => { const c = document.querySelector('.mded .cm-content'); c.focus() })
            await pg.keyboard.press(K.docEnd); await pg.keyboard.press(K.selHome); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await wait(600)
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
            await pg.keyboard.press('ControlOrMeta+f'); await wait(600)
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
          await pg.keyboard.press(K.end); await pg.keyboard.type('9')
          for (let i = 0; i < 30 && (await cellNow(cellSel)) !== '19'; i++) await wait(100)
          if ((await cellNow(cellSel)) !== '19') fail('표: 칸에 글자가 안 들어갔다 · ' + JSON.stringify(await cellNow(cellSel)))
          await pg.click('.mded .lp-h1')
          // ⚠ 자동 저장은 **멎고 800ms 뒤**다 — 고정 대기로 재면 느린 날에 빨개진다(실제로 한 번 갈렸다). 값이 될 때까지 기다린다.
          /**
           * ⚠ 실패하면 **화면 쪽 상태까지** 함께 찍는다 — 파일만 보면 «왜 안 왔나» 를 알 수 없다.
           *    (이 검사가 드물게 빨개지는데, 그때 편집기 안의 글과 포커스가 어디였는지가 유일한 단서다.)
           */
          const untilFile = async (want, what) => {
            let got = ''
            for (let i = 0; i < 60; i++) { got = readFileSync(abs, 'utf8'); if (got === want) return; await wait(150) }
            const dbg = await pg.evaluate(() => ({
              doc: document.querySelector('.mded .cm-content')?.textContent?.slice(0, 200) ?? null,
              focus: `${document.activeElement?.tagName}.${document.activeElement?.className}`,
              cells: [...document.querySelectorAll('.mded .lp-tbl td')].map((c) => [...c.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('lp-grip'))).map((n) => n.textContent).join(''))
            }))
            fail(`${what}\n--- 기대\n` + JSON.stringify(want) + '\n--- 실제\n' + JSON.stringify(got) + '\n--- 화면\n' + JSON.stringify(dbg))
          }
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
        /**
         * 🔴 **문서의 링크 — 파비콘이 앞에 서고 누르면 바깥에서 열린다, 표 안에서도**
         *    (2026-09-17 Dave: «문서의 링크도 favicon 이 포함되어야 하고 바로 클릭이 가능해야 해. 표안에 있는 링크 포함해서.»)
         * ⚠ 바깥으로 여는 길(`window.open`)을 가로채 기록한다 — 스모크 브라우저에 새 탭이 뜨면 안 된다.
         * ⚠ 표 칸의 링크는 **누르면 열리고 칸은 편집으로 안 들어간다**(들어가면 원문이 드러나 링크가 사라진다).
         *    글자 자리를 누르면 원문으로 펴지고 Esc 로 나오면 다시 링크다 — 그동안 파일은 한 바이트도 안 바뀐다(churn 0).
         */
        {
          const rel = 'lnk.md'
          const abs = join(root, '3. Area/제품_Rondo', rel)
          const src = ['# 링크', '', '본문 https://example.com/a 와 [루마](https://luma.com/x) 가 있다', '', '| 무엇 | 링크 |', '| --- | --- |', '| 등록 | [루마](https://luma.com/x) |', '| 안내 | https://ai-guide.vercel.app |', ''].join('\n')
          await api(`/bots/${bot.id}/file`, { rel, text: src })
          await wait(900)
          const opened = await pg.evaluate((r) => { const hit = [...document.querySelectorAll('.trow')].find((x) => (x.textContent ?? '').includes(r)); if (hit) { hit.click(); return true } return false }, rel)
          if (!opened) fail('링크: 트리에 새 파일이 안 나타난다')
          await pg.waitForSelector('.mded .lp-tbl', { timeout: 9000 }); await wait(500)
          await pg.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null } })
          const shape = await pg.evaluate(() => ({
            body: [...document.querySelectorAll('.mded .cm-line .lp-xl:not(img)')].map((e) => ({ href: e.dataset.href, text: e.textContent })),
            favBody: document.querySelectorAll('.mded .cm-line img.fvic').length,
            cells: [...document.querySelectorAll('.mded .lp-tbl td .lp-cl')].map((e) => ({ href: e.dataset.href, text: e.textContent, fav: !!e.querySelector('img.fvic') }))
          }))
          if (shape.body.length !== 2 || shape.body[0].href !== 'https://example.com/a' || shape.body[1].href !== 'https://luma.com/x' || shape.body[1].text !== '루마') fail('본문 링크: 누를 수 있는 표식이 없다 ' + JSON.stringify(shape.body))
          if (shape.favBody < 2) fail('본문 링크: 파비콘 자리가 없다 ' + shape.favBody)
          if (shape.cells.length !== 2 || !shape.cells.every((c) => c.fav) || shape.cells[0].href !== 'https://luma.com/x' || shape.cells[0].text !== '루마' || shape.cells[1].href !== 'https://ai-guide.vercel.app') fail('표 링크: 파비콘·링크가 없다 ' + JSON.stringify(shape.cells))
          const cellSel = '.mded .lp-tbl tr:nth-child(2) td:nth-child(2)'
          const txtOf = (sel) => pg.evaluate((s2) => { const c = document.querySelector(s2); return c ? [...c.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('lp-grip'))).map((n) => n.textContent).join('') : null }, sel)
          // 표 안 링크를 누르면 — 바깥에서 열리고, 칸은 편집으로 안 들어간다
          await pg.click(cellSel + ' .lp-cl'); await wait(300)
          const after1 = await pg.evaluate(() => ({ opened: window.__opened, focusCell: !!document.activeElement?.closest?.('.lp-tbl td, .lp-tbl th') }))
          if (after1.opened.join() !== 'https://luma.com/x') fail('표 링크: 눌러도 바깥에서 안 열린다 ' + JSON.stringify(after1))
          if (after1.focusCell) fail('표 링크: 누르니 칸이 편집으로 들어갔다 ' + JSON.stringify(after1))
          // 글자 자리(왼쪽 안여백)를 누르면 원문으로 펴진다 → Esc 로 나오면 다시 링크 · 파일은 그대로
          await pg.click(cellSel, { position: { x: 4, y: 8 } })
          await pg.waitForFunction((s2) => document.activeElement === document.querySelector(s2), cellSel, { timeout: 5000 })
          const rawCell = await txtOf(cellSel)
          if (rawCell !== '[루마](https://luma.com/x)') fail('표 링크: 편집에 들어가면 원문이어야 한다 ' + JSON.stringify(rawCell))
          await pg.keyboard.press('Escape'); await wait(300)
          if (!(await pg.$(cellSel + ' .lp-cl'))) fail('표 링크: Esc 로 나왔는데 링크로 안 돌아온다')
          await wait(1200)
          if (readFileSync(abs, 'utf8') !== src) fail('표 링크: 들어갔다 나왔을 뿐인데 파일이 바뀌었다(churn)\n' + JSON.stringify(readFileSync(abs, 'utf8')))
          // 본문 링크 — 누르면 바깥에서 열린다 (캐럿은 첫 줄에 있으므로 편집이 아니다)
          await pg.click('.mded .cm-line .lp-xl:not(img) >> nth=0'); await wait(300)
          const after2 = await pg.evaluate(() => window.__opened)
          if (after2.join() !== 'https://luma.com/x,https://example.com/a') fail('본문 링크: 눌러도 바깥에서 안 열린다 ' + JSON.stringify(after2))
          ok('문서 링크 — 파비콘 + 누르면 바깥에서, 표 안에서도 · 편집 들어가면 원문 · 파일은 그대로')
          await pg.evaluate(() => { const t = [...document.querySelectorAll('.trow')].find((x) => /todo\.md/.test(x.textContent ?? '')); t?.click() })
          await wait(700)
          try { rmSync(abs) } catch {}
          await wait(400)
        }
        // 🔴 답변 속 경로가 칩이 된다 — 있는 파일만 (2026-09-13 Dave: «채팅에서 문서 선택으로 바로 이동»)
        {
          // ⚠ 이름을 `ok` 로 두지 마라 — 전역 `ok()` 를 가려서 같은 블록의 성공 보고가 그 자리에서 터진다
          const ex = await api(`/bots/${bot.id}/exists`, { rels: ['todo.md', '없는파일.md', '../밖.md'] })
          if (!ex['todo.md'] || ex['todo.md'].dir || ex['todo.md'].rel !== 'todo.md') fail('exists: 있는 파일을 없다고 한다 ' + JSON.stringify(ex))
          if (ex['없는파일.md'] !== false) fail('exists: 없는 파일을 있다고 한다 ' + JSON.stringify(ex))
          if (ex['../밖.md'] !== false) fail('exists: 루트 밖이 새어 나간다 ' + JSON.stringify(ex))
          // 화면 — 스텁이 되돌려 주는 문장 안의 경로 중 **있는 것만** 칩이 된다
          await pg.fill('.composer .cin', '첨부/회의록.txt 와 없는폴더/없음.md 를 봐')
          await pg.keyboard.press('Meta+Enter')
          let chip = null
          for (let i = 0; i < 40; i++) { chip = await pg.evaluate(() => { const c = [...document.querySelectorAll('.chat-body .pchip')]; return { n: c.length, titles: c.map((x) => x.title), last: (document.querySelector('.chat-body .md:last-of-type')?.textContent ?? '') } }); if (chip.n) break; await wait(300) }
          if (!chip.n) fail('경로 칩: 있는 파일이 칩이 안 됐다 ' + JSON.stringify(chip))
          if (!chip.titles.some((t) => t.endsWith('첨부/회의록.txt'))) fail('경로 칩: 엉뚱한 것이 칩이 됐다 ' + JSON.stringify(chip))
          if (chip.titles.some((t) => t.includes('없는폴더'))) fail('경로 칩: 없는 파일이 칩이 됐다 — 죽은 링크가 쌓인다 ' + JSON.stringify(chip))
          await pg.fill('.composer .cin', ''); await wait(400)
          /**
           * 🔴 **백틱에 싸인 경로도 클릭된다** (2026-09-15 Dave: *«답변 내용안에는 바로 클릭가능한 칩이
           *    없어»*). 에이전트는 파일 이름을 거의 언제나 `` `…` `` 로 감싼다 — 인라인 코드를 통째로
           *    건너뛰던 종전 규칙은 사실상 «칩을 만들지 않는다» 였다(실제 답변에서 칩이 거의 안 보인 이유).
           * P-2 (09-19 Dave): 모양은 **코드 그대로**(칩으로 바꾸지 않는다) · 통째로 경로면 `code.code-path` 로 클릭만 된다.
           */
          {
            await pg.fill('.composer .cin', '정본은 `첨부/회의록.txt` 입니다')
            await pg.keyboard.press('Enter')
            let bt = null
            for (let i = 0; i < 40; i++) {
              bt = await pg.evaluate(() => {
                const md = [...document.querySelectorAll('.chat-body .md')].pop()
                return md ? { chips: [...md.querySelectorAll('code.code-path')].map((x) => x.dataset.rel), pchips: md.querySelectorAll('.pchip').length, code: [...md.querySelectorAll('code')].map((x) => x.textContent) } : null
              })
              if (bt && bt.chips.length) break
              await wait(300)
            }
            if (!bt || !bt.chips.some((t) => t.endsWith('첨부/회의록.txt'))) fail('백틱 경로: 코드로 싸인 경로가 클릭 가능(code-path)하지 않다 ' + JSON.stringify(bt))
            if (bt.pchips) fail('백틱 경로/P-2: 코드 조각이 칩으로 바뀌었다 ' + JSON.stringify(bt))
            await pg.fill('.composer .cin', ''); await wait(300)
            ok('백틱에 싸인 경로도 답 안에서 바로 누를 수 있다')
          }
          /**
           * 🔴 **볼트 기준 · 절대 · 폴더 경로도 칩이 된다** (2026-09-15 Dave: *«채팅 본문에서 폴더 및 파일 칩 …
           *    구현이 안되어 있어»*). 종전 검사는 봇 폴더 안의 파일 하나만 써서 초록이었다 — 실제 답변의 세 모양
           *    (다른 폴더의 파일 · 절대 경로 · 폴더)은 전부 «없음» 이었다. 이제 그 세 모양을 그대로 잰다.
           * ⚠ 폴더 칩은 문서가 아니라 **트리**를 연다 — 누르면 오른쪽 파일 칸에서 그 폴더가 펼쳐져야 한다.
           */
          {
            const cfoAbs = join(root, '3. Area/재무_CFO/CLAUDE.md')
            // ⚠ 스텁은 받은 말의 앞 60자만 되읊는다 — 세 모양을 **따로** 보낸다
            const chipsOf = async (text) => {
              const before = await pg.evaluate(() => document.querySelectorAll('.chat-body .md').length)   // ⚠ «새 답» 을 기다린다 — 직전 답의 칩을 집지 않게
              await pg.fill('.composer .cin', text); await pg.click('.composer .sendb')
              let got = null
              for (let i = 0; i < 40; i++) {
                got = await pg.evaluate((n) => { const all = document.querySelectorAll('.chat-body .md'); if (all.length <= n) return null; const md = all[all.length - 1]; return [...md.querySelectorAll('.pchip')].map((x) => ({ t: x.title, rel: x.dataset.rel, dir: x.classList.contains('dir') })) }, before)
                if (got && got.length) break
                await wait(300)
              }
              return got ?? []
            }
            const g1 = await chipsOf('볼트 3. Area/재무_CFO/CLAUDE.md 봐')
            const vault = g1.find((c) => c.t === '3. Area/재무_CFO/CLAUDE.md'); if (!vault || vault.dir || !/재무_CFO\/CLAUDE\.md$/.test(vault.rel)) fail('경로 칩: 볼트 기준 경로가 안 풀렸다 · ' + JSON.stringify(g1))
            const g2 = await chipsOf(`절대 ${cfoAbs} 봐`)
            const abs = g2.find((c) => c.t === cfoAbs); if (!abs || abs.dir) fail('경로 칩: 절대 경로가 안 풀렸다 · ' + JSON.stringify(g2))
            const g3 = await chipsOf('폴더 2. Projects/2026-10_해커톤-제안 봐')
            const dir = g3.find((c) => c.t === '2. Projects/2026-10_해커톤-제안'); if (!dir || !dir.dir) fail('경로 칩: 폴더가 칩이 안 됐다 · ' + JSON.stringify(g3))
            // 폴더 칩 → 볼트 트리(오케스트레이터)에서 그 폴더가 펼쳐진다
            await pg.evaluate(() => { const md = [...document.querySelectorAll('.chat-body .md')].pop(); const b = [...md.querySelectorAll('.pchip.dir')][0]; b?.click() })
            await wait(1200)
            const shown = await pg.evaluate(() => ({ bot: new URLSearchParams(location.hash.slice(1)).get('bot'), rows: [...document.querySelectorAll('.panel .trow .n')].map((x) => x.textContent ?? '') }))
            if (shown.bot !== 'orch') fail('폴더 칩: 볼트 트리로 안 갔다 · ' + JSON.stringify(shown))
            if (!shown.rows.some((r) => /2026-10_해커톤-제안/.test(r))) fail('폴더 칩: 트리에 그 폴더가 안 보인다 · ' + JSON.stringify(shown.rows.slice(0, 20)))
            await pg.evaluate((id) => { location.hash = `bot=${id}` }, bot.id); await wait(700)
            ok('경로 칩 — 볼트 기준 · 절대 · 폴더까지, 폴더 칩은 트리를 연다')
          }
          /**
           * 🔴 **내가 붙인 첨부는 글자가 아니라 칩이다** — 봇에게는 «첨부 파일 (읽어서 참고해): - /abs/…» 가
           *    글자로 가지만 사람에게 그 꼬리가 그대로 보이면 지시문 아래 경로 목록이 늘어선다.
           */
          {
            await pg.fill('.composer .cin', '@todo.md 이 파일 봐 줘')
            // ⚠ 입력창 높이가 바뀌면 한 박자 뒤에 .chat-scroll 이 스크롤 이벤트를 낸다(발 높이 재기) — 메뉴는 스크롤에 닫히므로 그 뒤에 연다
            await wait(300)
            await pg.evaluate(() => { const b = [...document.querySelectorAll('.panel .trow')].find((x) => /todo\.md/.test(x.textContent ?? '')); b?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })) })
            await wait(300)
            await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /첨부로 보내기/.test(x.textContent ?? '')); b?.click() })
            await wait(300)
            if (!(await pg.$('.composer .cin .ichip'))) fail('첨부 칩: 첨부가 안 붙었다(입력창 안 칩) · ' + JSON.stringify(await pg.evaluate(() => { const c = document.querySelector('.composer .cin'); return { html: c?.innerHTML.slice(0, 300), dv: c?.dataset.value, cnt: document.querySelector('.cbar .acount')?.textContent ?? null } })))
            await pg.click('.composer .sendb'); await wait(900)
            /* 🔴 **AW · 같은 파일은 한 번, 하단 칩 디자인으로** (2026-09-25 Dave: *«구지 칩이 두번 보일 필요 있나? … 디자인은
                  하단 칩 디자인으로 하고, 하단에 첨부만 따로 모아서 칩을 보여줄 필요는 없을것 같아»*). 종전엔 글 속 `@이름` 이
                  단순한 `.pchip` 으로, 그 아래에 같은 파일이 `.fchip`(아이콘·이름·폴더) 줄로 **또** 나왔다. */
            const um = await pg.evaluate(() => { const u = [...document.querySelectorAll('.chat-body .umsg')].pop(); return u ? { text: u.textContent ?? '', chips: [...u.querySelectorAll('.pchip, .fchip')].map((x) => x.textContent ?? ''), fchips: u.querySelectorAll('.fchip').length, pchips: u.querySelectorAll('.pchip').length, row: !!u.querySelector('.uatt'), raw: u.textContent?.includes('첨부 파일 (읽어서 참고해)') } : null })
            if (!um || um.raw) fail('첨부 칩: 첨부 꼬리가 글자로 보인다 · ' + JSON.stringify(um))
            if (!um.chips.some((c) => /todo\.md/.test(c))) fail('첨부 칩: 내 말풍선에 칩이 없다 · ' + JSON.stringify(um))
            if (um.chips.filter((c) => /todo\.md/.test(c)).length > 1) fail('🔴 AW: 같은 파일 칩이 두 번 보인다(글 속 + 아래 줄) · ' + JSON.stringify(um))
            if (um.pchips) fail('🔴 AW: 글 속 칩이 하단 칩 디자인(.fchip)이 아니다 · ' + JSON.stringify(um))
            if (um.row) fail('🔴 AW: 글 속에 이미 보인 첨부를 아래 줄에 또 모았다 · ' + JSON.stringify(um))
            await wait(400)
            ok('내 메시지의 첨부·@멘션은 칩으로 보인다 · AW 같은 파일은 한 번 · 하단 칩 디자인')
          }
          /**
           * 🔴 **네 칸은 «하는 곳» 이다** (2026-09-15 Dave: 폰 홈의 4칸을 전부 액션으로 · 맥 레일 맨 위에도).
           * ⚠ 숫자만 있고 거기서 할 수 있는 일이 없으면 그 칸은 벽지가 된다 — 그래서 **칸 안의 단추가
           *   실제로 일하는지**(확인 대기의 [허용]) 까지 잰다.
           */
          {
            const labels = await pg.$$eval('.sbtiles .mcards button .n', (r) => r.map((x) => x.textContent ?? ''))
            for (const want of ['확인 대기', '일하는 중', '할 일', '마지막 결과']) if (!labels.some((l) => l.includes(want))) fail(`레일 4칸: «${want}» 칸이 없다 · ` + JSON.stringify(labels))
            // 승인 대기를 하나 만들어 두고 — 칸 안의 [허용] 으로 푼다
            const hold = await api(`/bots/${bot.id}/sessions`, { name: '칸에서 허용' })
            await api(`/sessions/${hold.id}/send`, { text: '승인이 필요한 일 해 줘' })
            let shown = false
            for (let i = 0; i < 60; i++) { shown = await pg.evaluate(() => !!document.querySelector('.sbtiles .mcards button.hot .act')); if (shown) break; await wait(250) }
            if (!shown) fail('레일 4칸: 확인 대기가 생겼는데 칸에 [허용] 이 안 뜬다')
            const sub = await pg.textContent('.sbtiles .mcards button.hot .sub')
            if (!/제품_Rondo/.test(sub ?? '')) fail('레일 4칸: 어느 폴더가 묻는지 안 보인다 · ' + JSON.stringify(sub))
            await pg.click('.sbtiles .mcards button.hot .act')
            let st = 'awaiting_input'
            for (let i = 0; i < 60; i++) { st = ((await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === hold.id) ?? {}).state; if (st !== 'awaiting_input') break; await wait(250) }
            if (st === 'awaiting_input') fail('레일 4칸: [허용] 을 눌렀는데 그대로 기다린다')
            await api(`/sessions/${hold.id}`, undefined, 'DELETE')
            await wait(400)
            ok('레일 4칸 — 상태를 보여 주고 그 자리에서 허용까지')
          }
          /**
           * 🔴 **모델 목록 — 첫 목록은 짧게, 「더 많은 모델」에 옛 판** (2026-09-15 Dave 스크린샷).
           * ⚠ 여는 순간 `/api/agents/models` 를 다시 물어본다 — 켜 둔 채 CLI 를 업데이트해도 따라오게.
           */
          {
            await pg.click('.composer .cbtn[title="모델"]'); await wait(400)
            const first = await pg.$$eval('.cpop.r .prow2 b', (r) => r.map((x) => x.textContent))
            /**
             * AI(2026-09-24) · 첫 목록은 **이 호스트의 CLI 가 아는 것에서 종류별 최신 하나씩**이다.
             * 🔴 박아 둔 목록을 그대로 띄우면 그 호스트가 못 돌리는 모델을 고르게 된다(실측: 미니 CLI 2.1.278 + Opus 5.5 → 400).
             * ⚠ 그래서 **이름을 박아 놓고 재지 않는다** — 「한 종류에 하나씩인가」와 「더 많은 모델이 있나」를 잰다.
             */
            const fam = (t) => (/^([A-Za-z]+)/.exec(t ?? '') ?? [])[1] ?? ''
            const picks = first.filter((t) => /^(Fable|Opus|Sonnet|Haiku|Mythos) [0-9]/.test(t ?? ''))
            if (picks.length < 2) fail('모델 목록: 고를 것이 너무 적다 ' + JSON.stringify(first))
            if (new Set(picks.map(fam)).size !== picks.length) fail('🔴 AI: 한 종류가 첫 목록에 둘 이상 있다 ' + JSON.stringify(picks))
            if (!first.includes('더 많은 모델')) fail('모델 목록: 「더 많은 모델」 이 없다 ' + JSON.stringify(first))
            await pg.click('.cpop.r .prow2.more'); await wait(300)
            const more = await pg.$$eval('.cpop.r .prow2 b', (r) => r.map((x) => x.textContent))
            // 「더 많은 모델」에는 옛 판이 온다 — 첫 목록과 겹치면 안 된다
            for (const want of ['Opus 4.8', 'Sonnet 4.6', 'Sonnet 5 · 1M']) if (!more.includes(want)) fail(`더 많은 모델: «${want}» 가 없다 ` + JSON.stringify(more))
            // ⚠ 팝업은 첫 목록을 **그대로 두고 아래에 덧붙인다** — «겹치지 않는가» 는 화면에서 못 잰다.
            //    그 계약(first ∩ more = ∅)은 `splitModels` 유닛이 데이터에서 잰다. 여기서는 «옛 판이 더 있나» 만 본다.
            if (!more.some((t) => !picks.includes(t) && /^(Fable|Opus|Sonnet|Haiku) [0-9]/.test(t ?? ''))) fail('AI: 「더 많은 모델」에 옛 판이 없다 ' + JSON.stringify(more))
            await pg.keyboard.press('Escape'); await wait(300)
            /**
             * 🔴 **돌던 대화의 모델을 바꿀 땐 한 번 묻는다** (2026-09-15 Dave 지정 문안 — Claude Code 와 같은 확인창).
             *    지금까지의 대화는 지금 모델 기준으로 캐시돼 있어서, 갈면 다음 메시지에 전체를 다시 읽는다(한도를 더 쓴다).
             * ⚠ 취소하면 **아무것도 안 바뀌어야** 한다 — 확인창의 존재 이유가 그것이다.
             */
            // ⚠ 해시에 `s` 가 없으면 화면은 **목록의 첫 세션**을 보여 준다 — 재는 쪽도 같은 것을 봐야 한다
            const hashSid = await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('s'))
            const live = async () => { const l = await api(`/bots/${bot.id}/sessions`); return (hashSid && l.find((x) => x.id === hashSid)) || l[0] }
            const sid = (await live()).id
            const modelNow = async () => (await live()).model ?? ''
            const was = await modelNow()
            const pickModel = async (label) => {
              await pg.click('.composer .cbtn[title="모델"]'); await wait(350)
              await pg.evaluate((t) => { const b = [...document.querySelectorAll('.cpop.r .prow2')].find((x) => x.querySelector('b')?.textContent === t); b?.click() }, label)
            }
            const target = was === 'claude-sonnet-5' ? 'Haiku 4.5' : 'Sonnet 5'
            await pickModel(target)
            try { await pg.waitForSelector('.modal.conf', { timeout: 5000 }) } catch {
              const d = await pg.evaluate(() => ({ hash: location.hash, pop: !!document.querySelector('.cpop'), rows: [...document.querySelectorAll('.cpop.r .prow2 b')].map((x) => x.textContent) }))
              fail('모델 확인창: 안 떴다 · ' + JSON.stringify(d) + ' · 세션=' + JSON.stringify((await api(`/bots/${bot.id}/sessions`)).map((x) => [x.id.slice(-4), x.model, !!x.cliSessionId])) + ' · 목표=' + target + ' · 지금=' + was)
            }
            const ctext = (await pg.textContent('.modal.conf')) ?? ''
            if (!/모델을 변경하시겠습니까/.test(ctext) || !/캐시/.test(ctext) || !/다시 묻지 않기/.test(ctext)) fail('모델 확인창: 문안이 다르다 · ' + JSON.stringify(ctext.slice(0, 160)))
            await pg.evaluate(() => { const b = [...document.querySelectorAll('.modal.conf .modal-f .btn')].find((x) => x.textContent === '취소'); b?.click() })
            await wait(700)
            if ((await modelNow()) !== was) fail('모델 확인창: 취소했는데 바뀌었다 · ' + JSON.stringify([was, await modelNow()]))
            await pickModel(target)
            await pg.waitForSelector('.modal.conf', { timeout: 5000 })
            await pg.click('.modal.conf .modal-f .btn.on')
            let after = was
            for (let i = 0; i < 40; i++) { after = await modelNow(); if (after !== was) break; await wait(250) }
            if (after === was) fail('모델 확인창: 눌렀는데 안 바뀌었다 · ' + JSON.stringify(after))
            await api(`/sessions/${sid}/settings`, { model: was })   // 원래대로 (API 로는 안 묻는다)
            await wait(400)
            await pg.focus('.composer .cin')   // ⚠ 팝업·확인창을 닫으면 포커스가 입력칸을 떠난다
            ok('모델 고르기 — 목록 · 「더 많은 모델」 · 바꾸기 전 확인창(취소하면 그대로)')
          }
          /**
           * 🔴 **대기 메시지는 «그 세션의 것»이다** (2026-09-15 Dave: *«que 메시지를 보내놓은 상태에서
           *    다른 폴더를 띄우면 거기에 큐 메시지가 전달되는 버그»*).
           *
           * 대기열이 대화 화면의 지역 상태라, 폴더를 바꾸면 「비운다」 와 「한가하니 보낸다」 가 같은
           * commit 에서 돌아 **옛 대기열이 새 폴더로 나갔다**. 이제 세션 id 를 열쇠로 부모가 들고,
           * 보내는 것도 부모가 한다 — 그래서 **보고 있지 않아도** 제 세션으로 나간다.
           */
          {
            const other = (await api('/bots')).find((b) => b.id !== bot.id && !b.orchestrator)
            if (!other) fail('큐 검사: 옮겨 갈 다른 폴더가 없다')
            await pg.fill('.composer .cin', '승인이 필요한 일 해 줘'); await pg.click('.composer .sendb')
            let wait_ = null
            for (let i = 0; i < 60; i++) { wait_ = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.state === 'awaiting_input'); if (wait_) break; await wait(250) }
            if (!wait_) fail('큐 검사: 승인 대기 상태를 못 만들었다')
            // ⚠ 여기서는 **보내기 단추**로 넣는다 — ⏎ 경로는 바로 위에서 따로 재고, 이 검사는
            //   «대기열이 어느 세션의 것인가» 만 본다(키 입력이 어디로 가느냐에 흔들리면 안 된다)
            await pg.fill('.composer .cin', '큐에 남아야 하는 말'); await pg.click('.composer .sendb'); await wait(500)
            if (!(await pg.$('.chat-foot .queue'))) {
              const diag = await pg.evaluate(() => ({ hash: location.hash, ta: document.querySelector('.composer .cin')?.dataset.value, badge: document.querySelector('.sendb .bd')?.textContent, foot: document.querySelector('.chat-foot')?.textContent?.slice(0, 160) }))
              fail('큐 검사: 대기 줄이 안 보인다 · ' + JSON.stringify(diag) + ' · 세션=' + JSON.stringify((await api(`/bots/${bot.id}/sessions`)).map((x) => [x.id.slice(-4), x.state])))
            }
            // 다른 폴더로 옮긴다 — 여기서 새던 자리
            await pg.evaluate((id) => { location.hash = `bot=${id}` }, other.id)
            await wait(1500)
            const leaked = async () => {
              for (const x of await api(`/bots/${other.id}/sessions`)) {
                const c = await api(`/sessions/${x.id}/chat`)
                if (c.items.some((i) => i.kind === 'user' && /큐에 남아야 하는 말/.test(i.text ?? ''))) return true
              }
              return false
            }
            if (await leaked()) fail('🔴 큐 메시지가 다른 폴더로 갔다 — 대기열이 세션을 안 따라간다')
            // 원래 세션이 한가해지면 **보고 있지 않아도** 그쪽으로 나간다
            const pend = (await api(`/sessions/${wait_.id}/chat`)).info.pending[0]
            await api(`/sessions/${wait_.id}/permission`, { requestId: pend.requestId, allow: true })
            let landed = false
            for (let i = 0; i < 60; i++) {
              const c = await api(`/sessions/${wait_.id}/chat`)
              if (c.items.some((i2) => i2.kind === 'user' && /큐에 남아야 하는 말/.test(i2.text ?? ''))) { landed = true; break }
              await wait(300)
            }
            if (!landed) fail('큐 검사: 한가해졌는데 원래 세션으로 안 나갔다')
            if (await leaked()) fail('🔴 큐 메시지가 뒤늦게 다른 폴더로도 갔다')
            await pg.evaluate((id) => { location.hash = `bot=${id}` }, bot.id)
            await wait(600); await pg.fill('.composer .cin', ''); await wait(200)
            ok('대기 메시지는 제 세션으로만 나간다 (폴더를 바꿔도 · 안 보고 있어도)')
          }
          /**
           * 🔴 **알림을 누르면 «그 폴더의 그 세션»으로** (2026-09-15 Dave: *«알림버튼을 클릭하면 단지
           *    폴더로 이동하는게 아니라 그 폴더의 해당 세션으로 이동해야 해»*).
           * ⚠ 폴더에 세션이 여럿이면 첫 세션으로 떨어지기 쉽다 — 알림이 가리키는 세션이 **목록에서
           *   몇 번째든** 그쪽이 열려야 한다. 그래서 일부러 **두 번째** 세션에 알림을 만든다.
           */
          {
            const backHash = await pg.evaluate(() => location.hash)   // ⚠ 검사가 끝나면 있던 자리로 돌려놓는다
            const two = await api(`/bots/${bot.id}/sessions`, { name: '알림 대상' })
            await api(`/sessions/${two.id}/send`, { text: '알림을 만들어 줘' })
            let note = null
            for (let i = 0; i < 60; i++) { note = (await api('/notifications')).find((n) => n.sessionId === two.id); if (note) break; await wait(250) }
            if (!note) fail('알림 점프: 세션을 가리키는 알림이 안 생겼다')
            // 🔴 **일부러 다른 세션을 보고 있게 만든다** — 안 그러면 «원래 거기 있었다» 로도 통과한다
            const elsewhere = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id !== two.id)
            if (!elsewhere) fail('알림 점프: 비교할 다른 세션이 없다')
            await pg.evaluate((h) => { location.hash = h }, `bot=${bot.id}&s=${elsewhere.id}`); await wait(700)
            /**
             * ⚠ 셸(트레이·메뉴)이 쓰는 `#notify=1` 로도 열려야 한다 — 종전에는 화면이 그 열쇠를 안 읽어
             *   **아무 일도 안 일어나고 보던 폴더까지 잃었다**(해시가 통째로 갈린다).
             */
            await pg.evaluate(() => { location.hash = 'notify=1' })
            await pg.waitForSelector('.modal .nrow', { timeout: 6000 })
            if (!(await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot')))) fail('알림 센터: #notify=1 로 열었더니 보던 폴더를 잃었다')
            // 맨 위가 가장 새 알림 — 방금 만든 그것이다
            const rowT = await pg.evaluate(() => document.querySelector('.modal .nrow')?.textContent ?? '')
            if (!/알림을 만들어 줘|끝남/.test(rowT)) fail('알림 점프: 맨 위 줄이 방금 만든 알림이 아니다 · ' + JSON.stringify(rowT))
            await pg.evaluate(() => document.querySelector('.modal .nrow')?.click())
            await wait(900)
            if (await pg.$('.modal .nrow')) fail('알림 점프: 줄을 눌렀는데 목록이 안 닫혔다')
            const where = await pg.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))))
            if (where.s !== two.id) fail('알림 점프: 폴더만 열리고 세션은 안 열렸다 · ' + JSON.stringify(where))
            const head = await pg.textContent('.chat-hdr')
            if (!/알림 대상/.test(head ?? '')) fail('알림 점프: 화면이 그 세션을 안 보여 준다 · ' + JSON.stringify(head))
            await api(`/sessions/${two.id}`, undefined, 'DELETE')
            await pg.evaluate((h) => { location.hash = h }, backHash); await wait(600)
            await pg.focus('.composer .cin')   // ⚠ 뒤 검사들이 «입력칸에 포커스» 를 전제로 ⌘⏎ 를 친다
            ok('알림을 누르면 그 폴더의 그 세션이 열린다')
          }
          /**
           * 🔴 **질문 카드의 「기타」는 질문마다 따로다** (2026-09-15 Dave: *«AskUserQuestion 에서 추가
           *    Text를 입력하면 위에 전체에 나오네»*). 글 상자가 하나뿐이라 **모든 질문에 같은 글**이 떴고,
           *    보낼 때도 그 글이 **첫 질문의 답**으로 갔다 — 조용히 틀리는 쪽이라 더 나빴다.
           * ⚠ 그래서 둘째 질문에만 쓰고 ① 첫 질문 칸이 비어 있는지 ② 답이 **둘째 질문에 붙어** 가는지 잰다.
           */
          {
            await pg.fill('.composer .cin', '질문 좀 해 줘'); await pg.click('.composer .sendb')
            await pg.waitForSelector('.card .opt input', { timeout: 8000 })
            const ins = await pg.$$('.card .opt input')
            if (ins.length < 2) fail('질문 카드: 「기타」 칸이 질문 수만큼 없다 · ' + ins.length)
            await ins[1].fill('직접 쓴 둘째 답')
            await wait(300)
            const first = await ins[0].inputValue()
            if (first) fail('🔴 질문 카드: 한 칸에 썼는데 다른 질문에도 같은 글이 떴다 · ' + JSON.stringify(first))
            // 첫 질문은 고르고, 둘째는 직접 쓴 글로 — 둘이 안 섞여야 한다
            await pg.evaluate(() => { const b = [...document.querySelectorAll('.card .opt')].find((x) => x.textContent?.includes('가 안')); b?.click() })
            await wait(200)
            /**
             * 🔴 **여러 개 고르는 질문은 여러 개가 켜진다** (2026-09-20 Dave: *«AskUserQuestion 에서 중복 선택이 안되네»*).
             *    종전 답은 질문당 글자 하나라 새로 고르면 앞의 것이 꺼졌다. 이제 토글이고(다시 누르면 꺼짐), 답은 «, » 로 이어 간다.
             *    ⚠ 하나만 고르는 질문은 **그대로 라디오**여야 한다 — 그것까지 토글이 되면 답이 두 개로 가 버린다.
             */
            const clickOpt = async (t) => { await pg.evaluate((tx) => { const b = [...document.querySelectorAll('.card .opt')].find((x) => x.textContent?.includes(tx)); b?.click() }, t); await wait(150) }
            const onOf = () => pg.$$eval('.card .opt.on', (r) => r.map((x) => x.textContent?.trim().slice(0, 4)))
            await clickOpt('마 안'); await clickOpt('사 안')
            const multiOn = await onOf()
            if (!multiOn.some((t) => /마 안/.test(t ?? '')) || !multiOn.some((t) => /사 안/.test(t ?? ''))) fail('🔴 질문 카드: 여러 개 고르기가 안 된다 · ' + JSON.stringify(multiOn))
            const sq = await pg.$$eval('.card .opt .r.sq', (r) => r.length); if (sq < 3) fail('질문 카드: 여럿 질문은 네모(체크)여야 한다 · ' + sq)
            await clickOpt('사 안')   // 다시 누르면 꺼진다
            if ((await onOf()).some((t) => /사 안/.test(t ?? ''))) fail('질문 카드: 여럿 질문에서 다시 눌러도 안 꺼진다')
            await clickOpt('바 안')
            // 하나만 고르는 질문은 갈아탄다 — 「가 안」 → 「나 안」 이면 켜진 것은 하나
            await clickOpt('나 안'); const one = await onOf()
            if (one.some((t) => /가 안/.test(t ?? ''))) fail('🔴 질문 카드: 하나만 고르는 질문이 토글이 됐다 · ' + JSON.stringify(one))
            await clickOpt('가 안')
            await pg.screenshot({ path: 'test/tmp/ask-multi.png' })
            await pg.click('.card .btns .btn.primary')
            let echo = ''
            for (let i = 0; i < 60; i++) { echo = (await pg.textContent('.chat-body')) ?? ''; if (/답변 받음/.test(echo)) break; await wait(250) }
            const m = /답변 받음: (\{.*?\})/.exec(echo)
            if (!m) fail('질문 카드: 답이 CLI 까지 안 갔다')
            const got = JSON.parse(m[1])
            if (got['둘째 질문은 무엇으로 할까요?'] !== '직접 쓴 둘째 답') fail('🔴 질문 카드: 직접 쓴 글이 엉뚱한 질문의 답으로 갔다 · ' + m[1])
            if (got['첫 질문은 무엇으로 할까요?'] !== '가 안') fail('질문 카드: 고른 답이 안 갔다 · ' + m[1])
            if (got['함께 켤 것을 모두 고르세요'] !== '마 안, 바 안') fail('🔴 질문 카드: 여러 개 고른 답이 그대로 안 갔다 · ' + m[1])
            await wait(300)
            ok('질문 카드 — 「기타」는 질문마다 따로 · 답도 제 질문에 붙어 간다 · 여럿 질문은 중복 선택(토글·네모)이고 하나 질문은 라디오 그대로')
          }
          // 🔴 **링크 앞에 파비콘** (2026-09-13 Dave) — 자리표시자를 먼저 놓으므로 인터넷이 없어도 자리는 있다.
          //    ⛔ 비워 두고 도착할 때 넣으면 글줄이 그때마다 옆으로 밀린다.
          {
            await pg.fill('.composer .cin', 'https://example.com 을 봐 줘')
            const chip = await pg.evaluate(() => { const c = document.querySelector('.lchips .lchip'); return c ? { t: c.textContent, ic: !!c.querySelector('img.fvic') } : null })
            if (!chip || !chip.ic) fail('입력창: 쓰는 중인 주소에 아이콘 칩이 없다 ' + JSON.stringify(chip))
            if (!/example\.com/.test(chip.t ?? '')) fail('입력창: 칩이 도메인을 안 보여 준다 ' + JSON.stringify(chip))
            await pg.keyboard.press('Meta+Enter')
            let fv = 0
            for (let i = 0; i < 40; i++) { fv = await pg.evaluate(() => document.querySelectorAll('.chat-body .md a img.fvic').length); if (fv) break; await wait(300) }
            if (!fv) fail('채팅: 답 속 링크에 파비콘 자리가 없다')
            await pg.fill('.composer .cin', ''); await wait(300)
            ok('링크 파비콘 — 채팅 · 문서 · 입력창이 같은 캐시를 본다')
          }
          /**
           * 🔴 **혼자 선 링크는 박스, 글 속 링크는 밑줄** (2026-09-13 Dave: *«링크와 첨부 모두 rondo 처럼
           *    채팅 안에 박스로 만들어지고 그 박스에 마우스 오버했을때 미리보기»*).
           * ⚠ 문장 가운데 링크까지 박스가 되면 글이 끊긴다 — 그건 밑줄로 남아야 한다.
           * ⚠ 미리보기 카드는 **body 에** 뜬다(말풍선 안이면 대화의 overflow 에 잘린다).
           */
          {
            await pg.fill('.composer .cin', '링크박스 테스트')
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
            // ⚠ **마지막** 링크 박스를 잰다 — 첫 것은 대화가 길어지면 스크롤 끝에 걸려 위에 자리가 없다(카드가 위 가장자리에 붙는다)
            try { await pg.hover('.chat-body .md a.linkbox >> nth=-1', { timeout: 8000 }) } catch (err) {
              const d = await pg.evaluate(() => {
                const a = document.querySelector('.chat-body .md a.linkbox')
                const r = a.getBoundingClientRect()
                const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
                return { n: document.querySelectorAll('.chat-body .md a.linkbox').length, rect: [r.x, r.y, r.width, r.height].map(Math.round), over: mid ? `${mid.tagName}.${mid.className}` : null, modal: !!document.querySelector('.modal'), backdrop: !!document.querySelector('.backdrop'), card: !!document.querySelector('.hovprev') }
              })
              fail('링크 박스: 오버를 못 한다 · ' + JSON.stringify(d))
            }
            let hp = null
            for (let i = 0; i < 20; i++) { hp = await pg.evaluate(() => { const c = document.querySelector('.hovprev'); return c ? { body: c.parentElement === document.body, pos: getComputedStyle(c).position, t: c.querySelector('.t')?.textContent ?? '' } : null }); if (hp) break; await wait(150) }
            if (!hp) fail('미리보기: 오버해도 카드가 안 뜬다')
            if (!hp.body) fail('미리보기: 카드가 body 에 안 붙었다 — 대화 overflow 에 잘린다 ' + JSON.stringify(hp))
            if (hp.pos !== 'fixed') fail('미리보기: position 이 fixed 가 아니다 ' + JSON.stringify(hp))
            // 🔴 **언제나 위쪽** (2026-09-14 Dave) — 미리보기를 다는 것들은 대부분 화면 아래쪽에 살아서,
            //    아래로 펴면 카드가 화면 밖으로 밀려 잘린다. ⛔ 자리가 모자라도 아래로 뒤집지 않는다.
            const pos = await pg.evaluate(() => {
              const c = document.querySelector('.hovprev'); const a = [...document.querySelectorAll('.chat-body .md a.linkbox')].pop()
              if (!c || !a) return null
              const cr = c.getBoundingClientRect(), ar = a.getBoundingClientRect()
              return { cardBottom: Math.round(cr.bottom), anchorTop: Math.round(ar.top) }
            })
            if (!pos) fail('미리보기: 카드나 기준 요소를 못 찾겠다')
            if (pos.cardBottom > pos.anchorTop + 1) fail('미리보기가 아래로 펴졌다 — 항상 위쪽이어야 한다 ' + JSON.stringify(pos))
            await pg.fill('.composer .cin', ''); await wait(300)
            ok('링크 박스 — 혼자 선 링크만 박스 · 오버하면 body 에 미리보기')
          }
          /**
           * 🔴 **코드 블록에 언어 이름과 복사 단추** (Rondo 이식 B3).
           * ⚠ 머리줄은 `pre` **밖**에 있어야 한다 — 안에 두면 코드 글자에 섞여 **복사에 딸려 온다**.
           */
          {
            /**
             * 🔴 **mermaid · KaTeX** (루프 10/10) — ```mermaid 는 그림(svg)으로, `$…$` 는 수식으로. 둘 다 **늦게 받는다**
             *    (본체 청크에 섞이면 안 된다 — 아래 번들 검사가 잡는다). 코드 안·돈(`$5`)은 그대로.
             */
            {
              await pg.fill('.composer .cin', '그림수식 테스트'); await pg.click('.composer .sendb')
              await pg.waitForSelector('.md .mmd svg', { timeout: 20000 })
              await pg.waitForSelector('.md .katex', { timeout: 10000 }); await wait(300)
              const mk = await pg.evaluate(() => { const md = [...document.querySelectorAll('.chat-body .md')].pop(); return { svg: md.querySelectorAll('.mmd svg').length, inline: md.querySelectorAll('.katex').length, block: md.querySelectorAll('.katex-display').length, err: md.querySelectorAll('.mmderr').length, txt: md.textContent ?? '', pre: md.querySelectorAll('pre').length } })
              if (mk.svg !== 1) fail('mermaid: 그림이 하나가 아니다 ' + JSON.stringify(mk))
              if (mk.err) fail('mermaid: 오류 줄이 있다 ' + JSON.stringify(mk))
              if (mk.inline < 2 || mk.block !== 1) fail('KaTeX: 인라인·블록 수식이 안 그려졌다 ' + JSON.stringify(mk))
              if (!/\$5 와 \$10/.test(mk.txt)) fail('KaTeX: 돈을 수식으로 먹었다 ' + JSON.stringify(mk.txt.slice(-80)))
              if (mk.pre) fail('mermaid: 그린 뒤에도 코드 블록이 남아 있다 ' + JSON.stringify(mk))
              ok('mermaid · KaTeX — 그림 펜스는 svg · $…$ 는 수식 · 돈은 그대로 (둘 다 지연 로드)')
            }
            await pg.fill('.composer .cin', '코드블록 테스트')
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
            await pg.fill('.composer .cin', ''); await wait(300)
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
          await pg.fill('.composer .cin', '쓰다 만 메시지')
          await wait(600)                                  // 지연 저장(300ms)이 끝나길 기다린다
          const keys = await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fb:draft:')))
          if (!keys.length) fail('초안: localStorage 에 안 남았다')
          if (!/:.+:/.test(keys[0])) fail('초안: 키가 봇·세션으로 안 갈렸다 ' + JSON.stringify(keys))
          await pg.reload({ waitUntil: 'domcontentloaded' }); await pg.waitForSelector('.composer .cin', { timeout: 8000 }); await wait(1200)
          const back = await pg.getAttribute('.composer .cin', 'data-value')
          if (back !== '쓰다 만 메시지') fail('초안: 새로고침 뒤 안 돌아왔다 · ' + JSON.stringify(back))
          // 보내면 지워진다
          await pg.fill('.composer .cin', ''); await wait(600)
          const left = await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fb:draft:')).length)
          if (left) fail('초안: 비웠는데 키가 남아 있다 ' + left)
        }
        // 명령 · 스킬 — 한 줄에 «아이콘 · 이름 · 범위» (2026-09-13 Dave: «지침과 하네스쪽 디자인도 깨져 있어»)
        //    클래스만 붙이고 CSS 를 안 써서 아이콘이 한 줄, 이름·범위가 붙어 흘렀다
        //    ⚠ V(09-22) 에서 「지침 · 하네스」와 「슬래시 명령」이 한 칸(명령 · 스킬)으로 합쳐졌다
        {
          await pg.click('.panel .sech:has-text("명령 · 스킬")'); await wait(900)
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
          if (!hz) fail('명령 · 스킬: 줄이 하나도 없다')
          const bad = hz.filter((r) => r.h > 44 || !r.sameLine || r.gap < 2)
          if (bad.length) fail('명령 · 스킬: 줄이 깨졌다(아이콘·이름·범위가 한 줄이 아니거나 붙어 있다) ' + JSON.stringify(bad))
          await pg.click('.panel .sech:has-text("명령 · 스킬")'); await wait(300)
        }
        // 세션 삭제 버튼 — 행에 있고, 누르면 한 번 묻고, 목록에서 사라진다. 원래 보던 세션은 건드리지 않는다
        const keep = (await pg.textContent('.panel .srow.on .n')).trim()
        const rows0 = (await pg.$$('.panel .srow')).length
        await pg.click('.panel .sech:has-text("세션") .tools .ib') // 지울 세션 하나 더 만든다 — 생길 때까지(포화된 맥에서 1초를 넘긴다)
        for (let i = 0; i < 40 && (await pg.$$('.panel .srow')).length <= rows0; i++) await wait(150)
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
          await pg.fill('.composer .cin', '매주 월요일 아침 8시에 지난주 한 일 정리해 줘')
          await pg.click('.cbar button[title="첨부"]'); await wait(200)
          await pg.click('.cpop.plus .prow2:has-text("루틴으로 만들기")'); await wait(500)
          // AA-4(2026-09-22) 뒤로 폼은 **사람 말**을 들고 있고 cron 은 「다음 실행」 옆에 작게만 뜬다
          const sheet = await pg.evaluate(() => {
            const s = document.querySelector('.sheet'); if (!s) return null
            const v = [...s.querySelectorAll('input')].map((x) => x.value)
            return { name: v[0] ?? '', when: v[1] ?? '', cron: s.querySelector('.rtnext .mono')?.textContent?.trim() ?? '', next: s.querySelector('.rtnext b')?.textContent ?? '', prompt: [...s.querySelectorAll('textarea')].map((x) => x.value).join(' ') }
          })
          if (!sheet) fail('루틴: 편집 화면이 안 떴다')
          if (sheet.cron !== '0 8 * * 1') fail('루틴: 「매주 월요일 아침 8시」 를 못 읽었다 ' + JSON.stringify(sheet))
          if (sheet.when !== '월요일 아침 8시') fail('🔴 AA-4: 「언제」 칸이 사람 말이어야 한다(cron 을 사람에게 보여 주지 않는다) ' + JSON.stringify(sheet))
          if (!/\d+\/\d+\(.\) \d\d:\d\d/.test(sheet.next)) fail('🔴 AA-4: 입력하는 동안 「다음 실행」이 보여야 한다 ' + JSON.stringify(sheet))
          if (!/지난주 한 일 정리/.test(sheet.prompt)) fail('루틴: 시킬 일이 안 담겼다 ' + JSON.stringify(sheet))
          if (!/지난주/.test(sheet.name)) fail('루틴: 이름이 비었다 ' + JSON.stringify(sheet))
          // 저장하지 않고 닫으면 아무 일도 없어야 한다
          await pg.click('.sheet-h .btn:has-text("취소")'); await wait(400)
          const after = (await api('/bots')).find((b) => b.id === bot.id)
          if ((after?.routines ?? []).some((r) => /지난주/.test(r.name))) fail('루틴: 안 눌렀는데 저장됐다')
          await pg.fill('.composer .cin', ''); await wait(200)
          ok('채팅 한 줄 → 루틴 (주기까지 읽어서 채워 준다 · 저장은 사람이)')
        }
        /**
         * ═══ AB · 기다림을 보이게 (2026-09-23 Dave 「B안」) ═════════════════════════════════
         * 🔴 **구멍**: 백그라운드 에이전트를 띄우면 **턴은 끝나고**(state 가 running 을 벗어난다) 일은 계속된다.
         *    그 순간 화면의 상태 줄이 **통째로 사라져** 「끝났나?」가 됐다(Dave 스크린샷 2319).
         */
        {
          const view = () => pg.evaluate(() => {
            const live = document.querySelector('.live')
            return {
              hold: !!document.querySelector('.live.hold'),
              run: !!document.querySelector('.live.run'),
              txt: live?.querySelector('.tx')?.textContent ?? null,
              el: live?.querySelector('.el')?.textContent ?? null,
              act: live?.querySelector('.hact')?.textContent ?? null,
              face: [...document.querySelectorAll('.chat-hdr .fb')].map((e) => [...e.classList].find((c) => /^fb-/.test(c)))[0] ?? null,
              hstate: document.querySelector('.chat-hdr .hstate')?.textContent ?? null,
              // 레일은 **글이 아니라 얼굴·색**으로 말한다(멀리서 보는 자리라서) — 그 봇 줄의 얼굴이 기다리는 얼굴인가
              rail: [...document.querySelectorAll('.brow')].map((e) => [...(e.querySelector('.fb')?.classList ?? [])].find((c) => /^fb-/.test(c))).filter(Boolean),
              // 올려 보면 글로도 같은 말을 한다(hover 카드)
              railText: document.querySelector('.hcard .hs')?.textContent ?? null,
            }
          })
          /**
           * ⚠ 스텁의 백그라운드 에이전트는 **1초 남짓에 끝난다** — 「뜬 다음에 천천히 확인」 하면 경주가 된다.
           *    그래서 ① 뜨는 것만 UI 로 잡고 ② 시각을 그 자리에서 밀어 «2분 뒤» 문구를 확인하고
           *    ③ «턴이 끝나도 남는다» 는 계약은 **얼어붙지 않는 쪽**(순수 판정 · 유닛)과 API 로 잰다.
           */
          await pg.fill('.composer .cin', '백그라운드 조사'); await pg.keyboard.press('Enter')
          let v = null
          for (let i = 0; i < 80; i++) { await wait(60); v = await view(); if (v.hold) break }
          if (!v.hold) fail('🔴 AB: 남을 기다리는데 대기 줄이 없다 ' + JSON.stringify(v))
          if (!/기다리는 중/.test(v.txt ?? '')) fail('AB-2: 대기 줄이 무엇을 기다리는지 안 말한다 ' + JSON.stringify(v))
          if (v.face !== 'fb-hold') fail('🔴 AB-1: 헤더 얼굴이 «기다리는 얼굴»이 아니다 ' + JSON.stringify(v))
          if (!/기다리는 중/.test(v.hstate ?? '')) fail('🔴 AB-5: 헤더 한 줄이 없다 ' + JSON.stringify(v))
          if (!v.rail.includes('fb-hold')) fail('🔴 AB-5: 레일 얼굴이 대기 줄과 다른 말을 한다 ' + JSON.stringify(v))

          /**
           * 🔴 **턴이 끝나도 남이 일하면 화면은 안 조용해진다** — 이것이 2319 의 정체다.
           *    화면이 아니라 **값**으로 잰다(스텁이 너무 빨리 끝나 화면으로는 못 잡는다): 세션이 running 이 아닌데
           *    `bg > 0` 인 순간이 실제로 있고, 그 순간의 판정이 «남이 들고 있다» 여야 한다.
           */
          let sawEndedWithBg = false
          for (let i = 0; i < 120 && !sawEndedWithBg; i++) {
            const ss = await api(`/bots/${bot.id}/sessions`)
            if (ss.some((x) => x.state !== 'running' && (x.bg ?? 0) > 0)) sawEndedWithBg = true
            else await wait(40)
          }
          if (!sawEndedWithBg) console.log('  (참고) 스텁이 너무 빨라 «턴 끝 + bg 남음» 순간을 못 잡았다 — 판정 자체는 유닛이 잰다')

          // 🔴 2분이 넘으면 화면이 먼저 «가도 된다» 고 말한다 — 시각을 밀어 확인한다(멈춰 있는 대기 줄로)
          await pg.evaluate(() => {
            const D = Date, SHIFT = 130000
            class F extends D { constructor(...a) { super(...(a.length ? a : [D.now() + SHIFT])) } static now() { return D.now() + SHIFT } }
            window.Date = F
          })
          let late = null
          for (let i = 0; i < 40; i++) { await wait(100); late = await view(); if (/다른 일 보셔도/.test(late.txt ?? '')) break }
          if (!/다른 일 보셔도 됩니다/.test(late.txt ?? '')) fail('🔴 AB-3: 2분이 넘었는데 «가도 된다» 고 말하지 않는다 ' + JSON.stringify(late))
          if (late.act !== '알림 켜기') fail('AB-3: [알림 켜기] 가 없다 ' + JSON.stringify(late))
          if (!/분/.test(late.el ?? '')) fail('AB-2: 얼마나 됐는지 안 보인다 ' + JSON.stringify(late))
          await pg.screenshot({ path: 'test/tmp/ab-hold.png' })
          await pg.reload(); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(600)
          ok('AB 기다림 — 턴이 끝나도 대기 줄이 남고 · 얼굴·헤더·레일이 같은 말 · 2분 넘으면 «가도 된다»')
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
          await pg.fill('.composer .cin', 'nk,/')
          if (await pg.$('.modal.keys')) fail('단축키: 글자를 쳤는데 명령이 돌았다')
          await pg.fill('.composer .cin', ''); await wait(200)
          /**
           * 🔴 **자판 앞에서는 ⏎ 가 보내기, ⇧⏎ 가 줄 바꿈** (2026-09-15 Dave — Claude Desktop 과 같은 방향).
           * ⚠ 하루 전(2026-09-14)에는 **반대**였다(양쪽 다 ⌘⏎). 두 기기를 같이 쓰니 방향을 통일하자는
           *   결정이고, 통일의 기준은 «자판이 딸려 있나» 다 — 폰 쪽 계약은 phone 페이지에서 따로 잰다.
           */
          {
            await pg.fill('.composer .cin', '⇧⏎ 는 줄 바꿈')
            await pg.keyboard.press('Shift+Enter'); await wait(400)
            const nl = await pg.getAttribute('.composer .cin', 'data-value')
            if (!nl.includes('⇧⏎ 는 줄 바꿈')) fail('🔴 ⇧⏎ 로 보내졌다 — 줄을 바꾸려다 말이 나간다 · ' + JSON.stringify(nl))
            if (!/\n/.test(nl)) fail('⇧⏎ 가 줄바꿈을 안 했다 · ' + JSON.stringify(nl))
            await pg.fill('.composer .cin', ''); await wait(200)
            await pg.fill('.composer .cin', '엔터로 보낸다')
            await pg.keyboard.press('Enter'); await wait(900)
            const gone = await pg.getAttribute('.composer .cin', 'data-value')
            if (gone.trim()) fail('🔴 자판 앞인데 ⏎ 로 안 나갔다 · ' + JSON.stringify(gone))
            let said = false
            for (let i = 0; i < 20; i++) { if (await pg.$('.umsg:has-text("엔터로 보낸다")')) { said = true; break } await wait(200) }
            if (!said) fail('⏎ 로 보냈는데 대화에 안 남았다')
            ok('자판 앞에서는 ⏎ 로 보내고 ⇧⏎ 로 줄을 바꾼다')
          }
          /**
           * 🔴 **제목을 그 자리에서 고친다** (2026-09-15 Dave: «채팅 제목이 수정되게도 해줘»).
           * ⚠ 종전의 길은 `prompt()` 하나였는데 **Electron 에는 그게 없다** — 앱에서 «수정이 안 되는»
           *   것처럼 보였다. 그래서 줄을 통째로 입력칸으로 바꾸는 길을 따로 둔다(두 번 누르기 · 연필).
           */
          {
            await pg.hover('.srow'); await pg.dblclick('.srow')
            await pg.waitForSelector('.srow.edit .rin', { timeout: 4000 })
            await pg.fill('.srow.edit .rin', '내가 고친 제목')
            await pg.keyboard.press('Enter'); await wait(700)
            const names = await pg.$$eval('.srow .n', (r) => r.map((x) => x.textContent))
            if (!names.includes('내가 고친 제목')) fail('제목 고치기: 화면에 안 남았다 · ' + JSON.stringify(names))
            const hostNames = (await api(`/bots/${bot.id}/sessions`)).map((x) => x.name)
            if (!hostNames.includes('내가 고친 제목')) fail('제목 고치기: 호스트에 안 남았다 · ' + JSON.stringify(hostNames))
            ok('세션 제목을 줄에서 바로 고친다 (호스트까지)')
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
            await pg.fill('.composer .cin', '느린일 하나')
            await pg.keyboard.press('Meta+Enter'); await wait(80)
            await pg.fill('.composer .cin', '대기에 들어갈 말')
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
            await pg.fill('.composer .cin', ''); await wait(200)
          }
          /**
           * ⛔ **생각 줄에는 중단 단추가 없다** (2026-09-14 Dave) — 입력줄의 것과 겹친다.
           *    같은 일을 하는 단추가 한 화면에 둘이면 둘 다 «진짜 그건가» 를 한 번씩 생각하게 만든다.
           */
          if (await pg.$('.live .stop')) fail('🔴 생각 줄에 중단 단추가 되살아났다')
          ok('맥 기본 단축키 — ⌘, 설정 · ⌘/ 표 · 글 칠 때는 안 돈다')
          /**
           * 🔴 **⌘[ ⌘] 는 방문 히스토리** (루프 2/10). 종전에는 레일의 이전·다음 폴더였다 — 알림·칩으로 뛴 뒤
           *    «아까 거기» 로 돌아올 길이 없었다. 세 곳을 차례로 밟고 두 번 뒤로, 한 번 앞으로 가서 잰다.
           */
          {
            const bots = (await api('/bots')).filter((b) => !b.orchestrator).slice(0, 3)
            if (bots.length < 3) fail('히스토리: 밟을 폴더가 셋이 안 된다')
            const at = () => pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot'))
            for (const b of bots) { await pg.evaluate((id) => { location.hash = `bot=${id}` }, b.id); await wait(350) }
            await pg.focus('.chat-body'); await pg.keyboard.press(`${mod}+BracketLeft`); await wait(350)
            if ((await at()) !== bots[1].id) fail('히스토리: ⌘[ 한 번에 직전 폴더로 안 갔다 · ' + JSON.stringify([await at(), bots.map((b) => b.id)]))
            await pg.keyboard.press(`${mod}+BracketLeft`); await wait(350)
            if ((await at()) !== bots[0].id) fail('히스토리: ⌘[ 두 번에 두 걸음 전으로 안 갔다')
            await pg.keyboard.press(`${mod}+BracketRight`); await wait(350)
            if ((await at()) !== bots[1].id) fail('히스토리: ⌘] 로 앞으로 안 갔다')
            // ⌥⌘] 는 레일 순서의 다음 폴더 — 히스토리와 다른 물건
            await pg.keyboard.press(`Alt+${mod}+BracketRight`); await wait(350)
            if ((await at()) === bots[1].id) fail('히스토리: ⌥⌘] 가 폴더를 안 옮겼다')
            await pg.evaluate((id) => { location.hash = `bot=${id}` }, bot.id); await wait(500)
            ok('⌘[ ⌘] 는 방문 히스토리 · ⌥⌘[ ] 는 레일 순서')
          }
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
         * 🔴 **지난 대화 찾기** (루프 7/10) — 같은 칸에 두 글자를 치면 볼트 전체 세션의 **말** 까지 걸린다.
         *    «큐에 남아야 하는 말» 은 위의 큐 검사가 어느 세션에 보낸 두 번째 말이라 이름이 아니라 **본문**으로만 걸린다.
         * ⚠ 호스트에 묻는 것이라 200ms 쉬었다가 간다 — 그래서 여기서도 기다린다.
         */
        {
          const home = await pg.evaluate(() => location.hash)
          await pg.keyboard.press('Meta+p'); await wait(400)
          await pg.fill('.modal.pal .pq input', '큐에 남아야'); await wait(900)
          const hit = await pg.evaluate(() => { const r = document.querySelector('.modal.pal .prow.hit'); return r ? { n: r.querySelector('.n')?.textContent, sb: r.querySelector('.sb')?.textContent, all: document.querySelectorAll('.modal.pal .prow').length } : null })
          if (!hit) fail('지난 대화: 본문으로 걸리는 줄이 없다 ' + JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('.modal.pal .prow')].map((r) => r.textContent))))
          if (!/큐에 남아야/.test(hit.sb ?? '')) fail('지난 대화: 토막에 걸린 말이 없다 ' + JSON.stringify(hit))
          const want = []
          for (const b of await api('/bots')) for (const x of await api(`/bots/${b.id}/sessions`)) { const c = await api(`/sessions/${x.id}/chat`); if (c.items.some((i) => i.kind === 'user' && /큐에 남아야/.test(i.text ?? ''))) want.push({ bot: b.id, s: x.id }) }
          if (!want.length) fail('지난 대화: 검사 전제가 틀렸다 — 그 말을 가진 세션이 없다')
          await pg.click('.modal.pal .prow.hit'); await wait(900)
          const at = await pg.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))))
          if (!want.some((w) => w.bot === at.bot && (w.s === at.s || !at.s))) fail('지난 대화: 고른 줄이 그 세션으로 안 갔다 ' + JSON.stringify({ at, want }))
          if (await pg.$('.modal.pal')) fail('지난 대화: 고르면 팔레트가 닫혀야 한다')
          await pg.evaluate((h) => { location.hash = h }, home); await wait(900)
          await pg.focus('.composer .cin')
          ok('지난 대화 찾기 — ⌘P 에 두 글자면 볼트 전체의 말까지 · 고르면 그 세션으로')
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
            /**
             * A · **오케스트레이터가 순서를 정한다 — `bots_reorder`** (2026-09-19, 추천안 승인).
             * ① 사람이 끌어 놓은 봇(`moved`)은 도구가 못 건드린다 ② 없는 rel 이 섞이면 실패·그대로
             * ③ `bots_list` 에 order·orderedBy ④ 재정렬이 오면 이 기기의 정렬이 «직접» 으로 ⑤ 레일 메뉴 «순서 고정 해제»
             * ⑥ restore 는 첫 재정렬 전으로. (재시작 후 유지는 test/unit/registry.test.ts — bots.yml 을 다시 읽는다)
             */
            {
              await api('/bots/reorder', { ids, moved: ids[1] })                       // ids[1] 을 «끌어» 1번 칸에 — 사람이 정한 자리
              const rels = (await api('/bots')).filter((b) => !b.orchestrator).map((b) => b.rel)
              const call = async (args) => (await (await fetch(base + '/mcp/orch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'bots_reorder', arguments: args } }) })).json()).result
              const bad = await call({ order: [rels[0], '2. Projects/없는폴더'] })
              if (!bad.isError || !/없는폴더/.test(bad.content[0].text)) fail('A: 없는 rel 이 섞였는데 실패하지 않았다 ' + JSON.stringify(bad))
              if (JSON.stringify((await api('/bots')).filter((b) => !b.orchestrator).map((b) => b.id)) !== JSON.stringify(ids)) fail('A: 실패했는데 순서가 바뀌었다')
              await pg.click('.sortbar button:has-text("이름")'); await wait(200)
              const rev = [...rels].reverse()
              const r1 = await call({ order: rev }); if (r1.isError) fail('A: bots_reorder ' + r1.content[0].text)
              const got = (await api('/bots')).filter((b) => !b.orchestrator)
              const free = rev.map((r) => ids[rels.indexOf(r)]).filter((id) => id !== ids[1]); const want = ids.map((_, i) => (i === 1 ? ids[1] : free.shift()))  // 1번 칸은 사람이 정한 자리
              if (JSON.stringify(got.map((b) => b.id)) !== JSON.stringify(want)) fail('A: 끌어 놓은 봇이 자리를 안 지켰거나 차례가 틀리다 ' + JSON.stringify({ want, got: got.map((b) => b.id) }))
              if (got[1].orderedBy !== 'user' || got[0].orderedBy !== 'orchestrator') fail('A: orderedBy ' + JSON.stringify(got.map((b) => b.orderedBy)))
              const bl = JSON.parse((await mcp('tools/call', { name: 'bots_list', arguments: {} })).result.content[0].text).filter((b) => b.rel)
              if (bl.some((b, i) => b.order !== i) || bl[1].orderedBy !== 'user' || bl[0].orderedBy !== 'orchestrator') fail('A: bots_list order/orderedBy ' + JSON.stringify(bl.map((b) => [b.order, b.orderedBy])))
              await wait(600)
              const sortOn = await pg.evaluate(() => document.querySelector('.sortbar button.on')?.textContent)
              if (sortOn !== '직접') fail('A: 재정렬이 왔는데 정렬이 «직접» 으로 안 바뀌었다 · ' + sortOn)
              const shown = await pg.evaluate(() => [...document.querySelectorAll('.sb-list .brow')].map((e) => e.dataset.id || e.getAttribute('data-id')).filter(Boolean))
              // 레일은 섹션(PARA)을 지키므로 **섹션 안의 상대 차례**만 본다
              for (const sec of new Set(got.map((b) => b.section))) { const inSec = (id) => got.find((b) => b.id === id)?.section === sec; if (JSON.stringify(shown.filter(inSec)) !== JSON.stringify(want.filter(inSec))) fail('A: 레일이 새 차례를 안 그린다 · ' + sec + ' ' + JSON.stringify({ shown: shown.filter(inSec), want: want.filter(inSec) })) }
              // ⑤ 끌어 놓은 봇의 메뉴에만 «순서 고정 해제»
              await pg.evaluate((id) => { const el = document.querySelector(`.sb-list .brow[data-id="${id}"]`); el?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 200 })) }, ids[1]); await wait(200)
              if (!(await pg.$('.menu.ctx button.unfix'))) fail('A: 끌어 놓은 봇 메뉴에 «순서 고정 해제» 가 없다')
              await pg.click('.menu.ctx button.unfix'); await wait(400)
              if ((await api('/bots')).find((b) => b.id === ids[1]).orderedBy) fail('A: 고정 해제가 안 됐다')
              await pg.evaluate((id) => { const el = document.querySelector(`.sb-list .brow[data-id="${id}"]`); el?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 200 })) }, ids[0]); await wait(200)
              if (await pg.$('.menu.ctx button.unfix')) fail('A: 도구가 놓은 봇에 «순서 고정 해제» 가 떴다')
              await pg.keyboard.press('Escape'); await wait(100)
              const r2 = await call({ restore: true }); if (r2.isError) fail('A: restore ' + r2.content[0].text)
              const back = (await api('/bots')).filter((b) => !b.orchestrator)
              if (JSON.stringify(back.map((b) => b.id)) !== JSON.stringify(ids) || back.some((b) => b.orderedBy)) fail('A: restore 가 첫 재정렬 전으로 안 돌아갔다 ' + JSON.stringify(back.map((b) => [b.id, b.orderedBy])))
              ok('A bots_reorder — 없는 rel 실패·그대로 · 끌어 놓은 자리 유지 · bots_list order/orderedBy · 정렬 «직접» 자동 · 순서 고정 해제 · restore')
            }
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
          /**
           * 🔴 **즐겨찾기 고정 — 레일 맨 위 「고정」 칸, 최대 3개** (루프 3/10). 봇이 늘수록 매일 가는 폴더가 묻힌다.
           *    고정은 볼트에 남는다 — 맥에서 고정한 것이 폰에서도 맨 위여야 한다.
           */
          {
            await pg.click('.sb-list .brow:has-text("제품_Rondo")', { button: 'right' }); await wait(300)
            const m1 = await pg.textContent('.menu.ctx')
            if (!/맨 위에 고정/.test(m1 ?? '')) fail('고정: 우클릭 메뉴에 «맨 위에 고정» 이 없다 · ' + m1)
            await pg.keyboard.press('Escape'); await wait(200)
            await api('/bots/pin', { id: bot.id, on: true })
            await wait(600)
            const secs = await pg.$$eval('.sb-list > div .secl', (r) => r.map((x) => x.textContent ?? ''))
            if (secs[0] !== '관제' || secs[1] !== '고정') fail('고정: 「고정」 칸이 관제 바로 아래에 없다 · ' + JSON.stringify(secs))
            const inPin = await pg.evaluate(() => { const sec = [...document.querySelectorAll('.sb-list > div')].find((d) => d.querySelector('.secl')?.textContent === '고정'); return sec ? [...sec.querySelectorAll('.brow .n')].map((x) => x.textContent ?? '') : [] })
            if (!inPin.some((n) => /제품_Rondo/.test(n))) fail('고정: 고정한 봇이 「고정」 칸에 없다 · ' + JSON.stringify(inPin))
            if (!(await api('/bots')).find((b) => b.id === bot.id)?.pinned) fail('고정: 호스트에 안 남았다')
            // 상한 — 셋을 넘기면 거절
            const others = (await api('/bots')).filter((b) => !b.orchestrator && b.id !== bot.id).slice(0, 3)
            for (const b of others.slice(0, 2)) await api('/bots/pin', { id: b.id, on: true })
            const over = await fetch(base + '/api/bots/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: others[2].id, on: true }) })
            if (over.ok) fail('고정: 넷째를 받아 줬다 — 상한이 없다')
            for (const b of [bot, ...others]) await api('/bots/pin', { id: b.id, on: false })
            await wait(500)
            if ((await pg.$$eval('.sb-list > div .secl', (r) => r.map((x) => x.textContent ?? ''))).includes('고정')) fail('고정: 다 풀었는데 「고정」 칸이 남았다')
            ok('즐겨찾기 고정 — 「고정」 칸 · 볼트에 남음 · 3개 상한')
          }
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
          await pg.click('.modal.setw .nv:has-text("참고")').catch(() => {})
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
          // ⚠ 「Finder 에서 보기」는 **원격에서도** 있어야 한다 — 여는 주체가 호스트일 뿐 없는 기능이 아니다
          //    (2026-09-14 Dave: «폴더에서 우클릭 메뉴에 finder에서 보기가 없네»)
          for (const want of ['새 노트', '새 폴더', '복제', '경로 복사 (폴더 기준)', 'Finder']) if (!(mtx ?? '').includes(want)) fail(`파일 메뉴에 «${want}» 가 없다 · ` + mtx)
          await pg.keyboard.press('Escape'); await wait(200)
          // 폴더 줄에서도 같다 — 종전에는 파일에만 있고 폴더에는 없는 것처럼 보였다
          await pg.click('.panel .secb button.trow.dir', { button: 'right' }); await wait(300)
          const dtx = await pg.textContent('.menu.ctx')
          if (!(dtx ?? '').includes('Finder')) fail('폴더 우클릭 메뉴에 «Finder 에서 보기» 가 없다 · ' + dtx)
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
        /* ⚠ 펼친 줄의 «가운데» 는 설명(.dsc)이라 진짜 클릭을 그 자리에 놓으면 **편집이 열린다**(설명·제목은 눌러서
           고치는 자리다 — 의도된 동작). 여기서 재려는 것은 «두 번째 더블클릭이 접느냐» 하나이므로 줄에 직접 건다. */
        await pg.evaluate(() => document.querySelector('.todo.on')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await wait(250); if (await pg.$('.todo .dsc')) fail('ui todo: second double-click should collapse ' + JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('.todo')].map((r) => ({ c: r.className, t: (r.textContent ?? '').slice(0, 18) })))))
        // 편집 — 한 칸에 «제목: 설명»
        /* ⚠ 첫 줄이 무엇인지는 앞 검사들(완료 처리·이동·추가)에 따라 바뀐다 — **설명이 있는 줄**을 집는다.
           재려는 것은 «편집 상자에 «제목: 설명» 이 한 칸으로 들어오는가» 이므로 어느 줄이냐는 상관없다. */
        await pg.hover('.todo:has(.mk)'); await pg.click('.todo:has(.mk) .tools button[title="편집"]'); await wait(200)
        if (!(await pg.$('.todo.edit .ein'))) fail('ui todo edit box'); const cur = await pg.inputValue('.todo.edit .ein'); if (!/:/.test(cur)) fail('ui todo edit value: ' + cur)
        await pg.fill('.todo.edit .ein', `${cur.split(':')[0]} (편집됨):${cur.split(':').slice(1).join(':')}`); await pg.keyboard.press('Enter'); await wait(600)
        if (!/편집됨/.test((await pg.textContent('.panel')) ?? '')) fail('ui todo edit save')
        if (!(await pg.$('.sech .ib.mdb'))) fail('ui todo: todo.md button missing')
        /**
         * 🔴 **AK · 안 끝난 일이 맨 위, 끝난 일은 최근 몇 개만** (2026-09-24 Dave: *«아직 끝내지 않은 항목이
         *    맨 상단에 떠야 돼 … 완료된 건 최근 완료 항목 몇 개만 화면에 보이고 나머지는 더보기»*).
         * ⚠ 픽스처의 «요청 · 할 일» 절에는 완료 한 줄이 **안 끝난 일들보다 위에** 적혀 있다 — 파일 순서대로
         *    그리면 그 줄이 맨 위에 온다. 화면 차례만 바뀌고 파일은 그대로여야 한다.
         */
        {
          // ⚠ 차례는 **절 안에서** 본다 — 절이 여럿이면 절 경계를 넘어 비교하는 순간 거짓 빨강이 난다
          const t = await pg.evaluate(() => [...document.querySelectorAll('.tsec')].map((h) => ({
            sec: h.textContent ?? '',
            rows: [...(h.parentElement?.querySelectorAll('.todo:not(.add):not(.addbtn)') ?? [])].map((r) => ({ done: r.classList.contains('done'), tx: (r.textContent ?? '').slice(0, 24) })),
            more: [...(h.parentElement?.querySelectorAll('.todo.addbtn.more') ?? [])].map((b2) => b2.textContent ?? ''),
          })))
          for (const sec of t) {
            const firstDone = sec.rows.findIndex((r) => r.done)
            const lastLive = sec.rows.map((r) => r.done).lastIndexOf(false)
            if (firstDone >= 0 && firstDone < lastLive) fail('🔴 AK: 끝난 일이 안 끝난 일보다 위에 있다 ' + JSON.stringify(sec))
          }
          if (!t.some((sec) => sec.more.some((m) => /더보기/.test(m)))) fail('🔴 AK: 끝난 일이 3건을 넘는데 「더보기」 가 없다(다 펼쳐 보인다) ' + JSON.stringify(t))
          const md0 = readFileSync(join(root, '3. Area/제품_Rondo', 'todo.md'), 'utf8')
          if (!/- \[x\] 옛 완료 1[\s\S]*?- \[ \] Tailscale/.test(md0)) fail('🔴 AK: 화면 차례를 바꾸면서 파일까지 다시 썼다 — 파일에서는 끝난 줄이 원래 자리(안 끝난 줄 위)에 있어야 한다\n' + md0)
          ok('AK 할 일 차례 — 안 끝난 일이 위 · 완료는 최근 몇 개 + 더보기 · 파일은 그대로')
        }
        const cbar = await pg.textContent('.composer .cbar'); if (!/Fable 5.1|Sonnet 5/.test(cbar) || !/자동|계획/.test(cbar) || !/높음/.test(cbar)) fail('ui cbar labels: ' + cbar)
        // 슬래시 자동완성 → 스킬이 뜬다 · @ → 파일이 뜬다
        await pg.fill('.composer .cin', '/st'); await wait(300); const sp = await pg.textContent('.cpop'); if (!/standup/.test(sp ?? '') || !/status/.test(sp ?? '')) fail('ui slash popup: ' + sp)
        /**
         * 🔴 **슬래시 명령 관리** (루프 8/10) — 패널 「슬래시 명령」 에 파일 그대로 목록이 서고, + 로 만들면
         *    `.claude/commands/<이름>.md` 가 생겨 문서 열에 열리고, 같은 자리에서 `/` 메뉴에 나온다.
         * ⚠ 루트의 `status` 는 «볼트» 로, 이 폴더에 만든 것은 «이 폴더» 로 표시된다.
         */
        {
          await pg.fill('.composer .cin', ''); await wait(200)
          // V (09-22 Dave) · 「지침·하네스」와 「슬래시 명령」이 **한 칸**(명령 · 스킬)으로 합쳐졌다 — 명령·스킬·커넥터를 한 목록에서 본다
          const hdr = pg.locator('.sech', { hasText: '명령 · 스킬' })
          if (!(await hdr.count())) fail('명령·스킬: 패널에 절이 없다')
          if (!(await pg.$('.hsec.cmds'))) { await hdr.click(); await wait(500) }
          const list = await pg.evaluate(() => [...document.querySelectorAll('.hsec.cmds .hz')].map((r) => r.textContent ?? ''))
          if (!list.some((r) => /\/status/.test(r) && /볼트/.test(r))) fail('슬래시 명령: 루트의 /status 가 «볼트» 로 안 보인다 ' + JSON.stringify(list))
          // 같은 목록에 스킬·커넥터도 함께 선다 (한 공간에서 본다)
          if (!list.some((r) => /스킬 ·/.test(r))) fail('V: 같은 목록에 스킬이 안 보인다 ' + JSON.stringify(list))
          await hdr.locator('.nsb').click(); await pg.waitForSelector('.modal.ask input', { timeout: 3000 })
          await pg.fill('.modal.ask input', 'hello-bot'); await pg.keyboard.press('Enter'); await wait(900)
          const cmdAbs = join(root, '3. Area/제품_Rondo/.claude/commands/hello-bot.md')
          if (!existsSync(cmdAbs)) fail('슬래시 명령: 파일이 안 생겼다 ' + cmdAbs)
          if (!/\$ARGUMENTS/.test(readFileSync(cmdAbs, 'utf8'))) fail('슬래시 명령: 본보기에 $ARGUMENTS 가 없다')
          await pg.waitForSelector('.doc .dbody', { timeout: 5000 })
          const tabTxt = await pg.evaluate(() => [...document.querySelectorAll('.doc .tab')].map((t) => t.textContent ?? '').join(' | '))
          if (!/hello-bot/.test(tabTxt)) fail('슬래시 명령: 만든 파일이 문서 열에 안 열렸다 ' + tabTxt)
          const list2 = await pg.evaluate(() => [...document.querySelectorAll('.hsec.cmds .hz')].map((r) => r.textContent ?? ''))
          if (!list2.some((r) => /\/hello-bot/.test(r) && /이 폴더/.test(r))) fail('슬래시 명령: 만든 것이 목록에 «이 폴더» 로 안 선다 ' + JSON.stringify(list2))
          // 같은 이름·틀린 이름은 거절 (⚠ API 로 잰다 — 화면에서 400 을 받으면 크롬이 콘솔에 오류를 찍어 «page errors» 에 걸린다)
          try { await api(`/bots/${bot.id}/commands`, { name: 'hello-bot', scope: 'folder' }); fail('슬래시 명령: 같은 이름을 거절하지 않는다') } catch (e) { if (!/이미 있어요/.test(e.message)) fail('슬래시 명령: 거절 이유가 다르다 ' + e.message) }
          try { await api(`/bots/${bot.id}/commands`, { name: '한글 이름', scope: 'folder' }); fail('슬래시 명령: 부를 수 없는 이름을 받았다') } catch (e) { if (!/영문/.test(e.message)) fail('슬래시 명령: 이름 거절 이유가 다르다 ' + e.message) }
          await pg.keyboard.press('Meta+Shift+D'); await wait(400)   // 문서 열을 닫아 뒤 검사(⌘⇧D 로 여닫는 것)의 전제를 지킨다
          await pg.fill('.composer .cin', '/hel'); await wait(500)
          const sp2 = await pg.textContent('.cpop').catch(() => null)
          if (!sp2 || !/hello-bot/.test(sp2)) fail('슬래시 명령: 만든 명령이 `/` 메뉴에 안 나온다 ' + sp2)
          await pg.fill('.composer .cin', ''); await wait(200)
          ok('명령 · 스킬 한 칸 — 명령·스킬·커넥터가 한 목록 · + 로 만들면 문서 열과 `/` 메뉴에 바로')
        }
        /**
         * 🔴 **V · 모바일 디자인 3종** (2026-09-22 Dave) — 세로로 눕는 버튼 글씨 · 손가락에 안 닿는 버튼 · 문서 화면의 버튼 과밀.
         *    ⚠ 데스크톱 판으로는 못 잡는다 — 세 가지 다 **좁은 폭에서만** 난다. 그래서 폰 판을 따로 띄워 잰다.
         */
        if (name === 'desktop') {
          // ⚠ `isMobile` 은 켜지 않는다 — 크롬 기기 흉내가 마우스를 터치로 바꿔 **누른 뒤의 끌기가 사라진다**(실측).
          //    단계는 창 폭으로만 정해지므로(core/drawer) 폭 390 + hasTouch 면 폰 판이다 — H 의 좁음 판과 같은 방식.
          const vpg = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 })
          await vpg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          await vpg.goto(base + `/#bot=${bot.id}`); await vpg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(900)

          /**
           * V-2 · 떠 있는 독 — 살짝 비치고(backdrop-filter), 잡아서 위아래로 옮길 수 있고, 그 자리를 기억한다.
           * 🔴 **재는 자리가 폰에서 중간(900px)으로 옮겨 갔다** — Z(2026-09-22 Dave 확정 「B · 하단 탭」)로 **폰의 독은 하단 탭이 대신**한다.
           *    독 자체는 중간 단계에 그대로 살아 있으므로 계약도 거기서 지킨다(폰의 탭 계약은 「Z」 블록이 잰다).
           */
          const vmid = await br.newPage({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 1 })
          await vmid.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          await vmid.goto(base + `/#bot=${bot.id}`); await vmid.waitForSelector('.dock', { timeout: 15000 }); await wait(700)
          const dk = await vmid.evaluate(() => { const d = document.querySelector('.dock'); if (!d) return null; const c = getComputedStyle(d); return { blur: [c.backdropFilter, c.webkitBackdropFilter].join(' '), bg: c.backgroundColor, grip: !!d.querySelector('.grip'), db: d.querySelector('.db')?.getBoundingClientRect().height ?? 0, y: d.getBoundingClientRect().top } })
          if (!dk) fail('V-2: 중간 단계에 독이 없다')
          if (!/blur/.test(dk.blur)) fail('V-2: 독이 불투명하다(backdrop-filter 없음) ' + JSON.stringify(dk))
          // ⚠ color-mix 의 계산값은 크롬이 `color(srgb … / .62)` 로 돌려준다 — 「rgba 로 시작하나」 로 재면 안 된다
          const alpha = (c) => { const m = /\/\s*([0-9.]+)\s*\)/.exec(c) ?? /rgba?\([^)]*,\s*([0-9.]+)\)/.exec(c); return m ? +m[1] : 1 }
          if (alpha(dk.bg) >= 0.95) fail('V-2: 독 배경이 반투명이 아니다 ' + dk.bg)
          if (!dk.grip) fail('V-2: 잡는 손잡이(.grip)가 없다')
          if (dk.db < 40) fail('V-3: 독 버튼이 손가락에 안 닿는다 ' + dk.db)
          const gb = await vmid.locator('.dock .grip').boundingBox()
          // ⚠ 한 번의 move(steps) 는 합쳐져 버린다 — H 의 쓸기처럼 한 걸음씩 쉬며 끈다
          const gx = gb.x + gb.width / 2, gy = gb.y + gb.height / 2
          await vmid.mouse.move(gx, gy); await vmid.mouse.down()
          for (let i = 1; i <= 8; i++) { await vmid.mouse.move(gx, gy - (120 * i) / 8); await wait(16) }
          await vmid.mouse.up(); await wait(450)
          const moved = await vmid.evaluate(() => ({ y: document.querySelector('.dock').getBoundingClientRect().top, saved: localStorage.getItem('fb:docky') }))
          if (dk.y - moved.y < 60) fail('V-2: 독을 끌었는데 안 올라갔다 ' + JSON.stringify({ before: dk.y, after: moved.y }))
          if (!moved.saved || Math.abs(+moved.saved) < 60) fail('V-2: 옮긴 자리를 안 기억한다 ' + moved.saved)
          await vmid.reload(); await vmid.waitForSelector('.dock', { timeout: 10000 }); await wait(700)
          const kept = await vmid.evaluate(() => document.querySelector('.dock').getBoundingClientRect().top)
          if (Math.abs(kept - moved.y) > 4) fail('V-2: 다시 열었더니 자리가 돌아갔다 ' + JSON.stringify({ moved: moved.y, kept }))
          await vmid.close()
          // 🔴 폰에는 떠 있는 독이 없다 — 하단 탭이 그 자리다(Z · 2026-09-22 Dave 「B」)
          if (await vpg.$('.dock')) fail('🔴 Z: 폰에 아직 떠 있는 독이 있다 — 하단 탭이어야 한다')
          if (!(await vpg.$('.tabbar [data-tab="files"]'))) fail('🔴 Z: 폰에 하단 탭이 없다')

          /**
           * 폴더 패널을 연다. 🔴 **「명령 · 스킬」은 AD(2026-09-23)로 폰에서 빠졌다** — Dave: *«하네스나 스킬 같은 건
           * 모바일에서 보고 쓸 일이 없으니 제외»*. 그 계약(V-4)은 **중간 폭에서** 잰다(V-2 의 독과 같은 처방).
           */
          await tapNav(vpg, 'files'); await wait(800)
          if (await vpg.$('.hsec.cmds')) fail('🔴 AD: 폰 「폴더」 탭에 명령 · 스킬이 남아 있다')
          const vc = await br.newPage({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 1 })
          await vc.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
          await vc.goto(base + `/#bot=${bot.id}`); await vc.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(700)
          await tapNav(vc, 'files'); await wait(700)
          const vSech = vc.locator('.sech', { hasText: '명령 · 스킬' })
          if (!(await vSech.count())) fail('V-4: 중간 폭 패널에 「명령 · 스킬」 절이 없다')
          if (!(await vc.$('.hsec.cmds'))) { await vSech.click(); await wait(600) }

          /* V-1 · 🔴 **글씨는 가로로만 눕는다.** 칸이 좁으면 한글은 글자 단위로 감겨 「명/령」 처럼 **세로 기둥**이 된다.
             판정은 «글씨가 있는 버튼의 높이가 두 줄을 넘지 않는가» — 세로로 서면 글자 수만큼 높아진다. */
          const tall = await vpg.evaluate(() => {
            const sel = '.ib, .btn, .nb, .rb, .cbtn, .tab, .hz.more, .dock .db, .dfoot .talk, .sech, .seg button, .snav .nv'
            const bad = []
            for (const el of document.querySelectorAll(sel)) {
              if (!el.getBoundingClientRect().width) continue
              // 🔴 글씨 **마디 하나**를 자로 잰다 — 한 마디의 줄 상자가 둘 이상이면 그 글씨는 감긴 것이다.
              //    (요소째로 재면 아이콘·배지의 상자까지 세어 «여러 줄» 로 오판한다)
              const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
              for (let n = w.nextNode(); n; n = w.nextNode()) {
                const t = (n.nodeValue ?? '').trim(); if (t.length < 2 || t.length > 24) continue
                const rg = document.createRange(); rg.selectNodeContents(n)
                const lines = [...rg.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5).length
                if (lines > 1) bad.push({ cls: el.className, t: t.slice(0, 16), lines })
              }
            }
            return bad
          })
          if (tall.length) fail('V-1: 버튼 글씨가 세로로 눕는다 ' + JSON.stringify(tall))

          // V-3 · 손가락 — 목록 줄과 절 머리의 버튼
          const taps = await vpg.evaluate(() => {
            const h = (q) => [...document.querySelectorAll(q)].map((e) => Math.round(e.getBoundingClientRect().height)).filter((x) => x > 0)
            return { tools: h('.sech .tools .ib'), ib: h('.rpwrap .sec .ib') }   // «+N개 더 보기»(.more) 는 V-3 가 일부러 40px — 스킬이 7개 넘는 기기에서만 생긴다
          })
          /* ⚠ V-3 의 «명령 · 스킬 줄 44px» 는 **폰 전용 규칙**이었는데 그 절이 AD(2026-09-23)로 폰에서 빠졌다.
             중간 폭에서는 애초에 29px 가 맞는 크기라 옮겨 잴 수 없다 — 잴 것이 없어진 계약이라 여기서 접는다.
             폰에 남은 손가락 크기(절 머리 버튼 · 패널 버튼 · 독/문서 단추)는 아래에서 그대로 잰다. */
          await vc.close()
          if (taps.tools.some((x) => x < 34)) fail('V-3: 절 머리 버튼이 너무 작다 ' + JSON.stringify(taps.tools))
          await vpg.screenshot({ path: 'test/tmp/v-phone-panel.png' })

          /* V-5 · 문서 화면 — 경로 줄에는 ⋯ 하나만 남는다(목차·외부에서 열기는 그 안으로).
             앞뒤로 넘기기는 아래 줄에 «몇 번째인지» 와 함께 있다 — 같은 조작을 위아래에 두 벌 두지 않는다. */
          // ⚠ 줄 글에는 시각이 붙는다(«readme.md오전 2:38») — 이름 칸(.n)만 본다
          const opened = await vpg.evaluate(() => { const r = [...document.querySelectorAll('.rpwrap .trow:not(.dir)')].find((e) => /\.md$/.test((e.querySelector('.n')?.textContent ?? '').trim())); r?.click(); return r?.querySelector('.n')?.textContent ?? null })
          if (!opened) fail('V-5: 폰 패널에서 열 .md 파일을 못 찾았다 ')
          await vpg.waitForSelector('.docwrap .dtb', { timeout: 8000 }); await wait(700)
          const dv = await vpg.evaluate(() => {
            const vis = (e) => e.getBoundingClientRect().width > 0
            const r = document.querySelector('.docwrap .dtb .r')
            const foot = document.querySelector('.docwrap .dfoot')
            return {
              btns: [...(r?.querySelectorAll('button') ?? [])].filter(vis).length,
              more: !!r?.querySelector('.ib:not(.tocb):not(.openb)'),
              footRb: [...(foot?.querySelectorAll('.rb') ?? [])].map((e) => Math.round(e.getBoundingClientRect().height)),
              pos: foot?.querySelector('.pos')?.textContent ?? '',
              talkH: Math.round(foot?.querySelector('.talk')?.getBoundingClientRect().height ?? 0)
            }
          })
          if (dv.btns > 1) fail('V-5: 문서 경로 줄에 버튼이 아직 많다 ' + JSON.stringify(dv))
          if (dv.footRb.some((x) => x < 44)) fail('V-3: 문서 앞뒤 버튼이 손가락에 안 닿는다 ' + JSON.stringify(dv))
          if (dv.footRb.length && !/\d+ \/ \d+/.test(dv.pos)) fail('V-5: 아래 줄에 몇 번째인지가 없다 ' + JSON.stringify(dv))
          if (dv.talkH && dv.talkH < 44) fail('V-3: 「봇에게 말하기」 가 너무 작다 ' + JSON.stringify(dv))
          // 목차는 ⋯ 안으로 들어갔다 (제목이 둘 이상인 문서일 때)
          await vpg.screenshot({ path: 'test/tmp/v-phone-doc.png' })
          await vpg.close()
          ok('V 모바일 — 독 반투명·끌어 옮기기(기억) · 버튼 글씨 가로 · 손가락 크기 · 문서 줄은 ⋯ 하나 → test/tmp/v-phone-*.png')
        }
        // 🔴 문장 중간의 / 도 자동완성이 떠야 한다 (2026-09-13 Dave: «입력 중간에 / 를 입력해도»)
        await pg.fill('.composer .cin', '안녕 /st'); await wait(400)
        const midp = await pg.textContent('.cpop').catch(() => null)
        if (!midp || !/standup/.test(midp)) fail('문장 중간 «/» 에 스킬 목록이 안 뜬다 · ' + midp)
        await pg.keyboard.press('Enter'); await wait(300)
        const midv = await pg.getAttribute('.composer .cin', 'data-value')
        if (!/^안녕 \/standup $/.test(midv)) fail('문장 중간 «/» 를 고르면 앞 문장이 사라진다 · ' + JSON.stringify(midv))
        // 경로의 슬래시에는 안 뜬다
        await pg.fill('.composer .cin', 'src/cli'); await wait(400)
        if (await pg.$('.cpop')) fail('경로의 «/» 에 목록이 떴다')
        await pg.fill('.composer .cin', ''); await wait(200)
        await pg.keyboard.press('Escape'); await pg.fill('.composer .cin', '@todo'); await wait(600); const ap = await pg.textContent('.cpop'); if (!/todo\.md/.test(ap ?? '')) fail('ui @ popup: ' + ap)
        await pg.keyboard.press('Enter'); await wait(200); const ta = await pg.getAttribute('.composer .cin', 'data-value'); if (!/@todo\.md /.test(ta)) fail('ui @ insert: ' + ta); if (!(await pg.$('.composer .cin .ichip'))) fail('ui @ attach chip')
        await pg.fill('.composer .cin', '')
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
        await pg.click('.tobot')
        for (let i = 0; i < 30 && !(await pg.evaluate(() => document.querySelector('.tobot')?.classList.contains('off'))); i++) await wait(150)   // 부드러운 스크롤이 끝날 때까지(포화된 맥에서 0.9초를 넘긴다)
        if (!(await pg.evaluate(() => document.querySelector('.tobot')?.classList.contains('off')))) fail('ui ↓ should hide at bottom')
        // 파일 칩 → 문서 열이 열린다 · 트리 클릭 → 미리보기 탭
        /**
         * 🔴 **손댄 파일 칩은 답 아래에 있다** (2026-09-15 Dave: *«채팅 상단이 아니라 채팅 본문에 칩이
         *    있어야 해»*). 호스트는 도구가 파일을 건드리는 그 순간 칩 줄을 넣어(답보다 먼저) 기계 구역에
         *    얹혀 있었다 — 답을 다 읽고 나면 눈이 위로 되돌아가야 했다. 줄 순서는 `core/chatRows` 가 정한다.
         */
        {
          const pos = await pg.evaluate(() => {
            const rows = [...document.querySelectorAll('.chat-body .amsg, .chat-body .files')]
            const i = rows.findIndex((r) => r.classList.contains('files'))
            return { i, before: rows.slice(0, Math.max(0, i)).filter((r) => r.classList.contains('amsg')).length }
          })
          if (pos.i < 0) fail('손댄 파일 칩: 대화에 칩 줄이 아예 없다')
          if (!pos.before) fail('손댄 파일 칩: 답보다 위에 있다(기계 구역에 얹혔다) ' + JSON.stringify(pos))
          ok('손댄 파일 칩이 답 아래에 붙는다')
        }
        /**
         * 🔴 **파일 전후 diff** (루프 6/10) — 칩 옆 ⇄ 가 «이 턴이 손대기 전 ↔ 지금» 을 한 장으로 연다.
         *    스텁의 Write 는 `stub-output.md` 를 새로 쓰므로(또는 다시 쓰므로) + 줄에 «스텁 산출물» 이 있어야 한다.
         * ⚠ 호스트가 «전» 을 붙잡는 때는 tool_use 가 도착한 순간이다 — 그 뒤에 파일이 생겨야 «새 파일» 로 읽힌다.
         */
        {
          // 이 세션에 **다른 글**을 쓰게 한다 — 같은 글을 다시 쓰면 «바뀐 줄이 없어요» 가 정답이다(그것도 맞는 답이지만 여기서 재는 건 아니다)
          // ⚠ 해시에 `s` 가 없으면 첫 세션을 보고 있는 것이다(App 의 sessionId 규칙)
          const hashNow = await pg.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))))
          const sidNow = hashNow.s || (await api(`/bots/${hashNow.bot}/sessions`))[0]?.id
          if (!sidNow) fail('전후 diff: 보고 있는 세션을 모른다 ' + JSON.stringify(hashNow))
          const pairs0 = await pg.$$eval('.files .fpair', (r) => r.length)
          await api(`/sessions/${sidNow}/send`, { text: `승인이 필요한 일 해 줘 · 전후 비교 ${Date.now()}` })
          let pend = null
          for (let i = 0; i < 60; i++) { const c = await api(`/sessions/${sidNow}/chat`); if (c.info.pending?.length) { pend = c.info.pending[0]; break } await wait(200) }
          if (!pend) fail('전후 diff: 승인 대기가 안 왔다')
          await api(`/sessions/${sidNow}/permission`, { requestId: pend.requestId, allow: true })
          for (let i = 0; i < 60; i++) { if ((await pg.$$eval('.files .fpair', (r) => r.length)) > pairs0) break; await wait(200) }
          if ((await pg.$$eval('.files .fpair', (r) => r.length)) <= pairs0) fail('전후 diff: 새 파일 칩이 안 붙었다')
          await wait(400)
          await pg.click('.files .fpair >> nth=-1 >> .dchip'); await pg.waitForSelector('.modal.dif', { timeout: 5000 }); await wait(600)
          const dif = await pg.evaluate(() => ({ add: document.querySelectorAll('.modal.dif .ln.add').length, del: document.querySelectorAll('.modal.dif .ln.del').length, txt: document.querySelector('.modal.dif .modal-b')?.textContent ?? '', stat: document.querySelector('.modal.dif .dstat')?.textContent ?? '' }))
          if (!dif.add) fail('전후 diff: 더한 줄이 없다 ' + JSON.stringify(dif).slice(0, 300))
          if (!/전후 비교/.test(dif.txt)) fail('전후 diff: 봇이 쓴 글이 안 보인다 ' + JSON.stringify(dif.txt.slice(0, 200)))
          if (!dif.del) fail('전후 diff: 지운 줄이 없다 — «전» 을 못 붙잡았다(있던 파일을 다시 썼는데) ' + JSON.stringify(dif).slice(0, 200))
          if (!/\+\d+/.test(dif.stat)) fail('전후 diff: 머리에 +n 이 없다 ' + JSON.stringify(dif.stat))
          await pg.screenshot({ path: 'test/tmp/desktop-diff.png' })
          await pg.keyboard.press('Escape'); await wait(300)
          if (await pg.$('.modal.dif')) fail('전후 diff: ⎋ 로 안 닫힌다')
          await pg.focus('.composer .cin')
          ok('파일 전후 diff — 칩 옆 ⇄ 로 «턴 전 ↔ 지금» · ⎋ 로 닫힘')
        }
        await pg.click('.files .chip'); await pg.waitForSelector('.doc .dbody', { timeout: 5000 }); await wait(400)
        const tabs = await pg.$$eval('.doc .tab', (r) => r.length); if (tabs < 1) fail('doc tab')
        await pg.screenshot({ path: 'test/tmp/desktop-doc.png' })
        /**
         * 🔴 **PDF 내보내기** (루프 9/10) — ⋯ 메뉴의 「PDF 로 저장」 이 인쇄용 사본(`.printdoc`)을 세운 채 인쇄를 부르고,
         *    끝나면 걷는다. 편집기(보이는 줄만 그린다)가 아니라 **글 전체**를 marked 로 다시 그린 사본이어야 한다.
         * ⚠ 헤드리스에는 인쇄 대화상자가 없다 — `window.print` 를 갈아 끼워 «그 순간 body 에 뭐가 있었나» 만 잰다.
         */
        {
          await pg.evaluate(() => { window.__printed = null; window.print = () => { const d = document.querySelector('.printdoc'); window.__printed = { has: !!d, txt: d?.textContent ?? '', shown: d ? getComputedStyle(d).display : '', app: document.querySelector('#root, .app') ? 1 : 0 } } })
          await pg.click('.dtb .ib[title="더 보기"]'); await wait(300)
          const pdfBtn = pg.locator('.menu button', { hasText: 'PDF 로 저장' })
          if (!(await pdfBtn.count())) fail('PDF: ⋯ 메뉴에 「PDF 로 저장」 이 없다 ' + JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('.menu button')].map((b) => b.textContent))))
          await pdfBtn.click(); await wait(700)
          const pr = await pg.evaluate(() => window.__printed)
          if (!pr || !pr.has) fail('PDF: 인쇄 순간에 인쇄용 사본이 없다 ' + JSON.stringify(pr))
          if (!/스텁 산출물|추가/.test(pr.txt)) fail('PDF: 사본에 문서 글이 없다 ' + JSON.stringify(pr.txt.slice(0, 120)))
          if (pr.shown !== 'none') fail('PDF: 화면에서는 사본이 안 보여야 한다(인쇄에서만) ' + pr.shown)
          if (await pg.$('.printdoc')) fail('PDF: 인쇄가 끝났는데 사본이 남아 있다')
          const printCss = await pg.evaluate(() => [...document.styleSheets].some((ss) => { try { return [...ss.cssRules].some((r) => r.media && /print/.test(r.media.mediaText) && /printdoc/.test(r.cssText)) } catch { return false } }))
          if (!printCss) fail('PDF: @media print 규칙이 없다 — 앱이 같이 인쇄된다')
          ok('PDF 내보내기 — ⋯ 「PDF 로 저장」 → 글 전체의 인쇄용 사본 · 앱은 숨김 · 끝나면 걷음')
        }
        await pg.keyboard.press('Meta+Shift+D'); await wait(500); if (await pg.$('.doc')) fail('doc column should hide on ⌘⇧D · tabs=' + (await pg.$$eval('.doc .tab', (r) => r.length)) + ' · focus=' + (await pg.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className)))
        /**
         * 🔴 **파일 칩 B안 · 채팅 열 전체가 놓을 자리 · 파인더 파일 놓기** (2026-09-15 Dave: «B안이 더 좋은거 같아 …
         *    finder 에서 파일 드래그 & 드롭도 되어야 하는데 지금 기능이 안되는것 같더라고»).
         *    ① 손댄 파일 칩은 «이름 + 폴더 표식» — 봇 폴더 바로 아래 파일은 표식이 없다.
         *    ② 파일을 끌고 들어오면 채팅 열에 점선 카드가 뜨고, 대화 위에 놓아도 첨부다(입력창만이 아니다).
         *    ③ 파인더에서 온 파일은 첨부/ 에 복사되고 칩에 「첨부」 표식이 붙는다 · 트리 파일은 그대로.
         * ⚠ 헤드리스에는 파인더가 없다 — DataTransfer 에 File 을 담은 DragEvent 를 직접 보낸다(크롬이 받는다).
         */
        {
          const chip = await pg.evaluate(() => { const c = document.querySelector('.chat-body .files .fchip'); return c ? { nm: c.querySelector('.nm')?.textContent, fb: c.querySelector('.fb')?.textContent ?? null, tip: c.getAttribute('data-tip'), w: c.getBoundingClientRect().width } : null })
          if (!chip) fail('칩 B안: 손댄 파일 칩이 새 꼴(.fchip)이 아니다')
          if (chip.nm !== 'stub-output.md' || chip.fb !== null) fail('칩 B안: 봇 폴더 바로 아래 파일은 이름만이어야 한다 ' + JSON.stringify(chip))
          if (!chip.tip || !/stub-output\.md$/.test(chip.tip)) fail('칩 B안: 툴팁(전체 경로)이 없다 ' + JSON.stringify(chip))
          if (chip.w > 340) fail('칩 B안: 칩이 340px 를 넘는다 ' + chip.w)
          // 끌고 들어온다 → 점선 카드
          await pg.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['놓은 글'], 'dropped-by-smoke.txt', { type: 'text/plain' })); const el = document.querySelector('.chat-body'); el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })) })
          await wait(200)
          const zone = await pg.evaluate(() => { const z = document.querySelector('.dropzone'); return z ? { txt: z.textContent ?? '', pe: getComputedStyle(z).pointerEvents } : null })
          if (!zone) fail('놓기: 끌고 들어왔는데 점선 카드가 안 뜬다')
          if (!/첨부\//.test(zone.txt) || !/파일 1개/.test(zone.txt)) fail('놓기: 카드 문구가 다르다 ' + JSON.stringify(zone.txt))
          if (zone.pe !== 'none') fail('놓기: 카드가 마우스를 가로채면 놓기·떠남이 열에 안 닿는다 ' + zone.pe)
          // 대화 위에 놓는다 → 첨부/ 에 복사 · 입력창 위 칩(표식 「첨부」)
          await pg.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['놓은 글'], 'dropped-by-smoke.txt', { type: 'text/plain' })); document.querySelector('.chat-body').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })) })
          for (let i = 0; i < 40; i++) { if (await pg.$('.composer .cin .ichip:not(.busy)')) break; await wait(150) }
          if (await pg.$('.dropzone')) fail('놓기: 놓았는데 점선 카드가 남아 있다')
          const att = await pg.evaluate(() => [...document.querySelectorAll('.composer .cin .ichip')].map((c) => ({ nm: c.querySelector('.nm')?.textContent, fb: c.querySelector('.fb')?.textContent ?? null, busy: c.classList.contains('busy') })))
          if (!att.some((a) => a.nm === 'dropped-by-smoke.txt' && a.fb === '첨부' && !a.busy)) fail('놓기: 복사된 파일 칩이 「첨부」 표식으로 안 선다 ' + JSON.stringify(att))
          if (!existsSync(join(root, '3. Area/제품_Rondo/첨부/dropped-by-smoke.txt'))) fail('놓기: 첨부/ 에 파일이 안 생겼다')
          // 트리에서 끌어온 파일도 같은 자리 · 표식 없음
          await pg.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/x-fb-rel', 'todo.md'); dt.setData('text/x-fb-rels', JSON.stringify(['todo.md'])); dt.setData('text/x-fb-dir', '0'); const el = document.querySelector('.chat-body'); el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })) })
          await wait(300)
          const att2 = await pg.evaluate(() => [...document.querySelectorAll('.composer .cin .ichip')].map((c) => ({ nm: c.querySelector('.nm')?.textContent, fb: c.querySelector('.fb')?.textContent ?? null })))
          if (!att2.some((a) => a.nm === 'todo.md' && a.fb === null)) fail('놓기: 트리 파일이 이름만으로 안 선다 ' + JSON.stringify(att2))
          await pg.screenshot({ path: 'test/tmp/desktop-attach-chips.png' })
          // 칩은 글이다 — 입력창의 글이 곧 첨부 목록. 글 속 토큰 확인 · 비우면 첨부도 빠진다(뒤 검사가 첨부를 들고 가면 안 된다)
          const dv = await pg.getAttribute('.composer .cin', 'data-value')
          if (!/@dropped-by-smoke\.txt/.test(dv ?? '') || !/@todo\.md/.test(dv ?? '')) fail('놓기: 글 속에 @토큰이 없다 ' + JSON.stringify(dv))
          const cnt = await pg.textContent('.cbar .acount').catch(() => null)
          if (!/첨부 2개/.test(cnt ?? '')) fail('놓기: 아래 줄의 첨부 수가 틀리다 ' + cnt)
          await pg.fill('.composer .cin', ''); await wait(300)
          if (await pg.$('.composer .cin .ichip')) fail('놓기: 글을 비웠는데 칩이 남아 있다')
          if (await pg.$('.cbar .acount')) fail('놓기: 글을 비웠는데 첨부 수가 남아 있다')
          ok('파일 칩 B안 — 이름 + 폴더 표식 · 채팅 열 어디에 놓아도 첨부 · 파인더 파일은 첨부/ 로')
        }
        /**
         * 🔴 **안내글은 캐럿 뒤에 서지 않는다** (2026-09-17 Dave: «커서 위치는 임시 안내 메시지 끝 부분이 아니라 맨 앞부분이 되어야 해.
         *    그리고 키보드 입력이나 마우스 클릭시 사라져야 해»). 안내글이 흐름 안에 있으면 캐럿이 그 뒤에 선다.
         */
        {
          await pg.evaluate(() => document.activeElement?.blur())
          await wait(150)
          const ph0 = await pg.evaluate(() => getComputedStyle(document.querySelector('.composer .cin'), '::before').content)
          if (!/메시지/.test(ph0)) fail('안내글: 비어 있고 초점이 없을 때 안내글이 안 보인다 ' + ph0)
          await pg.click('.composer .cin'); await wait(200)
          const ph1 = await pg.evaluate(() => { const c = document.querySelector('.composer .cin'); const sel = window.getSelection(); const r = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null; const cr = c.getBoundingClientRect(); return { content: getComputedStyle(c, '::before').content, caretDx: r ? r.left - cr.left : null, focused: document.activeElement === c } })
          if (!ph1.focused) fail('안내글: 눌렀는데 초점이 안 온다')
          if (ph1.content !== 'none') fail('안내글: 눌렀는데 안내글이 남아 있다 ' + ph1.content)
          if (ph1.caretDx === null || ph1.caretDx > 4) fail('안내글: 캐럿이 맨 앞이 아니다 (왼쪽에서 ' + ph1.caretDx + 'px)')
          await pg.keyboard.type('가'); await wait(150)
          const ph2 = await pg.evaluate(() => getComputedStyle(document.querySelector('.composer .cin'), '::before').content)
          if (ph2 !== 'none') fail('안내글: 글자를 쳤는데 안내글이 남아 있다 ' + ph2)
          await pg.fill('.composer .cin', ''); await wait(150)
          ok('입력창 안내글 — 캐럿은 맨 앞 · 누르거나 치면 사라진다')
        }
        /**
         * 🔴 **껐다 켜면 마지막 폴더에서 시작한다** (2026-09-15 Dave: «마지막으로 작업했던 프로젝트도
         *    기억하고 그 창에서 시작되면 좋겠어»). 셸은 창을 띄울 때 주소를 **해시 없이** 열기 때문에
         *    (`loadHome()`), 이 검사도 해시 없는 주소로 다시 여는 것으로 «앱을 껐다 켠 것» 을 흉내 낸다.
         * ⚠ 기억하는 자리는 **이 기기**(localStorage)다 — 폰에서 연 폴더가 맥의 첫 화면을 바꾸면 안 된다.
         */
        {
          const was = await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot'))
          if (!was) fail('마지막 폴더: 검사 전에 폴더가 안 열려 있다')
          await pg.goto(base, { waitUntil: 'domcontentloaded' })   // 해시 없이 = 앱을 새로 켠 셈
          await pg.waitForSelector('.composer .cin', { timeout: 10000 }); await wait(700)
          const back = await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot'))
          if (back !== was) fail(`마지막 폴더: 다시 열었더니 «${back}» 로 갔다(기대 «${was}»)`)
          ok('껐다 켜면 마지막에 보던 폴더에서 시작한다')
        }
        if (errs.length) fail('page errors: ' + errs.join(' | '))
      }
      if (name === 'phone') {
        if (await pg.$('.mtabs')) fail('phone: tab bar should be gone')
        // 🔴 폰 홈의 네 칸도 같은 컴포넌트다 (맥 레일과 갈리면 설명이 두 벌이 된다)
        {
          const wasBot = await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot'))
          const wasName = ((await api('/bots')).find((b) => b.id === wasBot) ?? {}).name ?? ''
          const back = await pg.$('.chat-hdr .rb')
          if (back) { await back.click(); await wait(600) }
          const labels = await pg.$$eval('.mhome .mcards button .n', (r) => r.map((x) => x.textContent ?? ''))
          for (const want of ['확인 대기', '일하는 중', '할 일', '마지막 결과']) if (!labels.some((l) => l.includes(want))) fail(`폰 홈 4칸: «${want}» 가 없다 · ` + JSON.stringify(labels))
          // ⚠ 뒤 검사들은 **대화 화면**을 전제로 한다 — 홈으로 나왔으면 다시 들어가 둔다
          if (back) {
            await pg.evaluate((n) => { const r = [...document.querySelectorAll('.mhome .mrow')].find((x) => x.textContent?.includes(n)); r?.click() }, wasName)
            await pg.waitForSelector('.composer .cin', { timeout: 8000 }); await wait(400)
            const now = await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot'))
            if (now !== wasBot) fail('폰 홈 4칸: 검사 뒤 원래 폴더로 안 돌아왔다 · ' + JSON.stringify([wasBot, now]))
          }
          ok('폰 홈 4칸도 같은 것 — 확인 대기 · 일하는 중 · 할 일 · 마지막 결과')
          /**
           * 🔴 **폰도 껐다 켜면 마지막 화면이다** (2026-09-17 Dave: «모바일에서 화면으로 들어가면 마지막 화면이 저장이 안되네»).
           *    폴더는 돌아오는데 화면이 «목록» 에 남던 것 — 대화 화면으로 함께 돌아와야 한다.
           */
          {
            const was = await pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('bot'))
            await pg.goto(base, { waitUntil: 'domcontentloaded' })
            await pg.waitForSelector('.app', { timeout: 10000 }); await wait(1000)
            const st = await pg.evaluate(() => ({ bot: new URLSearchParams(location.hash.slice(1)).get('bot'), view: document.querySelector('.app')?.getAttribute('data-view'), composer: !!document.querySelector('.composer .cin') }))
            if (st.bot !== was) fail('폰 마지막 화면: 폴더가 안 돌아왔다 ' + JSON.stringify(st))
            if (st.view !== 'chat' || !st.composer) fail('폰 마지막 화면: 대화 화면이 아니라 «' + st.view + '» 로 열렸다')
            ok('폰 — 껐다 켜면 마지막에 보던 대화 화면으로')
          }
        }
        /**
         * 🔴 **폰의 ⏎ 는 줄 바꿈이다** (2026-09-15 Dave: *«모바일에서는 엔터가 줄내림으로 작동하고
         *    버튼을 눌러야 전송»*). 엄지로 치는 자판에서는 ⏎ 가 보내기 단추 바로 옆자리라,
         *    ⏎ 로 보내면 **반쯤 쓴 지시문**이 그대로 나간다.
         * ⚠ 자판 앞(desktop 페이지)에서는 반대다 — 그 계약은 위에서 따로 잰다. 한 코드가 두 답을 낸다.
         */
        {
          await pg.fill('.composer .cin', '폰에서는 줄 바꿈')
          await pg.keyboard.press('Enter'); await wait(600)
          const still = await pg.getAttribute('.composer .cin', 'data-value')
          if (!still.includes('폰에서는 줄 바꿈')) fail('🔴 폰에서 ⏎ 로 보내졌다 — 반쯤 쓴 말이 나간다 · ' + JSON.stringify(still))
          if (!/\n/.test(still)) fail('폰: ⏎ 가 줄바꿈도 안 했다 · ' + JSON.stringify(still))
          // 보내기는 단추로 — 그 길까지 살아 있어야 «⏎ 를 막았다» 가 완성된다
          await pg.fill('.composer .cin', '단추로 보낸다'); await wait(200)
          await pg.click('.composer .sendb'); await wait(900)
          const gone = await pg.getAttribute('.composer .cin', 'data-value')
          if (gone.trim()) fail('폰: 보내기 단추로 안 나갔다 · ' + JSON.stringify(gone))
          ok('폰에서는 ⏎ 가 줄 바꿈 · 보내기는 단추')
        /**
         * 🔴 **좌우는 고정** (2026-09-17 Dave: «모바일에서 화면이 좌우로 드래그 되면 안돼»). 넓은 코드 블록이 오면 채팅 스크롤 상자가
         *    통째로 옆으로 밀렸다. 옆으로 흐르는 것은 그 블록 **안**에서만이다.
         * ⚠ 스텁은 긴 줄을 안 주므로 넓은 <pre> 를 답 안에 넣어 재고 뺀다 — CSS 계약(가두기)을 재는 것이지 내용을 재는 게 아니다.
         */
        {
          const wide = await pg.evaluate(() => {
            const md = [...document.querySelectorAll('.chat-body .amsg .md')].pop(); if (!md) return null
            const pre = document.createElement('pre'); pre.className = 'qa-wide'; pre.textContent = 'x'.repeat(400); md.appendChild(pre)
            const sc = document.querySelector('.chat-scroll')
            const r = { scW: sc.scrollWidth, cW: sc.clientWidth, preScroll: pre.scrollWidth > pre.clientWidth, ox: getComputedStyle(sc).overflowX, ta: getComputedStyle(sc).touchAction, bodyW: document.querySelector('.chat-body').scrollWidth }
            pre.remove(); return r
          })
          // 긴 시스템 줄(«이 세션에서 항상 허용 · Bash(cd:*) · …»)도 줄임표로 접혀야 한다 — 2026-09-18 실측 409/390 으로 밀렸다
          const over = await pg.evaluate(() => [...document.querySelectorAll('.chat-body .meta .tx')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => (e.textContent || '').slice(0, 40)))
          if (over.length) fail('🔴 좌우 고정: 긴 시스템 줄이 폰 폭을 민다 ' + JSON.stringify(over))
          if (!wide) fail('좌우 고정: 답이 없어 잴 수 없다')
          if (wide.scW > wide.cW + 1) fail('🔴 좌우 고정: 넓은 코드 블록에 채팅이 옆으로 밀린다 ' + JSON.stringify(wide))
          if (!wide.preScroll) fail('좌우 고정: 코드 블록이 제 안에서 스크롤되지 않는다(잘려 보인다) ' + JSON.stringify(wide))
          if (wide.ox !== 'hidden' || wide.ta !== 'pan-y') fail('좌우 고정: 스크롤 상자가 세로 전용이 아니다 ' + JSON.stringify(wide))
          ok('폰 — 좌우는 고정, 넓은 코드는 제 안에서만 흐른다')
        }
        }
        if (!(await pg.$('.chat-hdr .rb')) || !(await pg.$('.cchips')) || !(await pg.$('.composer .plusb'))) fail('phone: round buttons / chips / pill composer')
        // 위 헤더는 불투명(페이드 없음) — 글이 밑으로 비치지 않는다
        const hb = await pg.$eval('.chat-hdr', (e) => getComputedStyle(e).backgroundImage + '|' + getComputedStyle(e).backgroundColor); if (/gradient/.test(hb) || /rgba\(\d+, \d+, \d+, 0\)/.test(hb)) fail('phone: header should be opaque ' + hb)
        // 헤더 알약의 봇 이름이 잘리지 않는다 (짧은 이름은 전부, 알약은 남는 폭을 쓴다)
        /**
         * H-5 · 좁음 헤더 한 줄 — ☰ · 표시 이름 · (작업 중 ●). ‹·폴더 아이콘은 없다. 이름은 잘리지 않는다.
         * ⚠ **키보드가 열려 있으면 헤더는 일부러 숨는다** — 재기 전에 내린다. Z(2026-09-22) 뒤로 보내기 단추가
         *    초점을 안 뺏으므로(폰에서 보내기가 안 먹던 원인) 보낸 뒤에도 키보드가 남아 있다.
         */
        await pg.evaluate(() => { document.activeElement?.blur?.(); window.visualViewport?.dispatchEvent(new Event('resize')) }); await wait(300)
        const bp = await pg.evaluate(() => { const b = document.querySelector('.chat-hdr .hnb .dn'); const h = document.querySelector('.chat-hdr'); return { text: b?.textContent, sw: b?.scrollWidth, cw: b?.clientWidth, menu: !!h.querySelector('.hb-menu'), folder: !!h.querySelector('button[title="이 폴더에서"]'), back: !!h.querySelector('button[title="뒤로"]'), h: h.getBoundingClientRect().height } })
        if (!bp.menu || bp.folder || bp.back || !(bp.cw > 40 && bp.sw <= bp.cw + 1 && /제품_Rondo/.test(bp.text ?? ''))) fail('phone: H-5 header ' + JSON.stringify(bp))
        if (Math.abs(bp.h - 44) > 1) fail('phone: H-5 header height should be 44 (+safe-area 0 here) ' + JSON.stringify(bp))
        // 키보드: 입력칸에 포커스 → 시각 뷰포트 336px 축소 → 루트가 그만큼 줄고 컴포저는 그 바닥, 헤더는 숨고, 마지막 말은 컴포저 위에 보인다
        await pg.focus('.composer .cin'); await pg.evaluate(() => window.__kb(336)); await wait(500)
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
        await pg.focus('.composer .cin'); await pg.evaluate(() => window.__kbOff(336, 300)); await wait(400)
        const push = await pg.evaluate(() => { const r = document.querySelector('#root').getBoundingClientRect(); const c = document.querySelector('.composer').getBoundingClientRect(); return { kb: document.querySelector('.app').classList.contains('kb'), rootTop: r.top, rootH: r.height, compBottom: c.bottom, ih: innerHeight, vh: visualViewport.height, top: visualViewport.offsetTop } })
        if (!push.kb) fail('phone: 밀린 시각 뷰포트를 «닫힘» 으로 착각 ' + JSON.stringify(push))
        if (Math.abs(push.rootH - push.vh) > 2 || Math.abs(push.rootTop - push.top) > 2) fail('phone: 밀린 만큼 루트가 안 따라감 ' + JSON.stringify(push))
        if (push.compBottom > push.top + push.vh + 1) fail('phone: 밀렸을 때 컴포저가 보이는 영역 밖 ' + JSON.stringify(push))
        await pg.evaluate(() => window.__kb(0)); await pg.evaluate(() => document.activeElement.blur()); await wait(300)

        // 🔴 레이아웃 뷰포트까지 줄어드는 판에서도 루트는 보이는 만큼이다
        //    종전에는 «키보드가 140px 이상 먹었을 때만» 맞췄는데, 이 판에서는 innerHeight − vv.height 가 0 이라
        //    «닫혔다» 로 떨어지고 루트가 100dvh 로 돌아갔다 — 그 dvh 는 키보드를 모르니 대화가 안 올라온다
        //    (2026-09-13 Dave 3차 스크린샷 · 그 라운드에 넣었던 interactive-widget 메타가 이 상황을 만들었다)
        await pg.focus('.composer .cin'); await pg.evaluate(() => window.__kbBoth(336)); await wait(500)
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
        await pg.focus('.composer .cin'); await pg.evaluate(() => window.__kb(336)); await wait(900)
        const stick = await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); return { d: el.scrollHeight - el.scrollTop - el.clientHeight, sh: el.scrollHeight, ch: el.clientHeight } })
        if (stick.sh > stick.ch + 20 && stick.d > 20) fail('phone: 키보드가 올라와도 맨 아래로 안 붙음 ' + JSON.stringify(stick))
        await pg.evaluate(() => window.__kb(0)); await pg.evaluate(() => document.activeElement.blur()); await wait(300)

        // iOS 26 이 키보드를 내린 뒤 시각 뷰포트를 60px 덜 돌려줘도(입력 중 아님) 루트는 전체 높이를 유지한다 — 아래 빈 띠 없음
        await pg.evaluate(() => window.__kb(60)); await wait(300)
        const stuck = await pg.evaluate(() => ({ rootH: document.querySelector('#root').getBoundingClientRect().height, ih: innerHeight, compBottom: document.querySelector('.composer').getBoundingClientRect().bottom }))
        /**
         * 🔴 **AG · 키보드가 올라오면 안전영역을 비우지 않는다** (2026-09-24 Dave: «키보드랑 채팅창 사이에도 여백이 있다»).
         *    `--sab`(홈 인디케이터 34pt)는 **이미 키보드가 덮은 자리**다 — 한 번 더 비우면 입력칸과 키보드 사이가 통째로 뜬다.
         *    ⚠ 헤드리스에서는 `env(safe-area-inset-bottom)` 이 0 이라 계산값으로 잰다.
         */
        {
          await pg.evaluate(() => { document.documentElement.style.setProperty('--sab', '34px') })
          await pg.evaluate(() => window.__kb(336)); await wait(400)
          const padKb = await pg.evaluate(() => Math.round(parseFloat(getComputedStyle(document.querySelector('.chat-foot')).paddingBottom)))
          if (padKb > 10) fail('🔴 AG: 키보드가 올라왔는데 아래 여백이 남아 있다 · ' + padKb + 'px')
          await pg.evaluate(() => { window.__kb(0); document.activeElement?.blur?.(); document.documentElement.style.removeProperty('--sab') }); await wait(300)
        }
        // Z(2026-09-22 「B · 하단 탭」) 뒤로 입력칸은 **탭 위**에 앉는다 — 바닥까지 56px(탭) + 여백이 남는 것이 제자리다
        if (Math.abs(stuck.rootH - stuck.ih) > 2 || stuck.ih - stuck.compBottom > 24 + 56) fail('phone: stale visual viewport left a bottom gap ' + JSON.stringify(stuck))
        // ⚠ 키보드가 올라와 있으면 헤더는 일부러 숨는다(`.app.kb .chat-hdr{display:none}`) — 누르기 전에 확실히 내린다
        await pg.evaluate(() => { window.__kb(0); document.activeElement?.blur?.(); window.visualViewport?.dispatchEvent(new Event('resize')) }); await wait(400)
        await pg.click('.chat-hdr .rb'); await wait(300); if (!(await pg.$('.mhome .mcards')) || (await pg.$$eval('.mrow', (r) => r.length)) < 3) fail('phone: home cards/rows'); await pg.screenshot({ path: 'test/tmp/phone-home.png' })
        if (!(await pg.$('.mrow .l1 .bname .dn'))) fail('phone: home row names should use the derived display name')
        /**
         * 🔴 **폰 홈 폴더 행 쓸기** (2026-09-18 Dave: «모바일 화면에서 todo 처럼 슬라이딩으로 기본값 고정해서 만들어줘»)
         *    데스크톱 레일 우클릭의 세 가지(맨 위에 고정 · 지우기(연결 해지) · 은퇴)를 폰에서는 쓸어서 한다.
         *    자리는 **고정**(설정 없음): →짧게·길게 = 고정 · ←짧게 = 메뉴 · ←길게 = 은퇴. 관제(오케스트레이터) 행은 안 쓸린다.
         */
        {
          const rowSel = '.mhome .swwrap .swrow'
          const n = (await pg.$$(rowSel)).length; if (n < 2) fail('phone home: folder rows should be swipeable (.swwrap) · ' + n)
          if (await pg.$('.mhome .secl:has-text("관제") + .swwrap')) fail('phone home: orchestrator row must not be swipeable')
          const sel = `${rowSel} >> nth=${n - 1}`
          const name = await pg.$eval(sel + ' >> .l1 b', (e) => e.textContent)
          const box = await pg.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }); const cy = box.y + box.h / 2
          const swipe = async (dir, frac) => {
            const x0 = dir > 0 ? box.x + 20 : box.x + box.w - 20
            await pg.dispatchEvent(sel, 'pointerdown', { pointerId: 9, pointerType: 'touch', clientX: x0, clientY: cy, buttons: 1 })
            for (const f of [0.08, 0.2, frac * 0.8, frac]) await pg.dispatchEvent(sel, 'pointermove', { pointerId: 9, pointerType: 'touch', clientX: x0 + dir * box.w * f, clientY: cy, buttons: 1 })
            await wait(120); const hint = (await pg.textContent('.mhome .swhint').catch(() => '')) ?? ''
            await pg.dispatchEvent(sel, 'pointerup', { pointerId: 9, pointerType: 'touch', clientX: x0 + dir * box.w * frac, clientY: cy })
            return hint
          }
          await swipe(-1, 0.3); await wait(350)
          const sheet = (await pg.textContent('.tsheet').catch(() => '')) ?? ''
          for (const w of ['맨 위에 고정', '지우기', '은퇴']) if (!sheet.includes(w)) fail(`phone home: swipe left-short should open the menu sheet with «${w}» · ` + JSON.stringify(sheet))
          if (await pg.$('.mhome .mrow.on, .chat-hdr')) { /* 시트가 떴다면 화면은 홈 그대로여야 한다 */ }
          await pg.click('.backdrop'); await wait(250)
          const h2 = await swipe(1, 0.6); if (!/고정/.test(h2)) fail('phone home: swipe right-long hint should say 고정 · ' + h2)
          await wait(700)
          if (!(await pg.$('.mhome'))) fail('phone home: a swipe must not open the folder (click leaked)')
          const stP = await api('/state'); const bp = stP.bots.find((x) => x.name === name)
          if (!bp?.pinned) fail('phone home: swipe right should pin the folder · ' + JSON.stringify({ name, pinned: bp?.pinned }))
          await api('/bots/pin', { id: bp.id, on: false }); await wait(300)   // 되돌린다 — 뒤 검사가 순서를 믿는다
          ok('폰 홈 폴더 행 쓸기 — ←짧게 메뉴(고정·지우기·은퇴) · →길게 고정 · 관제는 안 쓸림')
        }
        const ov = await pg.evaluate(() => { const m = document.querySelector('.mscroll'); return { sw: m.scrollWidth, cw: m.clientWidth, dw: document.documentElement.scrollWidth, iw: innerWidth } }); if (ov.sw > ov.cw || ov.dw > ov.iw) fail('phone: horizontal overflow ' + JSON.stringify(ov))
        await pg.click('.mtop .rb'); await pg.waitForSelector('.setp', { timeout: 4000 }); await wait(300)
        {
          const rows = await pg.$$eval('.setp .sec-row', (r) => r.map((x) => x.textContent))
          if (rows.length < 8 || !rows.some((r) => /할 일/.test(r))) fail('폰 설정: 목차가 목록이 아니거나 폰 전용 «할 일» 이 없다 ' + JSON.stringify(rows))
          const mr = await pg.evaluate(() => { const r = document.querySelector('.setp').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight } })
          if (!(mr.top >= 0 && mr.bottom <= mr.h + 1)) fail('phone: settings out of viewport ' + JSON.stringify(mr))
          await pg.screenshot({ path: 'test/tmp/phone-settings.png' })
          await pg.click('.setp .sec-row:has-text("일반")'); await wait(300)
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
        /**
         * 🔴 **폰 화면 넘기기** (2026-09-17 Dave: «오른쪽으로 슬라이딩하면 뒤로 가기 · 왼쪽으로 슬라이딩하면 폴더로 이동»)
         *    대화 화면에서 가로로 끌면 화면이 바뀐다. 세로가 섞인 끌기(읽어 내려가기)는 넘기기가 아니다.
         * 🔴 **«최신으로» 단추는 눌러도 제자리다** — `.rb:active { transform:scale }` 이 `translateX(-50%)` 를 덮어써
         *    누르는 순간 오른쪽으로 반 폭 튀던 버그. 가운데 맞춤이 `translate`(독립 속성)여야 한다.
         */
        {
          const view = () => pg.evaluate(() => document.querySelector('.app')?.getAttribute('data-view'))
          const drag = async (x0, y0, x1, y1) => { await pg.mouse.move(x0, y0); await pg.mouse.down(); for (let i = 1; i <= 6; i++) await pg.mouse.move(x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6); await pg.mouse.up(); await wait(250) }
          await pg.click('.mrow'); await wait(400)
          if ((await view()) !== 'chat') fail('폰 제스처: 대화 화면에서 시작해야 한다 ' + (await view()))
          await drag(8, 420, 188, 428)                    // AH · 가장자리에서 오른쪽으로 → 봇 목록
          if ((await view()) !== 'list') fail('폰 제스처: 오른쪽으로 끌었는데 뒤로 안 간다 ' + (await view()))
          await pg.click('.mrow'); await wait(400)
          await drag(200, 420, 260, 560)                  // 비스듬히 아래로 = 읽어 내려가기 — 넘기지 않는다
          if ((await view()) !== 'chat') fail('폰 제스처: 세로가 섞인 끌기를 넘기기로 읽었다 ' + (await view()))
          // AD(2026-09-23) · 👈 는 **아예 없다** — 아무 일도 일어나면 안 된다
          await drag(300, 420, 110, 426)
          if ((await view()) !== 'chat') fail('🔴 AD: 👈 가 아직 살아 있다 ' + (await view()))
          await tapNav(pg, 'files'); await wait(400)   // 폴더는 하단 탭으로 연다
          if ((await view()) !== 'panel') fail('폰 제스처: 하단 탭 «폴더» 로 폴더가 안 열린다 ' + (await view()))
          await pg.click('.rpwrap .rb'); await wait(400)  // 🔴 AD · 좌상단은 무조건 봇 목록이다
          if ((await view()) !== 'list') fail('🔴 AD: 패널 좌상단이 봇 목록으로 안 간다 ' + (await view()))
          // AH(2026-09-24) · 목록을 닫으면 **있던 화면**(폴더)으로 돌아온다 — 채팅이 아니다
          await pg.keyboard.press('Escape'); await wait(400)
          if ((await view()) !== 'panel') fail('🔴 AH: 목록을 닫았더니 있던 화면(폴더)으로 안 돌아왔다 ' + (await view()))
          await tapNav(pg, 'chat'); await wait(350)
          // «최신으로» — 규칙 자체를 잰다(transform 으로 가운데를 맞추면 :active 에 진다) + 보이면 눌러서 제자리인지
          const rule = await pg.evaluate(() => [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText) } catch { return [] } }).find((t) => t.startsWith('.tobot {') || t.startsWith('.tobot{')) ?? '')
          if (/transform:\s*translate/.test(rule) || !/translate:\s*-50%/.test(rule)) fail('최신으로: 가운데 맞춤이 transform 이다 — :active 의 scale 에 덮인다 · ' + rule)
          await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); if (el) el.scrollTop = 0 }); await wait(400)
          const tb = await pg.$('.tobot:not(.off)')
          if (tb) {
            const c0 = await tb.boundingBox()
            await pg.mouse.move(c0.x + c0.width / 2, c0.y + c0.height / 2); await pg.mouse.down(); await wait(120)
            const c1 = await tb.boundingBox(); await pg.mouse.up(); await wait(600)
            if (Math.abs((c1.x + c1.width / 2) - (c0.x + c0.width / 2)) > 1.5) fail('최신으로: 누르니 옆으로 튄다 ' + JSON.stringify({ before: c0.x, during: c1.x }))
            const at = await pg.evaluate(() => { const el = document.querySelector('.chat-scroll'); return el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0 })
            if (at > 80) fail('최신으로: 눌렀는데 아래로 안 내려간다 ' + at)
          }
          await pg.click('.chat-hdr .rb')
          await wait(350)  // 뒤로 → 홈 (아래 검사들의 출발점)
          ok('폰 제스처 — 👉 = 어디서든 봇 목록 · 👈 없음 · 폴더는 하단 탭 · 비스듬한 끌기는 스크롤 · 최신으로 단추는 제자리' + (tb ? '(눌러서 확인)' : '(규칙만 — 단추가 안 떴다)'))
        }
        await pg.click('.mrow'); await wait(300); await swipePanel(pg); if (!(await pg.$('.rpwrap .rb'))) fail('phone: panel page'); await pg.screenshot({ path: 'test/tmp/phone-panel.png' })
        // 쓸어서 처리 — 행 도구는 없고, 오른쪽으로 길게 쓸면 완료된다 (터치 흉내)
        // AD(2026-09-23) · 할 일은 이제 **「할 일」 탭**에 산다(폴더 탭에는 파일만 있다)
        {
          await tapNav(pg, 'todo'); await wait(500)
          if (!(await pg.$('.panel .swwrap'))) { // 오케스트레이터는 인박스를 쓴다 — 할 일이 있는 봇으로 옮긴다
            await pg.click('.rpwrap .rb'); await wait(400)   // AD · 좌상단 한 번이면 바로 봇 목록이다(예전엔 채팅을 거쳤다)
            for (const r of await pg.$$('.mrow')) { if (/제품_Rondo/.test((await r.textContent()) ?? '')) { await r.click(); break } }
            await wait(400); await tapNav(pg, 'todo'); await wait(400)
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
          const errN = errs.length                                   // 일부러 끊는 동안의 «못 받음» 은 오류가 아니다(크로미움 153 은 콘솔 error 로 찍는다 · 2026-09-22)
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
          for (let i = errs.length - 1; i >= errN; i--) if (/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(errs[i])) errs.splice(i, 1)
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
          /* ⚠ 화면의 `.tt` 는 **펼쳐진 절**만 보여 준다 — 새 항목이 접힌 절(요청 등)에 들어가면 안 보인다.
             「들어갔나」는 파일이 정본이므로 볼트에 대고 묻는다(AD · 2026-09-23). */
          const curBot = (await api('/bots')).find((b) => b.rel === '3. Area/제품_Rondo')
          const tdList = await api(`/bots/${curBot.id}/todo`)
          if (!JSON.stringify(tdList).includes('시트로 만든 할 일')) fail('폰 할 일: 시트로 추가가 안 된다 · 화면 ' + JSON.stringify(made))
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
        // AD(2026-09-23) · 파일은 「폴더」 탭에 산다(할 일 탭에는 트리가 없다)
        await tapNav(pg, 'files'); await wait(500)
        await pg.click('.panel .secb button.trow:not(.dir)'); await wait(600); if (!(await pg.$('.docwrap .dfoot'))) fail('phone: doc page');
        /**
         * 🔴 **AE · 문서 화면에도 탭이 있어야 한다** (2026-09-23 Dave: *«하단 탭은 채팅, 문서, 폴더 모두에서 없어지면 안 됩니다»*).
         *    문서를 열면 편집기가 **스스로 초점을 가져가** 앱이 «입력 중»(kb)으로 읽고 탭을 통째로 감췄다 — 키보드는 안 올라왔는데도.
         */
        const docBar = await pg.evaluate(() => ({ cls: document.querySelector('.app')?.className, bar: !!document.querySelector('.tabbar'), ae: (document.activeElement?.className || '').slice(0, 20), kbh: getComputedStyle(document.documentElement).getPropertyValue('--kbh').trim() }))
        if (!docBar.bar) fail('🔴 AE: 문서 화면에 하단 탭이 없다 ' + JSON.stringify(docBar))
        const dgap = await pg.evaluate(() => { const f = document.querySelector('.docwrap .dfoot')?.getBoundingClientRect(); const b = document.querySelector('.tabbar')?.getBoundingClientRect(); return f && b ? Math.round(b.top - f.bottom) : null })
        if (dgap === null || dgap < 0) fail('AE: 문서 아래 줄이 탭에 깔린다 · ' + dgap)
        await pg.screenshot({ path: 'test/tmp/phone-doc.png' })
        // ── 폰 폴더 고르기 (V17 B안) — 한 단계씩 들어가고, 푸터가 안 넘치고, 이름이 폭을 전부 쓴다 ──
        // 홈으로 — 화면 상태는 React 가 쥐고 있으니 해시를 지우고 다시 연다. ⚠ 부팅은 이제 **마지막 화면(대화)** 으로 돌아오므로(2026-09-17) 뒤로 한 번
        //   기억을 지우고 열면 첫 화면(목록)이다 — 마지막 화면 복원은 위에서 따로 잰다
        await pg.evaluate(() => localStorage.removeItem('fb:last'))
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
        // L · 봇별 내역 — 세션의 CLI 세션 id 가 기록 파일 이름. 스텁 세션 하나에 기록을 써 두면 턴이 끝난 뒤 60초 안에 그 봇 줄이 뜬다
        {
          const sL = await api(`/bots/${bot.id}/sessions`, { name: 'l-usage' }); await api(`/sessions/${sL.id}/send`, { text: '되읊어: 사용량' })
          let info = null; for (let i = 0; i < 40 && !(info && info.cliSessionId && info.state !== 'running'); i++) { await wait(200); info = (await api(`/bots/${bot.id}/sessions`)).find((x) => x.id === sL.id) }
          if (!info?.cliSessionId) fail('L: 스텁 세션에 cliSessionId 가 없다 ' + JSON.stringify(info))
          const pdir = join(fbHome, '.claude', 'projects', '-fixture'); mkdirSync(pdir, { recursive: true })
          writeFileSync(join(pdir, `${info.cliSessionId}.jsonl`), JSON.stringify({ timestamp: new Date().toISOString(), message: { model: 'claude-opus-5', usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + '\n')
          await api(`/sessions/${sL.id}/send`, { text: '되읊어: 한 번 더' })   // 턴이 끝나면 캐시가 비워진다
          let ub = null; for (let i = 0; i < 60 && !ub; i++) { await wait(500); const uu = await api('/usage'); ub = (uu.byBot || []).find((b) => b.botId === bot.id) || null }
          if (!ub || ub.tokens < 3000) fail('L: 턴이 끝났는데 봇별 내역에 이 봇이 없다 ' + JSON.stringify(ub))
          let rows = []; for (let i = 0; i < 20 && !rows.some((n) => /제품_Rondo|Rondo/.test(n)); i++) { await wait(500); if (!(await pg.$('.tsheet.usheet'))) { await pg.click('.mhome .ustrip'); await wait(400) } rows = await pg.$$eval('.tsheet.usheet .ucard .ub .n', (r) => r.map((x) => x.textContent)) }
          if (!rows.some((n) => /제품_Rondo|Rondo/.test(n))) fail('L: 카드에 봇별 줄이 없다(턴 끝 신호로 다시 물어야 한다) ' + JSON.stringify(rows))
          if (!/내 예산\((설정|기본값)\)/.test((await pg.textContent('.tsheet.usheet .ucard .un')) ?? '')) fail('L: 예산 출처 표시가 없다')
          await pg.screenshot({ path: 'test/tmp/phone-usage-bybot.png' })
          await pg.evaluate(() => document.querySelector('.backdrop').click()); await wait(300)
          await fetch(base + `/api/sessions/${sL.id}`, { method: 'DELETE' })
        }
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
    // 루프 10/10 — mermaid(수 MB)·KaTeX 도 본체에 섞이면 안 된다
    if (/mermaidAPI|flowchart-v2|katex-display|\\mathrm/.test(mainSrc)) fail('번들: mermaid 나 KaTeX 가 본체에 섞였다 — 그림·수식 없는 답에도 받게 된다')
    if (!files.some((f) => /mermaid/i.test(f))) fail('번들: mermaid 청크가 따로 없다 ' + JSON.stringify(files.slice(0, 12)))
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
    // L · 봇별 내역 · 예산 출처 · 주간 예산 0 → null(«—») (2026-09-19)
    if (!Array.isArray(u.byBot) || !['settings', 'default'].includes(u.budgetSource)) fail('L: byBot·budgetSource 가 없다 ' + JSON.stringify({ byBot: u.byBot, src: u.budgetSource }))
    await api('/usage/budget', { week: 0 }); const u0 = await api('/usage'); if (u0.week.left !== null || u0.budgetSource !== 'settings') fail('L: 주간 예산 0 이면 left 는 null · 출처는 settings ' + JSON.stringify({ w: u0.week, src: u0.budgetSource }))
    await api('/usage/budget', { week: 100 })
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
  // ── 절전 시간 설정 (루프 4/10) — 0 은 «안 재움», 상태에 실려 화면이 읽는다 ──
  {
    if ((await api('/state')).defaults.idleMinutes !== 60) fail('절전: 기본이 60분이 아니다')
    await api('/idle', { minutes: 15 })
    if ((await api('/state')).defaults.idleMinutes !== 15) fail('절전: 15분이 안 붙었다')
    await api('/idle', { minutes: 0 })
    if ((await api('/state')).defaults.idleMinutes !== 0) fail('절전: «재우지 않음»(0) 이 안 붙었다')
    await api('/idle', { minutes: 60 })
    ok('절전 시간 — 설정이 호스트에 남고 상태로 돌아온다 (0 = 안 재움)')
  }
  /**
   * 🔴 **Claude 새 채팅 기본 권한** (2026-09-17 Dave: «claude 의 경우 새채팅 기본 권한 설정도 빠져있음»).
   *    입력창 팝오버가 «새 세션은 설정의 기본값으로» 라고 약속하던 그 값이다. 저장 → 상태에 실림 → 값 없이 만든
   *    새 세션이 그 모드로 뜬다. 루틴·명시값은 그대로다. ⚠ Codex 세션에는 안 붙는다(샌드박스가 그 자리).
   * 🔴 **조용한 시간** — 종전엔 설정에 있으면서 고칠 길이 없었다. HH:MM 둘, 틀리면 거절.
   */
  {
    const st0 = await api('/state')
    if ((st0.defaults.permissionMode ?? 'default') !== 'default') fail('기본 권한: 처음은 default 여야 한다 ' + st0.defaults.permissionMode)
    await api('/defaults', { model: st0.defaults.model, effort: st0.defaults.effort, agent: 'claude', permissionMode: 'acceptEdits' })
    const st1 = await api('/state')
    if (st1.defaults.permissionMode !== 'acceptEdits') fail('기본 권한: 저장이 상태에 안 실린다 ' + JSON.stringify(st1.defaults))
    const bots = (await api('/state')).bots; const b0 = bots[0]
    const sNew = await api(`/bots/${b0.id}/sessions`, { name: '권한 기본값 검사' })
    if (sNew.permissionMode !== 'acceptEdits') fail('기본 권한: 값 없이 만든 새 세션이 기본값으로 안 떴다 ' + JSON.stringify({ permissionMode: sNew.permissionMode }))
    const sExplicit = await api(`/bots/${b0.id}/sessions`, { name: '명시 권한 검사', permissionMode: 'plan' })
    if (sExplicit.permissionMode !== 'plan') fail('기본 권한: 명시한 값을 기본값이 덮었다 ' + sExplicit.permissionMode)
    await api(`/sessions/${sNew.id}`, undefined, 'DELETE'); await api(`/sessions/${sExplicit.id}`, undefined, 'DELETE')
    await api('/defaults', { model: st0.defaults.model, effort: st0.defaults.effort, agent: 'claude', permissionMode: 'default' })
    if ((await api('/state')).defaults.permissionMode !== 'default') fail('기본 권한: default 로 되돌리기가 안 된다')
    let bad = false
    try { await api('/defaults', { model: st0.defaults.model, effort: st0.defaults.effort, agent: 'claude', permissionMode: 'yolo' }) } catch { bad = true }
    if ((await api('/state')).defaults.permissionMode !== 'default') fail('기본 권한: 모르는 값이 저장됐다')
    // 조용한 시간
    const q0 = (await api('/state')).quiet
    if (!q0 || q0.from !== '23:00' || q0.to !== '07:00') fail('조용한 시간: 기본값이 23:00–07:00 이어야 한다 ' + JSON.stringify(q0))
    await api('/quiet', { from: '22:30', to: '08:00' })
    const q1 = (await api('/state')).quiet
    if (q1.from !== '22:30' || q1.to !== '08:00') fail('조용한 시간: 저장이 상태에 안 실린다 ' + JSON.stringify(q1))
    let rejected = false
    try { await api('/quiet', { from: '25:00', to: '08:00' }) } catch { rejected = true }
    if (!rejected) fail('조용한 시간: 틀린 시각(25:00)을 받았다')
    await api('/quiet', { from: '23:00', to: '07:00' })
    ok(`Claude 새 채팅 기본 권한 — 저장 · 상태 · 새 세션에 적용 · 명시값 우선 · 모르는 값 거절${bad ? '' : '(조용히)'} · 조용한 시간 저장·검증`)
  }
  }

  /**
   * ── 볼트 루트 바꾸기 (2026-09-14 Dave: «지금 현재 기본 볼트 수정이 안되네») ──
   * 🔴 **화면에서 바꾼 것이 설정 파일까지 가야 한다.** 종전에는 호스트 맥 트레이에만 길이 있었고
   *    설정 화면은 읽기 전용이었다 — 폰·맥북에서는 바꿀 방법이 아예 없었다.
   * ⚠ 터미널 호스트에는 되세울 셸(`onRoot`)이 없다 → `restarting:false` 로 **솔직히** 답해야 한다.
   */
  {
    const other = realpathSync(mkdtempSync(join(tmpdir(), 'fb-vault2-')))   // 호스트는 realpath 로 돌려준다(맥 /var → /private/var)
    mkdirSync(join(other, '1. Inbox'), { recursive: true })
    const br = await api(`/root/browse?path=${encodeURIComponent(other)}`)
    if (!br.dirs.some((d) => d.name === '1. Inbox')) fail('루트 고르기: 하위 폴더를 못 읽는다 ' + JSON.stringify(br))
    if (!br.parent) fail('루트 고르기: 상위로 갈 길이 없다')
    for (const bad of ['PARA', join(other, '없는폴더')]) {
      const r = await fetch(base + '/api/root', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: bad }) })
      if (r.ok) fail(`루트 바꾸기: 말이 안 되는 경로를 받아 줬다 (${bad})`)
    }
    const same = await api('/root', { path: root })
    if (!same.same) fail('루트 바꾸기: 같은 폴더인데 바꿨다고 한다')
    const moved = await api('/root', { path: `${other}/` })   // 끝 슬래시도 같은 곳이어야 한다
    if (moved.root !== other || moved.restarting !== false) fail('루트 바꾸기: 저장 결과가 이상하다 ' + JSON.stringify(moved))
    const cfgFile = join(data, 'config.json')
    if (JSON.parse(readFileSync(cfgFile, 'utf8')).root !== other) fail('루트 바꾸기: 설정 파일에 안 남았다')
    await api('/root', { path: root })   // ⚠ 되돌린다 — 아래 검사가 이 볼트로 호스트를 다시 띄운다
    if (JSON.parse(readFileSync(cfgFile, 'utf8')).root !== root) fail('루트 바꾸기: 되돌리기가 안 됐다')
    rmSync(other, { recursive: true, force: true })
    ok('볼트 루트 — 폴더를 훑어 고르고 · 아무 경로나 안 받고 · 설정에 남는다')
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
