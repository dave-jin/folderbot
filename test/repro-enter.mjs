// I · 입력창 줄내림 재현 — ⇧⏎ 한 번에 줄이 바뀌나(영문 · 빈 줄 · 한글 조합 중) · 컴포저가 자라면 채팅이 따라오나
import { existsSync as __ex } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 브라우저 — 컨테이너(/opt/pw-browsers)면 그것, 맥이면 Playwright 캐시(~/Library/Caches/ms-playwright · `node node_modules/playwright-core/cli.js install chromium-headless-shell`). PW_CHROMIUM 으로 덮는다
const PW_CHROMIUM = process.env.PW_CHROMIUM || (__ex('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7397, base = `http://127.0.0.1:${PORT}`
await new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', (c) => (c === 0 ? res() : rej(new Error('init')))) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => { const r = await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json() }
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })
const out = []
const log = (o) => { out.push(o); console.log(JSON.stringify(o)) }

/** 캐럿의 화면 줄(y) · 값의 줄 수 · DOM 끝 자리표 유무 */
const probe = (pg) => pg.evaluate(() => {
  const e = document.querySelector('.composer .cin'); const sel = window.getSelection(); let y = null
  if (sel && sel.rangeCount) { const r = sel.getRangeAt(0).cloneRange(); r.collapse(true); const rs = r.getClientRects(); if (rs.length) y = rs[0].y; else { const s = document.createElement('span'); s.textContent = '​'; r.insertNode(s); y = s.getBoundingClientRect().y; s.remove() } }
  const v = e.dataset.value ?? ''
  return { caretY: y === null ? null : Math.round(y), lines: v.split('\n').length, val: JSON.stringify(v), tailBr: e.lastChild?.nodeName === 'BR', cinH: Math.round(e.getBoundingClientRect().height) }
})
async function page(width = 1200, height = 800) {
  const pg = await br.newPage({ viewport: { width, height }, deviceScaleFactor: 1, ...(width < 760 ? { hasTouch: true, isMobile: true } : {}) })
  await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
  await pg.goto(base + `/#bot=${bot.id}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(400)
  await pg.click('.composer .cin'); return pg
}

// ① 영문 뒤 ⇧⏎ 한 번
{ const pg = await page(); await pg.keyboard.type('abc'); const a = await probe(pg); await pg.keyboard.press('Shift+Enter'); await wait(80); const b = await probe(pg); await pg.keyboard.press('Shift+Enter'); await wait(80); const c = await probe(pg)
  log({ case: '① 영문 뒤 ⇧⏎', before: a, after1: b, after2: c, visibleAfter1: b.caretY !== a.caretY, verdict: b.caretY !== a.caretY ? '한 번에 줄 바뀜' : '⚠ 첫 ⇧⏎ 이 보이지 않음(두 번째에야 줄이 바뀜)' }); await pg.close() }
// ② 빈 입력창에서 ⇧⏎ 한 번
{ const pg = await page(); const a = await probe(pg); await pg.keyboard.press('Shift+Enter'); await wait(80); const b = await probe(pg); await pg.keyboard.type('x'); await wait(80); const c = await probe(pg)
  log({ case: '② 빈 줄에서 ⇧⏎', before: a, after1: b, thenX: c, verdict: c.lines === 2 && c.caretY !== a.caretY ? '한 번에 줄 바뀜' : '⚠ 첫 ⇧⏎ 이 보이지 않음' }); await pg.close() }
// ③ 한글 조합 중 ⇧⏎ (CDP 로 조합 상태를 만든 뒤 키를 누른다)
{ const pg = await page(); await pg.keyboard.type('ab'); const cdp = await pg.context().newCDPSession(pg)
  await pg.evaluate(() => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })))
  await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 }); await wait(50)
  const a = await probe(pg)
  const seen = await pg.evaluate(() => { window.__ev = []; const e = document.querySelector('.composer .cin'); for (const t of ['keydown', 'compositionend', 'input', 'keyup']) e.addEventListener(t, (ev) => window.__ev.push(t + (ev.isComposing ? '(c)' : '') + (ev.key ? ':' + ev.key : ''))); return 1 })
  await pg.keyboard.press('Shift+Enter'); await wait(120)
  const b = await probe(pg); const ev = await pg.evaluate(() => window.__ev)
  // 크롬 실기기처럼 IME 가 확정하는 경우를 흉내: 조합 끝 이벤트를 우리가 쏜다
  await pg.evaluate(() => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '하' }))); await wait(80)
  const c = await probe(pg)
  log({ case: '③ 조합 중 ⇧⏎', before: a, afterKey: b, events: ev, afterEnd: c, verdict: c.lines === 2 && /하/.test(c.val) ? '한 번에 줄 + 글자 유지' : '⚠ ' + (c.lines < 2 ? '줄이 안 바뀜' : '조합 글자 잃음') }); await cdp.detach(); await pg.close() }
// ④ 조합 끝 직후 ⏎ (Safari 순서 흉내: compositionend → keydown Enter, isComposing=false) — 마지막 글자가 잘려 보내지나
{ const pg = await page(); const sid = (await api(`/bots/${bot.id}/sessions`, { name: 'i-repro' })).id; await pg.goto(base + `/#bot=${bot.id}&s=${sid}`); await pg.waitForSelector('.composer .cin'); await wait(300); await pg.click('.composer .cin')
  await pg.keyboard.type('ab'); const cdp = await pg.context().newCDPSession(pg)
  await pg.evaluate(() => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })))
  await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 }); await cdp.send('Input.insertText', { text: '하' })
  await pg.evaluate(() => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '하' })))
  await pg.keyboard.press('Enter'); await wait(600)
  const chat = await api(`/sessions/${sid}/chat`); const sent = chat.items?.filter((i) => i.kind === 'user').map((i) => i.text) ?? []
  const left = await pg.$eval('.composer .cin', (e) => e.dataset.value)
  log({ case: '④ 조합 끝 직후 ⏎ (Safari 순서)', sent, left, verdict: sent[0] === 'ab하' ? '온전히 보내짐' : sent.length ? '⚠ 잘려 보내짐: ' + JSON.stringify(sent) : '안 보내짐(조합 확정만) · 남은 글 ' + JSON.stringify(left) }); await cdp.detach(); await pg.close() }
// ⑤ 폰 폭 — 줄을 5번 늘리면 캐럿·마지막 메시지가 보이나
{ const pg = await page(390, 700); const sid = (await api(`/bots/${bot.id}/sessions`, { name: 'i2' })).id
  for (let i = 0; i < 6; i++) await api(`/sessions/${sid}/send`, { text: '되읊어: 메시지 ' + i + ' ' + 'x'.repeat(120) })
  await wait(800); await pg.goto(base + `/#bot=${bot.id}&s=${sid}`); await pg.waitForSelector('.composer .cin'); await wait(600)
  const sc = () => pg.evaluate(() => { const s = document.querySelector('.chat-body')?.parentElement; const last = [...document.querySelectorAll('.chat-body > *')].pop(); const comp = document.querySelector('.composer').getBoundingClientRect(); const lb = last?.getBoundingClientRect(); return { atBottom: s ? Math.round(s.scrollHeight - s.scrollTop - s.clientHeight) : null, lastBottom: lb ? Math.round(lb.bottom) : null, compTop: Math.round(comp.top), lastVisible: lb ? lb.bottom <= comp.top : null } })
  await pg.evaluate(() => { const s = document.querySelector('.chat-body')?.parentElement; if (s) s.scrollTop = s.scrollHeight }); await wait(200)
  await pg.click('.composer .cin'); await wait(300); const a = await sc()
  for (let i = 0; i < 5; i++) { await pg.keyboard.type('줄 ' + i); await pg.keyboard.press('Shift+Enter'); await wait(60) }
  await wait(300); const b = await sc(); const pr = await probe(pg)
  const caretVisible = pr.caretY !== null && pr.caretY < 700 && pr.caretY > 0
  log({ case: '⑤ 폰 폭 · 줄 5번 늘림', before: a, after: b, caret: pr, verdict: (b.lastVisible ? '마지막 메시지 보임' : '⚠ 마지막 메시지가 컴포저에 가려짐') + ' · ' + (caretVisible ? '캐럿 보임' : '⚠ 캐럿 안 보임') }); await pg.screenshot({ path: 'test/tmp/i2-before.png' }); await pg.close() }
await br.close(); host.kill()
writeFileSync('test/tmp/repro-enter.json', JSON.stringify(out, null, 1))
