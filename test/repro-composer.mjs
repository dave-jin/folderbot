// B · 입력창 흔들림 재현 — 조건을 조합해 «이미 친 글자» 의 위치(px)와 픽셀이 키마다 바뀌는지 잰다
import { existsSync as __ex } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 브라우저 — 컨테이너(/opt/pw-browsers)면 그것, 맥이면 Playwright 캐시(~/Library/Caches/ms-playwright · `node node_modules/playwright-core/cli.js install chromium-headless-shell`). PW_CHROMIUM 으로 덮는다
const PW_CHROMIUM = process.env.PW_CHROMIUM || (__ex('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const root = mkdtempSync(join(tmpdir(), 'fb-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-claude-'))
for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
const env = { ...process.env, FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = 7398, base = `http://127.0.0.1:${PORT}`
await new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', 'init', root], { env }); p.on('exit', (c) => (c === 0 ? res() : rej(new Error('init')))) })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p, body) => { const r = await fetch(base + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json() }
for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(250) } }
const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
const { chromium } = await import('playwright-core')
const br = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })
const results = []

/** 첫 5글자의 사각형 + 입력창·컴포저 사각형 */
const probe = (pg) => pg.evaluate(() => {
  const e = document.querySelector('.composer .cin'); const t = [...e.childNodes].find((n) => n.nodeType === 3); if (!t) return null
  const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(5, t.textContent.length)); const b = r.getBoundingClientRect(); const c = e.getBoundingClientRect(); const k = document.querySelector('.composer').getBoundingClientRect()
  return { x: b.x, y: b.y, w: b.width, h: b.height, cinY: c.y, cinH: c.height, compY: k.y, compH: k.height, nodes: e.childNodes.length, val: e.dataset.value }
})
const CLIP = 100
const region = async (pg) => { const r = await pg.$eval('.composer .cin', (e) => { const b = e.getBoundingClientRect(); const t = [...e.childNodes].find((n) => n.nodeType === 3); const rg = document.createRange(); if (t) { rg.selectNodeContents(t) } const tw = t ? rg.getBoundingClientRect().width : 0; return { x: b.x, y: b.y, width: 100, height: b.height, tw } }); if (r.tw < CLIP + 30) return null; delete r.tw; return (await pg.screenshot({ clip: r })).toString('base64') }

async function typeOne(pg, ch, ime) {
  if (!ime) { await pg.keyboard.type(ch); return }
  const cdp = await pg.context().newCDPSession(pg)
  // 한글 조합 흉내 — 자모를 조합 상태로 두 번 바꾼 뒤 완성자를 확정한다
  const jamo = ch === '안' ? ['ㅇ', '아'] : ch === '녕' ? ['ㄴ', '녀'] : ch === '하' ? ['ㅎ', '하'] : ch === '세' ? ['ㅅ', '세'] : ch === '요' ? ['ㅇ', '요'] : [ch]
  await pg.evaluate(() => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })))
  for (const j of jamo) { await cdp.send('Input.imeSetComposition', { text: j, selectionStart: j.length, selectionEnd: j.length }) }
  await cdp.send('Input.insertText', { text: ch })
  await pg.evaluate((d) => document.querySelector('.composer .cin').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: d })), ch)
  await cdp.detach()
}

async function run(name, { width, ime, delay, text, streaming, prefill, noglass }) {
  const pg = await br.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 })
  await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
  await pg.goto(base + `/#bot=${bot.id}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(400)
  await pg.addStyleTag({ content: '.composer .cin { caret-color: transparent !important }' + (noglass ? ' .glassb, .composer { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; background:#1c1c1c !important }' : '') })
  await pg.click('.composer .cin')
  if (prefill) { await pg.keyboard.type(prefill); await wait(200) }
  if (streaming) { await api(`/sessions/${(await api(`/bots/${bot.id}/sessions`))[0]?.id ?? (await api(`/bots/${bot.id}/sessions`, { name: 'x' })).id}/send`, { text: '긴스트리밍' }); await wait(300); await pg.click('.composer .cin') }
  const chars = [...text]
  await typeOne(pg, chars[0], ime); await wait(60)
  let prev = await probe(pg); let prevPix = await region(pg)
  let moved = 0, pix = 0, rebuilt = 0, maxDy = 0, maxDx = 0
  for (const ch of chars.slice(1)) {
    await typeOne(pg, ch, ime); if (delay) await wait(delay)
    const cur = await probe(pg); const curPix = await region(pg)
    if (!cur || !prev) { prev = cur; continue }
    const dx = Math.abs(cur.x - prev.x), dy = Math.abs(cur.y - prev.y)
    const wrapped = cur.cinH !== prev.cinH   // 줄이 늘어난 키는 «높이 변화» 로 따로 센다
    if (!wrapped && (dx > 0.01 || dy > 0.01)) { moved++; maxDx = Math.max(maxDx, dx); maxDy = Math.max(maxDy, dy) }
    if (!wrapped && curPix && prevPix && curPix !== prevPix) pix++
    prev = cur; prevPix = curPix
  }
  const final = await pg.$eval('.composer .cin', (e) => e.dataset.value)
  const row = { name, keys: chars.length - 1, moved, maxDx: +maxDx.toFixed(2), maxDy: +maxDy.toFixed(2), pixelChanges: pix, finalOk: final === (prefill ?? '') + text, final }
  results.push(row); console.log(JSON.stringify(row))
  await pg.close()
}

try {
  await run('영문 · 천천히 · 넓게', { width: 1440, ime: false, delay: 80, text: 'the quick brown fox jumps' })
  await run('영문 · 빠르게 · 넓게', { width: 1440, ime: false, delay: 0, text: 'the quick brown fox jumps over the lazy dog' })
  await run('영문 · 좁게(700)', { width: 700, ime: false, delay: 20, text: 'the quick brown fox jumps over the lazy dog again' })
  await run('한국어 IME 조합 · 넓게', { width: 1440, ime: true, delay: 60, text: '안녕하세요안녕하세요안녕하세요안녕' })
  await run('여러 줄로 넘어가는 순간(좁게)', { width: 700, ime: false, delay: 10, text: 'a'.repeat(30) + ' ' + 'b'.repeat(30) + ' ' + 'c'.repeat(30) + ' ' + 'd'.repeat(30) + ' ' + 'e'.repeat(30) })
  await run('스트리밍 중 타이핑 · 영문', { width: 1440, ime: false, delay: 40, text: 'typing while streaming answer text', streaming: true })
  await run('스트리밍 중 타이핑 · IME', { width: 1440, ime: true, delay: 60, text: '안녕하세요안녕하세요안녕하세요', streaming: true })
  await run('스트리밍 중 타이핑 · 영문 · 유리 끔', { width: 1440, ime: false, delay: 40, text: 'typing while streaming answer text', streaming: true, noglass: true })
  console.log('\nSUMMARY'); for (const r of results) console.log(`${r.moved > 0 || r.pixelChanges > 0 ? '⚠' : '·'} ${r.name}: 이동 ${r.moved}/${r.keys}키 (dx≤${r.maxDx} dy≤${r.maxDy}) · 픽셀변화 ${r.pixelChanges} · 최종글 ${r.finalOk ? '일치' : '불일치 ' + JSON.stringify(r.final)}`)
} catch (e) { console.error('ERR', e) } finally { await br.close(); host.kill() }
