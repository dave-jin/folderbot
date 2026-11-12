/**
 * ═══ 원본 응답의 울타리 — 격리 틀 안의 글이 접속 토큰으로 볼트에 닿지 못한다 (2026-11-12) ═══════════════
 *
 * 문서 창의 html 보기는 봇이 만든 html 을 격리 틀(`sandbox="allow-scripts allow-popups"`)에 넣어 그린다. 그 틀의 주소가
 * `…/raw?rel=…&token=<기기 토큰>` 이라, 틀 안의 스크립트가 **제 주소에서 토큰을 읽을 수 있다**. 고치기 전(v217 까지)에는
 *   ① 그 토큰을 주소에 실어 쓰는 요청(`POST /api/folders?token=…`)을 보내면 통했고(임시 볼트에 폴더가 생겼다),
 *   ② 같은 주소가 맨 위 창으로 열리면(맥 앱은 새 창 요청을 바깥 브라우저로 넘긴다) 호스트와 같은 출처라 API 답까지 읽었다.
 *
 * 🔴 스모크의 호스트는 인증을 끄고(`FOLDERBOT_NO_AUTH`) 돌아 이 길을 못 잰다 — 여기서는 **인증을 켠** 호스트를 따로 띄운다
 *    (임시 볼트 · 임시 설정 · 제 포트). 스모크가 불러 쓰고(`secRaw`), 혼자서도 돈다(`node test/sec-raw.mjs`).
 * 🔴 고치기 전 코드(v217)에서 잰 결과(11/12): S1·S2·S3·S5·S6 빨강 · S4·S7(회귀 대조)은 초록. 고친 뒤 일곱 다 초록.
 *    S2·S3·S5 는 `auth()` 의 `queryTokenOk`, S1·S6 은 원본 응답의 `rawGuard` 가 지킨다.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }
// 1×1 PNG · 가장 작은 BMP(1×1 · 24비트) — 종류를 모르는 그림(`application/octet-stream`)이 `nosniff` 아래에서도 그려지는지 본다
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const BMP = Buffer.from('Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAATCwAAEwsAAAAAAAAAAAAA////AA==', 'base64')

export async function secRaw({ br, check, port = 7477 }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-sec-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-sec-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-sec-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-sec-cfg-'))
  for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  const dir = join(root, '3. Area/제품_Rondo')
  writeFileSync(join(dir, 'CLAUDE.md'), '# x\n')
  // 틀 안에서 도는 글 — 제 주소에서 토큰을 읽어 폴더를 만드는 요청을 보낸다
  writeFileSync(join(dir, 'evil.html'), `<!doctype html><title>t</title><body>report<script>
const t = new URL(location.href).searchParams.get('token')
window.__sawToken = !!t
fetch('/api/folders?token=' + encodeURIComponent(t), { method: 'POST', mode: 'no-cors', body: JSON.stringify({ section: '2. Projects', name: 'pwned-by-iframe' }) }).then(() => { window.__sent = 1 }).catch((e) => { window.__sent = String(e) })
</script>`)
  writeFileSync(join(dir, 'pic.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>window.__svg=1</script><rect width="4" height="4"/></svg>')
  writeFileSync(join(dir, 'a.png'), PNG); writeFileSync(join(dir, 'b.bmp'), BMP); writeFileSync(join(dir, 'doc.pdf'), '%PDF-1.4\n%%EOF\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', CLAUDE_CONFIG_DIR: claudeCfg }
  delete env.FOLDERBOT_NO_AUTH   // 🔴 인증을 켠다 — 이 검사의 전제
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const made = () => readdirSync(join(root, '2. Projects'))
  try {
    for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(150) } }
    let code = ''; for (let i = 0; i < 40 && !code; i++) { code = (/(?:코드|code)[^0-9]{0,20}(\d{6})/i.exec(out) || [])[1] ?? ''; if (!code) await wait(150) }
    must(code, '검사 전제 깨짐 — 호스트가 찍은 짝짓기 코드를 못 찾았다')
    const T = (await (await fetch(base + '/api/pair', { method: 'POST', body: JSON.stringify({ code, device: 'sec' }) })).json()).token
    must(T, '검사 전제 깨짐 — 짝짓기로 토큰을 못 받았다')
    const H = { authorization: `Bearer ${T}`, 'content-type': 'application/json' }
    const q = `token=${encodeURIComponent(T)}`
    const bot = await (await fetch(base + '/api/bots/start', { method: 'POST', headers: H, body: JSON.stringify({ rel: '3. Area/제품_Rondo' }) })).json()
    must(bot.id, '검사 전제 깨짐 — 머리말 토큰으로 봇을 못 켰다')
    const raw = (rel) => `${base}/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&${q}`

    await check('S1 스크립트가 도는 원본(html · svg)은 격리 머리를 달고 나간다 · PDF 와 그림은 안 단다', async () => {
      for (const f of ['evil.html', 'pic.svg']) { const r = await fetch(raw(f)); must(r.status === 200, `${f} → ${r.status}`); must(r.headers.get('content-security-policy') === 'sandbox allow-scripts allow-popups', `${f} 의 content-security-policy 가 «${r.headers.get('content-security-policy')}»`); must(r.headers.get('x-content-type-options') === 'nosniff', `${f} 에 nosniff 가 없다`) }
      for (const f of ['doc.pdf', 'a.png']) { const r = await fetch(raw(f)); must(r.status === 200, `${f} → ${r.status}`); must(!r.headers.get('content-security-policy'), `${f} 에 격리 머리가 붙었다(크롬 PDF 보기가 안 뜬다)`); must(r.headers.get('x-content-type-options') === 'nosniff', `${f} 에 nosniff 가 없다`) }
      const p = await fetch(raw('a.png'), { headers: { range: 'bytes=0-9' } }); must(p.status === 206 && p.headers.get('x-content-type-options') === 'nosniff', `조각 응답 ${p.status} 에 nosniff 가 없다`)
    })
    await check('S2 주소에 실은 토큰으로는 쓰지 못한다 — 폴더 만들기 401 · 볼트 그대로', async () => {
      const r = await fetch(`${base}/api/folders?${q}`, { method: 'POST', body: JSON.stringify({ section: '2. Projects', name: 'by-query' }) })
      must(r.status === 401, `POST /api/folders?token= → ${r.status}(401 이어야 한다)`)
      must(!made().some((n) => n.includes('by-query')), `볼트에 폴더가 생겼다 ${JSON.stringify(made())}`)
    })
    await check('S3 주소에 실은 토큰은 파일 받기에만 통한다 — 목록 401 · 원본·묶음 200 · 머리말 토큰은 그대로', async () => {
      const a = await fetch(`${base}/api/bots?${q}`); must(a.status === 401, `GET /api/bots?token= → ${a.status}`)
      const b = await fetch(raw('a.png')); must(b.status === 200, `GET raw?token= → ${b.status}`)
      const z = await fetch(`${base}/api/bots/${bot.id}/zip?rel=${encodeURIComponent('a.png')}&${q}`); must(z.status === 200, `GET zip?token= → ${z.status}`)
      const c = await fetch(`${base}/api/bots`, { headers: H }); must(c.status === 200, `머리말 토큰 GET /api/bots → ${c.status}`)
      const d = await fetch(`${base}/api/folders`, { method: 'POST', headers: H, body: JSON.stringify({ section: '2. Projects', name: 'by-header' }) }); must(d.status === 200, `머리말 토큰 POST /api/folders → ${d.status}`)
      must(made().some((n) => n.includes('by-header')), '머리말 토큰으로 만든 폴더가 없다(대조군)')
    })
    if (br) {
      const ctx = await br.newContext()
      try {
        const pg = await ctx.newPage()
        await pg.goto(base + '/'); await wait(300)
        await check('S4 문서 창과 같은 격리 틀 안 — html 은 그대로 그려진다(회귀)', async () => {
          await pg.evaluate((u) => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-popups'); f.src = u; document.body.appendChild(f) }, raw('evil.html'))
          let fr = null; for (let i = 0; i < 30 && !fr; i++) { fr = pg.frames().find((f) => f.url().includes('evil.html')) ?? null; if (!fr) await wait(100) }
          must(fr, '격리 틀이 안 떴다')
          await fr.waitForFunction(() => window.__sent !== undefined, null, { timeout: 5000 })
          must((await fr.evaluate(() => document.body.textContent)).includes('report'), 'html 본문이 안 그려졌다')
          globalThis.__secFrame = fr
        })
        await check('S5 격리 틀 안의 글이 제 주소의 토큰으로 볼트를 못 바꾼다', async () => {
          await wait(600)
          must(!made().some((n) => n.includes('pwned')), `🔴 틀 안의 글이 볼트에 폴더를 만들었다 ${JSON.stringify(made())}`)
          // 머리말로 싣는 길은 브라우저가 막는다(출처가 달라 먼저 묻는데 호스트가 허락하지 않는다)
          const viaHeader = await globalThis.__secFrame.evaluate(async () => { const t = new URL(location.href).searchParams.get('token'); try { const r = await fetch('/api/bots', { headers: { authorization: 'Bearer ' + t } }); return 'status ' + r.status } catch { return 'blocked' } })
          must(viaHeader === 'blocked', `틀 안에서 머리말 토큰 요청이 통했다(${viaHeader})`)
        })
        await check('S6 같은 주소를 맨 위 창으로 열어도 호스트와 다른 출처다 — API 답을 못 읽는다', async () => {
          const top = await ctx.newPage()
          await top.goto(raw('evil.html')); await wait(500)
          const r = await top.evaluate(async () => { const t = new URL(location.href).searchParams.get('token'); let got = 'blocked'; try { const x = await fetch('/api/bots', { headers: { authorization: 'Bearer ' + t } }); got = 'status ' + x.status } catch { /* 막힘 */ } return { origin: self.origin, got } })
          must(r.origin === 'null', `맨 위 창의 출처가 ${r.origin}(격리되면 null)`)
          must(r.got === 'blocked', `맨 위 창에서 API 가 읽혔다(${r.got})`)
          const sv = await ctx.newPage(); await sv.goto(raw('pic.svg')); await wait(300)
          must((await sv.evaluate(() => self.origin)) === 'null', 'svg 를 맨 위 창으로 열면 호스트와 같은 출처다')
          await top.close(); await sv.close()
        })
        await check('S7 그림은 그대로 보인다 — 종류를 모르는 그림(bmp)과 svg 도(회귀)', async () => {
          const sizes = await pg.evaluate(async (urls) => Promise.all(urls.map((u) => new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = u }))), [raw('a.png'), raw('b.bmp'), raw('pic.svg')])
          must(sizes.every((w) => w > 0), `그림 너비 [png, bmp, svg] = ${JSON.stringify(sizes)}`)
        })
      } finally { await ctx.close() }
    }
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  if (!process.argv.includes('--no-ui')) { try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사 건너뜀 — 브라우저 없음:', String(e.message).split('\n')[0], ')') } }
  try { await secRaw({ br, check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.message ?? e).split('\n')[0]) } finally { await br?.close() }
  console.log(`\n${red ? '🔴' : '✅'} 원본 울타리 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
