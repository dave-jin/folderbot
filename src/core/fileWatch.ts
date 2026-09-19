/**
 * 폴더 감시 — 순수 판정 (2026-09-18 Dave: «대화를 통해 파일이 생성되는 경우 원격환경에서 생성된 파일이
 * 폴더에 바로 반영이 안 되는 문제»).
 *
 * 앱이 스스로 쓰는 상태(`.folderbot`·`.projectbot`)와 도구 폴더(`.git`·`node_modules`)의 변화는 «폴더가
 * 바뀌었다» 가 아니다 — 세션 채팅을 저장할 때마다 트리를 다시 읽게 두면 감시가 소음이 된다.
 * `.claude/` 는 신호다(슬래시 명령·스킬을 만들면 그 자리에서 `/` 메뉴에 나와야 한다 — 루프 8/10).
 */
const IGNORED_DIRS = new Set(['.folderbot', '.projectbot', '.git', 'node_modules', '.obsidian', '.Trash'])
const IGNORED_FILES = new Set(['.DS_Store'])

/** 루트 기준 상대 경로(`/` 구분)가 무시 대상인가 */
export function ignoredChange(rel: string): boolean {
  const parts = rel.split(/[\\/]/).filter(Boolean)
  if (!parts.length) return false
  if (IGNORED_FILES.has(parts[parts.length - 1])) return true
  return parts.some((p) => IGNORED_DIRS.has(p))
}

/** 감시 알림 디바운스 — 저장 한 번이 이벤트 서너 개로 오므로 봇마다 마지막 이벤트 뒤 이만큼 쉬고 한 번 알린다 */
export const WATCH_DEBOUNCE_MS = 300
