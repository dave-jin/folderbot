import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Registry } from './registry'
import { ORCH_ID } from './registry'
import type { Host } from './host'

interface Rpc { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Record<string, unknown> }
type Tool = { name: string; description: string; inputSchema: Record<string, unknown> }
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required })

const COMMON: Tool[] = [
  { name: 'bots_list', description: '활성 봇 목록과 상태(세션 수·확인 대기)를 돌려준다.', inputSchema: obj({}) },
  { name: 'bot_status', description: '봇 하나의 세션 목록·상태·마지막 활동.', inputSchema: obj({ bot: { type: 'string', description: '봇 이름 또는 id' } }, ['bot']) },
  { name: 'bot_sessions', description: '봇의 세션 하나의 최근 대화(요약)를 읽는다.', inputSchema: obj({ bot: { type: 'string' }, session: { type: 'string', description: '세션 이름 또는 id (생략 시 최근)' }, limit: { type: 'number' } }, ['bot']) },
  { name: 'vault_tree', description: '루트 폴더 구조. dir(상대 경로)·depth.', inputSchema: obj({ dir: { type: 'string' }, depth: { type: 'number' } }) },
  { name: 'vault_search', description: '파일·폴더 이름 부분일치 검색 (최근 수정순).', inputSchema: obj({ query: { type: 'string' }, limit: { type: 'number' } }, ['query']) },
  { name: 'rules_get', description: '폴더 규칙(역할·naming·하네스 판정)을 돌려준다.', inputSchema: obj({}) },
  { name: 'todo_add', description: '이 봇 폴더의 todo.md 에 항목을 추가한다. 봇이 적은 줄로 표시된다.', inputSchema: obj({ title: { type: 'string' }, desc: { type: 'string' }, for_user: { type: 'boolean', description: '사용자가 할 일이면 true (알림이 간다)' } }, ['title']) }
]
const ORCH: Tool[] = [
  { name: 'bots_candidates', description: '봇 후보 폴더(규칙의 active 글롭에 맞는 폴더)를 최근 수정순으로. 하네스 유무·활성 여부 포함.', inputSchema: obj({}) },
  { name: 'bot_start', description: '폴더에서 봇을 시작한다. 하네스가 없으면 깔아 준다. rel 은 루트 기준 상대 경로.', inputSchema: obj({ rel: { type: 'string' } }, ['rel']) },
  { name: 'bot_stop', description: '봇을 정지(휴면)한다. 기록은 남는다.', inputSchema: obj({ bot: { type: 'string' } }, ['bot']) },
  { name: 'bot_retire', description: '봇 폴더를 archive 로 옮기고 은퇴시킨다. ⚠ 사람의 승인 뒤에만.', inputSchema: obj({ bot: { type: 'string' } }, ['bot']) },
  { name: 'folder_create', description: '활성 범주(section)에 새 폴더를 만들고 하네스를 깐다. naming 규칙 적용. ⚠ 사람의 승인 뒤에만.', inputSchema: obj({ section: { type: 'string', description: '예: "2. Projects"' }, name: { type: 'string' }, start: { type: 'boolean', description: '만든 뒤 봇도 시작' } }, ['section', 'name']) },
  { name: 'bot_send', description: '봇에게 지시를 보낸다 — 새 세션을 만들거나(session 생략) 기존 세션에 이어 보낸다. 결과는 bot_sessions 로 본다.', inputSchema: obj({ bot: { type: 'string' }, text: { type: 'string' }, session: { type: 'string' }, name: { type: 'string', description: '새 세션 이름' } }, ['bot', 'text']) },
  { name: 'inbox_list', description: 'inbox 역할 폴더의 항목(폴더·파일)을 나열한다.', inputSchema: obj({}) },
  { name: 'folder_move', description: '루트 안에서 폴더·파일을 옮긴다(되돌리기 스냅샷 남김). ⚠ 사람의 승인 뒤에만.', inputSchema: obj({ from: { type: 'string' }, to: { type: 'string' } }, ['from', 'to']) }
]

export function mcpTools(botId: string): Tool[] { return botId === ORCH_ID ? [...COMMON, ...ORCH] : COMMON }

export async function handleMcp(host: Host, botId: string, req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
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
      const out = await callTool(host, botId, name, args)
      return reply({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] })
    } catch (e) { return reply({ content: [{ type: 'text', text: `오류: ${(e as Error).message}` }], isError: true }) }
  }
  return error(-32601, 'method not found')
}

async function callTool(host: Host, botId: string, name: string, a: Record<string, unknown>): Promise<unknown> {
  const reg: Registry = host.registry
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
  const findBot = (q: string) => reg.bots().find((b) => b.id === q || b.name === q || b.rel === q || b.name.toLowerCase() === q.toLowerCase())
  switch (name) {
    case 'bots_list': return reg.bots().map((b) => { const ss = host.sessions.list(b.id); return { id: b.id, name: b.name, rel: b.rel, sessions: ss.length, awaiting: ss.filter((x) => x.state === 'awaiting_input').length, running: ss.filter((x) => x.state === 'running').length, lastActivity: ss[0]?.lastActivity ?? null } })
    case 'bots_candidates': return reg.candidates().map((c) => ({ rel: c.rel, section: c.section, harness: c.harness, active: c.active, modified: new Date(c.mtime).toISOString() }))
    case 'bot_status': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); return host.sessions.list(b.id).map((x) => ({ id: x.id, name: x.name, state: x.state, lastActivity: new Date(x.lastActivity).toISOString(), pending: x.pending.map((p) => p.displayName) })) }
    case 'bot_sessions': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); const list = host.sessions.list(b.id); const sess = s('session') ? list.find((x) => x.id === s('session') || x.name === s('session')) : list[0]; if (!sess) return '세션이 없어요'; const items = host.sessions.items(sess.id).slice(-(Number(a.limit) || 30)); return items.map((it) => it.kind === 'user' ? `[사용자] ${it.text}` : it.kind === 'assistant' ? `[봇] ${it.text}` : it.kind === 'tool' ? `[도구] ${it.name} ${it.summary}` : it.kind === 'result' ? `[턴 끝] ${it.ok ? 'ok' : '오류 ' + (it.error ?? '')}` : it.kind === 'system' ? `[시스템] ${it.text}` : '').filter(Boolean).join('\n') }
    case 'bot_start': { const b = reg.start(s('rel')); host.afterBotsChanged(); return `시작했어요: ${b.name} (${b.rel})` }
    case 'bot_stop': { const b = findBot(s('bot')); if (!b || b.orchestrator) throw new Error('정지할 수 없는 봇'); reg.stop(b.id); host.afterBotsChanged(); return `정지: ${b.name}` }
    case 'bot_retire': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); const to = reg.retire(b.id); host.afterBotsChanged(); return `은퇴 · ${to} 로 옮겼어요` }
    case 'folder_create': { const rel = reg.createFolder(s('section'), s('name')); let msg = `만들었어요: ${rel} (하네스 설치됨)`; if (a.start) { const b = reg.start(rel); host.afterBotsChanged(); msg += ` · 봇 시작: ${b.name}` } return msg }
    case 'bot_send': { const b = findBot(s('bot')); if (!b) throw new Error('그런 봇이 없어요'); const sid = host.sendToBot(b, s('text'), s('session') || undefined, s('name') || undefined, botId); return `보냈어요 · 세션 ${sid}` }
    case 'inbox_list': return reg.inboxItems().map((i) => ({ rel: i.rel, dir: i.dir, modified: new Date(i.mtime).toISOString() }))
    case 'folder_move': { reg.move(s('from'), s('to')); host.afterBotsChanged(); return `옮겼어요: ${s('from')} → ${s('to')} (되돌리기 가능)` }
    case 'vault_tree': return host.tree(s('dir'), Number(a.depth) || 2)
    case 'vault_search': return host.search(s('query'), Number(a.limit) || 40)
    case 'rules_get': return reg.rules
    case 'todo_add': { const b = reg.bot(botId); if (!b) throw new Error('봇을 못 찾았어요'); host.todoAdd(b, s('title'), s('desc'), 'bot', !!a.for_user); return '추가했어요' }
  }
  throw new Error('unknown tool')
}
