import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bot, ChatItem, NotifyEvent, PermissionRequest, SessionInfo, TodoItem } from '../core/types'
import { STATE_LABEL } from '../core/types'
import { api, setToken, token, uploadFile } from './api'
import { FolderBot, Icon, moodOf, type Mood } from './FolderBot'
import { FileSheet, FolderPicker, Md, NotifyCenter, Onboarding, Pairing, RoutineSheet, Settings, TodoRow, TodoSheet, useToast } from './Sheets'
import { fmtDate, fmtTime, useStore } from './store'

const STATE_COLOR = { idle: 'var(--faint)', running: 'var(--running)', awaiting_input: 'var(--awaiting)', done: 'var(--done)', error: 'var(--error)' } as const
type Sort = 'wait' | 'recent' | 'name' | 'para'

function useHash(): [Record<string, string>, (p: Record<string, string>) => void] {
  const parse = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)))
  const [h, setH] = useState<Record<string, string>>(parse)
  useEffect(() => { const f = () => setH(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return [h, (p) => { location.hash = new URLSearchParams(p).toString() }]
}

export function App() {
  const { s, refresh } = useStore()
  // 호스트 앱(같은 맥)이 #token=… 으로 열면 페어링 없이 저장
  const [authed, setAuthed] = useState(() => { const h = new URLSearchParams(location.hash.slice(1)); const t = h.get('token'); if (t) { setToken(t); h.delete('token'); location.hash = h.toString(); location.reload() } return !!token() })
  useEffect(() => { const f = () => setAuthed(false); window.addEventListener('fb:authlost', f); return () => window.removeEventListener('fb:authlost', f) }, [])
  if (!authed) return <div className="app"><Pairing onDone={() => location.reload()} /></div>
  if (!s.loaded) return <div className="app"><div className="empty"><FolderBot color="#e08850" size={48} mood="work" />Mac mini 에 연결하는 중…</div></div>
  if (!s.rulesInstalled) return <div className="app"><Onboarding /></div>
  return <Main />
}

function botSummary(bot: Bot, sessions: SessionInfo[], notif: NotifyEvent[]): { state: keyof typeof STATE_COLOR | null; text: string; t: number; mood: Mood } {
  const wait = sessions.find((x) => x.state === 'awaiting_input'); const run = sessions.find((x) => x.state === 'running')
  const top = wait ?? run ?? sessions[0]
  const last = notif.find((n) => n.botId === bot.id)
  const state = top?.state ?? null
  const text = wait ? `확인해 주세요 · ${wait.pending[0]?.displayName ?? wait.name}` : run ? `일하는 중 · ${run.name}` : last ? last.body : top ? `${STATE_LABEL[top.state]}${top.hibernated ? ' · 휴면' : ''} · ${top.name}` : '메시지를 보내 보세요'
  return { state, text, t: Math.max(top?.lastActivity ?? bot.startedAt, last?.t ?? 0), mood: moodOf(state, !!top?.hibernated && !run && !wait) }
}

function Main() {
  const { s, refresh, loadChat, loadTodo } = useStore()
  const [hash, setHash] = useHash()
  const botId = hash.bot || 'orch'
  const bot = s.bots.find((b) => b.id === botId) ?? s.bots[0]
  const sessions = s.sessionsByBot[bot?.id ?? ''] ?? []
  const sessionId = hash.s && sessions.some((x) => x.id === hash.s) ? hash.s : sessions[0]?.id
  const [view, setView] = useState<'list' | 'chat'>(hash.bot ? 'chat' : 'list')
  const [sheet, setSheet] = useState<{ kind: 'file'; rel: string } | { kind: 'todo' } | { kind: 'routines' } | null>(null)
  const [modal, setModal] = useState<'picker' | 'notify' | 'settings' | null>(null)
  const [rpOpen, setRpOpen] = useState(false)
  const [sbW, setSbW] = useState<number>(() => Number(localStorage.getItem('fb:sbw') ?? 292))
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('fb:sbc') === '1')
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem('fb:sort') as Sort) || 'wait')
  const [group, setGroup] = useState(() => localStorage.getItem('fb:group') !== '0')
  const [dense, setDense] = useState(() => localStorage.getItem('fb:dense') === '1')
  const [collapsedSecs, setCollapsedSecs] = useState<Record<string, boolean>>({})
  const [sortMenu, setSortMenu] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [toast, say] = useToast()
  const [composerPrefill, setPrefill] = useState('')
  useEffect(() => { if (sessionId && !s.chats[sessionId]) void loadChat(sessionId) }, [sessionId])
  useEffect(() => { if (bot) void loadTodo(bot.id) }, [bot?.id, s.filesTick[bot?.id ?? '']])
  useEffect(() => { localStorage.setItem('fb:sbw', String(sbW)); localStorage.setItem('fb:sbc', collapsed ? '1' : '0'); localStorage.setItem('fb:sort', sort); localStorage.setItem('fb:group', group ? '1' : '0'); localStorage.setItem('fb:dense', dense ? '1' : '0') }, [sbW, collapsed, sort, group, dense])
  const go = (b: string, sid?: string) => { setHash(sid ? { bot: b, s: sid } : { bot: b }); setView('chat') }
  const unread = s.notifications.filter((n) => !n.read).length
  const waiting = s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length

  // 목록 정렬·묶기
  const rows = useMemo(() => {
    const items = s.bots.map((b) => ({ b, sum: botSummary(b, s.sessionsByBot[b.id] ?? [], s.notifications) }))
    const rank = (st: string | null) => (st === 'awaiting_input' ? 0 : st === 'running' ? 1 : st === 'done' ? 2 : 3)
    const cmp = (a: typeof items[0], c: typeof items[0]) => {
      if (a.b.orchestrator !== c.b.orchestrator) return a.b.orchestrator ? -1 : 1
      if (sort === 'wait') { const d = rank(a.sum.state) - rank(c.sum.state); if (d) return d }
      if (sort === 'name') return a.b.name.localeCompare(c.b.name, 'ko')
      if (sort === 'para') return a.b.rel.localeCompare(c.b.rel, 'ko')
      return c.sum.t - a.sum.t
    }
    items.sort(cmp)
    if (!group) return [{ sec: '', items }]
    const m = new Map<string, typeof items>()
    for (const it of items) { const k = it.b.section; (m.get(k) ?? m.set(k, []).get(k)!).push(it) }
    return [...m.entries()].map(([sec, items]) => ({ sec, items }))
  }, [s.bots, s.sessionsByBot, s.notifications, sort, group])

  const onDrag = (e: React.PointerEvent) => { e.preventDefault(); setDragging(true); const x0 = e.clientX, w0 = sbW; const mv = (ev: PointerEvent) => { const w = Math.round(w0 + ev.clientX - x0); if (w < 120) { setCollapsed(true) } else { setCollapsed(false); setSbW(Math.min(420, Math.max(240, w))) } }; const up = () => { setDragging(false); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up) }

  if (!bot) return <div className="app"><div className="empty">봇이 없어요</div></div>
  const items = sessionId ? (s.chats[sessionId] ?? []) : []
  const pending = sessionId ? (s.pending[sessionId] ?? []) : []
  const cur = sessions.find((x) => x.id === sessionId)
  const todos = (s.todos[bot.id] ?? []).filter((t) => !t.done)

  return <div className={`app ${dragging ? 'dragging' : ''}`} data-view={view}>
    {s.online === 'off' ? <div className="offline">Mac mini 와 다시 연결하는 중… 저장된 메시지를 보여 주고 있어요</div> : null}
    {s.auth.verdict === 'unreadable' || s.auth.verdict === 'loggedout' ? <div className="banner"><Icon n="warn" size={15} /><span><strong>Mac mini 에서 Claude 로그인이 필요해요.</strong> {s.auth.verdict === 'unreadable' ? '토큰은 살아 있는데 이 문맥에서 못 읽어요 — ' : ''}Jump Desktop → 터미널 → <span className="mono">claude</span> → <span className="mono">/login</span>. 지시는 대기열에 두고 복구되면 이어서 해요.</span><span style={{ marginLeft: 'auto' }} /><button className="btn primary" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button></div> : null}
    <div className="body">
      {/* ── 왼쪽 ── */}
      <div className={`sb ${collapsed ? 'collapsed' : ''} ${dense ? 'dense' : ''}`} style={{ ['--sb-w' as string]: `${sbW}px` }}>
        <div className="sb-handle" onPointerDown={onDrag} onDoubleClick={() => setCollapsed(!collapsed)} />
        <div className="sb-head"><div className="sb-title"><FolderBot color="#e08850" size={22} mood={waiting ? 'wait' : 'idle'} /><span>Folder Bot</span></div><button className="iconbtn mob-hide" onClick={() => setModal('settings')} title="설정"><Icon n="gear" size={14} /></button></div>
        <button className="sb-start" onClick={() => setModal('picker')}><Icon n="fplus" size={16} color="var(--accent)" /><span>폴더 선택 · 에이전트 시작</span><span className="n">후보 {s.candidates.filter((c) => !c.active).length}</span></button>
        <div className="sb-tools" style={{ position: 'relative' }}><button className="sel" onClick={() => setSortMenu(!sortMenu)}>{({ wait: '확인 대기 먼저', recent: '최근 활동', name: '이름', para: 'PARA 순' })[sort]} <Icon n="chevd" size={11} /></button><span style={{ flex: 1 }} /><span>활성 {s.bots.length - 1}</span>{waiting ? <span style={{ color: 'var(--awaiting)' }}>· 대기 {waiting}</span> : null}
          {sortMenu ? <div className="menu" style={{ left: 0, top: 30 }}><div className="h">정렬</div>{(['wait', 'recent', 'name', 'para'] as Sort[]).map((k) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => { setSort(k); setSortMenu(false) }}><span style={{ flex: 1 }}>{({ wait: '확인 대기 먼저, 그다음 최근 활동', recent: '최근 활동', name: '이름', para: 'PARA 순서' })[k]}</span>{sort === k ? <Icon n="check" size={13} color="var(--accent)" /> : null}</button>)}<div className="h">묶기</div><button className={group ? 'on' : ''} onClick={() => setGroup(true)}><span style={{ flex: 1 }}>PARA 범주별 (접기 가능)</span></button><button className={!group ? 'on' : ''} onClick={() => setGroup(false)}><span style={{ flex: 1 }}>묶지 않기</span></button><div className="h">밀도</div><div style={{ display: 'flex', gap: 6, padding: '2px 8px 6px' }}><button className={`btn ${!dense ? 'primary' : ''}`} onClick={() => setDense(false)}>보통</button><button className={`btn ${dense ? 'primary' : ''}`} onClick={() => setDense(true)}>촘촘</button></div>{s.bots.length - 1 > s.botLimit ? <div className="h" style={{ color: 'var(--awaiting)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>활성 {s.bots.length - 1} / 상한 {s.botLimit} — 휴면 봇을 은퇴시키면 가벼워져요</div> : null}</div> : null}</div>
        <div className="sb-list" onClick={() => sortMenu && setSortMenu(false)}>
          {rows.map(({ sec, items }) => <div key={sec}>
            {sec ? <button className="sec" onClick={() => setCollapsedSecs({ ...collapsedSecs, [sec]: !collapsedSecs[sec] })}><Icon n={collapsedSecs[sec] ? 'chev' : 'chevd'} size={10} /><span>{sec.toUpperCase()}</span><span className="n">{items.length}</span></button> : null}
            {!collapsedSecs[sec] ? items.map(({ b, sum }) => <button key={b.id} className={`row ${b.id === bot.id && view === 'chat' ? 'on' : ''}`} style={{ ['--c' as string]: b.color }} onClick={() => go(b.id)} title={b.rel || '루트'}><FolderBot color={b.color} size={dense ? 28 : 38} mood={sum.mood} /><span className="st dot" style={{ background: STATE_COLOR[sum.state ?? 'idle'], display: collapsed ? 'inline-block' : 'none' }} /><div className="txt"><div className="l1"><b>{b.name}</b><time>{fmtTime(sum.t)}</time></div><div className="l2"><span className="dot" style={{ background: STATE_COLOR[sum.state ?? 'idle'] }} /><span>{sum.text}</span></div></div></button>) : null}
          </div>)}
        </div>
        <div className="sb-foot">
          <button onClick={() => setModal('notify')}><Icon n="bell" size={16} /><span>알림</span>{unread ? <span className="badge">{unread}</span> : null}</button>
          <button onClick={() => setModal('settings')}><span className="dot" style={{ background: s.online === 'on' ? 'var(--done)' : 'var(--faint)', width: 9, height: 9 }} /><span>{s.online === 'on' ? 'Mac mini 연결됨' : '연결 끊김'}</span>{s.inbox ? <span className="badge" style={{ background: 'var(--elev)', color: 'var(--dim)' }}>Inbox {s.inbox}</span> : null}</button>
        </div>
      </div>

      {/* ── 가운데 ── */}
      <Chat bot={bot} sessions={sessions} cur={cur} items={items} pending={pending} prefill={composerPrefill} onPrefilled={() => setPrefill('')} onBack={() => setView('list')} onSession={(sid) => go(bot.id, sid)} onFile={(rel) => setSheet({ kind: 'file', rel })} onRp={() => setRpOpen(!rpOpen)} say={say} refreshAll={refresh} />

      {/* ── 오른쪽 ── */}
      <div className={`rp ${rpOpen ? 'open' : ''}`}>
        <div className="rp-h"><span>{bot.orchestrator ? '이 볼트에서' : '이 폴더에서'}</span><span className="acts"><button className="iconbtn" onClick={() => setRpOpen(false)} title="닫기"><Icon n="collapse" size={15} /></button></span></div>
        <div className="rp-sec" style={{ borderTop: 0 }}><div className="t">세션 {sessions.length}<span className="r"><button onClick={async () => { const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}` } }); await refresh(); go(bot.id, info.id) }} style={{ color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="plus" size={12} />새 세션</button></span></div>
          {sessions.map((x) => <button key={x.id} className={`srow ${x.id === sessionId ? 'on' : ''}`} onClick={() => go(bot.id, x.id)}><span className="dot" style={{ background: STATE_COLOR[x.state] }} /><span className="n">{x.name}</span><time>{x.hibernated ? '휴면' : x.state === 'running' ? '일하는 중' : fmtTime(x.lastActivity)}</time></button>)}
        </div>
        {!bot.orchestrator ? <div className="rp-sec"><div className="t">할 일 · 미완료 {todos.length}<span className="r"><button onClick={() => setSheet({ kind: 'todo' })} style={{ color: 'var(--dim)' }}><Icon n="open" size={12} /></button></span></div>
          {todos.slice(0, 4).map((t) => <TodoRow key={t.line} t={t} onToggle={() => api(`/bots/${bot.id}/todo/toggle`, { body: { line: t.line, done: true } }).then(() => loadTodo(bot.id))} onDelegate={() => setPrefill(`${t.title}${t.desc ? ` — ${t.desc}` : ''}`)} />)}
          <button className="kv" onClick={() => setSheet({ kind: 'todo' })}><Icon n="plus" size={12} /><span className="n">할 일 추가 — 제목: 설명</span></button></div> : <InboxPanel onSend={(t) => setPrefill(t)} />}
        <RecentFiles bot={bot} tick={s.filesTick[bot.id]} onOpen={(rel) => setSheet({ kind: 'file', rel })} />
        <div className="rp-sec"><button className="kv" onClick={() => setSheet({ kind: 'routines' })}><Icon n="clock" size={14} /><span className="n">루틴 {bot.routines.length}{bot.routines.length ? ` · ${bot.routines.map((r) => r.name).join(' · ')}` : ''}</span><Icon n="chev" size={12} /></button>
          {!bot.orchestrator ? <BotMenu bot={bot} onDone={async () => { await refresh(); go('orch') }} say={say} /> : null}</div>
      </div>
    </div>
    {sheet?.kind === 'file' ? <FileSheet bot={bot} rel={sheet.rel} onClose={() => setSheet(null)} onTalk={(rel) => { setPrefill(`${rel} 파일 봐 줘: `); setSheet(null) }} /> : null}
    {sheet?.kind === 'todo' ? <TodoSheet bot={bot} onClose={() => setSheet(null)} onDelegate={(t: TodoItem) => { setPrefill(`${t.title}${t.desc ? ` — ${t.desc}` : ''}`); setSheet(null) }} /> : null}
    {sheet?.kind === 'routines' ? <RoutineSheet bot={bot} onClose={() => setSheet(null)} /> : null}
    {modal === 'picker' ? <FolderPicker onClose={() => setModal(null)} onStarted={(b) => { setModal(null); go(b.id); say(`${b.name} 에서 시작했어요`) }} /> : null}
    {modal === 'notify' ? <NotifyCenter onClose={() => setModal(null)} onJump={(n) => { setModal(null); api('/notifications/read', { body: { ids: [n.id] } }).then(refresh); go(n.botId, n.sessionId) }} /> : null}
    {modal === 'settings' ? <Settings onClose={() => setModal(null)} /> : null}
    {toast ? <div className="toast">{toast}</div> : null}
  </div>
}

function BotMenu({ bot, onDone, say }: { bot: Bot; onDone: () => void; say: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  return <div style={{ position: 'relative' }}><button className="kv" onClick={() => setOpen(!open)}><Icon n="more" size={14} /><span className="n">이 봇 · 정지 · 은퇴</span></button>
    {open ? <div className="menu" style={{ right: 8, bottom: 40 }}>
      <button onClick={async () => { await api(`/bots/${bot.id}/stop`, { body: {} }); say(`${bot.name} 정지(휴면)`); onDone() }}><Icon n="pause" size={14} /><span style={{ flex: 1 }}>정지 (휴면)</span><span style={{ fontSize: 11, color: 'var(--faint)' }}>기록 유지</span></button>
      <button className="warn" onClick={async () => { if (!confirm(`${bot.name} 을 Archive 로 옮기고 은퇴시킬까요? 세션 기록은 보관돼요.`)) return; try { await api(`/bots/${bot.id}/retire`, { body: {} }); say('옮기고 은퇴했어요'); onDone() } catch (e) { say((e as Error).message) } }}><Icon n="archive" size={14} /><span style={{ flex: 1 }}>Archive 로 이동 (은퇴)</span></button>
    </div> : null}</div>
}

function InboxPanel({ onSend }: { onSend: (t: string) => void }) {
  const { s } = useStore()
  const [items, setItems] = useState<{ rel: string; name: string; dir: boolean; mtime: number }[]>([])
  useEffect(() => { void api<typeof items>('/inbox').then(setItems) }, [s.inbox])
  return <div className="rp-sec"><div className="t">Inbox · {items.length}{items.length ? <span className="r"><button style={{ color: 'var(--accent)' }} onClick={() => onSend('Inbox 를 규칙대로 정리해 줘. 어디로 옮길지 먼저 제안해.')}>정리 제안 받기</button></span> : null}</div>
    {items.length ? items.slice(0, 8).map((i) => <div key={i.rel} className="frow"><Icon n={i.dir ? 'folder' : 'file'} size={13} color={i.dir ? 'var(--faint)' : 'var(--tool-read)'} /><span className="n">{i.name}</span><time>{fmtTime(i.mtime)}</time></div>) : <div className="kv" style={{ color: 'var(--faint)' }}>정리할 게 없어요</div>}</div>
}

function RecentFiles({ bot, tick, onOpen }: { bot: Bot; tick?: number; onOpen: (rel: string) => void }) {
  const [files, setFiles] = useState<{ name: string; rel: string; mtime: number }[]>([])
  useEffect(() => { void api<typeof files>(`/bots/${bot.id}/recent`).then(setFiles).catch(() => setFiles([])) }, [bot.id, tick])
  return <div className="rp-sec"><div className="t">파일 · 최근 변경순</div>{files.map((f) => <button key={f.rel} className="frow" onClick={() => onOpen(f.rel)}><Icon n="file" size={13} color="var(--tool-read)" /><span className="n">{f.rel}</span><time>{fmtTime(f.mtime)}</time></button>)}{!files.length ? <div className="kv" style={{ color: 'var(--faint)' }}>아직 파일이 없어요</div> : null}</div>
}

/* ── 대화 ───────────────────────────────────────────────────────────────── */
function Chat({ bot, sessions, cur, items, pending, prefill, onPrefilled, onBack, onSession, onFile, onRp, say, refreshAll }: { bot: Bot; sessions: SessionInfo[]; cur?: SessionInfo; items: ChatItem[]; pending: PermissionRequest[]; prefill: string; onPrefilled: () => void; onBack: () => void; onSession: (sid: string) => void; onFile: (rel: string) => void; onRp: () => void; say: (m: string) => void; refreshAll: () => Promise<void> }) {
  const [text, setText] = useState(''); const [sessMenu, setSessMenu] = useState(false); const [busy, setBusy] = useState(false)
  const [attach, setAttach] = useState<{ rel: string; abs: string; uploaded?: boolean }[]>([]); const [attMenu, setAttMenu] = useState(false); const [pickOpen, setPickOpen] = useState(false); const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null); const taRef = useRef<HTMLTextAreaElement>(null)
  const onPickLocal = async (files: FileList | null) => { if (!files?.length) return; setUploading(true); try { for (const f of Array.from(files)) { const r = await uploadFile(bot.id, f); setAttach((a) => [...a, { rel: r.rel, abs: r.abs, uploaded: true }]) } say(`${files.length}개 올렸어요 → 첨부/`) } catch (e) { say((e as Error).message) } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' } }
  useEffect(() => { if (prefill) { setText((t) => (t ? `${t} ${prefill}` : prefill)); onPrefilled(); taRef.current?.focus() } }, [prefill])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [items.length, items[items.length - 1]?.kind === 'assistant' ? (items[items.length - 1] as { text: string }).text.length : 0, pending.length])
  const send = async () => {
    let t = text.trim(); if ((!t && !attach.length) || busy) return
    if (attach.length) t = `${t || '첨부한 파일을 봐 줘.'}\n\n첨부 파일 (읽어서 참고해):\n${attach.map((a) => `- ${a.abs}`).join('\n')}`
    setBusy(true)
    try { if (cur) await api(`/sessions/${cur.id}/send`, { body: { text: t } }); else { const r = await api<{ sessionId: string }>(`/bots/${bot.id}/send`, { body: { text: t, name: '메인' } }); await refreshAll(); onSession(r.sessionId) } setText(''); setAttach([]) } catch (e) { say((e as Error).message) } finally { setBusy(false) }
  }
  const state = cur?.state ?? 'idle'
  const mood = moodOf(state, !!cur?.hibernated)
  const relOf = (p: string) => p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : p.startsWith(bot.abs) ? p.slice(bot.abs.length) : null
  let lastDay = ''
  return <div className="chat">
    <div className="chat-head">
      <button className="iconbtn mob-nav" onClick={onBack}><Icon n="back" size={16} /></button>
      <FolderBot color={bot.color} size={30} mood={mood} />
      <div className="name"><b>{bot.name}</b><span className="path mono">{bot.rel ? `${bot.rel}` : '루트 · 볼트 전체'}</span></div>
      <div style={{ position: 'relative' }}><button className="sess" onClick={() => setSessMenu(!sessMenu)}>세션: {cur?.name ?? '없음'} <Icon n="chevd" size={12} /></button>
        {sessMenu ? <div className="menu" style={{ left: 0, top: 34 }}>{sessions.map((x) => <button key={x.id} className={x.id === cur?.id ? 'on' : ''} onClick={() => { onSession(x.id); setSessMenu(false) }}><span className="dot" style={{ background: STATE_COLOR[x.state] }} /><span style={{ flex: 1 }}>{x.name}</span><span style={{ fontSize: 11, color: 'var(--faint)' }}>{x.hibernated ? '휴면' : fmtTime(x.lastActivity)}</span></button>)}<button onClick={async () => { const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}` } }); await refreshAll(); onSession(info.id); setSessMenu(false) }}><Icon n="plus" size={12} /><span>새 세션</span></button>{cur ? <button onClick={async () => { const n = prompt('세션 이름', cur.name); if (n) { await api(`/sessions/${cur.id}/rename`, { body: { name: n } }); setSessMenu(false) } }}><Icon n="edit" size={12} /><span>이름 바꾸기</span></button> : null}{cur ? <button className="warn" onClick={async () => { if (confirm('이 세션 기록을 지울까요?')) { await api(`/sessions/${cur.id}`, { method: 'DELETE' }); await refreshAll(); setSessMenu(false) } }}><Icon n="x" size={12} /><span>세션 삭제</span></button> : null}</div> : null}</div>
      <span className="st"><span className="dot" style={{ background: STATE_COLOR[state] }} />{cur?.hibernated && state === 'idle' ? '휴면' : STATE_LABEL[state]}</span>
      <div className="acts">{state === 'running' && cur ? <button className="iconbtn" title="중단" onClick={() => api(`/sessions/${cur.id}/interrupt`, { body: {} })}><Icon n="stop" size={14} /></button> : null}<button className="iconbtn" onClick={onRp} title="이 폴더에서"><Icon n="collapse" size={15} style={{ transform: 'rotate(180deg)' }} /></button></div>
    </div>
    <div className="msgs">
      {!cur ? <div className="empty"><FolderBot color={bot.color} size={56} mood="idle" /><div><b style={{ color: 'var(--strong)' }}>{bot.name}</b>{bot.orchestrator ? ' — 볼트 전체를 보는 관제 봇이에요. "지금 뭐 돌고 있어?", "Inbox 정리해 줘", "X 폴더에서 시작해" 같은 걸 시켜 보세요.' : ' 봇이에요. 이 폴더의 지침·기억·자료를 들고 일해요. 첫 지시를 보내 보세요.'}</div></div> : null}
      {items.map((it) => {
        const day = new Date(it.t).toDateString(); const showDay = day !== lastDay; lastDay = day
        return <div key={it.id} style={{ display: 'contents' }}>
          {showDay ? <div className="date">{fmtDate(it.t)}</div> : null}
          {it.kind === 'user' ? <div className="m-user">{it.text}</div>
            : it.kind === 'assistant' ? <div className="m-bot"><FolderBot color={bot.color} size={26} mood={it.streaming ? 'work' : 'idle'} /><div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}><div className="bubble"><Md text={it.text || '…'} /></div><div className="m-meta"><span>{fmtTime(it.t)}</span><button onClick={() => { navigator.clipboard?.writeText(it.text); say('복사했어요') }} style={{ color: 'var(--faint)' }}>복사</button></div></div></div>
            : it.kind === 'tool' ? <ToolLine it={it} onFile={(p) => { const r = relOf(p); if (r) onFile(r) }} />
            : it.kind === 'files' ? <div className="files" style={{ marginLeft: 36 }}>{it.paths.map((p) => { const r = relOf(p); return <button key={p} className="chip" onClick={() => r && onFile(r)} title={p}><Icon n="file" size={13} color="var(--tool-read)" /><span className="mono">{r ?? p.split('/').pop()}</span></button> })}</div>
            : it.kind === 'result' ? <div className="sys">{it.ok ? <><Icon n="check" size={12} color="var(--done)" />턴 끝 · {(it.durationMs / 1000).toFixed(0)}s{it.costUsd ? ` · $${it.costUsd.toFixed(3)}` : ''}</> : <><Icon n="warn" size={12} color="var(--error)" />{it.error || '오류로 끝남'}</>}</div>
            : <div className="sys"><Icon n="clock" size={12} />{it.text}</div>}
        </div>
      })}
      {cur && pending.map((p) => <PermCard key={p.requestId} p={p} sid={cur.id} />)}
      <div ref={endRef} />
    </div>
    <div className="composer">
      {attach.length ? <div className="files" style={{ padding: '0 4px 8px' }}>{attach.map((a) => <span key={a.abs} className="chip" title={a.abs}><Icon n="file" size={13} color={a.uploaded ? 'var(--tool-write)' : 'var(--tool-read)'} /><span className="mono">{a.rel}</span><button onClick={() => setAttach(attach.filter((x) => x.abs !== a.abs))} style={{ color: 'var(--faint)', display: 'inline-flex' }}><Icon n="x" size={11} /></button></span>)}</div> : null}
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickLocal(e.target.files)} />
      <div className="box" style={{ position: 'relative' }}>
      <button className="iconbtn" title="첨부" onClick={() => setAttMenu(!attMenu)} disabled={uploading}><Icon n="plus" size={14} /></button>
      {attMenu ? <div className="menu" style={{ left: 0, bottom: 48 }} onClick={() => setAttMenu(false)}><button onClick={() => fileRef.current?.click()}><Icon n="phone" size={14} /><span style={{ flex: 1 }}>이 기기에서 파일 올리기</span><span style={{ fontSize: 11, color: 'var(--faint)' }}>→ 첨부/</span></button><button onClick={() => setPickOpen(true)}><Icon n="folder" size={14} /><span style={{ flex: 1 }}>{bot.orchestrator ? '볼트' : '이 폴더'}에서 고르기</span></button></div> : null}
      <textarea ref={taRef} rows={1} placeholder={`${bot.name}${/[가-힣]$/.test(bot.name) ? '에게' : ' 에게'} 메시지…`} value={text} onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px` }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
      <button className="sendbtn" onClick={send} disabled={busy || uploading} title="보내기"><Icon n="send" size={14} /></button>
    </div></div>
    {pickOpen ? <FilePickModal bot={bot} onClose={() => setPickOpen(false)} onPick={(rel) => { setAttach((a) => a.some((x) => x.rel === rel) ? a : [...a, { rel, abs: `${bot.abs}/${rel}` }]); setPickOpen(false) }} /> : null}
  </div>
}

function FilePickModal({ bot, onClose, onPick }: { bot: Bot; onClose: () => void; onPick: (rel: string) => void }) {
  const [tree, setTree] = useState<{ name: string; rel: string; dir: boolean; mtime: number; children?: unknown[] }[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { void api<typeof tree>(`/bots/${bot.id}/files?depth=4`).then(setTree) }, [bot.id])
  const flat: { rel: string; dir: boolean; mtime: number }[] = []
  const walk = (n: typeof tree) => { for (const x of n) { if (!x.dir) flat.push({ rel: x.rel, dir: false, mtime: x.mtime }); if (x.children) walk(x.children as typeof tree) } }
  walk(tree)
  const list = flat.filter((f) => !q || f.rel.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.mtime - a.mtime).slice(0, 200)
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal" style={{ width: 'min(560px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{bot.orchestrator ? '볼트' : bot.name}에서 파일 고르기</b><small>고른 파일의 경로가 메시지에 붙고, 봇이 읽어요</small></div><button className="iconbtn" onClick={onClose}><Icon n="x" size={15} /></button></div>
      <div className="search"><Icon n="search" size={14} /><input placeholder="파일 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="modal-b" style={{ maxHeight: '55vh' }}>{list.map((f) => <button key={f.rel} className="frow" onClick={() => onPick(f.rel)}><Icon n="file" size={13} color="var(--tool-read)" /><span className="n">{f.rel}</span><time>{fmtTime(f.mtime)}</time></button>)}{!list.length ? <div className="empty">파일이 없어요</div> : null}</div>
    </div>
  </>
}

function ToolLine({ it, onFile }: { it: Extract<ChatItem, { kind: 'tool' }>; onFile: (p: string) => void }) {
  const [open, setOpen] = useState(false)
  const kind = /^(Read|Glob|Grep|LS)$/.test(it.name) ? 'read' : /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(it.name) ? 'edit' : /^Bash$/.test(it.name) ? 'run' : /Web/.test(it.name) ? 'web' : 'task'
  const color = { read: 'var(--tool-read)', edit: 'var(--tool-write)', run: 'var(--tool-run)', web: 'var(--tool-web)', task: 'var(--accent)' }[kind]
  const fp = typeof it.input?.file_path === 'string' ? (it.input.file_path as string) : null
  return <div style={{ marginLeft: 36, maxWidth: 'min(700px,100%)' }}><button className="tool" onClick={() => setOpen(!open)}><Icon n={kind === 'read' ? 'read' : kind === 'edit' ? 'edit' : kind === 'run' ? 'run' : kind === 'web' ? 'web' : 'task'} size={14} color={color} /><b>{it.name}</b><span className="s">{it.summary}</span>{it.isError ? <Icon n="warn" size={12} color="var(--error)" /> : it.result !== undefined ? <Icon n="check" size={12} color="var(--faint)" /> : null}</button>
    {open ? <div className="tool-res">{fp ? <button className="chip" style={{ marginBottom: 6 }} onClick={() => onFile(fp)}><Icon n="file" size={13} color="var(--tool-read)" /><span className="mono">{fp.split('/').pop()}</span></button> : null}{JSON.stringify(it.input, null, 1).slice(0, 1500)}{it.result ? `\n\n— 결과 —\n${it.result}` : ''}</div> : null}</div>
}

function PermCard({ p, sid }: { p: PermissionRequest; sid: string }) {
  const [busy, setBusy] = useState(false)
  const act = async (body: Record<string, unknown>, path: 'permission' | 'ask') => { setBusy(true); try { await api(`/sessions/${sid}/${path}`, { body: { requestId: p.requestId, ...body } }) } finally { setBusy(false) } }
  if (p.ask) {
    const qs = (p.input.questions as { question?: string; header?: string; options?: { label?: string; description?: string }[]; multiSelect?: boolean }[] | undefined) ?? []
    return <div className="card wait"><div className="h" style={{ color: 'var(--awaiting)' }}><span className="dot" style={{ background: 'var(--awaiting)' }} />질문에 답해 주세요</div>
      {qs.map((q, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><div style={{ color: 'var(--text)' }}>{q.question}</div><div className="btns">{(q.options ?? []).map((o) => <button key={o.label} className="btn" disabled={busy} title={o.description} onClick={() => act({ answers: { [q.question ?? String(i)]: o.label ?? '' } }, 'ask')}>{o.label}</button>)}</div></div>)}
      <div className="btns"><button className="btn ghost" disabled={busy} onClick={() => { const a = prompt('직접 입력'); if (a) void act({ answers: { [qs[0]?.question ?? 'answer']: a } }, 'ask') }}>기타…</button><button className="btn ghost" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>취소</button></div></div>
  }
  const i = p.input; const cmd = typeof i.command === 'string' ? i.command : typeof i.file_path === 'string' ? i.file_path : typeof i.url === 'string' ? i.url : JSON.stringify(i).slice(0, 300)
  return <div className="card wait"><div className="h" style={{ color: 'var(--awaiting)' }}><span className="dot" style={{ background: 'var(--awaiting)' }} />확인해 주세요 · {p.displayName}</div>{p.description ? <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>{p.description}</div> : null}<div className="cmd">{cmd}</div>
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => act({ allow: true }, 'permission')}>허용</button>{p.suggestions.length ? <button className="btn" disabled={busy} onClick={() => act({ allow: true, always: true }, 'permission')}>항상 허용</button> : null}<button className="btn" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>거부</button></div></div>
}
