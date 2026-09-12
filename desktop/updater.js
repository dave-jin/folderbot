// Folder Bot 자기 업데이트 — 이 리포(dave-jin/rondo, 공개)의 desktop-v<n> 릴리스를 받아 제자리 교체한다. 토큰 불필요.
// · 받는 것은 묻지 않고, 적용만 묻는다 (부팅 15초 뒤 + 6시간마다 확인 → 조용히 다운로드 → 다 받으면 확인창 하나)
// · 호스트 모드(미니)에선 진행 중 세션이 있으면 기다렸다가 전부 유휴가 되는 순간 자동 적용한다 — 세션을 죽이지 않는다
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
const REPO = 'dave-jin/rondo'
const CHECK_EVERY = 6 * 60 * 60 * 1000
const dir = () => join(app.getPath('userData'), 'updates')

let staged = null      // { version, zip, notes }
let checking = false, downloading = null, timer = null, deferTimer = null
let hooks = { isBusy: () => false, busyCount: () => 0, isHost: () => false, onChange: () => {}, log: (m) => console.log('[update]', m) }
let lastCheck = 0, lastError = '', deferred = false
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
  const zip = join(dir(), `FolderBot-${l.version}-arm64.zip`)
  downloading = (async () => {
    if (!(existsSync(zip) && statSync(zip).size === l.size)) {
      hooks.log(`v${l.version} 받는 중 (${(l.size / 1048576).toFixed(0)}MB)`)
      const tmp = zip + '.part'
      await get(l.zipUrl, { file: tmp, onProgress: (g, t) => { staged = { ...(staged || {}), progress: t ? g / t : 0 }; hooks.onChange() } })
      if (l.size && statSync(tmp).size !== l.size) { unlinkSync(tmp); throw new Error('크기가 달라요 (받다가 끊김)') }
      if (l.shaUrl) { const s = await get(l.shaUrl); const want = String(s.body || '').trim().split(/\s+/)[0]; const have = await sha256(tmp); if (want && want !== have) { unlinkSync(tmp); throw new Error('체크섬 불일치') } }
      require('node:fs').renameSync(tmp, zip)
    }
    for (const f of readdirSync(dir())) if (f !== basename(zip) && f !== 'apply.sh') { try { unlinkSync(join(dir(), f)) } catch {} }
    staged = { version: l.version, zip, notes: l.notes, progress: 1 }
    hooks.onChange(); hooks.log(`v${l.version} 준비됨 → ${zip}`)
  })()
  try { await downloading } finally { downloading = null }
}

/** 다 받은 뒤: 클라이언트 모드면 확인창, 호스트 모드면 세션이 끝날 때까지 기다렸다 자동 적용 */
function offer() {
  if (!staged?.zip) return
  if (hooks.isHost()) {
    if (hooks.isBusy()) { deferred = true; hooks.onChange(); hooks.log('세션 진행 중 — 전부 유휴가 되면 자동 적용'); scheduleDeferred(); return }
    hooks.log('호스트 모드 · 세션 없음 → 바로 적용'); apply(); return
  }
  const show = async () => {
    const r = await dialog.showMessageBox({ type: 'info', buttons: ['지금 재시작해서 적용', '나중에'], defaultId: 0, cancelId: 1, title: 'Folder Bot 업데이트', message: `v${staged.version} 을 받아 두었어요 (지금 v${app.getVersion()})`, detail: (staged.notes || '').split('\n').slice(0, 6).join('\n') })
    if (r.response === 0) apply()
  }
  void show()
}
function scheduleDeferred() {
  clearInterval(deferTimer)
  deferTimer = setInterval(() => { if (!staged?.zip) return clearInterval(deferTimer); if (!hooks.isBusy()) { clearInterval(deferTimer); hooks.log('세션 전부 유휴 → 적용'); apply() } }, 60 * 1000)
}

/** 앱 번들 경로 — /Applications/Folder Bot.app */
function bundlePath() { const p = process.execPath; const i = p.indexOf('.app/Contents/MacOS/'); return i > 0 ? p.slice(0, i + 4) : null }

/** 종료 → 분리된 스크립트가 zip 을 풀어 번들을 교체하고 다시 연다 */
function apply() {
  if (!staged?.zip) return false
  const target = bundlePath()
  if (!target || target.startsWith('/Volumes/') || process.platform !== 'darwin') {
    new Notification({ title: 'Folder Bot', body: '앱이 /Applications 에 설치돼 있지 않아 자동 교체를 못 해요 — 받아 둔 zip 을 열어 드릴게요' }).show()
    shell.showItemInFolder(staged.zip); return false
  }
  const work = join(dir(), 'unpack')
  const script = join(dir(), 'apply.sh')
  writeFileSync(script, `#!/bin/bash
# Folder Bot 업데이트 적용 — 앱이 완전히 끝난 뒤 실행된다
PID=$1; ZIP="$2"; TARGET="$3"; WORK="$4"
for i in $(seq 1 120); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
rm -rf "$WORK"; mkdir -p "$WORK"
/usr/bin/ditto -x -k --noqtn "$ZIP" "$WORK" || exit 1
NEW=$(find "$WORK" -maxdepth 2 -name "*.app" -print -quit)
[ -n "$NEW" ] || exit 1
rm -rf "$TARGET.old"; mv "$TARGET" "$TARGET.old" 2>/dev/null
/usr/bin/ditto --noqtn "$NEW" "$TARGET" || { mv "$TARGET.old" "$TARGET"; exit 1; }
rm -rf "$TARGET.old" "$WORK"
echo "applied $(date)" > "$(dirname "$ZIP")/applied.txt"
/usr/bin/open -a "$TARGET"
`)
  chmodSync(script, 0o755)
  hooks.log(`적용 → ${target}`)
  const child = spawn('/bin/bash', [script, String(process.pid), staged.zip, target, work], { detached: true, stdio: 'ignore' })
  child.unref()
  setTimeout(() => app.quit(), 300)
  return true
}

function start(h) {
  hooks = { ...hooks, ...h }
  if (process.platform !== 'darwin') return
  setTimeout(() => void check(), 15 * 1000)
  timer = setInterval(() => void check(), CHECK_EVERY)
}
function state() { return { current: app.getVersion(), staged: staged ? { version: staged.version, ready: !!staged.zip, progress: staged.progress ?? 0, notes: staged.notes || '' } : null, downloading: !!downloading, checking, lastCheck, lastError, deferred: deferred && !!staged?.zip, busy: hooks.busyCount(), host: hooks.isHost() } }

module.exports = { start, check, apply, state, offer }
