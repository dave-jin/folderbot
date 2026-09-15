import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type { AuthState, Bot, Candidate, ChatItem, FolderRules, Frame, NotifyEvent, PermissionRequest, SessionInfo, TodoItem } from '../core/types'
import { api, connectEvents, token } from './api'

export interface Tailnet { state: string; ip?: string; dnsName?: string }
export interface StateShape {
  version: string
  root: string
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
  defaults: { model: string; effort: string; idleMinutes?: number; codex?: { model: string; effort: string; sandbox: string; auth: { ok: boolean; how: 'login' | 'key' | null; where?: string } } }
  /** 메인(호스트) 이름 · 이 화면이 어디서 보고 있는지 */
  hostName: string
  device: { id: string; name: string; main: boolean }
  online: 'on' | 'off'
  loaded: boolean
  filesTick: Record<string, number>
}
const init: StateShape = { version: '', root: '', rules: null, rulesInstalled: false, bots: [], candidates: [], sessionsByBot: {}, chats: {}, pending: {}, todos: {}, auth: { verdict: 'unknown', checkedAt: 0 }, inbox: 0, notifications: [], vapidPublic: '', tailnet: null, addrs: [], port: 7373, devices: [], defaults: { model: 'claude-fable-5-1', effort: 'high' }, hostName: '', device: { id: '', name: '', main: false }, online: 'off', loaded: false, filesTick: {} }

type Action = { type: 'state'; s: Partial<StateShape> } | { type: 'frame'; f: Frame } | { type: 'chat'; sessionId: string; items: ChatItem[]; pending: PermissionRequest[] } | { type: 'online'; v: 'on' | 'off' } | { type: 'todos'; botId: string; items: TodoItem[] } | { type: 'refiles' }

function reducer(s: StateShape, a: Action): StateShape {
  switch (a.type) {
    case 'state': return { ...s, ...a.s, loaded: true }
    case 'online': return { ...s, online: a.v }
    case 'chat': return { ...s, chats: { ...s.chats, [a.sessionId]: a.items }, pending: { ...s.pending, [a.sessionId]: a.pending } }
    case 'todos': return { ...s, todos: { ...s.todos, [a.botId]: a.items } }
    // 다시 붙었다 — 파일을 읽는 화면(트리 · 문서 탭)에게 «다시 읽어라» 를 한 번에 알린다
    case 'refiles': { const t = Date.now(); return { ...s, filesTick: Object.fromEntries(s.bots.map((b) => [b.id, t])) } }
    case 'frame': {
      const f = a.f
      switch (f.ev) {
        case 'bots': return { ...s, bots: f.bots }
        case 'sessions': return { ...s, sessionsByBot: { ...s.sessionsByBot, [f.botId]: f.sessions }, pending: { ...s.pending, ...Object.fromEntries(f.sessions.map((x) => [x.id, x.pending])) } }
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
        default: return s
      }
    }
  }
}

interface Ctx { s: StateShape; refresh: () => Promise<void>; loadChat: (sid: string) => Promise<void>; loadTodo: (botId: string) => Promise<void>; dispatch: React.Dispatch<Action> }
const C = createContext<Ctx>(null as never)
export const useStore = () => useContext(C)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, init)
  const stopRef = useRef<(() => void) | null>(null)
  const refresh = async () => {
    const st = await api<Partial<StateShape> & { sessionsByBot: Record<string, SessionInfo[]> }>('/state')
    const pending: Record<string, PermissionRequest[]> = {}
    for (const list of Object.values(st.sessionsByBot ?? {})) for (const x of list) pending[x.id] = x.pending
    dispatch({ type: 'state', s: { ...st, pending } })
  }
  const loadChat = async (sid: string) => { const r = await api<{ info: SessionInfo; items: ChatItem[] }>(`/sessions/${sid}/chat`); dispatch({ type: 'chat', sessionId: sid, items: r.items, pending: r.info.pending }) }
  const loadTodo = async (botId: string) => { const items = await api<TodoItem[]>(`/bots/${botId}/todo`); dispatch({ type: 'todos', botId, items }) }
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
  const resync = async () => {
    await refresh()
    await Promise.allSettled([
      ...[...seen.current.todos].map((b) => loadTodo(b)),
      ...[...seen.current.chats].map((sid) => loadChat(sid))
    ])
    dispatch({ type: 'refiles' })
  }
  useEffect(() => {
    if (!token()) return
    let first = true
    void refresh()
    stopRef.current = connectEvents((f) => { dispatch({ type: 'frame', f }); if (f.ev === 'hello') { if (first) { first = false; void refresh() } else void resync() } }, (v) => dispatch({ type: 'online', v }))
    return () => stopRef.current?.()
  }, [])
  const v = useMemo(() => ({ s, refresh, loadChat, loadTodo, dispatch }), [s])
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
