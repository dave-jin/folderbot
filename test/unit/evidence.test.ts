import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { settleCard, verifyEvidence, type EvidenceCtx } from '../../src/host/evidence'
import type { CardBody } from '../../src/core/contextCard'
import type { ChatItem } from '../../src/core/types'

const HASH = 'a1b2c3d4e5f6'
const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
let tmp = '', root = '', outside = ''
const items: ChatItem[] = [
  { id: 't-ok', t: 1, kind: 'tool', name: 'Bash', summary: 'git commit', result: `[main ${HASH}] feat: 근거 확인\n 2 files changed` },
  { id: 't-full', t: 2, kind: 'tool', name: 'Bash', summary: 'git log', result: `commit ${FULL}` },
  { id: 't-err', t: 3, kind: 'tool', name: 'Bash', summary: 'git push', result: 'fatal: deadbeef12 rejected', isError: true },
  { id: 'a-1', t: 4, kind: 'assistant', text: `끝: ${HASH}` },
]
let c: EvidenceCtx

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'fb-evidence-'))
  root = join(tmp, 'vault'); outside = join(tmp, 'outside.txt')
  mkdirSync(join(root, '1. Projects/P'), { recursive: true })
  mkdirSync(join(root, '2. Area/개인_비서실/할일이/싱크/to-folderbot'), { recursive: true })
  writeFileSync(join(root, '1. Projects/P/readme.md'), 'x')
  writeFileSync(join(root, '2. Area/개인_비서실/할일이/싱크/to-folderbot/편지.md'), 'x')
  writeFileSync(outside, 'secret')
  symlinkSync(outside, join(root, '1. Projects/P/link.md'))
  c = { vaultRoot: root, items }
})
afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('verifyEvidence · file', () => {
  it('볼트 안에 있는 상대 경로는 참', () => expect(verifyEvidence({ kind: 'file', ref: '1. Projects/P/readme.md' }, c)).toBe(true))
  it('없는 경로는 거짓', () => expect(verifyEvidence({ kind: 'file', ref: '1. Projects/P/없음.md' }, c)).toBe(false))
  it('../ 로 볼트를 벗어나면 거짓', () => {
    expect(verifyEvidence({ kind: 'file', ref: '../outside.txt' }, c)).toBe(false)
    expect(verifyEvidence({ kind: 'file', ref: '1. Projects/../../outside.txt' }, c)).toBe(false)
  })
  it('볼트 밖 절대경로는 거짓 · 안쪽 절대경로는 참', () => {
    expect(verifyEvidence({ kind: 'file', ref: outside }, c)).toBe(false)
    expect(verifyEvidence({ kind: 'file', ref: join(root, '1. Projects/P/readme.md') }, c)).toBe(true)
  })
  it('이름이 볼트 이름으로 시작하는 옆 폴더는 거짓(접두 비교 함정)', () => {
    mkdirSync(join(tmp, 'vault-evil'), { recursive: true }); writeFileSync(join(tmp, 'vault-evil/a.md'), 'x')
    expect(verifyEvidence({ kind: 'file', ref: '../vault-evil/a.md' }, c)).toBe(false)
  })
  it('볼트 밖을 가리키는 심링크는 거짓', () => expect(verifyEvidence({ kind: 'file', ref: '1. Projects/P/link.md' }, c)).toBe(false))
  it('볼트 자신·빈 경로는 거짓', () => {
    expect(verifyEvidence({ kind: 'file', ref: '.' }, c)).toBe(false)
    expect(verifyEvidence({ kind: 'file', ref: '' }, c)).toBe(false)
  })
  it('폴더는 거짓 — 봇 폴더처럼 늘 있는 경로로 «끝남» 을 만들 수 없다(최종 검토 4)', () => {
    expect(verifyEvidence({ kind: 'file', ref: '1. Projects/P' }, c)).toBe(false)
    expect(verifyEvidence({ kind: 'file', ref: '1. Projects/P/' }, c)).toBe(false)
    expect(verifyEvidence({ kind: 'letter', ref: '1. Projects/P' }, c)).toBe(false)
  })
})

describe('verifyEvidence · letter', () => {
  it('우편함 아래 실제 파일이면 참', () => expect(verifyEvidence({ kind: 'letter', ref: '2. Area/개인_비서실/할일이/싱크/to-folderbot/편지.md' }, c)).toBe(true))
  it('우편함 밖이면 file 과 같은 판정', () => {
    expect(verifyEvidence({ kind: 'letter', ref: '1. Projects/P/readme.md' }, c)).toBe(true)
    expect(verifyEvidence({ kind: 'letter', ref: '1. Projects/P/없음.md' }, c)).toBe(false)
    expect(verifyEvidence({ kind: 'letter', ref: '../outside.txt' }, c)).toBe(false)
  })
  it('우편함 안이라도 없는 편지는 거짓', () => expect(verifyEvidence({ kind: 'letter', ref: '2. Area/개인_비서실/할일이/싱크/to-folderbot/없음.md' }, c)).toBe(false))
})

describe('verifyEvidence · commit', () => {
  it('성공한 도구 결과에 해시가 나오면 참', () => expect(verifyEvidence({ kind: 'commit', ref: HASH }, c)).toBe(true))
  it('40자 해시도 참(길이 40 을 거르지 않는다)', () => expect(verifyEvidence({ kind: 'commit', ref: FULL }, c)).toBe(true))
  it('앞 7자만 써도 전체 해시가 나온 결과면 참', () => expect(verifyEvidence({ kind: 'commit', ref: FULL.slice(0, 7) }, c)).toBe(true))
  it('오류 item 에만 나오면 거짓', () => expect(verifyEvidence({ kind: 'commit', ref: 'deadbeef12' }, c)).toBe(false))
  it('어시스턴트 말에만 나오면 거짓', () => {
    const only: EvidenceCtx = { vaultRoot: root, items: [items[3]] }
    expect(verifyEvidence({ kind: 'commit', ref: HASH }, only)).toBe(false)
  })
  it('해시 꼴이 아니면 거짓(짧음·대문자·정규식 글자)', () => {
    for (const ref of ['abc12', 'A1B2C3D4E5F6', 'a1b2c3d.*', '', 'g1b2c3d4e5f6']) expect(verifyEvidence({ kind: 'commit', ref }, c)).toBe(false)
  })
  it('다른 해시의 가운데 토막은 거짓', () => expect(verifyEvidence({ kind: 'commit', ref: 'b2c3d4e5f607' }, c)).toBe(false))
})

describe('verifyEvidence · tool', () => {
  it('성공한 tool item id 면 참', () => expect(verifyEvidence({ kind: 'tool', ref: 't-ok' }, c)).toBe(true))
  it('isError 면 거짓', () => expect(verifyEvidence({ kind: 'tool', ref: 't-err' }, c)).toBe(false))
  it('없는 id 면 거짓', () => expect(verifyEvidence({ kind: 'tool', ref: 'nope' }, c)).toBe(false))
  it('tool 이 아닌 item 이면 거짓', () => expect(verifyEvidence({ kind: 'tool', ref: 'a-1' }, c)).toBe(false))
})

describe('settleCard', () => {
  const base = (over: Partial<CardBody>): CardBody => ({ intent: '근거 확인', done: [], promised: [], ending: 'finished', taskHint: '', ...over })
  it('근거 둘 중 하나만 맞으면 그 근거만 남긴다', () => {
    const r = settleCard(base({ done: [{ text: '모듈 추가', ev: [{ kind: 'file', ref: '1. Projects/P/없음.md' }, { kind: 'tool', ref: 't-ok' }] }] }), c)
    expect(r.done).toEqual([{ text: '모듈 추가', ev: [{ kind: 'tool', ref: 't-ok' }] }])
    expect(r.promised).toEqual([])
    expect(r.ending).toBe('finished')
  })
  it('근거가 다 틀린 done 줄은 promised 로 옮긴다', () => {
    const r = settleCard(base({ promised: ['배포'], done: [
      { text: '있는 일', ev: [{ kind: 'file', ref: '1. Projects/P/readme.md' }] },
      { text: '지어낸 일', ev: [{ kind: 'tool', ref: 't-err' }] },
      { text: '근거 없는 일', ev: [] },
    ] }), c)
    expect(r.done.map((d) => d.text)).toEqual(['있는 일'])
    expect(r.promised).toEqual(['배포', '지어낸 일', '근거 없는 일'])
    expect(r.ending).toBe('finished')
  })
  it('done 이 비면 finished 는 claimed 가 된다', () => {
    const r = settleCard(base({ done: [{ text: '지어낸 일', ev: [{ kind: 'commit', ref: 'deadbeef12' }] }] }), c)
    expect(r.done).toEqual([]); expect(r.promised).toEqual(['지어낸 일']); expect(r.ending).toBe('claimed')
  })
  it('다른 끝맺음은 그대로 둔다', () => {
    for (const ending of ['cut', 'waiting_dave', 'running', 'claimed'] as const)
      expect(settleCard(base({ ending, done: [{ text: 'x', ev: [] }] }), c).ending).toBe(ending)
  })
  it('원본을 바꾸지 않고, 이미 promised 에 있는 글은 겹쳐 넣지 않는다', () => {
    const b = base({ promised: ['지어낸 일'], done: [{ text: '지어낸 일', ev: [] }] })
    const r = settleCard(b, c)
    expect(r.promised).toEqual(['지어낸 일']); expect(b.done).toHaveLength(1); expect(b.ending).toBe('finished')
  })
})
