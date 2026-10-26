/**
 * DB · ask 세션 보이기 — 눈으로 보는 캡처 (2026-10-25 Dave «바꾸기 전과 바꾼 뒤의 스크린샷을 남긴다»).
 * 픽스처 볼트 · 스텁 CLI 로 호스트를 띄우고, 할일이(halili)가 `folderbot ask --no-wait` 로 폴더 봇과 오케스트레이터에 하나씩 묻는다.
 * 묻는 중 · 답한 뒤 · 줄을 눌러 연 뒤를 데스크톱(다크·라이트) · 좁은 창 · 폰 크기로 찍는다. 바꾸기 전 판에서도 같은 스크립트가 돈다.
 *
 * 쓰기: `node test/shot-ask.mjs --out <폴더> [--tag before|after]` → `<폴더>/<tag>-*.png`
 */
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const OUT = arg('out', join(process.cwd(), 'test/tmp')), TAG = arg('tag', 'after')
mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const root = realpathSync(mkdtempSync(join('/tmp', 'fb-shotask-')))
const data = mkdtempSync(join(tmpdir(), 'fb-shotaskdata-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-shotaskhome-'))
for (const d of ['1. Inbox', '3. Area/제품_Rondo', '3. Area/사업_이네이트', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
for (const f of ['제품_Rondo', '사업_이네이트']) { writeFileSync(join(root, `3. Area/${f}/CLAUDE.md`), `# ${f}\n`); writeFileSync(join(root, `3. Area/${f}/todo.md`), '# todo\n\n## 할 일\n- [ ] 하나\n') }

const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_NO_AUTH: '1', FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1' }
const PORT = 7468
const portFree = (p) => new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))) })
if (!(await portFree(PORT))) { console.error(`포트 ${PORT} 가 이미 잡혀 있어요`); process.exit(1) }
execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
const tokF = join(data, 'halili-in.env'); writeFileSync(tokF, 'TOKEN=qa-shot-token-0123456789abcdef\n', { mode: 0o600 })
mkdirSync(join(root, '.claude'), { recursive: true })
writeFileSync(join(root, '.claude/bridges.yml'), `bridges:\n  - id: halili\n    name: 할일이\n    icon: ✅\n    mailbox: 싱크-ask\n    trust: propose\n    may_ask: [orch, "3. Area/*"]\n    inbound: { env: ${JSON.stringify(tokF)} }\n`)
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env, stdio: 'ignore' })
const base = `http://127.0.0.1:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/bots'); break } catch { await wait(150) } }
for (let i = 0; i < 80 && !existsSync(join(root, '싱크-ask/cursors/folderbot.json')); i++) await wait(150)
const start = async (rel) => (await fetch(base + '/api/bots/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel }) })).json()
const rondo = await start('3. Area/제품_Rondo'); await start('3. Area/사업_이네이트')
const ask = (args) => new Promise((res) => { const p = spawn('node', ['bin/folderbot.mjs', 'ask', ...args], { env }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.on('exit', (code) => res({ code, out: out.trim() })) })

const browser = await chromium.launch()
const shots = []
const shoot = async (page, name) => { const f = join(OUT, `${TAG}-${name}.png`); await page.screenshot({ path: f }); shots.push(f) }
const ctxOf = async (o) => { const c = await browser.newContext(o.ctx); await c.addInitScript((t) => { try { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', t) } catch { /* */ } }, o.theme); const p = await c.newPage(); await p.goto(base + '/', { waitUntil: 'domcontentloaded' }); await wait(1500); return p }   // ⚠ networkidle 은 실시간 연결 때문에 안 온다(30초씩 버렸다)

try {
  const desk = await ctxOf({ ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, theme: 'dark' })
  // 폴더 봇을 연 채로 둔다 — 세션 목록에서 ask 세션이 어디 있는지(자동화 묶음 안인지 맨 위인지) 보이게
  await desk.locator(`.brow[data-id="${rondo.id}"]`).click().catch(() => {}); await wait(800)
  await shoot(desk, '0-desk-before-ask')

  // 폴더 봇에 먼저, 오케스트레이터에 다음 — 시작한 순서대로 서야 한다
  const a1 = await ask(['--as', 'halili', '--to', '제품_Rondo', '--no-wait', '시험 · 상태 한 줄 · 느린일 25초'])
  await wait(400)
  const a2 = await ask(['--as', 'halili', '--no-wait', '시험 · 볼트 현황 · 느린일 25초'])
  console.log('ask', a1.code, a1.out.split('\n')[0], a2.code, a2.out.split('\n')[0])
  await wait(2500)
  await shoot(desk, '1-desk-asking')

  const light = await ctxOf({ ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, theme: 'light' })
  await light.locator(`.brow[data-id="${rondo.id}"]`).click({ timeout: 3000 }).catch(() => {}); await wait(800)
  await shoot(light, '2-desk-light-asking')
  const narrow = await ctxOf({ ctx: { viewport: { width: 980, height: 700 }, deviceScaleFactor: 2 }, theme: 'dark' })
  // 좁은 창은 폴더 목록이 서랍 안이다 — 서랍을 열고 찍는다(숨은 줄을 누르면 30초를 버린다)
  await narrow.locator('.strip.left .ib').first().click({ timeout: 3000 }).catch(() => {}); await wait(800)
  await shoot(narrow, '3-narrow-asking')
  const phone = await ctxOf({ ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, theme: 'dark' })
  await shoot(phone, '4-phone-asking')

  // ⚠ 답이 나는 동안 그 대화를 보고 있으면 «읽음» 이 돼 원래 자리로 간다(설계대로) — 캡처 화면은 다른 폴더를 본다
  const ine = (await (await fetch(base + '/api/bots')).json()).find((b) => b.name === '사업_이네이트')
  await light.context().close(); await narrow.context().close()   // 좁은 창은 폴더 목록이 서랍 안이라 옮기기 클릭이 안 먹는다 — 닫는다
  await desk.locator(`.brow[data-id="${ine.id}"]`).click().catch(() => {}); await wait(300)
  // 답이 날 때까지(스텁 25초) — 그 뒤 «답함»
  for (let i = 0; i < 60; i++) { const ss = await (await fetch(base + `/api/bots/${rondo.id}/sessions`)).json(); const ch = ss.find((x) => x.channel === 'halili'); if (ch?.asks?.every((a) => a.doneAt) && ch.state !== 'running') break; await wait(1000) }
  await wait(3000)
  await shoot(desk, '5-desk-answered')
  await shoot(phone, '6-phone-answered')
  // 맨 위 줄을 누르면 그 대화가 바로 열린다
  const row = desk.locator('.askrow').first()
  if (await row.count()) { await row.click(); await wait(1500); await shoot(desk, '7-desk-opened') }
  else console.log('맨 위 줄 없음 — 바꾸기 전 판')
} finally {
  await browser.close()
  host.kill()
  await wait(300)
  rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); rmSync(fbHome, { recursive: true, force: true })
  console.log(shots.join('\n'))
}
