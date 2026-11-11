import { useEffect, useMemo, useState } from 'react'
import type { ChatItem } from '../core/types'
import { TASK_KIND_LABEL, TASK_STATUS_LABEL, canStopTask, groupTasks, taskTook, type BgTask } from '../core/bgTasks'
import { mdPlain } from '../core/mdPlain'
import { api } from './api'
import { Icon } from './FolderBot'
import { Md } from './Sheets'
import { fmtElapsed, useStore } from './store'

/**
 * EA · **뒤에서 도는 일** (2026-11-11 Dave 승인 «맡긴 에이전트를 보고 멈춘다»).
 *
 * 봇이 맡긴 서브에이전트와 뒤에서 도는 셸을 세션마다 한 목록으로 보인다 — 「도는 중 N」 · 「끝남 N」.
 * 줄마다 [열기](에이전트 → 대화의 열어 보는 화면)와 [멈추기](도는 것만 · 그 작업 하나만)가 있다.
 * 같은 목록을 두 자리에서 쓴다: 데스크톱은 오른쪽 패널의 한 절(`TaskSec`), 폰은 바닥 시트(`TaskSheet`).
 *
 * 🔴 **폰에는 올리기(hover)가 없다** — 단추는 늘 보인다. 줄을 눌러야만 되는 일은 없다.
 * ⚠ 목록의 정본은 호스트다(`core/bgTasks` · `session.ts`). 화면은 받아 그리기만 하고, 멈춘 뒤의 상태도 호스트가 보내는 줄로 바뀐다.
 */
const EMPTY: BgTask[] = []
export const TASK_ICON = { agent: 'sub', shell: 'run', other: 'task' } as const
type Sub = Extract<ChatItem, { kind: 'subagent' }>

/** 이 세션의 맡긴 일 — 아직 못 받았으면 빈 목록 */
export function useTasks(sid?: string): BgTask[] { const { s } = useStore(); return (sid ? s.tasks[sid] : undefined) ?? EMPTY }

/** 작업 하나 멈추기 — 됐는지를 그 자리에서 말한다. 상태 줄은 호스트가 보내는 `task` 프레임이 바꾼다 */
export async function stopOneTask(sid: string, taskId: string, say: (m: string) => void, name?: string): Promise<boolean> {
  try { await api(`/sessions/${sid}/tasks/${encodeURIComponent(taskId)}/stop`, { body: {} }); say(name ? `멈췄어요 · ${name}` : '멈췄어요'); return true } catch (e) { say((e as Error).message); return false }
}

/** 끝난 줄의 요약 한 줄 — 마크다운 표식(`##`·`-`·`**`)은 걷고(`core/mdPlain`) 200자까지. 전문은 열어 보는 화면에 있다 */
export function summaryLine(text: string): string { return mdPlain(text.slice(0, 1200)).slice(0, 200) }

/** 1초마다 다시 그리는 경과 — 도는 줄에만 쓴다 */
function Ticking({ from }: { from: number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t) }, [])
  return <>{fmtElapsed(from)}</>
}

function TaskRow({ t, sid, canOpen, onOpen, say }: { t: BgTask; sid: string; canOpen: boolean; onOpen?: (itemId: string) => void; say: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const run = t.status === 'run'
  const stop = async () => { if (!t.taskId || busy) return; setBusy(true); await stopOneTask(sid, t.taskId, say, t.name); setBusy(false) }
  const bits = [
    busy ? '멈추는 중' : TASK_STATUS_LABEL[t.status],
    ...(t.kind === 'agent' ? [`도구 ${t.tools ?? 0}`] : []),
    ...(t.subagentType ? [t.subagentType] : t.kind !== 'agent' ? [TASK_KIND_LABEL[t.kind]] : []),
  ]
  return <div className={`bgt ${t.status} ${t.kind}`} data-task={t.id} data-status={t.status}>
    <span className="ki" title={TASK_KIND_LABEL[t.kind]}>{run ? <span className="spin run" /> : <Icon n={t.status === 'done' ? 'check' : t.status === 'stopped' ? 'stop' : 'x'} size={11} color={t.status === 'done' ? 'var(--done)' : t.status === 'error' ? 'var(--err)' : 'var(--t3)'} />}</span>
    <span className="tb">
      {/* 이름 옆에 단추, 상태 줄은 그 아래 줄 전체를 쓴다 — 단추와 한 줄에 두면 좁은 패널·폰에서 상태가 «…» 로 잘렸다(캡처 실측) */}
      <span className="r1"><span className="nm" title={t.name}><Icon n={TASK_ICON[t.kind]} size={11} color="var(--t3)" />{t.name}</span>
        <span className="ac">
          {run ? <button className="stopb" disabled={!canStopTask(t) || busy} onClick={() => void stop()} title={canStopTask(t) ? '이 작업 하나만 멈춰요' : '시작 신호를 기다리는 중이에요 — 곧 멈출 수 있어요'}><Icon n="stop" size={8} />멈추기</button> : null}
          {canOpen && onOpen ? <button className="openb" onClick={() => onOpen(`t_${t.toolUseId}`)} title="무엇을 시켰고 무엇을 했는지 열어 봐요">열기<Icon n="chev" size={9} /></button> : null}
        </span>
      </span>
      <span className="st"><span className="el">{run ? <Ticking from={t.startedAt} /> : taskTook(t, Date.now())}</span> · {bits.join(' · ')}{run && t.last ? <> · <span className="la">{t.last}</span></> : null}</span>
      {!run && t.summary ? <span className="sm" title={t.summary.slice(0, 600)}>{summaryLine(t.summary)}</span> : null}
    </span>
  </div>
}

/**
 * 목록 본체 — 「도는 중 N」 은 늘 펼쳐 있고, 「끝남 N」 은 접을 수 있다(도는 것이 있으면 접힌 채로 시작한다 — 지금 볼 것은 도는 쪽이다).
 * `openIds` 는 이 화면이 들고 있는 대화 속 서브에이전트 줄의 id 들이다 — 대화에 그 줄이 있어야 [열기] 가 된다.
 */
export function TaskList({ sid, tasks, openIds, onOpen, say }: { sid: string; tasks: BgTask[]; openIds: Set<string>; onOpen?: (itemId: string) => void; say: (m: string) => void }) {
  const { running, finished } = useMemo(() => groupTasks(tasks), [tasks])
  const [finOpen, setFinOpen] = useState<boolean | null>(null)
  const showFin = finOpen ?? running.length === 0
  const row = (t: BgTask) => <TaskRow key={t.id} t={t} sid={sid} canOpen={t.kind === 'agent' && !!t.toolUseId && openIds.has(`t_${t.toolUseId}`)} onOpen={onOpen} say={say} />
  if (!tasks.length) return <div className="bgtasks"><div className="bgt-empty">아직 맡긴 일이 없어요. 봇이 서브에이전트나 긴 명령을 맡기면 여기서 보고 멈출 수 있어요.</div></div>
  return <div className="bgtasks">
    <div className="bgt-h"><span>도는 중</span><span className="c">{running.length}</span></div>
    {running.length ? running.map(row) : <div className="bgt-empty">지금 도는 일은 없어요</div>}
    {finished.length ? <button className="bgt-h fin" onClick={() => setFinOpen(!showFin)} aria-expanded={showFin}><Icon n={showFin ? 'chevd' : 'chev'} size={9} /><span>끝남</span><span className="c">{finished.length}</span></button> : null}
    {finished.length && showFin ? finished.map(row) : null}
  </div>
}

/** 대화가 들고 있는 서브에이전트 줄의 id — [열기] 를 켤지 정한다 */
export function subItemIds(items: readonly ChatItem[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const it of items ?? []) if (it.kind === 'subagent') out.add(it.id)
  return out
}

/** 데스크톱 · 오른쪽 패널의 한 절. 맡긴 일이 한 번도 없던 세션에는 절 자체를 세우지 않는다(패널에 빈 머리줄을 늘리지 않는다) */
export function TaskSec({ sid, open, tog, say }: { sid?: string; open: boolean; tog: () => void; say: (m: string) => void }) {
  const { s } = useStore()
  const tasks = useTasks(sid)
  const openIds = useMemo(() => subItemIds(sid ? s.chats[sid] : undefined), [sid, sid ? s.chats[sid] : undefined])
  if (!sid || !tasks.length) return null
  const run = tasks.filter((t) => t.status === 'run').length
  return <div className="sec fix bgsec">
    <button className="sech" onClick={tog}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>뒤에서 도는 일</span>{run ? <span className="c bgc" title={`도는 중 ${run}`}>{run}</span> : <span className="c">{tasks.length}</span>}{run ? <span className="dot run" /> : null}</button>
    {open ? <div className="secb bgsb"><TaskList sid={sid} tasks={tasks} openIds={openIds} onOpen={(id) => window.dispatchEvent(new CustomEvent('fb:drill', { detail: { sid, id } }))} say={say} /></div> : null}
  </div>
}

/** 폰 · 바닥 시트. 진행 줄의 단추로 연다 */
export function TaskSheet({ sid, tasks, openIds, onOpen, onClose, say }: { sid: string; tasks: BgTask[]; openIds: Set<string>; onOpen: (itemId: string) => void; onClose: () => void; say: (m: string) => void }) {
  const run = tasks.filter((t) => t.status === 'run').length
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="tsheet bgsheet" role="dialog" aria-label="뒤에서 도는 일">
      <div className="grip" />
      <div className="bgsh"><b>뒤에서 도는 일</b><span className="c">{run ? `도는 중 ${run}` : `끝남 ${tasks.length}`}</span><button className="xb" onClick={onClose}>닫기</button></div>
      <div className="bgsb"><TaskList sid={sid} tasks={tasks} openIds={openIds} onOpen={(id) => { onClose(); onOpen(id) }} say={say} /></div>
    </div>
  </>
}

interface Written { state: 'ok' | 'missing'; texts: string[]; total: number; truncated: boolean }
/**
 * 열어 보는 화면의 아래쪽 — ① 마지막 결과 전문(마크다운) ② 「서브에이전트가 쓴 글 보기」.
 *
 * 🔴 종전에는 결과가 카드에서 300자로 잘렸고 여기에는 아예 없었다. 서브에이전트가 도중에 쓴 글은 어디에도 없었다.
 * ⚠ 쓴 글은 **눌렀을 때만** 읽는다 — CLI 기록 파일은 수 MB 라서 열 때마다 읽지 않는다. 도는 중이면 [다시 읽기] 로 이어 본다.
 */
export function SubDetail({ sub, sid, botId, onFile, say }: { sub: Sub; sid: string; botId: string; onFile?: (rel: string) => void; say: (m: string) => void }) {
  const [w, setW] = useState<Written | 'loading' | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setW(null) }, [sub.id])
  const load = async () => {
    if (!sub.taskId) return
    setW('loading')
    try { setW(await api<Written>(`/sessions/${sid}/tasks/${encodeURIComponent(sub.taskId)}/transcript`)) } catch (e) { setW(null); say((e as Error).message) }
  }
  const stop = async () => { if (!sub.taskId || busy) return; setBusy(true); await stopOneTask(sid, sub.taskId, say, sub.name); setBusy(false) }
  const run = sub.status === 'run'
  return <div className="drill-r">
    <div className="meta" style={{ cursor: 'default' }}>{run ? '아직 도는 중' : sub.stopped ? '멈춘 자리' : sub.status === 'error' ? '실패한 자리' : '결과'}</div>
    {run ? <div className="dr-run"><span className="spin run" /><span>끝나면 결과가 여기에 보여요</span>{sub.taskId ? <button className="stopb" disabled={busy} onClick={() => void stop()}><Icon n="stop" size={8} />{busy ? '멈추는 중' : '멈추기'}</button> : null}</div>
      : sub.result ? <div className="dr-res"><Md text={sub.result} botId={botId} onPath={onFile} /></div>
        : <div className="dr-none">남긴 결과가 없어요</div>}
    <div className="drill-w">
      {w === null ? <button className="wbtn" disabled={!sub.taskId} onClick={() => void load()}><Icon n="doc" size={12} />서브에이전트가 쓴 글 보기</button> : null}
      {w === null && !sub.taskId ? <div className="dr-none">이 작업은 기록 파일을 찾을 단서(작업 id)가 없어요</div> : null}
      {w === 'loading' ? <div className="dr-none">기록을 읽는 중…</div> : null}
      {w && w !== 'loading' && w.state === 'missing' ? <div className="dr-none" data-written="missing">기록 파일이 없어요 — 오래돼 지워졌거나 이 기기에서 돈 작업이 아니에요</div> : null}
      {w && w !== 'loading' && w.state === 'ok' ? <>
        <div className="meta" style={{ cursor: 'default' }}><span>서브에이전트가 쓴 글 {w.texts.length}개</span>{w.truncated ? <span className="cut">앞쪽은 줄였어요 · 전체 {w.total}개 중 마지막 {w.texts.length}개</span> : null}<span className="sp" /><button className="rld" onClick={() => void load()}>다시 읽기</button></div>
        {w.texts.length ? w.texts.map((t, i) => <div className="dr-wt" key={i}><Md text={t} botId={botId} onPath={onFile} /></div>) : <div className="dr-none" data-written="empty">글은 남기지 않았어요 — 도구만 썼어요</div>}
      </> : null}
    </div>
  </div>
}
