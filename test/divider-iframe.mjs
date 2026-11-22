// 문서 창 분할선 끌기 — 오른쪽에 PDF(iframe)가 떠 있을 때 선이 커서를 못 따라가나 (2026-11-22 Dave: «PDF 미리보기가 뜰 때는 가운데 섹션 줄이 빠르게 안 된다»)
// 같은 끌기를 ① md(iframe 없음) ② pdf(iframe) ③ pdf 빠른 끌기(3걸음)로 하고, 문서 창 폭이 커서만큼(120px) 바뀌는지 잰다. 실패면 exit 1.
// 고치기 전 판(styles.css 의 `.app.dragx iframe` 규칙 없음)에서 pdf·빠른 끌기가 0px 로 빨개지는 것을 확인했다(md 는 120px). `npm run qa` 끝에서 돈다.
import { existsSync as __ex } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const PW_CHROMIUM = process.env.PW_CHROMIUM || (__ex('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo/files', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n'
writeFileSync(join(root, '3. Area/제품_Rondo/files/설명서.pdf'), pdf)
writeFileSync(join(root, '3. Area/제품_Rondo/files/메모.md'), '# 메모\n\n본문\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7398, base = `http://127.0.0.1:${PORT}`
await new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', (c) => (c === 0 ? res() : rej(new Error('init')))) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => { const r = await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json() }
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const sess = await api(`/bots/${bot.id}/sessions`, { name: 'g' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })
const pg = await br.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:docopen') })
await pg.goto(base + `/#bot=${bot.id}&s=${sess.id}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(400)
await api(`/sessions/${sess.id}/send`, { text: '되읊어: 메모는 `files/메모.md`, 설명서는 `files/설명서.pdf`' }); await wait(1200)
const open = async (re) => {
  if (!(await pg.evaluate(() => [...document.querySelectorAll(".trow")].some((e) => /메모\.md/.test(e.textContent))))) { await pg.evaluate(() => [...document.querySelectorAll(".trow.dir")].find((e) => /^files/.test(e.textContent.trim()))?.click()); await wait(600) }
  await pg.evaluate((s) => [...document.querySelectorAll(".trow")].find((e) => new RegExp(s).test(e.textContent))?.click(), re); await wait(1000)
}
const docW = () => pg.evaluate(() => Math.round(document.querySelector('.docwrap')?.getBoundingClientRect().width ?? -1))
// 문서 창 바로 앞 분할선 — 끌어서 오른쪽(문서 창 쪽)으로 dx 만큼, steps 번에 나눠 옮긴다
const drag = async (dx, steps) => {
  const h = await pg.evaluate(() => { const d = document.querySelector('.docwrap'); const v = d?.previousElementSibling; if (!v || !v.classList.contains('divx')) return null; const r = v.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  if (!h) throw new Error("문서 창 분할선을 못 찾음 " + JSON.stringify(await pg.evaluate(() => ({ doc: !!document.querySelector(".docwrap"), cols: [...document.querySelector(".cols").children].map((e) => e.className) }))))
  const w0 = await docW()
  await pg.mouse.move(h.x, h.y); await pg.mouse.down()
  await pg.mouse.move(h.x + dx, h.y, { steps }); await wait(100)
  const wMid = await docW()
  await pg.mouse.up(); await wait(150)
  return { w0, wMid, moved: w0 - wMid, want: dx }
}
const out = {}; let ok = true
try {
  await open('메모\\.md'); out.md = { iframe: await pg.$('.docwrap iframe') !== null, ...(await drag(120, 12)) }
  await drag(-120, 12) // 되돌리기
  await open('설명서\\.pdf'); out.pdf = { iframe: await pg.$('.docwrap iframe') !== null, ...(await drag(120, 12)) }
  await drag(-120, 12)
  out.pdfFast = await drag(120, 3) // 빠른 끌기 — 몇 번 안 되는 큰 걸음
  for (const k of ['md', 'pdf', 'pdfFast']) if (Math.abs(out[k].moved - out[k].want) > 4) ok = false
  out.ok = ok
  console.log(JSON.stringify(out, null, 1))
} catch (e) { console.error('ERR', e); ok = false } finally { await br.close(); host.kill() }
process.exit(ok ? 0 : 1)
