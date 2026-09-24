import { describe, it, expect } from 'vitest'
import { mdPlain } from '../../src/core/mdPlain'

/** 2026-09-25 디자인 검수 — 알림 미리보기에 `## 증상 정리 **증상**: …` 처럼 마크다운 기호가 그대로 나왔다 */
describe('mdPlain — 알림 미리보기는 글자만', () => {
  it('제목·굵게·코드·링크 기호를 뗀다', () => {
    expect(mdPlain('## 증상 정리\n\n**증상**: 화면이 `흔들린다`. [자세히](https://x.com)'))
      .toBe('증상 정리 증상: 화면이 흔들린다. 자세히')
  })
  it('목록·체크박스·인용·콜아웃·가로줄', () => {
    expect(mdPlain('- [ ] 할 일\n1. 하나\n> [!note] 메모\n> 인용\n---\n끝')).toBe('할 일 하나 메모 인용 끝')
  })
  it('펜스는 안의 글자만 · 표는 칸 글자만', () => {
    expect(mdPlain('```bash\nnpm run qa\n```\n| 가 | 나 |\n|---|---|\n| 1 | 2 |')).toBe('npm run qa 가 나 1 2')
  })
  it('단어 속 밑줄·경로는 건드리지 않는다', () => {
    expect(mdPlain('제품_Rondo 의 01_기획/기획안_v2.md')).toBe('제품_Rondo 의 01_기획/기획안_v2.md')
    expect(mdPlain('*기울임* 과 _밑줄 기울임_')).toBe('기울임 과 밑줄 기울임')
  })
  it('위키링크는 별칭을, 없으면 이름을', () => {
    expect(mdPlain('[[문서|별칭]] 과 [[다른 문서]]')).toBe('별칭 과 다른 문서')
  })
})
