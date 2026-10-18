import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { nextDawn, dawnStep } = require('../../desktop/dawn.js') as { nextDawn: (now: number) => number; dawnStep: (now: number, o?: { busy?: number; routineSoon?: boolean; at?: number }) => { act: 'apply' } | { act: 'wait'; at: number; why: string } }

/**
 * BX · «새벽 4시에 적용» (2026-10-19 Dave «A» — 연결 목업 ③A). 9/15 결정(자동 적용 없음)은 그대로 — 사람이 누른 적용의 «시각» 만 옮긴다.
 * 4시에 도는 세션·30분 안 루틴이 있으면 30분씩 미루고, 5시를 넘기면 다음 날 4시로. 켜지다 실패하면 되돌리는 장치는 apply-script 그대로.
 */
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0, 0).getTime()

describe('BX · 새벽 적용 시각 (desktop/dawn.js)', () => {
  it('다음 새벽 4시 — 4시 전이면 오늘, 아니면 내일', () => {
    expect(nextDawn(at(19, 2))).toBe(at(19, 4))
    expect(nextDawn(at(19, 4))).toBe(at(20, 4))         // 딱 4시면 이미 지난 것 — 내일
    expect(nextDawn(at(19, 14, 30))).toBe(at(20, 4))
    expect(nextDawn(new Date(2026, 9, 31, 23, 0).getTime())).toBe(new Date(2026, 10, 1, 4, 0).getTime())   // 달이 넘어간다
  })
  it('한가하면 바로 적용', () => {
    expect(dawnStep(at(20, 4), { busy: 0, routineSoon: false, at: at(20, 4) })).toEqual({ act: 'apply' })
  })
  it('🔴 도는 세션이나 30분 안 루틴이 있으면 30분씩 미룬다 · 5시를 넘기면 다음 날 4시', () => {
    expect(dawnStep(at(20, 4), { busy: 2, at: at(20, 4) })).toMatchObject({ act: 'wait', at: at(20, 4, 30), why: expect.stringMatching(/세션 2개/) })
    expect(dawnStep(at(20, 4, 30), { routineSoon: true, at: at(20, 4, 30) })).toMatchObject({ act: 'wait', at: at(20, 5), why: expect.stringMatching(/루틴/) })
    expect(dawnStep(at(20, 5), { busy: 1, at: at(20, 5) })).toMatchObject({ act: 'wait', at: at(21, 4), why: expect.stringMatching(/내일/) })
  })
  it('예약 시각을 90분 넘게 놓쳤으면(앱이 꺼져 있었다) 아침에 갈아끼우지 않고 다음 새벽으로', () => {
    expect(dawnStep(at(20, 9), { busy: 0, at: at(20, 4) })).toMatchObject({ act: 'wait', at: at(21, 4) })
    expect(dawnStep(at(20, 4, 50), { busy: 0, at: at(20, 4) })).toEqual({ act: 'apply' })   // 50분 늦음 — 아직 새벽 창 안
    expect(dawnStep(at(20, 5, 2), { busy: 0, at: at(20, 5) })).toEqual({ act: 'apply' })    // 5:00 칸은 30초 눈금 여유 안
    // 🔴 새벽 창(5:00 + 5분)을 넘겨 깼으면 90분 안이어도 다음 새벽 — 5:29 에 깬 맥이 아침에 갈아끼우지 않게
    expect(dawnStep(at(20, 5, 29), { busy: 0, at: at(20, 4) })).toMatchObject({ act: 'wait', at: at(21, 4) })
    expect(dawnStep(at(20, 6, 25), { busy: 0, at: at(20, 5) })).toMatchObject({ act: 'wait', at: at(21, 4) })
  })
  it('updater 는 dawn.js 를 쓰고, 셸·화면·호스트가 같은 손잡이를 쓴다', () => {
    const d = join(process.cwd(), 'desktop')
    expect(readFileSync(join(d, 'updater.js'), 'utf8')).toMatch(/require\('\.\/dawn'\)/)
    expect(readFileSync(join(d, 'preload.js'), 'utf8')).toMatch(/fb:update-dawn/)
    expect(readFileSync(join(d, 'main.js'), 'utf8')).toMatch(/ipcMain\.handle\('fb:update-dawn'/)
    expect(readFileSync(join(d, 'main.js'), 'utf8')).toMatch(/update: \{ state: \(\) => updater\.state\(\), dawn:/)
    expect(readFileSync(join(d, 'electron-builder.yml'), 'utf8')).toMatch(/^\s*- dawn\.js$/m)
  })
})
