/**
 * ═══ 오른쪽 패널 (2026-11-13 Dave 카드 «이대로 만든다» · 가안 둘째 묶음) ══════════════════════════════
 *
 * 오른쪽은 폴더의 것 셋 — 개요 · 할 일 · 파일 — 과 도구 막대(루틴 · 명령·스킬 · ⋯).
 *   R1 호스트 — 개요는 폴더에 있는 것만 모은다(state.md 의 «현재 목표» 줄 그대로 · 제안 수 · 가장 이른 마감)
 *   R2 state.md 가 없어도 칸이 선다 — «없어요 — 봇에게 정리를 시키기» · 누르면 입력칸에 말이 채워진다 · 파일이 생기면 따라 바뀐다
 *   R3 데스크톱 — 위에서부터 개요 · 할 일 · 파일 · 도구 막대 · 옛 절(명령·스킬 · 루틴 · «이 봇» 줄)과 높이 손잡이가 없다 · 가로 넘침 없음
 *   R4 할 일이 많으면 칸이 패널의 45% 를 넘지 않고 «＋N 더»(N = 가려진 줄 수) · 누르면 펼쳐지고 «접기» · 파일 칸은 160px 이상 남는다
 *   R5 할 일이 적으면 칸이 내용만큼이고 «＋N 더» 가 없다
 *   R6 도구 막대 — 루틴 · 명령·스킬 · ⋯ 가 그 자리에 뜬다 · 같은 단추 · ⎋ · 바깥으로 닫힌다 · 루틴 줄을 누르면 그 루틴 창
 *   R7 내 답을 기다리는 세션이 생기면 «답 대기 1» · 누르면 그 세션으로 · 봇이 만든 파일이 «최근 만든 것» 에 선다
 *   R8 폰 — «폴더» 탭은 개요 · 파일 · 도구 막대(명령·스킬 없음 · 단추 44px · 하단 탭 위) · «할 일» 탭에는 개요도 도구 막대도 없다
 *   R9 오케스트레이터 패널은 개요 자리를 비운다 · 도구 막대에 명령·스킬이 없다
 *
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔). 스모크가 불러 쓰고(`rightPanel`), 혼자서도 돈다(`node test/right-panel.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }
const GOAL = 'PRD v1.0 확정을 앞두고 Q2·Q5 답을 기다리는 중'
const STATE = `# Project State\n\n> 마지막 갱신: 2026-11-13 15:40\n> 상태: 진행 중\n> 현재 목표: ${GOAL}\n\n## 완료\n`

export async function rightPanel({ br, check, port = 7485, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-rp-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-rp-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-rp-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-rp-cc-'))
  const REL = '3. Area/제품_Rondo', abs = join(root, REL)
  for (const d of ['1. Inbox', '2. Projects', REL, `${REL}/01_기획`, '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(abs, 'CLAUDE.md'), '# x\n'); writeFileSync(join(abs, 'readme.md'), '# 읽어 보기\n'); writeFileSync(join(abs, '01_기획/기획안.md'), '# 기획\n')
  writeFileSync(join(abs, 'todo.md'), '- [ ] 할 일 하나: 설명\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(process.cwd(), 'test/fixtures/no-such-codex'), CLAUDE_CONFIG_DIR: claudeCfg }
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${p} → ${r.status} ${JSON.stringify(j).slice(0, 160)}`); return j }
  const until = async (f, msg, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await f()) return; await wait(100) } throw new Error('기다리다 끝남 — ' + msg) }
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(base + '/api/health'); up = true } catch { await wait(150) } }
    must(up, '검사 전제 깨짐 — 호스트가 안 떴다 ' + out.slice(-200))
    const bot = await api('/bots/start', { rel: REL })
    await api(`/bots/${bot.id}/routines`, { routines: [{ name: '아침 정리', cron: '0 9 * * *', prompt: '훑어 줘' }] }, 'PUT')
    const s1 = await api(`/bots/${bot.id}/sessions`, { name: '첫 세션' })
    const ovw = () => api(`/bots/${bot.id}/overview`)

    await check('R1 호스트 — 개요는 폴더에 있는 것만 모은다(«현재 목표» 줄 그대로 · 제안 수 · 가장 이른 마감)', async () => {
      const a = await ovw()
      must(a.hasState === false && a.goal === undefined && a.goalAt === undefined && a.mine.asks === 0 && a.mine.proposed === 0 && a.mine.due === undefined && Array.isArray(a.recent) && !a.recent.length, 'state.md 가 없을 때 ' + JSON.stringify(a))
      writeFileSync(join(abs, 'todo.md'), '- [ ] PRD v1.0 확정: 답 받기 📅 2026-11-21\n- [ ] 가격표 확정 📅 2026-11-30\n- [ ] 화면 캡처 정리 <!-- bot:proposed 2026-11-13 -->\n- [x] 끝난 일 📅 2026-11-01\n')
      writeFileSync(join(abs, 'state.md'), STATE)
      const b = await ovw()
      must(b.hasState === true && b.goal === GOAL && typeof b.goalAt === 'number' && b.goalAt > 0, '목표 줄 ' + JSON.stringify(b))
      must(b.mine.proposed === 1 && b.mine.due === '2026-11-21' && b.mine.asks === 0, '내가 나설 곳 ' + JSON.stringify(b.mine))
      writeFileSync(join(abs, 'state.md'), '# 메모만\n')
      const c = await ovw(); must(c.hasState === true && c.goal === undefined, '목표 줄이 없는 state.md ' + JSON.stringify(c))
    })
    if (!br) return

    // ── 화면 — state.md 가 없는 채로 시작한다
    execSync(`rm -f ${JSON.stringify(join(abs, 'state.md'))}`)
    const pg = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const perrs = []; pg.on('pageerror', (e) => perrs.push(e.message))
    await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
    await pg.goto(`${base}/#bot=${bot.id}&s=${s1.id}`)
    await pg.waitForSelector('.composer', { timeout: 10000 })
    await pg.waitForSelector('.panel .ovw', { timeout: 5000 })
    const ovText = () => pg.evaluate(() => (document.querySelector('.panel .ovw')?.textContent ?? '').replace(/\s+/g, ' ').trim())
    const closed = async (sel) => { for (let t = 0; t < 2000; t += 100) { if (!(await pg.$(sel))) return true; await wait(100) } return false }

    await check('R2 state.md 가 없어도 칸이 선다 — 누르면 입력칸에 말이 채워진다 · 파일이 생기면 따라 바뀐다', async () => {
      await until(async () => /state\.md 가 없어요/.test(await ovText()), '안내 줄이 안 선다 · ' + await ovText())
      if (shots) await pg.screenshot({ path: join(shots, 'rp-2-state-없음-desktop.png') })
      await pg.click('.panel .ovw .onone'); await wait(300)
      const filled = await pg.evaluate(() => document.querySelector('.composer .cin')?.value ?? document.querySelector('.composer .cin')?.textContent ?? '')
      must(/state\.md/.test(filled), '입력칸에 말이 안 채워졌다 ' + JSON.stringify(filled))
      await pg.evaluate(() => { const c = document.querySelector('.composer .cin'); if (c && 'value' in c) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; set?.call(c, ''); c.dispatchEvent(new Event('input', { bubbles: true })) } })
      // 파일이 생기면(봇이든 사람이든) 칸이 따라온다 — 호스트의 파일 감시 → 다시 받기
      await api(`/bots/${bot.id}/file`, { rel: 'state.md', text: STATE, force: true })
      await until(async () => (await ovText()).includes(GOAL), '목표 줄이 안 따라온다 · ' + await ovText(), 8000)
    })

    await check('R3 데스크톱 — 위에서부터 개요 · 할 일 · 파일 · 도구 막대 · 옛 절과 높이 손잡이가 없다 · 가로 넘침 없음', async () => {
      const o = await pg.evaluate(() => {
        const p = document.querySelector('.panel'); const top = (s) => p.querySelector(s)?.getBoundingClientRect().top ?? -1
        const og = p.querySelector('.ovw .og'); const lh = og ? parseFloat(getComputedStyle(og).lineHeight) : 0
        return { ov: top('.ovw'), todo: top('.sec.tclamp'), files: top(':scope > .sec.grow'), bar: top('.ptools'), barB: p.querySelector('.ptools')?.getBoundingClientRect().bottom ?? 0, pB: p.getBoundingClientRect().bottom,
          sech: [...p.querySelectorAll('.sech')].map((e) => (e.querySelector('span')?.textContent ?? '').trim()), divyCursor: [...p.querySelectorAll('.divy')].map((d) => getComputedStyle(d).cursor), fixStyle: p.querySelectorAll('.sec[style*="height"]:not([style*="max-height"])').length,
          text: (p.querySelector('.ovw')?.textContent ?? '').replace(/\s+/g, ' '), ogLines: og && lh ? Math.round(og.getBoundingClientRect().height / lh) : 0, bar2: [...p.querySelectorAll('.ptools .tb')].map((b) => (b.textContent ?? '').trim() || b.getAttribute('aria-label')),
          sw: p.scrollWidth, cw: p.clientWidth, docSw: document.documentElement.scrollWidth, vw: innerWidth }
      })
      must(o.ov > 0 && o.ov < o.todo && o.todo < o.files && o.files < o.bar, '순서 ' + JSON.stringify(o))
      must(Math.abs(o.barB - o.pB) <= 1, '도구 막대가 패널 바닥에 안 붙었다 ' + JSON.stringify({ barB: o.barB, pB: o.pB }))
      must(JSON.stringify(o.sech) === JSON.stringify(['할 일', '파일']), '절 머리가 할 일 · 파일 둘이 아니다 ' + JSON.stringify(o.sech))
      must(o.divyCursor.every((c) => c !== 'row-resize') && o.fixStyle === 0, '높이 손잡이·고정 높이가 남았다 ' + JSON.stringify(o))
      must(o.text.includes('개요') && o.text.includes(GOAL) && /내가 나설 곳 1/.test(o.text) && /제안 1/.test(o.text) && /마감/.test(o.text) && /state\.md · todo\.md · \d+\/\d+ \d\d:\d\d/.test(o.text), '개요 글 ' + JSON.stringify(o.text))
      must(o.ogLines >= 1 && o.ogLines <= 3, '목표 줄이 세 줄을 넘는다 ' + o.ogLines)
      must(JSON.stringify(o.bar2) === JSON.stringify(['루틴 1', '명령 · 스킬', '이 봇']), '도구 막대 ' + JSON.stringify(o.bar2))
      must(o.sw <= o.cw + 1 && o.docSw <= o.vw, '가로 넘침 ' + JSON.stringify(o))
      if (shots) await pg.screenshot({ path: join(shots, 'rp-3-평소-desktop.png') })
    })

    await check('R4 할 일이 많으면 칸이 패널의 45% 를 넘지 않고 «＋N 더» · 누르면 펼쳐지고 «접기» · 파일 칸은 160px 이상', async () => {
      writeFileSync(join(abs, 'todo.md'), Array.from({ length: 22 }, (_, i) => `- [ ] 할 일 ${String(i + 1).padStart(2, '0')}: 설명${i === 0 ? ' 📅 2026-11-21' : ''}`).join('\n') + '\n- [ ] 화면 캡처 정리 <!-- bot:proposed 2026-11-13 -->\n')
      await pg.waitForSelector('.panel .tmore', { timeout: 6000 }); await wait(400)
      const geo = () => pg.evaluate(() => {
        const p = document.querySelector('.panel').getBoundingClientRect(); const sec = document.querySelector('.panel .sec.tclamp'); const r = sec.getBoundingClientRect(); const body = sec.querySelector(':scope > .secb').getBoundingClientRect()
        const rows = [...sec.querySelectorAll('.todo:not(.addbtn):not(.add), .tprop')]; const hid = rows.filter((x) => x.getBoundingClientRect().bottom > body.bottom + 1).length
        const f = document.querySelector('.panel > .sec.grow').getBoundingClientRect()
        return { ph: Math.round(p.height), sh: Math.round(r.height), rows: rows.length, hid, more: sec.querySelector('.tmore')?.textContent ?? null, less: !!sec.querySelector('.tless'), fh: Math.round(f.height), barB: Math.round(document.querySelector('.panel .ptools').getBoundingClientRect().bottom), pB: Math.round(p.bottom), scroll: getComputedStyle(sec.querySelector(':scope > .secb')).overflowY }
      })
      const a = await geo()
      must(a.sh <= Math.round(a.ph * 0.45) + 1 && a.sh > 96, '접힌 칸 높이 ' + JSON.stringify(a))
      must(a.hid > 0 && a.more === `＋${a.hid} 더`, '«＋N 더» 의 N 이 가려진 줄 수와 다르다 ' + JSON.stringify(a))
      must(a.fh >= 160 && a.barB <= a.pB + 1, '파일 칸·도구 막대 ' + JSON.stringify(a))
      if (shots) await pg.screenshot({ path: join(shots, 'rp-4-할일-많음-desktop.png') })
      await pg.click('.panel .tmore'); await pg.waitForSelector('.panel .tless', { timeout: 3000 }); await wait(400)
      const b = await geo()
      must(b.more === null && b.less && b.sh > a.sh && b.fh >= 159 && b.barB <= b.pB + 1 && b.scroll !== 'hidden', '펼친 칸 ' + JSON.stringify(b))
      if (shots) await pg.screenshot({ path: join(shots, 'rp-4-할일-펼침-desktop.png') })
      // 펼친 것은 기억한다 — 새로 열어도 펼친 채
      await pg.reload(); await pg.waitForSelector('.panel .tless', { timeout: 8000 })
      await pg.click('.panel .tless'); await pg.waitForSelector('.panel .tmore', { timeout: 3000 }); await wait(300)
      const c = await geo(); must(c.sh <= Math.round(c.ph * 0.45) + 1 && c.more === `＋${c.hid} 더`, '다시 접은 칸 ' + JSON.stringify(c))
    })

    await check('R5 할 일이 적으면 칸이 내용만큼이고 «＋N 더» 가 없다', async () => {
      writeFileSync(join(abs, 'todo.md'), '- [ ] PRD v1.0 확정: 답 받기 📅 2026-11-21\n- [ ] 가격표 확정\n- [ ] 화면 캡처 정리 <!-- bot:proposed 2026-11-13 -->\n')
      await until(async () => !(await pg.$('.panel .tmore')), '«＋N 더» 가 안 사라진다')
      await wait(300)
      const a = await pg.evaluate(() => { const p = document.querySelector('.panel').getBoundingClientRect(); const sec = document.querySelector('.panel .sec.tclamp'); const body = sec.querySelector(':scope > .secb'); return { ph: p.height, sh: sec.getBoundingClientRect().height, fit: body.scrollHeight <= body.clientHeight + 1, less: !!sec.querySelector('.tless'), cut: sec.classList.contains('cut') } })
      must(a.fit && !a.less && !a.cut && a.sh < a.ph * 0.45, '적을 때 ' + JSON.stringify(a))
    })

    await check('R6 도구 막대 — 루틴 · 명령·스킬 · ⋯ 가 뜬다 · 같은 단추 · ⎋ · 바깥으로 닫힌다 · 루틴 줄을 누르면 그 루틴 창', async () => {
      // 루틴
      await pg.click('.ptools .tb.rt'); await pg.waitForSelector('.spop.rtpop .kv', { timeout: 3000 }); await wait(250)
      const r = await pg.evaluate(() => { const m = document.querySelector('.spop.rtpop').getBoundingClientRect(); const b = document.querySelector('.ptools .tb.rt').getBoundingClientRect(); return { when: (() => { const w = document.querySelector('.spop.rtpop .kv .rwhen'); return w && w.getBoundingClientRect().width > 4 ? (w.textContent ?? '') : '' })(), rows: [...document.querySelectorAll('.spop.rtpop .kv')].map((x) => (x.querySelector('.n')?.textContent ?? '').trim()), above: m.bottom <= b.top + 1, inVw: m.left >= 0 && m.right <= innerWidth && m.top >= 0, on: document.querySelector('.ptools .tb.rt').classList.contains('on') } })
      must(JSON.stringify(r.rows) === JSON.stringify(['아침 정리', '루틴 편집']) && r.above && r.inVw && r.on && r.when.length > 1, '루틴 목록 ' + JSON.stringify(r))
      if (shots) await pg.screenshot({ path: join(shots, 'rp-6-루틴-desktop.png') })
      await pg.click('.ptools .tb.rt'); must(await closed('.spop.rtpop'), '같은 단추로 안 닫힌다(루틴)')
      await pg.click('.ptools .tb.rt'); await pg.waitForSelector('.spop.rtpop'); await wait(200); await pg.keyboard.press('Escape'); must(await closed('.spop.rtpop'), '⎋ 로 안 닫힌다(루틴)')
      await pg.click('.ptools .tb.rt'); await pg.waitForSelector('.spop.rtpop'); await wait(200); await pg.mouse.click(500, 300); must(await closed('.spop.rtpop'), '바깥을 눌러도 안 닫힌다(루틴)')
      await pg.click('.ptools .tb.rt'); await pg.waitForSelector('.spop.rtpop .kv'); await wait(200)
      await pg.click('.spop.rtpop .kv:has-text("아침 정리")'); await pg.waitForSelector('.modal.rted', { timeout: 4000 }); await wait(300)
      must(!(await pg.$('.spop.rtpop')), '루틴 창이 떴는데 목록이 남았다')
      await pg.keyboard.press('Escape'); must(await closed('.modal.rted'), '루틴 창이 안 닫힌다')
      // 명령 · 스킬 — 다른 단추를 누르면 앞의 것이 닫히고 그것이 뜬다
      await pg.click('.ptools .tb.rt'); await pg.waitForSelector('.spop.rtpop'); await wait(200)
      await pg.click('.ptools .tb.cmd'); await pg.waitForSelector('.spop.cmdpop .hsec.cmds .hz', { timeout: 4000 }); await wait(400)
      const c = await pg.evaluate(() => { const m = document.querySelector('.spop.cmdpop').getBoundingClientRect(); return { rt: !!document.querySelector('.spop.rtpop'), head: (document.querySelector('.spop.cmdpop .ph span')?.textContent ?? ''), plus: !!document.querySelector('.spop.cmdpop .ph .nsb'), rows: [...document.querySelectorAll('.spop.cmdpop .hz .n')].map((x) => (x.textContent ?? '').trim()), inVw: m.left >= 0 && m.right <= innerWidth && m.top >= 0 && m.bottom <= innerHeight, oneLine: [...document.querySelectorAll('.spop.cmdpop .hz')].every((x) => x.getBoundingClientRect().height <= 34) } })
      must(!c.rt && c.head === '명령 · 스킬' && c.plus && c.rows.includes('CLAUDE.md') && c.inVw && c.oneLine, '명령 · 스킬 목록 ' + JSON.stringify(c))
      if (shots) await pg.screenshot({ path: join(shots, 'rp-6-명령-스킬-desktop.png') })
      await pg.keyboard.press('Escape'); must(await closed('.spop.cmdpop'), '⎋ 로 안 닫힌다(명령 · 스킬)')
      // ⋯
      await pg.click('.ptools .tb.more'); await pg.waitForSelector('body > div > .menu', { timeout: 3000 }); await wait(250)
      const m = await pg.evaluate(() => { const el = [...document.querySelectorAll('body > div > .menu')].pop(); const r = el.getBoundingClientRect(); return { t: (el.textContent ?? '').replace(/\s+/g, ' '), inVw: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight } })
      must(/색 바꾸기/.test(m.t) && /지우기/.test(m.t) && /은퇴/.test(m.t) && m.inVw, '⋯ 메뉴 ' + JSON.stringify(m))
      if (shots) await pg.screenshot({ path: join(shots, 'rp-6-이-봇-desktop.png') })
      await pg.click('.ptools .tb.more'); must(await closed('body > div > .menu'), '같은 단추로 안 닫힌다(⋯)')
    })

    await check('R7 내 답을 기다리는 세션이 생기면 «답 대기 1» · 누르면 그 세션으로 · 봇이 만든 파일이 «최근 만든 것» 에', async () => {
      const s2 = await api(`/bots/${bot.id}/sessions`, { name: '승인 세션' })
      await api(`/sessions/${s2.id}/send`, { text: '승인이 필요한 일 해 줘' })
      await until(async () => (await api(`/sessions/${s2.id}/chat`)).info.state === 'awaiting_input', '승인 대기가 안 된다')
      must((await ovw()).mine.asks === 1, '호스트 답 대기 수 ' + JSON.stringify((await ovw()).mine))
      await until(async () => /내가 나설 곳 2/.test(await ovText()) && /답 대기 1/.test(await ovText()), '«답 대기 1» 이 안 선다 · ' + await ovText(), 8000)
      must(await pg.evaluate(() => !!document.querySelector('.panel .ovw .om .dot.wait')), '기다림 점이 없다')
      if (shots) await pg.screenshot({ path: join(shots, 'rp-7-답-대기-desktop.png') })
      await pg.click('.panel .ovw .om button:has-text("답 대기")')
      await pg.waitForFunction((sid) => location.hash.includes(sid), s2.id, { timeout: 4000 })
      const chat = await api(`/sessions/${s2.id}/chat`)
      await api(`/sessions/${s2.id}/permission`, { requestId: chat.info.pending[0].requestId, allow: true })
      await until(async () => (await ovw()).recent.some((x) => x.rel === 'stub-output.md'), '호스트 «최근 만든 것» 에 없다 ' + JSON.stringify((await ovw()).recent), 8000)
      await until(async () => /최근 만든 것/.test(await ovText()) && /stub-output\.md/.test(await ovText()) && !/답 대기/.test(await ovText()), '화면이 안 따라온다 · ' + await ovText(), 8000)
      await pg.click('.panel .ovw .or button:has-text("stub-output.md")')
      await pg.waitForFunction(() => /stub-output\.md/.test(document.querySelector('.docwrap')?.textContent ?? ''), null, { timeout: 5000 })
      must(!perrs.length, '화면 오류 ' + perrs.join(' | '))
    })
    await pg.close()

    await check('R8 폰 — «폴더» 탭은 개요 · 파일 · 도구 막대(명령·스킬 없음 · 44px · 하단 탭 위) · «할 일» 탭에는 개요도 도구 막대도 없다', async () => {
      const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
      const ph = await ctx.newPage(); const errs = []; ph.on('pageerror', (e) => errs.push(e.message))
      try {
        await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await ph.goto(`${base}/#bot=${bot.id}&s=${s1.id}`)
        await ph.waitForSelector('.tabbar', { timeout: 10000 }); await wait(500)
        await ph.click('.tabbar [data-tab="files"]'); await ph.waitForSelector('.panel .ovw .og', { timeout: 6000 }); await wait(500)
        const f = await ph.evaluate(() => {
          const p = document.querySelector('.panel'); const top = (s) => p.querySelector(s)?.getBoundingClientRect().top ?? -1; const tab = document.querySelector('.tabbar').getBoundingClientRect()
          const tbs = [...p.querySelectorAll('.ptools .tb')].map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent ?? '').trim() || b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) } })
          return { ttl: p.querySelector('.hdr .ttl')?.textContent, ov: top('.ovw'), files: top(':scope > .sec.grow'), bar: top('.ptools'), todo: !!p.querySelector('.sec.tclamp, .todo'), tbs, tabT: Math.round(tab.top), sw: document.documentElement.scrollWidth, vw: innerWidth, tree: !!p.querySelector('.trow') }
        })
        must(f.ttl === '폴더' && f.ov > 0 && f.ov < f.files && f.files < f.bar && f.tree && !f.todo, '폴더 탭 순서 ' + JSON.stringify(f))
        must(JSON.stringify(f.tbs.map((x) => x.t)) === JSON.stringify(['루틴 1', '이 봇']), '폰 도구 막대(명령 · 스킬은 9/23 결정대로 뺀다) ' + JSON.stringify(f.tbs))
        must(f.tbs.every((x) => x.h >= 44 && x.w >= 44 && x.b <= f.tabT + 1) && f.sw <= f.vw, '단추 크기 · 하단 탭 · 가로 넘침 ' + JSON.stringify(f))
        if (shots) await ph.screenshot({ path: join(shots, 'rp-8-폴더-phone.png') })
        // AL(`docs/LAYOUT.md` 불변식 1) · 안전영역은 한 곳에서만 센다 — 폰의 패널은 이미 하단 탭 위에 놓이므로 도구 막대가 `--sab` 를 또 더하면 그만큼 빈 띠가 생긴다
        const gap = () => ph.evaluate(() => Math.round(document.querySelector('.tabbar').getBoundingClientRect().top - Math.max(...[...document.querySelectorAll('.panel .ptools .tb')].map((b) => b.getBoundingClientRect().bottom))))
        const g0 = await gap(); await ph.evaluate(() => document.documentElement.style.setProperty('--sab', '34px')); await wait(300); const g1 = await gap(); await ph.evaluate(() => document.documentElement.style.removeProperty('--sab')); await wait(300)
        must(g1 - g0 <= 2 && g0 >= 0, '도구 막대가 안전영역을 또 센다(하단 탭과의 틈이 같이 커진다) ' + JSON.stringify({ g0, g1 }))
        await ph.click('.ptools .tb.rt'); await ph.waitForSelector('.spop.rtpop .kv', { timeout: 3000 }); await wait(300)
        const r = await ph.evaluate(() => { const m = document.querySelector('.spop.rtpop').getBoundingClientRect(); const w = document.querySelector('.spop.rtpop .kv .rwhen'); return { when: w && w.getBoundingClientRect().width > 4 ? (w.textContent ?? '') : '', minH: Math.min(...[...document.querySelectorAll('.spop.rtpop .kv')].map((x) => x.getBoundingClientRect().height)), inVw: m.left >= 0 && m.right <= innerWidth && m.top >= 0 && m.bottom <= innerHeight } })
        must(r.minH >= 44 && r.inVw && r.when.length > 1, '폰 루틴 목록 ' + JSON.stringify(r))
        if (shots) await ph.screenshot({ path: join(shots, 'rp-8-루틴-phone.png') })
        await ph.click('.spop.rtpop .kv:has-text("아침 정리")'); await ph.waitForSelector('.modal.rted', { timeout: 4000 }); await wait(300)
        await ph.evaluate(() => { const c = [...document.querySelectorAll('.modal.rted .modal-f button')].find((x) => /취소/.test(x.textContent ?? '')); c?.click() }); await wait(400)
        await ph.click('.tabbar [data-tab="todo"]'); await wait(600)
        const t = await ph.evaluate(() => { const p = document.querySelector('.panel'); return { ttl: p.querySelector('.hdr .ttl')?.textContent, ov: !!p.querySelector('.ovw'), bar: !!p.querySelector('.ptools'), more: !!p.querySelector('.tmore, .tless'), todo: !!p.querySelector('.todo') } })
        must(t.ttl === '할 일' && !t.ov && !t.bar && !t.more && t.todo, '할 일 탭 ' + JSON.stringify(t))
        if (shots) await ph.screenshot({ path: join(shots, 'rp-8-할일-phone.png') })
        must(!errs.length, '화면 오류 ' + errs.join(' | '))
      } finally { await ctx.close() }
    })

    await check('R9 오케스트레이터 패널은 개요 자리를 비운다 · 도구 막대에 명령·스킬이 없다', async () => {
      const og = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
      try {
        await og.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await og.goto(`${base}/#bot=orch`); await og.waitForSelector('.composer', { timeout: 10000 }); await og.waitForSelector('.panel .ptools', { timeout: 5000 }); await wait(500)
        const o = await og.evaluate(() => { const p = document.querySelector('.panel'); return { ttl: p.querySelector('.hdr .ttl')?.textContent, ov: !!p.querySelector('.ovw'), bar: [...p.querySelectorAll('.ptools .tb')].map((b) => (b.textContent ?? '').trim().replace(/\s*\d+$/, '') || b.getAttribute('aria-label')), sech: [...p.querySelectorAll('.sech')].map((e) => (e.querySelector('span')?.textContent ?? '').trim()) } })
        must(o.ttl === '이 볼트에서' && !o.ov && JSON.stringify(o.bar) === JSON.stringify(['루틴', '이 봇']) && o.sech.includes('Inbox'), '오케스트레이터 패널 ' + JSON.stringify(o))
        if (shots) await og.screenshot({ path: join(shots, 'rp-9-오케스트레이터-desktop.png') })
      } finally { await og.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  try { await rightPanel({ br, shots: 'test/tmp', check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' ')) }
  await br.close()
  console.log(`\n${red ? '🔴' : '✅'} 오른쪽 패널 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
