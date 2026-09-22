/**
 * 🔴 **맥에서 복사가 되는지 그 맥이 직접 재는 검사** (2026-09-21 Dave 실기기 보고 «다 안되는거 같아» → 2026-09-22 새 API 로 다시 씀).
 *
 *   cd <folderbot 리포> && node test/mac-copy-check.mjs        (`npm run qa:mac` 이 이걸 부른다)
 *
 * 앱을 안 건드린다(설치된 Folder Bot 을 띄우지 않고, 끝나면 클립보드의 글을 되돌린다). exit 0 = 그림·파일 둘 다 ✅.
 *
 * 무엇을 재나 — 셸(`desktop/main.js`)이 쓰는 **바로 그 길**을 같은 순서로 밟는다 (`desktop/clip-core.js` 머리말이 근거):
 *   ① 그림   `ClipboardItem({'image/png': Blob})` → `read()` 되읽어 image/png·PNG·TIFF 가 있나
 *   ② 파일   `ClipboardItem({'text/uri-list': …})` (한글 이름·폴더·여러 개) → `NSFilenamesPboardType` plist 에 셋 다 있나 + `«class furl»`
 *   ③ 폴백   `osascript set the clipboard to POSIX file "…"` (하나) → furl 이 올라가나
 *   ④ 참고   `osascript … {POSIX file …}` (목록) → 'list' 형식만 올라간다 = Finder 가 못 읽는 옛 길. 안 되는 게 정상이다
 * 🔴 **절대 안 멈춘다** — Electron 쪽 30초·바깥 45초 타임아웃. 종전 판은 없어진 `availableFormats` 를 부르다 던져서
 *    영원히 안 끝났다(2026-09-22 실사고 — 90초 넘게 매달림).
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
if (process.platform !== 'darwin') { console.log('맥에서만 돌아가는 검사예요 (지금:', process.platform, ')'); process.exit(0) }
const elec = join(repo, 'desktop/node_modules/.bin/electron')
if (!existsSync(elec)) { console.log('Electron 이 없어요 — `cd desktop && npm ci` 를 한 번 해 주세요:', elec); process.exit(1) }

const dir = mkdtempSync(join(tmpdir(), 'fb-copytest-'))
// 진짜 PNG(64×48 · 빨강) — 2×2 짜리 손 PNG 는 nativeImage 가 못 읽었다(실측). pngjs 는 리포 devDependency
const { PNG } = createRequire(join(repo, 'package.json'))('pngjs')
const png = join(dir, '검사용 그림.png')
{ const p = new PNG({ width: 64, height: 48 }); for (let i = 0; i < p.data.length; i += 4) { p.data[i] = 220; p.data[i + 1] = 40; p.data[i + 2] = 60; p.data[i + 3] = 255 } writeFileSync(png, PNG.sync.write(p)) }
const f1 = join(dir, '검사용 파일.txt'); writeFileSync(f1, '복사 검사\n')
const f2 = join(dir, 'second.md'); writeFileSync(f2, '# 2\n')
const f3 = join(dir, '검사용 폴더'); mkdirSync(f3)

const mainJs = join(dir, 'main.js')
writeFileSync(mainJs, `
const { app, clipboard, nativeImage, ClipboardItem } = require('electron')
const { execFile } = require('node:child_process')
const cc = require(${JSON.stringify(join(repo, 'desktop/clip-core.js'))})
const PNG = ${JSON.stringify(png)}, F = ${JSON.stringify([f1, f2, f3])}
const osa = (s) => new Promise((res) => execFile('/usr/bin/osascript', ['-e', s], { timeout: 8000 }, (e, so, se) => res({ ok: !e, out: String(so || '').trim(), err: e ? String(se || e.message).trim().slice(0, 200) : '' })))
const q = (p) => String(p).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"')
const types = async () => { for (let i = 0; i < 3; i++) { try { const t = (await clipboard.read()).flatMap((x) => x.types); if (t.length) return t } catch {} await new Promise((r) => setTimeout(r, 100)) } return [] }   /* 셸의 clipTypes 와 같은 재시도 */
// 🔴 clipboard.clear() 는 약속을 먼저 풀고 실제 비우기가 뒤에 올 때가 있다(실측 4회 중 1회) — 바깥 osascript 가 쓴 것을 뒤늦게 지운다.
//    그래서 비운 뒤엔 «비어 있는 게 보일 때까지» 기다린다. 셸 코드에는 폴백 앞에 clear 가 없어 이 경쟁이 없다.
const cleared = async () => { await clipboard.clear(); for (let i = 0; i < 20; i++) { let n = 1; try { n = (await clipboard.read()).flatMap((x) => x.types).length } catch {} if (!n) break; await new Promise((r) => setTimeout(r, 50)) } await new Promise((r) => setTimeout(r, 150)) }
const furl = async () => { const r = await osa('POSIX path of (the clipboard as «class furl»)'); return r.ok ? r.out : '' }
app.disableHardwareAcceleration()
setTimeout(() => { console.log('@@RESULT@@' + JSON.stringify({ timeout: true })); app.exit(2) }, 30000)
app.whenReady().then(async () => {
  const out = { electron: process.versions.electron, mac: process.getSystemVersion ? process.getSystemVersion() : '' }
  let savedText = ''; try { savedText = await clipboard.readText() } catch {}
  try {
    // ① 그림
    const img = nativeImage.createFromPath(PNG); out.imgRead = img.isEmpty() ? null : img.getSize()
    if (!img.isEmpty()) { await clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })]); const t = await types(); out.imgOk = cc.hasImage(t); out.imgTypes = cc.shortTypes(t) }
    // ② 파일 목록
    await cleared()
    await clipboard.write([new ClipboardItem({ 'text/uri-list': cc.uriList(F) })])
    const t2 = await types(); out.fileOk = cc.hasFile(t2); out.fileTypes = cc.shortTypes(t2); out.fileFurl = await furl()
    try { const [item] = await clipboard.read(); const b = await item.getType('electron application/osclipboard;format="NSFilenamesPboardType"'); const plist = await b.text(); const nfc = plist.normalize('NFC'); out.fileAll = F.every((p) => nfc.includes(p.normalize('NFC')))   /* plist 는 NFD 로 온다 */ } catch (e) { out.fileAll = false; out.fileAllErr = e.message }
    // ③ 폴백 · osascript 하나
    await cleared()
    const o1 = await osa('set the clipboard to POSIX file "' + q(F[0]) + '"'); const t3 = await types(); out.osaOneOk = o1.ok && cc.hasFile(t3); out.osaOneErr = o1.err; out.osaOneTypes = cc.shortTypes(t3); out.osaOneFurl = await furl()
    // ④ 참고 · osascript 목록 — 안 되는 게 정상(옛 길)
    await cleared()
    const o2 = await osa('set the clipboard to {POSIX file "' + q(F[0]) + '"}'); const t4 = await types(); out.osaListHasFile = o2.ok && cc.hasFile(t4); out.osaListTypes = cc.shortTypes(t4)
  } catch (e) { out.error = String(e && e.stack || e) }
  // 되돌리기 — 검사 전에 글이 있었으면 그 글로, 없었으면 비운다
  try { if (savedText) await clipboard.writeText(savedText); else await clipboard.clear() } catch {}
  console.log('@@RESULT@@' + JSON.stringify(out))
  app.exit(0)
})
`)

const p = spawn(elec, [mainJs], { env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let buf = '', err = ''
p.stdout.on('data', (d) => { buf += d })
p.stderr.on('data', (d) => { err += d })
const killer = setTimeout(() => { try { p.kill('SIGKILL') } catch {} }, 45000)
p.on('exit', (code) => {
  clearTimeout(killer)
  const m = /@@RESULT@@(.*)/.exec(buf)
  rmSync(dir, { recursive: true, force: true })
  if (!m) { console.log('검사를 못 마쳤어요 (exit', code, ')\n', (err || buf).slice(0, 1200)); process.exit(1) }
  const r = JSON.parse(m[1])
  if (r.timeout) { console.log('검사가 30초 안에 안 끝났어요 — Electron 안에서 멈췄어요'); process.exit(1) }
  const yn = (v) => (v ? '✅' : '❌')
  let ver = ''
  try { ver = execFileSync('/usr/bin/defaults', ['read', '/Applications/Folder Bot.app/Contents/Info', 'CFBundleShortVersionString'], { encoding: 'utf8' }).trim() } catch { ver = '(설치된 앱을 못 찾음)' }
  const lines = [
    '── Folder Bot 복사 검사 (Electron 44 · 새 clipboard API) ──',
    `설치된 Folder Bot ${ver} · Electron ${r.electron} · macOS ${r.mac}`,
    `① 그림 읽기            ${r.imgRead ? `✅ ${r.imgRead.width}x${r.imgRead.height}` : '❌ 못 읽음'}`,
    `① 그림 올리고 되읽기   ${yn(r.imgOk)}  [${(r.imgTypes || []).join(', ') || '없음'}]`,
    `② 파일 목록(uri-list)  ${yn(r.fileOk)}  [${(r.fileTypes || []).join(', ') || '없음'}]`,
    `②   furl 되읽기        ${r.fileFurl ? `✅ ${r.fileFurl}` : '❌ 없음'}`,
    `②   셋 다 plist 에     ${yn(r.fileAll)}${r.fileAllErr ? ` · ${r.fileAllErr}` : ''}  (한글 이름 · 폴더 · 여러 개)`,
    `③ 폴백 osascript 하나  ${yn(r.osaOneOk)}${r.osaOneErr ? ` · ${r.osaOneErr}` : ''}${r.osaOneFurl ? ` · ${r.osaOneFurl}` : ''}  [${(r.osaOneTypes || []).join(', ') || '없음'}]`,
    `④ 참고 osascript 목록  ${r.osaListHasFile ? '파일 형식 있음(뜻밖)' : '파일 형식 없음 — 옛 길이 안 되는 이유'}  [${(r.osaListTypes || []).join(', ') || '없음'}]`,
    r.error ? `⚠ 오류: ${r.error}` : '',
    '',
    r.imgOk && r.fileOk && r.fileAll ? '판정: ✅ 그림·파일 모두 클립보드에 올라가요 — 이제 앱에서 눌러 메모·Finder·카톡에 ⌘V 해 보세요.' : '판정: ❌ 위에서 ❌ 인 단계가 원인이에요. 이 글을 그대로 보내 주세요.'
  ].filter((l) => l !== '')
  console.log(lines.join('\n'))
  process.exit(r.imgOk && r.fileOk && r.fileAll ? 0 : 1)
})
