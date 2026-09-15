import { describe, it, expect } from 'vitest'
import { isAutoSessionName, titleFromText as t } from '../../src/core/sessionTitle'

describe('isAutoSessionName', () => {
  it('앱이 붙인 이름만 자동으로 본다', () => {
    for (const n of ['세션 3', '세션', '메인', 'New session', 'Chat 2']) expect(isAutoSessionName(n)).toBe(true)
    for (const n of ['PRD 정리', '세션 정리 회의', '3분기 계획']) expect(isAutoSessionName(n)).toBe(false)
  })
})
describe('titleFromText', () => {
  it('짧은 말은 그대로', () => expect(t('PRD 를 읽어 줘')).toBe('PRD 를 읽어 줘'))
  it('첫 문장까지만', () => expect(t('이번 주 회고를 정리해 줘. 그리고 다음 주 계획도 뽑아 줘.')).toBe('이번 주 회고를 정리해 줘'))
  it('긴 말은 줄이고 … 를 붙인다', () => { const r = t('분기 보고서 초안을 만들고 숫자까지 채워서 슬라이드로 정리해 줘'); expect(r.length).toBeLessThanOrEqual(27); expect(r.endsWith('…')).toBe(true) })
  it('머리말·목록 마커와 코드블록은 걷어낸다', () => expect(t('```js\nconst a=1\n```\n## 빌드가 깨져요')).toBe('빌드가 깨져요'))
  it('슬래시 명령은 떼고 본다', () => { expect(t('/compact 지난 대화 줄여 줘')).toBe('지난 대화 줄여 줘'); expect(t('/clear')).toBe('/clear') })
  it('제목감이 없으면 빈 문자열', () => { expect(t('   ')).toBe(''); expect(t('')).toBe('') })
})
