import { describe, it, expect } from 'vitest'
import { extractMath, fillMath, placeholder } from '../../src/core/math'

describe('extractMath', () => {
  it('$ 가 없으면 그대로', () => expect(extractMath('안녕')).toEqual({ text: '안녕', chunks: [] }))
  it('인라인·블록을 자리표로', () => {
    const r = extractMath('식 $a_1+b$ 과\n\n$$\nE=mc^2\n$$\n끝')
    expect(r.chunks).toEqual([{ tex: 'a_1+b', display: false }, { tex: 'E=mc^2', display: true }])
    expect(r.text).toBe(`식 ${placeholder(0)} 과\n\n${placeholder(1)}\n끝`)
  })
  it('돈은 수식이 아니다 · 양끝 공백도 아니다', () => {
    expect(extractMath('$5 와 $10 이다').chunks).toEqual([])
    expect(extractMath('a $ b $ c').chunks).toEqual([])
  })
  it('코드 안의 $ 는 건드리지 않는다', () => {
    const src = '`$HOME/$x` 와\n```sh\necho $A $B\n```\n$y$'
    const r = extractMath(src)
    expect(r.chunks).toEqual([{ tex: 'y', display: false }])
    expect(r.text.startsWith('`$HOME/$x` 와\n```sh\necho $A $B\n```\n')).toBe(true)
  })
  it('\\$ 는 달러 글자', () => expect(extractMath('가격 \\$3').text).toBe('가격 $3'))
  it('닫히지 않은 $ 는 글자', () => expect(extractMath('a $b c').chunks).toEqual([]))
})

describe('fillMath', () => {
  const chunks = [{ tex: 'x<1', display: false }, { tex: 'y', display: true }]
  it('렌더러가 있으면 그 결과로', () => expect(fillMath(`<p>${placeholder(0)}</p>`, chunks, (c) => `<k>${c.tex}</k>`)).toBe('<p><k>x<1</k></p>'))
  it('없으면 원문을 이스케이프해 남긴다', () => expect(fillMath(`${placeholder(0)} ${placeholder(1)}`, chunks, null)).toBe('<code class="mathsrc">$x&lt;1$</code> <pre class="mathsrc">$$y$$</pre>'))
  it('렌더러가 던지면 원문으로', () => expect(fillMath(placeholder(1), chunks, () => { throw new Error('x') })).toBe('<pre class="mathsrc">$$y$$</pre>'))
})
