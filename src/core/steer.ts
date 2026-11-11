import type { SessionState } from './types'

/**
 * EC · **끼워 넣기** (2026-11-11) — 턴을 멈추지 않고, 도는 워커에게 사람 말을 바로 넣는다(`priority: "next"`).
 *
 * 10/16 에 CLI 2.1.288 로 쟀을 때는 턴 중에 넣은 말을 모델이 «도구 결과 속 지시(주입)» 로 보고 따르지 않아 «멈추고 새 턴» 으로 정했다(CL-2).
 * 11/11 에 2.1.322 로 다시 쟀더니 **같은 턴 안에서** 도는 도구가 끝난 직후 따랐다(`07_검증/2026-11-11_실측_CLI-2.1.322-…`).
 * 그래서 대기 말 줄의 [지금] 을 [끼워 넣기] 와 [멈추고 보내기] 둘로 나눴다. ⏎ 의 기본 동작(줄 서기)과 ⌥⏎(멈추고 보내기)는 그대로다.
 *
 * 🔴 **넣어도 되는가는 여기 한 곳이 정한다** — 호스트(`SessionManager.steer`)가 집행하고 화면(대기 줄 단추)이 같은 판정으로 단추를 흐린다.
 *    화면만 막으면 옛 화면·경주(누르는 사이 턴이 끝남)에서 새고, 호스트만 막으면 눌러 봐야 아는 죽은 단추가 선다.
 */
export type SteerBlock =
  /** Codex 세션 — `codex exec` 는 한 턴짜리 명령이라 턴 중에 입력을 못 받는다 */
  | 'codex'
  /** 도는 턴이 없다(쉬는 중 · 끝남 · 미뤄진 질문만 걸림) — 끼워 넣을 데가 없다. 보통 말로 바로 보내면 된다 */
  | 'idle'
  /** 승인·질문 카드가 답을 기다린다 — 카드에 먼저 답한다(말을 넣으면 카드가 가려지고, 모델은 답을 못 받은 채 새 지시를 받는다) */
  | 'card'
  /** 사람 말이 아니다(다른 봇의 말 · 편지 묶음 · 보고 묶음) — 그 말은 제 턴에서 제 출처(`turnFrom`)로 돌아야 한다 */
  | 'notHuman'

export interface SteerVerdict {
  ok: boolean
  why?: SteerBlock
  /** 사람에게 보일 까닭 — 단추의 title 과 호스트의 거절 글이 같은 문장을 쓴다 */
  text?: string
  /** 끼워 넣지는 못해도 **보통 말로 바로 보내면 되는가** — 턴이 이미 끝났다(경주에서 말을 잃지 않는 길) */
  sendable?: boolean
}

export const STEER_WHY: Record<SteerBlock, string> = {
  codex: 'Codex 세션은 일하는 중에 말을 받지 못해요 — [멈추고 보내기] 를 쓰세요',
  idle: '지금 도는 턴이 없어요 — [멈추고 보내기] 가 바로 보내요',
  card: '승인·질문 카드에 먼저 답해 주세요 — 카드가 걸린 동안에는 끼워 넣지 않아요',
  notHuman: '다른 봇의 말·편지·보고는 끼워 넣지 않아요 — 제 차례에 따로 돌아야 해요'
}

/**
 * 지금 이 세션에 말을 끼워 넣을 수 있나.
 * @param o.vendor  세션의 벤더(없으면 봇의 값을 넘긴다)
 * @param o.state   세션 상태
 * @param o.pending 걸린 승인·질문(`deferred` = 미뤄진 질문 — 턴은 이미 끝났다)
 * @param o.human   끼워 넣을 말이 사람 말인가(호스트 대기열의 봇 말·편지·보고는 false)
 */
export function steerVerdict(o: { vendor?: string; state: SessionState; pending?: { deferred?: boolean }[]; human?: boolean }): SteerVerdict {
  const no = (why: SteerBlock, sendable = false): SteerVerdict => ({ ok: false, why, text: STEER_WHY[why], sendable })
  if (o.human === false) return no('notHuman')
  if (o.vendor === 'codex') return no('codex')
  if (o.state === 'running') return { ok: true }
  if (o.state === 'awaiting_input') {
    const p = o.pending ?? []
    // 호스트 `mustWait` 와 같은 갈림 — 미뤄진 질문만 걸렸으면 턴은 끝났고, 보통 말이 그 질문을 닫는다
    return p.length > 0 && p.every((x) => x.deferred) ? no('idle', true) : no('card')
  }
  return no('idle', true)
}
