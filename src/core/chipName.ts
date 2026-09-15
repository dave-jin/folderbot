/**
 * 파일 칩의 두 조각 (B안, 2026-09-15 Dave 선택) — **이름이 본체, 폴더는 뒤의 작은 표식.**
 *
 * 🔴 왜 경로를 안 쓰나 — 봇 폴더 밖 파일은 볼트 경로 전체(`2. Projects/…/04_세션기록/에프오씨씨/…md`)가
 *    채팅 한 줄을 다 먹었다(실측 스크린샷). 사람이 칩에서 읽고 싶은 것은 «어느 문서» 와 «어느 회사(폴더)» 뿐이고,
 *    전체 경로는 마우스를 올렸을 때 툴팁으로 충분하다.
 * ⚠ 표식은 **직전 폴더 한 칸**이다 — 봇 폴더 바로 아래 파일은 표식이 없다(폴더가 곧 봇이다).
 * ⚠ 폴더 칩은 이름 뒤에 `/` 를 붙이고 표식은 그 위 폴더다.
 */
export interface ChipParts { name: string; folder: string; dir: boolean }

export function chipParts(abs: string, botAbs: string, dir = false): ChipParts {
  const clean = abs.replace(/\/+$/, '')
  const segs = clean.split('/').filter(Boolean)
  const name = segs[segs.length - 1] ?? clean
  const parentAbs = segs.slice(0, -1).join('/')
  const bot = botAbs.replace(/\/+$/, '')
  const inBotRoot = `/${parentAbs}` === bot || parentAbs === bot.replace(/^\//, '')
  const folder = inBotRoot || segs.length < 2 ? '' : segs[segs.length - 2]
  return { name: dir ? `${name}/` : name, folder, dir }
}

/** 상대 경로(봇 기준 · `../` 가 섞일 수 있다)로도 같은 답을 낸다 */
export function chipPartsRel(rel: string, botAbs: string, dir = false): ChipParts {
  const bot = botAbs.replace(/\/+$/, '')
  const parts = bot.split('/').filter(Boolean)
  for (const s of rel.split('/')) { if (s === '..') parts.pop(); else if (s && s !== '.') parts.push(s) }
  return chipParts(`/${parts.join('/')}`, botAbs, dir)
}
