/**
 * ═══ 커서와 스크롤 (2026-11-15 Dave: «AskUserQuestion 혹은 기존 문구 고치기 그리고 붙여넣기 등을 했을때 커서 위치가 화면에
 *     제대로 표시되지 않거나 스크롤 업/다운 되는 현상이 있어. 이 부분 전수 검사해서 고쳐야 해.») ═══════════════════════════
 *
 * 글자를 치는 칸마다 두 가지를 잰다 — ① 커서가 **보이는 자리**에 있는가 ② 스크롤이 **저절로** 움직였는가.
 *   K1 입력칸 — 긴 글을 붙여 넣으면 커서(글의 끝)가 입력칸 안에 보인다
 *   K2 입력칸 — 긴 글의 끝에서 ⇧⏎ 로 줄을 넣으면 새 줄의 커서가 보인다
 *   K3 입력칸 — 긴 글의 앞쪽을 고쳐도 입력칸이 끝으로 튀지 않고 커서가 보인다 · 가운데에 붙여 넣어도 그 자리에 머문다
 *   K4 입력칸 — 글이 통째로 다시 그려질 때(@ 로 파일을 골라 칩이 설 때)도 스크롤이 맨 위로 돌아가지 않고 커서가 보인다
 *   K5 대화 — 위를 읽는 중에 입력칸에 붙여 넣거나 줄을 늘려도 대화가 움직이지 않는다
 *   K6 대화 — 맨 아래를 보는 중에 입력칸이 자라면 마지막 말이 가려지지 않는다(따라 내려간다)
 *   K7 질문 카드 — «기타» 칸에 글을 쳐도 대화가 위아래로 움직이지 않고 그 칸이 화면 안에 있다
 *   K8 질문 카드 — 미리보기 [고치기] 의 글 칸: 눌러도 대화가 안 튀고 · 붙여 넣은 글의 끝에 커서가 보이고 · 글자를 쳐도 대화가 흔들리지 않는다
 *   K9 대기 말 — [고치기] 의 글 칸에 붙여 넣어도 커서가 보이고 대화가 튀지 않는다
 *   K11 멈춘 자리 — [프롬프트 고치기] 로 긴 말이 입력칸에 올라와도 커서가 보인다
 *   K12 폰 — 질문 카드의 미리보기 [고치기] 에 붙여 넣고 글을 쳐도 커서가 보이고 대화가 흔들리지 않는다
 *   K10 폰 — 입력칸에 긴 글을 붙여 넣으면 커서가 보이고, 마지막 말이 입력칸에 가려지지 않는다
 *
 * 🔴 고치기 전의 실측(2026-11-15) — K1 · K2 · K10: 붙여 넣거나 ⇧⏎ 를 눌러도 입력칸이 맨 위에 머물러 커서가 칸 아래 안 보이는 곳에 있었다.
 *    K8 · K12: 붙여 넣은 글의 끝이 입력창 뒤에 가려졌고, 글자를 칠 때마다 대화가 31px 씩 위아래로 흔들렸다(1098 ↔ 1129).
 *
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔). 스모크가 불러 쓰고(`caretScroll`), 혼자서도 돈다(`node test/caret-scroll.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }
const LINES = (n, tag = '줄') => Array.from({ length: n }, (_, i) => `${tag} ${i + 1} — 붙여 넣은 글`).join('\n')

/** 페이지 안에서 쓰는 잣대 — 커서의 자리 · 칸의 스크롤 · 스크롤 기록 */
const PROBE = () => {
  window.__k = {
    /** 지금 커서(선택의 끝)의 화면 자리. 접힌 범위는 자리가 0 으로 나올 때가 있어 표식을 잠깐 넣어 잰다 */
    caret() {
      const a = document.activeElement
      if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) {
        // textarea — 거울 칸으로 커서 줄의 자리를 잰다
        const cs = getComputedStyle(a); const m = document.createElement('div')
        for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'borderRightWidth', 'boxSizing', 'whiteSpace', 'wordBreak', 'overflowWrap', 'tabSize']) m.style[p] = cs[p]
        m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.whiteSpace = a.tagName === 'INPUT' ? 'pre' : 'pre-wrap'; m.style.width = `${a.clientWidth}px`; m.style.top = '0'; m.style.left = '-9999px'
        m.textContent = a.value.slice(0, a.selectionEnd ?? a.value.length); const mark = document.createElement('span'); mark.textContent = '​'; m.appendChild(mark)
        document.body.appendChild(m); const y = mark.offsetTop, h = mark.offsetHeight || parseFloat(cs.lineHeight) || 16; m.remove()
        const r = a.getBoundingClientRect(); const top = r.top + y - a.scrollTop
        return { top, bottom: top + h, box: { top: r.top, bottom: r.bottom }, el: a.tagName }
      }
      const sel = getSelection(); if (!sel || !sel.rangeCount) return null
      const r = sel.getRangeAt(0).cloneRange(); r.collapse(false)
      let rect = r.getClientRects()[0]
      if (!rect || (!rect.height && !rect.top)) { const s = document.createElement('span'); s.textContent = '​'; r.insertNode(s); rect = s.getBoundingClientRect(); const p = s.parentNode; s.remove(); p?.normalize?.() }
      const host = (sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest?.('.cin')
      const b = host?.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, box: b ? { top: b.top, bottom: b.bottom } : null, el: 'cin' }
    },
    cin() { const c = document.querySelector('.composer .cin'); return c ? { top: Math.round(c.scrollTop), h: c.scrollHeight, ch: c.clientHeight, max: c.scrollHeight - c.clientHeight } : null },
    chat() { const c = document.querySelector('.chat-scroll'); return c ? { top: Math.round(c.scrollTop), max: Math.round(c.scrollHeight - c.clientHeight) } : null },
    /** 스크롤 기록 — 켠 뒤로 그 칸의 scrollTop 이 지나간 값들 */
    log: {}, offs: [],
    watch(sel, name) { const c = document.querySelector(sel); if (!c) return; const arr = (this.log[name] = [Math.round(c.scrollTop)]); const f = () => arr.push(Math.round(c.scrollTop)); c.addEventListener('scroll', f, { passive: true }); this.offs.push(() => c.removeEventListener('scroll', f)) },
    stop() { for (const f of this.offs) f(); this.offs = []; const out = this.log; this.log = {}; return out },
    paste(text) { const a = document.activeElement; const dt = new DataTransfer(); dt.setData('text/plain', text); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); const go = a.dispatchEvent(ev); if (go && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) { /* 기본 동작 — 브라우저가 넣는다 */ document.execCommand('insertText', false, text) } }
  }
}
/** 커서가 그 칸(또는 화면) 안에 보이는가 */
const seen = (c, vh) => !!c && c.bottom > c.top && !!c.box && c.top >= c.box.top - 2 && c.bottom <= c.box.bottom + 2 && c.top >= 0 && c.bottom <= vh + 1
const spread = (arr) => (arr && arr.length ? Math.max(...arr) - Math.min(...arr) : 0)
/** 잰 값을 그대로 찍는다 — 고장을 좁힐 때만(`KS_DUMP=1`) */
const dump = (name, v) => { if (process.env.KS_DUMP) console.log('  ·', name, JSON.stringify(v)) }

export async function caretScroll({ br, check, port = 7491, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-ks-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-ks-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-ks-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-ks-cc-'))
  const REL = '3. Area/제품_Rondo', abs = join(root, REL)
  for (const d of ['1. Inbox', '2. Projects', REL, '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(abs, 'CLAUDE.md'), '# x\n'); writeFileSync(join(abs, 'readme.md'), '# 읽어 보기\n'); writeFileSync(join(abs, 'state.md'), '> 현재 목표: 검사\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(process.cwd(), 'test/fixtures/no-such-codex'), CLAUDE_CONFIG_DIR: claudeCfg }
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 160)}`); return t ? JSON.parse(t) : null }
  const until = async (f, msg, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await f()) return; await wait(100) } throw new Error('기다리다 끝남 — ' + msg) }
  const stateOf = async (sid) => (await api(`/sessions/${sid}/chat`)).info.state
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(base + '/api/health'); up = true } catch { await wait(150) } }
    must(up, '검사 전제 깨짐 — 호스트가 안 떴다 ' + out.slice(-200))
    if (!br) return
    const bot = await api('/bots/start', { rel: REL })
    // 대화가 화면보다 길어야 «위를 읽는 중» 을 만들 수 있다
    const mk = async (name, n = 7) => { const s = await api(`/bots/${bot.id}/sessions`, { name }); for (let i = 0; i < n; i++) { await api(`/sessions/${s.id}/send`, { text: `되읊어: ${LINES(6, `말 ${i + 1}`)}` }); await until(async () => (await stateOf(s.id)) !== 'running', '되읊기 턴이 안 끝난다') } return s }
    const open = async (vp, sid, phone) => {
      const ctx = await br.newContext(phone ? { viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: vp, deviceScaleFactor: 1 })
      const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message))
      await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') }); await pg.addInitScript(PROBE)
      await pg.goto(`${base}/#bot=${bot.id}&s=${sid}`); await pg.waitForSelector('.composer .cin', { timeout: 10000 }); await wait(700)
      return { pg, ctx, errs }
    }
    const K = (pg) => ({
      caret: () => pg.evaluate(() => window.__k.caret()), cin: () => pg.evaluate(() => window.__k.cin()), chat: () => pg.evaluate(() => window.__k.chat()),
      watch: (sel, name) => pg.evaluate(([s, n]) => window.__k.watch(s, n), [sel, name]), stop: () => pg.evaluate(() => window.__k.stop()),
      paste: (t) => pg.evaluate((x) => window.__k.paste(x), t),
      clear: async () => { await pg.click('.composer .cin'); await pg.keyboard.press('Meta+A'); await pg.keyboard.press('Backspace'); await wait(150) },
      vh: () => pg.evaluate(() => innerHeight)
    })

    const sA = await mk('커서 검사')
    const D = await open({ width: 1440, height: 900 }, sA.id, false); const pg = D.pg; const k = K(pg)

    await check('K1 입력칸 — 긴 글을 붙여 넣으면 커서(글의 끝)가 입력칸 안에 보인다', async () => {
      await k.clear(); await k.paste(LINES(40)); await wait(350)
      const c = await k.caret(), s = await k.cin(), vh = await k.vh()
      must(s.max > 100, '검사 전제 — 입력칸이 넘칠 만큼 길지 않다 ' + JSON.stringify(s))
      must(seen(c, vh), '🔴 붙여 넣은 뒤 커서가 입력칸 밖에 있다(안 보인다) ' + JSON.stringify({ c, s }))
      must(s.top >= s.max - 4, '붙여 넣은 뒤 입력칸이 끝까지 안 내려갔다 ' + JSON.stringify(s))
      if (shots) await pg.screenshot({ path: join(shots, 'ks-1-붙여넣기-desktop.png') })
    })

    await check('K2 입력칸 — 긴 글의 끝에서 ⇧⏎ 로 줄을 넣으면 새 줄의 커서가 보인다', async () => {
      await pg.keyboard.press('Shift+Enter'); await wait(250)
      const c = await k.caret(), s = await k.cin(), vh = await k.vh()
      must(seen(c, vh) && s.top >= s.max - 4, '🔴 ⇧⏎ 뒤 새 줄의 커서가 안 보인다 ' + JSON.stringify({ c, s }))
      await pg.keyboard.type('끝에 친 글'); await wait(200)
      const c2 = await k.caret(); must(seen(c2, vh), '끝에 글을 친 뒤 커서가 안 보인다 ' + JSON.stringify(c2))
    })

    await check('K3 입력칸 — 긴 글의 앞쪽을 고쳐도 입력칸이 끝으로 튀지 않고 커서가 보인다 · 가운데에 붙여 넣어도 그 자리에 머문다', async () => {
      // 맨 위로 올려 둘째 줄을 누르고 고친다
      await pg.evaluate(() => { document.querySelector('.composer .cin').scrollTop = 0 }); await wait(150)
      const box = await pg.evaluate(() => { const r = document.querySelector('.composer .cin').getBoundingClientRect(); return { x: r.left + 60, y: r.top + 30 } })
      await pg.mouse.click(box.x, box.y); await wait(150)
      await k.watch('.composer .cin', 'cin'); await k.watch('.chat-scroll', 'chat')
      await pg.keyboard.type('고침'); await wait(250)
      const a = await k.stop(); const c = await k.caret(), s = await k.cin(), vh = await k.vh()
      must(seen(c, vh), '🔴 앞쪽을 고친 뒤 커서가 안 보인다 ' + JSON.stringify({ c, s }))
      must(s.top <= 40 && spread(a.cin) <= 40, '🔴 앞쪽을 고쳤는데 입력칸이 튀었다 ' + JSON.stringify({ s, log: a.cin }))
      must(spread(a.chat) <= 2, '🔴 입력칸을 고쳤는데 대화가 움직였다 ' + JSON.stringify(a.chat))
      // 그 자리에 두 줄을 붙여 넣는다 — 커서가 보이고 입력칸은 그 근처에 머문다
      await k.watch('.composer .cin', 'cin')
      await k.paste('가운데 줄 하나\n가운데 줄 둘'); await wait(300)
      const b = await k.stop(); const c2 = await k.caret(), s2 = await k.cin()
      must(seen(c2, vh), '🔴 가운데에 붙여 넣은 뒤 커서가 안 보인다 ' + JSON.stringify({ c2, s2 }))
      must(s2.top <= 120, '🔴 가운데에 붙여 넣었는데 입력칸이 끝으로 튀었다 ' + JSON.stringify({ s2, log: b.cin }))
    })

    await check('K4 입력칸 — 글이 통째로 다시 그려질 때(@ 로 파일을 골라 칩이 설 때)도 스크롤이 맨 위로 안 돌아가고 커서가 보인다', async () => {
      // 끝으로 가서 @ 로 파일을 고른다 — 칩이 서면서 입력칸이 다시 그려진다
      await pg.click('.composer .cin'); await pg.keyboard.press('Meta+ArrowDown'); await wait(150)
      await pg.keyboard.type(' @rea'); await wait(500)
      await pg.keyboard.press('Enter'); await wait(500)
      const chip = await pg.evaluate(() => !!document.querySelector('.composer .cin [data-chip]'))
      must(chip, '검사 전제 — @ 로 고른 파일이 칩으로 안 섰다')
      const c = await k.caret(), s = await k.cin(), vh = await k.vh()
      must(s.top >= s.max - 40, '🔴 칩이 서면서 입력칸 스크롤이 위로 돌아갔다 ' + JSON.stringify(s))
      must(seen(c, vh), '🔴 칩이 선 뒤 커서가 안 보인다 ' + JSON.stringify({ c, s }))
      if (shots) await pg.screenshot({ path: join(shots, 'ks-4-칩-뒤-desktop.png') })
    })

    await check('K5 대화 — 위를 읽는 중에 입력칸에 붙여 넣거나 줄을 늘려도 대화가 움직이지 않는다', async () => {
      await k.clear()
      const max = (await k.chat()).max; must(max > 300, '검사 전제 — 대화가 화면보다 길지 않다 ' + max)
      await pg.evaluate(() => { const c = document.querySelector('.chat-scroll'); c.scrollTop = Math.round((c.scrollHeight - c.clientHeight) / 2) }); await wait(400)
      const at0 = (await k.chat()).top
      await pg.click('.composer .cin'); await wait(200)
      const at1 = (await k.chat()).top
      must(Math.abs(at1 - at0) <= 2, '🔴 입력칸을 누르기만 했는데 대화가 움직였다 ' + JSON.stringify({ at0, at1 }))
      await k.watch('.chat-scroll', 'chat')
      await k.paste(LINES(12)); await wait(500)
      for (let i = 0; i < 4; i++) { await pg.keyboard.press('Shift+Enter'); await pg.keyboard.type('더 친 줄') } await wait(500)
      const a = await k.stop(); const at2 = (await k.chat()).top
      must(Math.abs(at2 - at0) <= 2 && spread(a.chat) <= 2, '🔴 위를 읽는 중인데 입력칸 때문에 대화가 움직였다 ' + JSON.stringify({ at0, at2, log: a.chat }))
    })

    await check('K6 대화 — 맨 아래를 보는 중에 입력칸이 자라면 마지막 말이 가려지지 않는다', async () => {
      await k.clear()
      await pg.evaluate(() => { const c = document.querySelector('.chat-scroll'); c.scrollTop = c.scrollHeight }); await wait(500)
      await pg.click('.composer .cin'); await k.paste(LINES(8)); await wait(900)
      const g = await pg.evaluate(() => { const c = document.querySelector('.chat-scroll'); const foot = document.querySelector('.composer').getBoundingClientRect(); const lastMsg = [...document.querySelectorAll('.chat-body .amsg, .chat-body .umsg, .chat-body .msg')].pop()?.getBoundingClientRect(); return { gap: Math.round(c.scrollHeight - c.clientHeight - c.scrollTop), footTop: Math.round(foot.top), lastBottom: lastMsg ? Math.round(lastMsg.bottom) : null } })
      must(g.gap <= 4, '🔴 맨 아래를 보고 있었는데 입력칸이 자란 뒤 따라 내려가지 않았다 ' + JSON.stringify(g))
      must(g.lastBottom === null || g.lastBottom <= g.footTop + 2, '🔴 마지막 말이 입력칸에 가려졌다 ' + JSON.stringify(g))
      await k.clear()
    })

    await check('K7 질문 카드 — «기타» 칸에 글을 쳐도 대화가 위아래로 움직이지 않고 그 칸이 화면 안에 있다', async () => {
      const s = await api(`/bots/${bot.id}/sessions`, { name: '질문 검사' })
      for (let i = 0; i < 4; i++) { await api(`/sessions/${s.id}/send`, { text: `되읊어: ${LINES(6, `앞말 ${i + 1}`)}` }); await until(async () => (await stateOf(s.id)) !== 'running', '되읊기 턴이 안 끝난다') }
      await api(`/sessions/${s.id}/send`, { text: '질문 하나 해 줘' })
      await until(async () => (await stateOf(s.id)) === 'awaiting_input', '질문 카드가 안 뜬다')
      await pg.goto(`${base}/#bot=${bot.id}&s=${s.id}`); await pg.waitForSelector('.card[data-kind="ask"] input', { timeout: 8000 }); await wait(900)
      const vh = await k.vh()
      const before = await k.chat()
      await pg.click('.card[data-kind="ask"] input'); await wait(300)
      await k.watch('.chat-scroll', 'chat')
      await pg.keyboard.type('직접 쓰는 답 — 조금 긴 글을 쳐 본다 가나다라마바사'); await wait(400)
      await k.paste(' 그리고 붙여 넣은 글'); await wait(400)
      const a = await k.stop(); const after = await k.chat()
      const r = await pg.evaluate(() => { const i = document.querySelector('.card[data-kind="ask"] input').getBoundingClientRect(); const f = document.querySelector('.composer').getBoundingClientRect(); return { top: Math.round(i.top), bottom: Math.round(i.bottom), footTop: Math.round(f.top), v: document.querySelector('.card[data-kind="ask"] input').value } })
      must(/직접 쓰는 답/.test(r.v) && /붙여 넣은 글/.test(r.v), '검사 전제 — «기타» 칸에 글이 안 들어갔다 ' + JSON.stringify(r.v))
      must(spread(a.chat) <= 2 && Math.abs(after.top - before.top) <= 2 + Math.max(0, after.max - before.max), '🔴 «기타» 칸에 글을 치는 동안 대화가 움직였다 ' + JSON.stringify({ before, after, log: a.chat }))
      must(r.top >= 0 && r.bottom <= Math.min(vh, r.footTop) + 2, '🔴 «기타» 칸이 화면 밖이거나 입력칸에 가려졌다 ' + JSON.stringify(r))
      if (shots) await pg.screenshot({ path: join(shots, 'ks-7-질문-카드-desktop.png') })
      const chat = await api(`/sessions/${s.id}/chat`)
      await api(`/sessions/${s.id}/permission`, { requestId: chat.info.pending[0].requestId, allow: false }).catch(() => {})
    })

    await check('K8 질문 카드 — 미리보기 [고치기] 의 글 칸: 눌러도 대화가 안 튀고 · 붙여 넣은 글의 끝에 커서가 보이고 · 글자를 쳐도 대화가 흔들리지 않는다', async () => {
      const s = await api(`/bots/${bot.id}/sessions`, { name: '미리보기 검사' })
      for (let i = 0; i < 3; i++) { await api(`/sessions/${s.id}/send`, { text: `되읊어: ${LINES(6, `앞말 ${i + 1}`)}` }); await until(async () => (await stateOf(s.id)) !== 'running', '되읊기 턴이 안 끝난다') }
      await api(`/sessions/${s.id}/send`, { text: '미리보기질문 해 줘' })
      await until(async () => (await stateOf(s.id)) === 'awaiting_input', '미리보기 질문 카드가 안 뜬다')
      await pg.goto(`${base}/#bot=${bot.id}&s=${s.id}`); await pg.waitForSelector('.card[data-kind="ask"] .pvw', { timeout: 8000 }); await wait(900)
      const btn = await pg.$('.card[data-kind="ask"] .pvw button:has-text("고치기")'); must(btn, '검사 전제 — 미리보기에 [고치기] 가 없다')
      const vh = await k.vh()
      const tOf = () => pg.evaluate(() => { const x = document.querySelector('.card .pvw textarea'); const r = x.getBoundingClientRect(); const f = document.querySelector('.composer').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), st: Math.round(x.scrollTop), max: x.scrollHeight - x.clientHeight, footTop: Math.round(f.top), lines: x.value.split('\n').length } })
      const inView = (c, t) => !!c && c.bottom > c.top && c.top >= c.box.top - 2 && c.bottom <= c.box.bottom + 2 && c.top >= 0 && c.bottom <= Math.min(vh, t.footTop) + 2
      // ① [고치기] 를 누른다 — 읽던 글이 그 자리에서 글 칸이 된다. 대화가 튀면 안 된다
      const c0 = await k.chat()
      await k.watch('.chat-scroll', 'chat')
      await btn.click(); await pg.waitForSelector('.card .pvw textarea', { timeout: 4000 }); await wait(500)
      const a0 = await k.stop(); const c1 = await k.chat()
      dump('K8 ① 고치기 누름', { c0, c1, log: a0.chat })
      // ② 끝에 긴 글을 붙여 넣는다 — 글 칸이 자라고, 커서(끝)가 입력칸 위 보이는 자리에 있어야 한다
      await k.watch('.chat-scroll', 'chat')
      await pg.keyboard.press('Meta+ArrowDown'); await k.paste('\n' + LINES(14, '고친 줄')); await wait(700)
      const a = await k.stop(); const c = await k.caret(); const t = await tOf()
      dump('K8 ② 끝에 붙여넣기', { c, t, log: a.chat })
      must(t.lines >= 14, '검사 전제 — 글 칸에 붙여 넣은 글이 없다 ' + JSON.stringify(t))
      // ③ 끝에서 한 글자씩 친다 — 대화가 위아래로 흔들리면 안 된다
      await k.watch('.chat-scroll', 'chat')
      for (const ch of '끝에 더 친 글') { await pg.keyboard.type(ch); await wait(60) } await wait(500)
      const a3 = await k.stop(); const c3 = await k.caret(); const t3 = await tOf()
      dump('K8 ③ 끝에서 치기', { c3, t3, log: a3.chat })
      // ④ 맨 앞으로 가서 한 글자씩 친다 — 글 칸이 화면보다 길 때 대화가 튀는지
      await pg.keyboard.press('Meta+ArrowUp'); await wait(500)
      const c4a = await k.chat()
      await k.watch('.chat-scroll', 'chat')
      for (const ch of '앞에 친 글') { await pg.keyboard.type(ch); await wait(60) } await wait(500)
      const a4 = await k.stop(); const c4 = await k.caret(); const t4 = await tOf(); const c4b = await k.chat()
      dump('K8 ④ 앞에서 치기', { c4a, c4b, c4, t4, log: a4.chat })
      must(inView(c, t), '🔴 미리보기 글 칸에 붙여 넣은 뒤 커서가 화면 밖이거나 입력칸에 가려졌다 ' + JSON.stringify({ c, t, vh }))
      must(spread(a0.chat) <= 12, '🔴 [고치기] 를 눌렀는데 대화가 튀었다 ' + JSON.stringify({ c0, c1, log: a0.chat }))
      must(inView(c3, t3) && spread(a3.chat) <= 4, '🔴 미리보기 글 칸의 끝에서 글자를 치는데 대화가 흔들리거나 커서가 안 보인다 ' + JSON.stringify({ c3, t3, log: a3.chat }))
      must(inView(c4, t4) && spread(a4.chat) <= 2, '🔴 미리보기 글 칸의 앞쪽에서 글자를 치는데 대화가 움직였다 ' + JSON.stringify({ c4a, c4b, c4, log: a4.chat }))
      if (shots) await pg.screenshot({ path: join(shots, 'ks-8-미리보기-고치기-desktop.png') })
      const chat = await api(`/sessions/${s.id}/chat`)
      await api(`/sessions/${s.id}/permission`, { requestId: chat.info.pending[0].requestId, allow: false }).catch(() => {})
    })

    await check('K9 대기 말 — [고치기] 의 글 칸에 붙여 넣어도 커서가 보이고 대화가 튀지 않는다', async () => {
      const s = await api(`/bots/${bot.id}/sessions`, { name: '대기 말 검사' })
      for (let i = 0; i < 3; i++) { await api(`/sessions/${s.id}/send`, { text: `되읊어: ${LINES(6, `앞말 ${i + 1}`)}` }); await until(async () => (await stateOf(s.id)) !== 'running', '되읊기 턴이 안 끝난다') }
      await pg.goto(`${base}/#bot=${bot.id}&s=${s.id}`); await pg.waitForSelector('.composer .cin', { timeout: 8000 }); await wait(600)
      await api(`/sessions/${s.id}/send`, { text: '느린일 길게' }); await until(async () => (await stateOf(s.id)) === 'running', '느린 턴이 안 돈다')
      await pg.click('.composer .cin'); await pg.keyboard.type('기다렸다 보낼 말'); await pg.keyboard.press('Enter')
      await pg.waitForSelector('.qlist .queue', { timeout: 5000 }); await wait(300)
      const editBtn = await pg.$('.qlist .queue button:has-text("고치기")'); must(editBtn, '검사 전제 — 대기 말 줄에 [고치기] 가 없다')
      await editBtn.click(); await pg.waitForSelector('.qlist .queue .qin', { timeout: 4000 }); await wait(300)
      const vh = await k.vh()
      await k.watch('.chat-scroll', 'chat')
      await pg.keyboard.press('Meta+ArrowDown'); await k.paste('\n' + LINES(12, '대기 줄')); await wait(600)
      const a = await k.stop(); const c = await k.caret()
      const t = await pg.evaluate(() => { const x = document.querySelector('.qlist .queue .qin'); const r = x.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), st: Math.round(x.scrollTop), max: x.scrollHeight - x.clientHeight, lines: x.value.split('\n').length } })
      must(t.lines >= 12, '검사 전제 — 대기 말 글 칸에 붙여 넣은 글이 없다 ' + JSON.stringify(t))
      must(c && c.top >= c.box.top - 2 && c.bottom <= c.box.bottom + 2 && c.top >= 0 && c.bottom <= vh + 1, '🔴 대기 말 글 칸에서 커서가 안 보인다 ' + JSON.stringify({ c, t }))
      must(t.top >= 0 && t.bottom <= vh + 1, '🔴 대기 말 글 칸이 화면 밖으로 나갔다 ' + JSON.stringify(t))
      if (shots) await pg.screenshot({ path: join(shots, 'ks-9-대기-말-고치기-desktop.png') })
      await pg.keyboard.press('Escape'); await wait(200)
      await api(`/sessions/${s.id}/interrupt`, { by: 'human' }).catch(() => {})
    })

    await check('K11 멈춘 자리 — [프롬프트 고치기] 로 긴 말이 입력칸에 올라와도 커서가 보인다', async () => {
      const s = await api(`/bots/${bot.id}/sessions`, { name: '고쳐 다시 검사' })
      await pg.goto(`${base}/#bot=${bot.id}&s=${s.id}`); await pg.waitForSelector('.composer .cin', { timeout: 8000 }); await wait(600)
      await api(`/sessions/${s.id}/send`, { text: `느린일 길게\n${LINES(40, '보낸 줄')}` }); await until(async () => (await stateOf(s.id)) === 'running', '느린 턴이 안 돈다')
      await wait(400); await api(`/sessions/${s.id}/interrupt`, { by: 'human' })
      await pg.waitForSelector('.stopln button:has-text("프롬프트 고치기")', { timeout: 8000 }); await wait(300)
      await pg.click('.stopln button:has-text("프롬프트 고치기")'); await wait(700)
      const c = await k.caret(), sc = await k.cin(), vh = await k.vh()
      dump('K11 프롬프트 고치기', { c, sc })
      must(sc.max > 100, '검사 전제 — 올라온 말이 입력칸을 넘치지 않는다 ' + JSON.stringify(sc))
      must(seen(c, vh), '🔴 [프롬프트 고치기] 뒤 커서가 입력칸 안에 안 보인다 ' + JSON.stringify({ c, sc }))
      await pg.keyboard.type('이어서 친 글'); await wait(300)
      const c2 = await k.caret(), sc2 = await k.cin()
      must(seen(c2, vh), '🔴 [프롬프트 고치기] 뒤 글을 쳤는데 커서가 안 보인다 ' + JSON.stringify({ c2, sc2 }))
      const v = await pg.evaluate(() => document.querySelector('.composer .cin').dataset.value)
      must(/이어서 친 글/.test(v) && /보낸 줄 40/.test(v), '검사 전제 — 입력칸의 글이 다르다 ' + JSON.stringify(v.slice(-60)))
      await k.clear()
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
    })
    await D.ctx.close()

    await check('K12 폰 — 질문 카드의 미리보기 [고치기] 에 붙여 넣고 글을 쳐도 커서가 보이고 대화가 흔들리지 않는다', async () => {
      const s = await api(`/bots/${bot.id}/sessions`, { name: '폰 미리보기 검사' })
      for (let i = 0; i < 3; i++) { await api(`/sessions/${s.id}/send`, { text: `되읊어: ${LINES(6, `앞말 ${i + 1}`)}` }); await until(async () => (await stateOf(s.id)) !== 'running', '되읊기 턴이 안 끝난다') }
      await api(`/sessions/${s.id}/send`, { text: '미리보기질문 해 줘' })
      await until(async () => (await stateOf(s.id)) === 'awaiting_input', '미리보기 질문 카드가 안 뜬다')
      const P = await open({ width: 390, height: 844 }, s.id, true); const ph = P.pg; const kp = K(ph)
      try {
        await ph.waitForSelector('.card[data-kind="ask"] .pvw', { timeout: 8000 }); await wait(900)
        const btn = await ph.$('.card[data-kind="ask"] .pvw button:has-text("고치기")'); must(btn, '검사 전제 — 폰 미리보기에 [고치기] 가 없다')
        await btn.tap(); await ph.waitForSelector('.card .pvw textarea', { timeout: 4000 }); await wait(500)
        const vh = await kp.vh()
        const tOf = () => ph.evaluate(() => { const x = document.querySelector('.card .pvw textarea'); const r = x.getBoundingClientRect(); const f = document.querySelector('.composer').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), footTop: Math.round(f.top), lines: x.value.split('\n').length } })
        const inView = (c, t) => !!c && c.bottom > c.top && c.top >= c.box.top - 2 && c.bottom <= c.box.bottom + 2 && c.top >= 0 && c.bottom <= Math.min(vh, t.footTop) + 2
        await ph.evaluate(() => { const x = document.querySelector('.card .pvw textarea'); x.focus(); x.setSelectionRange(x.value.length, x.value.length) })
        await kp.paste('\n' + LINES(14, '고친 줄')); await wait(700)
        const c = await kp.caret(), t = await tOf()
        dump('K12 폰 붙여넣기', { c, t, vh })
        must(t.lines >= 14, '검사 전제 — 폰 글 칸에 붙여 넣은 글이 없다 ' + JSON.stringify(t))
        must(inView(c, t), '🔴 폰 미리보기 글 칸에 붙여 넣은 뒤 커서가 화면 밖이거나 입력칸에 가려졌다 ' + JSON.stringify({ c, t, vh }))
        await kp.watch('.chat-scroll', 'chat')
        for (const ch of '끝에 더 친 글') { await ph.keyboard.type(ch); await wait(60) } await wait(500)
        const a = await kp.stop(); const c2 = await kp.caret(), t2 = await tOf()
        dump('K12 폰 끝에서 치기', { c2, t2, log: a.chat })
        must(inView(c2, t2) && spread(a.chat) <= 4, '🔴 폰 미리보기 글 칸의 끝에서 글자를 치는데 대화가 흔들리거나 커서가 안 보인다 ' + JSON.stringify({ c2, t2, log: a.chat }))
        if (shots) await ph.screenshot({ path: join(shots, 'ks-12-미리보기-고치기-phone.png') })
        must(!P.errs.length, '화면 오류 ' + P.errs.join(' | '))
      } finally { await P.ctx.close(); const chat = await api(`/sessions/${s.id}/chat`); await api(`/sessions/${s.id}/permission`, { requestId: chat.info.pending[0]?.requestId, allow: false }).catch(() => {}) }
    })

    // ⚠ 폰은 입력칸에 초점이 가면 대화를 **맨 아래로 붙인다**(키보드가 올라올 때 «무엇에 답하는지» 가 보이게 · `stickBottom`). 그래서 폰에서는
    //   «위를 읽는 중» 이 아니라 «맨 아래에서 입력칸이 자랄 때 마지막 말이 가려지지 않는가» 를 잰다.
    await check('K10 폰 — 입력칸에 긴 글을 붙여 넣으면 커서가 보이고, 마지막 말이 입력칸에 가려지지 않는다', async () => {
      const P = await open({ width: 390, height: 844 }, sA.id, true); const ph = P.pg; const kp = K(ph)
      try {
        const max = (await kp.chat()).max; must(max > 300, '검사 전제 — 폰 대화가 화면보다 길지 않다 ' + max)
        // 앞 검사가 남긴 초안이 있으면 비운다 — 붙여 넣은 글의 끝이 곧 글의 끝이어야 잴 수 있다
        await ph.evaluate(() => { const e = document.querySelector('.composer .cin'); e.focus({ preventScroll: true }); const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r) }); await ph.keyboard.press('Backspace'); await wait(1100)
        await kp.paste(LINES(30)); await wait(1000)
        const c = await kp.caret(), s = await kp.cin(), vh = await kp.vh()
        must(s.max > 60, '검사 전제 — 폰 입력칸이 넘치지 않는다 ' + JSON.stringify(s))
        must(seen(c, vh) && s.top >= s.max - 12, '🔴 폰에서 붙여 넣은 뒤 커서가 안 보인다 ' + JSON.stringify({ c, s }))
        const g = await kp.chat()
        must(g.max - g.top <= 4, '🔴 폰에서 입력칸이 자란 뒤 대화가 맨 아래를 따라가지 않았다(마지막 말이 가려진다) ' + JSON.stringify(g))
        if (shots) await ph.screenshot({ path: join(shots, 'ks-10-붙여넣기-phone.png') })
        must(!P.errs.length, '화면 오류 ' + P.errs.join(' | '))
      } finally { await P.ctx.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  const only = process.env.KS_ONLY ? process.env.KS_ONLY.split(',') : null   // 예: KS_ONLY=K8,K9 — 그 줄만 돈다
  try { await caretScroll({ br, shots: 'test/tmp', check: async (name, f) => { if (only && !only.some((o) => name.startsWith(o + ' '))) return; try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' ')) }
  await br.close()
  console.log(`\n${red ? '🔴' : '✅'} 커서와 스크롤 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
