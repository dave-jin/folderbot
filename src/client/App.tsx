import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bot, ChatItem, NotifyEvent, PermissionMode, PermissionRequest, SessionInfo, SlashCmd } from '../core/types'
import { api, setToken, token, uploadFile } from './api'
import { FolderBot, Icon, moodOf } from './FolderBot'
import { FolderPicker, Md, NotifyCenter, Onboarding, Pairing, Settings, useToast } from './Sheets'
import { DocPane, useDocs } from './Doc'
import { Elapsed, Panel, type SecH } from './Panel'
import { fmtTime, useStore } from './store'
import { EFFORTS, MODELS, MODES, effortLabel, fmtK, modeLabel, modelLabel } from './consts'

type Tool = Extract<ChatItem, { kind: 'tool' }>
type Sub = Extract<ChatItem, { kind: 'subagent' }>
type Att = { rel: string; abs: string; dir?: boolean; uploaded?: boolean }
const stateDot = (st?: string) => (st === 'running' ? 'run' : st === 'awaiting_input' ? 'wait' : st === 'error' ? 'err' : 'none')

function useHash(): [Record<string, string>, (p: Record<string, string>) => void] {
  const parse = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)))
  const [h, setH] = useState<Record<string, string>>(parse)
  useEffect(() => { const f = () => setH(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return [h, (p) => { location.hash = new URLSearchParams(p).toString() }]
}
function useMedia(q: string): boolean { const [m, setM] = useState(() => window.matchMedia(q).matches); useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [q]); return m }
/** 폰 키보드 — visualViewport 가 창보다 훨씬 낮아지면 열린 것 */
function useKeyboard(): boolean { const [kb, setKb] = useState(false); useEffect(() => { const vv = window.visualViewport; if (!vv) return; const f = () => setKb(vv.height < window.innerHeight - 140); vv.addEventListener('resize', f); return () => vv.removeEventListener('resize', f) }, []); return kb }

export function App() {
  const { s } = useStore()
  const [authed, setAuthed] = useState(() => { const h = new URLSearchParams(location.hash.slice(1)); const t = h.get('token'); if (t) { setToken(t); h.delete('token'); location.hash = h.toString(); location.reload() } return !!token() })
  useEffect(() => { const f = () => setAuthed(false); window.addEventListener('fb:authlost', f); return () => window.removeEventListener('fb:authlost', f) }, [])
  if (!authed) return <div className="app"><Pairing onDone={() => location.reload()} /></div>
  if (!s.loaded) return <div className="app"><div className="empty"><FolderBot color="#e08850" size={40} mood="work" />Mac mini 에 연결하는 중…</div></div>
  if (!s.rulesInstalled) return <div className="app"><Onboarding /></div>
  return <Main />
}

interface Layout { sb: number; rp: number; doc: number; sbOpen: boolean; rpOpen: boolean; sbPin: boolean; rpPin: boolean; secH: SecH }
const DEF: Layout = { sb: 250, rp: 290, doc: 520, sbOpen: true, rpOpen: true, sbPin: false, rpPin: false, secH: { sessions: 120, todo: 128 } }
interface UpdState { lastCheck: number; current: string; staged: { version: string; ready: boolean; progress: number; notes: string } | null; downloading: boolean; checking: boolean; lastError: string; deferred: boolean; busy: number; host: boolean }
interface DesktopBridge { version?: string; update?: { state: () => Promise<UpdState>; check: () => Promise<UpdState>; apply: () => void; onChange: (cb: (st: UpdState) => void) => () => void } }
const desk = (window as unknown as { folderbotDesktop?: DesktopBridge }).folderbotDesktop
const isDesktop = typeof desk !== 'undefined'

/** 자기 업데이트 — 셸(Electron)이 받아 두고, 여기서는 상태를 보여 주고 «재시작» 만 누른다 */
function useUpdate(say: (m: string) => void): [UpdState | null, () => void, () => void] {
  const [st, setSt] = useState<UpdState | null>(null)
  const readyRef = useRef('')
  useEffect(() => {
    const u = desk?.update; if (!u) return
    void u.state().then(setSt).catch(() => {})
    return u.onChange((n) => { setSt(n); if (n.staged?.ready && readyRef.current !== n.staged.version) { readyRef.current = n.staged.version; say(n.deferred ? `v${n.staged.version} 준비됨 — 세션 ${n.busy}개가 끝나면 자동으로 적용해요` : `v${n.staged.version} 준비됨 — 아래 버전 칩에서 재시작`) } })
  }, [])
  const check = () => { const u = desk?.update; if (!u) return; setSt((x) => (x ? { ...x, checking: true } : x)); void u.check().then(setSt).catch(() => {}) }
  const apply = () => { const u = desk?.update; if (!u || !st?.staged?.ready) return; if (st.busy > 0 && !confirm(`세션 ${st.busy}개가 중단됩니다. 지금 재시작해서 v${st.staged.version} 을 적용할까요?`)) return; u.apply() }
  return [st, check, apply]
}
function UpdateChip({ version, st, onCheck, onApply }: { version: string; st: UpdState | null; onCheck: () => void; onApply: () => void }) {
  if (!isDesktop || !st) return <span className="bd mono">v{version}</span>
  if (st.staged?.ready) return st.deferred ? <span className="bd" style={{ color: 'var(--wait)' }} title="호스트 모드 — 세션이 전부 유휴가 되는 순간 자동 적용">v{st.staged.version} · 세션 {st.busy}개 끝나면 적용</span>
    : <button className="bd" style={{ color: 'var(--done)', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={onApply} title={st.staged.notes}><span className="dot done" style={{ width: 5, height: 5 }} />v{st.staged.version} 재시작해서 적용</button>
  if (st.downloading) return <span className="bd" title="조용히 받는 중 — 다 받으면 알려 드려요">v{st.staged?.version} 받는 중 {Math.round((st.staged?.progress ?? 0) * 100)}%</span>
  return <button className="bd mono" onClick={onCheck} title={st.lastError ? `마지막 확인 실패 — ${st.lastError}` : st.lastCheck ? `업데이트 확인 · 마지막 ${fmtTime(st.lastCheck)}` : '업데이트 확인'} style={st.lastError ? { color: 'var(--wait)' } : undefined}>v{st.current}{st.checking ? ' · 확인 중…' : ''}</button>
}

function Main() {
  const { s, refresh, loadChat, loadTodo } = useStore()
  const [hash, setHash] = useHash()
  const botId = hash.bot || 'orch'
  const bot = s.bots.find((b) => b.id === botId) ?? s.bots[0]
  const sessions = s.sessionsByBot[bot?.id ?? ''] ?? []
  const sessionId = hash.s && sessions.some((x) => x.id === hash.s) ? hash.s : sessions[0]?.id
  const narrow = useMedia('(max-width: 1100px)'); const phone = useMedia('(max-width: 760px)'); const kb = useKeyboard()
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
  const [attachReq, setAttachReq] = useState<Att[]>([])
  const [mentionReq, setMentionReq] = useState<string[]>([])
  const [focusReq, setFocusReq] = useState(0)
  const [focusSec, setFocusSec] = useState<{ sec: string; n: number } | null>(null)
  const [upd, updCheck, updApply] = useUpdate(say)
  const docs = useDocs(bot?.id ?? '')
  useEffect(() => { if (sessionId && !s.chats[sessionId]) void loadChat(sessionId) }, [sessionId])
  useEffect(() => { if (bot) void loadTodo(bot.id) }, [bot?.id, s.filesTick[bot?.id ?? '']])
  const go = (b: string, sid?: string) => { setHash(sid ? { bot: b, s: sid } : { bot: b }); setView('chat') }
  const unread = s.notifications.filter((n) => !n.read).length
  const waiting = s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length
  const showDoc = !!bot && (phone || !!docOpen[bot.id]) && docs.tabs.length > 0
  const openDoc = (rel: string, pin = false) => { if (!bot) return; docs.open(rel, pin); setDocOpen((d) => ({ ...d, [bot.id]: true })); if (phone) setView('doc') }
  const addAttach = (a: Att) => { setAttachReq((q) => [...q, { ...a, abs: a.abs || `${bot?.abs}/${a.rel}` }]); if (phone) setView('chat') }
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
  // 좁은 창에서는 접힌 게 기본이고, 아이콘 열을 누르면 그 패널만 핀으로 편다
  const sbOpen = narrow ? lay.sbPin : lay.sbOpen; const rpOpen = narrow ? lay.rpPin : lay.rpOpen
  const openRp = (sec?: string) => { setLay((l) => ({ ...l, rpOpen: true, rpPin: true })); if (sec) setFocusSec({ sec, n: Date.now() }) }
  const closeRp = () => setLay((l) => ({ ...l, rpOpen: false, rpPin: false }))
  const openSb = () => setLay((l) => ({ ...l, sbOpen: true, sbPin: true })); const closeSb = () => setLay((l) => ({ ...l, sbOpen: false, sbPin: false }))
  const stripBots = rows.flatMap(([, it]) => it)
  const newSession = async () => { const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}` } }); await refresh(); go(bot.id, info.id) }
  return <div className={`app ${isDesktop ? 'desktop' : ''} ${phone ? 'phone' : ''} ${kb ? 'kb' : ''} ${drag === 'x' ? 'dragx' : drag === 'y' ? 'dragy' : ''}`} data-view={view === 'doc' && !showDoc ? 'panel' : view}>
    {s.online === 'off' ? <div className="offline">Mac mini 와 다시 연결하는 중…</div> : null}
    {s.auth.verdict === 'unreadable' || s.auth.verdict === 'loggedout' ? <div className="banner"><span className="dot wait" /><span><b>Mac mini 에서 Claude 로그인이 필요해요.</b> 미니에서 <span className="mono">claude</span> → <span className="mono">/login</span>, 또는 설정 › Claude 토큰. 보낸 지시는 대기열에 두었다가 복구되면 이어서 해요.</span><span style={{ marginLeft: 'auto' }} /><button className="btn" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button></div> : null}
    <div className="cols">
      {/* ── 왼쪽 (폰은 홈 화면) ── */}
      {phone ? <Home rows={rows} bot={bot} go={go} setModal={setModal} waiting={waiting} unread={unread} onAsk={() => { go('orch'); setFocusReq(Date.now()) }} />
        : sbOpen ? <div className="col side left" style={{ width: lay.sb }}>
        <div className="hdr"><FolderBot color="#e08850" size={16} mood={waiting ? 'wait' : 'idle'} mono /><span className="ttl">Folder Bot</span><span className="sp" /><div className="acts"><button className="ib" onClick={closeSb} title="목록 접기 (⌘B)"><Icon n="panel" size={14} /></button></div></div>
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
        <div className="sb-foot"><span className={`dot ${s.online === 'on' ? 'done' : 'err'}`} /><span>Mac mini</span>{s.inbox ? <span className="bd">Inbox {s.inbox}</span> : null}<UpdateChip version={s.version} st={upd} onCheck={updCheck} onApply={updApply} /></div>
      </div> : <div className="strip left"><button className="ib" onClick={openSb} title="목록 펼치기 (⌘B)"><Icon n="panel" size={14} /></button><div className="gap" />
        <button className="ib" onClick={() => setModal('picker')}><Icon n="fplus" size={14} /><span className="fly"><b>폴더 선택 · 시작</b><span>후보 {s.candidates.filter((c) => !c.active).length}</span></span></button>
        <button className="ib" onClick={() => setModal('notify')}><Icon n="bell" size={14} />{unread ? <span className="bd">{unread}</span> : null}<span className="fly"><b>알림</b><span>{unread ? `읽지 않음 ${unread}` : '없음'}</span></span></button>
        <div className="gap" />
        {stripBots.map(({ b, sum }) => <button key={b.id} className={`bot ${b.id === bot.id ? 'on' : ''}`} onClick={() => go(b.id)}><FolderBot color={b.color} size={17} mood={sum.mood} mono />{stateDot(sum.state ?? undefined) !== 'none' ? <span className={`dot ${stateDot(sum.state ?? undefined)}`} /> : null}<span className="fly"><b>{b.name}</b><span><span className={`dot ${stateDot(sum.state ?? undefined)}`} style={{ marginRight: 5 }} />{sum.text}</span><span className="t3">{b.section} · {fmtTime(sum.t)}</span></span></button>)}
      </div>}
      <div className="divx" onPointerDown={sbOpen ? dragX('sb', 1) : undefined} onDoubleClick={() => setLay({ ...lay, sb: DEF.sb, sbOpen: true, sbPin: true })} />

      {/* ── 채팅 ── */}
      <Chat bot={bot} sessions={sessions} cur={cur} items={items} pending={pending} prefill={prefill} onPrefilled={() => setPrefill('')} attachReq={attachReq} onAttached={() => setAttachReq([])} mentionReq={mentionReq} onMentioned={() => setMentionReq([])} focusReq={focusReq} onSession={(sid) => go(bot.id, sid)} onFile={(rel, pin) => openDoc(rel, pin)} docBadge={docs.tabs.length} docTabs={docs.tabs.map((t) => t.rel)} docOn={showDoc} onDocToggle={() => setDocOpen((d) => ({ ...d, [bot.id]: !d[bot.id] }))} say={say} refreshAll={refresh} collapsed={!phone && wide && showDoc} onUncollapse={() => setWide(false)} phone={phone} onBack={() => setView('list')} onPanel={() => setView('panel')} newSession={newSession} filesTick={s.filesTick[bot.id]} />

      {/* ── 문서 열 ── */}
      {showDoc ? <>{!phone ? <div className="divx" onPointerDown={dragX('doc', -1)} onDoubleClick={() => setLay({ ...lay, doc: DEF.doc })} /> : null}<div className="docwrap" style={{ width: wide || phone ? undefined : lay.doc, flex: wide ? 3 : 'none', display: 'flex', minWidth: 0 }}><DocPane bot={bot} docs={docs} filesTick={s.filesTick[bot.id]} onTalk={(rel) => { setPrefill(`${rel} 파일 봐 줘: `); if (phone) setView('chat') }} onHide={() => setDocOpen((d) => ({ ...d, [bot.id]: false }))} wide={wide} onWide={() => setWide(!wide)} onAttach={(rel) => addAttach({ rel, abs: `${bot.abs}/${rel}` })} say={say} phone={phone} onBack={() => setView('panel')} /></div></> : null}

      {/* ── 오른쪽 ── */}
      {!phone ? <div className="divx" onPointerDown={rpOpen ? dragX('rp', -1) : undefined} onDoubleClick={() => setLay({ ...lay, rp: DEF.rp, rpOpen: true, rpPin: true })} /> : null}
      {rpOpen || phone ? <div className="rpwrap" style={{ width: phone ? '100%' : lay.rp, flex: 'none', display: 'flex', minWidth: 0 }}><Panel bot={bot} sessions={sessions} sessionId={sessionId} go={go} onOpenFile={openDoc} onTalk={(t) => { setPrefill(t); if (phone) setView('chat') }} onAttach={(rel, dir) => addAttach({ rel, abs: `${bot.abs}/${rel}`, dir })} onMention={(rel) => { setMentionReq((m) => [...m, rel]); if (phone) setView('chat') }} touched={touched} filesTick={s.filesTick[bot.id]} secH={lay.secH} onSecH={(h) => setLay({ ...lay, secH: h })} onCollapse={closeRp} focusSec={focusSec} say={say} refresh={refresh} activeDoc={showDoc ? docs.active : null} onDragY={(on) => setDrag(on ? 'y' : '')} phone={phone} onBack={() => setView('chat')} /></div>
        : <div className="strip right"><button className="ib" onClick={() => openRp()} title="패널 펼치기 (⌘⇧B)"><Icon n="panelr" size={14} /></button><div className="gap" />
        <button className="ib" onClick={() => openRp('sessions')}><Icon n="clock" size={14} />{sessions.some((x) => x.state === 'running') ? <span className="dot run" style={{ position: 'absolute', right: 2, top: 2 }} /> : null}<span className="fly"><b>세션</b><span>{sessions.length}개</span></span></button>
        <button className="ib" onClick={() => openRp('todo')}><Icon n="list" size={14} />{(s.todos[bot.id] ?? []).filter((t) => !t.done).length ? <span className="bd">{(s.todos[bot.id] ?? []).filter((t) => !t.done).length}</span> : null}<span className="fly"><b>{bot.orchestrator ? 'Inbox' : '할 일'}</b><span>{bot.orchestrator ? `${s.inbox}개` : `미완료 ${(s.todos[bot.id] ?? []).filter((t) => !t.done).length}`}</span></span></button>
        <button className="ib" onClick={() => openRp('files')}><Icon n="folder" size={14} /><span className="fly"><b>파일</b><span>{bot.rel || '볼트'}</span></span></button>
        <button className="ib" onClick={() => openRp('routines')}><Icon n="cal" size={14} /><span className="fly"><b>루틴</b><span>{bot.routines.length}개</span></span></button>
      </div>}
    </div>
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

/* ── 폰 홈 — 큰 제목 · 카드 4 · 봇 목록 · 떠 있는 알약 (탭바 없음) ── */
type Row = [string, { b: Bot; sum: ReturnType<typeof botSummary> }[]]
function Home({ rows, bot, go, setModal, waiting, unread, onAsk }: { rows: Row[]; bot: Bot; go: (b: string) => void; setModal: (m: 'picker' | 'notify' | 'settings') => void; waiting: number; unread: number; onAsk: () => void }) {
  const { s } = useStore()
  const all = rows.flatMap(([, l]) => l)
  const running = all.filter((x) => x.sum.state === 'running')
  const cands = s.candidates.filter((c) => !c.active).length
  return <div className="col mhome">
    <div className="mtop"><button className="rb" onClick={() => setModal('settings')} title="설정"><FolderBot color="#e08850" size={26} mood={waiting ? 'wait' : 'idle'} mono /></button><span className="sp" /><button className="rb" onClick={() => setModal('notify')}><Icon n="bell" size={20} />{unread ? <span className="bd">{unread}</span> : null}</button><button className="rb" onClick={() => setModal('picker')}><Icon n="fplus" size={20} /></button></div>
    <div className="mscroll">
      <div className="mtitle">Folder Bot</div>
      <div className="msub"><span className={`dot ${s.online === 'on' ? 'done' : 'err'}`} style={{ width: 7, height: 7 }} />Mac mini · 봇 {s.bots.length} · 후보 {cands}</div>
      <div className="mcards">
        <button onClick={() => setModal('notify')}><Icon n="bell" size={22} color="var(--wait)" /><span className="n">확인 필요<span>{waiting}</span></span></button>
        <button onClick={() => (running[0] ? go(running[0].b.id) : go(bot.id))}><Icon n="run" size={22} color="var(--run)" /><span className="n">일하는 중<span>{running.length}</span></span></button>
        <button onClick={() => go('orch')}><Icon n="archive" size={22} color="#7fb0ff" /><span className="n">인박스<span>{s.inbox}</span></span></button>
        <button onClick={() => setModal('picker')}><Icon n="fplus" size={22} color="var(--t2)" /><span className="n">폴더 후보<span>{cands}</span></span></button>
      </div>
      {rows.map(([sec, list]) => <div key={sec}>
        <div className="secl">{sec}</div>
        {list.map(({ b, sum }) => <button key={b.id} className="mrow" onClick={() => go(b.id)}><span className="av"><FolderBot color={b.color} size={46} mood={sum.mood} mono />{stateDot(sum.state ?? undefined) !== 'none' ? <span className={`dot ${stateDot(sum.state ?? undefined)}`} /> : null}</span><span className="t"><span className="l1"><b>{b.name}</b><time>{fmtTime(sum.t)}</time></span><span className="l2">{sum.text}</span></span></button>)}
      </div>)}
    </div>
    <button className="mpill glassb" onClick={onAsk}><span className="pl"><Icon n="plus" size={20} /></span><span className="tx">폴더에 시키기…</span><Icon n="sub" size={20} color="var(--t2)" /></button>
  </div>
}

/* ── 대화 ───────────────────────────────────────────────────────────────── */
type ChatRow = { k: 'item'; it: ChatItem } | { k: 'group'; items: Tool[] }
function buildRows(items: ChatItem[], drill: string | null): ChatRow[] {
  const out: ChatRow[] = []; let run: Tool[] = []
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
const BUILTIN_SLASH: SlashCmd[] = [{ name: 'compact', desc: '대화 압축 — 컨텍스트 줄이기', kind: 'cli', scope: 'cli' }, { name: 'context', desc: '컨텍스트 사용 내역', kind: 'cli', scope: 'cli' }, { name: 'clear', desc: '새 대화로 (새 세션)', kind: 'cli', scope: 'cli' }]
interface FileNode { rel: string; dir: boolean; mtime: number }
const fuzzy = (q: string, s: string): number => { if (!q) return 1; const t = s.toLowerCase(); if (t.includes(q)) return t.startsWith(q) ? 3 : 2; let i = 0; for (const c of t) if (c === q[i]) i++; return i === q.length ? 1 : 0 }

function Chat({ bot, sessions, cur, items, pending, prefill, onPrefilled, attachReq, onAttached, mentionReq, onMentioned, focusReq, onSession, onFile, docBadge, docTabs, docOn, onDocToggle, say, refreshAll, collapsed, onUncollapse, phone, onBack, onPanel, newSession, filesTick }: { bot: Bot; sessions: SessionInfo[]; cur?: SessionInfo; items: ChatItem[]; pending: PermissionRequest[]; prefill: string; onPrefilled: () => void; attachReq: Att[]; onAttached: () => void; mentionReq: string[]; onMentioned: () => void; focusReq: number; onSession: (sid: string) => void; onFile: (rel: string, pin?: boolean) => void; docBadge: number; docTabs: string[]; docOn: boolean; onDocToggle: () => void; say: (m: string) => void; refreshAll: () => Promise<void>; collapsed: boolean; onUncollapse: () => void; phone: boolean; onBack: () => void; onPanel: () => void; newSession: () => Promise<void>; filesTick?: number }) {
  const { s } = useStore()
  const [text, setText] = useState(''); const [caret, setCaret] = useState(0); const [sessMenu, setSessMenu] = useState(false); const [busy, setBusy] = useState(false)
  const [attach, setAttach] = useState<Att[]>([]); const [pop, setPop] = useState<'' | 'plus' | 'mode' | 'model' | 'effort' | 'ctx'>(''); const [pickOpen, setPickOpen] = useState(false); const [uploading, setUploading] = useState(false)
  const [queue, setQueue] = useState<string[]>([])
  const [drill, setDrill] = useState<string | null>(null)
  const [drop, setDrop] = useState<'' | 'tree' | 'files'>('')
  const [slash, setSlash] = useState<SlashCmd[]>([]); const [files, setFiles] = useState<FileNode[] | null>(null); const [sel, setSel] = useState(0); const [dismissed, setDismissed] = useState('')
  const [pinned, setPinned] = useState(false); const [atBottom, setAtBottom] = useState(true)
  const [draft, setDraft] = useState<{ model?: string; effort?: string; permissionMode?: PermissionMode }>({})
  const fileRef = useRef<HTMLInputElement>(null); const endRef = useRef<HTMLDivElement>(null); const taRef = useRef<HTMLTextAreaElement>(null); const scRef = useRef<HTMLDivElement>(null); const footRef = useRef<HTMLDivElement>(null); const colRef = useRef<HTMLDivElement>(null); const lastUserRef = useRef<HTMLDivElement | null>(null)
  const state = cur?.state ?? 'idle'; const running = state === 'running'
  const cfg = { model: cur?.model || draft.model || s.defaults.model || MODELS[0].v, effort: cur?.effort || draft.effort || s.defaults.effort || 'high', mode: (cur?.permissionMode || draft.permissionMode || 'default') as PermissionMode }
  useEffect(() => { setDrill(null); setQueue([]); setDraft({}); setPop('') }, [cur?.id])
  useEffect(() => { if (prefill) { setText((t) => (t ? `${t} ${prefill}` : prefill)); onPrefilled(); taRef.current?.focus() } }, [prefill])
  useEffect(() => { if (focusReq) taRef.current?.focus() }, [focusReq])
  useEffect(() => { if (attachReq.length) { setAttach((a) => [...a, ...attachReq.filter((r) => !a.some((x) => x.rel === r.rel))]); onAttached() } }, [attachReq])
  useEffect(() => { if (mentionReq.length) { for (const rel of mentionReq) mention(rel); onMentioned() } }, [mentionReq])
  useEffect(() => { void api<SlashCmd[]>(`/bots/${bot.id}/slash${cur?.id ? `?sid=${cur.id}` : ''}`).then(setSlash).catch(() => {}) }, [bot.id, cur?.id])
  useEffect(() => { setFiles(null) }, [bot.id, filesTick])
  const last = items[items.length - 1]
  const lastUser = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'user') return items[i] as Extract<ChatItem, { kind: 'user' }>; return null }, [items])
  const lastAssistant = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'assistant') return items[i].id; return null }, [items])
  const streaming = !!(last && (last.kind === 'assistant' || last.kind === 'thinking') && last.streaming)
  // 컴포저 높이 → 본문 아래 여백 (유리 뒤로 글이 지나가되 가려지진 않게)
  useEffect(() => { const el = footRef.current, col = colRef.current; if (!el || !col) return; const ro = new ResizeObserver(() => col.style.setProperty('--footh', `${el.offsetHeight}px`)); ro.observe(el); return () => ro.disconnect() }, [collapsed])
  // 스크롤 위치 → ↓ 버튼(맨 아래가 아닐 때) · 직전 질문 고정(원래 메시지가 헤더 위로 사라졌을 때)
  const measure = () => { const el = scRef.current; if (!el) return; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); const u = lastUserRef.current; setPinned(!!u && u.getBoundingClientRect().bottom < el.getBoundingClientRect().top + (phone ? 60 : 44)) }
  useEffect(() => { const el = scRef.current; if (!el) return; measure(); el.addEventListener('scroll', measure, { passive: true }); return () => el.removeEventListener('scroll', measure) }, [collapsed, cur?.id, phone])
  useEffect(() => { const el = scRef.current; if (atBottom && el) el.scrollTop = el.scrollHeight; measure() }, [items.length, last && (last.kind === 'assistant' || last.kind === 'thinking') ? last.text.length : 0, pending.length, cur?.activity, lastUser?.id])
  useEffect(() => { if (!pop) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.cpop, .cbtn, .ring, .plusb')) setPop('') }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(''); if (pop === 'mode' && /^[1-4]$/.test(e.key) && !(e.target as HTMLElement).matches('textarea,input')) { e.preventDefault(); void applyCfg({ permissionMode: MODES[Number(e.key) - 1].v }) } }; window.addEventListener('mousedown', off); window.addEventListener('keydown', key); return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', key) } }, [pop])
  const applyCfg = async (p: { model?: string; effort?: string; permissionMode?: PermissionMode }) => { setPop(''); if (cur) { try { await api(`/sessions/${cur.id}/settings`, { body: p }); if (cur.alive && (running || state === 'awaiting_input')) say('이 턴이 끝나면 적용돼요') } catch (e) { say((e as Error).message) } } else setDraft((d) => ({ ...d, ...p })) }
  const post = async (t: string) => { if (cur) await api(`/sessions/${cur.id}/send`, { body: { text: t } }); else { const r = await api<{ sessionId: string }>(`/bots/${bot.id}/send`, { body: { text: t, name: '메인', ...draft } }); await refreshAll(); onSession(r.sessionId) } }
  // 대기열 — 턴이 끝나면 순서대로
  useEffect(() => { if (!running && state !== 'awaiting_input' && queue.length && !busy) { const [n, ...rest] = queue; setQueue(rest); void post(n).catch((e) => say((e as Error).message)) } }, [state, queue.length, busy])
  const sendText = async (raw: string) => {
    let t = raw.trim(); if ((!t && !attach.length) || busy || uploading) return
    if (attach.length) t = `${t || '첨부한 파일을 봐 줘.'}\n\n첨부 파일 (읽어서 참고해):\n${attach.map((a) => (a.dir ? `- ${a.abs}/ (폴더 — 안의 파일들)` : `- ${a.abs}`)).join('\n')}`
    setText(''); setAttach([]); if (taRef.current) taRef.current.style.height = 'auto'
    if (running || state === 'awaiting_input') { setQueue((q) => [...q, t]); return }
    setBusy(true); try { await post(t) } catch (e) { say((e as Error).message) } finally { setBusy(false) }
  }
  const send = () => sendText(text)
  const upload = async (list: File[]) => { if (!list.length) return; setUploading(true); try { for (const f of list) { const r = await uploadFile(bot.id, f); setAttach((a) => [...a, { rel: r.rel, abs: r.abs, uploaded: true }]) } say(`${list.length}개 올렸어요 → 첨부/`) } catch (e) { say((e as Error).message) } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' } }
  const addAtt = (a: Att) => setAttach((l) => (l.some((x) => x.rel === a.rel) ? l : [...l, a]))
  const relOf = (p: string) => (p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : null)
  const rows = useMemo(() => buildRows(items, drill), [items, drill])
  const drillSub = drill ? (items.find((x) => x.id === drill) as Sub | undefined) : undefined
  // 슬래시 · @ — 캐럿 앞 토큰으로 판단
  const before = text.slice(0, caret)
  const slashQ = /^\/(\S*)$/.test(text) && dismissed !== text ? text.slice(1) : null
  const atM = dismissed !== text ? /(?:^|\s)@([^\s@]*)$/.exec(before) : null
  const atQ = atM ? atM[1] : null
  const slashList = useMemo(() => { if (slashQ === null) return []; const all = [...slash, ...BUILTIN_SLASH.filter((b) => !slash.some((x) => x.name === b.name))]; const q = slashQ.toLowerCase(); return all.filter((c) => fuzzy(q, c.name) > 0).sort((a, b) => fuzzy(q, b.name) - fuzzy(q, a.name)).slice(0, 12) }, [slashQ, slash])
  useEffect(() => { if (atQ !== null && !files) { void api<{ rel: string; dir: boolean; mtime: number; children?: unknown[] }[]>(`/bots/${bot.id}/files?depth=6`).then((tree) => { const out: FileNode[] = []; const walk = (n: typeof tree) => { for (const x of n) { out.push({ rel: x.rel, dir: x.dir, mtime: x.mtime }); if (x.children) walk(x.children as typeof tree) } }; walk(tree); setFiles(out) }).catch(() => setFiles([])) } }, [atQ, files])
  const atList = useMemo(() => { if (atQ === null || !files) return []; const q = atQ.toLowerCase(); return files.map((f) => ({ f, sc: fuzzy(q, f.rel.split('/').pop() ?? '') * 2 + fuzzy(q, f.rel) + (docTabs.includes(f.rel) ? 3 : 0) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || b.f.mtime - a.f.mtime).slice(0, 8).map((x) => x.f) }, [atQ, files, docTabs])
  useEffect(() => { setSel(0) }, [slashQ, atQ])
  const pickSlash = (c: SlashCmd) => { setDismissed(''); if (c.name === 'clear') { setText(''); void newSession(); return } if (c.name === 'context') { setText(''); setPop('ctx'); return } setText(`/${c.name} `); setCaret(c.name.length + 2); taRef.current?.focus() }
  const pickAt = (f: FileNode) => { const name = f.rel.split('/').pop() ?? f.rel; const start = caret - (atQ?.length ?? 0) - 1; const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`; setText(next); setCaret(start + name.length + 2); addAtt({ rel: f.rel, abs: `${bot.abs}/${f.rel}`, dir: f.dir }); setDismissed(''); taRef.current?.focus() }
  const mention = (rel: string) => { const name = rel.split('/').pop() ?? rel; setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${name} `); addAtt({ rel, abs: `${bot.abs}/${rel}` }); taRef.current?.focus() }
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const list: (SlashCmd | FileNode)[] = slashList.length ? slashList : atList
    if (list.length && (slashQ !== null || atQ !== null)) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => (i + 1) % list.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => (i - 1 + list.length) % list.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); const it = list[sel]; if ('name' in it) pickSlash(it); else pickAt(it); return }
      if (e.key === 'Escape') { e.preventDefault(); setDismissed(text); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }
  const hasText = !!text.trim() || attach.length > 0
  const mode: 'send' | 'queue' | 'stop' | 'off' = hasText ? (running || state === 'awaiting_input' ? 'queue' : 'send') : running ? 'stop' : 'off'
  const ctx = cur?.ctx; const pct = ctx ? Math.min(100, Math.round((ctx.used / ctx.window) * 100)) : 0
  if (collapsed) return <div className="strip" style={{ background: 'var(--bg)' }}><button className="ib" onClick={onUncollapse} title="대화 펼치기"><Icon n="sub" size={14} /></button><div className="gap" /><FolderBot color={bot.color} size={17} mood={moodOf(state, !!cur?.hibernated)} mono />{running ? <span className="pulse" style={{ marginTop: 8 }} /> : null}</div>
  const sessMenuEl = sessMenu ? <div className="menu" style={phone ? { left: 0, top: 50 } : { left: 0, top: 28 }} onClick={() => setSessMenu(false)}>{sessions.map((x) => <button key={x.id} className={x.id === cur?.id ? 'on' : ''} onClick={() => onSession(x.id)}><span className={`dot ${stateDot(x.state)}`} /><span style={{ flex: 1 }}>{x.name}</span><span className="k">{x.hibernated ? '절전' : fmtTime(x.lastActivity)}</span></button>)}<hr /><button onClick={() => void newSession()}><Icon n="plus" size={12} /><span>새 세션</span></button>{cur ? <button onClick={async () => { const n = prompt('세션 이름', cur.name); if (n) await api(`/sessions/${cur.id}/rename`, { body: { name: n } }) }}><Icon n="edit" size={12} /><span>이름 바꾸기</span></button> : null}{cur ? <button className="warn" onClick={async () => { if (confirm('이 세션 기록을 지울까요?')) { await api(`/sessions/${cur.id}`, { method: 'DELETE' }); await refreshAll() } }}><Icon n="x" size={12} /><span>세션 삭제</span></button> : null}</div> : null
  const modeBtn = <button className={`cbtn ${pop === 'mode' ? 'on' : ''}`} onClick={() => setPop(pop === 'mode' ? '' : 'mode')} title="모드">{modeLabel(cfg.mode)}<span className="chev">▾</span></button>
  const modelBtn = <button className={`cbtn ${pop === 'model' ? 'on' : ''}`} onClick={() => setPop(pop === 'model' ? '' : 'model')} title="모델">{modelLabel(cfg.model)}{phone ? <span className="chev">▾</span> : null}</button>
  const effortBtn = <button className={`cbtn ${pop === 'effort' ? 'on' : ''}`} onClick={() => setPop(pop === 'effort' ? '' : 'effort')} title="노력">{effortLabel(cfg.effort)}{phone ? <span className="chev">▾</span> : null}</button>
  const ringBtn = <button className={`ring ${pct >= 80 ? 'hot' : ''}`} onClick={() => setPop(pop === 'ctx' ? '' : 'ctx')} title={ctx ? `컨텍스트 ${pct}%` : '컨텍스트'}><Ring pct={pct} size={phone ? 20 : 18} />{pct >= 80 && !phone ? <span style={{ fontSize: 11.5, marginLeft: 4 }}>압축</span> : null}</button>
  const plusBtn = <button className={phone ? 'plusb' : `cbtn ${pop === 'plus' ? 'on' : ''}`} style={phone ? undefined : { padding: '3px 6px' }} title="첨부" onClick={() => setPop(pop === 'plus' ? '' : 'plus')} disabled={uploading}><Icon n="plus" size={phone ? 20 : 14} /></button>
  const sendBtn = mode === 'stop' ? <button className="sendb" onClick={() => cur && api(`/sessions/${cur.id}/interrupt`, { body: {} })} title="중단"><Icon n="stop" size={phone ? 14 : 11} /></button>
    : mode === 'off' && phone ? <span className="sendb mic"><Icon n="mic" size={20} /></span>
      : <button className={`sendb ${mode === 'off' ? 'off' : ''}`} onClick={send} disabled={mode === 'off' || busy || uploading} title={mode === 'queue' ? '대기열에 넣기' : '보내기'}><Icon n="up" size={phone ? 16 : 12} />{mode === 'queue' ? <span className="bd">+{queue.length + 1}</span> : null}</button>
  const popEl = pop === 'mode' ? <div className="cpop"><div className="h">모드 · 이 세션</div>{MODES.map((m, i) => <button key={m.v} className={`prow2 ${cfg.mode === m.v ? 'on' : ''}`} onClick={() => void applyCfg({ permissionMode: m.v })}><div className="t"><b>{m.t}</b><small>{m.d}</small></div>{cfg.mode === m.v ? <Icon n="check" size={13} /> : <span className="k">{i + 1}</span>}</button>)}<div className="hint"><span>1~4</span><span className="sp" /><span>새 세션은 설정의 기본값으로</span></div></div>
    : pop === 'model' ? <div className="cpop r"><div className="h">모델 · 이 세션</div>{MODELS.map((m, i) => <button key={m.v} className={`prow2 ${cfg.model === m.v ? 'on' : ''}`} onClick={() => void applyCfg({ model: m.v })}><div className="t"><b>{m.t}</b>{m.d ? <small>{m.d}</small> : null}</div>{cfg.model === m.v ? <Icon n="check" size={13} /> : <span className="k">{i + 1}</span>}</button>)}<div className="hint"><span>바꾸면 이 세션을 이어서 재시작해요 (대화 유지)</span></div></div>
    : pop === 'effort' ? <div className="cpop r"><div className="effort"><div className="top"><span style={{ color: 'var(--t3)', fontSize: 12.5 }}>노력</span><b>{effortLabel(cfg.effort)}</b></div><div className="lbl"><span>더 빠르게</span><span>더 스마트하게</span></div><input type="range" min={0} max={4} step={1} value={Math.max(0, EFFORTS.findIndex((e) => e.v === cfg.effort))} onChange={(e) => { const v = EFFORTS[Number(e.target.value)].v; if (v !== cfg.effort) void (async () => { if (cur) { try { await api(`/sessions/${cur.id}/settings`, { body: { effort: v } }) } catch (er) { say((er as Error).message) } } else setDraft((d) => ({ ...d, effort: v })) })() }} /><div className="steps">{EFFORTS.map((e) => <span key={e.v}>{e.t}</span>)}</div></div><div className="hint"><span>다음 턴부터 적용 · 기본값은 설정에서</span></div></div>
    : pop === 'ctx' ? <div className="cpop r ctxpop"><div className="big"><Ring pct={pct} size={40} stroke={3} /><div><b>컨텍스트 {ctx ? `${pct}%` : '—'}</b><small>{ctx ? `${fmtK(ctx.used)} / ${fmtK(ctx.window)} 토큰 · 이 세션` : '첫 답이 오면 잽니다'}</small></div></div><hr /><button className="prow2" onClick={() => { setPop(''); void sendText('/compact') }}><div className="t"><b>/compact 압축</b><small>대화를 요약해 컨텍스트를 줄여요</small></div></button><div className="hint"><span>80% 를 넘으면 링이 주황</span></div></div>
    : pop === 'plus' ? <div className="cpop plus"><button className="prow2" onClick={() => { setPop(''); fileRef.current?.click() }}><Icon n="phone" size={14} color="var(--t3)" /><div className="t"><b>이 기기에서 파일 올리기</b></div><span className="k">→ 첨부/</span></button><button className="prow2" onClick={() => { setPop(''); setPickOpen(true) }}><Icon n="folder" size={14} color="var(--t3)" /><div className="t"><b>{bot.orchestrator ? '볼트' : '이 폴더'}에서 고르기</b></div></button>{docTabs.length ? <button className="prow2" onClick={() => { setPop(''); for (const rel of docTabs) addAtt({ rel, abs: `${bot.abs}/${rel}` }) }}><Icon n="doc" size={14} color="var(--t3)" /><div className="t"><b>열린 문서 첨부 ({docTabs.length})</b></div></button> : null}<hr /><button className="prow2" onClick={() => { setPop(''); setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@`); setCaret(text.length + 1); taRef.current?.focus() }}><span className="mono" style={{ width: 14, textAlign: 'center', color: 'var(--t3)' }}>@</span><div className="t"><b>@ 로 이름 쳐서 넣기</b></div></button><div className="hint"><span>스크린샷은 ⌘V 로 붙여 넣으면 첨부/ 에 저장</span></div></div>
    : slashQ !== null && slashList.length ? <div className="cpop">{(['skill', 'cli'] as const).map((grp) => { const l = slashList.filter((c) => (grp === 'skill' ? c.kind !== 'cli' : c.kind === 'cli')); return l.length ? <div key={grp}><div className="h">{grp === 'skill' ? '스킬 · 이 폴더' : '명령'}</div>{l.map((c) => { const i = slashList.indexOf(c); return <button key={c.name} className={`prow2 ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pickSlash(c)}><div className="t"><b>/{c.name}</b>{c.desc ? <small>{c.desc}</small> : null}</div>{i === sel ? <span className="k">⏎</span> : c.scope !== 'cli' && c.scope !== 'folder' ? <span className="k">{c.scope}</span> : null}</button> })}</div> : null })}<div className="hint"><span>↑↓ 이동</span><span>Tab · ⏎ 선택</span><span>⎋ 닫기</span><span className="sp" /><span>{slashList.length}개</span></div></div>
    : atQ !== null && atList.length ? <div className="cpop"><div className="h">{docTabs.length ? '열린 문서 먼저 · ' : ''}이 폴더{atQ ? ` · «${atQ}»` : ''}</div>{atList.map((f, i) => { const name = f.rel.split('/').pop() ?? f.rel; const dir = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) + '/' : ''; return <button key={f.rel} className={`prow2 ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pickAt(f)}><Icon n={f.dir ? 'folder' : 'doc'} size={14} color="var(--t3)" /><div className="t"><b>{name}</b><small>{f.dir ? `폴더째${dir ? ` · ${dir}` : ''}` : dir || (docTabs.includes(f.rel) ? '열림' : '')}</small></div>{i === sel ? <span className="k">⏎</span> : null}</button> })}<div className="hint"><span>↑↓ 이동</span><span>⏎ 넣기</span><span className="sp" /><span>이름 · 경로로 찾음</span></div></div>
    : null
  return <div className="col chat" style={{ flex: 1 }} ref={colRef}>
    <div className={`hdr chat-hdr ${phone ? '' : 'glass'}`}>
      {phone ? <><button className="rb glassb" onClick={drillSub ? () => setDrill(null) : onBack} title="뒤로"><Icon n="back" size={20} /></button>
        <span style={{ position: 'relative', minWidth: 0 }}><button className="bpill glassb" onClick={() => setSessMenu(!sessMenu)}><FolderBot color={bot.color} size={26} mood={moodOf(state, !!cur?.hibernated)} mono /><b>{drillSub ? drillSub.name : bot.name}</b>{stateDot(state) !== 'none' ? <span className={`dot ${stateDot(state)}`} style={{ width: 7, height: 7 }} /> : null}</button>{sessMenuEl}</span>
        <span className="sp" /><button className="rb glassb" onClick={onPanel} title="이 폴더에서"><Icon n="folder" size={20} /></button></>
        : drillSub ? <><button className="ib" onClick={() => setDrill(null)} title="메인 대화로"><Icon n="back" size={14} /></button><span style={{ color: 'var(--t3)' }}>/</span><span className="ttl">{drillSub.name}</span>{drillSub.status === 'run' ? <span className="spin run" /> : <Icon n={drillSub.status === 'error' ? 'x' : 'check'} size={11} color={drillSub.status === 'error' ? 'var(--err)' : 'var(--done)'} />}<span style={{ color: 'var(--t3)', fontSize: 12, whiteSpace: 'nowrap' }}>도구 {drillSub.tools}</span><span className="sp" /></>
          : <><FolderBot color={bot.color} size={16} mood={moodOf(state, !!cur?.hibernated)} mono /><span className="ttl">{bot.name}</span>
            <span style={{ position: 'relative', flex: 'none' }}><button onClick={() => setSessMenu(!sessMenu)} style={{ color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>{cur?.name ?? '새 대화'} <Icon n="chevd" size={10} /></button>{sessMenuEl}</span>
            <span className={`dot ${stateDot(state)}`} /><span className="sp" />
            <div className="acts"><button className={`ib ${docOn ? 'on' : ''}`} onClick={onDocToggle} title="문서 열 (⌘⇧D)"><Icon n="doc" size={14} />{!docOn && docBadge ? <span className="bd">{docBadge}</span> : null}</button></div></>}
    </div>
    {pinned && lastUser && !drill ? <button className="pinq glassb" onClick={() => lastUserRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })} title="직전 질문으로">{lastUser.text}</button> : null}
    <div className="chat-scroll" ref={scRef}>
      <div className="chat-body">
        {!cur && !drill ? <div className="empty" style={{ flex: 1 }}><FolderBot color={bot.color} size={40} mood="idle" /><div><b>{bot.name}</b>{bot.orchestrator ? ' — 볼트 전체를 보는 관제 봇이에요. "지금 뭐 돌고 있어?", "Inbox 정리해 줘", "X 폴더에서 시작해".' : ' 봇이에요. 이 폴더의 지침·기억·자료를 들고 일해요.'}</div></div> : null}
        {drillSub ? <div className="drill-p"><div className="meta" style={{ cursor: 'default' }}>무엇을 시켰나</div><div className="tx">{drillSub.prompt || drillSub.name}</div><hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} /></div> : null}
        {rows.map((r) => r.k === 'group' ? <ToolGroup key={r.items[0].id} items={r.items} base={bot.abs} onFile={(p) => { const rel = relOf(p); if (rel) onFile(rel) }} />
          : <Item key={r.it.id} it={r.it} bot={bot} items={items} onFile={(p) => { const rel = relOf(p); if (rel) onFile(rel) }} onDrill={(id) => setDrill(id)} state={state} say={say} isLastAssistant={r.it.id === lastAssistant} isLastUser={r.it.id === lastUser?.id} userRef={lastUserRef} onRetry={lastUser ? () => void sendText(lastUser.text) : undefined} />)}
        {cur && !drill ? pending.map((p) => <PermCard key={p.requestId} p={p} sid={cur.id} />) : null}
        <div style={{ flex: 1 }} />
        {cur && (running || state === 'awaiting_input') ? <Live cur={cur} state={state} /> : null}
        <div ref={endRef} />
      </div>
    </div>
    {!atBottom ? <button className="tobot rb glassb" onClick={() => { const el = scRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }} title="최근으로"><Icon n="chevd" size={16} />{streaming ? <span className="dot run" /> : null}</button> : null}
    <div className="chat-foot" ref={footRef}>
      {queue.map((q, i) => <div key={i} className="queue"><span>대기 {i + 1}</span><span className="tx">{q}</span><button onClick={() => setQueue(queue.filter((_, k) => k !== i))} style={{ color: 'var(--t3)', display: 'inline-flex' }}><Icon n="x" size={11} /></button></div>)}
      {attach.length ? <div className="files">{attach.map((a) => <span key={a.rel} className="chip" title={a.abs}><Icon n={a.dir ? 'folder' : 'doc'} size={11} color="var(--t3)" /><span>{a.rel}{a.dir ? '/' : ''}</span><button onClick={() => setAttach(attach.filter((x) => x.rel !== a.rel))} style={{ color: 'var(--t3)', display: 'inline-flex' }}><Icon n="x" size={10} /></button></span>)}<span style={{ fontSize: 11, color: 'var(--t3)', alignSelf: 'center' }}>{attach.length}개 · 봇이 읽어서 참고</span></div> : null}
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
      {phone ? <div className="cchips">{modeBtn}{modelBtn}{effortBtn}</div> : null}
      <div className={`composer glassb ${drop ? 'drop' : ''} ${text.includes('\n') || text.length > 40 ? 'multi' : ''}`}
        onDragOver={(e) => { const t = e.dataTransfer.types; if (t.includes('text/x-fb-rel')) { e.preventDefault(); setDrop('tree') } else if (t.includes('Files')) { e.preventDefault(); setDrop('files') } }}
        onDragLeave={() => setDrop('')}
        onDrop={(e) => { setDrop(''); const rel = e.dataTransfer.getData('text/x-fb-rel'); if (rel) { e.preventDefault(); addAtt({ rel, abs: `${bot.abs}/${rel}`, dir: e.dataTransfer.getData('text/x-fb-dir') === '1' }); return } if (e.dataTransfer.files.length) { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)) } }}
        onPaste={(e) => { const imgs = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f); if (imgs.length) { e.preventDefault(); const d = new Date(); void upload(imgs.map((f, i) => new File([f], `스크린샷_${d.getHours()}${String(d.getMinutes()).padStart(2, '0')}${i ? `-${i + 1}` : ''}.${(f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')}`, { type: f.type }))) } }}>
        {popEl}
        {drop ? <div className="drophint"><Icon n="plus" size={13} />{drop === 'files' ? '놓으면 첨부/ 에 복사하고 첨부' : '놓으면 첨부'}</div> : null}
        <div className="crow">
          {phone ? plusBtn : null}
          <textarea ref={taRef} rows={1} placeholder={drill ? '메인 대화로 보냅니다 — 이 안에는 직접 말을 걸 수 없어요' : running ? '⏎ 로 대기열에 넣습니다' : state === 'awaiting_input' ? '답을 기다리는 중 — 보내면 대기열에' : '메시지…  / 스킬 · @ 파일'} value={text} onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px` }} onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)} onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)} onKeyDown={onKey} />
          {phone ? <>{ringBtn}{sendBtn}</> : null}
        </div>
        {!phone ? <div className="cbar">{modeBtn}{plusBtn}<span className="sp" />{modelBtn}{effortBtn}{ringBtn}{sendBtn}</div> : null}
      </div>
      {!phone ? <div className="cfoot"><span className={`dot ${cur?.alive || running ? 'done' : 'none'}`} style={{ width: 5, height: 5 }} /><span>{cur?.hibernated && !running ? 'Mac mini · 절전 (첫 답이 몇 초 늦어요)' : 'Mac mini'}</span>{cur?.restartPending ? <span>· 턴이 끝나면 새 설정으로 재시작</span> : null}<span className="sp" />{uploading ? <span>올리는 중…</span> : null}</div> : null}
    </div>
    {pickOpen ? <FilePickModal bot={bot} onClose={() => setPickOpen(false)} onPick={(rel) => { addAtt({ rel, abs: `${bot.abs}/${rel}` }); setPickOpen(false) }} /> : null}
  </div>
}

function Ring({ pct, size = 18, stroke = 2 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }}><circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line2)" strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" strokeDasharray={`${(c * Math.max(0, pct)) / 100} ${c}`} strokeLinecap="round" /></svg>
}

function Live({ cur, state }: { cur: SessionInfo; state: string }) {
  if (state === 'awaiting_input') return <div className="live"><span className="glow" /><span className="tx">확인 대기 — 위 요청에 응답해 주세요</span><span className="el"><Elapsed from={cur.turnStartedAt} /></span></div>
  const a = cur.activity || '일하는 중'; const think = a.startsWith('생각 중 · ')
  return <div className="live"><span className="pulse" /><span className="tx">{think ? '생각 중' : a}</span>{think ? <span className="th">— {a.slice(6)}</span> : null}<span className="el"><Elapsed from={cur.turnStartedAt} /></span><button className="stop" onClick={() => api(`/sessions/${cur.id}/interrupt`, { body: {} })}>중단</button></div>
}

function Item({ it, bot, items, onFile, onDrill, state, say, isLastAssistant, isLastUser, userRef, onRetry }: { it: ChatItem; bot: Bot; items: ChatItem[]; onFile: (p: string) => void; onDrill: (id: string) => void; state: string; say: (m: string) => void; isLastAssistant: boolean; isLastUser: boolean; userRef: React.MutableRefObject<HTMLDivElement | null>; onRetry?: () => void }) {
  const [open, setOpen] = useState(false)
  switch (it.kind) {
    case 'user': return <div className={`umsg ${isLastUser ? 'last' : ''}`} ref={isLastUser ? userRef : undefined}>{it.text}</div>
    case 'assistant': return <div><Md text={it.text || ' '} streaming={!!it.streaming} />{!it.streaming && isLastAssistant ? <div className="acts-row"><button onClick={() => { navigator.clipboard?.writeText(it.text); say('복사했어요') }} title="복사"><Icon n="doc" size={13} />복사</button>{onRetry && state !== 'running' ? <button onClick={onRetry} title="같은 질문 다시"><Icon n="undo" size={13} />다시</button> : null}<span>{fmtTime(it.t)}</span></div> : null}</div>
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
