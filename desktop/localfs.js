// 이 기기의 파일 — 원격에서 «Finder 에서 보기 · 열기» 를 그 기기에서 하려고 (E · 2026-09-19 Dave 1안 확정).
// 원리: Dropbox·iCloud 는 폴더 구조를 그대로 옮기므로 **이 기기의 볼트 루트 + 볼트 기준 상대 경로** 가 같은 파일이다.
// 🔴 판정에 필요한 것은 전부 여기서 «재고», 화면은 결과만 그린다. electron 은 안 부른다(유닛테스트가 그대로 돈다).
'use strict'
const { existsSync, statSync, readdirSync, realpathSync, openSync, readSync, closeSync, mkdirSync, writeFileSync, watch, writeSync, renameSync, unlinkSync, rmSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { join, dirname, basename } = require('node:path')
const { homedir } = require('node:os')
const { execFile } = require('node:child_process')

/** 호스트 루트의 꼬리 1~3조각 — `…/CloudStorage/Dropbox/PARA` → `PARA` · `Dropbox/PARA` · `CloudStorage/Dropbox/PARA` */
function tails(hostRoot) { const p = String(hostRoot).split('/').filter(Boolean); const out = []; for (let n = 1; n <= 3 && n <= p.length; n++) out.push(p.slice(p.length - n).join('/')); return out }
/** 표준 동기화 자리 — `~/Library/CloudStorage/Dropbox*`(있는 것만) · 옛 `~/Dropbox` · iCloud Drive */
function syncRoots(home, entries) { return [...entries.filter((e) => /^Dropbox/.test(e)).map((e) => join(home, 'Library/CloudStorage', e)), join(home, 'Dropbox'), join(home, 'Library/Mobile Documents/com~apple~CloudDocs')] }
/** 파일 수 — 깊이 3 · 2000개에서 끊는다(순위만 매기면 된다) · 점 폴더는 안 센다 */
function countFiles(dir, depth = 3, budget = { n: 0 }) {
  if (depth < 0 || budget.n >= 2000) return budget.n
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return budget.n }
  for (const e of ents) { if (e.name.startsWith('.')) continue; if (e.isDirectory()) countFiles(join(dir, e.name), depth - 1, budget); else budget.n++; if (budget.n >= 2000) break }
  return budget.n
}
/**
 * 후보 순위 — 🔴 **같은 실체(realpath)는 하나로 합치고(정본 자리를 남긴다), 파일 수가 많은 쪽이 먼저.**
 * `~/Dropbox` 는 `~/Library/CloudStorage/Dropbox` 의 심링크이고, `Dropbox-Cbsjin/…/PARA` 는 **껍데기 폴더**라
 * 파일이 거의 없다 — 이름이 같다고 1순위에 올리면 안 된다(Dave 실측 환경). 껍데기는 `shell: true` 로 표시한다.
 */
function rank(found) {
  const byReal = new Map()
  // «정본 자리» = 자기 자신이 실체인 후보. `canon` 이 있으면 그것을(홈이 심링크 아래일 때 — 아래 detect), 없으면 path===real 로
  const isCanon = (f) => (typeof f.canon === 'boolean' ? f.canon : f.path === f.real)
  for (const f of found) { const cur = byReal.get(f.real); if (!cur || (isCanon(f) && !isCanon(cur)) || (!isCanon(cur) && f.path.length < cur.path.length)) byReal.set(f.real, f) }
  const max = Math.max(0, ...[...byReal.values()].map((f) => f.files))
  return [...byReal.values()].sort((a, b) => b.files - a.files || a.path.length - b.path.length).map((f) => ({ ...f, shell: f.files === 0 || (max > 0 && f.files * 10 < max) }))
}
/** 이 기기에서 호스트 볼트의 사본 후보 — 표준 자리 × 꼬리 */
function detect(hostRoot, home = homedir()) {
  let entries = []; try { entries = readdirSync(join(home, 'Library/CloudStorage')) } catch {}
  const found = []
  /**
   * 🔴 홈 자체가 심링크 아래면(맥의 `tmpdir()` = `/var/…` → `/private/var/…`) **어느 후보도 `path === real` 이 아니다** —
   *    그러면 «짧은 경로» 규칙이 `~/Dropbox/PARA`(별칭)를 정본으로 올린다(2026-09-22 맥에서 유닛이 거짓 빨강). 그래서
   *    홈만 실체로 바꾼 경로(`canon`)와 실체를 비교한다 — 홈 아래 심링크만 «별칭» 이다.
   */
  let realHome = home; try { realHome = realpathSync(home) } catch {}
  const tryDir = (p) => { try { if (!statSync(p).isDirectory()) return } catch { return } let real = p; try { real = realpathSync(p) } catch {} const canon = real === (p.startsWith(home) ? join(realHome, p.slice(home.length)) : p); found.push({ path: p, real, canon, files: countFiles(p) }) }
  for (const root of syncRoots(home, entries)) {
    // 팀 Dropbox 는 한 단계 아래(`Dropbox-회사/이름/PARA`)에 있기도 하다 — 직계 자식 폴더까지만 본다
    let kids = []; try { kids = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => join(root, e.name)) } catch {}
    for (const base of [root, ...kids]) for (const t of tails(hostRoot)) tryDir(join(base, t))
  }
  return rank(found)
}
/** 앞 64KB 의 sha256 — 호스트의 `stat` 과 같은 식이어야 한다(host/files.ts `headHash`) */
function headHash(path) {
  const fd = openSync(path, 'r'); try { const buf = Buffer.alloc(65536); const n = readSync(fd, buf, 0, 65536, 0); return createHash('sha256').update(buf.subarray(0, n)).digest('hex') } finally { closeSync(fd) }
}
function placeholderName(path) { return join(dirname(path), `.${basename(path)}.icloud`) }
/** 이 기기의 파일 상태 — 없으면 iCloud 자리표시자(«클라우드에만»)인지 함께 본다 */
function stat(path) {
  try { const st = statSync(path); if (!st.isFile()) return { exists: false }; return { exists: true, size: st.size, mtime: st.mtimeMs, head: headHash(path) } }
  catch { return { exists: false, placeholder: existsSync(placeholderName(path)) } }
}
/** 호스트와 같아질 때까지 기다린다 — 폴더 감시 + 300ms 폴링, 한도 안에 오면 true */
function waitFor(path, want, timeoutMs = 60000) {
  return new Promise((res) => {
    let done = false; let w = null
    const finish = (v) => { if (done) return; done = true; clearInterval(t); clearTimeout(to); try { w && w.close() } catch {} res(v) }
    const check = () => { const s = stat(path); if (s.exists && s.size === want.size && s.head === want.head) finish(true) }
    const t = setInterval(check, 300); const to = setTimeout(() => finish(false), timeoutMs)
    try { w = watch(dirname(path), { persistent: false }, check) } catch {}
    check()
  })
}
/** ② 내려받기 모드의 캐시 자리 — `<userData>/remote-cache/<호스트>/<rel>` (Dropbox 폴더 밖 · `..` 로 못 올라간다) */
function cachePath(userData, hostName, rel) { const safe = String(hostName).replace(/[\\/:]/g, '_') || 'host'; const parts = String(rel).split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..'); return join(userData, 'remote-cache', safe, ...parts) }
/** 호스트에서 받아 캐시에 둔다 */
async function download(url, headers, dest) {
  const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`받기 실패 ${r.status}`)
  mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return dest
}
/** iCloud «클라우드에만» 파일 내려받기 — 맥의 brctl. 없으면 조용히 실패(기다림이 판정한다) */
function icloudDownload(path) { return new Promise((res) => { if (process.platform !== 'darwin') return res(false); execFile('/usr/bin/brctl', ['download', path], (e) => res(!e)) }) }

/**
 * M-4 · 진행을 알리며 받기 — 조각마다 `onProgress({done,total})`, `signal` 로 취소하면 **부분 파일을 지운다**(반쯤 받은 파일이 캐시에 남으면 «같음» 대조가 속는다).
 * `.part` 로 받다가 다 받으면 제자리로 옮긴다 — 어느 순간 죽어도 목적지에 반쪽이 없다.
 */
async function downloadStream(url, headers, dest, onProgress, signal) {
  const r = await fetch(url, { headers, signal }); if (!r.ok) throw new Error(`받기 실패 ${r.status}`)
  const total = Number(r.headers.get('content-length') || 0)
  mkdirSync(dirname(dest), { recursive: true }); const part = dest + '.part'
  const fh = openSync(part, 'w'); let done = 0
  try {
    const reader = r.body.getReader()
    for (;;) { const { value, done: end } = await reader.read(); if (end) break; writeSync(fh, value); done += value.length; if (onProgress) onProgress({ done, total }) }
    closeSync(fh); renameSync(part, dest); return dest
  } catch (e) { try { closeSync(fh) } catch {} try { unlinkSync(part) } catch {} throw e }
}
/** 캐시 목록 — 지우기 판정(evict)의 입력 */
function cacheEntries(dir) {
  const out = []
  const walk = (d) => { let names = []; try { names = readdirSync(d, { withFileTypes: true }) } catch { return } for (const e of names) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { try { const st = statSync(p); out.push({ path: p, size: st.size, atime: Math.max(st.atimeMs || 0, st.mtimeMs || 0) }) } catch {} } } }
  walk(dir); return out
}
/** 상한을 넘으면 오래 안 쓴 것부터 — core/cache.evictPlan 과 같은 규칙(셸은 TS 를 못 부르므로 여기 한 번 더, 유닛이 둘을 같이 잰다) */
function evictPlan(entries, limit) {
  let total = entries.reduce((a, e) => a + e.size, 0); if (total <= limit) return []
  const out = []; for (const e of [...entries].sort((a, b) => a.atime - b.atime)) { if (total <= limit) break; out.push(e.path); total -= e.size }
  return out
}
function cacheEvict(dir, limit) { const plan = evictPlan(cacheEntries(dir), limit); for (const p of plan) { try { unlinkSync(p) } catch {} } return plan.length }
function cacheInfo(dir) { const e = cacheEntries(dir); return { files: e.length, bytes: e.reduce((a, x) => a + x.size, 0) } }
function cacheClear(dir) { try { rmSync(dir, { recursive: true, force: true }) } catch {} return cacheInfo(dir) }

module.exports = { tails, syncRoots, rank, detect, countFiles, headHash, stat, waitFor, cachePath, download, downloadStream, icloudDownload, placeholderName, cacheEntries, evictPlan, cacheEvict, cacheInfo, cacheClear }
