/**
 * EA · «맡긴 에이전트를 보고 멈춘다» 검사 (2026-11-11) — 맡긴 일 목록 · 하나 멈추기 · 뒤에서 도는 일 화면 · 서브에이전트가 쓴 글 · 에이전트 정의.
 *
 * 스모크(`test/smoke.mjs`)가 이 파일의 `eaTasks()` 를 불러 돌린다(검사 하나라도 빨가면 스모크가 멈춘다).
 * 혼자서도 돈다 — `node test/ea-tasks.mjs` 는 픽스처 볼트·스텁 CLI 로 호스트를 띄워 검사마다 ✓/✗ 를 찍고 **끝까지** 간다.
 * 🔴 «고치기 전 판에서 실제로 빨개지는가» 를 검사마다 따로 보려고 이렇게 나눴다 — 스모크는 첫 실패에서 멈춰서 뒤의 검사가
 *    빨간지 알 수 없다. `git stash push -u -- src && npm run build && node test/ea-tasks.mjs` 로 옛 판을 잰다(스텁은 새것 그대로).
 * ⚠ 실 앱·실 볼트·`~/.claude` 를 건드리지 않는다 — 스텁의 기록 파일도 임시 폴더(`CLAUDE_CONFIG_DIR`)에 쓴다.
 */
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param o.base      호스트 주소
 * @param o.root      픽스처 볼트
 * @param o.claudeCfg 스텁이 기록 파일을 쓰는 `CLAUDE_CONFIG_DIR`
 * @param o.botId     검사에 쓸 봇(시작돼 있어야 한다) · o.botAbs 그 봇의 폴더
 * @param o.br        playwright 브라우저(없으면 화면 검사는 건너뛴다)
 * @param o.check     (이름, async () => void) — 던지면 빨강. 스모크는 곧바로 fail, 혼자 돌 때는 적고 계속 간다
 * @param o.shots     캡처를 남길 폴더(없으면 안 남긴다)
 */
export async function eaTasks({ base, root, claudeCfg, botId, botAbs, br, check, shots }) {
  const raw = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json() } catch { /* */ } return { status: r.status, j } }
  const api = async (p, body, method) => { const r = await raw(p, body, method); if (r.status >= 400) throw new Error(`${p} → ${r.status} ${r.j?.error ?? ''}`); return r.j }
  const until = async (f, what, ms = 8000) => { const t0 = Date.now(); let last; for (;;) { try { last = await f(); if (last) return last } catch (e) { last = String(e.message ?? e) } if (Date.now() - t0 > ms) throw new Error(`기다렸는데 안 됐다 — ${what} · 마지막 ${JSON.stringify(last)?.slice(0, 300)}`); await wait(60) } }
  const must = (cond, msg) => { if (!cond) throw new Error(msg) }
  const tasksOf = async (sid) => (await api(`/sessions/${sid}/tasks`)).tasks
  const chatOf = (sid) => api(`/sessions/${sid}/chat`)
  const send = async (text, name) => (await api(`/bots/${botId}/send`, { text, name })).sessionId
  const running = (ts) => ts.filter((t) => t.status === 'run')
  const made = []
  const three = async (text, name) => { const sid = await send(text, name); made.push(sid); const ts = await until(async () => { const t = await tasksOf(sid); return running(t).length === 3 && running(t).every((x) => x.taskId) ? t : null }, '도는 일 셋(task_id 까지)'); return { sid, ts, a: ts.find((t) => t.name === '로그 훑기'), b: ts.find((t) => t.name === '문서 조사'), sh: ts.find((t) => t.name === '개발 서버 띄우기') } }

  // SSE — `task` 프레임이 실제로 나가는지 본다
  const frames = []; const sse = new AbortController()
  void (async () => { try { const r = await fetch(base + '/api/events', { signal: sse.signal }); const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const c = buf.slice(0, i); buf = buf.slice(i + 2); for (const l of c.split('\n')) if (l.startsWith('data: ')) { try { frames.push(JSON.parse(l.slice(6))) } catch { /* */ } } } } } catch { /* 끝 */ } })()
  await wait(300)

  // ── A · 호스트 ──────────────────────────────────────────────────────────────
  let S = null
  await check('A1 목록 — 뒤에서 도는 서브에이전트 둘·셸 하나가 «도는 중» 으로 선다(종류·task_id·도구 횟수·프레임)', async () => {
    S = await three('맡긴일 뒤에서 턴중 돌려 줘', 'EA 턴중')
    must(S.a?.kind === 'agent' && S.b?.kind === 'agent' && S.sh?.kind === 'shell', '종류가 틀렸다 ' + JSON.stringify(S.ts.map((t) => [t.name, t.kind])))
    must(S.a.subagentType === 'Explore' && S.a.bg && S.a.toolUseId && S.a.startedAt > 0, '에이전트 줄의 칸이 비었다 ' + JSON.stringify(S.a))
    const a2 = await until(async () => { const t = (await tasksOf(S.sid)).find((x) => x.id === S.a.id); return t.tools === 1 ? t : null }, '도구 횟수 1')
    must(/Grep/.test(a2.last ?? ''), '마지막으로 한 일이 없다 ' + JSON.stringify(a2))
    must(frames.some((f) => f.ev === 'task' && f.sessionId === S.sid && f.task?.id === S.sh.id), '`task` 프레임이 안 나갔다')
    must((await chatOf(S.sid)).tasks?.length === 3, '대화를 받을 때 목록이 함께 안 온다')
  })
  await check('A2 턴이 도는 중에 하나만 멈추기 — stop_task 가 가고 그 줄만 «멈춤», 턴과 나머지는 그대로', async () => {
    must((await chatOf(S.sid)).info.state === 'running', '턴이 도는 중이어야 재는 검사다')
    const r = await raw(`/sessions/${S.sid}/tasks/${S.a.taskId}/stop`, {}); must(r.status === 200 && r.j.ok, '멈추기 답 ' + JSON.stringify(r))
    const ts = await until(async () => { const t = await tasksOf(S.sid); return t.find((x) => x.id === S.a.id).status === 'stopped' ? t : null }, '멈춘 줄이 «멈춤» 으로')
    must(ts.find((x) => x.id === S.b.id).status === 'run' && ts.find((x) => x.id === S.sh.id).status === 'run', '다른 줄까지 멈췄다 ' + JSON.stringify(ts.map((t) => [t.name, t.status])))
    const c = await chatOf(S.sid)
    must(c.info.state === 'running', '하나만 멈췄는데 턴이 끝났다 · ' + c.info.state)
    const it = c.items.find((x) => x.id === `t_${S.a.toolUseId}`); must(it?.stopped === true && it.status !== 'run', '대화 속 카드가 «멈춤» 이 아니다 ' + JSON.stringify(it))
    must(ts.find((x) => x.id === S.a.id).endedAt > 0 && /멈춤/.test(ts.find((x) => x.id === S.a.id).summary ?? ''), '끝난 시각·요약이 없다')
  })
  await check('A3 턴이 끝난 뒤에도 멈춘다 — 남은 에이전트와 셸을 하나씩', async () => {
    await until(async () => (await chatOf(S.sid)).info.state !== 'running', '턴 끝', 12000)
    const c0 = await chatOf(S.sid); must(c0.info.bg === 1 && running(c0.tasks).length === 2, '턴이 끝난 뒤 남은 것이 둘이어야 한다 ' + JSON.stringify({ bg: c0.info.bg, t: c0.tasks.map((t) => [t.name, t.status]) }))
    must((await raw(`/sessions/${S.sid}/tasks/${S.b.taskId}/stop`, {})).status === 200, '턴이 끝난 뒤 에이전트 멈추기')
    await until(async () => (await tasksOf(S.sid)).find((x) => x.id === S.b.id).status === 'stopped', '에이전트 멈춤')
    await until(async () => (await chatOf(S.sid)).items.some((x) => x.kind === 'assistant' && x.text === `멈춤 확인: ${S.b.taskId}`), '멈춘 뒤 봇이 한 번 답한다')
    must((await raw(`/sessions/${S.sid}/tasks/${S.sh.taskId}/stop`, {})).status === 200, '셸 멈추기')
    const c = await until(async () => { const x = await chatOf(S.sid); return running(x.tasks).length === 0 && x.info.bg === 0 ? x : null }, '다 멈춤')
    must(c.tasks.every((t) => t.status === 'stopped'), '상태 ' + JSON.stringify(c.tasks.map((t) => [t.name, t.status])))
  })
  await check('A4 못 멈출 때는 이유를 말한다 — 끝난 작업 409 · 모르는 작업 404 · 이상한 id 400', async () => {
    const done = await raw(`/sessions/${S.sid}/tasks/${S.a.taskId}/stop`, {}); must(done.status === 409 && /이미 끝난/.test(done.j?.error ?? ''), '끝난 작업 ' + JSON.stringify(done))
    const none = await raw(`/sessions/${S.sid}/tasks/nope12345/stop`, {}); must(none.status === 404, '모르는 작업 ' + JSON.stringify(none))
    for (const bad of ['..%2F..%2Fx', 'a.b', 'a%20b', '%2e%2e%2fetc']) { const r = await raw(`/sessions/${S.sid}/tasks/${bad}/stop`, {}); must(r.status === 400, `이상한 id «${bad}» 를 받았다 ` + JSON.stringify(r)) }
  })
  await check('A5 워커가 내려가면 «도는 중» 이 남지 않는다 — 세션을 재우면 줄이 닫히고 멈추기는 409', async () => {
    const H = await three('맡긴일 뒤에서 돌려 줘', 'EA 재우기')
    await until(async () => (await chatOf(H.sid)).info.state !== 'running', '턴 끝')
    await api(`/sessions/${H.sid}/hibernate`, {})
    const ts = await until(async () => { const t = await tasksOf(H.sid); return running(t).length === 0 ? t : null }, '워커가 내려간 뒤 줄이 닫힌다')
    must(ts.every((t) => t.status === 'stopped' && /중단/.test(t.summary ?? '')), '닫힌 까닭이 없다 ' + JSON.stringify(ts.map((t) => [t.status, t.summary])))
    must((await raw(`/sessions/${H.sid}/tasks/${H.a.taskId}/stop`, {})).status === 409, '닫힌 줄에 멈추기가 통했다')
    must((await chatOf(H.sid)).items.filter((x) => x.kind === 'subagent').every((x) => x.status !== 'run'), '카드가 아직 돈다')
  })
  let L = null
  await check('A6 서브에이전트 결과를 자르지 않는다 — 2000자 넘는 결과가 끝 표식까지 남는다', async () => {
    const sid = await send('맡긴일 긴결과 보고서', 'EA 긴결과'); made.push(sid)
    await until(async () => (await chatOf(sid)).info.state === 'done', '턴 끝')
    const c = await chatOf(sid); const it = c.items.find((x) => x.kind === 'subagent')
    must(it?.status === 'done' && it.result.length > 2000 && it.result.endsWith('끝표식-EA9'), `결과가 잘렸다 · ${it?.result?.length}자 · …${it?.result?.slice(-20)}`)
    must(it.taskId && c.tasks.find((t) => t.taskId === it.taskId)?.status === 'done', '목록의 줄이 «끝남» 이 아니다 ' + JSON.stringify(c.tasks))
    L = { sid, it }
  })
  await check('A7 서브에이전트가 쓴 글 — 기록 파일에서 글만, 큰 도구 결과 줄은 버리고', async () => {
    const r = await raw(`/sessions/${L.sid}/tasks/${L.it.taskId}/transcript`); must(r.status === 200 && r.j.state === 'ok', '답 ' + JSON.stringify(r).slice(0, 200))
    must(r.j.texts.length === 2 && /기록표식-W1/.test(r.j.texts[0]) && r.j.texts[1].endsWith('끝표식-EA9'), '글이 다르다 ' + JSON.stringify(r.j.texts.map((t) => t.slice(0, 30))))
    must(JSON.stringify(r.j).length < 20000 && !JSON.stringify(r.j).includes('yyyyyyyy'), '도구 결과(1.2MB 한 줄)가 섞여 왔다')
    // 기록 파일이 없는 작업 — «없어요» 로 답한다(오류가 아니다)
    const sid = await send('백그라운드 조사', 'EA 기록없음'); made.push(sid)
    const t = await until(async () => (await tasksOf(sid)).find((x) => x.taskId), '백그라운드 작업')
    const m = await raw(`/sessions/${sid}/tasks/${t.taskId}/transcript`); must(m.status === 200 && m.j.state === 'missing' && m.j.texts.length === 0, '없는 기록 ' + JSON.stringify(m))
  })
  await check('A8 쓴 글 API 는 경로를 안 받는다 — 이상한 id 400 · 이 세션이 모르는 id 404 · 밖을 가리키는 심링크는 «없어요»', async () => {
    // ⚠ 글자 그대로의 `..` 는 fetch 가 주소를 먼저 접어 이 길에 닿지도 않는다 — 인코딩한 꼴로 잰다
    for (const bad of ['..%2F..%2Fx', '..%2F..%2F..%2Fetc%2Fpasswd', 'a.jsonl', '%2Ftmp%2Fx', 'a%00b']) { const r = await raw(`/sessions/${L.sid}/tasks/${bad}/transcript`); must(r.status === 400, `이상한 id «${bad}» 를 받았다 ` + JSON.stringify(r).slice(0, 160)) }
    const unk = await raw(`/sessions/${L.sid}/tasks/zzzunknown1/transcript`); must(unk.status === 404, '모르는 작업 ' + JSON.stringify(unk))
    // 다른 세션의 작업 id 로는 못 읽는다
    const other = await raw(`/sessions/${S.sid}/tasks/${L.it.taskId}/transcript`); must(other.status === 404, '남의 세션 작업을 읽었다 ' + JSON.stringify(other).slice(0, 160))
    // 심링크 — 기록 자리에 projects/ 밖의 파일을 가리키는 링크를 두어도 따라가지 않는다
    const cli = (await chatOf(S.sid)).info.cliSessionId
    const proj = join(claudeCfg, 'projects'); const slug = readdirSync(proj).find((d) => existsSync(join(proj, d, `${cli}.jsonl`))); must(slug, '스텁 기록 폴더를 못 찾았다')
    const outside = join(claudeCfg, 'outside-secret.jsonl'); writeFileSync(outside, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '밖의-비밀-EA' }] } }) + '\n')
    const dir = join(proj, slug, cli, 'subagents'); mkdirSync(dir, { recursive: true }); const link = join(dir, `agent-${S.a.taskId}.jsonl`); if (!existsSync(link)) symlinkSync(outside, link)
    const s = await raw(`/sessions/${S.sid}/tasks/${S.a.taskId}/transcript`); must(s.status === 200 && s.j.state === 'missing' && !JSON.stringify(s.j).includes('밖의-비밀'), '심링크를 따라 밖의 파일을 읽었다 ' + JSON.stringify(s).slice(0, 200))
  })
  await check('A9 에이전트 정의 — 폴더·사용자의 .claude/agents 를 이름·설명·범위로(같은 이름은 폴더가 이긴다)', async () => {
    mkdirSync(join(botAbs, '.claude/agents'), { recursive: true }); mkdirSync(join(claudeCfg, 'agents'), { recursive: true })
    writeFileSync(join(botAbs, '.claude/agents/log-reader.md'), '---\nname: log-reader\ndescription: 로그를 훑어 오류를 추리는 조사원\nmodel: haiku\ntools: Read, Grep\n---\n\n본문\n')
    writeFileSync(join(botAbs, '.claude/agents/이름없음.md'), '머리말 없는 파일\n')
    writeFileSync(join(claudeCfg, 'agents/reviewer.md'), '---\nname: reviewer\ndescription: >-\n  바뀐 코드를 읽고\n  문제를 짚는 검토자\n---\n')
    writeFileSync(join(claudeCfg, 'agents/log-reader.md'), '---\nname: log-reader\ndescription: 사용자 쪽 같은 이름\n---\n')
    const list = await api(`/bots/${botId}/agents`)
    const by = Object.fromEntries(list.map((a) => [a.name, a]))
    must(list.filter((a) => a.name === 'log-reader').length === 1 && by['log-reader'].scope === 'folder' && by['log-reader'].desc === '로그를 훑어 오류를 추리는 조사원' && by['log-reader'].model === 'haiku', 'log-reader ' + JSON.stringify(list))
    must(by['reviewer']?.scope === 'user' && by['reviewer'].desc === '바뀐 코드를 읽고 문제를 짚는 검토자', 'reviewer ' + JSON.stringify(by['reviewer']))
    must(by['이름없음']?.scope === 'folder', '머리말 없는 파일은 파일 이름으로 ' + JSON.stringify(list))
  })
  await check('A10 다시 붙을 때 — 대화가 «그대로» 여도 맡긴 일 목록은 함께 온다', async () => {
    const c = await chatOf(S.sid); const same = await api(`/sessions/${S.sid}/chat?v=${encodeURIComponent(c.ver)}`)
    must(same.same === true && same.items === undefined && Array.isArray(same.tasks) && same.tasks.length === 3, '«그대로» 답에 목록이 없다 ' + JSON.stringify(same).slice(0, 200))
  })

  // ── U · 화면 ───────────────────────────────────────────────────────────────
  if (br) {
    const shot = async (pg, name) => { if (shots) await pg.screenshot({ path: join(shots, `ea-${name}.png`) }) }
    const page = async (phone) => {
      const pg = await br.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
      const errs = []; pg.on('pageerror', (e) => errs.push(e.message))
      await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:layout') })
      return { pg, errs }
    }
    const goto = async (pg, sid) => { await pg.goto(`${base}/#bot=${botId}&s=${sid}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(500) }
    const rowsOf = (pg, scope) => pg.evaluate((sc) => [...document.querySelectorAll(`${sc} .bgt`)].map((e) => ({ id: e.dataset.task, st: e.dataset.status, nm: e.querySelector('.nm')?.textContent ?? '', tx: e.querySelector('.st')?.textContent ?? '', stop: !!e.querySelector('.stopb'), open: !!e.querySelector('.openb') })), scope)
    const U = { d: null, T: null, C: null }
    await check('U1 데스크톱 — 진행 줄의 단추가 여는 목록에 도는 중 3 · 배지 3 · 줄마다 [멈추기], 에이전트엔 [열기] (오른쪽 패널에는 그 칸이 없다)', async () => {
      U.T = await three('맡긴일 뒤에서 돌려 줘', 'EA 화면')
      await until(async () => (await chatOf(U.T.sid)).info.state !== 'running', '턴 끝')
      U.d = await page(false); const pg = U.d.pg; await goto(pg, U.T.sid)
      must(!(await pg.$('.panel .bgsec')), '오른쪽 패널에 «뒤에서 도는 일» 칸이 남았다')
      await pg.waitForSelector('.live .bgo', { timeout: 6000 }); await pg.click('.live .bgo')
      await pg.waitForSelector('.spop.bgpop .bgt', { timeout: 4000 })
      const rows = await rowsOf(pg, '.spop.bgpop'); must(rows.length === 3 && rows.every((r) => r.st === 'run' && r.stop), '줄 ' + JSON.stringify(rows))
      must(rows.find((r) => /로그 훑기/.test(r.nm))?.open && !rows.find((r) => /개발 서버/.test(r.nm))?.open, '[열기] 는 에이전트 줄에만 ' + JSON.stringify(rows))
      must(/도구 1/.test(rows.find((r) => /로그 훑기/.test(r.nm)).tx) && /Explore/.test(rows.find((r) => /로그 훑기/.test(r.nm)).tx), '상태 줄 ' + JSON.stringify(rows[0]))
      const head = await pg.evaluate(() => ({ c: document.querySelector('.live .bgo b')?.textContent, groups: [...document.querySelectorAll('.spop.bgpop .bgt-h')].map((e) => e.textContent) }))
      must(head.c === '3' && /도는 중\s*3/.test(head.groups[0] ?? ''), '머리줄 ' + JSON.stringify(head))
      await shot(pg, 'u1-데스크톱-패널')
    })
    await check('U2 진행 줄의 «뒤에서 도는 일 N» 단추 — 같은 단추 · ⎋ 로 닫히고 다시 열린다 · 접힌 패널 띠에는 그 단추가 없다', async () => {
      const pg = U.d.pg
      must(!(await pg.$('.strip.right .bgstrip')), '접힌 패널 띠에 «뒤에서 도는 일» 단추가 남았다')
      const btn = await pg.evaluate(() => { const b = document.querySelector('.live .bgo'); return b ? { t: b.textContent, n: b.querySelector('b')?.textContent } : null })
      must(btn && btn.n === '3' && /뒤에서 도는 일/.test(btn.t), '진행 줄 단추 ' + JSON.stringify(btn))
      await pg.click('.live .bgo'); await wait(300); must(!(await pg.$('.spop.bgpop')), '같은 단추로 안 닫힌다')
      await wait(350); await pg.click('.live .bgo'); await pg.waitForSelector('.spop.bgpop .bgt', { timeout: 4000 })
      await pg.keyboard.press('Escape'); await wait(250); must(!(await pg.$('.spop.bgpop')), '⎋ 로 안 닫힌다')
      await pg.click('.live .bgo'); await pg.waitForSelector('.spop.bgpop .bgt', { timeout: 4000 })
    })
    await check('U3 다시 붙으면 목록이 맞는다 — 프레임을 놓친 사이 멈춘 줄이, 다시 붙을 때 «멈춤» 으로', async () => {
      const pg = U.d.pg
      await pg.evaluate(() => { window.__fbHoldFrames = true }); await wait(150)
      await api(`/sessions/${U.T.sid}/tasks/${U.T.sh.taskId}/stop`, {})
      await until(async () => (await tasksOf(U.T.sid)).find((x) => x.id === U.T.sh.id).status === 'stopped', '호스트에서는 멈춤')
      await wait(400)
      must((await rowsOf(pg, '.spop.bgpop')).filter((r) => r.st === 'run').length === 3, '프레임을 막았는데 화면이 바뀌었다(검사 전제가 깨졌다)')
      await pg.evaluate(() => { window.__fbHoldFrames = false; window.dispatchEvent(new Event('online')) })
      await until(async () => { const r = await rowsOf(pg, '.spop.bgpop'); return r.filter((x) => x.st === 'run').length === 2 }, '다시 붙은 뒤 도는 중 2')
      must((await pg.evaluate(() => document.querySelector('.live .bgo b')?.textContent)) === '2', '배지가 안 줄었다')
    })
    await check('U4 목록 줄의 [멈추기] — 턴이 끝난 뒤에도 그 에이전트 하나만 멈추고 «끝남» 묶음으로 간다', async () => {
      const pg = U.d.pg
      must((await chatOf(U.T.sid)).info.state !== 'running', '턴이 끝난 상태여야 재는 검사다')
      await pg.click(`.spop.bgpop .bgt[data-task="${U.T.a.id}"] .stopb`)
      await until(async () => (await tasksOf(U.T.sid)).find((x) => x.id === U.T.a.id).status === 'stopped', '호스트에서 멈춤')
      await until(async () => (await rowsOf(pg, '.spop.bgpop')).filter((x) => x.st === 'run').length === 1, '화면에 도는 중 1')
      await pg.click('.spop.bgpop .bgt-h.fin'); await wait(250)
      const rows = await rowsOf(pg, '.spop.bgpop'); const a = rows.find((r) => r.id === U.T.a.id)
      must(a?.st === 'stopped' && /멈춤/.test(a.tx) && !a.stop && a.open, '멈춘 줄 ' + JSON.stringify(rows))
      must(rows.find((r) => r.id === U.T.b.id)?.st === 'run', '다른 에이전트까지 멈췄다')
      await shot(pg, 'u4-데스크톱-하나-멈춤')
    })
    await check('U5 대화 속 카드의 [멈추기] — 턴이 끝난 뒤(진행 줄에 턴 멈추기가 없는 때)에도 카드에서 멈춘다', async () => {
      const pg = U.d.pg
      await pg.keyboard.press('Escape'); await wait(250); must(!(await pg.$('.spop.bgpop')), '목록이 ⎋ 로 안 닫힌다')   // 열어 둔 목록이 카드를 가린다 — 닫고 누른다
      const card = `.chat-body .sub[data-sub="t_${U.T.b.toolUseId}"]`
      must(!(await pg.$('.live .stop')), '턴이 끝났는데 턴 멈추기가 있다(검사 전제)')
      await pg.click(`${card} .sstop`)
      await until(async () => (await tasksOf(U.T.sid)).find((x) => x.id === U.T.b.id).status === 'stopped', '호스트에서 멈춤')
      await until(async () => pg.evaluate((c) => { const e = document.querySelector(c); return !!e && !e.querySelector('.sstop') && !e.querySelector('.spin') }, card), '카드가 멈춤으로')
      must(!(await pg.$('.live .bgo')), '다 멈췄는데 진행 줄 단추가 남았다')
      must(!U.d.errs.length, '화면 오류 ' + U.d.errs.join(' | '))
    })
    await check('U6 열어 보기 — 300자 넘는 결과가 끝까지 마크다운으로 · «서브에이전트가 쓴 글 보기» 가 기록을 읽어 온다', async () => {
      const pg = U.d.pg; await goto(pg, L.sid)
      await pg.click('.chat-body .sub .l .ib'); await wait(250)
      const card = await pg.evaluate(() => ({ pv: document.querySelector('.sub .subres')?.textContent ?? '', more: !!document.querySelector('.sub .submore') }))
      must(card.pv.length > 300 && card.pv.length < 700 && card.more, '카드 앞머리 ' + JSON.stringify({ n: card.pv.length, more: card.more }))
      await pg.click('.sub .submore'); await pg.waitForSelector('.drill-r .dr-res', { timeout: 4000 })
      const res = await pg.evaluate(() => { const e = document.querySelector('.drill-r .dr-res'); return { t: e.textContent, h: e.querySelectorAll('h2').length, li: e.querySelectorAll('li').length, strong: e.querySelectorAll('strong').length } })
      must(res.t.length > 2000 && /끝표식-EA9\s*$/.test(res.t) && res.h === 1 && res.li === 30 && res.strong === 1, '결과 전문 ' + JSON.stringify({ n: res.t.length, h: res.h, li: res.li, s: res.strong, tail: res.t.slice(-16) }))
      await shot(pg, 'u6-데스크톱-결과-전문')
      await pg.click('.drill-w .wbtn'); await pg.waitForSelector('.drill-w .dr-wt', { timeout: 4000 })
      const w = await pg.$$eval('.drill-w .dr-wt', (els) => els.map((e) => e.textContent))
      must(w.length === 2 && /기록표식-W1/.test(w[0]) && /끝표식-EA9/.test(w[1]), '쓴 글 ' + JSON.stringify(w.map((t) => t.slice(0, 24))))
      must(!U.d.errs.length, '화면 오류 ' + U.d.errs.join(' | '))
      await U.d.pg.close()
    })
    await check('U7 폰(390pt) — 진행 줄의 단추 → 바닥 시트 → [멈추기] → [열기] 로 그 서브에이전트(올리기·끌기 없이)', async () => {
      U.C = await three('맡긴일 뒤에서 돌려 줘', 'EA 폰')
      await until(async () => (await chatOf(U.C.sid)).info.state !== 'running', '턴 끝')
      const { pg, errs } = await page(true); await goto(pg, U.C.sid)
      must((await pg.evaluate(() => document.querySelector('.app')?.className ?? '')).includes('phone'), '폰 판이 아니다')
      await pg.waitForSelector('.live .bgo', { timeout: 6000 })
      must(!(await pg.$('.tsheet.bgsheet')), '시트가 처음부터 떠 있다')
      await pg.tap('.live .bgo'); await pg.waitForSelector('.tsheet.bgsheet .bgt', { timeout: 4000 }); await wait(300)
      const rows = await rowsOf(pg, '.tsheet.bgsheet'); must(rows.length === 3 && rows.every((r) => r.st === 'run' && r.stop), '시트 줄 ' + JSON.stringify(rows))
      // 손가락 — 단추는 34px 이상, 시트는 화면 안, 줄은 가로로 안 샌다
      const fit = await pg.evaluate(() => { const sh = document.querySelector('.tsheet.bgsheet').getBoundingClientRect(); const bs = [...document.querySelectorAll('.bgsheet .stopb, .bgsheet .openb, .bgsheet .xb')].map((b) => b.getBoundingClientRect()); return { top: Math.round(sh.top), bottom: Math.round(sh.bottom), vh: innerHeight, minH: Math.min(...bs.map((b) => b.height)), maxR: Math.max(...bs.map((b) => b.right)), sw: document.documentElement.scrollWidth } })
      must(fit.top >= 0 && fit.bottom <= fit.vh + 1 && fit.minH >= 34 && fit.maxR <= 390 && fit.sw <= 390, '시트 치수 ' + JSON.stringify(fit))
      await shot(pg, 'u7-폰-바닥-시트')
      await pg.tap(`.bgsheet .bgt[data-task="${U.C.a.id}"] .stopb`)
      await until(async () => (await tasksOf(U.C.sid)).find((x) => x.id === U.C.a.id).status === 'stopped', '호스트에서 멈춤')
      await until(async () => (await rowsOf(pg, '.tsheet.bgsheet')).filter((x) => x.st === 'run').length === 2, '시트에 도는 중 2')
      await pg.tap('.bgsheet .bgt-h.fin'); await wait(250)
      await pg.tap(`.bgsheet .bgt[data-task="${U.C.a.id}"] .openb`); await pg.waitForSelector('.drill-r', { timeout: 4000 })
      must(!(await pg.$('.tsheet.bgsheet')), '[열기] 뒤에 시트가 남았다')
      const dr = await pg.evaluate(() => ({ p: document.querySelector('.drill-p .tx')?.textContent ?? '', head: document.querySelector('.drill-r .meta')?.textContent ?? '' }))
      must(/로그 훑기/.test(dr.p) && /멈춘 자리/.test(dr.head), '열어 본 화면 ' + JSON.stringify(dr))
      // 폰에서도 긴 결과가 끝까지 — 가로로 안 샌다
      await goto(pg, L.sid); await pg.tap('.chat-body .sub .l .op'); await pg.waitForSelector('.drill-r .dr-res', { timeout: 4000 })
      const res = await pg.evaluate(() => ({ t: document.querySelector('.drill-r .dr-res').textContent, sw: document.documentElement.scrollWidth, bw: Math.round(document.querySelector('.drill-r').getBoundingClientRect().right) }))
      must(/끝표식-EA9\s*$/.test(res.t) && res.sw <= 390 && res.bw <= 390, '폰 결과 전문 ' + JSON.stringify({ n: res.t.length, sw: res.sw, bw: res.bw }))
      await shot(pg, 'u7-폰-결과-전문')
      must(!errs.length, '화면 오류 ' + errs.join(' | '))
      await pg.close()
    })
  }
  // 뒷정리 — 남은 작업을 멈추고 만든 세션을 지운다(다른 검사의 워커 자리를 안 잡게)
  sse.abort()
  for (const d of [join(botAbs, '.claude/agents'), join(claudeCfg, 'agents')]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* */ } }
  try { if (existsSync(join(botAbs, '.claude')) && !readdirSync(join(botAbs, '.claude')).length) rmSync(join(botAbs, '.claude'), { recursive: true, force: true }) } catch { /* */ }
  for (const sid of made) { try { for (const t of running(await tasksOf(sid))) await raw(`/sessions/${sid}/tasks/${t.taskId}/stop`, {}) } catch { /* 옛 판에는 이 길이 없다 */ } try { await raw(`/sessions/${sid}`, undefined, 'DELETE') } catch { /* */ } }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
  const root = realpathSync(mkdtempSync(join('/tmp', 'fb-ea-')))
  const data = mkdtempSync(join(tmpdir(), 'fb-eadata-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-eahome-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-eacfg-'))
  for (const d of ['1. Inbox', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n'); writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 할 일\n- [ ] 하나\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_NO_AUTH: '1', FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', CLAUDE_CONFIG_DIR: claudeCfg }
  const PORT = Number(arg('port', 7471))
  const free = await new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(PORT, '127.0.0.1', () => s.close(() => res(true))) })
  if (!free) { console.error(`포트 ${PORT} 가 이미 잡혀 있어요`); process.exit(1) }
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env, stdio: 'ignore' })
  const base = `http://127.0.0.1:${PORT}`
  let red = 0, green = 0, br = null
  try {
    for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/health'); break } catch { await wait(150) } }
    const bot = await (await fetch(base + '/api/bots/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: '3. Area/제품_Rondo' }) })).json()
    if (!process.argv.includes('--no-ui')) { try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사 건너뜀 — 브라우저 없음)', String(e.message).split('\n')[0]) } }
    const shots = arg('shots', ''); if (shots) mkdirSync(shots, { recursive: true })
    await eaTasks({ base, root, claudeCfg, botId: bot.id, botAbs: join(root, '3. Area/제품_Rondo'), br, shots: shots || undefined,
      check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '\n    ', String(e.message ?? e).split('\n')[0].slice(0, 400)) } } })
  } catch (e) { red++; console.error('✗ 검사 틀이 죽었다', e.stack ?? e) } finally {
    try { await br?.close() } catch { /* */ } try { host.kill() } catch { /* */ }
    for (const d of [root, data, fbHome, claudeCfg]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* */ } }
  }
  console.log(`\nEA 검사 — 초록 ${green} · 빨강 ${red}`)
  process.exit(red ? 1 : 0)
}
