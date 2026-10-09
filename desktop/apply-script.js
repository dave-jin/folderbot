// BX · 업데이트 적용 스크립트 (2026-10-09 — 9/15 «자동 적용은 하지 않는다» 는 그대로, 적용 뒤 «되돌리기» 만 더했다).
// 종전 apply.sh 는 새 판을 깔자마자 옛 판(.old)을 지웠다 — 새 판이 켜지다 죽으면 **아침까지 호스트가 없었다**(새벽 루틴도 같이 멈춘다).
// 이제 호스트 모드면 새 판을 연 뒤 `/api/health` 가 `"ok":true` 로 답할 때까지(기본 2초×60) 기다리고, 끝내 안 오면 새 판을 내리고 옛 판을 되살려 연다.
// 결과는 zip 옆 applied.txt 에 «applied …» 또는 «rolled back …» 한 줄 — 다음에 뜬 앱(updater.start)이 읽어 화면에 알린다.
// 검사 시임: FB_OPEN(앱 열기 명령) · FB_HEALTH_TRIES · FB_HEALTH_SLEEP — test/unit/applyScript.test.ts 가 실제 bash 로 돌린다.
function applyScript() {
  return `#!/bin/bash
# Folder Bot 업데이트 적용 — 앱이 완전히 끝난 뒤 실행된다. 인자: PID ZIP TARGET WORK [HEALTH_URL]
PID=$1; ZIP="$2"; TARGET="$3"; WORK="$4"; HEALTH="$5"
OPEN="\${FB_OPEN:-/usr/bin/open}"
LOG="$(dirname "$ZIP")/applied.txt"
for i in $(seq 1 120); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
rm -rf "$WORK"; mkdir -p "$WORK"
/usr/bin/ditto -x -k --noqtn "$ZIP" "$WORK" || exit 1
NEW=$(find "$WORK" -maxdepth 2 -name "*.app" -print -quit)
[ -n "$NEW" ] || exit 1
rm -rf "$TARGET.old"; mv "$TARGET" "$TARGET.old" 2>/dev/null
/usr/bin/ditto --noqtn "$NEW" "$TARGET" || { rm -rf "$TARGET"; mv "$TARGET.old" "$TARGET"; $OPEN -a "$TARGET"; echo "failed $(date) — copy" > "$LOG"; exit 1; }
/usr/bin/xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
rm -rf "$WORK"
$OPEN -a "$TARGET"
if [ -n "$HEALTH" ]; then
  OK=""
  for i in $(seq 1 \${FB_HEALTH_TRIES:-60}); do
    sleep \${FB_HEALTH_SLEEP:-2}
    if /usr/bin/curl -fsS --max-time 3 "$HEALTH" 2>/dev/null | grep -q '"ok":true'; then OK=1; break; fi
  done
  if [ -z "$OK" ]; then
    /usr/bin/pkill -f "$TARGET/Contents/MacOS/" 2>/dev/null; sleep 1
    rm -rf "$TARGET"; mv "$TARGET.old" "$TARGET"
    /usr/bin/xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
    $OPEN -a "$TARGET"
    echo "rolled back $(date) — new version did not answer $HEALTH" > "$LOG"
    exit 2
  fi
fi
rm -rf "$TARGET.old"
echo "applied $(date)" > "$LOG"
`
}
module.exports = { applyScript }
