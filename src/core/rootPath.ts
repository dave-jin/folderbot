/**
 * 볼트 루트로 받은 «사람이 친 경로» 를 절대 경로 하나로 눕힌다.
 *
 * 🔴 **해석기는 여기 하나다.** 화면(설정 입력칸) · 호스트(API) · 셸(폴더 고르기) 셋이 같은 문자열을
 *    서로 다르게 읽으면 «바꿨는데 안 바뀐 것처럼 보이는» 모양이 난다. 셋 다 이 함수를 통과시킨다.
 *
 * ⚠ 사람이 붙여 넣는 경로는 **깨끗하지 않다** — Finder 에서 끌어오면 따옴표(`'…'`)가,
 *   터미널에서 복사하면 이스케이프(`My\ Folder`)가, 「경로 복사」는 `file://` 가 붙어 온다.
 *   이걸 안 벗기면 «그런 폴더가 없어요» 만 나오고 사람은 무엇이 틀렸는지 못 본다.
 */
export function normalizeRootInput(raw: string, home: string): string | null {
  let s = (raw ?? '').trim()
  if (!s) return null
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim()
  if (s.startsWith('file://')) { try { s = decodeURIComponent(s.slice('file://'.length)) } catch { return null } }
  s = s.replace(/\\ /g, ' ').trim()
  if (s === '~') s = home
  else if (s.startsWith('~/')) s = home + s.slice(1)
  if (!s.startsWith('/')) return null
  s = s.replace(/\/+$/, '')
  return s || '/'
}
