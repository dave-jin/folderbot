import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bot, HarnessDetail, HarnessItem, SessionInfo, TodoItem } from '../core/types'
import { copyImageWhy, copySay } from './clip'
import { copyFiles } from './fileCopy'
import { copyIntent } from '../core/copyIntent'
import { api } from './api'
import { isDoneSection } from '../core/todo'
import { ACT_COLOR, ACT_ICON, ACT_LABEL, LONG, actOf, buzz, slotOf, useSwipeCfg, type SwipeAct } from './swipe'
import { HOLD_MS, decide, dropIndex } from './gesture'
import { FolderBot, Icon, Mid } from './FolderBot'
import { RoutineSheet, askName } from './Sheets'
import { refreshModels } from './consts'
import { Mark, VendorMark, useProviders } from './Brand'
import { Float, anchorOf, type Anchor } from './Float'
import { PROVIDER_LABEL, type ProviderId } from '../core/agents'

/** 클립보드에 «그림 그대로» 넣을 수 있는 것들 */
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i
import { scoreName } from '../core/search'
import { fmtElapsed, fmtTime, useStore } from './store'
import { localBridge, openOnThisDevice } from './localOpen'

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
  const [routines, setRoutines] = useState(false); const [menu, setMenu] = useState<Anchor | null>(null)
  /**
   * 새 세션 — 🔴 **누가 맡을지(Claude / ChatGPT)는 세션마다 고른다.** 벤더는 폴더가 아니라 세션의 성질이라
   *    한 폴더에 둘이 섞여 산다(그래서 표식도 폴더 레일이 아니라 이 목록에 붙는다).
   * ⚠ 깔린 에이전트가 하나면 묻지 않는다 — 고를 게 없는데 묻는 건 문턱만 하나 더 만드는 것이다.
   */
  const provs = useProviders()
  const [pick, setPick] = useState<Anchor | null>(null)
  const newSession = async (vendor?: ProviderId) => {
    setPick(null)
    try {
      const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}`, vendor: vendor ?? provs[0]?.id } })
      void refreshModels()   // ⚠ 새 세션마다 모델 상태를 다시 본다 (2026-09-15 Dave)
      await refresh(); go(bot.id, info.id)
    } catch (e) { say((e as Error).message) }
  }
  /**
   * 🔴 **제목은 그 자리에서 고친다** (2026-09-15 Dave: «채팅 제목이 수정되게도 해줘»).
   *    종전의 길은 위 메뉴의 `prompt()` 하나였는데 — **Electron 에는 `prompt()` 가 없다**(조용히 아무 일도
   *    안 난다). 앱에서 «수정이 안 되는» 것처럼 보였던 이유다.
   * ⚠ 줄은 `<button>` 이라 그 안에 입력칸을 넣을 수 없다 — 고치는 동안에는 **줄을 통째로** 입력칸으로 바꾼다.
   */
  const [ren, setRen] = useState<{ id: string; v: string } | null>(null)
  const saveRen = async () => {
    const r = ren; if (!r) return
    setRen(null)
    const name = r.v.trim()
    const was = sessions.find((x) => x.id === r.id)
    if (!name || !was || name === was.name) return
    try { await api(`/sessions/${r.id}/rename`, { body: { name } }) } catch (e) { say((e as Error).message) }
  }
  const todos = (s.todos[bot.id] ?? [])
  /**
   * 세션 삭제 — 워커를 내리고 기록을 지운다. 되돌릴 수 없으니 한 번 묻는다.
   * 지운 게 지금 보고 있는 세션이면 남은 첫 세션으로 옮긴다(없으면 세션 없는 상태로).
   * ⚠ 호스트는 파일에 «지웠다» 표식을 남긴다 — 부팅 때 그 표식을 건너뛰지 않으면 되살아난다(session.ts 생성자).
   */
  const delSession = async (x: SessionInfo) => {
    const warn = x.state === 'running' ? '\n\n지금 돌고 있는 턴이 중단돼요.' : ''
    if (!confirm(`«${x.name}» 세션을 지울까요?${warn}\n\n대화 기록이 사라지고 되돌릴 수 없어요.`)) return
    try {
      await api(`/sessions/${x.id}`, { method: 'DELETE' })
      const left = sessions.filter((y) => y.id !== x.id)
      if (x.id === sessionId) go(bot.id, left[0]?.id)
      say(`«${x.name}» 세션을 지웠어요`)
    } catch (e) { say((e as Error).message) }
  }
  const dragY = (k: 'sessions' | 'todo') => (e: React.PointerEvent) => { e.preventDefault(); onDragY(true); const y0 = e.clientY; const h0 = secH[k]; const panel = (e.currentTarget as HTMLElement).closest('.panel'); const room = panel ? panel.getBoundingClientRect().height - (secH.sessions + secH.todo - h0) - 260 : 420; /* 파일 트리 160 + 헤더·루틴·푸터 100 는 남긴다 */ const cap = Math.max(56, Math.min(420, room)); const mv = (ev: PointerEvent) => onSecH({ ...secH, [k]: Math.max(56, Math.min(cap, h0 + ev.clientY - y0)) }); const up = () => { onDragY(false); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up) }
  return <div className="col side panel" style={{ width: '100%' }}>
    <div className="hdr">{phone ? <button className="rb glassb" onClick={onBack} title="뒤로"><Icon n="back" size={20} /></button> : null}<span className="ttl">{bot.orchestrator ? '이 볼트에서' : '이 폴더에서'}</span><span className="sp" />{!phone ? <div className="acts"><button className="ib on" onClick={onCollapse} title="패널 접기 (⌘⇧B)"><Icon n="panelr" size={14} /></button></div> : null}</div>
    {/* 세션 */}
    <div className={`sec ${open.sessions ? 'fix' : 'fix'}`} style={open.sessions ? { height: secH.sessions } : undefined}>
      <button className="sech" onClick={() => tog('sessions')}><Icon n={open.sessions ? 'chevd' : 'chev'} size={9} /><span>세션</span><span className="c">{sessions.length}</span><span className="tools on"><span className="ib nsb" title="새 세션" onClick={(e) => { e.stopPropagation(); if (provs.length > 1) { setPick(anchorOf(e.currentTarget as HTMLElement)); setOpen((o) => ({ ...o, sessions: true })) } else void newSession() }}><Icon n="plus" size={12} /></span></span></button>
      {open.sessions ? <div className="secb" style={{ padding: '0 0 6px' }}>{sessions.map((x) => ren?.id === x.id
          ? <div key={x.id} className="srow edit"><span className="dot none" /><input autoFocus className="rin" value={ren.v} onChange={(e) => setRen({ id: x.id, v: e.target.value })}
              onFocus={(e) => e.currentTarget.select()} onBlur={() => void saveRen()}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); void saveRen() } else if (e.key === 'Escape') { e.preventDefault(); setRen(null) } }} /></div>
          : <button key={x.id} className={`srow ${x.id === sessionId ? 'on' : ''}`} onClick={() => go(bot.id, x.id)} onDoubleClick={(e) => { e.stopPropagation(); setRen({ id: x.id, v: x.name }) }}><span className={`dot ${x.state === 'running' ? 'run' : x.state === 'awaiting_input' ? 'wait' : x.state === 'error' ? 'err' : 'none'}`} /><span className="n">{x.name}</span><VendorMark vendor={x.vendor} size={11} /><span className="m">{x.state === 'running' ? <Elapsed from={x.turnStartedAt} /> : x.hibernated ? '절전' : fmtTime(x.lastActivity)}</span><span className="ib ren" title="이름 바꾸기 (두 번 누르기)" onClick={(e) => { e.stopPropagation(); setRen({ id: x.id, v: x.name }) }}><Icon n="edit" size={11} /></span><span className="ib del" title="세션 삭제" onClick={(e) => { e.stopPropagation(); void delSession(x) }}><Icon n="x" size={11} /></span></button>)}
        {/* 🔴 **세션이 없을 때도 여기서 시작한다** (2026-09-13 Dave). 종전 「메시지를 보내면 생겨요」 는
            **막다른 안내**였다 — 누가 이 폴더를 맡을지(Claude / ChatGPT) 고를 자리가 어디에도 없었다.
            ⚠ 깔린 에이전트가 하나면 묻지 않는다 — 고를 게 없는데 묻는 건 문턱만 하나 더 만드는 것이다. */}
        {!sessions.length ? <button className="kv sempty" onClick={(e) => { if (provs.length > 1) setPick(anchorOf(e.currentTarget as HTMLElement)); else void newSession() }}><Icon n="plus" size={11} /><span>{provs.length > 1 ? 'Claude 나 ChatGPT 로 시작' : '세션 시작'}</span></button> : null}
        {pick ? <Float at={pick} onClose={() => setPick(null)}>{provs.map((pv) => <button key={pv.id} onClick={() => void newSession(pv.id)}><Mark id={pv.id} size={14} /><span>{PROVIDER_LABEL[pv.id]}</span></button>)}<hr /><button onClick={() => setPick(null)}><span>취소</span></button></Float> : null}</div> : null}
    </div>
    <div className="divy" onPointerDown={dragY('sessions')} onDoubleClick={() => onSecH({ ...secH, sessions: 112 })} />
    {/* 할 일 / Inbox */}
    <div className="sec fix" style={open.todo ? { height: secH.todo } : undefined}>
      {bot.orchestrator ? <InboxSec open={!!open.todo} tog={() => tog('todo')} onSend={onTalk} /> : <TodoSec bot={bot} items={todos} open={!!open.todo} tog={() => tog('todo')} onDelegate={(t) => onTalk(`${t.title}${t.desc ? ` — ${t.desc}` : ''}`)} onOpenFile={onOpenFile} reload={() => loadTodo(bot.id)} phone={phone} />}
    </div>
    <div className="divy" onPointerDown={dragY('todo')} onDoubleClick={() => onSecH({ ...secH, todo: 84 })} />
    {/* 파일 */}
    <div className="sec grow">
      <Tree bot={bot} phone={phone} open={!!open.files} tog={() => tog('files')} onOpen={onOpenFile} onAttach={onAttach} onMention={onMention} onStartAt={onStartAt} onNewFolderAt={onNewFolderAt} touched={touched} tick={filesTick} say={say} active={activeDoc} />
    </div>
    <div className="divy" style={{ cursor: 'default' }} />
    {/* 지침 · 하네스 — 폴더에 딸린 것의 집 (V25). 설정의 «하네스» 칸은 훑는 표일 뿐이다 */}
    {/* V (2026-09-22 Dave: «커맨드랑 스킬을 따로 구분하지 말고 한 공간에서 한 번에») — 지침·스킬·커넥터·슬래시 명령이 한 칸이다 */}
    {!bot.orchestrator ? <div className="sec fix">
      <HarnessSec bot={bot} open={!!open.harness} tog={() => tog('harness')} onOpenFile={onOpenFile} say={say} filesTick={filesTick} />
    </div> : null}
    <div className="divy" style={{ cursor: 'default' }} />
    {/* 루틴 */}
    <div className="sec fix">
      <button className="sech" onClick={() => tog('routines')}><Icon n={open.routines ? 'chevd' : 'chev'} size={9} /><span>루틴</span><span className="c">{bot.routines.length}</span></button>
      {open.routines ? <div style={{ padding: '0 0 6px' }}>{bot.routines.map((r) => <div key={r.name} className="kv"><Icon n="clock" size={12} color="var(--t3)" /><span className="n">{r.name}</span><span className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{r.cron}</span></div>)}<button className="kv" onClick={() => setRoutines(true)}><Icon n="plus" size={12} /><span className="n">{bot.routines.length ? '루틴 편집' : '루틴 추가'}</span></button></div> : null}
    </div>
    <div className="pfoot"><button style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit' }} onClick={(e) => setMenu(menu ? null : anchorOf(e.currentTarget as HTMLElement, { gap: 6 }))}><Icon n="more" size={12} />이 봇{bot.orchestrator ? '' : ' · 지우기 · 은퇴'}</button>
      {menu && !bot.orchestrator ? <Float at={menu} onClose={() => setMenu(null)}><div onClick={() => setMenu(null)} style={{ display: 'contents' }}><button onClick={async () => { await api(`/bots/${bot.id}/stop`, { body: {} }); say(`${bot.name} 을 레일에서 덜어냈어요`); await refresh(); go('orch') }}><Icon n="x" size={13} /><span style={{ flex: 1 }}>지우기 (연결 해지)</span><span className="k">폴더 유지</span></button><button className="warn" onClick={async () => { if (!confirm(`${bot.name} 을 Archive 로 옮기고 은퇴시킬까요? 세션 기록은 보관돼요.`)) return; try { await api(`/bots/${bot.id}/retire`, { body: {} }); say('옮기고 은퇴했어요'); await refresh(); go('orch') } catch (e) { say((e as Error).message) } }}><Icon n="archive" size={13} /><span style={{ flex: 1 }}>Archive 로 이동 (은퇴)</span></button></div></Float> : null}
      {menu && bot.orchestrator ? <Float at={menu} onClose={() => setMenu(null)}><div onClick={() => setMenu(null)} style={{ display: 'contents' }}><button onClick={() => onTalk('지금 뭐 돌고 있어? 봇별로 한 줄씩.')}><Icon n="sub" size={13} /><span>현황 물어보기</span></button></div></Float> : null}
    </div>
    {routines ? <RoutineSheet bot={bot} onClose={() => setRoutines(false)} /> : null}
  </div>
}

/**
 * 지침 · 하네스 (V25 · 2026-09-13 Dave 승인) — «이 폴더에서 실제로 쓸 수 있는 것».
 *
 * 🔴 **폴더별 하네스의 집은 여기다.** 설정에도 같은 내용의 표가 있지만 그건 전체를 훑는 용도고,
 *    «지금 어느 폴더 이야기인가» 가 붙어 있는 자리는 이 패널뿐이다 (Dave: «이건 어떻게 보여져야 할지 고민»).
 * 🔴 **범위 칩이 출처다** — 사용자(모든 폴더) · 볼트 · 폴더 · 내장. 같은 이름이 겹치면 **폴더가 이긴다**.
 */
const SCOPE_T: Record<HarnessItem['scope'], string> = { folder: '이 폴더', root: '볼트', user: '사용자', builtin: '내장' }
interface CmdRow { name: string; desc: string; scope: 'folder' | 'root' | 'user'; rel: string | null }
function HarnessSec({ bot, open, tog, onOpenFile, say, filesTick }: { bot: Bot; open: boolean; tog: () => void; onOpenFile: (rel: string) => void; say: (m: string) => void; filesTick?: number }) {
  const [hz, setHz] = useState<HarnessDetail | null>(null)
  const [cmds, setCmds] = useState<CmdRow[] | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => { if (!open) return; void api<HarnessDetail>(`/harness?rel=${encodeURIComponent(bot.rel)}`).then(setHz).catch(() => setHz(null)) }, [open, bot.rel])
  useEffect(() => { if (!open) return; void api<CmdRow[]>(`/bots/${bot.id}/commands`).then(setCmds).catch(() => setCmds([])) }, [open, bot.id, filesTick])
  const guides = hz ? [hz.claudeMd ? 'CLAUDE.md' : null, hz.agentsMd ? 'AGENTS.md' : null].filter(Boolean) as string[] : []
  /**
   * V · **한 목록에 명령·스킬·커넥터를 함께** (2026-09-22 Dave: «커맨드랑 스킬을 따로 구분하지 말고 한 공간에서 한 번에 볼 수는 없을까»).
   * 차례는 «내가 부르는 것 → 봇이 쓰는 것» — 슬래시 명령(`/이름`)이 먼저, 그다음 스킬, 그다음 커넥터.
   * ⚠ 종류는 왼쪽 아이콘과 오른쪽 범위 칩이 말한다 — 섹션을 둘로 가르면 같은 것을 두 군데서 찾게 된다.
   */
  const rows = [
    ...(cmds ?? []).map((c) => ({ key: `cmd:${c.scope}:${c.name}`, icon: 'run' as const, name: `/${c.name}`, desc: c.desc, kind: '명령', scope: SCOPE_T[c.scope === 'root' ? 'root' : c.scope === 'user' ? 'user' : 'folder'], rel: c.rel ?? '', folder: c.scope === 'folder' })),
    ...(hz?.skillList ?? []).map((i) => ({ key: `skill:${i.name}`, icon: 'run' as const, name: i.name, desc: '', kind: '스킬', scope: SCOPE_T[i.scope], rel: '', folder: i.scope === 'folder' })),
    ...(hz?.mcpList ?? []).map((i) => ({ key: `mcp:${i.name}`, icon: 'plug' as const, name: i.name, desc: '', kind: '커넥터', scope: SCOPE_T[i.scope], rel: '', folder: i.scope === 'folder' }))
  ]
  const shown = all ? rows : rows.slice(0, 6)
  const create = async () => {
    const name = await askName('새 슬래시 명령 이름 (영문·숫자·-)', 'my-command')
    if (!name) return
    try { const r = await api<{ rel: string }>(`/bots/${bot.id}/commands`, { body: { name: name.trim().replace(/\.md$/, ''), scope: 'folder' } }); onOpenFile(r.rel) } catch (e) { say((e as Error).message) }
  }
  return <>
    <button className="sech" onClick={tog}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>명령 · 스킬</span><span className="c">{hz || cmds ? guides.length + rows.length : ''}</span><span className="sp" /><span className="ib nsb" title="새 슬래시 명령" onClick={(e) => { e.stopPropagation(); void create() }}><Icon n="plus" size={12} /></span></button>
    {open ? <div className="secb hsec cmds">
      {guides.map((g) => <button className="hz" key={g} onClick={() => onOpenFile(g)}><Mark id={g === 'AGENTS.md' ? 'codex' : 'claude'} size={13} /><span className="n">{g}</span><span className="sc">지침 · 폴더</span></button>)}
      {shown.map((r) => <button className={`hz ${r.rel ? '' : 'ro'}`} key={r.key} title={r.rel ? '열어서 고치기' : `${r.kind} — 여기서는 못 고쳐요`} onClick={() => { if (r.rel) onOpenFile(r.rel) }}><Icon n={r.icon} size={13} color={r.folder ? 'var(--run)' : 'var(--t3)'} /><span className="n"><b>{r.name}</b>{r.desc ? <small> — {r.desc}</small> : null}</span><span className="sc">{r.kind} · {r.scope}</span></button>)}
      {(hz || cmds) && !rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>아직 없어요 — + 로 만들면 `/이름` 으로 부를 수 있어요</div> : null}
      {rows.length > 6 ? <button className="hz more" onClick={() => setAll(!all)}>{all ? '접기' : `+ ${rows.length - 6}개 더 보기`}</button> : null}
    </div> : null}
  </>
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
  /** 폰 편집 시트 — 제목·상세·절을 한 화면에서. `line < 0` 이면 «새 할 일» */
  const [esheet, setESheet] = useState<{ line: number; title: string; desc: string; section: string } | null>(null)
  /** 폰 «길게 눌러 끌어 옮기기» — 집힌 줄, 손가락 위치, 놓일 자리 */
  const [dr, setDr] = useState<{ line: number; dy: number; at: number } | null>(null)
  const drRef = useRef<{ line: number; y0: number; x0: number; held: boolean; timer: number; centers: number[]; lines: number[]; idx: number } | null>(null)
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

  /** 절을 바꾼다 — «완료» 경계를 넘으면 체크가 함께 바뀌고, 그 밖은 자리 이동만으로 절이 바뀐다 */
  const moveToSection = async (t: TodoItem, to: string) => {
    if (to === t.section) return
    if (isDoneSection(to) !== isDoneSection(t.section)) { await toggle(t); return }
    const first = items.find((x) => x.section === to)
    await api(`/bots/${bot.id}/todo/move`, { body: { line: t.line, before: first ? first.line : null } })
    setOpenRows(new Set()); await reload()
  }

  /** 편집 시트 저장 — 제목·상세를 쓰고, 절이 바뀌었으면 이어서 옮긴다 */
  const saveSheet = async () => {
    const e = esheet; if (!e) return
    const title = e.title.trim(); if (!title) { setESheet(null); return }
    if (e.line < 0) { await api(`/bots/${bot.id}/todo`, { body: { title, desc: e.desc.trim(), section: e.section } }); setESheet(null); await reload(); return }
    await api(`/bots/${bot.id}/todo/edit`, { body: { line: e.line, title, desc: e.desc.trim() } })
    setESheet(null); await reload()
    const t = items.find((x) => x.line === e.line)
    if (t && e.section !== t.section) await moveToSection({ ...t, title, desc: e.desc }, e.section)
  }

  /** 쓸어서 처리 — 폰에서만. 처음 움직임이 세로면 목록 스크롤에 양보하고 다시는 가로로 보지 않는다 */
  const run = async (t: TodoItem, act: SwipeAct) => {
    if (act === 'edit') { if (phone) setESheet({ line: t.line, title: t.title, desc: t.desc, section: t.section }); else startEdit(t) }
    else if (act === 'done') await toggle(t)
    else if (act === 'delete') await remove(t)
    else if (act === 'delegate') onDelegate(t)
    else if (act === 'expand') toggleRow(t)
    else if (act === 'menu') setSheet(t)
  }
  /**
   * 폰 목록 손가락 하나 — **쓸기 · 집기 · 스크롤을 한 핸들러에서 가른다**.
   * 🔴 종전에 두 핸들러(`swipeOn`·`dragOn`)를 따로 두고 JSX 에서 두 번 펼쳤더니 **뒤에 펼친 쪽이 앞을 덮어써서**
   *    쓸기가 통째로 죽었다(스모크가 잡았다). 같은 이벤트를 두 곳에서 받지 않는다.
   * 국면 판정은 `client/gesture.ts` 의 순수 함수 하나(유닛테스트로 고정).
   */
  const touchOn = (t: TodoItem, list: TodoItem[]) => (!phone ? {} : {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || edit === t.line) return
      const el = e.currentTarget as HTMLElement
      swRef.current = { line: t.line, x0: e.clientX, y0: e.clientY, w: el.getBoundingClientRect().width, on: false, last: null }
      const wrap = el.closest('.secb') as HTMLElement | null
      const rows = wrap ? (Array.from(wrap.querySelectorAll('[data-line]')) as HTMLElement[]) : []
      const mine = rows.filter((r) => list.some((x) => x.line === Number(r.dataset.line)))
      drRef.current = {
        line: t.line, y0: e.clientY, x0: e.clientX, held: false, idx: -1,
        centers: mine.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 }),
        lines: mine.map((r) => Number(r.dataset.line)),
        timer: window.setTimeout(() => {
          const r = drRef.current; if (!r || r.line !== t.line) return
          r.held = true; swRef.current = null; setSw(null); buzz(cfg.haptics, 16)
          setDr({ line: t.line, dy: 0, at: r.lines.indexOf(t.line) })
        }, HOLD_MS)
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drRef.current; if (!d || d.line !== t.line) return
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0
      const ph = decide(dx, dy, d.held)
      if (ph === 'drag') {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 합성 이벤트에서 던질 수 있다 */ }
        const rest = d.centers.filter((_, i) => d.lines[i] !== t.line)
        const at = dropIndex(rest, e.clientY)
        if (at !== d.idx) { d.idx = at; buzz(cfg.haptics, 6) }
        setDr({ line: t.line, dy, at }); return
      }
      if (ph === 'scroll') { window.clearTimeout(d.timer); drRef.current = null; swRef.current = null; setSw(null); return }
      if (ph !== 'swipe') return
      window.clearTimeout(d.timer)                       // 가로로 먼저 움직였다 — 집기는 취소
      const r = swRef.current; if (!r) return
      if (!r.on) { r.on = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 무시 */ } }
      const act = actOf(cfg, slotOf(dx, r.w))
      if (act !== r.last) { r.last = act; if (act) buzz(cfg.haptics) }
      setSw({ line: t.line, dx, w: r.w })
    },
    onPointerUp: () => {
      const d = drRef.current; drRef.current = null
      const r = swRef.current; swRef.current = null
      const curSw = sw; setSw(null)
      const curDr = dr; setDr(null)
      if (d) window.clearTimeout(d.timer)
      if (d?.held && curDr) {                            // 놓는다 — 그 자리에 들어간다
        const rest = d.lines.filter((l) => l !== t.line)
        const before = curDr.at >= rest.length ? null : rest[curDr.at]
        if (before !== t.line) void (async () => { await api(`/bots/${bot.id}/todo/move`, { body: { line: t.line, before } }); setOpenRows(new Set()); await reload() })()
        return
      }
      if (!r || !r.on || !curSw) return
      const act = actOf(cfg, slotOf(curSw.dx, curSw.w)); if (act) void run(t, act)
    },
    onPointerCancel: () => { const d = drRef.current; if (d) window.clearTimeout(d.timer); drRef.current = null; swRef.current = null; setSw(null); setDr(null) }
  })

  /**
   * 폰 행 (V19 승인분) — 동그란 체크 22px · 제목이 남은 폭을 **전부** 쓰고 두 줄까지 · ↳ 설명 한 줄.
   * ⛔ 오른쪽에 꺾쇠를 두지 않는다(그 자리가 «오른쪽 여백» 의 원인이었다) · ⛔ 태그·칩을 두지 않는다(Dave).
   * 탭하면 펼쳐져 상세 전체와 할 일거리가 나온다.
   */
  const phoneRow = (t: TodoItem, isOpen: boolean) => <div className={`ptodo ${t.done ? 'done' : ''} ${isOpen ? 'on' : ''}`} onClick={() => toggleRow(t)}>
    <button className="ring" onClick={(e) => { e.stopPropagation(); void toggle(t) }} aria-label={t.done ? '되돌리기' : '완료'}>{t.done ? <Icon n="check" size={12} color="var(--onAccent)" /> : null}</button>
    <div className="bd">
      <div className="tt">{t.title}</div>
      {t.desc && !isOpen ? <div className="dsub"><span className="ar">↳</span><span className="tx">{t.desc.replace(/\s*\n+\s*/g, ' · ').trim()}</span></div> : null}
      {isOpen ? <>
        {t.desc ? <div className="dsc">{t.desc}</div> : null}
        <div className="acts" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setESheet({ line: t.line, title: t.title, desc: t.desc, section: t.section })}><Icon n="edit" size={12} />편집</button>
          {!t.done ? <button onClick={() => onDelegate(t)}><Icon n="sub" size={12} />맡기기</button> : null}
          <button onClick={() => onOpenFile('todo.md')}><Icon n="doc" size={12} />문서에서 보기</button>
        </div>
      </> : null}
    </div>
  </div>

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
    if (phone) {
      const lifted = dr && dr.line === t.line
      const secList = secs.find(([, l]) => l.some((x) => x.line === t.line))?.[1] ?? []
      return <div key={t.line} data-line={t.line} className={`swwrap ${act ? 'armed' : ''} ${lifted ? 'lift' : ''}`}
        style={lifted ? { transform: `translateY(${dr!.dy}px)`, zIndex: 3 } : act ? { background: `color-mix(in srgb, ${ACT_COLOR[act]} ${long ? 100 : 45}%, var(--bg))` } : undefined}>
        {act && !lifted ? <div className={`swhint ${cur!.dx > 0 ? 'l' : 'r'}`}><span className={`cir ${long ? 'on' : ''}`} style={long ? { color: ACT_COLOR[act] } : undefined}><Icon n={ACT_ICON[act] as 'edit'} size={15} /></span>{long ? <b>{ACT_LABEL[act]}</b> : null}</div> : null}
        <div className="swrow" style={cur && !lifted ? { transform: `translateX(${Math.max(-0.72 * cur.w, Math.min(0.72 * cur.w, cur.dx))}px)`, transition: 'none' } : undefined}
          {...touchOn(t, secList)}>{phoneRow(t, isOpen)}</div>
      </div>
    }
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
        <span className="ib" title="새 할 일" onClick={(e) => { e.stopPropagation(); const sec0 = secs.find(([n2]) => !isDoneSection(n2))?.[0] ?? secs[0]?.[0] ?? ''; if (phone) setESheet({ line: -1, title: '', desc: '', section: sec0 }); else setAdding(sec0) }}><Icon n="plus" size={12} /></span>
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
            : !isDoneSection(name) ? <button className={`todo addbtn ${phone ? 'ph' : ''}`} onClick={() => (phone ? setESheet({ line: -1, title: '', desc: '', section: name }) : setAdding(name))}><span className="bx ghost dash" /><span>새 할 일</span></button> : null}
        </> : null}
      </div>)}
      {undo ? <div className="kv" style={{ color: 'var(--t3)' }}><span className="n">삭제했어요</span><button style={{ color: 'var(--t2)' }} onClick={() => void undoRemove()}>되돌리기</button></div> : null}
    </div> : null}
    {sheet ? <><div className="backdrop" onClick={() => setSheet(null)} /><div className="tsheet">
      <div className="grip" />
      <div className="ti">{sheet.title}</div>
      {([['edit', '편집'], ['delegate', '봇에게 맡기기'], ['done', sheet.done ? '되돌리기' : '완료로'], ['delete', '삭제']] as [SwipeAct, string][]).map(([a2, l]) => <button key={a2} onClick={() => { const t = sheet; setSheet(null); void run(t, a2) }}><Icon n={ACT_ICON[a2] as 'edit'} size={16} />{l}</button>)}
    </div></> : null}
    {esheet ? <><div className="backdrop" onClick={() => setESheet(null)} /><div className="tsheet esheet">
      <div className="grip" />
      <div className="eh2"><b>{esheet.line < 0 ? '새 할 일' : '할 일 고치기'}</b>{esheet.line >= 0 ? <button className="del" onClick={() => { const t = items.find((x) => x.line === esheet.line); setESheet(null); if (t && confirm(`«${t.title}» 을 지울까요?`)) void remove(t) }}>삭제</button> : null}</div>
      <label className="fld"><span>제목</span><input autoFocus value={esheet.title} placeholder="무엇을 할까요" onChange={(e) => setESheet({ ...esheet, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void saveSheet() }} /></label>
      <label className="fld"><span>상세</span><textarea rows={3} value={esheet.desc} placeholder="없어도 됩니다" onChange={(e) => setESheet({ ...esheet, desc: e.target.value })} /></label>
      <div className="fsec"><span>절</span><span className="seg">{secs.map(([n2]) => <button key={n2 || '_'} className={esheet.section === n2 ? 'on' : ''} onClick={() => setESheet({ ...esheet, section: n2 })}>{n2 || '할 일'}</button>)}</span></div>
      <div className="fbtn"><button className="cancel" onClick={() => setESheet(null)}>취소</button><button className="ok" onClick={() => void saveSheet()}>{esheet.line < 0 ? '추가' : '저장'}</button></div>
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
function Tree({ bot, phone, open, tog, onOpen, onAttach, onMention, onStartAt, onNewFolderAt, touched, tick, say, active }: { bot: Bot; phone?: boolean; open: boolean; tog: () => void; onOpen: (rel: string, pin?: boolean) => void; onAttach: (rel: string, dir?: boolean) => void; onMention: (rel: string) => void; onStartAt: (vaultRel: string, botId?: string) => void; onNewFolderAt: (vaultRel: string) => void; touched: string[]; tick?: number; say: (m: string) => void; active: string | null }) {
  const [dirs, setDirs] = useState<Record<string, Node[]>>({})
  const [exp, setExp] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(`fb:tree:${bot.id}`) ?? '[""]')) } catch { return new Set(['']) } })
  const [sort, setSort] = useState<'name' | 'mtime'>(() => (localStorage.getItem('fb:tsort') as 'name' | 'mtime') || 'name')
  const [filter, setFilter] = useState<string | null>(null)
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [ctx, setCtx] = useState<{ x: number; y: number; n: Node } | null>(null)
  const [sortMenu, setSortMenu] = useState(false)
  /**
   * 여러 개 고르기 (Rondo 이식 A6) — ⌘/⌃ 는 하나씩 더하고, ⇧ 는 **보이는 줄** 기준으로 사이를 채운다.
   * 🔴 «보이는 줄» 이 기준인 이유: 접힌 폴더 속까지 고르면 사람이 **안 본 것을 지우게** 된다.
   * ⚠ 고른 것은 화면에만 산다(새로 고치면 풀린다) — 되돌리기 어려운 일에 낡은 선택이 끼면 안 된다.
   */
  const [sel, setSel] = useState<Set<string>>(new Set())
  const lastSel = useRef<string | null>(null)
  const [hidden, setHidden] = useState(() => localStorage.getItem('fb:thidden') === '1')
  const [dropOn, setDropOn] = useState<string | null>(null)
  useEffect(() => { localStorage.setItem('fb:thidden', hidden ? '1' : '0') }, [hidden])
  const loadDir = async (rel: string) => { try { const l = await api<Node[]>(`/bots/${bot.id}/ls?dir=${encodeURIComponent(rel)}${hidden ? '&all=1' : ''}`); setDirs((d) => ({ ...d, [rel]: l })) } catch { /* */ } }
  useEffect(() => { setDirs({}); for (const d of exp) void loadDir(d) }, [hidden])
  useEffect(() => { setDirs({}); try { setExp(new Set(JSON.parse(localStorage.getItem(`fb:tree:${bot.id}`) ?? '[""]'))) } catch { setExp(new Set([''])) } }, [bot.id])
  useEffect(() => { localStorage.setItem(`fb:tree:${bot.id}`, JSON.stringify([...exp])); for (const d of exp) if (!dirs[d]) void loadDir(d) }, [exp, bot.id])
  useEffect(() => { localStorage.setItem('fb:tsort', sort) }, [sort])
  /**
   * 채팅의 **폴더 칩**이 «이 폴더 보여 줘» 하고 쏜다(`fb:reveal` · App.tsx `reveal`). 조상을 다 펼치고,
   * 그 폴더 자체도 펼치고, 1.4초 비춘다 — 봇이 파일을 건드렸을 때와 같은 몸짓이다.
   */
  useEffect(() => {
    const f = (e: Event) => {
      const rel = String((e as CustomEvent).detail ?? '')
      setExp((x) => { const n = new Set(x); const parts = rel.split('/').filter(Boolean); for (let i = 1; i <= parts.length; i++) n.add(parts.slice(0, i).join('/')); return n })
      if (rel) { setFlash(new Set([rel])); window.setTimeout(() => setFlash(new Set()), 1400) }
    }
    window.addEventListener('fb:reveal', f); return () => window.removeEventListener('fb:reveal', f)
  }, [])
  // 봇이 파일을 쓰면: 펼친 폴더는 다시 읽고, 건드린 파일의 조상을 펼쳐 1.4초 비춘다
  useEffect(() => { if (!tick) return; for (const d of exp) void loadDir(d) }, [tick])
  useEffect(() => {
    if (!touched.length) return
    const rels = touched.map((p) => (p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : null)).filter((x): x is string => !!x)
    if (!rels.length) return
    setExp((e) => { const n = new Set(e); for (const r of rels) { const parts = r.split('/'); for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join('/')) } return n })
    setFlash(new Set(rels)); const t = window.setTimeout(() => setFlash(new Set()), 1400); return () => window.clearTimeout(t)
  }, [touched])
  /**
   * ⌘F — 🔴 **지금 보고 있는 칸에서 찾는다** (2026-09-13 Dave). 문서 열에 커서가 있으면 편집기의
   *    찾기(CodeMirror)가 이기고, 파일 칸이면 여기서 이름을 거른다.
   * ⚠ 판정 순서가 중요하다: 글 쓰는 중(입력칸·`contenteditable`)이면 **아무것도 가로채지 않는다** —
   *    맥 기본과 편집기의 것이 이겨야 한다(단축키 계약).
   */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (t?.closest?.('.col.doc')) return
      e.preventDefault()
      setFilter((f) => (f === null ? '' : f))
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  /**
   * 새로 만들기 · 복제 · Finder — 전부 **호스트**가 한다(가드도 거기 있다).
   * ⚠ 만드는 자리는 «누른 것이 폴더면 그 안, 파일이면 그 옆» 이다 — 사람이 기대하는 자리가 그쪽이다.
   */
  // Finder 를 여는 주체는 **언제나 호스트**다 — 원격에서는 이름으로 그걸 먼저 말한다
  const store = useStore().s
  const main = store.device.main, hostName = store.hostName
  const dirOf = (n: Node) => (n.dir ? n.rel : n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : '')
  const makeNew = async (n: Node, kind: 'note' | 'folder') => {
    const name = await askName(kind === 'folder' ? '새 폴더 이름' : '새 노트 이름 (.md 는 자동)', kind === 'folder' ? '새 폴더' : '새 노트')
    if (!name) return
    try {
      const r = await api<{ rel: string }>(`/bots/${bot.id}/new`, { body: { dir: dirOf(n), name, kind } })
      say(`${r.rel} 만들었어요`)
      if (kind === 'note') onOpen(r.rel, true)
    } catch (e) { say((e as Error).message) }
  }
  const dup = async (n: Node) => {
    try { const r = await api<{ rel: string }>(`/bots/${bot.id}/copy`, { body: { rel: n.rel } }); say(`${r.rel} 로 복제했어요`) } catch (e) { say((e as Error).message) }
  }
  const reveal = async (n: Node) => {
    // ⛔ 훅을 콜백 안에서 부르지 않는다 — 호스트 이름은 컴포넌트에서 미리 받아 둔다
    await openOnThisDevice(bot, n.rel, 'reveal', { main, hostName, phone: !!phone, say })   // 원격이면 이 기기의 Finder (E)
  }
  /**
   * 이미지 복사 — 🔴 **그림 그대로** 클립보드에. 경로를 복사해 봐야 붙여넣는 쪽은 글자를 받는다.
   * ⚠ 브라우저가 클립보드에 바로 받아 주는 것은 **PNG 뿐**이라, 다른 형식은 캔버스로 한 번 굽는다.
   */
  const copyImage = async (rel: string) => { const r = await copyImageWhy(`/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`, main ? `${bot.abs}/${rel}` : undefined); say(r.ok ? '이미지를 복사했어요' : r.why ?? '이 환경에서는 이미지 복사를 못 해요') }
  /** 지금 다루는 대상 — 우클릭한 줄이 **고른 것 안에 있으면** 고른 것 전부, 아니면 그 줄 하나 */
  const targets = (n: Node): string[] => (sel.has(n.rel) && sel.size > 1 ? [...sel] : [n.rel])
  /**
   * 휴지통으로 — 🔴 **지우지 않고 옮긴다**(볼트 안 `.folderbot/trash/`). ⌘Z 로 되돌아온다.
   * ⚠ 여럿을 고르고 눌렀으면 **몇 개인지** 를 물어본다 — «하나인 줄 알았는데 열 개» 가 제일 아프다.
   */
  const toTrash = async (n: Node) => {
    const rels = targets(n)
    const what = rels.length > 1 ? `${rels.length}개` : n.name
    if (!confirm(`${what} 를 휴지통으로 옮길까요?\n\n볼트 안 .folderbot/trash 로 갑니다 — ⌘Z 로 되돌릴 수 있어요.`)) return
    try {
      const r = await api<{ to: string[]; failed: string[] }>(`/bots/${bot.id}/trash`, { body: { rels } })
      setSel(new Set())
      say(r.failed.length ? `${r.to.length}개 옮기고 ${r.failed.length}개는 못 옮겼어요` : `${what} 를 휴지통으로`)
      refreshOpen()
    } catch (e) { say((e as Error).message) }
  }
  /** 끌어다 놓아 옮기기 (A7) — 목적지는 **폴더 줄**이다. 같은 자리면 아무 일도 안 한다(호스트가 안다) */
  const moveTo = async (rels: string[], dir: string) => {
    if (!rels.length) return
    try {
      const r = await api<{ moved: { from: string; to: string }[]; failed: string[] }>(`/bots/${bot.id}/move`, { body: { rels, dir } })
      setSel(new Set())
      if (r.failed.length) say(`${r.moved.length}개 옮기고 ${r.failed.length}개는 못 옮겼어요`)
      else if (r.moved.length) say(`${r.moved.length > 1 ? `${r.moved.length}개를 ` : ''}${dir || '맨 위'} 로 옮겼어요`)
      refreshOpen()
    } catch (e) { say((e as Error).message) }
  }
  /** 펼쳐 둔 폴더를 다시 읽는다 — 옮기고 치운 뒤에 화면이 낡아 있으면 안 된다 */
  const refreshOpen = () => { for (const d of exp) void loadDir(d) }
  /**
   * ⌘Z — **파일 쪽 되돌리기**(옮기기·치우기). 호스트가 남긴 스냅샷 중 가장 최근 것을 무른다.
   * ⛔ 글 쓰는 중(입력칸·편집기)에는 가로채지 않는다 — 맥 기본과 CodeMirror 의 것이 이긴다.
   * ⚠ 문서 열에 커서가 있으면 그쪽 편집기의 ⌘Z 다. 판정 순서는 ⌘F 와 같다.
   */
  /**
   * ⌘C = 파일 복사(고른 것) · ⌥⌘C = 경로 복사 (M-3). 판정은 `core/copyIntent` —
   * 🔴 md 를 누르면 편집기가 초점을 **가져가므로**(Y · Dave: «md 한 개만 안 된다») 「트리 행을 누른 뒤 문서 창을 안 만졌다」(`armed`)면
   *    편집기에 초점이 있어도 파일 복사다. 문서 창을 클릭·타이핑하면 풀린다. 글을 고른 채면 언제나 브라우저·편집기에 양보.
   */
  const armed = useRef(false)
  useEffect(() => {
    // ⚠ ⌘C 자체는 «만진 것» 이 아니다 — 수식키 조합(⌘·⌃)과 수식키 단독은 무장을 안 푼다(안 그러면 이 감시자가 ⌘C 를 먼저 받아 늘 풀어 버린다)
    const disarm = (e: Event) => { const ke = e as KeyboardEvent; if (e.type === 'keydown' && (ke.metaKey || ke.ctrlKey || ['Meta', 'Control', 'Alt', 'Shift'].includes(ke.key))) return; const t = e.target as HTMLElement | null; if (t?.closest?.('.col.doc')) armed.current = false }
    window.addEventListener('pointerdown', disarm, true); window.addEventListener('keydown', disarm, true)
    return () => { window.removeEventListener('pointerdown', disarm, true); window.removeEventListener('keydown', disarm, true) }
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || !(e.metaKey || e.ctrlKey) || e.shiftKey) return
      const t = e.target as HTMLElement | null
      const rels = sel.size ? [...sel] : active ? [active] : []
      const editable = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const verdict = copyIntent({ picked: rels.length, hasSelection: !!window.getSelection()?.toString(), inTree: !!t?.closest?.('.trow'), editable, inDoc: !!t?.closest?.('.col.doc'), armed: armed.current })
      if (verdict !== 'files') return
      e.preventDefault()
      if (e.altKey) { void copySay(rels.map((r) => `${bot.abs}/${r}`).join('\n'), say, '경로를 복사했어요'); return }
      void copyFiles(bot, rels, { main, hostName, phone: !!phone, say })
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [sel, active, bot, main, hostName, phone]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = async (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (t?.closest?.('.col.doc')) return
      e.preventDefault()
      try {
        const list = await api<{ t: number; op: string; from: string; to: string }[]>('/undo')
        if (!list.length) { say('되돌릴 게 없어요'); return }
        await api('/undo', { body: { t: list[0].t } })
        say(`되돌렸어요 — ${list[0].from.split('/').pop()}`)
        refreshOpen()
      } catch (e2) { say((e2 as Error).message) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [exp, bot.id])
  useEffect(() => { if (!ctx) return; const off = () => setCtx(null); window.addEventListener('click', off); window.addEventListener('keydown', off); return () => { window.removeEventListener('click', off); window.removeEventListener('keydown', off) } }, [ctx])
  const rows = useMemo(() => {
    const out: { n: Node; depth: number }[] = []
    const q = filter?.trim() ?? ''
    const walk = (rel: string, depth: number) => {
      let list = dirs[rel] ?? []
      if (sort === 'mtime') list = [...list].sort((a, b) => (a.dir === b.dir ? b.mtime - a.mtime : a.dir ? -1 : 1))
      for (const n of list) {
        const hit = !q || scoreName(q, n.name, n.rel) > 0
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
        <span style={{ position: 'relative' }}><span className={`ib ${sort !== 'name' ? 'on' : ''}`} title="정렬" onClick={() => setSortMenu(!sortMenu)}><Icon n="sort" size={12} /></span>{sortMenu ? <div className="menu" style={{ right: 0, top: 26 }} onClick={() => setSortMenu(false)}><div className="h">정렬</div><button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}><span style={{ flex: 1 }}>이름 (폴더 먼저)</span>{sort === 'name' ? <Icon n="check" size={11} /> : null}</button><button className={sort === 'mtime' ? 'on' : ''} onClick={() => setSort('mtime')}><span style={{ flex: 1 }}>수정순 — 최근 변경</span>{sort === 'mtime' ? <Icon n="check" size={11} /> : null}</button><hr /><button className={hidden ? 'on' : ''} onClick={() => setHidden(!hidden)}><span style={{ flex: 1 }}>숨김 파일 보기</span>{hidden ? <Icon n="check" size={11} /> : null}</button></div> : null}</span>
        <span className={`ib ${filter !== null ? 'on' : ''}`} title="이름으로 거르기" onClick={() => setFilter(filter === null ? '' : null)}><Icon n="search" size={12} /></span>
        <span className="ib" title="모두 접기" onClick={() => setExp(new Set(['']))}><Icon n="collapse" size={12} style={{ transform: 'rotate(90deg)' }} /></span>
      </span></button>
    {open ? <>
      {filter !== null ? <div className="tfilter"><Icon n="search" size={12} /><input autoFocus placeholder="이름으로 거르기…" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setFilter(null) }} /><span onClick={() => setFilter(null)} style={{ cursor: 'pointer' }}><Icon n="x" size={11} /></span></div> : null}
      <div className="secb" style={{ padding: '0 6px 8px' }}>
        {rows.map(({ n, depth }, ri) => <button key={n.rel} className={`trow ${n.dir ? 'dir' : ''} ${active === n.rel ? 'on' : ''} ${sel.has(n.rel) ? 'sel' : ''} ${dropOn === n.rel ? 'dover' : ''} ${flash.has(n.rel) ? 'flash' : ''}`} style={{ ['--pad' as string]: `${10 + depth * 14}px` }}
          /**
           * ⌘/⌃ 하나씩 더하기 · ⇧ 사이 채우기 · 맨 클릭은 **열기**(고른 것은 풀린다).
           * ⚠ 「고르기」와 「열기」를 같은 클릭에 태우면 파일을 고를 때마다 문서가 열려 탭이 쌓인다.
           */
          onClick={(e) => {
            armed.current = true   // 트리를 만졌다 — 문서 창이 초점을 가져가도 다음 ⌘C 는 파일 복사(copyIntent)
            if (e.metaKey || e.ctrlKey) { setSel((p2) => { const x = new Set(p2); if (x.has(n.rel)) x.delete(n.rel); else x.add(n.rel); return x }); lastSel.current = n.rel; return }
            if (e.shiftKey && lastSel.current) {
              const a = rows.findIndex((r) => r.n.rel === lastSel.current)
              if (a >= 0) { const [lo, hi] = a < ri ? [a, ri] : [ri, a]; setSel(new Set(rows.slice(lo, hi + 1).map((r) => r.n.rel))); return }
            }
            setSel(new Set()); lastSel.current = n.rel
            if (n.dir) toggleDir(n.rel); else onOpen(n.rel)
          }}
          onDoubleClick={() => { if (!n.dir) onOpen(n.rel, true) }}
          onContextMenu={(e) => { e.preventDefault(); if (!sel.has(n.rel)) setSel(new Set()); setCtx({ x: e.clientX, y: e.clientY, n }) }} title={n.rel}
          draggable
          onDragStart={(e) => {
            // 고른 것 안을 끌면 **고른 것 전부**가 따라온다 — 하나만 가면 «내가 고른 건 뭐였지» 가 된다
            const rels = targets(n)
            e.dataTransfer.setData('text/x-fb-rel', n.rel)
            e.dataTransfer.setData('text/x-fb-rels', JSON.stringify(rels))
            e.dataTransfer.setData('text/x-fb-dir', n.dir ? '1' : '0')
            e.dataTransfer.setData('text/plain', rels.map((r) => `${bot.abs}/${r}`).join('\n'))
          }}
          onDragOver={(e) => { if (!n.dir || !e.dataTransfer.types.includes('text/x-fb-rels')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropOn(n.rel) }}
          onDragLeave={() => setDropOn((x) => (x === n.rel ? null : x))}
          onDrop={(e) => {
            setDropOn(null)
            if (!n.dir) return
            const raw = e.dataTransfer.getData('text/x-fb-rels')
            if (!raw) return
            e.preventDefault(); e.stopPropagation()
            try { void moveTo(JSON.parse(raw) as string[], n.rel) } catch { /* */ }
          }}>
          <span className="cv">{n.dir ? <Icon n={exp.has(n.rel) ? 'chevd' : 'chev'} size={9} /> : null}</span><Icon n={n.dir ? 'folder' : 'doc'} size={12} color={n.dir && exp.has(n.rel) ? 'var(--wait)' : 'var(--t3)'} /><span className="n"><Mid s={n.name} /></span>{n.botId ? <span className="dot run" title="봇 있음" style={{ width: 5, height: 5 }} /> : null}<time>{flash.has(n.rel) ? '방금' : fmtTime(n.mtime)}</time>
        </button>)}
        {!rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>{dirs[''] ? '비어 있어요' : <><div className="skel" style={{ width: '70%' }} /></>}</div> : null}
        {/* ⚠ 맨 위(봇 폴더 자체)로 돌려놓을 자리 — 하위 폴더에서 꺼낼 길이 없으면 끌어 놓기가 한 방향뿐이다 */}
        <div className={`tdrop ${dropOn === '' ? 'dover' : ''}`}
          onDragOver={(e) => { if (!e.dataTransfer.types.includes('text/x-fb-rels')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropOn('') }}
          onDragLeave={() => setDropOn((x) => (x === '' ? null : x))}
          onDrop={(e) => { setDropOn(null); const raw = e.dataTransfer.getData('text/x-fb-rels'); if (!raw) return; e.preventDefault(); try { void moveTo(JSON.parse(raw) as string[], '') } catch { /* */ } }}>여기로 끌면 맨 위로</div>
      </div>
    </> : null}
    {ctx ? <Float at={{ x: ctx.x, y: ctx.y }} onClose={() => setCtx(null)} className="menu ctx">
      {/* ⚠ 여럿을 고른 채 우클릭했으면 **몇 개를 다루는지** 를 먼저 말한다 — 되돌리기 어려운 항목이 아래 있다 */}
      {sel.has(ctx.n.rel) && sel.size > 1 ? <div className="h">{sel.size}개 고름</div> : null}
      {sel.has(ctx.n.rel) && sel.size > 1 ? null : !ctx.n.dir ? <><button onClick={() => onOpen(ctx.n.rel, true)}><span style={{ flex: 1 }}>열기 (고정 탭)</span><span className="k">⏎</span></button><button onClick={() => onAttach(ctx.n.rel)}><span style={{ flex: 1 }}>첨부로 보내기</span></button><button onClick={() => onMention(ctx.n.rel)}><span style={{ flex: 1 }}>@ 로 언급하기</span><span className="k">@</span></button></>
        : <>{ctx.n.botId ? <button className="on" onClick={() => onStartAt(vaultRel(ctx.n.rel), ctx.n.botId)}><Icon n="sub" size={12} /><span style={{ flex: 1 }}>봇 열기</span><span className="k">⏎</span></button> : <button className="on" onClick={() => onStartAt(vaultRel(ctx.n.rel))}><Icon n="sub" size={12} /><span style={{ flex: 1 }}>{bot.orchestrator ? '여기서 에이전트 시작' : '이 하위 폴더로 새 봇 시작'}</span><span className="k">⏎</span></button>}<button onClick={() => onNewFolderAt(vaultRel(ctx.n.rel))}><Icon n="fplus" size={12} /><span style={{ flex: 1 }}>새 폴더 만들기 → 시작</span></button><hr /><button onClick={() => toggleDir(ctx.n.rel)}><span style={{ flex: 1 }}>{exp.has(ctx.n.rel) ? '접기' : '펼치기'}</span></button><button onClick={() => onAttach(ctx.n.rel, true)}><span style={{ flex: 1 }}>폴더째 첨부</span></button></>}
      {/* 이미지는 **그림 그대로** 클립보드에 — 붙여넣기로 슬랙·문서에 바로 들어간다 */}
      {!ctx.n.dir && IMG_RE.test(ctx.n.rel) ? <button onClick={() => void copyImage(ctx.n.rel)}><span style={{ flex: 1 }}>이미지 복사</span></button> : null}
      {/* M-3 · 파일 자체를 복사 — Finder ⌘V·카톡 첨부. 원격은 캐시로 받은 사본(진행·취소), 폰은 공유 시트 */}
      <button onClick={() => { const rels = sel.has(ctx.n.rel) && sel.size > 1 ? [...sel] : [ctx.n.rel]; void copyFiles(bot, rels, { main, hostName, phone: !!phone, say }) }}><Icon n="copy" size={12} /><span style={{ flex: 1 }}>{phone ? '공유…' : `${ctx.n.dir ? '폴더' : '파일'} 복사${sel.has(ctx.n.rel) && sel.size > 1 ? ` (${sel.size}개)` : ''}`}</span><span className="k">{phone ? '' : '⌘C'}</span></button>
      <button onClick={() => { void copySay(`${bot.abs}/${ctx.n.rel}`, say, '경로를 복사했어요') }}><span style={{ flex: 1 }}>경로 복사</span><span className="k">⌥⌘C</span></button>
      <button onClick={() => { void copySay(ctx.n.rel, say, '상대 경로를 복사했어요') }}><span style={{ flex: 1 }}>경로 복사 (폴더 기준)</span></button>
      {sel.has(ctx.n.rel) && sel.size > 1 ? null : <button onClick={() => rename(ctx.n)}><span style={{ flex: 1 }}>이름 바꾸기</span></button>}
      <button onClick={() => void dup(ctx.n)}><span style={{ flex: 1 }}>복제</span></button>
      {/* 🔴 **지우지 않고 옮긴다** — 볼트 안 `.folderbot/trash/` 로. ⌘Z 로 돌아온다 */}
      <button className="warn" onClick={() => void toTrash(ctx.n)}><Icon n="x" size={12} /><span style={{ flex: 1 }}>휴지통으로{sel.has(ctx.n.rel) && sel.size > 1 ? ` (${sel.size}개)` : ''}</span><span className="k">⌫</span></button>
      {/**
        * ⚠ 「열기」와 다른 일이다 — 파일을 여는 게 아니라 **어디 있는지** 보여 준다.
        * 🔴 **원격에서도 보인다** (2026-09-14 Dave: «폴더에서 우클릭 메뉴에 finder에서 보기가 없네»).
        *    종전에는 메인(호스트 맥)에서만 그렸다 — 원격 맥에서 보던 Dave 에게는 **없는 기능**으로 보였다.
        *    여는 주체는 언제나 호스트이므로, 원격에서는 이름을 「메인 맥에서 Finder 로」 로 바꿔
        *    **어디서 열리는지**를 먼저 말한다(문서 도구줄의 「메인 맥에서 열기」와 같은 규칙).
        * ⛔ 숨기지 마라 — 안 보이면 «이 앱엔 없는 기능» 이 되고, 그건 있는 기능을 잃는 것이다.
        */}
      <button onClick={() => void reveal(ctx.n)}><span style={{ flex: 1 }}>Finder 에서 보기</span>{main ? null : <span className="k">{localBridge() ? '이 기기' : phone ? '맥에서만' : '내려받기'}</span>}</button>
      <hr />
      <button onClick={() => void makeNew(ctx.n, 'note')}><Icon n="doc" size={12} /><span style={{ flex: 1 }}>새 노트</span></button>
      <button onClick={() => void makeNew(ctx.n, 'folder')}><Icon n="folder" size={12} /><span style={{ flex: 1 }}>새 폴더</span></button>
      <hr /><button onClick={() => setExp(new Set(['']))}><span style={{ flex: 1 }}>모두 접기</span></button>
    </Float> : null}
  </>
}

export function BotGlyph({ bot, size = 16, working = false }: { bot: Bot; size?: number; working?: boolean }) { return <FolderBot color={bot.color} size={size} mood={working ? 'work' : 'idle'} mono /> }
export const useTick = (ms = 1000) => { const [, set] = useState(0); const r = useRef(0); useEffect(() => { const t = window.setInterval(() => set(++r.current), ms); return () => window.clearInterval(t) }, [ms]) }
