// P · 키보드 열린 채 당기기 녹화 — 폰 뷰포트에서 (1) 칩 답 (2) 첨부 칩 행 (3) 키보드 열림 + 시각 뷰포트 밀림(당기기) (4) 키보드 내림. 5초 안팎 webm 하나.
//   실행: node test/record-p.mjs  → test/tmp/p-keyboard.webm · p-rec-*.png
import { existsSync as __ex } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 브라우저 — 컨테이너(/opt/pw-browsers)면 그것, 맥이면 Playwright 캐시(~/Library/Caches/ms-playwright · `node node_modules/playwright-core/cli.js install chromium-headless-shell`). PW_CHROMIUM 으로 덮는다
const PW_CHROMIUM = process.env.PW_CHROMIUM || (__ex('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo/files', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n'); writeFileSync(join(root, '3. Area/제품_Rondo/files/메모.md'), '# 메모\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7396, base = `http://127.0.0.1:${PORT}`
await new Promise((res) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', res) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => (await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })
const vp = { width: 390, height: 844 }
const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true, recordVideo: { dir: 'test/tmp/p-video', size: vp } }); const pg = await ctx.newPage()
await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
await pg.addInitScript(() => {
  const t = new EventTarget(); let hOv = null, top = 0
  const vv = { get width() { return window.innerWidth }, get height() { return hOv ?? window.innerHeight }, get offsetTop() { return top }, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1, addEventListener: t.addEventListener.bind(t), removeEventListener: t.removeEventListener.bind(t), dispatchEvent: t.dispatchEvent.bind(t) }
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  window.__kb = (h, tp = 0) => { hOv = window.innerHeight - h; top = tp; vv.dispatchEvent(new Event('resize')) }
  window.__kbScroll = (tp) => { top = tp; vv.dispatchEvent(new Event('scroll')) }
  window.__kbReset = () => { hOv = null; top = 0; vv.dispatchEvent(new Event('resize')) }
})
const sid = (await api(`/bots/${bot.id}/sessions`, { name: 'p-rec' })).id
await api(`/sessions/${sid}/send`, { text: '되읊어: 첫 줄에는 칩이 없다 그냥 글자만\n\n둘째 줄에는 files/메모.md 칩이 있다 그리고 글자\n\n셋째 줄 3/5 → 처리 v0.2.113 은 칩이 아니다 `files/메모.md` 코드도 아니다' })
await wait(500); await pg.goto(base + `/#bot=${bot.id}&s=${sid}`); await pg.waitForSelector('.composer .cin'); await wait(900)
await pg.screenshot({ path: 'test/tmp/p-rec-1-chips.png' })
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
await pg.setInputFiles('input[accept="image/*"][multiple]', [{ name: '스크린샷.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }]); await wait(900)
await pg.click('.composer .cin'); await pg.keyboard.type('이 그림 보고'); await wait(400)
await pg.screenshot({ path: 'test/tmp/p-rec-2-composer.png' })
await pg.evaluate(() => window.__kb(336)); await wait(700)
// 키보드 열린 채 당기기 — iOS 가 시각 뷰포트를 밀어 올리는 것을 흉내(offsetTop 0→80→0) · 문서는 굴러도 바로 0 으로
for (const tp of [20, 40, 60, 80, 80, 60, 40, 20, 0]) { await pg.evaluate((t) => { window.scrollTo(0, t); window.__kbScroll(t) }, tp); await wait(120) }
await wait(400); await pg.screenshot({ path: 'test/tmp/p-rec-3-keyboard.png' })
const st = await pg.evaluate(() => ({ y: scrollY, rootTop: document.querySelector('#root').getBoundingClientRect().top, compBottom: document.querySelector('.composer').getBoundingClientRect().bottom, vvH: visualViewport.height }))
await pg.evaluate(() => window.__kbReset()); await pg.evaluate(() => document.activeElement.blur()); await wait(900)
const dn = await pg.evaluate(() => ({ y: scrollY, compBottom: document.querySelector('.composer').getBoundingClientRect().bottom, ih: innerHeight }))
await pg.screenshot({ path: 'test/tmp/p-rec-4-down.png' })
console.log(JSON.stringify({ pulled: st, down: dn }))
const vid = pg.video(); await pg.close(); await ctx.close(); if (vid) { try { renameSync(await vid.path(), 'test/tmp/p-keyboard.webm') } catch {} }
await br.close(); host.kill(); process.exit(0)
