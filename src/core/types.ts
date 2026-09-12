/** Folder Bot — 호스트·클라이언트가 공유하는 순수 타입 (Electron/DOM 의존 없음) */

export type SessionState = 'idle' | 'running' | 'awaiting_input' | 'done' | 'error'

export type SessionEvent =
  | { kind: 'user_sent' }
  | { kind: 'permission_requested' }
  | { kind: 'input_provided' }
  | { kind: 'result_received'; isError: boolean }
  | { kind: 'process_exited'; code: number | null }
  | { kind: 'stream_activity' }
  | { kind: 'acknowledged' }

export type Vendor = 'claude' | 'codex'
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | 'dontAsk'

/** 폴더 규칙 (루트 CLAUDE.md 의 ```yaml folder-rules 블록) */
export interface FolderRules {
  preset: 'para' | 'johnny-decimal' | 'custom'
  roles: { inbox: string[]; active: string[]; reference: string[]; archive: string[] }
  naming: { project?: string }
  harness: string[]
}

export interface Candidate {
  /** 루트 기준 상대 경로 */
  rel: string
  name: string
  /** PARA 범주 등 1단계 폴더명 */
  section: string
  harness: boolean
  mtime: number
  active: boolean
}

export interface BotConfig {
  vendor?: Vendor
  repo?: string
  candidate?: boolean
  color?: string
  routines?: RoutineDef[]
}

export interface RoutineDef {
  name: string
  cron: string
  prompt: string
  vendor?: Vendor
  /** 사람이 없을 때 승인 정책: readonly(기본) · folder(폴더 안 쓰기 허용) · always */
  approve?: 'readonly' | 'folder' | 'always'
  push?: boolean
}

export interface Bot {
  id: string
  /** 루트 기준 상대 경로 · 오케스트레이터는 '' */
  rel: string
  abs: string
  name: string
  section: string
  color: string
  orchestrator: boolean
  startedAt: number
  vendor: Vendor
  repo?: string
  routines: RoutineDef[]
}

export interface SessionInfo {
  id: string
  botId: string
  name: string
  state: SessionState
  cliSessionId: string | null
  createdAt: number
  lastActivity: number
  alive: boolean
  hibernated: boolean
  pending: PermissionRequest[]
  lastError?: string
  routine?: string
}

export interface PermissionRequest {
  requestId: string
  toolName: string
  displayName: string
  description: string
  input: Record<string, unknown>
  suggestions: unknown[]
  /** AskUserQuestion 이면 true */
  ask?: boolean
}

/** 대화 항목 — 화면이 그리는 단위 */
export type ChatItem =
  | { id: string; t: number; kind: 'user'; text: string }
  | { id: string; t: number; kind: 'assistant'; text: string; streaming?: boolean }
  | { id: string; t: number; kind: 'tool'; name: string; summary: string; input?: Record<string, unknown>; result?: string; isError?: boolean }
  | { id: string; t: number; kind: 'system'; text: string }
  | { id: string; t: number; kind: 'result'; ok: boolean; durationMs: number; costUsd?: number; error?: string }
  | { id: string; t: number; kind: 'files'; paths: string[] }

export interface TodoItem {
  line: number
  done: boolean
  title: string
  desc: string
  by: 'me' | 'bot'
}

export interface AuthState {
  /** loggedin · loggedout · unreadable(이 문맥에선 못 읽음) · unknown */
  verdict: 'loggedin' | 'loggedout' | 'unreadable' | 'unknown'
  email?: string
  plan?: string
  checkedAt: number
  reason?: string
  /** login = 키체인 로그인 · token = setup-token 장기 토큰 */
  mode?: 'login' | 'token'
}

export type NotifyKind = 'awaiting' | 'done' | 'error' | 'todo' | 'routine'

export interface NotifyEvent {
  id: string
  t: number
  kind: NotifyKind
  botId: string
  sessionId?: string
  title: string
  body: string
  read: boolean
}

/** SSE 프레임 */
export type Frame =
  | { ev: 'hello'; version: string; serverTime: number }
  | { ev: 'bots'; bots: Bot[] }
  | { ev: 'sessions'; botId: string; sessions: SessionInfo[] }
  | { ev: 'chat'; sessionId: string; item: ChatItem; replace?: boolean }
  | { ev: 'state'; sessionId: string; botId: string; state: SessionState }
  | { ev: 'permission'; sessionId: string; botId: string; req: PermissionRequest }
  | { ev: 'notify'; n: NotifyEvent }
  | { ev: 'auth'; auth: AuthState }
  | { ev: 'todo'; botId: string; items: TodoItem[] }
  | { ev: 'files'; botId: string }
  | { ev: 'inbox'; count: number }

export const STATE_LABEL: Record<SessionState, string> = {
  idle: '대기', running: '일하는 중', awaiting_input: '확인해 주세요', done: '끝났어요', error: '문제 있어요'
}

export const BOT_COLORS = ['#6ea6f7', '#b18cf2', '#3fc1c9', '#34c77b', '#e0a93e', '#f0a8c0', '#9ad0a0', '#8fb8ff', '#d9a0ff', '#f2c14e']
export const ORCH_COLOR = '#e08850'
export const DEFAULT_PORT = 7373
