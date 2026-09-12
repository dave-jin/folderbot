const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('folderbotDesktop', {
  version: process.env.FOLDERBOT_DESKTOP_VERSION || '',
  changeHost: () => ipcRenderer.send('fb:change-host'),
  hostMode: () => ipcRenderer.send('fb:host-mode'),
  hostAvailable: () => ipcRenderer.invoke('fb:host-available'),
  tokenChanged: (token) => ipcRenderer.send('fb:token', token),
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
