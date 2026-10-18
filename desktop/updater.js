// Folder Bot 자기 업데이트 — 이 리포(dave-jin/folderbot, 공개 · 옛 이름 rondo 는 리다이렉트)의 desktop-v<n> 릴리스를 받아 제자리 교체한다. 토큰 불필요.
// · 받는 것은 묻지 않고, 적용은 **묻기만 한다** (2026-09-15 Dave: «자동업데이트 하지말고 다운로드가 끝난뒤에
//   업데이트 여부를 물어보기만 해줘. 좌측하단에 버전메뉴에서 팝업으로»). ⛔ 어느 모드에서도 스스로 적용하지 않는다 —
//   종전의 «호스트는 세션이 전부 유휴가 되면 자동 적용» 은 폐기. 다 받으면 화면(버전 칩)이 팝업으로 묻고, 누르는 건 사람이다.
// · ad-hoc 서명이라 Squirrel/electron-updater 는 못 쓴다. 교체는 앱이 완전히 종료된 뒤 분리된 셸 스크립트가 한다.
//   Gatekeeper 의 방아쇠는 서명이 아니라 검역 딱지(quarantine)이므로 `ditto --noqtn` 으로 떼고 복사한다.
// · 버전은 태그(desktop-v7)가 아니라 zip 이름(Folder.Bot-0.2.7-arm64-mac.zip)에 있다 — 판정은 update-pick.js(순수, vitest).
const { app, dialog, Notification, shell } = require('electron')
const https = require('node:https')
const { createWriteStream, existsSync, mkdirSync, statSync, readdirSync, unlinkSync, writeFileSync, chmodSync, createReadStream } = require('node:fs')
const { join, dirname, basename } = require('node:path')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')

const { pickLatest } = require('./update-pick')
const { applyScript } = require('./apply-script')
const { nextDawn, dawnStep } = require('./dawn')
const REPO = 'dave-jin/folderbot'
const CHECK_EVERY = 30 * 60 * 1000
const FOCUS_EVERY = 10 * 60 * 1000
const dir = () => join(app.getPath('userData'), 'updates')

let staged = null      // { version, zip, notes }
let checking = false, downloading = null, timer = null, deferTimer = null
let hooks = { isBusy: () => false, busyCount: () => 0, isHost: () => false, port: () => 7373, routineSoon: () => false, onChange: () => {}, log: (m) => console.log('[update]', m) }
/**
 * BX · «새벽 4시에 적용» 예약 (2026-10-19 Dave «A»). 사람이 팝업에서 누른 것만 건다 — 자동 적용은 여전히 없다(9/15).
 * `{ at, setAt, note }` — 파일(`updates/dawn.json`)에 남겨 앱이 다시 떠도 예약이 산다. 30초마다 시각을 본다
 * (setTimeout 하나로 걸면 맥이 잠든 동안 시계가 멈춰 늦게 깬다).
 */
let dawn = null, dawnTick = null
let lastCheck = 0, lastError = '', deferred = false, lastFocusCheck = 0
/** userData/updates/log.txt — 왜 안 됐는지 나중에 볼 수 있게 */
function flog(m) { try { mkdirSync(dir(), { recursive: true }); require('node:fs').appendFileSync(join(dir(), 'log.txt'), `${new Date().toISOString()} ${m}\n`) } catch {} }
function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'folderbot-desktop', accept: 'application/vnd.github+json', ...(opts.headers || {}) } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve(get(res.headers.location, opts)) }
      if (opts.file) {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)) }
        const total = Number(res.headers['content-length'] || 0); let got = 0
        const out = createWriteStream(opts.file)
        res.on('data', (c) => { got += c.length; opts.onProgress?.(got, total) })
        res.pipe(out); out.on('finish', () => resolve({ status: 200, size: got })); out.on('error', reject); res.on('error', reject)
        return
      }
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => (s += d)); res.on('end', () => resolve({ status: res.statusCode, body: s })); res.on('error', reject)
    })
    req.on('error', reject); req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
}
function sha256(file) { return new Promise((resolve, reject) => { const h = createHash('sha256'); createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject) }) }

/** 최신 릴리스 조회 — 현재보다 새 버전이 있으면 {version, zipUrl, shaUrl, size, notes} */
async function latest() {
  const r = await get(`https://api.github.com/repos/${REPO}/releases?per_page=30`)
  // 404 = 리포가 비공개(또는 이름이 바뀜) — GitHub 은 비공개 리포를 익명에게 404 로 숨긴다. 앱에는 토큰이 없다
  if (r.status === 404) throw new Error(`releases HTTP 404 — ${REPO} 가 비공개라 앱이 못 봅니다 (리포를 공개로 바꾸거나 릴리스 전용 공개 리포 필요)`)
  if (r.status !== 200) throw new Error(`releases HTTP ${r.status}`)
  return pickLatest(JSON.parse(r.body), app.getVersion())
}

async function check(manual = false) {
  if (checking) return staged
  checking = true; lastError = ''; hooks.onChange()
  try {
    const l = await latest()
    lastCheck = Date.now()
    if (!l || !l.newer) { if (manual) new Notification({ title: 'Folder Bot', body: `최신 버전이에요 (v${app.getVersion()})` }).show(); hooks.onChange(); return null }
    if (staged?.version === l.version) { if (manual) offer(); return staged }
    // BX · 새벽 예약이 걸린 판이 있으면 그 판을 지킨다 — 사람이 고른 것은 그 판이다. 더 새 판은 적용한 뒤(다시 뜬 앱이) 받는다.
    //    다시 뜬 직후(staged 없음)에는 받아 둔 그 zip 을 다시 세운다 — 새 판을 받으면 옛 zip 이 지워져 예약이 엉뚱한 판으로 넘어간다
    if (dawn?.version && (!staged || staged.version === dawn.version)) {
      const z = zipOf(dawn.version)
      if (existsSync(z)) {
        if (!staged) { staged = { version: dawn.version, zip: z, notes: dawn.notes || '', progress: 1 }; hooks.onChange() }
        hooks.log(`새벽 적용 예약(v${dawn.version}) 중 — v${l.version} 은 적용 뒤에 받아요`)
        return staged
      }
    }
    await download(l)
    offer()
    return staged
  } catch (e) {
    lastError = e.message; hooks.log(`확인 실패: ${e.message}`)
    if (manual) new Notification({ title: 'Folder Bot', body: `업데이트 확인 실패 — ${e.message}` }).show()
    return null
  } finally { checking = false; hooks.onChange() }
}

async function download(l) {
  if (downloading) return downloading
  mkdirSync(dir(), { recursive: true })
  const zip = zipOf(l.version)
  downloading = (async () => {
    if (!(existsSync(zip) && statSync(zip).size === l.size)) {
      hooks.log(`v${l.version} 받는 중 (${(l.size / 1048576).toFixed(0)}MB)`)
      const tmp = zip + '.part'
      await get(l.zipUrl, { file: tmp, onProgress: (g, t) => { staged = { ...(staged || {}), progress: t ? g / t : 0 }; hooks.onChange() } })
      if (l.size && statSync(tmp).size !== l.size) { unlinkSync(tmp); throw new Error('크기가 달라요 (받다가 끊김)') }
      if (l.shaUrl) { const s = await get(l.shaUrl); const want = String(s.body || '').trim().split(/\s+/)[0]; const have = await sha256(tmp); if (want && want !== have) { unlinkSync(tmp); throw new Error('체크섬 불일치') } }
      require('node:fs').renameSync(tmp, zip)
    }
    // ⚠ 예약(dawn.json)·기록(log.txt)은 남긴다 — 다시 뜬 앱이 같은 zip 을 «다시 받은» 순간 예약이 지워졌다(2026-10-19 검토)
    for (const f of readdirSync(dir())) if (f !== basename(zip) && !['apply.sh', 'dawn.json', 'log.txt'].includes(f)) { try { unlinkSync(join(dir(), f)) } catch {} }
    staged = { version: l.version, zip, notes: l.notes, progress: 1 }
    hooks.onChange(); hooks.log(`v${l.version} 준비됨 → ${zip}`)
  })()
  try { await downloading } finally { downloading = null }
}

/**
 * 다 받은 뒤 — 🔴 **묻기만 한다, 어느 모드에서도.** 화면의 버전 칩이 팝업을 띄우고(`onChange`), 누르는 건 사람이다.
 * ⛔ 종전에는 호스트 모드에서 «세션이 전부 유휴가 되는 순간 자동 적용» 했다 — 2026-09-15 Dave 지시로 폐기.
 *    자동 적용은 사람이 보고 있지 않을 때 앱을 갈아끼우는 것이고, 그 순간 돌던 것이 무엇이었는지 사람은 모른다.
 * ⚠ 창이 닫혀 있으면 팝업을 볼 수 없으니 시스템 알림 하나만 남긴다 — 열면 칩이 다시 묻는다.
 */
function offer() {
  if (!staged?.zip) return
  deferred = false; clearInterval(deferTimer)
  hooks.onChange(); hooks.log(`v${staged.version} 준비됨 — 버전 칩에서 물어본다`)
  try { new Notification({ title: 'Folder Bot 업데이트', body: `v${staged.version} 을 받아 두었어요 — 왼쪽 아래 버전 칩에서 적용할지 정하세요` }).show() } catch {}
}

const dawnFile = () => join(dir(), 'dawn.json')
const zipOf = (v) => join(dir(), `FolderBot-${v}-arm64.zip`)
function saveDawn() { try { if (dawn) { mkdirSync(dir(), { recursive: true }); writeFileSync(dawnFile(), JSON.stringify(dawn)) } else if (existsSync(dawnFile())) unlinkSync(dawnFile()) } catch (e) { hooks.log(`새벽 예약을 못 적었어요: ${e.message}`) } }
/** 걸기(on) · 풀기(off). 받아 둔 판이 없으면 걸 것이 없다 */
function setDawn(on) {
  if (!on) { if (dawn) hooks.log('새벽 적용 예약 취소'); dawn = null; saveDawn(); hooks.onChange(); return state() }
  if (!staged?.zip) return state()
  dawn = { at: nextDawn(Date.now()), setAt: Date.now(), note: '', version: staged.version, notes: staged.notes || '' }
  saveDawn(); hooks.log(`새벽 적용 예약 → ${new Date(dawn.at).toLocaleString()} · v${staged.version}`); hooks.onChange()
  return state()
}
/** 예약 시각이 됐나 — 세션이 돌거나 30분 안 루틴이 있으면 30분씩 미룬다(5시 넘으면 다음 날 · desktop/dawn.js) */
function dawnCheck() {
  if (!dawn || Date.now() < dawn.at) return
  // 막 켜져 아직 받은 판을 다시 못 찾았다(check 전) — 다음 번에 본다. 확인을 마쳤는데도 없으면 접는다
  if (!staged?.zip) { if (!lastCheck || checking || downloading) return; hooks.log('새벽 적용: 받아 둔 판이 없어 예약을 접었어요'); dawn = null; saveDawn(); hooks.onChange(); return }
  // 사람이 고른 판이 아니면 적용하지 않는다 — 예약을 풀고 다시 묻는다(9/15 · 결정은 사람이)
  if (dawn.version && staged.version !== dawn.version) { hooks.log(`새벽 적용: 예약한 v${dawn.version} 이 아니라 v${staged.version} 이 있어 예약을 풀고 다시 물어요`); dawn = null; saveDawn(); offer(); return }
  const step = dawnStep(Date.now(), { busy: hooks.busyCount(), routineSoon: hooks.routineSoon(), at: dawn.at })
  if (step.act === 'wait') { dawn = { ...dawn, at: step.at, note: step.why }; saveDawn(); hooks.log(`새벽 적용 미룸 · ${step.why} → ${new Date(step.at).toLocaleString()}`); hooks.onChange(); return }
  hooks.log(`새벽 적용 → v${staged.version}`)
  apply()
}

/** 앱 번들 경로 — /Applications/Folder Bot.app */
function bundlePath() { const p = process.execPath; const i = p.indexOf('.app/Contents/MacOS/'); return i > 0 ? p.slice(0, i + 4) : null }

/** 종료 → 분리된 스크립트가 zip 을 풀어 번들을 교체하고 다시 연다 */
function apply() {
  if (!staged?.zip) return false
  if (dawn) { dawn = null; saveDawn() }   // 지금 적용했으면(사람이든 새벽이든) 예약은 끝났다
  const target = bundlePath()
  if (!target || target.startsWith('/Volumes/') || process.platform !== 'darwin') {
    new Notification({ title: 'Folder Bot', body: '앱이 /Applications 에 설치돼 있지 않아 자동 교체를 못 해요 — 받아 둔 zip 을 열어 드릴게요' }).show()
    shell.showItemInFolder(staged.zip); return false
  }
  const work = join(dir(), 'unpack')
  const script = join(dir(), 'apply.sh')
  writeFileSync(script, applyScript())   // BX · 새 판이 /api/health 에 안 답하면 옛 판으로 되돌린다(apply-script.js)
  chmodSync(script, 0o755)
  hooks.log(`적용 → ${target}`)
  const health = hooks.isHost() ? `http://127.0.0.1:${hooks.port()}/api/health` : ''   // 원격 화면 모드는 이 맥에 호스트가 없다 — 되돌리기 판정 없이 연다
  const child = spawn('/bin/bash', [script, String(process.pid), staged.zip, target, work, health], { detached: true, stdio: 'ignore' })
  child.unref()
  setTimeout(() => app.quit(), 300)
  return true
}

function start(h) {
  hooks = { ...hooks, ...h }
  const log0 = hooks.log; hooks.log = (m) => { flog(m); log0(m) }
  if (process.platform !== 'darwin') return
  hooks.log(`시작 v${app.getVersion()} · ${bundlePath() || '(번들 아님)'}`)
  // BX · 지난 적용이 되돌려졌으면 알린다(새 판이 켜지지 않아 옛 판으로 돌아왔다) — 한 번 읽고 지운다
  try { const f = join(dir(), 'applied.txt'); if (existsSync(f)) { const t = require('node:fs').readFileSync(f, 'utf8').trim(); if (/^rolled back|^failed/.test(t)) { lastError = `지난 업데이트가 켜지지 않아 옛 판으로 되돌렸어요 · ${t}`; hooks.log(lastError) } unlinkSync(f) } } catch {}
  setTimeout(() => void check(), 15 * 1000)
  timer = setInterval(() => void check(), CHECK_EVERY)
  // BX · 지난 실행에 건 새벽 예약 — 받은 판은 check 가 다시 찾는다(같은 zip 이면 내려받지 않는다)
  try { if (existsSync(dawnFile())) { const j = JSON.parse(require('node:fs').readFileSync(dawnFile(), 'utf8')); if (Number.isFinite(j.at)) { dawn = { at: j.at, setAt: j.setAt || 0, note: j.note || '', version: j.version || '', notes: j.notes || '' }; hooks.log(`새벽 적용 예약 이어 받음 → ${new Date(dawn.at).toLocaleString()}`) } } } catch {}
  dawnTick = setInterval(dawnCheck, 30 * 1000)
}
/** 창을 띄우거나 트레이를 누를 때 — 10분에 한 번만 */
function checkOnFocus() { if (Date.now() - lastFocusCheck < FOCUS_EVERY) return; lastFocusCheck = Date.now(); void check() }
function state() { return { current: app.getVersion(), staged: staged ? { version: staged.version, ready: !!staged.zip, progress: staged.progress ?? 0, notes: staged.notes || '' } : null, downloading: !!downloading, checking, lastCheck, lastError, deferred: deferred && !!staged?.zip, busy: hooks.busyCount(), host: hooks.isHost(), dawn: dawn ? { at: dawn.at, note: dawn.note || '', version: dawn.version || '' } : null } }

module.exports = { start, check, apply, state, offer, checkOnFocus, dawn: setDawn }
