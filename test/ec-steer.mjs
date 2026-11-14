/**
 * EC · «일하는 중에도 말이 통한다» 검사 (2026-11-11) — 끼워 넣기(멈추지 않고 고쳐 말하기) · «내 답을 기다리는 다음 세션» 단축키와 카드 키 ·
 * 세션 창 상태 탭 · 폰에서 끝난 일 다시 보기.
 *
 * 스모크(`test/smoke.mjs`)가 이 파일의 `ecSteer()` 를 불러 돌린다(검사 하나라도 빨가면 스모크가 멈춘다).
 * 혼자서도 돈다 — `node test/ec-steer.mjs [--no-ui] [--only H1,U4] [--shots <폴더>]` 는 픽스처 볼트·스텁 CLI 로 호스트를 띄워 검사마다 ✓/✗ 를 찍고 **끝까지** 간다.
 * 🔴 «고치기 전 판에서 실제로 빨개지는가» 는 검사마다 따로 본다 — `src` 의 핵심 줄 하나를 되돌리고 `npm run build && node test/ec-steer.mjs --only <검사>`.
 *    무엇을 되돌리면 무엇이 빨개지는지는 `docs/PRD.md` 의 EC 문단과 스모크의 EC 머리말에 적었다.
 * ⚠ 실 앱·실 볼트·`~/.claude` 를 건드리지 않는다 — 스텁의 기록 파일도 임시 폴더(`CLAUDE_CONFIG_DIR`)에 쓴다.
 * ⚠ 끼워 넣기는 스텁(`test/fixtures/stub-claude.mjs` 의 `steered`)이 «턴 중에 온 `priority: "next"` 메시지를 같은 턴의 답에 반영» 하는 것으로 잰다.
 *    실 CLI 가 정말 따르는지는 스모크가 못 잰다 — `07_검증/2026-11-11_실측-스크립트_끼워넣기-호스트모양.py` 가 쟀다(2.1.322 · 세 번 모두 같은 턴에서 따름).
 */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:net'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const TAB_NAMES = ['전체', '내 답 기다림', '일하는 중', '안 읽음', '쉼']
const CLIENT = { tier: 'desktop', touch: false, canOpenOnDevice: false, openMode: '' }

/**
 * @param o.base      호스트 주소
 * @param o.root      픽스처 볼트 · o.data 호스트 데이터 폴더(MCP 토큰을 만들 열쇠가 여기 있다)
 * @param o.botId     검사에 쓸 봇(시작돼 있어야 한다)
 * @param o.br        playwright 브라우저(없으면 화면 검사는 건너뛴다)
 * @param o.check     (이름, async () => void) — 던지면 빨강
 * @param o.shots     캡처를 남길 폴더(없으면 안 남긴다)
 */
export async function ecSteer({ base, data, botId, br, check, shots }) {
  const raw = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json() } catch { /* */ } return { status: r.status, j } }
  const api = async (p, body, method) => { const r = await raw(p, body, method); if (r.status >= 400) throw new Error(`${p} → ${r.status} ${r.j?.error ?? ''}`); return r.j }
  const until = async (f, what, ms = 9000) => { const t0 = Date.now(); let last; for (;;) { try { last = await f(); if (last) return last } catch (e) { last = String(e.message ?? e) } if (Date.now() - t0 > ms) throw new Error(`기다렸는데 안 됐다 — ${what} · 마지막 ${JSON.stringify(last)?.slice(0, 300)}`); await wait(60) } }
  const must = (cond, msg) => { if (!cond) throw new Error(msg) }
  const chatOf = (sid) => api(`/sessions/${sid}/chat`)
  const made = []
  const newSession = async (name, extra = {}) => { const s = await api(`/bots/${botId}/sessions`, { name, ...extra }); made.push(s.id); return s }
  const say = (sid, text) => api(`/sessions/${sid}/send`, { text })
  const users = (c, text) => c.items.filter((i) => i.kind === 'user' && i.text === text)
  const answers = (c) => c.items.filter((i) => i.kind === 'assistant').map((i) => i.text)
  const stateIs = (sid, st, ms) => until(async () => { const c = await chatOf(sid); return c.info.state === st ? c : null }, `상태 ${st}`, ms)
  const running = (sid) => stateIs(sid, 'running')
  const rested = (sid, ms = 12000) => until(async () => { const c = await chatOf(sid); return c.info.state !== 'running' && c.info.state !== 'awaiting_input' ? c : null }, '턴 끝', ms)
  const pendingOf = (sid) => until(async () => { const c = await chatOf(sid); return c.info.state === 'awaiting_input' && c.info.pending.length ? c : null }, '승인·질문 카드')
  const answer = (sid, c, allow) => api(`/sessions/${sid}/permission`, { requestId: c.info.pending[0].requestId, allow })
  const steer = (sid, text) => raw(`/sessions/${sid}/queue-steer`, { text, client: CLIENT })
  /** MCP 토큰의 열쇠는 워커가 처음 뜰 때 생긴다 — 이 검사만 골라 돌릴 때를 위해 없으면 한 턴 돌려 만든다 */
  const mcpKey = async () => { const f = join(data, 'mcp.key'); if (!existsSync(f)) { const s = await newSession('EC 열쇠'); await say(s.id, '되읊어: 열쇠'); await until(async () => existsSync(f), 'MCP 열쇠') } return Buffer.from(readFileSync(f, 'utf8').trim(), 'base64url') }
  const mcp = async (bot, name, args, sid = '') => {
    const u = new URL(`${base}/mcp/${bot}${sid ? `?sid=${sid}` : ''}`); const key = await mcpKey()
    const tok = createHmac('sha256', key).update(`${decodeURIComponent(u.pathname.slice(5))}\n${sid}`).digest('base64url')
    const r = await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }) })).json()
    return r.result?.content?.[0]?.text ?? JSON.stringify(r)
  }
  /** 볼트 전체의 세션 — 탭 개수와 «기다리는 세션» 차례를 화면과 견줄 때 쓴다 */
  const allSessions = async () => { const bots = await api('/bots'); const list = Array.isArray(bots) ? bots : bots.bots ?? []; return (await Promise.all(list.map((b) => api(`/bots/${b.id}/sessions`)))).flat() }
  const waitingIds = async () => (await allSessions()).filter((x) => x.state === 'awaiting_input').sort((a, b) => b.lastActivity - a.lastActivity || a.id.localeCompare(b.id)).map((x) => x.id)
  const tabOf = (x) => (x.state === 'awaiting_input' ? 'wait' : x.state === 'running' || (x.bg ?? 0) > 0 ? 'work' : (x.lastReplyAt ?? 0) > (x.readAt ?? 0) ? 'unread' : 'rest')

  // ── H · 호스트 ──────────────────────────────────────────────────────────────
  await check('H1 끼워 넣기 — 도는 턴에 넣으면 멈추지 않고 같은 턴의 답에 든다(priority next · 기기 블록 · 대화에는 «끼워 넣음» 사람 말 한 번)', async () => {
    const s = await newSession('EC 끼워넣기'); await say(s.id, '느린일 3초 EC1'); await running(s.id)
    const r = await steer(s.id, '방향을 바꿔 EC1'); must(r.status === 200 && r.j.how === 'steered' && r.j.sessionId === s.id, '끼워 넣기 답 ' + JSON.stringify(r))
    const c1 = await chatOf(s.id)
    must(c1.info.state === 'running' && !c1.info.held && !c1.info.stopped, '끼워 넣었는데 턴이 멈췄다 ' + JSON.stringify({ st: c1.info.state, held: c1.info.held, stopped: c1.info.stopped }))
    const u = users(c1, '방향을 바꿔 EC1'); must(u.length === 1 && u[0].steer === true && u[0].from?.tier === 'desktop', '대화의 사람 말 ' + JSON.stringify(u))
    const c = await stateIs(s.id, 'done')
    const a = answers(c)
    must(a.length === 1 && a[0] === '느린 일 끝\n\n끼워 넣은 말 반영(priority=next · 기기 블록 있음): 방향을 바꿔 EC1', '같은 턴의 답에 안 들었다 ' + JSON.stringify(a))
    must(c.items.filter((i) => i.kind === 'result').length === 1 && c.items.filter((i) => i.kind === 'user').length === 2, '턴이 둘로 갈렸거나 사람 말이 더 섰다 ' + JSON.stringify(c.items.map((i) => i.kind)))
  })
  await check('H2 경주 — 누르는 사이 턴이 끝났으면 보통 말로 한 번만 나간다(말을 잃지도 두 번 보내지도 않는다)', async () => {
    const s = await newSession('EC 경주'); await say(s.id, '되읊어: 먼저 EC2'); await stateIs(s.id, 'done')
    const r = await steer(s.id, '되읊어: 늦게 온 말 EC2'); must(r.status === 200 && r.j.how === 'sent' && r.j.sessionId === s.id, '답 ' + JSON.stringify(r))
    await until(async () => answers(await chatOf(s.id)).includes('늦게 온 말 EC2'), '보통 말로 나간 답')
    await wait(500); const c = await chatOf(s.id)
    const u = users(c, '되읊어: 늦게 온 말 EC2'); must(u.length === 1 && !u[0].steer, '사람 말이 한 번이 아니거나 «끼워 넣음» 이 붙었다 ' + JSON.stringify(u))
    must(answers(c).filter((t) => t === '늦게 온 말 EC2').length === 1, '답이 두 번 왔다 ' + JSON.stringify(answers(c)))
  })
  await check('H3 카드가 걸려 있으면 거절(409 · card)하고 아무것도 안 넣는다 — 미뤄진 질문만 걸렸으면 보통 말로 보내 그 질문을 닫는다', async () => {
    const s = await newSession('EC 카드'); await say(s.id, '승인 EC3'); const p = await pendingOf(s.id)
    const r = await steer(s.id, '카드 중에 넣기 EC3'); must(r.status === 409 && r.j.why === 'card' && /카드에 먼저 답/.test(r.j.error ?? ''), '거절 답 ' + JSON.stringify(r))
    const c = await chatOf(s.id); must(!users(c, '카드 중에 넣기 EC3').length && c.info.state === 'awaiting_input' && c.info.pending.length === 1, '거절했는데 말이 들어갔거나 카드가 가려졌다 ' + JSON.stringify({ st: c.info.state, p: c.info.pending.length }))
    await answer(s.id, p, false); await rested(s.id)
    const d = await newSession('EC 미룬질문'); await say(d.id, '미룬질문 EC3')
    await until(async () => { const x = await chatOf(d.id); return x.info.pending.length === 1 && x.info.pending[0].deferred ? x : null }, '미뤄진 질문')
    const r2 = await steer(d.id, '예 안으로 EC3'); must(r2.status === 200 && r2.j.how === 'sent', '미뤄진 질문만 걸린 세션 ' + JSON.stringify(r2))
    await until(async () => answers(await chatOf(d.id)).includes('채팅 답 받음: 예 안으로 EC3'), '그 말이 질문을 닫는다')
  })
  await check('H4 Codex 세션은 거절(409 · codex) — 빈 말은 400 · 없는 세션은 404', async () => {
    const x = await newSession('EC 코덱스', { vendor: 'codex' })
    const r = await steer(x.id, '끼워 넣기 EC4'); must(r.status === 409 && r.j.why === 'codex' && /Codex/.test(r.j.error ?? ''), 'Codex ' + JSON.stringify(r))
    must(!users(await chatOf(x.id), '끼워 넣기 EC4').length, 'Codex 세션에 말이 들어갔다')
    const s = await newSession('EC 빈말'); const e = await steer(s.id, '   '); must(e.status === 400, '빈 말 ' + JSON.stringify(e))
    must((await steer('nope-session', 'x')).status === 404, '없는 세션')
  })
  await check('H5 자동화 세션 — 봇끼리 세션은 사람이 끼워 넣으면 채팅으로 옮겨지고(같은 세션), «🤝 소통» 은 새 채팅으로 갈라 보통 말로 나간다', async () => {
    const before = (await api(`/bots/${botId}/sessions`)).map((x) => x.id)
    await mcp('orch', 'bot_send', { bot: botId, text: '느린일 4초 EC5 위임', name: 'EC 위임' })
    const dl = await until(async () => (await api(`/bots/${botId}/sessions`)).find((x) => x.name === 'EC 위임' && !before.includes(x.id)), '위임 세션'); made.push(dl.id)
    await running(dl.id); must((await chatOf(dl.id)).info.delegated === true, '검사 전제 — 봇끼리 세션이어야 한다')
    const r = await steer(dl.id, '사람이 끼어든 말 EC5'); must(r.status === 200 && r.j.how === 'steered' && r.j.sessionId === dl.id, '봇끼리 세션 ' + JSON.stringify(r))
    const c = await stateIs(dl.id, 'done')
    must(c.info.adopted === true && /끼워 넣은 말 반영\(priority=next[^)]*\): 사람이 끼어든 말 EC5/.test(answers(c).join('\n')), '채팅으로 안 옮겨졌거나 답에 안 들었다 ' + JSON.stringify({ adopted: c.info.adopted, a: answers(c) }))
    // 소통 세션 — 도는 중이어도 끼워 넣지 않고 새 채팅으로 갈라 연다
    const comm0 = (await api(`/bots/${botId}/sessions`)).find((x) => x.comm)
    if (comm0) await until(async () => { const x = await chatOf(comm0.id); return x.info.state !== 'running' && x.info.state !== 'awaiting_input' && !(x.info.queue ?? []).length }, '소통 세션이 쉰다', 20000)
    await mcp('orch', 'bot_send', { bot: botId, text: '느린일 4초 EC5 소통' })
    const comm = await until(async () => (await api(`/bots/${botId}/sessions`)).find((x) => x.comm), '소통 세션'); await running(comm.id)
    const f = await steer(comm.id, '되읊어: 소통에 쓴 말 EC5'); must(f.status === 200 && f.j.how === 'sent' && f.j.sessionId && f.j.sessionId !== comm.id, '소통 세션 ' + JSON.stringify(f)); made.push(f.j.sessionId)
    // 갈라 연 채팅 — 사람 말은 그대로 한 번 서고(워커에게만 이어받은 맥락이 앞에 붙는다), 답이 온다
    await until(async () => { const x = await chatOf(f.j.sessionId); return users(x, '되읊어: 소통에 쓴 말 EC5').length === 1 && !users(x, '되읊어: 소통에 쓴 말 EC5')[0].steer && x.info.state === 'done' && answers(x).length === 1 }, '갈라 연 채팅의 답')
    must(!users(await chatOf(comm.id), '되읊어: 소통에 쓴 말 EC5').length, '소통 세션에 사람 말이 섰다')
    await rested(comm.id, 15000)
  })
  await check('H6 턴의 출처는 안 바뀐다 — 루틴이 연 턴에 사람이 끼워 넣어도 «사람만 시킬 수 있는 도구» 는 그 턴에서 막힌다', async () => {
    const r0 = (await api('/bots/orch/routines')).map(({ when: _w, nextRun: _n, lastError: _e, confirm: _c, ...r }) => r)
    await api('/bots/orch/routines', { routines: [...r0, { name: 'EC 출처 루틴', cron: '0 9 * * *', prompt: '느린일 4초 EC6', approve: 'always', push: false }] }, 'PUT')
    try {
      const before = (await api('/bots/orch/sessions')).map((x) => x.id)
      await api('/bots/orch/routines/run', { name: 'EC 출처 루틴' })
      const rs = await until(async () => (await api('/bots/orch/sessions')).find((x) => x.routine === 'EC 출처 루틴' && !before.includes(x.id)), '루틴 세션'); made.push(rs.id)
      await running(rs.id)
      const blocked0 = await mcp('orch', 'folder_move', { from: '없는 폴더 EC6', to: '4. Resources' }, rs.id)
      must(/사람이 시킨 턴에서만/.test(blocked0) && /예약된 루틴/.test(blocked0), '검사 전제 — 루틴 턴에서는 막혀야 한다 · ' + blocked0.slice(0, 160))
      const r = await steer(rs.id, '사람이 한마디 EC6'); must(r.status === 200 && r.j.how === 'steered', '루틴 세션에 끼워 넣기 ' + JSON.stringify(r))
      const blocked = await mcp('orch', 'folder_move', { from: '없는 폴더 EC6', to: '4. Resources' }, rs.id)
      must(/사람이 시킨 턴에서만/.test(blocked) && /예약된 루틴/.test(blocked), '끼워 넣었더니 루틴 턴이 사람의 턴이 됐다 · ' + blocked.slice(0, 160))
      await rested(rs.id)
    } finally { await api('/bots/orch/routines', { routines: r0 }, 'PUT').catch(() => {}) }
  })

  // ── U · 화면 ───────────────────────────────────────────────────────────────
  if (br) {
    const shot = async (pg, name) => { if (shots) await pg.screenshot({ path: join(shots, `ec-${name}.png`) }) }
    const page = async (phone) => {
      const pg = await br.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
      const errs = []; pg.on('pageerror', (e) => errs.push(e.message))
      await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:layout') })
      return { pg, errs }
    }
    /** 폰 홈(봇 목록) — 대화 머리의 ☰ 로 연다 */
    const phoneHome = async (pg, sid) => { await goto(pg, sid); await pg.evaluate(() => document.activeElement?.blur?.()); await wait(300); await pg.tap('.chat-hdr .hb-menu'); await pg.waitForSelector('.mhome', { timeout: 6000 }); await wait(400) }
    const goto = async (pg, sid, bot = botId) => { await pg.goto(`${base}/#bot=${bot}&s=${sid}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(500) }
    const sidOf = (pg) => pg.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('s'))
    const queueOf = (pg) => pg.evaluate(() => [...document.querySelectorAll('.qlist .queue')].map((q) => ({ who: q.querySelector('.qwho')?.textContent ?? '', tx: q.querySelector('.tx')?.textContent ?? '', btns: [...q.querySelectorAll('.qacts .qb')].map((b) => ({ t: b.textContent.trim(), cls: b.className, title: b.title, off: b.classList.contains('off'), aria: b.getAttribute('aria-disabled'), h: Math.round(b.getBoundingClientRect().height), r: Math.round(b.getBoundingClientRect().right) })) })))
    const typeSend = async (pg, text, phone) => { if (phone) await pg.tap('.composer .cin'); else await pg.click('.composer .cin'); await pg.keyboard.type(text); if (phone) await pg.tap('.composer .sendb'); else await pg.keyboard.press('Enter') }
    const focusOf = (pg) => pg.evaluate(() => { const a = document.activeElement; const card = a?.closest?.('.card[data-req]'); return { self: !!a?.matches?.('.card[data-req]'), req: card?.dataset.req ?? null, kind: card?.dataset.kind ?? null, on: card ? getComputedStyle(card.querySelector('.pk-on') ?? card).display : null, off: card?.querySelector('.pk-off') ? getComputedStyle(card.querySelector('.pk-off')).display : null, keys: card?.querySelector('.pkeys')?.textContent ?? null } })
    const D = await page(false); const P = await page(true)
    const K = {}

    await check('U1 데스크톱 — 대기 말 줄에 [끼워 넣기] [멈추고 보내기] 둘(«⚡ 지금» 없음) · 끼워 넣으면 줄에서 빠져 «끼워 넣음» 사람 말로 서고 턴은 그대로 돈다', async () => {
      const s = await newSession('EC 화면 끼워넣기'); K.u1 = s.id; const pg = D.pg; await goto(pg, s.id)
      await say(s.id, '느린일 6초 EC-U1'); await running(s.id)
      await typeSend(pg, '고쳐 말하기 EC-U1'); await pg.waitForSelector('.qlist .queue .qb.steer', { timeout: 4000 })
      const q = await queueOf(pg)
      must(q.length === 1 && JSON.stringify(q[0].btns.map((b) => b.t)) === JSON.stringify(['끼워 넣기', '멈추고 보내기', '고치기', '빼기']), '단추 ' + JSON.stringify(q))
      must(!q[0].btns[0].off && q[0].btns[0].aria === 'false' && /멈추지 않고/.test(q[0].btns[0].title) && /멈추고/.test(q[0].btns[1].title), '[끼워 넣기] 가 흐리거나 설명이 없다 ' + JSON.stringify(q[0].btns.slice(0, 2)))
      must(!/지금\s*$|⚡/.test(q[0].btns.map((b) => b.t).join(' ')), '옛 «⚡ 지금» 이 남았다')
      await shot(pg, 'u1-데스크톱-대기말-두-단추')
      await pg.click('.qlist .queue .qb.steer')
      await until(async () => !(await pg.$('.qlist .queue')), '대기 줄에서 빠진다')
      const c1 = await until(async () => { const c = await chatOf(s.id); return users(c, '고쳐 말하기 EC-U1').length ? c : null }, '호스트에 사람 말')
      must(users(c1, '고쳐 말하기 EC-U1')[0].steer === true && c1.info.state === 'running' && !c1.info.held, '멈췄거나 끼워 넣음 표시가 없다 ' + JSON.stringify({ st: c1.info.state, held: c1.info.held }))
      await pg.waitForSelector('.umsg[data-steer] .steertag', { timeout: 4000 })
      must((await pg.textContent('.umsg[data-steer] .steertag')) === '끼워 넣음' && !!(await pg.$('.live .stop')), '화면의 «끼워 넣음» 표시 · 턴 멈추기 단추')
      await until(async () => /끼워 넣은 말 반영\(priority=next · 기기 블록 있음\): 고쳐 말하기 EC-U1/.test((await pg.textContent('.chat-body')) ?? ''), '같은 턴의 답', 10000)
      await shot(pg, 'u1-데스크톱-끼워넣은-뒤-대화')
      const c = await chatOf(s.id); must(users(c, '고쳐 말하기 EC-U1').length === 1 && c.items.filter((i) => i.kind === 'result').length === 1, '말이 두 번 나갔거나 턴이 갈렸다')
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
    })
    await check('U2 [멈추고 보내기] — 하던 턴을 멈추고 그 말을 바로 보낸다(종전 «지금» 그대로 · 끼워 넣음 표시 없음)', async () => {
      const pg = D.pg; const s = K.u1; await rested(s)
      await say(s, '느린일 4초 EC-U2'); await running(s)
      await typeSend(pg, '되읊어: 멈추고 EC-U2'); await pg.waitForSelector('.qlist .queue .qb.now', { timeout: 4000 })
      const t0 = Date.now(); await pg.click('.qlist .queue .qb.now')
      await until(async () => answers(await chatOf(s)).includes('멈추고 EC-U2'), '멈추고 보낸 말의 답', 3500)
      must(Date.now() - t0 < 3500, '느린 턴이 끝날 때까지 기다렸다')
      const u = users(await chatOf(s), '되읊어: 멈추고 EC-U2'); must(u.length === 1 && !u[0].steer, '사람 말 ' + JSON.stringify(u))
      await wait(Math.max(0, 4600 - (Date.now() - t0)))
      // «느린 일 끝» 은 U1 의 턴이 낸 하나뿐이어야 한다 — 이 턴(4초)은 멈췄으니 끝 줄을 내지 않는다
      must(answers(await chatOf(s)).filter((t) => /^느린 일 끝/.test(t)).length === 1, '멈춘 턴이 뒤늦게 끝났다(안 멈췄다) ' + JSON.stringify(answers(await chatOf(s))))
    })
    await check('U3 끼워 넣을 수 없을 때 — 카드가 걸리면 [끼워 넣기] 가 흐려지고 까닭이 title · 누르면 말로(아무것도 안 나간다) · 입력칸의 ↩ 는 카드를 허용하지 않는다', async () => {
      const pg = D.pg; const k = await newSession('EC 화면 카드'); K.card = k.id; await goto(pg, k.id)
      await say(k.id, '승인 EC-U3'); await pendingOf(k.id); await pg.waitForSelector('.card[data-kind="perm"]', { timeout: 4000 })
      await typeSend(pg, '카드 뒤에 보낼 말 EC-U3'); await pg.waitForSelector('.qlist .queue .qb.steer', { timeout: 4000 })
      const c0 = await chatOf(k.id); must(c0.info.state === 'awaiting_input' && c0.info.pending.length === 1 && !c0.items.some((i) => i.kind === 'system' && i.text === '허용'), '🔴 입력칸의 ↩ 가 카드를 허용했다')
      const b = (await queueOf(pg))[0].btns[0]
      must(b.t === '끼워 넣기' && b.off && b.aria === 'true' && /카드에 먼저 답/.test(b.title), '흐린 단추 ' + JSON.stringify(b))
      await shot(pg, 'u3-데스크톱-카드-걸림-끼워넣기-흐림')
      await pg.evaluate(() => document.querySelector('.qlist .queue .qb.steer').click())   // ⚠ 흐린 단추(aria-disabled)는 playwright 가 눌릴 때까지 기다린다 — 사람은 누를 수 있으니 DOM 으로 누른다
      await until(async () => /카드에 먼저 답/.test((await pg.textContent('.toast').catch(() => '')) ?? ''), '누르면 까닭을 말한다', 3000)
      await wait(300); must((await queueOf(pg)).length === 1 && !users(await chatOf(k.id), '카드 뒤에 보낼 말 EC-U3').length, '흐린 단추가 말을 보냈다')
      await pg.click('.qlist .queue .qb.drop'); await until(async () => !(await pg.$('.qlist .queue')), '대기 줄 비우기')
    })
    await check('U4 다른 봇이 보낸 대기 말(호스트 대기열)은 [끼워 넣기] 가 흐리다 — 제 차례에 따로 돈다', async () => {
      const pg = D.pg
      const comm0 = (await api(`/bots/${botId}/sessions`)).find((x) => x.comm)
      if (comm0) await until(async () => { const x = await chatOf(comm0.id); return x.info.state !== 'running' && x.info.state !== 'awaiting_input' && !(x.info.queue ?? []).length }, '소통 세션이 쉰다', 20000)
      await mcp('orch', 'bot_send', { bot: botId, text: '느린일 5초 EC-U4' })
      const comm = await until(async () => (await api(`/bots/${botId}/sessions`)).find((x) => x.comm), '소통 세션'); await running(comm.id)
      await mcp('orch', 'bot_send', { bot: botId, text: '되읊어: 줄 선 봇 말 EC-U4' })
      await until(async () => ((await chatOf(comm.id)).info.queue ?? []).length === 1, '호스트 대기열 1')
      await goto(pg, comm.id); await pg.waitForSelector('.qlist .queue .qwho', { timeout: 4000 })
      const q = (await queueOf(pg))[0]
      must(q.who && q.btns[0].t === '끼워 넣기' && q.btns[0].off && /다른 봇의 말/.test(q.btns[0].title) && q.btns[1].t === '멈추고 보내기', '봇 말 줄 ' + JSON.stringify(q))
      await pg.evaluate(() => document.querySelector('.qlist .queue .qb.steer').click()); await wait(400)
      must(((await chatOf(comm.id)).info.queue ?? []).length === 1 && (await chatOf(comm.id)).info.state === 'running', '흐린 단추가 봇 말을 내보냈다')
      await until(async () => { const x = await chatOf(comm.id); return x.info.state !== 'running' && !(x.info.queue ?? []).length && answers(x).includes('줄 선 봇 말 EC-U4') }, '봇 말이 제 차례에 나간다', 15000)
    })
    await check('U5 ⌘J — «내 답을 기다리는» 다음 세션으로 뛰고(띠와 같은 차례 · 끝이면 처음으로) 카드에 초점 · 키 안내 · ↩ 로 허용 · 질문 카드는 초점만', async () => {
      const pg = D.pg
      const a = await newSession('EC 기다림 승인'); await say(a.id, '승인 EC-U5a'); const pa = await pendingOf(a.id)
      const b = await newSession('EC 기다림 질문'); await say(b.id, '질문 EC-U5b'); const pb = await pendingOf(b.id)
      const home = await newSession('EC 보던 세션'); await goto(pg, home.id)
      must(JSON.stringify(KEYS_ROW(await keysOf(pg)))?.includes('⌘J'), '단축키 표(⌘/)에 ⌘J 가 없다')
      const order = await waitingIds(); must(order.includes(a.id) && order.includes(b.id) && order.includes(K.card), '검사 전제 — 기다리는 세션 셋 ' + JSON.stringify(order))
      // 띠 «내 답을 기다림» 의 줄(위 셋까지)과 같은 차례다
      const strip = await pg.$$eval('.side.left .wband .cx-it[data-kind="waiting"]', (r) => r.map((x) => x.dataset.sid))
      must(strip.length >= 1 && JSON.stringify(strip) === JSON.stringify(order.slice(0, strip.length)), '띠의 줄과 차례가 다르다 ' + JSON.stringify({ strip, order }))
      // 한 바퀴 — 보던 세션은 목록에 없으니 맨 앞부터, 그다음은 차례대로, 끝이면 처음으로
      let cur = home.id; const seen = []
      for (let i = 0; i < order.length + 1; i++) {
        const want = order[(order.indexOf(cur) + 1) % order.length]
        await pg.keyboard.press('Meta+j')
        await until(async () => (await sidOf(pg)) === want, `⌘J ${i + 1}번째 → ${want.slice(-6)}`, 5000)
        const pend = (await chatOf(want)).info.pending[0]
        const f = await until(async () => { const x = await focusOf(pg); return x.self && x.req === pend.requestId ? x : null }, '카드에 초점', 5000)
        must(f.kind === (pend.ask ? 'ask' : 'perm'), '카드 종류 ' + JSON.stringify(f))
        if (!pend.ask) must(f.on !== 'none' && f.off === 'none' && /↩ 허용 · ⎋ 거부/.test(f.keys ?? ''), '승인 카드의 키 안내 ' + JSON.stringify(f))
        else must(f.keys === null, '질문 카드에 키 안내가 있다 ' + JSON.stringify(f))
        seen.push(want); cur = want
      }
      must(seen[order.length] === seen[0] && new Set(seen).size === order.length, '한 바퀴를 안 돌았다 ' + JSON.stringify(seen.map((x) => x.slice(-4))))
      // 질문 카드 — ↩ 로 답하지 않는다(선택지를 골라야 한다)
      while ((await sidOf(pg)) !== b.id) { await pg.keyboard.press('Meta+j'); await wait(500) }
      await until(async () => (await focusOf(pg)).req === pb.info.pending[0].requestId, '질문 카드 초점'); await pg.keyboard.press('Enter'); await wait(500)
      const cb = await chatOf(b.id); must(cb.info.state === 'awaiting_input' && cb.info.pending.length === 1 && !answers(cb).some((t) => /^답변 받음/.test(t)), '🔴 질문 카드가 ↩ 로 답해졌다')
      // 승인 카드 — 초점이 카드에 있을 때 ↩ = 허용
      while ((await sidOf(pg)) !== a.id) { await pg.keyboard.press('Meta+j'); await wait(500) }
      await until(async () => { const x = await focusOf(pg); return x.self && x.req === pa.info.pending[0].requestId }, '승인 카드 초점')
      await shot(pg, 'u5-데스크톱-다음-기다리는-세션-카드-초점')
      // 한글 조합 중의 ↩ 는 허용이 아니다
      await pg.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })))
      await wait(300); must((await chatOf(a.id)).info.pending.length === 1, '🔴 조합 중의 ↩ 가 카드를 허용했다')
      await pg.keyboard.press('Enter')
      const ca = await until(async () => { const x = await chatOf(a.id); return x.items.some((i) => i.kind === 'system' && i.text === '허용') && answers(x).some((t) => /^스텁이 처리했습니다/.test(t)) ? x : null }, '↩ 로 허용')
      must(!ca.info.held && !ca.info.stopped, '허용했는데 멈춤이 남았다')
      K.ask = b.id
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
    })
    await check('U6 ⎋ 순서 — 승인 카드가 걸려 있으면 ⎋ 는 그 카드를 거부하는 것 하나만(턴은 안 멈춘다) · 카드의 [거부] 에서 누른 ↩ 는 거부다', async () => {
      const pg = D.pg
      // ① 초점이 입력칸에 있어도 — 카드 거부 하나만
      const e = await newSession('EC ⎋ 입력칸'); await goto(pg, e.id); await say(e.id, '승인 EC-U6a'); await pendingOf(e.id); await pg.waitForSelector('.card[data-kind="perm"]', { timeout: 4000 })
      await pg.click('.composer .cin'); await pg.keyboard.press('Escape')
      const ce = await until(async () => { const x = await chatOf(e.id); return x.items.some((i) => i.kind === 'system' && i.text === '거부') && x.info.state === 'done' ? x : null }, '⎋ 로 카드 거부')
      must(!ce.info.held && !ce.info.stopped && answers(ce).includes('거부돼서 멈췄어요.') && ce.items.filter((i) => i.kind === 'result' && i.ok).length === 1, '🔴 ⎋ 한 번이 거부에 더해 턴까지 멈췄다 ' + JSON.stringify({ held: ce.info.held, stopped: ce.info.stopped, a: answers(ce) }))
      must(!(await pg.$('.stopln')), '«응답을 멈췄어요» 줄이 섰다(턴을 멈춘 것이다)')
      // ② 카드에 초점이 있을 때 — 같은 한 가지
      //    거부한 뒤에도 턴이 2.5초 더 도는 턴으로 잰다 — 카드가 사라진 직후 한 번 더 누른 ⎋(두 번 톡톡)가 그 턴을 멈추면 안 된다
      const f = await newSession('EC ⎋ 카드'); await goto(pg, f.id); await say(f.id, '승인 거부뒤느림 EC-U6b'); await pendingOf(f.id); await pg.waitForSelector('.card[data-kind="perm"]', { timeout: 4000 })
      await pg.evaluate(() => document.querySelector('.card[data-kind="perm"]').focus()); await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
      await pg.waitForSelector('.card[data-kind="perm"]', { state: 'detached', timeout: 4000 }); await pg.keyboard.press('Escape')
      await wait(500); const mid = await chatOf(f.id)
      must(mid.info.state === 'running' && !mid.info.held && !mid.info.stopped && mid.items.filter((i) => i.kind === 'system' && i.text === '거부').length === 1, '🔴 연달아 누른 ⎋ 가 턴을 멈췄거나 거부가 두 번 갔다 ' + JSON.stringify({ st: mid.info.state, held: mid.info.held, stopped: mid.info.stopped }))
      // 한 박자 쉬고 누른 ⎋ 는 종전대로 그 턴을 멈춘다(카드가 없다)
      await wait(400); await pg.keyboard.press('Escape')
      await until(async () => { const x = await chatOf(f.id); return x.info.state !== 'running' && x.info.stopped ? x : null }, '한 박자 뒤의 ⎋ = 턴 멈추기', 4000)
      // ③ [거부] 단추에 초점을 두고 누른 ↩ 는 그 단추의 일이다(허용으로 새지 않는다)
      const g = await newSession('EC ↩ 거부단추'); await goto(pg, g.id); await say(g.id, '승인 EC-U6c'); await pendingOf(g.id); await pg.waitForSelector('.card[data-kind="perm"] button[data-act="deny"]', { timeout: 4000 })
      await pg.focus('.card[data-kind="perm"] button[data-act="deny"]'); await pg.keyboard.press('Enter')
      const cg = await until(async () => { const x = await chatOf(g.id); return x.info.state === 'done' ? x : null }, '턴 끝')
      must(cg.items.some((i) => i.kind === 'system' && i.text === '거부') && !cg.items.some((i) => i.kind === 'system' && i.text === '허용'), '🔴 [거부] 에서 누른 ↩ 가 허용으로 갔다')
      // ④ 카드가 없으면 ⎋ 는 종전대로 턴을 멈춘다
      const h = await newSession('EC ⎋ 멈추기'); await goto(pg, h.id); await say(h.id, '느린일 길게 EC-U6d'); await running(h.id)
      await pg.click('.composer .cin'); await pg.keyboard.press('Escape')
      await until(async () => { const x = await chatOf(h.id); return x.info.state !== 'running' && x.info.stopped ? x : null }, '카드가 없을 때의 ⎋ = 턴 멈추기')
    })
    await check('U7 기다리는 세션이 없으면 ⌘J 는 «기다리는 세션이 없어요» 라고 말한다(있으면 그리로 간다)', async () => {
      const pg = D.pg
      for (const sid of [K.card, K.ask]) { const c = await chatOf(sid); if (c.info.pending.length) { await answer(sid, c, false); await rested(sid) } }
      const home = await newSession('EC 빈 기다림'); await goto(pg, home.id)
      const order = await waitingIds()
      await pg.keyboard.press('Meta+j')
      if (!order.length) { await until(async () => /기다리는 세션이 없어요/.test((await pg.textContent('.toast').catch(() => '')) ?? ''), '토스트', 3000); must((await sidOf(pg)) === home.id, '없는데 다른 세션으로 갔다') }
      else await until(async () => (await sidOf(pg)) === order[0], '남의 기다리는 세션으로', 5000)   // 스모크의 다른 검사가 남긴 기다리는 세션이 있을 때
    })
    await check('U8 세션 창 — 탭 다섯(전체 · 내 답 기다림 · 일하는 중 · 안 읽음 · 쉼)에 개수 · 탭은 보이는 줄만 거르고 «모두 고르기» 도 그 줄만 · 다시 열면 «전체»', async () => {
      const pg = D.pg
      const w = await newSession('EC 탭 기다림'); await say(w.id, '승인 EC-U8'); await pendingOf(w.id)
      const r = await newSession('EC 탭 일하는중'); await say(r.id, '느린일 길게 EC-U8'); await running(r.id)
      const un = await newSession('EC 탭 안읽음'); await say(un.id, '되읊어: 안 읽은 답 EC-U8'); await stateIs(un.id, 'done')
      const home = await newSession('EC 탭 쉼'); await goto(pg, home.id)
      await pg.click('.side.left .numrow .t-sess'); await pg.waitForSelector('.modal.clean.manage .stabs', { timeout: 4000 })
      const tabs = () => pg.$$eval('.modal.clean .stabs .stab', (bs) => bs.map((b) => ({ k: b.dataset.tab, t: b.querySelector('span')?.textContent ?? '', c: Number(b.querySelector('.c')?.textContent), on: b.classList.contains('on'), sel: b.getAttribute('aria-selected') })))
      const rowIds = () => pg.$$eval('.modal.clean tbody tr[data-id]', (r) => r.map((x) => x.dataset.id))
      const t0 = await tabs()
      must(JSON.stringify(t0.map((x) => x.t)) === JSON.stringify(TAB_NAMES) && t0[0].on && t0[0].sel === 'true' && t0.filter((x) => x.on).length === 1, '탭 ' + JSON.stringify(t0))
      const same = await until(async () => { const all = await allSessions(); const want = { all: all.length, wait: 0, work: 0, unread: 0, rest: 0 }; for (const x of all) want[tabOf(x)]++; const got = Object.fromEntries((await tabs()).map((x) => [x.k, x.c])); return JSON.stringify(got) === JSON.stringify(want) ? { got, all } : null }, '탭 개수가 호스트의 세션과 같다')
      must(same.got.wait + same.got.work + same.got.unread + same.got.rest === same.got.all && same.got.wait >= 1 && same.got.work >= 1 && same.got.unread >= 1 && same.got.rest >= 1, '개수 ' + JSON.stringify(same.got))
      await pg.waitForSelector('.toast', { state: 'detached', timeout: 4000 }).catch(() => {})   // 앞 검사의 토스트가 캡처에 남지 않게
      await shot(pg, 'u8-데스크톱-세션창-탭-다섯')
      for (const k of ['wait', 'work', 'unread', 'rest']) {
        await pg.click(`.modal.clean .stab[data-tab="${k}"]`); await wait(200)
        const ids = await rowIds(); const all = await allSessions(); const want = all.filter((x) => tabOf(x) === k).map((x) => x.id)
        must(ids.length === want.length && ids.every((id) => want.includes(id)), `«${k}» 탭의 줄 ` + JSON.stringify({ ids: ids.length, want: want.length }))
        must(ids.includes({ wait: w.id, work: r.id, unread: un.id, rest: home.id }[k]), `«${k}» 탭에 그 세션이 없다`)
        if (k === 'wait') await shot(pg, 'u8-데스크톱-세션창-내답기다림-탭')
      }
      // «쉼» 탭에서 «보이는 것 모두» — 그 탭에 보이는 줄만 골라진다
      const restIds = await rowIds()
      await pg.click('.modal.clean thead th.ck input'); await wait(200)
      const picked = await pg.$$eval('.modal.clean tbody tr[data-id]', (r) => r.filter((x) => x.querySelector('input:checked')).map((x) => x.dataset.id))
      must(picked.length >= 1 && picked.every((id) => restIds.includes(id)) && new RegExp(`고른 것 ${picked.length}개`).test((await pg.textContent('.modal.clean .modal-h .cnt')) ?? ''), '«쉼» 에서 모두 고르기 ' + JSON.stringify({ picked: picked.length, rest: restIds.length }))
      await pg.click('.modal.clean .stab[data-tab="all"]'); await wait(200)
      const pickedAll = await pg.$$eval('.modal.clean tbody tr[data-id]', (r) => r.filter((x) => x.querySelector('input:checked')).map((x) => x.dataset.id))
      must(pickedAll.length === picked.length && !pickedAll.includes(w.id) && !pickedAll.includes(r.id) && !pickedAll.includes(un.id), '탭을 바꿨더니 고른 줄이 달라졌거나 잠긴 줄이 골라졌다')
      await pg.click('.modal.clean thead th.ck input'); await pg.click('.modal.clean thead th.ck input'); await wait(100)   // 전체에서 다시 한 번 눌러 고르기를 비운다
      if (await pg.$$eval('.modal.clean tbody input:checked', (x) => x.length)) await pg.click('.modal.clean thead th.ck input')
      // 다시 열면 «전체»
      await pg.click('.modal.clean .stab[data-tab="work"]'); await pg.click('.modal.clean .modal-h .ib'); await wait(250)
      await pg.click('.side.left .numrow .t-sess'); await pg.waitForSelector('.modal.clean.manage .stabs', { timeout: 4000 })
      must((await tabs()).find((x) => x.on)?.k === 'all', '고른 탭을 기억했다(늘 «전체» 로 연다)')
      await pg.click('.modal.clean .modal-h .ib'); await wait(200)
      K.tabWait = w.id; K.tabRun = r.id
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
    })

    // ── P · 폰(390pt) ────────────────────────────────────────────────────────
    await check('P1 폰 — 대기 말의 두 단추가 엄지 크기(34px↑)로 화면 안에 서고, 눌러서 끼워 넣는다(올리기·끌기 없이)', async () => {
      const pg = P.pg; const s = await newSession('EC 폰 끼워넣기'); await goto(pg, s.id)
      must((await pg.evaluate(() => document.querySelector('.app')?.className ?? '')).includes('phone'), '폰 판이 아니다')
      await say(s.id, '느린일 6초 EC-P1'); await running(s.id)
      await typeSend(pg, '폰에서 고쳐 말하기 EC-P1', true); await pg.waitForSelector('.qlist .queue .qb.steer', { timeout: 4000 }); await wait(300)
      const q = (await queueOf(pg))[0]
      must(JSON.stringify(q.btns.map((b) => b.t)) === JSON.stringify(['끼워 넣기', '멈추고 보내기', '고치기', '빼기']) && !q.btns[0].off, '폰 단추 ' + JSON.stringify(q.btns.map((b) => [b.t, b.off])))
      const fit = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, qr: Math.round(document.querySelector('.qlist .queue').getBoundingClientRect().right) }))
      must(q.btns.every((b) => b.h >= 34 && b.r <= 390) && fit.sw <= 390 && fit.qr <= 390, '폰 치수 ' + JSON.stringify({ h: q.btns.map((b) => b.h), r: q.btns.map((b) => b.r), fit }))
      await shot(pg, 'p1-폰-대기말-두-단추')
      await pg.tap('.qlist .queue .qb.steer')
      const got = await until(async () => { const c = await chatOf(s.id); const u = users(c, '폰에서 고쳐 말하기 EC-P1'); return u.length ? { n: u.length, steer: u[0].steer, tier: u[0].from?.tier, st: c.info.state, held: !!c.info.held } : null }, '폰에서 끼워 넣기')
      must(got.n === 1 && got.steer === true && got.tier === 'phone' && got.st === 'running' && !got.held, '폰에서 끼워 넣은 말 ' + JSON.stringify(got))
      await pg.waitForSelector('.umsg[data-steer] .steertag', { timeout: 4000 })
      await until(async () => /끼워 넣은 말 반영\(priority=next · 기기 블록 있음\): 폰에서 고쳐 말하기 EC-P1/.test((await pg.textContent('.chat-body')) ?? ''), '같은 턴의 답', 10000)
      await shot(pg, 'p1-폰-끼워넣은-뒤-대화')
      await pg.evaluate(() => document.activeElement?.blur?.())   // 입력칸에 초점이 남아 있다(일부러 — 키보드를 안 닫는다). 다음 검사를 위해 놓는다
      must(!P.errs.length, '화면 오류 ' + P.errs.join(' | '))
    })
    await check('P2 폰 — 띠 «내 답을 기다림» 의 [답하기] 가 그 기다리는 세션으로 간다 · 카드에 키 안내는 없다', async () => {
      const pg = P.pg
      // 왼쪽 목록 A안(2026-11-14) — 상황판 띠(`.cx-strip` · 접고 펴기)는 «내 답을 기다림» 띠(`.cx-strip.wband`)만 남았다. 접힘이 없어져서 «접혀 있으면 편다» 걸음은 지웠다
      const home = await newSession('EC 폰 홈'); await phoneHome(pg, home.id); await pg.waitForSelector('.mhome .wband', { timeout: 6000 })
      const order = await waitingIds(); must(order.includes(K.tabWait), '검사 전제 — 기다리는 세션이 있어야 한다')
      const rows = await pg.$$eval('.mhome .wband .cx-it[data-kind="waiting"]', (r) => r.map((x) => ({ sid: x.dataset.sid, btn: !!x.querySelector('.cx-reply'), h: Math.round(x.querySelector('.cx-reply')?.getBoundingClientRect().height ?? 0) })))
      must(rows.length >= 1 && JSON.stringify(rows.map((x) => x.sid)) === JSON.stringify(order.slice(0, rows.length)) && rows.every((x) => x.btn), '띠의 줄 ' + JSON.stringify({ rows, order }))
      await pg.tap(`.mhome .wband .cx-it[data-sid="${rows[0].sid}"] .cx-reply`)
      await until(async () => (await sidOf(pg)) === rows[0].sid, '[답하기] → 그 세션', 5000)
      await pg.waitForSelector('.card[data-req]', { timeout: 5000 })
      must(!(await pg.$('.card .pkeys')), '폰 카드에 키 안내가 있다')
      await shot(pg, 'p2-폰-답하기-기다리는-세션')
    })
    await check('P3 폰 — 세션 창의 탭 다섯이 한 줄(안 접힘) · 넘치면 옆으로 밀린다 · 화면은 옆으로 안 샌다 · 눌러서 거른다', async () => {
      const pg = P.pg
      const home = await newSession('EC 폰 홈 2'); await phoneHome(pg, home.id)
      await pg.tap('.mhome .numrow .t-sess'); await pg.waitForSelector('.modal.clean.manage .stabs', { timeout: 4000 }); await wait(300)
      const m = await pg.evaluate(() => { const st = document.querySelector('.modal.clean .stabs'); const r = st.getBoundingClientRect(); const bs = [...st.querySelectorAll('.stab')].map((b) => b.getBoundingClientRect()); return { n: bs.length, tops: [...new Set(bs.map((b) => Math.round(b.top)))].length, minH: Math.min(...bs.map((b) => Math.round(b.height))), right: Math.round(r.right), left: Math.round(r.left), scrollW: st.scrollWidth, clientW: st.clientWidth, ov: getComputedStyle(st).overflowX, sw: document.documentElement.scrollWidth, modalSW: document.querySelector('.modal.clean').scrollWidth, modalW: Math.round(document.querySelector('.modal.clean').getBoundingClientRect().width), lastR: Math.round(bs[bs.length - 1].right) } })
      must(m.n === 5 && m.tops === 1 && m.minH >= 34 && m.left >= 0 && m.right <= 390 && m.sw <= 390 && m.modalSW <= m.modalW + 1 && (m.ov === 'auto' || m.ov === 'scroll'), '폰 탭 치수 ' + JSON.stringify(m))
      await shot(pg, 'p3-폰-세션창-탭')
      // 넘치면 옆으로 밀어 마지막 탭까지 닿는다
      if (m.scrollW > m.clientW) { await pg.evaluate(() => { document.querySelector('.modal.clean .stabs').scrollLeft = 9999 }); await wait(150); const lastR = await pg.evaluate(() => Math.round([...document.querySelectorAll('.modal.clean .stab')].pop().getBoundingClientRect().right)); must(lastR <= 390, '밀어도 마지막 탭이 화면 밖이다 ' + lastR) }
      else must(m.lastR <= 390, '안 넘치는데 마지막 탭이 화면 밖이다 ' + JSON.stringify(m))
      await pg.tap('.modal.clean .stab[data-tab="wait"]'); await wait(250)
      const ids = await pg.$$eval('.modal.clean tbody tr[data-id]', (r) => r.map((x) => x.dataset.id)); const want = await waitingIds()
      must(ids.length === want.length && ids.includes(K.tabWait), '폰 «내 답 기다림» 탭의 줄 ' + JSON.stringify({ ids: ids.length, want: want.length }))
      await shot(pg, 'p3-폰-세션창-내답기다림-탭')
      await pg.tap('.modal.clean .modal-h .ib'); await wait(200)
    })
    await check('P4 폰 — «뒤에서 도는 일» 이 끝난 것만 남으면 진행 줄의 단추는 없다 · 대화 속 카드의 [열기] 가 끝난 일의 결과를 다시 보여 준다', async () => {
      const pg = P.pg
      const s = await newSession('EC 폰 끝난일'); await say(s.id, '맡긴일 뒤에서 돌려 줘')
      const ts = await until(async () => { const t = (await api(`/sessions/${s.id}/tasks`)).tasks; return t.filter((x) => x.status === 'run').length === 3 && t.every((x) => x.taskId) ? t : null }, '도는 일 셋')
      await rested(s.id)
      for (const t of ts) await api(`/sessions/${s.id}/tasks/${t.taskId}/stop`, {})
      await until(async () => { const c = await chatOf(s.id); return c.tasks.every((x) => x.status !== 'run') && c.info.bg === 0 && c.info.state !== 'running' }, '다 끝남', 12000)
      await goto(pg, s.id); await pg.evaluate(() => document.activeElement?.blur?.()); await wait(200)
      must(!(await pg.$('.live .bgo')) && !(await pg.$('.tsheet.bgsheet')), '끝난 것만 남았는데 진행 줄 단추·시트가 있다(검사 전제가 달라졌다)')
      const cards = await pg.$$eval('.chat-body .sub', (r) => r.map((x) => ({ id: x.dataset.sub, op: !!x.querySelector('.l .op'), h: Math.round(x.querySelector('.l .op')?.getBoundingClientRect().height ?? 0), run: !!x.querySelector('.spin') })))
      must(cards.length === 2 && cards.every((c) => c.op && c.h > 0 && !c.run), '끝난 서브에이전트 카드마다 [열기] ' + JSON.stringify(cards))
      await pg.tap(`.chat-body .sub[data-sub="${cards[0].id}"] .l .op`); await pg.waitForSelector('.drill-r', { timeout: 4000 })
      const dr = await pg.evaluate(() => ({ p: document.querySelector('.drill-p .tx')?.textContent ?? '', head: document.querySelector('.drill-r .meta')?.textContent ?? '', sw: document.documentElement.scrollWidth }))
      must(/로그 훑기|문서 조사/.test(dr.p) && /멈춘 자리|결과/.test(dr.head) && dr.sw <= 390, '열어 본 화면 ' + JSON.stringify(dr))
      await shot(pg, 'p4-폰-끝난-일-다시-보기')
      must(!P.errs.length, '화면 오류 ' + P.errs.join(' | '))
    })
    // 화면 검사가 남긴 기다리는·도는 세션을 걷는다
    for (const sid of [K.tabWait]) { try { const c = await chatOf(sid); if (c.info.pending.length) await answer(sid, c, false) } catch { /* */ } }
    try { await api(`/sessions/${K.tabRun}/interrupt`, { by: 'api' }) } catch { /* */ }
    await D.pg.close(); await P.pg.close()
  }
  // 뒷정리 — 만든 세션을 지운다(다른 검사의 워커 자리를 안 잡게)
  for (const sid of made) { try { await raw(`/sessions/${sid}`, undefined, 'DELETE') } catch { /* */ } }
}
/** ⌘/ 단축키 표의 줄 글자들 */
async function keysOf(pg) { await pg.keyboard.press('Meta+/'); await pg.waitForSelector('.modal.keys .krow', { timeout: 3000 }); const rows = await pg.$$eval('.modal.keys .krow', (r) => r.map((x) => `${x.querySelector('.kk')?.textContent} ${x.querySelector('.kt')?.textContent}`)); await pg.keyboard.press('Meta+/'); await wait(200); return rows }
const KEYS_ROW = (rows) => rows.filter((r) => /⌘J|↩ · ⎋/.test(r))

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
  const only = arg('only', '')
  const root = realpathSync(mkdtempSync(join('/tmp', 'fb-ec-')))
  const data = mkdtempSync(join(tmpdir(), 'fb-ecdata-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-echome-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-eccfg-'))
  for (const d of ['1. Inbox', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n'); writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), '# Rondo\n\n본문\n'); writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 할 일\n- [ ] 하나\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_NO_AUTH: '1', FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', CLAUDE_CONFIG_DIR: claudeCfg }
  const PORT = Number(arg('port', 7475))
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
    await ecSteer({ base, root, data, claudeCfg, botId: bot.id, br, shots: shots || undefined,
      check: async (name, f) => { if (only && !only.split(',').some((p) => name.startsWith(p + ' '))) return; try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '\n    ', String(e.message ?? e).split('\n')[0].slice(0, 600)) } } })
  } catch (e) { red++; console.error('✗ 검사 틀이 죽었다', e.stack ?? e) } finally {
    try { await br?.close() } catch { /* */ } try { host.kill() } catch { /* */ }
    for (const d of [root, data, fbHome, claudeCfg]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* */ } }
  }
  console.log(`\nEC 검사 — 초록 ${green} · 빨강 ${red}`)
  process.exit(red ? 1 : 0)
}
