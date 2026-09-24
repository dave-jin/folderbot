import type { PermissionMode } from '../core/types'
import { AGENT_EFFORTS, AGENT_MODELS, DEFAULT_EFFORT, DEFAULT_MODEL, MORE_MODELS, type AgentModel, type ProviderId, sameModel, splitModels } from '../core/agents'
import { mergeModels } from '../core/modelList'
import { api } from './api'

/**
 * 모델·노력 — 🔴 **정본은 `core/agents.ts` 다.** 여기는 «Claude 것» 이라는 이름의 별칭일 뿐이다.
 * ⚠ 화면에서 고를 목록은 **그 세션의 벤더**로 정해야 한다 — `modelsFor()` · `effortsFor()` 를 쓴다.
 *    Claude 목록을 Codex 세션에 보여 주면 고르는 순간 CLI 가 그 자리에서 죽는다.
 */
export const MODELS = AGENT_MODELS.claude
export const EFFORTS = AGENT_EFFORTS.claude

/**
 * 🔴 **기계에서 받아 온 모델 목록** (2026-09-13 Dave: «미리 설정에 fixed 하지 말고 정보를 받아와서
 *    채워줘»). 앱이 뜰 때 한 번 `/api/agents/models` 로 받아 여기에 둔다 — **설정과 입력창이 같은
 *    목록을 본다**(두 곳이 갈리면 «설정엔 있는데 대화에선 못 고르는» 모델이 생긴다).
 * ⚠ 못 받아 왔으면 빌트인 그대로다 — 빈 칸보다 낫다.
 */
let found: { claude: string[]; codex: string[] } = { claude: [], codex: [] }
const watchers = new Set<() => void>()
export function setFoundModels(f: { claude?: string[]; codex?: string[] }): void {
  found = { claude: f.claude ?? [], codex: f.codex ?? [] }
  for (const w of [...watchers]) w()
}
/**
 * 🔴 **다시 물어본다 — 켠 그대로 두지 않는다** (2026-09-15 Dave: *«새 세션이 생길때 마다 모델 상태를
 *    확인하고 갱신해줘야해»*). 앱을 켜 둔 채 CLI 를 업데이트하면 쓸 수 있는 모델이 바뀌는데,
 *    부팅 때 한 번 받아 둔 목록은 그걸 영영 모른다.
 * ⚠ 목록은 **모듈 한 곳**에 있고 화면은 `onModels` 로 듣는다 — 설정과 입력창이 갈리지 않게.
 */
export async function refreshModels(): Promise<void> {
  try { setFoundModels(await api<{ claude: string[]; codex: string[] }>('/agents/models')) } catch { /* 못 받으면 빌트인 그대로 */ }
}
export function onModels(cb: () => void): () => void { watchers.add(cb); return () => { watchers.delete(cb) } }
/**
 * 🔴 **AL · 「새로고침」 — 호스트 캐시까지 버린다** (2026-09-24 Dave: *«리프레시가 가능하도록»*).
 * ⚠ `refreshModels()` 는 **호스트가 이미 캐시한 답**을 다시 받을 뿐이라, CLI 를 새로 깔아도 그대로였다.
 *    이쪽은 호스트에게 «후보를 다시 훑고 판을 다시 읽어라» 라고 시킨다.
 */
export async function hardRefreshModels(): Promise<{ claude: string[]; codex: string[] } | null> {
  try {
    const r = await api<{ models: { claude: string[]; codex: string[] } }>('/agents/refresh', { method: 'POST', body: {} })
    setFoundModels(r.models); return r.models
  } catch { return null }
}
/**
 * 첫 목록 — **골라 둔 것만**(종류별 최신 하나씩). 기계에서 주워 온 이름은 여기 안 섞는다.
 * 🔴 2026-09-14 Dave 스크린샷: 긁어 온 이름을 첫 목록에 섞었더니 플러그인 이름(`claude-mythos` 등)이
 *    줄줄이 서서 «무엇을 골라야 하나» 가 됐다. 고르기는 짧아야 한다.
 */
/**
 * AI · **Claude 첫 목록은 호스트 CLI 가 아는 것에서** (2026-09-24 Dave) — 종류별 최신 하나씩.
 * 🔴 박아 둔 목록만 믿으면 **그 호스트가 못 돌리는 모델**을 고르게 된다(실측: 미니의 CLI 2.1.278 에
 *    Opus 5.5 를 고르자 400). 못 주워 왔으면 박아 둔 목록 그대로다.
 */
export const modelsFor = (v?: ProviderId): AgentModel[] => {
  const id = v ?? 'claude'
  if (id !== 'claude' || !found.claude.length) return AGENT_MODELS[id]
  const { first } = splitModels(found.claude)
  return first.length ? first : AGENT_MODELS.claude
}
/** 「더 많은 모델」 — 긴 문맥(1M) · 기계에서 주워 온 이름. 첫 목록과 겹치는 것은 뺀다 */
export const moreModelsFor = (v?: ProviderId): AgentModel[] => {
  const id = v ?? 'claude'
  const first = new Set(modelsFor(id).map((m) => m.v))
  if (id === 'claude' && found.claude.length) {
    const { more } = splitModels(found.claude)
    return [...more, ...MORE_MODELS.claude].filter((m) => m.v && !first.has(m.v))
      .filter((m, i, a) => a.findIndex((x) => x.v === m.v) === i)
  }
  return mergeModels(found[id], MORE_MODELS[id]).filter((m) => m.v && !first.has(m.v)) as AgentModel[]
}
export const effortsFor = (v?: ProviderId): { v: string; t: string }[] => AGENT_EFFORTS[v ?? 'claude']
export const MODES: { v: PermissionMode; t: string; d: string }[] = [
  { v: 'default', t: '자동', d: '읽기는 바로, 쓰기·실행은 물어봄' },
  { v: 'acceptEdits', t: '편집 자동 수락', d: '파일 편집은 자동 승인' },
  { v: 'plan', t: '계획', d: '변경하기 전에 계획 만들기' },
  { v: 'bypassPermissions', t: '항상 허용', d: '묻지 않음 — 루틴·신뢰하는 폴더에서만' }
]
/** 이름이 목록에 없으면 **지어내지 않고** id 를 다듬어 그대로 보여 준다 — 사용자가 직접 넣은 이름일 수 있다 */
/**
 * AH · 🔴 **날짜 꼬리표가 붙어도 제 이름표를 단다** (2026-09-24). CLI 는 답에 `claude-opus-5-5-20260…` 처럼
 * 판을 박아 보낼 수 있는데 `===` 로만 찾으면 못 찾아 **소문자 대체 이름**(「opus 5」)이 칩에 떴다.
 * 같은 모델인지는 `sameModel` 하나가 정한다(호스트도 같은 함수를 쓴다).
 */
export const modelLabel = (id?: string, vendor?: ProviderId): string =>
  modelsFor(vendor).find((m) => sameModel(m.v, id))?.t
  ?? AGENT_MODELS.codex.find((m) => m.v === id)?.t
  ?? AGENT_MODELS.claude.find((m) => sameModel(m.v, id))?.t
  ?? MORE_MODELS.claude.find((m) => sameModel(m.v, id))?.t
  ?? (id ? id.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/-/g, ' ') : modelLabel(DEFAULT_MODEL[vendor ?? 'claude'], vendor))
export const effortLabel = (v?: string, vendor?: ProviderId): string => effortsFor(vendor).find((e) => e.v === v)?.t ?? effortsFor(vendor).find((e) => e.v === DEFAULT_EFFORT[vendor ?? 'claude'])?.t ?? '높음'
export const modeLabel = (v?: string): string => MODES.find((m) => m.v === v)?.t ?? '자동'
export const fmtK = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
