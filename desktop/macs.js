/**
 * 여러 맥 — 맥 목록 순수 함수 (2026-11-19 · 첫 외부 고객: «늘 켜 둔 맥 여러 대를 Tailscale 로 오가고 싶다»).
 *
 * 맥 앱 하나가 여러 호스트(맥)를 기억한다. 줄 하나 = 맥 하나. 토큰은 여기 없다(`tokenStore.js`).
 * 🔴 맥이 한 대뿐인 사용자의 화면은 바뀌지 않는다 — 이름 붙이기(창 제목·알림 제목)는 **2대 이상일 때만**.
 * ⚠ 모든 함수는 입력을 바꾸지 않고 새 값을 돌려준다. 셸(`main.js`)이 저장한다.
 * 설계 볼트 `2. Area/제품_FolderBot/01_기획/2026-11-19_기획_여러-맥-오가기.md`
 */
const LOCAL_ID = 'local'
const OFFLINE_ALERT_MS = 300000

function normUrl(url) {
  let u = String(url || '').trim()
  if (!u) return ''
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'http://' + u
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/i.exec(u)
  if (!m) return u.replace(/\/+$/, '')
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${m[3]}`.replace(/\/+$/, '')
}
const row = (id, url, extra) => ({ id, url, name: '', lastSeen: 0, lastHash: '', openMode: 'download', vaultLocal: '', ...extra })

function migrate(old, newId) {
  if (Array.isArray(old.macs)) return { macs: old.macs, activeMac: String(old.activeMac || (old.macs[0] && old.macs[0].id) || '') }
  const url = normUrl(old.hostUrl)
  if (!url) return { macs: [], activeMac: '' }
  const keep = { openMode: old.openMode || '', vaultLocal: old.vaultLocal || '' }
  if (old.mode === 'host') return { macs: [row(LOCAL_ID, url, { ...keep, local: true })], activeMac: LOCAL_ID }
  const id = newId()
  const out = { macs: [row(id, url, keep)], activeMac: id }
  if (old.token) out.moveToken = { id, token: String(old.token) }
  return out
}

function addMac(macs, url, newId) {
  const u = normUrl(url)
  const hit = macs.find((m) => normUrl(m.url) === u)
  if (hit) return { macs, mac: hit, existed: true }
  const mac = row(newId(), u)
  return { macs: [...macs, mac], mac, existed: false }
}
const removeMac = (macs, id) => (id === LOCAL_ID ? macs : macs.filter((m) => m.id !== id))
const setSeen = (macs, id, patch) => macs.map((m) => (m.id === id ? { ...m, ...patch } : m))
const findDuplicate = (macs, id, name, version) => macs.find((m) => m.id !== id && !!name && m.name === name && m.version === version) || null
const ordered = (macs) => [...macs.filter((m) => m.id === LOCAL_ID), ...macs.filter((m) => m.id !== LOCAL_ID)]

/** 이름이 겹치면 주소의 첫 마디(IP 면 IP 전체)를 괄호로 붙인다 */
function hostTag(url) {
  const h = (/^[a-z]+:\/\/([^/:?#]+)/i.exec(url) || [])[1] || ''
  return /^\d+\.\d+\.\d+\.\d+$/.test(h) ? h : h.split('.')[0]
}
function displayName(macs, mac) {
  const name = mac.name || hostTag(mac.url)
  return macs.some((m) => m.id !== mac.id && (m.name || hostTag(m.url)) === name) ? `${name} (${hostTag(mac.url)})` : name
}
const noteTitle = (macs, mac, title) => (macs.length > 1 ? `${displayName(macs, mac)} · ${title}` : title)
const winTitle = (macs, mac, old) => (macs.length > 1 ? `Folder Bot — ${displayName(macs, mac)}` : 'Folder Bot') + (old ? ' (옛 판 — 맥 메뉴로 바꾸세요)' : '')

function trayMacId(macs, activeId, reachable) {
  if (reachable[activeId]) return activeId
  if (reachable[LOCAL_ID] && macs.some((m) => m.id === LOCAL_ID)) return LOCAL_ID
  const first = ordered(macs).find((m) => reachable[m.id])
  return first ? first.id : activeId
}
const offlineDue = (since, alerted, now) => !alerted && now - since >= OFFLINE_ALERT_MS

module.exports = { LOCAL_ID, OFFLINE_ALERT_MS, normUrl, migrate, addMac, removeMac, setSeen, findDuplicate, ordered, displayName, noteTitle, winTitle, trayMacId, offlineDue }
