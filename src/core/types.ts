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
  /** 레일 맨 위 「고정」 칸에 두는 봇 — 최대 3개 (루프 3/10) */
  pinned?: boolean
}

export interface SessionInfo {
  id: string
  botId: string
  name: string
  /**
   * 이 세션을 도는 에이전트 (2026-09-13 Dave 재정의).
   * 🔴 **벤더는 폴더가 아니라 세션의 성질이다** — 한 폴더에 Claude 세션과 Codex 세션이 **섞여** 산다.
   *    그래서 회사 표식도 왼쪽 폴더 레일이 아니라 **세션 목록**에 붙는다.
   * ⚠ 안 주면 봇의 값(= 폴더를 시작할 때 고른 것)을 따른다 — 옛 세션 파일에는 이 칸이 없다.
   */
  vendor?: Vendor
  state: SessionState
  cliSessionId: string | null
  createdAt: number
  lastActivity: number
  alive: boolean
  hibernated: boolean
  pending: PermissionRequest[]
  lastError?: string
  routine?: string
  /** 지금 하는 일 한 줄 (도구명 · 요약 / 생각 중 / 답 쓰는 중) */
  activity?: string
  /** 턴이 끝난 뒤에도 돌고 있는 백그라운드 서브에이전트 수 — 회수·업데이트 적용은 이게 0 일 때만 */
  bg?: number
  /** 이번 턴 시작 시각 — 경과 시간은 이걸로 잰다 */
  turnStartedAt?: number
  model?: string
  effort?: string
  permissionMode?: PermissionMode
  /** 컨텍스트 사용량 — 마지막 턴의 입력 토큰(캐시 포함) / 창 크기 */
  ctx?: { used: number; window: number }
  /** 모델·노력·모드를 바꿨는데 턴이 도는 중이라 다음 턴부터 적용 */
  restartPending?: boolean
}

/** 슬래시 자동완성 항목 — 스킬(.claude/skills) · 명령(.claude/commands) · CLI 내장 */
export interface SlashCmd {
  name: string
  desc: string
  kind: 'skill' | 'command' | 'cli'
  scope: 'folder' | 'root' | 'user' | 'cli'
}

/** 하네스 — 이 폴더에서 실제로 쓸 수 있는 지침·스킬·커넥터 */
export type HarnessScope = 'folder' | 'root' | 'user' | 'builtin'
export interface HarnessItem { name: string; desc: string; scope: HarnessScope; kind: 'skill' | 'mcp' }
export interface HarnessRow {
  rel: string
  name: string
  section: string
  /** Claude Code 가 읽는 지침 */
  claudeMd: boolean
  /** Codex 가 읽는 지침 */
  agentsMd: boolean
  skills: number
  mcp: number
  by: Record<HarnessScope, number>
}
export interface HarnessDetail extends HarnessRow { skillList: HarnessItem[]; mcpList: HarnessItem[] }

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
  | { id: string; t: number; kind: 'tool'; name: string; summary: string; input?: Record<string, unknown>; result?: string; isError?: boolean; parentId?: string }
  | { id: string; t: number; kind: 'thinking'; text: string; streaming?: boolean }
  /** Task/Agent 도구 하나 = 서브에이전트 하나. 자식 도구 줄은 parentId 로 이 id 를 가리킨다 */
  | { id: string; t: number; kind: 'subagent'; name: string; prompt: string; tools: number; last: string; status: 'run' | 'done' | 'error'; result?: string; /** run_in_background — 턴이 끝나도 계속 돈다. 끝은 system/task_notification 이 알린다 */ bg?: boolean; taskId?: string }
  /** TodoWrite — 세션당 하나(최신)만 남긴다 */
  | { id: string; t: number; kind: 'todos'; items: { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }[] }
  | { id: string; t: number; kind: 'system'; text: string }
  | { id: string; t: number; kind: 'result'; ok: boolean; durationMs: number; costUsd?: number; error?: string }
  | { id: string; t: number; kind: 'files'; paths: string[] }

export interface TodoItem {
  line: number
  done: boolean
  title: string
  desc: string
  by: 'me' | 'bot'
  /** 이 줄 위의 가장 가까운 `## 제목` — 없으면 ''. 화면의 섹션이 된다 (V15) */
  section: string
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
  /**
   * 키체인에 **쓸 수 있는 로그인**이 있나 — 장기 토큰을 빼고 따로 물어본 답이다.
   * 🔴 이 값이 참이면 워커에 `CLAUDE_CODE_OAUTH_TOKEN` 을 **안 넣는다**: 토큰이 있으면 CLI 가
   *    claude.ai 커넥터(MCP) 로딩을 통째로 건너뛴다(`session.ts` 의 `cleanClaudeEnv` 머리말).
   */
  keychain?: boolean
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
  | { ev: 'activity'; sessionId: string; botId: string; activity: string; turnStartedAt?: number }
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
