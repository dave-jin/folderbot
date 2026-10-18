import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type { PermissionMode, AuthState, Bot, Candidate, ChatItem, FolderRules, Frame, NotifyEvent, PermissionRequest, SessionInfo, TodoItem } from '../core/types'
import { api, connectEvents, resyncPush, token } from './api'
import { cacheWriter, pool, readChats, storeVer, writeChats } from './cache'
import { forgetMissing } from './existsCache'

export interface Tailnet { state: string; ip?: string; dnsName?: string }
export interface StateShape {
  version: string
  root: string
  /** 마지막 «문서 창 열어 달라» 프레임(rondo_open/rondo_reveal) — n 은 같은 내용이 또 와도 효과가 돌게 하는 번호 */
  docReq?: { botId: string; sid: string; rel: string; action: 'open' | 'reveal'; turn: number; device?: string; n: number }
  rules: FolderRules | null
  rulesInstalled: boolean
  bots: Bot[]
  candidates: Candidate[]
  sessionsByBot: Record<string, SessionInfo[]>
  chats: Record<string, ChatItem[]>
  pending: Record<string, PermissionRequest[]>
  todos: Record<string, TodoItem[]>
  auth: AuthState
  inbox: number
  notifications: NotifyEvent[]
  vapidPublic: string
  tailnet: Tailnet | null
  addrs: string[]
  port: number
  devices: { id: string; name: string; lastSeen: number }[]
  /** ⚠ Codex 기본값은 **따로** 온다 — 이름 체계가 달라 섞으면 Codex 세션이 그 자리에서 죽는다 */
  defaults: { model: string; effort: string; permissionMode?: PermissionMode; idleMinutes?: number; codex?: { model: string; effort: string; sandbox: string; auth: { ok: boolean; how: 'login' | 'key' | null; where?: string } } }
  /** 조용한 시간 — 이 사이에는 «확인해 주세요» 만 통과한다 (설정 › 알림) */
  quiet?: { from: string; to: string; off?: boolean }
  /** 메인(호스트) 이름 · 이 화면이 어디서 보고 있는지 */
  hostName: string
  device: { id: string; name: string; main: boolean }
  online: 'on' | 'off'
  loaded: boolean
  /**
   * CF ⑤ · 다시 붙어 «본 것» 을 맞추는 중 — 줄이 끊긴 순간(첫 화면 뒤) 켜지고 `resync` 의 첫 묶음(상태·할 일·보는 대화)이 끝나면 꺼진다.
   * 머리줄 «맞추는 중» 점이 읽는다(0.4초 안에 끝나면 안 띄움). 옛 내용은 그대로 둔다.
   */
  syncing: boolean
  filesTick: Record<string, number>
  /** A · 오케스트레이터가 레일 순서를 바꾼 횟수 — 오를 때마다 이 기기의 정렬을 «직접» 으로 */
  railReorder: number
  /** BO · 화면이 먼저 띄운 새 세션 — 호스트 목록에 그 id 가 나타날 때까지 목록 맨 위에 붙들어 둔다(`newSession.ts`) */
  ghosts: Record<string, SessionInfo>
}
const init: StateShape = { version: '', root: '', rules: null, rulesInstalled: false, bots: [], candidates: [], sessionsByBot: {}, chats: {}, pending: {}, todos: {}, auth: { verdict: 'unknown', checkedAt: 0 }, inbox: 0, notifications: [], vapidPublic: '', tailnet: null, addrs: [], port: 7373, devices: [], defaults: { model: 'claude-fable-5-1', effort: 'high' }, hostName: '', device: { id: '', name: '', main: false }, online: 'off', loaded: false, syncing: false, filesTick: {}, railReorder: 0, ghosts: {} }

type Action = { type: 'state'; s: Partial<StateShape> } | { type: 'hydrate'; chats: Record<string, ChatItem[]> } | { type: 'frame'; f: Frame } | { type: 'chat'; sessionId: string; items: ChatItem[]; pending: PermissionRequest[] } | { type: 'synced' } | { type: 'online'; v: 'on' | 'off' } | { type: 'todos'; botId: string; items: TodoItem[] } | { type: 'refiles' } | { type: 'ghost'; info: SessionInfo } | { type: 'unghost'; id: string }

/**
 * BO · 호스트 목록에 임시 세션을 덧댄다. 호스트 목록에 이미 있는 id 는 임시 표시를 걷는다(호스트 것이 정답).
 * ⚠ 이것이 없으면 만들기 답보다 다른 일로 온 목록(`/state`·`sessions` 프레임)이 먼저 도착하는 순간
 *    방금 연 세션이 목록에서 사라지고 화면이 엉뚱한 세션으로 튄다.
 */
function withGhosts(by: Record<string, SessionInfo[]>, ghosts: Record<string, SessionInfo>): { by: Record<string, SessionInfo[]>; ghosts: Record<string, SessionInfo> } {
  const left: Record<string, SessionInfo> = {}; const out = { ...by }
  for (const g of Object.values(ghosts)) {
    const list = out[g.botId] ?? []
    if (list.some((x) => x.id === g.id)) continue
    left[g.id] = g; out[g.botId] = [g, ...list]
  }
  return { by: out, ghosts: Object.keys(left).length === Object.keys(ghosts).length ? ghosts : left }
}

function reducer(s: StateShape, a: Action): StateShape {
  switch (a.type) {
    case 'state': { const n = { ...s, ...a.s, loaded: true }; const w = withGhosts(n.sessionsByBot, s.ghosts); return { ...n, sessionsByBot: w.by, ghosts: w.ghosts } }
    case 'ghost': { const ghosts = { ...s.ghosts, [a.info.id]: a.info }; const w = withGhosts(s.sessionsByBot, ghosts); return { ...s, sessionsByBot: w.by, ghosts: w.ghosts, chats: s.chats[a.info.id] ? s.chats : { ...s.chats, [a.info.id]: [] } } }
    case 'unghost': {
      if (!s.ghosts[a.id]) return s
      const { [a.id]: g, ...ghosts } = s.ghosts
      const list = (s.sessionsByBot[g.botId] ?? []).filter((x) => x.id !== a.id)
      const { [a.id]: _c, ...chats } = s.chats
      return { ...s, ghosts, chats, sessionsByBot: { ...s.sessionsByBot, [g.botId]: list } }
    }
    case 'online': return { ...s, online: a.v, syncing: a.v === 'off' && s.loaded ? true : s.syncing }
    case 'synced': return s.syncing ? { ...s, syncing: false } : s
    case 'chat': return { ...s, chats: { ...s.chats, [a.sessionId]: a.items }, pending: { ...s.pending, [a.sessionId]: a.pending } }
    // DA · 디스크 캐시에서 꺼낸 대화 — **이미 받은 것은 덮지 않는다**(호스트에서 막 온 것이 더 새것이다)
    case 'hydrate': { const add = Object.fromEntries(Object.entries(a.chats).filter(([k]) => !s.chats[k])); return Object.keys(add).length ? { ...s, chats: { ...s.chats, ...add } } : s }
    case 'todos': return { ...s, todos: { ...s.todos, [a.botId]: a.items } }
    // 다시 붙었다 — 파일을 읽는 화면(트리 · 문서 탭)에게 «다시 읽어라» 를 한 번에 알린다
    case 'refiles': { const t = Date.now(); return { ...s, filesTick: Object.fromEntries(s.bots.map((b) => [b.id, t])) } }
    case 'frame': {
      const f = a.f
      switch (f.ev) {
        case 'bots': return { ...s, bots: f.bots, railReorder: f.reorderedBy ? s.railReorder + 1 : s.railReorder }
        case 'sessions': { const w = withGhosts({ ...s.sessionsByBot, [f.botId]: f.sessions }, s.ghosts); return { ...s, sessionsByBot: w.by, ghosts: w.ghosts, pending: { ...s.pending, ...Object.fromEntries(f.sessions.map((x) => [x.id, x.pending])) } } }
        case 'chat': {
          const cur = s.chats[f.sessionId]; if (!cur) return s
          let items: ChatItem[]
          if (f.replace) { const i = cur.findIndex((x) => x.id === f.item.id); items = i >= 0 ? [...cur.slice(0, i), f.item, ...cur.slice(i + 1)] : [...cur, f.item] }
          else items = cur.some((x) => x.id === f.item.id) ? cur : [...cur, f.item]
          return { ...s, chats: { ...s.chats, [f.sessionId]: items } }
        }
        case 'state': { const list = s.sessionsByBot[f.botId]; if (!list) return s; return { ...s, sessionsByBot: { ...s.sessionsByBot, [f.botId]: list.map((x) => (x.id === f.sessionId ? { ...x, state: f.state, alive: true, hibernated: false } : x)) } } }
        case 'activity': { const list = s.sessionsByBot[f.botId]; if (!list) return s; return { ...s, sessionsByBot: { ...s.sessionsByBot, [f.botId]: list.map((x) => (x.id === f.sessionId ? { ...x, activity: f.activity, turnStartedAt: f.turnStartedAt ?? x.turnStartedAt } : x)) } } }
        case 'permission': return { ...s, pending: { ...s.pending, [f.sessionId]: [...(s.pending[f.sessionId] ?? []).filter((p) => p.requestId !== f.req.requestId), f.req] } }
        case 'notify': return { ...s, notifications: [f.n, ...s.notifications].slice(0, 100) }
        case 'auth': return { ...s, auth: f.auth }
        case 'todo': return { ...s, todos: { ...s.todos, [f.botId]: f.items } }
        case 'files': return { ...s, filesTick: { ...s.filesTick, [f.botId]: Date.now() } }
        case 'inbox': return { ...s, inbox: f.count }
        case 'doc': return { ...s, docReq: { botId: f.botId, sid: f.sid, rel: f.rel, action: f.action, turn: f.turn, device: f.device, n: Date.now() } }
        default: return s
      }
    }
  }
}

interface Ctx { s: StateShape; refresh: () => Promise<void>; loadChat: (sid: string, revalidate?: boolean) => Promise<void>; ensureChat: (sid: string) => Promise<void>; prefetchAll: (first?: string) => Promise<void>; loadTodo: (botId: string) => Promise<void>; dispatch: React.Dispatch<Action> }
const C = createContext<Ctx>(null as never)
/** 해시가 가리키는 세션(`#…s=<id>`) — 지금 보고 있는 대화 */
const hashSid = (): string | null => { try { return new URLSearchParams(location.hash.slice(1)).get('s') } catch { return null } }
export const useStore = () => useContext(C)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, init)
  const sRef = useRef(s); sRef.current = s
  const stopRef = useRef<(() => void) | null>(null)
  const refresh = async () => {
    const st = await api<Partial<StateShape> & { sessionsByBot: Record<string, SessionInfo[]> }>('/state')
    const pending: Record<string, PermissionRequest[]> = {}
    for (const list of Object.values(st.sessionsByBot ?? {})) for (const x of list) pending[x.id] = x.pending
    dispatch({ type: 'state', s: { ...st, pending } })
  }
  /**
   * CF-1 · 같은 대화를 동시에 두 번 받지 않는다 — 미리 받기(레일에 손이 닿을 때 · 한가할 때 · 첫 화면 해시)와
   *   «열 때 받기» 가 겹쳐도 요청은 하나다(2026-10-12 퍼포먼스 실측 A2·A4).
   */
  const chatReq = useRef(new Map<string, Promise<void>>())
  /** CF-1 · 대화마다 마지막으로 받은 판 — 다시 붙을 때 이 판을 내밀어 안 바뀐 대화는 «그대로» 만 받는다 */
  const chatVers = useRef(new Map<string, string>())
  /** DA · 이번 실행에 호스트에서 받거나 «그대로» 를 확인한 대화 — 디스크에서 꺼내기만 한 것은 여기 없다 */
  const fresh = useRef(new Set<string>())
  /** 대화를 연다 — 없으면 받고, 디스크에서 꺼내기만 한 것이면 판을 내밀어 맞춘다(먼저 보이고 뒤에 바뀐다) */
  // ⚠ 다시 묻는 것은 «디스크에서 꺼내기만 한» 대화뿐이다 — 프레임으로 생긴 대화(막 만든 세션 등)는 종전대로 그대로 둔다(호스트가 아직 모르면 404)
  const ensureChat = (sid: string): Promise<void> => (!sRef.current.chats[sid] ? loadChat(sid) : fromDisk.current.has(sid) && !fresh.current.has(sid) ? loadChat(sid, true) : Promise.resolve())
  const loadChat = (sid: string, revalidate = false): Promise<void> => {
    const had = chatReq.current.get(sid); if (had) return had
    const v = revalidate ? chatVers.current.get(sid) : undefined
    const p = api<{ info: SessionInfo; items?: ChatItem[]; same?: boolean; ver?: string }>(`/sessions/${sid}/chat${v ? `?v=${encodeURIComponent(v)}` : ''}`).then((r) => {
      if (r.ver) chatVers.current.set(sid, r.ver)
      fresh.current.add(sid)
      if (r.same || !r.items) return
      dispatch({ type: 'chat', sessionId: sid, items: r.items, pending: r.info.pending })
    }).finally(() => { chatReq.current.delete(sid) })
    chatReq.current.set(sid, p); return p
  }
  /**
   * CF-1 · 할 일도 겹쳐 받지 않는다 — 다시 붙을 때 `resync` 가 받고, 곧이어 `refiles` 로 오른 filesTick 이 또 받았다(실측 A8).
   *   진행 중이거나 0.3초 안에 받은 것이면 그대로 쓴다 — 겹침은 같은 순간에 나고, 사람이 고친 뒤 다시 읽기는 그보다 늦다.
   */
  const todoReq = useRef(new Map<string, { at: number; p: Promise<void> }>())
  const loadTodo = (botId: string): Promise<void> => {
    const had = todoReq.current.get(botId); if (had && Date.now() - had.at < 300) return had.p
    const p = api<TodoItem[]>(`/bots/${botId}/todo`).then((items) => { dispatch({ type: 'todos', botId, items }) })
    todoReq.current.set(botId, { at: Date.now(), p }); p.catch(() => todoReq.current.delete(botId)); return p
  }
  /**
   * 🔴 **다시 붙으면 «본 것» 을 전부 다시 읽는다** (2026-09-13 Dave: «원격 모바일에서 수정된 파일이 바로 적용이 안 돼»).
   *
   * 왜 맥은 되고 폰은 안 됐나 — 화면이 사는 길은 **SSE 한 줄**뿐인데, 맥은 그 줄이 안 끊겨 `todo`·`chat`·`files`
   * 프레임을 계속 받는다. 폰은 잠그거나 다른 앱에 갔다 오는 사이 줄이 끊기고, **그 동안 온 프레임은 영영 없다.**
   * 다시 붙을 때 하던 일은 `/api/state` 새로 읽기 하나뿐인데 그 응답에는 **할 일도 대화도 문서도 없다** —
   * 그래서 봇 목록·알림만 최신이고 할 일 패널과 열린 문서는 옛날 것 그대로였다.
   *
   * ⛔ **«다시 붙었다» 를 상태 새로고침과 같은 뜻으로 쓰지 않는다.** 끊긴 동안 놓친 것은 프레임이지 상태가 아니다.
   *    화면이 들고 있는 것(할 일 · 열어 둔 대화 · 파일)을 이름으로 하나씩 다시 읽어야 한다.
   * ⚠ 새 화면이 «프레임으로만 최신이 되는» 것을 들고 있게 되면 **여기에도 넣어야 한다** — 안 넣으면
   *    맥에서는 멀쩡하고 폰에서만 조용히 낡는다(이 버그의 모양 그대로다).
   */
  const seen = useRef<{ todos: Set<string>; chats: Set<string> }>({ todos: new Set(), chats: new Set() })
  seen.current.todos = new Set(Object.keys(s.todos))
  seen.current.chats = new Set(Object.keys(s.chats))
  /** CF ⑤ · 맞추기 차례 — 맞추는 도중 또 끊겨 새 맞추기가 시작되면, 앞 차례가 끝나도 점을 끄지 않는다 */
  const syncGen = useRef(0)
  const resync = async () => {
    const gen = ++syncGen.current
    // CF-1 · 상태·할 일·대화를 **한꺼번에** — 종전엔 상태를 받은 뒤에야 나머지를 쏴서 1 RTT 를 더 썼다
    // DA · 전부 미리 받는 기기는 대화가 수십 개다 — 지금 보는 대화를 먼저, 나머지는 넷씩(안 바뀐 것은 «그대로» 한 줄)
    const chats = [...seen.current.chats]; const cur = hashSid(); if (cur && chats.includes(cur)) chats.splice(chats.indexOf(cur), 1)
    const rest = pool(chats, 4, (sid) => loadChat(sid, true))
    // CF ②③ · 보는 대화·봇의 할 일을 아직 못 받았으면(끊긴 동안 받다가 실패) 여기서 다시 받는다 — 안 그러면 회색 줄이 그대로 남는다
    const curBot = (() => { try { return new URLSearchParams(location.hash.slice(1)).get('bot') } catch { return null } })()
    const todoBots = new Set(seen.current.todos); if (curBot) todoBots.add(curBot)
    await Promise.allSettled([
      refresh(),
      ...[...todoBots].map((b) => loadTodo(b)),
      ...(cur ? [loadChat(cur, seen.current.chats.has(cur))] : [])
    ])
    dispatch({ type: 'refiles' })   // 트리·문서는 나머지 대화(수십 개)를 기다리지 않는다
    if (gen === syncGen.current) dispatch({ type: 'synced' })    // CF ⑤ · 보는 것은 다 맞췄다 — «맞추는 중» 점을 끈다(나머지 대화는 뒤에서)
    await rest
  }
  /**
   * DA · 원격 데스크톱의 디스크 캐시 (`cache.ts` 머리말 · 2026-10-17 Dave «전부 미리 받기»).
   *   ① 켜자마자 디스크의 대화를 꺼내 판과 함께 둔다 — 누르면 바로 보이고, 판을 내밀어 «그대로» 인지만 묻는다
   *   ② 첫 화면이 선 뒤 **모든 봇의 모든 세션**을 셋씩 받는다(지금 보는 것 먼저 · 판이 있으면 «그대로» 한 줄) — 받은 뒤로는 SSE 가 최신으로 둔다
   *   ③ 대화가 바뀌면 3초 모아 디스크에 쓴다. 목록에서 사라진 세션은 지운다
   * ⚠ 읽기는 데스크톱 앱이면 늘 한다(쓴 기기만 들어 있다). 쓰기와 미리 받기는 원격 데스크톱만 — 맥미니 자신·폰은 종전대로.
   */
  const saved = useRef(new Map<string, ChatItem[]>())   // 디스크에 쓴 대화(참조) — 같으면 다시 안 쓴다
  const fromDisk = useRef(new Set<string>())             // 디스크에서 꺼내기만 하고 아직 호스트에 판을 안 맞춘 대화
  const hydrated = useRef<Promise<void> | null>(null)
  const onDisk = useRef(new Set<string>())
  if (!hydrated.current) hydrated.current = !(window as unknown as { folderbotDesktop?: unknown; __fbCacheOn?: boolean }).folderbotDesktop && !(window as unknown as { __fbCacheOn?: boolean }).__fbCacheOn
    ? Promise.resolve()
    : readChats().then((recs) => {
      if (!recs.length) return
      // saved 에도 넣는다 — 안 넣으면 3초 뒤 꺼낸 대화 전부를 디스크에 통째로 다시 쓴다(켤 때마다)
      for (const r of recs) { onDisk.current.add(r.sid); saved.current.set(r.sid, r.items); if (!sRef.current.chats[r.sid]) fromDisk.current.add(r.sid); if (r.ver && !chatVers.current.has(r.sid)) chatVers.current.set(r.sid, r.ver) }
      dispatch({ type: 'hydrate', chats: Object.fromEntries(recs.map((r) => [r.sid, r.items])) })
    }).catch(() => {})
  const prefetchRun = useRef<Promise<void> | null>(null)
  const prefetchAll = (first?: string): Promise<void> => {
    if (prefetchRun.current) return prefetchRun.current
    prefetchRun.current = (async () => {
      await hydrated.current
      const st = sRef.current
      const all = Object.values(st.sessionsByBot).flat().filter((x) => !st.ghosts[x.id]).sort((a, b) => b.lastActivity - a.lastActivity).map((x) => x.id)
      const lead = first && all.includes(first) ? [first] : []
      await pool([...lead, ...all.filter((x) => x !== first)], 3, (sid) => loadChat(sid, true))
      await pool(st.bots.map((b) => b.id).filter((b) => !sRef.current.todos[b]), 3, (b) => loadTodo(b))
    })()
    return prefetchRun.current
  }
  const writer = s.loaded && cacheWriter(s.device.main)
  useEffect(() => {
    if (!writer) return
    const t = window.setTimeout(() => {
      const st = sRef.current
      const live = new Set(Object.values(st.sessionsByBot).flat().map((x) => x.id))
      const put = Object.entries(st.chats).filter(([sid, items]) => live.has(sid) && !st.ghosts[sid] && saved.current.get(sid) !== items)
        .map(([sid, items]) => ({ sid, ver: storeVer(items, chatVers.current.get(sid)), items, at: Date.now() }))
      const del = live.size ? [...onDisk.current].filter((sid) => !live.has(sid)) : []
      for (const r of put) { saved.current.set(r.sid, r.items); onDisk.current.add(r.sid) }
      for (const sid of del) { onDisk.current.delete(sid); saved.current.delete(sid) }
      void writeChats(put, del)
    }, 3000)
    return () => window.clearTimeout(t)
  }, [writer, s.chats, s.sessionsByBot])
  // CF-④ · 이미 푸시를 허용한 기기는 열 때마다 구독을 호스트에 다시 알린다 — 호스트가 구독을 잃어도(데이터 옮김·410 정리) 스스로 돌아온다
  useEffect(() => { if (s.loaded && s.vapidPublic) void resyncPush(s.vapidPublic, navigator.userAgent.slice(0, 30)) }, [s.loaded, s.vapidPublic])
  useEffect(() => {
    if (!token()) return
    let first = true
    /**
     * CF-1 · 첫 화면 요청을 나란히 — 상태와, 해시가 가리키는 대화를 **같이** 쏜다(종전엔 상태 → 그린 뒤 대화, 1 RTT 더).
     * 그리고 첫 `hello` 때 상태를 또 받던 것은, 첫 상태가 그 hello **뒤에** 도착했으면 건너뛴다(이미 구독 뒤의 값이다).
     */
    let stateDone = false; let helloSeen = false
    void refresh().then(() => { if (!helloSeen) stateDone = true }, () => { if (helloSeen) void refresh().catch(() => {}); else stateDone = true })   // ⚠ 첫 상태가 실패하면 hello 때 꼭 다시 받는다
    try { const hs = new URLSearchParams(location.hash.slice(1)).get('s'); if (hs) void loadChat(hs).catch(() => {}) } catch { /* 해시 없음 */ }
    // O · 토큰마다 그리지 않는다 — 같은 항목의 스트리밍 교체 프레임은 33ms 에 한 번(≤30fps)만 반영. 다른 프레임이 오면 먼저 비운다
    const pend = new Map<string, Frame>(); let timer: number | undefined
    const flush = () => { timer = undefined; for (const f of pend.values()) dispatch({ type: 'frame', f }); pend.clear() }
    // QA 손잡이 — 스모크가 «화면 줄이 늦은 때»(맥이 자고 깬 직후 등)를 흉내 내려고 프레임을 잠깐 흘려 버린다(BH). 제품 코드는 안 쓴다
    stopRef.current = connectEvents((f) => { if ((window as unknown as { __fbHoldFrames?: boolean }).__fbHoldFrames) return; if (f.ev === 'chat' && f.replace && (f.item as { streaming?: boolean }).streaming) { pend.set(`${f.sessionId}:${f.item.id}`, f); if (timer === undefined) timer = window.setTimeout(flush, 33); return } if (pend.size) { window.clearTimeout(timer); flush() }   /* flush 가 timer 를 undefined 로 되돌린다 */ dispatch({ type: 'frame', f }); if (f.ev === 'files') forgetMissing(); if (f.ev === 'bridges' || f.ev === 'hello') window.dispatchEvent(new Event('fb:bridges'));  /* BQ-9 · 연결 화면은 자기 것을 다시 읽는다(hello = 다시 붙음 — 재접속 계약) */  /* 파일이 바뀌면 «없다» 답을 버린다 — 방금 만든 파일이 칩이 되게 */ if (f.ev === 'state' && f.state !== 'running') window.dispatchEvent(new Event('fb:usage'));  /* L · 턴이 끝나면 사용량 카드가 바로 다시 묻는다 */ if (f.ev === 'hello') {
          /* 🔴 BJ · 호스트가 새 화면 판을 내보내면 **다시 읽는다** — 옛 코드가 계속 돌면 고친 저장 규칙이 안 먹는다(9/27 실측). 채팅 초안은 localStorage 에 있어 남는다 */
          const b = (f as { build?: string }).build
          if (b) { const w = window as unknown as { __fbBuild?: string }; if (w.__fbBuild && w.__fbBuild !== b) { location.reload(); return } w.__fbBuild = b }
          // CF ⑤ · 첫 hello 전에 줄이 한 번 끊겼어도(첫 상태 뒤) 점이 남지 않게 — 첫 hello 갈래도 맞춘 뒤 끈다
          if (first) { first = false; helloSeen = true; const gen = ++syncGen.current; const done = () => { if (gen === syncGen.current) dispatch({ type: 'synced' }) }; if (stateDone) void refresh().then(done, done); else done() } else void resync()
        } }, (v) => dispatch({ type: 'online', v }))
    return () => stopRef.current?.()
  }, [])
  const v = useMemo(() => ({ s, refresh, loadChat, ensureChat, loadTodo, prefetchAll, dispatch }), [s])
  return <C.Provider value={v}>{children}</C.Provider>
}

export function fmtTime(t: number): string {
  if (!t) return ''
  const d = new Date(t); const now = new Date()
  const same = d.toDateString() === now.toDateString()
  const diff = now.getTime() - t
  if (diff < 60_000) return '방금'
  if (same) return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (diff < 7 * 86400_000) return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}`
}
export function fmtElapsed(from?: number): string {
  if (!from) return ''
  const sec = Math.max(0, Math.floor((Date.now() - from) / 1000))
  if (sec < 60) return `0:${String(sec).padStart(2, '0')}`
  const m = Math.floor(sec / 60); const ss = sec % 60
  if (m < 60) return `${m}m ${String(ss).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
export function fmtDate(t: number): string { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}) ${d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}` }
