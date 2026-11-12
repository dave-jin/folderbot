import { useMemo, useState } from 'react'
import { useEsc } from './esc'
import { createPortal } from 'react-dom'
import { Icon } from './FolderBot'
import { askName } from './Sheets'
import { ddText, type LinkMap, type LinkNode, type Stem, type StemOp } from '../core/linkMap'

/**
 * 🔴 줄기 관리 — 화면 (11/4 Dave «이 리스트를 내가 관리할 수는 없어?» → «수정/편집/삭제가 가능하게, 이후엔 LLM 이 그에 맞게 정리»).
 *    목업 `2. Area/제품_FolderBot/03_디자인/2026-11-04_줄기-관리-목업/` 화면 1.
 *  - 이름 고치기 · 한 줄 고치기 · 폴더 넣기/빼기(지금 폴더 · 지난 일) · 차례(맥: 끌기 · 폰: ↑↓) · 합치기 · 지우기 · 새 줄기 · 봇 제안 받기/버리기
 *  - 한 번 손대면 관리가 시작된다 — 그 뒤로 줄기는 다시 계산되지 않고, 나머지 폴더는 주인 맥 모델이 이 목록에 맞춰 넣는다(«봇이 넣음»)
 * 📱 폰(11/4 «모바일도 함께 · 상시 둘 다») — 전체 화면 시트 · 끌기 대신 ↑↓ · 버튼은 손가락 크기 · 입력칸 16px(iOS 확대 방지)
 * ⚠ 값은 `core/linkMap` 의 applyStemOp 가 정한다 — 화면은 op 를 보내기만.
 */
export function StemManager({ map, op, close, onPick, phone }: {
  map: LinkMap
  op: (o: StemOp, ok: string) => Promise<boolean>
  close: () => void
  onPick: (id: string) => void
  phone?: boolean
}) {
  useEsc(close)
  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map])
  const [open, setOpen] = useState<string | null>(null)   // 처음엔 접어 둔다 — 줄기 목록을 한눈에(폰도)
  const [drag, setDrag] = useState<string | null>(null)
  const loose = map.nodes.filter((n) => !n.hub && !n.past && n.stem === undefined)
  const fixed = map.stems.filter((s) => s.fixed).length
  const L = (id: string) => byId.get(id)?.label ?? id
  const order = (ids: string[]) => void op({ op: 'order', ids }, '차례를 바꿨어요')
  const move = (key: string, d: -1 | 1) => {
    const ids = map.stems.map((s) => s.key); const i = ids.indexOf(key); const j = i + d
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]; order(ids)
  }
  const drop = (onto: string) => {
    if (!drag || drag === onto) return
    const ids = map.stems.map((s) => s.key).filter((k) => k !== drag)
    ids.splice(ids.indexOf(onto), 0, drag); order(ids); setDrag(null)
  }
  const create = async () => { const nm = await askName('새 줄기 이름'); if (nm?.trim()) { if (await op({ op: 'create', name: nm.trim() }, `«${nm.trim()}» 줄기를 만들었어요 — 폴더를 넣어 주세요`)) setOpen(null) } }
  const bots = map.placed.slice(0, 24)

  // 상황판(.modal · transform) 안에서 열리므로 body 로 꺼낸다 — 안 그러면 fixed 가 상황판 기준이 된다
  return createPortal(<>
    <div className="backdrop smg-bd" onClick={close} />
    <div className={`modal smg${phone ? ' phone' : ''}`} role="dialog" aria-label="줄기 관리">
      <div className="modal-h"><div className="t"><b>줄기 관리</b><small>{map.stems.length}개 · 고정 {fixed}{map.managed ? '' : ' · 아직 봇이 계산한 그대로 — 손대면 그때부터 고정돼요'}</small></div>
        <button className="btn p sm" onClick={() => void create()}><Icon n="plus" size={12} />새 줄기</button>
        <button className="ib" onClick={close} aria-label="닫기"><Icon n="x" size={14} /></button></div>
      <div className="modal-b smg-b">
        <div className="smg-main">
          {map.stems.map((st, i) => <StemRow key={st.key} st={st} i={i} n={map.stems.length} map={map} byId={byId} open={open === st.key} setOpen={(v) => setOpen(v ? st.key : null)}
            op={op} move={move} phone={phone} onPick={(id) => { onPick(id); close() }}
            drag={{ on: drag === st.key, start: () => setDrag(st.key), end: () => setDrag(null), drop: () => drop(st.key) }} />)}
          {map.proposals.map((p) => <div key={p.id} className="smg-row prop">
            <span className="dotc dash" /><div className="nm"><b>{p.name}</b><span className="lm-tag new">봇 제안</span><span className="l">{p.line ? `${p.line} · ` : ''}{p.folders.map(L).join(', ')}</span></div>
            <span className="ac"><button className="btn p sm" onClick={() => void op({ op: 'accept', proposal: p.id }, `«${p.name}» 줄기를 받았어요`)}>받기</button><button className="btn sm" onClick={() => void op({ op: 'drop', proposal: p.id }, '제안을 버렸어요')}>버리기</button></span>
          </div>)}
          <div className="smg-foot"><span className="m">줄기 밖 {loose.length}{loose.length ? ` — ${loose.slice(0, 6).map((n) => n.label).join(', ')}${loose.length > 6 ? ' …' : ''}` : ''}{map.hubs.length ? ` · 허브 ${map.hubs.length}는 늘 밖` : ''}</span>
            <ResetBtn onReset={() => void op({ op: 'reset' }, '줄기를 모두 봇 계산으로 되돌렸어요')} /></div>
        </div>
        <div className="smg-side">
          <div className="smg-rule"><b>어떻게 정리되나</b><ol>
            <li><b>Dave 가 손댄 것은 그대로</b> — 이름·구성원·차례·합침·지운 줄기. 다시 계산해도 안 풀려요.</li>
            <li><b>나머지는 봇이 이 목록에 맞춰 넣어요</b> — 새 폴더, 새로 보관된 폴더, 아직 안 묶인 폴더. 하루 한 번, 그리고 줄기를 만들거나 합치거나 지운 뒤.</li>
            <li>맞는 줄기가 없으면 <b>새 줄기는 제안만</b> 해요.</li>
            <li>«봇이 넣음» 은 Dave 가 옮기거나 빼면 그때부터 Dave 것이에요.</li>
            <li>줄기를 지우면 그 폴더들은 봇이 남은 줄기로 다시 나눠요.</li></ol></div>
          <div className="smg-log"><div className="h"><b>봇이 정리한 것</b><span className="m">{map.placed.length}{map.undecided.length ? ` · 판단 기다림 ${map.undecided.length}` : ''}</span></div>
            {bots.length ? bots.map((p) => <div key={p.folder} className="li">
              <div><button className="lk" onClick={() => { onPick(p.folder); close() }}>{L(p.folder)}</button>{byId.get(p.folder)?.past ? <span className="lm-tag past">보관</span> : null} → <b>{map.stems[p.stem]?.name}</b></div>
              <div className="why">{p.how === 'ai' ? p.why : `선으로 — ${p.why}`}</div>
              <div className="acts"><MoveSel map={map} cur={map.stems[p.stem]?.key} onMove={(k) => void op({ op: 'add', stem: k, folder: p.folder }, '옮겼어요')} /><button className="btn sm g" onClick={() => void op({ op: 'out', folder: p.folder }, '줄기 밖으로 뺐어요')}>빼기</button></div>
            </div>) : <div className="m">아직 없어요 — 주인 맥이 판단하면 여기 쌓여요</div>}
          </div>
        </div>
      </div>
    </div>
  </>, document.body)
}

function ResetBtn({ onReset }: { onReset: () => void }) {
  const [sure, setSure] = useState(false)
  return sure ? <span className="ac"><button className="btn sm danger" onClick={() => { setSure(false); onReset() }}>정말 되돌리기</button><button className="btn sm g" onClick={() => setSure(false)}>취소</button></span>
    : <button className="btn sm g" onClick={() => setSure(true)}>모두 봇 계산으로 되돌리기</button>
}

function MoveSel({ map, cur, onMove }: { map: LinkMap; cur?: string; onMove: (key: string) => void }) {
  return <select className="smg-sel" value="" onChange={(e) => { if (e.target.value) onMove(e.target.value) }} aria-label="다른 줄기로 옮기기">
    <option value="">옮기기…</option>{map.stems.filter((s) => s.key !== cur).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
  </select>
}

function StemRow({ st, i, n, map, byId, open, setOpen, op, move, phone, onPick, drag }: {
  st: Stem; i: number; n: number; map: LinkMap; byId: Map<string, LinkNode>; open: boolean; setOpen: (v: boolean) => void
  op: (o: StemOp, ok: string) => Promise<boolean>; move: (key: string, d: -1 | 1) => void; phone?: boolean; onPick: (id: string) => void
  drag: { on: boolean; start: () => void; end: () => void; drop: () => void }
}) {
  const [merge, setMerge] = useState<{ into: string; name: string } | null>(null)
  const [sure, setSure] = useState(false)
  const rename = async () => { const nm = await askName('줄기 이름', st.name); if (nm?.trim() && nm.trim() !== st.name) await op({ op: 'rename', stem: st.key, name: nm.trim() }, '이름을 바꿨어요') }
  const reline = async () => { const l = await askName('이 줄기가 하는 일 한 줄', st.line ?? ''); if (l !== null && l.trim() !== (st.line ?? '')) await op({ op: 'line', stem: st.key, line: l }, '한 줄을 바꿨어요') }
  const tag = st.fixed ? <span className="lm-tag dave">고정</span> : st.named === 'auto' ? <span className="lm-tag">임시 이름</span> : <span className="lm-tag bot">봇 이름</span>
  const chip = (id: string) => {
    const x = byId.get(id); if (!x) return null
    return <span key={id} className={`smg-chip${x.past ? ' past' : ''}${st.bot.includes(id) ? ' bot' : ''}`}>
      <button className="lb" onClick={() => onPick(id)}>{x.label}</button><span className="dd">{ddText(x, map.today)}</span>
      {st.bot.includes(id) ? <span className="lm-tag bot">봇이 넣음</span> : null}
      <button className="x" onClick={() => void op({ op: 'out', folder: id }, `${x.label} 을 줄기 밖으로 뺐어요`)} aria-label={`${x.label} 빼기`}><Icon n="x" size={10} /></button></span>
  }
  return <>
    <div className={`smg-row${open ? ' open' : ''}${drag.on ? ' drag' : ''}`} draggable={!phone} onDragStart={drag.start} onDragEnd={drag.end} onDragOver={(e) => e.preventDefault()} onDrop={drag.drop}>
      {phone ? <span className="ud"><button className="ib" disabled={i === 0} onClick={() => move(st.key, -1)} aria-label="위로"><Icon n="up" size={13} /></button><button className="ib" disabled={i === n - 1} onClick={() => move(st.key, 1)} aria-label="아래로"><Icon n="up" size={13} style={{ transform: 'rotate(180deg)' }} /></button></span>
        : <span className="hd" title="끌어서 차례 바꾸기" aria-hidden>⋮⋮</span>}
      <i className="dotc" style={{ background: st.color }} />
      <div className="nm"><button className="t" onClick={() => void rename()} title="이름 고치기"><b>{st.name}</b><Icon n="edit" size={10} /></button>{tag}
        <button className="l" onClick={() => void reline()} title="한 줄 고치기">{st.line || '이 줄기가 하는 일 한 줄 — 눌러서 적기'}</button></div>
      <button className="cnt" onClick={() => setOpen(!open)} aria-expanded={open}>지금 {st.members.length}<i> · 지난 일 {st.past.length}</i><Icon n={open ? 'chevd' : 'chev'} size={11} /></button>
      <span className="ac"><button className="btn sm" onClick={() => setMerge(merge ? null : { into: map.stems.find((s) => s.key !== st.key)?.key ?? '', name: '' })}>합치기</button>
        {sure ? <button className="btn sm danger" onClick={() => { setSure(false); void op({ op: 'delete', stem: st.key }, `«${st.name}» 줄기를 지웠어요 — 폴더들은 봇이 다시 나눠요`) }}>정말 지우기</button>
          : <button className="btn sm danger" onClick={() => { setSure(true); window.setTimeout(() => setSure(false), 4000) }}>지우기</button>}</span>
    </div>
    {merge ? <div className="smg-merge"><b>{st.name}</b> 을 어느 줄기에 합칠까요?
      <div className="row"><select className="smg-sel" value={merge.into} onChange={(e) => setMerge({ ...merge, into: e.target.value })} aria-label="합칠 줄기">{map.stems.filter((s) => s.key !== st.key).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
        <input className="smg-in" value={merge.name} placeholder={`합친 이름(비우면 «${map.stems.find((s) => s.key === merge.into)?.name ?? ''}»)`} onChange={(e) => setMerge({ ...merge, name: e.target.value })} />
        <span className="sp" /><button className="btn sm g" onClick={() => setMerge(null)}>취소</button>
        <button className="btn sm p" disabled={!merge.into} onClick={() => { const m = merge; setMerge(null); void op({ op: 'merge', from: st.key, into: m.into, ...(m.name.trim() ? { name: m.name.trim() } : {}) }, '줄기를 합쳤어요') }}>합치기</button></div></div> : null}
    {open ? <div className="smg-exp">
      <div className="h">지금 폴더 — × 로 빼면 «줄기 밖» 으로 가고, 봇이 다시 넣지 않아요</div>
      <div className="chips">{st.members.map(chip)}<FolderPick map={map} st={st} past={false} onPick={(id) => void op({ op: 'add', stem: st.key, folder: id }, `${byId.get(id)?.label} 을 넣었어요`)} /></div>
      <div className="h">지난 일(보관) — 이 줄기에서 끝난 일 · 비슷한 일을 할 때 가져다 써요</div>
      <div className="chips">{st.past.map(chip)}<FolderPick map={map} st={st} past onPick={(id) => void op({ op: 'add', stem: st.key, folder: id }, `${byId.get(id)?.label} 을 지난 일로 넣었어요`)} /></div>
    </div> : null}
  </>
}

/** 폴더 넣기 — 눌러서 찾고 고른다(이 줄기에 없는 것 · 허브 빼고) */
function FolderPick({ map, st, past, onPick }: { map: LinkMap; st: Stem; past: boolean; onPick: (id: string) => void }) {
  const [on, setOn] = useState(false)
  const [q, setQ] = useState('')
  const have = new Set([...st.members, ...st.past])
  const t = q.trim().toLowerCase()
  const hits = map.nodes.filter((n) => !!n.past === past && !n.hub && !have.has(n.id) && (!t || n.label.toLowerCase().includes(t) || n.name.toLowerCase().includes(t)))
    .sort((a, b) => Number(a.stem !== undefined) - Number(b.stem !== undefined) || a.label.localeCompare(b.label)).slice(0, 8)
  if (!on) return <button className="smg-chip add" onClick={() => setOn(true)}><Icon n="plus" size={10} />{past ? '보관 폴더 넣기' : '폴더 넣기'}</button>
  return <div className="smg-pick">
    <input className="smg-in" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={past ? '보관 폴더 이름' : '폴더 이름'} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOn(false) } if (e.key === 'Enter' && hits[0]) { onPick(hits[0].id); setOn(false) } }} />
    <div className="list">{hits.length ? hits.map((n) => <button key={n.id} onClick={() => { onPick(n.id); setOn(false); setQ('') }}><b>{n.label}</b><span>{ddText(n, map.today)}{n.stem !== undefined ? ` · 지금 «${map.stems[n.stem].name}»` : ' · 줄기 밖'}</span></button>) : <span className="m">맞는 폴더가 없어요</span>}</div>
    <button className="btn sm g" onClick={() => setOn(false)}>닫기</button>
  </div>
}
