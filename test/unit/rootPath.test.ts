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

describe('normalizeRootInput · Windows 볼트', () => {
  const home = 'C:\\Users\\dave'
  it('드라이브·UNC 절대 경로와 따옴표를 받는다', () => {
    expect(n('"C:\\Users\\dave\\My Vault\\"', home)).toBe('C:\\Users\\dave\\My Vault')
    expect(n('D:/PARA/', home)).toBe('D:\\PARA')
    expect(n('\\\\server\\share\\PARA\\', home)).toBe('\\\\server\\share\\PARA')
  })
  it('탐색기 file URL 과 홈 축약을 해석한다', () => {
    expect(n('file:///C:/Users/dave/My%20Vault', home)).toBe('C:\\Users\\dave\\My Vault')
    expect(n('file://server/share/PARA', home)).toBe('\\\\server\\share\\PARA')
    expect(n('~\\PARA', home)).toBe('C:\\Users\\dave\\PARA')
  })
  it('드라이브 상대·현재 드라이브 상대 경로는 거절한다', () => {
    expect(n('C:PARA', home)).toBeNull()
    expect(n('\\PARA', home)).toBeNull()
  })
})
