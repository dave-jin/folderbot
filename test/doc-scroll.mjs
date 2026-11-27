// 문서마다 읽던 자리 (DW · 2026-11-27 Dave: «보고 있는 문서의 줄 위치까지 기억해서 다시 돌아왔을때 같은 영역이 보여졌으면»)
// ① 데스크톱: 긴 md 를 중간까지 내리고 → 다른 문서 탭 → 다시 돌아오면 맨 위 줄이 같은가 ② 앱을 다시 열어도(새로 고침) 같은가
// ③ 원문(yml · textarea)도 같은 자리인가 ④ 폰(390 · 한 장): 폴더에서 다른 문서를 열었다가 돌아와도 같은가. 실패면 exit 1.
// 고치기 전 판에서는 ①②④ 가 «줄 1» 로, ③ 이 0px 로 빨개지는 것을 확인했다. `npm run qa` 끝에서 돈다.
import { existsSync as __ex } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const PW_CHROMIUM = process.env.PW_CHROMIUM || (__ex('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo/files', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
// 줄마다 글이 달라야 «같은 곳» 을 글로 잰다 — 20줄마다 제목, 사이에 빈 줄
const long = (tag) => { const out = [`# ${tag} 문서`, '']; for (let i = 1; i <= 260; i++) { if (i % 20 === 0) out.push(`## ${tag} 절 ${i / 20}`, ''); out.push(`${tag} 줄 ${i} — 읽던 자리를 기억하는지 보는 글입니다.`, '') } return out.join('\n') }
writeFileSync(join(root, '3. Area/제품_Rondo/files/가.md'), long('가'))
writeFileSync(join(root, '3. Area/제품_Rondo/files/나.md'), long('나'))
writeFileSync(join(root, '3. Area/제품_Rondo/files/다.yml'), Array.from({ length: 400 }, (_, i) => `다 원문 ${i + 1}`).join('\n'))
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7471, base = `http://127.0.0.1:${PORT}`
await new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', (c) => (c === 0 ? res() : rej(new Error('init')))) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env }); process.on('exit', () => host.kill())   // 브라우저가 못 떠도 호스트를 남기지 않는다
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => { const r = await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json() }
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const sess = await api(`/bots/${bot.id}/sessions`, { name: 'g' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })

/** 파일 목록에서 연다 — `files` 폴더가 접혀 있으면 먼저 편다 */
const open = async (pg, re) => {
  if (!(await pg.evaluate(() => [...document.querySelectorAll('.trow')].some((e) => /가\.md/.test(e.textContent))))) { await pg.evaluate(() => [...document.querySelectorAll('.trow.dir')].find((e) => /^files/.test(e.textContent.trim()))?.click()); await wait(600) }
  await pg.evaluate((s) => [...document.querySelectorAll('.trow')].find((e) => new RegExp(s).test(e.textContent))?.click(), re); await wait(1200)
}
/** 편집기 칸 맨 위에 보이는 줄의 글 */
const topLine = (pg) => pg.evaluate(() => { const sc = document.querySelector('.mded .cm-scroller'); if (!sc) return null; const t = sc.getBoundingClientRect().top; const l = [...sc.querySelectorAll('.cm-line')].find((e) => e.getBoundingClientRect().bottom > t + 2 && e.textContent.trim()); return l ? l.textContent.trim() : null })
/** «가 줄 150» 이 맨 위에 오게 내린다 */
const scrollTo = async (pg, text) => {
  for (let i = 0; i < 6; i++) {
    await pg.evaluate((s) => { const sc = document.querySelector('.mded .cm-scroller'); const v = window.__fbEditor; const n = v.state.doc.toString().split('\n').findIndex((x) => x.startsWith(s)) + 1; const b = v.lineBlockAt(v.state.doc.line(n).from); sc.scrollTop = b.top + (v.documentTop - sc.getBoundingClientRect().top + sc.scrollTop) }, text)
    await wait(250)
  }
  await wait(600)
  return topLine(pg)
}
const same = (a, b) => !!a && !!b && a === b
const out = {}; let ok = true
try {
  // ── 데스크톱 ──
  const pg = await br.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
  await pg.goto(base + `/#bot=${bot.id}&s=${sess.id}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(400)
  await api(`/sessions/${sess.id}/send`, { text: '되읊어: 준비' }); await wait(1000)
  await open(pg, '가\\.md')
  const want = await scrollTo(pg, '가 줄 150')
  await open(pg, '나\\.md'); const other = await topLine(pg)
  await pg.evaluate(() => [...document.querySelectorAll('.doc .tabs .tab')].find((e) => /가\.md/.test(e.textContent))?.click()); await wait(1200)
  const back = await topLine(pg)
  out.tab = { want, other, back, ok: same(want, back) && /가 줄 1[45]\d/.test(want ?? '') && /^나 문서$/.test(other ?? '') }
  await pg.reload(); await pg.waitForSelector('.mded .cm-scroller', { timeout: 15000 }); await wait(1500)
  const reload = await topLine(pg)
  out.reload = { want, reload, ok: same(want, reload) }
  // 원문
  await open(pg, '다\\.yml')
await pg.evaluate(() => { const ta = document.querySelector('.dbody.edit textarea'); ta.scrollTop = 1500 }); await wait(700)
  const ty = await pg.evaluate(() => document.querySelector('.dbody.edit textarea')?.scrollTop ?? -1)
  await pg.evaluate(() => [...document.querySelectorAll('.doc .tabs .tab')].find((e) => /나\.md/.test(e.textContent))?.click()); await wait(900)
  await pg.evaluate(() => [...document.querySelectorAll('.doc .tabs .tab')].find((e) => /다\.yml/.test(e.textContent))?.click()); await wait(1200)
  const tyBack = await pg.evaluate(() => document.querySelector('.dbody.edit textarea')?.scrollTop ?? -1)
  out.raw = { ty, tyBack, ok: ty > 1000 && Math.abs(ty - tyBack) <= 2 }
  await pg.close()

  // ── 폰 (390 · 한 장 · 폴더 탭에서 연다) ──
  const ph = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
  await ph.goto(base + `/#bot=${bot.id}`); await ph.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(600)
  const phOpen = async (re) => { await ph.click('.tabbar [data-tab="files"]'); await wait(700); await open(ph, re) }
  await phOpen('나\\.md')
  const pWant = await scrollTo(ph, '나 줄 90')
  await phOpen('가\\.md'); const pOther = await topLine(ph)
  await phOpen('나\\.md'); const pBack = await topLine(ph)
  out.phone = { pWant, pOther, pBack, ok: same(pWant, pBack) && /나 줄 [89]\d/.test(pWant ?? '') && pOther !== pWant }
  await ph.close()

  ok = out.tab.ok && out.reload.ok && out.raw.ok && out.phone.ok
  out.ok = ok
  console.log(JSON.stringify(out, null, 1))
} catch (e) { console.error('ERR', e, JSON.stringify(out)); ok = false } finally { await br.close(); host.kill() }
process.exit(ok ? 0 : 1)
