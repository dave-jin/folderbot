/**
 * 턴의 출처와 «사람만 시킬 수 있는 도구» (BS · 2026-10-09 · 연결 설계 검토 §2-①).
 *
 * 루틴이 돌린 턴, 다른 봇의 말(orch_ask·bot_send)로 시작된 턴, 바깥 상대의 편지로 시작된 턴은
 * **사람의 승인이 아니다.** 시스템 프롬프트로 「제안만 하라」 고 적어 두는 것만으로는 못 막으므로
 * 되돌리기 어려운 도구는 MCP 가 그 자리에서 거절한다.
 * ⚠ 세션이 아니라 **턴** 단위다 — 같은 세션에서 사람이 「해」 라고 치면 그 턴은 사람 것이라 돌아간다.
 * ⚠ MCP 에서 막아도 Bash `mv` 는 못 막는다. 진짜 울타리는 권한 모드다(루틴은 승인 수준, 편지는 trust).
 */
export type TurnFrom = 'human' | 'bot' | 'routine' | 'peer'

export const HUMAN_ONLY_TOOLS: readonly string[] = ['folder_move', 'folder_create', 'bot_retire']

const WHO: Record<Exclude<TurnFrom, 'human'>, string> = { bot: '다른 봇이 보낸 말', routine: '예약된 루틴', peer: '바깥 상대의 편지' }

/** 막아야 하면 거절 이유, 아니면 null. 출처를 모르면(옛 세션) 사람으로 본다 — 종전 동작 그대로 */
export function turnBlock(tool: string, from: TurnFrom | undefined): string | null {
  if (!from || from === 'human' || !HUMAN_ONLY_TOOLS.includes(tool)) return null
  return `${tool} 은 사람이 시킨 턴에서만 쓸 수 있어요 — 이 턴은 ${WHO[from]}로 시작됐어요. 무엇을 어디로, 왜 할지 제안으로 남기면 사람이 승인합니다.`
}
