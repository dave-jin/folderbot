const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('folderbotDesktop', {
  version: process.env.FOLDERBOT_DESKTOP_VERSION || '',
  // 맥 메뉴바가 보낸 명령 — 같은 일을 하는 문이 둘이어도 동작은 화면 한 곳에 있다
  onCmd: (cb) => { const f = (_e, c) => cb(c); ipcRenderer.on('fb:cmd', f); return () => ipcRenderer.removeListener('fb:cmd', f) },
  changeHost: () => ipcRenderer.send('fb:change-host'),
  hostMode: () => ipcRenderer.send('fb:host-mode'),
  hostAvailable: () => ipcRenderer.invoke('fb:host-available'),
  tokenChanged: (token) => ipcRenderer.send('fb:token', token),
  // 문서 → PDF (루프 9/10) — 화면이 인쇄용 사본을 body 에 세운 뒤 부른다. 저장 자리는 사람이 고른다
  savePdf: (name) => ipcRenderer.invoke('fb:pdf', name),
  // 권한 관문 — 첫 실행·업데이트 뒤 화면이 쓴다
  perms: {
    list: () => ipcRenderer.invoke('fb:perm-list'),
    open: (id) => ipcRenderer.invoke('fb:perm-open', id),
    ack: (id, ok) => ipcRenderer.invoke('fb:perm-ack', id, ok),
    reset: () => ipcRenderer.invoke('fb:perm-reset'),
    test: () => ipcRenderer.invoke('fb:perm-test'),
    relaunch: () => ipcRenderer.send('fb:perm-relaunch'),
    onChange: (cb) => { const f = (_e, items) => cb(items); ipcRenderer.on('fb:perms', f); return () => ipcRenderer.removeListener('fb:perms', f) }
  },
  // 자기 업데이트 — 화면의 버전 칩이 쓴다
  update: {
    state: () => ipcRenderer.invoke('fb:update-state'),
    check: () => ipcRenderer.invoke('fb:update-check'),
    apply: () => ipcRenderer.send('fb:update-apply'),
    onChange: (cb) => { const f = (_e, st) => cb(st); ipcRenderer.on('fb:update', f); return () => ipcRenderer.removeListener('fb:update', f) }
  }
})
// 웹 클라이언트가 토큰을 저장하면 셸이 알아채도록 (localStorage 감시)
window.addEventListener('storage', (e) => { if (e.key === 'folderbot:token') ipcRenderer.send('fb:token', e.newValue || '') })
window.addEventListener('load', () => { try { ipcRenderer.send('fb:token', localStorage.getItem('folderbot:token') || '') } catch {} })
