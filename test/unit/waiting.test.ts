import { describe, expect, it } from 'vitest'
import { HOLD_AFTER_MS, HOLD_LONG_MS, HOLD_MID_MS, delegatingKind, elapsedText, holdHeader, holdKindOf, holdLine, holdStage, holderOf } from '../../src/core/waiting'

const fl = (name: string, agoMs: number, summary?: string) => ({ name, summary, since: 1_000_000 - agoMs })
const NOW = 1_000_000

describe('AB · 기다림을 보이게', () => {
  it('🔴 «내가 생각 중»과 «남을 기다리는 중»이 갈린다 — 종전엔 running 하나가 둘을 덮었다', () => {
    expect(holderOf('running', null, NOW)).toBe('me')
    expect(holderOf('running', fl('Read', 1000), NOW)).toBe('me')
    expect(holderOf('running', fl('Task', 1000), NOW)).toBe('other')       // 맡기는 도구는 곧바로
  })

  it('🔴 모르는 도구도 **오래 붙들려 있으면** 남을 기다리는 것이다 — 이름 목록은 반드시 낡는다', () => {
    expect(holderOf('running', fl('무언가새도구', HOLD_AFTER_MS - 1), NOW)).toBe('me')
    expect(holderOf('running', fl('무언가새도구', HOLD_AFTER_MS), NOW)).toBe('other')
  })

  it('공을 누가 들고 있나 — 넷뿐이다', () => {
    expect(holderOf('awaiting_input', null, NOW)).toBe('you')
    expect(holderOf('idle', null, NOW)).toBe('none')
    expect(holderOf('done', fl('Task', 99999), NOW)).toBe('none')          // 끝났으면 도구가 남아 있어도 아무도 안 들고 있다
    expect(holderOf(null, null, NOW)).toBe('none')
  })

  it('맡기는 도구를 종류로 가른다 — 모르는 것은 그냥 «도구»', () => {
    expect(delegatingKind('Task')).toBe('bot')
    expect(delegatingKind('mcp__folderbot__bot_send')).toBe('bot')
    expect(delegatingKind('aside_repl')).toBe('web')
    expect(delegatingKind('mcp__draw-image__generate')).toBe('tool')
    expect(delegatingKind('Read')).toBeNull()
    expect(holdKindOf(fl('Read', 0))).toBe('tool')
    expect(holdKindOf(null)).toBe('tool')
  })

  it('🔴 2분이 넘으면 화면이 먼저 «가도 된다» 고 말한다', () => {
    const l = holdLine('other', fl('Task', HOLD_LONG_MS), HOLD_LONG_MS)
    expect(l.text).toContain('다른 일 보셔도 됩니다')
    expect(l.action).toBe('notify'); expect(l.actionLabel).toBe('알림 켜기')
    expect(l.elapsed).toBe('2분 0초')
  })

  it('문구가 셋으로 갈린다 — 기다리는 중 · 아직 + 경과 · 가도 된다', () => {
    expect(holdStage(0)).toBe('short'); expect(holdStage(HOLD_MID_MS)).toBe('mid'); expect(holdStage(HOLD_LONG_MS)).toBe('long')
    const a = holdLine('other', fl('Task', 5000, '개인_북극성'), 5000)
    expect(a.text).toBe('개인_북극성 의 답을 기다리는 중'); expect(a.elapsed).toBe('')     // 30초 안에는 초를 안 센다(재촉처럼 보인다)
    const b = holdLine('other', fl('Task', 65_000, '개인_북극성'), 65_000)
    expect(b.text).toContain('아직'); expect(b.elapsed).toBe('1분 5초'); expect(b.action).toBe('open'); expect(b.actionLabel).toBe('그 봇 보기')
    const w = holdLine('other', fl('aside_repl', 40_000, '대한항공 마이페이지'), 40_000)
    expect(w.text).toBe('아직 대한항공 마이페이지 작업을 기다리는 중'); expect(w.actionLabel).toBe('브라우저 보기')
  })

  it('내가 생각 중일 때는 30초가 지나야 초를 센다', () => {
    expect(holdLine('me', null, 5_000)).toMatchObject({ text: '생각하는 중', elapsed: '', action: 'none' })
    expect(holdLine('me', null, 45_000).elapsed).toBe('45초')
  })

  it('경과를 사람이 읽는 꼴로', () => {
    expect(elapsedText(0)).toBe('0초'); expect(elapsedText(59_900)).toBe('59초')
    expect(elapsedText(60_000)).toBe('1분 0초'); expect(elapsedText(125_000)).toBe('2분 5초')
  })

  it('🔴 레일·헤더·대기 줄이 **같은 값**에서 나온다 — 셋이 다른 말을 하면 어느 쪽도 못 믿는다', () => {
    const f = fl('Task', 1000, '개인_북극성')
    expect(holdHeader(holderOf('running', f, NOW), f)).toBe('다른 에이전트의 답을 기다리는 중')
    expect(holdHeader(holderOf('running', null, NOW), null)).toBe('생각 중')
    expect(holdHeader(holderOf('awaiting_input', null, NOW), null)).toBe('확인해 주세요')
    expect(holdHeader(holderOf('idle', null, NOW), null)).toBe('')
  })
})

describe('AB · 🔴 턴이 끝나도 남이 일하면 화면은 안 조용해진다 (2319)', () => {
  it('백그라운드 에이전트가 남아 있으면 여전히 «남이 들고 있다»', () => {
    expect(holderOf('done', null, NOW, 1)).toBe('other')
    expect(holderOf('idle', null, NOW, 2)).toBe('other')
    expect(holderOf('done', null, NOW, 0)).toBe('none')       // 아무도 안 남았으면 끝난 것이다
    expect(holdKindOf(null, 1)).toBe('bot')
    expect(holdHeader('other', null, 1)).toBe('다른 에이전트의 답을 기다리는 중')
    expect(holdLine('other', null, 5000, 1).text).toBe('다른 에이전트 의 답을 기다리는 중')
  })
})
