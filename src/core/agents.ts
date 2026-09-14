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
    /**
     * 🔴 **종류별 최신 하나씩만** (2026-09-14 Dave: *«다른 모델은 안쓰고 최신 버전만 종류별로만
     *    선택하게 할꺼야»* · Claude Code 의 모델 메뉴와 같은 결).
     * ⛔ 목록을 늘리지 마라 — 고를 것이 많아지면 «무엇이 다른지» 를 매번 생각하게 된다.
     *    옛 판·특수 판은 `MORE_MODELS` 로 내려간다(「더 많은 모델」).
     */
    { v: 'claude-fable-5-1', t: 'Fable 5.1', d: '가장 똑똑함 · 기본' },
    { v: 'claude-opus-5', t: 'Opus 5', d: '' },
    { v: 'claude-sonnet-5', t: 'Sonnet 5', d: '빠름' },
    { v: 'claude-haiku-4-5-20251001', t: 'Haiku 4.5', d: '가장 빠름' }
  ],
  codex: [
    // 🔴 **맨 위는 «CLI 기본»** (2026-09-13 Dave 신고) — ChatGPT 계정으로 붙으면 쓸 수 있는 모델이
    //    구독에 따라 다르고, 우리가 이름을 박아 넘기면 그 계정에서 **400 으로 죽는다**
    //    (실측: «The 'gpt-5.1-codex' model is not supported when using Codex with a ChatGPT account»).
    //    빈 값이면 `--model` 을 아예 안 넘기고 Codex 가 제 계정에 맞는 것을 고른다.
    { v: '', t: 'CLI 기본 (계정에 맞춰서)', d: '권장' },
    { v: 'gpt-5.1-codex', t: 'GPT-5.1 Codex', d: 'API 키 계정' },
    { v: 'gpt-5.1-codex-mini', t: 'GPT-5.1 Codex mini', d: '빠름' },
    { v: 'gpt-5-codex', t: 'GPT-5 Codex', d: '' },
    { v: 'gpt-5', t: 'GPT-5', d: '' }
  ]
}

/**
 * 「더 많은 모델」 — 평소엔 안 보이고, 눌러야 나온다.
 *
 * 🔴 **긴 문맥(1M) 은 여기 있다** (2026-09-14 Dave: *«1M 모델도 있는걸로 아는데…»*).
 *    Claude Code 는 모델 이름 뒤에 **문맥 창 꼬리표**를 붙여 고른다(`claude-sonnet-5[1m]`).
 * ⚠ 쓸 수 있는지는 **요금제가 정한다** — 안 되는 계정이면 CLI 가 거절한다. 그때는 우리가
 *    **모델 없이 한 번 더** 보내므로 턴이 죽지는 않는다(`core/codexMap.ts` 의 `isModelRejected`).
 * ⛔ 여기에 옛 판을 쌓지 마라 — 「더 많은」 이 두 번째 큰 목록이 되면 고르기가 다시 어려워진다.
 */
export const MORE_MODELS: Record<ProviderId, AgentModel[]> = {
  claude: [
    { v: 'claude-sonnet-5[1m]', t: 'Sonnet 5 · 1M', d: '긴 문맥 — 요금제에 따라 다름' }
  ],
  codex: []
}

export const AGENT_EFFORTS: Record<ProviderId, { v: string; t: string }[]> = {
  claude: [{ v: 'low', t: '낮음' }, { v: 'medium', t: '보통' }, { v: 'high', t: '높음' }, { v: 'xhigh', t: '매우' }, { v: 'max', t: '최대' }],
  codex: [{ v: 'minimal', t: '최소' }, { v: 'low', t: '낮음' }, { v: 'medium', t: '보통' }, { v: 'high', t: '높음' }]
}

/**
 * ⚠ **Codex 기본값은 빈 값이다** — «CLI 가 알아서». 이름을 박아 두면 ChatGPT 계정에서 그 모델이
 *    안 되는 순간 모든 턴이 400 으로 죽는다(2026-09-13 실사고). 고르고 싶은 사람은 설정에서 고른다.
 */
export const DEFAULT_MODEL: Record<ProviderId, string> = { claude: 'claude-fable-5-1', codex: '' }
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
