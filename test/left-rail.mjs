/**
 * ═══ 왼쪽 목록 A안 (2026-11-12 Dave 카드 «A안» · 11/13 «이대로 만든다» · 가안 셋째 묶음) ══════════════════
 *
 * 봇 목록이 가장 큰 자리를 쓴다. 위에는 «내 답을 기다림» 띠만(있을 때만), 요약은 목록 아래 한 줄과 숫자 줄.
 *   L1 데스크톱 — 위에서부터 찾기 · 폴더 선택 → 목록 머리 → 봇 목록 → 상황판 한 줄 → 숫자 줄 → 발 · 옛 네 칸 · 루틴 줄 · 정렬 줄 · 설정 줄이 없다
 *   L2 숫자 줄 — 숫자가 호스트와 같다(세션 = 안 읽은 세션 · 알림 = 안 읽은 알림 · 할 일 = 이번 주 마감 폴더의 열린 수) · 0 이면 숫자가 없다 · 칸마다 그 창
 *   L3 목록 머리 — 정렬 단추 하나가 메뉴 셋을 띄운다 · 고르면 단추 글자와 저장값 · 같은 단추 · ⎋ · 바깥으로 닫힌다 · «폴더 N» 은 폴더 현황
 *   L4 상황판 한 줄 — 누르면 상황판 창
 *   L5 «내 답을 기다림» 띠 — 기다림이 없으면 없다 · 생기면 줄마다 [허용]·[답하기] · 넷이면 세 줄 + «외 1 — 상황판에서»
 *   L6 답 대기가 셋이어도 봇 목록이 레일의 절반을 넘게 쓰고 봇 줄이 모두 보인다(창 높이 900)
 *   L7 폰 홈 — 제목 → 띠 → 목록 머리 → 봇 목록 · 띠가 가장 클 때(세 줄 + 외 N)도 첫 화면에 봇 줄 둘 이상 · 바닥에 상황판 한 줄 + 숫자 줄(44px 이상) · 알약은 그 위 · 찾는 중에는 접힌다
 *
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔). 스모크가 불러 쓰고(`leftRail`), 혼자서도 돈다(`node test/left-rail.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }
const p2 = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

export async function leftRail({ br, check, port = 7487, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-lr-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-lr-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-lr-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-lr-cc-'))
  const RELS = ['2. Projects/해커톤-제안', '2. Projects/PARA-AI', '3. Area/제품_Rondo', '3. Area/재무_CFO', '3. Area/사업_자문']
  for (const d of ['1. Inbox', '2. Projects', '3. Area', '4. Resources', '5. Archive', ...RELS]) mkdirSync(join(root, d), { recursive: true })
  for (const r of RELS) { writeFileSync(join(root, r, 'CLAUDE.md'), '# x\n'); writeFileSync(join(root, r, 'readme.md'), '# 읽어 보기\n') }
  const soon = new Date(); soon.setDate(soon.getDate() + 3)
  writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), `- [ ] PRD 확정: 답 받기 📅 ${ymd(soon)}\n- [ ] 가격표 확정\n- [x] 끝난 일\n`)
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(process.cwd(), 'test/fixtures/no-such-codex'), CLAUDE_CONFIG_DIR: claudeCfg }
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${p} → ${r.status} ${JSON.stringify(j).slice(0, 160)}`); return j }
  const until = async (f, msg, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await f()) return; await wait(100) } throw new Error('기다리다 끝남 — ' + msg) }
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(base + '/api/health'); up = true } catch { await wait(150) } }
    must(up, '검사 전제 깨짐 — 호스트가 안 떴다 ' + out.slice(-200))
    const bots = []; for (const r of RELS) bots.push(await api('/bots/start', { rel: r }))
    const [hack, , rondo, cfo, biz] = bots
    const s1 = await api(`/bots/${rondo.id}/sessions`, { name: '첫 세션' })
    // 안 읽은 답 하나 — 보지 않는 폴더의 세션이 답을 끝낸다
    const sb = await api(`/bots/${biz.id}/sessions`, { name: '자문 세션' })
    await api(`/sessions/${sb.id}/send`, { text: '안녕' })
    await until(async () => ['done', 'idle'].includes((await api(`/sessions/${sb.id}/chat`)).info.state) && !!(await api(`/sessions/${sb.id}/chat`)).info.lastReplyAt, '스텁 답이 안 끝난다')
    const hostNums = async () => {
      let sess = 0
      for (const b of await api('/bots')) for (const x of await api(`/bots/${b.id}/sessions`)) if (!(!x.adopted && (x.comm || x.exComm || x.channel || x.exChannel || x.routine || x.delegated)) && (x.lastReplyAt ?? 0) > (x.readAt ?? 0)) sess++
      const note = (await api('/notifications')).filter((n) => !n.read).length
      return { sess, note }
    }
    const askPerm = async (botId, name) => { const s = await api(`/bots/${botId}/sessions`, { name }); await api(`/sessions/${s.id}/send`, { text: '승인이 필요한 일 해 줘' }); await until(async () => (await api(`/sessions/${s.id}/chat`)).info.state === 'awaiting_input', `${name} 이 승인 대기가 안 된다`); return s }
    if (!br) return

    const pg = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const perrs = []; pg.on('pageerror', (e) => perrs.push(e.message))
    await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
    await pg.goto(`${base}/#bot=${rondo.id}&s=${s1.id}`)
    await pg.waitForSelector('.composer', { timeout: 10000 })
    await pg.waitForSelector('.side.left .numrow', { timeout: 6000 }); await wait(700)
    const closed = async (sel) => { for (let t = 0; t < 2500; t += 100) { if (!(await pg.$(sel))) return true; await wait(100) } return false }
    const modalTitle = () => pg.evaluate(() => { const m = [...document.querySelectorAll('.modal')].pop(); return m ? `${m.getAttribute('aria-label') ?? ''} ${m.querySelector('.modal-h')?.textContent ?? ''}`.replace(/\s+/g, ' ').trim() : '' })
    const escAll = async () => { for (let i = 0; i < 3 && await pg.$('.modal'); i++) { await pg.keyboard.press('Escape'); await wait(300) } }

    await check('L1 데스크톱 — 찾기 · 폴더 선택 → 목록 머리 → 봇 목록 → 상황판 한 줄 → 숫자 줄 → 발 · 옛 네 칸 · 루틴 줄 · 정렬 줄 · 설정 줄이 없다', async () => {
      const o = await pg.evaluate(() => {
        const sb = document.querySelector('.side.left'); const top = (s) => sb.querySelector(s)?.getBoundingClientRect().top ?? -1
        return { nav: [...sb.querySelectorAll('.nav')].map((n) => (n.querySelector('span')?.textContent ?? '').trim()), navT: top('.nav'), band: !!sb.querySelector('.wband'), head: top('.lhead'), list: top('.sb-list'), line: top('.cx-line'), nums: top('.numrow'), foot: top('.sb-foot'),
          cells: [...sb.querySelectorAll('.numrow .ncell .l')].map((x) => x.textContent), old: ['.mcards', '.rtline', '.sortbar', '.cx-fold', '.cx-sbody', '.t-fold'].filter((q) => sb.querySelector(q)), rows: sb.querySelectorAll('.sb-list .brow').length,
          sw: sb.scrollWidth, cw: sb.clientWidth, docSw: document.documentElement.scrollWidth, vw: innerWidth }
      })
      must(JSON.stringify(o.nav) === JSON.stringify(['검색', '폴더 선택 · 시작']), '맨 위 줄 ' + JSON.stringify(o.nav))
      must(!o.band, '기다리는 세션이 없는데 띠가 섰다')
      must(o.navT > 0 && o.navT < o.head && o.head < o.list && o.list < o.line && o.line < o.nums && o.nums < o.foot, '순서 ' + JSON.stringify(o))
      must(JSON.stringify(o.cells) === JSON.stringify(['세션', '알림', '할 일', '루틴', '설정']), '숫자 줄 칸 ' + JSON.stringify(o.cells))
      must(!o.old.length && o.rows === 6, '옛 것이 남았거나 봇 줄 수가 다르다 ' + JSON.stringify(o))
      must(o.sw <= o.cw + 1 && o.docSw <= o.vw, '가로 넘침 ' + JSON.stringify(o))
      if (shots) await pg.screenshot({ path: join(shots, 'lr-1-평소-desktop.png') })
    })

    await check('L2 숫자 줄 — 숫자가 호스트와 같다 · 0 이면 숫자가 없다 · 칸마다 그 창이 열린다', async () => {
      const h = await hostNums()
      must(h.sess === 1 && h.note >= 1, '검사 전제 — 안 읽은 세션 1 · 알림 1 이상이어야 한다 ' + JSON.stringify(h))
      const ui = () => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.side.left .numrow .ncell')].map((c) => [c.querySelector('.l').textContent, { n: c.querySelector('.v b')?.textContent ?? null, icon: !!c.querySelector('.v svg'), h: Math.round(c.getBoundingClientRect().height), aria: c.getAttribute('aria-label') }])))
      await until(async () => { const u = await ui(); return u['세션'].n === String(h.sess) && u['알림'].n === String(h.note) && u['할 일'].n === '2' }, '숫자가 호스트와 다르다 ' + JSON.stringify({ h, ui: await ui() }))
      const u = await ui()
      must(u['루틴'].n === null && u['루틴'].icon && u['설정'].n === null && u['설정'].icon, '0 인 칸에 숫자가 섰다 ' + JSON.stringify(u))
      must(u['세션'].aria === '세션 1' && u['루틴'].aria === '루틴', '읽어 주는 이름 ' + JSON.stringify(u))
      for (const [cls, title] of [['t-sess', '세션'], ['t-note', '알림'], ['t-todo', '할 일'], ['t-rt', '루틴'], ['t-set', '설정']]) {
        await pg.click(`.side.left .numrow .${cls}`); await pg.waitForSelector('.modal', { timeout: 4000 }); await wait(350)
        const t = await modalTitle(); await escAll(); const shut = await closed('.modal')
        must(t.includes(title), `«${title}» 칸이 다른 창을 열었다 — ${t}`)
        must(shut, `«${title}» 창이 안 닫힌다`)
      }
    })

    await check('L3 목록 머리 — 정렬 단추 하나가 메뉴 셋 · 고르면 단추 글자와 저장값 · 같은 단추 · ⎋ · 바깥으로 닫힌다 · «폴더 N» 은 폴더 현황', async () => {
      const btn = '.side.left .lhead .sortb'
      must((await pg.textContent(btn)).includes('마감일'), '처음 정렬이 마감일이 아니다 ' + await pg.textContent(btn))
      await pg.click(btn); await pg.waitForSelector('.menu.sortm button', { timeout: 3000 }); await wait(250)
      const m = await pg.evaluate(() => { const el = document.querySelector('.menu.sortm'); const r = el.getBoundingClientRect(); return { opts: [...el.querySelectorAll('button')].map((b) => ({ k: b.dataset.sort, t: b.querySelector('b')?.textContent, on: b.getAttribute('aria-checked') })), inVw: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight } })
      must(JSON.stringify(m.opts.map((x) => x.t)) === JSON.stringify(['마감일', '사용자', '상태']) && m.opts[0].on === 'true' && m.inVw, '정렬 메뉴 ' + JSON.stringify(m))
      if (shots) await pg.screenshot({ path: join(shots, 'lr-3-정렬-desktop.png') })
      await pg.click('.menu.sortm button[data-sort="state"]'); must(await closed('.menu.sortm'), '고른 뒤에도 메뉴가 남았다')
      const st = await pg.evaluate((b) => ({ t: document.querySelector(b).textContent, saved: localStorage.getItem('fb:railsort') }), btn)
      must(st.t.includes('상태') && st.saved === 'state', '고른 정렬이 단추 · 저장값에 안 남았다 ' + JSON.stringify(st))
      await pg.click(btn); await pg.waitForSelector('.menu.sortm'); await wait(200); await pg.click(btn); must(await closed('.menu.sortm'), '같은 단추로 안 닫힌다')
      await pg.click(btn); await pg.waitForSelector('.menu.sortm'); await wait(200); await pg.keyboard.press('Escape'); must(await closed('.menu.sortm'), '⎋ 로 안 닫힌다')
      await pg.click(btn); await pg.waitForSelector('.menu.sortm'); await wait(200); await pg.mouse.click(700, 400); must(await closed('.menu.sortm'), '바깥을 눌러도 안 닫힌다')
      await pg.click(btn); await pg.waitForSelector('.menu.sortm'); await wait(200); await pg.click('.menu.sortm button[data-sort="due"]'); await wait(200)
      const lf = await pg.textContent('.side.left .lhead .lf'); must(/폴더\s*5/.test(lf), '«폴더 N» 의 수 ' + lf)
      await pg.click('.side.left .lhead .lf'); await pg.waitForSelector('.modal.fsheet', { timeout: 3000 }); await wait(250)
      await escAll(); must(await closed('.modal'), '폴더 현황이 안 닫힌다')
    })

    await check('L4 상황판 한 줄 — 누르면 상황판 창', async () => {
      const t = await pg.evaluate(() => { const l = document.querySelector('.side.left .cx-line'); return l ? { b: l.querySelector('b')?.textContent, s: l.querySelector('.s')?.textContent, h: Math.round(l.getBoundingClientRect().height) } : null })
      must(t && t.b === '상황판' && t.s && t.h <= 36, '상황판 한 줄 ' + JSON.stringify(t))
      await pg.click('.side.left .cx-line'); await pg.waitForSelector('.modal.cx', { timeout: 4000 }); await wait(300)
      must((await modalTitle()).includes('상황판'), '상황판 창이 아니다')
      await escAll(); must(await closed('.modal'), '상황판이 안 닫힌다')
    })

    await check('L5 «내 답을 기다림» 띠 — 없으면 없다 · 생기면 줄마다 [허용]·[답하기] · 넷이면 세 줄 + «외 1 — 상황판에서»', async () => {
      must(!(await pg.$('.side.left .wband')), '기다림이 없는데 띠가 있다')
      const w1 = await askPerm(cfo.id, '승인 하나'); const w2 = await askPerm(hack.id, '승인 둘')
      await pg.waitForSelector('.side.left .wband .cx-it', { timeout: 6000 })
      const band = () => pg.evaluate(() => { const b = document.querySelector('.side.left .wband'); if (!b) return null; const top = (s) => document.querySelector('.side.left ' + s)?.getBoundingClientRect().top ?? -1
        return { n: b.querySelector('.cx-gl .c')?.textContent, head: (b.querySelector('.cx-gl')?.firstChild?.textContent ?? ''), rows: [...b.querySelectorAll('.cx-it')].map((r) => ({ sid: r.dataset.sid, f: r.querySelector('.cx-f .fo')?.textContent, allow: !!r.querySelector('.cx-allow'), reply: !!r.querySelector('.cx-reply') })), more: b.querySelector('.cx-more')?.textContent ?? null, bt: Math.round(b.getBoundingClientRect().top), navB: Math.round([...document.querySelectorAll('.side.left .nav')].pop().getBoundingClientRect().bottom), headT: Math.round(top('.lhead')), bb: Math.round(b.getBoundingClientRect().bottom) } })
      await until(async () => (await band())?.rows.length === 2, '띠에 두 줄이 안 선다 ' + JSON.stringify(await band()))
      const b2 = await band()
      must(b2.n === '2' && b2.head === '내 답을 기다림' && b2.rows.every((r) => r.allow && r.reply) && !b2.more, '띠 두 줄 ' + JSON.stringify(b2))
      must(b2.bt >= b2.navB && b2.bb <= b2.headT + 1, '띠가 찾기 · 폴더 선택과 목록 머리 사이에 없다 ' + JSON.stringify(b2))
      if (shots) await pg.screenshot({ path: join(shots, 'lr-5-답-대기-둘-desktop.png') })
      // [허용] — 그 줄이 빠진다
      await pg.click(`.side.left .wband .cx-it[data-sid="${w1.id}"] .cx-allow`)
      await until(async () => { const b = await band(); return !!b && b.rows.length === 1 && b.rows[0].sid === w2.id }, '허용한 줄이 안 빠진다 ' + JSON.stringify(await band()))
      // [답하기] — 그 세션으로 간다
      await pg.click(`.side.left .wband .cx-it[data-sid="${w2.id}"] .cx-reply`)
      await pg.waitForFunction((sid) => location.hash.includes(sid), w2.id, { timeout: 4000 })
      // 넷이면 세 줄 + «외 1»
      await askPerm(cfo.id, '승인 셋'); await askPerm(biz.id, '승인 넷'); await askPerm(rondo.id, '승인 다섯')
      await until(async () => { const b = await band(); return !!b && b.rows.length === 3 && b.n === '4' && /외 1 — 상황판에서/.test(b.more ?? '') }, '세 줄 + «외 1» 이 안 선다 ' + JSON.stringify(await band()))
      if (shots) await pg.screenshot({ path: join(shots, 'lr-5-답-대기-넷-desktop.png') })
      await pg.click('.side.left .wband .cx-more'); await pg.waitForSelector('.modal.cx', { timeout: 4000 }); await wait(300)
      await escAll(); must(await closed('.modal'), '상황판이 안 닫힌다')
    })

    await check('L6 답 대기가 넷이어도 봇 목록이 레일의 절반을 넘게 쓰고 봇 줄이 모두 보인다(창 높이 900)', async () => {
      const g = await pg.evaluate(() => { const sb = document.querySelector('.side.left').getBoundingClientRect(); const l = document.querySelector('.side.left .sb-list'); const lr = l.getBoundingClientRect(); const rows = [...l.querySelectorAll('.brow')]; return { sbH: Math.round(sb.height), listH: Math.round(lr.height), rows: rows.length, seen: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1 }).length, band: Math.round(document.querySelector('.side.left .wband').getBoundingClientRect().height) } })
      must(g.listH >= g.sbH * 0.5 && g.seen === g.rows && g.rows === 6, '봇 목록 자리 ' + JSON.stringify(g))
      must(!perrs.length, '화면 오류 ' + perrs.join(' | '))
    })
    await pg.close()

    await check('L7 폰 홈 — 제목 → 띠 → 목록 머리 → 봇 목록 · 띠가 가장 클 때(세 줄 + 외 N)도 첫 화면에 봇 줄 둘 이상 · 바닥에 상황판 한 줄 + 숫자 줄 · 알약은 그 위 · 찾는 중에는 접힌다', async () => {
      const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
      const ph = await ctx.newPage(); const errs = []; ph.on('pageerror', (e) => errs.push(e.message))
      try {
        await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await ph.goto(base + '/'); await ph.waitForSelector('.mhome .numrow', { timeout: 10000 }); await ph.waitForSelector('.mhome .wband .cx-it', { timeout: 6000 }); await wait(600)
        const g = () => ph.evaluate(() => {
          const h = document.querySelector('.mhome'); const top = (s) => h.querySelector(s)?.getBoundingClientRect().top ?? -1; const bot = (s) => h.querySelector(s)?.getBoundingClientRect().bottom ?? -1
          const pill = h.querySelector('.mpill').getBoundingClientRect(); const rows = [...h.querySelectorAll('.mscroll .mrow')]
          const cells = [...h.querySelectorAll('.numrow .ncell')].map((c) => { const r = c.getBoundingClientRect(); return { l: c.querySelector('.l').textContent, w: Math.round(r.width), h: Math.round(r.height) } })
          const bandBtn = [...h.querySelectorAll('.wband .cx-a .btn')].map((b) => Math.round(b.getBoundingClientRect().height)); const bandRow = [...h.querySelectorAll('.wband .cx-it')].map((b) => Math.round(b.getBoundingClientRect().height))
          return { title: top('.mtitle'), band: top('.wband'), head: top('.lhead'), firstRow: rows[0]?.getBoundingClientRect().top ?? -1, seen: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= pill.top }).length, rows: rows.length,
            line: top('.mbar .cx-line'), nums: top('.mbar .numrow'), barB: Math.round(bot('.mbar')), pillB: Math.round(pill.bottom), pillT: Math.round(pill.top), barT: Math.round(top('.mbar')), vh: innerHeight, cells, bandBtn, bandRow, sortH: Math.round(h.querySelector('.sortb').getBoundingClientRect().height),
            old: ['.mcards', '.rtline', '.sortbar', '.ustrip', '.cx-fold'].filter((q) => h.querySelector(q)), sw: document.documentElement.scrollWidth, vw: innerWidth }
        })
        const a = await g()
        if (shots) await ph.screenshot({ path: join(shots, 'lr-7-홈-phone.png') })
        must(a.title > 0 && a.title < a.band && a.band < a.head && a.head < a.firstRow, '순서 ' + JSON.stringify(a))
        must(a.seen >= 2 && a.rows === 6 && a.firstRow < a.vh * 0.62, '첫 화면에 보이는 봇 줄 ' + JSON.stringify({ seen: a.seen, rows: a.rows }))
        must(a.line > 0 && a.line < a.nums && Math.abs(a.barB - a.vh) <= 1 && a.pillB <= a.barT && a.barT - a.pillB <= 12, '바닥 묶음과 알약 ' + JSON.stringify(a))
        must(JSON.stringify(a.cells.map((c) => c.l).slice(0, 4)) === JSON.stringify(['세션', '알림', '할 일', '루틴']) && a.cells.every((c) => c.h >= 44 && c.w >= 44) && !a.cells.some((c) => c.l === '설정'), '숫자 줄 칸(폰의 설정은 머리줄 ⚙ 가 연다) ' + JSON.stringify(a.cells))
        must(a.bandRow.every((x) => x >= 44) && a.bandBtn.every((x) => x >= 32) && a.sortH >= 32, '손가락 크기 — 띠 줄 44 · 줄 안 단추 32 · 정렬 단추 ' + JSON.stringify({ bandRow: a.bandRow, bandBtn: a.bandBtn, sortH: a.sortH }))
        must(!a.old.length && a.sw <= a.vw, '옛 것이 남았거나 가로 넘침 ' + JSON.stringify(a))
        // 안전영역은 한 번만 — 바닥 묶음이 품고, 알약은 묶음 위에 뜬다
        await ph.evaluate(() => document.documentElement.style.setProperty('--sab', '34px')); await wait(300)
        const s = await g(); await ph.evaluate(() => document.documentElement.style.removeProperty('--sab')); await wait(300)
        must(Math.abs(s.barB - s.vh) <= 1 && s.barT - s.pillB <= 12 && (a.barT - s.barT) >= 32 && (a.barT - s.barT) <= 36, '안전영역 34px 을 한 번만 세지 않는다 ' + JSON.stringify({ a: { barT: a.barT, pillB: a.pillB }, s: { barT: s.barT, pillB: s.pillB, barB: s.barB } }))
        // 정렬 메뉴(폰)
        await ph.click('.mhome .sortb'); await ph.waitForSelector('.menu.sortm button', { timeout: 3000 }); await wait(300)
        const sm = await ph.evaluate(() => { const r = document.querySelector('.menu.sortm').getBoundingClientRect(); return { inVw: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, minH: Math.min(...[...document.querySelectorAll('.menu.sortm button')].map((b) => b.getBoundingClientRect().height)) } })
        must(sm.inVw && sm.minH >= 44, '폰 정렬 메뉴 ' + JSON.stringify(sm))
        if (shots) await ph.screenshot({ path: join(shots, 'lr-7-정렬-phone.png') })
        await ph.keyboard.press('Escape'); await wait(300)
        // 숫자 칸 → 창
        await ph.click('.mhome .numrow .t-note'); await ph.waitForSelector('.modal', { timeout: 4000 }); await wait(300)
        await ph.keyboard.press('Escape'); await wait(400)
        // 찾는 중에는 바닥 묶음이 접히고 알약이 내려온다
        await ph.click('.mhome .mpill'); await ph.waitForSelector('.mhome .mpill.edit input', { timeout: 3000 }); await wait(400)
        const f = await ph.evaluate(() => ({ bar: !!document.querySelector('.mhome .mbar'), band: !!document.querySelector('.mhome .wband'), head: !!document.querySelector('.mhome .lhead') }))
        must(!f.bar && !f.band && !f.head, '찾는 중인데 묶음 · 띠 · 목록 머리가 남았다 ' + JSON.stringify(f))
        must(!errs.length, '화면 오류 ' + errs.join(' | '))
      } finally { await ctx.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  try { await leftRail({ br, shots: 'test/tmp', check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' ')) }
  await br.close()
  console.log(`\n${red ? '🔴' : '✅'} 왼쪽 목록 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
