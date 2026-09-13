// 메뉴바 패널(`tray.html`) 전용 다리. ⛔ 본 창의 preload 를 쓰지 않는다 — 이 창이 할 수 있는 일은
// «상태 받기 · 항목 누르기 · 높이 알리기» 셋뿐이어야 한다(패널은 호스트에서 받아 온 페이지다).
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('fbTray', {
  on: (f) => { ipcRenderer.on('fb:tray-state', (_e, s) => f(s)); ipcRenderer.send('fb:tray-ready') },
  act: (id) => ipcRenderer.send('fb:tray-act', String(id)),
  size: (h) => ipcRenderer.send('fb:tray-size', Math.ceil(Number(h) || 0))
})
