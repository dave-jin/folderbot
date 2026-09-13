import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

/** ⚠ 지연 로드 — CodeMirror 와 마크다운 파서는 문서를 열 때만 받는다 (번들 계약) */
const MdEditor = lazy(() => import('./MdEditor'))
/** ⚠ 캔버스도 지연 로드 — `.canvas` 를 한 번도 안 연 사람이 이 코드를 받을 이유가 없다 */
const Canvas = lazy(() => import('./Canvas'))
import type { Bot } from '../core/types'
import { api } from './api'
import { Icon, Mid } from './FolderBot'
import { Md } from './Sheets'
import { Float, anchorOf, type Anchor } from './Float'
import { fmtTime, useStore } from './store'

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
  const main = useStore().s.device.main   // ⚠ «외부 앱» 은 언제나 호스트에서 열린다 — 원격이면 이름을 바꾼다
  const rel = docs.active
  const [doc, setDoc] = useState<DocData | null>(null)
  const [err, setErr] = useState('')
  /**
   * 🔴 **보는 화면이 곧 고치는 화면이다** (2026-09-13 Dave: «rondo 와 같이 보기화면과 편집화면이 완벽하게 싱크»).
   *    「편집 모드」라는 상태를 없앴다 — 마크다운 문서는 **언제나** 라이브 프리뷰 편집기 하나로 그린다.
   *    ⛔ 읽기용 `Md`(marked) 와 편집용 편집기를 **둘 다 두지 않는다.** 둘을 오가는 순간 «싱크» 가 사람 몫이 되고,
   *       실제로 그 왕복에서 «떠날 때의 저장이 새 문서를 덮는» 사고가 났다(v0.6.3).
   *    ⚠ **잘려서 받은 파일(`truncated`)만 예외로 읽기 전용**이다 — 앞부분만 들고 저장하면 뒷부분이 날아간다.
   */
  const [draft, setDraft] = useState(''); const [saveSt, setSaveSt] = useState<'' | 'saving' | 'saved' | 'fail'>('')
  const [conflict, setConflict] = useState(false); const [botTouched, setBotTouched] = useState<number | null>(null)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const [sibs, setSibs] = useState<string[]>([])
  const mtimeRef = useRef<number>(0); const saveT = useRef<number | undefined>(undefined)
  /** 「고치는 중」이 아니라 **「아직 안 낸 글이 있다」** — 봇이 같은 파일을 건드렸을 때 덮어쓸지 물을 근거다 */
  const dirtyRef = useRef(false)
  const raw = (r: string) => `/api/bots/${bot.id}/raw?rel=${encodeURIComponent(r)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`
  const load = async (r: string, silent = false) => {
    try { const d = await api<DocData>(`/bots/${bot.id}/file?rel=${encodeURIComponent(r)}`); setDoc(d); setDraft(d.text ?? ''); mtimeRef.current = d.mtime ?? 0; setErr(''); if (!silent) { dirtyRef.current = false; setSaveSt(''); setConflict(false); setBotTouched(null) } }
    catch (e) { setErr((e as Error).message) }
  }
  /**
   * 🔴 **문서를 옮기면 편집을 먼저 닫는다.** 안 그러면 «떠날 때 못 낸 저장» 이 **새 문서에 실린다** —
   *    `onCommit` 은 매 렌더에 새로 묶이는데, `rel` 이 먼저 바뀌고 `edit` 은 `load` 가 끝난 뒤에야
   *    꺼지기 때문이다. 실제로 스모크가 **todo.md 가 표 문서로 덮인 것**으로 잡았다(2026-09-13).
   *    아래 `key={rel}` 과 짝이다 — 이쪽은 창을 닫고, 저쪽은 «옛 문서의 편집기» 를 옛 채로 보낸다.
   */
  useEffect(() => { if (rel) { dirtyRef.current = false; void load(rel) } else { setDoc(null); setDraft('') } }, [bot.id, rel])
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
      if (dirtyRef.current) { setConflict(true); return }
      setDoc(d); setDraft(d.text ?? ''); mtimeRef.current = d.mtime ?? 0; setBotTouched(d.mtime ?? Date.now())
    }).catch(() => {})
  }, [filesTick])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!rel) return
      const t = e.target as HTMLElement | null
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') { e.preventDefault(); docs.close(rel) }
      /**
       * 🔴 **↑↓ 는 지금 보고 있는 칸의 것이다** (2026-09-13 Dave: *«문서에서 위아래로 이동하려는데 폴더에서 파일 선택이 움직인다»*).
       *    종전 판정은 «`textarea`·`input` 이 아니면 글 쓰는 중이 아니다» 였는데, 문서 편집기는
       *    **`contenteditable`** 이라 그 그물에 안 걸렸다 — 그래서 문서에서 화살표를 누르면 커서 대신
       *    **옆 칸의 파일 선택**이 움직였다.
       * ⚠ 고치는 방법은 두 겹이다: ① 글 쓰는 중인가(`isContentEditable` 포함) ② **포커스가 문서 열 안인가**.
       *    ②가 없으면 편집기를 눌러 두고 마우스를 뗀 순간(포커스는 그대로) 또 같은 일이 난다.
       */
      const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)
      const inDoc = !!t?.closest?.('.col.doc')
      if (!typing && !inDoc && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sibs.length) { const i = sibs.indexOf(rel); const n = sibs[(i + (e.key === 'ArrowDown' ? 1 : -1) + sibs.length) % sibs.length]; if (n) { e.preventDefault(); docs.open(n) } }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const save = async (text: string) => { if (!rel) return; setSaveSt('saving'); try { await api(`/bots/${bot.id}/file`, { body: { rel, text } }); setSaveSt('saved'); dirtyRef.current = false; const d = await api<DocData>(`/bots/${bot.id}/file?rel=${encodeURIComponent(rel)}`); mtimeRef.current = d.mtime ?? 0 } catch { setSaveSt('fail') } }
  const onDraft = (v: string) => { setDraft(v); dirtyRef.current = true; window.clearTimeout(saveT.current); saveT.current = window.setTimeout(() => void save(v), 800) }
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
        {/* 모드가 없으니 알릴 상태도 없다 — 저장 중·실패일 때만 한 마디. ⛔ 「편집 중」 배지를 다시 만들지 마라 */}
        {saveSt === 'saving' || saveSt === 'fail' ? <span className={`st ${saveSt === 'fail' ? 'err' : ''}`}>{saveSt === 'saving' ? '저장 중' : '저장 실패'}</span> : null}
        {/* 🔴 **외부로 열기는 메뉴 밖에 둔다** (2026-09-13 Dave) — 문서를 보다가 «진짜 앱에서 열자» 는
            생각은 자주 들고, 그때마다 ⋯ 를 거치면 두 번 누르게 된다. ⚠ 여는 주체는 언제나 호스트라
            원격이면 이름이 「메인 맥에서」 로 바뀐다. */}
        <button className="ib" title={main ? '기본 앱으로 열기' : '메인 맥에서 열기'} onClick={async () => { try { await api(`/bots/${bot.id}/open`, { body: { rel } }); say(main ? '기본 앱으로 열었어요' : '메인 맥에서 열었어요') } catch (e) { say((e as Error).message) } }}><Icon n="open" size={13} /></button>
        <span style={{ position: 'relative' }}><button className="ib" onClick={(e) => setMenu(menu ? null : anchorOf(e.currentTarget, { right: true }))}><Icon n="more" size={13} /></button>
            {menu ? <Float at={menu} onClose={() => setMenu(null)}><div style={{ display: 'contents' }} onClick={() => setMenu(null)}><button onClick={() => onTalk(rel)}><Icon n="sub" size={13} /><span>봇에게 이 파일 말하기</span></button><button onClick={() => onAttach(rel)}><Icon n="plus" size={13} /><span>첨부로 보내기</span></button><button onClick={() => { navigator.clipboard?.writeText(`${bot.abs}/${rel}`); say('경로를 복사했어요') }}><Icon n="file" size={13} /><span>경로 복사</span></button><button onClick={async () => { try { await api(`/bots/${bot.id}/open`, { body: { rel } }); say(main ? '기본 앱으로 열었어요' : '메인 맥에서 열었어요') } catch (e) { say((e as Error).message) } }}><Icon n="open" size={13} /><span>{main ? '기본 앱으로 열기' : '메인 맥에서 열기'}</span>{main ? null : <span className="k">메인에서</span>}</button>
              {main ? null : <a className="menu-a" href={raw(rel)} download style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', color: 'var(--t)', textDecoration: 'none', fontSize: 12.5 }}><Icon n="doc" size={13} /><span>이 기기로 내려받기</span></a>}
              <a className="menu-a" href={raw(rel)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', color: 'var(--t)', textDecoration: 'none', fontSize: 12.5 }}><Icon n="open" size={13} /><span>새 창에서 열기</span></a><hr /><button onClick={() => docs.pin(rel)}><Icon n="doc" size={13} /><span>탭 고정</span><span className="k">더블클릭</span></button></div></Float> : null}</span>
      </span></div> : null}
    {conflict ? <div className="dbanner"><span className="dot wait" /><span>봇이 이 파일을 바꿨어요 — 아직 안 낸 내 글과 다릅니다</span><button onClick={() => { setConflict(false); void save(draft) }}>내 것 유지</button><button onClick={() => { setConflict(false); dirtyRef.current = false; if (rel) void load(rel) }}>봇 것 받기</button></div>
      : botTouched ? <div className="dbanner"><span className="dot run" /><span>봇이 {fmtTime(botTouched)} 수정</span><button onClick={() => setBotTouched(null)}>닫기</button></div> : null}
    {!rel ? <div className="empty">오른쪽 파일에서 열거나, 대화의 파일 칩을 누르세요</div>
      : err ? <div className="empty">{err}</div>
      : !doc ? <div className="dbody"><div className="skel" style={{ width: '60%', marginBottom: 10 }} /><div className="skel" style={{ width: '85%', marginBottom: 10 }} /><div className="skel" style={{ width: '70%' }} /></div>
      : doc.kind === 'text' ? (isMd && !doc.truncated
        ? <div className="dbody edit md-edit">
            {/* 🔴 마크다운은 **서식이 보이는 채로** 읽고 그대로 고친다 — 보기/편집이 한 화면이다.
                원문 textarea 는 마크다운이 아닌 텍스트에만 남는다 — 코드·설정 파일은 서식이라는 게 없어서
                원문이 곧 정답이다.
                ⚠ 편집기는 **지연 로드**한다: 문서를 한 번도 안 연 폰이 마크다운 파서를 받으면 안 된다. */}
            <Suspense fallback={<div className="dbody"><div className="skel" style={{ width: '70%' }} /></div>}>
              {/* ⛔ `key={rel}` 을 빼지 마라 — 문서마다 편집기를 따로 둬야 떠날 때의 저장이 옛 문서로 간다
                  (되돌리기 기록이 문서를 넘나드는 것도 함께 막는다). */}
              <MdEditor key={rel} value={draft} onChange={onDraft} onCommit={(t) => { onDraft(t); void save(t) }} onOpen={(target) => docs.open(target.endsWith('.md') ? target : `${target}.md`)} rawUrl={(p) => (/^(https?:|data:)/.test(p) ? p : raw(p.replace(/^\.\//, '')))} />
            </Suspense>
          </div>
        : doc.truncated
          ? <div className="dbody">{isMd ? <Md text={doc.text ?? ''} /> : <pre className="raw">{doc.text}</pre>}<div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 12 }}>큰 파일이라 앞부분만 보여요 — 그래서 여기서는 못 고쳐요</div></div>
          : <div className="dbody edit"><textarea value={draft} onChange={(e) => onDraft(e.target.value)} spellCheck={false} /></div>)
      : doc.kind === 'canvas' ? <div className="dbody cvswrap">
          {/* Obsidian 의 `.canvas` — 보기만이 아니라 **고치기까지** (2026-09-13 Dave 확정) */}
          <Suspense fallback={<div className="dbody"><div className="skel" style={{ width: '70%' }} /></div>}>
            <Canvas key={rel} text={doc.text ?? ''} onCommit={(t) => { onDraft(t); void save(t) }} onOpenFile={(f) => docs.open(f)} raw={(f) => raw(f.replace(/^\.\//, ''))} readOnly={!!doc.truncated} />
          </Suspense>
        </div>
      : doc.kind === 'image' ? <div className="dbody center"><img src={raw(rel)} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 6 }} /></div>
      : doc.kind === 'html' ? <div className="dbody htmlv">
          {/* 🔴 **샌드박스 안에서 그린다.** 에이전트가 만든 리포트를 앱 안에서 그대로 보되,
              그 안의 스크립트가 볼트를 읽거나 우리 화면을 만지지 못하게 가둔다.
              ⛔ `allow-same-origin` 을 주지 않는다 — 주는 순간 샌드박스가 사실상 없는 것과 같다. */}
          <div className="hbar"><span className="dots"><i /><i /><i /></span><span className="addr mono">{rel.split('/').pop()}</span></div>
          <iframe className="hframe" sandbox="allow-scripts allow-popups" src={raw(rel)} title={rel} />
        </div>
      : doc.kind === 'pdf' ? <iframe className="dbody" style={{ padding: 0, border: 0, background: '#fff' }} src={raw(rel)} />
      : <div className="empty">미리보기가 없는 형식이에요 · {doc.size} bytes<a href={raw(rel)} target="_blank" rel="noreferrer" className="btn">새 창에서 열기</a></div>}
    {phone && rel ? <div className="dfoot">{sibs.length > 1 ? <><button className="rb" onClick={() => docs.open(sibs[(idx - 1 + sibs.length) % sibs.length])}><Icon n="up" size={18} /></button><button className="rb" onClick={() => docs.open(sibs[(idx + 1) % sibs.length])}><Icon n="chevd" size={18} /></button></> : null}<button className="talk" onClick={() => onAttach(rel)}>봇에게 이 문서로 말하기</button></div> : null}
  </div>
}
