/**
 * ═══ 실패한 루틴을 다시 돌린다 — 기본 켬 · 일괄 다시 돌리기 (2026-11-16 Dave «루틴이 실패하면 자동으로 재실행 되게 하고 싶어» · 카드 답 «전부 기본 켬» · «일괄 재실행 버튼») ═══
 *
 * 10/9 에 넣은 재시도(BR-2)는 «기본 끔» 이었고 켜는 스위치가 화면에도 봇 도구에도 없었다 — 루틴 44개 중 켜진 것 0개 · 두 달 동안 재실행 0번.
 *   T1 기본 켬 — `retry` 를 안 적은 루틴이 실패하면 한 번 다시 돌고, 다시 도는 회차는 «앞 회차가 실패했어: 이유» 한 줄을 받는다
 *   T2 끈 루틴 — `retry: false` 는 한 번만 돈다
 *   T3 한 번만 — 두 번째도 실패하면 더 돌리지 않는다
 *   T4 보드 — «실패» 묶음에 [실패 N개 다시 돌리기] 가 서고, 다시 돈 회차에 «다시 돌림» 이 붙는다
 *   T5 일괄 — 확인 창에 이름과 이유가 다 보이고, [다시 돌리기] 를 누르면 그 루틴들만 돈다(이유를 실어서) · 이것마저 실패해도 또 돌지 않는다
 *   T6 겹침 — 자동 재실행을 걸어 둔 사이 사람이 다시 돌리면 걸어 둔 것은 안 돈다 · 실패가 아닌 루틴은 건너뛰고 이유를 돌려준다
 *   T7 시트 — «실패하면 10분 뒤 한 번 다시 돌리기» 켬/끔이 `.bot.yml` 에 저장된다(끄면 `retry: false` · 켜면 그 줄이 빠진다)
 *   T8 봇 도구 — routine_update 로 끄고 켠다 · routine_list 가 값을 보여 준다 · 바뀐 기록이 남는다
 *   T9 폰 — 보드의 [실패 N개 다시 돌리기] 와 시트의 켬/끔이 화면 안에 서고 옆으로 안 넘친다
 *
 * 제 호스트를 따로 띄운다(임시 볼트 · 제 포트 · 인증 끔 · 다시 돌리기까지 1.5초). 스모크가 불러 쓰고(`routineRetry`), 혼자서도 돈다(`node test/routine-retry.mjs` · 먼저 `npm run build`).
 */
import { spawn, execSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const must = (cond, msg) => { if (!cond) throw new Error(msg) }
const RETRY_MS = 1500

export async function routineRetry({ br, check, port = 7495, shots = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'fb-rr-vault-')), data = mkdtempSync(join(tmpdir(), 'fb-rr-data-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-rr-home-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-rr-cc-'))
  const REL = '3. Area/제품_Rondo', REL2 = '3. Area/사업_홈페이지'
  for (const d of ['1. Inbox', '2. Projects', REL, REL2, '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  for (const r of [REL, REL2]) { writeFileSync(join(root, r, 'CLAUDE.md'), '# x\n'); writeFileSync(join(root, r, 'readme.md'), '# 읽어 보기\n'); writeFileSync(join(root, r, 'state.md'), '> 현재 목표: 검사\n') }
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_NO_AUTH: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_RETRY_MS: String(RETRY_MS), FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: join(process.cwd(), 'test/fixtures/no-such-codex'), CLAUDE_CONFIG_DIR: claudeCfg }
  const base = `http://127.0.0.1:${port}`
  execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
  const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(port)], { env })
  let out = ''; host.stdout.on('data', (d) => { out += d }); host.stderr.on('data', (d) => { out += d })
  const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 160)}`); return t ? JSON.parse(t) : null }
  const until = async (f, msg, ms = 10000) => { for (let t = 0; t < ms; t += 50) { if (await f()) return; await wait(50) } throw new Error('기다리다 끝남 — ' + msg) }
  /** 봇 도구 호출 — 워커가 받는 설정 파일과 같은 토큰(세션 없음) */
  const mcp = async (botId, name, args) => {
    const u = new URL(`${base}/mcp/${botId}`), kf = join(data, 'mcp.key')
    const tok = existsSync(kf) ? createHmac('sha256', Buffer.from(readFileSync(kf, 'utf8').trim(), 'base64url')).update(`${decodeURIComponent(u.pathname.slice(5))}\n`).digest('base64url') : 'no-key'
    const r = await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()
    must(r.result, `봇 도구 ${name} 이 답하지 않았다 ` + JSON.stringify(r).slice(0, 200))
    return r.result.content[0].text
  }
  const d0 = new Date(), month = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}`
  const runsF = join(root, `.folderbot/ops/runs-${month}.jsonl`)
  const evs = (name) => (existsSync(runsF) ? readFileSync(runsF, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.routine === name) : [])
  const seq = (name) => evs(name).map((e) => `${e.event}${e.attempt ? e.attempt : ''}${e.event === 'end' ? `:${e.result}` : ''}`).join(',')
  const starts = (name) => evs(name).filter((e) => e.event === 'start').length
  const yml = (rel) => readFileSync(join(root, rel, '.bot.yml'), 'utf8')
  /** 그 회차(세션)의 봇 답 */
  const answer = async (sid) => (await api(`/sessions/${sid}/chat`)).items.filter((i) => i.kind === 'assistant').map((i) => i.text).join('\n')
  /** 그 회차(세션)가 받은 말 */
  const asked = async (sid) => (await api(`/sessions/${sid}/chat`)).items.filter((i) => i.kind === 'user').map((i) => i.text).join('\n')
  try {
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(base + '/api/health'); up = true } catch { await wait(150) } }
    must(up, '검사 전제 깨짐 — 호스트가 안 떴다 ' + out.slice(-200))
    const A = await api('/bots/start', { rel: REL }), B = await api('/bots/start', { rel: REL2 })
    const put = async (bot, routines) => { const r = await fetch(`${base}/api/bots/${bot.id}/routines`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ routines }) }); must(r.status === 200, '루틴 저장 실패 ' + (await r.text()).slice(0, 200)) }
    const WHEN = '매일 새벽 4시'
    await put(A, [
      { name: 'RR 다시', cron: WHEN, prompt: '다시돌면성공' },                                       // retry 를 안 적었다 — 기본 켬
      { name: 'RR 끔', cron: WHEN, prompt: '되읊어: 결과: fail — 게시가 끊김', retry: false },
      { name: 'RR 정상', cron: WHEN, prompt: '되읊어: 결과: ok' },
    ])
    await put(B, [{ name: 'RR 늘 실패', cron: WHEN, prompt: '되읊어: 결과: fail — 로그인 필요' }])

    await check('T1 기본 켬 — retry 를 안 적은 루틴이 실패하면 한 번 다시 돌고, 다시 도는 회차는 «앞 회차가 실패했어: 이유» 한 줄을 받는다', async () => {
      must(!/retry/.test(yml(REL).split('RR 끔')[0]), '검사 전제 — «RR 다시» 에 retry 가 적혀 있다')
      await api(`/bots/${A.id}/routines/run`, { name: 'RR 다시' })
      await until(() => /^start,end:fail,retry,start2,end:/.test(seq('RR 다시')), '다시 돌지 않았다 · ' + seq('RR 다시'))
      must(seq('RR 다시') === 'start,end:fail,retry,start2,end:ok', '🔴 기본 켬인데 실패 → 다시 → 성공으로 남지 않았다 · ' + seq('RR 다시'))
      const second = evs('RR 다시').filter((e) => e.event === 'start')[1].run
      const got = await asked(second)
      must(/이건 다시 도는 회차야 — 앞 회차가 실패했어: 처음에는 실패\./.test(got), '🔴 다시 도는 회차가 앞 회차의 실패 이유를 못 받았다 · ' + got.slice(-260))
      must(/이미 된 것은 다시 하지 말고 남은 것만 해/.test(got), '🔴 다시 도는 회차가 «남은 것만» 한 줄을 못 받았다')
      must(got.startsWith('다시돌면성공'), '다시 도는 회차의 문구가 원래 문구로 시작하지 않는다')
      must(/받은 말: \(이건 다시 도는 회차야/.test(await answer(second)), '검사용 CLI 가 그 한 줄을 못 읽었다')
      const first = evs('RR 다시').filter((e) => e.event === 'start')[0].run
      must(!/다시 도는 회차/.test(await asked(first)), '🔴 처음 도는 회차에 «다시 도는 회차» 한 줄이 붙었다')
      const rt = evs('RR 다시').find((e) => e.event === 'retry')
      must(rt.ms === RETRY_MS, '실행 기록의 retry 에 걸어 둔 시간이 없다 ' + JSON.stringify(rt))
    })

    await check('T2 끈 루틴 — retry: false 는 한 번만 돈다', async () => {
      await api(`/bots/${A.id}/routines/run`, { name: 'RR 끔' })
      await until(() => seq('RR 끔') === 'start,end:fail', '끝나지 않았다 · ' + seq('RR 끔'))
      await wait(RETRY_MS + 1500)
      must(seq('RR 끔') === 'start,end:fail', '🔴 끈 루틴을 다시 돌렸다 · ' + seq('RR 끔'))
    })

    await check('T3 한 번만 — 두 번째도 실패하면 더 돌리지 않는다', async () => {
      await api(`/bots/${B.id}/routines/run`, { name: 'RR 늘 실패' })
      await until(() => seq('RR 늘 실패') === 'start,end:fail,retry,start2,end:fail', '두 번째 시도까지 안 갔다 · ' + seq('RR 늘 실패'))
      await wait(RETRY_MS + 1500)
      must(starts('RR 늘 실패') === 2, '🔴 두 번째도 실패했는데 또 돌렸다 · ' + seq('RR 늘 실패'))
      const second = evs('RR 늘 실패').filter((e) => e.event === 'start')[1].run
      must(/앞 회차가 실패했어: 로그인 필요\./.test(await asked(second)), '다시 도는 회차가 이유(로그인 필요)를 못 받았다')
    })

    await check('T6 겹침 — 자동 재실행을 걸어 둔 사이 사람이 다시 돌리면 걸어 둔 것은 안 돈다 · 실패가 아닌 루틴은 건너뛰고 이유를 돌려준다', async () => {
      await put(B, [{ name: 'RR 늘 실패', cron: WHEN, prompt: '되읊어: 결과: fail — 로그인 필요' }, { name: 'RR 겹침', cron: WHEN, prompt: '되읊어: 결과: fail — 네트워크' }])
      await api(`/bots/${B.id}/routines/run`, { name: 'RR 겹침' })
      await until(() => /^start,end:fail,retry$/.test(seq('RR 겹침')), '첫 회차가 실패로 안 끝났다 · ' + seq('RR 겹침'), 6000)
      // 걸어 둔 1.5초가 지나기 전에 사람이 다시 돌린다
      const board = await api('/routines/overview')
      const row = board.routines.find((r) => r.name === 'RR 겹침')
      must(row.state === 'fail' && row.retry === true && typeof row.retryAt === 'number' && row.retryAt > board.now, '🔴 보드에 «곧 다시 돌아요» 의 예정 시각이 없다 ' + JSON.stringify({ state: row.state, retry: row.retry, retryAt: row.retryAt, now: board.now }))
      const res = await api('/routines/rerun', { items: [{ botId: B.id, name: 'RR 겹침' }, { botId: A.id, name: 'RR 정상' }, { botId: A.id, name: '없는 루틴' }] })
      must(res.queued.length === 1 && res.queued[0].name === 'RR 겹침', '🔴 실패한 것만 줄에 서야 한다 ' + JSON.stringify(res))
      must(res.skipped.length === 2 && res.skipped.some((x) => x.name === 'RR 정상' && /실패가 아니에요/.test(x.why)) && res.skipped.some((x) => x.name === '없는 루틴' && /이제 없어요/.test(x.why)), '🔴 건너뛴 이유가 이상하다 ' + JSON.stringify(res.skipped))
      await until(() => starts('RR 겹침') >= 2, '사람이 돌린 회차가 안 시작했다 · ' + seq('RR 겹침'))
      await wait(RETRY_MS + 2000)
      must(starts('RR 겹침') === 2, `🔴 사람이 다시 돌렸는데 걸어 둔 자동 재실행이 또 돌렸다(같은 일이 세 번) · ${seq('RR 겹침')}`)
      const st = evs('RR 겹침').filter((e) => e.event === 'start')
      must(st[1].attempt === 2, '사람이 돌린 회차가 두 번째 시도로 안 적혔다')
      must(evs('RR 겹침').some((e) => e.event === 'retry' && e.by === 'person'), '실행 기록에 사람이 다시 돌린 줄이 없다')
      must(/앞 회차가 실패했어: 네트워크\./.test(await asked(st[1].run)), '사람이 돌린 회차가 이유를 못 받았다')
      await put(B, [{ name: 'RR 늘 실패', cron: WHEN, prompt: '되읊어: 결과: fail — 로그인 필요' }])
    })

    await check('T8 봇 도구 — routine_update 로 끄고 켠다 · routine_list 가 값을 보여 준다 · 바뀐 기록이 남는다', async () => {
      const list0 = JSON.parse(await mcp(A.id, 'routine_list', {}))
      must(list0.find((r) => r.name === 'RR 다시').retry === true && list0.find((r) => r.name === 'RR 끔').retry === false, '🔴 routine_list 의 retry 값이 이상하다 ' + JSON.stringify(list0.map((r) => [r.name, r.retry])))
      await mcp(A.id, 'routine_update', { name: 'RR 정상', retry: false })
      must(/name: RR 정상[\s\S]*?retry: false/.test(yml(REL)), '🔴 routine_update(retry:false) 가 파일에 안 남았다')
      must(JSON.parse(await mcp(A.id, 'routine_list', {})).find((r) => r.name === 'RR 정상').retry === false, 'routine_list 가 끈 값을 안 보여 준다')
      const board = await api('/routines/overview')
      must(board.routines.find((r) => r.name === 'RR 정상').changes.some((c) => /실패하면 다시 돌리기 끔/.test(c.what)), '🔴 바뀐 기록에 «실패하면 다시 돌리기 끔» 이 없다')
      await mcp(A.id, 'routine_update', { name: 'RR 정상', retry: true })
      must(JSON.parse(await mcp(A.id, 'routine_list', {})).find((r) => r.name === 'RR 정상').retry === true, 'routine_update(retry:true) 가 안 먹었다')
      await mcp(A.id, 'routine_add', { name: 'RR 새로', when: WHEN, prompt: '되읊어: 결과: ok', retry: false })
      must(/name: RR 새로[\s\S]*?retry: false/.test(yml(REL)), '🔴 routine_add(retry:false) 가 파일에 안 남았다')
      await mcp(A.id, 'routine_remove', { name: 'RR 새로' })
    })

    if (!br) return
    const open = async (vp, phone) => {
      const ctx = await br.newContext(phone ? { viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: vp, deviceScaleFactor: 1 })
      const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message))
      await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') })
      await pg.goto(phone ? `${base}/` : `${base}/#bot=${A.id}`); await pg.waitForSelector(`${phone ? '.mhome' : '.side.left'} .numrow .t-rt`, { timeout: 10000 }); await wait(700)
      return { pg, ctx, errs }
    }
    /** 루틴 보드를 연다 — 데스크톱은 왼쪽 목록의 «루틴» 칸, 폰은 봇 목록 화면의 같은 칸 */
    const openBoard = async (pg, phone) => {
      await pg.click(`${phone ? '.mhome' : '.side.left'} .numrow .t-rt`); await pg.waitForSelector('.modal.rt .rtgrp', { timeout: 6000 }); await wait(300)
    }
    const failGroup = (pg) => pg.evaluate(() => {
      const g = document.querySelector('.modal.rt .rtgrp[data-state="fail"]'); if (!g) return null
      const btn = g.querySelector('[data-rerun]'); const r = btn?.getBoundingClientRect()
      return { names: [...g.querySelectorAll('.rtr')].map((x) => x.getAttribute('data-routine')), btn: btn ? { text: btn.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), left: Math.round(r.left) } : null, vw: innerWidth, sw: document.documentElement.scrollWidth }
    })

    const D = await open({ width: 1440, height: 900 }, false); const pg = D.pg

    await check('T4 보드 — «실패» 묶음에 [실패 N개 다시 돌리기] 가 서고, 다시 돈 회차에 «다시 돌림» 이 붙는다', async () => {
      await openBoard(pg, false)
      const g = await failGroup(pg)
      must(g && g.names.includes('RR 끔') && g.names.includes('RR 늘 실패') && !g.names.includes('RR 다시'), '🔴 «실패» 묶음이 이상하다(다시 돌아 성공한 루틴은 빠져야 한다) ' + JSON.stringify(g))
      must(g.btn && g.btn.text === `실패 ${g.names.length}개 다시 돌리기`, '🔴 [실패 N개 다시 돌리기] 가 없거나 수가 다르다 ' + JSON.stringify(g.btn))
      // 정상 묶음에는 그 단추가 없다
      await pg.click('.modal.rt .rtbar .seg button:nth-child(2)'); await wait(250)
      must(await pg.$$eval('.modal.rt [data-rerun]', (b) => b.length) === 1, '[실패 N개 다시 돌리기] 가 «실패» 묶음 밖에도 있다')
      const why = await pg.$eval('.modal.rt .rtr[data-routine="RR 늘 실패"] .why', (e) => e.textContent)
      must(/실패 — 로그인 필요/.test(why) && /\(다시 돌림\)/.test(why), '🔴 다시 돈 회차의 줄에 «(다시 돌림)» 이 없다 · ' + why)
      await pg.click('.modal.rt .rtr[data-routine="RR 다시"] .row'); await wait(250)
      const recent = await pg.$eval('.modal.rt .rtr[data-routine="RR 다시"] .exp', (e) => e.textContent)
      must(/성공 · 다시 돌림/.test(recent) && /실패/.test(recent), '🔴 펼친 «최근 회차» 에 «다시 돌림» 이 없다 · ' + recent.slice(0, 160))
      if (shots) await pg.screenshot({ path: join(shots, 'rr-4-보드-desktop.png') })
      await pg.click('.modal.rt .rtr[data-routine="RR 다시"] .row'); await wait(150)
    })

    await check('T5 일괄 — 확인 창에 이름과 이유가 다 보이고, [다시 돌리기] 를 누르면 그 루틴들만 돈다 · 이것마저 실패해도 또 돌지 않는다', async () => {
      const before = { off: starts('RR 끔'), always: starts('RR 늘 실패'), again: starts('RR 다시'), fine: starts('RR 정상') }
      await pg.click('.modal.rt [data-rerun]'); await pg.waitForSelector('.modal.conf', { timeout: 3000 })
      const conf = await pg.$eval('.modal.conf', (m) => ({ title: m.querySelector('.modal-h b').textContent, body: m.querySelector('.cbody').textContent, ok: m.querySelector('[data-conf="ok"]').textContent }))
      must(/실패한 루틴 2개를 다시 돌릴까요\?/.test(conf.title), '확인 창 제목이 이상하다 · ' + conf.title)
      must(/RR 끔 — 게시가 끊김/.test(conf.body) && /RR 늘 실패 — 로그인 필요/.test(conf.body), '🔴 확인 창에 돌릴 루틴의 이름과 이유가 다 없다 · ' + conf.body)
      must(/앞 회차가 해 둔 일을 먼저 확인/.test(conf.body), '확인 창에 «앞 회차가 해 둔 일을 먼저 확인» 이 없다')
      if (shots) await pg.screenshot({ path: join(shots, 'rr-5-확인-desktop.png') })
      // 취소하면 아무것도 안 돈다
      await pg.click('.modal.conf [data-conf="cancel"]'); await wait(600)
      must(starts('RR 끔') === before.off && starts('RR 늘 실패') === before.always, '🔴 [취소] 했는데 루틴이 돌았다')
      await pg.click('.modal.rt [data-rerun]'); await pg.waitForSelector('.modal.conf', { timeout: 3000 })
      await pg.click('.modal.conf [data-conf="ok"]')
      await until(() => starts('RR 끔') === before.off + 1 && starts('RR 늘 실패') === before.always + 1, `두 루틴이 다시 안 돌았다 · ${seq('RR 끔')} / ${seq('RR 늘 실패')}`)
      await until(() => evs('RR 끔').at(-1).event === 'end' && evs('RR 늘 실패').at(-1).event === 'end', '다시 돈 회차가 안 끝났다')
      const last = evs('RR 끔').filter((e) => e.event === 'start').at(-1)
      must(last.attempt === 2 && /앞 회차가 실패했어: 게시가 끊김\./.test(await asked(last.run)), '🔴 버튼으로 돌린 회차가 앞 회차의 이유를 못 받았다')
      await wait(RETRY_MS + 1500)
      must(starts('RR 끔') === before.off + 1 && starts('RR 늘 실패') === before.always + 1, `🔴 버튼으로 돌린 회차가 실패하자 또 돌렸다 · ${seq('RR 늘 실패')}`)
      must(starts('RR 다시') === before.again && starts('RR 정상') === before.fine, '🔴 실패가 아닌 루틴까지 돌렸다')
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
      await pg.keyboard.press('Escape'); await wait(250)
    })

    /** 그 봇의 루틴 시트를 연다 — 오른쪽 패널(폰은 «폴더» 화면)의 도구 막대 › 루틴 › 이름 */
    const openSheet = async (page, name) => {
      await page.waitForSelector('.panel .ptools .tb.rt', { timeout: 6000 }); await page.click('.panel .ptools .tb.rt')
      await page.waitForSelector('.spop.rtpop button.kv', { timeout: 3000 }); await wait(200)
      must(await page.evaluate((n) => { const b = [...document.querySelectorAll('.spop.rtpop button.kv')].find((x) => x.querySelector('.n')?.textContent === n); b?.click(); return !!b }, name), `루틴 목록에 «${name}» 이 없다`)
      await page.waitForSelector('.modal.rted .rtretry', { timeout: 4000 }); await wait(250)
    }
    const segOf = (page) => page.$eval('.modal.rted .rtretry', (s) => ({ on: s.querySelector('button.on')?.getAttribute('data-v'), label: s.closest('.field').querySelector('label').textContent, hint: s.closest('.field').querySelector('small')?.textContent ?? '' }))

    await check('T7 시트 — «실패하면 10분 뒤 한 번 다시 돌리기» 켬/끔이 .bot.yml 에 저장된다(끄면 retry: false · 켜면 그 줄이 빠진다)', async () => {
      await openSheet(pg, 'RR 다시')
      const s0 = await segOf(pg)
      must(s0.on === 'on' && s0.label === '실패하면 10분 뒤 한 번 다시 돌리기', '🔴 retry 를 안 적은 루틴이 «켬» 으로 안 보인다 ' + JSON.stringify(s0))
      must(/같은 일을 두 번 하면 안 되는 루틴은 끄세요/.test(s0.hint), '스위치 아래 설명이 없다')
      await pg.$eval('.modal.rted .rtretry', (x) => x.closest('.field').scrollIntoView({ block: 'center' })); await wait(200)
      if (shots) await pg.screenshot({ path: join(shots, 'rr-7-시트-desktop.png') })
      await pg.click('.modal.rted .rtretry button[data-v="off"]'); await wait(150)
      await pg.click('.modal.rted [data-rt="save"]'); await until(async () => !(await pg.$('.modal.rted')), '저장하고 시트가 안 닫혔다', 5000)
      must(/name: RR 다시[\s\S]*?retry: false[\s\S]*?name: RR 끔/.test(yml(REL)), '🔴 끄고 저장했는데 «RR 다시» 에 retry: false 가 없다\n' + yml(REL))
      // 끈 루틴은 «끔» 으로 열리고, 켜고 저장하면 줄이 빠진다
      await openSheet(pg, 'RR 끔')
      must((await segOf(pg)).on === 'off', '🔴 retry: false 인 루틴이 «끔» 으로 안 보인다')
      await pg.click('.modal.rted .rtretry button[data-v="on"]'); await wait(150)
      await pg.click('.modal.rted [data-rt="save"]'); await until(async () => !(await pg.$('.modal.rted')), '저장하고 시트가 안 닫혔다', 5000)
      const y = yml(REL), part = y.slice(y.indexOf('name: RR 끔'), y.indexOf('name: RR 정상'))
      must(!/retry/.test(part), '🔴 켜고 저장했는데 «RR 끔» 에 retry 줄이 남았다\n' + part)
      const board = await api('/routines/overview')
      must(board.routines.find((r) => r.name === 'RR 다시').retry === false && board.routines.find((r) => r.name === 'RR 끔').retry === true, '보드의 retry 값이 저장과 다르다')
      must(board.routines.find((r) => r.name === 'RR 다시').changes.some((c) => c.actor === '화면' && /실패하면 다시 돌리기 끔/.test(c.what)), '🔴 화면에서 끈 것이 바뀐 기록에 없다')
      // 끈 값이 실제로 먹는다 — «RR 다시» 는 이제 실패해도 다시 안 돈다
      const n0 = starts('RR 다시')
      await api(`/bots/${A.id}/routines/run`, { name: 'RR 다시' })
      await until(() => starts('RR 다시') === n0 + 1 && evs('RR 다시').at(-1).event === 'end', '끈 뒤의 회차가 안 끝났다')
      await wait(RETRY_MS + 1500)
      must(starts('RR 다시') === n0 + 1, '🔴 화면에서 끈 루틴이 실패하자 다시 돌았다 · ' + seq('RR 다시'))
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
    })
    await D.ctx.close()

    await check('T9 폰 — 보드의 [실패 N개 다시 돌리기] 와 시트의 켬/끔이 화면 안에 서고 옆으로 안 넘친다', async () => {
      const M = await open({ width: 390, height: 844 }, true); const mp = M.pg
      try {
        await openBoard(mp, true)
        const g = await failGroup(mp)
        must(g && g.btn && /^실패 \d+개 다시 돌리기$/.test(g.btn.text), '🔴 폰 보드에 [실패 N개 다시 돌리기] 가 없다 ' + JSON.stringify(g))
        must(g.btn.left >= 0 && g.btn.right <= g.vw && g.sw <= g.vw, '🔴 폰에서 단추가 화면 밖으로 나가거나 옆으로 넘친다 ' + JSON.stringify(g))
        must(g.btn.h >= 28, '폰에서 단추가 너무 낮다 ' + g.btn.h)
        if (shots) await mp.screenshot({ path: join(shots, 'rr-9-보드-phone.png') })
        await mp.tap('.modal.rt [data-rerun]'); await mp.waitForSelector('.modal.conf', { timeout: 3000 })
        const c = await mp.$eval('.modal.conf', (m) => { const r = m.getBoundingClientRect(); const ok = m.querySelector('[data-conf="ok"]').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), vw: innerWidth, okH: Math.round(ok.height), body: m.querySelector('.cbody').textContent } })
        must(c.l >= 0 && c.r <= c.vw && /RR /.test(c.body), '🔴 폰 확인 창이 화면 밖으로 나가거나 루틴 이름이 없다 ' + JSON.stringify(c))
        if (shots) await mp.screenshot({ path: join(shots, 'rr-9-확인-phone.png') })
        await mp.tap('.modal.conf [data-conf="cancel"]'); await wait(300)
        await mp.keyboard.press('Escape'); await wait(300)
        // 시트 — 그 봇의 «폴더» 화면에서 연다
        await mp.goto(`${base}/#bot=${A.id}`); await mp.reload(); await mp.waitForSelector('.composer .cin', { timeout: 8000 }); await wait(500)
        await mp.evaluate(() => { const t = [...document.querySelectorAll('.tabbar button, .mtabs button')].find((x) => /폴더/.test(x.textContent ?? '')); t?.click() }); await wait(500)
        await openSheet(mp, 'RR 끔')
        const s = await mp.$eval('.modal.rted .rtretry', (x) => { x.scrollIntoView({ block: 'center' }); const r = x.getBoundingClientRect(); const b = x.querySelector('button').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), vw: innerWidth, sw: document.documentElement.scrollWidth, bh: Math.round(b.height), on: x.querySelector('button.on')?.getAttribute('data-v') } })
        must(s.l >= 0 && s.r <= s.vw && s.sw <= s.vw, '🔴 폰 시트에서 켬/끔이 화면 밖으로 나간다 ' + JSON.stringify(s))
        must(s.on === 'on', '폰 시트의 값이 저장과 다르다 ' + JSON.stringify(s))
        await wait(200)
        if (shots) await mp.screenshot({ path: join(shots, 'rr-9-시트-phone.png') })
        must(!M.errs.length, '화면 오류 ' + M.errs.join(' | '))
      } finally { await M.ctx.close() }
    })
  } finally { host.kill() }
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let red = 0, green = 0, br = null
  try { const { chromium } = await import('playwright-core'); br = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] }) } catch (e) { console.log('(화면 검사를 못 돈다 — 브라우저 없음:', String(e.message ?? e).split('\n')[0], ')'); process.exit(1) }
  try { await routineRetry({ br, shots: 'test/tmp', check: async (name, f) => { try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '—', String(e.message ?? e).split('\n').slice(0, 6).join(' ⏎ ')) } } }) } catch (e) { red++; console.log('✗', String(e.stack ?? e).split('\n').slice(0, 3).join(' ')) }
  await br.close()
  console.log(`\n${red ? '🔴' : '✅'} 루틴 다시 돌리기 — ✓ ${green} · ✗ ${red}`); process.exit(red ? 1 : 0)
}
