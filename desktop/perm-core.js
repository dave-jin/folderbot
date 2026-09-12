// 권한 판정 — 순수 함수. Electron 을 모르고, 테스트로 고정한다 (알파 Rondo core/updateFlow 승계).
'use strict'
/**
 * 전체 디스크 접근 판정 — 실패의 종류를 구분한다.
 * 자(프로브 경로)를 여러 개 대 보고 코드 묶음으로 판단한다: 하나라도 열렸으면 있음(null), EPERM/EACCES 가
 * 있으면 없음, 전부 ENOENT 등이면 «모른다». ⚠ 모른다를 없다로 내리지 않는다 — macOS 26 에서 TCC.db 경로가
 * 사라져 «켜도 안 켜지는 권한» 이 됐던 사고(알파 r412)의 교훈.
 */
function fdaVerdict(codes) {
  if (codes.some((c) => c === null)) return 'granted'
  if (codes.some((c) => c === 'EPERM' || c === 'EACCES')) return 'missing'
  return 'unknown'
}
/** 관문을 열어도 되나 — 필수 항목이 전부 허용이어야 한다 */
function permsSatisfied(items) { if (!items.length) return true; return items.every((p) => !p.required || p.status === 'granted') }
/** 사용자가 지금 할 일이 남았나 — 권장 항목의 «모른다» 는 할 일로 치지 않는다 */
function permsActionable(items) { return items.some((p) => p.status === 'missing' || (p.required && p.status !== 'granted')) }
module.exports = { fdaVerdict, permsSatisfied, permsActionable }
