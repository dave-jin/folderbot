import { describe, expect, it } from 'vitest'
import {
  buildLinkMap, countMentions, ddText, flowLayout, folderDue, labelOf, linkCard, listSections, louvain, mentionKeys, neighbors,
  parseLinkAi, parseRelayTitle, parseStemNames, renderLinksMd, resolveFolder, ringOf, searchLinks, targetLayout, type BuildIn,
} from '../../src/core/linkMap'

const P = (n: string) => `1. Projects/${n}`
const A = (n: string) => `2. Area/${n}`
const NODES = [
  { id: P('2026-11-01_행사-GrokBot-해커톤-서울'), name: '2026-11-01_행사-GrokBot-해커톤-서울', botId: 'b1', recent: ['02_작업/전날공지_v2.md', '04_기록/운영진-미팅.md'] },
  { id: P('2026-11-21_행사-노션-해커톤'), name: '2026-11-21_행사-노션-해커톤', botId: 'b2' },
  { id: P('2026-11-28_행사-MYSELF-해커톤'), name: '2026-11-28_행사-MYSELF-해커톤', botId: 'b3' },
  { id: P('2026-11_강의-샌드박스-AFTER7'), name: '2026-11_강의-샌드박스-AFTER7', botId: 'b4' },
  { id: P('2026-11-18_강의-카카오페이-LLM위키'), name: '2026-11-18_강의-카카오페이-LLM위키', recent: ['02_작업/교안-뼈대.md'] },
  { id: A('사업_이네이트-홈페이지'), name: '사업_이네이트-홈페이지', botId: 'b5', act: 30 },
  { id: A('사업_이네이트-웨비나'), name: '사업_이네이트-웨비나', botId: 'b6' },
  { id: A('개인_비서실'), name: '개인_비서실' },
  { id: A('개인_법무팀'), name: '개인_법무팀' },
]
const base = (): BuildIn => ({
  nodes: NODES, today: '2026-11-04', now: 1,
  mentions: [
    { a: P('2026-11-21_행사-노션-해커톤'), b: P('2026-11-01_행사-GrokBot-해커톤-서울'), count: 3, files: ['readme.md'] },
    { a: P('2026-11-28_행사-MYSELF-해커톤'), b: P('2026-11-21_행사-노션-해커톤'), count: 2, files: ['state.md'] },
    { a: P('2026-11_강의-샌드박스-AFTER7'), b: P('2026-11-18_강의-카카오페이-LLM위키'), count: 4, files: ['02_작업/커리큘럼.md'] },
  ],
  relays: [{ a: A('사업_이네이트-홈페이지'), b: A('사업_이네이트-웨비나'), count: 6, ev: ['스티비 연동'] }],
})

describe('LM 이름 · 마감', () => {
  it('폴더 날짜 = 데드라인 — 날 · 달 끝 · 해 끝 · 영역은 없음', () => {
    expect(folderDue('2026-11-21_행사-노션-해커톤')).toEqual({ due: '2026-11-21', exact: true })
    expect(folderDue('2026-11_강의-샌드박스-AFTER7')).toEqual({ due: '2026-11-30', exact: false })
    expect(folderDue('2027_멘토링-디캠프')).toEqual({ due: '2027-12-31', exact: false })
    expect(folderDue('사업_당근메일')).toBeNull()
  })
  it('이름표 — 날짜·칸·짧은 한글 종류 낱말을 뗀다 · 표시 이름이 이긴다', () => {
    expect(labelOf('2026-11-01_행사-GrokBot-해커톤-서울')).toBe('GrokBot 해커톤 서울')
    expect(labelOf('사업_이네이트-홈페이지')).toBe('이네이트 홈페이지')
    expect(labelOf('2026-11-12_KB인재양성-AI강의')).toBe('KB인재양성 AI강의')
    expect(labelOf('제품_FolderBot', 'Folder Bot')).toBe('Folder Bot')
  })
  it('D-n · 오늘 · 끝남 · 달까지만', () => {
    const n = (name: string) => ({ kind: 'P' as const, ...(() => { const d = folderDue(name)!; return { due: d.due, dueExact: d.exact } })() })
    expect(ddText(n('2026-11-21_x-y'), '2026-11-04')).toBe('D-17')
    expect(ddText(n('2026-11-04_x-y'), '2026-11-04')).toBe('오늘')
    expect(ddText(n('2026-11-01_x-y'), '2026-11-04')).toBe('끝남')
    expect(ddText(n('2026-11_x-y'), '2026-11-04')).toBe('11월')
    expect(ddText(n('2027-03_x-y'), '2026-11-04')).toBe('27년 3월')
  })
})

describe('LM 문서 언급', () => {
  const ns = NODES.map((n) => ({ id: n.id, name: n.name, label: labelOf(n.name) }))
  it('폴더 이름 꼴만 센다 — 이름표(평범한 낱말)는 안 센다', () => {
    const keys = mentionKeys(ns)
    const hits = countMentions('참고: 1. Projects/2026-11-21_행사-노션-해커톤/readme.md 와 행사-노션-해커톤 폴더. 노션 해커톤 이야기.', keys, 'self')
    expect(hits.get(P('2026-11-21_행사-노션-해커톤'))).toBe(2)   // 같은 폴더의 키 여럿은 가장 많이 걸린 하나(전체 이름 1 · 꼬리 2) · «노션 해커톤»(이름표)은 안 센다
  })
  it('맨 이름(«agents»)은 키가 아니다', () => {
    const keys = mentionKeys([...ns, { id: A('agents'), name: 'agents', label: 'agents' }])
    expect(keys.get(A('agents'))).toEqual([])
  })
  it('자기 폴더는 세지 않는다', () => {
    const keys = mentionKeys(ns)
    expect(countMentions('사업_이네이트-홈페이지', keys, A('사업_이네이트-홈페이지')).size).toBe(0)
  })
})

describe('LM 봇 중계', () => {
  it('제목 읽기 — 여럿 · 설명 떼기 · 답은 안 센다', () => {
    expect(parseRelayTitle('중계 · PARA AI → 홈페이지·웨비나')).toEqual({ from: 'PARA AI', to: ['홈페이지', '웨비나'] })
    expect(parseRelayTitle('중계 · 당근메일 → 이브레인 (294호 광고)')).toEqual({ from: '당근메일', to: ['이브레인'] })
    expect(parseRelayTitle('중계 · 텔로스-원진 봇 → 오케스트레이터 · 폴더 개명')).toEqual({ from: '텔로스-원진 봇', to: ['오케스트레이터'] })
    expect(parseRelayTitle('"중계 답 · 문서 창 웹뷰"')).toBeNull()
    expect(parseRelayTitle('완료 · 홈페이지 → RISE 중계 반영')).toBeNull()
  })
  it('이름 → 폴더 — 낱말 겹침 · 봇 꼬리 · 사람·오케스트레이터는 폴더가 아님', () => {
    const ns = NODES.map((n) => ({ id: n.id, name: n.name, label: labelOf(n.name) }))
    expect(resolveFolder('GrokBot 서울', ns)).toBe(P('2026-11-01_행사-GrokBot-해커톤-서울'))
    expect(resolveFolder('이네이트-홈페이지 봇', ns)).toBe(A('사업_이네이트-홈페이지'))
    expect(resolveFolder('웨비나', ns)).toBe(A('사업_이네이트-웨비나'))
    expect(resolveFolder('오케스트레이터', ns)).toBeNull()
    expect(resolveFolder('Dave', ns)).toBeNull()
    expect(resolveFolder('해커톤', ns)).toBeNull()   // 셋에 걸려 애매
  })
})

describe('LM 짓기', () => {
  it('선 · 줄기 · 혼자 있는 폴더', () => {
    const m = buildLinkMap(base())
    expect(m.counts).toEqual({ mention: 3, relay: 1, entity: 0, similar: 0 })
    expect(m.iso).toEqual([A('개인_비서실'), A('개인_법무팀')])
    const stemOf = (id: string) => m.nodes.find((n) => n.id === id)!.stem
    expect(stemOf(P('2026-11-21_행사-노션-해커톤'))).toBe(stemOf(P('2026-11-01_행사-GrokBot-해커톤-서울')))
    expect(stemOf(A('사업_이네이트-홈페이지'))).toBe(stemOf(A('사업_이네이트-웨비나')))
    expect(stemOf(A('사업_이네이트-홈페이지'))).not.toBe(stemOf(P('2026-11-21_행사-노션-해커톤')))
  })
  it('허브 — 35%(최소 8) 이상이 이름을 적는 폴더는 줄기·다리에서 빠진다', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: P(`2026-12-0${i}_x-${i}`), name: `2026-12-0${i}_x-${i}` }))
    const inp = base()
    inp.nodes = [...inp.nodes, ...many]
    inp.mentions = [...inp.mentions, ...many.map((n) => ({ a: n.id, b: A('개인_비서실'), count: 1, files: ['a.md'] }))]
    const m = buildLinkMap(inp)
    expect(m.hubs).toEqual([A('개인_비서실')])
    expect(m.nodes.find((n) => n.id === A('개인_비서실'))!.stem).toBeUndefined()
  })
  it('같은 사람·장소 — 호스트가 센 파일이 둘 다 있어야 선이 된다 · 비슷한 일은 봇 추측', () => {
    const inp = base()
    inp.ai = { at: 5, entities: [
      { name: '서울 AI 허브', folders: [P('2026-11-01_행사-GrokBot-해커톤-서울'), P('2026-11-21_행사-노션-해커톤')], files: { [P('2026-11-01_행사-GrokBot-해커톤-서울')]: 5, [P('2026-11-21_행사-노션-해커톤')]: 5 } },
      { name: '없는 사람', folders: [P('2026-11-01_행사-GrokBot-해커톤-서울'), A('개인_법무팀')], files: { [P('2026-11-01_행사-GrokBot-해커톤-서울')]: 2, [A('개인_법무팀')]: 0 } },
    ], similar: [{ a: '샌드박스 AFTER7', b: '카카오페이 LLM위키', why: '둘 다 커리큘럼', reuse: '교안 뼈대' }], stemNames: [] }
    const m = buildLinkMap(inp)
    expect(m.counts.entity).toBe(1)
    expect(m.edges.find((e) => e.t === 'entity')!.ev).toBe('«서울 AI 허브» — 두 폴더에 모두 나옴(파일 5·5개)')
    const sim = m.edges.find((e) => e.t === 'similar')!
    expect(sim.guess).toBe(true)
    // 끝난 GrokBot → 노션 해커톤으로 가져다 쓸 것(사실) · 카카오페이 → AFTER7(추측 · 모델의 reuse 글)
    expect(m.reuse.find((r) => r.to === P('2026-11-21_행사-노션-해커톤'))).toMatchObject({ from: P('2026-11-01_행사-GrokBot-해커톤-서울'), fact: true, act: 'tell', files: ['02_작업/전날공지_v2.md', '04_기록/운영진-미팅.md'] })
    expect(m.reuse.find((r) => r.to === P('2026-11_강의-샌드박스-AFTER7'))).toMatchObject({ what: '교안 뼈대', fact: false })
  })
  it('중계 4번 이상인 쌍은 «참조 폴더로 묶기» — 이미 묶였으면 안 낸다', () => {
    expect(buildLinkMap(base()).reuse.find((r) => r.act === 'ref')).toMatchObject({ to: A('사업_이네이트-홈페이지'), from: A('사업_이네이트-웨비나') })
    const inp = base(); inp.refs = { b5: [A('사업_이네이트-웨비나')] }
    expect(buildLinkMap(inp).reuse.find((r) => r.act === 'ref')).toBeUndefined()
  })
  it('Dave 가 고친 줄기 — 이름은 구성원이 겹치는 줄기를 따라가고, 옮기기는 닻 폴더의 줄기로', () => {
    const m0 = buildLinkMap(base())
    const hk = m0.stems.find((s) => s.members.includes(P('2026-11-21_행사-노션-해커톤')))!
    const inp = base()
    inp.edits = { names: [{ members: hk.members, name: '해커톤·행사' }], moves: [{ folder: P('2026-11_강의-샌드박스-AFTER7'), with: A('사업_이네이트-홈페이지') }] }
    const m = buildLinkMap(inp)
    const st = m.stems.find((s) => s.members.includes(P('2026-11-21_행사-노션-해커톤')))!
    expect(st).toMatchObject({ name: '해커톤·행사', named: 'dave' })
    const after7 = m.nodes.find((n) => n.id === P('2026-11_강의-샌드박스-AFTER7'))!
    expect(m.stems[after7.stem!].members).toContain(A('사업_이네이트-홈페이지'))
  })
  it('줄기 밖으로 옮기기(with: null)', () => {
    const inp = base(); inp.edits = { names: [], moves: [{ folder: P('2026-11-28_행사-MYSELF-해커톤'), with: null }] }
    expect(buildLinkMap(inp).nodes.find((n) => n.id === P('2026-11-28_행사-MYSELF-해커톤'))!.stem).toBeUndefined()
  })
  it('Louvain — 두 덩이를 가르고 결과가 늘 같다', () => {
    const G = new Map<string, Map<string, number>>()
    const add = (a: string, b: string, w = 1) => { for (const [x, y] of [[a, b], [b, a]]) { const m = G.get(x) ?? new Map(); m.set(y, w); G.set(x, m) } }
    add('a', 'b'); add('b', 'c'); add('a', 'c'); add('d', 'e'); add('e', 'f'); add('d', 'f'); add('c', 'd', 0.1)
    const c1 = louvain(G), c2 = louvain(G)
    expect([...c1]).toEqual([...c2])
    expect(c1.get('a')).toBe(c1.get('c')); expect(c1.get('d')).toBe(c1.get('f')); expect(c1.get('a')).not.toBe(c1.get('d'))
  })
})

describe('LM 봇 쪽 · 찾기 · 요약', () => {
  it('이웃 — 중계가 언급보다 앞', () => {
    const inp = base(); inp.mentions.push({ a: A('사업_이네이트-홈페이지'), b: P('2026-11-21_행사-노션-해커톤'), count: 9, files: ['x.md'] })
    const nb = neighbors(buildLinkMap(inp), A('사업_이네이트-홈페이지'))
    expect(nb[0]).toMatchObject({ id: A('사업_이네이트-웨비나'), t: 'relay' })
  })
  it('«이어진 폴더» 카드 — 읽기만 · orch_ask · 가져다 쓸 것 · 허브와 이웃 없는 폴더는 빈 글', () => {
    const inp = base()
    inp.ai = { at: 5, entities: [{ name: '서울 AI 허브', folders: [P('2026-11-01_행사-GrokBot-해커톤-서울'), P('2026-11-21_행사-노션-해커톤')], files: { [P('2026-11-01_행사-GrokBot-해커톤-서울')]: 5, [P('2026-11-21_행사-노션-해커톤')]: 5 } }], similar: [], stemNames: [] }
    const m = buildLinkMap(inp)
    const c = linkCard(m, P('2026-11-21_행사-노션-해커톤'))
    expect(c).toContain('## 이어진 폴더')
    expect(c).toContain('읽기만')
    expect(c).toContain('orch_ask')
    expect(c).toContain('♻ 가져다 쓸 것 — GrokBot 해커톤 서울')
    expect(c).toContain('`1. Projects/2026-11-01_행사-GrokBot-해커톤-서울/02_작업/전날공지_v2.md`')
    expect(linkCard(m, A('개인_법무팀'))).toBe('')
  })
  it('찾기 — 근거 글 속 사람 이름으로도', () => {
    const inp = base()
    inp.ai = { at: 5, entities: [{ name: '이슬기', folders: [P('2026-11-01_행사-GrokBot-해커톤-서울'), P('2026-11-21_행사-노션-해커톤')], files: { [P('2026-11-01_행사-GrokBot-해커톤-서울')]: 1, [P('2026-11-21_행사-노션-해커톤')]: 2 } }], similar: [], stemNames: [] }
    const r = searchLinks(buildLinkMap(inp), '이슬기')
    expect(r.nodes.map((x) => x.id).sort()).toEqual([P('2026-11-01_행사-GrokBot-해커톤-서울'), P('2026-11-21_행사-노션-해커톤')].sort())
  })
  it('links.md — 가져다 쓸 것 · 줄기', () => {
    const md = renderLinksMd(buildLinkMap(base()), 'mac-mini')
    expect(md).toContain('## ♻ 가져다 쓸 수 있어요')
    expect(md).toContain('## 일의 줄기')
  })
  it('모델 답 읽기 — 이상한 칸은 버린다', () => {
    expect(parseLinkAi('앞말 {"people_places":[{"name":"서울 AI 허브","folders":["a","b"]},{"name":"x","folders":["a"]}],"similar":[{"a":"a","b":"b","why":"w"},{"a":1}]} 뒷말')).toEqual({ people: [{ name: '서울 AI 허브', folders: ['a', 'b'] }], similar: [{ a: 'a', b: 'b', why: 'w' }] })
    expect(parseLinkAi('JSON 없음')).toBeNull()
    expect(parseStemNames('{"stems":[{"i":0,"name":"기업 강의","line":"강의 다섯"},{"i":9,"name":"x"}]}', 2)).toEqual([{ i: 0, name: '기업 강의', line: '강의 다섯' }])
  })
})

describe('LM 배치', () => {
  const m = buildLinkMap(base())
  it('과녁 고리 — 7일 안 · 한 달 · 그 뒤 · 상시 · 끝남', () => {
    const n = (id: string) => m.nodes.find((x) => x.id === id)!
    expect(ringOf(n(P('2026-11-01_행사-GrokBot-해커톤-서울')), m.today)).toBe(4)
    expect(ringOf(n(P('2026-11-21_행사-노션-해커톤')), m.today)).toBe(1)
    expect(ringOf(n(A('사업_이네이트-웨비나')), m.today)).toBe(3)
  })
  it('과녁 — 허브·혼자 있는 폴더는 안 그린다 · 점은 판 안에', () => {
    const T = targetLayout(m, 640)
    expect(T.points.map((p) => p.id)).not.toContain(A('개인_법무팀'))
    for (const p of T.points) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(640); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(640) }
  })
  it('흐름 — 줄 = 줄기 · 프로젝트는 마감 순으로 오른쪽 · 영역은 왼쪽 칸', () => {
    const L = flowLayout(m, '10w')
    expect(L.lanes.length).toBeGreaterThanOrEqual(2)
    const x = (id: string) => L.items.find((i) => i.id === id)!.x
    expect(x(P('2026-11-21_행사-노션-해커톤'))).toBeLessThan(x(P('2026-11-28_행사-MYSELF-해커톤')))
    expect(L.items.find((i) => i.id === A('사업_이네이트-웨비나'))!.kind).toBe('A')
    expect(L.items.find((i) => i.id === A('사업_이네이트-웨비나'))!.x).toBe(L.areaX - 8)
    expect(L.paths.some((p) => p.t === 'relay')).toBe(false)   // 영역끼리 선은 안 그린다
    expect(L.paths.every((p) => /^M\d/.test(p.d))).toBe(true)
  })
  it('목록 — 2주 안 · 그 뒤 · 상시 영역 · 가져다 쓸 것만', () => {
    const secs = listSections(m)
    expect(secs.map((x) => x.title)).toEqual(['다음 2주 마감', '그 뒤 마감', '상시 영역 · 이번 주 움직인 순'])
    expect(secs[0].rows.map((r) => r.id)).toEqual([P('2026-11-18_강의-카카오페이-LLM위키')])   // 14일 뒤 = 2주 안
    expect(listSections(m, 'reuse').flatMap((x) => x.rows.map((r) => r.id)).sort()).toEqual(m.reuse.map((r) => r.to).sort())
  })
})
