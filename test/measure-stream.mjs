// O · 스트리밍 중 화면 흔들림 계측 — 10fps 로 메시지 영역을 찍어 프레임 사이 세로 이동(행 밝기 프로파일의 최소 차이 이동량)을 잰다
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7395, base = `http://127.0.0.1:${PORT}`
await new Promise((res) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', res) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => (await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })

/** 행 평균 밝기 프로파일 */
const profile = (png) => { const out = new Float32Array(png.height); for (let y = 0; y < png.height; y++) { let s = 0; for (let x = 0; x < png.width; x++) { const i = (y * png.width + x) * 4; s += png.data[i] * 0.299 + png.data[i + 1] * 0.587 + png.data[i + 2] * 0.114 } out[y] = s / png.width } return out }
/** b 가 a 에 견줘 얼마나 세로로 움직였나 — 차이가 가장 작은 이동량(px). 양수 = 내용이 아래로 */
const shift = (a, b, max = 80) => { let best = 0, bestD = Infinity; const n = a.length; for (let d = -max; d <= max; d++) { let s = 0, c = 0; for (let y = Math.max(0, d); y < Math.min(n, n + d); y++) { s += Math.abs(b[y] - a[y - d]); c++ } const m = s / c; if (m < bestD - 1e-6) { bestD = m; best = d } } return { d: best, err: bestD } }

async function run(label, vp, mobile) {
  const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: 1, ...(mobile ? { hasTouch: true, isMobile: true } : {}), ...(process.argv[3] === 'video' ? { recordVideo: { dir: 'test/tmp/o-video', size: vp } } : {}) }); const pg = await ctx.newPage()
  await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
  const sid = (await api(`/bots/${bot.id}/sessions`, { name: 'o-' + label })).id
  for (let i = 0; i < 3; i++) await api(`/sessions/${sid}/send`, { text: '되읊어: 앞선 답 ' + i + ' ' + '내용 '.repeat(60) })
  await wait(600); await pg.goto(base + `/#bot=${bot.id}&s=${sid}`); await pg.waitForSelector('.composer .cin'); await wait(600)
  await pg.evaluate(() => { const sc = document.querySelector('.chat-scroll'); sc.scrollTop = sc.scrollHeight })
  const clip = await pg.evaluate(() => { const sc = document.querySelector('.chat-scroll').getBoundingClientRect(); const foot = document.querySelector('.chat-foot').getBoundingClientRect(); return { x: Math.round(sc.left), y: Math.round(sc.top), width: Math.round(sc.width), height: Math.round(Math.min(sc.bottom, foot.top) - sc.top) } })
  await pg.evaluate(() => { const sc = document.querySelector('.chat-scroll'); window.__steps = []; window.__big = []; let prev = sc.scrollTop, psh = sc.scrollHeight, pch = sc.clientHeight; const f = () => { const d = sc.scrollTop - prev; if (d !== 0) window.__steps.push(Math.round(d * 10) / 10); if (Math.abs(d) > 10) window.__big.push({ d: Math.round(d), sh: psh + '→' + sc.scrollHeight, ch: pch + '→' + sc.clientHeight, streaming: !!document.querySelector('.md.streaming'), live: !!document.querySelector('.live'), qhdr: !!document.querySelector('.qhdr'), t: Math.round(performance.now()) }); prev = sc.scrollTop; psh = sc.scrollHeight; pch = sc.clientHeight; requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await api(`/sessions/${sid}/send`, { text: '마크다운스트리밍' })
  const frames = []; const t0 = Date.now(); let prevProf = null; const deltas = []; const meta = []
  while (Date.now() - t0 < 8000) {
    const buf = await pg.screenshot({ clip, type: 'png' }); const png = PNG.sync.read(buf); const prof = profile(png)
    const m = await pg.evaluate(() => { const sc = document.querySelector('.chat-scroll'); const live = document.querySelector('.live'); const md = document.querySelector('.amsg:last-of-type .md'); return { newc: !!document.querySelector('.tobot.newc'), dist: Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight), ch: sc.clientHeight, st: Math.round(sc.scrollTop), sh: sc.scrollHeight, liveH: live ? Math.round(live.getBoundingClientRect().height) : null, mdH: md ? Math.round(md.getBoundingClientRect().height) : null, streaming: !!document.querySelector('.md.streaming'), overflow: md ? md.scrollWidth > md.clientWidth + 1 : false, gap: live && live.previousElementSibling ? Math.round(live.getBoundingClientRect().top - live.previousElementSibling.getBoundingClientRect().bottom) : null } })
    if (prevProf) deltas.push(shift(prevProf, prof).d); prevProf = prof; meta.push(m); frames.push(png)
    const el = Date.now() - t0; const next = Math.ceil(el / 100) * 100; if (next - el > 0) await wait(next - el)
  }
  // 왕복(±2~8px 가 바로 다음 프레임에 반대로) · 점프(|d| > 12)
  let flips = 0, jumps = 0, maxAbs = 0; for (let i = 0; i < deltas.length; i++) { const d = deltas[i]; maxAbs = Math.max(maxAbs, Math.abs(d)); if (Math.abs(d) > 12) jumps++; if (i > 0 && Math.abs(d) >= 2 && Math.abs(d) <= 8 && Math.sign(d) === -Math.sign(deltas[i - 1]) && Math.abs(deltas[i - 1]) >= 2 && Math.abs(deltas[i - 1]) <= 8) flips++ }
  const overflowFrames = meta.filter((m) => m.overflow).length; const streamingFrames = meta.filter((m) => m.streaming).length
  const gaps = meta.filter((m) => m.gap !== null).map((m) => m.gap); const liveHs = new Set(meta.map((m) => m.liveH).filter((x) => x !== null))
  // 끝났을 때 재배치 — 스트리밍 마지막 프레임 vs 끝난 뒤 mdH
  const lastStream = [...meta].reverse().find((m) => m.streaming); const final = meta[meta.length - 1]
  const relayout = lastStream && final ? Math.abs((final.mdH ?? 0) - (lastStream.mdH ?? 0)) : null
  const steps = await pg.evaluate(() => window.__steps); console.log('BIG', label, JSON.stringify(await pg.evaluate(() => window.__big))); const maxStep = steps.length ? Math.max(...steps.map((x) => Math.abs(x))) : 0
  const res = { label, maxStepPerAnimFrame: maxStep, stepsOver10: steps.filter((x) => Math.abs(x) > 10).length, bigSteps: steps.filter((x) => Math.abs(x) > 10).join(','), nSteps: steps.length, frames: frames.length, streamingFrames, flips, jumps, maxAbs, deltas: deltas.join(','), overflowFrames, gapMin: Math.min(...gaps), gapMax: Math.max(...gaps), liveHeights: [...liveHs], relayoutPx: relayout, viewportPct: relayout !== null ? +((relayout / vp.height) * 100).toFixed(1) : null }
  console.log(JSON.stringify(res)); console.log('META', JSON.stringify(meta.filter((_, i) => i % 5 === 0).map((m) => [m.st, m.sh, m.ch, m.dist, m.newc, m.streaming])))
  // 프레임 시트 (8열)
  const cols = 8, rows = Math.ceil(frames.length / cols), fw = frames[0].width, fh = frames[0].height, sheet = new PNG({ width: cols * fw, height: rows * fh })
  frames.forEach((f, i) => { const ox = (i % cols) * fw, oy = Math.floor(i / cols) * fh; for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const si = (y * fw + x) * 4, di = ((oy + y) * sheet.width + ox + x) * 4; sheet.data[di] = f.data[si]; sheet.data[di + 1] = f.data[si + 1]; sheet.data[di + 2] = f.data[si + 2]; sheet.data[di + 3] = 255 } })
  writeFileSync(`test/tmp/o-sheet-${label}.png`, PNG.sync.write(sheet))
  const vid = pg.video(); await pg.close(); await ctx.close(); if (vid) { const { renameSync } = await import('node:fs'); const vp2 = await vid.path(); try { renameSync(vp2, `test/tmp/o-${label}-${process.argv[2] || 'x'}.webm`) } catch {} } return res
}
const out = { phone: await run('phone', { width: 390, height: 844 }, true), desktop: await run('desktop', { width: 1440, height: 900 }, false) }
writeFileSync(`test/tmp/o-measure-${process.argv[2] || 'before'}.json`, JSON.stringify(out, null, 1))
await br.close(); host.kill()
