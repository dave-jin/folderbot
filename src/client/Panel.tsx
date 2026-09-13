import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bot, SessionInfo, TodoItem } from '../core/types'
import { api } from './api'
import { isDoneSection } from '../core/todo'
import { ACT_COLOR, ACT_ICON, ACT_LABEL, LONG, actOf, buzz, slotOf, useSwipeCfg, type SwipeAct } from './swipe'
import { FolderBot, Icon, Mid } from './FolderBot'
import { RoutineSheet, askName } from './Sheets'
import { fmtElapsed, fmtTime, useStore } from './store'

export interface SecH { sessions: number; todo: number }
interface Node { name: string; rel: string; dir: boolean; mtime: number; size?: number; harness?: boolean; botId?: string }

/** 오른쪽 패널 — 세션 · 할 일(Inbox) · 파일(실제 트리) · 루틴. 섹션 사이 선이 드래그 핸들 */
export function Panel({ bot, sessions, sessionId, go, onOpenFile, onTalk, onAttach, onMention, onStartAt, onNewFolderAt, touched, filesTick, secH, onSecH, onCollapse, say, refresh, activeDoc, onDragY, focusSec, phone, onBack }: { bot: Bot; sessions: SessionInfo[]; sessionId?: string; go: (b: string, sid?: string) => void; onOpenFile: (rel: string, pin?: boolean) => void; onTalk: (t: string) => void; onAttach: (rel: string, dir?: boolean) => void; onMention: (rel: string) => void; onStartAt: (vaultRel: string, botId?: string) => void; onNewFolderAt: (vaultRel: string) => void; phone?: boolean; onBack?: () => void; touched: string[]; filesTick?: number; secH: SecH; onSecH: (h: SecH) => void; onCollapse: () => void; say: (m: string) => void; refresh: () => Promise<void>; activeDoc: string | null; onDragY: (on: boolean) => void; focusSec?: { sec: string; n: number } | null }) {
  const { s, loadTodo } = useStore()
  const [open, setOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(`fb:secs:${bot.id}`) ?? '') } catch { return { sessions: true, todo: true, files: true, routines: false } } })
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem(`fb:secs:${bot.id}`) ?? '')) } catch { setOpen({ sessions: true, todo: true, files: true, routines: false }) } }, [bot.id])
  useEffect(() => { localStorage.setItem(`fb:secs:${bot.id}`, JSON.stringify(open)) }, [open, bot.id])
  const tog = (k: string) => setOpen({ ...open, [k]: !open[k] })
  // 아이콘 열에서 누른 섹션은 펼쳐진 채로 온다
  useEffect(() => { if (focusSec) setOpen((o) => ({ ...o, [focusSec.sec]: true })) }, [focusSec?.n])
  const [routines, setRoutines] = useState(false); const [menu, setMenu] = useState(false)
  const todos = (s.todos[bot.id] ?? [])
  const dragY = (k: 'sessions' | 'todo') => (e: React.PointerEvent) => { e.preventDefault(); onDragY(true); const y0 = e.clientY; const h0 = secH[k]; const panel = (e.currentTarget as HTMLElement).closest('.panel'); const room = panel ? panel.getBoundingClientRect().height - (secH.sessions + secH.todo - h0) - 260 : 420; /* 파일 트리 160 + 헤더·루틴·푸터 100 는 남긴다 */ const cap = Math.max(56, Math.min(420, room)); const mv = (ev: PointerEvent) => onSecH({ ...secH, [k]: Math.max(56, Math.min(cap, h0 + ev.clientY - y0)) }); const up = () => { onDragY(false); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up) }
  return <div className="col side panel" style={{ width: '100%' }}>
    <div className="hdr">{phone ? <button className="rb glassb" onClick={onBack} title="대화로"><Icon n="back" size={20} /></button> : null}<span className="ttl">{bot.orchestrator ? '이 볼트에서' : '이 폴더에서'}</span><span className="sp" />{!phone ? <div className="acts"><button className="ib on" onClick={onCollapse} title="패널 접기 (⌘⇧B)"><Icon n="panelr" size={14} /></button></div> : null}</div>
    {/* 세션 */}
    <div className={`sec ${open.sessions ? 'fix' : 'fix'}`} style={open.sessions ? { height: secH.sessions } : undefined}>
      <button className="sech" onClick={() => tog('sessions')}><Icon n={open.sessions ? 'chevd' : 'chev'} size={9} /><span>세션</span><span className="c">{sessions.length}</span><span className="tools on"><span className="ib" title="새 세션" onClick={async (e) => { e.stopPropagation(); const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}` } }); await refresh(); go(bot.id, info.id) }}><Icon n="plus" size={12} /></span></span></button>
      {open.sessions ? <div className="secb" style={{ padding: '0 0 6px' }}>{sessions.map((x) => <button key={x.id} className={`srow ${x.id === sessionId ? 'on' : ''}`} onClick={() => go(bot.id, x.id)}><span className={`dot ${x.state === 'running' ? 'run' : x.state === 'awaiting_input' ? 'wait' : x.state === 'error' ? 'err' : 'none'}`} /><span className="n">{x.name}</span><span className="m">{x.state === 'running' ? <Elapsed from={x.turnStartedAt} /> : x.hibernated ? '절전' : fmtTime(x.lastActivity)}</span></button>)}{!sessions.length ? <div className="kv" style={{ color: 'var(--t3)' }}>메시지를 보내면 생겨요</div> : null}</div> : null}
    </div>
    <div className="divy" onPointerDown={dragY('sessions')} onDoubleClick={() => onSecH({ ...secH, sessions: 112 })} />
    {/* 할 일 / Inbox */}
    <div className="sec fix" style={open.todo ? { height: secH.todo } : undefined}>
      {bot.orchestrator ? <InboxSec open={!!open.todo} tog={() => tog('todo')} onSend={onTalk} /> : <TodoSec bot={bot} items={todos} open={!!open.todo} tog={() => tog('todo')} onDelegate={(t) => onTalk(`${t.title}${t.desc ? ` — ${t.desc}` : ''}`)} onOpenFile={onOpenFile} reload={() => loadTodo(bot.id)} phone={phone} />}
    </div>
    <div className="divy" onPointerDown={dragY('todo')} onDoubleClick={() => onSecH({ ...secH, todo: 84 })} />
    {/* 파일 */}
    <div className="sec grow">
      <Tree bot={bot} open={!!open.files} tog={() => tog('files')} onOpen={onOpenFile} onAttach={onAttach} onMention={onMention} onStartAt={onStartAt} onNewFolderAt={onNewFolderAt} touched={touched} tick={filesTick} say={say} active={activeDoc} />
    </div>
    <div className="divy" style={{ cursor: 'default' }} />
    {/* 루틴 */}
    <div className="sec fix">
      <button className="sech" onClick={() => tog('routines')}><Icon n={open.routines ? 'chevd' : 'chev'} size={9} /><span>루틴</span><span className="c">{bot.routines.length}</span></button>
      {open.routines ? <div style={{ padding: '0 0 6px' }}>{bot.routines.map((r) => <div key={r.name} className="kv"><Icon n="clock" size={12} color="var(--t3)" /><span className="n">{r.name}</span><span className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{r.cron}</span></div>)}<button className="kv" onClick={() => setRoutines(true)}><Icon n="plus" size={12} /><span className="n">{bot.routines.length ? '루틴 편집' : '루틴 추가'}</span></button></div> : null}
    </div>
    <div className="pfoot"><button style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit' }} onClick={() => setMenu(!menu)}><Icon n="more" size={12} />이 봇{bot.orchestrator ? '' : ' · 정지 · 은퇴'}</button>
      {menu && !bot.orchestrator ? <div className="menu" style={{ left: 8, bottom: 36 }} onClick={() => setMenu(false)}><button onClick={async () => { await api(`/bots/${bot.id}/stop`, { body: {} }); say(`${bot.name} 정지(휴면)`); await refresh(); go('orch') }}><Icon n="pause" size={13} /><span style={{ flex: 1 }}>정지 (휴면)</span><span className="k">기록 유지</span></button><button className="warn" onClick={async () => { if (!confirm(`${bot.name} 을 Archive 로 옮기고 은퇴시킬까요? 세션 기록은 보관돼요.`)) return; try { await api(`/bots/${bot.id}/retire`, { body: {} }); say('옮기고 은퇴했어요'); await refresh(); go('orch') } catch (e) { say((e as Error).message) } }}><Icon n="archive" size={13} /><span style={{ flex: 1 }}>Archive 로 이동 (은퇴)</span></button></div> : null}
      {menu && bot.orchestrator ? <div className="menu" style={{ left: 8, bottom: 36 }} onClick={() => setMenu(false)}><button onClick={() => onTalk('지금 뭐 돌고 있어? 봇별로 한 줄씩.')}><Icon n="sub" size={13} /><span>현황 물어보기</span></button></div> : null}
    </div>
    {routines ? <RoutineSheet bot={bot} onClose={() => setRoutines(false)} /> : null}
  </div>
}

export function Elapsed({ from }: { from?: number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((x) => x + 1), 1000); return () => window.clearInterval(t) }, [])
  return <>{fmtElapsed(from)}</>
}

/**
 * 할 일 2.0 (V15, Dave 승인 2026-09-13) — 패널은 todo.md 의 거울.
 * · 목록은 **제목 한 줄만**. 설명은 더블클릭(폰은 탭)으로 그 행을 펼칠 때만 보인다 — 설명이 있는 행에만 › 표식.
 * · 편집은 펼친 자리에서 **한 칸**에 «제목: 설명» (첫 «:» 앞이 제목 — 파일 형식 그대로).
 * · 문서의 `## 제목`(절)이 그대로 섹션이고, «완료» 절은 접힌 채로 시작한다.
 * · 체크하면 «완료» 절 끝으로 내려가고(파일에서도), 끌면 그 줄이 파일에서 옮겨진다.
 * · 「todo.md」 버튼으로 원문을 열어 자유롭게 고칠 수 있다 — 저장하면 이 패널이 따라온다(파일 감시).
 */
function TodoSec({ bot, items, open, tog, onDelegate, onOpenFile, reload, phone }: { bot: Bot; items: TodoItem[]; open: boolean; tog: () => void; onDelegate: (t: TodoItem) => void; onOpenFile: (rel: string) => void; reload: () => Promise<void>; phone?: boolean }) {
  const [adding, setAdding] = useState<string | null>(null); const [line, setLine] = useState('')
  const [edit, setEdit] = useState<number | null>(null); const [draft, setDraft] = useState('')
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set())
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({})
  const [drag, setDrag] = useState<number | null>(null); const [over, setOver] = useState<number | null>(null)
  const [cfg] = useSwipeCfg()
  const [sw, setSw] = useState<{ line: number; dx: number; w: number } | null>(null); const swRef = useRef<{ line: number; x0: number; y0: number; w: number; on: boolean; last: SwipeAct | null } | null>(null)
  const [sheet, setSheet] = useState<TodoItem | null>(null)
  const [undo, setUndo] = useState<{ title: string; desc: string } | null>(null); const undoT = useRef<number | undefined>(undefined)

  // 절 순서는 파일 순서 그대로. 절이 없는 파일이면 빈 이름 하나로 모인다
  const secs = useMemo(() => {
    const m = new Map<string, TodoItem[]>()
    for (const t of items) { const k = t.section; (m.get(k) ?? m.set(k, []).get(k)!).push(t) }
    return [...m.entries()]
  }, [items])
  const left = items.filter((t) => !t.done).length
  const doneN = items.filter((t) => t.done).length
  const secOpen = (name: string) => openSecs[name] ?? !isDoneSection(name)

  const toggle = async (t: TodoItem) => { await api(`/bots/${bot.id}/todo/toggle`, { body: { line: t.line, done: !t.done } }); setOpenRows(new Set()); setEdit(null); await reload() }
  const startEdit = (t: TodoItem) => { setEdit(t.line); setDraft(t.desc ? `${t.title}: ${t.desc}` : t.title) }
  const save = async () => {
    if (edit === null) return
    const raw = draft.trim(); if (!raw) { setEdit(null); return }
    const c = raw.indexOf(':')
    const title = c > 0 ? raw.slice(0, c).trim() : raw
    const desc = c > 0 ? raw.slice(c + 1).trim() : ''
    await api(`/bots/${bot.id}/todo/edit`, { body: { line: edit, title, desc } }); setEdit(null); await reload()
  }
  const add = async (section: string) => {
    const raw = line.trim(); if (!raw) { setAdding(null); setLine(''); return }
    const c = raw.indexOf(':')
    await api(`/bots/${bot.id}/todo`, { body: { title: c > 0 ? raw.slice(0, c).trim() : raw, desc: c > 0 ? raw.slice(c + 1).trim() : '', section } })
    setLine(''); await reload()
  }
  const remove = async (t: TodoItem) => {
    await api(`/bots/${bot.id}/todo/delete`, { body: { line: t.line } }); setEdit(null)
    setUndo({ title: t.title, desc: t.desc }); window.clearTimeout(undoT.current); undoT.current = window.setTimeout(() => setUndo(null), 5000)
    await reload()
  }
  const undoRemove = async () => { if (!undo) return; await api(`/bots/${bot.id}/todo`, { body: { title: undo.title, desc: undo.desc } }); setUndo(null); await reload() }
  const drop = async (before: number | null) => {
    const from = drag; setDrag(null); setOver(null)
    if (from === null || from === before) return
    await api(`/bots/${bot.id}/todo/move`, { body: { line: from, before } }); setOpenRows(new Set()); await reload()
  }
  const toggleRow = (t: TodoItem) => { if (!t.desc) return; setOpenRows((o) => { const n = new Set(o); if (n.has(t.line)) n.delete(t.line); else n.add(t.line); return n }) }

  /** 쓸어서 처리 — 폰에서만. 처음 움직임이 세로면 목록 스크롤에 양보하고 다시는 가로로 보지 않는다 */
  const run = async (t: TodoItem, act: SwipeAct) => {
    if (act === 'edit') startEdit(t)
    else if (act === 'done') await toggle(t)
    else if (act === 'delete') await remove(t)
    else if (act === 'delegate') onDelegate(t)
    else if (act === 'expand') toggleRow(t)
    else if (act === 'menu') setSheet(t)
  }
  const swipeOn = (t: TodoItem) => (!phone ? {} : {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || edit === t.line) return
      swRef.current = { line: t.line, x0: e.clientX, y0: e.clientY, w: (e.currentTarget as HTMLElement).getBoundingClientRect().width, on: false, last: null }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const r = swRef.current; if (!r || r.line !== t.line) return
      const dx = e.clientX - r.x0, dy = e.clientY - r.y0
      if (!r.on) { if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 8) { if (Math.abs(dy) > 10) swRef.current = null; return } r.on = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 캡처 없이도 동작한다 */ } }
      const act = actOf(cfg, slotOf(dx, r.w))
      if (act !== r.last) { r.last = act; if (act) buzz(cfg.haptics) }
      setSw({ line: t.line, dx, w: r.w })
    },
    onPointerUp: () => {
      const r = swRef.current; swRef.current = null
      const cur = sw; setSw(null)
      if (!r || !r.on || !cur) return
      const act = actOf(cfg, slotOf(cur.dx, cur.w)); if (act) void run(t, act)
    },
    onPointerCancel: () => { swRef.current = null; setSw(null) }
  })

  /** 행 알맹이 — 체크 + 제목(+펼친 설명) + 표식 + 도구. 폰에서는 스와이프 껍데기 안에 들어간다 */
  const rowInner = (t: TodoItem, isOpen: boolean) => <div
      className={`todo ${t.done ? 'done' : ''} ${isOpen ? 'on' : ''}`}
      onDoubleClick={phone ? undefined : () => toggleRow(t)} onClick={phone ? () => toggleRow(t) : undefined}>
      <button className="bx" onClick={(e) => { e.stopPropagation(); void toggle(t) }} aria-label={t.done ? '되돌리기' : '완료'}>{t.done ? <Icon n="check" size={9} color="var(--onAccent)" /> : null}</button>
      <div className="bd">
        <div className="tt">{t.title}{t.by === 'bot' ? <span className="byb" title="봇이 적음"><Icon n="sub" size={10} /></span> : null}</div>
        {isOpen && t.desc ? <div className="dsc">{t.desc}</div> : null}
      </div>
      {t.desc ? <span className="mk"><Icon n={isOpen ? 'chevd' : 'chev'} size={9} /></span> : null}
    </div>

  const row = (t: TodoItem) => {
    const isOpen = openRows.has(t.line)
    if (edit === t.line) return <div key={t.line} className="todo edit">
      <span className="bx ghost" />
      <div className="bd">
        <input autoFocus className="ein" value={draft} placeholder="제목: 설명" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEdit(null) }} onBlur={() => void save()} />
        <div className="eh"><span>⏎ 저장</span><span>⎋ 취소</span><span className="sp" /><span>«:» 뒤는 설명</span></div>
      </div>
    </div>
    const cur = sw && sw.line === t.line ? sw : null
    const act = cur ? actOf(cfg, slotOf(cur.dx, cur.w)) : null
    const long = !!cur && Math.abs(cur.dx) / Math.max(1, cur.w) >= LONG
    if (phone) return <div key={t.line} className={`swwrap ${act ? 'armed' : ''}`} style={act ? { background: `color-mix(in srgb, ${ACT_COLOR[act]} ${long ? 100 : 45}%, var(--bg))` } : undefined}>
      {act ? <div className={`swhint ${cur!.dx > 0 ? 'l' : 'r'}`}><span className={`cir ${long ? 'on' : ''}`} style={long ? { color: ACT_COLOR[act] } : undefined}><Icon n={ACT_ICON[act] as 'edit'} size={15} /></span>{long ? <b>{ACT_LABEL[act]}</b> : null}</div> : null}
      <div className="swrow" style={cur ? { transform: `translateX(${Math.max(-0.72 * cur.w, Math.min(0.72 * cur.w, cur.dx))}px)`, transition: 'none' } : undefined} {...swipeOn(t)}>{rowInner(t, isOpen)}</div>
    </div>
    return <div key={t.line}
      className={`todo ${t.done ? 'done' : ''} ${isOpen ? 'on' : ''} ${over === t.line ? 'over' : ''} ${drag === t.line ? 'dragging' : ''}`}
      draggable={!phone} onDragStart={() => setDrag(t.line)} onDragEnd={() => { setDrag(null); setOver(null) }}
      onDragOver={(e) => { if (drag === null) return; e.preventDefault(); setOver(t.line) }} onDragLeave={() => setOver((o) => (o === t.line ? null : o))}
      onDrop={(e) => { e.preventDefault(); void drop(t.line) }}
      onDoubleClick={phone ? undefined : () => toggleRow(t)} onClick={phone ? () => toggleRow(t) : undefined}>
      <button className="bx" onClick={(e) => { e.stopPropagation(); void toggle(t) }} aria-label={t.done ? '되돌리기' : '완료'}>{t.done ? <Icon n="check" size={9} color="#111" /> : null}</button>
      <div className="bd">
        <div className="tt" onClick={(e) => { if (isOpen) { e.stopPropagation(); startEdit(t) } }} title={phone ? '누르면 펼치기' : '더블클릭하면 펼치기'}>{t.title}{t.by === 'bot' ? <span className="byb" title="봇이 적음"><Icon n="sub" size={10} /></span> : null}</div>
        {isOpen && t.desc ? <div className="dsc" onClick={(e) => { e.stopPropagation(); startEdit(t) }}>{t.desc}</div> : null}
      </div>
      {t.desc ? <span className="mk"><Icon n={isOpen ? 'chevd' : 'chev'} size={9} /></span> : null}
      <span className="tools" onClick={(e) => e.stopPropagation()}>
        <button title="편집" onClick={() => startEdit(t)}><Icon n="edit" size={12} /></button>
        {!t.done ? <button title="봇에게 맡기기" onClick={() => onDelegate(t)}><Icon n="sub" size={12} /></button> : null}
        <button title="삭제" onClick={() => void remove(t)}><Icon n="x" size={12} /></button>
      </span>
    </div>
  }

  return <>
    <button className="sech" onClick={tog}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>할 일</span><span className="c">{left}{doneN ? ` · 완료 ${doneN}` : ''}</span>
      <span className="tools">
        <span className="ib" title="새 할 일" onClick={(e) => { e.stopPropagation(); setAdding(secs[0]?.[0] ?? '') }}><Icon n="plus" size={12} /></span>
        <span className="ib mdb" title="todo.md 를 열어 원문 고치기" onClick={(e) => { e.stopPropagation(); onOpenFile('todo.md') }}><Icon n="doc" size={11} /><span>todo.md</span></span>
      </span>
    </button>
    {open ? <div className="secb" style={{ padding: '0 0 6px' }} onDragOver={(e) => { if (drag !== null) e.preventDefault() }} onDrop={(e) => { e.preventDefault(); void drop(null) }}>
      {!items.length ? <div className="kv" style={{ color: 'var(--t3)' }}>할 일이 없어요 — + 로 적거나 todo.md 를 여세요</div> : null}
      {secs.map(([name, list]) => <div key={name || '_'}>
        {name ? <button className="tsec" onClick={() => setOpenSecs({ ...openSecs, [name]: !secOpen(name) })}><Icon n={secOpen(name) ? 'chevd' : 'chev'} size={9} /><span>{name}</span><span className="c">{list.length}</span></button> : null}
        {secOpen(name) ? <>
          {list.map(row)}
          {adding === name ? <div className="todo add"><span className="bx ghost" /><input autoFocus className="ein" placeholder="제목: 설명 (Enter)" value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(name); if (e.key === 'Escape') { setAdding(null); setLine('') } }} onBlur={() => { if (!line.trim()) setAdding(null) }} /></div>
            : !isDoneSection(name) ? <button className="todo addbtn" onClick={() => setAdding(name)}><span className="bx ghost dash" /><span>새 할 일</span></button> : null}
        </> : null}
      </div>)}
      {undo ? <div className="kv" style={{ color: 'var(--t3)' }}><span className="n">삭제했어요</span><button style={{ color: 'var(--t2)' }} onClick={() => void undoRemove()}>되돌리기</button></div> : null}
    </div> : null}
    {sheet ? <><div className="backdrop" onClick={() => setSheet(null)} /><div className="tsheet">
      <div className="grip" />
      <div className="ti">{sheet.title}</div>
      {([['edit', '편집'], ['delegate', '봇에게 맡기기'], ['done', sheet.done ? '되돌리기' : '완료로'], ['delete', '삭제']] as [SwipeAct, string][]).map(([a2, l]) => <button key={a2} onClick={() => { const t = sheet; setSheet(null); void run(t, a2) }}><Icon n={ACT_ICON[a2] as 'edit'} size={16} />{l}</button>)}
    </div></> : null}
  </>
}

function InboxSec({ open, tog, onSend }: { open: boolean; tog: () => void; onSend: (t: string) => void }) {
  const { s } = useStore()
  const [items, setItems] = useState<{ rel: string; name: string; dir: boolean; mtime: number }[]>([])
  useEffect(() => { void api<typeof items>('/inbox').then(setItems).catch(() => {}) }, [s.inbox])
  return <>
    <button className="sech" onClick={tog}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>Inbox</span><span className="c">{items.length}</span>{items.length ? <span className="tools on"><span className="ib" title="정리 제안 받기" onClick={(e) => { e.stopPropagation(); onSend('Inbox 를 규칙대로 정리해 줘. 어디로 옮길지 먼저 제안해.') }}><Icon n="sub" size={12} /></span></span> : null}</button>
    {open ? <div className="secb" style={{ padding: '0 0 6px' }}>{items.slice(0, 20).map((i) => <div key={i.rel} className="trow" style={{ ['--pad' as string]: '16px' }}><Icon n={i.dir ? 'folder' : 'doc'} size={12} color="var(--t3)" /><span className="n"><Mid s={i.name} /></span></div>)}{!items.length ? <div className="kv" style={{ color: 'var(--t3)' }}>정리할 게 없어요</div> : null}</div> : null}
  </>
}

/* ── 파일 트리 (게으른 로드) ── */
function Tree({ bot, open, tog, onOpen, onAttach, onMention, onStartAt, onNewFolderAt, touched, tick, say, active }: { bot: Bot; open: boolean; tog: () => void; onOpen: (rel: string, pin?: boolean) => void; onAttach: (rel: string, dir?: boolean) => void; onMention: (rel: string) => void; onStartAt: (vaultRel: string, botId?: string) => void; onNewFolderAt: (vaultRel: string) => void; touched: string[]; tick?: number; say: (m: string) => void; active: string | null }) {
  const [dirs, setDirs] = useState<Record<string, Node[]>>({})
  const [exp, setExp] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(`fb:tree:${bot.id}`) ?? '[""]')) } catch { return new Set(['']) } })
  const [sort, setSort] = useState<'name' | 'mtime'>(() => (localStorage.getItem('fb:tsort') as 'name' | 'mtime') || 'name')
  const [filter, setFilter] = useState<string | null>(null)
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [ctx, setCtx] = useState<{ x: number; y: number; n: Node } | null>(null)
  const [sortMenu, setSortMenu] = useState(false)
  const loadDir = async (rel: string) => { try { const l = await api<Node[]>(`/bots/${bot.id}/ls?dir=${encodeURIComponent(rel)}`); setDirs((d) => ({ ...d, [rel]: l })) } catch { /* */ } }
  useEffect(() => { setDirs({}); try { setExp(new Set(JSON.parse(localStorage.getItem(`fb:tree:${bot.id}`) ?? '[""]'))) } catch { setExp(new Set([''])) } }, [bot.id])
  useEffect(() => { localStorage.setItem(`fb:tree:${bot.id}`, JSON.stringify([...exp])); for (const d of exp) if (!dirs[d]) void loadDir(d) }, [exp, bot.id])
  useEffect(() => { localStorage.setItem('fb:tsort', sort) }, [sort])
  // 봇이 파일을 쓰면: 펼친 폴더는 다시 읽고, 건드린 파일의 조상을 펼쳐 1.4초 비춘다
  useEffect(() => { if (!tick) return; for (const d of exp) void loadDir(d) }, [tick])
  useEffect(() => {
    if (!touched.length) return
    const rels = touched.map((p) => (p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : null)).filter((x): x is string => !!x)
    if (!rels.length) return
    setExp((e) => { const n = new Set(e); for (const r of rels) { const parts = r.split('/'); for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join('/')) } return n })
    setFlash(new Set(rels)); const t = window.setTimeout(() => setFlash(new Set()), 1400); return () => window.clearTimeout(t)
  }, [touched])
  useEffect(() => { if (!ctx) return; const off = () => setCtx(null); window.addEventListener('click', off); window.addEventListener('keydown', off); return () => { window.removeEventListener('click', off); window.removeEventListener('keydown', off) } }, [ctx])
  const rows = useMemo(() => {
    const out: { n: Node; depth: number }[] = []
    const q = filter?.toLowerCase() ?? ''
    const walk = (rel: string, depth: number) => {
      let list = dirs[rel] ?? []
      if (sort === 'mtime') list = [...list].sort((a, b) => (a.dir === b.dir ? b.mtime - a.mtime : a.dir ? -1 : 1))
      for (const n of list) {
        const hit = !q || n.name.toLowerCase().includes(q)
        if (n.dir) { if (q ? true : true) { const before = out.length; if (exp.has(n.rel) || q) { out.push({ n, depth }); walk(n.rel, depth + 1); if (q && out.length === before + 1 && !hit) out.pop() } else out.push({ n, depth }) } }
        else if (hit) out.push({ n, depth })
      }
    }
    walk('', 0)
    return out
  }, [dirs, exp, sort, filter])
  const vaultRel = (rel: string) => (bot.rel ? `${bot.rel}/${rel}` : rel)
  const toggleDir = (rel: string) => setExp((e) => { const n = new Set(e); if (n.has(rel)) n.delete(rel); else n.add(rel); return n })
  const rename = async (n: Node) => { const name = await askName(`${n.dir ? '폴더' : '파일'} 이름 바꾸기`, n.name); if (!name || name === n.name) return; try { const r = await api<{ rel: string }>(`/bots/${bot.id}/rename`, { body: { rel: n.rel, name } }); say(`→ ${r.rel}`); const parent = n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : ''; void loadDir(parent) } catch (e) { say((e as Error).message) } }
  return <>
    <button className="sech" onClick={tog}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>파일</span>
      <span className={`tools ${sort !== 'name' || filter !== null ? 'on' : ''}`} onClick={(e) => e.stopPropagation()}>
        <span style={{ position: 'relative' }}><span className={`ib ${sort !== 'name' ? 'on' : ''}`} title="정렬" onClick={() => setSortMenu(!sortMenu)}><Icon n="sort" size={12} /></span>{sortMenu ? <div className="menu" style={{ right: 0, top: 26 }} onClick={() => setSortMenu(false)}><div className="h">정렬</div><button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}><span style={{ flex: 1 }}>이름 (폴더 먼저)</span>{sort === 'name' ? <Icon n="check" size={11} /> : null}</button><button className={sort === 'mtime' ? 'on' : ''} onClick={() => setSort('mtime')}><span style={{ flex: 1 }}>수정순 — 최근 변경</span>{sort === 'mtime' ? <Icon n="check" size={11} /> : null}</button></div> : null}</span>
        <span className={`ib ${filter !== null ? 'on' : ''}`} title="이름으로 거르기" onClick={() => setFilter(filter === null ? '' : null)}><Icon n="search" size={12} /></span>
        <span className="ib" title="모두 접기" onClick={() => setExp(new Set(['']))}><Icon n="collapse" size={12} style={{ transform: 'rotate(90deg)' }} /></span>
      </span></button>
    {open ? <>
      {filter !== null ? <div className="tfilter"><Icon n="search" size={12} /><input autoFocus placeholder="이름으로 거르기…" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setFilter(null) }} /><span onClick={() => setFilter(null)} style={{ cursor: 'pointer' }}><Icon n="x" size={11} /></span></div> : null}
      <div className="secb" style={{ padding: '0 6px 8px' }}>
        {rows.map(({ n, depth }) => <button key={n.rel} className={`trow ${n.dir ? 'dir' : ''} ${active === n.rel ? 'on' : ''} ${flash.has(n.rel) ? 'flash' : ''}`} style={{ ['--pad' as string]: `${10 + depth * 14}px` }} onClick={() => (n.dir ? toggleDir(n.rel) : onOpen(n.rel))} onDoubleClick={() => { if (!n.dir) onOpen(n.rel, true) }} onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, n }) }} title={n.rel} draggable onDragStart={(e) => { e.dataTransfer.setData('text/x-fb-rel', n.rel); e.dataTransfer.setData('text/x-fb-dir', n.dir ? '1' : '0'); e.dataTransfer.setData('text/plain', `${bot.abs}/${n.rel}`) }}>
          <span className="cv">{n.dir ? <Icon n={exp.has(n.rel) ? 'chevd' : 'chev'} size={9} /> : null}</span><Icon n={n.dir ? 'folder' : 'doc'} size={12} color={n.dir && exp.has(n.rel) ? 'var(--wait)' : 'var(--t3)'} /><span className="n"><Mid s={n.name} /></span>{n.botId ? <span className="dot run" title="봇 있음" style={{ width: 5, height: 5 }} /> : null}<time>{flash.has(n.rel) ? '방금' : fmtTime(n.mtime)}</time>
        </button>)}
        {!rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>{dirs[''] ? '비어 있어요' : <><div className="skel" style={{ width: '70%' }} /></>}</div> : null}
      </div>
    </> : null}
    {ctx ? <div className="menu ctx" style={{ left: Math.min(ctx.x, window.innerWidth - 200), top: Math.min(ctx.y, window.innerHeight - 220) }}>
      {!ctx.n.dir ? <><button onClick={() => onOpen(ctx.n.rel, true)}><span style={{ flex: 1 }}>열기 (고정 탭)</span><span className="k">⏎</span></button><button onClick={() => onAttach(ctx.n.rel)}><span style={{ flex: 1 }}>첨부로 보내기</span></button><button onClick={() => onMention(ctx.n.rel)}><span style={{ flex: 1 }}>@ 로 언급하기</span><span className="k">@</span></button></>
        : <>{ctx.n.botId ? <button className="on" onClick={() => onStartAt(vaultRel(ctx.n.rel), ctx.n.botId)}><Icon n="sub" size={12} /><span style={{ flex: 1 }}>봇 열기</span><span className="k">⏎</span></button> : <button className="on" onClick={() => onStartAt(vaultRel(ctx.n.rel))}><Icon n="sub" size={12} /><span style={{ flex: 1 }}>{bot.orchestrator ? '여기서 에이전트 시작' : '이 하위 폴더로 새 봇 시작'}</span><span className="k">⏎</span></button>}<button onClick={() => onNewFolderAt(vaultRel(ctx.n.rel))}><Icon n="fplus" size={12} /><span style={{ flex: 1 }}>새 폴더 만들기 → 시작</span></button><hr /><button onClick={() => toggleDir(ctx.n.rel)}><span style={{ flex: 1 }}>{exp.has(ctx.n.rel) ? '접기' : '펼치기'}</span></button><button onClick={() => onAttach(ctx.n.rel, true)}><span style={{ flex: 1 }}>폴더째 첨부</span></button></>}
      <button onClick={() => { navigator.clipboard?.writeText(`${bot.abs}/${ctx.n.rel}`); say('경로를 복사했어요') }}><span style={{ flex: 1 }}>경로 복사</span><span className="k">⌘C</span></button>
      <button onClick={() => rename(ctx.n)}><span style={{ flex: 1 }}>이름 바꾸기</span></button>
      <hr /><button onClick={() => setExp(new Set(['']))}><span style={{ flex: 1 }}>모두 접기</span></button>
    </div> : null}
  </>
}

export function BotGlyph({ bot, size = 16, working = false }: { bot: Bot; size?: number; working?: boolean }) { return <FolderBot color={bot.color} size={size} mood={working ? 'work' : 'idle'} mono /> }
export const useTick = (ms = 1000) => { const [, set] = useState(0); const r = useRef(0); useEffect(() => { const t = window.setInterval(() => set(++r.current), ms); return () => window.clearInterval(t) }, [ms]) }
