import { describe, it, expect } from 'vitest'
import { normalizeRootInput as n } from '../../src/core/rootPath'

const HOME = '/Users/dave'
describe('normalizeRootInput', () => {
  it('절대 경로는 그대로', () => expect(n('/Users/dave/PARA', HOME)).toBe('/Users/dave/PARA'))
  it('물결을 홈으로 편다', () => { expect(n('~', HOME)).toBe(HOME); expect(n('~/PARA', HOME)).toBe('/Users/dave/PARA') })
  it('따옴표·이스케이프·file:// 를 벗긴다', () => {
    expect(n("'/Users/dave/My Vault'", HOME)).toBe('/Users/dave/My Vault')
    expect(n('/Users/dave/My\\ Vault', HOME)).toBe('/Users/dave/My Vault')
    expect(n('file:///Users/dave/My%20Vault', HOME)).toBe('/Users/dave/My Vault')
  })
  it('끝의 슬래시를 떼되 루트는 남긴다', () => { expect(n('/Users/dave/PARA//', HOME)).toBe('/Users/dave/PARA'); expect(n('/', HOME)).toBe('/') })
  it('상대 경로·빈 값은 거절', () => { expect(n('PARA', HOME)).toBeNull(); expect(n('  ', HOME)).toBeNull() })
})
