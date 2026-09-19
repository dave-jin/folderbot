import { describe, it, expect } from 'vitest'
import { candidatePaths } from '../../src/core/paths'
/**
 * P-2 · 칩 감지 — 되어야 하는 것 10 · 되면 안 되는 것 10.
 * 칩 = «후보(core/paths)» 이면서 «호스트 /exists 가 있다고 답한 것». 아래 NO 는 후보조차 아니거나(3/5 · → 처리 · v0.2.113 …)
 * 후보라도 볼트에 그런 경로가 없어 칩이 될 수 없는 것이다. 코드 조각 안(`…`)은 후보라도 화면이 칩으로 안 바꾼다(스모크).
 */
describe('chip detection (P-2)', () => {
  const YES = ['설명서.pdf', 'files/그림.png', '3. Area/제품_Rondo/CLAUDE.md', '/Users/dave/PARA/1. Inbox/메모.md', '첨부/IMG_2012.png', 'docs/PRD.md', '이한율_준비서류_2026-09-19.pdf', 'report.docx', 'a/b/c.txt', 'src/core/paths.ts']
  const NEVER = ['→ 처리', '3/5', 'v0.2.113', '처리', 'claude', '2026-09-19', '10개/50MB', '오후 5:51', '50%', '1/2/3']
  it('되어야 하는 것 10 — 후보에 든다', () => { for (const t of YES) expect(candidatePaths(`앞 ${t} 뒤`), t).toContain(t) })
  it('되면 안 되는 것 10 — 후보조차 아니다', () => { for (const t of NEVER) expect(candidatePaths(`앞 ${t} 뒤`), t).toEqual([]) })
})
