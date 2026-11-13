/**
 * ═══ UX/UI 정리 첫 걸음 «고장 여덟» (2026-11-13) ═══════════════════════════════════════════════════
 *
 * 11/12 UX/UI 리뷰가 찾은 **실제 고장**을 화면에서 잰다(볼트 `06_리뷰/2026-11-12_UXUI-리뷰_FolderBot-전체.md`).
 *   U1 창은 ⎋ 로 닫힌다 — 알림 · 세션 · 폴더봇 · 할 일 · 설정 · 단축키 · 찾기 · 폴더 선택 · 루틴 · 루틴 편집
 *   U2 창 위에 뜬 것이 있으면 ⎋ 는 **위의 것 하나만** 닫는다 · 루틴 편집은 고친 것이 있으면 닫기 전에 묻는다
 *   U3 채팅 머리줄의 세션 메뉴 — ⎋ · 바깥 누르기 · 같은 단추로 닫힌다 · 다른 창 뒤에 남지 않는다
 *   U4 모델 팝오버 — «새로고침» 이 한 줄 · 적힌 숫자 키로 모델이 바뀐다
 *   U5 색 — 다크/라이트가 `color-scheme` 을 정한다 · 루틴 지우기는 빨강 · 루틴 창 «1~2개» 칸에 바탕이 있다
 *   U6 폰 설정 — 보이는 입력칸의 글자가 16px 이상(iOS 는 그보다 작으면 초점에서 화면을 확대한다)
 *   U7 묻기 창의 어둠막이 아래 창을 덮는다(죽어 있던 쌓임 규칙)
 *
 * 🔴 고치기 전 코드(v218)에서 잰 결과는 PRD 의 이 걸음 문단에 있다.
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔) — 스모크의 긴 흐름이 남긴 상태에 기대지 않는다.
 * 스모크가 불러 쓰고(`uxuiEight`), 혼자서도 돈다(`node test/uxui-eight.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }

export async function uxuiEight({ br, check, port = 7481, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-ux-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-ux-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-ux-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-ux-cfg-'))
  for (const d of ['1. Inbox', '2. Projects', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# x\n')
  writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '- [ ] 할 일 하나: 설명\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', CLAUDE_CONFIG_DIR: claudeCfg }
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
    const s1 = await api(`/bots/${bot.id}/sessions`, { name: '첫 세션' }); await api(`/bots/${bot.id}/sessions`, { name: '둘째 세션' })
    if (!br) return

    // ── 데스크톱 ───────────────────────────────────────────────────────────────
    const pg = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const perrs = []; pg.on('pageerror', (e) => perrs.push(e.message))
    await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
    await pg.goto(`${base}/#bot=${bot.id}&s=${s1.id}`)
    await pg.waitForSelector('.composer', { timeout: 10000 })
    await wait(600)
    const blur = () => pg.evaluate(() => { const a = document.activeElement; if (a && a !== document.body) a.blur() })
    const gone = async (sel, ms = 1500) => { for (let t = 0; t < ms; t += 50) { if (!(await pg.$(sel))) return true; await wait(50) } return false }
    const esc = async () => { await pg.keyboard.press('Escape'); await wait(120) }

    await check('U1 창은 ⎋ 로 닫힌다 — 초점이 입력칸 밖이어도', async () => {
      const wins = [
        ['알림', () => pg.click('.sbtiles .t-note'), '.modal.nmodal'],
        ['세션', () => pg.click('.sbtiles .t-sess'), '.modal.clean'],
        ['폴더봇', () => pg.click('.sbtiles .t-fold'), '.modal.fsheet'],
        ['할 일', () => pg.click('.sbtiles .t-todo'), '.modal.board'],
        ['설정', () => pg.keyboard.press('Meta+,'), '.modal.setw'],
        ['단축키', () => pg.keyboard.press('Meta+/'), '.modal.keys'],
        ['찾기', () => pg.click('.nav.nsearch'), '.modal.pal.srch'],
        ['폴더 선택', () => pg.keyboard.press('Meta+Shift+N'), '.modal.pk'],
        ['루틴', () => pg.click('.rtline'), '.modal.rt']
      ]
      const stuck = []
      for (const [name, open, sel] of wins) {
        await open()
        try { await pg.waitForSelector(sel, { timeout: 3000 }) } catch { throw new Error(`«${name}» 창이 안 열렸다(${sel}) — 검사 전제`) }
        await wait(200); await blur(); await esc()
        if (!(await gone(sel))) { stuck.push(name); await pg.mouse.click(5, 5); await gone(sel) }
        if (await pg.$('.backdrop')) stuck.push(name + '(어둠막 남음)')
      }
      must(!stuck.length, '⎋ 로 안 닫힌 창: ' + stuck.join(' · '))
    })

    // 오른쪽 패널의 루틴 줄 → 루틴 편집
    const openRoutineEdit = async () => {
      if (!(await pg.$('.panel .kv:has-text("아침 정리")'))) await pg.click('.panel .sech:has-text("루틴")')
      await pg.click('.panel .kv:has-text("아침 정리")'); await pg.waitForSelector('.sheet .sheet-h', { timeout: 3000 }); await wait(250)
    }
    await check('U2 루틴 편집 — ⎋ 로 닫힌다 · 고친 것이 있으면 묻고, 그 위의 ⎋ 는 확인창만 닫는다', async () => {
      await openRoutineEdit(); await blur(); await esc()
      must(await gone('.sheet .sheet-h'), '고친 것이 없는데 ⎋ 로 안 닫혔다')
      must(!(await pg.$('.modal.conf')), '고친 것이 없는데 확인창이 떴다')
      await openRoutineEdit()
      const prompt = await pg.$('.sheet textarea'); must(prompt, '루틴 편집에 프롬프트 칸이 없다 — 검사 전제')
      await prompt.fill('훑어 줘 — 고침'); await blur(); await esc()
      await pg.waitForSelector('.modal.conf', { timeout: 2000 }).catch(() => { throw new Error('고친 것이 있는데 ⎋ 가 묻지 않았다') })
      must(await pg.$('.sheet .sheet-h'), '확인창이 뜨면서 루틴 편집이 닫혔다')
      // 확인창의 어둠막이 시트를 덮는다 — 안 덮으면 시트의 «저장»·«취소» 가 그대로 눌려 확인창만 혼자 남는다(11/13 검토)
      const cover = await pg.evaluate(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); return String(document.elementFromPoint(s.left + 16, s.top + 16)?.className ?? '') })
      must(/backdrop/.test(cover), '확인창이 떴는데 루틴 편집이 어두워지지 않는다(어둠막이 시트 아래) — 그 자리에 있는 것: ' + cover)
      await esc()
      must(await gone('.modal.conf'), '확인창이 ⎋ 로 안 닫혔다')
      must(await pg.$('.sheet .sheet-h'), '⎋ 한 번에 확인창과 루틴 편집이 둘 다 닫혔다')
      // 바깥 누르기도 같은 길 — 묻는다 → «버리고 닫기»
      await pg.mouse.click(8, 450)
      await pg.waitForSelector('.modal.conf', { timeout: 2000 }).catch(() => { throw new Error('고친 것이 있는데 바깥 누르기가 묻지 않았다') })
      await pg.click('.modal.conf .modal-f [data-conf="ok"]')
      must(await gone('.sheet .sheet-h'), '«버리고 닫기» 뒤에도 루틴 편집이 남았다')
      must((await api(`/bots/${bot.id}/routines`))[0].prompt === '훑어 줘', '버렸는데 저장됐다')
    })

    await check('U3 세션 메뉴 — ⎋ · 바깥 누르기 · 같은 단추로 닫힌다 · 다른 창 뒤에 남지 않는다', async () => {
      const btn = '.chat-hdr .hsess'
      must(await pg.$(btn), '채팅 머리줄에 세션 단추가 없다 — 검사 전제')
      const open = async () => { await pg.click(btn); await pg.waitForSelector('.menu.sessm', { timeout: 2000 }); await wait(150) }   // ⚠ 메뉴는 여는 클릭이 바로 닫지 않게 다음 틀에 바깥 누르기를 듣는다 — 그 전에 누르면 헛준다
      await open()
      const names = await pg.$$eval('.menu.sessm button', (b) => b.map((x) => x.textContent))
      must(names.some((n) => /첫 세션/.test(n)) && names.some((n) => /둘째 세션/.test(n)), '세션 메뉴에 세션이 없다 ' + JSON.stringify(names))
      await esc(); must(await gone('.menu.sessm'), '⎋ 로 안 닫혔다')
      await open(); await pg.mouse.click(700, 500); must(await gone('.menu.sessm'), '바깥을 눌러도 안 닫혔다')
      await open(); await pg.click(btn); await wait(200); must(!(await pg.$('.menu.sessm')), '같은 단추를 다시 눌렀는데 안 닫혔다(닫혔다 다시 열렸다)')
      await open(); await pg.click('.sbtiles .t-note'); await pg.waitForSelector('.modal.nmodal', { timeout: 3000 })
      must(!(await pg.$('.menu.sessm')), '알림 창을 열었는데 세션 메뉴가 뒤에 남았다')
      await esc(); must(await gone('.modal.nmodal'), '알림 창이 안 닫혔다')
      // 메뉴에서 세션을 고르면 그 세션으로 간다(회귀)
      await open(); await pg.click('.menu.sessm button:has-text("둘째 세션")'); await wait(400)
      must(/둘째 세션/.test(await pg.$eval(btn, (b) => b.textContent)), '메뉴에서 고른 세션으로 안 갔다')
      // 입력창 팝오버를 연 채 세션 단추를 누르면 팝오버는 닫힌다 — 단추가 누르기를 삼키면 둘이 같이 뜬다(11/13 검토)
      const anyPop = (await pg.evaluateHandle(() => [...document.querySelectorAll('.composer .cbtn')].find((b) => b.getAttribute('title') === '모델') ?? null)).asElement()
      must(anyPop, '입력창에 모델 단추가 없다 — 검사 전제')
      await anyPop.click(); await pg.waitForSelector('.cpop', { timeout: 2000 })
      await open(); must(await gone('.cpop', 600), '세션 단추를 눌렀는데 입력창 팝오버가 남아 메뉴와 같이 떴다')
      await esc(); must(await gone('.menu.sessm'), '세션 메뉴가 ⎋ 로 안 닫혔다')
      // 메뉴가 화면보다 길면 안에서 스크롤된다 — 그 스크롤로 메뉴가 닫히면 아래쪽 세션을 못 고른다(11/13 검토)
      let scrolled = null
      for (const h of [260, 200, 150, 110]) {
        await pg.setViewportSize({ width: 1440, height: h }); await wait(250); await open()
        const can = await pg.$eval('.menu.sessm', (m) => m.scrollHeight - m.clientHeight)
        if (can > 8) {
          const r = await pg.$eval('.menu.sessm', (m) => { const b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
          await pg.mouse.move(r.x, r.y); await pg.mouse.wheel(0, 40); await wait(300)
          scrolled = (await pg.$('.menu.sessm')) ? await pg.$eval('.menu.sessm', (m) => m.scrollTop) : -1
          break
        }
        await esc(); await gone('.menu.sessm')
      }
      if (await pg.$('.menu.sessm')) { await esc(); await gone('.menu.sessm') }
      await pg.setViewportSize({ width: 1440, height: 900 }); await wait(300)
      must(scrolled !== null, '세션 메뉴가 화면을 넘치는 높이를 못 만들었다 — 검사 전제')
      must(scrolled > 0, scrolled < 0 ? '세션 메뉴 안에서 스크롤하자 메뉴가 닫혔다' : '세션 메뉴 안이 스크롤되지 않았다')
    })

    await check('U4 모델 팝오버 — «새로고침» 한 줄 · 적힌 숫자 키로 모델이 바뀐다', async () => {
      const mb = '.composer .cbtn.model, .composer .cbtn[data-k="model"]'
      const modelBtn = (await pg.$(mb)) ?? (await pg.evaluateHandle(() => [...document.querySelectorAll('.composer .cbtn')].find((b) => /Fable|Opus|Sonnet|Haiku|GPT|모델/i.test(b.textContent ?? '')) ?? null)).asElement()
      must(modelBtn, '입력창에 모델 단추가 없다 — 검사 전제')
      const before = (await modelBtn.textContent()).trim()
      await modelBtn.click(); await pg.waitForSelector('.cpop .prow2', { timeout: 2000 })
      // 팝오버 위에 창이 뜨면 ⎋ 는 창만 닫는다 — 팝오버의 귀가 «이미 처리된 ⎋» 를 또 먹으면 둘이 같이 닫힌다(11/13 검토)
      await pg.keyboard.press('Meta+/'); await pg.waitForSelector('.modal.keys', { timeout: 3000 }); await wait(150); await blur(); await esc()
      must(await gone('.modal.keys'), '단축키 창이 ⎋ 로 안 닫혔다')
      must(await pg.$('.cpop .prow2'), '창을 닫는 ⎋ 한 번에 모델 팝오버까지 닫혔다')
      const lnk = await pg.$eval('.cpop .hint .lnk', (b) => { const r = document.createRange(); r.selectNodeContents(b); return { lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size, ws: getComputedStyle(b).whiteSpace } })
      must(lnk.ws === 'nowrap' && lnk.lines === 1, '«새로고침» 이 두 줄로 접힌다 ' + JSON.stringify(lnk))
      const rows = await pg.$$eval('.cpop .prow2', (r) => r.map((x) => ({ t: x.querySelector('b')?.textContent ?? '', on: x.classList.contains('on'), k: x.querySelector('.k')?.textContent ?? '' })))
      const target = rows.findIndex((r) => !r.on && /^[1-9]$/.test(r.k))
      must(target >= 0, '숫자가 적힌 다른 모델 줄이 없다 — 검사 전제 ' + JSON.stringify(rows))
      await blur(); await pg.keyboard.press(rows[target].k); await wait(300)
      if (await pg.$('.modal.conf')) { await pg.click('.modal.conf .modal-f [data-conf="ok"]'); await wait(300) }
      let after = before; for (let i = 0; i < 20 && after === before; i++) { await wait(100); after = (await modelBtn.textContent()).trim() }
      must(after !== before, `숫자 키 ${rows[target].k} 를 눌렀는데 모델이 그대로다(${before})`)
      // 팝오버만 떠 있을 때의 ⎋ 는 종전대로 팝오버를 닫는다(회귀)
      await modelBtn.click(); await pg.waitForSelector('.cpop .prow2', { timeout: 2000 }); await blur(); await esc()
      must(await gone('.cpop'), '모델 팝오버가 ⎋ 로 안 닫혔다')
    })

    await check('U5 색 — color-scheme · 루틴 지우기는 빨강 · 루틴 창 «1~2개» 칸에 바탕', async () => {
      const cs = await pg.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, err: getComputedStyle(document.documentElement).getPropertyValue('--err').trim() }))
      must(cs.scheme === 'dark', `다크 테마의 color-scheme 이 ${cs.scheme}`)
      await openRoutineEdit()
      const del = await pg.evaluate(() => { const b = [...document.querySelectorAll('.sheet .srow')].find((x) => /삭제|지우기/.test(x.textContent ?? '')); if (!b) return null; const probe = document.createElement('i'); probe.style.color = 'var(--err)'; document.body.appendChild(probe); const want = getComputedStyle(probe).color; probe.remove(); return { got: getComputedStyle(b).color, want } })
      must(del, '루틴 편집에 지우기 단추가 없다 — 검사 전제')
      must(del.got === del.want, `루틴 지우기 단추가 빨강이 아니다 ${JSON.stringify(del)}`)
      await blur(); await esc(); must(await gone('.sheet .sheet-h'), '루틴 편집이 안 닫혔다')
      await pg.click('.rtline'); await pg.waitForSelector('.modal.rt', { timeout: 3000 }); await wait(300)
      const l1 = await pg.evaluate(() => { const i = document.querySelector('.modal.rt .legend .l1'); return i ? getComputedStyle(i).backgroundColor : null })
      must(l1 && l1 !== 'rgba(0, 0, 0, 0)' && l1 !== 'transparent', `루틴 창 범례 «1~2개» 칸에 바탕이 없다(${l1})`)
      await blur(); await esc(); must(await gone('.modal.rt'), '루틴 창이 안 닫혔다')
      // 라이트 테마
      const lt = await br.newPage({ viewport: { width: 1000, height: 700 } })
      await lt.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'light') })
      await lt.goto(`${base}/#bot=${bot.id}`); await lt.waitForSelector('.composer', { timeout: 10000 })
      const ls = await lt.evaluate(() => getComputedStyle(document.documentElement).colorScheme); await lt.close()
      must(ls === 'light', `라이트 테마의 color-scheme 이 ${ls}`)
    })

    await check('U7 묻기 창의 어둠막이 아래 창 위에 선다', async () => {
      const btn = '.chat-hdr .hsess'
      await pg.click(btn); await pg.waitForSelector('.menu.sessm', { timeout: 2000 })
      await pg.click('.menu.sessm button:has-text("이름 바꾸기")'); await pg.waitForSelector('.modal.ask', { timeout: 2000 })
      const z = await pg.evaluate(() => { const m = document.querySelector('.modal.ask'); const b = m?.previousElementSibling; return { modal: Number(getComputedStyle(m).zIndex), back: b?.classList.contains('backdrop') ? Number(getComputedStyle(b).zIndex) : -1, plain: 42 } })
      must(z.back > z.plain && z.back < z.modal, '묻기 창의 어둠막이 보통 창(42)보다 아래다 ' + JSON.stringify(z))
      await esc(); must(await gone('.modal.ask'), '묻기 창이 ⎋ 로 안 닫혔다(입력칸에 초점)')
    })
    if (shots) await pg.screenshot({ path: join(shots, 'uxui-eight-desktop.png') })
    must(!perrs.length, '화면 오류: ' + perrs.slice(0, 2).join(' | '))
    await pg.close()

    // ── 폰 ─────────────────────────────────────────────────────────────────────
    await check('U6 폰 설정 — 보이는 입력칸의 글자가 16px 이상 · 가로로 안 넘친다', async () => {
      const ph = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
      try {
        await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await ph.goto(base + '/'); await ph.waitForSelector('.mtop .rb.setb', { timeout: 10000 }); await wait(400)
        await ph.click('.mtop .rb.setb'); await ph.waitForSelector('.setp .sec-row', { timeout: 4000 }); await wait(300)
        const n = await ph.$$eval('.setp .sec-row', (r) => r.length)
        must(n >= 5, '폰 설정 목차가 없다 — 검사 전제')
        const small = []; let seen = 0
        for (let i = 0; i < n; i++) {
          const row = (await ph.$$('.setp .sec-row'))[i]; const name = (await row.textContent()).trim().slice(0, 12)
          await row.click(); await wait(350)
          const r = await ph.evaluate(() => { const out = []; for (const el of document.querySelectorAll('.setp input:not([type=checkbox]):not([type=radio]):not([type=range]), .setp select, .setp textarea')) { const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue; out.push({ c: el.className || el.tagName, fs: parseFloat(getComputedStyle(el).fontSize) }) } return { out, dw: document.documentElement.scrollWidth, iw: innerWidth } })
          seen += r.out.length
          for (const x of r.out) if (x.fs < 16) small.push(`${name}: ${x.c} ${x.fs}px`)
          if (r.dw > r.iw) small.push(`${name}: 가로로 넘친다 ${r.dw} > ${r.iw}`)
          const back = await ph.$('.setp-h .ib'); if (back) { await back.click(); await wait(250) }
        }
        must(seen >= 3, `폰 설정에서 입력칸을 ${seen}개밖에 못 봤다 — 검사가 헛돈다`)
        must(!small.length, '16px 보다 작은 입력칸: ' + small.slice(0, 8).join(' · '))
        if (shots) await ph.screenshot({ path: join(shots, 'uxui-eight-phone-settings.png') })
      } finally { await ph.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  try { await uxuiEight({ br, shots: 'test/tmp', check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' | ')) } finally { await br?.close() }
  console.log(`\n${red ? '🔴' : '✅'} 고장 여덟 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
