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
 *   ⑫ ⌘+ · ⌘− · ⌘0 화면 배율                        메뉴·실제 키 → getZoomFactor · settings.json zoom · 다시 읽어도 그대로 (BP)
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

// ── ⑫ 화면 확대·축소 ⌘+ · ⌘− · ⌘0 (BP · 2026-10-09 Dave: «Command + [+/-] 로 글씨 및 크기 조정») ──
// 메뉴에 항목이 없으면 Electron 은 ⌘+/− 를 아무 데도 안 보낸다(옛 판이 그랬다). 실제 키를 앱에 넣어 배율이 바뀌는지,
// settings.json 에 남는지, 화면을 다시 읽어도 그대로인지, ⌘0 으로 돌아오는지 잰다.
// ⚠ `sendInputEvent` 키는 메뉴 단축키까지 안 닿는다(맥미니 실측) — 그래서 판정은 메뉴 클릭으로 한다. 진짜 자판(⌘= · ⌘⇧= · ⌘− · ⌘0)은
//    2026-10-09 cua-driver 의 foreground hotkey 로 이 앱에 눌러 1 → 1.1 → 1.25 → 1.1 → 1 을 확인했다.
{
  const zf = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => x.isVisible()) || BrowserWindow.getAllWindows()[0]; return w.webContents.getZoomFactor() })
  const key = (keyCode, mods) => app.evaluate(({ BrowserWindow }, a) => { const w = BrowserWindow.getAllWindows().find((x) => x.isVisible()) || BrowserWindow.getAllWindows()[0]; w.focus(); w.webContents.sendInputEvent({ type: 'keyDown', keyCode: a.keyCode, modifiers: a.mods }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: a.keyCode, modifiers: a.mods }) }, { keyCode, mods })
  const menu = (id) => app.evaluate(({ Menu }, i) => { const m = Menu.getApplicationMenu()?.getMenuItemById(i); if (!m) return false; m.click(); return true }, id)
  const savedZoom = () => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).zoom
  await page.evaluate(() => document.activeElement?.blur?.()); await wait(200)
  const z0 = await zf()
  if (!(await menu('zoom-in'))) await fail('🔴 ⑫ 보기 메뉴에 «확대» 가 없다 — ⌘+ 가 아무 일도 안 한다')
  await wait(300)
  const z1 = await zf()
  if (!(z1 > z0)) await fail(`⑫ 확대를 눌렀는데 배율이 안 커졌다 (${z0} → ${z1})`)
  // 실제 키 — ⌘= (자판의 + 자리) · ⌘−
  await key('=', ['meta']); await wait(400); const z2 = await zf()
  await key('-', ['meta']); await wait(400); const z3 = await zf()
  const keysWork = z2 > z1 && z3 < z2
  if (savedZoom() !== z3) await fail(`⑫ 배율이 settings.json 에 안 남았다 (화면 ${z3} · 저장 ${savedZoom()})`)
  const toast = await page.evaluate(() => document.body.innerText.match(/화면 크기 \d+%/)?.[0] ?? '')
  // 다시 읽어도 그대로 — 호스트 새 판(BJ)·재접속에서 화면이 새로 읽힌다
  await page.reload(); await page.waitForSelector('.col.chat, .home, body', { timeout: 15000 }); await wait(800)
  const z4 = await zf()
  if (Math.abs(z4 - z3) > 1e-6) await fail(`🔴 ⑫ 화면을 다시 읽었더니 배율이 풀렸다 (${z3} → ${z4})`)
  await menu('zoom-reset'); await wait(300)
  if ((await zf()) !== 1 || savedZoom() !== 1) await fail('⑫ «실제 크기» 로 안 돌아왔다')
  ok(`화면 확대·축소 · ${z0} → ${z1} → ⌘= ${z2} → ⌘− ${z3} · 저장 · 다시 읽어도 ${z4} · ⌘0 → 1 · ${toast || '(알림 문구 못 읽음)'}${keysWork ? '' : ' · ⚠ sendInputEvent 키는 메뉴에 안 닿음(메뉴 클릭으로만 쟀다)'}`)
}

// ── ⑬ ⎋ 멈추기 · ⌥⏎ 멈추고 바로 보내기 (CL-1·CL-2 · 기획안 §11 «R2 는 qa:mac 으로 ⎋·⌥⏎ 를 실제 앱에서 잰다») ──
// 키는 Electron `sendInputEvent` 로 창에 직접 넣는다(브라우저 흉내가 아니라 앱 창의 키 이벤트). 느린 턴(`느린일` · 2.5초)을 멈추는지 본다.
{
  const sid = (await api(`/bots/${bot.id}/sessions`, { name: 'mac-멈춤' })).id
  const info = async () => (await api(`/bots/${bot.id}/sessions`)).find((y) => y.id === sid)
  const chat = async () => (await api(`/sessions/${sid}/chat`)).items ?? []
  const until = async (f, n = 40) => { for (let i = 0; i < n; i++) { const v = await f(); if (v) return v; await wait(150) } return null }
  const key = (keyCode, mods = []) => app.evaluate(({ BrowserWindow }, a) => { const w = BrowserWindow.getAllWindows().find((x) => x.isVisible()) || BrowserWindow.getAllWindows()[0]; w.focus(); w.webContents.sendInputEvent({ type: 'keyDown', keyCode: a.keyCode, modifiers: a.mods }); if (a.keyCode.length === 1) w.webContents.sendInputEvent({ type: 'char', keyCode: a.keyCode, modifiers: a.mods }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: a.keyCode, modifiers: a.mods }) }, { keyCode, mods })
  await page.evaluate((h) => { location.hash = h }, `bot=${bot.id}&s=${sid}`); await page.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(700)
  await api(`/sessions/${sid}/send`, { text: '느린일 mac 첫째' })
  if (!(await until(async () => (await info())?.state === 'running'))) await fail('⑬ 느린 턴이 안 돌았다')
  await page.click('.composer .cin'); await page.keyboard.type('맥 대기 말'); await wait(200)
  if (!(await page.$('.live .stop')) || (await page.$('.composer .stopb'))) await fail('🔴 ⑬ 일하는 중 멈추기는 진행 줄 옆 하나여야 한다(입력줄 ⏹ 없음)')
  await key('Escape')
  const x = await until(async () => { const v = await info(); return v && v.state !== 'running' ? v : null })
  if (!x || !x.stopped || !x.held) await fail('🔴 ⑬ 앱 창의 ⎋ 가 턴을 안 멈췄다 ' + JSON.stringify(x && { state: x.state, stopped: x.stopped, held: x.held }))
  const kept = await page.$eval('.composer .cin', (e) => e.dataset.value ?? e.textContent)
  if (!String(kept).includes('맥 대기 말')) await fail('⑬ ⎋ 로 멈췄더니 입력칸의 글이 지워졌다 ' + JSON.stringify(kept))
  await page.evaluate(() => { const el = document.querySelector('.composer .cin'); el?.focus() }); await page.keyboard.press('Meta+A'); await page.keyboard.press('Backspace')
  await api(`/sessions/${sid}/send`, { text: '느린일 mac 둘째' }); await until(async () => (await info())?.state === 'running')
  await page.click('.composer .cin'); await page.keyboard.type('되읊어: 맥 급한 말'); await wait(150)
  const t0 = Date.now(); await key('Enter', ['alt'])
  const got = await until(async () => (await chat()).some((it) => it.kind === 'assistant' && it.text.includes('맥 급한 말')), 30)
  if (!got || Date.now() - t0 > 2400) await fail(`🔴 ⑬ 앱 창의 ⌥⏎ 가 느린 턴을 멈추고 바로 보내지 않았다 (${Date.now() - t0}ms)`)
  await page.evaluate(() => { location.hash = '' }); await wait(500)
  await fetch(base + `/api/sessions/${sid}`, { method: 'DELETE' })
  ok(`⎋ 멈추기 · 글 그대로 · 대기 붙잡기 · ⌥⏎ 멈추고 바로 보내기 ${Date.now() - t0}ms (앱 창 키 이벤트)`)
}

// ── ⑭ 새 창 요청은 웹·메일·전화 주소만 바깥으로 넘긴다 (2026-11-12) ────────────────────
// 셸은 화면의 `window.open` 을 받아 기본 브라우저로 넘긴다(`setWindowOpenHandler`). 종전에는 주소를 거르지 않았다 —
// 문서 창의 html 보기(격리 틀 · `allow-popups`) 안의 스크립트가 `window.open("smb://…")` 을 부르면 그 주소가 맥으로 넘어갔다
// (고치기 전 실측: `smb:` 가 넘어감 · `file:` 은 크롬이 «Not allowed to load local resource» 로 먼저 막음).
// ⚠ `shell.openExternal` 을 기록만 하는 것으로 갈아 끼운 뒤에 잰다 — 검사가 실제로 무엇을 열지 않는다.
{
  await app.evaluate(({ shell }) => { global.__ext = []; global.__extOrig = shell.openExternal; shell.openExternal = async (u) => { global.__ext.push(String(u)) } })
  if (!(await app.evaluate(({ shell }) => shell.openExternal !== global.__extOrig))) await fail('⑭ 검사 전제 깨짐 — openExternal 을 못 갈아 끼웠다')
  try {
    const urls = ['file:///nonexistent-fb-qa/none.command', 'smb://nonexistent-fb-qa/share', 'https://example.invalid/fb-qa', 'mailto:qa@example.invalid']
    // 문서 창의 html 보기와 같은 격리 틀 안에서 부른다
    await page.evaluate((us) => { const f = document.createElement('iframe'); f.id = 'qa-ext'; f.setAttribute('sandbox', 'allow-scripts allow-popups'); f.srcdoc = `<script>for (const u of ${JSON.stringify(us)}) { try { window.open(u) } catch (e) {} }<\/script>`; document.body.appendChild(f) }, urls)
    await wait(1200)
    const fromFrame = await app.evaluate(() => global.__ext.splice(0))
    // 앱 화면 자체가 부를 때(문서의 링크를 누른 길)
    await page.evaluate((us) => { for (const u of us) { try { window.open(u, '_blank', 'noopener,noreferrer') } catch (e) {} } }, urls)
    await wait(1200)
    const fromApp = await app.evaluate(() => global.__ext.splice(0))
    for (const [who, got] of [['격리 틀', fromFrame], ['앱 화면', fromApp]]) {
      const bad = got.filter((u) => !/^(https?|mailto|tel):/i.test(u))
      if (bad.length) await fail(`🔴 ⑭ ${who}의 새 창 요청이 걸러지지 않고 바깥으로 넘어갔다 ${JSON.stringify(bad)}`)
      if (!got.some((u) => u.startsWith('https://example.invalid/'))) await fail(`⑭ ${who}의 웹 주소가 바깥으로 안 넘어갔다(회귀) ${JSON.stringify(got)}`)
    }
    ok(`새 창 요청 · 웹·메일만 바깥으로 · file: · smb: 는 안 넘긴다 (격리 틀 ${fromFrame.length}건 · 앱 화면 ${fromApp.length}건)`)
  } finally {
    await app.evaluate(({ shell }) => { shell.openExternal = global.__extOrig })
    await page.evaluate(() => document.getElementById('qa-ext')?.remove())
  }
}

if (errs.length) console.log('  ⚠ pageerror:', errs.join(' | ').slice(0, 500))
console.log('\n🍎 맥 QA 통과')
// ── ⑮~⑳ 여러 맥 (2026-11-19 · 첫 외부 고객: «늘 켜 둔 맥 여러 대를 오가고 싶다») ─────────────────────────
// 두 번째 호스트(B · 인증 켬)를 같은 맥에 띄워, 맥 앱이 B 를 추가하고 · 오가고 · B 의 답 대기를 배지로 받고 · 토큰을 섞지 않고 ·
// 옛 판·꺼진 맥을 다루는지 잰다. ⚠ 같은 맥이라 컴퓨터 이름이 같다 — B 의 이름을 «집 미니» 로 박아 «이미 있는 맥» 판정을 피한다.
{
  const tokFile = join(userData, 'mac-tokens.json'), setFile = join(userData, 'settings.json')
  const readSet = () => JSON.parse(readFileSync(setFile, 'utf8'))
  const mainWin = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop()); return w ? { title: w.getTitle(), url: w.webContents.getURL() } : null })
  const macsNow = () => page.evaluate(() => window.folderbotDesktop.macs.list()).catch(() => null)
  // ⑮ 옮겨 담기 — 옛 모양(mode:host · hostUrl) 설정이 «이 맥» 한 줄이 되고, 맥 1대라 창 제목·화면은 그대로
  { const st = readSet()
    if (!Array.isArray(st.macs) || st.macs.length !== 1 || st.macs[0].id !== 'local' || st.activeMac !== 'local') await fail('⑮ 옛 설정이 «이 맥» 한 줄로 안 옮겨졌다 · ' + JSON.stringify({ macs: st.macs, activeMac: st.activeMac }))
    const w = await mainWin(); if (!w || w.title !== 'Folder Bot') await fail('⑮ 맥 1대인데 창 제목이 바뀌었다 · ' + JSON.stringify(w))
    ok('⑮ 옮겨 담기 · 호스트 모드 설정 → «이 맥» 한 줄 · 맥 1대라 창 제목 그대로') }

  const rootB = mkdtempSync(join(tmpdir(), 'fb-qa-vaultB-')); tmp.push(rootB)
  const homeB = mkdtempSync(join(tmpdir(), 'fb-qa-homeB-')); tmp.push(homeB)
  for (const d of ['1. Inbox', '2. Projects', '3. Area/B사_운영', '4. Resources', '5. Archive']) mkdirSync(join(rootB, d), { recursive: true })
  writeFileSync(join(rootB, '3. Area/B사_운영/CLAUDE.md'), '# B사_운영\n')
  let PB = PORT + 1; while (!(await portFree(PB))) PB++
  const urlB = `http://127.0.0.1:${PB}`
  const envB = { ...env, HOME: homeB, FOLDERBOT_HOME: homeB, FOLDERBOT_DATA: join(homeB, 'data') }; delete envB.FOLDERBOT_NO_AUTH; delete envB.FOLDERBOT_USER_DATA
  execFileSync('node', ['bin/folderbot.mjs', 'init', rootB], { env: envB, stdio: 'ignore' })
  { const cf = join(homeB, 'data', 'config.json'); const c = JSON.parse(readFileSync(cf, 'utf8')); c.hostName = '집 미니'; writeFileSync(cf, JSON.stringify(c, null, 2)) }
  let hostB = null, botB = ''
  const startB = async (extra = {}) => {
    hostB = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PB)], { env: { ...envB, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; hostB.stdout.on('data', (d) => (out += d)); hostB.stderr.on('data', (d) => (out += d))
    for (let i = 0; i < 120 && !/페어링 코드: (\S+)/.test(out); i++) await wait(250)
    const m = /페어링 코드: (\S+)/.exec(out); if (!m) await fail('호스트 B 가 안 떴다 · ' + out.slice(-600))
    return m[1]
  }
  const stopB = async () => { if (!hostB) return; hostB.kill('SIGTERM'); for (let i = 0; i < 40 && hostB.exitCode === null; i++) await wait(100); hostB = null }
  try {
    const code = await startB()
    // ⑨ 가 창을 1000px 로 줄여 둬 사이드바가 접혀 있다 — 전환기(사이드바 왼쪽 아래)가 보이는 넓은 폭으로 되돌린다(접힌 폭에서는 «맥» 메뉴·⌃⌘숫자가 길이다)
    await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (!w.isAlwaysOnTop()) w.setBounds({ x: 60, y: 60, width: 1320, height: 820 }) }); await wait(800)
    // ⑯ 맥 추가 → B 로 바뀜(창 제목 · 전환기) → «이 맥» 으로 돌아와도 다시 페어링 없음
    await page.evaluate(([u, c]) => window.folderbotDesktop.macs.add(u, c), [urlB, code]).catch(() => {}) // 성공하면 창이 B 로 바뀌며 이 문맥이 사라진다
    try { await page.waitForURL((u) => String(u).startsWith(urlB), { timeout: 20000 }) } catch { await fail('⑯ 맥을 추가했는데 창이 B 로 안 갔다 · ' + page.url()) }
    await page.waitForSelector('.app', { timeout: 20000 }).catch(() => fail('⑯ B 화면(.app)이 안 떴다'))
    await page.waitForSelector('button.mac-sw', { timeout: 10000 }).catch(() => fail('⑯ B 화면에 전환기 단추가 없다'))
    { const w = await mainWin(); if (w?.title !== 'Folder Bot — 집 미니') await fail('⑯ 창 제목이 «Folder Bot — 집 미니» 가 아니다 · ' + JSON.stringify(w)) }
    const st = readSet(); const B = st.macs.find((m) => m.url === urlB)
    if (!B || st.activeMac !== B.id) await fail('⑯ 설정에 B 줄이 없거나 지금 맥이 아니다 · ' + JSON.stringify(st.macs))
    await page.screenshot({ path: 'test/tmp/mac-qa-mm-16-B.png' })
    await page.evaluate(() => window.folderbotDesktop.macs.switchTo('local')).catch(() => {})
    try { await page.waitForURL((u) => String(u).startsWith(base), { timeout: 20000 }) } catch { await fail('⑯ «이 맥» 으로 안 돌아왔다 · ' + page.url()) }
    await page.waitForSelector('.app', { timeout: 20000 }).catch(() => fail('⑯ 돌아온 «이 맥» 화면이 안 떴다'))
    { const w = await mainWin(); if (!/^Folder Bot — /.test(w?.title || '') || /집 미니/.test(w.title)) await fail('⑯ 돌아온 뒤 창 제목이 이상하다 · ' + JSON.stringify(w)) }
    await page.screenshot({ path: 'test/tmp/mac-qa-mm-16-local.png' })
    ok(`⑯ 맥 추가 → «집 미니» 로 바뀜(창 제목 · 전환기) → «이 맥» 으로 다시 페어링 없이`)

    // ⑱ 토큰 — 맥 앱 사본은 맥 id 아래에만 · 옛 token 칸은 비었다 · B 는 그 토큰만 받는다
    const toks = JSON.parse(readFileSync(tokFile, 'utf8'))
    if (Object.keys(toks).join() !== B.id) await fail('⑱ 토큰 파일 열쇠가 B id 하나가 아니다 · ' + Object.keys(toks).join())
    if (readSet().token) await fail('⑱ settings.json 의 옛 token 칸에 값이 있다')
    const tokB = toks[B.id]
    if ((await fetch(urlB + '/api/state', { headers: { authorization: 'Bearer nope' } })).status !== 401) await fail('⑱ B 가 다른 토큰을 받았다')
    if ((await fetch(urlB + '/api/state', { headers: { authorization: `Bearer ${tokB}` } })).status !== 200) await fail('⑱ 저장된 B 토큰이 B 에서 안 통한다')
    ok('⑱ 토큰 — 맥 id 아래에만 · 옛 칸 비움 · B 는 제 토큰만 받는다')

    // ⑰ 다른 맥 답 대기 — «이 맥» 을 보는 동안 B 세션이 승인을 기다리면 독 배지 · 목록 배지
    { const H = { 'content-type': 'application/json', authorization: `Bearer ${tokB}` }
      const bb = await (await fetch(urlB + '/api/bots/start', { method: 'POST', headers: H, body: JSON.stringify({ rel: '3. Area/B사_운영' }) })).json(); botB = bb.id
      await fetch(urlB + `/api/bots/${bb.id}/send`, { method: 'POST', headers: H, body: JSON.stringify({ text: '승인이 필요한 일 해 줘' }) })
      let l = null; for (let i = 0; i < 60; i++) { l = await macsNow(); if (l && l.find((m) => m.id === B.id)?.waiting === 1) break; await wait(250) }
      if (l?.find((m) => m.id === B.id)?.waiting !== 1) await fail('⑰ B 의 답 대기가 목록에 안 잡혔다 · ' + JSON.stringify(l))
      const badge = await app.evaluate(({ app }) => (app.dock ? app.dock.getBadge() : ''))
      if (badge !== '1') await fail('⑰ 독 배지가 «1» 이 아니다 · ' + JSON.stringify(badge))
      if (!/다른 맥 1/.test(await page.$eval('.sb-foot', (e) => e.textContent).catch(() => ''))) await fail('⑰ 왼쪽 아래에 «· 다른 맥 1» 이 없다')
      await page.screenshot({ path: 'test/tmp/mac-qa-mm-17.png' })
      ok('⑰ 다른 맥 답 대기 — 목록 배지 · 독 배지 1 · 왼쪽 아래 «다른 맥 1»') }

    // ㉑ 맥마다 창 하나(설정) — 고르면 그 맥 창이 따로 뜨고 창마다 제목이 맥 이름
    { const wins = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && !w.isAlwaysOnTop()).map((w) => ({ title: w.getTitle(), url: w.webContents.getURL() })))
      if ((await page.evaluate(() => window.folderbotDesktop.macs.mode())) !== 'same') await fail('㉑ 기본 «맥 바꾸는 방식» 이 «같은 창» 이 아니다')
      await page.evaluate(() => window.folderbotDesktop.macs.setMode('window'))
      await page.evaluate((id) => window.folderbotDesktop.macs.switchTo(id), B.id)
      let ws = []; for (let i = 0; i < 80; i++) { ws = await wins(); if (ws.length === 2 && ws.some((w) => w.url.startsWith(urlB) && w.title === 'Folder Bot — 집 미니')) break; await wait(250) }
      if (ws.length !== 2) await fail('㉑ 맥마다 창인데 창이 둘이 아니다 · ' + JSON.stringify(ws))
      if (!ws.some((w) => w.url.startsWith(base) && /^Folder Bot — /.test(w.title) && !/집 미니/.test(w.title))) await fail('㉑ «이 맥» 창 제목이 그 맥 이름이 아니다 · ' + JSON.stringify(ws))
      if (!page.url().startsWith(base)) await fail('㉑ 맥마다 창인데 원래 창이 다른 맥으로 바뀌었다 · ' + page.url())
      ok('㉑ 맥마다 창 하나 — B 를 고르면 «Folder Bot — 집 미니» 창이 따로 · 원래 창은 «이 맥» 그대로')
      // ㉒ 다른 맥 알림 클릭 — 그 맥 창이 앞으로, 그 자리로 · 원래 창의 자리는 그대로
      const hashA = await page.evaluate(() => location.hash)
      await page.evaluate(() => window.folderbotDesktop.macs.switchTo('local'))
      await app.evaluate((_e, id) => global.__fbSwitchTo(id[0], `bot=${id[1]}`), [B.id, botB])
      let front = ''; for (let i = 0; i < 40; i++) { front = await app.evaluate(() => global.__fbFrontMac()); if (front === B.id) break; await wait(250) }
      if (front !== B.id) await fail('㉒ 다른 맥 알림을 눌렀는데 그 맥 창이 앞으로 안 왔다 · ' + front)
      let hb = ''; for (let i = 0; i < 40 && !hb.includes(`bot=${botB}`); i++) { hb = (await wins()).find((w) => w.url.startsWith(urlB))?.url || ''; await wait(250) }
      if (!hb.includes(`bot=${botB}`)) await fail('㉒ 그 맥 창이 알림의 자리로 안 갔다 · ' + hb)
      if ((await page.evaluate(() => location.hash)) !== hashA) await fail('㉒ 원래 창의 자리가 바뀌었다')
      ok('㉒ 다른 맥 알림 — 그 맥 창이 앞으로 · 그 자리로 · 원래 창은 그대로')
      // ㉓ 같은 창으로 되돌리기 — 앞 창(«이 맥») 하나만 남고 배지는 그대로
      await page.evaluate(() => window.folderbotDesktop.macs.switchTo('local'))
      for (let i = 0; i < 20 && (await app.evaluate(() => global.__fbFrontMac())) !== 'local'; i++) await wait(250)
      const badge0 = await app.evaluate(({ app }) => (app.dock ? app.dock.getBadge() : ''))
      await page.evaluate(() => window.folderbotDesktop.macs.setMode('same'))
      for (let i = 0; i < 40 && (await wins()).length !== 1; i++) await wait(250)
      ws = await wins(); if (ws.length !== 1 || !ws[0].url.startsWith(base)) await fail('㉓ 같은 창으로 돌렸는데 «이 맥» 창 하나만 남지 않았다 · ' + JSON.stringify(ws))
      if ((await app.evaluate(({ app }) => (app.dock ? app.dock.getBadge() : ''))) !== badge0) await fail('㉓ 모드를 바꿨더니 배지가 바뀌었다')
      ok('㉓ 같은 창으로 되돌리기 — 앞 창 하나만 · 배지 그대로') }

    // ⑲ 옛 판 — B 가 전환기를 모르는 판이면 창 제목 끝에 안내
    await stopB(); await startB({ FOLDERBOT_QA_OLD_HEALTH: '1' })
    await app.evaluate((_e, id) => global.__fbSwitchTo(id), B.id) // 셸에서 직접 — 화면이 토큰을 받고 다시 읽히는 틈에 보낸 요청은 사라진다
    try { await page.waitForURL((u) => String(u).startsWith(urlB), { timeout: 20000 }) } catch { await fail('⑲ 옛 판 B 로 안 갔다 · ' + page.url()) }
    { let w = null; for (let i = 0; i < 40; i++) { w = await mainWin(); if (/\(옛 판 — 맥 메뉴로 바꾸세요\)$/.test(w?.title || '')) break; await wait(250) }
      if (!/\(옛 판 — 맥 메뉴로 바꾸세요\)$/.test(w?.title || '')) await fail('⑲ 옛 판인데 창 제목 안내가 없다 · ' + JSON.stringify(w)) }
    ok('⑲ 옛 판 맥 — 창 제목 끝에 «(옛 판 — 맥 메뉴로 바꾸세요)»')

    // ⑳ 꺼진 맥 — 빈 창이 아니라 연결 화면의 그 맥 줄
    await app.evaluate(() => global.__fbSwitchTo('local'))
    try { await page.waitForURL((u) => String(u).startsWith(base), { timeout: 20000 }) } catch { await fail('⑳ «이 맥» 으로 안 돌아왔다') }
    await stopB(); await wait(1500)
    await app.evaluate((_e, id) => global.__fbSwitchTo(id), B.id) // 셸에서 직접 — 화면이 토큰을 받고 다시 읽히는 틈에 보낸 요청은 사라진다
    // ⚠ 실패한 주소 → 오류 페이지 → file:// 로 프로세스가 두 번 바뀌어 Playwright 의 page 가 주소를 놓친다 — 셸 쪽에서 창을 직접 읽는다
    { let w = null; for (let i = 0; i < 80; i++) { w = await mainWin(); if (/connect\.html\?focus=/.test(w?.url || '')) break; await wait(250) }
      if (!/connect\.html\?focus=/.test(w?.url || '')) await fail('⑳ 꺼진 맥을 골랐는데 연결 화면(그 맥 줄)으로 안 갔다 · ' + JSON.stringify(w)) }
    { let t = ''; for (let i = 0; i < 40 && !/닿지 않음/.test(t); i++) { t = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop()); return w ? w.webContents.executeJavaScript("(document.querySelector('.row.focus')||{}).textContent||''") : '' }); await wait(250) }
      if (!/닿지 않음/.test(t)) await fail('⑳ 연결 화면의 그 맥 줄에 «닿지 않음» 이 없다 · ' + t) }
    await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => !x.isAlwaysOnTop()); const img = await w.webContents.capturePage(); require('node:fs').writeFileSync('test/tmp/mac-qa-mm-20.png', img.toPNG()) }).catch(() => {})
    ok('⑳ 꺼진 맥 — 연결 화면의 그 맥 줄 «닿지 않음» (빈 창 아님)')
  } finally { await stopB() }
}

await cleanup()
process.exit(0)
