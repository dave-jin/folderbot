/**
 * 글 속 `@이름` 칩 찾기 — **아는 이름과 맞춰 본다** (CB · 2026-10-11 Dave 스크린샷_2326: «파일을 끌어다 두어도 박스가 안 생기는데»).
 *
 * 🔴 종전에는 `/@([^\s@]+)/` 로 «@ 뒤 공백 전까지» 를 이름으로 읽었다. 그래서 이름에 공백이 든 파일
 *    (`x 회의록 (최종).txt`)은 `@x` 에서 끊겨 칩이 안 섰고, 더 나쁘게는 첨부 목록을 글과 맞추는 쪽도 같은 규칙이라
 *    **끌어다 놓는 순간 첨부에서 조용히 빠졌다** — 보내면 파일은 안 가고 글자만 갔다.
 * - 이름은 «지금 첨부 목록에 있는 것» 중에서만 찾는다. 긴 이름부터 맞춰 `a.txt` 가 `a.txt 사본.txt` 를 먹지 않게 한다.
 * - 이름 뒤는 공백·`@`·글 끝이어야 한다(종전 규칙과 같다 — `@a.txt,` 는 칩이 아니다).
 * ⚠ 입력창 그리기(`InlineInput`)·첨부 목록 맞추기·보낸 말 그리기(`App.tsx`)가 **모두 이 함수 하나**를 쓴다.
 *    한 곳만 옛 규칙으로 남으면 «칩은 보이는데 파일이 빠진다» 처럼 서로 다른 말을 한다.
 */
export interface ChipHit { index: number; end: number; name: string }

export function findChips(text: string, names: Iterable<string>): ChipHit[] {
  const list = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)
  const out: ChipHit[] = []
  if (!list.length) return out
  let i = text.indexOf('@')
  while (i >= 0) {
    const name = list.find((n) => text.startsWith(n, i + 1) && edge(text, i + 1 + n.length))
    if (name) { out.push({ index: i, end: i + 1 + name.length, name }); i = text.indexOf('@', i + 1 + name.length) }
    else i = text.indexOf('@', i + 1)
  }
  return out
}

const edge = (t: string, j: number) => j >= t.length || /[\s@]/.test(t[j])
