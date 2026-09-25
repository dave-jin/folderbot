/**
 * 🔴 **띄운 알림은 눌리거나 닫힐 때까지 붙잡아 둔다** (2026-09-25 Dave: *«원격환경에서 알람을 클릭하면 … 정확하게 그 세션으로
 *    이동을 못해. 이상한 세션으로 가거나 …»* · 오랜 버그).
 *
 * 실측 원인: 셸이 `new Notification()` 을 띄우고 **아무 데서도 붙잡지 않았다.** 가비지 컬렉션이 한 번 돌면 그 객체와
 * `click` 처리기가 함께 사라진다(`--expose-gc` 로 재 보니 GC 전 살아 있음 → 후 없음). 그 뒤 알림 센터에서 배너를 누르면
 * macOS 는 **앱만 앞으로 가져오고**, 화면은 보던 세션 그대로다 — 누른 사람 눈에는 «엉뚱한 세션» 이다.
 * 곧바로 누르면 멀쩡해서 오래 숨어 있었다. 원격 맥북은 배너가 알림 센터에 오래 쌓였다가 눌려서 더 자주 드러났다.
 *
 * ⚠ 무한히 쥐지는 않는다 — 하루가 지났거나 너무 많으면 오래된 것부터 놓고, 알림 센터에서도 걷는다.
 * ⚠ 앱이 꺼지면(업데이트 재시작 포함) 붙잡은 배너를 **알림 센터에서 걷는다** — 새 프로세스는 옛 배너의 클릭을 못 받는다.
 *    누를 곳이 없는 배너를 남기지 않는 것이 «눌렀는데 엉뚱한 곳» 보다 낫다.
 * 정책은 순수하게 둔다(`nav.js` 와 같은 결) — 셸은 넘겨 받아 쓰고 유닛테스트가 고정한다.
 */
const DAY = 24 * 60 * 60 * 1000
function createNoteKeeper({ max = 60, ttl = DAY } = {}) {
  const live = new Map()   // note → 띄운 시각
  const drop = (n) => { live.delete(n) }
  return {
    /** 붙잡는다 · 넘치면(오래됨·개수) 놓을 것을 돌려준다 — 셸이 그것들을 `close()` 한다 */
    keep(n, now = Date.now()) {
      live.set(n, now)
      const out = []
      for (const [x, t] of live) if (now - t > ttl) out.push(x)
      const rest = [...live.keys()].filter((x) => !out.includes(x))
      while (rest.length > max) out.push(rest.shift())
      for (const x of out) drop(x)
      return out
    },
    /** 눌렸거나 닫혔다 — 이제 놓아도 된다 */
    release: drop,
    /** 앱이 꺼질 때 — 붙잡은 것 전부(셸이 알림 센터에서 걷는다) */
    all() { const xs = [...live.keys()]; live.clear(); return xs },
    size() { return live.size }
  }
}
module.exports = { createNoteKeeper, DAY }
