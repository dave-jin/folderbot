/**
 * 창 자리 — 🔴 **마지막 모습으로 뜨되, 보이지 않는 곳에는 안 띄운다** (2026-09-15).
 *
 * 모니터를 빼거나 해상도가 바뀌면 지난번 좌표가 **화면 밖**이 된다. 그대로 띄우면 창은 떠 있는데
 * 사람 눈에는 «앱이 안 켜진다» 로 보인다(Dock 아이콘만 뛴다). 그래서 자리는 버리고 크기만 살린다.
 * ⚠ 정책을 여기 순수 함수로 둔다 — 셸에서 화면 목록을 넘겨 받아 계산만 한다(유닛테스트가 고정한다).
 */
const DEF = { width: 1280, height: 860 }
const MIN = { width: 720, height: 520 }

/** @param saved 지난번 창 {x,y,width,height} · @param displays [{workArea:{x,y,width,height}}] */
function pickBounds(saved, displays) {
  if (!saved || !(saved.width > 0) || !(saved.height > 0)) return { ...DEF }
  const size = { width: Math.max(MIN.width, Math.round(saved.width)), height: Math.max(MIN.height, Math.round(saved.height)) }
  const x = Math.round(saved.x), y = Math.round(saved.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return size
  // 제목 표시줄을 잡을 수 있을 만큼(가로 40px · 세로 40px)이 어느 화면 안에 들어와야 한다
  const ok = (displays || []).some((d) => {
    const a = (d && d.workArea) || d
    if (!a || !(a.width > 0)) return false
    return x + size.width > a.x + 40 && x < a.x + a.width - 40 && y + 40 < a.y + a.height && y >= a.y - 8
  })
  return ok ? { ...size, x, y } : size
}
module.exports = { pickBounds, DEF }
