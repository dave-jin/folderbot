import { useEffect, useMemo, useState } from 'react'
import { CLEAN_DEFAULT, CLEAN_FILTER_LABEL, cleanMatch, cleanPreselect, sessKind, sessLocked, type CleanFilter } from '../core/cleanup'
import { STATE_LABEL, type SessionInfo } from '../core/types'
import { api } from './api'
import { Icon } from './FolderBot'
import { useStore } from './store'

/**
 * 세션 정리 (2026-10-02 Dave: «전체 세션을 보고 일괄로 유휴 상태나 안쓰는 세션들을 지우는 기능» · «정리 단추 따로» · 시안 B).
 *
 * 모든 폴더의 세션이 한 표다. 처음 열면 «7일 넘게 안 씀 + 봇끼리 대화» 가 골라져 있다.
 * 🔴 잠긴 줄(일하는 중·답 기다림·안 읽음·뒤에서 도는 중·대기 말)은 체크 칸이 막혀 있다 — 호스트도 한 번 더 거른다.
 * 🔴 지운 뒤 10초 동안 «되돌리기» — 지우기는 «지웠다» 표식만 남기므로(파일은 그대로) 걷으면 돌아온다.
 * ⚠ 소통 세션은 봇마다 하나라 처음부터 체크하지 않는다(지워도 다음 봇 말이 오면 새로 선다).
 * 🔴 **줄 순서는 «만든 시각» 으로 고정한다** — «마지막 활동» 으로 세우면 다른 세션이 일할 때마다 줄이 커서 밑에서 자리를 바꿔
 *    누르는 순간 **다른 세션이 골라졌다**(검사에서 실제로 엉뚱한 세션을 지웠다).
 */
const DAY = 24 * 3600_000
const ago = (t: number) => { const d = Math.floor((Date.now() - t) / DAY); if (d >= 1) return `${new Date(t).getMonth() + 1}/${new Date(t).getDate()} (${d}일 전)`; const h = Math.floor((Date.now() - t) / 3600_000); return h >= 1 ? `${h}시간 전` : '방금' }

export function Cleanup({ onClose, say }: { onClose: () => void; say: (m: string) => void }) {
  const { s } = useStore()
  const [on, setOn] = useState<CleanFilter[]>(CLEAN_DEFAULT)
  const [folder, setFolder] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<{ ids: string[]; until: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const botName = (id: string) => { const b = s.bots.find((x) => x.id === id); return b ? (b.displayName || b.name) : '(사라진 봇)' }
  const all = useMemo(() => Object.values(s.sessionsByBot).flat(), [s.sessionsByBot])
  const shown = useMemo(() => all.filter((x) => (!folder || x.botId === folder) && cleanMatch(x, on)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), [all, on, folder])
  // 거름을 바꾸면 체크도 처음 규칙대로 다시 — «보이는 것 중 지워도 되는 것»
  useEffect(() => { setPick(new Set(shown.filter((x) => cleanPreselect(x, on)).map((x) => x.id))) }, [on, folder]) // eslint-disable-line react-hooks/exhaustive-deps
  // 목록이 바뀌어(지움·새 답) 잠기거나 사라진 줄은 체크에서 뺀다
  useEffect(() => { setPick((p) => { const ok = new Set(shown.filter((x) => !sessLocked(x)).map((x) => x.id)); const n = new Set([...p].filter((id) => ok.has(id))); return n.size === p.size ? p : n }) }, [shown])
  useEffect(() => { if (!undo) return; const t = window.setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now())); return () => window.clearTimeout(t) }, [undo])

  const toggleF = (f: CleanFilter) => setOn((l) => (f === 'all' ? (l.includes('all') ? CLEAN_DEFAULT : ['all']) : (() => { const x = l.filter((y) => y !== 'all'); const n = x.includes(f) ? x.filter((y) => y !== f) : [...x, f]; return n.length ? n : CLEAN_DEFAULT })()))
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
  const kindCls = (x: SessionInfo) => ({ 소통: 'k-comm', 루틴: 'k-rt', 봇끼리: 'k-bot', 사람: 'k-me' })[sessKind(x)]

  return <><div className="backdrop" onClick={onClose} /><div className="modal clean" role="dialog" aria-label="세션 정리">
    <div className="modal-h"><div className="t"><b>세션 정리</b><span className="cnt">전체 {all.length}개 · 고른 것 {pick.size}개</span></div><button className="ib" onClick={onClose} title="닫기 ⎋"><Icon n="x" size={14} /></button></div>
    <div className="cbar">
      {(Object.keys(CLEAN_FILTER_LABEL) as CleanFilter[]).map((f) => <button key={f} className={`pill ${on.includes(f) ? 'on' : ''}`} aria-pressed={on.includes(f)} onClick={() => toggleF(f)}>{CLEAN_FILTER_LABEL[f]}</button>)}
      <span style={{ flex: 1 }} />
      <select className="cfold" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="폴더"><option value="">폴더: 전체</option>{s.bots.map((b) => <option key={b.id} value={b.id}>{b.displayName || b.name}</option>)}</select>
    </div>
    <div className="ctab">
      <table>
        <thead><tr>
          <th style={{ width: 30 }}><input type="checkbox" checked={allOn} disabled={!free.length} onChange={() => setPick(allOn ? new Set() : new Set(free.map((x) => x.id)))} aria-label="보이는 것 모두" /></th>
          <th>폴더</th><th>세션</th><th>종류</th><th>상태</th><th>마지막 활동</th>
        </tr></thead>
        <tbody>
          {shown.map((x) => { const lock = sessLocked(x); return <tr key={x.id} data-id={x.id} className={lock ? 'lock' : ''} title={lock ? `지울 수 없어요 — ${lock}` : undefined} onClick={() => { if (lock) return; setPick((p) => { const n = new Set(p); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n }) }}>
            <td><input type="checkbox" checked={pick.has(x.id)} disabled={!!lock} readOnly /></td>
            <td>{botName(x.botId)}</td><td className="sn">{x.name}</td>
            <td><span className={`ktag ${kindCls(x)}`}>{sessKind(x)}</span></td>
            <td className={lock ? 'lk' : ''}>{lock ?? STATE_LABEL[x.state]}</td>
            <td>{ago(x.lastActivity)}</td>
          </tr> })}
          {!shown.length ? <tr><td colSpan={6} style={{ color: 'var(--t3)', textAlign: 'center', padding: 24 }}>이 거름에 걸리는 세션이 없어요</td></tr> : null}
        </tbody>
      </table>
    </div>
    <div className="cfoot">
      <span className="hint">잠긴 줄 — 일하는 중·답 기다림·안 읽음은 지울 수 없어요</span><span style={{ flex: 1 }} />
      <button className="btn ghost" onClick={onClose}>닫기</button>
      <button className="btn danger" disabled={!pick.size || busy} onClick={() => void del()}>선택한 {pick.size}개 지우기</button>
    </div>
    {undo ? <div className="cundo" role="status">세션 {undo.ids.length}개를 지웠어요 <button onClick={() => void restore()}>되돌리기 (10초)</button></div> : null}
  </div></>
}
