import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { type AkFile, type AkLedger, akDesc, emptyLedger, folderUrl, mapProjects, pairCandidates, planSync, pullRemote, seedLegacy } from '../../src/core/akiflowSync'
import { parseTodo } from '../../src/core/todo'
import { AkiflowSync } from '../../src/host/akiflow'
import type { Bot } from '../../src/core/types'

/** CK-2 · todo.md ↔ Akiflow (2026-10-16 · 기획안 §3) */
const NOW = new Date(2026, 9, 16, 10).getTime()
const VAULT = '/Users/dave/Library/CloudStorage/Dropbox/PARA'
const file = (rel: string, md: string): AkFile => ({ rel, name: rel.split('/').pop()!, items: parseTodo(md) })

describe('CK-2 · 계획', () => {
  it('출처 줄 — Dropbox 폴더 주소(파일 아닌 폴더) · 볼트 밖이면 «링크 없음»', () => {
    expect(folderUrl(VAULT, '2. Area/제품_FolderBot')).toBe('https://www.dropbox.com/home/PARA/2.%20Area/%EC%A0%9C%ED%92%88_FolderBot')
    expect(folderUrl('/tmp/v', 'a')).toBeNull()
    expect(akDesc('제품_FolderBot', null, '설명', new Date(NOW))).toBe('📍 출처: 제품_FolderBot (볼트 todo.md · 링크 없음) · 10/16\n설명')
  })
  it('처음 볼 때 있던 봇 줄은 올리지 않는다 · Dave 줄·마감은 만든다 · 제안·끝난 줄은 안 간다', () => {
    const f = file('2. Area/x', '- [ ] 데이브 일: 설명 📅 2026-10-20\n- [ ] 옛 봇 줄 <!-- bot -->\n- [ ] 제안 <!-- bot:proposed -->\n- [x] 끝난 일\n')
    const l = seedLegacy(emptyLedger(), [f], NOW)
    expect(l.legacy).toEqual({ '2. Area/x': ['옛 봇 줄'] })
    const f2 = file('2. Area/x', '- [ ] 데이브 일: 설명 📅 2026-10-20\n- [ ] 옛 봇 줄 <!-- bot -->\n- [ ] 제안 <!-- bot:proposed -->\n- [x] 끝난 일\n- [ ] 새 봇 줄 <!-- bot -->\n')
    const { plan } = planSync([f2], { ...l, mode: 'live', scanned: true }, { vaultAbs: VAULT, now: NOW })
    expect(plan.ops.map((o) => o.op === 'create' && o.title)).toEqual(['데이브 일', '🤖 새 봇 줄'])
    expect(plan.ops[0]).toMatchObject({ deadline: '2026-10-20', links: [folderUrl(VAULT, '2. Area/x')] })
    expect(plan.legacy).toBe(1); expect(plan.proposedSkipped).toBe(1)
  })
  it('🔴 양쪽이 다르게 고친 제목(카드 대기)은 밀지 않는다 · 바뀐 짝은 먼저 읽는다', () => {
    const l: AkLedger = { ...emptyLedger(), mode: 'live', scanned: true, startedAt: 1, pairs: { a1: { rel: 'r', title: '일', desc: '', done: false, due: null, bot: false, syncedAt: 1 } },
      conflicts: [{ id: 'c1', akId: 'a1', rel: 'r', field: 'title', local: '내 제목', remote: '저쪽', at: 1 }] }
    const r = planSync([file('r', '- [ ] 내 제목 <!-- ak:a1 -->\n')], l, { vaultAbs: VAULT, now: NOW, batch: 0 })
    expect(r.plan.ops).toEqual([]); expect(r.plan.check).toEqual(['a1'])
  })
  it('📅 가 표식 뒤에 와도 짝을 잃지 않는다(옵시디언 Tasks 꼴)', () => {
    expect(parseTodo('- [ ] X <!-- ak:k9 --> <!-- bot --> 📅 2026-10-20')[0]).toMatchObject({ title: 'X', ak: 'k9', by: 'bot', due: '2026-10-20' })
  })
  it('짝이 있으면 바뀐 것만 고치고 · 체크하면 완료 · 사라지면 «지울까요» 카드(사람이 고르기 전엔 안 지운다)', () => {
    const l: AkLedger = { ...emptyLedger(), mode: 'live', scanned: true, startedAt: 1, pairs: {
      a1: { rel: 'r', title: '일', desc: '', done: false, due: null, bot: false, syncedAt: 1 },
      a2: { rel: 'r', title: '둘', desc: '', done: false, due: null, bot: false, syncedAt: 1 },
      a3: { rel: 'r', title: '사라짐', desc: '', done: false, due: null, bot: false, syncedAt: 1 } } }
    const f = file('r', '- [ ] 일: 새 설명 📅 2026-10-21 <!-- ak:a1 -->\n- [x] 둘 <!-- ak:a2 -->\n')
    const r = planSync([f], l, { vaultAbs: VAULT, now: NOW })
    expect(r.plan.ops.map((o) => o.op)).toEqual(['update', 'complete'])
    expect(r.plan.ops[0]).toMatchObject({ akId: 'a1', deadline: '2026-10-21' })
    expect(r.ledger.gone).toEqual({ a3: 'ask' })
    const r2 = planSync([f], { ...r.ledger, gone: { a3: 'delete' } }, { vaultAbs: VAULT, now: NOW })
    expect(r2.plan.ops.map((o) => o.op)).toContain('delete')
  })
  it('🔴 켠 첫 회차는 훑기만 — 만들기 전에 Akiflow 에 같은 일이 있나 본다', () => {
    const f = file('r', '- [ ] 강의안 넘기기\n')
    const l = { ...seedLegacy(emptyLedger(), [f], NOW), mode: 'live' as const }
    expect(planSync([f], l, { vaultAbs: VAULT, now: NOW }).plan).toMatchObject({ scanOnly: true, ops: [] })
    const asks = pairCandidates([f], l, [{ id: 'k1', title: '강의안 넘기기', done: false }], NOW)
    expect(asks).toHaveLength(1)
    const held = planSync([f], { ...l, scanned: true, pairAsks: asks }, { vaultAbs: VAULT, now: NOW })
    expect(held.plan.ops).toEqual([]); expect(held.plan.held).toBe(1)
  })
  it('폴더 ↔ 프로젝트는 이름으로(아이콘·폴더 꼬리 무시)', () => {
    expect(mapProjects([{ rel: '2. Area/제품_FolderBot', name: '제품_FolderBot' }, { rel: '1. Projects/없음', name: '없음' }], [{ id: 'p1', name: '📁 제품_FolderBot (Work)' }])).toEqual({ '2. Area/제품_FolderBot': 'p1' })
  })
})

describe('CK-2 · Akiflow → todo.md', () => {
  const base = (): AkLedger => ({ ...emptyLedger(), mode: 'live', scanned: true, startedAt: 1, projects: { r: 'p1' }, pairs: { a1: { rel: 'r', title: '일', desc: '', done: false, due: null, bot: true, syncedAt: 1 } } })
  it('Akiflow 에서 완료·마감·제목이 바뀌면 todo.md 로 · 🤖 를 지우면 Dave 줄', () => {
    const f = file('r', '- [ ] 일 <!-- ak:a1 --> <!-- bot -->\n')
    const r = pullRemote([f], base(), [{ id: 'a1', title: '고친 일', done: true, deadline: '2026-10-30' }], NOW)
    expect(r.fixes.map((x) => x.kind)).toEqual(['title', 'done', 'due'])
    expect(r.fixes[0]).toMatchObject({ mine: true, title: '고친 일' })
  })
  it('양쪽이 다르게 고친 제목은 카드 · 짝 없는 태스크가 연결된 프로젝트에 있으면 Dave 줄로', () => {
    const f = file('r', '- [ ] 내가 고침 <!-- ak:a1 --> <!-- bot -->\n')
    const remote = [{ id: 'a1', title: '🤖 저쪽 고침', done: false }, { id: 'n1', title: '새로 만든 일', done: false, project_id: 'p1' }]
    const r = pullRemote([f], base(), remote, NOW, { allowAdd: true })
    expect(r.ledger.conflicts).toHaveLength(1)
    expect(r.fixes).toEqual([{ kind: 'add', rel: 'r', akId: 'n1', title: '새로 만든 일', due: null }])
    // 🔴 내리지 않는 경우 — 첫 훑기 회차 · 사람이 «남기기» 한 것 · 후보 카드가 걸린 것
    expect(pullRemote([f], base(), remote, NOW).fixes.some((x) => x.kind === 'add')).toBe(false)
    expect(pullRemote([f], { ...base(), ignore: ['n1'] }, remote, NOW, { allowAdd: true }).fixes.some((x) => x.kind === 'add')).toBe(false)
    expect(pullRemote([f], { ...base(), pairAsks: [{ id: 'q', rel: 'r', title: 'x', akId: 'n1', remoteTitle: 'x', at: 1 }] }, remote, NOW, { allowAdd: true }).fixes.some((x) => x.kind === 'add')).toBe(false)
  })
})

describe('CK-2 · 호스트 왕복', () => {
  it('미리보기 → 계획 → 결과(짝 표식이 줄에 붙는다) → 다음 계획엔 안 나온다', () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-ak-')); mkdirSync(join(root, '2. Area/x'), { recursive: true })
    writeFileSync(join(root, '2. Area/x/todo.md'), '# todo\n- [ ] 첫 일: 설명\n- [ ] 옛 봇 <!-- bot -->\n')
    const bots = (): Bot[] => [{ id: 'b1', rel: '2. Area/x', abs: join(root, '2. Area/x'), name: 'x', displayName: 'x', section: '2. Area', color: '#6ea6f7', orchestrator: false, startedAt: 1, vendor: 'claude', routines: [] }]
    const ak = new AkiflowSync(root, bots, () => {})
    const st = ak.status()
    expect(st.mode).toBe('preview'); expect(st.counts.create).toBe(1); expect(st.legacyLeft).toBe(1)
    expect(ak.plan()).toMatchObject({ phase: 'read', ops: [] })   // 첫 걸음은 읽을 것만
    ak.setMode('live')
    const r1 = ak.plan(); expect(r1.scanOnly).toBe(true)
    // 켠 첫 회차 — Akiflow 에 같은 제목이 있으면 그 줄은 «같은 일?» 카드로 붙잡고 만들지 않는다
    const p1 = ak.plan(undefined, [{ id: 'K-1', title: '첫 일', done: false }])
    if (p1.phase !== 'push') throw new Error('push 여야 한다')
    expect(p1.ops).toHaveLength(0); expect(ak.status().pairAsks).toHaveLength(1)
    ak.resolve('pair', ak.status().pairAsks[0].id, 'new')
    const p2 = ak.plan(undefined, []); if (p2.phase !== 'push') throw new Error('push')
    expect(p2.ops).toHaveLength(1)
    ak.ack(p2.runId, [{ key: p2.ops[0].key, ok: true, akId: 'AK-1' }])
    expect(readFileSync(join(root, '2. Area/x/todo.md'), 'utf8')).toContain('- [ ] 첫 일: 설명 <!-- ak:AK-1 -->')
    const p3 = ak.plan(undefined, []); expect(p3.ops).toHaveLength(0)
    // 호스트가 재시작해도(새 객체) 결과를 맞춘다 — 계획은 장부에 있다
    writeFileSync(join(root, '2. Area/x/todo.md'), readFileSync(join(root, '2. Area/x/todo.md'), 'utf8') + '- [ ] 둘째 일\n')
    const p4 = ak.plan(undefined, []); if (p4.phase !== 'push') throw new Error('push')
    const ak2 = new AkiflowSync(root, bots, () => {})
    ak2.ack(p4.runId, [{ key: p4.ops[0].key, ok: true, akId: 'AK-2' }])
    expect(readFileSync(join(root, '2. Area/x/todo.md'), 'utf8')).toContain('- [ ] 둘째 일 <!-- ak:AK-2 -->')
    // 짝 없는 K-1 은 «다른 일» 로 골랐으니 그 프로젝트에 있으면 내려온다 — 프로젝트가 없으면 안 내려온다
    const p5 = ak2.plan(undefined, [{ id: 'K-1', title: '첫 일', done: false }]); expect(p5.phase).toBe('push')
    expect(readFileSync(join(root, '2. Area/x/todo.md'), 'utf8').match(/첫 일/g)).toHaveLength(1)
    expect(ak.legacyToProposed()).toBe(1)
    expect(readFileSync(join(root, '2. Area/x/todo.md'), 'utf8')).toContain('- [ ] 옛 봇 <!-- bot:proposed -->')
    rmSync(root, { recursive: true, force: true })
  })
})
