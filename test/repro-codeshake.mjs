// BM-3 · 스트리밍 중 코드블록이 흔들린다 — 프레임마다 «머리 없는 코드블록» 과 «말풍선 높이가 줄어든 순간» 을 센다
// 쓰기: node test/repro-codeshake.mjs   (npm run build 뒤)
import { existsSync as __ex } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const PW_CHROMIUM = process.env.PW_CHROMIUM || (__ex('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7398, base = `http://127.0.0.1:${PORT}`
await new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', (c) => (c === 0 ? res() : rej(new Error('init')))) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => (await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })
let bad = 0
try {
  for (const [label, vp, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1440, height: 900 }, false]]) {
    const sid = (await api(`/bots/${bot.id}/sessions`, { name: 'cs-' + label })).id
    const pg = await br.newPage({ viewport: vp, deviceScaleFactor: 1, ...(mobile ? { hasTouch: true, isMobile: true } : {}) })
    await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
    await pg.goto(base + `/#bot=${bot.id}&s=${sid}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(500)
    // 매 프레임(그리기 직전)마다 잰다: 머리 없는 <pre> · 스트리밍 말풍선 높이
    await pg.evaluate(() => {
      const w = window; w.__bare = 0; w.__shrink = []; w.__frames = 0; let prevH = 0; let prevEl = null
      const f = () => {
        const md = document.querySelector('.md.streaming')
        if (md) {
          w.__frames++
          if ([...md.querySelectorAll('pre')].some((p) => !p.parentElement?.classList.contains('cbwrap'))) w.__bare++
          const h = md.getBoundingClientRect().height
          if (md === prevEl && h < prevH - 0.5) w.__shrink.push(Math.round(prevH - h))
          prevH = h; prevEl = md
        }
        requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    })
    await api(`/sessions/${sid}/send`, { text: '마크다운스트리밍' })
    await pg.waitForSelector('.md.streaming', { timeout: 5000 })
    for (let i = 0; i < 60 && (await pg.$('.md.streaming')); i++) await wait(200)
    const r = await pg.evaluate(() => ({ frames: window.__frames, bare: window.__bare, shrink: window.__shrink }))
    const ok = r.bare === 0 && r.shrink.length === 0
    if (!ok) bad++
    console.log(`${ok ? '✓' : '✗'} ${label} — 스트리밍 프레임 ${r.frames} · 머리 없는 코드블록 ${r.bare}프레임 · 높이가 줄어든 순간 ${r.shrink.length}번 ${r.shrink.length ? JSON.stringify(r.shrink.slice(0, 12)) : ''}`)
    await pg.close()
  }
} finally { await br.close(); host.kill() }
process.exit(bad ? 1 : 0)
