// 권한 — 한곳에서 재고, 한곳에서 안내한다 (알파 Rondo main/Permissions.ts 승계).
// 원칙 ① 판정은 물어보는 게 아니라 해 보는 것(전체 디스크 접근은 보호 폴더를 실제로 열어 본다)
//      ② 앱은 권한을 스스로 켤 수 없다 — 할 수 있는 건 상태를 재고, 정확한 설정 창을 여는 것뿐.
// ⚠ 업데이트하면 전체 디스크 접근이 풀린다(ad-hoc 서명이라 빌드마다 cdhash 가 바뀜) — 그래서 부팅마다 다시 잰다.
//   알림 권한은 번들 ID 에 묶여 재서명에도 살아남으므로 사용자 대답(perm-ack.json)을 지우지 않는다.
'use strict'
const { app, Notification, shell } = require('electron')
const { closeSync, openSync, readFileSync, readdirSync, writeFileSync, mkdirSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { fdaVerdict, permsSatisfied } = require('./perm-core')

// 어느 맥에나 있고, 전체 디스크 접근으로만 열리는 자리. 내용은 읽지도 보관하지도 않는다 — 목록만 훑고 닫는다.
const FDA_PROBES = [
  join(homedir(), 'Library', 'Safari'),
  join(homedir(), 'Library', 'Application Support', 'com.apple.sharedfilelist'),
  join(homedir(), 'Library', 'Messages'),
  join(homedir(), 'Library', 'Application Support', 'com.apple.TCC', 'TCC.db')
]
function probeCode(p) {
  try { readdirSync(p); return null } catch (e) { const c = e.code || 'UNKNOWN'; if (c !== 'ENOTDIR') return c }
  try { closeSync(openSync(p, 'r')); return null } catch (e) { return e.code || 'UNKNOWN' }
}
function fullDiskStatus() { if (process.platform !== 'darwin') return 'granted'; return fdaVerdict(FDA_PROBES.map(probeCode)) }

const ackFile = () => join(app.getPath('userData'), 'perm-ack.json')
function readAck() { try { return JSON.parse(readFileSync(ackFile(), 'utf8')) } catch { return {} } }
function setAck(id, ok) { try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(ackFile(), JSON.stringify({ ...readAck(), [id]: ok }, null, 2)) } catch {} }
function resetAcks() { try { writeFileSync(ackFile(), '{}') } catch {} }

// Electron 은 알림 권한 상태를 알려 주지 않는다 — 한 발 쏘고 «보였나요?» 를 묻는다. 그 대답만 기억한다.
function sendTest() {
  if (!Notification.isSupported()) return { ok: false }
  try { new Notification({ title: 'Folder Bot', body: '알림이 켜져 있어요 — 봇이 확인을 기다리거나 일을 끝내면 이렇게 알려 드릴게요.', silent: false }).show(); return { ok: true } } catch { return { ok: false } }
}

// 알림 설정 URL 은 macOS 13 에서 바뀌었다 — 새 것부터, 안 열리면 옛 것
const PANE = {
  'full-disk': ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'],
  notifications: ['x-apple.systempreferences:com.apple.Notifications-Settings.extension', 'x-apple.systempreferences:com.apple.preference.notifications']
}
async function openPane(id) { for (const u of PANE[id] || []) { try { await shell.openExternal(u); return { ok: true } } catch {} } return { ok: false } }

/**
 * 지금 이 순간의 권한 현황. 순서가 곧 화면 순서 — 막는 것(필수)을 먼저.
 * - 전체 디스크 접근: 이 맥이 호스트(파일을 직접 다룸)일 때만 필수. 원격 화면은 파일이 호스트에 있다.
 * - 알림: 어느 모드든 필수 — «자리를 비워도 된다» 를 만드는 축이다.
 * ⚠ 개발 실행(패키징 아님)에서는 막지 않는다 — TCC 가 보는 주체가 Electron.app 이라 QA 가 온보딩에서 멈춘다.
 */
function list(opts) {
  const gate = app.isPackaged; const ack = readAck(); const host = !!(opts && opts.host)
  return [
    { id: 'full-disk', required: gate && host, probeable: true, status: fullDiskStatus() },
    { id: 'notifications', required: gate, probeable: false, status: ack.notifications === true ? 'granted' : ack.notifications === false ? 'missing' : 'unknown' }
  ]
}
function satisfied(opts) { return permsSatisfied(list(opts)) }
// macOS 는 이미 뜬 프로세스에 전체 디스크 접근을 소급 적용하지 않는다 — 켰는데도 꺼짐이면 다시 시작이 답이다
function relaunch() { app.relaunch(); app.exit(0) }
module.exports = { list, satisfied, setAck, resetAcks, sendTest, openPane, relaunch, fullDiskStatus }
