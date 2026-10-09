/**
 * 화면 확대·축소 — ⌘+ · ⌘− · ⌘0 (BP · 2026-10-09 Dave: «Command + [+/-] 를 통해서 글씨 및 크기 조정이 가능하도록»).
 *
 * 종전 메뉴에는 확대·축소 항목이 없어 ⌘+/− 가 아무 일도 안 했다(Electron 은 메뉴에 없는 단축키를 안 받는다).
 * - 단계는 브라우저와 같은 눈금이다 — 사람이 크롬·사파리에서 익힌 걸음이 그대로 맞는다.
 * - 배율은 셸 설정(settings.json `zoom`)에 남아 다시 켜도, 화면을 다시 읽어도(BJ 새 판 · 원격 재접속) 그대로다.
 *   ⚠ Electron 은 크롬과 달리 배율을 스스로 기억하지 않는다 — 셸이 매번 다시 건다(`main.js` did-finish-load).
 * - 이미지 뷰어가 떠 있으면 ⌘+/− 는 그림 확대다 — 페이지가 먼저 받아 막으면(preventDefault) 메뉴로 안 온다.
 * ⚠ 정책은 여기 순수 함수로 둔다 — 유닛테스트(`test/unit/screenZoom.test.ts`)가 고정한다.
 */
const STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

/** 저장된 값이 이상하면(없음·문자·범위 밖) 1 — 손으로 고친 settings.json 도 견딘다 */
function clampZoom(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(STEPS[STEPS.length - 1], Math.max(STEPS[0], n))
}

/** 한 걸음 — dir 은 +1(확대) · −1(축소) · 0(실제 크기). 눈금 사이 값이면 그 방향의 다음 눈금으로 */
function stepZoom(cur, dir) {
  if (!dir) return 1
  const z = clampZoom(cur)
  if (dir > 0) return STEPS.find((s) => s > z + 1e-6) ?? STEPS[STEPS.length - 1]
  return [...STEPS].reverse().find((s) => s < z - 1e-6) ?? STEPS[0]
}

const zoomPct = (z) => Math.round(clampZoom(z) * 100)

module.exports = { STEPS, clampZoom, stepZoom, zoomPct }
