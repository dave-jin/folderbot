// BX · «새벽 4시에 적용» (2026-10-19 Dave «A» — 연결 목업 ③). 순수 함수 — test/unit/dawn.test.ts 가 잰다.
// 9/15 결정(«자동 적용은 하지 않는다 · 물어보기만»)은 그대로다. 사람이 버전 칩 팝업에서 한 번 누르면, 적용 «시각» 만 새벽으로 옮긴다.
// 맥미니 적용은 앱이 다시 떠 도는 세션이 끊기므로 낮에 누르기 어렵다 — 그래서 결정은 낮에, 적용은 새벽에.
// · 4시에 도는 세션이 있거나 30분 안에 걸린 루틴이 있으면 30분씩 미룬다. 미룬 시각이 5시를 넘으면 다음 날 4시로.
// · 켜지다 실패하면 옛 판으로 돌아오는 장치(apply-script.js · /api/health)는 «지금 적용» 과 똑같이 쓴다.
const DAWN_HOUR = 4
const LAST_HOUR = 5          // 이 시각을 넘겨 미뤄지면 다음 날로
const STEP_MS = 30 * 60 * 1000
const LATE_MS = 90 * 60 * 1000
const GRACE_MS = 5 * 60 * 1000

/** 다음 새벽 4시(로컬) — 지금이 4시 전이면 오늘, 아니면 내일 */
function nextDawn(now) {
  const d = new Date(now)
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAWN_HOUR, 0, 0, 0)
  if (t.getTime() <= now) t.setDate(t.getDate() + 1)
  return t.getTime()
}

/**
 * 예약 시각이 됐을 때 무엇을 하나 — `{ act: 'apply' }` 또는 `{ act: 'wait', at, why }`.
 * busy = 지금 돌거나 사람 답을 기다리는 세션 수 · routineSoon = 30분 안에 도는 루틴이 있나.
 */
function dawnStep(now, { busy = 0, routineSoon = false, at = now } = {}) {
  // 잠들었거나 꺼져 있다 늦게 깼다(예약 시각에서 90분 넘게 지남) — 아침에 갑자기 갈아끼우지 않고 다음 새벽으로
  // 새벽 창(4:00–5:00, 30초 눈금 여유 5분) 밖에서 깼어도 마찬가지 — 5:29 에 깬 맥이 그 자리에서 갈아끼우지 않게(2026-10-19 검토)
  const d = new Date(now)
  const limit = new Date(d.getFullYear(), d.getMonth(), d.getDate(), LAST_HOUR, 0, 0, 0).getTime()
  if (now - at > LATE_MS || now > limit + GRACE_MS || d.getHours() < DAWN_HOUR) return { act: 'wait', at: nextDawn(now), why: '예약 시각을 놓쳐 다음 새벽으로' }
  if (!busy && !routineSoon) return { act: 'apply' }
  const why = busy ? `도는 세션 ${busy}개` : '30분 안에 도는 루틴'
  const next = now + STEP_MS
  // 5시를 넘기면 그날은 접는다 — 아침 일과와 겹치지 않게. 다음 날 4시에 다시 본다
  if (next > limit) return { act: 'wait', at: nextDawn(limit), why: `${why} — 5시를 넘겨 내일 새벽으로` }
  return { act: 'wait', at: next, why: `${why} — 30분 뒤 다시` }
}

module.exports = { nextDawn, dawnStep, DAWN_HOUR, STEP_MS }
