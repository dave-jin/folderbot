import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Registry } from './registry'
import { ORCH_ID } from './registry'
import type { Host } from './host'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { relUnder } from '../core/paths'
import { stripRuntime, type RoutineDef } from '../core/types'
import { confirmLine, describeCron, formatNext, parseWhen } from '../core/when'

interface Rpc { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Record<string, unknown> }
type Tool = { name: string; description: string; inputSchema: Record<string, unknown> }
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required })

/** 주기를 못 읽었을 때 봇에게 돌려줄 말 — **지어내지 말고 사람에게 물어라** 를 분명히 한다 */
function whenProblem(w: Exclude<ReturnType<typeof parseWhen>, { ok: true }>): Record<string, unknown> {
  if ('ask' in w) return { ok: false, ask: w.ask.q, options: w.ask.options.map((o) => ({ label: o.label, when: o.text })), note: '뜻이 갈려서 저장하지 않았어요. 사람에게 물어보고 고른 쪽을 사람 말로 다시 주세요 — cron 식을 지어내지 마세요' }
  return { ok: false, error: w.error, examples: w.examples, note: 'cron 식을 지어내지 말고 사람 말로 다시 주세요' }
}
/** 루틴을 `.bot.yml` 에 저장하고 스케줄을 다시 건다 — 화면용 값(lastError·nextRun)은 털어서 넣는다 */
function saveRoutines(reg: Registry, host: Host, abs: string, routines: RoutineDef[]): void {
  const cfg = reg.botConfig(abs)
  cfg.routines = routines.map(stripRuntime) as never
  reg.saveBotConfig(abs, cfg)
  host.afterBotsChanged()
}

/** 도구 설명에 **「주기는 사람 말로 적는다」**를 분명히 써 둔다 — 안 쓰면 봇이 cron 식을 지어낸다(AA-5) */
const WHEN_DESC = '언제 돌릴지 **사람 말로** 적는다 — 「매일 저녁 8시」·「평일 아침 9시 반」·「두 시간마다」·「매달 1일 아침 9시」. 🔴 cron 식을 지어내지 마라. 뜻이 갈리는 값(「20」)은 저장되지 않고 되묻는 답이 온다 — 그때 사람에게 물어라.'

const COMMON: Tool[] = [
  { name: 'bots_list', description: '활성 봇 목록과 상태(세션 수·확인 대기)를 돌려준다.', inputSchema: obj({}) },
  { name: 'bot_status', description: '봇 하나의 세션 목록·상태·마지막 활동.', inputSchema: obj({ bot: { type: 'string', description: '봇 이름 또는 id' } }, ['bot']) },
  { name: 'bot_sessions', description: '봇의 세션 하나의 최근 대화(요약)를 읽는다.', inputSchema: obj({ bot: { type: 'string' }, session: { type: 'string', description: '세션 이름 또는 id (생략 시 최근)' }, limit: { type: 'number' } }, ['bot']) },
  { name: 'vault_tree', description: '루트 폴더 구조. dir(상대 경로)·depth.', inputSchema: obj({ dir: { type: 'string' }, depth: { type: 'number' } }) },
  { name: 'vault_search', description: '파일·폴더 이름 부분일치 검색 (최근 수정순).', inputSchema: obj({ query: { type: 'string' }, limit: { type: 'number' } }, ['query']) },
  { name: 'rules_get', description: '폴더 규칙(역할·naming·하네스 판정)을 돌려준다.', inputSchema: obj({}) },
  // 문서 창 (C · 2026-09-19) — 사용자가 보고 있는 화면의 문서 창에 연다 / 그 기기의 Finder 로 보여 준다. ⚠ 한 턴에 한 번만 먹는다(화면이 억제)
  { name: 'rondo_open', description: '사용자 화면의 문서 창에 파일을 연다(pdf·이미지·md). path 는 이 봇 폴더 기준 상대 경로 또는 볼트 안 절대 경로. 한 턴에 한 번만 열린다.', inputSchema: obj({ path: { type: 'string' } }, ['path']) },
  { name: 'rondo_reveal', description: '사용자가 보고 있는 기기의 Finder 에서 파일 위치를 보여 준다(호스트가 아니라 그 기기). path 는 봇 폴더 기준 상대 경로 또는 볼트 안 절대 경로.', inputSchema: obj({ path: { type: 'string' } }, ['path']) },
  /**
   * AA-5 · 루틴 도구 (2026-09-22 Dave). 봇은 자기 폴더에 어떤 루틴이 걸렸는지조차 몰랐다.
   * 🔴 **approve 는 일부러 없다.** `approve: always` 는 `approveToMode()` 를 거쳐 `bypassPermissions` 가 된다 —
   *    봇이 스스로 권한을 올리는 길을 열지 않는다. 승인 수준은 사람이 UI 에서만 바꾼다.
   */
  { name: 'routine_list', description: '이 폴더에 걸린 루틴 목록 — 주기(사람 말)·다음 실행·켜짐·마지막 오류. 루틴이 안 도는 것 같으면 여기부터 본다.', inputSchema: obj({}) },
  { name: 'routine_add', description: `이 폴더에 루틴을 새로 건다. when 은 ${WHEN_DESC} prompt 에는 «무엇을 확인하고, 변화가 없으면 어떻게 하라» 까지 적는다. 승인 수준(approve)은 여기서 못 바꾼다 — 사람이 화면에서 정한다.`, inputSchema: obj({ name: { type: 'string', description: '루틴 이름(이 폴더 안에서 유일)' }, when: { type: 'string', description: '사람 말로 적은 주기' }, prompt: { type: 'string', description: '루틴이 돌 때 보낼 말' }, push: { type: 'boolean', description: '끝나면 폰으로 알릴지' } }, ['name', 'when', 'prompt']) },
  { name: 'routine_update', description: `루틴을 고친다. 준 값만 바뀐다. when 은 ${WHEN_DESC} 되돌릴 수 있게 **직전 값**을 결과에 담아 준다. 승인 수준(approve)은 여기서 못 바꾼다.`, inputSchema: obj({ name: { type: 'string' }, when: { type: 'string' }, prompt: { type: 'string' }, push: { type: 'boolean' }, enabled: { type: 'boolean', description: '끄면 지우지 않고 잠시 멈춘다' } }, ['name']) },
  { name: 'routine_remove', description: '루틴을 지운다. 되돌릴 수 없으므로 **직전 값**을 결과에 담아 준다 — 잘못 지웠으면 그 값으로 routine_add 하면 된다.', inputSchema: obj({ name: { type: 'string' } }, ['name']) },
  { name: 'todo_add', description: '이 봇 폴더의 todo.md 에 항목을 추가한다. 봇이 적은 줄로 표시된다.', inputSchema: obj({ title: { type: 'string' }, desc: { type: 'string' }, for_user: { type: 'boolean', description: '사용자가 할 일이면 true (알림이 간다)' } }, ['title']) }
]
const ORCH: Tool[] = [
  { name: 'bots_candidates', description: '봇 후보 폴더(규칙의 active 글롭에 맞는 폴더)를 최근 수정순으로. 하네스 유무·활성 여부 포함.', inputSchema: obj({}) },
  { name: 'bot_start', description: '폴더에서 봇을 시작한다. 하네스가 없으면 깔아 준다. rel 은 루트 기준 상대 경로.', inputSchema: obj({ rel: { type: 'string' } }, ['rel']) },
  { name: 'bot_stop', description: '봇을 정지(휴면)한다. 기록은 남는다.', inputSchema: obj({ bot: { type: 'string' } }, ['bot']) },
  { name: 'bots_reorder', description: '레일(폴더 목록)의 봇 순서를 정한다. order 는 위에서부터 놓을 rel 목록 — 안 준 봇은 기존 차례로 뒤에 붙는다. 모르는 rel 이 하나라도 있으면 실패하고 순서는 그대로다. 사람이 끌어 놓은 봇(bots_list 의 orderedBy=user)은 자리를 지킨다. restore:true 는 처음 순서로 되돌린다.', inputSchema: obj({ order: { type: 'array', items: { type: 'string' }, description: '루트 기준 상대 경로(rel) 목록, 위에서부터' }, restore: { type: 'boolean', description: '처음 순서로 되돌리기' } }) },
  { name: 'bot_retire', description: '봇 폴더를 archive 로 옮기고 은퇴시킨다. ⚠ 사람의 승인 뒤에만.', inputSchema: obj({ bot: { type: 'string' } }, ['bot']) },
  { name: 'folder_create', description: '활성 범주(section)에 새 폴더를 만들고 하네스를 깐다. naming 규칙 적용. ⚠ 사람의 승인 뒤에만.', inputSchema: obj({ section: { type: 'string', description: '예: "2. Projects"' }, name: { type: 'string' }, start: { type: 'boolean', description: '만든 뒤 봇도 시작' } }, ['section', 'name']) },
  { name: 'bot_send', description: '봇에게 지시를 보낸다 — 새 세션을 만들거나(session 생략) 기존 세션에 이어 보낸다. 결과는 bot_sessions 로 본다.', inputSchema: obj({ bot: { type: 'string' }, text: { type: 'string' }, session: { type: 'string' }, name: { type: 'string', description: '새 세션 이름' } }, ['bot', 'text']) },
  { name: 'inbox_list', description: 'inbox 역할 폴더의 항목(폴더·파일)을 나열한다.', inputSchema: obj({}) },
  { name: 'folder_move', description: '루트 안에서 폴더·파일을 옮긴다(되돌리기 스냅샷 남김). ⚠ 사람의 승인 뒤에만.', inputSchema: obj({ from: { type: 'string' }, to: { type: 'string' } }, ['from', 'to']) }
]

export function mcpTools(botId: string): Tool[] { return botId === ORCH_ID ? [...COMMON, ...ORCH] : COMMON }

export async function handleMcp(host: Host, botId: string, req: IncomingMessage, res: ServerResponse, body: string, sid = ''): Promise<void> {
  let msg: Rpc
  try { msg = JSON.parse(body) } catch { res.writeHead(400).end(); return }
  const reply = (result: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })) }
  const error = (code: number, message: string) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code, message } })) }
  if (msg.method === 'initialize') return reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'folderbot', version: host.version } })
  if (msg.method === 'notifications/initialized' || msg.method === 'ping') { res.writeHead(msg.id === undefined ? 202 : 200, { 'content-type': 'application/json' }); res.end(msg.id === undefined ? '' : JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })); return }
  if (msg.method === 'tools/list') return reply({ tools: mcpTools(botId) })
  if (msg.method === 'tools/call') {
    const name = String(msg.params?.name ?? ''); const args = (msg.params?.arguments ?? {}) as Record<string, unknown>
    if (!mcpTools(botId).some((t) => t.name === name)) return error(-32601, `이 봇은 ${name} 을 쓸 수 없어요`)
    try {
      const out = await callTool(host, botId, name, args, sid)
      return reply({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] })
    } catch (e) { return reply({ content: [{ type: 'text', text: `오류: ${(e as Error).message}` }], isError: true }) }
  }
  return error(-32601, 'method not found')
}

async function callTool(host: Host, botId: string, name: string, a: Record<string, unknown>, sid = ''): Promise<unknown> {
  const reg: Registry = host.registry
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
  const findBot = (q: string) => reg.bots().find((b) => b.id === q || b.name === q || b.rel === q || b.name.toLowerCase() === q.toLowerCase())
  switch (name) {
    case 'bots_list': return reg.bots().map((b, i) => { const ss = host.sessions.list(b.id); return { id: b.id, name: b.name, displayName: b.displayName, rel: b.rel, ...(b.orchestrator ? {} : { order: i - 1, orderedBy: b.orderedBy ?? null }), sessions: ss.length, awaiting: ss.filter((x) => x.state === 'awaiting_input').length, running: ss.filter((x) => x.state === 'running').length, lastActivity: ss[0]?.lastActivity ?? null } })
    case 'bots_candidates': return reg.candidates().map((c) => ({ rel: c.rel, section: c.section, harness: c.harness, active: c.active, modified: new Date(c.mtime).toISOString() }))
    case 'bot_status': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); return host.sessions.list(b.id).map((x) => ({ id: x.id, name: x.name, state: x.state, lastActivity: new Date(x.lastActivity).toISOString(), pending: x.pending.map((p) => p.displayName) })) }
    case 'bot_sessions': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); const list = host.sessions.list(b.id); const sess = s('session') ? list.find((x) => x.id === s('session') || x.name === s('session')) : list[0]; if (!sess) return '세션이 없어요'; const items = host.sessions.items(sess.id).slice(-(Number(a.limit) || 30)); return items.map((it) => it.kind === 'user' ? `[사용자] ${it.text}` : it.kind === 'assistant' ? `[봇] ${it.text}` : it.kind === 'tool' ? `[도구] ${it.name} ${it.summary}` : it.kind === 'result' ? `[턴 끝] ${it.ok ? 'ok' : '오류 ' + (it.error ?? '')}` : it.kind === 'system' ? `[시스템] ${it.text}` : '').filter(Boolean).join('\n') }
    case 'bot_start': { const b = reg.start(s('rel')); host.afterBotsChanged(); return `시작했어요: ${b.name} (${b.rel})` }
    case 'bots_reorder': {
      const order = Array.isArray(a.order) ? (a.order as unknown[]).map(String) : []
      const restore = a.restore === true
      if (!restore && !order.length) throw new Error('order 에 rel 을 하나 이상 주거나 restore:true 로 부르세요')
      reg.reorderByAgent(order, restore)
      const now = reg.bots().filter((b) => !b.orchestrator)
      return `${restore ? '처음 순서로 되돌림' : '순서 바꿈'}: ${now.map((b, i) => `${i + 1}. ${b.rel}${b.orderedBy === 'user' ? ' (사람이 정한 자리)' : ''}`).join(' · ')}`
    }
    case 'bot_stop': { const b = findBot(s('bot')); if (!b || b.orchestrator) throw new Error('정지할 수 없는 봇'); reg.stop(b.id); host.afterBotsChanged(); return `정지: ${b.name}` }
    case 'bot_retire': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); const to = reg.retire(b.id); host.afterBotsChanged(); return `은퇴 · ${to} 로 옮겼어요` }
    case 'folder_create': { const rel = reg.createFolder(s('section'), s('name')); let msg = `만들었어요: ${rel} (하네스 설치됨)`; if (a.start) { const b = reg.start(rel); host.afterBotsChanged(); msg += ` · 봇 시작: ${b.name}` } return msg }
    case 'bot_send': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); const sid = host.sendToBot(b, s('text'), s('session') || undefined, s('name') || undefined, botId); return `보냈어요 · 세션 ${sid}` }
    case 'inbox_list': return reg.inboxItems().map((i) => ({ rel: i.rel, dir: i.dir, modified: new Date(i.mtime).toISOString() }))
    case 'folder_move': { reg.move(s('from'), s('to')); host.afterBotsChanged(); return `옮겼어요: ${s('from')} → ${s('to')} (되돌리기 가능)` }
    case 'vault_tree': return host.tree(s('dir'), Number(a.depth) || 2)
    case 'vault_search': return host.search(s('query'), Number(a.limit) || 40)
    case 'rules_get': return reg.rules
    case 'rondo_open': case 'rondo_reveal': {
      const b = reg.bot(botId); if (!b) throw new Error('봇을 못 찾았어요')
      const raw = s('path'); if (!raw) throw new Error('path 가 비었어요')
      const abs = resolve(isAbsolute(raw) ? raw : join(b.abs, raw))
      if (relUnder(reg.root, abs) === null && !(b.repo && relUnder(b.repo, abs) !== null)) throw new Error('볼트 밖 경로예요 — 문서 창은 볼트 안 파일만 열어요')
      if (!existsSync(abs)) throw new Error(`없는 파일: ${raw}`)
      const rel = relative(b.abs, abs)
      const turn = host.sessions.get(sid)?.turnStartedAt ?? 0
      host.broadcast({ ev: 'doc', botId: b.id, sid, rel, action: name === 'rondo_open' ? 'open' : 'reveal', turn, device: host.sessions.get(sid)?.lastClient?.device })   // J-3 · 요청이 온 기기만 연다
      return name === 'rondo_open' ? `문서 창에 열었어요: ${rel}` : `기기의 Finder 로 보여 드렸어요: ${rel}`
    }
    /* ── AA-5 · 루틴 (2026-09-22) ─────────────────────────────────────────
       🔴 저장 경로는 **기존 그대로** `.bot.yml` 이고, 저장 뒤 `afterBotsChanged()` 로 스케줄을 다시 건다.
          새 저장 포맷을 만들지 않는다 — 두 벌이 되는 순간 한쪽은 반드시 낡는다. */
    case 'routine_list': {
      const b = reg.bot(botId); if (!b) throw new Error('봇을 못 찾았어요')
      return host.routines.decorate(b.id, b.routines).map((r) => ({
        name: r.name, when: describeCron(r.cron), cron: r.cron, prompt: r.prompt,
        enabled: r.enabled !== false, push: !!r.push, approve: r.approve ?? 'readonly',
        next: r.nextRun ? formatNext(new Date(r.nextRun)) : null,
        error: r.lastError ?? null,
      }))
    }
    case 'routine_add': {
      const b = reg.bot(botId); if (!b) throw new Error('봇을 못 찾았어요')
      const name = s('name').trim(); if (!name) throw new Error('루틴 이름을 적어 주세요')
      if (b.routines.some((r) => r.name === name)) throw new Error(`「${name}」 은 이미 있어요 — 고치려면 routine_update 를 쓰세요`)
      const w = parseWhen(s('when'))
      if (!w.ok) return whenProblem(w)
      const def: RoutineDef = { name, cron: w.cron, prompt: s('prompt'), ...(a.push === undefined ? {} : { push: !!a.push }) }
      saveRoutines(reg, host, b.abs, [...b.routines, def])
      return { ok: true, name, when: w.text, confirm: confirmLine(w.cron), note: '승인 수준(approve)은 사람이 화면에서 정해요 — 기본은 계획만 세우는 단계입니다' }
    }
    case 'routine_update': {
      const b = reg.bot(botId); if (!b) throw new Error('봇을 못 찾았어요')
      const name = s('name').trim()
      const cur = b.routines.find((r) => r.name === name); if (!cur) throw new Error(`「${name}」 이라는 루틴이 없어요`)
      const before = stripRuntime(cur)
      const patch: Partial<RoutineDef> = {}
      if (a.when !== undefined) { const w = parseWhen(s('when')); if (!w.ok) return whenProblem(w); patch.cron = w.cron }
      if (a.prompt !== undefined) patch.prompt = s('prompt')
      if (a.push !== undefined) patch.push = !!a.push
      if (a.enabled !== undefined) patch.enabled = !!a.enabled
      if (!Object.keys(patch).length) throw new Error('바꿀 값을 하나는 주세요 (when · prompt · push · enabled)')
      const next = { ...before, ...patch }
      saveRoutines(reg, host, b.abs, b.routines.map((r) => (r.name === name ? next : r)))
      // 🔴 prompt 교체는 되돌릴 수 없다 — 직전 값을 담아 준다
      return { ok: true, name, when: describeCron(next.cron), confirm: confirmLine(next.cron), before }
    }
    case 'routine_remove': {
      const b = reg.bot(botId); if (!b) throw new Error('봇을 못 찾았어요')
      const name = s('name').trim()
      const cur = b.routines.find((r) => r.name === name); if (!cur) throw new Error(`「${name}」 이라는 루틴이 없어요`)
      const before = stripRuntime(cur)
      saveRoutines(reg, host, b.abs, b.routines.filter((r) => r.name !== name))
      // 🔴 되돌릴 수 없으므로 직전 값을 그대로 돌려준다 — 이 값으로 routine_add 하면 복구된다
      return { ok: true, removed: name, before, undo: '잘못 지웠으면 before 의 값으로 routine_add 하면 돌아와요' }
    }
    case 'todo_add': { const b = reg.bot(botId); if (!b) throw new Error('봇을 못 찾았어요'); host.todoAdd(b, s('title'), s('desc'), 'bot', !!a.for_user); return '추가했어요' }
  }
  throw new Error('unknown tool')
}
