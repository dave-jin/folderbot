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
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 720, minHeight: 520, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 16 } /* 헤더 44px 의 중앙(12px 버튼) — 제목과 높이를 맞춘다 */, backgroundColor: '#141414', show: false, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false } })
  win.once('ready-to-show', () => { win.show(); if (pendingNav) { navigate(pendingNav); pendingNav = null } })
  win.on('closed', () => { win = null })
  win.on('focus', () => { try { win.webContents.send('fb:perms', perms.list({ host: settings.mode === 'host' })) } catch {} })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  Menu.setApplicationMenu(appMenu())
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
  startSse(); refreshTray(); startUsagePoll()
  return hostRun
}
function newPairing() { if (!hostRun) return null; pairing = hostRun.gateway.openPairing(); refreshTray(); return pairing }
async function chooseRootAndStart() {
  const r = await dialog.showOpenDialog({ title: '에이전트와 함께 일할 루트 폴더 (예: PARA)', properties: ['openDirectory', 'createDirectory'], buttonLabel: '이 폴더를 루트로' })
  if (r.canceled || !r.filePaths[0]) return
  try { await startHostMode(r.filePaths[0]); if (!settings.loginItem) { settings.loginItem = true; save(); app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true }) } showWin(); loadHome() }
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
    if (!/^https?:/i.test(url)) return
    let mine = false
    try { mine = new URL(url).origin === new URL(wc.getURL() || 'http://x.invalid').origin } catch {}
    if (mine) return
    e.preventDefault(); shell.openExternal(url)
  })
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
  if (id === 'notify') { hide(); navigate('#notify=1'); return }
  if (id === 'pairing') { copyPair(pairing && Date.now() < pairing.expiresAt ? pairing : newPairing()); hide(); return }
  if (id === 'pairing-new') { copyPair(newPairing()); hide(); return }
  if (id === 'copy-addr') { const urls = hostRun ? hostRun.urls.filter((u) => !u.includes('127.0.0.1')) : []; clipboard.writeText(urls[0] || settings.hostUrl); new Notification({ title: 'Folder Bot', body: urls[0] ? `${urls[0]} 복사됨 (같은 Tailscale)` : 'Tailscale 주소가 아직 없어요 — Tailscale 을 켜세요' }).show(); hide(); return }
  if (id === 'change-root') { hide(); hostRun?.stop(); hostRun = null; void chooseRootAndStart(); return }
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
  // 🔴 **메뉴바에도 게이지가 보여야 한다** (2026-09-13 Dave) — 숫자만 있으면 «62%» 가 무엇의 62% 인지
  //    열어 봐야 안다. 다섯 칸 막대는 폭이 일정해서 메뉴바가 들썩이지 않는다.
  //    ⚠ 확인 대기가 있으면 그게 이긴다 — 지금 사람을 기다리는 일이 잔량보다 급하다.
  tray.setTitle(waiting ? String(waiting) : usage ? `${gauge(usage.left, 5)} ${usage.left}%` : '', { fontType: 'monospacedDigit' })
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
  createWin(); startSse(); startUsagePoll()
  app.setLoginItemSettings({ openAtLogin: !!settings.loginItem, openAsHidden: true })
  app.on('activate', showWin)
  // 자기 업데이트 — 호스트 모드에선 세션이 전부 유휴일 때만 적용한다
  const busyCount = () => { let b = 0; for (const st of states.values()) if (st === 'running' || st === 'awaiting_input') b++; return b }
  updater.start({ isHost: () => settings.mode === 'host', isBusy: () => busyCount() > 0, busyCount, onChange: () => { pushTrayState(); try { win?.webContents.send('fb:update', updater.state()) } catch {} } })
})
app.on('window-all-closed', () => { /* 메뉴바에 남는다 */ })
app.on('before-quit', () => { try { hostRun?.stop() } catch {} })
