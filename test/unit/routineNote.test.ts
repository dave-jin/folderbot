import { describe, it, expect, afterEach } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NOTE_OPEN, NOTE_CLOSE, renderNote, replaceBlock } from '../../src/core/routineNote'
import { RoutineNotes } from '../../src/host/routineNotes'
import type { ChangeRow } from '../../src/core/routineBoard'
import type { Bot } from '../../src/core/types'

/**
 * RB-3 · 루틴이 바뀌면 그 폴더 CLAUDE.md 끝 «⏰ 이 폴더의 루틴» 구역을 Folder Bot 이 새로 쓴다
 * (2026-10-30 Dave: «바로 고치되 고친것을 각 폴더봇이 알도록 claude.md 에 적어두어야 함»).
 */
const at = (s: string) => new Date(s).getTime()
const ch = (o: Partial<ChangeRow>): ChangeRow => ({ at: at('2026-10-30T14:02:00'), botId: 'b', routine: '기업문의 챙기기', actor: '오케스트레이터', what: '시각 21:00 → 21:20', why: '20~21시 몰림 풀기', ...o })

describe('renderNote', () => {
  it('설계 §6 모양 — 정본 줄 · 루틴 줄(주기) · 꺼 둠 · 최근 바뀜 5건까지', () => {
    const changes = Array.from({ length: 6 }, (_, i) => ch({ at: at('2026-10-30T14:00:00') + i * 60_000, what: `바뀜 ${i}` }))
    const t = renderNote([{ name: '기업문의 챙기기', cron: '0 */3 * * *', enabled: true }, { name: '이슬기 대관문의 발송', cron: '0 10 * * *', enabled: false }], changes, '.bot.yml')!
    expect(t.startsWith(NOTE_OPEN)).toBe(true)
    expect(t.endsWith(NOTE_CLOSE)).toBe(true)
    expect(t).toContain('## ⏰ 이 폴더의 루틴')
    expect(t).toContain('정본은 `.bot.yml` 이다.')
    expect(t).toMatch(/- 기업문의 챙기기 — .+/)
    expect(t).toMatch(/- 이슬기 대관문의 발송 — .+ \(꺼 둠\)/)
    expect(t).toContain('· 오케스트레이터 · 기업문의 챙기기 · 바뀜 5 · 이유: 20~21시 몰림 풀기')
    expect(t).not.toContain('바뀜 0')          // 6건째(가장 오래된 것)는 잘린다
    expect(t).toContain('`.folderbot/ops/routine-changes.jsonl`')
  })
  it('루틴이 0개면 null', () => expect(renderNote([], [], '.bot.yml')).toBeNull())
  it('바뀐 기록이 없으면 «최근 바뀜» 절이 없다', () => expect(renderNote([{ name: 'a', cron: '0 9 * * *', enabled: true }], [], '.bot.yml')).not.toContain('최근 바뀜'))
})

describe('replaceBlock', () => {
  const block = (x: string) => `${NOTE_OPEN}\n${x}\n${NOTE_CLOSE}`
  it('replaceBlock 보존 — 구역 앞뒤 사람 글은 바이트 그대로', () => {
    const head = '# 폴더\n사람이 쓴 절 «건드리지 마»\n\n', tail = '\n\n## 뒤 절\n사람 글 2\n'
    const out = replaceBlock(head + block('옛것') + tail, block('새것'))
    expect(out).toBe(head + block('새것') + tail)
  })
  it('덧붙이기 — 구역이 없으면 끝에 빈 줄 하나 뒤로', () => {
    expect(replaceBlock('# 폴더\n본문\n', block('x'))).toBe('# 폴더\n본문\n\n' + block('x') + '\n')
    expect(replaceBlock('# 폴더\n본문', block('x'))).toBe('# 폴더\n본문\n\n' + block('x') + '\n')
  })
  it('지우기 — 덧붙였던 것을 지우면 원래대로', () => {
    const orig = '# 폴더\n본문\n'
    expect(replaceBlock(replaceBlock(orig, block('x')), null)).toBe(orig)
  })
  it('구역도 없고 지울 것도 없으면 그대로', () => expect(replaceBlock('abc\n', null)).toBe('abc\n'))
})

describe('RoutineNotes', () => {
  let root = ''
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }) })
  const mkBot = (o: Partial<Bot>): Bot => ({ id: 'b', rel: 'p/a', abs: '', name: 'a', displayName: 'a', section: 'p', color: '', orchestrator: false, routines: [], ...o }) as Bot
  it('CLAUDE.md 가 있으면 구역을 쓰고, 없으면 만들지 않는다 · 오케스트레이터는 .claude/orchestrator.md', () => {
    root = mkdtempSync(join(tmpdir(), 'rb3-'))
    const a = join(root, 'p', 'a'), nb = join(root, 'p', 'nb'); mkdirSync(a, { recursive: true }); mkdirSync(nb, { recursive: true }); mkdirSync(join(root, '.claude'))
    writeFileSync(join(a, 'CLAUDE.md'), '# a\n사람 글\n'); writeFileSync(join(root, 'CLAUDE.md'), '# 볼트\n'); writeFileSync(join(root, '.claude', 'orchestrator.md'), '# 오케\n')
    const notes = new RoutineNotes({ root, log: () => {} })
    const r = [{ name: 'x', cron: '0 9 * * *', prompt: 'p' }]
    notes.record(ch({ botId: 'b', routine: 'x', what: '새로 걸림', actor: '화면', why: undefined }))
    notes.sync([mkBot({ id: 'b', abs: a, routines: r }), mkBot({ id: 'nb', abs: nb, routines: r }), mkBot({ id: 'orch', abs: root, rel: '', orchestrator: true, routines: r })])
    const ca = readFileSync(join(a, 'CLAUDE.md'), 'utf8')
    expect(ca.startsWith('# a\n사람 글\n\n' + NOTE_OPEN)).toBe(true)
    expect(ca).toContain('· 화면 · x · 새로 걸림')
    expect(existsSync(join(nb, 'CLAUDE.md'))).toBe(false)
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('# 볼트\n')                       // 볼트 루트는 모든 봇이 물려받는다 — 안 쓴다
    expect(readFileSync(join(root, '.claude', 'orchestrator.md'), 'utf8')).toContain('정본은 `.claude/routines.yml` 이다.')
    expect(notes.noteFile(mkBot({ id: 'nb', abs: nb }))).toBeNull()
    // 바뀐 것이 없으면 다시 쓰지 않는다
    const m0 = statSync(join(a, 'CLAUDE.md')).mtimeMs
    notes.sync([mkBot({ id: 'b', abs: a, routines: r })])
    expect(statSync(join(a, 'CLAUDE.md')).mtimeMs).toBe(m0)
    // 변경 기록은 파일에 한 줄씩 · 다시 만든 인스턴스도 읽는다
    expect(new RoutineNotes({ root, log: () => {} }).recent('b').map((c) => c.what)).toEqual(['새로 걸림'])
  })
  it('최종 리뷰 · 주인 호스트가 아니면 구역을 쓰지 않는다', () => {
    root = mkdtempSync(join(tmpdir(), 'rb3-'))
    const a = join(root, 'a'); mkdirSync(a); writeFileSync(join(a, 'CLAUDE.md'), '# a\n')
    const notes = new RoutineNotes({ root, log: () => {}, owner: () => false })
    notes.sync([mkBot({ abs: a, routines: [{ name: 'x', cron: '0 9 * * *', prompt: 'p' }] })])
    expect(readFileSync(join(a, 'CLAUDE.md'), 'utf8')).toBe('# a\n')
  })
  it('최종 리뷰 · 다른 호스트가 기록 파일에 덧붙이면 다시 읽는다', () => {
    root = mkdtempSync(join(tmpdir(), 'rb3-'))
    const notes = new RoutineNotes({ root, log: () => {} })
    notes.record(ch({ botId: 'b', what: '첫째' }))
    expect(notes.all()).toHaveLength(1)
    appendFileSync(join(root, '.folderbot', 'ops', 'routine-changes.jsonl'), JSON.stringify(ch({ botId: 'b', what: '다른 맥에서 둘째', at: at('2026-10-30T15:00:00') })) + '\n')
    expect(notes.recent('b').map((c) => c.what)).toEqual(['다른 맥에서 둘째', '첫째'])
  })
  it('루틴을 다 지우면 구역도 지운다', () => {
    root = mkdtempSync(join(tmpdir(), 'rb3-'))
    const a = join(root, 'a'); mkdirSync(a); writeFileSync(join(a, 'CLAUDE.md'), '# a\n')
    const notes = new RoutineNotes({ root, log: () => {} })
    notes.sync([mkBot({ abs: a, routines: [{ name: 'x', cron: '0 9 * * *', prompt: 'p' }] })])
    notes.sync([mkBot({ abs: a, routines: [] })])
    expect(readFileSync(join(a, 'CLAUDE.md'), 'utf8')).toBe('# a\n')
  })
})
