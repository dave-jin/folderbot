import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { useStore } from './store'
import { Icon } from './FolderBot'
import { askName } from './Sheets'
import { StemManager } from './StemManager'
import {
  KIND_KO, LINK_KINDS, RING_KO, ddText, daysLeft, flowLayout, listSections, neighbors, pastFor, searchLinks, targetLayout,
  type FlowRange, type LinkKind, type LinkMap, type LinkNode, type Reuse, type StemOp,
} from '../core/linkMap'

/**
 * 🔴 연결 지도 — 화면 (LM · 2026-11-04 · 상황판 «목표 | 연결» 의 «연결»).
 *    목업 `2. Area/제품_FolderBot/03_디자인/2026-11-03_연결-지도-목업/` — 11/3 Dave «흐름(B)이 기본 · 지도·목록은 탭»,
 *    11/4 «지도 탭은 과녁 지도로 · 줄기는 계산 + Dave 가 고침».
 *  - 흐름: 가로 = 마감, 줄 = 일의 줄기 · 왼쪽 칸 = 그 줄기의 상시 영역
 *  - 지도: 과녁 — 가운데 = 7일 안, 방향 = 줄기. 오른쪽에 줄기(이름 고치기) · 다리 폴더
 *  - 목록: 폴더마다 이어진 폴더 · 가져다 쓸 것 · 바로 하기
 * ⚠ 값과 배치는 모두 `core/linkMap` 이 계산한다 — 화면은 그리기만. 폴더를 누르면 아래(폰) · 옆(맥) 칸에 «왜 이어졌나».
 * 11/4 줄기 관리(`StemManager`) · 지난 일(보관 폴더) — 과녁 바깥 고리 · 목록 «지난 일 · 보관» · 폴더 칸 «지난 일에서 가져다 쓸 것».
 *    목업 `03_디자인/2026-11-04_줄기-관리-목업/`.
 */
type Status = { at: number | null; building: boolean; owner: boolean; aiAt: number | null }
type Resp = { map: LinkMap; status: Status }
type View = 'flow' | 'map' | 'list'
const VIEW_KO: Record<View, string> = { flow: '흐름', map: '지도', list: '목록' }
const RANGE_KO: Record<FlowRange, string> = { month: '이번 달', '10w': '10주', year: '올해' }
const p2 = (n: number) => String(n).padStart(2, '0')
const when = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}` }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const GRAY = '#8a8f98'

function KindLine({ t, sm }: { t: LinkKind; sm?: boolean }) { return <i className={`lm-ln lm-${t}${sm ? ' sm' : ''}`} aria-hidden /> }

export function LinksView({ phone, go, openDoc, say }: {
  phone?: boolean
  go: (botId: string, sid?: string) => void
  openDoc?: (botId: string, rel: string) => void
  say: (m: string) => void
}) {
  const { s } = useStore()
  const [r, setR] = useState<Resp | null>(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState<View>('flow')
  const [range, setRange] = useState<FlowRange>('10w')
  const [show, setShow] = useState<Set<LinkKind>>(new Set(LINK_KINDS))
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [stemF, setStemF] = useState<number | null>(null)
  const [sort, setSort] = useState<'due' | 'act' | 'reuse'>('due')
  const [busy, setBusy] = useState(false)
  const [mng, setMng] = useState(false)
  const [withPast, setWithPast] = useState(() => { try { return localStorage.getItem('fb.lm.past') !== '0' } catch { return true } })
  const togglePast = () => setWithPast((v) => { try { localStorage.setItem('fb.lm.past', v ? '0' : '1') } catch { /* */ } return !v })
  const sideRef = useRef<HTMLElement | null>(null)
  // 폰 — 폴더를 누르면 «왜 이어졌나» 칸이 맨 위로 온다(목록 아래로 숨지 않게)
  useEffect(() => { if (sel && phone) sideRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [sel, phone])
  const load = (fresh = false) => {
    setBusy(true)
    void api<Resp>(`/links${fresh ? '?fresh=1' : ''}`).then((x) => { setR(x); setErr('') }).catch((e) => setErr(errMsg(e))).finally(() => setBusy(false))
  }
  useEffect(() => { load() }, [])
  // 짓는 중이었으면 잠시 뒤 다시
  useEffect(() => { if (!r?.status.building) return; const t = window.setTimeout(() => load(), 4000); return () => window.clearTimeout(t) }, [r?.status.building])

  const map = r?.map ?? null
  const byId = useMemo(() => new Map((map?.nodes ?? []).map((n) => [n.id, n])), [map])
  const hits = useMemo(() => (map && q.trim() ? new Set(searchLinks(map, q).nodes.map((x) => x.id)) : null), [map, q])
  const color = (n: LinkNode | undefined) => (n && n.stem !== undefined ? map!.stems[n.stem].color : GRAY)
  const dim = (id: string) => (hits ? !hits.has(id) : stemF !== null ? byId.get(id)?.stem !== stemF : false)
  const botOf = (n?: LinkNode) => (n?.botId ? s.bots.find((b) => b.id === n.botId) : undefined)
  const rootAbs = useMemo(() => { const b = s.bots.find((x) => !x.orchestrator && x.abs.endsWith(x.rel)); return b ? b.abs.slice(0, b.abs.length - b.rel.length).replace(/\/$/, '') : '' }, [s.bots])

  const op = async (o: StemOp, ok: string): Promise<boolean> => {
    try { const x = await api<Resp>('/links/stem', { body: { action: 'op', op: o } }); setR(x); say(ok); return true } catch (e) { say(errMsg(e)); return false }
  }
  const rename = async (key: string, cur: string) => { const nm = await askName('줄기 이름', cur); if (nm && nm.trim() && nm.trim() !== cur) await op({ op: 'rename', stem: key, name: nm.trim() }, '줄기 이름을 바꿨어요') }
  // 폴더 파일 열기 — 봇이 없는 폴더(보관 폴더 등)는 오케스트레이터(볼트 루트) 기준 경로로
  const openFile = (id: string, f: string) => {
    const b = botOf(byId.get(id)); const orch = s.bots.find((x) => x.orchestrator)
    if (b && openDoc) openDoc(b.id, f); else if (orch && openDoc) openDoc(orch.id, `${id}/${f}`); else say(`${id}/${f}`)
  }
  const tell = async (rr: Reuse) => {
    const to = byId.get(rr.to), from = byId.get(rr.from); const b = botOf(to)
    if (!to || !from || !b) { say('그 폴더의 봇이 아직 없어요'); return }
    const text = [`[연결 지도 · 알려 주기] 이어진 폴더: ${from.label} (${from.id} · ${ddText(from, map!.today)})`, `가져다 쓸 것: ${rr.what}${rr.fact ? '' : ' (봇 추측)'}`, ...rr.files.map((f) => `- ${from.id}/${f}`), '읽기만 하세요 — links_read 로 읽고, 쓸 만하면 이 폴더 작업에 반영하세요. 답은 필요 없어요.'].join('\n')
    try { await api('/links/tell', { body: { bot: b.id, text } }); say(`${to.label} 봇에게 알렸어요`) } catch (e) { say(errMsg(e)) }
  }
  const ref = async (rr: Reuse) => {
    const to = byId.get(rr.to); const b = botOf(to)
    if (!b || !rootAbs) { say('그 폴더의 봇이 아직 없어요'); return }
    try { await api(`/bots/${b.id}/refs`, { body: { path: `${rootAbs}/${rr.from}` } }); say(`${to!.label} 에 ${byId.get(rr.from)?.label} 을 참조 폴더로 묶었어요`); load(true) } catch (e) { say(errMsg(e)) }
  }
  const act = (rr: Reuse) => (rr.act === 'ref' ? void ref(rr) : void tell(rr))

  if (!map) return <div className="lm"><div className="bempty">{err ? `연결 지도를 못 읽었어요 — ${err}` : '연결 지도를 짓는 중…(볼트를 처음 훑으면 몇 초 걸려요)'}</div></div>
  const selN = sel ? byId.get(sel) : undefined

  const toggles = <span className="lm-kinds"><span className="m">선</span>{LINK_KINDS.map((k) => <button key={k} className={show.has(k) ? 'on' : ''} onClick={() => setShow((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n })} title={`${KIND_KO[k]} — ${map.counts[k]}개`}><KindLine t={k} />{KIND_KO[k]}</button>)}</span>

  const stemMove = async (to: string) => {
    const id = selN!.id
    if (to === '__manage') { setMng(true); return }
    if (to === '__new') { const nm = await askName('새 줄기 이름'); if (nm?.trim()) await op({ op: 'create', name: nm.trim(), folders: [id] }, `«${nm.trim()}» 줄기를 만들고 넣었어요`); return }
    if (to === '__none') await op({ op: 'out', folder: id }, '줄기 밖으로 뺐어요 — 봇이 다시 넣지 않아요')
    else if (to === '__auto') await op({ op: 'auto', folder: id }, '봇에게 맡겼어요 — 주인 맥이 줄기에 맞춰 넣어요')
    else await op({ op: 'add', stem: to, folder: id }, '줄기를 옮겼어요')
  }
  const detail = selN ? <NodeDetail map={map} n={selN} color={color} onPick={setSel} close={() => setSel(null)}
    stemMove={(to) => void stemMove(to)}
    act={act} bot={botOf(selN)} go={go} openFile={openFile} /> : null

  return <div className={`lm ${phone ? 'phone' : ''}`}>
    <div className="lm-bar">
      <span className="seg">{(['flow', 'map', 'list'] as View[]).map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{VIEW_KO[v]}</button>)}</span>
      {view === 'flow' ? <span className="seg">{(['month', '10w', 'year'] as FlowRange[]).map((x) => <button key={x} className={range === x ? 'on' : ''} onClick={() => setRange(x)}>{RANGE_KO[x]}</button>)}</span> : null}
      {view === 'list' ? <span className="seg">{([['due', '마감 순'], ['act', '움직인 순'], ['reuse', '가져다 쓸 것만']] as const).map(([k, t]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{t}</button>)}</span> : null}
      <span className="lm-q"><Icon n="search" size={12} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="폴더·사람·주제" aria-label="연결 지도에서 찾기" />{q ? <button className="ib" onClick={() => setQ('')} aria-label="지우기"><Icon n="x" size={11} /></button> : null}</span>
      <span className="lm-meta">{map.at ? `${when(map.at)} 정리` : ''} · 폴더 {map.nodes.length - (map.past?.total ?? 0)} · 지난 일 {map.past?.linked ?? 0}/{map.past?.total ?? 0} · 줄기 {map.stems.length}{r?.status.building || busy ? ' · 다시 짓는 중…' : ''}<button className="ib" onClick={() => load(true)} title="지금 다시 짓기" aria-label="다시 짓기"><Icon n="undo" size={12} /></button></span>
    </div>
    <div className="lm-bar2">{toggles}{view === 'map' && map.past?.total ? <button className={`lm-chip${withPast ? ' on' : ''}`} onClick={togglePast} title="보관 폴더(끝난 일)를 과녁 바깥 고리에">지난 일 {map.past.linked}</button> : null}
      <button className="lm-chip" onClick={() => setMng(true)}><Icon n="edit" size={10} />줄기 관리</button>{stemF !== null ? <button className="lm-chip on" onClick={() => setStemF(null)}>줄기 «{map.stems[stemF]?.name}» 만 <Icon n="x" size={10} /></button> : null}
      {map.aiAt ? null : <span className="lm-note">같은 사람·장소 · 비슷한 일은 주인 맥이 하루 한 번 채워요{r?.status.owner ? '' : ' (이 맥은 주인이 아니에요)'}</span>}</div>

    <div className={`lm-main ${view}`}>
      <div className="lm-canvas">
        {view === 'flow' ? <Flow map={map} range={range} show={show} color={color} dim={dim} sel={sel} onPick={setSel} />
          : view === 'map' ? <Target map={map} show={show} color={color} dim={dim} sel={sel} onPick={setSel} withPast={withPast} />
            : <List map={map} sort={sort} show={show} color={color} dim={dim} sel={sel} onPick={setSel} act={act} />}
        {view === 'flow' ? <Insights map={map} act={act} onPick={setSel} /> : null}
        {view !== 'list' && map.iso.filter((id) => !byId.get(id)?.past).length ? <div className="lm-iso"><span className="m">혼자 있는 폴더 {map.iso.length}</span>{map.iso.map((id) => <button key={id} className="lm-chip" onClick={() => setSel(id)}>{byId.get(id)?.label}</button>)}{map.hubs.length ? <span className="m">· 허브 {map.hubs.map((h) => byId.get(h)?.label).join(' · ')} (다들 가리키는 곳 — 흐리게)</span> : null}</div> : null}
      </div>
      {(view === 'map' && !phone) || detail ? <aside className="lm-side" ref={sideRef}>
        {detail}
        {view === 'map' && !selN ? <Stems map={map} stemF={stemF} setStemF={setStemF} rename={(k, n) => void rename(k, n)} onPick={setSel} manage={() => setMng(true)} /> : null}
      </aside> : null}
    </div>
    {view === 'map' && phone && !selN ? <Stems map={map} stemF={stemF} setStemF={setStemF} rename={(k, n) => void rename(k, n)} onPick={setSel} manage={() => setMng(true)} /> : null}
    {mng ? <StemManager map={map} op={op} close={() => setMng(false)} onPick={(id) => setSel(id)} phone={phone} /> : null}
  </div>
}

/* ── 흐름 ─────────────────────────────────────────────────────────────────── */

type Draw = { map: LinkMap; show: Set<LinkKind>; color: (n?: LinkNode) => string; dim: (id: string) => boolean; sel: string | null; onPick: (id: string) => void }
const near = (map: LinkMap, sel: string | null) => (sel ? new Set([sel, ...neighbors(map, sel).map((x) => x.id)]) : null)

function Flow({ map, range, show, color, dim, sel, onPick }: Draw & { range: FlowRange }) {
  const L = useMemo(() => flowLayout(map, range, show), [map, range, show])
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const nb = near(map, sel)
  const reuseTo = new Set(map.reuse.map((x) => x.to))
  return <div className="lm-scroll"><svg className="lm-svg" viewBox={`0 0 ${L.width} ${L.height}`} width={L.width} height={L.height} role="img" aria-label="마감 흐름">
    <defs><marker id="lm-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="#5fa8ff" /></marker></defs>
    <rect x={L.soon[0]} y={30} width={Math.max(0, L.soon[1] - L.soon[0])} height={L.height - 34} className="lm-soon" />
    <text className="lm-tk2" x={(L.soon[0] + L.soon[1]) / 2} y={22} textAnchor="middle">다음 2주</text>
    {L.ticks.map((t) => <g key={t.x}><line x1={t.x} y1={30} x2={t.x} y2={L.height - 4} className="lm-grid" /><text className="lm-tk" x={t.x + 3} y={42}>{t.label}</text></g>)}
    <line x1={L.todayX} y1={26} x2={L.todayX} y2={L.height - 4} className="lm-today" /><text className="lm-todayt" x={L.todayX} y={22} textAnchor="middle">오늘</text>
    <line x1={L.laterX} y1={30} x2={L.laterX} y2={L.height - 4} className="lm-grid dash" /><text className="lm-tk" x={L.laterX + 4} y={42}>그 뒤</text>
    <text className="lm-tk" x={L.areaX - 8} y={42} textAnchor="end">상시 영역</text>
    {L.lanes.map((ln) => <g key={ln.name}><line x1={0} y1={ln.y + ln.h} x2={L.width} y2={ln.y + ln.h} className="lm-grid" /><text className="lm-lane" x={6} y={ln.y + 22} fill={ln.color}>{ln.name.length > 9 ? `${ln.name.slice(0, 9)}…` : ln.name}</text></g>)}
    {L.paths.map((p) => {
      const on = nb ? (p.a === sel || p.b === sel) : null
      return <path key={`${p.t}:${p.a}:${p.b}`} className={`lm-e lm-${p.t}${on === false || dim(p.a) && dim(p.b) ? ' off' : ''}${on ? ' hot' : ''}`} d={p.d} markerEnd={p.dir ? 'url(#lm-ar)' : undefined}><title>{`${byId.get(p.a)?.label} — ${byId.get(p.b)?.label}\n${KIND_KO[p.t]}${p.guess ? ' (봇 추측)' : ''}`}</title></path>
    })}
    {L.items.map((it) => {
      const n = byId.get(it.id)!; const c = color(n); const off = dim(it.id) || (nb ? !nb.has(it.id) : false)
      const dd = ddText(n, map.today); const past = dd === '끝남'
      if (it.kind === 'P') return <g key={it.id} className={`lm-p${off ? ' off' : ''}${past ? ' past' : ''}${sel === it.id ? ' sel' : ''}`} onClick={() => onPick(it.id)}><title>{n.id}</title>
        <circle cx={it.x} cy={it.y} r={5.5} fill={c} /><text x={it.x + 10} y={it.y + 4}>{n.label}<tspan className="dd"> {dd}</tspan>{reuseTo.has(it.id) ? <tspan className="ru"> ♻</tspan> : null}</text></g>
      const w = 16 + [...n.label].reduce((s2, ch) => s2 + (ch.charCodeAt(0) > 0x3000 ? 10.2 : 6.4), 0)
      return <g key={it.id} className={`lm-a${off ? ' off' : ''}${sel === it.id ? ' sel' : ''}`} onClick={() => onPick(it.id)}><title>{n.id}</title>
        <rect x={it.x - w} y={it.y - 10} width={w} height={20} rx={10} stroke={c} /><text x={it.x - w / 2} y={it.y + 4} textAnchor="middle">{n.label}</text><circle cx={it.x + 4} cy={it.y} r={2.5} fill={c} /></g>
    })}
  </svg></div>
}

/** 흐름 아래 세 덩이 — 끝난 일에서 가져올 것 · 비슷한 일 · 참조 폴더로 묶을 쌍 */
function Insights({ map, act, onPick }: { map: LinkMap; act: (r: Reuse) => void; onPick: (id: string) => void }) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const L = (id: string) => byId.get(id)?.label ?? id
  const fromPast = map.reuse.filter((r) => r.act === 'tell' && r.fact)
  const guess = map.reuse.filter((r) => r.act === 'tell' && !r.fact)
  const refs = map.reuse.filter((r) => r.act === 'ref')
  const box = (title: string, rows: Reuse[], empty: string) => <div className="lm-ins"><b>{title}</b>
    {rows.length ? rows.slice(0, 4).map((r) => <div key={`${r.to}:${r.from}`} className="r"><button className="lk" onClick={() => onPick(r.to)}>{L(r.to)}</button><span> ← {L(r.from)} · {r.what}{r.fact ? '' : <span className="lm-tag guess">봇 추측</span>}</span><button className="btn sm" onClick={() => act(r)}>{r.act === 'ref' ? '참조 폴더로 묶기' : '알려 주기'}</button></div>) : <div className="m">{empty}</div>}</div>
  return <div className="lm-insights">{box('♻ 끝난 일·앞선 일에서 가져올 것', fromPast, '아직 없어요')}{box('♻ 비슷한 일', guess, map.aiAt ? '없어요' : '주인 맥이 하루 한 번 채워요')}{box('🔗 참조 폴더로 묶을 만한 쌍', refs, '중계가 잦은 쌍이 없어요')}</div>
}

/* ── 과녁 지도 ─────────────────────────────────────────────────────────────── */

function Target({ map, show, color, dim, sel, onPick, withPast }: Draw & { withPast: boolean }) {
  const T = useMemo(() => targetLayout(map, 640, withPast), [map, withPast])
  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map])
  const pos = new Map(T.points.map((p) => [p.id, p]))
  const nb = useMemo(() => near(map, sel), [map, sel])
  // 이름표 자리 — 중요한 것부터 놓고, 이미 놓인 이름표와 겹치면 반대쪽 → 그래도 겹치면 안 단다(누르면 보인다 · 마우스를 올리면 제목)
  const labels = useMemo(() => {
    const rank = (n: LinkNode) => (sel === n.id ? 0 : nb?.has(n.id) ? 1 : n.past ? 99 : n.bridge ? 2 : n.kind === 'P' && (daysLeft(n, map.today) ?? -1) >= 0 ? 3 + Math.min(daysLeft(n, map.today)!, 400) / 1000 : 5 - Math.min(n.act, 99) / 100)
    const placed: [number, number, number, number][] = []
    const out = new Map<string, { x: number; anchor: 'start' | 'end' }>()
    const pts = T.points.map((p) => ({ p, n: byId.get(p.id)! })).sort((a, b) => rank(a.n) - rank(b.n))
    for (const { p, n } of pts) {
      if (rank(n) >= 99) continue   // 지난 일은 이름을 숨긴다 — 고른 폴더와 이어진 것만 켠다
      const txt = n.label + (n.kind === 'P' ? ` ${ddText(n, map.today)}` : '')
      const w = [...txt].reduce((s2, ch) => s2 + (ch.charCodeAt(0) > 0x3000 ? 11.5 : 6.8), 0)
      const tries: ('start' | 'end')[] = p.x >= T.c ? ['start', 'end'] : ['end', 'start']
      for (const anchor of tries) {
        const x = p.x + (anchor === 'start' ? p.r + 4 : -p.r - 4)
        const box: [number, number, number, number] = anchor === 'start' ? [x, p.y - 9, x + w, p.y + 6] : [x - w, p.y - 9, x, p.y + 6]
        const hit = placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))
        if (!hit || rank(n) < 1) { placed.push(box); out.set(p.id, { x, anchor }); break }
      }
    }
    return out
  }, [T, sel, nb, byId, map.today])
  const pad = 70
  return <div className="lm-scroll center"><svg className="lm-svg" viewBox={`${-pad} ${-20} ${T.size + pad * 2} ${T.size + 40}`} width={T.size + pad * 2} height={T.size + 40} role="img" aria-label="과녁 지도">
    {T.rings.map((rg, i) => <g key={i}><circle cx={T.c} cy={T.c} r={rg.r} className={`lm-ring r${i}`} /><text className="lm-tk" x={T.c} y={T.c - rg.r + 12} textAnchor="middle">{rg.label}</text></g>)}
    <circle cx={T.c} cy={T.c} r={T.rings[0].r * 0.62} className="lm-now" /><text className="lm-todayt" x={T.c} y={T.c + 4} textAnchor="middle">오늘 {+map.today.slice(5, 7)}/{+map.today.slice(8, 10)}</text>
    {T.sectors.map((sc) => <g key={sc.stem}><line x1={T.c} y1={T.c} x2={T.c + T.rings[4].r * Math.cos(sc.a0)} y2={T.c + T.rings[4].r * Math.sin(sc.a0)} className="lm-sector" />
      <text className="lm-stemt" x={sc.lx} y={sc.ly} textAnchor={sc.anchor} fill={map.stems[sc.stem].color}>{map.stems[sc.stem].name}<tspan className="dd"> {map.stems[sc.stem].members.length}</tspan></text></g>)}
    {map.edges.filter((e) => show.has(e.t) && pos.has(e.a) && pos.has(e.b) && !(e.t === 'mention' && e.w < 2) && (!(byId.get(e.a)?.past || byId.get(e.b)?.past) || e.a === sel || e.b === sel)).map((e) => {
      const a = pos.get(e.a)!, b = pos.get(e.b)!; const on = nb ? (e.a === sel || e.b === sel) : null
      const mx = (a.x + b.x) / 2 + (T.c - (a.x + b.x) / 2) * 0.25, my = (a.y + b.y) / 2 + (T.c - (a.y + b.y) / 2) * 0.25
      return <path key={`${e.t}:${e.a}:${e.b}`} className={`lm-e lm-${e.t}${on === false || (dim(e.a) && dim(e.b)) ? ' off' : ''}${on ? ' hot' : ''}`} d={`M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`}><title>{`${byId.get(e.a)?.label} — ${byId.get(e.b)?.label}\n${e.ev}`}</title></path>
    })}
    {T.points.map((p) => {
      const n = byId.get(p.id)!; const c = color(n); const off = dim(p.id) || (nb ? !nb.has(p.id) : false)
      const lb = labels.get(p.id)
      return <g key={p.id} className={`lm-pt${off ? ' off' : ''}${sel === p.id ? ' sel' : ''}${p.ring === 4 ? ' past' : ''}${n.past ? ' arch' : ''}`} onClick={() => onPick(p.id)}><title>{`${n.label} · ${ddText(n, map.today)}${n.past ? ' · 보관' : ''}`}</title>
        {n.past ? <><circle cx={p.x} cy={p.y} r={9} fill="transparent" /><circle cx={p.x} cy={p.y} r={p.r} fill="var(--bg)" stroke={c} strokeWidth={1.4} strokeDasharray="1.6 1.4" /></>
          : n.kind === 'P' ? <circle cx={p.x} cy={p.y} r={p.r} fill={c} /> : <circle cx={p.x} cy={p.y} r={p.r} fill="var(--bg)" stroke={c} strokeWidth={2} />}
        {n.bridge ? <circle cx={p.x} cy={p.y} r={p.r + 4} className="lm-bridge" /> : null}
        {lb ? <text x={lb.x} y={p.y + 4} textAnchor={lb.anchor}>{n.label}{n.kind === 'P' ? <tspan className="dd"> {ddText(n, map.today)}</tspan> : null}</text> : null}
      </g>
    })}
  </svg>
    <div className="lm-legend"><span><i className="dot" />마감 있는 프로젝트</span><span><i className="dot hollow" />상시 영역</span>{withPast ? <span><i className="dot arch" />지난 일(보관 · 누르면 이름)</span> : null}<span><i className="dot br" />다리 폴더</span><span className="m">크기 = 이번 주 바뀐 파일 수 · 고리 = {RING_KO.join(' → ')}</span></div>
  </div>
}

function Stems({ map, stemF, setStemF, rename, onPick, manage }: { map: LinkMap; stemF: number | null; setStemF: (i: number | null) => void; rename: (key: string, name: string) => void; onPick: (id: string) => void; manage: () => void }) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  return <div className="lm-stems">
    <div className="h"><b>일의 줄기</b><span className="m">{map.stems.length} · 누르면 그 줄기만 남는다</span><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={manage}>줄기 관리</button></div>
    {map.stems.map((st, i) => <div key={st.key} className={`st${stemF === i ? ' on' : ''}`}>
      <div className="t"><button className="nm" style={{ color: st.color }} onClick={() => setStemF(stemF === i ? null : i)}>{st.name}</button><span className="m">폴더 {st.members.length}{st.past.length ? ` · 지난 일 ${st.past.length}` : ''}{st.next ? ` · 다음 ${st.next}` : ''}{st.fixed ? ' · 고정' : st.named === 'auto' ? ' · 임시 이름' : ''}</span>
        <button className="ib" title="이름 고치기" aria-label="줄기 이름 고치기" onClick={() => rename(st.key, st.name)}><Icon n="edit" size={11} /></button></div>
      {st.line ? <div className="l">{st.line}</div> : null}
      <div className="mem">{st.members.map((id) => <button key={id} className="lm-chip" onClick={() => onPick(id)}>{byId.get(id)?.label}</button>)}</div>
    </div>)}
    {map.bridges.length ? <><div className="h"><b>다리 폴더</b><span className="m">줄기를 잇는 곳</span></div>
      {map.bridges.map((b) => <div key={b.id} className="st br"><div className="t"><button className="nm" onClick={() => onPick(b.id)}>◌ {byId.get(b.id)?.label}</button><span className="m">지나가는 길 {b.path}</span></div><div className="l">{b.line}</div></div>)}</> : null}
    <div className="foot"><span className="m">폴더를 누르면 줄기를 옮겨요 · 만들기·합치기·지우기·차례는 «줄기 관리»</span></div>
  </div>
}

/* ── 목록 ─────────────────────────────────────────────────────────────────── */

function List({ map, sort, show, color, dim, sel, onPick, act }: Draw & { sort: 'due' | 'act' | 'reuse'; act: (r: Reuse) => void }) {
  const secs = useMemo(() => listSections(map, sort), [map, sort])
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const [pastOpen, setPastOpen] = useState(false)
  return <div className="lm-list">
    {secs.map((sec) => <section key={sec.title}>{sec.past ? <button className="lsec lsec-btn" onClick={() => setPastOpen(!pastOpen)} aria-expanded={pastOpen}>{sec.title} <span>{sec.rows.length}</span><Icon n={pastOpen ? 'chevd' : 'chev'} size={11} /><span className="m">끝난 일 — 줄기 차례 · 최근에 끝난 순</span></button> : <div className="lsec">{sec.title} <span>{sec.rows.length}</span></div>}
      {(sec.past && !pastOpen ? [] : sec.rows).map((row) => {
        const n = byId.get(row.id)!; const nb = row.nb.filter((x) => show.has(x.t)); const dd = ddText(n, map.today); const d = daysLeft(n, map.today)
        return <div key={row.id} className={`lr${sel === row.id ? ' on' : ''}${dim(row.id) ? ' off' : ''}`}>
          <button className="lf" onClick={() => onPick(row.id)}><i className="dotc" style={{ background: color(n) }} /><b>{n.label}</b><span className={`ddc${d !== null && d <= 7 ? ' hot' : ''}`}>{dd}</span></button>
          <div className="lc">{nb.slice(0, 3).map((x) => <button key={x.id} className="lm-chip" onClick={() => onPick(x.id)}><KindLine t={x.t} sm />{x.label}</button>)}{nb.length > 3 ? <span className="more">+{nb.length - 3}</span> : null}{!nb.length ? <span className="m">—</span> : null}</div>
          <div className="lu">{row.reuse ? <><b>♻ {byId.get(row.reuse.from)?.label}</b> · {row.reuse.what} <span className={`lm-tag ${row.reuse.fact ? 'fact' : 'guess'}`}>{row.reuse.fact ? '사실' : '봇 추측'}</span></> : <span className="m">—</span>}</div>
          <div className="la">{row.reuse ? <button className="btn sm" onClick={() => act(row.reuse!)}>{row.reuse.act === 'ref' ? '참조 폴더로 묶기' : '알려 주기'}</button> : null}</div>
        </div>
      })}
    </section>)}
  </div>
}

/* ── 폴더 하나 ─────────────────────────────────────────────────────────────── */

function NodeDetail({ map, n, color, onPick, close, stemMove, act, bot, go, openFile }: {
  map: LinkMap; n: LinkNode; color: (n?: LinkNode) => string; onPick: (id: string) => void; close: () => void
  stemMove: (to: string) => void; act: (r: Reuse) => void; bot?: { id: string }; go: (botId: string) => void; openFile: (folderId: string, rel: string) => void
}) {
  const byId = new Map(map.nodes.map((x) => [x.id, x]))
  const nb = neighbors(map, n.id).filter((x) => n.past || !byId.get(x.id)?.past)
  const past = n.past ? [] : pastFor(map, n.id, 5)
  const reuse = map.reuse.filter((r) => r.to === n.id)
  const st = n.stem !== undefined ? map.stems[n.stem] : null
  const row = (label: string, body: ReactNode) => <div className="kv2"><span className="k">{label}</span><span className="v">{body}</span></div>
  return <div className="lm-node">
    <div className="h"><i className="dotc" style={{ background: color(n) }} /><b>{n.label}</b><span className="dd">{ddText(n, map.today)}</span><button className="ib" onClick={close} aria-label="닫기"><Icon n="x" size={12} /></button></div>
    <div className="path">{n.id}{n.past ? ' · 보관(끝난 일)' : ''}{n.hub ? ' · 허브(다들 가리키는 곳)' : ''}{n.bridge ? ' · 다리 폴더' : ''}</div>
    {n.hub ? null : row('줄기', <span className="stsel"><select value={st ? st.key : ''} onChange={(e) => stemMove(e.target.value)} aria-label="줄기 옮기기">
      {!st ? <option value="">줄기 밖</option> : null}
      {map.stems.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
      <option disabled>──────</option>
      <option value="__new">＋ 새 줄기 만들기…</option><option value="__none">줄기 밖으로</option><option value="__auto">봇에게 맡기기</option>
      <option disabled>──────</option>
      <option value="__manage">줄기 관리 열기</option>
    </select>{n.byBot ? <span className="lm-tag bot" title={n.byBot === 'ai' ? '주인 맥 모델이 줄기 목록에 맞춰 넣었어요 — 옮기면 그때부터 Dave 것' : '이 줄기 폴더들과 선이 가장 많이 닿아요 — 모델이 곧 다시 봐요'}>봇이 넣음</span> : null}</span>)}
    {reuse.map((r) => <div key={r.from + r.act} className="ru"><div><b>♻ {byId.get(r.from)?.label}</b> · {r.what} <span className={`lm-tag ${r.fact ? 'fact' : 'guess'}`}>{r.fact ? '사실' : '봇 추측'}</span></div>
      {r.files.map((f) => <div key={f} className="ff"><code>{f}</code><button className="btn sm" onClick={() => openFile(r.from, f)}>열기</button></div>)}
      <button className="btn primary sm" onClick={() => act(r)}>{r.act === 'ref' ? '참조 폴더로 묶기' : '이 폴더 봇에게 알려 주기'}</button></div>)}
    {past.length ? <><div className="xh">지난 일에서 가져다 쓸 것 <span className="m">보관 폴더 {past.length}</span></div>
      {past.map((p) => <div key={p.id} className="pst"><div className="t"><button className="lk" onClick={() => onPick(p.id)}><b>{p.label}</b></button><span className="lm-tag past">{p.dd}</span>{p.guess ? <span className="lm-tag guess">봇 추측</span> : null}</div>
        <div className="w">{p.why}</div>
        {p.files.slice(0, 2).map((f) => <div key={f} className="ff"><code>{f}</code><button className="btn sm" onClick={() => openFile(p.id, f)}>열기</button></div>)}</div>)}</> : null}
    <div className="xh">왜 이어졌나 <span className="m">{nb.length}</span></div>
    {nb.length ? nb.map((x) => <button key={x.id} className="xr" onClick={() => onPick(x.id)}><KindLine t={x.t} /><b>{x.label}</b><span>{x.ev}{x.guess ? ' (봇 추측)' : ''}{x.kinds.length > 1 ? ` · ${x.kinds.filter((k) => k !== x.t).map((k) => KIND_KO[k]).join('·')}도` : ''}</span></button>) : <div className="m">이어진 폴더가 없어요</div>}
    {n.recent?.length ? <><div className="xh">최근 파일</div>{n.recent.slice(0, 4).map((f) => <div key={f} className="ff"><code>{f}</code><button className="btn sm" onClick={() => openFile(n.id, f)}>열기</button></div>)}</> : null}
    <div className="note">이 폴더 봇은 세션을 시작할 때 이 목록과 같은 «이어진 폴더» 카드를 받아요 — 다른 폴더는 읽기만 해요.</div>
    {bot ? <button className="btn" onClick={() => go(bot.id)}>이 폴더 봇으로 가기</button> : <div className="m">이 폴더에는 아직 봇이 없어요</div>}
  </div>
}
