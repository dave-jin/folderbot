import { describe, it, expect } from 'vitest'
import { mdPlain, notePlain } from '../../src/core/mdPlain'

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
  it('줄 맨 앞의 연도는 번호 목록이 아니다', () => {
    expect(mdPlain('2026. 9. 25 회의록\n1. 첫 안건')).toBe('2026. 9. 25 회의록 첫 안건')
  })
  it('줄 가운데 ``` 는 펜스가 아니다 · 주소 속 괄호', () => {
    expect(mdPlain('Use ```npm run qa``` now')).toBe('Use npm run qa now')
    expect(mdPlain('[문서](https://x.test/a_(b)) 끝')).toBe('문서 끝')
    expect(mdPlain('[제목](https://x.test "설명") 과')).toBe('제목 과')
  })
  it('위키링크는 별칭을, 없으면 이름을', () => {
    expect(mdPlain('[[문서|별칭]] 과 [[다른 문서]]')).toBe('별칭 과 다른 문서')
  })
  it('그림 블록은 줄 글 대신 무엇의 그림인지만 — 알림에 `[x] 기획 | 10/28 …` 이 나가지 않는다 (2026-11-13)', () => {
    expect(mdPlain('정리했어요.\n\n```steps\ntitle: 강의 준비\n[x] 기획 | 10/28 확정\n[>] 슬라이드\n```\n\n끝')).toBe('정리했어요. (단계 그림 · 강의 준비) 끝')
    expect(mdPlain('```compare\n# A *\n준비: 2시간\n# B\n준비: 4시간\n```')).toBe('(안 비교 그림)')
    expect(mdPlain('```chart\n제목: 회차별 신청\n1회: 24\n2회: 33\n```')).toBe('(숫자 그림 · 회차별 신청)')
    expect(mdPlain('```js\nconst a = 1\n```')).toBe('const a = 1')   // 다른 코드는 종전대로 글자를 남긴다
  })
  it('승인 대기 알림은 명령 원문 그대로 · 답 알림만 평문', () => {
    expect(notePlain({ kind: 'awaiting', body: 'Bash: rm -rf ~/tmp/* ~/x/*' })).toBe('Bash: rm -rf ~/tmp/* ~/x/*')
    expect(notePlain({ kind: 'error', body: '__init__.py 없음' })).toBe('__init__.py 없음')
    expect(notePlain({ kind: 'done', body: '## 끝 **완료**' })).toBe('끝 완료')
  })
})
