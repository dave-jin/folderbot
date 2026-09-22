import { describe, expect, it } from 'vitest'
import { confirmLine, cronOk, describeCron, formatNext, nextRunOf, parseWhen } from '../../src/core/when'

const cron = (s: string) => { const r = parseWhen(s); if (!r.ok) throw new Error('못 읽음: ' + s + ' · ' + JSON.stringify(r)); return r.cron }
const text = (s: string) => { const r = parseWhen(s); if (!r.ok) throw new Error('못 읽음: ' + s); return r.text }

describe('AA-3 · 주기를 사람 말로', () => {
  it('🔴 「20」 은 추측하지 않고 되묻는다 — 이번 사고가 정확히 이 지점이다', () => {
    const r = parseWhen('20')
    expect(r.ok).toBe(false)
    if (r.ok || !('ask' in r)) throw new Error('되물어야 한다')
    expect(r.ask.options.map((o) => o.cron)).toEqual(['0 20 * * *', '20 * * * *'])
    expect(r.ask.q).toContain('20시')
    expect(r.ask.q).toContain('매시 20분')
  })

  it('Dave 가 준 예시가 전부 유효한 5필드 cron 이 된다', () => {
    expect(cron('매일 저녁 8시')).toBe('0 20 * * *')
    expect(cron('평일 아침 9시 반')).toBe('30 9 * * 1-5')
    expect(cron('일요일 오전 10시')).toBe('0 10 * * 0')
    expect(cron('두 시간마다')).toBe('0 */2 * * *')
    expect(cron('매달 1일 아침')).toBe('0 9 1 * *')
    expect(cron('20시')).toBe('0 20 * * *')
    for (const s of ['매일 저녁 8시', '평일 아침 9시 반', '일요일 오전 10시', '두 시간마다', '매달 1일 아침', '20시'])
      expect(cronOk(cron(s))).toEqual({ ok: true })
  })

  it('오전·오후를 시각에 제대로 얹는다', () => {
    expect(cron('오후 3시')).toBe('0 15 * * *')
    expect(cron('밤 11시')).toBe('0 23 * * *')
    expect(cron('오전 12시')).toBe('0 0 * * *')      // 자정
    expect(cron('정오')).toBe('0 12 * * *')
    expect(cron('매일 20:30')).toBe('30 20 * * *')
    expect(cron('오후 3시 20분')).toBe('20 15 * * *')
  })

  it('🔴 말한 시각이 곧 약속이다 — :00·:30 을 피해 분을 옮기지 않는다', () => {
    expect(cron('매일 저녁 8시').split(' ')[0]).toBe('0')
    expect(cron('매일 아침 9시 반').split(' ')[0]).toBe('30')
    expect(cron('매일 밤 10시')).toBe('0 22 * * *')
  })

  it('요일·간격·매시', () => {
    expect(cron('매주 월요일')).toBe('0 9 * * 1')
    expect(cron('주말 아침 8시')).toBe('0 8 * * 0,6')
    expect(cron('30분마다')).toBe('*/30 * * * *')
    expect(cron('매시 20분')).toBe('20 * * * *')
    expect(text('평일 아침 9시 반')).toBe('평일 아침 9시 30분')
  })

  it('이미 cron 식이면 그대로 두되 **서는지 확인**한다 — 봇이 지어낸 cron 도 여기서 걸린다', () => {
    expect(cron('0 20 * * *')).toBe('0 20 * * *')
    const bad = parseWhen('0 99 * * *')
    expect(bad.ok).toBe(false)
    if (bad.ok || 'ask' in bad) throw new Error('이유를 줘야 한다')
    expect(bad.examples.length).toBeGreaterThan(0)
  })

  it('못 읽으면 지어내지 않고 이유와 예시를 준다', () => {
    for (const s of ['', '언젠가', '가끔']) {
      const r = parseWhen(s)
      expect(r.ok).toBe(false)
      if (r.ok || 'ask' in r) throw new Error('이유를 줘야 한다: ' + s)
      expect(r.examples).toContain('매일 저녁 8시')
    }
    const r2 = parseWhen('100분마다'); expect(r2.ok).toBe(false)
  })

  it('cron 을 사람 말로 되읽는다 — 목록에 원시 cron 을 띄우지 않으려고', () => {
    expect(describeCron('0 20 * * *')).toBe('매일 저녁 8시')
    expect(describeCron('30 9 * * 1-5')).toBe('평일 아침 9시 30분')
    expect(describeCron('0 */2 * * *')).toBe('2시간마다')
    expect(describeCron('20 * * * *')).toBe('매시 20분')
    expect(describeCron('0 9 1 * *')).toBe('매달 1일 아침 9시')
    expect(describeCron('0 10 * * 0')).toBe('일요일 아침 10시')
    expect(describeCron('20')).toBe('20')            // 못 읽는 건 있는 그대로 — 지어내지 않는다
  })

  it('다음 실행을 사람이 읽는 꼴로 — 요일까지 붙여야 «내일이네» 를 안다', () => {
    const from = new Date(2026, 8, 22, 21, 0, 0)     // 2026-09-22(화) 21:00
    expect(formatNext(nextRunOf('0 20 * * *', from))).toBe('9/23(수) 20:00')
    expect(nextRunOf('20', from)).toBeNull()
    expect(confirmLine('0 20 * * *', from)).toBe('매일 저녁 8시에 돌립니다. 다음 실행은 9/23(수) 20:00 입니다.')
  })
})

describe('AA-3 · 때 이름이 왕복한다', () => {
  it('말한 대로 되읽힌다 — 저녁 8시 ↔ 20시 · 밤 9시 ↔ 21시', () => {
    for (const s of ['저녁 8시', '밤 9시', '밤 10시', '아침 9시', '오후 3시', '새벽 5시']) {
      const r = parseWhen(`매일 ${s}`)
      if (!r.ok) throw new Error('못 읽음: ' + s)
      expect(describeCron(r.cron)).toBe(`매일 ${s}`)
    }
  })
})
