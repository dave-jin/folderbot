/**
 * EA · 뒤에서 도는 일 — 눈으로 보는 캡처 (2026-11-11 Dave «전체 모두 직접 화면을 보고 캡처해서»).
 * 픽스처 볼트 · 스텁 CLI 로 호스트를 띄우고, 봇이 서브에이전트 둘과 셸 하나를 뒤에서 돌리게 한 뒤(«맡긴일 뒤에서»)
 * 데스크톱(진행 줄 → 그 위에 뜨는 목록 — 2026-11-13 세션 줄 뒤로 오른쪽 패널의 절이 아니다) · 폰(진행 줄 → 바닥 시트)을 찍는다. 이어서 긴 결과를 돌려주는
 * 서브에이전트(«맡긴일 긴결과»)의 카드 · 열어 보는 화면(결과 전문 · 쓴 글 보기)을 두 판 다 찍는다.
 * ⚠ 실 앱·실 볼트·`~/.claude` 를 건드리지 않는다 — 스텁이 쓰는 기록 파일도 임시 폴더(`CLAUDE_CONFIG_DIR`)로 간다.
 *
 * 쓰기: `node test/shot-tasks.mjs [--out <폴더>] [--theme dark|light]` → `<폴더>/ea-*.png`
 */
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const OUT = arg('out', join(process.cwd(), 'test/tmp')), THEME = arg('theme', 'dark')
mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const root = realpathSync(mkdtempSync(join('/tmp', 'fb-shottask-')))
const data = mkdtempSync(join(tmpdir(), 'fb-shottaskdata-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-shottaskhome-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-shottaskcfg-'))
for (const d of ['1. Inbox', '3. Area/제품_Rondo/.claude/agents', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), '# Rondo\n\n본문\n')
writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 할 일\n- [ ] PRD v1.0 확정\n- [ ] 폰 설치\n')
writeFileSync(join(root, '3. Area/제품_Rondo/.claude/agents/log-reader.md'), '---\nname: log-reader\ndescription: 로그를 훑어 오류를 추리는 조사원\nmodel: haiku\n---\n\n로그를 읽고 오류만 추린다.\n')
mkdirSync(join(claudeCfg, 'agents'), { recursive: true })
writeFileSync(join(claudeCfg, 'agents/reviewer.md'), '---\nname: reviewer\ndescription: 바뀐 코드를 읽고 문제를 짚는 검토자\n---\n\n검토한다.\n')

const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_NO_AUTH: '1', FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const PORT = Number(arg('port', 7469))
const portFree = (p) => new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))) })
if (!(await portFree(PORT))) { console.error(`포트 ${PORT} 가 이미 잡혀 있어요`); process.exit(1) }
execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env, stdio: 'ignore' })
const base = `http://127.0.0.1:${PORT}`
const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json() }
const done = async (code = 0) => { try { host.kill() } catch {} for (const d of [root, data, fbHome, claudeCfg]) { try { rmSync(d, { recursive: true, force: true }) } catch {} } process.exit(code) }
try {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(150) } }
  const bot = await api('/bots/start', { rel: '3. Area/제품_Rondo' })
  const until = async (f, what, n = 100) => { for (let i = 0; i < n; i++) { const v = await f(); if (v) return v; await wait(80) } throw new Error(`기다리다 못 봤다 — ${what}`) }
  // ① 뒤에서 도는 일 셋 — 하나는 먼저 멈춰 «끝남» 묶음에도 줄이 서게 한다. 앞 턴에 끝난 서브에이전트도 하나 둔다(기본 스텁 답)
  const s1 = await api(`/bots/${bot.id}/send`, { text: '폴더를 훑어 줘', name: '조사' })
  await until(async () => (await api(`/sessions/${s1.sessionId}/chat`)).info.state === 'done', '첫 턴 끝')
  await api(`/sessions/${s1.sessionId}/send`, { text: '맡긴일 뒤에서 돌려 줘' })
  const tasks = await until(async () => { const t = (await api(`/sessions/${s1.sessionId}/tasks`)).tasks; return t.filter((x) => x.status === 'run').length === 3 ? t : null }, '도는 일 셋')
  const b2 = tasks.find((t) => t.name === '문서 조사')
  await api(`/sessions/${s1.sessionId}/tasks/${b2.taskId}/stop`, {})
  await until(async () => (await api(`/sessions/${s1.sessionId}/tasks`)).tasks.find((t) => t.id === b2.id)?.status === 'stopped', '하나 멈춤')
  // ② 긴 결과를 돌려주는 서브에이전트 — 다른 세션
  const s2 = await api(`/bots/${bot.id}/send`, { text: '맡긴일 긴결과 보고서', name: '보고서' })
  await until(async () => (await api(`/sessions/${s2.sessionId}/chat`)).info.state === 'done', '보고서 턴 끝')

  const br = await chromium.launch()
  const init = (theme) => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', theme) }
  const shot = async (pg, name) => { const f = join(OUT, `ea-${name}.png`); await pg.screenshot({ path: f }); console.log('  ' + f) }
  /** 상자 밖으로 새거나 서로 겹친 것 — 눈으로 보기 전에 기계로 한 번 거른다 */
  const leaks = (pg, sel) => pg.evaluate((s) => {
    const out = []
    for (const box of document.querySelectorAll(s)) {
      const b = box.getBoundingClientRect()
      for (const el of box.querySelectorAll('*')) { if (el.children.length) continue; const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') continue; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue
        // 말줄임(…)으로 잘리는 줄 안의 글자는 상자가 밖으로 나가도 화면에는 안 보인다 — 자르는 조상이 상자 안에 있으면 넘침이 아니다
        let clipped = false; for (let p = el.parentElement; p && p !== box.parentElement; p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') { const pr = p.getBoundingClientRect(); if (pr.right <= b.right + 1 && pr.left >= b.left - 1) { clipped = true; break } } }
        if (clipped) continue
        if (r.right > b.right + 1 || r.left < b.left - 1) out.push(`${s} ← ${el.className || el.tagName} ${Math.round(r.left)}~${Math.round(r.right)} (상자 ${Math.round(b.left)}~${Math.round(b.right)})`) }
    }
    return out
  }, sel)

  // ── 데스크톱 ──
  const dp = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await dp.addInitScript(init, THEME)
  await dp.goto(`${base}/#bot=${bot.id}&s=${s1.sessionId}`); await dp.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(900)
  // 세션 줄(2026-11-13) — 오른쪽 패널의 «뒤에서 도는 일» 절과 접힌 패널 띠의 단추는 없어졌다. 진행 줄의 단추가 그 위에 목록(`.spop.bgpop`)을 띄운다
  await dp.waitForSelector('.live .bgo', { timeout: 8000 })
  await shot(dp, '01-데스크톱-진행-줄')
  await dp.click('.live .bgo'); await dp.waitForSelector('.spop.bgpop .bgt', { timeout: 5000 }); await wait(400)
  await shot(dp, '02-데스크톱-진행-줄에서-열기')
  await dp.click('.spop.bgpop .bgt-h.fin'); await wait(300)
  await shot(dp, '03-데스크톱-목록-끝남-펼침')
  console.log('  넘침(목록):', JSON.stringify(await leaks(dp, '.spop.bgpop .bgt')), JSON.stringify(await leaks(dp, '.live')))
  await dp.keyboard.press('Escape'); await wait(300)
  // 패널을 접어도 진행 줄의 단추는 그대로 선다
  await dp.click('.panel .hdr .ib.on'); await wait(400)
  await shot(dp, '04-데스크톱-접힌-패널')
  await dp.keyboard.press('Meta+Shift+B'); await dp.waitForSelector('.panel', { timeout: 4000 }); await wait(400)   // 다음 캡처(하네스 절)는 펼친 패널에서 찍는다
  // 하네스 절의 에이전트 정의
  await dp.click('.panel .ptools .tb.cmd'); await dp.waitForSelector('.spop.cmdpop .hsec', { timeout: 4000 }); await wait(900)
  await dp.evaluate(() => { const h = document.querySelector('.spop.cmdpop .hsec'); if (h) h.scrollTop = h.scrollHeight }); await wait(200)
  await shot(dp, '05-데스크톱-하네스-에이전트')
  // 긴 결과 — 카드 펼침 · 열어 보기 · 쓴 글 보기
  await dp.goto(`${base}/#bot=${bot.id}&s=${s2.sessionId}`); await dp.waitForSelector('.chat-body .sub', { timeout: 8000 }); await wait(700)
  await dp.click('.chat-body .sub .l .ib'); await wait(300)
  await shot(dp, '06-데스크톱-카드-결과-앞머리')
  await dp.click('.chat-body .sub .submore'); await dp.waitForSelector('.drill-r .dr-res', { timeout: 5000 }); await wait(500)
  await shot(dp, '07-데스크톱-열어-보기-결과-전문')
  await dp.click('.drill-w .wbtn'); await dp.waitForSelector('.drill-w .dr-wt', { timeout: 5000 }); await wait(400)
  await dp.evaluate(() => document.querySelector('.drill-w')?.scrollIntoView({ block: 'start' })); await wait(300)
  await shot(dp, '08-데스크톱-서브에이전트가-쓴-글')
  console.log('  넘침(드릴):', JSON.stringify(await leaks(dp, '.drill-r')))
  await dp.close()

  // ── 폰 (390pt) ──
  const pp = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  await pp.addInitScript((a) => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', a.theme); addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sab', '34px')) }, { theme: THEME })
  await pp.goto(`${base}/#bot=${bot.id}&s=${s1.sessionId}`); await pp.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(900)
  await pp.waitForSelector('.live .bgo', { timeout: 8000 })
  await shot(pp, '11-폰-진행-줄')
  console.log('  넘침(폰 진행 줄):', JSON.stringify(await leaks(pp, '.live')), JSON.stringify(await leaks(pp, '.chat-body .sub')))
  await pp.tap('.live .bgo'); await pp.waitForSelector('.tsheet.bgsheet .bgt', { timeout: 5000 }); await wait(400)
  await shot(pp, '12-폰-바닥-시트')
  await pp.tap('.bgsheet .bgt-h.fin'); await wait(300)
  await shot(pp, '13-폰-바닥-시트-끝남-펼침')
  console.log('  넘침(폰 시트):', JSON.stringify(await leaks(pp, '.bgsheet .bgt')), JSON.stringify(await leaks(pp, '.bgsheet')))
  await pp.tap('.bgsheet .xb'); await wait(300)
  await pp.goto(`${base}/#bot=${bot.id}&s=${s2.sessionId}`); await pp.waitForSelector('.chat-body .sub', { timeout: 8000 }); await wait(700)
  await pp.tap('.chat-body .sub .l .ib'); await wait(300)
  await shot(pp, '14-폰-카드-결과-앞머리')
  await pp.tap('.chat-body .sub .submore'); await pp.waitForSelector('.drill-r .dr-res', { timeout: 5000 }); await wait(500)
  await shot(pp, '15-폰-열어-보기-결과-전문')
  await pp.tap('.drill-w .wbtn'); await pp.waitForSelector('.drill-w .dr-wt', { timeout: 5000 }); await wait(400)
  await pp.evaluate(() => document.querySelector('.drill-w')?.scrollIntoView({ block: 'start' })); await wait(300)
  await shot(pp, '16-폰-서브에이전트가-쓴-글')
  console.log('  넘침(폰 드릴):', JSON.stringify(await leaks(pp, '.drill-r')))
  await pp.close()

  // ── 빽빽한 경우 둘 — 채팅 칸을 360px 까지 좁힌 데스크톱 · 2분 넘게 기다린 폰(«가도 된다» + [알림 켜기] + 이 단추) ──
  const SHIFT = () => { const D = Date, S = 130000; class F extends D { constructor(...a) { super(...(a.length ? a : [D.now() + S])) } static now() { return D.now() + S } } window.Date = F }
  {
    const q = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    await q.addInitScript(init, THEME); await q.addInitScript(() => localStorage.setItem('fb:layout', JSON.stringify({ sb: 520, rp: 558, doc: 520, sbOpen: true, rpOpen: true, sbPin: true, rpPin: true, secH: { sessions: 120, todo: 128 } })))
    await q.goto(`${base}/#bot=${bot.id}&s=${s1.sessionId}`); await q.waitForSelector('.live .bgo', { timeout: 15000 }); await wait(700)
    await shot(q, '10-데스크톱-좁은-채팅-칸')
    await q.evaluate(SHIFT); await wait(1600)
    await shot(q, '10b-데스크톱-좁은-채팅-칸-2분-넘음')
    console.log('  넘침(좁은 칸):', JSON.stringify(await leaks(q, '.live')), JSON.stringify(await leaks(q, '.chat-body .sub')))
    await q.close()
    const w = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    await w.addInitScript(init, THEME)
    await w.goto(`${base}/#bot=${bot.id}&s=${s1.sessionId}`); await w.waitForSelector('.live .bgo', { timeout: 15000 }); await wait(500)
    await w.evaluate(SHIFT); await wait(1600)
    await shot(w, '18-폰-2분-넘음')
    console.log('  넘침(폰 2분 넘음):', JSON.stringify(await leaks(w, '.live')))
    await w.close()
  }

  // ── 에이전트는 다 멈추고 셸만 남았을 때 — 진행 줄은 조용한 한 줄로 바뀐다(기다리라는 말이 아니다) ──
  const a1 = tasks.find((t) => t.name === '로그 훑기')
  await api(`/sessions/${s1.sessionId}/tasks/${a1.taskId}/stop`, {})
  await until(async () => (await api(`/sessions/${s1.sessionId}/tasks`)).tasks.filter((t) => t.status === 'run').length === 1, '셸만 남음')
  for (const [name, vp, phone] of [['09-데스크톱-셸만-남음', { width: 1440, height: 900 }, false], ['17-폰-셸만-남음', { width: 390, height: 844 }, true]]) {
    const q = await br.newPage({ viewport: vp, deviceScaleFactor: 2, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
    await q.addInitScript(init, THEME)
    await q.goto(`${base}/#bot=${bot.id}&s=${s1.sessionId}`); await q.waitForSelector('.live.bgline', { timeout: 15000 }); await wait(700)
    await shot(q, name)
    console.log(`  넘침(${name}):`, JSON.stringify(await leaks(q, '.live')))
    await q.close()
  }
  await br.close()
  await done(0)
} catch (e) { console.error('✗', e.stack ?? e); await done(1) }
