import { useEffect, useMemo, useState } from 'react'
import { botDueChip } from '../core/botName'
import { dueChipOf, dueText } from '../core/due'
import { BOARD_FILTER_LABEL, BOARD_PEEK, boardRows, folderGroup, type BoardFilter, type BoardItem, type FolderGroup } from '../core/home'
import type { Bot, SessionInfo } from '../core/types'
import { api } from './api'
import { FolderBot, Icon, type Mood } from './FolderBot'
import { fmtTime, useStore } from './store'

/**
 * 🔴 **CJ R2 · 전체 할 일 보드** (2026-10-16 Dave «전부 추천대로» · 기획안 §2-3 · 목업 `03_디자인/2026-10-16_홈-네-칸-목업` ②
 *    · 할일-채팅 목업 ④ 의 폴더 머리 «Akiflow 맞음 · N분 전»).
 * 볼트 할 일을 평평하게 늘어놓으면 아무것도 안 남는다 — **폴더로 묶고 마감이 가까운 폴더부터**(레일 «마감일» 과 같은 `byDue`), 폴더마다 3줄만 펴고 «더 보기 N».
 * 줄 왼쪽 칸 = 완료(`/bots/:id/todo/toggle` 그대로) · 줄을 누르면 그 폴더의 할 일 패널로 간다.
 * 제안(`<!-- bot:proposed -->`)은 정식 할 일이 아니라 보드에 줄로 세우지 않는다 — 폴더 머리에 «제안 N» 만 보이고, 누르면 그 폴더 패널의 제안 칸으로 간다.
 * ⚠ 호스트가 옛 판이면(`items` 없음) 보드를 그릴 줄이 없다 — 맥미니 앱을 올려야 한다고 말한다(지어내지 않는다).
 * 맥은 가운데 큰 창(세션 정리 창 크기) · 폰은 아래에서 올라오는 전체 높이 시트(같은 `.modal.board` 를 폰 CSS 가 덮는다).
 */
interface BoardData { open: number; items?: boolean; akLive?: boolean; rows: { botId: string; name: string; open: number; proposed?: number; items?: BoardItem[]; ak?: { pending: number; at: number | null } | null }[] }

const agoMin = (t: number) => { const m = Math.max(0, Math.round((Date.now() - t) / 60_000)); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 24 * 60 ? `${Math.round(m / 60)}시간 전` : fmtTime(t) }

export function TodoBoard({ onClose, onTodo, say }: { onClose: () => void; onTodo: (botId: string) => void; say: (m: string) => void }) {
  const { s } = useStore()
  const [data, setData] = useState<BoardData | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<BoardFilter>('all')
  const [q, setQ] = useState('')
  const [more, setMore] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const load = () => api<BoardData>('/todos?items=1').then((d) => { setData(d); setErr('') }).catch((e) => setErr((e as Error).message))
  useEffect(() => { void load() }, [])
  // 봇이 할 일을 고치면 알림이 오거나 파일이 바뀐다 — 열려 있는 동안 따라간다
  // ⚠ 할 일 프레임(`ev:'todo'`)·파일 바뀜도 따라간다 — 줄 번호가 밀린 채 체크하면 엉뚱한 줄이 끝난다(리뷰 10/16 · 호스트도 제목으로 한 번 더 막는다)
  useEffect(() => { if (!data) return; const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t) }, [s.notifications[0]?.id, s.todos, s.filesTick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const oldHost = !!data && !data.items
  const rows = useMemo(() => (data?.items ? boardRows(s.bots, data.rows.map((r) => ({ botId: r.botId, items: r.items ?? [] })), filter, q) : []), [data, s.bots, filter, q])
  const meta = useMemo(() => new Map((data?.rows ?? []).map((r) => [r.botId, r])), [data])
  const folders = (data?.rows ?? []).filter((r) => r.open > 0).length
  const check = async (botId: string, t: BoardItem) => {
    const k = `${botId}:${t.line}`; if (busy) return
    setBusy(k)
    try { await api(`/bots/${botId}/todo/toggle`, { body: { line: t.line, done: true, title: t.title } }); say(`«${t.title}» 완료`) } catch (e) { say((e as Error).message) } finally { await load(); setBusy('') }
  }
  const open = (botId: string) => { onClose(); onTodo(botId) }
  return <><div className="backdrop" onClick={onClose} /><div className="modal board" role="dialog" aria-label="할 일">
    <div className="grip" />
    <div className="modal-h"><div className="t"><b>할 일</b><span className="cnt">{data ? `열린 ${data.open} · 폴더 ${folders}` : ''}</span></div><button className="ib" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button></div>
    <div className="bsearch"><Icon n="search" size={14} color="var(--t3)" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="할 일 찾기" aria-label="할 일 찾기" />{q ? <button className="ib" onClick={() => setQ('')} aria-label="지우기"><Icon n="x" size={12} /></button> : null}</div>
    <div className="bbar">{(Object.keys(BOARD_FILTER_LABEL) as BoardFilter[]).map((f) => <button key={f} className={`pill ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{BOARD_FILTER_LABEL[f]}</button>)}</div>
    <div className="bbody">
      {err ? <div className="bempty">할 일을 못 읽었어요 — {err}</div> : null}
      {!data && !err ? <div className="bempty">읽는 중…</div> : null}
      {oldHost ? <div className="bempty">이 보드는 맥미니 앱이 새 판이어야 보여요. 맥미니에서 업데이트 칩을 눌러 주세요.</div> : null}
      {data?.items && !rows.length ? <div className="bempty">{q || filter !== 'all' ? '이 거름에 걸리는 할 일이 없어요' : '열린 할 일이 없어요'}</div> : null}
      {rows.map(({ bot, items, total }) => {
        const m = meta.get(bot.id); const ch = botDueChip(bot); const all = more.has(bot.id)
        const shown = all ? items : items.slice(0, BOARD_PEEK)
        return <div key={bot.id} className="bfold" data-bot={bot.id}>
          <button className="fh" onClick={() => open(bot.id)} title={`${bot.name} — 할 일 패널 열기`}>
            <span className="nm">{bot.displayName || bot.name}</span>
            {ch ? <span className={`duec sm ${ch.tone}`}>{ch.text}</span> : null}
            <span className="c">{total}</span>
            <span className="sp" />
            {m?.proposed ? <span className="bprop">제안 {m.proposed}</span> : null}
            {data?.akLive ? <span className={`bak ${m?.ak?.pending ? 'wait' : ''}`} title="Akiflow 동기화 — 설정 › 할 일 동기화">{m?.ak?.pending ? `Akiflow 올릴 것 ${m.ak.pending}` : <>Akiflow <b>맞음</b>{m?.ak?.at ? ` · ${agoMin(m.ak.at)}` : ''}</>}</span> : null}
          </button>
          {shown.map((t) => { const dc = t.due ? dueChipOf(t.due) : null; const k = `${bot.id}:${t.line}`; return <div key={t.line} className="bti" data-line={t.line} onClick={() => open(bot.id)}>
            <button className="cb" aria-label={`«${t.title}» 완료`} title="완료" onClick={(e) => { e.stopPropagation(); void check(bot.id, t) }}>{busy === k ? '…' : null}</button>
            <span className="tt">{t.title}</span>
            {dc ? <span className={`duec sm ${dc.tone}`} title={`${dueText(t.due!)} 마감`}>{dc.text}</span> : null}
            {t.by === 'bot' ? <span className="bt" title="봇이 남긴 줄">봇</span> : null}
          </div> })}
          {items.length > BOARD_PEEK ? <button className="more" onClick={() => setMore((x) => { const n = new Set(x); if (n.has(bot.id)) n.delete(bot.id); else n.add(bot.id); return n })}>{all ? '접기' : `더 보기 ${items.length - BOARD_PEEK}`}</button> : null}
        </div>
      })}
    </div>
  </div></>
}

/**
 * 🔴 **CJ · 폴더 현황 시트** — 폴더봇 칸을 누르면 연다(기획안 §2-1). 확인 대기 · 일하는 중 · 쉬는 중 · 오래 쉼(14일)으로 묶는다.
 * [중단] 은 두지 않는다(결정 ② · 중단은 대화 안 단추가 제자리 — 무엇을 멈추는지 보면서 누른다). 줄을 누르면 그 대화로 간다.
 * 맨 아래 «폴더 선택 · 시작» 은 레일 메뉴와 같은 창을 연다.
 */
const GROUP_LABEL: Record<FolderGroup, string> = { wait: '확인 대기', run: '일하는 중', rest: '쉬는 중', idle: '오래 쉼 · 14일 넘게' }
export function FolderSheet({ rows, onClose, go, onPick }: { rows: { b: Bot; sum: { state: SessionInfo['state'] | null; text: string; t: number; mood: Mood; unread: boolean; recent: boolean } }[]; onClose: () => void; go: (botId: string, sid?: string) => void; onPick: () => void }) {
  const { s } = useStore()
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const groups = useMemo(() => {
    const g: Record<FolderGroup, typeof rows> = { wait: [], run: [], rest: [], idle: [] }
    for (const r of rows) if (!r.b.orchestrator) g[folderGroup(r.sum.state, r.sum.t)].push(r)
    return g
  }, [rows])
  const n = rows.filter((r) => !r.b.orchestrator).length
  const cands = s.candidates.filter((c) => !c.active).length
  // 처음엔 오래 쉼을 접어 둔다 — 대부분의 폴더가 여기 있어 위 묶음을 밀어낸다
  const [idleOpen, setIdleOpen] = useState(false)
  return <><div className="backdrop" onClick={onClose} /><div className="modal fsheet" role="dialog" aria-label="폴더봇">
    <div className="grip" />
    <div className="modal-h"><div className="t"><b>폴더봇</b><span className="cnt">{n}개</span></div><button className="ib" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button></div>
    <div className="bbody">
      {(['wait', 'run', 'rest', 'idle'] as FolderGroup[]).map((k) => groups[k].length ? <div key={k} className={`fgrp g-${k}`}>
        <button className="gh" onClick={() => (k === 'idle' ? setIdleOpen((o) => !o) : undefined)} aria-expanded={k === 'idle' ? idleOpen : undefined}>{GROUP_LABEL[k]}<span className="c">{groups[k].length}</span>{k === 'idle' ? <Icon n={idleOpen ? 'chevd' : 'chev'} size={11} /> : null}</button>
        {k === 'idle' && !idleOpen ? null : groups[k].map(({ b, sum }) => <button key={b.id} className="frow" data-bot={b.id} onClick={() => { onClose(); go(b.id) }}>
          <FolderBot color={b.color} size={22} mood={sum.mood} unread={sum.unread} recent={sum.recent} mono />
          <span className="t"><b>{b.displayName || b.name}</b><small>{sum.text}</small></span>
          <time>{fmtTime(sum.t)}</time>
        </button>)}
      </div> : null)}
    </div>
    <div className="ffoot"><button className="btn" onClick={() => { onClose(); onPick() }}><Icon n="fplus" size={14} />폴더 선택 · 시작<span className="k">후보 {cands}</span></button></div>
  </div></>
}
