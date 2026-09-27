import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { parsePlanUsage, report, bindingReset, DEFAULT_BUDGET, type UsageEvent } from '../../src/core/usage'
import { queryPlan, refreshPlan, resetPlanForTest } from '../../src/host/planUsage'

/** BD · 실제 요금제 한도 — «0% 다 썼어요» 였는데 실제로는 75% 남아 있었다 (2026-09-27 Dave · 스크린샷_1233) */
const NOW = Date.parse('2026-09-27T03:30:00Z')
// 2.1.283 의 get_usage 응답을 그대로 줄인 것(실측)
const REAL = {
  subscription_type: 'max', rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 25, resets_at: '2026-09-27T05:00:00.352362+00:00', limit_dollars: null },
    seven_day: { utilization: 68, resets_at: '2026-09-28T02:00:00.352385+00:00' },
    seven_day_opus: null
  },
  limits: [{ kind: 'session', percent: 25, resets_at: '2026-09-27T05:00:00.352362+00:00' }, { kind: 'weekly_all', percent: 68, resets_at: '2026-09-28T02:00:00.352385+00:00' }]
}
// 구독 세션이 쌓는 모양 — 캐시 읽기가 막대하다. 정가로 환산하면 예산($6.40)을 한참 넘는다
const heavy: UsageEvent[] = Array.from({ length: 10 }, (_, i) => ({ t: NOW - (i + 1) * 60_000, tool: 'claude', model: 'claude-opus-5', input: 2000, output: 3000, cacheRead: 30_000_000, cacheWrite: 200_000 }))

describe('parsePlanUsage (BD)', () => {
  it('get_usage 응답에서 5시간·주간 사용 % 와 초기화 시각을 읽는다', () => {
    const p = parsePlanUsage(REAL, NOW)!
    expect(p.available).toBe(true)
    expect(p.five).toEqual({ used: 25, resetsAt: Date.parse('2026-09-27T05:00:00.352362+00:00') })
    expect(p.week?.used).toBe(68)
    expect(p.subscription).toBe('max')
  })
  it('rate_limits 가 없고 limits[] 만 와도 읽는다(/usage 의 usage_report 모양)', () => {
    const p = parsePlanUsage({ rate_limits: { limits: REAL.limits } }, NOW)!
    expect(p.five?.used).toBe(25); expect(p.week?.used).toBe(68)
  })
  it('API 키·3P 세션(rate_limits_available:false)은 한도 없음으로', () => {
    expect(parsePlanUsage({ rate_limits_available: false, rate_limits: null }, NOW)!.available).toBe(false)
  })
})

describe('report — 실제 한도가 있으면 추정 대신 그것을 쓴다 (BD)', () => {
  it('🔴 추정만으로는 0% «다 썼어요» 가 된다 — 고치기 전 동작', () => {
    const r = report(heavy, NOW, DEFAULT_BUDGET)
    expect(r.tools[0].left).toBe(0)
  })
  it('실제 한도가 있으면 더 빠듯한 창(주간 68%)으로 32% 남음, 다시 채워짐은 그 창의 시각', () => {
    const plan = parsePlanUsage(REAL, NOW)!
    const r = report(heavy, NOW, DEFAULT_BUDGET, { plan })
    expect(r.tools[0].left).toBe(32)
    expect(r.left).toBe(32)
    expect(r.resetAt).toBe(plan.week!.resetsAt)
    expect(r.plan?.available).toBe(true)
  })
  it('5시간 창이 더 빠듯하면 그 창의 초기화 시각', () => {
    const plan = parsePlanUsage({ ...REAL, rate_limits: { five_hour: { utilization: 90, resets_at: REAL.rate_limits.five_hour.resets_at }, seven_day: { utilization: 40, resets_at: REAL.rate_limits.seven_day.resets_at } } }, NOW)!
    expect(bindingReset(plan)).toBe(plan.five!.resetsAt)
    expect(report(heavy, NOW, DEFAULT_BUDGET, { plan }).tools[0].left).toBe(10)
  })
  it('한도 없는 계정이면 예산 추정 그대로(가짜 100% 를 만들지 않는다)', () => {
    const r = report(heavy, NOW, DEFAULT_BUDGET, { plan: { available: false, fetchedAt: NOW } })
    expect(r.tools[0].left).toBe(0)
  })
})

describe('queryPlan — CLI 에게 묻는다 (가짜 CLI · 모델 호출 없음)', () => {
  const stub = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
  beforeEach(() => { resetPlanForTest(); process.env.FOLDERBOT_CLI_BIN = stub })
  afterEach(() => { delete process.env.FOLDERBOT_CLI_BIN; delete process.env.STUB_PLAN; delete process.env.STUB_PLAN_FIVE })
  it('get_usage 제어 요청 → control_response 를 읽어 PlanUsage 로', async () => {
    process.env.STUB_PLAN_FIVE = '40'
    const p = await queryPlan()
    expect(p?.available).toBe(true); expect(p?.five?.used).toBe(40); expect(p?.week?.used).toBe(68)
  })
  it('옛 CLI(모르는 요청)면 null — 마지막 값이 있으면 그 값에 까닭만 붙는다', async () => {
    const first = await refreshPlan(); expect(first?.five?.used).toBe(25)
    process.env.STUB_PLAN = 'off'
    expect(await queryPlan()).toBeNull()
    const kept = await refreshPlan()                      // 실패해도 마지막 값을 버리지 않는다(추정으로 바꿔 치우지 않는다)
    expect(kept?.five?.used).toBe(25); expect(kept?.error).toMatch(/Unknown control request/)
  })
})
