/**
 * EB · «사람이 없어도 안전하게 돈다» 검사 (2026-11-11) — Auto 권한 모드와 이름(자동 · 수동 · 편집 자동 수락 · 계획 · 항상 허용) ·
 * Auto 를 못 켰을 때 수동으로 내리기 · 도는 워커의 모드 바로 바꾸기(set_permission_mode) · 승인 시간 초과(사람이 시작하지 않은 턴만) ·
 * 루틴 승인 선택지의 Auto · Codex 세션에는 이 모드가 없다.
 *
 * 스모크(`test/smoke.mjs`)가 이 파일의 `ebPerm()` 을 불러 돌린다(검사 하나라도 빨가면 스모크가 멈춘다).
 * 혼자서도 돈다 — `node test/eb-perm.mjs [--no-ui] [--shots <폴더>]` 는 픽스처 볼트·스텁 CLI 로 호스트를 띄워 검사마다 ✓/✗ 를 찍고 **끝까지** 간다.
 * 🔴 «고치기 전 판에서 실제로 빨개지는가» 는 검사마다 따로 본다 — `src` 의 핵심 줄 하나를 되돌리고 `npm run build && node test/eb-perm.mjs --no-ui`.
 *    무엇을 되돌리면 무엇이 빨개지는지는 `docs/PRD.md` 의 EB 문단과 스모크의 EB 머리말에 적었다.
 * ⚠ 실 앱·실 볼트·`~/.claude` 를 건드리지 않는다 — 스텁의 갈래 스위치(`stub-perm.json`)도 임시 폴더(`CLAUDE_CONFIG_DIR`)에 쓴다.
 * ⚠ 승인 시간 초과는 «분» 설정에 분수(0.03분 ≈ 2초)를 넣어 잰다. 끝나면 기본값(끄기 · 0)으로 되돌린다.
 */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:net'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const MODE_NAMES = ['자동', '수동', '편집 자동 수락', '계획', '항상 허용']
const MODE_VALUES = ['auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions']

/**
 * @param o.base      호스트 주소
 * @param o.root      픽스처 볼트 · o.data 호스트 데이터 폴더(MCP 토큰을 만들 열쇠가 여기 있다)
 * @param o.claudeCfg 스텁이 읽는 `CLAUDE_CONFIG_DIR`(갈래 스위치 `stub-perm.json` 을 여기 쓴다)
 * @param o.botId     검사에 쓸 봇(시작돼 있어야 한다) · o.botAbs 그 봇의 폴더
 * @param o.br        playwright 브라우저(없으면 화면 검사는 건너뛴다)
 * @param o.check     (이름, async () => void) — 던지면 빨강
 * @param o.shots     캡처를 남길 폴더(없으면 안 남긴다)
 */
export async function ebPerm({ base, root, data, claudeCfg, botId, botAbs, br, check, shots }) {
  const raw = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json() } catch { /* */ } return { status: r.status, j } }
  const api = async (p, body, method) => { const r = await raw(p, body, method); if (r.status >= 400) throw new Error(`${p} → ${r.status} ${r.j?.error ?? ''}`); return r.j }
  const until = async (f, what, ms = 9000) => { const t0 = Date.now(); let last; for (;;) { try { last = await f(); if (last) return last } catch (e) { last = String(e.message ?? e) } if (Date.now() - t0 > ms) throw new Error(`기다렸는데 안 됐다 — ${what} · 마지막 ${JSON.stringify(last)?.slice(0, 300)}`); await wait(60) } }
  const must = (cond, msg) => { if (!cond) throw new Error(msg) }
  const chatOf = (sid) => api(`/sessions/${sid}/chat`)
  const made = []
  const newSession = async (name, extra = {}) => { const s = await api(`/bots/${botId}/sessions`, { name, ...extra }); made.push(s.id); return s }
  const say = (sid, text) => api(`/sessions/${sid}/send`, { text })
  const sys = (c) => c.items.filter((i) => i.kind === 'system').map((i) => i.text)
  const lastA = (c) => c.items.filter((i) => i.kind === 'assistant').pop()?.text ?? ''
  const stateIs = (sid, st) => until(async () => { const c = await chatOf(sid); return c.info.state === st ? c : null }, `상태 ${st}`)
  const pendingOf = (sid) => until(async () => { const c = await chatOf(sid); return c.info.state === 'awaiting_input' && c.info.pending.length ? c : null }, '승인 카드')
  const answer = (sid, c, allow) => api(`/sessions/${sid}/permission`, { requestId: c.info.pending[0].requestId, allow })
  /** 스텁의 갈래 스위치 — 워커가 뜰 때 읽는다. null 이면 걷는다 */
  const sw = (o) => { const f = join(claudeCfg, 'stub-perm.json'); if (o) writeFileSync(f, JSON.stringify(o)); else rmSync(f, { force: true }) }
  const mcp = async (bot, name, args) => {
    const u = new URL(`${base}/mcp/${bot}`); const key = Buffer.from(readFileSync(join(data, 'mcp.key'), 'utf8').trim(), 'base64url')
    const tok = createHmac('sha256', key).update(`${decodeURIComponent(u.pathname.slice(5))}\n`).digest('base64url')
    const r = await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }) })).json()
    return r.result?.content?.[0]?.text ?? JSON.stringify(r)
  }
  const routines0 = (await api(`/bots/${botId}/routines`)).map(({ when: _w, nextRun: _n, lastError: _e, ...r }) => r)
  const putRoutines = (extra) => api(`/bots/${botId}/routines`, { routines: [...routines0, ...extra] }, 'PUT')
  const runRoutine = async (name) => { await api(`/bots/${botId}/routines/run`, { name }); const s = await until(async () => (await api(`/bots/${botId}/sessions`)).find((x) => x.routine === name && !made.includes(x.id)), `루틴 «${name}» 세션`); made.push(s.id); return s.id }
  const runLog = () => { const dir = join(root, '.folderbot', 'ops'); if (!existsSync(dir)) return []; return readdirSync(dir).filter((f) => /^runs-.*\.jsonl$/.test(f)).flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return {} } })) }
  const setTimeoutMin = (minutes) => api('/approval-timeout', { minutes })
  sw(null)

  // ── M · 권한 모드 ───────────────────────────────────────────────────────────
  const K = {}
  await check('M1 Auto 로 뜬다 — `--permission-mode auto` 가 CLI 까지 가고, 워커가 말한 실제 모드(liveMode)가 «auto» · 모르는 모드는 400', async () => {
    const s = await newSession('EB 자동', { permissionMode: 'auto' }); K.auto = s.id
    must(s.permissionMode === 'auto', '만들 때 준 auto 가 안 남았다 ' + JSON.stringify(s.permissionMode))
    await say(s.id, '모드대로:Bash 해 줘')
    const c = await stateIs(s.id, 'done')
    must(lastA(c) === '모드 auto — 묻지 않고 실행: Bash', '스텁이 auto 로 안 떴다 · ' + lastA(c))
    must(c.info.liveMode === 'auto' && c.info.permissionMode === 'auto', '실제 모드 ' + JSON.stringify({ live: c.info.liveMode, stored: c.info.permissionMode }))
    const bad = await raw(`/sessions/${s.id}/settings`, { permissionMode: 'yolo' }); must(bad.status === 400, '모르는 모드를 받았다 ' + JSON.stringify(bad))
    must((await chatOf(s.id)).info.permissionMode === 'auto', '모르는 모드가 저장됐다')
  })
  await check('M2 Auto 여도 CLI 가 물어 온 승인은 사람에게 보인다 — 호스트가 «자동이니까» 대신 허용하지 않는다', async () => {
    await say(K.auto, '모드대로:Bash 위험한 일')
    const c = await pendingOf(K.auto)
    must(c.info.pending[0].toolName === 'Bash' && !sys(c).some((t) => /^자동 허용/.test(t)), '호스트가 대신 답했다 ' + JSON.stringify(sys(c)))
    await answer(K.auto, c, true)
    const d = await stateIs(K.auto, 'done'); must(/^허용 받아 실행: Bash \(모드 auto\)/.test(lastA(d)), '허용 뒤 답 · ' + lastA(d))
  })
  await check('M3 저장된 값을 옮기지 않는다 — 기본 권한 «default» 는 그대로 default(이름만 «수동») · 새 세션도 auto 가 되지 않고 물어본다 · 기본값을 auto 로 두면 그때만 auto', async () => {
    const st0 = await api('/state'); must((st0.defaults.permissionMode ?? 'default') === 'default', '검사 전제 — 기본 권한이 default 가 아니다 ' + st0.defaults.permissionMode)
    const s = await newSession('EB 옛값'); K.plain = s.id
    must((s.permissionMode ?? 'default') === 'default', '값 없이 만든 세션이 default 가 아니다 ' + s.permissionMode)
    await say(s.id, '모드대로:Bash 해 줘')
    const c = await pendingOf(s.id); must(c.info.pending[0].toolName === 'Bash', '수동인데 안 물었다')
    must((c.info.permissionMode ?? 'default') === 'default' && c.info.liveMode !== 'auto', '옛 세션이 auto 로 떴다 ' + JSON.stringify({ stored: c.info.permissionMode, live: c.info.liveMode }))
    await answer(s.id, c, false); await stateIs(s.id, 'done')
    await api('/defaults', { model: st0.defaults.model, effort: st0.defaults.effort, agent: 'claude', permissionMode: 'auto' })
    try {
      must((await api('/state')).defaults.permissionMode === 'auto', '기본 권한에 auto 가 안 실린다')
      const a = await newSession('EB 기본 auto'); must(a.permissionMode === 'auto', '기본값 auto 인데 새 세션이 ' + a.permissionMode)
    } finally { await api('/defaults', { model: st0.defaults.model, effort: st0.defaults.effort, agent: 'claude', permissionMode: 'default' }) }
    must((await api('/state')).defaults.permissionMode === 'default', 'default 로 되돌리기')
  })
  await check('M4 Auto 를 CLI 가 받지 않고 죽으면 — 턴이 죽지 않고 «수동» 으로 다시 뜬다 · 대화에 한 줄 · 모드 표시는 실제 모드 · 사람 말은 한 번만', async () => {
    sw({ auto: 'reject' })
    try {
      const s = await newSession('EB 자동 거부', { permissionMode: 'auto' }); K.reject = s.id
      await say(s.id, '모드대로:Bash 해 줘')
      const c = await pendingOf(s.id)   // 수동으로 다시 떠서 물어 온다 — 죽었으면 여기까지 못 온다
      must(sys(c).some((t) => /«자동» 모드를 못 켜 «수동» 으로 돌려요/.test(t)), '알림 줄이 없다 ' + JSON.stringify(sys(c)))
      must(!sys(c).some((t) => /세션을 못 띄웠어요/.test(t)), '오류 줄이 남았다 ' + JSON.stringify(sys(c)))
      must(c.info.permissionMode === 'default' && c.info.liveMode === 'default', '모드 표시 ' + JSON.stringify({ stored: c.info.permissionMode, live: c.info.liveMode }))
      must(c.items.filter((i) => i.kind === 'user').length === 1, '사람 말이 두 번 섰다')
      await answer(s.id, c, true); const d = await stateIs(s.id, 'done'); must(/허용 받아 실행: Bash \(모드 default\)/.test(lastA(d)), '다시 뜬 워커의 모드 · ' + lastA(d))
    } finally { sw(null) }
  })
  await check('M5 Auto 를 요청했는데 다른 모드로 뜨면 — 수동으로 떴으면 그대로 알리고, 더 느슨하게(항상 허용) 떴으면 수동을 명시해 다시 띄운다', async () => {
    sw({ auto: 'downgrade' })
    try {
      const s = await newSession('EB 자동 내림', { permissionMode: 'auto' }); K.down = s.id
      await say(s.id, '모드대로:Bash 해 줘')
      const c = await pendingOf(s.id)
      must(sys(c).some((t) => /«자동» 모드를 못 켜 «수동» 으로 돌려요/.test(t)) && c.info.permissionMode === 'default' && c.info.liveMode === 'default', '수동으로 뜬 경우 ' + JSON.stringify({ sys: sys(c), stored: c.info.permissionMode, live: c.info.liveMode }))
      must(c.items.filter((i) => i.kind === 'user').length === 1, '사람 말이 두 번 섰다')
      await answer(s.id, c, false); await stateIs(s.id, 'done')
    } finally { sw(null) }
    sw({ auto: 'loose' })
    try {
      const s = await newSession('EB 자동 느슨', { permissionMode: 'auto' })
      await say(s.id, '모드대로:Bash 해 줘')
      const c = await pendingOf(s.id)   // 항상 허용으로 뜬 채였으면 묻지 않고 실행했을 것이다
      must(!c.items.some((i) => i.kind === 'assistant' && /묻지 않고 실행/.test(i.text)), '느슨한 모드로 실행해 버렸다 ' + JSON.stringify(c.items.filter((i) => i.kind === 'assistant').map((i) => i.text)))
      must(c.info.permissionMode === 'default' && c.info.liveMode === 'default' && c.items.filter((i) => i.kind === 'user').length === 1, '다시 띄운 뒤 ' + JSON.stringify({ stored: c.info.permissionMode, live: c.info.liveMode }))
      await answer(s.id, c, false); await stateIs(s.id, 'done')
    } finally { sw(null) }
  })
  await check('M6 도는 중에 모드를 바꾸면 워커에 바로 들어간다 — set_permission_mode · «바로 적용» · 호스트가 대신 답하지 않는다 · 워커를 다시 띄우지 않는다', async () => {
    const s = await newSession('EB 바로 적용'); K.now = s.id
    await say(s.id, '모드대로:Write 느리게 해 줘'); await stateIs(s.id, 'running'); await wait(300)
    const r = await api(`/sessions/${s.id}/settings`, { permissionMode: 'acceptEdits' })
    must(r.modeApplied === 'now' && !r.restartPending && r.liveMode === 'acceptEdits' && r.permissionMode === 'acceptEdits', '답 ' + JSON.stringify({ a: r.modeApplied, rp: r.restartPending, live: r.liveMode, stored: r.permissionMode }))
    const c = await stateIs(s.id, 'done')
    must(lastA(c) === '모드 acceptEdits — 묻지 않고 실행: Write', '바뀐 모드로 판단하지 않았다 · ' + lastA(c))
    must(sys(c).some((t) => /권한 모드 → «편집 자동 수락» · 도는 중인 턴에 바로 적용/.test(t)), '시스템 줄 ' + JSON.stringify(sys(c)))
    must(!sys(c).some((t) => /^자동 허용/.test(t)), '호스트가 대신 답했다(바로 적용이 아니다) ' + JSON.stringify(sys(c)))
    must(c.info.alive && !c.info.modeApplied && !c.info.restartPending, '턴 뒤 ' + JSON.stringify({ alive: c.info.alive, a: c.info.modeApplied, rp: c.info.restartPending }))
  })
  await check('M7 워커에 못 넣으면 종전 방식 — «항상 허용» 은 거절(bypass_not_launched)되고, 그 턴은 호스트가 대신 답한 뒤 다음 워커부터 · «다음 턴부터» 가 남는다', async () => {
    const s = await newSession('EB 다음 턴')
    await say(s.id, '모드대로:Bash 느리게 해 줘'); await stateIs(s.id, 'running'); await wait(300)
    const r = await api(`/sessions/${s.id}/settings`, { permissionMode: 'bypassPermissions' })
    must(r.modeApplied === 'next' && r.restartPending === true, '답 ' + JSON.stringify({ a: r.modeApplied, rp: r.restartPending }))
    const c = await stateIs(s.id, 'done')
    must(sys(c).some((t) => /^자동 허용 · Bash \(항상 허용 모드\)/.test(t)), '호스트가 대신 답하지 않았다 ' + JSON.stringify(sys(c)))
    must(sys(c).some((t) => /권한 모드 → «항상 허용» · 다음 턴부터 적용/.test(t)), '시스템 줄 ' + JSON.stringify(sys(c)))
    must(/허용 받아 실행: Bash \(모드 default\)/.test(lastA(c)), '워커는 옛 모드여야 한다 · ' + lastA(c))
    const d = await until(async () => { const x = await chatOf(s.id); return !x.info.alive && !x.info.restartPending ? x : null }, '턴 뒤 워커를 내린다')
    must(!d.info.modeApplied, '표시가 남았다')
    // 다음 워커는 새 모드로 뜬다
    await say(s.id, '모드대로:Bash 해 줘'); const e = await stateIs(s.id, 'done'); must(lastA(e) === '모드 bypassPermissions — 묻지 않고 실행: Bash', '다음 워커의 모드 · ' + lastA(e))
  })
  await check('M8 옛 CLI(set_permission_mode 를 모른다 · 답이 없다)에서도 종전 방식으로 떨어진다', async () => {
    sw({ ctl: 'off' })
    try {
      const s = await newSession('EB 옛 CLI')
      await say(s.id, '모드대로:Write 느리게 해 줘'); await stateIs(s.id, 'running'); await wait(300)
      const r = await api(`/sessions/${s.id}/settings`, { permissionMode: 'acceptEdits' })
      must(r.modeApplied === 'next' && r.restartPending === true, '답 ' + JSON.stringify({ a: r.modeApplied, rp: r.restartPending }))
      const c = await stateIs(s.id, 'done'); must(sys(c).some((t) => /^자동 허용 · Write \(편집 자동 수락 모드\)/.test(t)), '호스트가 대신 답하지 않았다 ' + JSON.stringify(sys(c)))
    } finally { sw(null) }
    sw({ ctl: 'silent' })
    try {
      const s = await newSession('EB 답 없는 CLI'); await say(s.id, '안녕'); await stateIs(s.id, 'done')
      const t0 = Date.now(); const r = await api(`/sessions/${s.id}/settings`, { permissionMode: 'plan' }); const ms = Date.now() - t0
      must(ms >= 2000 && ms < 6000 && !r.alive && r.permissionMode === 'plan', `답 없는 CLI — ${ms}ms · ` + JSON.stringify({ alive: r.alive, stored: r.permissionMode }))
    } finally { sw(null) }
  })
  await check('M9 모드를 안 정한 세션은 «새 채팅 기본 권한» 을 따른다 — 그 맥의 Claude Code 설정이 아니다 · 기본이 «수동» 이면 묻고, 기본을 바꾸면 다음에 뜰 때 그 모드', async () => {
    // 🔴 2026-11-11 Dave 결정 — 실 CLI 는 인자 없이 띄우면 `~/.claude/settings.json` 의 `permissions.defaultMode`(맥미니는 auto)를 따른다.
    //    그래서 호스트는 **늘** 모드를 인자로 넘긴다. 스텁의 `inherit: 'auto'` 는 «인자 없이 뜨면 auto» 다 — 인자가 빠지면 아래가 빨개진다.
    sw({ inherit: 'auto' })
    const st0 = await api('/state')
    const setDefault = (mode) => api('/defaults', { model: st0.defaults.model, effort: st0.defaults.effort, agent: 'claude', permissionMode: mode })
    try {
      must(st0.defaults.permissionMode === 'default' && st0.defaults.inheritMode === undefined, '시작 상태 ' + JSON.stringify(st0.defaults))
      const s = await newSession('EB 기본 권한 따름'); K.inherit = s.id
      must((s.permissionMode ?? 'default') === 'default' && (s.liveMode ?? 'default') === 'default', '워커가 없는 세션의 표시(기본 수동) ' + JSON.stringify({ stored: s.permissionMode, live: s.liveMode }))
      // 기본이 «수동» — CLI 설정이 auto 여도 묻는다
      await say(s.id, '모드대로:Bash 해 줘')
      const p = await pendingOf(s.id); must(p.info.liveMode === 'default', '기본 «수동» 인데 워커가 ' + p.info.liveMode + ' 로 떴다'); await answer(s.id, p, false); await stateIs(s.id, 'done')
      // 기본을 «편집 자동 수락» 으로 — 모드를 안 정한 세션은 워커가 없을 때도 그 모드로 보이고, 다시 뜰 때 그 모드로 뜬다. 저장값은 그대로
      const y = await newSession('EB 기본 권한 따름 2')
      await setDefault('acceptEdits')
      const y1 = (await chatOf(y.id)).info; must((y1.permissionMode ?? 'default') === 'default' && y1.liveMode === 'acceptEdits', '워커가 없는 세션의 표시(기본 편집 자동 수락) ' + JSON.stringify({ stored: y1.permissionMode, live: y1.liveMode }))
      await say(y.id, '안녕'); const cy = await stateIs(y.id, 'done')
      must((cy.info.permissionMode ?? 'default') === 'default' && cy.info.liveMode === 'acceptEdits', '기본 «편집 자동 수락» 인데 ' + JSON.stringify({ stored: cy.info.permissionMode, live: cy.info.liveMode }))
      await api(`/sessions/${s.id}/hibernate`, {}); await say(s.id, '안녕'); const cs = await stateIs(s.id, 'done')
      must(cs.info.liveMode === 'acceptEdits', '재웠다 깨운 세션이 바뀐 기본을 안 따른다 ' + cs.info.liveMode)
      // «수동» 을 직접 고르면 고정 — 기본이 무엇이든, 재웠다 깨워도 수동
      const r = await api(`/sessions/${s.id}/settings`, { permissionMode: 'default' }); must(r.liveMode === 'default' && r.alive, '수동으로 바로 안 바뀌었다 ' + JSON.stringify({ live: r.liveMode, alive: r.alive }))
      await api(`/sessions/${s.id}/hibernate`, {}); await say(s.id, '모드대로:Bash 해 줘')
      const p2 = await pendingOf(s.id); must(p2.info.liveMode === 'default', '고른 «수동» 이 안 지켜진다 ' + p2.info.liveMode); await answer(s.id, p2, false); await stateIs(s.id, 'done')
    } finally { sw(null); await setDefault('default') }
  })
  await check('M10 Codex 세션에는 이 모드가 없다 — 만들 때도 · 바꿀 때도 값이 실리지 않는다(샌드박스가 그 자리다)', async () => {
    const s = await newSession('EB 코덱스', { vendor: 'codex', permissionMode: 'auto' }); K.codex = s.id
    must(s.vendor === 'codex' && s.permissionMode === undefined && s.liveMode === undefined, '만들 때 ' + JSON.stringify({ v: s.vendor, stored: s.permissionMode, live: s.liveMode }))
    const r = await api(`/sessions/${s.id}/settings`, { permissionMode: 'auto' }); must(r.permissionMode === undefined && r.liveMode === undefined, '바꿀 때 ' + JSON.stringify({ stored: r.permissionMode, live: r.liveMode }))
  })

  // ── T · 승인 시간 초과 ───────────────────────────────────────────────────────
  await check('T1 설정값 — 기본은 끄기(0 · 2026-11-11 Dave) · 음수·글자는 400 · 저장되면 상태에 실린다', async () => {
    must((await api('/state')).defaults.approvalTimeoutMinutes === 0, '기본값이 끄기(0)가 아니다 ' + (await api('/state')).defaults.approvalTimeoutMinutes)
    for (const bad of [-1, 'abc']) { const r = await raw('/approval-timeout', { minutes: bad }); must(r.status === 400, `이상한 값 «${bad}» 를 받았다 ` + JSON.stringify(r)) }
    await setTimeoutMin(30); must((await api('/state')).defaults.approvalTimeoutMinutes === 30, '30분이 안 실린다')
    await setTimeoutMin(0); must((await api('/state')).defaults.approvalTimeoutMinutes === 0, '0(끄기)이 안 실린다')
    await setTimeoutMin(0)
  })
  await check('T2 루틴 턴 — 승인이 시간 안에 안 오면 거절하고 넘어간다 · 모델이 사유를 받는다 · 대화에 한 줄 · 실행 기록에 «실패 · 승인 시간 초과»', async () => {
    await putRoutines([{ name: 'EB 폴더 루틴', cron: '0 9 * * *', prompt: '모드대로:Bash 결과줄:결과: ok', approve: 'folder', push: false }])
    await setTimeoutMin(0.03)
    try {
      const sid = await runRoutine('EB 폴더 루틴'); K.routine = sid
      const p = await pendingOf(sid); must(p.info.permissionMode === 'acceptEdits' && p.info.pending[0].toolName === 'Bash', '검사 전제 — 루틴이 승인을 기다려야 한다 ' + JSON.stringify({ m: p.info.permissionMode }))
      const c = await stateIs(sid, 'done')
      must(sys(c).some((t) => /^승인 시간 초과 · Bash — 2초 동안 답이 없어 거절했어요 \(루틴이 시작한 턴/.test(t)), '시스템 줄 ' + JSON.stringify(sys(c)))
      must(/^거절 받음: 2초 동안 사람의 답이 없어 거절됐습니다\(승인 시간 초과\)/.test(lastA(c)), '모델이 받은 사유 · ' + lastA(c))
      must(c.info.pending.length === 0, '카드가 남았다')
      const ev = await until(async () => { const l = runLog().filter((e) => e.run === sid); return l.some((e) => e.event === 'end') ? l : null }, '실행 기록의 끝 줄')
      const end = ev.find((e) => e.event === 'end'), mid = ev.find((e) => e.event === 'approval_timeout')
      must(mid && mid.tool === 'Bash', '시간 초과 줄이 실행 기록에 없다 ' + JSON.stringify(ev.map((e) => e.event)))
      must(end.ok === false && end.result === 'fail' && /^승인 시간 초과 · Bash/.test(end.reason ?? '') && end.approvalTimeouts === 1, '끝 줄 ' + JSON.stringify(end))
      const board = await api('/routines/overview').catch(() => null)
      if (board?.routines) { const row = board.routines.find((x) => x.name === 'EB 폴더 루틴'); must(row?.state === 'fail' && /승인 시간 초과/.test(row.last?.reason ?? '') && row.daveTodo === true, '루틴 보드 ' + JSON.stringify(row && { st: row.state, r: row.last?.reason, d: row.daveTodo })) }
    } finally { await setTimeoutMin(0) }
  })
  await check('T3 봇이 시작한 턴(bot_send → «🤝 소통» 세션)도 같다 — 시간 안에 답이 없으면 거절', async () => {
    const comm0 = (await api(`/bots/${botId}/sessions`)).find((x) => x.comm)
    if (comm0) await until(async () => { const c = await chatOf(comm0.id); return c.info.state !== 'running' && c.info.state !== 'awaiting_input' && !(c.info.queue ?? []).length }, '소통 세션이 쉰다', 15000)
    await setTimeoutMin(0.03)
    try {
      const out = await mcp('orch', 'bot_send', { bot: botId, text: '모드대로:Bash 봇이 시킨 일' }); must(/넘겼어요|보냈|sent|세션/.test(out), 'bot_send 답 · ' + out.slice(0, 160))
      const comm = await until(async () => (await api(`/bots/${botId}/sessions`)).find((x) => x.comm), '소통 세션')
      const c = await until(async () => { const x = await chatOf(comm.id); return sys(x).some((t) => /^승인 시간 초과 · Bash/.test(t)) && x.info.state === 'done' ? x : null }, '봇 턴의 승인 시간 초과', 12000)
      must(sys(c).some((t) => /승인 시간 초과 · Bash — 2초 동안 답이 없어 거절했어요 \(다른 봇의 말로 시작된 턴/.test(t)), '시스템 줄 ' + JSON.stringify(sys(c).slice(-3)))
      must(/^거절 받음: 2초 동안 사람의 답이 없어 거절됐습니다/.test(lastA(c)), '모델이 받은 사유 · ' + lastA(c))
    } finally { await setTimeoutMin(0) }
  })
  await check('T4 사람이 보낸 턴은 끝까지 기다린다 — 같은 시간이 지나도 카드가 그대로다', async () => {
    await setTimeoutMin(0.03)
    try {
      const s = await newSession('EB 사람 턴'); K.human = s.id
      await say(s.id, '모드대로:Bash 사람이 시킨 일')
      await pendingOf(s.id); await wait(3200)
      const c = await chatOf(s.id)
      must(c.info.state === 'awaiting_input' && c.info.pending.length === 1, '사람 턴의 카드가 사라졌다 ' + JSON.stringify({ st: c.info.state, p: c.info.pending.length }))
      must(!sys(c).some((t) => /승인 시간 초과/.test(t)), '사람 턴에 시간 초과가 걸렸다 ' + JSON.stringify(sys(c)))
      await answer(s.id, c, true); const d = await stateIs(s.id, 'done'); must(/^허용 받아 실행: Bash/.test(lastA(d)), '기다린 뒤 허용 · ' + lastA(d))
    } finally { await setTimeoutMin(0) }
  })
  await check('T5 0 은 끄기 — 루틴 턴도 기다린다 · 질문 카드(AskUserQuestion)는 켜져 있어도 건드리지 않는다', async () => {
    // ⚠ T2 의 루틴 세션은 화면 검사(U5)가 다시 연다 — 같은 루틴을 또 돌리면 자동 정리(루틴마다 하나)가 그 세션을 걷으므로 다른 이름을 쓴다
    await putRoutines([{ name: 'EB 폴더 루틴', cron: '0 9 * * *', prompt: '모드대로:Bash 결과줄:결과: ok', approve: 'folder', push: false }, { name: 'EB 끈 루틴', cron: '0 9 * * *', prompt: '모드대로:Bash 결과줄:결과: ok', approve: 'folder', push: false }, { name: 'EB 질문 루틴', cron: '0 9 * * *', prompt: '질문 하나 해 줘', push: false }])
    await setTimeoutMin(0)
    try {
      const sid = await runRoutine('EB 끈 루틴')
      await pendingOf(sid); await wait(3200)
      const c = await chatOf(sid); must(c.info.state === 'awaiting_input' && c.info.pending.length === 1 && !sys(c).some((t) => /승인 시간 초과/.test(t)), '껐는데 시간 초과가 걸렸다 ' + JSON.stringify({ st: c.info.state, sys: sys(c) }))
      await answer(sid, c, false); await stateIs(sid, 'done')
    } finally { await setTimeoutMin(0) }
    await setTimeoutMin(0.03)
    try {
      const sid = await runRoutine('EB 질문 루틴')
      const p = await pendingOf(sid); must(p.info.pending[0].ask === true, '검사 전제 — 질문 카드여야 한다')
      await wait(3200)
      const c = await chatOf(sid); must(c.info.state === 'awaiting_input' && c.info.pending.length === 1 && !sys(c).some((t) => /승인 시간 초과/.test(t)), '질문 카드에 시간 초과가 걸렸다 ' + JSON.stringify({ st: c.info.state, sys: sys(c) }))
    } finally { await setTimeoutMin(0) }
  })

  // ── R · 루틴 승인 선택지 ─────────────────────────────────────────────────────
  await check('R1 루틴 승인 «auto» — `--permission-mode auto` 로 돈다 · 안 적은 루틴은 그대로 «항상 허용»(기본값은 안 바꿨다) · 봇 도구에는 여전히 approve 인자가 없다', async () => {
    await putRoutines([{ name: 'EB 자동 루틴', cron: '0 9 * * *', prompt: '모드대로:Bash 결과줄:결과: ok', approve: 'auto', push: false }, { name: 'EB 기본 루틴', cron: '0 9 * * *', prompt: '모드대로:Bash 결과줄:결과: ok', push: false }])
    const saved = await api(`/bots/${botId}/routines`); must(saved.find((r) => r.name === 'EB 자동 루틴')?.approve === 'auto' && saved.find((r) => r.name === 'EB 기본 루틴')?.approve === undefined, '저장 ' + JSON.stringify(saved.map((r) => [r.name, r.approve])))
    const a = await runRoutine('EB 자동 루틴'); const ca = await stateIs(a, 'done')
    must(ca.info.permissionMode === 'auto' && /^모드 auto — 묻지 않고 실행: Bash/.test(lastA(ca)), 'auto 루틴 ' + JSON.stringify({ m: ca.info.permissionMode, a: lastA(ca) }))
    const b = await runRoutine('EB 기본 루틴'); const cb = await stateIs(b, 'done')
    must(cb.info.permissionMode === 'bypassPermissions' && /^모드 bypassPermissions — 묻지 않고 실행: Bash/.test(lastA(cb)), '기본 루틴 ' + JSON.stringify({ m: cb.info.permissionMode, a: lastA(cb) }))
    const list = JSON.parse(await mcp(botId, 'routine_list', {})); must(list.find((r) => r.name === 'EB 자동 루틴')?.approve === 'auto', 'routine_list ' + JSON.stringify(list.map((r) => [r.name, r.approve])))
    const up = await mcp(botId, 'routine_update', { name: 'EB 자동 루틴', approve: 'always' }); void up
    must((await api(`/bots/${botId}/routines`)).find((r) => r.name === 'EB 자동 루틴')?.approve === 'auto', '봇이 approve 를 바꿨다')
  })

  // ── U · 화면 ───────────────────────────────────────────────────────────────
  if (br) {
    const shot = async (pg, name) => { if (shots) await pg.screenshot({ path: join(shots, `eb-${name}.png`) }) }
    const page = async (phone) => {
      const pg = await br.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: shots ? 2 : 1, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
      const errs = []; pg.on('pageerror', (e) => errs.push(e.message))
      await pg.addInitScript(() => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); localStorage.removeItem('fb:layout') })
      return { pg, errs }
    }
    const goto = async (pg, sid) => { await pg.goto(`${base}/#bot=${botId}&s=${sid}`); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(500) }
    const chip = (pg) => pg.evaluate(() => { const b = document.querySelector('.cbar .cbtn, .cchips .cbtn'); return b ? { t: (b.childNodes[0]?.textContent ?? '').trim(), mode: b.dataset.mode ?? null, pend: b.querySelector('.pend')?.textContent ?? null } : null })
    const openMode = async (pg, phone) => { await (phone ? pg.tap('.cchips .cbtn') : pg.click('.cbar .cbtn')); await pg.waitForSelector('.cpop.modepop', { timeout: 4000 }); await wait(150) }
    const rows = (pg) => pg.evaluate(() => [...document.querySelectorAll('.cpop.modepop .prow2')].map((e) => ({ v: e.dataset.mode, t: e.querySelector('b')?.textContent ?? '', d: e.querySelector('small')?.textContent ?? '', on: e.classList.contains('on'), k: e.querySelector('.k')?.textContent ?? null, w: Math.round(e.getBoundingClientRect().right), h: Math.round(e.getBoundingClientRect().height) })))
    const D = await page(false); const P = await page(true)
    await check('U1 데스크톱 — 모드 목록이 다섯(자동 · 수동 · 편집 자동 수락 · 계획 · 항상 허용) · default 세션의 칩은 «수동» · 숫자 키 1 이 «자동»', async () => {
      const s = await newSession('EB 화면'); K.ui = s.id
      const pg = D.pg; await goto(pg, s.id)
      const c0 = await chip(pg); must(c0?.t === '수동' && c0.mode === 'default', 'default 세션의 칩 ' + JSON.stringify(c0))
      await openMode(pg, false)
      const r = await rows(pg)
      must(JSON.stringify(r.map((x) => x.t)) === JSON.stringify(MODE_NAMES) && JSON.stringify(r.map((x) => x.v)) === JSON.stringify(MODE_VALUES), '목록 ' + JSON.stringify(r.map((x) => [x.v, x.t])))
      must(r.find((x) => x.v === 'default').on && r.filter((x) => x.on).length === 1 && r.every((x) => x.d.length > 4), '고른 줄·설명 ' + JSON.stringify(r))
      must(JSON.stringify(r.filter((x) => !x.on).map((x) => x.k)) === JSON.stringify(['1', '3', '4', '5']) && /1~5/.test(await pg.textContent('.cpop.modepop .hint')), '숫자 키 안내 ' + JSON.stringify(r.map((x) => x.k)))
      await shot(pg, 'u1-데스크톱-권한모드-목록')
      await pg.keyboard.press('1')
      await until(async () => (await chatOf(s.id)).info.permissionMode === 'auto', '숫자 키 1 → auto')
      await until(async () => (await chip(pg))?.t === '자동', '칩이 «자동» 으로')
      await openMode(pg, false); await pg.keyboard.press('5'); await until(async () => (await chatOf(s.id)).info.permissionMode === 'bypassPermissions', '숫자 키 5 → 항상 허용')
      must(!D.errs.length, '화면 오류 ' + D.errs.join(' | '))
    })
    await check('U2 폰(390pt) — 같은 다섯 줄이 화면 안에 · 줄은 손가락 크기 · 눌러서 바꾼다', async () => {
      const s = await newSession('EB 폰')
      const pg = P.pg; await goto(pg, s.id)
      must((await pg.evaluate(() => document.querySelector('.app')?.className ?? '')).includes('phone'), '폰 판이 아니다')
      must((await chip(pg))?.t === '수동', '폰 칩 ' + JSON.stringify(await chip(pg)))
      await openMode(pg, true)
      const r = await rows(pg)
      must(JSON.stringify(r.map((x) => x.t)) === JSON.stringify(MODE_NAMES), '폰 목록 ' + JSON.stringify(r.map((x) => x.t)))
      const fit = await pg.evaluate(() => { const p = document.querySelector('.cpop.modepop').getBoundingClientRect(); return { top: Math.round(p.top), right: Math.round(p.right), bottom: Math.round(p.bottom), sw: document.documentElement.scrollWidth, vh: innerHeight } })
      must(fit.top >= 0 && fit.right <= 390 && fit.bottom <= fit.vh && fit.sw <= 390 && r.every((x) => x.w <= 390 && x.h >= 32), '폰 치수 ' + JSON.stringify({ fit, rows: r.map((x) => [x.w, x.h]) }))
      await shot(pg, 'u2-폰-권한모드-목록')
      await pg.tap('.cpop.modepop .prow2[data-mode="auto"]')
      await until(async () => (await chatOf(s.id)).info.permissionMode === 'auto', '폰에서 «자동» 고르기')
      await until(async () => (await chip(pg))?.t === '자동', '폰 칩이 «자동» 으로')
      must(!P.errs.length, '화면 오류 ' + P.errs.join(' | '))
    })
    await check('U3 Auto 가 거부돼 수동으로 떨어진 세션 — 대화에 알림 줄 · 칩은 실제 모드 «수동»', async () => {
      const pg = D.pg; await goto(pg, K.reject)
      const note = await pg.evaluate(() => [...document.querySelectorAll('.chat-body *')].filter((e) => e.children.length === 0 && /«자동» 모드를 못 켜 «수동» 으로 돌려요/.test(e.textContent ?? '')).length)
      must(note >= 1, '알림 줄이 화면에 없다')
      must((await chip(pg))?.t === '수동', '칩 ' + JSON.stringify(await chip(pg)))
      await shot(pg, 'u3-데스크톱-자동-거부-수동으로')
      await goto(P.pg, K.reject); await shot(P.pg, 'u3-폰-자동-거부-수동으로')
    })
    await check('U4 도는 중에 모드 바꾸기 — 칩에 «바로 적용» · 알림 글 «바로 적용됐어요» · 턴이 끝나면 표시가 걷힌다 / 못 넣으면 «적용 중»', async () => {
      const s = await newSession('EB 화면 바로'); const pg = D.pg; await goto(pg, s.id)
      await say(s.id, '모드대로:Write 느리게 해 줘'); await stateIs(s.id, 'running'); await wait(400)
      await openMode(pg, false); await pg.click('.cpop.modepop .prow2[data-mode="acceptEdits"]')
      await until(async () => { const c = await chip(pg); return c?.t === '편집 자동 수락' && c.pend === '바로 적용' }, '칩의 «바로 적용»', 4000)
      must(await pg.evaluate(() => /바로 적용됐어요/.test(document.body.textContent ?? '')), '알림 글이 없다')
      await shot(pg, 'u4-데스크톱-도는중-모드-바로적용')
      await stateIs(s.id, 'done'); await until(async () => (await chip(pg))?.pend === null, '턴 뒤 표시가 걷힌다')
      // 못 넣는 경우(항상 허용) — «적용 중»
      const s2 = await newSession('EB 화면 다음'); await goto(pg, s2.id)
      await say(s2.id, '모드대로:Bash 느리게 해 줘'); await stateIs(s2.id, 'running'); await wait(400)
      await openMode(pg, false); await pg.click('.cpop.modepop .prow2[data-mode="bypassPermissions"]')
      await until(async () => { const c = await chip(pg); return c?.t === '항상 허용' && c.pend === '적용 중' }, '칩의 «적용 중»', 4000)
      await shot(pg, 'u4-데스크톱-도는중-모드-다음턴부터')
      await stateIs(s2.id, 'done')
      // 폰 — 같은 일을 손가락으로
      const s3 = await newSession('EB 폰 바로'); await goto(P.pg, s3.id)
      await say(s3.id, '모드대로:Write 느리게 해 줘'); await stateIs(s3.id, 'running'); await wait(400)
      await openMode(P.pg, true); await P.pg.tap('.cpop.modepop .prow2[data-mode="acceptEdits"]')
      await until(async () => { const c = await chip(P.pg); return c?.t === '편집 자동 수락' && c.pend === '바로 적용' }, '폰 칩의 «바로 적용»', 4000)
      await shot(P.pg, 'u4-폰-도는중-모드-바로적용')
      await stateIs(s3.id, 'done')
    })
    await check('U5 승인 시간 초과가 남긴 줄이 그 루틴 세션에 보인다(데스크톱 · 폰)', async () => {
      for (const [x, nm] of [[D, '데스크톱'], [P, '폰']]) {
        await goto(x.pg, K.routine)
        must(await x.pg.evaluate(() => /승인 시간 초과 · Bash — 2초 동안 답이 없어 거절했어요/.test(document.querySelector('.chat-body')?.textContent ?? '')), `${nm} 대화에 줄이 없다`)
        must((await x.pg.evaluate(() => document.documentElement.scrollWidth)) <= (nm === '폰' ? 390 : 1440), `${nm} 가로로 샌다`)
        await shot(x.pg, `u5-${nm}-승인-시간-초과-줄`)
      }
    })
    await check('U6 모드를 안 정한 세션이 «새 채팅 기본 권한» 을 따라 돌면 — 칩은 그 모드, 팝업에 까닭 한 줄 · «수동» 을 고르면 바로 수동', async () => {
      sw({ inherit: 'auto' })
      const st0 = await api('/state')
      const setDefault = (mode) => api('/defaults', { model: st0.defaults.model, effort: st0.defaults.effort, agent: 'claude', permissionMode: mode })
      try {
        const s = await newSession('EB 화면 기본따름'); await setDefault('acceptEdits')
        await say(s.id, '안녕'); await stateIs(s.id, 'done')
        const pg = D.pg; await goto(pg, s.id)
        must((await chip(pg))?.t === '편집 자동 수락', '칩이 실제 모드가 아니다 ' + JSON.stringify(await chip(pg)))
        await openMode(pg, false)
        must(/«새 채팅 기본 권한» 대로 «편집 자동 수락»/.test(await pg.textContent('.cpop.modepop')), '까닭 줄이 없다 · ' + (await pg.textContent('.cpop.modepop')).slice(0, 200))
        must((await rows(pg)).find((x) => x.on)?.v === 'acceptEdits', '고른 줄이 실제 모드가 아니다')
        await shot(pg, 'u6-데스크톱-기본-권한을-따라')
        await pg.click('.cpop.modepop .prow2[data-mode="default"]')
        await until(async () => (await chip(pg))?.t === '수동', '«수동» 을 고르면 바로 수동')
        must((await chatOf(s.id)).info.liveMode === 'default', '워커가 수동이 아니다')
      } finally { sw(null); await setDefault('default') }
    })
    await check('U7 Codex 세션 — 칩은 샌드박스 값 · 팝업에 권한 모드 다섯이 없다(«자동» 이 새지 않는다)', async () => {
      for (const [x, phone] of [[D, false], [P, true]]) {
        await goto(x.pg, K.codex)
        const c = await chip(x.pg); must(c?.t === '읽기만' && c.mode === null, 'Codex 칩 ' + JSON.stringify(c))
        await openMode(x.pg, phone)
        const t = await x.pg.textContent('.cpop.modepop'); must((await rows(x.pg)).length === 0 && /샌드박스/.test(t) && !/자동|수동|항상 허용/.test(t), 'Codex 팝업 ' + t)
        await x.pg.keyboard.press('1'); await wait(200); must((await chatOf(K.codex)).info.permissionMode === undefined, '숫자 키가 Codex 세션의 모드를 바꿨다')
        if (!phone) await shot(x.pg, 'u7-데스크톱-codex-샌드박스'); else await shot(x.pg, 'u7-폰-codex-샌드박스')
        await x.pg.keyboard.press('Escape')
      }
    })
    await check('U8 설정 › 세션 · 사용량 — «승인 시간 초과» 줄(데스크톱 · 폰) · 고르면 호스트에 저장된다 / 설정 › Claude 의 기본 권한 목록도 다섯', async () => {
      const pg = D.pg; await goto(pg, K.ui)
      await pg.click('.col.side.left .nav:has-text("설정")'); await pg.waitForSelector('.modal.setw', { timeout: 5000 }); await pg.click('.snav .nv:has-text("세션 · 사용량")'); await pg.waitForSelector('select[data-approval-timeout]', { timeout: 4000 })
      const row = await pg.evaluate(() => { const sel = document.querySelector('select[data-approval-timeout]'); const r = sel.closest('.setr'); return { v: sel.value, opts: [...sel.options].map((o) => o.textContent), t: r?.querySelector('.tx')?.textContent ?? '', inBox: sel.getBoundingClientRect().right <= r.getBoundingClientRect().right + 1 } })
      must(row.v === '0' && JSON.stringify(row.opts) === JSON.stringify(['5분', '10분', '30분', '1시간', '끄기 — 끝까지 기다림']) && /승인 시간 초과/.test(row.t) && /내가 보낸 턴은 끝까지/.test(row.t) && row.inBox, '설정 줄 ' + JSON.stringify(row))
      await shot(pg, 'u8-데스크톱-설정-승인-시간-초과')
      await pg.selectOption('select[data-approval-timeout]', '30'); await until(async () => (await api('/state')).defaults.approvalTimeoutMinutes === 30, '30분 저장')
      await pg.selectOption('select[data-approval-timeout]', '0'); await until(async () => (await api('/state')).defaults.approvalTimeoutMinutes === 0, '끄기로 되돌리기')
      await pg.click('.snav .nv:has-text("Claude")'); await wait(400)
      const perm = await pg.evaluate(() => { const sel = [...document.querySelectorAll('.setw select')].find((x) => [...x.options].some((o) => /편집 자동 수락/.test(o.textContent ?? ''))); return sel ? { v: sel.value, opts: [...sel.options].map((o) => (o.textContent ?? '').split(' — ')[0]) } : null })
      must(perm && perm.v === 'default' && JSON.stringify(perm.opts) === JSON.stringify(MODE_NAMES), '설정의 기본 권한 목록 ' + JSON.stringify(perm))
      await shot(pg, 'u8-데스크톱-설정-기본-권한')
      await pg.keyboard.press('Escape'); await wait(200)
      // 폰 — 설정을 열어 같은 줄을 본다
      const ph = P.pg; await ph.goto(`${base}/#bot=${botId}&s=${K.ui}`); await ph.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(400)
      await ph.evaluate(() => window.dispatchEvent(new CustomEvent('fb:settings', { detail: 'sessions' })))   // 설정의 그 칸을 바로 여는 앱 안 신호(알림·안내가 쓰는 길)
      await ph.waitForSelector('select[data-approval-timeout]', { timeout: 5000 }); await wait(300)
      const prow = await ph.evaluate(() => { const sel = document.querySelector('select[data-approval-timeout]'); sel.scrollIntoView({ block: 'center' }); const b = sel.getBoundingClientRect(); return { v: sel.value, l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height), sw: document.documentElement.scrollWidth } })
      must(prow.v === '0' && prow.l >= 0 && prow.r <= 390 && prow.sw <= 390 && prow.h >= 28, '폰 설정 줄 ' + JSON.stringify(prow))
      await wait(200); await shot(ph, 'u8-폰-설정-승인-시간-초과')
      await ph.reload(); await ph.waitForSelector('.composer .cin', { timeout: 15000 })   // 설정 창을 닫는다 — 다음 검사가 같은 주소로 가면 다시 읽지 않는다
      must(!D.errs.length && !P.errs.length, '화면 오류 ' + [...D.errs, ...P.errs].join(' | '))
    })
    await check('U9 루틴 편집 — 승인 수준에 «자동» 선택지(데스크톱 · 폰) · 고르고 저장하면 그 루틴이 approve: auto', async () => {
      await putRoutines([{ name: 'EB 화면 루틴', cron: '0 9 * * *', prompt: '바뀐 파일을 훑어 줘', push: false }])
      for (const [x, phone] of [[D, false], [P, true]]) {
        const pg = x.pg; await pg.goto(`${base}/#bot=${botId}&s=${K.ui}`); await pg.reload(); await pg.waitForSelector('.composer .cin', { timeout: 15000 }); await wait(400)
        if (phone) { await pg.tap('.tabbar [data-tab="files"]'); await wait(500) }
        // 오른쪽 패널(2026-11-14) — 루틴 줄은 패널 도구 막대의 «루틴 N» 단추가 여는 목록에 있다
        await pg.click('.panel .ptools .tb.rt'); await pg.waitForSelector('.spop.rtpop button.kv', { timeout: 3000 }); await wait(300)
        const kv = () => pg.evaluate(() => { const b = [...document.querySelectorAll('.spop.rtpop button.kv')].find((e) => /EB 화면 루틴/.test(e.textContent ?? '')); if (b) b.click(); return !!b })
        must(await kv(), '도구 막대의 루틴 목록에 루틴 줄이 없다')
        await pg.waitForSelector('.modal.rted [data-approve="auto"]', { timeout: 5000 }); await wait(300)
        const b = await pg.evaluate(() => { const list = [...document.querySelectorAll('[data-approve]')].map((e) => ({ v: e.dataset.approve, on: e.classList.contains('on'), t: e.querySelector('b')?.textContent ?? '', r: Math.round(e.getBoundingClientRect().right), w: Math.round(e.getBoundingClientRect().width) })); document.querySelector('[data-approve="auto"]').scrollIntoView({ block: 'center' }); return { list, sw: document.documentElement.scrollWidth, vw: innerWidth } })
        must(JSON.stringify(b.list.map((e) => e.v)) === JSON.stringify(['always', 'auto', 'folder', 'readonly']) && b.list.find((e) => e.v === (phone ? 'auto' : 'always')).on && b.list.filter((e) => e.on).length === 1 && /자동/.test(b.list.find((e) => e.v === 'auto').t), '선택지(데스크톱은 기본 «바로», 폰은 데스크톱이 저장한 «자동») ' + JSON.stringify(b.list))
        if (phone) { await pg.tap('[data-approve="folder"]'); await wait(200) }
        must(b.list.every((e) => e.r <= b.vw && e.w >= 120) && b.sw <= b.vw, '선택지가 화면 밖으로 ' + JSON.stringify(b))
        await (phone ? pg.tap('[data-approve="auto"]') : pg.click('[data-approve="auto"]')); await wait(250)
        must(await pg.evaluate(() => document.querySelector('[data-approve="auto"]').classList.contains('on')), '«자동» 이 안 골라졌다')
        await shot(pg, `u9-${phone ? '폰' : '데스크톱'}-루틴-승인-자동`)
        if (!phone) {
          await pg.click('.modal.rted [data-rt="save"]')
          await until(async () => (await api(`/bots/${botId}/routines`)).find((r) => r.name === 'EB 화면 루틴')?.approve === 'auto', '저장 뒤 approve: auto', 5000)
        } else await pg.evaluate(() => { const c = [...document.querySelectorAll('.modal.rted .modal-f button')].find((x) => /취소/.test(x.textContent ?? '')); c?.click() })
        await wait(300)
      }
      must(!D.errs.length && !P.errs.length, '화면 오류 ' + [...D.errs, ...P.errs].join(' | '))
    })
    await D.pg.close(); await P.pg.close()
  }
  // 뒷정리 — 스위치를 걷고, 설정을 되돌리고, 만든 루틴·세션을 지운다
  sw(null)
  try { await setTimeoutMin(0) } catch { /* 옛 판에는 이 길이 없다 */ }
  try { await api(`/bots/${botId}/routines`, { routines: routines0 }, 'PUT') } catch { /* */ }
  for (const sid of made) { try { await raw(`/sessions/${sid}`, undefined, 'DELETE') } catch { /* */ } }
  void botAbs
}

// ── 혼자 돌 때 ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
  const only = arg('only', '')
  const root = realpathSync(mkdtempSync(join('/tmp', 'fb-eb-')))
  const data = mkdtempSync(join(tmpdir(), 'fb-ebdata-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-ebhome-')), claudeCfg = mkdtempSync(join(tmpdir(), 'fb-ebcfg-'))
  for (const d of ['1. Inbox', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n'); writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), '# Rondo\n\n본문\n'); writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 할 일\n- [ ] 하나\n')
  const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_NO_AUTH: '1', FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', CLAUDE_CONFIG_DIR: claudeCfg }
  const PORT = Number(arg('port', 7473))
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
    await ebPerm({ base, root, data, claudeCfg, botId: bot.id, botAbs: join(root, '3. Area/제품_Rondo'), br, shots: shots || undefined,
      check: async (name, f) => { if (only && !only.split(',').some((p) => name.startsWith(p))) return; try { await f(); green++; console.log('✓', name) } catch (e) { red++; console.log('✗', name, '\n    ', String(e.message ?? e).split('\n')[0].slice(0, 500)) } } })
  } catch (e) { red++; console.error('✗ 검사 틀이 죽었다', e.stack ?? e) } finally {
    try { await br?.close() } catch { /* */ } try { host.kill() } catch { /* */ }
    for (const d of [root, data, fbHome, claudeCfg]) { try { rmSync(d, { recursive: true, force: true }) } catch { /* */ } }
  }
  console.log(`\nEB 검사 — 초록 ${green} · 빨강 ${red}`)
  process.exit(red ? 1 : 0)
}
