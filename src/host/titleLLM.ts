import { cleanLlmTitle, titlePrompt } from '../core/sessionTitle'
import { oneShot } from './oneShot'

/**
 * DC · 세션 제목을 Haiku 가 짓는다 (2026-10-17 Dave: *«세션 이름은 처음 질문과 답변 내용 바탕으로 hiku 이용해서 LLM으로 생성해줘»*).
 *
 * 9/15 에는 «모델에게 묻지 않는다»(토큰 · 보낸 순간 떠야 함)로 첫 말을 다듬었는데, 긴 지시문의 앞머리만 남아
 * «퍼포먼스 개선을 위한 캐시 기능을 추가하려고 해» 같은 제목이 됐다(스크린샷_2353). 그래서 둘을 겹친다 —
 * 보낸 순간엔 종전처럼 첫 말로 서고, **첫 답이 끝나면** 질문과 답을 Haiku 에 한 번 보내 그 이름으로 바꾼다.
 *
 * · 호출은 `oneShot`(격리된 단발 claude)이 한다 — `queryPlan`(planUsage.ts)과 같은 격리. 사람의 CLI 로그인을 쓴다.
 * · 실패(로그인 없음·시간 초과·이상한 답)면 조용히 첫 말 제목을 그대로 둔다. 다시 묻지 않는다.
 */
const TIMEOUT = 45_000
export async function llmTitle(question: string, answer: string, bin?: string): Promise<string | null> {
  if (process.env.FOLDERBOT_TITLE_LLM === '0') return null
  const r = await oneShot(titlePrompt(question, answer), { model: 'haiku', system: 'You write short session titles. Reply with the title only.', timeoutMs: TIMEOUT, bin, dir: 'folderbot-title' })
  return r.ok ? cleanLlmTitle(r.out) || null : null
}
