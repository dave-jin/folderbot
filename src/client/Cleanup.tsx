import { useEffect, useMemo, useRef, useState } from 'react'
import { CLEAN_DAYS, CLEAN_DEFAULT, CLEAN_FILTER_LABEL, cleanDaysOf, cleanMatch, cleanPreselect, dayWord, sessKind, sessLocked, type CleanFilter } from '../core/cleanup'
import { STATE_LABEL, type SessionInfo } from '../core/types'
import { api } from './api'
import { Icon } from './FolderBot'
import { useStore } from './store'

/**
 * 세션 정리 (2026-10-02 Dave: «전체 세션을 보고 일괄로 유휴 상태나 안쓰는 세션들을 지우는 기능» · «정리 단추 따로» · 시안 B).
 *
 * 모든 폴더의 세션이 한 표다. 처음 열면 «7일 넘게 안 씀 + 봇끼리 대화» 가 골라져 있다.
 * «안 쓴 지» 는 하루·이틀·3일·7일·14일에서 고르고 이 기기에 남는다(2026-10-16 Dave · 메뉴 «정리 가능 N» 도 같은 값).
 * 🔴 잠긴 줄(일하는 중·답 기다림·안 읽음·뒤에서 도는 중·대기 말)은 체크 칸이 막혀 있다 — 호스트도 한 번 더 거른다.
 * 🔴 지운 뒤 10초 동안 «되돌리기» — 지우기는 «지웠다» 표식만 남기므로(파일은 그대로) 걷으면 돌아온다.
 * ⚠ 소통 세션은 봇마다 하나라 처음부터 체크하지 않는다(지워도 다음 봇 말이 오면 새로 선다).
 * 🔴 **줄 순서는 «만든 시각» 으로 고정한다** — «마지막 활동» 으로 세우면 다른 세션이 일할 때마다 줄이 커서 밑에서 자리를 바꿔
 *    누르는 순간 **다른 세션이 골라졌다**(검사에서 실제로 엉뚱한 세션을 지웠다).
 *
 * 🔴 **CJ · 세션 창(`manage`)** — 홈 «세션» 칸이 연다(2026-10-16 Dave «세션 정리 메뉴를 없애고 여기서» · 기획안 §2-4).
 *    처음엔 아무것도 골라 두지 않은 **전체 목록**(최근 활동 순)이고, «정리할 만한 것 N 고르기» 를 눌러야 지금처럼 골라진다.
 *    **줄을 누르면 그 세션으로 간다** — 고르기는 왼쪽 체크 칸으로. 지우기·10초 되돌리기·잠긴 줄 보호는 그대로.
 *    ⚠ 최근 활동 순은 **연 순간의 차례로 얼린다** — 위 사고(일하는 세션이 자리를 바꿔 엉뚱한 줄이 눌림)를 다시 내지 않게. 새로 생긴 세션만 맨 위에 붙는다.
 */
const DAY = 24 * 3600_000
export const CLEAN_DAYS_KEY = 'fb:cleanDays'
export const savedCleanDays = () => { try { return cleanDaysOf(localStorage.getItem(CLEAN_DAYS_KEY)) } catch { return cleanDaysOf(null) } }
const ago = (t: number) => { const d = Math.floor((Date.now() - t) / DAY); if (d >= 1) return `${new Date(t).getMonth() + 1}/${new Date(t).getDate()} (${d}일 전)`; const h = Math.floor((Date.now() - t) / 3600_000); return h >= 1 ? `${h}시간 전` : '방금' }

export function Cleanup({ onClose, say, manage = false, go }: { onClose: () => void; say: (m: string) => void; manage?: boolean; go?: (botId: string, sid?: string) => void }) {
  const { s } = useStore()
  const [on, setOn] = useState<CleanFilter[]>(manage ? ['all'] : CLEAN_DEFAULT)
  /** 세션 창은 «고르기» 를 누르기 전까지 아무것도 골라 두지 않는다 */
  const [auto, setAuto] = useState(!manage)
  const [days, setDays] = useState(savedCleanDays)
  const [folder, setFolder] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<{ ids: string[]; until: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const botName = (id: string) => { const b = s.bots.find((x) => x.id === id); return b ? (b.displayName || b.name) : '(사라진 봇)' }
  const all = useMemo(() => Object.values(s.sessionsByBot).flat(), [s.sessionsByBot])
  /** 세션 창 — 연 순간의 «최근 활동 순» 차례(얼림). 없는 id(새로 생긴 세션)는 맨 위 */
  const rankAt = useRef<Map<string, number> | null>(null)
  if (manage && !rankAt.current) rankAt.current = new Map([...all].sort((a, b) => b.lastActivity - a.lastActivity).map((x, i) => [x.id, i]))
  const order = (a: SessionInfo, b: SessionInfo) => {
    if (!manage) return a.createdAt - b.createdAt || a.id.localeCompare(b.id)
    const ra = rankAt.current?.get(a.id) ?? -1, rb = rankAt.current?.get(b.id) ?? -1
    return ra - rb || b.createdAt - a.createdAt || a.id.localeCompare(b.id)
  }
  const shown = useMemo(() => all.filter((x) => (!folder || x.botId === folder) && cleanMatch(x, on, Date.now(), days)).sort(order), [all, on, folder, days]) // eslint-disable-line react-hooks/exhaustive-deps
  // 거름을 바꾸면 체크도 처음 규칙대로 다시 — «보이는 것 중 지워도 되는 것». 세션 창은 «고르기» 를 누른 뒤부터
  useEffect(() => { if (!auto) return; setPick(new Set(shown.filter((x) => cleanPreselect(x, on, Date.now(), days)).map((x) => x.id))) }, [on, folder, days, auto]) // eslint-disable-line react-hooks/exhaustive-deps
  const cleanN = useMemo(() => all.filter((x) => (!folder || x.botId === folder) && cleanPreselect(x, CLEAN_DEFAULT, Date.now(), days)).length, [all, folder, days])
  const pickCleanable = () => { setAuto(true); setOn(CLEAN_DEFAULT) }
  // 목록이 바뀌어(지움·새 답) 잠기거나 사라진 줄은 체크에서 뺀다
  useEffect(() => { setPick((p) => { const ok = new Set(shown.filter((x) => !sessLocked(x)).map((x) => x.id)); const n = new Set([...p].filter((id) => ok.has(id))); return n.size === p.size ? p : n }) }, [shown])
  useEffect(() => { if (!undo) return; const t = window.setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now())); return () => window.clearTimeout(t) }, [undo])

  const toggleF = (f: CleanFilter) => setOn((l) => (f === 'all' ? (l.includes('all') ? CLEAN_DEFAULT : ['all']) : (() => { const x = l.filter((y) => y !== 'all'); const n = x.includes(f) ? x.filter((y) => y !== f) : [...x, f]; return n.length ? n : CLEAN_DEFAULT })()))
  // 날을 바꾸면 «안 쓴 지» 거름을 켠다 — 고른 날이 바로 표에 보이게
  const pickDays = (d: number) => { setDays(d); try { localStorage.setItem(CLEAN_DAYS_KEY, String(d)) } catch { /* */ } setOn((l) => (l.includes('old') ? l : [...l.filter((y) => y !== 'all'), 'old'])) }
  const free = shown.filter((x) => !sessLocked(x))
  const allOn = free.length > 0 && free.every((x) => pick.has(x.id))
  const del = async () => {
    if (!pick.size || busy) return
    setBusy(true)
    try {
      const r = await api<{ removed: string[]; skipped: { id: string; why: string }[] }>('/sessions/bulk-delete', { body: { ids: [...pick] } })
      setPick(new Set())
      if (r.removed.length) setUndo({ ids: r.removed, until: Date.now() + 10_000 })
      if (r.skipped.length) say(`${r.skipped.length}개는 건너뛰었어요 — ${[...new Set(r.skipped.map((x) => x.why))].join(' · ')}`)
    } catch (e) { say((e as Error).message) } finally { setBusy(false) }
  }
  const restore = async () => {
    if (!undo) return
    try { const r = await api<{ restored: string[] }>('/sessions/restore', { body: { ids: undo.ids } }); say(`세션 ${r.restored.length}개를 되살렸어요`); setUndo(null) } catch (e) { say((e as Error).message) }
  }
  const kindCls = (x: SessionInfo) => ({ 소통: 'k-comm', 채널: 'k-comm', 루틴: 'k-rt', 봇끼리: 'k-bot', 사람: 'k-me' })[sessKind(x)]

  const toggleRow = (id: string) => setPick((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return <><div className="backdrop" onClick={onClose} /><div className={`modal clean ${manage ? 'manage' : ''}`} role="dialog" aria-label={manage ? '세션' : '세션 정리'}>
    <div className="modal-h"><div className="t"><b>{manage ? '세션' : '세션 정리'}</b><span className="cnt">전체 {all.length}개 · 고른 것 {pick.size}개</span></div><button className="ib" onClick={onClose} title="닫기 ⎋"><Icon n="x" size={14} /></button></div>
    <div className="cbar">
      {manage ? <button className="pill pickc" disabled={!cleanN} onClick={pickCleanable} title="7일 넘게 안 씀(또는 고른 날) + 봇끼리 대화 중 지워도 되는 것">정리할 만한 것 {cleanN} 고르기</button> : null}
      {(Object.keys(CLEAN_FILTER_LABEL) as CleanFilter[]).map((f) => f === 'old'
        ? <span key={f} className={`pill dpill ${on.includes(f) ? 'on' : ''}`}>
          <select className="cdays" value={days} onChange={(e) => pickDays(Number(e.target.value))} aria-label="안 쓴 지" title="며칠 넘게 안 쓴 세션인지 고르기">{CLEAN_DAYS.map((d) => <option key={d} value={d}>{dayWord(d)}</option>)}</select>
          <button aria-pressed={on.includes(f)} onClick={() => toggleF(f)} aria-label={`${dayWord(days)} 넘게 안 씀`}>넘게 안 씀</button>
        </span>
        : <button key={f} className={`pill ${on.includes(f) ? 'on' : ''}`} aria-pressed={on.includes(f)} onClick={() => toggleF(f)}>{CLEAN_FILTER_LABEL[f]}</button>)}
      <span style={{ flex: 1 }} />
      <select className="cfold" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="폴더"><option value="">폴더: 전체</option>{s.bots.map((b) => <option key={b.id} value={b.id}>{b.displayName || b.name}</option>)}</select>
    </div>
    <div className="ctab">
      <table>
        <thead><tr>
          <th className="ck" style={{ width: 30 }}><input type="checkbox" checked={allOn} disabled={!free.length} onChange={() => setPick(allOn ? new Set() : new Set(free.map((x) => x.id)))} aria-label="보이는 것 모두" /></th>
          <th>폴더</th><th>세션</th><th>종류</th><th>상태</th><th>마지막 활동</th><th className="allk" onClick={() => { if (free.length) setPick(allOn ? new Set() : new Set(free.map((x) => x.id))) }}>보이는 것 모두 고르기 · {shown.length}개</th>
        </tr></thead>
        <tbody>
          {shown.map((x) => { const lock = sessLocked(x); return <tr key={x.id} data-id={x.id} className={lock ? 'lock' : ''} title={manage ? '누르면 이 세션으로' : lock ? `지울 수 없어요 — ${lock}` : undefined} onClick={() => { if (manage && go) { onClose(); go(x.botId, x.id); return } if (lock) return; toggleRow(x.id) }}>
            <td className="ck" onClick={(e) => { if (!manage) return; e.stopPropagation(); if (!lock) toggleRow(x.id) }} title={lock ? `지울 수 없어요 — ${lock}` : undefined}><input type="checkbox" checked={pick.has(x.id)} disabled={!!lock} readOnly /></td>
            <td className="fd">{botName(x.botId)}</td><td className="sn">{x.name}</td>
            <td className="kd"><span className={`ktag ${kindCls(x)}`}>{sessKind(x)}</span></td>
            <td className={`st ${lock ? 'lk' : ''}`}>{lock ?? STATE_LABEL[x.state]}</td>
            <td className="tm">{ago(x.lastActivity)}</td>
          </tr> })}
          {!shown.length ? <tr className="none"><td colSpan={6} style={{ color: 'var(--t3)', textAlign: 'center', padding: 24 }}>이 거름에 걸리는 세션이 없어요</td></tr> : null}
        </tbody>
      </table>
    </div>
    <div className="clfoot">
      <span className="hint">잠긴 줄 — 일하는 중·답 기다림·안 읽음은 지울 수 없어요</span><span style={{ flex: 1 }} />
      <button className="btn ghost" onClick={onClose}>닫기</button>
      <button className="btn danger" disabled={!pick.size || busy} onClick={() => void del()}>선택한 {pick.size}개 지우기</button>
    </div>
    {undo ? <div className="cundo" role="status">세션 {undo.ids.length}개를 지웠어요 <button onClick={() => void restore()}>되돌리기 (10초)</button></div> : null}
  </div></>
}
