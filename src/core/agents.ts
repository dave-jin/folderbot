/** 에이전트 제공자 — 화면·호스트가 같은 이름을 쓴다 */
export type ProviderId = 'claude' | 'codex'
export interface Provider { id: ProviderId; name: string; bin: string | null; version: string | null }
export const PROVIDER_LABEL: Record<ProviderId, string> = { claude: 'Claude Code', codex: 'Codex' }
