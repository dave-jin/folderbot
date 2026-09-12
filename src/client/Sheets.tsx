import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import type { Bot, Candidate, NotifyEvent, RoutineDef } from '../core/types'
import { api, setToken, subscribePush } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { fmtTime, useStore } from './store'
import { EFFORTS, MODELS } from './consts'

marked.setOptions({ gfm: true, breaks: true })
export function Md({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => marked.parse(text) as string, [text])
  return <div className={`md ${streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
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
  const [newIn, setNewIn] = useState<string | null>(null); const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const load = async (rel: string) => { try { const l = await api<PNode[]>(`/bots/orch/ls?dir=${encodeURIComponent(rel)}`); setDirs((d) => ({ ...d, [rel]: l.filter((n) => n.dir) })) } catch { /* */ } }
  useEffect(() => { for (const d of exp) if (!dirs[d]) void load(d) }, [exp])
  useEffect(() => { if (q && !flat) void api<PNode[]>('/bots/orch/files?depth=4').then((t) => { const out: PNode[] = []; const walk = (n: (PNode & { children?: unknown[] })[]) => { for (const x of n) { if (x.dir) { out.push(x); if (x.children) walk(x.children as never) } } }; walk(t as never); setFlat(out) }).catch(() => setFlat([])) }, [q])
  const byRel = useMemo(() => { const m = new Map<string, PNode>(); for (const l of Object.values(dirs)) for (const n of l) m.set(n.rel, n); for (const n of flat ?? []) if (!m.has(n.rel)) m.set(n.rel, n); return m }, [dirs, flat])
  const botOfRel = (rel: string) => s.bots.find((b) => b.rel === rel)
  const topRole = (rel: string) => byRel.get(rel.split('/')[0])?.role
  // 보이는 행 — 검색 중이면 평평하게, 아니면 트리
  const rows = useMemo(() => {
    const out: { n: PNode; depth: number; kind: 'dir' | 'new' }[] = []
    if (q.trim()) { const qq = q.trim().toLowerCase(); for (const n of flat ?? []) if (n.name.toLowerCase().includes(qq) || n.rel.toLowerCase().includes(qq)) out.push({ n, depth: 0, kind: 'dir' }); return out.slice(0, 200) }
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
            <span className="n" style={{ color: sel === n.rel ? 'var(--w)' : undefined }}><Mid s={q ? n.rel : n.name} tail={q ? 12 : 8} /></span>
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
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>알림</div><div className="kv"><span className="n">이 기기 푸시</span><button className="btn" onClick={async () => setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30)))}>{pushOn === true ? '켜짐' : pushOn === false ? '실패 · HTTPS + 홈 화면 설치 필요' : '켜기'}</button></div><div className="kv" style={{ color: 'var(--faint)' }}>조용한 시간 23:00–07:00 (확인해 주세요만 통과). 폰 푸시는 Tailscale serve 로 HTTPS 를 붙이고 홈 화면에 설치해야 동작해요.</div></div>
        <div><div className="secl" style={{ padding: '8px 0 4px' }}>연결</div><button className="btn" onClick={() => { setToken(''); location.reload() }}>이 기기 로그아웃</button></div>
      </div>
    </div>
  </>
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
