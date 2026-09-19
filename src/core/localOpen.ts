/**
 * 원격에서 파일 열기 — 순수 판정 (E · 2026-09-19 Dave 1안 확정).
 *
 * 원리는 하나다: Dropbox·iCloud 는 폴더 구조를 그대로 옮기므로 **이 기기의 볼트 루트 + 볼트 기준 상대 경로** 가
 * 곧 같은 파일이다. 여기는 파일 시스템을 만지지 않는다 — 셸(desktop/localfs.js)이 재고, 여기서 판정한다.
 */

/**
 * ⚠ 후보 탐색·순위(꼬리 · 표준 자리 · 껍데기 판정)는 파일 시스템을 만져야 하므로 **셸**(`desktop/localfs.js`)에 있다.
 *    여기는 화면이 쓰는 판정만 — 신선도 · 캐시 자리 · iCloud 자리표시자 이름.
 */
export type Freshness = 'same' | 'differs' | 'missing' | 'placeholder'
export interface HostStat { size: number; head: string }
export interface LocalStat { exists: boolean; size?: number; head?: string; placeholder?: boolean }

/** 신선도 — mtime 은 동기화가 바꾸므로 **크기 + 앞부분 해시** 로 본다 */
export function freshness(host: HostStat, local: LocalStat): Freshness {
  if (!local.exists) return local.placeholder ? 'placeholder' : 'missing'
  return local.size === host.size && local.head === host.head ? 'same' : 'differs'
}

/** ② 내려받기 모드의 캐시 자리 — `<userData>/remote-cache/<호스트>/<rel>`. Dropbox 폴더 밖이고 `..` 로 못 올라간다 */
export function cachePathFor(userData: string, hostName: string, rel: string): string {
  const safeHost = hostName.replace(/[\\/:]/g, '_') || 'host'
  const parts = rel.split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..')
  return [userData, 'remote-cache', safeHost, ...parts].join('/')
}

/** iCloud «클라우드에만» 파일의 자리표시자 — `.<이름>.icloud` 가 같은 폴더에 있다 */
export function placeholderName(path: string): string {
  const i = path.lastIndexOf('/')
  return `${path.slice(0, i + 1)}.${path.slice(i + 1)}.icloud`
}
