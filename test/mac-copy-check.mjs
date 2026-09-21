/**
 * 🔴 **맥에서 복사가 되는지 그 맥이 직접 재는 검사** (2026-09-21 · Dave 실기기 보고 «다 안되는거 같아»).
 *
 * 개발 컨테이너(리눅스)에는 맥 클립보드가 없다 — 그래서 **맥에서 한 줄 실행**해 결과를 글로 받는다.
 *   cd <folderbot 리포> && node test/mac-copy-check.mjs
 * 앱을 안 건드린다(설치된 Folder Bot 을 띄우지도, 클립보드를 영구히 더럽히지도 않는다 — 끝나고 되돌린다).
 *
 * 무엇을 재나 — 셸(`desktop/main.js`)이 쓰는 **바로 그 두 길**을 같은 순서로 밟는다:
 *   ① 그림: `nativeImage.createFromPath` → `clipboard.writeImage` → `readImage()` 되읽기
 *   ②-a 파일: `osascript`(POSIX file) → `availableFormats()` 되읽기   ← v126 이 먼저 쓰는 길
 *   ②-b 파일: `clipboard.writeBuffer('NSFilenamesPboardType')` → 되읽기  ← 옛 길(v125 까지)
 * 결과의 ✅/❌ 조합이 «어느 단계에서 막혔나» 를 그대로 말해 준다.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
if (process.platform !== 'darwin') { console.log('맥에서만 돌아가는 검사예요 (지금:', process.platform, ')'); process.exit(0) }
const elec = join(repo, 'desktop/node_modules/.bin/electron')
if (!existsSync(elec)) { console.log('Electron 이 없어요 — `cd desktop && npm i` 를 한 번 해 주세요:', elec); process.exit(1) }

const dir = mkdtempSync(join(tmpdir(), 'fb-copytest-'))
const png = join(dir, '검사용 그림.png')
// 2x2 PNG (투명 배경) — 실제 파일이어야 nativeImage 가 읽는다
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64'))
const txt = join(dir, '검사용 파일.txt')
writeFileSync(txt, '복사 검사\n')

const mainJs = join(dir, 'main.js')
writeFileSync(mainJs, `
const { app, clipboard, nativeImage } = require('electron')
const { execFile } = require('node:child_process')
const PNG = ${JSON.stringify(png)}, TXT = ${JSON.stringify(txt)}
const osa = (s) => new Promise((res) => execFile('/usr/bin/osascript', ['-e', s], { timeout: 8000 }, (e, so, se) => res({ ok: !e, err: e ? String(se || e.message).trim() : '' })))
const q = (p) => String(p).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const out = { electron: process.versions.electron, mac: process.getSystemVersion ? process.getSystemVersion() : '' }
  const before = clipboard.availableFormats(); out.before = before
  // ① 그림
  const img = nativeImage.createFromPath(PNG)
  out.imgRead = img.isEmpty() ? null : img.getSize()
  if (!img.isEmpty()) { clipboard.writeImage(img); out.imgWriteBack = !clipboard.readImage().isEmpty(); out.imgFormats = clipboard.availableFormats() }
  // ①-b 그림 · osascript 길
  const oi = await osa('set the clipboard to (read (POSIX file "' + q(PNG) + '") as «class PNGf»)')
  out.imgOsa = oi.ok; out.imgOsaErr = oi.err; out.imgOsaBack = !clipboard.readImage().isEmpty()
  // ②-a 파일 · osascript 길 (v126 이 먼저 쓰는 길)
  const of = await osa('set the clipboard to {POSIX file "' + q(TXT) + '"}')
  out.fileOsa = of.ok; out.fileOsaErr = of.err; out.fileOsaFormats = clipboard.availableFormats()
  // ②-b 파일 · 옛 길 (v125 까지)
  const plist = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array><string>' + TXT + '</string></array></plist>'
  clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist, 'utf8'))
  out.oldFormats = clipboard.availableFormats()
  console.log('@@RESULT@@' + JSON.stringify(out))
  app.quit()
})
`)

const args = [mainJs]
const p = spawn(elec, args, { env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let buf = '', err = ''
p.stdout.on('data', (d) => { buf += d })
p.stderr.on('data', (d) => { err += d })
p.on('exit', (code) => {
  const m = /@@RESULT@@(.*)/.exec(buf)
  if (!m) { console.log('검사를 못 마쳤어요 (exit', code, ')\n', (err || buf).slice(0, 1200)); rmSync(dir, { recursive: true, force: true }); process.exit(1) }
  const r = JSON.parse(m[1])
  const yn = (v) => (v ? '✅' : '❌')
  let ver = ''
  try { ver = execFileSync('/usr/bin/defaults', ['read', '/Applications/Folder Bot.app/Contents/Info', 'CFBundleShortVersionString'], { encoding: 'utf8' }).trim() } catch { ver = '(설치된 앱을 못 찾음)' }
  const lines = [
    '── Folder Bot 복사 검사 ──',
    `설치된 Folder Bot ${ver} · Electron ${r.electron} · macOS ${r.mac}`,
    `그림 읽기          ${r.imgRead ? `✅ ${r.imgRead.width}x${r.imgRead.height}` : '❌ 못 읽음'}`,
    `그림 writeImage    ${yn(r.imgWriteBack)}  (되읽기)`,
    `그림 osascript     ${yn(r.imgOsa && r.imgOsaBack)}${r.imgOsaErr ? ` · ${r.imgOsaErr}` : ''}`,
    `파일 osascript     ${yn(r.fileOsa)}${r.fileOsaErr ? ` · ${r.fileOsaErr}` : ''}`,
    `  → 형식          [${(r.fileOsaFormats || []).join(', ') || '없음'}]`,
    `파일 옛 길(버퍼)   → 형식 [${(r.oldFormats || []).join(', ') || '없음'}]`,
    '',
    '이 글을 그대로 보내 주세요.'
  ]
  console.log(lines.join('\n'))
  rmSync(dir, { recursive: true, force: true })
})
