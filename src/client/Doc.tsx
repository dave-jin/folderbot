import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bot } from '../core/types'
import { api } from './api'
import { Icon, Mid } from './FolderBot'
import { Md } from './Sheets'
import { fmtTime } from './store'

/** 문서 탭 — 봇별로 기억. 미리보기 탭(pinned=false)은 다음 클릭에 바뀐다 */
export interface DocTab { rel: string; pinned: boolean }
export interface DocsApi { tabs: DocTab[]; active: string | null; open: (rel: string, pin?: boolean) => void; close: (rel: string) => void; pin: (rel: string) => void; setActive: (rel: string) => void }

export function useDocs(botId: string): DocsApi {
  const key = `fb:docs:${botId}`
  const [st, setSt] = useState<{ tabs: DocTab[]; active: string | null }>(() => { try { return JSON.parse(localStorage.getItem(key) ?? '') } catch { return { tabs: [], active: null } } })
  useEffect(() => { try { setSt(JSON.parse(localStorage.getItem(key) ?? '')) } catch { setSt({ tabs: [], active: null }) } }, [key])
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(st)) } catch { /* */ } }, [key, st])
  return useMemo(() => ({
    tabs: st.tabs, active: st.active,
    open: (rel, pin = false) => setSt((s) => {
      const has = s.tabs.find((t) => t.rel === rel)
      if (has) return { tabs: pin ? s.tabs.map((t) => (t.rel === rel ? { ...t, pinned: true } : t)) : s.tabs, active: rel }
      const pv = s.tabs.findIndex((t) => !t.pinned)
      const tabs = pin || pv < 0 ? [...s.tabs, { rel, pinned: pin }] : s.tabs.map((t, i) => (i === pv ? { rel, pinned: false } : t))
      return { tabs, active: rel }
    }),
    close: (rel) => setSt((s) => { const i = s.tabs.findIndex((t) => t.rel === rel); const tabs = s.tabs.filter((t) => t.rel !== rel); const active = s.active === rel ? (tabs[Math.min(i, tabs.length - 1)]?.rel ?? null) : s.active; return { tabs, active } }),
    pin: (rel) => setSt((s) => ({ ...s, tabs: s.tabs.map((t) => (t.rel === rel ? { ...t, pinned: true } : t)) })),
    setActive: (rel) => setSt((s) => ({ ...s, active: rel }))
  }), [st])
}

interface DocData { kind: string; text?: string; size?: number; mtime?: number; truncated?: boolean }

/** 문서 열 — 헤더(탭) · 툴바(폴더/파일 · 위치 · ⋯) · 본문. 편집은 자동 저장, 봇이 고치면 한 줄 배너 */
export function DocPane({ bot, docs, filesTick, onTalk, onHide, wide, onWide, onAttach, say, phone, onBack }: { bot: Bot; docs: DocsApi; filesTick?: number; onTalk: (rel: string) => void; onHide: () => void; wide: boolean; onWide: () => void; onAttach: (rel: string) => void; say: (m: string) => void; phone?: boolean; onBack?: () => void }) {
  const rel = docs.active
  const [doc, setDoc] = useState<DocData | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false); const [draft, setDraft] = useState(''); const [saveSt, setSaveSt] = useState<'' | 'saving' | 'saved' | 'fail'>('')
  const [conflict, setConflict] = useState(false); const [botTouched, setBotTouched] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const [sibs, setSibs] = useState<string[]>([])
  const mtimeRef = useRef<number>(0); const saveT = useRef<number | undefined>(undefined); const editingRef = useRef(false)
  const raw = (r: string) => `/api/bots/${bot.id}/raw?rel=${encodeURIComponent(r)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`
  const load = async (r: string, silent = false) => {
    try { const d = await api<DocData>(`/bots/${bot.id}/file?rel=${encodeURIComponent(r)}`); setDoc(d); mtimeRef.current = d.mtime ?? 0; setErr(''); if (!silent) { setEdit(false); editingRef.current = false; setConflict(false); setBotTouched(null) } }
    catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { if (rel) void load(rel); else setDoc(null) }, [bot.id, rel])
  // 같은 폴더의 형제 — 위치(2/4)와 ↑↓ 이동
  useEffect(() => {
    if (!rel) return
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    void api<{ name: string; rel: string; dir: boolean }[]>(`/bots/${bot.id}/ls?dir=${encodeURIComponent(dir)}`).then((l) => setSibs(l.filter((x) => !x.dir).map((x) => x.rel))).catch(() => setSibs([]))
  }, [bot.id, rel, filesTick])
  // 봇이 파일을 쓰면 — 편집 중이 아니면 조용히 새로고침, 편집 중이면 충돌 배너
  useEffect(() => {
    if (!rel || !filesTick) return
    void api<DocData>(`/bots/${bot.id}/file?rel=${encodeURIComponent(rel)}`).then((d) => {
      if ((d.mtime ?? 0) <= mtimeRef.current) return
      if (editingRef.current) { setConflict(true); return }
      setDoc(d); mtimeRef.current = d.mtime ?? 0; setBotTouched(d.mtime ?? Date.now())
    }).catch(() => {})
  }, [filesTick])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!rel) return
      const t = e.target as HTMLElement | null; const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')
      if (e.key === 'Escape' && edit) { e.preventDefault(); finishEdit() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') { e.preventDefault(); docs.close(rel) }
      if (!typing && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sibs.length) { const i = sibs.indexOf(rel); const n = sibs[(i + (e.key === 'ArrowDown' ? 1 : -1) + sibs.length) % sibs.length]; if (n) { e.preventDefault(); docs.open(n) } }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const startEdit = () => { if (!doc || doc.kind !== 'text') return; setDraft(doc.text ?? ''); setEdit(true); editingRef.current = true; setSaveSt('') }
  const finishEdit = () => { window.clearTimeout(saveT.current); void save(draft).then(() => { setEdit(false); editingRef.current = false; if (rel) void load(rel, true) }) }
  const save = async (text: string) => { if (!rel) return; setSaveSt('saving'); try { await api(`/bots/${bot.id}/file`, { body: { rel, text } }); setSaveSt('saved'); const d = await api<DocData>(`/bots/${bot.id}/file?rel=${encodeURIComponent(rel)}`); mtimeRef.current = d.mtime ?? 0 } catch { setSaveSt('fail') } }
  const onDraft = (v: string) => { setDraft(v); window.clearTimeout(saveT.current); saveT.current = window.setTimeout(() => void save(v), 800) }
  const idx = rel ? sibs.indexOf(rel) : -1
  const name = rel?.split('/').pop() ?? ''; const dir = rel && rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : (bot.orchestrator ? '볼트' : bot.name)
  const isMd = /\.(md|markdown|txt)$/i.test(rel ?? '')
  return <div className="col doc" style={{ flex: wide ? 3 : 1.15 }}>
    <div className="hdr" style={phone ? undefined : { paddingLeft: 10 }}>
      {phone ? <><button className="rb glassb" onClick={onBack} title="폴더로"><Icon n="back" size={20} /></button><span className="ttl"><Mid s={name || '문서'} /></span><span className="sp" /></> : null}
      <div className="tabs">{docs.tabs.slice(0, 6).map((t) => <button key={t.rel} className={`tab ${t.rel === docs.active ? 'on' : ''} ${t.pinned ? '' : 'pv'}`} onClick={() => docs.setActive(t.rel)} onDoubleClick={() => docs.pin(t.rel)} title={t.rel}>{t.rel.split('/').pop()}<span className="x" onClick={(e) => { e.stopPropagation(); docs.close(t.rel) }}><Icon n="x" size={9} /></span></button>)}{docs.tabs.length > 6 ? <span className="more">+{docs.tabs.length - 6}</span> : null}</div>
      <div className="acts"><button className={`ib ${wide ? 'on' : ''}`} onClick={onWide} title="넓게"><Icon n="expand" size={13} /></button><button className="ib" onClick={onHide} title="문서 열 접기 (⌘⇧D)"><Icon n="x" size={13} /></button></div>
    </div>
    {rel ? <div className="dtb"><span>{dir}</span><span>/</span><span className="nm">{name}</span>
      <span className="r">
        {sibs.length > 1 ? <><button className="nb" onClick={() => docs.open(sibs[(idx - 1 + sibs.length) % sibs.length])}><Icon n="back" size={10} /></button><span className="pos">{idx + 1} / {sibs.length}</span><button className="nb" style={{ transform: 'scaleX(-1)' }} onClick={() => docs.open(sibs[(idx + 1) % sibs.length])}><Icon n="back" size={10} /></button></> : null}
        {edit ? <><span className={`st ${saveSt === 'fail' ? 'err' : ''}`}>{saveSt === 'saving' ? '저장 중' : saveSt === 'saved' ? '저장됨 · 방금' : saveSt === 'fail' ? '저장 실패' : '편집 중'}</span><button className="btn" style={{ minHeight: 24, padding: '2px 8px', fontSize: 11.5 }} onClick={finishEdit}>완료</button></>
          : <span style={{ position: 'relative' }}><button className="ib" onClick={() => setMenu(!menu)}><Icon n="more" size={13} /></button>
            {menu ? <div className="menu" style={{ right: 0, top: 26 }} onClick={() => setMenu(false)}>{doc?.kind === 'text' ? <button onClick={startEdit}><Icon n="edit" size={13} /><span>편집</span><span className="k">⏎ 자동 저장</span></button> : null}<button onClick={() => onTalk(rel)}><Icon n="sub" size={13} /><span>봇에게 이 파일 말하기</span></button><button onClick={() => onAttach(rel)}><Icon n="plus" size={13} /><span>첨부로 보내기</span></button><button onClick={() => { navigator.clipboard?.writeText(`${bot.abs}/${rel}`); say('경로를 복사했어요') }}><Icon n="file" size={13} /><span>경로 복사</span></button><a className="menu-a" href={raw(rel)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', color: 'var(--t)', textDecoration: 'none', fontSize: 12.5 }}><Icon n="open" size={13} /><span>새 창에서 열기</span></a><hr /><button onClick={() => docs.pin(rel)}><Icon n="doc" size={13} /><span>탭 고정</span><span className="k">더블클릭</span></button></div> : null}</span>}
      </span></div> : null}
    {conflict ? <div className="dbanner"><span className="dot wait" /><span>봇이 이 파일을 바꿨어요 — 편집 중인 내용과 다릅니다</span><button onClick={() => { setConflict(false); void save(draft) }}>내 것 유지</button><button onClick={() => { setConflict(false); setEdit(false); editingRef.current = false; if (rel) void load(rel) }}>봇 것 받기</button></div>
      : botTouched ? <div className="dbanner"><span className="dot run" /><span>봇이 {fmtTime(botTouched)} 수정</span><button onClick={() => setBotTouched(null)}>닫기</button></div> : null}
    {!rel ? <div className="empty">오른쪽 파일에서 열거나, 대화의 파일 칩을 누르세요</div>
      : err ? <div className="empty">{err}</div>
      : !doc ? <div className="dbody"><div className="skel" style={{ width: '60%', marginBottom: 10 }} /><div className="skel" style={{ width: '85%', marginBottom: 10 }} /><div className="skel" style={{ width: '70%' }} /></div>
      : edit ? <div className="dbody edit"><textarea value={draft} onChange={(e) => onDraft(e.target.value)} spellCheck={false} autoFocus /></div>
      : doc.kind === 'text' ? <div className="dbody" onDoubleClick={startEdit}>{isMd ? <Md text={doc.text ?? ''} /> : <pre className="raw">{doc.text}</pre>}{doc.truncated ? <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 12 }}>큰 파일이라 앞부분만 보여요</div> : null}</div>
      : doc.kind === 'image' ? <div className="dbody center"><img src={raw(rel)} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 6 }} /></div>
      : doc.kind === 'pdf' ? <iframe className="dbody" style={{ padding: 0, border: 0, background: '#fff' }} src={raw(rel)} />
      : <div className="empty">미리보기가 없는 형식이에요 · {doc.size} bytes<a href={raw(rel)} target="_blank" rel="noreferrer" className="btn">새 창에서 열기</a></div>}
    {phone && rel ? <div className="dfoot">{sibs.length > 1 ? <><button className="rb" onClick={() => docs.open(sibs[(idx - 1 + sibs.length) % sibs.length])}><Icon n="up" size={18} /></button><button className="rb" onClick={() => docs.open(sibs[(idx + 1) % sibs.length])}><Icon n="chevd" size={18} /></button></> : null}<button className="talk" onClick={() => onAttach(rel)}>봇에게 이 문서로 말하기</button></div> : null}
  </div>
}
