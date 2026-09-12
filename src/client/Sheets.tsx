import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import type { Bot, Candidate, NotifyEvent, RoutineDef, TodoItem } from '../core/types'
import { api, setToken, subscribePush } from './api'
import { FolderBot, Icon } from './FolderBot'
import { fmtTime, useStore } from './store'

marked.setOptions({ gfm: true, breaks: true })
export function Md({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text) as string, [text])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}

/* ── 파일 시트 ─────────────────────────────────────────────────────────── */
export function FileSheet({ bot, rel, onClose, onTalk }: { bot: Bot; rel: string; onClose: () => void; onTalk: (rel: string) => void }) {
  const [doc, setDoc] = useState<{ kind: string; text?: string; size?: number; mtime?: number } | null>(null)
  const [edit, setEdit] = useState(false); const [draft, setDraft] = useState(''); const [saving, setSaving] = useState(false); const [err, setErr] = useState('')
  const [w, setW] = useState<number>(() => Number(localStorage.getItem('fb:sheetw') ?? 50))
  const load = async () => { try { setDoc(await api(`/bots/${bot.id}/file?rel=${encodeURIComponent(rel)}`)); setErr('') } catch (e) { setErr((e as Error).message) } }
  useEffect(() => { void load(); setEdit(false) }, [bot.id, rel])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if ((e.metaKey || e.ctrlKey) && e.key === 's' && edit) { e.preventDefault(); void save() } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) })
  const save = async () => { setSaving(true); try { await api(`/bots/${bot.id}/file`, { body: { rel, text: draft } }); await load(); setEdit(false) } catch (e) { setErr((e as Error).message) } finally { setSaving(false) } }
  const drag = (e: React.PointerEvent) => { const start = e.clientX; const w0 = w; const mv = (ev: PointerEvent) => { const pct = Math.min(95, Math.max(30, w0 + ((start - ev.clientX) / window.innerWidth) * 100)); setW(pct) }; const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); localStorage.setItem('fb:sheetw', String(Math.round(w))) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up) }
  const name = rel.split('/').pop() ?? rel
  const isMd = /\.(md|markdown|txt)$/i.test(rel)
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="sheet" style={{ ['--sheet-w' as string]: `${w}%` }}>
      <div className="sheet-h"><span className="grip" onPointerDown={drag} /><span className="tab"><Icon n="file" size={13} color="var(--tool-read)" /><span className="mono">{name}</span></span>
        <span className="acts">{doc?.mtime ? <span>{fmtTime(doc.mtime)}</span> : null}{doc?.kind === 'text' && !edit ? <button className="btn" onClick={() => { setDraft(doc.text ?? ''); setEdit(true) }}>편집</button> : null}{edit ? <><button className="btn" onClick={() => setEdit(false)}>취소</button><button className="btn primary" disabled={saving} onClick={save}>저장</button></> : null}<a className="iconbtn" href={`/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`} target="_blank" rel="noreferrer" title="새 창"><Icon n="open" size={15} /></a><button className="iconbtn" onClick={onClose}><Icon n="x" size={15} /></button></span></div>
      {err ? <div className="empty">{err}</div> : !doc ? <div className="empty">불러오는 중…</div> : edit ? <div className="sheet-b edit"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} /></div>
        : doc.kind === 'text' ? <div className="sheet-b"><div className="mono" style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 12 }}>{rel} · {bot.name}</div>{isMd ? <Md text={doc.text ?? ''} /> : <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12.5 }}>{doc.text}</pre>}</div>
        : doc.kind === 'image' ? <div className="sheet-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={`/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`} style={{ maxWidth: '100%', maxHeight: '100%' }} /></div>
        : doc.kind === 'pdf' ? <iframe className="sheet-b" style={{ padding: 0, border: 0, background: '#fff' }} src={`/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`} />
        : <div className="empty">미리보기가 없는 형식이에요 · {doc.size} bytes</div>}
      <div className="sheet-f"><button className="btn" onClick={() => onTalk(rel)}><Icon n="send" size={13} color="var(--accent)" />이 파일로 말하기</button><span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>Esc 로 닫기 · 왼쪽 가장자리를 끌어 넓히기</span></div>
    </div>
  </>
}

/* ── 폴더 선택 (시작) ───────────────────────────────────────────────────── */
export function FolderPicker({ onClose, onStarted }: { onClose: () => void; onStarted: (bot: Bot) => void }) {
  const { s, refresh } = useStore()
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null); const [newIn, setNewIn] = useState<string | null>(null); const [newName, setNewName] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [cands, setCands] = useState<Candidate[]>(s.candidates)
  useEffect(() => { void api<Candidate[]>('/candidates').then(setCands) }, [])
  const sections = useMemo(() => { const m = new Map<string, Candidate[]>(); for (const c of cands) { if (q && !c.rel.toLowerCase().includes(q.toLowerCase())) continue; (m.get(c.section) ?? m.set(c.section, []).get(c.section)!).push(c) } for (const p of (s.rules?.roles.active ?? []).map((g) => g.replace(/\/\*$/, ''))) if (!m.has(p) && !q) m.set(p, []); return [...m.entries()] }, [cands, q, s.rules])
  const preview = (section: string, name: string) => { const tpl = s.rules?.naming.project; const first = (s.rules?.roles.active ?? [])[0]?.replace(/\/\*$/, ''); if (!tpl || section !== first || !name) return `${section}/${name}`; const d = new Date(); return `${section}/${tpl.replace('{YYYY}', String(d.getFullYear())).replace('{MM}', String(d.getMonth() + 1).padStart(2, '0')).replace('{이름}', name).replace('{name}', name)}` }
  const start = async () => {
    setBusy(true); setErr('')
    try {
      let bot: Bot
      if (newIn && newName.trim()) { const r = await api<{ rel: string; bot: Bot }>('/folders', { body: { section: newIn, name: newName.trim(), start: true } }); bot = r.bot }
      else if (sel) bot = await api<Bot>('/bots/start', { body: { rel: sel } })
      else return
      await refresh(); onStarted(bot)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal">
      <div className="modal-h"><FolderBot color="#e08850" size={40} /><div className="t"><b>에이전트와 함께 일할 폴더를 선택하세요</b><small>규칙의 활성 폴더가 후보예요 · 최근 수정순 · 새 폴더를 만들어 바로 시작할 수도 있어요</small></div><button className="iconbtn" onClick={onClose}><Icon n="x" size={15} /></button></div>
      <div className="search"><Icon n="search" size={14} /><input placeholder="폴더 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="modal-b">
        {sections.map(([sec, list]) => <div key={sec}>
          <div className="sec" style={{ padding: '8px 10px 4px' }}>{sec}</div>
          {newIn === sec ? <div className="newbox"><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent)', fontSize: 12.5 }}><Icon n="fplus" size={14} />새 폴더 만들기</div><input autoFocus placeholder="이름" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void start() }} /><div className="pv"><Icon n="chev" size={12} /><span className="mono" style={{ color: 'var(--text)' }}>{preview(sec, newName || '이름')}</span><span>· 규칙 적용 · 하네스 설치</span></div></div>
            : <button className="newrow" onClick={() => { setNewIn(sec); setSel(null) }}><Icon n="fplus" size={14} />새 폴더 만들기</button>}
          {list.map((c) => <button key={c.rel} className={`prow ${sel === c.rel ? 'sel' : ''} ${c.active ? 'muted' : ''}`} disabled={c.active} onClick={() => { setSel(c.rel); setNewIn(null) }}><Icon n="folder" size={14} color="var(--faint)" /><span className="n">{c.name}</span>{c.harness ? <span className="b"><Icon n="check" size={11} />하네스</span> : <span className="b no">하네스 없음 · 시작하면 깔아 줌</span>}<time>{c.active ? '활성' : fmtTime(c.mtime)}</time></button>)}
        </div>)}
        {!sections.length ? <div className="empty">후보가 없어요. 규칙의 활성 폴더 안에 하위 폴더를 만들거나, 위에서 새 폴더를 만드세요.</div> : null}
      </div>
      <div className="modal-f"><span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--dim)', fontSize: 12 }}><FolderBot color="#e08850" size={20} />또는 오케스트레이터에게 "X 폴더에서 시작해"</span><span className="sp" />{err ? <span className="err" style={{ color: 'var(--error)', fontSize: 12 }}>{err}</span> : null}<button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={busy || (!sel && !(newIn && newName.trim()))} onClick={start}>{newIn && newName.trim() ? '만들고 시작' : '이 폴더에서 시작'}</button></div>
    </div>
  </>
}

/* ── 온보딩(규칙 프리셋) ────────────────────────────────────────────────── */
export function Onboarding() {
  const { s, refresh } = useStore()
  const [preset, setPreset] = useState<'para' | 'johnny-decimal' | 'custom'>('para'); const [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); try { await api('/rules/install', { body: { preset } }); await refresh() } finally { setBusy(false) } }
  return <div className="pair"><div className="box" style={{ width: 'min(760px,100%)', alignItems: 'stretch', textAlign: 'left' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><FolderBot color="#e08850" size={32} /><b style={{ fontSize: 18, color: 'var(--strong)' }}>폴더 규칙을 고르세요</b></div>
    <div style={{ color: 'var(--dim)' }}>루트 <span className="mono">{s.root}</span>. 오케스트레이터가 이 규칙으로 후보를 찾고 Inbox 를 정리해요. 루트 <span className="mono">CLAUDE.md</span> 에 절로 설치되고 언제든 직접 고칠 수 있어요.</div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button className={`preset ${preset === 'para' ? 'on' : ''}`} onClick={() => setPreset('para')}><b><Icon n="folder" size={15} color={preset === 'para' ? 'var(--accent)' : 'var(--faint)'} />PARA</b><small>Projects · Area · Resources · Archive. Inbox 는 정리 상자.</small></button>
      <button className={`preset ${preset === 'johnny-decimal' ? 'on' : ''}`} onClick={() => setPreset('johnny-decimal')}><b><Icon n="folder" size={15} color={preset === 'johnny-decimal' ? 'var(--accent)' : 'var(--faint)'} />Johnny.Decimal</b><small>10-19 영역 · 11 카테고리. 모든 2단계 폴더가 후보.</small></button>
      <button className={`preset ${preset === 'custom' ? 'on' : ''}`} onClick={() => setPreset('custom')}><b><Icon n="folder" size={15} color={preset === 'custom' ? 'var(--accent)' : 'var(--faint)'} />내 방식대로</b><small>PARA 로 시작하고, 오케스트레이터와 대화해 규칙 절을 고칩니다.</small></button>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 12, color: 'var(--faint)' }}>CLAUDE.md 가 이미 있으면 덮어쓰지 않고 절만 덧붙여요.</span><span style={{ flex: 1 }} /><button className="btn primary" disabled={busy} onClick={go}>규칙 설치하고 스캔</button></div>
  </div></div>
}

/* ── 페어링 ─────────────────────────────────────────────────────────────── */
export function Pairing({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const device = useMemo(() => /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'PC', [])
  const go = async () => {
    setBusy(true); setErr('')
    try { const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code.replace(/\D/g, ''), device }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? '실패'); setToken(j.token); onDone() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="pair"><div className="box">
    <FolderBot color="#e08850" size={72} />
    <b style={{ fontSize: 20, color: 'var(--strong)' }}>Folder Bot</b>
    <div style={{ color: 'var(--dim)' }}>Mac mini 의 호스트 터미널에 보이는 6자리 페어링 코드를 넣으세요. (터미널에서 <span className="mono">p</span> + Enter 로 새 코드)</div>
    <input inputMode="numeric" placeholder="000 000" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go() }} autoFocus />
    {err ? <div className="err">{err}</div> : null}
    <button className="btn primary" disabled={busy || code.replace(/\D/g, '').length < 6} onClick={go} style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}>이 {device} 연결하기</button>
  </div></div>
}

/* ── 알림 센터 ───────────────────────────────────────────────────────────── */
export function NotifyCenter({ onClose, onJump }: { onClose: () => void; onJump: (n: NotifyEvent) => void }) {
  const { s, refresh } = useStore()
  const [only, setOnly] = useState(false)
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const list = s.notifications.filter((n) => !only || n.kind === 'awaiting')
  const botOf = (id: string) => s.bots.find((b) => b.id === id)
  const readAll = async () => { await api('/notifications/read', { body: {} }); await refresh() }
  const enablePush = async () => { setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30))) }
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal" style={{ width: 'min(480px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>알림</b><small>모든 봇 · 한 기기에서 처리하면 다른 기기에서도 사라져요</small></div><button className={`btn ${only ? 'primary' : ''}`} onClick={() => setOnly(!only)}>확인 대기 {s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length}</button><button className="iconbtn" onClick={onClose}><Icon n="x" size={15} /></button></div>
      <div className="modal-b" style={{ maxHeight: '55vh' }}>
        {list.length ? list.map((n) => { const b = botOf(n.botId); return <button key={n.id} className={`nrow ${n.read ? '' : 'unread'}`} onClick={() => onJump(n)}><FolderBot color={b?.color ?? '#e08850'} size={28} mood={n.kind === 'awaiting' ? 'wait' : n.kind === 'done' ? 'done' : n.kind === 'error' ? 'error' : 'idle'} /><div className="t"><div className="l1"><b>{n.title}</b><time>{fmtTime(n.t)}</time></div><div className="l2">{n.body}</div></div></button> }) : <div className="empty">알림이 없어요</div>}
      </div>
      <div className="modal-f"><button className="btn" onClick={readAll}>모두 읽음</button><span className="sp" /><button className="btn" onClick={enablePush}>{pushOn === true ? '폰 푸시 켜짐' : pushOn === false ? '푸시 실패 (HTTPS·홈 화면 설치 필요)' : '이 기기에 푸시 켜기'}</button><button className="btn" onClick={() => api('/push/test', { body: {} })}>푸시 테스트</button></div>
    </div>
  </>
}

/* ── 할 일 시트 ─────────────────────────────────────────────────────────── */
export function TodoSheet({ bot, onClose, onDelegate }: { bot: Bot; onClose: () => void; onDelegate: (t: TodoItem) => void }) {
  const { s, loadTodo, dispatch } = useStore()
  const items = s.todos[bot.id] ?? []
  const [line, setLine] = useState('')
  useEffect(() => { void loadTodo(bot.id) }, [bot.id])
  const add = async () => { const [t, ...rest] = line.split(':'); if (!t.trim()) return; const its = await api<TodoItem[]>(`/bots/${bot.id}/todo`, { body: { title: t.trim(), desc: rest.join(':').trim() } }); dispatch({ type: 'todos', botId: bot.id, items: its }); setLine('') }
  const toggle = async (t: TodoItem) => { const its = await api<TodoItem[]>(`/bots/${bot.id}/todo/toggle`, { body: { line: t.line, done: !t.done } }); dispatch({ type: 'todos', botId: bot.id, items: its }) }
  const open = items.filter((t) => !t.done), done = items.filter((t) => t.done)
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="sheet" style={{ ['--sheet-w' as string]: '44%' }}>
      <div className="sheet-h"><span className="tab"><Icon n="check" size={13} color="var(--accent)" /><span className="mono">todo.md</span></span><span className="acts"><span>미완료 {open.length}</span><button className="iconbtn" onClick={onClose}><Icon n="x" size={15} /></button></span></div>
      <div className="sheet-b" style={{ padding: '12px 10px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 6px 10px', background: 'var(--code)', border: '1px solid rgba(224,136,80,.45)', borderRadius: 10, padding: '6px 12px' }}><span className="todo" style={{ padding: 0 }}><span className="box" /></span><input style={{ flex: 1, background: 'none', border: 0, outline: 0, minHeight: 32 }} placeholder="제목: 설명 (Enter 로 추가)" value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} /></div>
        {open.map((t) => <TodoRow key={t.line} t={t} onToggle={() => toggle(t)} onDelegate={() => onDelegate(t)} />)}
        {done.length ? <><div className="sec" style={{ padding: '12px 10px 4px' }}>완료 {done.length}</div>{done.map((t) => <TodoRow key={t.line} t={t} onToggle={() => toggle(t)} />)}</> : null}
        <div style={{ margin: '12px 6px 0', padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.55 }}><b style={{ color: 'var(--dim)' }}>두 가지 쓰임.</b> 나는 잊지 않으려고 적고, 봇은 나에게 말하려고·자기가 다음에 하려고 적어요. 한 줄 = <span className="mono">- [ ] 제목: 설명</span>. 파일이 정본이라 Obsidian 에서 열어도 같은 목록이에요.</div>
      </div>
    </div>
  </>
}
export function TodoRow({ t, onToggle, onDelegate }: { t: TodoItem; onToggle: () => void; onDelegate?: () => void }) {
  return <div className={`todo ${t.done ? 'done' : ''}`}><button className="box" onClick={onToggle} aria-label="toggle">{t.done ? <Icon n="check" size={11} color="#000" /> : null}</button><div className="tt"><b>{t.title}<span className="who">{t.by === 'bot' ? <><FolderBot color="#6ea6f7" size={14} />봇</> : '나'}</span></b>{t.desc ? <small>{t.desc}</small> : null}</div>{onDelegate && !t.done ? <button className="iconbtn" title="봇에게 맡기기" onClick={onDelegate}><Icon n="send" size={13} color="var(--accent)" /></button> : null}</div>
}

/* ── 루틴 시트 ─────────────────────────────────────────────────────────── */
export function RoutineSheet({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const { refresh } = useStore()
  const [list, setList] = useState<RoutineDef[]>(bot.routines)
  const [i, setI] = useState(0); const [busy, setBusy] = useState(false)
  const cur = list[i]
  const upd = (p: Partial<RoutineDef>) => setList(list.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const save = async () => { setBusy(true); try { await api(`/bots/${bot.id}/routines`, { method: 'PUT', body: { routines: list } }); await refresh(); onClose() } finally { setBusy(false) } }
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="sheet" style={{ ['--sheet-w' as string]: '52%' }}>
      <div className="sheet-h"><span className="tab"><Icon n="clock" size={13} color="var(--accent)" />루틴 편집 · {bot.name}</span><span className="acts"><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={busy} onClick={save}>저장 → .bot.yml</button></span></div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 200, borderRight: '1px solid var(--border)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {list.map((r, k) => <button key={k} className={`srow ${k === i ? 'on' : ''}`} onClick={() => setI(k)}><Icon n="clock" size={13} color={k === i ? 'var(--accent)' : undefined} /><span className="n">{r.name || '(이름 없음)'}</span></button>)}
          <button className="srow" onClick={() => { setList([...list, { name: '새 루틴', cron: '0 7 * * *', prompt: '', approve: 'readonly', push: true }]); setI(list.length) }}><Icon n="plus" size={12} />새 루틴</button>
          {cur ? <button className="srow" style={{ color: 'var(--error)', marginTop: 'auto' }} onClick={() => { setList(list.filter((_, k) => k !== i)); setI(0) }}><Icon n="x" size={12} />이 루틴 삭제</button> : null}
        </div>
        <div className="sheet-b" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cur ? <>
            <div className="field"><label>이름</label><input value={cur.name} onChange={(e) => upd({ name: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div className="field"><label>주기 (cron)</label><input className="mono" value={cur.cron} onChange={(e) => upd({ cron: e.target.value })} /><small style={{ color: 'var(--faint)' }}>예: 0 7 * * * = 매일 07:00 · 0 20 * * 0 = 일요일 20:00</small></div><div className="field"><label>끝나면 폰으로 한 줄 푸시</label><select value={cur.push === false ? 'off' : 'on'} onChange={(e) => upd({ push: e.target.value === 'on' })}><option value="on">켬</option><option value="off">끔</option></select></div></div>
            <div className="field"><label>프롬프트</label><textarea rows={5} value={cur.prompt} onChange={(e) => upd({ prompt: e.target.value })} /></div>
            <div className="field"><label>승인 정책 · 사람이 없을 때</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{([['readonly', '읽기 전용 · 제안만', '파일을 쓰지 않아요. 기본값'], ['folder', '이 폴더 안 쓰기 허용', 'todo.md·노트 갱신까지'], ['always', '항상 허용', '루틴이 다 해요 (위험)']] as const).map(([v, t, sub]) => <button key={v} className={`preset ${(cur.approve ?? 'readonly') === v ? 'on' : ''}`} style={{ padding: '10px 12px', minWidth: 140 }} onClick={() => upd({ approve: v })}><b style={{ fontSize: 12 }}>{t}</b><small>{sub}</small></button>)}</div></div>
          </> : <div className="empty">루틴이 없어요. 왼쪽에서 추가하세요.</div>}
        </div>
      </div>
      <div className="sheet-f"><span>정본은 <span className="mono">{bot.rel || '.claude/routines.yml'}/.bot.yml</span></span><span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>루틴 세션은 봇당 동시 상한(4)에 포함돼요</span></div>
    </div>
  </>
}

/* ── 설정 ──────────────────────────────────────────────────────────────── */
export function Settings({ onClose }: { onClose: () => void }) {
  const { s, refresh } = useStore()
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null)
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal" style={{ width: 'min(560px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>설정</b><small>Folder Bot v{s.version}</small></div><button className="iconbtn" onClick={onClose}><Icon n="x" size={15} /></button></div>
      <div className="modal-b" style={{ padding: '0 18px 12px', gap: 14 }}>
        <div><div className="sec" style={{ padding: '8px 0 4px' }}>호스트</div><div className="kv"><span className="n">루트</span><span className="mono" style={{ fontSize: 11.5 }}>{s.root}</span></div><div className="kv"><span className="n">주소</span><span className="mono" style={{ fontSize: 11.5 }}>{s.addrs.map((a) => `http://${a}:${s.port}`).join(' · ')}</span></div>{s.tailnet ? <div className="kv"><span className="n">Tailscale</span><span>{s.tailnet.state}{s.tailnet.dnsName ? ` · ${s.tailnet.dnsName}` : ''}</span></div> : null}<div className="kv"><span className="n">Claude 로그인</span><span style={{ color: s.auth.verdict === 'loggedin' ? 'var(--done)' : 'var(--awaiting)' }}>{s.auth.verdict}{s.auth.email ? ` · ${s.auth.email}` : ''}</span><button className="btn ghost" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button></div></div>
        <div><div className="sec" style={{ padding: '8px 0 4px' }}>Claude 인증</div>
          <div className="kv" style={{ color: 'var(--faint)', lineHeight: 1.5, alignItems: 'flex-start' }}><span>미니가 키체인 로그인을 못 읽는 상황(헤드리스·SSH)이면 <b style={{ color: 'var(--dim)' }}>장기 토큰</b>을 씁니다. 아무 맥에서 터미널에 <span className="mono">claude setup-token</span> 을 치고 브라우저 승인 뒤 나온 토큰을 붙여 넣으세요 (1년 유효). ⚠ 토큰 모드에선 claude.ai 커넥터(Gmail·Notion 등)는 안 붙어요.</span></div>
          <TokenBox mode={s.auth.mode} /></div>
        <div><div className="sec" style={{ padding: '8px 0 4px' }}>기기</div>{s.devices.map((d) => <div className="kv" key={d.id}><Icon n="phone" size={13} /><span className="n">{d.name}</span><time style={{ fontSize: 11 }}>{fmtTime(d.lastSeen)}</time><button className="btn ghost" onClick={() => api('/devices/revoke', { body: { id: d.id } }).then(refresh)}>끊기</button></div>)}
          {isLocal ? <div className="kv"><span className="n">새 기기 연결</span>{pair ? <span className="mono" style={{ fontSize: 22, letterSpacing: '.18em', color: 'var(--strong)' }}>{pair.code}</span> : null}<button className="btn" onClick={async () => setPair(await api('/pairing', { body: {} }))}>페어링 코드</button></div> : <div className="kv" style={{ color: 'var(--faint)' }}>새 기기 연결은 미니의 화면(127.0.0.1)이나 터미널(p + Enter)에서</div>}</div>
        <div><div className="sec" style={{ padding: '8px 0 4px' }}>알림</div><div className="kv"><span className="n">이 기기 푸시</span><button className="btn" onClick={async () => setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30)))}>{pushOn === true ? '켜짐' : pushOn === false ? '실패 · HTTPS + 홈 화면 설치 필요' : '켜기'}</button></div><div className="kv" style={{ color: 'var(--faint)' }}>조용한 시간 23:00–07:00 (확인해 주세요만 통과). 폰 푸시는 Tailscale serve 로 HTTPS 를 붙이고 홈 화면에 설치해야 동작해요.</div></div>
        <div><div className="sec" style={{ padding: '8px 0 4px' }}>연결</div><button className="btn" onClick={() => { setToken(''); location.reload() }}>이 기기 로그아웃</button></div>
      </div>
    </div>
  </>
}

export function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState(''); const t = useRef<number | undefined>(undefined)
  return [msg, (m: string) => { setMsg(m); window.clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(''), 2600) }]
}

function TokenBox({ mode }: { mode?: 'login' | 'token' }) {
  const { refresh } = useStore()
  const [t, setT] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const save = async (token: string) => { setBusy(true); try { await api('/auth/token', { body: { token } }); await refresh(); setMsg(token ? '토큰을 저장했어요. 새 세션부터 적용돼요.' : '토큰을 지웠어요.'); setT('') } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 8px' }}>
    <div style={{ display: 'flex', gap: 8 }}><input className="mono" style={{ flex: 1, background: 'var(--code)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 10px', outline: 0 }} placeholder="sk-ant-oat01-…" value={t} onChange={(e) => setT(e.target.value)} /><button className="btn primary" disabled={busy || !t.trim()} onClick={() => save(t)}>저장</button>{mode === 'token' ? <button className="btn" disabled={busy} onClick={() => save('')}>지우기</button> : null}</div>
    <div style={{ fontSize: 12, color: mode === 'token' ? 'var(--done)' : 'var(--faint)' }}>{mode === 'token' ? '지금: 장기 토큰 모드' : '지금: 키체인 로그인 모드'}{msg ? ` · ${msg}` : ''}</div>
  </div>
}
