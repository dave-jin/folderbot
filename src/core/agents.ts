/** 에이전트 제공자 — 화면·호스트가 같은 이름을 쓴다 */
export type ProviderId = 'claude' | 'codex'
export interface Provider { id: ProviderId; name: string; bin: string | null; version: string | null }
export const PROVIDER_LABEL: Record<ProviderId, string> = { claude: 'Claude Code', codex: 'Codex' }

/**
 * 에이전트별 모델·노력 목록 — 🔴 **Claude 것과 Codex 것은 이름 체계가 아예 다르다.**
 * Claude 이름(`claude-opus-5`)을 Codex 에 넘기면 **그 자리에서 죽는다**. 그래서 목록을 나누고,
 * 기본값도 따로 둔다(세션이 뜰 때 그 세션의 벤더 것으로 고른다).
 *
 * ⚠ **Codex 목록은 「흔히 쓰는 이름」이지 우리가 정한 것이 아니다** — CLI 판마다 쓸 수 있는 모델이
 *    다르다. 그래서 화면은 **직접 입력**을 항상 함께 내주고, 사용자의 `~/.codex/config.toml` 에서
 *    찾은 이름을 이 목록에 **합쳐서** 보여 준다(그쪽이 실제로 쓰는 이름이라 더 믿을 만하다).
 * ⚠ **노력도 다르다** — Claude 는 low…max, Codex 는 `model_reasoning_effort`(minimal…high) 다.
 */
export interface AgentModel { v: string; t: string; d?: string }

export const AGENT_MODELS: Record<ProviderId, AgentModel[]> = {
  claude: [
    { v: 'claude-fable-5-1', t: 'Fable 5.1', d: '가장 똑똑함 · 기본' },
    { v: 'claude-opus-5', t: 'Opus 5', d: '' },
    { v: 'claude-sonnet-5', t: 'Sonnet 5', d: '빠름' },
    { v: 'claude-haiku-4-5-20251001', t: 'Haiku 4.5', d: '가장 빠름' }
  ],
  codex: [
    { v: 'gpt-5.1-codex', t: 'GPT-5.1 Codex', d: '기본' },
    { v: 'gpt-5.1-codex-mini', t: 'GPT-5.1 Codex mini', d: '빠름' },
    { v: 'gpt-5-codex', t: 'GPT-5 Codex', d: '' },
    { v: 'gpt-5', t: 'GPT-5', d: '' }
  ]
}

export const AGENT_EFFORTS: Record<ProviderId, { v: string; t: string }[]> = {
  claude: [{ v: 'low', t: '낮음' }, { v: 'medium', t: '보통' }, { v: 'high', t: '높음' }, { v: 'xhigh', t: '매우' }, { v: 'max', t: '최대' }],
  codex: [{ v: 'minimal', t: '최소' }, { v: 'low', t: '낮음' }, { v: 'medium', t: '보통' }, { v: 'high', t: '높음' }]
}

export const DEFAULT_MODEL: Record<ProviderId, string> = { claude: 'claude-fable-5-1', codex: 'gpt-5.1-codex' }
export const DEFAULT_EFFORT: Record<ProviderId, string> = { claude: 'high', codex: 'medium' }

/**
 * 이 모델 이름이 그 CLI 것처럼 보이나 — **아니면 안 넘긴다**(CLI 의 기본값에 맡긴다).
 * 🔴 잘못 넘기면 «모델이 없다» 로 프로세스가 바로 죽는데, 사람은 자기가 고른 적도 없는 이름 때문에
 *    죽은 걸 모른다. 기본값에 맡기면 적어도 돈다.
 */
export function fitsProvider(id: ProviderId, model?: string): boolean {
  if (!model) return false
  return id === 'codex' ? /^(gpt|o\d|codex)/i.test(model) : /^claude/i.test(model)
}

/** Codex 의 샌드박스 — 우리가 승인 화면을 못 띄우므로(codex.ts 머리말) 이 값이 곧 권한 정책이다 */
export const CODEX_SANDBOX: { v: 'read-only' | 'workspace-write' | 'danger-full-access'; t: string; d: string }[] = [
  { v: 'read-only', t: '읽기만', d: '기본 — 파일을 고치지 않아요' },
  { v: 'workspace-write', t: '이 폴더 쓰기', d: '프로젝트 폴더 안에서는 고칠 수 있어요' },
  { v: 'danger-full-access', t: '전부 허용', d: '샌드박스 없음 — 신뢰하는 폴더에서만' }
]
