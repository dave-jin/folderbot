import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bot, ChatItem, NotifyEvent, PermissionRequest, SessionInfo } from '../core/types'
import { api, setToken, token, uploadFile } from './api'
import { FolderBot, Icon, moodOf } from './FolderBot'
import { FolderPicker, Md, NotifyCenter, Onboarding, Pairing, Settings, useToast } from './Sheets'
import { DocPane, useDocs } from './Doc'
import { Elapsed, Panel, type SecH } from './Panel'
import { fmtTime, useStore } from './store'

type Tool = Extract<ChatItem, { kind: 'tool' }>
type Sub = Extract<ChatItem, { kind: 'subagent' }>
const stateDot = (st?: string) => (st === 'running' ? 'run' : st === 'awaiting_input' ? 'wait' : st === 'error' ? 'err' : 'none')

function useHash(): [Record<string, string>, (p: Record<string, string>) => void] {
  const parse = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)))
  const [h, setH] = useState<Record<string, string>>(parse)
  useEffect(() => { const f = () => setH(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return [h, (p) => { location.hash = new URLSearchParams(p).toString() }]
}
function useMedia(q: string): boolean { const [m, setM] = useState(() => window.matchMedia(q).matches); useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [q]); return m }

export function App() {
  const { s } = useStore()
  const [authed, setAuthed] = useState(() => { const h = new URLSearchParams(location.hash.slice(1)); const t = h.get('token'); if (t) { setToken(t); h.delete('token'); location.hash = h.toString(); location.reload() } return !!token() })
  useEffect(() => { const f = () => setAuthed(false); window.addEventListener('fb:authlost', f); return () => window.removeEventListener('fb:authlost', f) }, [])
  if (!authed) return <div className="app"><Pairing onDone={() => location.reload()} /></div>
  if (!s.loaded) return <div className="app"><div className="empty"><FolderBot color="#e08850" size={40} mood="work" />Mac mini 에 연결하는 중…</div></div>
  if (!s.rulesInstalled) return <div className="app"><Onboarding /></div>
  return <Main />
}

interface Layout { sb: number; rp: number; doc: number; sbOpen: boolean; rpOpen: boolean; secH: SecH }
const DEF: Layout = { sb: 250, rp: 290, doc: 520, sbOpen: true, rpOpen: true, secH: { sessions: 120, todo: 128 } }

function Main() {
  const { s, refresh, loadChat, loadTodo } = useStore()
  const [hash, setHash] = useHash()
  const botId = hash.bot || 'orch'
  const bot = s.bots.find((b) => b.id === botId) ?? s.bots[0]
  const sessions = s.sessionsByBot[bot?.id ?? ''] ?? []
  const sessionId = hash.s && sessions.some((x) => x.id === hash.s) ? hash.s : sessions[0]?.id
  const narrow = useMedia('(max-width: 1100px)'); const phone = useMedia('(max-width: 760px)')
  const [view, setView] = useState<'list' | 'chat' | 'doc' | 'panel'>(hash.bot ? 'chat' : 'list')
  const [lay, setLay] = useState<Layout>(() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem('fb:layout') ?? '') } } catch { return DEF } })
  useEffect(() => { localStorage.setItem('fb:layout', JSON.stringify(lay)) }, [lay])
  const [docOpen, setDocOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('fb:docopen') ?? '{}') } catch { return {} } })
  useEffect(() => { localStorage.setItem('fb:docopen', JSON.stringify(docOpen)) }, [docOpen])
  const [wide, setWide] = useState(false)
  const [modal, setModal] = useState<'picker' | 'notify' | 'settings' | null>(null)
  const [drag, setDrag] = useState<'' | 'x' | 'y'>('')
  const [toast, say] = useToast()
  const [prefill, setPrefill] = useState('')
  const [attachReq, setAttachReq] = useState<string[]>([])
  const docs = useDocs(bot?.id ?? '')
  useEffect(() => { if (sessionId && !s.chats[sessionId]) void loadChat(sessionId) }, [sessionId])
  useEffect(() => { if (bot) void loadTodo(bot.id) }, [bot?.id, s.filesTick[bot?.id ?? '']])
  const go = (b: string, sid?: string) => { setHash(sid ? { bot: b, s: sid } : { bot: b }); setView('chat') }
  const unread = s.notifications.filter((n) => !n.read).length
  const waiting = s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length
  const showDoc = !!bot && !!docOpen[bot.id] && docs.tabs.length > 0
  const openDoc = (rel: string, pin = false) => { if (!bot) return; docs.open(rel, pin); setDocOpen((d) => ({ ...d, [bot.id]: true })); if (phone) setView('doc') }
  // 단축키 — ⌘B 목록 · ⌘⇧B 패널 · ⌘⇧D 문서 열
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'b' && !e.shiftKey) { e.preventDefault(); setLay((l) => ({ ...l, sbOpen: !l.sbOpen })) }
      if (e.key.toLowerCase() === 'b' && e.shiftKey) { e.preventDefault(); setLay((l) => ({ ...l, rpOpen: !l.rpOpen })) }
      if (e.key.toLowerCase() === 'd' && e.shiftKey && bot) { e.preventDefault(); setDocOpen((d) => ({ ...d, [bot.id]: !d[bot.id] })) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [bot?.id])
  // 열 드래그 — 선이 핸들. 더블클릭은 기본값
  const dragX = (k: 'sb' | 'rp' | 'doc', dir: 1 | -1) => (e: React.PointerEvent) => {
    e.preventDefault(); setDrag('x'); const x0 = e.clientX; const w0 = lay[k]
    const mv = (ev: PointerEvent) => { const w = w0 + (ev.clientX - x0) * dir; if (k === 'sb' && w < 150) { setLay((l) => ({ ...l, sbOpen: false })); return } if (k === 'rp' && w < 150) { setLay((l) => ({ ...l, rpOpen: false })); return } setLay((l) => ({ ...l, [k]: Math.max(k === 'doc' ? 380 : 200, Math.min(k === 'doc' ? 1100 : 480, w)), ...(k === 'sb' ? { sbOpen: true } : k === 'rp' ? { rpOpen: true } : {}) })) }
    const up = () => { setDrag(''); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const rows = useMemo(() => {
    const items = s.bots.map((b) => ({ b, sum: botSummary(b, s.sessionsByBot[b.id] ?? [], s.notifications) }))
    const rank = (st: string | null) => (st === 'awaiting_input' ? 0 : st === 'running' ? 1 : 2)
    items.sort((a, c) => (a.b.orchestrator !== c.b.orchestrator ? (a.b.orchestrator ? -1 : 1) : rank(a.sum.state) - rank(c.sum.state) || c.sum.t - a.sum.t))
    const m = new Map<string, typeof items>()
    for (const it of items) { const k = it.b.section; (m.get(k) ?? m.set(k, []).get(k)!).push(it) }
    return [...m.entries()]
  }, [s.bots, s.sessionsByBot, s.notifications])
  if (!bot) return <div className="app"><div className="empty">봇이 없어요</div></div>
  const items = sessionId ? (s.chats[sessionId] ?? []) : []
  const pending = sessionId ? (s.pending[sessionId] ?? []) : []
  const cur = sessions.find((x) => x.id === sessionId)
  const touched = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.kind === 'files') return it.paths } return [] as string[] }, [items])
  const sbOpen = lay.sbOpen && !narrow; const rpOpen = lay.rpOpen && !narrow
  const stripBots = rows.flatMap(([, it]) => it)
  return <div className={`app ${drag === 'x' ? 'dragx' : drag === 'y' ? 'dragy' : ''}`} data-view={view === 'doc' && !showDoc ? 'chat' : view}>
    {s.online === 'off' ? <div className="offline">Mac mini 와 다시 연결하는 중…</div> : null}
    {s.auth.verdict === 'unreadable' || s.auth.verdict === 'loggedout' ? <div className="banner"><span className="dot wait" /><span><b>Mac mini 에서 Claude 로그인이 필요해요.</b> 미니에서 <span className="mono">claude</span> → <span className="mono">/login</span>, 또는 설정 › Claude 토큰. 보낸 지시는 대기열에 두었다가 복구되면 이어서 해요.</span><span style={{ marginLeft: 'auto' }} /><button className="btn" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button></div> : null}
    <div className="cols">
      {/* ── 왼쪽 ── */}
      {sbOpen || phone ? <div className="col side left" style={{ width: lay.sb }}>
        <div className="hdr"><FolderBot color="#e08850" size={16} mood={waiting ? 'wait' : 'idle'} mono /><span className="ttl">Folder Bot</span><span className="sp" /><div className="acts"><button className="ib" onClick={() => setLay({ ...lay, sbOpen: false })} title="목록 접기 (⌘B)"><Icon n="panel" size={14} /></button></div></div>
        <div style={{ padding: '10px 8px 0' }}>
          <button className="nav" onClick={() => setModal('picker')}><Icon n="fplus" size={14} /><span>폴더 선택 · 시작</span><span className="bd">후보 {s.candidates.filter((c) => !c.active).length}</span></button>
          <button className="nav" onClick={() => setModal('notify')}><Icon n="bell" size={14} /><span>알림</span>{unread ? <span className="bd" style={{ color: waiting ? 'var(--wait)' : undefined }}>{unread}</span> : null}</button>
          <button className="nav" onClick={() => setModal('settings')}><Icon n="gear" size={14} /><span>설정</span></button>
        </div>
        <div className="sb-list">
          {rows.map(([sec, list]) => <div key={sec}>
            <div className="secl">{sec === '관제' ? '관제' : sec}</div>
            {list.map(({ b, sum }) => <button key={b.id} className={`brow ${b.id === bot.id && view !== 'list' ? 'on' : ''}`} onClick={() => go(b.id)} title={sum.text}><FolderBot color={b.color} size={16} mood={sum.mood} mono /><span className="n">{b.name}</span><span className={`dot ${stateDot(sum.state ?? undefined)}`} /><time>{fmtTime(sum.t)}</time></button>)}
          </div>)}
        </div>
        <div className="sb-foot"><span className={`dot ${s.online === 'on' ? 'done' : 'err'}`} /><span>Mac mini</span>{s.inbox ? <span className="bd">Inbox {s.inbox}</span> : null}<span className="bd mono">v{s.version}</span></div>
      </div> : <div className="strip"><button className="ib" onClick={() => setLay({ ...lay, sbOpen: true })} title="목록 펼치기 (⌘B)"><Icon n="panel" size={14} /></button><div className="gap" /><button className="ib" onClick={() => setModal('picker')} title="폴더 선택 · 시작"><Icon n="fplus" size={14} /></button><button className="ib" onClick={() => setModal('notify')} title="알림"><Icon n="bell" size={14} />{unread ? <span className="bd">{unread}</span> : null}</button><div className="gap" />{stripBots.map(({ b, sum }) => <button key={b.id} className={`bot ${b.id === bot.id ? 'on' : ''}`} onClick={() => go(b.id)} title={b.name}><FolderBot color={b.color} size={17} mood={sum.mood} mono />{stateDot(sum.state ?? undefined) !== 'none' ? <span className={`dot ${stateDot(sum.state ?? undefined)}`} /> : null}</button>)}</div>}
      <div className={`divx ${drag === 'x' ? '' : ''}`} onPointerDown={sbOpen ? dragX('sb', 1) : undefined} onDoubleClick={() => setLay({ ...lay, sb: DEF.sb, sbOpen: true })} />

      {/* ── 채팅 ── */}
      <Chat bot={bot} sessions={sessions} cur={cur} items={items} pending={pending} prefill={prefill} onPrefilled={() => setPrefill('')} attachReq={attachReq} onAttached={() => setAttachReq([])} onSession={(sid) => go(bot.id, sid)} onFile={(rel, pin) => openDoc(rel, pin)} docBadge={docs.tabs.length} docOn={showDoc} onDocToggle={() => setDocOpen((d) => ({ ...d, [bot.id]: !d[bot.id] }))} onPanelToggle={() => (phone ? setView('panel') : setLay({ ...lay, rpOpen: !lay.rpOpen }))} say={say} refreshAll={refresh} collapsed={wide && showDoc} onUncollapse={() => setWide(false)} />

      {/* ── 문서 열 ── */}
      {showDoc ? <><div className="divx" onPointerDown={dragX('doc', -1)} onDoubleClick={() => setLay({ ...lay, doc: DEF.doc })} /><div className="docwrap" style={{ width: wide ? undefined : lay.doc, flex: wide ? 3 : 'none', display: 'flex', minWidth: 0 }}><DocPane bot={bot} docs={docs} filesTick={s.filesTick[bot.id]} onTalk={(rel) => { setPrefill(`${rel} 파일 봐 줘: `); if (phone) setView('chat') }} onHide={() => setDocOpen((d) => ({ ...d, [bot.id]: false }))} wide={wide} onWide={() => setWide(!wide)} onAttach={(rel) => setAttachReq((a) => [...a, rel])} say={say} /></div></> : null}

      {/* ── 오른쪽 ── */}
      <div className="divx" onPointerDown={rpOpen ? dragX('rp', -1) : undefined} onDoubleClick={() => setLay({ ...lay, rp: DEF.rp, rpOpen: true })} />
      {rpOpen || phone ? <div className="rpwrap" style={{ width: phone ? '100%' : lay.rp, flex: 'none', display: 'flex', minWidth: 0 }}><Panel bot={bot} sessions={sessions} sessionId={sessionId} go={go} onOpenFile={openDoc} onTalk={(t) => { setPrefill(t); if (phone) setView('chat') }} onAttach={(rel) => { setAttachReq((a) => [...a, rel]); if (phone) setView('chat') }} touched={touched} filesTick={s.filesTick[bot.id]} secH={lay.secH} onSecH={(h) => setLay({ ...lay, secH: h })} onCollapse={() => setLay({ ...lay, rpOpen: false })} say={say} refresh={refresh} activeDoc={showDoc ? docs.active : null} onDragY={(on) => setDrag(on ? 'y' : '')} /></div>
        : <div className="strip"><button className="ib" onClick={() => setLay({ ...lay, rpOpen: true })} title="패널 펼치기 (⌘⇧B)"><Icon n="panelr" size={14} /></button><div className="gap" /><button className="ib" onClick={() => setLay({ ...lay, rpOpen: true })} title="세션"><Icon n="clock" size={14} /></button><button className="ib" onClick={() => setLay({ ...lay, rpOpen: true })} title="할 일"><Icon n="list" size={14} />{(s.todos[bot.id] ?? []).filter((t) => !t.done).length ? <span className="bd">{(s.todos[bot.id] ?? []).filter((t) => !t.done).length}</span> : null}</button><button className="ib on" onClick={() => setLay({ ...lay, rpOpen: true })} title="파일"><Icon n="folder" size={14} /></button></div>}
    </div>
    {phone ? <div className="mtabs">{([['list', 'panel', '목록'], ['chat', 'sub', '대화'], ['doc', 'doc', '문서'], ['panel', 'folder', '폴더']] as const).map(([v, ic, t]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}><Icon n={ic as 'doc'} size={16} />{t}{v === 'chat' && cur?.state === 'awaiting_input' ? <span className="dot wait" /> : null}</button>)}</div> : null}
    {modal === 'picker' ? <FolderPicker onClose={() => setModal(null)} onStarted={(b) => { setModal(null); go(b.id); say(`${b.name} 에서 시작했어요`) }} /> : null}
    {modal === 'notify' ? <NotifyCenter onClose={() => setModal(null)} onJump={(n) => { setModal(null); api('/notifications/read', { body: { ids: [n.id] } }).then(refresh); go(n.botId, n.sessionId) }} /> : null}
    {modal === 'settings' ? <Settings onClose={() => setModal(null)} /> : null}
    {toast ? <div className="toast">{toast}</div> : null}
  </div>
}

function botSummary(bot: Bot, sessions: SessionInfo[], notif: NotifyEvent[]) {
  const wait = sessions.find((x) => x.state === 'awaiting_input'); const run = sessions.find((x) => x.state === 'running')
  const top = wait ?? run ?? sessions[0]; const last = notif.find((n) => n.botId === bot.id)
  const state = top?.state ?? null
  const text = wait ? `확인해 주세요 · ${wait.pending[0]?.displayName ?? wait.name}` : run ? `일하는 중 · ${run.activity || run.name}` : last ? last.body : top ? `${top.name}${top.hibernated ? ' · 절전' : ''}` : '메시지를 보내 보세요'
  return { state, text, t: Math.max(top?.lastActivity ?? bot.startedAt, last?.t ?? 0), mood: moodOf(state, !!top?.hibernated && !run && !wait) }
}

/* ── 대화 ───────────────────────────────────────────────────────────────── */
type Row = { k: 'item'; it: ChatItem } | { k: 'group'; items: Tool[] }
function buildRows(items: ChatItem[], drill: string | null): Row[] {
  const out: Row[] = []; let run: Tool[] = []
  const flush = () => { if (run.length >= 4) out.push({ k: 'group', items: run }); else for (const t of run) out.push({ k: 'item', it: t }); run = [] }
  for (const it of items) {
    if (drill) { if ((it.kind === 'tool' && it.parentId === drill)) out.push({ k: 'item', it }); continue }
    if (it.kind === 'tool' && it.parentId) continue
    if (it.kind === 'result' && it.ok) continue
    if (it.kind === 'tool') { run.push(it); continue }
    flush(); out.push({ k: 'item', it })
  }
  flush(); return out
}
function Chat({ bot, sessions, cur, items, pending, prefill, onPrefilled, attachReq, onAttached, onSession, onFile, docBadge, docOn, onDocToggle, onPanelToggle, say, refreshAll, collapsed, onUncollapse }: { bot: Bot; sessions: SessionInfo[]; cur?: SessionInfo; items: ChatItem[]; pending: PermissionRequest[]; prefill: string; onPrefilled: () => void; attachReq: string[]; onAttached: () => void; onSession: (sid: string) => void; onFile: (rel: string, pin?: boolean) => void; docBadge: number; docOn: boolean; onDocToggle: () => void; onPanelToggle: () => void; say: (m: string) => void; refreshAll: () => Promise<void>; collapsed: boolean; onUncollapse: () => void }) {
  const [text, setText] = useState(''); const [sessMenu, setSessMenu] = useState(false); const [busy, setBusy] = useState(false)
  const [attach, setAttach] = useState<{ rel: string; abs: string; uploaded?: boolean }[]>([]); const [attMenu, setAttMenu] = useState(false); const [pickOpen, setPickOpen] = useState(false); const [uploading, setUploading] = useState(false)
  const [queue, setQueue] = useState<string[]>([])
  const [drill, setDrill] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null); const endRef = useRef<HTMLDivElement>(null); const taRef = useRef<HTMLTextAreaElement>(null); const scRef = useRef<HTMLDivElement>(null)
  const state = cur?.state ?? 'idle'; const running = state === 'running'
  useEffect(() => { setDrill(null); setQueue([]) }, [cur?.id])
  useEffect(() => { if (prefill) { setText((t) => (t ? `${t} ${prefill}` : prefill)); onPrefilled(); taRef.current?.focus() } }, [prefill])
  useEffect(() => { if (attachReq.length) { setAttach((a) => [...a, ...attachReq.filter((r) => !a.some((x) => x.rel === r)).map((rel) => ({ rel, abs: `${bot.abs}/${rel}` }))]); onAttached() } }, [attachReq])
  const last = items[items.length - 1]
  useEffect(() => { const el = scRef.current; if (!el) return; const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240; if (nearBottom) endRef.current?.scrollIntoView({ block: 'end' }) }, [items.length, last && (last.kind === 'assistant' || last.kind === 'thinking') ? last.text.length : 0, pending.length, cur?.activity])
  const post = async (t: string) => { if (cur) await api(`/sessions/${cur.id}/send`, { body: { text: t } }); else { const r = await api<{ sessionId: string }>(`/bots/${bot.id}/send`, { body: { text: t, name: '메인' } }); await refreshAll(); onSession(r.sessionId) } }
  // 대기열 — 턴이 끝나면 순서대로
  useEffect(() => { if (!running && state !== 'awaiting_input' && queue.length && !busy) { const [n, ...rest] = queue; setQueue(rest); void post(n).catch((e) => say((e as Error).message)) } }, [state, queue.length, busy])
  const send = async () => {
    let t = text.trim(); if ((!t && !attach.length) || busy || uploading) return
    if (attach.length) t = `${t || '첨부한 파일을 봐 줘.'}\n\n첨부 파일 (읽어서 참고해):\n${attach.map((a) => `- ${a.abs}`).join('\n')}`
    setText(''); setAttach([]); if (taRef.current) taRef.current.style.height = 'auto'
    if (running || state === 'awaiting_input') { setQueue((q) => [...q, t]); return }
    setBusy(true); try { await post(t) } catch (e) { say((e as Error).message) } finally { setBusy(false) }
  }
  const onPickLocal = async (files: FileList | null) => { if (!files?.length) return; setUploading(true); try { for (const f of Array.from(files)) { const r = await uploadFile(bot.id, f); setAttach((a) => [...a, { rel: r.rel, abs: r.abs, uploaded: true }]) } say(`${files.length}개 올렸어요 → 첨부/`) } catch (e) { say((e as Error).message) } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' } }
  const relOf = (p: string) => (p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : null)
  const rows = useMemo(() => buildRows(items, drill), [items, drill])
  const drillSub = drill ? (items.find((x) => x.id === drill) as Sub | undefined) : undefined
  const hasText = !!text.trim() || attach.length > 0
  const mode: 'send' | 'queue' | 'stop' | 'off' = hasText ? (running || state === 'awaiting_input' ? 'queue' : 'send') : running ? 'stop' : 'off'
  if (collapsed) return <div className="strip" style={{ background: 'var(--bg)' }}><button className="ib" onClick={onUncollapse} title="대화 펼치기"><Icon n="sub" size={14} /></button><div className="gap" /><FolderBot color={bot.color} size={17} mood={moodOf(state, !!cur?.hibernated)} mono />{running ? <span className="pulse" style={{ marginTop: 8 }} /> : null}</div>
  return <div className="col chat" style={{ flex: 1 }}>
    <div className="hdr">
      {drillSub ? <><button className="ib" onClick={() => setDrill(null)} title="메인 대화로"><Icon n="back" size={14} /></button><span style={{ color: 'var(--t3)' }}>/</span><span className="ttl">{drillSub.name}</span>{drillSub.status === 'run' ? <span className="spin run" /> : <Icon n={drillSub.status === 'error' ? 'x' : 'check'} size={11} color={drillSub.status === 'error' ? 'var(--err)' : 'var(--done)'} />}<span style={{ color: 'var(--t3)', fontSize: 12, whiteSpace: 'nowrap' }}>도구 {drillSub.tools}</span></>
        : <><FolderBot color={bot.color} size={16} mood={moodOf(state, !!cur?.hibernated)} mono /><span className="ttl">{bot.name}</span>
          <span style={{ position: 'relative', flex: 'none' }}><button onClick={() => setSessMenu(!sessMenu)} style={{ color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>{cur?.name ?? '새 대화'} <Icon n="chevd" size={10} /></button>
            {sessMenu ? <div className="menu" style={{ left: 0, top: 28 }} onClick={() => setSessMenu(false)}>{sessions.map((x) => <button key={x.id} className={x.id === cur?.id ? 'on' : ''} onClick={() => onSession(x.id)}><span className={`dot ${stateDot(x.state)}`} /><span style={{ flex: 1 }}>{x.name}</span><span className="k">{x.hibernated ? '절전' : fmtTime(x.lastActivity)}</span></button>)}<hr /><button onClick={async () => { const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}` } }); await refreshAll(); onSession(info.id) }}><Icon n="plus" size={12} /><span>새 세션</span></button>{cur ? <button onClick={async () => { const n = prompt('세션 이름', cur.name); if (n) await api(`/sessions/${cur.id}/rename`, { body: { name: n } }) }}><Icon n="edit" size={12} /><span>이름 바꾸기</span></button> : null}{cur ? <button className="warn" onClick={async () => { if (confirm('이 세션 기록을 지울까요?')) { await api(`/sessions/${cur.id}`, { method: 'DELETE' }); await refreshAll() } }}><Icon n="x" size={12} /><span>세션 삭제</span></button> : null}</div> : null}</span>
          <span className={`dot ${stateDot(state)}`} /></>}
      <span className="sp" />
      <div className="acts"><button className={`ib ${docOn ? 'on' : ''}`} onClick={onDocToggle} title="문서 열 (⌘⇧D)"><Icon n="doc" size={14} />{!docOn && docBadge ? <span className="bd">{docBadge}</span> : null}</button><button className="ib" onClick={onPanelToggle} title="패널 (⌘⇧B)"><Icon n="panelr" size={14} /></button></div>
    </div>
    <div className="chat-scroll" ref={scRef}>
      <div className="chat-body">
        {!cur && !drill ? <div className="empty" style={{ flex: 1 }}><FolderBot color={bot.color} size={40} mood="idle" /><div><b>{bot.name}</b>{bot.orchestrator ? ' — 볼트 전체를 보는 관제 봇이에요. "지금 뭐 돌고 있어?", "Inbox 정리해 줘", "X 폴더에서 시작해".' : ' 봇이에요. 이 폴더의 지침·기억·자료를 들고 일해요.'}</div></div> : null}
        {drillSub ? <div className="drill-p"><div className="meta" style={{ cursor: 'default' }}>무엇을 시켰나</div><div className="tx">{drillSub.prompt || drillSub.name}</div><hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} /></div> : null}
        {rows.map((r, i) => r.k === 'group' ? <ToolGroup key={r.items[0].id} items={r.items} base={bot.abs} onFile={(p) => { const rel = relOf(p); if (rel) onFile(rel) }} />
          : <Item key={r.it.id} it={r.it} bot={bot} items={items} onFile={(p) => { const rel = relOf(p); if (rel) onFile(rel) }} onDrill={(id) => setDrill(id)} state={state} say={say} isLast={i === rows.length - 1} />)}
        {cur && !drill ? pending.map((p) => <PermCard key={p.requestId} p={p} sid={cur.id} />) : null}
        <div style={{ flex: 1 }} />
        {cur && (running || state === 'awaiting_input') ? <Live cur={cur} state={state} /> : null}
        <div ref={endRef} />
      </div>
      <div className="chat-foot">
        {queue.map((q, i) => <div key={i} className="queue"><span>대기 {i + 1}</span><span className="tx">{q}</span><button onClick={() => setQueue(queue.filter((_, k) => k !== i))} style={{ color: 'var(--t3)', display: 'inline-flex' }}><Icon n="x" size={11} /></button></div>)}
        {attach.length ? <div className="files">{attach.map((a) => <span key={a.abs} className="chip" title={a.abs}><span>{a.rel}</span><button onClick={() => setAttach(attach.filter((x) => x.abs !== a.abs))} style={{ color: 'var(--t3)', display: 'inline-flex' }}><Icon n="x" size={10} /></button></span>)}</div> : null}
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickLocal(e.target.files)} />
        <div className="composer" onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-fb-rel')) e.preventDefault() }} onDrop={(e) => { const rel = e.dataTransfer.getData('text/x-fb-rel'); if (rel) { e.preventDefault(); setAttach((a) => (a.some((x) => x.rel === rel) ? a : [...a, { rel, abs: `${bot.abs}/${rel}` }])) } }}>
          <button className="ib" style={{ alignSelf: 'center' }} title="첨부" onClick={() => setAttMenu(!attMenu)} disabled={uploading}><Icon n="plus" size={14} /></button>
          {attMenu ? <div className="menu" style={{ left: 0, bottom: 44 }} onClick={() => setAttMenu(false)}><button onClick={() => fileRef.current?.click()}><Icon n="phone" size={13} /><span style={{ flex: 1 }}>이 기기에서 파일 올리기</span><span className="k">→ 첨부/</span></button><button onClick={() => setPickOpen(true)}><Icon n="folder" size={13} /><span style={{ flex: 1 }}>{bot.orchestrator ? '볼트' : '이 폴더'}에서 고르기</span></button></div> : null}
          <textarea ref={taRef} rows={1} placeholder={drill ? '메인 대화로 보냅니다 — 이 안에는 직접 말을 걸 수 없어요' : running ? '⏎ 로 대기열에 넣습니다' : state === 'awaiting_input' ? '답을 기다리는 중 — 보내면 대기열에' : '메시지…'} value={text} onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px` }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
          {mode === 'stop' ? <button className="sendb" onClick={() => cur && api(`/sessions/${cur.id}/interrupt`, { body: {} })} title="중단"><Icon n="stop" size={11} /></button>
            : <button className={`sendb ${mode === 'off' ? 'off' : ''}`} onClick={send} disabled={mode === 'off' || busy || uploading} title={mode === 'queue' ? '대기열에 넣기' : '보내기'}><Icon n="up" size={12} />{mode === 'queue' ? <span className="bd">+{queue.length + 1}</span> : null}</button>}
        </div>
        <div className="cfoot"><span className={`dot ${cur?.alive || running ? 'done' : 'none'}`} style={{ width: 5, height: 5 }} /><span>{cur?.hibernated && !running ? 'Mac mini · 절전 (첫 답이 몇 초 늦어요)' : 'Mac mini'}</span><span className="sp" />{uploading ? <span>올리는 중…</span> : null}</div>
      </div>
    </div>
    {pickOpen ? <FilePickModal bot={bot} onClose={() => setPickOpen(false)} onPick={(rel) => { setAttach((a) => (a.some((x) => x.rel === rel) ? a : [...a, { rel, abs: `${bot.abs}/${rel}` }])); setPickOpen(false) }} /> : null}
  </div>
}

function Live({ cur, state }: { cur: SessionInfo; state: string }) {
  if (state === 'awaiting_input') return <div className="live"><span className="glow" /><span className="tx">확인 대기 — 위 요청에 응답해 주세요</span><span className="el"><Elapsed from={cur.turnStartedAt} /></span></div>
  const a = cur.activity || '일하는 중'; const think = a.startsWith('생각 중 · ')
  return <div className="live"><span className="pulse" /><span className="tx">{think ? '생각 중' : a}</span>{think ? <span className="th">— {a.slice(6)}</span> : null}<span className="el"><Elapsed from={cur.turnStartedAt} /></span><button className="stop" onClick={() => api(`/sessions/${cur.id}/interrupt`, { body: {} })}>중단</button></div>
}

function Item({ it, bot, items, onFile, onDrill, state, say, isLast }: { it: ChatItem; bot: Bot; items: ChatItem[]; onFile: (p: string) => void; onDrill: (id: string) => void; state: string; say: (m: string) => void; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  switch (it.kind) {
    case 'user': return <div className="umsg">{it.text}</div>
    case 'assistant': return <div><Md text={it.text || ' '} streaming={!!it.streaming} />{!it.streaming && isLast ? <div className="meta" style={{ gap: 12, marginTop: 4 }}><span>{fmtTime(it.t)}</span><button onClick={() => { navigator.clipboard?.writeText(it.text); say('복사했어요') }} style={{ color: 'inherit' }}>복사</button></div> : null}</div>
    case 'thinking': return <div><button className={`meta ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}><span>생각</span>{!open ? <span className="tx">· {it.text.replace(/\s+/g, ' ').slice(0, 100)}</span> : null}<Icon n={open ? 'chevd' : 'chev'} size={9} /></button>{open ? <div className="think">{it.text}</div> : null}</div>
    case 'tool': return <ToolLine it={it} onFile={onFile} base={bot.abs} />
    case 'subagent': { const kids = items.filter((x) => x.kind === 'tool' && x.parentId === it.id) as Tool[]; return <div className="sub"><div className="l"><button className="ib" style={{ width: 18, height: 18, marginLeft: -4 }} onClick={() => setOpen(!open)}><Icon n={open ? 'chevd' : 'sub'} size={12} /></button><span className="nm">{it.name}</span>{it.status === 'run' ? <span className="spin run" /> : <Icon n={it.status === 'error' ? 'x' : 'check'} size={11} color={it.status === 'error' ? 'var(--err)' : 'var(--done)'} />}<span className="m">{it.status === 'run' ? '실행 중' : it.status === 'error' ? '실패' : '끝남'} · 도구 {it.tools}회{it.last ? <> · <span className="mono">{it.last}</span></> : null}</span><button className="op" onClick={() => onDrill(it.id)}>열기 <Icon n="chev" size={10} /></button></div>{open ? <div className="in">{kids.slice(-4).map((k) => <ToolLine key={k.id} it={k} onFile={onFile} base={bot.abs} />)}{it.result && it.status !== 'run' ? <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>{it.result.slice(0, 300)}</div> : null}{!kids.length ? <div className="meta">아직 도구를 안 썼어요</div> : null}</div> : null}</div> }
    case 'todos': return <TodoWidget it={it} stopped={state !== 'running'} />
    case 'files': return <div className="files">{it.paths.map((p) => <button key={p} className="chip" onClick={() => onFile(p)} title={p}><Icon n="doc" size={11} color="var(--t3)" /><span>{p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : p.split('/').pop()}</span></button>)}</div>
    case 'result': return it.ok ? null : <div className="meta" style={{ color: 'var(--err)' }}><Icon n="warn" size={11} /><span className="tx">{it.error || '오류로 끝남'}</span></div>
    default: return <div className="meta"><span className="tx">{(it as { text: string }).text}</span></div>
  }
}

function ToolLine({ it, onFile, base }: { it: Tool; onFile: (p: string) => void; base?: string }) {
  const rel = (t: string) => (base ? t.split(base + '/').join('').split(base).join('.') : t)
  const [open, setOpen] = useState(false)
  const kind = /^(Read|Glob|LS)$/.test(it.name) ? 'read' : /^Grep$/.test(it.name) ? 'grep' : /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(it.name) ? 'edit' : /^Bash$/.test(it.name) ? 'run' : /Web/.test(it.name) ? 'web' : /^mcp__/.test(it.name) ? 'plug' : 'task'
  const label = it.name.startsWith('mcp__') ? it.name.replace(/^mcp__(claude_ai_)?/, '').replace(/__/g, ' ') : it.name
  const fp = typeof it.input?.file_path === 'string' ? (it.input.file_path as string) : null
  const diff = it.name === 'Edit' && typeof it.input?.old_string === 'string' && typeof it.input?.new_string === 'string' ? { a: (it.input.old_string as string).split('\n').length, b: (it.input.new_string as string).split('\n').length } : null
  return <div className="tl"><button className="l" onClick={() => setOpen(!open)}>{it.result === undefined && !it.isError ? <span className="spin" /> : it.isError ? <Icon n="x" size={11} color="var(--err)" /> : <Icon n="check" size={11} color="var(--t3)" />}<Icon n={kind as 'read'} size={12} color="var(--t3)" /><span className="nm">{label}</span><span className="sm">{rel(it.summary)}</span>{diff ? <span className="diff"><span style={{ color: 'var(--done)' }}>+{diff.b}</span> <span style={{ color: 'var(--err)' }}>−{diff.a}</span></span> : null}</button>
    {open ? <div className="det">{fp ? <button className="chip" style={{ marginBottom: 6 }} onClick={() => onFile(fp)}><span>{fp.split('/').pop()}</span></button> : null}{diff ? <>{(it.input?.old_string as string).split('\n').map((l, i) => <div key={`a${i}`} style={{ color: 'var(--err)' }}>- {l}</div>)}{(it.input?.new_string as string).split('\n').map((l, i) => <div key={`b${i}`} style={{ color: 'var(--done)' }}>+ {l}</div>)}</> : JSON.stringify(it.input, null, 1).slice(0, 1200)}{it.result ? `\n\n${it.result}` : ''}</div> : null}</div>
}
function ToolGroup({ items, onFile, base }: { items: Tool[]; onFile: (p: string) => void; base?: string }) {
  const [open, setOpen] = useState(false)
  const counts = new Map<string, number>(); for (const t of items) counts.set(t.name.replace(/^mcp__(claude_ai_)?/, '').split('__')[0], (counts.get(t.name.replace(/^mcp__(claude_ai_)?/, '').split('__')[0]) ?? 0) + 1)
  const fails = items.filter((t) => t.isError).length
  return <div className="grp"><button className={`meta ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>{items.some((t) => t.result === undefined) ? <span className="spin" /> : <Icon n={fails ? 'x' : 'check'} size={11} color={fails ? 'var(--err)' : undefined} />}<span>도구 {items.length}회</span><span className="tx mono" style={{ fontSize: 12 }}>{[...counts.entries()].map(([n, c]) => `${n} ${c}`).join(' · ')}</span>{fails ? <span style={{ color: 'var(--err)' }}>실패 {fails}</span> : null}<Icon n={open ? 'chevd' : 'chev'} size={9} /></button>{open ? <div className="in">{items.map((t) => <ToolLine key={t.id} it={t} onFile={onFile} base={base} />)}</div> : null}</div>
}
function TodoWidget({ it, stopped }: { it: Extract<ChatItem, { kind: 'todos' }>; stopped: boolean }) {
  const [open, setOpen] = useState(true)
  const done = it.items.filter((x) => x.status === 'completed').length; const left = it.items.length - done
  if (!it.items.length || (left === 0 && !open)) return null
  const st = stopped && left > 0
  return <div className="todow"><button className="h" onClick={() => setOpen(!open)}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span style={{ color: 'var(--t2)' }}>작업 목록</span><span className="mono">{done}/{it.items.length}</span><span className={`bar ${st ? 'st' : ''}`}><i style={{ width: `${(done / it.items.length) * 100}%` }} /></span>{st ? <span style={{ color: 'var(--wait)' }}>멈춤</span> : null}</button>
    {open ? <div className="rows">{it.items.map((x, i) => <div key={i} className={`r ${x.status === 'completed' ? 'done' : x.status === 'in_progress' ? 'run' : 'wait'}`}>{x.status === 'completed' ? <Icon n="check" size={11} color="var(--t3)" /> : x.status === 'in_progress' ? (st ? <Icon n="pause" size={10} color="var(--wait)" /> : <span className="spin run" />) : <span className="empty" />}<span>{x.status === 'in_progress' && x.activeForm && !st ? x.activeForm : x.content}</span></div>)}</div> : null}
    {open && st ? <div className="ft">남은 {left}개는 진행되지 않았어요</div> : null}</div>
}

function FilePickModal({ bot, onClose, onPick }: { bot: Bot; onClose: () => void; onPick: (rel: string) => void }) {
  const [tree, setTree] = useState<{ name: string; rel: string; dir: boolean; mtime: number; children?: unknown[] }[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { void api<typeof tree>(`/bots/${bot.id}/files?depth=4`).then(setTree) }, [bot.id])
  const flat: { rel: string; mtime: number }[] = []
  const walk = (n: typeof tree) => { for (const x of n) { if (!x.dir) flat.push({ rel: x.rel, mtime: x.mtime }); if (x.children) walk(x.children as typeof tree) } }
  walk(tree)
  const list = flat.filter((f) => !q || f.rel.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.mtime - a.mtime).slice(0, 200)
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal" style={{ width: 'min(560px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{bot.orchestrator ? '볼트' : bot.name}에서 파일 고르기</b><small>고른 파일의 경로가 메시지에 붙고, 봇이 읽어요</small></div><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="search"><Icon n="search" size={13} /><input placeholder="파일 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="modal-b" style={{ maxHeight: '55vh' }}>{list.map((f) => <button key={f.rel} className="trow" style={{ ['--pad' as string]: '18px' }} onClick={() => onPick(f.rel)}><Icon n="doc" size={12} color="var(--t3)" /><span className="n">{f.rel}</span><time style={{ visibility: 'visible' }}>{fmtTime(f.mtime)}</time></button>)}{!list.length ? <div className="empty">파일이 없어요</div> : null}</div>
    </div>
  </>
}

function PermCard({ p, sid }: { p: PermissionRequest; sid: string }) {
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false)
  const [pick, setPick] = useState<Record<string, string>>({}); const [other, setOther] = useState('')
  const act = async (body: Record<string, unknown>, path: 'permission' | 'ask') => { setBusy(true); try { await api(`/sessions/${sid}/${path}`, { body: { requestId: p.requestId, ...body } }); setSent(true) } finally { setBusy(false) } }
  if (sent) return <div className="meta"><Icon n="check" size={11} color="var(--done)" /><span>보냈어요</span></div>
  if (p.ask) {
    const qs = (p.input.questions as { question?: string; header?: string; options?: { label?: string; description?: string }[]; multiSelect?: boolean }[] | undefined) ?? []
    const ready = qs.every((q, i) => pick[q.question ?? String(i)]) || !!other.trim()
    return <div className="card"><div className="lab">에이전트의 질문{qs[0]?.header ? ` · ${qs[0].header}` : ''}</div>
      {qs.map((q, i) => { const key = q.question ?? String(i); return <div key={i} style={{ display: 'flex', flexDirection: 'column' }}><div className="q">{q.question}</div>{(q.options ?? []).map((o) => <button key={o.label} className={`opt ${pick[key] === o.label ? 'on' : ''}`} onClick={() => setPick({ ...pick, [key]: o.label ?? '' })}><span className="r" /><div><div>{o.label}</div>{o.description ? <div className="d">{o.description}</div> : null}</div></button>)}<div className={`opt ${other ? 'on' : ''}`}><span className="r" style={{ marginTop: 7 }} /><input placeholder="기타 — 직접 입력…" value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && other.trim()) void act({ answers: { [key]: other.trim() } }, 'ask') }} /></div></div> })}
      <div className="btns"><button className="btn ghost" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>취소 ⎋</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={busy || !ready} onClick={() => act({ answers: other.trim() ? { [qs[0]?.question ?? 'answer']: other.trim() } : pick }, 'ask')}>보내기</button></div></div>
  }
  const i = p.input; const cmd = typeof i.command === 'string' ? i.command : typeof i.file_path === 'string' ? i.file_path : typeof i.url === 'string' ? i.url : JSON.stringify(i).slice(0, 400)
  const human = p.description || (typeof i.command === 'string' ? `명령을 실행합니다` : typeof i.file_path === 'string' ? `파일을 ${/Write|Edit/.test(p.toolName) ? '고칩니다' : '읽습니다'} — ${String(i.file_path).split('/').pop()}` : `${p.displayName} 를 씁니다`)
  return <div className="card"><div className="lab">권한 · {p.displayName}</div><div className="q">{human}</div><div className="cmd">{cmd}</div>
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => act({ allow: true }, 'permission')}>허용</button>{p.suggestions.length ? <button className="btn" disabled={busy} onClick={() => act({ allow: true, always: true }, 'permission')}>이 세션에서 항상 허용</button> : null}<button className="btn ghost" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>거부</button></div></div>
}
