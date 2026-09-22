import { describe, expect, it } from 'vitest'
import { JD_PRESET, PARA_PRESET, isSectionRoot, roleOf, sectionRoots } from '../../src/core/rules'

describe('AC · 칸(섹션) 자체는 봇이 될 수 없다', () => {
  it('🔴 PARA 의 다섯 칸이 모두 칸으로 잡힌다 — 종전엔 Resources·Archive·Inbox 가 통과했다', () => {
    expect(sectionRoots(PARA_PRESET).sort()).toEqual(['1. Inbox', '2. Projects', '3. Area', '4. Resources', '5. Archive'])
    for (const r of ['1. Inbox', '2. Projects', '3. Area', '4. Resources', '5. Archive']) expect(isSectionRoot(PARA_PRESET, r)).toBe(true)
  })

  it('칸 «안» 의 폴더는 봇이 된다 — 봇은 일 하나에 붙는다', () => {
    for (const r of ['4. Resources/2026_SelfMBA', '5. Archive/2026-07_강의', '2. Projects/인천라이징스타', '3. Area/제품_FolderBot'])
      expect(isSectionRoot(PARA_PRESET, r)).toBe(false)
  })

  it('끝의 슬래시·빈 값에 안 속는다', () => {
    expect(isSectionRoot(PARA_PRESET, '/4. Resources/')).toBe(true)
    expect(isSectionRoot(PARA_PRESET, '')).toBe(false)
    expect(isSectionRoot(PARA_PRESET, '4. Resource')).toBe(false)     // 이름이 비슷해도 칸이 아니다
  })

  it('역할 판정은 그대로다 — 칸 막기와 역할은 다른 일이다', () => {
    expect(roleOf(PARA_PRESET, '4. Resources')).toBe('reference')
    expect(roleOf(PARA_PRESET, '4. Resources/2026_SelfMBA')).toBe('reference')
    expect(roleOf(PARA_PRESET, '2. Projects/인천라이징스타')).toBe('active')
  })

  it('다른 프리셋(johnny-decimal)에서도 칸이 잡힌다 — `*/*` 같은 글롭은 칸으로 치지 않는다', () => {
    const sr = sectionRoots(JD_PRESET)
    expect(sr).toContain('00-09 System/00 Inbox')
    expect(sr).toContain('90-99 Archive')
    expect(sr.some((x) => x.includes('*'))).toBe(false)
    expect(isSectionRoot(JD_PRESET, '90-99 Archive/2020 옛 프로젝트')).toBe(false)
  })
})
