import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import type { Bot, Candidate, NotifyEvent, RoutineDef } from '../core/types'
import { api, setToken, subscribePush } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { ICON_LABEL, ICON_PX, useIconSize, useTheme, type IconSize, type Theme } from './theme'
import { ACT_ICON, ACT_LABEL, SWIPE_DEFAULT, useSwipeCfg, type SwipeAct, type SwipeSlot } from './swipe'
import { hitRange, rank } from '../core/search'
import { fmtTime, useStore } from './store'
import { EFFORTS, MODELS } from './consts'

marked.setOptions({ gfm: true, breaks: true })
export function Md({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => marked.parse(text) as string, [text])
  return <div className={`md ${streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

/** 걸린 자리를 굵게 — 왜 이 폴더가 나왔는지 눈으로 보이게 (자리 판정은 core/search) */
function Hit({ s, q }: { s: string; q: string }) {
  const r = hitRange(q, s); if (!r) return <>{s.normalize('NFC')}</>
  const t = s.normalize('NFC')
  return <>{t.slice(0, r[0])}<b className="hit">{t.slice(r[0], r[1])}</b>{t.slice(r[1])}</>
}

/** 폰이냐 — 폴더 고르기는 폰에서 완전히 다른 화면을 쓴다(V17 B안) */
function useIsPhone(): boolean {
  const [m, setM] = useState(() => (typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 760px)').matches : false))
  useEffect(() => { const mq = matchMedia('(max-width: 760px)'); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [])
  return m
}

/* ── 폴더 선택 (시작) — PARA 를 Finder 처럼 접었다 펴는 트리. 어디든 시작할 수 있다 ── */
interface PNode { name: string; rel: string; dir: boolean; mtime: number; harness?: boolean; botId?: string; role?: 'inbox' | 'active' | 'reference' | 'archive' }
const ROLE_T: Record<string, [string, string]> = { active: ['활성', 'var(--done)'], reference: ['참조', 'var(--t2)'], archive: ['보관', 'var(--t3)'], inbox: ['정리 대기', 'var(--wait)'] }
const NEW_MARK = '/\u0000new'
export function FolderPicker({ onClose, onStarted }: { onClose: () => void; onStarted: (bot: Bot) => void }) {
  const { s, refresh } = useStore()
  const activeParents = useMemo(() => (s.rules?.roles.active ?? []).map((g) => g.replace(/\/\*$/, '')), [s.rules])
  const [dirs, setDirs] = useState<Record<string, PNode[]>>({})
  const [exp, setExp] = useState<Set<string>>(() => new Set(['', ...activeParents]))
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState(''); const [flat, setFlat] = useState<PNode[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'free'>('all')
  const phone = useIsPhone(); const [cur, setCur] = useState('') // 폰: 지금 들어와 있는 폴더(«» 는 루트)
  const [newIn, setNewIn] = useState<string | null>(null); const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const load = async (rel: string) => { try { const l = await api<PNode[]>(`/bots/orch/ls?dir=${encodeURIComponent(rel)}`); setDirs((d) => ({ ...d, [rel]: l.filter((n) => n.dir) })) } catch { /* */ } }
  useEffect(() => { for (const d of exp) if (!dirs[d]) void load(d) }, [exp])
  // 🔴 색인은 «폴더만» 받는다 — 종전의 files?depth=4 는 파일까지 세며 400개에서 끊겨
  //    볼트 뒤쪽 폴더가 검색에 아예 안 잡혔다 (2026-09-13 Dave 보고)
  useEffect(() => { if (q && !flat) void api<PNode[]>('/bots/orch/dirs?depth=6').then(setFlat).catch(() => setFlat([])) }, [q])
  const byRel = useMemo(() => { const m = new Map<string, PNode>(); for (const l of Object.values(dirs)) for (const n of l) m.set(n.rel, n); for (const n of flat ?? []) if (!m.has(n.rel)) m.set(n.rel, n); return m }, [dirs, flat])
  const botOfRel = (rel: string) => s.bots.find((b) => b.rel === rel)
  const topRole = (rel: string) => byRel.get(rel.split('/')[0])?.role
  // 보이는 행 — 검색 중이면 평평하게, 아니면 트리
  const rows = useMemo(() => {
    const out: { n: PNode; depth: number; kind: 'dir' | 'new' }[] = []
    // 찾는 중 — 평평하게. 판정은 core/search 한 곳에서(NFC 맞춤 · 가운데 일치 · 초성)
    if (q.trim()) return rank(q, flat ?? [], (n) => ({ name: n.name, path: n.rel }), 200).map((n) => ({ n, depth: 0, kind: 'dir' as const }))
    const walk = (rel: string, depth: number) => {
      const list = dirs[rel] ?? []
      if (rel && exp.has(rel)) out.push({ n: { name: '새 폴더 만들기', rel: `${rel}${NEW_MARK}`, dir: true, mtime: 0 }, depth, kind: 'new' })
      for (const n of list) {
        if (filter === 'active' && topRole(n.rel) !== 'active' && !n.rel.includes('/')) continue
        if (filter === 'free' && (n.botId || botOfRel(n.rel))) continue
        out.push({ n, depth, kind: 'dir' })
        if (exp.has(n.rel)) walk(n.rel, depth + 1)
      }
    }
    walk('', 0)
    return out
  }, [dirs, exp, q, flat, filter, s.bots])
  const toggle = (rel: string) => setExp((e) => { const n = new Set(e); if (n.has(rel)) n.delete(rel); else n.add(rel); return n })
  const selNode = sel ? byRel.get(sel) : undefined
  const selBot = sel ? botOfRel(sel) : undefined
  const start = async (rel: string) => {
    if (busy) return
    const role = topRole(rel)
    if (role === 'archive' && !confirm('보관(Archive) 폴더예요. 그래도 여기서 봇을 시작할까요?')) return
    setBusy(true); setErr('')
    try { const bot = await api<Bot>('/bots/start', { body: { rel } }); await refresh(); onStarted(bot) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const create = async () => {
    if (!newIn || !newName.trim() || busy) return
    setBusy(true); setErr('')
    try { const r = await api<{ rel: string; bot: Bot }>('/folders', { body: { section: newIn, name: newName.trim(), start: true } }); await refresh(); onStarted(r.bot) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const preview = (section: string, name: string) => { const tpl = s.rules?.naming.project; if (!tpl || section !== activeParents[0] || !name) return name; const d = new Date(); return tpl.replace('{YYYY}', String(d.getFullYear())).replace('{MM}', String(d.getMonth() + 1).padStart(2, '0')).replace('{이름}', name).replace('{name}', name) }
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement; if (t.tagName === 'INPUT' && t.classList.contains('nm')) return
    const vis = rows.filter((r) => r.kind === 'dir'); const i = vis.findIndex((r) => r.n.rel === sel)
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(vis[Math.min(vis.length - 1, i + 1)]?.n.rel ?? sel) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(vis[Math.max(0, i - 1)]?.n.rel ?? sel) }
    else if (e.key === 'ArrowRight' && sel) { e.preventDefault(); setExp((x) => new Set([...x, sel])) }
    else if (e.key === 'ArrowLeft' && sel) { e.preventDefault(); if (exp.has(sel)) toggle(sel); else if (sel.includes('/')) setSel(sel.slice(0, sel.lastIndexOf('/'))) }
    else if (e.key === 'Enter' && sel) { e.preventDefault(); if (selBot) onStarted(selBot); else void start(sel) }
    else if (e.key === 'Escape') onClose()
  }
  useEffect(() => { if (!sel) return; const el = listRef.current?.querySelector(`[data-rel="${CSS.escape(sel)}"]`); (el as HTMLElement | null)?.scrollIntoView({ block: 'nearest' }) }, [sel])
  const crumbs = sel ? sel.split('/') : []

  /**
   * 폰 — **한 단계씩 들어간다** (V17 B안). 폰은 폭이 전부라 트리의 들여쓰기·배지가 이름을 잡아먹는다.
   * · 이름이 폭을 전부 쓰고, 상태는 아랫줄 아이콘 + 짧은 말 · 오른쪽엔 꺾쇠 하나뿐
   * · 푸터는 두 줄(지금 경로 + 큰 버튼) · 취소는 헤더 ✕ 로 옮겨 푸터가 넘치지 않는다
   * · 검색은 돋보기로 어느 깊이든 한 번에 (데스크톱과 같은 색인·판정을 쓴다)
   */
  if (phone) {
    const here = cur ? byRel.get(cur) : undefined
    const hereBot = cur ? botOfRel(cur) : undefined
    const kids = q.trim() ? rank(q, flat ?? [], (n2) => ({ name: n2.name, path: n2.rel }), 200) : (dirs[cur] ?? [])
    const label = (n2: PNode) => (n2.botId || botOfRel(n2.rel) ? '봇 있음 — 열기' : n2.harness ? '하네스 있음' : '시작하면 하네스를 깔아요')
    const tone = (n2: PNode) => (n2.botId || botOfRel(n2.rel) ? 'var(--run)' : n2.harness ? 'var(--done)' : 'var(--t3)')
    const mark = (n2: PNode) => (n2.botId || botOfRel(n2.rel) ? 'folder' : n2.harness ? 'check' : 'plus')
    const up = () => { if (q) { setQ(''); return } if (!cur) { onClose(); return } setCur(cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/')) : '') }
    return <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal pk phone" onKeyDown={onKey} tabIndex={-1}>
        <div className="ph-h">
          <button className="rb" onClick={up} title="위로"><Icon n="back" size={17} /></button>
          <span className="t"><Mid s={cur ? (cur.split('/').pop() ?? cur) : 'PARA'} tail={10} /></span>
          <button className={`rb ${q ? 'on' : ''}`} onClick={() => { setQ(q ? '' : ' '); setTimeout(() => (document.querySelector('.pk.phone .ph-s input') as HTMLInputElement | null)?.focus(), 30) }} title="찾기"><Icon n="search" size={16} /></button>
          <button className="rb" onClick={onClose} title="닫기"><Icon n="x" size={16} /></button>
        </div>
        {q ? <div className="ph-s"><Icon n="search" size={14} /><input placeholder="폴더 이름 · 초성도 됩니다" value={q.trim() ? q : ''} onChange={(e) => setQ(e.target.value || ' ')} /></div>
          : <div className="ph-c">{['PARA', ...(cur ? cur.split('/') : [])].map((c, i, arr) => <span key={i} className={i === arr.length - 1 ? 'on' : ''} onClick={() => setCur(arr.slice(1, i + 1).join('/'))}>{c}</span>)}</div>}
        <div className="modal-b ph-b" ref={listRef}>
          {kids.map((n2) => <button key={n2.rel} data-rel={n2.rel} className="ph-row" onClick={() => { if (q) { setQ(''); setCur(n2.rel) } else setCur(n2.rel) }}>
            <span className="ic" style={{ color: tone(n2) }}><Icon n={mark(n2) as 'folder'} size={15} /></span>
            <span className="n"><span className="nm">{q.trim() ? <Hit s={n2.name} q={q} /> : <Mid s={n2.name} tail={10} />}</span><span className="sub">{q.trim() && n2.rel.includes('/') ? `${n2.rel.slice(0, n2.rel.lastIndexOf('/'))} · ` : ''}{label(n2)}</span></span>
            <Icon n="chev" size={11} />
          </button>)}
          {!kids.length ? <div className="empty">{q.trim() ? '찾는 폴더가 없어요' : cur ? '하위 폴더가 없어요 — 여기서 시작할 수 있어요' : '읽는 중…'}</div> : null}
          {!q && cur ? (newIn === cur ? <div className="newbox"><input className="nm" autoFocus placeholder="새 폴더 이름" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') setNewIn(null) }} /><div className="pv"><span className="mono">{cur}/{preview(cur, newName || '이름')}</span></div></div>
            : <button className="ph-row new" onClick={() => { setNewIn(cur); setNewName('') }}><span className="ic"><Icon n="fplus" size={15} /></span><span className="n"><span className="nm">여기에 새 폴더</span></span></button>) : null}
        </div>
        <div className="ph-f">
          {err ? <div className="er">{err}</div> : null}
          <div className="pa"><Mid s={cur || 'PARA (루트)'} tail={14} /></div>
          <button className="go" disabled={busy || !cur} onClick={() => (hereBot ? onStarted(hereBot) : cur ? void start(cur) : undefined)}>
            {hereBot ? '이 폴더의 봇 열기' : here && topRole(cur) === 'archive' ? '보관 폴더지만 시작' : `여기서 시작`}</button>
        </div>
      </div>
    </>
  }

  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal pk" style={{ height: 'min(720px, calc(100% - 24px))' }} onKeyDown={onKey} tabIndex={-1}>
      <div className="modal-h"><FolderBot color="#e08850" size={40} /><div className="t"><b>에이전트와 함께 일할 폴더를 선택하세요</b><small>PARA 어디든 됩니다 — 접었다 펴서 고르세요 · 활성 폴더가 먼저 · 새 폴더는 그 자리에서</small></div><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="search"><Icon n="search" size={14} /><input placeholder="폴더 이름으로 찾기 — 치면 트리가 펼쳐지며 걸러져요" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="fl">{([['all', '전체'], ['active', '활성만'], ['free', '봇 없는 폴더만']] as const).map(([k, t]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t}</button>)}<span className="hint">↑↓ 이동 · → 펼침 · ← 접음 · ⏎ 시작</span></div>
      <div className="modal-b" style={{ flex: 1 }} ref={listRef}>
        {rows.map(({ n, depth, kind }) => kind === 'new' ? (newIn === n.rel.replace(NEW_MARK, '') ? <div key={n.rel} className="newbox" style={{ marginLeft: 18 + depth * 16 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}><Icon n="fplus" size={14} />새 폴더 만들기</div><input className="nm" autoFocus placeholder="이름" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') setNewIn(null) }} /><div className="pv"><Icon n="chev" size={12} /><span className="mono">{newIn}/{preview(newIn, newName || '이름')}</span><span>· 하네스 설치 · 바로 시작</span></div></div>
            : <button key={n.rel} className="trow" style={{ ['--pad' as string]: `${18 + depth * 16 + 19}px`, color: 'var(--t2)' }} onClick={() => { setNewIn(n.rel.replace(NEW_MARK, '')); setNewName('') }}><Icon n="fplus" size={13} color="var(--t3)" /><span className="n">새 폴더 만들기</span></button>)
          : <button key={n.rel} data-rel={n.rel} className={`trow dir ${sel === n.rel ? 'on' : ''}`} style={{ ['--pad' as string]: `${18 + depth * 16}px`, minHeight: 32, opacity: topRole(n.rel) === 'archive' ? .7 : 1 }} onClick={() => setSel(n.rel)} onDoubleClick={() => (n.botId || botOfRel(n.rel) ? onStarted(botOfRel(n.rel)!) : void start(n.rel))} title={n.rel}>
            <span className="cv" onClick={(e) => { e.stopPropagation(); toggle(n.rel) }} style={{ width: 14, padding: 4, margin: -4 }}>{q ? null : <Icon n={exp.has(n.rel) ? 'chevd' : 'chev'} size={10} />}</span><Icon n="folder" size={13} color="var(--t2)" />
            <span className="n" style={{ color: sel === n.rel ? 'var(--w)' : undefined }}>{q ? <span className="hitn"><span className="nm"><Hit s={n.name} q={q} /></span>{n.rel.includes('/') ? <span className="pth"><Mid s={n.rel.slice(0, n.rel.lastIndexOf('/'))} tail={10} /></span> : null}</span> : <Mid s={n.name} tail={8} />}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
              {!n.rel.includes('/') && n.role ? <span className="rbg" style={{ color: ROLE_T[n.role][1] }}>{ROLE_T[n.role][0]}</span> : null}
              {n.botId || botOfRel(n.rel) ? <span className="rbg" style={{ color: 'var(--run)' }}>봇 있음 · 열기</span> : n.harness ? <span className="b" style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="check" size={11} color="var(--done)" />하네스</span> : n.rel.includes('/') ? <span style={{ fontSize: 11, color: 'var(--t3)' }}>하네스 없음 · 시작하면 깔아 줌</span> : null}
              <time style={{ visibility: 'visible', width: 52, textAlign: 'right' }}>{fmtTime(n.mtime)}</time>
            </span>
          </button>)}
        {!rows.length ? <div className="empty">{q ? '찾는 폴더가 없어요' : '읽는 중…'}</div> : null}
      </div>
      <div className="modal-f" style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}><span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--t2)', fontSize: 12, flex: 'none' }}><FolderBot color="#e08850" size={20} />또는 오케스트레이터에게 "X 폴더에서 시작해"</span><span className="crumb">{crumbs.length ? <span>{crumbs.slice(0, -1).map((c) => `${c} / `).join('')}<b>{crumbs[crumbs.length - 1]}</b></span> : <span style={{ color: 'var(--t3)' }}>폴더를 고르세요</span>}</span>{err ? <span className="err" style={{ color: 'var(--err)', fontSize: 12, flex: 'none' }}>{err}</span> : null}<button className="btn" onClick={onClose} style={{ flex: 'none' }}>취소</button><button className="btn primary" style={{ flex: 'none' }} disabled={busy || !sel} onClick={() => (selBot ? onStarted(selBot) : sel ? void start(sel) : undefined)}>{selBot ? '봇 열기' : selNode && topRole(sel!) === 'archive' ? '보관 폴더지만 시작' : '이 폴더에서 시작'}</button></div>
    </div>
  </>
}

/* ── 온보딩(규칙 프리셋) ────────────────────────────────────────────────── */
export function Onboarding() {
  const { s, refresh } = useStore()
  const [preset, setPreset] = useState<'para' | 'johnny-decimal' | 'custom'>('para'); const [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); try { await api('/rules/install', { body: { preset } }); await refresh() } finally { setBusy(false) } }
  return <div className="pair"><div className="box" style={{ width: 'min(760px,100%)', alignItems: 'stretch', textAlign: 'left' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><FolderBot color="#e08850" size={32} /><b style={{ fontSize: 18, color: 'var(--strong)' }}>폴더 규칙을 고르세요</b></div>
    <div style={{ color: 'var(--dim)' }}>루트 <span className="mono">{s.root}</span>. 오케스트레이터가 이 규칙으로 후보를 찾고 Inbox 를 정리해요. 루트 <span className="mono">CLAUDE.md</span> 에 절로 설치되고 언제든 직접 고칠 수 있어요.</div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button className={`preset ${preset === 'para' ? 'on' : ''}`} onClick={() => setPreset('para')}><b><Icon n="folder" size={15} color={preset === 'para' ? 'var(--accent)' : 'var(--faint)'} />PARA</b><small>Projects · Area · Resources · Archive. Inbox 는 정리 상자.</small></button>
      <button className={`preset ${preset === 'johnny-decimal' ? 'on' : ''}`} onClick={() => setPreset('johnny-decimal')}><b><Icon n="folder" size={15} color={preset === 'johnny-decimal' ? 'var(--accent)' : 'var(--faint)'} />Johnny.Decimal</b><small>10-19 영역 · 11 카테고리. 모든 2단계 폴더가 후보.</small></button>
      <button className={`preset ${preset === 'custom' ? 'on' : ''}`} onClick={() => setPreset('custom')}><b><Icon n="folder" size={15} color={preset === 'custom' ? 'var(--accent)' : 'var(--faint)'} />내 방식대로</b><small>PARA 로 시작하고, 오케스트레이터와 대화해 규칙 절을 고칩니다.</small></button>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 12, color: 'var(--faint)' }}>CLAUDE.md 가 이미 있으면 덮어쓰지 않고 절만 덧붙여요.</span><span style={{ flex: 1 }} /><button className="btn primary" disabled={busy} onClick={go}>규칙 설치하고 스캔</button></div>
  </div></div>
}

/* ── 페어링 ─────────────────────────────────────────────────────────────── */
export function Pairing({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const device = useMemo(() => /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'PC', [])
  const go = async () => {
    setBusy(true); setErr('')
    try { const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code.replace(/\D/g, ''), device }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? '실패'); setToken(j.token); onDone() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="pair"><div className="box">
    <FolderBot color="#e08850" size={72} />
    <b style={{ fontSize: 20, color: 'var(--strong)' }}>Folder Bot</b>
    <div style={{ color: 'var(--dim)' }}>호스트 맥의 메뉴바 폴더봇 › 페어링 코드, 또는 호스트 터미널에 보이는 6자리 코드를 넣으세요.</div>
    <input inputMode="numeric" placeholder="000 000" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go() }} autoFocus />
    {err ? <div className="err">{err}</div> : null}
    <button className="btn primary" disabled={busy || code.replace(/\D/g, '').length < 6} onClick={go} style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}>이 {device} 연결하기</button>
  </div></div>
}

/* ── 알림 센터 ───────────────────────────────────────────────────────────── */
export function NotifyCenter({ onClose, onJump }: { onClose: () => void; onJump: (n: NotifyEvent) => void }) {
  const { s, refresh } = useStore()
  const [only, setOnly] = useState(false)
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const list = s.notifications.filter((n) => !only || n.kind === 'awaiting')
  const botOf = (id: string) => s.bots.find((b) => b.id === id)
  const readAll = async () => { await api('/notifications/read', { body: {} }); await refresh() }
  const enablePush = async () => { setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30))) }
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal" style={{ width: 'min(480px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>알림</b><small>모든 봇 · 한 기기에서 처리하면 다른 기기에서도 사라져요</small></div><button className={`btn ${only ? 'primary' : ''}`} onClick={() => setOnly(!only)}>확인 대기 {s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length}</button><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="modal-b" style={{ maxHeight: '55vh' }}>
        {list.length ? list.map((n) => { const b = botOf(n.botId); return <button key={n.id} className={`nrow ${n.read ? '' : 'unread'}`} onClick={() => onJump(n)}><FolderBot color={b?.color ?? '#e08850'} size={28} mood={n.kind === 'awaiting' ? 'wait' : n.kind === 'done' ? 'done' : n.kind === 'error' ? 'error' : 'idle'} /><div className="t"><div className="l1"><b>{n.title}</b><time>{fmtTime(n.t)}</time></div><div className="l2">{n.body}</div></div></button> }) : <div className="empty">알림이 없어요</div>}
      </div>
      <div className="modal-f"><button className="btn" onClick={readAll}>모두 읽음</button><span className="sp" /><button className="btn" onClick={enablePush}>{pushOn === true ? '폰 푸시 켜짐' : pushOn === false ? '푸시 실패 (HTTPS·홈 화면 설치 필요)' : '이 기기에 푸시 켜기'}</button><button className="btn" onClick={() => api('/push/test', { body: {} })}>푸시 테스트</button></div>
    </div>
  </>
}

/* ── 루틴 시트 ─────────────────────────────────────────────────────────── */
export function RoutineSheet({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const { refresh } = useStore()
  const [list, setList] = useState<RoutineDef[]>(bot.routines)
  const [i, setI] = useState(0); const [busy, setBusy] = useState(false)
  const cur = list[i]
  const upd = (p: Partial<RoutineDef>) => setList(list.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const save = async () => { setBusy(true); try { await api(`/bots/${bot.id}/routines`, { method: 'PUT', body: { routines: list } }); await refresh(); onClose() } finally { setBusy(false) } }
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="sheet" style={{ ['--sheet-w' as string]: '52%' }}>
      <div className="sheet-h"><span className="tab"><Icon n="clock" size={13} color="var(--accent)" />루틴 편집 · {bot.name}</span><span className="acts"><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={busy} onClick={save}>저장 → .bot.yml</button></span></div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 200, borderRight: '1px solid var(--border)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {list.map((r, k) => <button key={k} className={`srow ${k === i ? 'on' : ''}`} onClick={() => setI(k)}><Icon n="clock" size={13} color={k === i ? 'var(--accent)' : undefined} /><span className="n">{r.name || '(이름 없음)'}</span></button>)}
          <button className="srow" onClick={() => { setList([...list, { name: '새 루틴', cron: '0 7 * * *', prompt: '', approve: 'readonly', push: true }]); setI(list.length) }}><Icon n="plus" size={12} />새 루틴</button>
          {cur ? <button className="srow" style={{ color: 'var(--error)', marginTop: 'auto' }} onClick={() => { setList(list.filter((_, k) => k !== i)); setI(0) }}><Icon n="x" size={12} />이 루틴 삭제</button> : null}
        </div>
        <div className="sheet-b" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cur ? <>
            <div className="field"><label>이름</label><input value={cur.name} onChange={(e) => upd({ name: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div className="field"><label>주기 (cron)</label><input className="mono" value={cur.cron} onChange={(e) => upd({ cron: e.target.value })} /><small style={{ color: 'var(--faint)' }}>예: 0 7 * * * = 매일 07:00 · 0 20 * * 0 = 일요일 20:00</small></div><div className="field"><label>끝나면 폰으로 한 줄 푸시</label><select value={cur.push === false ? 'off' : 'on'} onChange={(e) => upd({ push: e.target.value === 'on' })}><option value="on">켬</option><option value="off">끔</option></select></div></div>
            <div className="field"><label>프롬프트</label><textarea rows={5} value={cur.prompt} onChange={(e) => upd({ prompt: e.target.value })} /></div>
            <div className="field"><label>승인 정책 · 사람이 없을 때</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{([['readonly', '읽기 전용 · 제안만', '파일을 쓰지 않아요. 기본값'], ['folder', '이 폴더 안 쓰기 허용', 'todo.md·노트 갱신까지'], ['always', '항상 허용', '루틴이 다 해요 (위험)']] as const).map(([v, t, sub]) => <button key={v} className={`preset ${(cur.approve ?? 'readonly') === v ? 'on' : ''}`} style={{ padding: '10px 12px', minWidth: 140 }} onClick={() => upd({ approve: v })}><b style={{ fontSize: 12 }}>{t}</b><small>{sub}</small></button>)}</div></div>
          </> : <div className="empty">루틴이 없어요. 왼쪽에서 추가하세요.</div>}
        </div>
      </div>
      <div className="sheet-f"><span>정본은 <span className="mono">{bot.rel || '.claude/routines.yml'}/.bot.yml</span></span><span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>루틴 세션은 봇당 동시 상한(4)에 포함돼요</span></div>
    </div>
  </>
}

/* ── 설정 ──────────────────────────────────────────────────────────────── */
export function Settings({ onClose }: { onClose: () => void }) {
  const { s, refresh } = useStore()
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null)
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal" style={{ width: 'min(560px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>설정</b><small>Folder Bot v{s.version}</small></div><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="modal-b" style={{ padding: '0 18px 12px', gap: 14 }}>
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>호스트</div><div className="kv"><span className="n">루트</span><span className="mono" style={{ fontSize: 11.5 }}>{s.root}</span></div><div className="kv"><span className="n">주소</span><span className="mono" style={{ fontSize: 11.5 }}>{s.addrs.map((a) => `http://${a}:${s.port}`).join(' · ')}</span></div>{s.tailnet ? <div className="kv"><span className="n">Tailscale</span><span>{s.tailnet.state}{s.tailnet.dnsName ? ` · ${s.tailnet.dnsName}` : ''}</span></div> : null}<div className="kv"><span className="n">Claude 로그인</span><span style={{ color: s.auth.verdict === 'loggedin' ? 'var(--done)' : 'var(--awaiting)' }}>{s.auth.verdict}{s.auth.email ? ` · ${s.auth.email}` : ''}</span><button className="btn ghost" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button></div></div>
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>이름 — 메인 · 이 기기</div><NamesBox /></div>
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>모델 · 생각 레벨 (새 세션부터)</div><DefaultsBox /></div>
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>Claude 인증</div>
          <div className="kv" style={{ color: 'var(--faint)', lineHeight: 1.5, alignItems: 'flex-start' }}><span>미니가 키체인 로그인을 못 읽는 상황(헤드리스·SSH)이면 <b style={{ color: 'var(--dim)' }}>장기 토큰</b>을 씁니다. 아무 맥에서 터미널에 <span className="mono">claude setup-token</span> 을 치고 브라우저 승인 뒤 나온 토큰을 붙여 넣으세요 (1년 유효). ⚠ 토큰 모드에선 claude.ai 커넥터(Gmail·Notion 등)는 안 붙어요.</span></div>
          <TokenBox mode={s.auth.mode} /></div>
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>기기</div>{s.devices.map((d) => <div className="kv" key={d.id}><Icon n="phone" size={13} /><span className="n">{d.name}</span><time style={{ fontSize: 11 }}>{fmtTime(d.lastSeen)}</time><button className="btn ghost" onClick={() => api('/devices/revoke', { body: { id: d.id } }).then(refresh)}>끊기</button></div>)}
          {isLocal ? <div className="kv"><span className="n">새 기기 연결</span>{pair ? <span className="mono" style={{ fontSize: 22, letterSpacing: '.18em', color: 'var(--strong)' }}>{pair.code}</span> : null}<button className="btn" onClick={async () => setPair(await api('/pairing', { body: {} }))}>페어링 코드</button></div> : <div className="kv" style={{ color: 'var(--faint)' }}>새 기기 연결은 미니의 화면(127.0.0.1)이나 터미널(p + Enter)에서</div>}</div>
        {(window as unknown as { folderbotDesktop?: { perms?: unknown } }).folderbotDesktop?.perms ? <div><div className="secl" style={{ padding: '8px 0 4px' }}>macOS 권한</div><div className="kv"><span className="n">전체 디스크 접근 · 알림</span><button className="btn" onClick={() => { onClose(); window.dispatchEvent(new Event('fb:perm-gate')) }}>권한 다시 확인</button></div></div> : null}
        <UsageBox />
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>화면</div><div className="kv"><span className="n">테마</span><ThemePick /></div><div className="kv"><span className="n">폴더봇 크기</span><IconPick /></div><div className="kv" style={{ color: 'var(--faint)' }}>목록의 폴더봇 크기예요. 마우스를 올리면 한 번 더 커져서 표정이 보여요.</div></div>
        <SwipeBox />
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>알림</div><div className="kv"><span className="n">이 기기 푸시</span><button className="btn" onClick={async () => setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30)))}>{pushOn === true ? '켜짐' : pushOn === false ? '실패 · HTTPS + 홈 화면 설치 필요' : '켜기'}</button></div><div className="kv" style={{ color: 'var(--faint)' }}>조용한 시간 23:00–07:00 (확인해 주세요만 통과). 폰 푸시는 Tailscale serve 로 HTTPS 를 붙이고 홈 화면에 설치해야 동작해요.</div></div>
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>연결</div><button className="btn" onClick={() => { setToken(''); location.reload() }}>이 기기 로그아웃</button></div>
      </div>
    </div>
  </>
}

/**
 * 이름 묻기 — `window.prompt()` 대체. Electron 은 prompt() 를 지원하지 않아(«prompt() is and will not be supported»)
 * 데스크톱 앱에서 이름 바꾸기·새 폴더가 아무 반응 없이 끝났다 (2026-09-13 Dave: «원격에서 파일, 폴더 이름 바꾸기가 안돼»).
 * 앱 안 모달 하나로 모든 표면(맥 앱·브라우저·폰)이 같은 경험을 한다. 확장자 앞까지 미리 선택해 이름만 고치게.
 */
let askResolve: ((v: string | null) => void) | null = null
let askSet: ((q: { title: string; initial: string } | null) => void) | null = null
export function askName(title: string, initial = ''): Promise<string | null> {
  return new Promise((res) => { askResolve?.(null); askResolve = res; if (askSet) askSet({ title, initial }); else { askResolve = null; res(window.prompt(title, initial)) } })
}
export function AskHost() {
  const [q, setQ] = useState<{ title: string; initial: string } | null>(null); const [v, setV] = useState('')
  useEffect(() => { askSet = (n) => { setQ(n); setV(n?.initial ?? '') }; return () => { askSet = null } }, [])
  if (!q) return null
  const done = (val: string | null) => { setQ(null); const r = askResolve; askResolve = null; r?.(val) }
  return <>
    <div className="backdrop" onClick={() => done(null)} />
    <div className="modal ask" style={{ width: 'min(420px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{q.title}</b></div></div>
      <div className="modal-b" style={{ padding: '4px 18px 12px' }}><input className="askin" autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') done(v.trim() || null); if (e.key === 'Escape') done(null) }} onFocus={(e) => { const i = e.currentTarget; const dot = i.value.lastIndexOf('.'); i.setSelectionRange(0, dot > 0 ? dot : i.value.length) }} /></div>
      <div className="modal-f"><span className="sp" /><button className="btn" onClick={() => done(null)}>취소 (⎋)</button><button className="btn on" onClick={() => done(v.trim() || null)}>확인 (⏎)</button></div>
    </div>
  </>
}

/** 폰 «쓸어서 처리» — 네 자리에 각각 동작을 고른다 (V16) */
function SwipeBox() {
  const [cfg, save] = useSwipeCfg()
  const slots: [SwipeSlot, string, string][] = [['rightShort', '오른쪽으로 짧게', '→ 25~45%'], ['rightLong', '오른쪽으로 길게', '→ 45% 이상'], ['leftShort', '왼쪽으로 짧게', '← 25~45%'], ['leftLong', '왼쪽으로 길게', '← 45% 이상']]
  const acts: SwipeAct[] = ['edit', 'done', 'menu', 'delete', 'delegate', 'expand', 'none']
  return <div><div className="secl" style={{ padding: '8px 0 4px' }}>할 일 — 폰에서 쓸어서 처리</div>
    {slots.map(([k, l, sub]) => <div className="kv swk" key={k}>
      <span className="n">{l} <small>{sub}</small></span>
      <span className="seg wrap">{acts.map((a) => <button key={a} className={cfg[k] === a ? 'on' : ''} onClick={() => save({ ...cfg, [k]: a })} title={ACT_LABEL[a]}><Icon n={ACT_ICON[a] as 'edit'} size={11} />{ACT_LABEL[a]}</button>)}</span>
    </div>)}
    <div className="kv"><span className="n">진동</span><span className="seg">{[[true, '켬'], [false, '끔']].map(([v, l]) => <button key={String(v)} className={cfg.haptics === v ? 'on' : ''} onClick={() => save({ ...cfg, haptics: v as boolean })}>{l as string}</button>)}</span></div>
    <div className="kv"><span className="n" style={{ color: 'var(--t3)' }}>데스크톱은 마우스를 올리면 나오는 도구를 씁니다</span><button className="btn" onClick={() => save(SWIPE_DEFAULT)}>기본값</button></div>
  </div>
}

/** 테마 고르기 — 시스템 · 라이트 · 다크 */
function ThemePick() {
  const [theme, setTheme] = useTheme()
  const opt: [Theme, string][] = [['auto', '시스템'], ['light', '라이트'], ['dark', '다크']]
  return <span className="seg">{opt.map(([v, l]) => <button key={v} className={theme === v ? 'on' : ''} onClick={() => setTheme(v)}>{l}</button>)}</span>
}

/**
 * 설정 › 사용량 — 훅 설치·제거와 예산.
 * 🔴 «요금제의 몇 %가 남았나» 는 CLI 가 안 내준다(실측). 남은 양은 **내 예산 − 쓴 양** 이고, 여기서 그 예산을 정한다.
 */
function UsageBox() {
  const [st, setSt] = useState<{ hook?: boolean; budget?: { window: number; day: number; week: number }; tools?: { tool: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => void api<typeof st>('/usage').then(setSt).catch(() => {})
  useEffect(load, [])
  const setB = async (k: 'window' | 'day' | 'week', v: string) => {
    const n = Number(v); if (!Number.isFinite(n) || n < 0) return
    await api('/usage/budget', { body: { [k]: n } }); load()
  }
  return <div><div className="secl" style={{ padding: '8px 0 4px' }}>사용량</div>
    <div className="kv"><span className="n">턴마다 기록하기 (Claude Code 훅)</span>
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await api('/usage/hook', { body: { on: !st?.hook } }); load() } finally { setBusy(false) } }}>{st?.hook ? '설치됨 · 제거' : '훅 설치'}</button></div>
    <div className="kv" style={{ color: 'var(--faint)', lineHeight: 1.5, alignItems: 'flex-start' }}><span>턴이 끝날 때 <b style={{ color: 'var(--dim)' }}>읽기만</b> 해서 이번 턴의 토큰을 남깁니다 — 터미널에서 연 세션까지 전부 잡혀요. 실패해도 조용히 끝나 턴을 막지 않습니다. 훅이 없어도 기록을 직접 훑어 숫자는 나오지만, 훅이 있으면 더 빠르고 정확해요.</span></div>
    <div className="kv"><span className="n">예산 — 5시간 창</span><input className="bud" defaultValue={st?.budget?.window ?? ''} onBlur={(e) => void setB('window', e.target.value)} /><span style={{ color: 'var(--faint)' }}>달러</span></div>
    <div className="kv"><span className="n">예산 — 하루</span><input className="bud" defaultValue={st?.budget?.day ?? ''} onBlur={(e) => void setB('day', e.target.value)} /><span style={{ color: 'var(--faint)' }}>달러</span></div>
    <div className="kv"><span className="n">예산 — 한 주</span><input className="bud" defaultValue={st?.budget?.week ?? ''} onBlur={(e) => void setB('week', e.target.value)} /><span style={{ color: 'var(--faint)' }}>달러</span></div>
    <div className="kv" style={{ color: 'var(--faint)' }}>요금제 한도(%)는 CLI 밖으로 안 나와요. 막대는 이 예산 기준이고, 비용은 토큰 × 단가 추정입니다.</div>
  </div>
}

/** 폴더봇 크기 — 고른 즉시 레일에 반영된다(다른 창·탭도 fb:iconsize 로 함께 바뀐다) */
function IconPick() {
  const [sz, setSz] = useIconSize()
  const opt: IconSize[] = ['s', 'm', 'l']
  return <span className="seg">{opt.map((v) => <button key={v} className={sz === v ? 'on' : ''} onClick={() => setSz(v)} title={`${ICON_PX[v]}px`}>{ICON_LABEL[v]}</button>)}</span>
}

export function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState(''); const t = useRef<number | undefined>(undefined)
  return [msg, (m: string) => { setMsg(m); window.clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(''), 2600) }]
}

/** 메인(호스트) 이름과 이 기기 이름 — 기본값은 컴퓨터 이름·페어링 때 고른 기기 종류 */
function NamesBox() {
  const { s, refresh } = useStore()
  const [host, setHost] = useState(s.hostName); const [dev, setDev] = useState(s.device.name); const [msg, setMsg] = useState('')
  useEffect(() => { setHost(s.hostName); setDev(s.device.name) }, [s.hostName, s.device.name])
  const save = async (body: { hostName?: string; deviceName?: string }) => { try { await api('/names', { body }); await refresh(); setMsg('저장했어요') } catch (e) { setMsg((e as Error).message) } }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 8px' }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <div className="field" style={{ flex: 1, minWidth: 180 }}><label>메인(호스트) 이름</label><input value={host} onChange={(e) => setHost(e.target.value)} onBlur={() => { if (host.trim() !== s.hostName) void save({ hostName: host }) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /><small style={{ color: 'var(--t3)', fontSize: 11.5 }}>기본값: 호스트 맥의 컴퓨터 이름. 모든 기기에 같이 보여요.</small></div>
      {!s.device.main ? <div className="field" style={{ flex: 1, minWidth: 180 }}><label>이 기기 이름</label><input value={dev} onChange={(e) => setDev(e.target.value)} onBlur={() => { if (dev.trim() && dev.trim() !== s.device.name) void save({ deviceName: dev }) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /><small style={{ color: 'var(--t3)', fontSize: 11.5 }}>기본값: 페어링할 때 고른 기기 종류. 기기마다 따로.</small></div> : null}
    </div>
    <div style={{ fontSize: 12, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot done" /><span>지금 이 화면은 {s.device.main ? <><b>메인</b> ({s.hostName}) 에서 보고 있어요</> : <><b>원격 · {s.device.name}</b> 에서 <b>{s.hostName}</b> 를 보고 있어요</>}{msg ? ` · ${msg}` : ''}</span></div>
  </div>
}
function DefaultsBox() {
  const { s, refresh } = useStore()
  const [model, setModel] = useState(s.defaults.model || 'claude-fable-5-1'); const [effort, setEffort] = useState(s.defaults.effort || 'high'); const [msg, setMsg] = useState('')
  const save = async (m: string, e: string) => { try { await api('/defaults', { body: { model: m, effort: e } }); await refresh(); setMsg('저장했어요 — 다음 세션부터 적용돼요. 지금 열린 세션은 만들 때의 값을 그대로 씁니다.') } catch (er) { setMsg((er as Error).message) } }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 8px' }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <div className="field" style={{ flex: 1, minWidth: 180 }}><label>모델</label><select value={model} onChange={(e) => { setModel(e.target.value); void save(e.target.value, effort) }}>{MODELS.map((m) => <option key={m.v} value={m.v}>{m.t}{m.d ? ` — ${m.d}` : ''}</option>)}</select></div>
      <div className="field" style={{ flex: 1, minWidth: 140 }}><label>생각 레벨</label><select value={effort} onChange={(e) => { setEffort(e.target.value); void save(model, e.target.value) }}>{EFFORTS.map((e) => <option key={e.v} value={e.v}>{e.t}{e.v === 'high' ? ' — 기본' : ''}</option>)}</select></div>
    </div>
    <div style={{ fontSize: 12, color: 'var(--t3)' }}>{msg || '모든 봇의 새 세션이 이 값으로 뜹니다. 세션마다 바꾸려면 입력창 아래 줄(모델 · 노력 · 모드)에서.'}</div>
  </div>
}
function TokenBox({ mode }: { mode?: 'login' | 'token' }) {
  const { refresh } = useStore()
  const [t, setT] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const save = async (token: string) => { setBusy(true); try { await api('/auth/token', { body: { token } }); await refresh(); setMsg(token ? '토큰을 저장했어요. 새 세션부터 적용돼요.' : '토큰을 지웠어요.'); setT('') } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 8px' }}>
    <div style={{ display: 'flex', gap: 8 }}><input className="mono" style={{ flex: 1, background: 'var(--code)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 10px', outline: 0 }} placeholder="sk-ant-oat01-…" value={t} onChange={(e) => setT(e.target.value)} /><button className="btn primary" disabled={busy || !t.trim()} onClick={() => save(t)}>저장</button>{mode === 'token' ? <button className="btn" disabled={busy} onClick={() => save('')}>지우기</button> : null}</div>
    <div style={{ fontSize: 12, color: mode === 'token' ? 'var(--done)' : 'var(--faint)' }}>{mode === 'token' ? '지금: 장기 토큰 모드' : '지금: 키체인 로그인 모드'}{msg ? ` · ${msg}` : ''}</div>
  </div>
}
