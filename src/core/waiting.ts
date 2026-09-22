/**
 * AB · **기다림을 보이게** (2026-09-23 Dave: *«다른 에이전트에게 일을 시키고 기다리는 화면인데, 기다리는건지
 * 어떤건지 내가 알수가 없거든»* · 시안 「기다림을 보이게」 **B안** 확정 — 색 + 표정(눈) + 채팅 대기 줄).
 *
 * 🔴 **구멍은 상태가 하나 모자란 것이었다.** `SessionState` 의 `running` 하나가 「내가 생각 중」(몇 초)과
 *    「남이 끝내 주길 기다리는 중」(몇 분)을 같이 덮었다. **사람이 자리를 떠도 되는지가 정반대**인데 화면은 같은 말을 했다.
 * 🔴 **색은 「누가 공을 들고 있나」 하나로 읽힌다** — 주황=내가 · 청록=남이 · 노랑=네가 · 초록=아무도.
 *    맥동 속도도 뜻이다: 주황은 빠르게(바쁘다) · 청록은 느리게(기다린다) · **노랑은 안 깜빡인다**(재촉이 아니라 멈춤).
 */
import type { SessionState } from './types'

/** 공을 누가 들고 있나 */
export type Holder = 'none' | 'me' | 'other' | 'you'
/** 남이 들고 있다면 어떤 남인가 — 화면 문구와 [보기] 단추가 갈린다 */
export type HoldKind = 'bot' | 'web' | 'tool'
/** 지금 돌고 있는 도구 한 개 (호스트가 적어 보낸다) */
export interface InFlight { name: string; summary?: string; since: number }

/**
 * 🔴 **도구 이름만으로 정하지 않는다.** 이름 목록은 반드시 낡는다(새 MCP·새 스킬이 계속 생긴다).
 *    그래서 두 갈래다 — ① **맡기는 것이 분명한 도구**는 곧바로 「남」 ② 그 밖의 도구도 **오래 붙들려 있으면**
 *    그 자체로 「남을 기다리는 중」이다. 뒤엣것이 있어서 모르는 도구도 조용히 사라지지 않는다.
 */
export const HOLD_AFTER_MS = 20_000
/** 30초가 넘으면 「아직」이라 말하고 경과를 보인다 · 2분이 넘으면 **가도 된다고 말한다** */
export const HOLD_MID_MS = 30_000, HOLD_LONG_MS = 120_000

const DELEGATING: { re: RegExp; kind: HoldKind }[] = [
  { re: /^(Task|Agent)$/i, kind: 'bot' },                       // 서브에이전트
  { re: /bot_send|bot_start|SendMessage/i, kind: 'bot' },        // 다른 폴더봇에게 맡김
  { re: /aside|browse|browser|playwright|orca|computer[-_]?use/i, kind: 'web' },
  { re: /draw[-_]?image|image|gamma|figma|render|export/i, kind: 'tool' },
]
/** 이 도구가 «맡기는» 도구인가 — 아니면 null */
export function delegatingKind(name: string): HoldKind | null {
  for (const d of DELEGATING) if (d.re.test(name)) return d.kind
  return null
}

/**
  * 지금 공을 누가 들고 있나. `now` 를 받으므로 순수하다(검사에서 시간을 밀 수 있다).
  * 🔴 **`bg` 가 이 고장의 핵심이다** — 백그라운드 에이전트를 띄우면 **턴은 끝나고**(state 가 running 을 벗어난다)
  *    일은 계속된다. 종전에는 그 순간 화면의 상태 줄이 **통째로 사라져** 「끝났나?」가 됐다(2026-09-23 Dave 스크린샷 2319).
  */
export function holderOf(state: SessionState | null | undefined, inflight: InFlight | null | undefined, now: number, bg = 0): Holder {
  if (state === 'awaiting_input') return 'you'
  if (state === 'running') {
    if (!inflight) return 'me'
    if (delegatingKind(inflight.name)) return 'other'
    return now - inflight.since >= HOLD_AFTER_MS ? 'other' : 'me'
  }
  return bg > 0 ? 'other' : 'none'   // 턴은 끝났는데 남이 아직 일한다
}
/** 남이 들고 있다면 어떤 남인가 — 모르는 도구는 그냥 «도구» 다 */
export function holdKindOf(inflight: InFlight | null | undefined, bg = 0): HoldKind {
  const k = inflight && delegatingKind(inflight.name)
  if (k) return k
  return bg > 0 ? 'bot' : 'tool'     // 턴이 끝난 뒤 남은 것은 백그라운드 에이전트다
}

export type HoldStage = 'short' | 'mid' | 'long'
export function holdStage(ms: number): HoldStage { return ms >= HOLD_LONG_MS ? 'long' : ms >= HOLD_MID_MS ? 'mid' : 'short' }

/** 「1분 5초」 — 분이 없으면 초만 */
export function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60)
  return m ? `${m}분 ${s % 60}초` : `${s}초`
}

export interface HoldLine { text: string; elapsed: string; action: 'none' | 'open' | 'notify'; actionLabel: string }
/**
 * 채팅 끝 «대기 줄» 의 말. 🔴 **2분이 넘으면 화면이 먼저 «가도 된다» 고 말한다** —
 * 기다림에서 가장 필요한 한 마디는 진행률이 아니라 **자리를 떠도 된다는 말**이다.
 */
export function holdLine(holder: Holder, inflight: InFlight | null | undefined, ms: number, bg = 0): HoldLine {
  const elapsed = elapsedText(ms)
  if (holder === 'me') return { text: '생각하는 중', elapsed: ms >= HOLD_MID_MS ? elapsed : '', action: 'none', actionLabel: '' }
  const kind = holdKindOf(inflight, bg)
  const what = (inflight?.summary || inflight?.name || '').slice(0, 60)
  const stage = holdStage(ms)
  if (stage === 'long') return { text: '오래 걸리네요 — 다른 일 보셔도 됩니다. 끝나면 알릴게요', elapsed, action: 'notify', actionLabel: '알림 켜기' }
  const still = stage === 'mid' ? '아직 ' : ''
  const body = kind === 'bot' ? `${still}${what || '다른 에이전트'} 의 답을 기다리는 중`
    : kind === 'web' ? `${still}${what || '브라우저'} 작업을 기다리는 중`
      : `${still}${what || '도구'} 가 끝나기를 기다리는 중`
  return { text: body, elapsed: stage === 'short' ? '' : elapsed, action: kind === 'bot' || kind === 'web' ? 'open' : 'none', actionLabel: kind === 'bot' ? '그 봇 보기' : '브라우저 보기' }
}

/** 헤더 한 줄 — 레일·헤더·대기 줄이 **같은 값**에서 나와야 셋이 서로 다른 말을 안 한다 */
export function holdHeader(holder: Holder, inflight: InFlight | null | undefined, bg = 0): string {
  if (holder === 'you') return '확인해 주세요'
  if (holder === 'me') return '생각 중'
  if (holder !== 'other') return ''
  const kind = holdKindOf(inflight, bg)
  return kind === 'bot' ? '다른 에이전트의 답을 기다리는 중' : kind === 'web' ? '브라우저 작업을 기다리는 중' : '도구가 끝나기를 기다리는 중'
}
