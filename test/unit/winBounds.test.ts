import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

type Rect = { x?: number; y?: number; width: number; height: number }
const require_ = createRequire(import.meta.url)
const { pickBounds, trayPanelPosition, DEF } = require_('../../desktop/winBounds.js') as {
  pickBounds: (saved: Rect | null, displays: { workArea: Rect & { x: number; y: number } }[]) => Rect
  trayPanelPosition: (tray: { x: number; y: number; width: number; height: number }, work: { x: number; y: number; width: number; height: number }, width: number, height: number, os: string) => { x: number; y: number }
  DEF: Rect
}

const MAIN = { workArea: { x: 0, y: 25, width: 1800, height: 1100 } }
const SIDE = { workArea: { x: 1800, y: 0, width: 1920, height: 1080 } }

describe('pickBounds', () => {
  it('처음 켜면 기본 크기', () => expect(pickBounds(null, [MAIN])).toEqual(DEF))
  it('보이는 자리는 그대로 살린다', () => expect(pickBounds({ x: 120, y: 80, width: 1400, height: 900 }, [MAIN])).toEqual({ x: 120, y: 80, width: 1400, height: 900 }))
  it('붙였던 모니터가 없어지면 크기만 살리고 자리는 버린다', () => expect(pickBounds({ x: 2400, y: 300, width: 1400, height: 900 }, [MAIN])).toEqual({ width: 1400, height: 900 }))
  it('그 모니터가 그대로면 그 자리에 뜬다', () => expect(pickBounds({ x: 2400, y: 300, width: 1400, height: 900 }, [MAIN, SIDE])).toEqual({ x: 2400, y: 300, width: 1400, height: 900 }))
  it('최소 크기보다 작게는 안 뜬다', () => expect(pickBounds({ x: 10, y: 40, width: 300, height: 200 }, [MAIN])).toEqual({ x: 10, y: 40, width: 720, height: 520 }))
  it('자리가 망가진 기록은 크기만', () => expect(pickBounds({ x: NaN, y: 0, width: 1000, height: 700 }, [MAIN])).toEqual({ width: 1000, height: 700 }))
})

describe('trayPanelPosition', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  it('Windows 작업 표시줄 위에 패널을 붙인다', () => {
    expect(trayPanelPosition({ x: 1800, y: 1040, width: 32, height: 40 }, area, 320, 420, 'win32')).toEqual({ x: 1596, y: 616 })
  })
  it('macOS 메뉴바 아래에 붙이고 화면 밖으로는 보내지 않는다', () => {
    expect(trayPanelPosition({ x: 20, y: 0, width: 24, height: 25 }, area, 320, 420, 'darwin')).toEqual({ x: 4, y: 27 })
  })
})
