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
 * 2026-11-13 «부품 넷» 둘째 묶음(창의 한 틀)도 여기서 잰다 — 같은 창들을 돌기 때문이다.
 *   M1 창 열 개의 폭은 480 · 720 · 1080 중 하나 · 바깥 누르기와 오른쪽 위 ✕ 로도 닫힌다(찾기는 ✕ 없이 — 예외)
 *   M2 루틴 편집 — [취소][저장] 은 발 오른쪽 끝 · 지우기는 발 왼쪽 빨간 테두리 · 푸시는 «켬 | 끔» · 한 줄 칸의 ⏎ 로 저장
 *   M3 하나만 고르는 거르기는 세그먼트 · 체크는 한 모양 · 루틴 창에 이모지가 없다 · 상황판 «루틴» 은 단추
 *   M4 폰 루틴 편집 — ✕ 44px · [취소][저장] 은 하단 탭 바로 위에 반씩 · 지우기는 본문 맨 아래
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
      await pg.click('.panel .kv:has-text("아침 정리")'); await pg.waitForSelector('.modal.rted .modal-h', { timeout: 3000 }); await wait(250)
    }
    await check('U2 루틴 편집 — ⎋ 로 닫힌다 · 고친 것이 있으면 묻고, 그 위의 ⎋ 는 확인창만 닫는다', async () => {
      await openRoutineEdit(); await blur(); await esc()
      must(await gone('.modal.rted .modal-h'), '고친 것이 없는데 ⎋ 로 안 닫혔다')
      must(!(await pg.$('.modal.conf')), '고친 것이 없는데 확인창이 떴다')
      await openRoutineEdit()
      const prompt = await pg.$('.modal.rted textarea'); must(prompt, '루틴 편집에 프롬프트 칸이 없다 — 검사 전제')
      await prompt.fill('훑어 줘 — 고침'); await blur(); await esc()
      await pg.waitForSelector('.modal.conf', { timeout: 2000 }).catch(() => { throw new Error('고친 것이 있는데 ⎋ 가 묻지 않았다') })
      must(await pg.$('.modal.rted .modal-h'), '확인창이 뜨면서 루틴 편집이 닫혔다')
      // 확인창의 어둠막이 시트를 덮는다 — 안 덮으면 시트의 «저장»·«취소» 가 그대로 눌려 확인창만 혼자 남는다(11/13 검토)
      const cover = await pg.evaluate(() => { const s = document.querySelector('.modal.rted').getBoundingClientRect(); return String(document.elementFromPoint(s.left + 16, s.top + 16)?.className ?? '') })
      must(/backdrop/.test(cover), '확인창이 떴는데 루틴 편집이 어두워지지 않는다(어둠막이 시트 아래) — 그 자리에 있는 것: ' + cover)
      await esc()
      must(await gone('.modal.conf'), '확인창이 ⎋ 로 안 닫혔다')
      must(await pg.$('.modal.rted .modal-h'), '⎋ 한 번에 확인창과 루틴 편집이 둘 다 닫혔다')
      // 바깥 누르기도 같은 길 — 묻는다 → «버리고 닫기»
      await pg.mouse.click(8, 450)
      await pg.waitForSelector('.modal.conf', { timeout: 2000 }).catch(() => { throw new Error('고친 것이 있는데 바깥 누르기가 묻지 않았다') })
      await pg.click('.modal.conf .modal-f [data-conf="ok"]')
      must(await gone('.modal.rted .modal-h'), '«버리고 닫기» 뒤에도 루틴 편집이 남았다')
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
      const del = await pg.evaluate(() => { const b = [...document.querySelectorAll('.modal.rted .rtdel.in-foot')].find((x) => /삭제|지우기/.test(x.textContent ?? '')); if (!b) return null; const probe = document.createElement('i'); probe.style.color = 'var(--err)'; document.body.appendChild(probe); const want = getComputedStyle(probe).color; probe.remove(); return { got: getComputedStyle(b).color, want } })
      must(del, '루틴 편집에 지우기 단추가 없다 — 검사 전제')
      must(del.got === del.want, `루틴 지우기 단추가 빨강이 아니다 ${JSON.stringify(del)}`)
      await blur(); await esc(); must(await gone('.modal.rted .modal-h'), '루틴 편집이 안 닫혔다')
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
    // ── 부품 넷 둘째 묶음 «창의 한 틀» (2026-11-13) ─────────────────────────────────
    // 창 열 개는 폭이 셋(480 · 720 · 1080) 중 하나이고, 닫는 길이 셋(⎋ 는 U1 · 바깥 누르기 · 오른쪽 위 ✕)이다.
    // 찾기는 ✕ 없이 둔다(팔레트는 ⎋ 가 관례 — 기획서의 예외).
    const FRAME = [
      ['알림', () => pg.click('.sbtiles .t-note'), '.modal.nmodal', 480],
      ['폴더봇', () => pg.click('.sbtiles .t-fold'), '.modal.fsheet', 480],
      ['찾기', () => pg.click('.nav.nsearch'), '.modal.pal.srch', 720, 'noX'],
      ['폴더 선택', () => pg.keyboard.press('Meta+Shift+N'), '.modal.pk', 720],
      ['할 일', () => pg.click('.sbtiles .t-todo'), '.modal.board:not(.rt):not(.cx)', 720],
      ['루틴 편집', () => openRoutineEdit(), '.modal.rted', 720],
      ['세션', () => pg.click('.sbtiles .t-sess'), '.modal.clean', 1080],
      ['설정', () => pg.keyboard.press('Meta+,'), '.modal.setw', 1080],
      ['루틴', () => pg.click('.rtline'), '.modal.rt', 1080],
      ['상황판', () => pg.click('.cx-open'), '.modal.cx', 1080]
    ]
    await check('M1 창의 한 틀 — 폭은 480 · 720 · 1080 중 하나 · 바깥 누르기와 ✕ 로도 닫힌다', async () => {
      const bad = []
      for (const [name, open, sel, want, noX] of FRAME) {
        await open()
        try { await pg.waitForSelector(sel, { timeout: 3000 }) } catch { throw new Error(`«${name}» 창이 안 열렸다(${sel}) — 검사 전제`) }
        await wait(250); await blur()
        const w = await pg.evaluate((q) => Math.round(document.querySelector(q).getBoundingClientRect().width), sel)
        if (w !== want) bad.push(`${name}: 폭 ${w} (바라는 값 ${want})`)
        await pg.mouse.click(4, 450)   // 화면 왼쪽 끝 = 어둠막(가장 넓은 창도 1440 화면에서 양옆 180 이 남는다)
        if (!(await gone(sel))) { bad.push(`${name}: 바깥을 눌러도 안 닫힌다`); await esc(); await gone(sel) }
        if (noX) continue
        await open(); await pg.waitForSelector(sel, { timeout: 3000 }); await wait(250)
        const x = await pg.evaluate((q) => { const b = document.querySelector(q + ' .mx'); if (!b) return null; const r = b.getBoundingClientRect(), m = document.querySelector(q).getBoundingClientRect(); return { right: Math.round(m.right - r.right), top: Math.round(r.top - m.top), label: b.getAttribute('aria-label') } }, sel)
        if (!x) { bad.push(`${name}: 오른쪽 위 ✕ 가 없다`); await esc(); await gone(sel); continue }
        if (x.right > 28 || x.top > 28 || x.label !== '닫기') bad.push(`${name}: ✕ 자리·이름이 다르다 ${JSON.stringify(x)}`)
        await pg.click(sel + ' .mx')
        if (!(await gone(sel))) { bad.push(`${name}: ✕ 로 안 닫힌다`); await esc(); await gone(sel) }
        if (await pg.$('.backdrop')) bad.push(name + ': 어둠막이 남았다')
      }
      must(!bad.length, bad.join(' · '))
    })

    await check('M2 루틴 편집 — [취소][저장] 은 발 오른쪽 끝 · 지우기는 발 왼쪽 빨간 테두리 · 푸시는 «켬 | 끔» · 한 줄 칸의 ⏎ 로 저장', async () => {
      await openRoutineEdit()
      try {
      const f = await pg.evaluate(() => {
        const m = document.querySelector('.modal.rted'); const foot = m.querySelector('.modal-f').getBoundingClientRect(); const head = m.querySelector('.modal-h')
        const r = (q) => { const e = m.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), shown: b.width > 0 } }
        const save = m.querySelector('[data-rt="save"]'), del = m.querySelector('.rtdel.in-foot')
        const probe = document.createElement('i'); probe.style.color = 'var(--w)'; document.body.appendChild(probe); const white = getComputedStyle(probe).color; probe.style.color = 'var(--err)'; const red = getComputedStyle(probe).color; probe.remove()
        return {
          headBtns: head.querySelectorAll('.btn').length, save: r('[data-rt="save"]'), cancel: r('[data-rt="cancel"]'), del: r('.rtdel.in-foot'), delBody: r('.rtdel.in-body'),
          foot: { l: Math.round(foot.left), r: Math.round(foot.right), t: Math.round(foot.top), b: Math.round(foot.bottom) },
          saveBg: getComputedStyle(save).backgroundColor, white, delBorder: getComputedStyle(del).color, delLine: getComputedStyle(del).borderTopWidth, red,
          selects: m.querySelectorAll('.rtform select').length, seg: [...m.querySelectorAll('.rtpush button')].map((b) => b.textContent), segOn: m.querySelector('.rtpush button.on')?.textContent ?? '',
          grid: [...m.querySelectorAll('.apgrid .preset')].map((p) => Math.round(p.getBoundingClientRect().top)), sub: m.querySelector('.modal-h .t small')?.textContent ?? ''
        }
      })
      must(f.headBtns === 0, `머리줄에 단추가 남아 있다 ${f.headBtns}`)
      must(f.save && f.cancel && f.save.t >= f.foot.t && f.save.b <= f.foot.b, '[저장] 이 발 안에 없다 ' + JSON.stringify(f))
      must(f.foot.r - f.save.r <= 20 && f.cancel.r <= f.save.l, '[취소][저장] 이 발 오른쪽 끝에 순서대로 서 있지 않다 ' + JSON.stringify({ foot: f.foot, save: f.save, cancel: f.cancel }))
      must(f.saveBg === f.white, `[저장] 이 흰 주 단추가 아니다 ${f.saveBg}`)
      must(f.del?.shown && f.del.l - f.foot.l <= 20 && f.delBorder === f.red && f.delLine === '1px', '«이 루틴 지우기» 가 발 왼쪽의 빨간 테두리 단추가 아니다 ' + JSON.stringify({ del: f.del, b: f.delBorder }))
      must(!f.delBody?.shown, '데스크톱인데 본문에도 지우기 단추가 보인다')
      must(f.selects === 0 && f.seg.join('|') === '켬|끔' && f.segOn === '켬', '푸시가 «켬 | 끔» 세그먼트가 아니다 ' + JSON.stringify({ s: f.selects, seg: f.seg, on: f.segOn }))
      must(f.grid.length === 4 && f.grid[0] === f.grid[1] && f.grid[2] === f.grid[3] && f.grid[2] > f.grid[0], '승인 수준 네 칸이 두 줄 둘씩이 아니다 ' + JSON.stringify(f.grid))
      must(/1개/.test(f.sub) && /\.bot\.yml/.test(f.sub), '머리줄 설명에 개수와 정본 위치가 없다 ' + f.sub)
      if (shots) await pg.screenshot({ path: join(shots, 'parts2-routine-desktop.png') })
      // 세그먼트로 끄면 고친 것이 되고, 한 줄 칸의 ⏎ 가 저장한다
      await pg.click('.modal.rted .rtpush button:has-text("끔")'); await wait(100)
      await pg.focus('.modal.rted .rtform .field input'); await pg.keyboard.press('Enter')
      must(await gone('.modal.rted'), '이름 칸에서 ⏎ 를 눌러도 저장하고 닫히지 않는다')
      const saved = (await api('/bots')).find((b) => b.id === bot.id)?.routines?.[0]
      must(saved && saved.push === false, '⏎ 로 저장한 값이 호스트에 없다 ' + JSON.stringify(saved))
      // 여러 줄 칸의 ⏎ 는 줄바꿈이다(저장하지 않는다)
      await openRoutineEdit(); await pg.focus('.modal.rted textarea'); await pg.keyboard.press('End'); await pg.keyboard.press('Enter'); await wait(300)
      must(await pg.$('.modal.rted'), '무엇을 칸의 ⏎ 가 창을 닫았다(줄바꿈이어야 한다)')
      await pg.click('.modal.rted [data-rt="cancel"]'); must(await gone('.modal.rted'), '[취소] 로 안 닫혔다')
      } finally { if (await pg.$('.modal.conf')) { await esc() } if (await pg.$('.modal.rted')) { await pg.click('.modal.rted [data-rt="cancel"]'); await gone('.modal.rted') } }
      await api(`/bots/${bot.id}/routines`, { routines: [{ name: '아침 정리', cron: '0 9 * * *', prompt: '훑어 줘' }] }, 'PUT')
    })

    await check('M3 고르기와 체크 — 알림 · 할 일 · 폴더 선택의 거르기는 세그먼트 · 세션 창의 체크는 한 모양 · 루틴 창에 이모지가 없다 · 상황판 «루틴» 은 탭이 아니라 단추', async () => {
      const bad = []
      const segOf = async (name, open, sel, seg, n) => {
        await open(); await pg.waitForSelector(sel, { timeout: 3000 }); await wait(250)
        const s = await pg.evaluate(([q, g]) => { const e = document.querySelector(q + ' ' + g); return e ? { role: e.getAttribute('role'), btn: e.querySelectorAll('button').length, on: e.querySelectorAll('button.on').length, cls: e.className } : null }, [sel, seg])
        if (!s || !/\bseg\b/.test(s.cls) || s.role !== 'radiogroup' || s.btn !== n || s.on !== 1) bad.push(`${name}: 거르기가 세그먼트(${n}칸 · 하나 켜짐)가 아니다 ${JSON.stringify(s)}`)
        if (shots) await pg.screenshot({ path: join(shots, `parts2-${name.replace(/\s/g, '')}-desktop.png`) })
        await esc(); await gone(sel)
      }
      await segOf('알림', () => pg.click('.sbtiles .t-note'), '.modal.nmodal', '.modal-bar .seg', 2)
      await segOf('할일', () => pg.click('.sbtiles .t-todo'), '.modal.board:not(.rt):not(.cx)', '.modal-bar .seg', 3)
      await segOf('폴더선택', () => pg.keyboard.press('Meta+Shift+N'), '.modal.pk', '.fl .seg', 3)
      // 세션 창의 체크
      await pg.click('.sbtiles .t-sess'); await pg.waitForSelector('.modal.clean', { timeout: 3000 }); await wait(300)
      const ck = await pg.evaluate(() => [...document.querySelectorAll('.modal.clean input[type=checkbox]')].slice(0, 3).map((c) => { const st = getComputedStyle(c); return { w: st.width, h: st.height, r: st.borderTopLeftRadius, ap: st.appearance || st.webkitAppearance, cls: c.className } }))
      if (!ck.length || ck.some((c) => c.w !== '16px' || c.h !== '16px' || c.r !== '4px' || c.ap !== 'none')) bad.push('세션 창의 체크가 네모 16 · 둥글기 4 가 아니다 ' + JSON.stringify(ck[0] ?? null))
      if (shots) await pg.screenshot({ path: join(shots, 'parts2-세션-desktop.png') })
      await esc(); await gone('.modal.clean')
      // 루틴 창
      await pg.click('.rtline'); await pg.waitForSelector('.modal.rt .rtbar .seg', { timeout: 4000 }); await pg.click('.modal.rt .rtbar .seg button:nth-child(2)'); await pg.waitForSelector('.modal.rt .gh', { timeout: 4000 }); await wait(300)
      const rt = await pg.evaluate(() => { const m = document.querySelector('.modal.rt'); return { emoji: /[\u{1F534}\u{1F7E0}-\u{1F7E2}\u{26AA}\u{23F0}\u{23F8}]/u.test(m.textContent ?? ''), dots: m.querySelectorAll('.gh .sdot, .gh svg').length, heads: m.querySelectorAll('.gh').length, icon: !!m.querySelector('.modal-h .t b svg'), title: m.querySelector('.modal-h .t b')?.textContent ?? '' } })
      if (rt.emoji || !rt.icon || rt.title !== '루틴' || rt.dots < rt.heads || !rt.heads) bad.push('루틴 창에 이모지가 남았거나 상태 점이 없다 ' + JSON.stringify(rt))
      if (shots) await pg.screenshot({ path: join(shots, 'parts2-루틴-desktop.png') })
      await esc(); await gone('.modal.rt')
      // 상황판
      await pg.click('.cx-open'); await pg.waitForSelector('.modal.cx .cx-tab', { timeout: 4000 }); await wait(300)
      const cx = await pg.evaluate(() => { const m = document.querySelector('.modal.cx'); return { tabs: [...m.querySelectorAll('.cx-tab button')].map((b) => b.textContent), rt: !!m.querySelector('.modal-h .btn.cx-rt') } })
      if (cx.tabs.includes('루틴') || cx.tabs.length !== 2 || !cx.rt) bad.push('상황판의 «루틴» 이 아직 탭 줄에 있다 ' + JSON.stringify(cx))
      if (shots) await pg.screenshot({ path: join(shots, 'parts2-상황판-desktop.png') })
      await pg.click('.modal.cx .cx-rt'); await pg.waitForSelector('.modal.rt', { timeout: 3000 }).catch(() => bad.push('상황판의 «루틴» 단추가 루틴 창을 안 연다'))
      await esc(); await gone('.modal.rt')
      // 설정 — 켬 | 끔
      await pg.keyboard.press('Meta+,'); await pg.waitForSelector('.modal.setw', { timeout: 3000 }); await wait(300)
      if (shots) await pg.screenshot({ path: join(shots, 'parts2-설정-desktop.png') })
      await blur(); await esc(); await gone('.modal.setw')
      must(!bad.length, bad.join(' · '))
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
    await check('M4 폰 — 루틴 편집은 ✕ 44px · [취소][저장] 이 하단 탭 바로 위에 반씩 · 지우기는 본문 맨 아래 / 알림 · 할 일 · 세션 · 폴더봇 창도 화면 안 · ✕ 44px', async () => {
      const ph = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
      try {
        await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await ph.goto(`${base}/#bot=${bot.id}&s=${s1.id}`); await ph.waitForSelector('.tabbar [data-tab="files"]', { timeout: 10000 }); await wait(500)
        await ph.click('.tabbar [data-tab="files"]'); await wait(500)
        if (!(await ph.$('.panel .kv:has-text("아침 정리")'))) await ph.click('.panel .sech:has-text("루틴")')
        await ph.click('.panel .kv:has-text("아침 정리")'); await ph.waitForSelector('.modal.rted .modal-h', { timeout: 4000 }); await wait(400)
        const f = await ph.evaluate(() => {
          const m = document.querySelector('.modal.rted'); const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
          const save = m.querySelector('[data-rt="save"]'); const sc = save.getBoundingClientRect()
          const hit = document.elementFromPoint(sc.left + sc.width / 2, sc.top + sc.height / 2)
          return { modal: R(m), tab: R(document.querySelector('.tabbar')), x: R(m.querySelector('.mx')), save: R(save), cancel: R(m.querySelector('[data-rt="cancel"]')), delFoot: R(m.querySelector('.rtdel.in-foot')), delBody: R(m.querySelector('.rtdel.in-body')), kh: [...m.querySelectorAll('.modal-f .kh')].some((k) => k.getBoundingClientRect().width > 0), hitSave: !!hit && save.contains(hit), vw: innerWidth, sw: document.documentElement.scrollWidth, list: R(m.querySelector('.rtlist')), form: R(m.querySelector('.rtform')) }
        })
        must(f.tab && f.modal.b <= f.tab.t, '창이 하단 탭 밑으로 들어간다 ' + JSON.stringify({ m: f.modal, tab: f.tab }))
        must(f.hitSave, '[저장] 이 다른 것에 덮여 눌리지 않는다')
        must(f.x && f.x.w >= 44 && f.x.h >= 44, '✕ 가 44px 자리가 아니다 ' + JSON.stringify(f.x))
        must(f.save.h >= 44 && f.cancel.h >= 44 && Math.abs(f.save.w - f.cancel.w) <= 2 && f.cancel.r <= f.save.l && f.save.t === f.cancel.t, '[취소][저장] 이 반씩 · 44px 로 서 있지 않다 ' + JSON.stringify({ s: f.save, c: f.cancel }))
        must(f.tab.t - f.save.b <= 28, '[저장] 이 하단 탭 바로 위가 아니다 ' + JSON.stringify({ save: f.save, tab: f.tab }))
        must(!f.delFoot?.w && f.delBody?.w > 0, '폰인데 지우기가 발에 있거나 본문에 없다 ' + JSON.stringify({ foot: f.delFoot, body: f.delBody }))
        must(!f.kh, '폰인데 키 안내(esc · ⏎)가 보인다')
        must(f.sw <= f.vw, `가로로 넘친다 ${f.sw} > ${f.vw}`)
        must(f.list.b <= f.form.t + 1 && f.form.w >= f.vw - 40, '목록 아래에 편집 칸이 화면 폭으로 서 있지 않다 ' + JSON.stringify({ list: f.list, form: f.form }))
        if (shots) await ph.screenshot({ path: join(shots, 'parts2-routine-phone.png') })
        // 본문 맨 아래까지 내리면 지우기 단추가 보인다
        await ph.evaluate(() => { const b = document.querySelector('.modal.rted .rtform'); b.scrollTop = b.scrollHeight }); await wait(200)
        const d = await ph.evaluate(() => { const m = document.querySelector('.modal.rted'); const e = m.querySelector('.rtdel.in-body').getBoundingClientRect(); const foot = m.querySelector('.modal-f').getBoundingClientRect(); return { b: Math.round(e.bottom), foot: Math.round(foot.top), h: Math.round(e.height) } })
        must(d.b <= d.foot && d.h >= 40, '본문 맨 아래의 지우기 단추가 발에 가리거나 작다 ' + JSON.stringify(d))
        if (shots) await ph.screenshot({ path: join(shots, 'parts2-routine-phone-bottom.png') })
        await ph.click('.modal.rted .mx'); await wait(400)
        must(!(await ph.$('.modal.rted')), '폰에서 ✕ 로 안 닫힌다')
        // 틀로 옮긴 다른 창 — 폰에서도 화면 안에 서고, ✕ 가 44px 자리이며 ✕ 로 닫힌다
        const badp = []
        const p2 = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
        try {
        await p2.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await p2.goto(base + '/'); await p2.waitForSelector('.mhome .mcards .t-note', { timeout: 10000 }); await wait(400)
        for (const [name, tile, sel] of [['알림', '.t-note', '.modal.nmodal'], ['할일', '.t-todo', '.modal.board'], ['세션', '.t-sess', '.modal.clean'], ['폴더봇', '.t-fold', '.modal.fsheet']]) {
          await p2.click('.mhome .mcards ' + tile)
          try { await p2.waitForSelector(sel, { timeout: 4000 }) } catch { badp.push(`${name}: 창이 안 열렸다`); continue }
          await wait(350)
          const g = await p2.evaluate((q) => {
            const m = document.querySelector(q).getBoundingClientRect(); const x = document.querySelector(q + ' .mx')?.getBoundingClientRect()
            const hit = x ? document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2) : null
            return { l: Math.round(m.left), r: Math.round(m.right), t: Math.round(m.top), b: Math.round(m.bottom), vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, x: x ? { w: Math.round(x.width), h: Math.round(x.height), r: Math.round(x.right), t: Math.round(x.top) } : null, hit: !!hit?.closest('.mx') }
          }, sel)
          if (g.l < 0 || g.r > g.vw || g.t < 0 || g.b > g.vh || g.sw > g.vw) badp.push(`${name}: 화면 밖으로 나간다 ${JSON.stringify(g)}`)
          if (!g.x || g.x.w < 44 || g.x.h < 44 || g.x.r > g.vw || g.x.t < 0 || !g.hit) badp.push(`${name}: ✕ 가 44px 자리가 아니거나 가려졌다 ${JSON.stringify({ x: g.x, hit: g.hit })}`)
          if (shots) await p2.screenshot({ path: join(shots, `parts2-${name}-phone.png`) })
          await p2.click(sel + ' .mx'); await wait(400)
          if (await p2.$(sel)) { badp.push(`${name}: ✕ 로 안 닫힌다`); await p2.keyboard.press('Escape'); await wait(300) }
        }
        } finally { await p2.close() }
        must(!badp.length, badp.join(' · '))
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
