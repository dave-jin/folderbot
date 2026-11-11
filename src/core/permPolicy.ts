import type { PermissionMode } from './types'

/**
 * 권한 정책 — 순수 (2026-09-18 Dave: «중간에 권한을 바꿨는데 그 이후에도 계속 실행하기 전에 물어보네.
 * 그리고 처음에 디폴트가 오토였는데도 허용해줘야 되는 상황이 너무 많아»).
 *
 * 왜 이 파일이 있나:
 *  1. `--permission-mode` 는 **스폰 인자**다 — 살아 있는 워커에는 넣을 방법이 없다. 그래서 모드를 바꾸면
 *     턴이 끝난 뒤에야 새 워커가 뜨고, 그 사이에 오는 물음은 옛 모드 그대로였다.
 *     → 그 사이는 **호스트가 모드를 대신 집행한다**(`autoAllows`). 워커를 턴 중간에 죽이면 하던 일이
 *       끊기므로(다시 «계속해» 를 쳐야 한다) 죽이지 않고 답만 대신한다.
 *  2. «이 세션에서 항상 허용» 은 CLI 의 `permission_suggestions` 를 그대로 돌려주는 단추였다. 복합
 *     Bash(`cd x && npm test | tee`) 는 제안이 **비어 와서 단추 자체가 없었고**, 있어도 `npm run qa:*`
 *     처럼 좁아 다음 명령에서 또 물었다. → 비면 **호스트가 만든다**(`fallbackRules`). 조각마다 첫 낱말
 *     접두어(`cd:*` · `npm:*`)라 CLI 제안보다 넓다 — 사람이 «항상» 을 눌렀을 때 기대하는 넓이다.
 */

/** Claude Code 의 PermissionUpdate 와 같은 모양 — `updatedPermissions` 로 그대로 돌려준다 */
export interface PermRule { toolName: string; ruleContent?: string }
export interface PermUpdate { type: 'addRules'; rules: PermRule[]; behavior: 'allow'; destination: 'session' }

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * 이 모드라면 호스트가 사람 대신 «허용» 을 눌러도 되는가 — 질문(AskUserQuestion)은 어떤 모드에도 대신 답하지 않는다.
 * ⚠ EB · `auto`(자동)는 **대신 답하지 않는다** — 무엇이 안전한지는 CLI 가 판단하고, 그래도 물어 온 것은 사람에게 보인다.
 *    호스트가 «자동이니까 허용» 으로 답하면 그건 자동이 아니라 «항상 허용» 이다.
 */
export function autoAllows(mode: PermissionMode | undefined, toolName: string): boolean {
  if (toolName === 'AskUserQuestion') return false
  if (mode === 'bypassPermissions') return true
  if (mode === 'acceptEdits') return EDIT_TOOLS.has(toolName)
  return false
}

/**
 * 🔴 **EB · 권한 모드 이름은 Claude Desktop 과 같다** (2026-11-11 Dave 승인 — 기획 «사람이 없어도 안전하게 돈다»).
 *    종전 Folder Bot 의 «자동» 은 `default`(바꾸기 전에 늘 묻기)였다 — Claude Desktop 의 «자동»(Auto · Claude 가 권한을 판단)과 뜻이 반대였다.
 *    이제 `auto` = «자동», `default` = «수동». 화면(입력창 · 설정 · 시스템 줄)이 이 목록 하나를 읽는다.
 * ⛔ 저장된 `default` 를 `auto` 로 옮기지 않는다 — 이름만 바뀐 것이다. 옮기면 묻던 세션이 묻지 않게 된다.
 * ⚠ 순서가 곧 숫자 키(1~5)다 — 가운데에 끼워 넣으면 손에 익은 키가 바뀐다.
 */
export const PERM_MODE_MENU: { v: PermissionMode; t: string; d: string }[] = [
  { v: 'auto', t: '자동', d: 'Claude 가 권한을 판단 — 물어 오는 것만 확인' },
  { v: 'default', t: '수동', d: '바꾸기 전에 늘 물어봄 (읽기는 바로)' },
  { v: 'acceptEdits', t: '편집 자동 수락', d: '파일 편집은 바로, 명령 실행은 물어봄' },
  { v: 'plan', t: '계획', d: '바꾸지 않고 계획만 세움' },
  { v: 'bypassPermissions', t: '항상 허용', d: '묻지 않음 — 루틴·신뢰하는 폴더에서만' }
]
/** CLI 가 받는 값 전부(2.1.322 `set_permission_mode` 오류 글 실측) — 설정 파일·API 로 들어온 값은 이 목록으로 거른다 */
export const PERM_MODES: readonly PermissionMode[] = ['auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk']
export function isPermMode(v: unknown): v is PermissionMode { return typeof v === 'string' && (PERM_MODES as readonly string[]).includes(v) }
/** 모드의 화면 이름 — 모르는 값·빈 값은 «수동»(= `default`) */
export function permModeLabel(v?: string): string {
  return PERM_MODE_MENU.find((m) => m.v === v)?.t ?? (v === 'dontAsk' ? '묻지 않고 거절' : '수동')
}

/**
 * EB · CLI 가 `--permission-mode auto` 를 받지 않고 죽었나 (옛 판 · 계정 조건) — stderr 로 가른다.
 * 모양을 외우지 않는다: 「permission mode / --permission-mode」 나 「auto mode」 를 말하는 오류면 그렇게 본다.
 * ⚠ 모델 거절·로그인 오류는 따로 먼저 거른다(부르는 쪽) — 여기는 그 뒤에 온다.
 */
export function autoRejected(stderr: string): boolean {
  return /permission[- ]mode|auto mode|argument ['"]?auto['"]?/i.test(stderr)
}

/**
 * 🔴 **EB · 워커를 띄울 모드 — 모드를 안 정한 세션은 «새 채팅 기본 권한» 을 따른다** (2026-11-11 Dave 결정).
 *
 * 실 CLI 는 `--permission-mode` 없이 띄우면 그 맥의 `~/.claude/settings.json` `permissions.defaultMode` 를 따른다(맥미니는 `auto` · 실측
 * `07_검증/2026-11-11_실측_CLI-2.1.322-…`). 그래서 기록에 모드가 없는 세션(봇 소통 세션 다수)은 화면에 뭐라고 적혀 있든 Auto 로 돌았고,
 * 10/22 에는 Auto 가 오케스트레이터의 폴더 만들기를 거부했다. 이제 호스트는 **늘** 모드를 인자로 넘긴다:
 *  - 사람이 고른 모드(`explicit`)는 그대로 — «수동» 을 골랐으면 기본이 무엇이든 수동이다
 *  - 기록에 `default` 가 아닌 모드가 있으면 그대로(만들 때의 기본값 · 루틴 · 채널)
 *  - 그 밖(모드 없음 · 고르지 않은 `default`)은 지금의 «새 채팅 기본 권한»(`appDefault`) — 없으면 수동
 */
export function spawnMode(stored: PermissionMode | undefined, explicit: boolean, appDefault: PermissionMode | undefined): PermissionMode {
  if (explicit) return stored ?? 'default'
  if (stored && stored !== 'default') return stored
  return appDefault ?? 'default'
}

/**
 * EB · 워커가 말한 실제 모드를 요청한 모드와 견준다.
 *  - `auto-denied`   — 자동을 요청했는데 다른 모드로 떴다 → 수동으로 내리고 알린다
 *  - `follows-cli`   — 모드를 인자로 안 넘긴 워커가 그 맥의 Claude Code 설정을 따라 다른 모드로 돈다. ⚠ 호스트는 이제 늘 모드를 넘긴다(`spawnMode`) — 이 갈래는 옛 워커·바깥에서 띄운 CLI 를 가릴 때만 남는다
 *  - `same`          — 같다(또는 CLI 가 모드를 안 알려 줬다)
 */
export function modeDrift(asked: PermissionMode | undefined, explicit: boolean, reported: string | undefined): 'same' | 'auto-denied' | 'follows-cli' | 'other' {
  if (!reported || !isPermMode(reported)) return 'same'
  const want = asked ?? 'default'
  if (reported === want) return 'same'
  if (want === 'auto') return 'auto-denied'
  if (want === 'default' && !explicit) return 'follows-cli'
  return 'other'
}

/** 조각(`&&` `||` `;` `|`)마다 첫 낱말 — 환경변수 대입(`FOO=1`)은 건너뛴다. 못 믿을 낱말이면 null */
export function bashHeads(command: string): string[] | null {
  const heads: string[] = []
  for (const seg of command.split(/\s*(?:\|\||&&|;|\|)\s*/)) {
    const words = seg.trim().split(/\s+/).filter(Boolean)
    let i = 0
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++
    const head = words[i]
    if (!head) continue
    if (!/^[A-Za-z0-9_./-]+$/.test(head)) return null
    if (!heads.includes(head)) heads.push(head)
  }
  return heads.length ? heads : null
}

/** CLI 제안이 비었을 때 호스트가 만드는 세션 규칙 — Bash 는 접두어, 나머지는 도구 전체, 질문은 없음 */
export function fallbackRules(toolName: string, input: Record<string, unknown>): PermUpdate[] {
  if (toolName === 'AskUserQuestion') return []
  const one = (rules: PermRule[]): PermUpdate[] => [{ type: 'addRules', rules, behavior: 'allow', destination: 'session' }]
  if (toolName === 'Bash') {
    const heads = typeof input.command === 'string' ? bashHeads(input.command) : null
    return one(heads ? heads.map((h) => ({ toolName: 'Bash', ruleContent: `${h}:*` })) : [{ toolName: 'Bash' }])
  }
  return one([{ toolName }])
}

/** 규칙 목록을 사람 말로 — `Bash(cd:*) · Bash(npm:*)`. CLI 제안도 같은 모양이면 읽고, 아니면 빈 문자열 */
export function rulesLabel(suggestions: unknown[]): string {
  const out: string[] = []
  for (const u of suggestions) {
    const rules = (u as { rules?: unknown }).rules
    if (!Array.isArray(rules)) continue
    for (const r of rules as { toolName?: unknown; ruleContent?: unknown }[]) {
      if (typeof r.toolName !== 'string') continue
      out.push(typeof r.ruleContent === 'string' ? `${r.toolName}(${r.ruleContent})` : r.toolName)
    }
  }
  return out.join(' · ')
}
