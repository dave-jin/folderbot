import { describe, expect, it } from 'vitest'
import {
  buildLinkMap, countMentions, ddText, flowLayout, folderDue, labelOf, linkCard, listSections, louvain, mentionKeys, neighbors,
  parseLinkAi, parseRelayTitle, parseStemNames, renderLinksMd, resolveFolder, ringOf, searchLinks, targetLayout, type BuildIn,
  applyStemOp, parsePlace, pastFor, placePrompt, EMPTY_EDITS, type LinkEdits,
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

// ── 줄기 관리 · 지난 일(11/4 Dave «수정/편집/삭제 가능하게 · 이후엔 LLM 이 그에 맞게 · 아카이브와도 연결») ──────────────
const X = (n: string) => `4. Archive/${n}`
const PAST = [
  { id: X('2026-10-17_행사-유미MCP-바이브해커톤'), name: '2026-10-17_행사-유미MCP-바이브해커톤', past: true, recent: ['03_산출물/운영매뉴얼.pdf'] },
  { id: X('2026-10-27_강의-의사를-위한-AI-강좌'), name: '2026-10-27_강의-의사를-위한-AI-강좌', past: true, recent: ['02_작업/실습지.md'] },
  { id: X('_이전연도/2025/2025-09_강의-KICT-AX스타트업'), name: '2025-09_강의-KICT-AX스타트업', past: true },
  { id: X('2026-09_Note-App-선정'), name: '2026-09_Note-App-선정', past: true, recent: ['비교표.md'] },
]
const withPast = (): BuildIn => {
  const inp = base()
  inp.nodes = [...NODES, ...PAST]
  inp.mentions = [...inp.mentions,
    // 노션 해커톤 글이 유미 해커톤을 세 번 · MYSELF 도 두 번(지난 일 → 해커톤 줄기 · 문턱 3 넘음)
    { a: P('2026-11-21_행사-노션-해커톤'), b: X('2026-10-17_행사-유미MCP-바이브해커톤'), count: 6, files: ['readme.md'] },
    { a: P('2026-11-28_행사-MYSELF-해커톤'), b: X('2026-10-17_행사-유미MCP-바이브해커톤'), count: 4, files: ['state.md'] },
    // 카카오페이 강의가 의사 강좌를 한 번(문턱 아래 — 선으로는 안 넣는다)
    { a: P('2026-11-18_강의-카카오페이-LLM위키'), b: X('2026-10-27_강의-의사를-위한-AI-강좌'), count: 1, files: ['a.md'] },
  ]
  return inp
}
const stemHas = (m: ReturnType<typeof buildLinkMap>, id: string) => m.stems.find((s) => s.members.includes(id) || s.past.includes(id))

describe('LM 지난 일(보관 폴더)', () => {
  it('보관 폴더는 줄기 계산에 안 들고, 선이 넉넉하면 그 줄기의 «지난 일» 로 붙는다 · 혼자 있는 폴더·허브로 안 센다', () => {
    const m0 = buildLinkMap(base()), m = buildLinkMap(withPast())
    expect(m.stems.map((s) => s.members)).toEqual(m0.stems.map((s) => s.members))   // 지금 폴더 줄기는 그대로
    const hk = stemHas(m, P('2026-11-21_행사-노션-해커톤'))!
    expect(hk.past).toEqual([X('2026-10-17_행사-유미MCP-바이브해커톤')])
    expect(hk.bot).toContain(X('2026-10-17_행사-유미MCP-바이브해커톤'))
    expect(m.nodes.find((n) => n.id === X('2026-10-17_행사-유미MCP-바이브해커톤'))).toMatchObject({ byBot: 'graph', stem: m.stems.indexOf(hk) })
    expect(stemHas(m, X('2026-10-27_강의-의사를-위한-AI-강좌'))).toBeUndefined()   // 언급 한 번은 문턱(3) 아래
    expect(m.iso.some((id) => id.startsWith('4. Archive'))).toBe(false)
    expect(m.past).toEqual({ total: 4, linked: 2 })
    expect(m.undecided).toEqual(expect.arrayContaining(PAST.map((p) => p.id)))   // 모델은 아직 하나도 안 봤다
  })
  it('마감 글 · 과녁 고리 · 이름표(남는 이름이 짧으면 종류 낱말을 안 뗀다)', () => {
    const m = buildLinkMap(withPast())
    const n = (id: string) => m.nodes.find((x) => x.id === id)!
    expect(ddText(n(X('2026-10-27_강의-의사를-위한-AI-강좌')), '2026-11-04')).toBe('10/27 끝')
    expect(ddText(n(X('_이전연도/2025/2025-09_강의-KICT-AX스타트업')), '2026-11-04')).toBe('25년 9월')
    expect(ringOf(n(X('2026-09_Note-App-선정')), '2026-11-04')).toBe(4)
    expect(labelOf('2026-10_번역체-정리')).toBe('번역체 정리')
    expect(labelOf('2026-03 SGI 입학축하금')).toBe('SGI 입학축하금')
  })
  it('가져다 쓸 것 — 지금 일의 글이 지난 일을 두 번 넘게 적었을 때(방향) · 지난 일 허브는 빼고', () => {
    const inp = withPast()
    const many = Array.from({ length: 6 }, (_, i) => ({ id: P(`2026-12-1${i}_y-${i}`), name: `2026-12-1${i}_y-${i}` }))
    inp.nodes = [...inp.nodes, ...many]
    inp.mentions = [...inp.mentions, ...many.map((x) => ({ a: x.id, b: X('2026-09_Note-App-선정'), count: 3, files: ['a.md'] }))]
    const m = buildLinkMap(inp)
    expect(m.reuse.find((r) => r.to === P('2026-11-21_행사-노션-해커톤') && r.from === X('2026-10-17_행사-유미MCP-바이브해커톤'))).toBeTruthy()
    expect(m.reuse.some((r) => r.from === X('2026-09_Note-App-선정'))).toBe(false)
  })
  it('지난 일 목록(pastFor) — 선으로 이어진 것 먼저, 모자라면 같은 줄기의 지난 일 · 봇 카드에 «지난 일» 칸', () => {
    const inp = withPast()
    inp.ai = { at: 5, entities: [], similar: [], stemNames: [], place: [{ folder: X('_이전연도/2025/2025-09_강의-KICT-AX스타트업'), stem: stemHas(buildLinkMap(withPast()), P('2026-11-21_행사-노션-해커톤'))!.key, name: '', why: '해커톤 운영', at: 9 }] }
    const m = buildLinkMap(inp)
    const ps = pastFor(m, P('2026-11-28_행사-MYSELF-해커톤'))
    expect(ps.map((p) => [p.id, p.via])).toEqual([[X('2026-10-17_행사-유미MCP-바이브해커톤'), 'link'], [X('_이전연도/2025/2025-09_강의-KICT-AX스타트업'), 'stem']])
    const card = linkCard(m, P('2026-11-28_행사-MYSELF-해커톤'))
    expect(card).toContain('## 지난 일 — 보관 폴더에서 가져다 쓸 것')
    expect(card).toContain('`03_산출물/운영매뉴얼.pdf`')
    expect(card.split('## 지난 일')[0]).not.toMatch(/^- 유미MCP/m)   // 지난 일은 «이어진 폴더» 목록에 섞지 않는다(♻ 줄은 괜찮다)
  })
  it('과녁 — 지난 일은 바깥 고리(4)에 작게 · 끄면 안 그린다 · 목록 끝에 «지난 일 · 보관»', () => {
    const m = buildLinkMap(withPast())
    const on = targetLayout(m, 640, true), off = targetLayout(m, 640, false)
    const p = on.points.find((x) => x.id === X('2026-10-17_행사-유미MCP-바이브해커톤'))!
    expect(p).toMatchObject({ ring: 4, r: 3 })
    expect(off.points.some((x) => x.id.startsWith('4. Archive'))).toBe(false)
    expect(on.points.some((x) => x.id === X('2026-09_Note-App-선정'))).toBe(false)   // 이어진 데도 줄기도 없는 지난 일은 안 그린다
    const secs = listSections(m)
    expect(secs.at(-1)).toMatchObject({ title: '지난 일 · 보관', past: true })
    expect(secs.at(-1)!.rows.map((r) => r.id)).toContain(X('2026-10-17_행사-유미MCP-바이브해커톤'))
    expect(flowLayout(m).items.some((it) => it.id.startsWith('4. Archive'))).toBe(false)
  })
})

describe('LM 줄기 관리', () => {
  const run = (edits: LinkEdits, ai?: BuildIn['ai']) => { const inp = withPast(); inp.edits = edits; if (ai) inp.ai = ai; return buildLinkMap(inp) }
  it('처음 손대면 지금 목록이 edit.json 으로 옮겨지고(관리 시작) 그 줄기만 «고정» — 봇이 넣은 지난 일은 안 옮긴다', () => {
    const m = run(EMPTY_EDITS)
    expect(m.managed).toBe(false)
    const hk = stemHas(m, P('2026-11-21_행사-노션-해커톤'))!
    const e = applyStemOp(m, EMPTY_EDITS, { op: 'rename', stem: hk.key, name: '해커톤' })
    expect(e.stems!.map((s) => s.name)).toContain('해커톤')
    expect(e.stems!.find((s) => s.name === '해커톤')).toMatchObject({ fixed: true })
    expect(e.stems!.filter((s) => s.fixed).length).toBe(1)
    expect(e.stems!.flatMap((s) => s.members)).not.toContain(X('2026-10-17_행사-유미MCP-바이브해커톤'))
    const m2 = run(e)
    expect(m2.managed).toBe(true)
    expect(stemHas(m2, X('2026-10-17_행사-유미MCP-바이브해커톤'))!.name).toBe('해커톤')   // 지난 일은 봇이 다시 넣는다
  })
  it('🔴 관리 뒤에는 다시 계산해도 안 풀린다 — 선이 바뀌어도 Dave 가 정한 구성원 그대로', () => {
    const m = run(EMPTY_EDITS)
    const hk = stemHas(m, P('2026-11-21_행사-노션-해커톤'))!
    const e = applyStemOp(m, EMPTY_EDITS, { op: 'add', stem: hk.key, folder: P('2026-11_강의-샌드박스-AFTER7') })
    const inp = withPast(); inp.edits = e
    inp.mentions = inp.mentions.filter((x) => !x.a.includes('노션'))   // 노션 해커톤의 선이 다 사라져도
    const m2 = buildLinkMap(inp)
    const st = m2.stems.find((s) => s.key === hk.key)!
    expect(st.members).toEqual(expect.arrayContaining([P('2026-11-21_행사-노션-해커톤'), P('2026-11_강의-샌드박스-AFTER7')]))
    expect(st.fixed).toBe(true)
  })
  it('빼기(out) — 줄기 밖으로 · 봇도 선으로 다시 넣지 않는다 / 봇에게 맡기기(auto) — 다시 넣는다', () => {
    const m = run(EMPTY_EDITS)
    const id = X('2026-10-17_행사-유미MCP-바이브해커톤')
    const e = applyStemOp(m, EMPTY_EDITS, { op: 'out', folder: id })
    expect(e.out).toContain(id)
    expect(stemHas(run(e), id)).toBeUndefined()
    const e2 = applyStemOp(run(e), e, { op: 'auto', folder: id })
    expect(e2.out).not.toContain(id)
    expect(stemHas(run(e2), id)).toBeTruthy()
  })
  it('합치기 · 지우기(폴더는 봇이 다시 나눈다) · 새 줄기 · 차례', () => {
    const m = run(EMPTY_EDITS)
    const [a, b] = m.stems
    const merged = applyStemOp(m, EMPTY_EDITS, { op: 'merge', from: a.key, into: b.key, name: '합친 줄기' })
    expect(merged.stems!.length).toBe(m.stems.length - 1)
    expect(merged.stems!.find((s) => s.id === b.key)).toMatchObject({ name: '합친 줄기', fixed: true })
    expect(merged.stems!.find((s) => s.id === b.key)!.members).toEqual(expect.arrayContaining(a.members))
    const made = applyStemOp(run(merged), merged, { op: 'create', name: '강의', folders: [P('2026-11-18_강의-카카오페이-LLM위키')] })
    const mm = run(made)
    expect(stemHas(mm, P('2026-11-18_강의-카카오페이-LLM위키'))!.name).toBe('강의')
    expect(() => applyStemOp(mm, made, { op: 'create', name: '강의' })).toThrow(/이미 있어요/)
    const ids = mm.stems.map((s) => s.key).reverse()
    expect(run(applyStemOp(mm, made, { op: 'order', ids })).stems.map((s) => s.key)).toEqual(ids)
    const del = applyStemOp(mm, made, { op: 'delete', stem: stemHas(mm, P('2026-11-18_강의-카카오페이-LLM위키'))!.key })
    const md = run(del)
    // 지운 줄기의 폴더는 «줄기 밖» 이 아니라 봇 판단을 기다린다
    expect(md.undecided).toContain(P('2026-11-18_강의-카카오페이-LLM위키'))
    expect(() => applyStemOp(md, del, { op: 'add', stem: md.stems[0].key, folder: A('개인_없음') })).toThrow(/지도에 없는/)
  })
  it('모델 판단(ai.place)이 선보다 먼저 · «맞는 줄기 없음» 은 선으로도 안 넣는다 · 줄기 id 가 바뀌어도 이름으로 따라간다', () => {
    const m = run(EMPTY_EDITS)
    const iw = stemHas(m, A('사업_이네이트-홈페이지'))!
    const ai = { at: 5, entities: [], similar: [], stemNames: [],
      place: [{ folder: X('2026-10-27_강의-의사를-위한-AI-강좌'), stem: 'old-id', name: iw.name, why: '이네이트 강의', at: 7 }],
      placeNone: [X('2026-10-17_행사-유미MCP-바이브해커톤')] }
    const m2 = run(EMPTY_EDITS, ai)
    expect(stemHas(m2, X('2026-10-27_강의-의사를-위한-AI-강좌'))!.key).toBe(iw.key)
    expect(m2.placed[0]).toMatchObject({ folder: X('2026-10-27_강의-의사를-위한-AI-강좌'), how: 'ai', why: '이네이트 강의' })
    expect(stemHas(m2, X('2026-10-17_행사-유미MCP-바이브해커톤'))).toBeUndefined()
    expect(m2.undecided).not.toContain(X('2026-10-27_강의-의사를-위한-AI-강좌'))
    expect(m2.undecided).not.toContain(X('2026-10-17_행사-유미MCP-바이브해커톤'))
  })
  it('새 줄기 제안 — 받으면 줄기가 되고, 버리면 다시 안 뜬다 · 되돌리기는 계산으로', () => {
    const ai = { at: 5, entities: [], similar: [], stemNames: [], proposals: [{ id: 'p1', name: '법무·생활', folders: [A('개인_법무팀'), A('개인_비서실'), X('2026-09_Note-App-선정')] }] }
    const m = run(EMPTY_EDITS, ai)
    expect(m.proposals.map((p) => p.name)).toEqual(['법무·생활'])
    const acc = applyStemOp(m, EMPTY_EDITS, { op: 'accept', proposal: 'p1' })
    expect(acc.stems!.find((s) => s.name === '법무·생활')!.members).toEqual([A('개인_법무팀'), A('개인_비서실'), X('2026-09_Note-App-선정')])
    const drop = applyStemOp(m, EMPTY_EDITS, { op: 'drop', proposal: 'p1' })
    expect(run(drop, ai).proposals).toEqual([])
    expect(applyStemOp(m, acc, { op: 'reset' })).toEqual(EMPTY_EDITS)
  })
  it('넣기 프롬프트 · 답 읽기', () => {
    const p = placePrompt([{ name: '해커톤', line: '해커톤 운영', examples: ['노션 해커톤'] }], [{ label: '유미MCP 바이브해커톤', past: true, text: '목표: …' }])
    expect(p).toContain('- 해커톤 — 해커톤 운영 · 든 폴더: 노션 해커톤')
    expect(p).toContain('### 유미MCP 바이브해커톤 (보관)')
    expect(parsePlace('앞말 {"place":[{"folder":"a","stem":"해커톤","why":"w"},{"folder":"b","stem":""},{"x":1}],"new":[{"name":"새","folders":["b","c"]},{"name":"하나","folders":["d"]}]}')).toEqual({
      place: [{ folder: 'a', stem: '해커톤', why: 'w' }, { folder: 'b', stem: '', why: '' }], fresh: [{ name: '새', folders: ['b', 'c'] }],
    })
    expect(parsePlace('없음')).toBeNull()
  })
})
