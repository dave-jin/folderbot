// G · 채팅 파일 칩 → 문서 창 실측 — ⓐ 형식 거름 / ⓑ 칩·경로 해석 / ⓒ 창 닫힘 중 무엇인가
import { existsSync as __ex } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// 브라우저 — 컨테이너(/opt/pw-browsers)면 그것, 맥이면 Playwright 캐시(~/Library/Caches/ms-playwright · `node node_modules/playwright-core/cli.js install chromium-headless-shell`). PW_CHROMIUM 으로 덮는다
const PW_CHROMIUM = process.env.PW_CHROMIUM || (__ex('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo/files', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n'
writeFileSync(join(root, '3. Area/제품_Rondo/files/설명서.pdf'), pdf)
writeFileSync(join(root, '3. Area/제품_Rondo/files/그림.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
writeFileSync(join(root, '3. Area/제품_Rondo/files/메모.md'), '# 메모\n')
writeFileSync(join(root, '1. Inbox/바깥.md'), '# 바깥\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7397, base = `http://127.0.0.1:${PORT}`
await new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', (c) => (c === 0 ? res() : rej(new Error('init')))) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => { const r = await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json() }
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const sess = await api(`/bots/${bot.id}/sessions`, { name: 'g' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })
const pg = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:docopen') })
await pg.goto(base + `/#bot=${bot.id}&s=${sess.id}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(400)
const say = async (t) => { await api(`/sessions/${sess.id}/send`, { text: '되읊어: ' + t }); await wait(900) }
const state = () => pg.evaluate(() => ({ doc: !!document.querySelector('.docwrap'), tabs: [...document.querySelectorAll('.dtb .nm')].map((e) => e.textContent), chips: [...document.querySelectorAll('.amsg .pchip')].map((e) => [e.textContent, e.dataset.rel, e.className]), lastChips: [...([...document.querySelectorAll('.amsg')].pop()?.querySelectorAll('.pchip') ?? [])].map((e) => [e.textContent, e.dataset.rel]), iframe: !!document.querySelector('.docwrap iframe'), img: !!document.querySelector('.docwrap img'), empty: document.querySelector('.docwrap .empty')?.textContent ?? null }))
const closePane = async () => { if (await pg.$('.docwrap')) { await pg.keyboard.press('Meta+Shift+D'); await wait(300) } }
const out = {}
try {
  // 1. 닫힌 창 + pdf 경로 칩 클릭
  await say('설명서는 `files/설명서.pdf` 에 있습니다'); await closePane()
  let st = await state(); out.pdfChipExists = st.chips.some((c) => /설명서\.pdf/.test(c[0]))
  await pg.evaluate(() => [...document.querySelectorAll('.amsg .pchip')].find((e) => /설명서\.pdf/.test(e.textContent))?.click()); await wait(700)
  st = await state(); out.closed_pdfClick = { docOpened: st.doc, tabs: st.tabs, iframe: st.iframe }
  // 2. 열린 창 + pdf 칩 클릭 (먼저 md 를 열어 창을 연다)
  await pg.evaluate((id) => { window.dispatchEvent(new CustomEvent('fb:dbg')) }, 0)
  await say('메모는 `files/메모.md` 를 보세요')
  await pg.evaluate(() => [...document.querySelectorAll('.amsg .pchip')].find((e) => /메모\.md/.test(e.textContent))?.click()); await wait(700)
  st = await state(); out.closed_mdClick = { docOpened: st.doc, tabs: st.tabs }
  if (!st.doc) { await pg.click('.panel .trow:not(.dir)').catch(() => {}); await wait(500) }
  await pg.evaluate(() => [...document.querySelectorAll('.amsg .pchip')].find((e) => /설명서\.pdf/.test(e.textContent))?.click()); await wait(900)
  st = await state(); out.open_pdfClick = { docOpened: st.doc, tabs: st.tabs, iframe: st.iframe, empty: st.empty }
  // 3. 이미지 칩 · 파일명만 · 폴더 밖
  await say('그림은 `files/그림.png` 이고, 파일명만 적으면 `설명서.pdf` 이며, 바깥은 `1. Inbox/바깥.md` 입니다')
  st = await state(); out.chips_after3 = st.lastChips
  out.bareNameChip = st.lastChips.some((c) => c[1] === '설명서.pdf' || c[1] === 'files/설명서.pdf')
  await pg.evaluate(() => [...document.querySelectorAll('.amsg .pchip')].find((e) => /그림\.png/.test(e.textContent))?.click()); await wait(900)
  st = await state(); out.open_pngClick = { tabs: st.tabs, img: st.img }
  await pg.evaluate(() => [...document.querySelectorAll('.amsg .pchip')].find((e) => /바깥\.md/.test(e.textContent))?.click()); await wait(900)
  st = await state(); out.open_outsideClick = { tabs: st.tabs }
  // 4. 트리에서 pdf 를 직접 열면 뷰어가 뜨나 (ⓐ 판정)
  await api(`/bots/${bot.id}/file`, { rel: 'files/메모.md', text: '# 메모\n' })
  await pg.evaluate(() => { const d = [...document.querySelectorAll('.panel .trow.dir')].find((e) => /^files/.test(e.textContent.trim())); d?.click() }); await wait(600)
  await pg.evaluate(() => { const b = [...document.querySelectorAll('.panel .trow')].find((e) => /설명서\.pdf/.test(e.textContent)); b?.click() }); await wait(1200)
  st = await state(); out.tree_pdfOpen = { tabs: st.tabs, iframe: st.iframe, empty: st.empty }
  console.log(JSON.stringify(out, null, 1))
} catch (e) { console.error('ERR', e) } finally { await br.close(); host.kill() }
