import { describe, expect, it } from 'vitest'
import { normalizeDepth, outline } from '../../src/core/outline'

describe('문서 목차', () => {
  it('ATX 제목만 센다', () => {
    expect(outline('# 하나\n본문\n## 둘\n### 셋').map((h) => [h.level, h.text, h.line]))
      .toEqual([[1, '하나', 1], [2, '둘', 3], [3, '셋', 4]])
  })

  // 🔴 실사고: `# !/bin/bash` 가 1단 제목으로 섰다
  it('코드 펜스 안의 # 은 제목이 아니다', () => {
    expect(outline('# 진짜\n\n```sh\n# 가짜\n```\n\n## 진짜2').map((h) => h.text)).toEqual(['진짜', '진짜2'])
    expect(outline('~~~\n# 물결 펜스 안\n~~~\n# 밖').map((h) => h.text)).toEqual(['밖'])
  })

  it('프론트매터는 통째로 건너뛴다', () => {
    expect(outline('---\ntitle: x\n# yaml 주석\n---\n# 진짜').map((h) => [h.text, h.line])).toEqual([['진짜', 5]])
  })

  it('닫는 ### 표기를 지운다 · 빈 제목은 안 센다', () => {
    expect(outline('## 제목 ##').map((h) => h.text)).toEqual(['제목'])
    expect(outline('#\n##   ')).toEqual([])
  })

  it('가장 얕은 단계를 1로 당긴다', () => {
    expect(normalizeDepth(outline('## 가\n#### 나')).map((h) => h.level)).toEqual([1, 3])
    expect(normalizeDepth([])).toEqual([])
  })
})
