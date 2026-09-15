/**
 * 내가 보낸 말 속의 **첨부 블록** — 입력칸이 첨부를 붙일 때 아래 모양으로 꼬리에 단다(App.tsx `sendText`):
 *
 *   본문
 *
 *   첨부 파일 (읽어서 참고해):
 *   - /abs/a.md
 *   - /abs/폴더/ (폴더 — 안의 파일들)
 *
 * 🔴 화면은 이 꼬리를 **글자로 보여 주면 안 된다** (2026-09-15 Dave: «채팅 안의 폴더 및 파일 칩도 구현이
 *    안되어 있어»). 봇에게는 글자로 가지만 사람에게는 **칩**이다 — 그래서 여기서 갈라 준다.
 * ⚠ 봇에게 가는 문장 자체는 바꾸지 않는다(그건 프롬프트 계약이다). 나누는 건 화면뿐.
 */
export const ATTACH_HEAD = '첨부 파일 (읽어서 참고해):'
export interface AttachRef { abs: string; dir: boolean; name: string }
export function splitAttach(text: string): { body: string; files: AttachRef[] } {
  const i = text.lastIndexOf(`\n\n${ATTACH_HEAD}\n`)
  if (i < 0) return { body: text, files: [] }
  const body = text.slice(0, i)
  const files: AttachRef[] = []
  for (const line of text.slice(i + ATTACH_HEAD.length + 3).split('\n')) {
    const m = /^- (.+?)(\/ \(폴더 — 안의 파일들\))?$/.exec(line.trim())
    if (!m) continue
    const dir = !!m[2]
    const abs = m[1]
    files.push({ abs, dir, name: abs.split('/').filter(Boolean).pop() ?? abs })
  }
  return { body, files }
}
