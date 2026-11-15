/**
 * ═══ 보여 주기 보기 (2026-11-12 Dave «화면을 띄워 보여 주기» · 11/15 카드 답 셋 — 입력칸 «남긴다» · 승인 카드 «보이고 경로만 가린다» · 폰 «폰에도 넣는다») ═══
 *
 * 강의 · 자문 자리나 화면 공유 때 켜는 보기다. 재는 것은 둘이다 — ① **다른 폴더의 이름과 작업 흔적이 화면에서 사라졌는가** ② **보여 줄 것(말 · 답 · 카드 · 입력칸)은 남았는가**.
 *   P1 켜기 — 머리줄 [보여 주기] 를 누르면 왼쪽 목록 · 오른쪽 패널 · 세션 줄이 사라지고, 화면 글에 다른 폴더 이름이 없다
 *   P2 작업 흔적 — 도구 줄 · 전후 비교 단추가 사라지고, 파일 칩은 이름만 남는다(경로 말풍선 없음)
 *   P3 승인 카드 — 카드와 [허용] · [거부] 는 그대로, 명령 원문과 CLI 가 준 설명은 화면에 없다
 *   P4 글자 — 내 말과 답이 한 단계 크다(13 → 15)
 *   P5 입력칸 — 남아 있고 보낼 수 있다. 모드 · 모델 줄과 메인 이름 줄은 없다. 카드의 [허용] 도 그 자리에서 된다
 *   P6 끄기 — ⎋ 로는 안 꺼진다 · ⌘⇧P 로 끄고 켠다 · 명령 팔레트로도 끈다 · [보여 주기 끝내기] 로 끈다
 *   P7 문서 열 — 열려 있으면 남고, 탭 줄만 사라진다. 가로 넘침이 없다
 *   P8 기억하지 않는다 — 켠 채로 다시 열면 꺼져 있다
 *   P9 폰 — 세션 목록 시트 맨 아래에서 켠다 · 하단 탭과 봇 목록 단추가 사라진다 · [끝내기] 는 44px · 글자 17 · 끄면 탭이 돌아온다
 *   P10 폰 — 보여 주는 동안에는 오른쪽으로 쓸어도 봇 목록이 안 나온다
 *   P11 중간 폭 — 아이콘 띠와 알약 독도 사라진다
 *
 * 🔴 **«안 보인다» 는 «평소에는 보인다» 와 짝으로 잰다.** 처음 쓴 폰 검사는 없는 자리(`.composer .cchips`)를 세어 0 이라 통과했고,
 *    실제로는 모드 · 모델 줄이 그대로 보였다(캡처에서 발견). 숨김을 재는 줄마다 켜기 전의 개수를 먼저 확인한다.
 *
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔). 스모크가 불러 쓰고(`presentView`), 혼자서도 돈다(`node test/present.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }
const OTHER = '비밀고객'   // 다른 폴더의 이름 — 보여 주는 동안 화면 글 어디에도 없어야 한다

/** 화면에 **보이는** 글 · 요소 */
const SEEN = () => {
  window.__p = {
    vis(sel) { return [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.right > 0 && r.left < innerWidth }).length },
    text() { return document.body.innerText },
    tips() { return [...document.querySelectorAll('[data-tip], [title]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }).map((e) => `${e.getAttribute('data-tip') ?? ''} ${e.getAttribute('title') ?? ''}`).join('\n') },
    fs(sel) { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontSize : null },
    over() { return document.documentElement.scrollWidth - innerWidth }
  }
}

export async function presentView({ br, check, port = 7493, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-pv-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-pv-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-pv-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-pv-cc-'))
  const REL = '3. Area/제품_Rondo', REL2 = `2. Projects/2026-12_컨설팅-${OTHER}`
  for (const d of ['1. Inbox', '2. Projects', REL, REL2, '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  for (const r of [REL, REL2]) { writeFileSync(join(root, r, 'CLAUDE.md'), '# x\n'); writeFileSync(join(root, r, 'readme.md'), '# 읽어 보기\n'); writeFileSync(join(root, r, 'state.md'), '> 현재 목표: 검사\n') }
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(process.cwd(), 'test/fixtures/no-such-codex'), CLAUDE_CONFIG_DIR: claudeCfg }
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 160)}`); return t ? JSON.parse(t) : null }
  const until = async (f, msg, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await f()) return; await wait(100) } throw new Error('기다리다 끝남 — ' + msg) }
  const stateOf = async (sid) => (await api(`/sessions/${sid}/chat`)).info.state
  const idle = (sid) => until(async () => { const st = await stateOf(sid); return st !== 'running' && st !== 'awaiting_input' }, '턴이 안 끝난다')
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(base + '/api/health'); up = true } catch { await wait(150) } }
    must(up, '검사 전제 깨짐 — 호스트가 안 떴다 ' + out.slice(-200))
    if (!br) return
    const bot = await api('/bots/start', { rel: REL }); await api('/bots/start', { rel: REL2 })
    const s = await api(`/bots/${bot.id}/sessions`, { name: '슬라이드 4부' })
    await api(`/bots/${bot.id}/sessions`, { name: '대관 확인' })
    // ① 제목이 든 답 ② 승인 → 도구 줄과 파일 칩 ③ 걸려 있는 승인 카드(명령 원문 `cd /tmp/x && npm run qa …`)
    await api(`/sessions/${s.id}/send`, { text: '되읊어: # 어디까지 왔나\n슬라이드까지 왔고, 리허설이 남았어요.' }); await idle(s.id)
    await api(`/sessions/${s.id}/send`, { text: '승인 받고 파일 하나 써 줘' })
    await until(async () => (await stateOf(s.id)) === 'awaiting_input', '승인 카드가 안 뜬다')
    { const chat = await api(`/sessions/${s.id}/chat`); await api(`/sessions/${s.id}/permission`, { requestId: chat.info.pending[0].requestId, allow: true }) }
    await idle(s.id)
    await api(`/sessions/${s.id}/send`, { text: '맨손 승인 하나 더' })
    await until(async () => (await stateOf(s.id)) === 'awaiting_input', '둘째 승인 카드가 안 뜬다')

    const open = async (vp, phone) => {
      const ctx = await br.newContext(phone ? { viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: vp, deviceScaleFactor: 1 })
      const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message))
      await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') }); await pg.addInitScript(SEEN)
      await pg.goto(`${base}/#bot=${bot.id}&s=${s.id}`); await pg.waitForSelector('.composer .cin', { timeout: 10000 }); await wait(900)
      return { pg, ctx, errs }
    }
    const P = (pg) => ({ vis: (sel) => pg.evaluate((x) => window.__p.vis(x), sel), text: () => pg.evaluate(() => window.__p.text()), tips: () => pg.evaluate(() => window.__p.tips()), fs: (sel) => pg.evaluate((x) => window.__p.fs(x), sel), over: () => pg.evaluate(() => window.__p.over()), on: () => pg.evaluate(() => document.querySelector('.app').classList.contains('present')) })

    const D = await open({ width: 1440, height: 900 }, false); const pg = D.pg; const p = P(pg)

    await check('P1 켜기 — 머리줄 [보여 주기] 를 누르면 왼쪽 목록 · 오른쪽 패널 · 세션 줄이 사라지고, 화면 글에 다른 폴더 이름이 없다', async () => {
      // 전제 — 평소에는 다 보인다
      const t0 = await p.text()
      must(t0.includes(OTHER), '검사 전제 — 평소 화면에 다른 폴더 이름이 없다(왼쪽 목록이 안 보인다)')
      must(await p.vis('.col.side.left') === 1 && await p.vis('.rpwrap') === 1 && await p.vis('.sstrip, .sesstrip, .col.chat.has-strip') >= 1, '검사 전제 — 평소 화면에 왼쪽 목록 · 오른쪽 패널 · 세션 줄이 없다')
      must(t0.includes('대관 확인'), '검사 전제 — 평소 화면에 다른 세션 이름이 없다')
      const pre = { tl: await p.vis('.chat-body .grp'), think: await p.vis('.chat-body .meta.think'), sub: await p.vis('.chat-body .sub'), todow: await p.vis('.chat-body .todow'), cmd: await p.vis('.card[data-kind="perm"] .cmd'), cbtn: await p.vis('.composer .cbtn:not(.cplus)'), cfoot: await p.vis('.cfoot') }
      must(pre.tl >= 1 && pre.think >= 1 && pre.sub >= 1 && pre.todow >= 1 && pre.cmd === 1 && pre.cbtn >= 2 && pre.cfoot === 1, 'PRE0 ' + JSON.stringify(pre))
      must((await p.tips()).includes('stub-output.md') && /\/[^\n]*stub-output\.md/.test(await p.tips()), '검사 전제 — 평소 파일 칩에 경로 말풍선이 없다')
      must(await p.fs('.chat-body .amsg') === '13px', '검사 전제 — 평소 답의 글자가 13px 이 아니다 ' + await p.fs('.chat-body .amsg'))
      if (shots) await pg.screenshot({ path: join(shots, 'pv-0-평소-desktop.png') })
      await pg.click('.chat-hdr [data-present-on]'); await wait(500)
      must(await p.on(), '[보여 주기] 를 눌렀는데 안 켜졌다')
      must(await p.vis('.col.side') === 0 && await p.vis('.rpwrap') === 0 && await p.vis('.cols > .strip') === 0 && await p.vis('.cols > .divx') === 0, '🔴 보여 주는 중인데 왼쪽 목록 · 오른쪽 패널 · 띠가 보인다')
      const t = await p.text()
      must(!t.includes(OTHER), '🔴 보여 주는 중인데 화면 글에 다른 폴더 이름이 있다')
      must(!t.includes('대관 확인'), '🔴 보여 주는 중인데 화면 글에 다른 세션 이름이 있다')
      must(!(await p.tips()).includes(OTHER), '🔴 보여 주는 중인데 말풍선 글에 다른 폴더 이름이 있다')
      const h = await pg.evaluate(() => document.querySelector('.chat-hdr').innerText.replace(/\s+/g, ' ').trim())
      must(/제품_Rondo|Rondo/.test(h) && h.includes('슬라이드 4부') && h.includes('보여 주기 끝내기'), '머리줄이 «폴더 이름 · 세션 이름 · [보여 주기 끝내기]» 가 아니다 — ' + h)
      if (shots) await pg.screenshot({ path: join(shots, 'pv-1-보여-주기-desktop.png') })
    })

    await check('P2 작업 흔적 — 도구 줄 · 전후 비교 단추가 사라지고, 파일 칩은 이름만 남는다(경로 말풍선 없음)', async () => {
      const tr = { grp: await p.vis('.chat-body .grp'), tl: await p.vis('.chat-body .tl'), think: await p.vis('.chat-body .meta.think'), sub: await p.vis('.chat-body .sub'), todow: await p.vis('.chat-body .todow'), meta: await p.vis('.chat-body > .meta:not(.err)'), rule: await p.vis('.card .meta.rule'), bgo: await p.vis('.live .bgo') }
      must(Object.values(tr).every((n) => n === 0), 'TRACE ' + JSON.stringify(tr))
      must(await p.vis('.chat-body .tl') === 0, '🔴 보여 주는 중인데 도구 줄이 보인다')
      must(await p.vis('.chat-body .dchip') === 0, '🔴 보여 주는 중인데 전후 비교 단추가 보인다')
      const chip = await pg.evaluate(() => { const c = document.querySelector('.chat-body .fchip'); return c ? { text: c.innerText.trim(), tip: c.getAttribute('data-tip'), fb: !!c.querySelector('.fb'), w: c.getBoundingClientRect().width } : null })
      must(chip && chip.w > 0 && chip.text === 'stub-output.md', '🔴 파일 칩이 이름만 남지 않았다 ' + JSON.stringify(chip))
      must(!chip.tip && !chip.fb, '🔴 보여 주는 중인데 파일 칩에 경로가 남아 있다 ' + JSON.stringify(chip))
      must(!/\/[^\n]*stub-output\.md/.test(await p.tips()), '🔴 보여 주는 중인데 말풍선 글에 파일 경로가 있다')
    })

    await check('P3 승인 카드 — 카드와 [허용] · [거부] 는 그대로, 명령 원문과 CLI 가 준 설명은 화면에 없다', async () => {
      const c = await pg.evaluate(() => { const k = document.querySelector('.card[data-kind="perm"]'); return k ? { q: k.querySelector('.q')?.innerText.trim(), cmd: !!k.querySelector('.cmd'), text: k.innerText, allow: !!k.querySelector('[data-act="allow"]'), deny: !!k.querySelector('[data-act="deny"]'), titles: [...k.querySelectorAll('[title]')].map((e) => e.getAttribute('title')).join('|') } : null })
      must(c, '🔴 보여 주는 중인데 승인 카드가 없다 — 안 보이면 일이 멈춘 줄 모른다')
      must(c.allow && c.deny, '🔴 승인 카드에 [허용] · [거부] 가 없다')
      must(c.q === '명령을 실행해요', '🔴 승인 카드의 한 줄이 «명령을 실행해요» 가 아니다 — ' + c.q)
      must(!c.cmd && !/\/tmp\/x|npm run qa|tee log/.test(c.text + c.titles), '🔴 보여 주는 중인데 승인 카드에 명령 원문이 있다 — ' + c.text.replace(/\s+/g, ' ').slice(0, 120))
      must(!/\/tmp\/x|npm run qa/.test(await p.text()), '🔴 보여 주는 중인데 화면 글에 명령 원문이 있다')
    })

    await check('P4 글자 — 내 말과 답이 한 단계 크다(13 → 15)', async () => {
      const a = await p.fs('.chat-body .amsg'), u = await p.fs('.chat-body .umsg'), h1 = await p.fs('.chat-body .amsg .md h1')
      must(a === '15px' && u === '15px', '🔴 보여 주는 중인데 글자가 15px 이 아니다 ' + JSON.stringify({ a, u }))
      must(h1 === '22px', '답 속 큰 제목이 22px 이 아니다 ' + h1)
    })

    await check('P5 입력칸 — 남아 있고 보낼 수 있다. 모드 · 모델 줄과 메인 이름 줄은 없다. 카드의 [허용] 도 그 자리에서 된다', async () => {
      must(await p.vis('.composer .cin') === 1 && await p.vis('.composer .sendb') === 1, '🔴 보여 주는 중인데 입력칸이나 보내기 단추가 없다')
      must(await p.vis('.composer .cplus') === 1, 'ATTACH gone')
      must(await p.vis('.composer .cbtn:not(.cplus)') === 0 && await p.vis('.composer .ring') === 0 && await p.vis('.cfoot') === 0, '🔴 보여 주는 중인데 모드 · 모델 · 사용량 · 메인 이름 줄이 보인다')
      await pg.click('.card[data-kind="perm"] [data-act="allow"]'); await idle(s.id); await wait(500)
      must(await p.vis('.card[data-kind="perm"]') === 0, '[허용] 을 눌렀는데 카드가 남아 있다')
      const tr = { grp: await p.vis('.chat-body .grp'), tl: await p.vis('.chat-body .tl'), think: await p.vis('.chat-body .meta.think'), sub: await p.vis('.chat-body .sub'), todow: await p.vis('.chat-body .todow'), meta: await p.vis('.chat-body > .meta:not(.err)'), rule: await p.vis('.card .meta.rule'), bgo: await p.vis('.live .bgo') }
      must(Object.values(tr).every((n) => n === 0), 'TRACE ' + JSON.stringify(tr))
      must(await p.vis('.chat-body .tl') === 0, '🔴 허용 뒤 새로 생긴 도구 줄이 보인다')
      await pg.click('.composer .cin'); await pg.keyboard.type('되읊어: 보여 주는 중에 물은 말'); await pg.keyboard.press('Enter'); await idle(s.id); await wait(600)
      const last = await pg.evaluate(() => [...document.querySelectorAll('.chat-body .amsg')].pop()?.innerText ?? '')
      must(/보여 주는 중에 물은 말/.test(last), '🔴 보여 주는 중에 보낸 말의 답이 안 보인다 — ' + last.slice(0, 80))
      must(await p.on(), '말을 보냈더니 보여 주기가 꺼졌다')
      if (shots) await pg.screenshot({ path: join(shots, 'pv-5-보내고-난-뒤-desktop.png') })
    })

    await check('P6 끄기 — ⎋ 로는 안 꺼진다 · ⌘⇧P 로 끄고 켠다 · 명령 팔레트로도 끈다 · [보여 주기 끝내기] 로 끈다', async () => {
      await pg.click('.chat-body'); await pg.keyboard.press('Escape'); await wait(300)
      must(await p.on(), '🔴 ⎋ 를 눌렀더니 보여 주기가 꺼졌다 — 봇 목록이 드러난다')
      await pg.keyboard.press('Meta+Shift+P'); await wait(400)
      must(!(await p.on()) && (await p.text()).includes(OTHER), '⌘⇧P 로 안 꺼졌다')
      await pg.keyboard.press('Meta+Shift+P'); await wait(400)
      must(await p.on(), '⌘⇧P 로 다시 안 켜졌다')
      await pg.keyboard.press('Meta+P'); await pg.waitForSelector('.palette input, .pal input, .modal input', { timeout: 4000 }); await pg.keyboard.type('보여 주기'); await wait(400)
      const row = await pg.evaluate(() => [...document.querySelectorAll('.modal *, .palette *, .pal *')].map((e) => (e.children.length ? '' : e.textContent ?? '')).filter((x) => x.includes('보여 주기')).join('|'))
      must(/보여 주기 끝내기/.test(row), '명령 팔레트에 «보여 주기 끝내기» 가 없다 — ' + row)
      await pg.keyboard.press('Enter'); await wait(500)
      must(!(await p.on()), '명령 팔레트로 안 꺼졌다')
      await pg.click('.chat-hdr [data-present-on]'); await wait(300); must(await p.on(), '다시 안 켜졌다')
      await pg.click('.chat-hdr [data-present-end]'); await wait(300)
      must(!(await p.on()) && await p.vis('.col.side.left') === 1 && await p.vis('.rpwrap') === 1 && await p.vis('.chat-body .grp') >= 1, '[보여 주기 끝내기] 뒤 평소 화면으로 안 돌아왔다')
    })

    await check('P7 문서 열 — 열려 있으면 남고, 탭 줄만 사라진다. 가로 넘침이 없다', async () => {
      await pg.click('.chat-body .fchip'); await pg.waitForSelector('.col.doc', { timeout: 6000 }); await wait(700)
      must(await p.vis('.col.doc > .hdr') === 1, '검사 전제 — 평소 문서 열에 탭 줄이 없다')
      await pg.click('.chat-hdr [data-present-on]'); await wait(500)
      must(await p.vis('.col.doc') === 1 && await p.vis('.col.doc .dbody') >= 1, '🔴 보여 주는 중인데 열어 둔 문서가 사라졌다')
      must(await p.vis('.col.doc > .hdr') === 0 && await p.vis('.col.doc .dtb') === 0, '🔴 보여 주는 중인데 문서 열의 탭 줄 · 경로 줄이 보인다')
      must(await p.over() <= 0, '🔴 보여 주는 중 가로로 넘친다 ' + await p.over())
      must(!(await p.text()).includes(OTHER), '🔴 문서 열을 둔 채 보여 주는 중인데 다른 폴더 이름이 보인다')
      if (shots) await pg.screenshot({ path: join(shots, 'pv-7-문서-열과-함께-desktop.png') })
    })

    await check('P8 기억하지 않는다 — 켠 채로 다시 열면 꺼져 있다', async () => {
      must(await p.on(), '검사 전제 — 켜져 있지 않다')
      await pg.reload(); await pg.waitForSelector('.composer .cin', { timeout: 10000 }); await wait(700)
      must(!(await p.on()), '🔴 다시 열었는데 보여 주기가 켜져 있다')
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
    })
    await D.ctx.close()

    const M = await open({ width: 390, height: 844 }, true); const ph = M.pg; const q = P(ph)
    await check('P9 폰 — 세션 목록 시트 맨 아래에서 켠다 · 하단 탭과 봇 목록 단추가 사라진다 · [끝내기] 는 44px · 글자 17 · 끄면 탭이 돌아온다', async () => {
      must(await q.vis('.chat-foot .cchips') === 1 && await q.vis('.chat-foot .cbtn') >= 2 && await q.vis('.chat-body .grp') >= 1, 'PRE9 ' + JSON.stringify({ chips: await q.vis('.chat-foot .cchips'), cbtn: await q.vis('.chat-foot .cbtn'), grp: await q.vis('.chat-body .grp') }))
      must(await q.vis('.tabbar') === 1 && await q.vis('.chat-hdr .hb-menu') === 1, '검사 전제 — 폰 평소 화면에 하단 탭 · 봇 목록 단추가 없다')
      must(await q.fs('.chat-body .amsg') === '16px', '검사 전제 — 폰 평소 답의 글자가 16px 이 아니다 ' + await q.fs('.chat-body .amsg'))
      if (shots) await ph.screenshot({ path: join(shots, 'pv-8-평소-phone.png') })
      await ph.tap('.chat-hdr .hnb'); await ph.waitForSelector('.tsheet.sesssheet .srow.spres', { timeout: 4000 }); await wait(300)
      const row = await ph.evaluate(() => { const r = document.querySelector('.tsheet.sesssheet .srow.spres'); const b = r.getBoundingClientRect(); const all = [...document.querySelectorAll('.tsheet.sesssheet .srow')]; return { h: Math.round(b.height), last: all[all.length - 1] === r, text: r.innerText.replace(/\s+/g, ' ').trim() } })
      must(row.h >= 44 && row.last && row.text.startsWith('보여 주기'), '폰 시트의 «보여 주기» 줄이 맨 아래 44px 줄이 아니다 ' + JSON.stringify(row))
      if (shots) await ph.screenshot({ path: join(shots, 'pv-9-시트-phone.png') })
      await ph.tap('.tsheet.sesssheet .srow.spres'); await wait(600)
      must(await q.on(), '폰에서 «보여 주기» 를 눌렀는데 안 켜졌다')
      must(await q.vis('.tsheet') === 0, '켠 뒤에도 시트가 남아 있다')
      must(await q.vis('.tabbar') === 0 && await q.vis('.chat-hdr .hb-menu') === 0 && await q.vis('.chat-hdr .hnb') === 0, '🔴 폰에서 보여 주는 중인데 하단 탭 · 봇 목록 단추 · 세션 고르기가 보인다')
      must(await q.vis('.chat-foot .cchips') === 0 && await q.vis('.chat-foot .cbtn') === 0 && await q.vis('.chat-foot .ring') === 0, '🔴 폰에서 보여 주는 중인데 모드 · 모델 줄이 보인다')
      must(await q.vis('.chat-body .grp') === 0 && await q.vis('.chat-body .meta.think') === 0 && await q.vis('.chat-body .sub') === 0, '🔴 폰에서 보여 주는 중인데 도구 줄이 보인다')
      const end = await ph.evaluate(() => { const b = document.querySelector('.chat-hdr [data-present-end]'); const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), t: b.innerText.trim(), right: Math.round(innerWidth - r.right) } })
      must(end.h >= 44 && end.t === '끝내기' && end.right >= 0, '폰 [끝내기] 가 44px 이 아니거나 화면 밖이다 ' + JSON.stringify(end))
      must(await q.fs('.chat-body .amsg') === '17px' && await q.fs('.chat-body .umsg') === '17px', '🔴 폰에서 보여 주는 중인데 글자가 17px 이 아니다 ' + await q.fs('.chat-body .amsg'))
      must(!(await q.text()).includes(OTHER), '🔴 폰에서 보여 주는 중인데 다른 폴더 이름이 보인다')
      must(await q.over() <= 0, '🔴 폰에서 보여 주는 중 가로로 넘친다 ' + await q.over())
      must(await q.vis('.composer .cin') === 1, '🔴 폰에서 보여 주는 중인데 입력칸이 없다')
      if (shots) await ph.screenshot({ path: join(shots, 'pv-10-보여-주기-phone.png') })
    })

    await check('P10 폰 — 보여 주는 동안에는 오른쪽으로 쓸어도 봇 목록이 안 나온다. 끄면 탭이 돌아온다', async () => {
      const swipe = async () => { const ev = (t, x, extra = {}) => ph.dispatchEvent('.cols', t, { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 420, button: 0, bubbles: true, ...extra }); await ev('pointerdown', 6, { buttons: 1 }); for (const x of [20, 60, 120, 200, 280, 330]) { await ev('pointermove', x, { buttons: 1 }); await wait(24) } await ev('pointerup', 330); await wait(800) }
      const listOpen = () => ph.evaluate(() => !!document.querySelector('.drawer.left.open') || document.querySelector('.app')?.getAttribute('data-view') === 'list')
      must(await q.on(), '검사 전제 — 켜져 있지 않다')
      await swipe()
      must(!(await listOpen()), '🔴 보여 주는 중인데 쓸었더니 봇 목록이 나왔다')
      must(!(await q.text()).includes(OTHER), '🔴 쓸고 난 뒤 다른 폴더 이름이 보인다')
      await ph.tap('.chat-hdr [data-present-end]'); await wait(500)
      must(!(await q.on()) && await q.vis('.tabbar') === 1 && await q.vis('.chat-hdr .hb-menu') === 1, '[끝내기] 뒤 폰 평소 화면으로 안 돌아왔다')
      // 전제 — 평소에는 같은 쓸기로 봇 목록이 나온다(그래야 위의 «안 나온다» 가 뜻이 있다)
      await swipe()
      must(await listOpen(), '검사 전제 — 평소에도 이 쓸기로는 봇 목록이 안 나온다(쓸기 흉내가 안 먹는다)')
      must(!M.errs.length, '화면 오류 ' + M.errs.join(' | '))
    })
    await M.ctx.close()

    await check('P11 중간 폭 — 아이콘 띠와 알약 독도 사라지고, 띠의 말풍선에 남던 다른 폴더 이름도 없다', async () => {
      const W = await open({ width: 1000, height: 760 }, false); const mp = W.pg; const w = P(mp)
      try {
        const pre = { strip: await w.vis('.cols > .strip'), dock: await w.vis('.cols > .dock'), tip: (await w.tips()).includes(OTHER) || (await w.text()).includes(OTHER) }
        must(pre.strip >= 1 && pre.dock === 1, '검사 전제 — 중간 폭 평소 화면에 아이콘 띠 · 알약 독이 없다 ' + JSON.stringify(pre))
        await mp.click('.chat-hdr [data-present-on]'); await wait(500)
        must(await w.on(), '중간 폭에서 [보여 주기] 를 눌렀는데 안 켜졌다')
        must(await w.vis('.cols > .strip') === 0 && await w.vis('.cols > .dock') === 0 && await w.vis('.cols > .drawer') === 0, '🔴 중간 폭에서 보여 주는 중인데 아이콘 띠 · 독 · 서랍이 보인다')
        must(!(await w.text()).includes(OTHER) && !(await w.tips()).includes(OTHER), '🔴 중간 폭에서 보여 주는 중인데 다른 폴더 이름이 글이나 말풍선에 있다')
        must(await w.over() <= 0, '🔴 중간 폭에서 보여 주는 중 가로로 넘친다 ' + await w.over())
        must(await w.fs('.chat-body .amsg') === '15px', '중간 폭에서 글자가 15px 이 아니다')
        if (shots) await mp.screenshot({ path: join(shots, 'pv-11-보여-주기-mid.png') })
        must(!W.errs.length, '화면 오류 ' + W.errs.join(' | '))
      } finally { await W.ctx.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  try { await presentView({ br, shots: 'test/tmp', check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n')[0]) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' ')) }
  await br.close()
  console.log(`\n${red ? '🔴' : '✅'} 보여 주기 보기 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
