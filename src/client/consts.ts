import type { PermissionMode } from '../core/types'
import { AGENT_EFFORTS, AGENT_MODELS, DEFAULT_EFFORT, DEFAULT_MODEL, type AgentModel, type ProviderId } from '../core/agents'

/**
 * 모델·노력 — 🔴 **정본은 `core/agents.ts` 다.** 여기는 «Claude 것» 이라는 이름의 별칭일 뿐이다.
 * ⚠ 화면에서 고를 목록은 **그 세션의 벤더**로 정해야 한다 — `modelsFor()` · `effortsFor()` 를 쓴다.
 *    Claude 목록을 Codex 세션에 보여 주면 고르는 순간 CLI 가 그 자리에서 죽는다.
 */
export const MODELS = AGENT_MODELS.claude
export const EFFORTS = AGENT_EFFORTS.claude
export const modelsFor = (v?: ProviderId): AgentModel[] => AGENT_MODELS[v ?? 'claude']
export const effortsFor = (v?: ProviderId): { v: string; t: string }[] => AGENT_EFFORTS[v ?? 'claude']
export const MODES: { v: PermissionMode; t: string; d: string }[] = [
  { v: 'default', t: '자동', d: '읽기는 바로, 쓰기·실행은 물어봄' },
  { v: 'acceptEdits', t: '편집 자동 수락', d: '파일 편집은 자동 승인' },
  { v: 'plan', t: '계획', d: '변경하기 전에 계획 만들기' },
  { v: 'bypassPermissions', t: '항상 허용', d: '묻지 않음 — 루틴·신뢰하는 폴더에서만' }
]
/** 이름이 목록에 없으면 **지어내지 않고** id 를 다듬어 그대로 보여 준다 — 사용자가 직접 넣은 이름일 수 있다 */
export const modelLabel = (id?: string, vendor?: ProviderId): string =>
  modelsFor(vendor).find((m) => m.v === id)?.t
  ?? AGENT_MODELS.codex.find((m) => m.v === id)?.t
  ?? AGENT_MODELS.claude.find((m) => m.v === id)?.t
  ?? (id ? id.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/-/g, ' ') : modelLabel(DEFAULT_MODEL[vendor ?? 'claude'], vendor))
export const effortLabel = (v?: string, vendor?: ProviderId): string => effortsFor(vendor).find((e) => e.v === v)?.t ?? effortsFor(vendor).find((e) => e.v === DEFAULT_EFFORT[vendor ?? 'claude'])?.t ?? '높음'
export const modeLabel = (v?: string): string => MODES.find((m) => m.v === v)?.t ?? '자동'
export const fmtK = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
