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

/** 이 모드라면 호스트가 사람 대신 «허용» 을 눌러도 되는가 — 질문(AskUserQuestion)은 어떤 모드에도 대신 답하지 않는다 */
export function autoAllows(mode: PermissionMode | undefined, toolName: string): boolean {
  if (toolName === 'AskUserQuestion') return false
  if (mode === 'bypassPermissions') return true
  if (mode === 'acceptEdits') return EDIT_TOOLS.has(toolName)
  return false
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
