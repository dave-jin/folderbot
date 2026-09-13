// Folder Bot — macOS 셸. 미니의 호스트(웹 클라이언트)를 창에 띄우고, 메뉴바·알림·Dock 배지를 맡는다.
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, ipcMain, shell, session, dialog, clipboard } = require('electron')
const { pathToFileURL } = require('node:url')
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const http = require('node:http'); const https = require('node:https')
const updater = require('./updater')
const perms = require('./perms')

const SETTINGS = () => join(app.getPath('userData'), 'settings.json')
let settings = { mode: '', hostUrl: '', token: '', loginItem: false, root: '', port: 7373 }
try { settings = { ...settings, ...JSON.parse(readFileSync(SETTINGS(), 'utf8')) } } catch {}
const save = () => { try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(SETTINGS(), JSON.stringify(settings, null, 2)) } catch {} }

let win = null, tray = null, sse = null, waiting = 0, mood = 'idle', pendingNav = null
let hostRun = null, pairing = null
const moodTitle = { idle: '', work: '', wait: '', done: '', error: '', sleep: '' }

if (!app.requestSingleInstanceLock()) app.quit()
app.setAsDefaultProtocolClient('folderbot')
app.on('second-instance', (_e, argv) => { const u = argv.find((a) => a.startsWith('folderbot://')); if (u) openDeepLink(u); showWin() })
app.on('open-url', (e, url) => { e.preventDefault(); openDeepLink(url) })

function openDeepLink(url) {
  // folderbot://bot/<id>?s=<sid>  → 해당 대화로
  try { const u = new URL(url); const parts = u.pathname.split('/').filter(Boolean); const bot = u.hostname === 'bot' ? parts[0] : null; if (bot) navigate(`#bot=${bot}${u.searchParams.get('s') ? `&s=${u.searchParams.get('s')}` : ''}`) } catch {}
}
function navigate(hash) { if (!win) { pendingNav = hash; return } showWin(); win.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash.replace(/^#/, ''))}`).catch(() => {}) }
function showWin() { if (!win) createWin(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); if (app.dock) app.dock.show(); try { updater.checkOnFocus() } catch {} }

function createWin() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 720, minHeight: 520, titleBarStyle: 'hiddenInset', backgroundColor: '#141414', show: false, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false } })
  win.once('ready-to-show', () => { win.show(); if (pendingNav) { navigate(pendingNav); pendingNav = null } })
  win.on('closed', () => { win = null })
  win.on('focus', () => { try { win.webContents.send('fb:perms', perms.list({ host: settings.mode === 'host' })) } catch {} })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  loadHome()
}
function loadHome() {
  if (settings.mode === 'host' && hostRun) { win.loadURL(`${settings.hostUrl}/#token=${encodeURIComponent(hostRun.gateway.localToken())}`).catch(() => {}); return }
  if (!settings.hostUrl) { win.loadFile(join(__dirname, 'connect.html')); return }
  win.loadURL(settings.hostUrl).catch(() => win.loadFile(join(__dirname, 'connect.html')))
}

// ── 호스트 모드: 이 맥(미니)에서 호스트를 앱 안에서 띄운다 — GUI 앱이라 claude 가 키체인을 읽는다 ──
const HOST_BUNDLE = join(__dirname, 'host', 'host', 'index.mjs')
const HOST_CLIENT = join(__dirname, 'host', 'client')
function hostAvailable() { return existsSync(HOST_BUNDLE) && existsSync(join(HOST_CLIENT, 'index.html')) }
async function startHostMode(root) {
  if (!hostAvailable()) throw new Error('이 빌드에는 호스트가 안 들어 있어요')
  process.env.FOLDERBOT_DATA = join(app.getPath('userData'), 'host')
  const mod = await import(pathToFileURL(HOST_BUNDLE).href)
  hostRun = await mod.startHost({ root, port: settings.port || 7373, webRoot: HOST_CLIENT, log: (m) => console.log('[host]', m) })
  settings.mode = 'host'; settings.root = root; settings.hostUrl = `http://127.0.0.1:${settings.port || 7373}`; settings.token = hostRun.gateway.localToken(); save()
  pairing = hostRun.gateway.openPairing()
  startSse(); refreshTray()
  return hostRun
}
function newPairing() { if (!hostRun) return null; pairing = hostRun.gateway.openPairing(); refreshTray(); return pairing }
async function chooseRootAndStart() {
  const r = await dialog.showOpenDialog({ title: '에이전트와 함께 일할 루트 폴더 (예: PARA)', properties: ['openDirectory', 'createDirectory'], buttonLabel: '이 폴더를 루트로' })
  if (r.canceled || !r.filePaths[0]) return
  try { await startHostMode(r.filePaths[0]); if (!settings.loginItem) { settings.loginItem = true; save(); app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true }) } showWin(); loadHome() }
  catch (e) { dialog.showErrorBox('호스트를 못 띄웠어요', String(e && e.message || e)) }
}
ipcMain.on('fb:host-mode', () => { void chooseRootAndStart() })
ipcMain.handle('fb:host-available', () => hostAvailable())
// connect.html 이 주소를 확인하면 folderbot-connect://<url> 로 알려 준다
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (e, url) => { if (url.startsWith('folderbot-connect://')) { e.preventDefault(); settings.hostUrl = decodeURIComponent(url.slice('folderbot-connect://'.length)); settings.token = ''; save(); loadHome(); startSse() } })
})
// 권한 — 목록 · 설정 창 · 사용자 대답 · 테스트 알림 · 다시 시작
ipcMain.handle('fb:perm-list', () => perms.list({ host: settings.mode === 'host' }))
ipcMain.handle('fb:perm-open', (_e, id) => perms.openPane(id))
ipcMain.handle('fb:perm-ack', (_e, id, ok) => { perms.setAck(id, !!ok); return perms.list({ host: settings.mode === 'host' }) })
ipcMain.handle('fb:perm-reset', () => { perms.resetAcks(); return perms.list({ host: settings.mode === 'host' }) })
ipcMain.handle('fb:perm-test', () => perms.sendTest())
ipcMain.on('fb:perm-relaunch', () => perms.relaunch())
ipcMain.handle('fb:update-state', () => updater.state())
ipcMain.handle('fb:update-check', async () => { await updater.check(true); return updater.state() })
ipcMain.on('fb:update-apply', () => { updater.apply() })
ipcMain.on('fb:change-host', () => { settings.mode = ''; settings.hostUrl = ''; settings.token = ''; save(); stopSse(); if (win) loadHome() })
ipcMain.on('fb:token', (_e, token) => { if (typeof token === 'string' && token !== settings.token) { settings.token = token; save(); startSse() } })

// ── 트레이 (폴더봇 · 표정 = 합친 상태 · 배지 = 확인 대기 수) ──
function trayIcon() { const p = join(__dirname, 'build', 'trayTemplate.png'); const img = nativeImage.createFromPath(p); img.setTemplateImage(true); return img }
function createTray() {
  tray = new Tray(trayIcon())
  tray.setToolTip('Folder Bot')
  tray.on('click', () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWin() })
  tray.on('right-click', () => tray.popUpContextMenu(trayMenu()))
  refreshTray()
}
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: waiting ? `확인 대기 ${waiting}` : mood === 'work' ? '일하는 중' : mood === 'error' ? '문제 있어요' : '한가함', enabled: false },
    { label: 'Folder Bot 열기', click: showWin },
    { label: '알림 센터', click: () => navigate('#notify=1') },
    { type: 'separator' },
    ...(settings.mode === 'host' ? [
      { label: `이 맥이 호스트 · ${settings.root}`, enabled: false },
      { label: pairing && Date.now() < pairing.expiresAt ? `페어링 코드 ${pairing.code} (클릭해 복사)` : '페어링 코드 만들기', click: () => { const p = pairing && Date.now() < pairing.expiresAt ? pairing : newPairing(); if (p) { clipboard.writeText(p.code); new Notification({ title: 'Folder Bot 페어링 코드', body: `${p.code} · 2분 안에 폰·맥북에서 입력` }).show() } } },
      { label: '새 페어링 코드', click: () => { const p = newPairing(); if (p) { clipboard.writeText(p.code); new Notification({ title: 'Folder Bot 페어링 코드', body: `${p.code} · 복사됨` }).show() } } },
      { label: '폰에서 열 주소 복사', click: () => { const urls = hostRun ? hostRun.urls.filter((u) => !u.includes('127.0.0.1')) : []; clipboard.writeText(urls[0] || settings.hostUrl); new Notification({ title: 'Folder Bot', body: urls[0] ? `${urls[0]} 복사됨 (같은 Tailscale)` : 'Tailscale 주소가 아직 없어요 — Tailscale 을 켜세요' }).show() } },
      { label: '루트 폴더 바꾸기…', click: () => { hostRun?.stop(); hostRun = null; void chooseRootAndStart() } }
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
function refreshTray() {
  if (!tray) return
  tray.setTitle(waiting ? String(waiting) : '', { fontType: 'monospacedDigit' })
  tray.setToolTip(waiting ? `Folder Bot · 확인 대기 ${waiting}` : 'Folder Bot')
  if (app.dock) app.dock.setBadge(waiting ? String(waiting) : '')
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
  no.on('click', () => navigate(`#bot=${n.botId}${n.sessionId ? `&s=${n.sessionId}` : ''}`))
  no.show()
}

app.whenReady().then(async () => {
  process.env.FOLDERBOT_DESKTOP_VERSION = app.getVersion()
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications' || perm === 'clipboard-read' || perm === 'clipboard-sanitized-write'))
  createTray()
  if (settings.mode === 'host' && settings.root) {
    try { await startHostMode(settings.root) } catch (e) { console.error(e); settings.mode = ''; save() }
  }
  createWin(); startSse()
  app.setLoginItemSettings({ openAtLogin: !!settings.loginItem, openAsHidden: true })
  app.on('activate', showWin)
  // 자기 업데이트 — 호스트 모드에선 세션이 전부 유휴일 때만 적용한다
  const busyCount = () => { let b = 0; for (const st of states.values()) if (st === 'running' || st === 'awaiting_input') b++; return b }
  updater.start({ isHost: () => settings.mode === 'host', isBusy: () => busyCount() > 0, busyCount, onChange: () => { try { tray?.setContextMenu(trayMenu()) } catch {} try { win?.webContents.send('fb:update', updater.state()) } catch {} } })
})
app.on('window-all-closed', () => { /* 메뉴바에 남는다 */ })
app.on('before-quit', () => { try { hostRun?.stop() } catch {} })
