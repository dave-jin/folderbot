/**
 * 여러 맥 2단계 — «맥마다 창 하나» 정책 순수 함수 (2026-11-19 · Dave: «둘 다 필요 · 설정에서 구분»).
 *
 * 설정 › 일반 «맥 바꾸는 방식» 이 «맥마다 창 하나» 면 맥마다 이름 붙은 창이 따로 뜬다. 셸은 창을 만들고 닫기만 하고,
 * «무엇을 남기나 · 어느 창을 여나 · 어디에 띄우나» 는 여기서 정한다(`winBounds.js` 와 같은 결 — 유닛테스트가 고정한다).
 */
const { pickBounds } = require('./winBounds')
const OFFSET = 28

/** 모드를 바꿀 때 열린 창 정리 — 같은 창으로 돌아가면 앞 창(없으면 첫 창) 하나만 남긴다 */
function frontAfterModeChange(mode, openIds, frontId) {
  if (mode !== 'same' || !openIds.length) return { keep: [...openIds], close: [] }
  const keep = openIds.includes(frontId) ? frontId : openIds[0]
  return { keep: [keep], close: openIds.filter((id) => id !== keep) }
}

/** 트레이 «Folder Bot 열기» — 마지막으로 앞에 있던 창이 아직 열려 있으면 그것, 아니면 지금 맥 */
const trayOpenTarget = (lastFrontId, openIds, activeId) => (openIds.includes(lastFrontId) ? lastFrontId : activeId)

/** 맥 창 자리 — 맥마다 기억한 자리. 처음 여는 맥은 기억된 다른 창에서 비켜 띄운다(겹쳐 떠서 «안 열렸다» 로 보이지 않게) */
function boundsFor(winByMac, id, displays) {
  const own = winByMac[id]
  if (own) return pickBounds(own, displays)
  const other = Object.values(winByMac)[0]
  if (!other) return pickBounds(null, displays)
  const moved = { ...other, x: (other.x ?? 0) + OFFSET, y: (other.y ?? 0) + OFFSET }
  return pickBounds(moved, displays)
}

/** 맥마다 창 — 그 맥 창이 연결 화면(file://)이나 다른 주소에 가 있으면 다시 연다(앞으로 가져오기만 하면 빠져나올 길이 없었다 · 11/19 검토) */
function needsReload(winUrl, macUrl) {
  try { return new URL(winUrl).origin !== new URL(macUrl).origin } catch { return true }
}

module.exports = { frontAfterModeChange, trayOpenTarget, boundsFor, needsReload }
