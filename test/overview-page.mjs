/**
 * ═══ 폴더 개요 한 장 (2026-11-15 Dave 카드 — 자리는 «문서 칸» · 채우는 법은 «파일에서 그대로») ═══════════════════
 *
 * 문서 칸에 열리는 보기 전용 한 장. 덩이 넷(어디까지 왔나 · 내가 나설 곳 · 최근 만든 것 · 이어진 곳)이 폴더에 적힌 줄을 그대로 옮긴다.
 *   O1 호스트 — 한 장은 폴더에 적힌 줄만 모은다(목적 · 현재 목표 · 완료/진행 중/다음 작업 · 열린 할 일은 마감 먼저 · 제안 수 · 기다리는 일)
 *   O2 데스크톱 — 패널 개요 칸의 «한 장» 을 누르면 문서 칸에 «개요» 탭이 열린다 · 채팅은 그대로 옆에 · 덩이 넷과 출처 · 가로 넘침 없음
 *   O3 지어내지 않는다 — 화면의 줄이 state.md · todo.md 의 줄과 글자까지 같다 · 줄을 누르면 그 파일이 열린다
 *   O4 [이 부분 묻기] — 덩이가 입력칸 위에 붙고(테두리 · 안내 글) ✕ 로 떼진다 · 보내면 덩이의 줄이 내 말 아래 인용으로 간다
 *   O5 연 뒤 파일이 바뀌면 저절로 바뀌지 않고 «그 뒤 바뀐 것이 있어요 · 다시 읽기» 가 선다 · 누르면 새 줄
 *   O6 내 답을 기다리는 세션이 «내가 나설 곳» 맨 위에 서고, 누르면 그 세션으로 간다
 *   O7 state.md 가 없거나 낡았을 때 — 그렇게 말하고 [봇에게 정리 시키기] 가 입력칸에 말을 채운다
 *   O8 폰 — «폴더» 탭의 «한 장» → «문서» 탭에 한 줄기로 · [묻기] 32px · 줄 44px · [묻기] 는 «채팅» 탭으로 넘어가며 덩이가 붙는다
 *   O9 오케스트레이터에는 «한 장» 이 없다
 *   O10 명령 팔레트(⌘P)의 «이 폴더 개요 한 장» 으로도 열린다 · 다시 열어도 탭은 하나
 *
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔). 스모크가 불러 쓰고(`overviewPage`), 혼자서도 돈다(`node test/overview-page.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }
const PURPOSE = 'PARA 와 AI 를 묶은 반나절 강의를 11/22 에 열고, 수강생이 자기 볼트를 만들어 돌아가게 한다.'
const GOAL = '슬라이드 4부를 채워 11/19 리허설에 올린다'
const stateMd = (doing = '슬라이드 4부 채우기 — 실습 자료 안 대기') => `# Project State\n\n> 마지막 갱신: 2026-11-15 09:10\n> 상태: 진행 중\n> 현재 목표: ${GOAL}\n\n## 완료\n- [x] **기획 확정** (근거: 01_기획/기획안.md)\n- [x] 커리큘럼 확정\n- [x] 대관 계약\n\n## 진행 중\n- [ ] ${doing}\n\n## 확정된 결정\n- 결정: 반나절로 한다\n\n## 다음 작업\n1. 리허설(11/19)\n2. 강의(11/22)\n`
const TODO = '## 요청 · 할 일\n- [ ] 실습 자료 안 고르기: 세 안 가운데 하나\n- [ ] 대관처에 인원 확정 알리기 📅 2026-11-15\n- 수강료 입금 확인 — 상대 답 기다리는 중\n- [ ] 화면 캡처 정리 <!-- bot:proposed 2026-11-13 -->\n\n## 완료\n- [x] 끝난 일\n'

export async function overviewPage({ br, check, port = 7489, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-ov-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-ov-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-ov-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-ov-cc-'))
  const REL = '2. Projects/2026-11-22_강의-PARA-AI', abs = join(root, REL)
  for (const d of ['1. Inbox', REL, `${REL}/01_기획`, '3. Area', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(abs, 'CLAUDE.md'), `# 강의 — 작업 지침\n\n## 🎯 이 프로젝트의 목적\n\n**${PURPOSE}**\n\n- 성공 기준은 따로 있다\n\n## 나의 역할\n`)
  writeFileSync(join(abs, 'readme.md'), '# 읽어 보기\n'); writeFileSync(join(abs, '01_기획/기획안.md'), '# 기획\n')
  writeFileSync(join(abs, 'todo.md'), TODO); writeFileSync(join(abs, 'state.md'), stateMd())
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(process.cwd(), 'test/fixtures/no-such-codex'), CLAUDE_CONFIG_DIR: claudeCfg }
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 160)}`); return t ? JSON.parse(t) : null }
  const until = async (f, msg, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await f()) return; await wait(100) } throw new Error('기다리다 끝남 — ' + msg) }
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(base + '/api/health'); up = true } catch { await wait(150) } }
    must(up, '검사 전제 깨짐 — 호스트가 안 떴다 ' + out.slice(-200))
    const bot = await api('/bots/start', { rel: REL })
    const s1 = await api(`/bots/${bot.id}/sessions`, { name: '첫 세션' })
    const page = () => api(`/bots/${bot.id}/overview/page`)

    await check('O1 호스트 — 한 장은 폴더에 적힌 줄만 모은다(목적 · 현재 목표 · 완료/진행 중/다음 작업 · 할 일은 마감 먼저 · 제안 수 · 기다리는 일)', async () => {
      const p = await page()
      must(p.purpose === PURPOSE && p.goal === GOAL, '목적 · 현재 목표 ' + JSON.stringify({ purpose: p.purpose, goal: p.goal }))
      must(JSON.stringify(p.progress.done.map((r) => r.text)) === JSON.stringify(['기획 확정 (근거: 01_기획/기획안.md)', '커리큘럼 확정']) && p.progress.doneTotal === 3, '완료 ' + JSON.stringify(p.progress))
      must(JSON.stringify(p.progress.doing.map((r) => r.text)) === JSON.stringify(['슬라이드 4부 채우기 — 실습 자료 안 대기']) && JSON.stringify(p.progress.next.map((r) => r.text)) === JSON.stringify(['리허설(11/19)', '강의(11/22)']), '진행 중 · 다음 작업 ' + JSON.stringify(p.progress))
      must(JSON.stringify(p.mine.todos.map((t) => t.title)) === JSON.stringify(['대관처에 인원 확정 알리기', '실습 자료 안 고르기']) && p.mine.openTotal === 2 && p.mine.proposed === 1 && p.mine.asks.length === 0, '내가 나설 곳 ' + JSON.stringify(p.mine))
      must(p.mine.waits.length === 1 && /수강료 입금 확인/.test(p.mine.waits[0].text), '기다리는 일 ' + JSON.stringify(p.mine.waits))
      must(p.sources.length === 2 && p.sources.every((x) => typeof x.at === 'number') && typeof p.ver === 'string' && p.ver.length > 0 && p.staleDays === undefined, '출처 · 지문 ' + JSON.stringify({ s: p.sources, v: p.ver, st: p.staleDays }))
      must((await page()).ver === p.ver, '같은 내용인데 지문이 달라졌다')
    })
    if (!br) return

    const pg = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const perrs = []; pg.on('pageerror', (e) => perrs.push(e.message))
    await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
    await pg.goto(`${base}/#bot=${bot.id}&s=${s1.id}`)
    await pg.waitForSelector('.composer', { timeout: 10000 })
    await pg.waitForSelector('.panel .ovw .oh .opage', { timeout: 6000 })
    const ovp = () => pg.evaluate(() => {
      const p = document.querySelector('.docwrap .ovp'); if (!p) return null
      const rows = (sel) => [...p.querySelectorAll(sel)].map((r) => (r.querySelector('span')?.textContent ?? '').trim())
      return { title: p.querySelector('.ovp-t span')?.textContent ?? '', made: (p.querySelector('.ovp-made')?.textContent ?? '').replace(/\s+/g, ' ').trim(), goals: [...p.querySelectorAll('.ovp-goal')].map((g) => g.firstChild?.textContent ?? ''),
        chunks: [...p.querySelectorAll('.ovc')].map((c) => ({ k: c.dataset.chunk, t: c.querySelector('.ovc-h b')?.textContent, src: c.querySelector('.ovc-h small')?.textContent, ask: c.querySelector('.ovc-ask')?.textContent?.trim(), sel: c.classList.contains('sel') })),
        ok: rows('.ovr.st-ok'), now: rows('.ovr.st-now'), next: rows('.ovr.st-next'), ask: rows('.ovr.mi-ask'), todo: rows('.ovr.mi-todo'), waits: rows('.ovr.mi-wait'), files: rows('.ovr.fl'), more: [...p.querySelectorAll('.ovc-more')].map((m) => m.textContent ?? ''), none: [...p.querySelectorAll('.ovc-none')].map((m) => m.textContent ?? ''),
        text: (p.textContent ?? '').replace(/\s+/g, ' '), ver: p.dataset.ver, re: !!p.querySelector('.ovp-re') }
    })

    await check('O2 데스크톱 — 패널 «한 장» → 문서 칸에 «개요» 탭 · 채팅은 그대로 옆에 · 덩이 넷과 출처 · 가로 넘침 없음', async () => {
      must((await pg.textContent('.panel .ovw .oh .opage')).trim() === '한 장', '패널 개요 칸에 «한 장» 단추가 없다')
      await pg.click('.panel .ovw .oh .opage')
      await pg.waitForSelector('.docwrap .ovp .ovc', { timeout: 6000 }); await wait(300)
      const o = await ovp()
      const lay = await pg.evaluate(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); const doc = r('.docwrap'), comp = r('.composer'), panel = r('.panel'); const tab = document.querySelector('.docwrap .tabs .tab.on'); return { tab: (tab?.childNodes[0]?.textContent ?? '').trim(), tabTitle: tab?.getAttribute('title'), dtb: !!document.querySelector('.docwrap .dtb'), docL: Math.round(doc.left), docR: Math.round(doc.right), compR: Math.round(comp.right), compW: Math.round(comp.width), panelL: Math.round(panel.left), sw: document.documentElement.scrollWidth, vw: innerWidth, ovSw: document.querySelector('.docwrap .ovp').scrollWidth, ovCw: document.querySelector('.docwrap .ovp').clientWidth, cols: new Set([...document.querySelectorAll('.docwrap .ovc')].map((c) => Math.round(c.getBoundingClientRect().left))).size } })
      must(lay.tab === '개요' && lay.tabTitle === '이 폴더의 개요 한 장' && !lay.dtb, '문서 칸의 탭 ' + JSON.stringify(lay))
      must(lay.compW > 200 && lay.compR <= lay.docL + 1 && lay.docR <= lay.panelL + 1, '채팅 · 한 장 · 패널이 나란히 서지 않는다 ' + JSON.stringify(lay))
      must(lay.sw <= lay.vw && lay.ovSw <= lay.ovCw + 1, '가로 넘침 ' + JSON.stringify(lay))
      must(JSON.stringify(o.chunks.map((c) => c.t)) === JSON.stringify(['어디까지 왔나', '내가 나설 곳', '최근 만든 것', '이어진 곳']), '덩이 넷 ' + JSON.stringify(o.chunks))
      must(JSON.stringify(o.chunks.map((c) => c.src)) === JSON.stringify(['state.md', '세션 · todo.md', '지난 7일 · 이 폴더의 봇이 쓴 파일', '연결 지도']) && o.chunks.every((c) => c.ask === '이 부분 묻기' && !c.sel), '출처 · [이 부분 묻기] ' + JSON.stringify(o.chunks))
      must(/state\.md \d+\/\d+ \d\d:\d\d · todo\.md \d+\/\d+ \d\d:\d\d 에서 옮김/.test(o.made) && !/전 것이에요/.test(o.made), '출처 줄 ' + JSON.stringify(o.made))
      must(o.title.length > 0 && JSON.stringify(o.goals) === JSON.stringify([PURPOSE, GOAL]), '제목 · 목적 · 현재 목표 ' + JSON.stringify({ t: o.title, g: o.goals }))
      must(lay.cols >= 1, '덩이 칸 ' + JSON.stringify(lay))
      if (shots) await pg.screenshot({ path: join(shots, 'ov-2-한-장-desktop.png') })
    })

    await check('O3 지어내지 않는다 — 화면의 줄이 파일의 줄과 같다 · 줄을 누르면 그 파일이 열린다', async () => {
      const o = await ovp()
      must(JSON.stringify(o.ok) === JSON.stringify(['기획 확정 (근거: 01_기획/기획안.md)', '커리큘럼 확정']) && JSON.stringify(o.now) === JSON.stringify(['슬라이드 4부 채우기 — 실습 자료 안 대기']) && JSON.stringify(o.next) === JSON.stringify(['리허설(11/19)', '강의(11/22)']), '어디까지 왔나의 줄 ' + JSON.stringify({ ok: o.ok, now: o.now, next: o.next }))
      must(JSON.stringify(o.todo) === JSON.stringify(['대관처에 인원 확정 알리기', '실습 자료 안 고르기']) && o.waits.length === 1 && /^수강료 입금 확인/.test(o.waits[0]), '내가 나설 곳의 줄 ' + JSON.stringify({ todo: o.todo, waits: o.waits }))
      must(o.more.some((m) => /완료 3 가운데 2/.test(m)) && o.more.some((m) => /봇의 제안 1/.test(m) && /열린 할 일 2/.test(m)), '덩이 발의 수 ' + JSON.stringify(o.more))
      // 파일에 없는 숫자(진행률 · «N장 중 M»)가 화면에 없다
      must(!/\d+\s*%|\d+\s*장 중|\d+\s*\/\s*\d+\s*(완료|단계)/.test(o.text), '🔴 파일에 없는 진행 숫자가 화면에 있다 · ' + o.text.slice(0, 200))
      must(o.none.some((n) => /지난 7일에 봇이 만든 파일이 없어요/.test(n)) && o.none.some((n) => /아직 이어진 폴더가 없어요/.test(n)), '빈 덩이는 «없다» 고 말한다 ' + JSON.stringify(o.none))
      await pg.click('.docwrap .ovp .ovr.st-now')
      await pg.waitForFunction(() => (document.querySelector('.docwrap .tabs .tab.on')?.childNodes[0]?.textContent ?? '').trim() === 'state.md', null, { timeout: 5000 })
      must(await pg.evaluate(() => [...document.querySelectorAll('.docwrap .tabs .tab')].some((t) => (t.childNodes[0]?.textContent ?? '').trim() === '개요')), '파일을 열자 «개요» 탭이 사라졌다')
      await pg.click('.docwrap .tabs .tab:has-text("개요")'); await pg.waitForSelector('.docwrap .ovp .ovc', { timeout: 5000 }); await wait(200)
    })

    await check('O4 [이 부분 묻기] — 덩이가 입력칸 위에 붙고 ✕ 로 떼진다 · 보내면 덩이의 줄이 내 말 아래 인용으로 간다', async () => {
      await pg.click('.docwrap .ovc[data-chunk="progress"] .ovc-ask'); await pg.waitForSelector('.composer .oref', { timeout: 3000 })
      const a = await pg.evaluate(() => { const r = document.querySelector('.composer .oref'); const c = document.querySelector('.docwrap .ovc[data-chunk="progress"]'); const cin = document.querySelector('.composer .cin'); return { t: r.querySelector('b')?.textContent, l: r.querySelector('span')?.textContent, sel: c.classList.contains('sel'), pressed: c.querySelector('.ovc-ask').getAttribute('aria-pressed'), ph: cin?.getAttribute('data-placeholder'), others: [...document.querySelectorAll('.docwrap .ovc.sel')].length, focus: document.activeElement === cin || !!document.activeElement?.closest?.('.composer') } })
      must(a.t === '어디까지 왔나' && /^✓ 기획 확정/.test(a.l ?? '') && a.sel && a.pressed === 'true' && a.others === 1 && a.ph === '이 부분에 대해 묻기…', '붙은 덩이 ' + JSON.stringify(a))
      if (shots) await pg.screenshot({ path: join(shots, 'ov-4-이-부분-묻기-desktop.png') })
      await pg.click('.composer .oref .x'); await wait(200)
      must(!(await pg.$('.composer .oref')) && !(await pg.$('.docwrap .ovc.sel')), '✕ 로 안 떼졌다')
      await pg.click('.docwrap .ovc[data-chunk="mine"] .ovc-ask'); await pg.waitForSelector('.composer .oref', { timeout: 3000 })
      must((await pg.textContent('.composer .oref b')) === '내가 나설 곳', '다른 덩이로 바꿔 붙지 않는다')
      await pg.click('.composer .cin'); await pg.keyboard.type('이 가운데 무엇부터 할까?'); await pg.keyboard.press('Enter')
      await until(async () => (await api(`/sessions/${s1.id}/chat`)).items.some((x) => x.kind === 'user' && /이 가운데 무엇부터 할까\?/.test(x.text)), '보낸 말이 호스트에 없다')
      const sent = (await api(`/sessions/${s1.id}/chat`)).items.filter((x) => x.kind === 'user').pop().text
      must(sent.startsWith('이 가운데 무엇부터 할까?\n\n> **폴더 개요 · 내가 나설 곳** (세션 · todo.md)\n> - 할 일 — 대관처에 인원 확정 알리기 (마감 2026-11-15)\n> - 할 일 — 실습 자료 안 고르기\n> - 기다리는 일 — 수강료 입금 확인'), '보낸 글 ' + JSON.stringify(sent))
      await until(async () => !(await pg.$('.composer .oref')) && !(await pg.$('.docwrap .ovc.sel')), '보낸 뒤에도 덩이가 붙어 있다')
      await until(async () => (await api(`/sessions/${s1.id}/chat`)).info.state !== 'running', '턴이 안 끝난다', 10000)
      // 내 말은 물음과 인용으로 보인다(인용이 날 글자로 쏟아지지 않는다)
      const bub = await pg.evaluate(() => { const u = [...document.querySelectorAll('.umsg')].pop(); return u ? { q: !!u.querySelector('blockquote'), t: (u.textContent ?? '').replace(/\s+/g, ' ').slice(0, 80) } : null })
      must(bub && bub.q && /이 가운데 무엇부터 할까\?/.test(bub.t), '내 말에 인용이 안 섰다 ' + JSON.stringify(bub))
    })

    await check('O5 연 뒤 파일이 바뀌면 저절로 바뀌지 않고 «다시 읽기» 가 선다 · 누르면 새 줄', async () => {
      const before = await ovp()
      writeFileSync(join(abs, 'state.md'), stateMd('슬라이드 4부 채우기 — 실습 자료 A안으로 확정'))
      await until(async () => (await page()).progress.doing[0].text === '슬라이드 4부 채우기 — 실습 자료 A안으로 확정', '호스트가 새 줄을 못 읽는다')
      await until(async () => (await ovp()).re, '«다시 읽기» 가 안 선다', 12000)
      const mid = await ovp()
      must(mid.ver === before.ver && JSON.stringify(mid.now) === JSON.stringify(before.now), '🔴 묻지 않고 줄이 바뀌었다 ' + JSON.stringify({ b: before.now, m: mid.now }))
      must(/그 뒤 바뀐 것이 있어요 · 다시 읽기/.test(mid.made), '알림 글 ' + JSON.stringify(mid.made))
      if (shots) await pg.screenshot({ path: join(shots, 'ov-5-다시-읽기-desktop.png') })
      await pg.click('.docwrap .ovp .ovp-re')
      await until(async () => { const o = await ovp(); return o.now[0] === '슬라이드 4부 채우기 — 실습 자료 A안으로 확정' && !o.re && o.ver !== before.ver }, '다시 읽기를 눌러도 새 줄이 안 선다')
    })

    await check('O6 내 답을 기다리는 세션이 «내가 나설 곳» 맨 위에 서고, 누르면 그 세션으로 간다 · 봇이 만든 파일이 «최근 만든 것» 에', async () => {
      const s2 = await api(`/bots/${bot.id}/sessions`, { name: '승인 세션' })
      await api(`/sessions/${s2.id}/send`, { text: '승인이 필요한 일 해 줘' })
      await until(async () => (await api(`/sessions/${s2.id}/chat`)).info.state === 'awaiting_input', '승인 대기가 안 된다')
      await until(async () => (await ovp()).re, '답 대기가 생겼는데 «다시 읽기» 가 안 선다', 12000)
      await pg.click('.docwrap .ovp .ovp-re')
      await until(async () => (await ovp()).ask.length === 1, '답 대기 줄이 안 선다')
      const o = await ovp()
      must(o.ask[0] === '내 답 기다림 — «승인 세션» 세션' && await pg.evaluate(() => document.querySelector('.docwrap .ovc[data-chunk="mine"] .ovr')?.classList.contains('mi-ask')), '답 대기 줄이 맨 위가 아니다 ' + JSON.stringify(o.ask))
      await pg.click('.docwrap .ovp .ovr.mi-ask')
      await pg.waitForFunction((sid) => location.hash.includes(sid), s2.id, { timeout: 4000 })
      must(await pg.$('.docwrap .ovp'), '세션을 옮기자 한 장이 닫혔다')
      const chat = await api(`/sessions/${s2.id}/chat`)
      await api(`/sessions/${s2.id}/permission`, { requestId: chat.info.pending[0].requestId, allow: true })
      await until(async () => (await page()).recent.some((x) => x.rel === 'stub-output.md'), '호스트 «최근 만든 것» 에 없다 ' + JSON.stringify((await page()).recent), 8000)
      await until(async () => (await ovp()).re, '파일이 생겼는데 «다시 읽기» 가 안 선다', 12000)
      await pg.click('.docwrap .ovp .ovp-re')
      await until(async () => { const x = await ovp(); return x.files.includes('stub-output.md') && x.ask.length === 0 }, '새 파일 줄이 안 선다')
      must(!perrs.length, '화면 오류 ' + perrs.join(' | '))
    })

    await check('O7 state.md 가 낡았거나 없을 때 — 그렇게 말하고 [봇에게 정리 시키기] 가 입력칸에 말을 채운다', async () => {
      const old = new Date(Date.now() - 5 * 86_400_000)
      utimesSync(join(abs, 'state.md'), old, old)
      await pg.reload(); await pg.waitForSelector('.docwrap .ovp .ovc', { timeout: 10000 }); await wait(300)
      const a = await ovp()
      must(/state\.md 가 5일 전 것이에요/.test(a.made) && /봇에게 정리 시키기/.test(a.made), '낡았다는 알림 ' + JSON.stringify(a.made))
      if (shots) await pg.screenshot({ path: join(shots, 'ov-7-낡은-state-desktop.png') })
      await pg.click('.docwrap .ovp .ovp-made .btn:has-text("봇에게 정리 시키기")'); await wait(300)
      must(/state\.md 를 지금 상태에 맞게 고쳐 줘/.test(await pg.evaluate(() => document.querySelector('.composer .cin')?.textContent ?? '')), '입력칸에 말이 안 채워졌다')
      await pg.evaluate(() => { const c = document.querySelector('.composer .cin'); c.focus() }); await pg.keyboard.press('Meta+A'); await pg.keyboard.press('Backspace')
      execSync(`rm -f ${JSON.stringify(join(abs, 'state.md'))}`)
      await pg.reload(); await pg.waitForSelector('.docwrap .ovp .ovc', { timeout: 10000 }); await wait(300)
      const b = await ovp()
      must(b.none.some((n) => n === 'state.md 가 없어요') && /todo\.md \d+\/\d+ \d\d:\d\d 에서 옮김/.test(b.made) && !/state\.md \d/.test(b.made) && /봇에게 정리 시키기/.test(b.made), 'state.md 가 없을 때 ' + JSON.stringify({ none: b.none, made: b.made }))
      must(b.goals.length === 1 && b.goals[0] === PURPOSE && b.todo.length === 2, '없는 파일의 덩이만 비어야 한다 ' + JSON.stringify({ g: b.goals, t: b.todo }))
      writeFileSync(join(abs, 'state.md'), stateMd())
    })
    await pg.close()

    await check('O8 폰 — «폴더» 탭의 «한 장» → «문서» 탭에 한 줄기 · [묻기] 32px · 줄 44px · [묻기] 는 «채팅» 탭으로 넘어가며 덩이가 붙는다', async () => {
      const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
      const ph = await ctx.newPage(); const errs = []; ph.on('pageerror', (e) => errs.push(e.message))
      try {
        await ph.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await ph.goto(`${base}/#bot=${bot.id}&s=${s1.id}`)
        await ph.waitForSelector('.tabbar', { timeout: 10000 }); await wait(500)
        await ph.click('.tabbar [data-tab="files"]'); await ph.waitForSelector('.panel .ovw .oh .opage', { timeout: 6000 }); await wait(300)
        const btn = await ph.evaluate(() => { const r = document.querySelector('.panel .ovw .oh .opage').getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) } })
        must(btn.h >= 32 && btn.w >= 44, '폰 «한 장» 단추가 손가락에 작다 ' + JSON.stringify(btn))
        await ph.tap('.panel .ovw .oh .opage'); await ph.waitForSelector('.ovp .ovc', { timeout: 6000 }); await wait(400)
        const f = await ph.evaluate(() => {
          const p = document.querySelector('.ovp'); const cs = [...p.querySelectorAll('.ovc')].map((c) => c.getBoundingClientRect())
          const asks = [...p.querySelectorAll('.ovc-ask')].map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent ?? '').trim(), h: Math.round(r.height), w: Math.round(r.width) } })
          const rows = [...p.querySelectorAll('.ovr')].map((r) => Math.round(r.getBoundingClientRect().height))
          return { tab: document.querySelector('.tabbar .tb.on')?.dataset.tab, ttl: document.querySelector('.col.doc .hdr .ttl')?.textContent, lefts: new Set(cs.map((c) => Math.round(c.left))).size, n: cs.length, stacked: cs.every((c, i) => i === 0 || c.top >= cs[i - 1].bottom - 1), asks, minRow: Math.min(...rows), sw: document.documentElement.scrollWidth, vw: innerWidth, psw: p.scrollWidth, pcw: p.clientWidth, t17: getComputedStyle(p.querySelector('.ovp-t')).fontSize }
        })
        must(f.tab === 'doc' && f.ttl === '개요', '폰 «문서» 탭 ' + JSON.stringify({ tab: f.tab, ttl: f.ttl }))
        must(f.n === 4 && f.lefts === 1 && f.stacked, '폰은 덩이가 한 줄기여야 한다 ' + JSON.stringify(f))
        must(f.asks.length === 4 && f.asks.every((a) => a.t === '묻기' && a.h >= 32 && a.w >= 44) && f.minRow >= 44, '[묻기] · 줄의 크기 ' + JSON.stringify({ asks: f.asks, minRow: f.minRow }))
        must(f.sw <= f.vw && f.psw <= f.pcw + 1, '가로 넘침 ' + JSON.stringify(f))
        // 한 장은 파일이 아니다 — 문서용 «봇에게 이 문서로 말하기» 단추가 뜨지 않는다([묻기] 가 그 일을 한다)
        must(!(await ph.$('.col.doc .dfoot')), '폰 한 장 위에 문서용 발 단추가 떠 있다')
        if (shots) await ph.screenshot({ path: join(shots, 'ov-8-한-장-phone.png') })
        await ph.tap('.ovc[data-chunk="progress"] .ovc-ask')
        await ph.waitForFunction(() => document.querySelector('.tabbar .tb.on')?.dataset.tab === 'chat', null, { timeout: 4000 }); await wait(400)
        const c = await ph.evaluate(() => { const r = document.querySelector('.composer .oref'); if (!r) return null; const b = r.getBoundingClientRect(); const x = r.querySelector('.x').getBoundingClientRect(); const comp = document.querySelector('.composer').getBoundingClientRect(); const cin = document.querySelector('.composer .cin').getBoundingClientRect(); return { t: r.querySelector('b')?.textContent, h: Math.round(b.height), xw: Math.round(x.width), xh: Math.round(x.height), inComp: b.left >= comp.left - 1 && b.right <= comp.right + 1, above: b.bottom <= cin.top + 1, sw: document.documentElement.scrollWidth, vw: innerWidth } })
        must(c && c.t === '어디까지 왔나' && c.h >= 32 && c.xw >= 32 && c.xh >= 32 && c.inComp && c.above && c.sw <= c.vw, '폰 입력칸의 덩이 ' + JSON.stringify(c))
        if (shots) await ph.screenshot({ path: join(shots, 'ov-8-묻기-뒤-채팅-phone.png') })
        await ph.tap('.composer .oref .x'); await wait(200)
        must(!(await ph.$('.composer .oref')), '폰에서 ✕ 로 안 떼졌다')
        must(!errs.length, '화면 오류 ' + errs.join(' | '))
      } finally { await ctx.close() }
    })

    await check('O10 명령 팔레트(⌘P)의 «이 폴더 개요 한 장» 으로도 열린다 · 다시 열어도 탭은 하나', async () => {
      const cp = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
      try {
        await cp.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await cp.goto(`${base}/#bot=${bot.id}&s=${s1.id}`); await cp.waitForSelector('.composer', { timeout: 10000 }); await wait(400)
        for (let k = 0; k < 2; k++) {
          await cp.keyboard.press('Meta+P'); await cp.waitForSelector('.modal.pal input', { timeout: 4000 })
          await cp.fill('.modal.pal input', '개요 한 장'); await wait(300); await cp.keyboard.press('Enter')
          await cp.waitForSelector('.docwrap .ovp .ovc', { timeout: 6000 }); await wait(200)
        }
        const tabs = await cp.evaluate(() => [...document.querySelectorAll('.docwrap .tabs .tab')].map((t) => (t.childNodes[0]?.textContent ?? '').trim()))
        must(tabs.filter((t) => t === '개요').length === 1, '«개요» 탭이 하나가 아니다 ' + JSON.stringify(tabs))
        must(!(await cp.$('.modal.pal')), '고른 뒤에도 팔레트가 남았다')
      } finally { await cp.close() }
    })

    await check('O9 오케스트레이터에는 «한 장» 이 없다', async () => {
      const og = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
      try {
        await og.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
        await og.goto(`${base}/#bot=orch`); await og.waitForSelector('.panel', { timeout: 10000 }); await wait(500)
        must(!(await og.$('.panel .ovw')) && !(await og.$('.opage')), '오케스트레이터 패널에 개요 칸이나 «한 장» 이 있다')
      } finally { await og.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  try { await overviewPage({ br, shots: 'test/tmp', check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' ')) }
  await br.close()
  console.log(`\n${red ? '🔴' : '✅'} 폴더 개요 한 장 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
