import { describe, it, expect } from 'vitest'
import { readPos, writePos, DOCPOS_KEY, CAP } from '../../src/client/docPos'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m } }

describe('docPos — 문서마다 읽던 자리 (DW)', () => {
  it('줄·글자 위치를 남기고 읽는다', () => {
    const s = mem(); writePos('b\0a.md', { l: 120, c: 7 }, s)
    expect(readPos('b\0a.md', s)).toEqual({ l: 120, c: 7 })
  })
  it('픽셀 자리도 남긴다(원문·읽기 전용)', () => {
    const s = mem(); writePos('b\0a.txt', { y: 812.6 }, s)
    expect(readPos('b\0a.txt', s)).toEqual({ y: 813 })
  })
  it('봇이 다르면 같은 이름 파일이라도 따로다', () => {
    const s = mem(); writePos('b1\0state.md', { l: 40 }, s)
    expect(readPos('b2\0state.md', s)).toBeUndefined()
  })
  it('맨 위로 돌아오면 지운다', () => {
    const s = mem(); writePos('b\0a.md', { l: 30 }, s); writePos('b\0a.md', { l: 1 }, s)
    expect(readPos('b\0a.md', s)).toBeUndefined()
    expect(JSON.parse(s.m.get(DOCPOS_KEY)!)).toEqual({})
  })
  it('넘치면 오래 안 본 것부터 버린다', () => {
    const s = mem()
    for (let i = 0; i < CAP + 5; i++) writePos(`b\0f${i}.md`, { l: 10 }, s, 1000 + i)
    expect(Object.keys(JSON.parse(s.m.get(DOCPOS_KEY)!)).length).toBe(CAP)
    expect(readPos('b\0f0.md', s)).toBeUndefined()
    expect(readPos(`b\0f${CAP + 4}.md`, s)).toEqual({ l: 10 })
  })
  it('깨진 저장값은 없는 것으로 본다', () => {
    const s = mem(); s.setItem(DOCPOS_KEY, '{oops')
    expect(readPos('b\0a.md', s)).toBeUndefined()
    writePos('b\0a.md', { l: 5 }, s); expect(readPos('b\0a.md', s)).toEqual({ l: 5 })
  })
})
