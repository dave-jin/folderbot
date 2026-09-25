// Folder Bot — macOS 셸. 미니의 호스트(웹 클라이언트)를 창에 띄우고, 메뉴바·알림·Dock 배지를 맡는다.
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, ipcMain, shell, session, dialog, clipboard, ClipboardItem } = require('electron')
const { pathToFileURL } = require('node:url')
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const http = require('node:http'); const https = require('node:https')
const { execFile } = require('node:child_process')
const updater = require('./updater')
const perms = require('./perms')
const localfs = require('./localfs')
const { folderIcon } = require('./trayIcon')
const { pickBounds } = require('./winBounds')

/**
 * 🔴 **AO · 두 손가락 쓸기로 앞뒤 페이지에 가지 않는다** (2026-09-24 Dave: *«왼쪽 혹은 오른쪽으로 쓸기에서
 *    이전 혹은 다음 페이지로 이동하는 기능이 여전히 남아 있어»*).
 * 이건 **우리 손짓 코드가 아니라 크로미움이 맥에서 주는 기본 동작**이다 — 화면 쪽에서 아무리 쓸기를 지워도 남는다.
 * 화면은 이제 기록을 안 쌓지만(`useHash`), 알림·트레이가 주소를 직접 바꾸는 길이 남아 있어 한 칸이 생길 수 있다.
 * **갈 곳이 생겨도 손짓이 안 먹게** 여기서 그 기능 자체를 끈다 — 두 겹으로 막는다.
 * ⚠ 스위치는 `app.whenReady()` **전에** 걸어야 먹는다.
 */
app.commandLine.appendSwitch('disable-features', 'OverscrollHistoryNavigation')
const { navHash, withHash } = require('./nav')
const { createNoteKeeper } = require('./notes')
const notes = createNoteKeeper()   // 띄운 알림을 눌리거나 닫힐 때까지 붙잡는다 — GC 가 클릭 처리기를 가져가던 버그(notes.js 머리말)
if (process.env.FOLDERBOT_QA) global.__fbNotes = notes   // QA 손잡이 — 검사가 «붙잡혔나» 를 직접 본다
const clipCore = require('./clip-core')

// 🔴 QA 격리 — macOS 의 userData 는 `$HOME` 을 **무시한다**(NSSearchPath 가 passwd 의 홈을 쓴다 · 2026-09-22 실측). 그래서 임시 HOME 만으로는
//    `~/Library/Application Support/Electron` 의 실 설정을 읽는다. 검사(`test/mac-qa.mjs`)는 이 변수로 userData 를 통째로 옮긴다.
if (process.env.FOLDERBOT_USER_DATA) app.setPath('userData', process.env.FOLDERBOT_USER_DATA)
const SETTINGS = () => join(app.getPath('userData'), 'settings.json')
// openMode · vaultLocal — 원격 기기에서 파일을 «어디서 여나»(E): 'sync' = 이 기기의 동기화 볼트(vaultLocal) · 'download' = 호스트에서 받아 캐시로. 빈 값 = 아직 안 정함(온보딩이 묻는다)
let settings = { mode: '', hostUrl: '', token: '', loginItem: false, root: '', port: 7373, openMode: '', vaultLocal: '' }
try { settings = { ...settings, ...JSON.parse(readFileSync(SETTINGS(), 'utf8')) } } catch {}
const save = () => { try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(SETTINGS(), JSON.stringify(settings, null, 2)) } catch {} }

let win = null, tray = null, sse = null, waiting = 0, mood = 'idle', pendingNav = null
let hostRun = null, pairing = null
const moodTitle = { idle: '', work: '', wait: '', done: '', error: '', sleep: '' }

/**
 * 🔴 **QA 로 띄운 앱은 이 맥에 흔적을 남기지 않는다** (`FOLDERBOT_QA=1` · `test/mac-qa.mjs`, 2026-09-22).
 *    개발 Electron 이 ① `folderbot://` 기본 앱을 가로채고 ② 로그인 항목에 스스로를 넣고 ③ 15초 뒤 릴리스를 내려받아
 *    «업데이트» 를 권하는 세 가지를 막는다 — 전부 Dave 가 실제로 쓰는 `/Applications/Folder Bot.app` 을 건드리는 일이다.
 */
const QA = process.env.FOLDERBOT_QA === '1'
if (!app.requestSingleInstanceLock()) app.quit()
if (!QA) app.setAsDefaultProtocolClient('folderbot')
app.on('second-instance', (_e, argv) => { const u = argv.find((a) => a.startsWith('folderbot://')); if (u) openDeepLink(u); showWin() })
app.on('open-url', (e, url) => { e.preventDefault(); openDeepLink(url) })

function openDeepLink(url) {
  // folderbot://bot/<id>?s=<sid>  → 해당 대화로
  try { const u = new URL(url); const parts = u.pathname.split('/').filter(Boolean); const bot = u.hostname === 'bot' ? parts[0] : null; if (bot) navigate(`#bot=${bot}${u.searchParams.get('s') ? `&s=${u.searchParams.get('s')}` : ''}`) } catch {}
}
/**
 * 🔴 창이 없으면 **만든다** (2026-09-17 Dave: «알람 버튼 클릭하면 해당 세션으로 이동해야 해»). 종전엔 목적지만 적고
 *    돌아가 배너를 눌러도 아무 일이 없었다. 목적지는 `loadHome` 이 첫 로드 URL 에 싣는다(`desktop/nav.js` 머리말).
 */
function navigate(hash) {
  if (!win) { pendingNav = hash; showWin(); return }
  showWin()
  /* AQ · `location.hash=` 는 기록을 한 칸 쌓는다(뒤로 쓸기가 걷어 갈 곳이 생긴다) — 같은 자리에 덮어쓰고
     화면에는 직접 알린다(`replaceState` 는 `hashchange` 를 안 쏜다). */
  win.webContents.executeJavaScript(`(()=>{const h=${JSON.stringify(hash.replace(/^#/, ''))};history.replaceState(null,'',h?'#'+h:location.pathname+location.search);dispatchEvent(new HashChangeEvent('hashchange'))})()`).catch(() => {})
}
function showWin() { if (!win) createWin(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); if (app.dock) app.dock.show(); try { updater.checkOnFocus() } catch {} }

/**
 * 🔴 **창도 마지막 모습으로 뜬다** (2026-09-15 Dave: «마지막으로 작업했던 프로젝트도 기억하고 그 창에서
 *    시작되면»). 종전에는 켤 때마다 1280×860 한가운데였다 — 창을 넓혀 두고 쓰는 사람은 **매번 다시** 넓혔다.
 * ⚠ 저장된 자리가 지금 화면 밖이면(모니터를 뺐거나 해상도가 바뀌었다) **크기만 살리고 자리는 버린다** —
 *   안 그러면 창이 보이지 않는 곳에 떠서 «앱이 안 켜진다» 가 된다.
 */
function savedBounds() {
  const { screen } = require('electron')
  return pickBounds(settings.win, screen.getAllDisplays())
}
function createWin() {
  win = new BrowserWindow({ ...savedBounds(), minWidth: 720, minHeight: 520, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 16 } /* 헤더 44px 의 중앙(12px 버튼) — 제목과 높이를 맞춘다 */, backgroundColor: '#141414', show: false, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false } })
  win.once('ready-to-show', () => { win.show(); if (pendingNav) { navigate(pendingNav); pendingNav = null } })
  // ⚠ 창을 움직이는 동안 매 픽셀마다 파일을 쓰지 않는다 — 멈춘 뒤 한 번만
  let bt = null
  const remember = () => {
    if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds()
    if (!b || !b.width || !b.height) return
    settings.win = { x: b.x, y: b.y, width: b.width, height: b.height }; save()
  }
  const later = () => { clearTimeout(bt); bt = setTimeout(remember, 600) }
  win.on('resize', later); win.on('move', later)
  win.on('close', () => { clearTimeout(bt); remember() })
  win.on('closed', () => { win = null })
  win.on('focus', () => { try { win.webContents.send('fb:perms', perms.list({ host: settings.mode === 'host', openMode: settings.openMode })) } catch {} })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  Menu.setApplicationMenu(appMenu())
  loadHome()
}
function loadHome() {
  // 알림으로 창을 새로 띄웠으면 목적지를 첫 URL 에 함께 싣는다 — 토큰 리로드와 경합하지 않는다(`nav.js`)
  const nav = pendingNav; pendingNav = null
  if (settings.mode === 'host' && hostRun) { win.loadURL(withHash(`${settings.hostUrl}/#token=${encodeURIComponent(hostRun.gateway.localToken())}`, nav)).catch(() => {}); return }
  if (!settings.hostUrl) { win.loadFile(join(__dirname, 'connect.html')); return }
  win.loadURL(withHash(settings.hostUrl, nav)).catch(() => win.loadFile(join(__dirname, 'connect.html')))
}

// ── 호스트 모드: 이 맥(미니)에서 호스트를 앱 안에서 띄운다 — GUI 앱이라 claude 가 키체인을 읽는다 ──
const HOST_BUNDLE = join(__dirname, 'host', 'host', 'index.mjs')
const HOST_CLIENT = join(__dirname, 'host', 'client')
function hostAvailable() { return existsSync(HOST_BUNDLE) && existsSync(join(HOST_CLIENT, 'index.html')) }
async function startHostMode(root) {
  if (!hostAvailable()) throw new Error('이 빌드에는 호스트가 안 들어 있어요')
  process.env.FOLDERBOT_DATA = join(app.getPath('userData'), 'host')
  /**
   * 🔴 호스트가 이 앱 안에서 돌면 **맥 배너는 이 앱(Electron)이 띄운다** — 눌러서 그 대화로 갈 수 있는 쪽이다.
   *    호스트의 자체 배너(terminal-notifier·osascript)는 같은 사건에 **하나 더** 뜨고, 눌러도 브라우저 첫 화면이 열리거나
   *    아무 일도 없다 — «알림을 눌렀는데 안 간다» 의 절반이 이 배너였다. 터미널로 띄운 호스트(앱 없음)에서는 그대로 뜬다.
   */
  process.env.FOLDERBOT_NO_MAC_NOTIFY = '1'
  const mod = await import(pathToFileURL(HOST_BUNDLE).href)
  hostRun = await mod.startHost({ root, port: settings.port || 7373, webRoot: HOST_CLIENT, log: (m) => console.log('[host]', m), onRoot: (r) => switchRoot(r) })
  settings.mode = 'host'; settings.root = root; settings.hostUrl = `http://127.0.0.1:${settings.port || 7373}`; settings.token = hostRun.gateway.localToken(); save()
  pairing = hostRun.gateway.openPairing()
  startSse(); refreshTray(); startUsagePoll()
  return hostRun
}
function newPairing() { if (!hostRun) return null; pairing = hostRun.gateway.openPairing(); refreshTray(); return pairing }
async function chooseRootAndStart() {
  const r = await dialog.showOpenDialog({ title: '에이전트와 함께 일할 루트 폴더 (예: PARA)', properties: ['openDirectory', 'createDirectory'], buttonLabel: '이 폴더를 루트로' })
  // ⛔ **취소하면 아무것도 안 한다** — 종전에는 부르는 쪽이 먼저 `hostRun.stop()` 을 해 놓아서,
  //    창을 닫기만 해도 **돌던 호스트가 죽은 채로 남았다**. 끄는 일은 고른 뒤에(`switchRoot`).
  if (r.canceled || !r.filePaths[0]) return
  await switchRoot(r.filePaths[0])
}
/** 루트 갈아끼우기 — 앱 안 설정(API `onRoot`)과 트레이 메뉴가 **같은 문 하나**를 쓴다 */
async function switchRoot(root) {
  if (!root) return
  try { hostRun?.stop() } catch { /* 이미 내려갔으면 그만 */ }
  hostRun = null
  try { await startHostMode(root); if (!settings.loginItem) { settings.loginItem = true; save(); app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true }) } showWin(); loadHome() }
  catch (e) { dialog.showErrorBox('호스트를 못 띄웠어요', String(e && e.message || e)) }
}
/**
 * 🔴 **사용량 폴링은 모드와 상관없이 돈다** (2026-09-13 Dave 제보 — 원격 맥의 메뉴에 사용량이 아예 없었다).
 *    종전에는 `startHostMode()` 안에서만 시작해서, 호스트에 **붙어 쓰는** 맥은 영영 안 받아 왔다.
 *    받아 오는 쪽(`pollUsage`)은 원래부터 두 모드를 다 알고 있었다 — 시작해 주는 사람이 없었을 뿐이다.
 */
let usageTimer = null
function startUsagePoll() {
  if (usageTimer) return
  void pollUsage()
  usageTimer = setInterval(() => void pollUsage(), 60_000)
}
ipcMain.on('fb:host-mode', () => { void chooseRootAndStart() })
ipcMain.handle('fb:host-available', () => hostAvailable())
// connect.html 이 주소를 확인하면 folderbot-connect://<url> 로 알려 준다
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith('folderbot-connect://')) { e.preventDefault(); settings.hostUrl = decodeURIComponent(url.slice('folderbot-connect://'.length)); settings.token = ''; save(); loadHome(); startSse(); return }
    // 🔴 **바깥 링크는 바깥에서 연다.** `setWindowOpenHandler` 는 `target=_blank` 만 받는다 —
    //    답변 속 평범한 `<a href>` 는 **창을 통째로** 그 사이트로 끌고 가서 앱이 그 자리에서 사라진다
    //    (뒤로 갈 길도 없다). 우리 화면(호스트 주소·file://)만 남기고 나머지 http(s) 는 기본 브라우저로.
    // 🔴 파일을 놓을 자리 밖에 놓으면 크롬이 창을 그 파일(file://)로 옮긴다 — 앱이 사라진다. 우리 것(connect.html)만 남긴다
    if (/^file:/i.test(url) && !/connect\.html/.test(url)) { e.preventDefault(); return }
    if (!/^https?:/i.test(url)) return
    let mine = false
    try { mine = new URL(url).origin === new URL(wc.getURL() || 'http://x.invalid').origin } catch {}
    if (mine) return
    e.preventDefault(); shell.openExternal(url)
  })
})
// 권한 — 목록 · 설정 창 · 사용자 대답 · 테스트 알림 · 다시 시작
ipcMain.handle('fb:perm-list', () => perms.list({ host: settings.mode === 'host', openMode: settings.openMode }))
ipcMain.handle('fb:perm-open', (_e, id) => perms.openPane(id))
ipcMain.handle('fb:perm-ack', (_e, id, ok) => { perms.setAck(id, !!ok); return perms.list({ host: settings.mode === 'host', openMode: settings.openMode }) })
ipcMain.handle('fb:perm-reset', () => { perms.resetAcks(); return perms.list({ host: settings.mode === 'host', openMode: settings.openMode }) })
ipcMain.handle('fb:perm-test', () => perms.sendTest())
ipcMain.on('fb:perm-relaunch', () => perms.relaunch())
/**
 * 문서 → PDF (루프 9/10). 🔴 그리는 것은 화면의 `@media print` 다 — 인쇄용 사본(`.printdoc`)만 남기고 앱은 숨긴다.
 * ⚠ 저장 자리는 사람이 고른다(기본은 내려받기 폴더) — 취소하면 null.
 */
ipcMain.handle('fb:pdf', async (_e, name) => {
  if (!win) return null
  const safe = String(name || 'document').replace(/[\/:*?"<>|]/g, '-').replace(/\.md$/i, '')
  const r = await dialog.showSaveDialog(win, { title: 'PDF 로 저장', defaultPath: require('node:path').join(app.getPath('downloads'), `${safe}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (r.canceled || !r.filePath) return null
  const buf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  writeFileSync(r.filePath, buf)
  return r.filePath
})
/**
 * 이 기기의 파일 (E · 2026-09-19) — 원격 화면의 «Finder 에서 보기 · 열기» 가 **이 기기에서** 되게 한다.
 * 판정은 desktop/localfs.js, 화면은 결과만. 여는 것은 shell 뿐이고 경로는 화면이 준 그대로다(볼트 안으로 좁히는 것은 화면 쪽 계약).
 */
const localSettings = () => ({ openMode: settings.openMode || '', vaultLocal: settings.vaultLocal || '' })
ipcMain.handle('fb:local-settings', () => localSettings())
ipcMain.handle('fb:local-set', (_e, p) => { if (p && typeof p.openMode === 'string') settings.openMode = p.openMode; if (p && typeof p.vaultLocal === 'string') settings.vaultLocal = p.vaultLocal; save(); try { win?.webContents.send('fb:perms', perms.list({ host: settings.mode === 'host', openMode: settings.openMode })) } catch {} return localSettings() })
ipcMain.handle('fb:local-detect', (_e, hostRoot) => { try { return localfs.detect(String(hostRoot || '')) } catch { return [] } })
ipcMain.handle('fb:local-stat', (_e, p) => localfs.stat(String(p)))
ipcMain.handle('fb:local-open', (_e, p) => shell.openPath(String(p)))
ipcMain.handle('fb:local-reveal', (_e, p) => { shell.showItemInFolder(String(p)); return '' })
ipcMain.handle('fb:local-wait', (_e, p, want, ms) => localfs.waitFor(String(p), want || {}, Number(ms) || 60000))
ipcMain.handle('fb:local-download', (_e, url, hostName, rel) => localfs.download(String(url), { authorization: `Bearer ${settings.token}` }, localfs.cachePath(app.getPath('userData'), String(hostName || 'host'), String(rel))))
ipcMain.handle('fb:local-icloud', (_e, p) => localfs.icloudDownload(String(p)))
/* ── M · 복사 · 진행 있는 받기 · 캐시 ────────────────────────────────────────
 * 이미지는 nativeImage 로 클립보드에(메모·슬랙에 ⌘V). 파일은 macOS 파일 클립보드(NSFilenamesPboardType plist) — Finder ⌘V 로 복사되고
 * 카톡 입력창에 붙이면 첨부가 된다. 원격이면 먼저 캐시에 받은 사본의 경로를 넣는다. */
const CACHE_DIR = () => join(app.getPath('userData'), 'remote-cache')
const CACHE_LIMIT = 2 * 1024 * 1024 * 1024
/**
 * 🔴 **복사는 «썼다» 가 아니라 «읽힌다» 로 판정한다** (2026-09-21 Dave 실기기 보고: *«다 안되는거 같아»*).
 *    종전에는 `clipboard.writeImage`/`writeBuffer` 를 부르고 **무조건 true** 를 돌려줬다 — 화면은 «복사했어요» 라고 말하고
 *    붙여넣기는 아무것도 안 나왔다. 조용히 틀리는 쪽이라 무엇이 고장인지도 알 수 없었다.
 *    (v126 의 그 «되읽기» 도 없어진 `readImage`·`availableFormats` 를 불러 실은 한 번도 안 돌았다 — 아래 머리말과 `clip-core.js`.)
 * ⚠ 돌려주는 값은 `{ ok, why, formats }` 다 — 부르는 쪽이 **어디서 죽었는지**를 사람에게 그대로 보여 준다.
 */
function osa(script, ms = 6000) {
  return new Promise((res) => { try { execFile('/usr/bin/osascript', ['-e', script], { timeout: ms }, (err) => res(!err)) } catch { res(false) } })
}
const qq = (p) => String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
/**
 * 🔴 **Electron 44 의 clipboard 는 W3C 식 비동기 API 다** — `writeImage`·`readImage`·`writeBuffer`·`availableFormats` 가 **없다**
 *    (2026-09-22 맥미니 실측 · M «다 안 된다» 의 뿌리 — v126 까지의 핸들러는 없어진 함수를 불러 `TypeError` 로 죽었다).
 *    되읽기는 `clipboard.read()` 의 `types` 로 하고, 판정은 `desktop/clip-core.js`(순수 · 유닛) 가 한다.
 */
/** 되읽기 — 바깥 프로세스(osascript)가 방금 쓴 직후엔 빈 목록이 올 때가 있다(실측 2회 중 1회). 비면 100ms 쉬고 최대 3번 */
async function clipTypes() {
  for (let i = 0; i < 3; i++) {
    try { const t = (await clipboard.read()).flatMap((x) => x.types); if (t.length) return t } catch { /* 다시 */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  return []
}
ipcMain.handle('fb:local-copy-image', async (_e, a) => {
  const mac = process.platform === 'darwin'
  try {
    let img = null, from = ''
    if (a && a.path && existsSync(String(a.path))) { img = nativeImage.createFromPath(String(a.path)); from = 'path' }
    if ((!img || img.isEmpty()) && a && a.url) {
      const r = await fetch(String(a.url), { headers: { authorization: `Bearer ${settings.token}` } })
      if (!r.ok) return { ok: false, why: `호스트에서 그림을 못 받았어요 (HTTP ${r.status})` }
      img = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer())); from = 'url'
    }
    if (!img || img.isEmpty()) return { ok: false, why: `그림을 못 읽었어요 (${from || '경로 없음'}) — HEIC·SVG 는 아직 못 붙여요` }
    // ① PNG 로 올린다 — 실측: image/png + Apple PNG + TIFF 세 형식이 함께 올라가 메모·카톡이 받는다
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })])
    let types = await clipTypes()
    if (clipCore.hasImage(types)) return { ok: true, formats: clipCore.shortTypes(types) }
    // ② 되읽으니 그림이 없다 — 맥이면 파일을 거쳐 osascript 로 한 번 더
    if (mac) {
      const tmp = join(app.getPath('temp'), `fb-copy-${Date.now()}.png`)
      try { writeFileSync(tmp, img.toPNG()) } catch { /* 임시 폴더에 못 쓴다 */ }
      if (existsSync(tmp) && await osa(`set the clipboard to (read (POSIX file "${qq(tmp)}") as «class PNGf»)`)) { types = await clipTypes(); if (clipCore.hasImage(types)) return { ok: true, formats: clipCore.shortTypes(types) } }
    }
    return { ok: false, why: `클립보드에 썼는데 되읽으니 그림이 없어요 (형식: ${clipCore.shortTypes(types).join(', ') || '없음'})`, formats: clipCore.shortTypes(types) }
  } catch (e) { return { ok: false, why: `복사 중 오류 — ${e && e.message ? e.message : e}` } }
})
ipcMain.handle('fb:local-copy-files', async (_e, paths) => {
  const all = (Array.isArray(paths) ? paths : []).map(String)
  const list = all.filter((p) => existsSync(p))
  if (!list.length) return { ok: false, why: all.length ? `파일이 그 자리에 없어요 — ${all[0]}` : '복사할 파일이 없어요' }
  try {
    if (process.platform !== 'darwin') { await clipboard.writeText(list.join('\n')); return { ok: true, why: '맥이 아니라 경로 글자로 복사했어요' } }
    // ① 파일 URL 목록 — 실측: public.file-url + NSFilenamesPboardType 이 함께 올라간다(Finder ⌘V·카톡 첨부가 읽는 형식).
    //    ⛔ text/plain 을 같이 싣지 않는다 — 같이 실으면 파일 URL 이 폴더까지만 남는다(실측)
    await clipboard.write([new ClipboardItem({ 'text/uri-list': clipCore.uriList(list) })])
    let types = await clipTypes()
    if (clipCore.hasFile(types)) return { ok: true, formats: clipCore.shortTypes(types) }
    // ② osascript 폴백 — 파일 **하나**를 괄호 없이 주면 furl 이 올라간다({목록} 은 'list' 형식만 올라가 Finder 가 못 읽는다)
    if (list.length === 1 && await osa(`set the clipboard to POSIX file "${qq(list[0])}"`)) { types = await clipTypes(); if (clipCore.hasFile(types)) return { ok: true, formats: clipCore.shortTypes(types) } }
    await clipboard.writeText(list.join('\n'))
    return { ok: false, why: `파일로는 못 올렸어요 — 경로 글자만 복사했어요 (형식: ${clipCore.shortTypes(types).join(', ') || '없음'})`, formats: clipCore.shortTypes(types) }
  } catch (e) { return { ok: false, why: `복사 중 오류 — ${e && e.message ? e.message : e}` } }
})
/** 복사 진단 — 한 파일로 두 길(그림·파일)을 실제로 밟아 보고 결과를 글로 돌려준다 (설정 › 기기). 어느 줄에서 죽어도 그 줄까지는 글로 남는다 */
ipcMain.handle('fb:copy-diag', async (_e, p) => {
  const out = []
  const path = String(p || '')
  out.push(`플랫폼 ${process.platform} · 앱 ${app.getVersion()} · Electron ${process.versions.electron}`)
  out.push(`대상 ${path || '(없음)'} · 있음 ${path ? existsSync(path) : false}`)
  const step = async (label, fn) => { try { out.push(`${label} → ${await fn()}`) } catch (e) { out.push(`${label} → 오류 ${e && e.message ? e.message : e}`) } }
  await step('복사 전 형식', async () => `[${clipCore.shortTypes(await clipTypes()).join(', ') || '없음'}]`)
  if (path && existsSync(path)) {
    await step('파일 URL 올리기(text/uri-list)', async () => { await clipboard.write([new ClipboardItem({ 'text/uri-list': clipCore.uriList([path]) })]); const t = await clipTypes(); return `${clipCore.hasFile(t) ? '파일 ✅' : '파일 ❌'} [${clipCore.shortTypes(t).join(', ') || '없음'}]` })
    await step('osascript 파일 하나', async () => { const ok = await osa(`set the clipboard to POSIX file "${qq(path)}"`); const t = await clipTypes(); return `${ok} · ${clipCore.hasFile(t) ? '파일 ✅' : '파일 ❌'} [${clipCore.shortTypes(t).join(', ') || '없음'}]` })
    if (/\.(png|jpe?g|gif|webp)$/i.test(path)) {
      await step('그림 읽기', async () => { const img = nativeImage.createFromPath(path); return img.isEmpty() ? '비었음 ❌' : `${img.getSize().width}x${img.getSize().height}` })
      await step('그림 올리기(image/png)', async () => { const img = nativeImage.createFromPath(path); if (img.isEmpty()) return '건너뜀'; await clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })]); const t = await clipTypes(); return `${clipCore.hasImage(t) ? '그림 ✅' : '그림 ❌'} [${clipCore.shortTypes(t).join(', ') || '없음'}]` })
    }
  }
  return out.join('\n')
})
const fetches = new Map()
ipcMain.handle('fb:local-fetch', async (e, id, url, hostName, rel) => {
  const dest = localfs.cachePath(app.getPath('userData'), String(hostName || 'host'), String(rel))
  const ac = new AbortController(); fetches.set(String(id), ac)
  const send = (o) => { try { e.sender.send('fb:local-progress', { id: String(id), ...o }) } catch {} }
  try { const p = await localfs.downloadStream(String(url), { authorization: `Bearer ${settings.token}` }, dest, (pr) => send(pr), ac.signal); localfs.cacheEvict(CACHE_DIR(), CACHE_LIMIT); return p }
  finally { fetches.delete(String(id)) }
})
ipcMain.handle('fb:local-cancel', (_e, id) => { const ac = fetches.get(String(id)); if (ac) ac.abort(); return !!ac })
ipcMain.handle('fb:local-cache-path', (_e, hostName, rel) => localfs.cachePath(app.getPath('userData'), String(hostName || 'host'), String(rel)))
ipcMain.handle('fb:local-cache-info', () => ({ ...localfs.cacheInfo(CACHE_DIR()), limit: CACHE_LIMIT }))
ipcMain.handle('fb:local-cache-clear', () => ({ ...localfs.cacheClear(CACHE_DIR()), limit: CACHE_LIMIT }))
ipcMain.handle('fb:local-pick', async () => { if (!win) return ''; const r = await dialog.showOpenDialog(win, { title: '이 기기의 볼트 폴더', properties: ['openDirectory'] }); return r.canceled ? '' : (r.filePaths[0] || '') })
ipcMain.handle('fb:update-state', () => updater.state())
ipcMain.handle('fb:update-check', async () => { await updater.check(true); return updater.state() })
ipcMain.on('fb:update-apply', () => { updater.apply() })
ipcMain.on('fb:change-host', () => { settings.mode = ''; settings.hostUrl = ''; settings.token = ''; save(); stopSse(); if (win) loadHome() })
ipcMain.on('fb:token', (_e, token) => { if (typeof token === 'string' && token !== settings.token) { settings.token = token; save(); startSse() } })

// ── 트레이 (폴더봇 · 표정 = 합친 상태 · 배지 = 확인 대기 수) ──
/**
 * 메뉴바 아이콘 — 🔴 **남은 사용량만큼 폴더가 차 있다**(배터리처럼). 2026-09-13 Dave:
 * *«상단 메뉴 이름에 폴더가 얼마나 채워졌는지 정도로 (마치 배터리) 남은 사용량을 표시하고
 * 숫자랑 게이지는 없애줘»* — 그래서 제목(`setTitle`)은 비우고 그림 하나로 말한다.
 * ⚠ 2배 버퍼를 `scaleFactor: 2` 로 준다 — 레티나에서 22pt 로 또렷하게 앉는다.
 * ⚠ 사용량을 아직 모르면 예전 그림(`build/trayTemplate.png`)으로 떨어진다.
 */
function trayIcon() {
  const pct = usage && typeof usage.left === 'number' ? usage.left : null
  if (pct === null) { const img = nativeImage.createFromPath(join(__dirname, 'build', 'trayTemplate.png')); img.setTemplateImage(true); return img }
  const img = nativeImage.createFromBuffer(folderIcon(pct, 44), { scaleFactor: 2 })
  img.setTemplateImage(true)
  return img
}
function createTray() {
  tray = new Tray(trayIcon())
  tray.setToolTip('Folder Bot')
  // 🔴 **누르면 우리가 그린 패널이 뜬다** — 네이티브 메뉴가 아니다(`trayPanel` 머리말).
  tray.on('click', () => toggleTrayPanel())
  tray.on('right-click', () => toggleTrayPanel())
  refreshTray()
}
/**
 * 맥 메뉴바 — 🔴 **맥 앱이면 메뉴가 있어야 한다.** 기본 메뉴만 두면 우리 것(설정·새 세션·단축키)이
 *    어디에도 안 보이고, 사람은 «이 앱엔 단축키가 없나» 로 읽는다.
 * ⛔ **편집 메뉴의 역할(role)을 직접 구현하지 않는다** — `undo`·`redo`·`cut`·`copy`·`paste`·`selectAll`
 *    은 role 로 둬야 입력칸과 편집기에서 **맥 기본 동작 그대로** 돈다. 손으로 만들면 그 순간 깨진다.
 * ⚠ 우리 항목은 **화면으로 보낸다**(`fb:cmd`) — 동작은 렌더러 한 곳(App.tsx 의 KEYS)에만 둔다.
 */
function appMenu() {
  const cmd = (c) => () => { try { win?.webContents.send('fb:cmd', c) } catch {} }
  const isMac = process.platform === 'darwin'
  return Menu.buildFromTemplate([
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: '설정…', accelerator: 'CmdOrCtrl+,', click: cmd('settings') },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' }
    ] }] : []),
    { label: '파일', submenu: [
      { label: '새 세션', accelerator: 'CmdOrCtrl+N', click: cmd('new-session') },
      { label: '폴더 고르기 · 시작', accelerator: 'CmdOrCtrl+K', click: cmd('picker') },
      { label: '명령 팔레트', accelerator: 'CmdOrCtrl+P', click: cmd('palette') },
      { type: 'separator' },
      // ⚠ 맥에서는 ⏎ 가 보내기다(2026-09-15 Dave) — 이 ⌘⏎ 는 «어느 기기에서나» 도는 두 번째 길이다.
      //    ⛔ ⏎ 자체를 메뉴 단축키로 달지 않는다 — 메뉴가 먼저 삼켜서 **문서 편집기의 줄 바꿈까지** 막는다
      { label: '보내기', accelerator: 'CmdOrCtrl+Return', click: cmd('send') },
      { type: 'separator' }, { role: isMac ? 'close' : 'quit' }
    ] },
    { label: '편집', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: '보기', submenu: [
      { label: '알림', accelerator: 'CmdOrCtrl+Shift+U', click: cmd('notify') },
      { type: 'separator' }, { role: 'reload' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }
    ] },
    { label: '도움말', submenu: [
      { label: '단축키', accelerator: 'CmdOrCtrl+/', click: cmd('keys') }
    ] }
  ])
}
/**
 * 메뉴바 패널 — 🔴 **맥 기본 메뉴 대신 우리가 그린 창** (2026-09-13 Dave:
 * *«상단의 메뉴이미지는 맥 기본 OS 메뉴바가 아니라 직접 렌더링된 두번째 이미지 모습이어야 해»*).
 *
 * 종전 주석은 *«네이티브 메뉴는 HTML 을 못 그리니 글자 막대(`▰▱`)가 정답»* 이라고 적어 뒀다.
 * 전제가 틀렸다 — **메뉴를 안 쓰면 된다.** 테두리 없는 작은 창을 띄우면 앱 안의 사용량 카드를
 * **그대로** 그릴 수 있고, 색·문구·숫자가 두 곳에서 갈리지 않는다.
 *
 * ⚠ 패널은 **호스트가 주는 페이지**(`/tray.html`)다 — 사용량은 그 화면이 `/api/usage` 로 직접 묻는다.
 *    셸이 아는 것(모드·호스트 주소·페어링·업데이트·로그인 항목)만 `fb:tray-state` 로 내려보낸다.
 * ⚠ 호스트가 아직 없으면(연결 전) 그릴 게 없다 — 그때만 옛 네이티브 메뉴로 떨어진다.
 * ⛔ 높이를 여기서 정하지 마라 — 항목 수가 모드마다 다르다. 화면이 `fb:tray-size` 로 알려 준다.
 */
const TRAY_W = 320
let panel = null
function trayPanelUrl() {
  if (!settings.hostUrl) return null
  const t = settings.mode === 'host' && hostRun ? hostRun.gateway.localToken() : settings.token
  return `${settings.hostUrl.replace(/\/$/, '')}/tray.html${t ? `#token=${encodeURIComponent(t)}` : ''}`
}
function trayPanel() {
  if (panel && !panel.isDestroyed()) return panel
  panel = new BrowserWindow({
    width: TRAY_W, height: 420, show: false, frame: false, transparent: true, hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, 'tray-preload.js'), contextIsolation: true, sandbox: false }
  })
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // ⛔ 링크는 패널 안에서 열지 않는다 — 여기는 창이 아니라 «메뉴» 다
  panel.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  panel.on('blur', () => { if (panel && !panel.isDestroyed()) panel.hide() })
  panel.on('closed', () => { panel = null })
  return panel
}
function trayState() {
  const u = updater.state()
  return {
    waiting, mood, mode: settings.mode, root: settings.root,
    hostLabel: settings.hostUrl ? settings.hostUrl.replace(/^https?:\/\//, '') : '',
    pairing: pairing && Date.now() < pairing.expiresAt ? { code: pairing.code, expiresAt: pairing.expiresAt } : null,
    update: { current: u.current, downloading: u.downloading, staged: u.staged ?? null },
    loginItem: settings.loginItem
  }
}
function pushTrayState() { try { if (panel && !panel.isDestroyed()) panel.webContents.send('fb:tray-state', trayState()) } catch {} }
function toggleTrayPanel() {
  const url = trayPanelUrl()
  if (!url) { tray.popUpContextMenu(trayMenu()); return } // 연결 전에는 그릴 화면이 없다
  const w = trayPanel()
  if (w.isVisible()) { w.hide(); return }
  const b = tray.getBounds(); const { screen } = require('electron')
  const area = screen.getDisplayMatching(b).workArea
  const x = Math.round(Math.min(Math.max(area.x + 4, b.x + b.width / 2 - TRAY_W / 2), area.x + area.width - TRAY_W - 4))
  w.setPosition(x, Math.round(b.y + b.height + 2), false)
  if (w.webContents.getURL().split('#')[0] !== url.split('#')[0]) w.loadURL(url).catch(() => {})
  w.showInactive(); w.focus(); pushTrayState()
}
ipcMain.on('fb:tray-ready', () => pushTrayState())
ipcMain.on('fb:tray-size', (_e, h) => {
  if (!panel || panel.isDestroyed() || !h) return
  const b = tray.getBounds(); const { screen } = require('electron')
  const max = screen.getDisplayMatching(b).workArea.height - 40
  panel.setBounds({ ...panel.getBounds(), height: Math.max(120, Math.min(max, h + 2)) })
})
ipcMain.on('fb:tray-act', (_e, id) => {
  const hide = () => { try { panel?.hide() } catch {} }
  const copyPair = (p) => { if (!p) return; clipboard.writeText(p.code); new Notification({ title: 'Folder Bot 페어링 코드', body: `${p.code} · 2분 안에 폰·맥북에서 입력` }).show() }
  if (id === 'open') { hide(); showWin(); return }
  // ⚠ 알림 센터는 **명령**으로 연다 — 해시를 갈아 열면 보던 폴더를 잃는다(화면이 되돌리긴 하지만, 두 번 흔들린다)
  if (id === 'notify') { hide(); showWin(); try { win.webContents.send('fb:cmd', 'notify') } catch { navigate('#notify=1') } return }
  if (id === 'pairing') { copyPair(pairing && Date.now() < pairing.expiresAt ? pairing : newPairing()); hide(); return }
  if (id === 'pairing-new') { copyPair(newPairing()); hide(); return }
  if (id === 'copy-addr') { const urls = hostRun ? hostRun.urls.filter((u) => !u.includes('127.0.0.1')) : []; clipboard.writeText(urls[0] || settings.hostUrl); new Notification({ title: 'Folder Bot', body: urls[0] ? `${urls[0]} 복사됨 (같은 Tailscale)` : 'Tailscale 주소가 아직 없어요 — Tailscale 을 켜세요' }).show(); hide(); return }
  if (id === 'change-root') { hide(); void chooseRootAndStart(); return }
  if (id === 'change-host') { hide(); settings.mode = ''; settings.hostUrl = ''; settings.token = ''; save(); stopSse(); showWin(); loadHome(); return }
  if (id === 'update-check') { void updater.check(true); pushTrayState(); return }
  if (id === 'update-apply') { hide(); updater.apply(); return }
  if (id === 'login-toggle') { settings.loginItem = !settings.loginItem; save(); app.setLoginItemSettings({ openAtLogin: settings.loginItem, openAsHidden: true }); pushTrayState(); return }
  if (id === 'quit') { app.quit(); return }
})
/** ⚠ 폴백 전용 — 아직 호스트에 붙기 전(그릴 화면이 없을 때)만 뜬다. 평소 메뉴는 위 `trayPanel` 이다. */
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: waiting ? `확인 대기 ${waiting}` : mood === 'work' ? '일하는 중' : mood === 'error' ? '문제 있어요' : '한가함', enabled: false },
    ...usageItems(),
    { label: 'Folder Bot 열기', click: showWin },
    { label: '알림 센터', click: () => { showWin(); try { win.webContents.send('fb:cmd', 'notify') } catch { navigate('#notify=1') } } },
    { type: 'separator' },
    ...(settings.mode === 'host' ? [
      { label: `이 맥이 호스트 · ${settings.root}`, enabled: false },
      { label: pairing && Date.now() < pairing.expiresAt ? `페어링 코드 ${pairing.code} (클릭해 복사)` : '페어링 코드 만들기', click: () => { const p = pairing && Date.now() < pairing.expiresAt ? pairing : newPairing(); if (p) { clipboard.writeText(p.code); new Notification({ title: 'Folder Bot 페어링 코드', body: `${p.code} · 2분 안에 폰·맥북에서 입력` }).show() } } },
      { label: '새 페어링 코드', click: () => { const p = newPairing(); if (p) { clipboard.writeText(p.code); new Notification({ title: 'Folder Bot 페어링 코드', body: `${p.code} · 복사됨` }).show() } } },
      { label: '폰에서 열 주소 복사', click: () => { const urls = hostRun ? hostRun.urls.filter((u) => !u.includes('127.0.0.1')) : []; clipboard.writeText(urls[0] || settings.hostUrl); new Notification({ title: 'Folder Bot', body: urls[0] ? `${urls[0]} 복사됨 (같은 Tailscale)` : 'Tailscale 주소가 아직 없어요 — Tailscale 을 켜세요' }).show() } },
      { label: '루트 폴더 바꾸기…', click: () => { void chooseRootAndStart() } }
    ] : [
      { label: settings.hostUrl ? `호스트 · ${settings.hostUrl.replace(/^https?:\/\//, '')}` : '호스트 없음', enabled: false },
      { label: '호스트 바꾸기…', click: () => { settings.mode = ''; settings.hostUrl = ''; settings.token = ''; save(); stopSse(); showWin(); loadHome() } }
    ]),
    { type: 'separator' },
    ...(() => { const u = updater.state(); return u.staged?.ready ? [{ label: `v${u.staged.version} 업데이트 적용 (재시작)`, click: () => updater.apply() }] : u.downloading ? [{ label: `업데이트 받는 중 ${Math.round((u.staged?.progress || 0) * 100)}%`, enabled: false }] : [{ label: `업데이트 확인 (v${u.current})`, click: () => void updater.check(true) }] })(),
    { label: '로그인 시 자동 실행', type: 'checkbox', checked: settings.loginItem, click: (mi) => { settings.loginItem = mi.checked; save(); app.setLoginItemSettings({ openAtLogin: mi.checked, openAsHidden: true }) } },
    { type: 'separator' },
    { label: '종료', role: 'quit' }
  ])
}
/**
 * 사용량 — **남은 양**. 호스트가 /api/usage 하나로 내주고 메뉴 막대는 그걸 그리기만 한다.
 * ⛔ 여기서 뺄셈을 다시 하지 않는다(앱·폰과 숫자가 갈린다). ⛔ 기록이 없는 도구는 줄을 안 만든다.
 */
let usage = null
async function pollUsage() {
  try {
    const base = settings.mode === 'host' ? (hostRun ? hostRun.urls[0] : null) : settings.hostUrl
    if (!base) return
    const r = await fetch(base.replace(/\/$/, '') + '/api/usage', { headers: settings.token ? { authorization: `Bearer ${settings.token}` } : {} })
    if (!r.ok) return
    const j = await r.json()
    usage = j && Array.isArray(j.tools) && j.tools.length ? j : null
  } catch { /* 조용히 — 사용량 때문에 메뉴가 멈추면 안 된다 */ }
  refreshTray()
}
function leftTxt(ms, now) {
  const s2 = Math.max(0, Math.round((ms - now) / 1000)), h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60)
  return h ? `${h}시간 ${m}분` : `${m}분`
}
/**
 * 게이지 한 줄 — 네이티브 메뉴는 HTML 을 못 그린다. 🔴 그래서 **글자로 된 막대**가 정답이다
 * (이미지를 메뉴 항목에 넣을 수는 있지만 테마·해상도마다 따로 만들어야 하고, 글자는 그냥 따라간다).
 * ⚠ 블록 문자(`▰▱`)는 폭이 고르다 — 칸 수가 곧 길이라 눈금이 흔들리지 않는다.
 */
function gauge(pct, n = 10) {
  const on = Math.max(0, Math.min(n, Math.round((pct / 100) * n)))
  return '▰'.repeat(on) + '▱'.repeat(n - on)
}
function usageItems() {
  if (!usage) return []
  const money = (n) => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`
  const out = [{ label: `사용량 ${gauge(usage.left)}  ${usage.left}% 남음${usage.resetAt ? ` · ${leftTxt(usage.resetAt, usage.now)} 뒤` : ''}`, enabled: false }]
  for (const t of usage.tools) out.push({ label: `   ${(t.tool === 'claude' ? 'Claude' : 'Codex').padEnd(6)} ${gauge(t.left)}  ${t.left}% · ${money(t.leftCost)}`, enabled: false })
  out.push({ label: `   오늘   ${money(usage.day.left)} 남음 · 이번 주 ${money(usage.week.left)} 남음`, enabled: false })
  out.push({ type: 'separator' })
  return out
}

function refreshTray() {
  if (!tray) return
  // 🔴 **잔량은 아이콘이 말한다 — 글자로 적지 않는다** (2026-09-13 Dave 정정).
  //    종전에는 `▰▱▱▱▱ 27%` 를 제목에 적었다. 메뉴바에서 **글자는 읽는 것**인데 이건 읽을 필요가
  //    없는 정보다 — 배터리처럼 «얼마나 남았나» 만 보이면 된다(`trayIcon.js`).
  //    ⚠ 확인 대기 수만 글자로 남긴다 — 그건 잔량이 아니라 **지금 사람을 기다리는 일**의 개수다.
  tray.setImage(trayIcon())
  tray.setTitle(waiting ? String(waiting) : '', { fontType: 'monospacedDigit' })
  tray.setToolTip(waiting ? `Folder Bot · 확인 대기 ${waiting}` : 'Folder Bot')
  if (app.dock) app.dock.setBadge(waiting ? String(waiting) : '')
  pushTrayState() // ⚠ 패널이 떠 있으면 «한가함 → 일하는 중» 이 그 자리에서 바뀌어야 한다
}

// ── 호스트 SSE — 알림·배지의 단일 소스 ──
function stopSse() { try { sse?.destroy() } catch {} sse = null }
function startSse() {
  stopSse()
  if (!settings.hostUrl || !settings.token) return
  const mod = settings.hostUrl.startsWith('https') ? https : http
  const req = mod.get(settings.hostUrl + '/api/events', { headers: { authorization: `Bearer ${settings.token}`, accept: 'text/event-stream' } }, (res) => {
    if (res.statusCode !== 200) { res.resume(); setTimeout(startSse, 5000); return }
    let buf = ''
    res.setEncoding('utf8')
    res.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const c = buf.slice(0, i); buf = buf.slice(i + 2); for (const l of c.split('\n')) if (l.startsWith('data: ')) { try { onFrame(JSON.parse(l.slice(6))) } catch {} } } })
    res.on('end', () => setTimeout(startSse, 3000)); res.on('error', () => setTimeout(startSse, 5000))
    void syncState()
  })
  req.on('error', () => setTimeout(startSse, 8000))
  sse = req
}
async function syncState() {
  try {
    const mod = settings.hostUrl.startsWith('https') ? https : http
    const body = await new Promise((resolve, reject) => { mod.get(settings.hostUrl + '/api/state', { headers: { authorization: `Bearer ${settings.token}` } }, (r) => { let s = ''; r.setEncoding('utf8'); r.on('data', (d) => (s += d)); r.on('end', () => resolve(s)); r.on('error', reject) }).on('error', reject) })
    const st = JSON.parse(body)
    let w = 0, work = 0
    for (const list of Object.values(st.sessionsByBot || {})) for (const x of list) { if (x.state === 'awaiting_input') w++; if (x.state === 'running') work++ }
    waiting = w; mood = w ? 'wait' : work ? 'work' : st.auth?.verdict === 'unreadable' || st.auth?.verdict === 'loggedout' ? 'error' : 'idle'
    refreshTray()
  } catch {}
}
const states = new Map()
function onFrame(f) {
  if (f.ev === 'state') { states.set(f.sessionId, f.state); recount() }
  if (f.ev === 'sessions') { for (const x of f.sessions) states.set(x.id, x.bg ? 'running' : x.state); recount() } // 백그라운드 에이전트가 돌면 바쁜 것 — 업데이트 적용이 세션을 죽이지 않게
  if (f.ev === 'notify') notify(f.n)
  if (f.ev === 'hello') void syncState()
}
function recount() { let w = 0, work = 0; for (const s of states.values()) { if (s === 'awaiting_input') w++; if (s === 'running') work++ } waiting = w; mood = w ? 'wait' : work ? 'work' : 'idle'; refreshTray() }
function notify(n) {
  if (!Notification.isSupported()) return
  const no = new Notification({ title: n.title, body: n.body, silent: false })
  no.on('click', () => { notes.release(no); const h = navHash(n); if (h) navigate(`#${h}`); else showWin() })
  /* ⚠ 'close' 에서 놓지 않는다 — macOS 는 배너가 화면에서 걷혀 **알림 센터로 들어갈 때도** close 를 쏜다(실측). 그 배너는
     알림 센터에서 여전히 누를 수 있으니, 여기서 놓으면 GC 가 처리기를 가져가 원래 버그로 돌아간다. 놓는 때는 클릭·하루·개수·종료뿐 */
  if (QA) { no.on('close', () => { global.__fbNoteEv = (global.__fbNoteEv || []).concat('close') }); no.on('failed', (_e, err) => { global.__fbNoteEv = (global.__fbNoteEv || []).concat('failed:' + err) }) }
  // 🔴 붙잡아 둔다 — 안 그러면 GC 가 이 객체와 click 처리기를 가져가, 나중에 누른 배너는 앱만 앞으로 가져온다(엉뚱한 세션)
  for (const old of notes.keep(no)) { try { old.close() } catch {} }
  no.show()
}

app.whenReady().then(async () => {
  process.env.FOLDERBOT_DESKTOP_VERSION = app.getVersion()
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications' || perm === 'clipboard-read' || perm === 'clipboard-sanitized-write'))
  createTray()
  if (settings.mode === 'host' && settings.root) {
    try { await startHostMode(settings.root) } catch (e) { console.error(e); settings.mode = ''; save() }
  }
  createWin(); startSse(); startUsagePoll()
  if (!QA) app.setLoginItemSettings({ openAtLogin: !!settings.loginItem, openAsHidden: true })
  app.on('activate', showWin)
  // 자기 업데이트 — 호스트 모드에선 세션이 전부 유휴일 때만 적용한다
  const busyCount = () => { let b = 0; for (const st of states.values()) if (st === 'running' || st === 'awaiting_input') b++; return b }
  if (!QA) updater.start({ isHost: () => settings.mode === 'host', isBusy: () => busyCount() > 0, busyCount, onChange: () => { pushTrayState(); try { win?.webContents.send('fb:update', updater.state()) } catch {} } })
})
app.on('window-all-closed', () => { /* 메뉴바에 남는다 */ })
app.on('before-quit', () => {
  // 붙잡은 배너는 알림 센터에서 걷는다 — 다음 프로세스(업데이트 재시작 포함)는 옛 배너의 클릭을 못 받는다. 누를 곳 없는 배너를 남기지 않는다
  for (const n of notes.all()) { try { n.close() } catch {} }
  try { hostRun?.stop() } catch {}
})
