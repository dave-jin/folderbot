/**
 * ═══ 세션 줄 (2026-11-13 Dave 카드 · 가안 «가운데는 대화, 오른쪽은 폴더») ══════════════════════════
 *
 * 세션은 채팅 머리줄 아래 한 줄로 선다. 넘치면 들어가는 만큼만 세우고 나머지는 «＋N» 목록(Dave 카드 «가 — ＋N 목록»).
 *   S1 데스크톱 — 탭 셋과 ＋ 가 한 줄(34px)에 · 오른쪽 패널에 세션 칸이 없다 · 머리줄의 세션 메뉴가 없다 · 본문이 줄에 안 깔린다
 *   S2 탭을 두 번 누르면 그 자리에서 이름을 고친다(⏎ 저장 · 호스트 값) · 올리면 ✕ — 지우고 «되돌리기»
 *   S3 자동화 세션은 탭이 아니다 — 오른쪽 끝 «자동화 N ▾» 목록 안에 접혀 있다 · 같은 단추 · ⎋ · 바깥으로 닫힌다
 *   S4 세션이 많으면 줄 높이는 그대로 · «＋N» · 가로 넘침 없음 · 지금 보는 탭은 늘 보인다 · 목록에서 고르면 그 탭이 줄에 선다
 *   S5 채팅 칸이 좁아져도(창 900 + 문서 칸) 한 줄 · 지금 보는 탭이 보인다
 *   S6 폰 — 머리줄에 세션 이름 · 누르면 바닥 시트(줄 44px) · 고르면 바뀐다 · «할 일» 탭에 세션 줄이 없다
 *
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔). 스모크가 불러 쓰고(`sessionStrip`), 혼자서도 돈다(`node test/session-strip.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }

export async function sessionStrip({ br, check, port = 7483, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-ss-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-ss-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-ss-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-ss-cc-'))
  for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
  writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '- [ ] 할 일 하나: 설명\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(process.cwd(), 'test/fixtures/no-such-codex'), CLAUDE_CONFIG_DIR: claudeCfg }
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error(`${p} → ${r.status} ${JSON.stringify(j).slice(0, 120)}`); return j }
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(base + '/api/health'); up = true } catch { await wait(150) } }
    must(up, '검사 전제 깨짐 — 호스트가 안 떴다 ' + out.slice(-200))
    const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
    await api(`/bots/${bot.id}/routines`, { routines: [{ name: '아침 정리', cron: '0 9 * * *', prompt: '훑어 줘' }] }, 'PUT')
    const s1 = await api(`/bots/${bot.id}/sessions`, { name: '첫 세션' }); await api(`/bots/${bot.id}/sessions`, { name: '둘째 세션' }); await api(`/bots/${bot.id}/sessions`, { name: '셋째 세션' })
    const isAuto = (x) => !x.adopted && !!(x.comm || x.exComm || x.channel || x.exChannel || x.routine || x.delegated)
    const list = () => api(`/bots/${bot.id}/sessions`)
    if (!br) return

    const pg = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const perrs = []; pg.on('pageerror', (e) => perrs.push(e.message))
    await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
    await pg.goto(`${base}/#bot=${bot.id}&s=${s1.id}`)
    await pg.waitForSelector('.composer', { timeout: 10000 })
    await pg.waitForSelector('.sstrip .stab', { timeout: 5000 })
    await wait(600)
    const strip = () => pg.evaluate(() => {
      const el = document.querySelector('.sstrip'); if (!el) return null
      const r = el.getBoundingClientRect(); const tabs = [...el.querySelectorAll(':scope > .stab')]
      const on = el.querySelector(':scope > .stab.on')?.getBoundingClientRect()
      return { h: Math.round(r.height), top: Math.round(r.top), l: r.left, r: r.right, tabs: tabs.map((t) => t.querySelector('.n')?.textContent ?? ''), tabR: Math.max(0, ...tabs.map((t) => t.getBoundingClientRect().right)), on: on ? { l: on.left, r: on.right } : null, onName: el.querySelector(':scope > .stab.on .n')?.textContent ?? null,
        more: el.querySelector(':scope > .smore')?.textContent ?? null, moreR: el.querySelector(':scope > .smore')?.getBoundingClientRect().right ?? 0, plus: !!el.querySelector(':scope > .splus'), sw: el.scrollWidth, cw: el.clientWidth, docSw: document.documentElement.scrollWidth, vw: innerWidth }
    })
    const until = async (f, msg, ms = 5000) => { for (let t = 0; t < ms; t += 100) { if (await f()) return; await wait(100) } throw new Error('기다리다 끝남 — ' + msg) }

    await check('S1 데스크톱 — 탭 셋과 ＋ 가 한 줄에 · 패널에 세션 칸이 없다 · 머리줄 세션 메뉴가 없다 · 본문이 줄에 안 깔린다', async () => {
      const v = await strip()
      must(v && v.h === 34 && v.tabs.length === 3 && v.plus && v.more === null, '줄 ' + JSON.stringify(v))
      must(v.onName === '첫 세션', '지금 보는 탭 ' + v.onName)
      const o = await pg.evaluate(() => ({ panelRows: document.querySelectorAll('.panel .srow').length, sech: [...document.querySelectorAll('.panel .sech')].map((e) => e.textContent ?? '').filter((t) => /^세션/.test(t)), hsess: !!document.querySelector('.chat-hdr .hsess'), bgsec: !!document.querySelector('.panel .bgsec'),
        hdrB: Math.round(document.querySelector('.chat-hdr').getBoundingClientRect().bottom), stripT: Math.round(document.querySelector('.sstrip').getBoundingClientRect().top), stripB: Math.round(document.querySelector('.sstrip').getBoundingClientRect().bottom), padTop: parseFloat(getComputedStyle(document.querySelector('.chat-body')).paddingTop), colT: Math.round(document.querySelector('.col.chat').getBoundingClientRect().top) }))
      must(o.panelRows === 0 && !o.sech.length && !o.hsess && !o.bgsec, '옛 자리가 남았다 ' + JSON.stringify(o))
      must(o.stripT === o.hdrB && o.padTop >= o.stripB - o.colT + 10, '본문 여백이 줄 아래로 안 내려갔다 ' + JSON.stringify(o))
      if (shots) await pg.screenshot({ path: join(shots, 'strip-1-평소-desktop.png') })
    })

    await check('S2 탭을 두 번 누르면 그 자리에서 이름을 고친다 · 올리면 ✕ — 지우고 «되돌리기»', async () => {
      await pg.dblclick('.sstrip > .stab.on'); await pg.waitForSelector('.sstrip .stab.edit .rin', { timeout: 2000 })
      await pg.fill('.sstrip .stab.edit .rin', '고친 이름'); await pg.keyboard.press('Enter')
      await until(async () => (await list()).some((x) => x.name === '고친 이름'), '호스트에 이름이 안 바뀌었다')
      await until(async () => (await strip()).tabs.includes('고친 이름'), '탭 이름이 안 바뀌었다')
      const before = (await strip()).tabs.length
      const third = '.sstrip > .stab:nth-of-type(3)'
      await pg.hover(third); await wait(150)
      must(await pg.evaluate((q) => { const d = document.querySelector(q + ' .del'); return !!d && getComputedStyle(d).display !== 'none' }, third), '올려도 ✕ 가 안 보인다')
      await pg.click(third + ' .del')
      await until(async () => (await strip()).tabs.length === before - 1, '탭이 안 줄었다')
      await pg.waitForSelector('[data-toast-act]', { timeout: 3000 }); await pg.click('[data-toast-act]')
      await until(async () => (await strip()).tabs.length === before, '되돌리기로 탭이 안 돌아왔다')
    })

    await check('S3 자동화 세션은 탭이 아니다 — «자동화 N ▾» 목록 안에 접혀 있다 · 같은 단추 · ⎋ · 바깥으로 닫힌다', async () => {
      await api(`/bots/${bot.id}/routines/run`, { name: '아침 정리' })
      await until(async () => (await list()).some(isAuto), '루틴 세션이 안 생겼다(검사 전제)')
      const autoN = (await list()).filter(isAuto).length, chatN = (await list()).filter((x) => !isAuto(x)).length
      await until(async () => { const v = await strip(); return !!v.more && v.more.includes(`자동화 ${autoN}`) }, '«자동화 N» 단추가 안 섰다')
      const v = await strip(); must(v.tabs.length === chatN && v.h === 34, '자동화가 탭으로 섰다 ' + JSON.stringify(v))
      await pg.click('.sstrip > .smore'); await pg.waitForSelector('.spop.sessm .srow.autoh', { timeout: 2000 })
      must((await pg.$$('.spop.sessm .srow.auto')).length === 0, '자동화 묶음이 펼쳐진 채로 열렸다')
      await pg.click('.spop.sessm .srow.autoh'); await wait(200)
      must((await pg.$$('.spop.sessm .srow.auto')).length === autoN, '펼쳐도 자동화 줄이 안 보인다')
      if (shots) await pg.screenshot({ path: join(shots, 'strip-3-자동화-desktop.png') })
      await pg.click('.spop.sessm .srow.autoh'); await wait(150)   // 접힘 기억을 원래대로
      await pg.click('.sstrip > .smore'); await wait(250); must(!(await pg.$('.spop.sessm')), '같은 단추로 안 닫힌다')
      await pg.click('.sstrip > .smore'); await pg.waitForSelector('.spop.sessm', { timeout: 2000 }); await pg.keyboard.press('Escape'); await wait(200); must(!(await pg.$('.spop.sessm')), '⎋ 로 안 닫힌다')
      await pg.click('.sstrip > .smore'); await pg.waitForSelector('.spop.sessm', { timeout: 2000 }); await wait(200); await pg.mouse.click(400, 500); await wait(250); must(!(await pg.$('.spop.sessm')), '바깥을 눌러도 안 닫힌다')
    })

    let many = []
    await check('S4 세션이 많으면 줄 높이는 그대로 · «＋N» · 가로 넘침 없음 · 지금 보는 탭은 늘 보인다 · 목록에서 고르면 그 탭이 선다', async () => {
      for (const n of ['요약 PRD 를 읽고 정리', '릴리스 노트 초안 쓰기', '가격표 비교와 추천', '화면 캡처 정리', '디자인 리뷰 반영', '폰 푸시 점검', 'Q2·Q5 답 정리', '아주 긴 이름을 가진 세션 — 줄임표로 잘려야 한다']) many.push(await api(`/bots/${bot.id}/sessions`, { name: n }))
      const chatN = (await list()).filter((x) => !isAuto(x)).length
      await until(async () => { const v = await strip(); return !!v.more && /^＋\d+/.test(v.more) }, '«＋N» 단추가 안 섰다')
      await wait(300)
      const v = await strip(); const n = Number(/^＋(\d+)/.exec(v.more)[1])
      must(v.h === 34 && v.sw <= v.cw && v.docSw <= v.vw, '줄이 넘친다 ' + JSON.stringify({ h: v.h, sw: v.sw, cw: v.cw, docSw: v.docSw, vw: v.vw }))
      must(v.tabs.length + n === chatN && v.tabs.length >= 3, `보이는 ${v.tabs.length} + 가려진 ${n} ≠ 채팅 ${chatN}`)
      must(v.on && v.on.l >= v.l && v.on.r <= v.r && v.tabR <= v.moreR, '지금 보는 탭이 줄 밖이다 ' + JSON.stringify(v.on))
      if (shots) await pg.screenshot({ path: join(shots, 'strip-4-넘침-desktop.png') })
      await pg.click('.sstrip > .smore'); await pg.waitForSelector('.spop.sessm .srow[data-sid]', { timeout: 2000 })
      const rows = await pg.$$eval('.spop.sessm .srow[data-sid]', (els) => els.map((e) => ({ id: e.dataset.sid, name: e.querySelector('.n')?.textContent ?? '' })))
      must(rows.length === n && rows.every((r) => !v.tabs.includes(r.name)), '목록의 줄이 가려진 세션과 다르다 ' + JSON.stringify(rows.map((r) => r.name)))
      const last = rows[rows.length - 1]
      if (shots) await pg.screenshot({ path: join(shots, 'strip-4-목록-desktop.png') })
      await pg.click(`.spop.sessm .srow[data-sid="${last.id}"]`)
      await until(async () => (await pg.evaluate(() => location.hash)).includes(last.id), '그 세션으로 안 갔다')
      await until(async () => { const w = await strip(); return w.onName === last.name && w.on && w.on.r <= w.r && w.h === 34 && w.sw <= w.cw }, '고른 세션의 탭이 줄에 안 섰다')
      must(!(await pg.$('.spop.sessm')), '고른 뒤에도 목록이 남았다')
      const w = await strip(); must(w.on.r - w.on.l <= 170, '탭이 최대 폭을 넘는다 ' + (w.on.r - w.on.l))
    })

    await check('S5 채팅 칸이 좁아져도 한 줄 · 지금 보는 탭이 보인다', async () => {
      await pg.setViewportSize({ width: 900, height: 800 }); await wait(500)
      const v = await strip()
      must(v && v.h === 34 && v.sw <= v.cw && v.docSw <= v.vw && v.on && v.on.l >= v.l && v.on.r <= v.r, '좁은 줄 ' + JSON.stringify(v))
      if (shots) await pg.screenshot({ path: join(shots, 'strip-5-좁음-desktop.png') })
      await pg.setViewportSize({ width: 1440, height: 900 }); await wait(400)
      const w = await strip(); must(w.tabs.length > v.tabs.length, `넓히면 탭이 더 서야 한다 ${v.tabs.length} → ${w.tabs.length}`)
      must(!perrs.length, '화면 오류 ' + perrs.join(' | '))
    })
    await pg.close()

    await check('S6 폰 — 머리줄에 세션 이름 · 누르면 바닥 시트(줄 44px) · 고르면 바뀐다 · «할 일» 탭에 세션 줄이 없다', async () => {
      const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
      const ph = await ctx.newPage(); const errs = []; ph.on('pageerror', (e) => errs.push(e.message))
      try {
        await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await ph.goto(`${base}/#bot=${bot.id}&s=${s1.id}`)
        await ph.waitForSelector('.chat-hdr .hnb .sn', { timeout: 10000 }); await wait(500)
        const h = await ph.evaluate(() => ({ strip: !!document.querySelector('.sstrip'), sn: document.querySelector('.chat-hdr .hnb .sn')?.textContent, hh: Math.round(document.querySelector('.chat-hdr').getBoundingClientRect().height), bw: Math.round(document.querySelector('.chat-hdr .hnb').getBoundingClientRect().right), vw: innerWidth }))
        must(!h.strip && h.sn === '고친 이름' && h.bw <= h.vw, '폰 머리줄 ' + JSON.stringify(h))
        if (shots) await ph.screenshot({ path: join(shots, 'strip-6-머리줄-phone.png') })
        await ph.click('.chat-hdr .hnb'); await ph.waitForSelector('.tsheet.sesssheet .srow', { timeout: 3000 }); await wait(400)
        const g = await ph.evaluate(() => { const m = document.querySelector('.tsheet.sesssheet').getBoundingClientRect(); const rows = [...document.querySelectorAll('.tsheet.sesssheet .srow')]; const tab = document.querySelector('.tabbar')?.getBoundingClientRect(); return { t: Math.round(m.top), b: Math.round(m.bottom), vh: innerHeight, minH: Math.min(...rows.map((r) => Math.round(r.getBoundingClientRect().height))), n: rows.length, add: !!document.querySelector('.tsheet.sesssheet .srow.sadd'), autoh: !!document.querySelector('.tsheet.sesssheet .srow.autoh'), tabT: tab ? Math.round(tab.top) : null, sw: document.documentElement.scrollWidth, vw: innerWidth, x: (() => { const x = document.querySelector('.tsheet.sesssheet .mx')?.getBoundingClientRect(); return x ? { w: Math.round(x.width), h: Math.round(x.height) } : null })() } })
        must(g.t >= 0 && g.minH >= 44 && g.add && g.autoh && g.sw <= g.vw && g.x && g.x.w >= 44 && g.x.h >= 44, '시트 ' + JSON.stringify(g))
        must(g.tabT === null || g.b <= g.tabT + 1, '시트가 하단 탭에 깔린다 ' + JSON.stringify({ b: g.b, tabT: g.tabT }))
        if (shots) await ph.screenshot({ path: join(shots, 'strip-6-시트-phone.png') })
        const target = many[0]
        await ph.click(`.tsheet.sesssheet .srow[data-sid="${target.id}"]`)
        await ph.waitForFunction((n) => document.querySelector('.chat-hdr .hnb .sn')?.textContent === n, target.name, { timeout: 4000 })
        must(!(await ph.$('.tsheet.sesssheet')), '고른 뒤에도 시트가 남았다')
        await ph.click('.tabbar .tb:nth-child(3)'); await wait(500)
        const t = await ph.evaluate(() => ({ rows: document.querySelectorAll('.panel .srow').length, todo: !!document.querySelector('.panel .todo, .panel .ptodo, .panel .sech') }))
        must(t.rows === 0, '«할 일» 탭에 세션 줄이 남았다 ' + JSON.stringify(t))
        if (shots) await ph.screenshot({ path: join(shots, 'strip-6-할일-phone.png') })
        must(!errs.length, '화면 오류 ' + errs.join(' | '))
      } finally { await ctx.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  try { await sessionStrip({ br, shots: 'test/tmp', check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' ')) }
  await br.close()
  console.log(`\n${red ? '🔴' : '✅'} 세션 줄 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
