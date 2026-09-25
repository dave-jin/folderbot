/**
 * 🍎 **맥에서만 되는 QA 층** — `npm run qa`(리눅스에서도 도는 것) 위에 얹는다 (2026-09-22 · Dave: «맥 환경에서 직접 테스트 환경까지 구축»).
 *
 *   npm run qa:mac                 # = node test/mac-qa.mjs
 *   node test/mac-qa.mjs --no-build   # desktop/host 번들이 이미 있으면 빌드를 건너뛴다
 *   node test/mac-qa.mjs --keep       # 끝나도 앱을 안 닫는다(눈으로 볼 때)
 *
 * 재는 것 — 전부 **실 번들의 실제 Electron 앱**에서:
 *   ① 클립보드 왕복(그림·파일)                       test/mac-copy-check.mjs (셸이 쓰는 그 길)
 *   ② 앱이 뜨고 호스트가 안에서 돈다                 settings.json(mode:host) → 창 → /api/health
 *   ③ 유리가 실제로 흐려진다                         `.dock` 의 computed backdropFilter ≠ 'none' (V-덤 회귀 방어)
 *   ④ 버튼 글씨가 세로로 안 선다                     `.btn`·`.dock .db` 의 white-space:nowrap (V-1)
 *   ⑤ 독을 손잡이로 끌면 움직이고 자리가 남는다      `.dock .grip` 드래그 → top 변화 + localStorage fb:docky (V-2)
 *   ⑥ 셸 IPC 로 복사가 «되읽혀» ok 가 온다           `folderbotDesktop.local.copyImage/copyFiles/copyDiag` (M)
 *   ⑦ 창 크기·자리가 settings.json 에 남는다         setBounds → 600ms 뒤 settings.win (winBounds)
 *   ⑧ 딥링크가 그 대화로 간다                        second-instance(folderbot://bot/<id>) → location.hash (nav · 알림 클릭과 같은 길)
 *
 * 🔴 안전 수칙 (전부 실사고에서 나왔다):
 *   ⛔ Dave 의 실 볼트·실 앱을 안 건드린다 — 픽스처 볼트 + 임시 HOME(userData 도 그 아래) + FOLDERBOT_QA=1(프로토콜·로그인 항목·업데이터 끔)
 *   ⛔ 실 claude 를 스폰하지 않는다 — FOLDERBOT_CLI_BIN=stub. 인증 벽은 FOLDERBOT_NO_AUTH=1, 맥 배너는 FOLDERBOT_NO_MAC_NOTIFY=1
 *   ⛔ 이 검사가 도는 동안 따로 `npm run build` 를 돌리지 않는다 — dist/ 를 덮어써 거짓 빨강이 난다
 *   · 알림 배너 «클릭» 과 Finder·메모·카톡에 실제 ⌘V 는 자동화하지 않는다 — 사람이 한다(⑧·① 이 바로 앞 단계까지를 잰다)
 */
import { spawn, execSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

const here = dirname(fileURLToPath(import.meta.url)); const repo = join(here, '..'); process.chdir(repo)
const argv = new Set(process.argv.slice(2))
if (process.platform !== 'darwin') { console.log('맥에서만 돌아가는 검사예요 (지금:', process.platform, ')'); process.exit(0) }
const desktop = join(repo, 'desktop')
const req = createRequire(join(desktop, 'package.json'))
let electronBin = ''; try { electronBin = req('electron') } catch { console.log('Electron 이 없어요 — `cd desktop && npm ci`'); process.exit(1) }
const { _electron } = createRequire(join(repo, 'package.json'))('playwright-core')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const ok = (m) => console.log('✓', m)
let app = null, page = null, appErr = ''
const tmp = []
const fail = async (m) => {
  console.error('✗', m)
  if (typeof appErr === 'string' && appErr.trim()) console.error('  앱 로그:\n' + appErr.split('\n').filter((l) => !/Debugger|DevTools listening|For help, see/.test(l)).slice(-25).map((l) => '    ' + l).join('\n'))
  try { if (page) { mkdirSync('test/tmp', { recursive: true }); await page.screenshot({ path: 'test/tmp/mac-qa-fail.png' }); console.error('  스크린샷 test/tmp/mac-qa-fail.png') } } catch {}
  await cleanup(); process.exit(1)
}
async function cleanup() {
  if (argv.has('--keep')) { console.log('--keep · 앱을 남겨 둡니다'); return }
  try { await app?.close() } catch {}
  try { execSync('pkill -f "[b]in/folderbot.mjs start"') } catch {}
  for (const d of tmp) rmSync(d, { recursive: true, force: true })
}
const portFree = (port) => new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(port, '127.0.0.1', () => s.close(() => res(true))) })

// ── ① 호스트 번들 (CI 와 같은 순서) ─────────────────────────────────────────
const hostReady = existsSync(join(desktop, 'host/host/index.mjs')) && existsSync(join(desktop, 'host/client/index.html'))
if (argv.has('--no-build') && hostReady) ok('호스트 번들 · 있는 것을 쓴다 (--no-build)')
else {
  console.log('· 호스트 번들 빌드 (BUNDLE_ALL=1 node scripts/build.mjs) …')
  execSync('node scripts/build.mjs', { stdio: 'inherit', env: { ...process.env, BUNDLE_ALL: '1' } })
  rmSync(join(desktop, 'host'), { recursive: true, force: true }); mkdirSync(join(desktop, 'host'), { recursive: true })
  cpSync('dist/host', join(desktop, 'host/host'), { recursive: true }); cpSync('dist/client', join(desktop, 'host/client'), { recursive: true })
  writeFileSync(join(desktop, 'host/package.json'), readFileSync('package.json'))
  ok('호스트 번들 → desktop/host')
}

// ── ② 클립보드 검사 (셸이 쓰는 그 길) ───────────────────────────────────────
{
  const r = spawn('node', ['test/mac-copy-check.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] })
  let out = ''; r.stdout.on('data', (d) => (out += d))
  const code = await new Promise((res) => r.on('exit', res))
  console.log(out.split('\n').map((l) => '  ' + l).join('\n'))
  if (code !== 0) await fail('클립보드 검사 실패 — 위 ❌ 줄이 원인')
  ok('클립보드 왕복 · 그림·파일 ✅ (mac-copy-check)')
}

// ── ③ 픽스처 — 볼트 · HOME(userData 가 그 아래) · 데이터 · claude 설정 ────────
const root = mkdtempSync(join(tmpdir(), 'fb-qa-vault-')); tmp.push(root)
const home = mkdtempSync(join(tmpdir(), 'fb-qa-home-')); tmp.push(home)
const claudeCfg = mkdtempSync(join(tmpdir(), 'fb-qa-claude-')); tmp.push(claudeCfg)
for (const d of ['1. Inbox', '2. Projects/2026-10_해커톤-제안', '3. Area/제품_FolderBot', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_FolderBot/CLAUDE.md'), '# 제품_FolderBot\n')
writeFileSync(join(root, '3. Area/제품_FolderBot/readme.md'), '# Folder Bot\n')
writeFileSync(join(root, '3. Area/제품_FolderBot/todo.md'), '# todo\n\n## 요청 · 할 일\n- [ ] 맥 QA 층 세우기\n\n## 완료\n')
writeFileSync(join(root, '3. Area/제품_FolderBot/검사용 파일.txt'), '복사 검사\n')
const { PNG } = createRequire(join(repo, 'package.json'))('pngjs')
{ const p = new PNG({ width: 64, height: 48 }); for (let i = 0; i < p.data.length; i += 4) { p.data[i] = 40; p.data[i + 1] = 120; p.data[i + 2] = 220; p.data[i + 3] = 255 } writeFileSync(join(root, '3. Area/제품_FolderBot/검사용 그림.png'), PNG.sync.write(p)) }
// ⚠ macOS 의 userData 는 $HOME 을 무시한다 — 셸의 FOLDERBOT_USER_DATA 훅으로 통째로 옮긴다(main.js 머리)
const userData = join(home, 'userData'); mkdirSync(userData, { recursive: true })
let PORT = 7411; while (!(await portFree(PORT))) PORT++
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ mode: 'host', root, port: PORT, hostUrl: `http://127.0.0.1:${PORT}`, token: '', loginItem: false, win: { x: 80, y: 80, width: 1180, height: 800 } }, null, 2))
mkdirSync(join(home, '.folderbot'), { recursive: true })
const env = { ...process.env, HOME: home, FOLDERBOT_HOME: home, FOLDERBOT_USER_DATA: userData, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_CLI_BIN: join(repo, 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(repo, 'test/fixtures/stub-codex.mjs'), CLAUDE_CONFIG_DIR: claudeCfg, ELECTRON_ENABLE_LOGGING: '0' }
execFileSync('node', ['bin/folderbot.mjs', 'init', root], { env, stdio: 'ignore' })
ok(`픽스처 · 볼트 ${root} · HOME ${home} · 포트 ${PORT}`)

// ── ④ 앱 띄우기 (Playwright _electron · 실 번들) ──────────────────────────────
const base = `http://127.0.0.1:${PORT}`
// ⚠ `electron .` 은 이 맥(외장 디스크 · 경로에 공백)에서 아무 말 없이 exit 0 이었다 — main.js 를 직접 준다
// `--expose-gc` — ⑪ 이 «알림이 GC 를 견디는가» 를 재려고(알림 객체가 치워지면 배너 클릭이 엉뚱한 세션으로 갔다 · 2026-09-25)
app = await _electron.launch({ executablePath: electronBin, args: ['--js-flags=--expose-gc', 'main.js'], cwd: desktop, env, timeout: 60000 })
app.process().stderr?.on('data', (d) => { appErr += d }); app.process().stdout?.on('data', (d) => { appErr += d })
page = await app.firstWindow({ timeout: 60000 })
const errs = []; page.on('pageerror', (e) => errs.push(String(e)))
let healthy = false; for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) { healthy = true; break } } catch {} await wait(250) }
if (!healthy) await fail('앱 안의 호스트가 20초 안에 안 떴다')
const ver = await app.evaluate(({ app }) => ({ v: app.getVersion(), electron: process.versions.electron, packaged: app.isPackaged, userData: app.getPath('userData') }))
if (!ver.userData.startsWith(home)) await fail(`userData 가 임시 HOME 밖이다 — ${ver.userData} (Dave 의 실 설정을 건드릴 뻔했다)`)
ok(`앱 떴다 · Electron ${ver.electron} · 호스트 안에서 · userData 는 임시 HOME 아래`)

const api = async (p, body) => { const r = await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(p + ' ' + JSON.stringify(j)); return j }
const bot = await api('/bots/start', { rel: '3. Area/제품_FolderBot' })
// 창은 먼저 뜨고(ready-to-show) 호스트 URL 은 그 뒤에 실린다 — 호스트 페이지가 될 때까지 기다린 뒤에 해시를 넣는다
try { await page.waitForURL((u) => String(u).startsWith(base), { timeout: 20000 }) } catch { await fail(`창이 호스트 URL 로 안 갔다 — 지금 ${page.url()}`) }
await page.waitForLoadState('domcontentloaded')
try { await page.waitForSelector('.app', { timeout: 20000 }) } catch { await fail('클라이언트(.app)가 안 떴다 · ' + page.url()) }
// 토큰 해시를 소비하며 한 번 더 이동할 수 있다 — 컨텍스트가 바뀌면 다시 시도
for (let i = 0; ; i++) { try { await page.evaluate((h) => { location.hash = h }, `bot=${bot.id}`); break } catch (e) { if (i >= 5) await fail('해시를 못 넣었다 — ' + e.message); await wait(500) } }
try { await page.waitForSelector('.col.chat .hdr', { timeout: 20000 }) } catch { await fail('봇 화면(.col.chat .hdr)이 안 떴다 · pageerror: ' + errs.join(' | ').slice(0, 600)) }
await wait(600)
mkdirSync('test/tmp', { recursive: true }); await page.screenshot({ path: 'test/tmp/mac-qa-app.png' })
ok(`봇 화면 · ${bot.name} · 스크린샷 test/tmp/mac-qa-app.png`)

// ── ⑤ 유리가 실제로 흐려진다 (V-덤) ─────────────────────────────────────────
{
  const g = await page.evaluate(() => {
    const pick = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backdropFilter : '(없음)' }
    return { dock: pick('.dock'), glass: pick('.glass, .glassb, .rb'), reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches }
  })
  if (g.dock === '(없음)') await fail('독(.dock)이 없다')
  if (g.reduced) console.log('  ⚠ 이 맥은 「투명도 줄이기」가 켜져 있어 blur 검사를 건너뛴다 —', JSON.stringify(g))
  else if (!/blur\(/.test(g.dock)) await fail(`독 유리에 blur 가 안 걸렸다 — backdropFilter=${g.dock} (V-덤 회귀: 접두사를 손으로 적었나?)`)
  else ok(`유리 blur 실제로 걸림 · .dock ${g.dock}${g.glass !== '(없음)' ? ` · .glass ${g.glass}` : ''}`)
}

// ── ⑥ 버튼 글씨가 세로로 안 선다 (V-1) ──────────────────────────────────────
{
  const w = await page.evaluate(() => {
    const bad = []; let n = 0
    for (const sel of ['.btn', '.dock .db', '.ib', '.tab', '.seg button']) for (const el of document.querySelectorAll(sel)) { n++; if (getComputedStyle(el).whiteSpace !== 'nowrap') bad.push(sel + ' «' + (el.textContent || '').trim().slice(0, 12) + '»') }
    return { n, bad }
  })
  if (!w.n) await fail('버튼이 하나도 없다')
  if (w.bad.length) await fail('nowrap 이 빠진 버튼: ' + w.bad.join(', '))
  ok(`버튼 ${w.n}개 전부 white-space:nowrap`)
}

// ── ⑦ 독 끌기 → 자리 기억 (V-2) ─────────────────────────────────────────────
{
  const grip = await page.$('.dock .grip'); if (!grip) await fail('독 손잡이(.dock .grip)가 없다')
  const before = await page.$eval('.dock', (d) => d.getBoundingClientRect().top)
  const gb = await grip.boundingBox()
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down()
  for (let i = 1; i <= 8; i++) { await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 - i * 10); await wait(20) }   // 한 걸음씩 — 합쳐지면 안 움직인다
  await page.mouse.up(); await wait(200)
  const after = await page.$eval('.dock', (d) => d.getBoundingClientRect().top)
  const saved = await page.evaluate(() => localStorage.getItem('fb:docky'))
  if (!(after < before - 40)) await fail(`독이 안 끌렸다 — top ${before} → ${after}`)
  if (!saved) await fail('독 자리가 localStorage fb:docky 에 안 남았다')
  ok(`독 끌기 · top ${Math.round(before)} → ${Math.round(after)} · fb:docky=${saved}`)
}

// ── ⑧ 셸 IPC 복사 — 실제 preload → main → 클립보드 → 되읽기 (M) ─────────────
{
  const saved = await app.evaluate(async ({ clipboard }) => { try { return await clipboard.readText() } catch { return '' } })
  const png = join(root, '3. Area/제품_FolderBot/검사용 그림.png'), txt = join(root, '3. Area/제품_FolderBot/검사용 파일.txt')
  const has = await page.evaluate(() => !!(window.folderbotDesktop && window.folderbotDesktop.local && window.folderbotDesktop.local.copyImage && window.folderbotDesktop.local.copyFiles && window.folderbotDesktop.local.copyDiag))
  if (!has) await fail('preload 브리지(folderbotDesktop.local.copyImage/copyFiles/copyDiag)가 없다')
  const ri = await page.evaluate((p) => window.folderbotDesktop.local.copyImage({ path: p }), png)
  if (!ri || !ri.ok) await fail('IPC 그림 복사 실패 — ' + JSON.stringify(ri))
  ok(`IPC 그림 복사 ok · [${(ri.formats || []).join(', ')}]`)
  const rf = await page.evaluate((ps) => window.folderbotDesktop.local.copyFiles(ps), [txt, png])
  if (!rf || !rf.ok) await fail('IPC 파일 복사 실패 — ' + JSON.stringify(rf))
  ok(`IPC 파일 복사 ok (2개) · [${(rf.formats || []).join(', ')}]`)
  const rd = await page.evaluate((p) => window.folderbotDesktop.local.copyDiag(p), png)
  if (!/파일 ✅/.test(rd) || !/그림 ✅/.test(rd)) await fail('복사 진단에 ✅ 가 빠졌다:\n' + rd)
  console.log(String(rd).split('\n').map((l) => '    ' + l).join('\n'))
  ok('복사 진단 · 파일 ✅ · 그림 ✅')
  await app.evaluate(async ({ clipboard }, s) => { try { if (s) await clipboard.writeText(s); else await clipboard.clear() } catch {} }, saved)
}

// ── ⑨ 창 크기·자리 저장 (winBounds) ─────────────────────────────────────────
{
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => x.isVisible()) || BrowserWindow.getAllWindows()[0]; w.setBounds({ x: 120, y: 100, width: 1000, height: 700 }) })
  await wait(1200)
  const s = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  if (!s.win || s.win.width !== 1000 || s.win.height !== 700) await fail('창 크기가 settings.json 에 안 남았다 — ' + JSON.stringify(s.win))
  ok(`창 자리 저장 · ${JSON.stringify(s.win)}`)
}

// ── ⑩ 딥링크 → 그 대화 (nav · 알림 클릭과 같은 길) ─────────────────────────
{
  const ss = await api(`/bots/${bot.id}/sessions`)
  const sid = ss[0]?.id || ''
  await app.evaluate(({ app }, url) => { app.emit('second-instance', null, [url]) }, `folderbot://bot/${bot.id}${sid ? `?s=${sid}` : ''}`)
  await wait(600)
  const h = await page.evaluate(() => location.hash)
  if (!h.includes(`bot=${bot.id}`)) await fail(`딥링크 뒤 hash 가 다르다 — ${h}`)
  ok(`딥링크 → ${h}`)
}

// ── ⑪ 알림은 GC 를 견딘다 → 한참 뒤 눌러도 그 세션 (2026-09-25 Dave: «원격에서 알람을 클릭하면 이상한 세션») ──
// 셸이 알림 객체를 안 붙잡아서 GC 한 번에 click 처리기가 사라졌고, 뒤늦게 누른 배너는 앱만 앞으로 가져왔다.
// 실제 셸 코드(`notify`)가 띄운 알림을 약한 참조로만 지켜보고, GC 를 강제로 돌린 뒤 클릭한다.
{
  await app.evaluate(({ Notification }) => { global.__weak = []; const show = Notification.prototype.show; Notification.prototype.show = function () { global.__weak.push(new WeakRef(this)); return show.call(this) } })
  const s1 = await api(`/bots/${bot.id}/sessions`, { name: '알림 대상' })
  await api(`/sessions/${s1.id}/send`, { text: '되읊어: 알림 대상 답' })
  let got = 0; for (let i = 0; i < 40 && !got; i++) { got = await app.evaluate(() => global.__weak.length); if (!got) await wait(250) }
  if (!got) await fail('⑪ 셸이 알림을 안 띄웠다(검사 전제 깨짐)')
  const s2 = await api(`/bots/${bot.id}/sessions`, { name: '딴 세션' })
  await page.evaluate((h) => { location.hash = h }, `bot=${bot.id}&s=${s2.id}`); await wait(600)
  await app.evaluate(async () => { for (let i = 0; i < 5; i++) { global.gc(); await new Promise((r) => setTimeout(r, 150)) } })
  const alive = await app.evaluate(() => global.__weak.map((w) => !!w.deref()))
  if (!alive.at(-1)) await fail('🔴 ⑪ 알림 객체가 GC 로 사라졌다 — 뒤늦게 누른 배너는 앱만 앞으로 가져온다(엉뚱한 세션)')
  // 🔴 Dock 을 건드리지 않는다 — 이미 보이는 Dock 에 show() 를 또 부르면 확대된 채 굳었다(스크린샷_2010 · 2026-09-25)
  await app.evaluate(({ app }) => { global.__dockShow = 0; const orig = app.dock.show.bind(app.dock); app.dock.show = (...a) => { global.__dockShow++; return orig(...a) } })
  await app.evaluate(() => { const n = global.__weak.findLast((w) => w.deref())?.deref(); n?.emit('click') }); await wait(900)
  const dockShow = await app.evaluate(({ app }) => ({ calls: global.__dockShow, visible: app.dock.isVisible() }))
  if (dockShow.visible && dockShow.calls) await fail(`🔴 ⑪ 알림 클릭이 이미 보이는 Dock 에 show() 를 불렀다(${dockShow.calls}회) — 확대된 Dock 이 굳는다`)
  const h = await page.evaluate(() => location.hash)
  if (!h.includes(`s=${s1.id}`)) await fail(`🔴 ⑪ GC 뒤 알림 클릭이 그 세션으로 안 갔다 — ${h} (기대 s=${s1.id})`)
  ok('알림 — GC 를 견디고, 뒤늦게 눌러도 그 세션으로 · Dock 은 안 건드린다')
}

if (errs.length) console.log('  ⚠ pageerror:', errs.join(' | ').slice(0, 500))
console.log('\n🍎 맥 QA 통과')
await cleanup()
process.exit(0)
