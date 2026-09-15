import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bot, ChatItem, NotifyEvent, PermissionMode, PermissionRequest, RoutineDef, SessionInfo, SlashCmd } from '../core/types'
import { api, setToken, token, uploadFile } from './api'
import { FolderBot, Icon, Mid, moodOf } from './FolderBot'
import { AskHost, FolderPicker, Md, NotifyCenter, Onboarding, Pairing, RoutineSheet, Settings, askName, useToast } from './Sheets'
import { AgentPickHost, pickAgent } from './AgentPick'
import type { SecId } from './Settings'
import { VendorMark } from './Brand'
import { Float } from './Float'
import { DocPane, useDocs } from './Doc'
import { Elapsed, Panel, type SecH } from './Panel'
import { machSummary } from '../core/chat'
import { norm, scoreName } from '../core/search'
import { fmtTime, useStore } from './store'
import { ICON_PX, useIconSize, useTheme } from './theme'
import { UsageCard, UsageStrip, useUsage } from './Usage'
import { PermGate, usePerms } from './Perms'
import { Palette } from './Palette'
import { MODES, effortLabel, effortsFor, fmtK, modeLabel, modelLabel, modelsFor, moreModelsFor, setFoundModels } from './consts'
import { DEFAULT_EFFORT, DEFAULT_MODEL } from '../core/agents'
import { cronFromText, routineName } from '../core/routineText'
import { BARE_URL_RE, faviconHost } from '../core/favicon'
import { workLabel, workMood } from '../core/work'
import { GLOBE, faviconNow, onFavicon } from './favicons'
import { hoverRef } from './previews'
import { copySay } from './clip'

type Tool = Extract<ChatItem, { kind: 'tool' }>
type Sub = Extract<ChatItem, { kind: 'subagent' }>
type Att = { rel: string; abs: string; dir?: boolean; uploaded?: boolean }
const stateDot = (st?: string) => (st === 'running' ? 'run' : st === 'awaiting_input' ? 'wait' : st === 'error' ? 'err' : 'none')

function useHash(): [Record<string, string>, (p: Record<string, string>) => void] {
  const parse = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)))
  const [h, setH] = useState<Record<string, string>>(parse)
  useEffect(() => { const f = () => setH(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return [h, (p) => { location.hash = new URLSearchParams(p).toString() }]
}
function useMedia(q: string): boolean { const [m, setM] = useState(() => window.matchMedia(q).matches); useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [q]); return m }
/** 폰 키보드 — visualViewport 가 창보다 훨씬 낮아지면 열린 것 */
/**
 * 키보드 — 루트(#root)를 **시각 뷰포트**(visualViewport)에 맞춘다 (`--vvh`·`--vvt`, 폰 CSS 가 읽는다).
 * iOS 는 키보드가 뜨면 레이아웃 뷰포트를 줄이기도(브라우저), 안 줄이기도(홈화면 앱·iOS 26) 하고, 닫힌 뒤
 * 안 돌려주기도 한다(하단 띠). 종전의 «innerHeight − vv.height 만큼 컴포저를 올린다» 는 레이아웃 뷰포트가
 * 안 줄 때만 맞았고, v14 의 «100vh 고정» 은 반대로 키보드 아래에 컴포저를 묻었다(2026-09-13 Dave 스크린샷).
 * 시각 뷰포트만이 언제나 «지금 보이는 만큼» 이다 — 그 높이를 루트 높이로 쓰면 컴포저는 늘 키보드 바로 위다.
 * 열림 판정은 «입력칸에 포커스 + 최대 높이보다 140px 이상 줄었다» — 창 크기 조절·회전을 키보드로 착각하지 않는다.
 */
function useKeyboard(): boolean {
  const [kb, setKb] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    /**
     * 키보드가 **열렸을 때만** 시각 뷰포트 높이를 쓴다(`--vvh`). 닫히면 값을 지워 CSS 의 `100dvh` 로 돌아간다.
     * 🔴 종전에는 «본 적 있는 최대 높이»를 기억해 썼는데, 한 번이라도 크게 잡히면(주소창·회전·부분 스크롤)
     *    루트가 화면보다 커져 **컴포저가 화면 밖으로 밀려났다**(2026-09-13 Dave 스크린샷). 최대값은 지어낸 숫자다 —
     *    닫힌 상태의 정답은 브라우저가 아는 `100dvh` 이고, 열린 상태의 정답만 시각 뷰포트다.
     */
    const f = () => {
      const ae = document.activeElement as HTMLElement | null
      const editing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
      /**
       * 🔴 **문턱으로 «열렸나» 를 판정하지 않는다** (2026-09-13, 3차 사고에서 배운 것).
       * 종전에는 «키보드가 N px 이상 먹었을 때만» 루트를 시각 뷰포트에 맞췄다. 그 판정이 두 번 틀렸다 —
       * ① offsetTop 을 빼던 식(2차) ② 레이아웃 뷰포트까지 함께 줄어드는 판(iOS 26 · Android)에서는
       *    innerHeight − vv.height 가 0 이라 «닫혔다» 로 떨어졌고, 그러면 루트가 100dvh 로 돌아가는데
       *    그 dvh 가 키보드를 반영하지 않아 **대화가 키보드 위로 안 올라왔다**(Dave 3차 스크린샷).
       *
       * 정답은 문턱이 아니라 **입력 중이냐** 하나다. 입력 중이면 보이는 영역이 곧 시각 뷰포트이고,
       * 키보드가 닫혀 있었다면 vv.height 가 곧 화면 높이라 100dvh 와 같은 값이 된다 — 해가 없다.
       * 입력 중이 아닐 때만 값을 지워 `100dvh` 로 돌아간다(iOS 가 높이를 덜 돌려줘도 아래 띠가 안 생긴다).
       */
      const open = editing
      const st = document.documentElement.style
      if (open) {
        st.setProperty('--vvh', `${Math.round(vv.height)}px`); st.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
        /**
         * 🔴 `position:fixed` 인 것들(시트·백드롭)은 **레이아웃 뷰포트** 바닥에 붙는다 — 루트를 줄여도
         *    그것들은 키보드 밑에 깔린다(스모크가 «저장 버튼이 키보드 밑에 묻힌다» 로 잡았다).
         *    키보드가 먹은 높이를 `--kbh` 로 내보내 `bottom:var(--kbh)` 로 띄운다.
         */
        st.setProperty('--kbh', `${Math.max(0, Math.round(window.innerHeight - vv.offsetTop - vv.height))}px`)
      } else { st.removeProperty('--vvh'); st.removeProperty('--vvt'); st.removeProperty('--kbh') }
      /**
       * 🔴 **화장에도 문턱을 쓰지 않는다** (2026-09-13 Dave 4차 스크린샷 — 이 문턱의 네 번째 사고).
       * 종전엔 «키보드가 140px 이상 먹었을 때만» 머리·모델 칩을 접었다. 그런데 레이아웃 뷰포트까지 함께
       * 줄어드는 판(홈 화면 앱 · 타사 키보드)에서는 `innerHeight − vv.height` 가 **0** 이라 그 문턱이
       * «안 열렸다» 로 떨어진다. 그래서 칩이 그대로 남고 `.chat-foot` 이 `--sab`(홈 인디케이터 34pt)까지
       * 계속 비워 둬 **입력창과 키보드 사이가 통째로 떴다.** 그 34pt 는 이미 키보드가 덮은 자리다.
       * 판정은 레이아웃 때와 같은 하나뿐이다 — **입력 중이냐.**
       */
      setKb(open)
      if (!open) window.scrollTo(0, 0)
    }
    // 키보드가 내려가는 동안 값이 흔들린다 — 포커스가 빠진 뒤 세 번 다시 잰다
    const later = () => { setTimeout(f, 50); setTimeout(f, 300); setTimeout(f, 700) }
    f(); vv.addEventListener('resize', f); vv.addEventListener('scroll', f); window.addEventListener('resize', f); document.addEventListener('focusin', f); document.addEventListener('focusout', later); document.addEventListener('visibilitychange', later)
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); window.removeEventListener('resize', f); document.removeEventListener('focusin', f); document.removeEventListener('focusout', later); document.removeEventListener('visibilitychange', later) }
  }, [])
  return kb
}

/** 핀치·더블탭·ctrl+휠 확대 차단 — iOS 는 user-scalable=no 를 무시하기도 한다 (elon-bookclub ViewportLock 승계) */
function useViewportLock(): void {
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    const touch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    const wheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault() }
    for (const n of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(n, block, { passive: false })
    document.addEventListener('touchmove', touch, { passive: false }); document.addEventListener('wheel', wheel, { passive: false })
    return () => { for (const n of ['gesturestart', 'gesturechange', 'gestureend']) document.removeEventListener(n, block); document.removeEventListener('touchmove', touch); document.removeEventListener('wheel', wheel) }
  }, [])
}

export function App() {
  const { s } = useStore()
  useViewportLock()
  const [authed, setAuthed] = useState(() => { const h = new URLSearchParams(location.hash.slice(1)); const t = h.get('token'); if (t) { setToken(t); h.delete('token'); location.hash = h.toString(); location.reload() } return !!token() })
  useEffect(() => { const f = () => setAuthed(false); window.addEventListener('fb:authlost', f); return () => window.removeEventListener('fb:authlost', f) }, [])
  const perm = usePerms() // ⚠ 훅은 early return 앞에 — 뒤에 두면 React #310(훅 수 변동)
  /**
   * 🔴 **모델 목록을 기계에서 받아 온다** — 앱이 뜰 때 한 번(2026-09-13 Dave: «미리 설정에 fixed
   *    하지 말고»). 설정과 입력창이 **같은 목록**을 보도록 `consts` 한 곳에 둔다.
   * ⚠ 실패해도 그냥 넘어간다 — 못 받아 오면 빌트인 목록이 그대로 쓰인다.
   */
  useEffect(() => { void api<{ claude: string[]; codex: string[] }>('/agents/models').then(setFoundModels).catch(() => {}) }, [])
  useTheme() // 저장된 테마를 부팅 즉시 적용
  if (!authed) return <div className="app"><Pairing onDone={() => location.reload()} /></div>
  if (!s.loaded) return <div className="app"><div className="empty"><FolderBot color="#e08850" size={40} mood="work" />호스트에 연결하는 중…</div></div>
  if (perm.open && perm.items) return <div className="app"><PermGate items={perm.items} refresh={perm.refresh} onDone={() => perm.setOpen(false)} /></div>
  if (!s.rulesInstalled) return <div className="app"><Onboarding /></div>
  return <Main />
}

interface Layout { sb: number; rp: number; doc: number; sbOpen: boolean; rpOpen: boolean; sbPin: boolean; rpPin: boolean; secH: SecH }
/** 대화 열 최소 폭 — 이 아래면 글이 한 글자씩 접혀 화면이 망가진다 (2026-09-13 Dave 스크린샷: 대화 열 ~100px) */
const CHAT_MIN = 360
const DOC_MIN = 380, SIDE_MIN = 200, STRIP_W = 45
function useWinW(): number { const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440)); useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, []); return w }
const DEF: Layout = { sb: 250, rp: 290, doc: 520, sbOpen: true, rpOpen: true, sbPin: false, rpPin: false, secH: { sessions: 120, todo: 128 } }
interface UpdState { lastCheck: number; current: string; staged: { version: string; ready: boolean; progress: number; notes: string } | null; downloading: boolean; checking: boolean; lastError: string; deferred: boolean; busy: number; host: boolean }
/**
 * 단축키 표 — 🔴 **여기가 정본이고 ⌘/ 가 이걸 그대로 보여 준다.**
 *    표를 따로 쓰면 실제 동작과 갈리고, 갈린 표는 없느니만 못하다.
 * ⚠ 맥 표기(⌘·⇧)로 적되, 윈도·리눅스에서도 같은 키가 ⌃ 로 돈다(핸들러가 둘 다 받는다).
 */
export const KEYS: { k: string; t: string; d?: string }[] = [
  { k: '⌘,', t: '설정' },
  { k: '⌘/', t: '단축키 보기' },
  { k: '⌘P', t: '명령 팔레트', d: '폴더 · 문서 · 세션 · 명령' },
  { k: '⌘K', t: '폴더 고르기 · 시작' },
  { k: '⌘N', t: '새 세션', d: '지금 폴더' },
  { k: '⌘⇧N', t: '새 폴더에서 시작' },
  { k: '⌘1…9', t: 'n번째 폴더로' },
  { k: '⌘[ ⌘]', t: '이전 · 다음 폴더' },
  { k: '⌘B', t: '폴더 목록 접기' },
  { k: '⌘⇧B', t: '오른쪽 패널 접기' },
  { k: '⌘⇧D', t: '문서 열 접기' },
  { k: '⌘⇧U', t: '알림' },
  { k: '⌘W', t: '문서 탭 닫기' },
  { k: '↩', t: '보내기', d: '자판이 있는 기기에서 — 폰에서는 줄 바꾸기(보내기는 단추)' },
  { k: '⇧↩', t: '줄 바꾸기' },
  { k: '⌘↩', t: '보내기', d: '어디서나 — 폰에 외장 자판을 붙였을 때도' },
  { k: '⎋', t: '닫기 · 편집 끝내기' },
  { k: '⌘Z', t: '실행 취소', d: '맥 기본 — 우리가 안 가로챈다' },
  { k: '⌘F', t: '문서에서 찾기', d: '편집기 기본' }
]

function KeysSheet({ onClose }: { onClose: () => void }) {
  return <div className="modal-w" onClick={onClose}><div className="modal keys" onClick={(e) => e.stopPropagation()}>
    <div className="modal-h"><b>단축키</b><span className="sp" /><button className="ib" onClick={onClose}><Icon n="x" size={13} /></button></div>
    <div className="modal-b">{KEYS.map((x) => <div className="krow" key={x.k}><span className="kk mono">{x.k}</span><span className="kt">{x.t}</span>{x.d ? <span className="kd">{x.d}</span> : null}</div>)}</div>
  </div></div>
}

interface DesktopBridge { version?: string; onCmd?: (cb: (c: string) => void) => () => void; update?: { state: () => Promise<UpdState>; check: () => Promise<UpdState>; apply: () => void; onChange: (cb: (st: UpdState) => void) => () => void } }
const desk = (window as unknown as { folderbotDesktop?: DesktopBridge }).folderbotDesktop
const isDesktop = typeof desk !== 'undefined'

/** 자기 업데이트 — 셸(Electron)이 받아 두고, 여기서는 상태를 보여 주고 «재시작» 만 누른다 */
function useUpdate(say: (m: string) => void): [UpdState | null, () => void, () => void] {
  const [st, setSt] = useState<UpdState | null>(null)
  const readyRef = useRef('')
  useEffect(() => {
    const u = desk?.update; if (!u) return
    void u.state().then(setSt).catch(() => {})
    return u.onChange((n) => { setSt(n); if (n.staged?.ready && readyRef.current !== n.staged.version) { readyRef.current = n.staged.version; say(n.deferred ? `v${n.staged.version} 준비됨 — 세션 ${n.busy}개가 끝나면 자동으로 적용해요` : `v${n.staged.version} 준비됨 — 아래 버전 칩에서 재시작`) } })
  }, [])
  const check = () => {
    const u = desk?.update
    if (!u) { say('업데이트는 Mac 앱(호스트)이 스스로 받아요 — 이 화면은 호스트가 새 버전을 적용하면 함께 바뀝니다'); return }
    setSt((x) => (x ? { ...x, checking: true } : x)); say('업데이트 확인 중…')
    void u.check().then((n) => {
      setSt(n)
      say(n.lastError ? `확인 실패 — ${n.lastError}` : n.staged?.ready ? `v${n.staged.version} 준비됨 — 버전 칩을 눌러 재시작` : n.downloading || n.staged ? `v${n.staged?.version} 받는 중 — 다 받으면 알려 드려요` : `최신 버전이에요 (v${n.current})`)
    }).catch((e: unknown) => say(`확인 실패 — ${e instanceof Error ? e.message : String(e)}`))
  }
  const apply = () => { const u = desk?.update; if (!u || !st?.staged?.ready) return; if (st.busy > 0 && !confirm(`세션 ${st.busy}개가 중단됩니다. 지금 재시작해서 v${st.staged.version} 을 적용할까요?`)) return; u.apply() }
  return [st, check, apply]
}
function UpdateChip({ version, st, onCheck, onApply }: { version: string; st: UpdState | null; onCheck: () => void; onApply: () => void }) {
  if (!isDesktop || !st) return <button className="bd mono upd" onClick={onCheck} title={isDesktop ? '업데이트 확인' : '호스트 버전'}>v{version}</button>
  if (st.staged?.ready) return st.deferred ? <span className="bd upd" style={{ color: 'var(--wait)' }} title={`v${st.staged.version} 준비됨 — 세션 ${st.busy}개가 끝나면 자동으로 적용`}>v{st.staged.version} · {st.busy}개 끝나면</span>
    : <button className="bd upd" style={{ color: 'var(--done)' }} onClick={onApply} title={`v${st.staged.version} 준비됨 — 눌러서 재시작·적용\n${st.staged.notes}`}><span className="dot done" style={{ width: 5, height: 5 }} />v{st.staged.version} · 적용</button>
  if (st.downloading) return <span className="bd" title="조용히 받는 중 — 다 받으면 알려 드려요">v{st.staged?.version} 받는 중 {Math.round((st.staged?.progress ?? 0) * 100)}%</span>
  return <button className="bd mono upd" onClick={onCheck} title={st.lastError ? `마지막 확인 실패 — ${st.lastError}` : st.lastCheck ? `업데이트 확인 · 마지막 ${fmtTime(st.lastCheck)}` : '업데이트 확인'} style={st.lastError ? { color: 'var(--wait)' } : undefined}><Icon n="undo" size={10} style={st.checking ? { animation: 'spin 1s linear infinite' } : undefined} />v{st.current}{st.checking ? ' · 확인 중…' : ''}</button>
}

function Main() {
  const { s, refresh, loadChat, loadTodo } = useStore()
  const [hash, setHash] = useHash()
  const botId = hash.bot || 'orch'
  const bot = s.bots.find((b) => b.id === botId) ?? s.bots[0]
  const sessions = s.sessionsByBot[bot?.id ?? ''] ?? []
  const sessionId = hash.s && sessions.some((x) => x.id === hash.s) ? hash.s : sessions[0]?.id
  const narrow = useMedia('(max-width: 1100px)'); const phone = useMedia('(max-width: 760px)'); const kb = useKeyboard()
  const [iconSz] = useIconSize() // 레일 폴더봇 크기 — 설정에서 고른다(--fbi 도 함께 나간다)
  const [view, setView] = useState<'list' | 'chat' | 'doc' | 'panel'>(hash.bot ? 'chat' : 'list')
  const [lay, setLay] = useState<Layout>(() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem('fb:layout') ?? '') } } catch { return DEF } })
  useEffect(() => { localStorage.setItem('fb:layout', JSON.stringify(lay)) }, [lay])
  const [docOpen, setDocOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('fb:docopen') ?? '{}') } catch { return {} } })
  useEffect(() => { localStorage.setItem('fb:docopen', JSON.stringify(docOpen)) }, [docOpen])
  const [wide, setWide] = useState(false)
  const [modal, setModal] = useState<'picker' | 'notify' | 'settings' | 'keys' | 'palette' | null>(null)
  // «설정의 그 칸을 열어 줘» — 에이전트 고르기 화면의 «바꾸기» 가 이걸 쏜다 (V24)
  const [setSec, setSetSec] = useState<SecId | undefined>(undefined)
  useEffect(() => { const f = (e: Event) => { setSetSec((e as CustomEvent).detail as SecId); setModal('settings') }; window.addEventListener('fb:settings', f); return () => window.removeEventListener('fb:settings', f) }, [])
  const [drag, setDrag] = useState<'' | 'x' | 'y'>('')
  const winW = useWinW()
  const [toast, say] = useToast()
  const [prefill, setPrefill] = useState('')
  const [attachReq, setAttachReq] = useState<Att[]>([])
  const [mentionReq, setMentionReq] = useState<string[]>([])
  const [focusReq, setFocusReq] = useState(0)
  const [focusSec, setFocusSec] = useState<{ sec: string; n: number } | null>(null)
  const [upd, updCheck, updApply] = useUpdate(say)
  const docs = useDocs(bot?.id ?? '')
  useEffect(() => { if (sessionId && !s.chats[sessionId]) void loadChat(sessionId) }, [sessionId])
  useEffect(() => { if (bot) void loadTodo(bot.id) }, [bot?.id, s.filesTick[bot?.id ?? '']])
  const go = (b: string, sid?: string) => { setHash(sid ? { bot: b, s: sid } : { bot: b }); setView('chat') }
  const unread = s.notifications.filter((n) => !n.read).length
  const waiting = s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length
  const showDoc = !!bot && (phone || !!docOpen[bot.id]) && docs.tabs.length > 0
  const openDoc = (rel: string, pin = false) => { if (!bot) return; docs.open(rel, pin); setDocOpen((d) => ({ ...d, [bot.id]: true })); if (phone) setView('doc') }
  const addAttach = (a: Att) => { setAttachReq((q) => [...q, { ...a, abs: a.abs || `${bot?.abs}/${a.rel}` }]); if (phone) setView('chat') }
  // 열 드래그 — 선이 핸들. 더블클릭은 기본값
  const dragX = (k: 'sb' | 'rp' | 'doc', dir: 1 | -1) => (e: React.PointerEvent) => {
    e.preventDefault(); setDrag('x'); const x0 = e.clientX; const w0 = lay[k]
    const chatEl = document.querySelector<HTMLElement>('.cols > .col.chat'); const slack = chatEl ? Math.max(0, chatEl.getBoundingClientRect().width - CHAT_MIN) : 0; const cap = w0 + slack // 대화 열이 내줄 수 있는 만큼만
    const mv = (ev: PointerEvent) => { const w = Math.min(cap, w0 + (ev.clientX - x0) * dir); if (k === 'sb' && w < 150) { setLay((l) => ({ ...l, sbOpen: false })); return } if (k === 'rp' && w < 150) { setLay((l) => ({ ...l, rpOpen: false })); return } setLay((l) => ({ ...l, [k]: Math.max(k === 'doc' ? 380 : 200, Math.min(k === 'doc' ? 1100 : 480, w)), ...(k === 'sb' ? { sbOpen: true } : k === 'rp' ? { rpOpen: true } : {}) })) }
    const up = () => { setDrag(''); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  /**
   * 레일 정렬 갈래 — 이 기기에만 남는다(어떤 차례로 **보고 싶은지**는 사람마다·기기마다 다르다).
   * ⚠ «직접» 차례 자체는 기기에 안 남는다 — 그건 볼트에 있다(`POST /bots/reorder`).
   */
  const [railSort, setRailSort] = useState<RailSort>(() => { try { return (localStorage.getItem(RAIL_SORT_KEY) as RailSort) || 'name' } catch { return 'name' } })
  useEffect(() => { try { localStorage.setItem(RAIL_SORT_KEY, railSort) } catch { /* */ } }, [railSort])
  const [dragBot, setDragBot] = useState<string | null>(null)
  const [overBot, setOverBot] = useState<string | null>(null)
  /**
   * 끌어다 놓기 — **지금 보이는 차례**를 그대로 집어 그 안에서 한 칸을 옮긴다.
   * 🔴 이름 차례로 보다가 끌면 **그 화면 그대로가 시작점**이 된다 — 호스트 목록 순서를 시작점으로
   *    삼으면 놓는 순간 목록이 통째로 뒤바뀐다(«내가 옮긴 건 하나인데 왜 다 움직이지»).
   * ⚠ 옮기고 나면 갈래는 자동으로 «직접» 이 된다 — 안 그러면 이름 차례가 다음 렌더에 도로 덮는다.
   */
  const dropBot = async (targetId: string) => {
    const from = dragBot
    setDragBot(null); setOverBot(null)
    if (!from || from === targetId) return
    const flat = rows.flatMap(([, l]) => l).filter((x) => !x.b.orchestrator).map((x) => x.b.id)
    const i = flat.indexOf(from); const j = flat.indexOf(targetId)
    if (i < 0 || j < 0) return
    flat.splice(i, 1)
    flat.splice(flat.indexOf(targetId) + (j > i ? 1 : 0), 0, from)
    setRailSort('manual')
    try { await api('/bots/reorder', { body: { ids: flat } }); await refresh() } catch (e) { say((e as Error).message) }
  }
  /**
   * 레일 차례 — **섹션(PARA)은 그대로 두고 그 안에서만** 정한다 (2026-09-13 Dave:
   * *«각 폴더가 위아래로 드래그 드롭으로 소팅이 안돼. 그리고 상태별로도 소팅되면 좋겠어.
   * (상위 폴더 PARA는 유지)»*).
   *
   * 세 갈래뿐이다 — **이름**(기본) · **직접**(끌어 놓은 차례) · **상태**.
   * 🔴 **«상태» 도 스스로 자리를 바꾸지 않는다.** 종전 규칙(«활동·상태로 자리를 바꾸지 않는다 —
   *    자리가 흔들리면 눈이 못 따라간다»)은 살아 있다. 다른 점은 **사람이 그 갈래를 고를 때만**
   *    상태가 차례를 정한다는 것이다. 고르지 않으면 이름 차례 그대로다.
   * ⚠ **직접** 차례는 볼트에 남는다(`POST /bots/reorder`) — 맥에서 맞춘 차례가 폰에서 딴판이면
   *    «내가 옮긴 게 어디 갔지» 가 된다. 그래서 이 갈래만 호스트 목록 순서를 그대로 쓴다.
   * ⚠ 관제는 늘 맨 위이고 끌 수 없다.
   */
  const rows = useMemo(() => {
    const items = s.bots.map((b, i) => ({ b, i, sum: botSummary(b, s.sessionsByBot[b.id] ?? [], s.notifications) }))
    // 섹션: 관제 → PARA 번호 오름차순(2 → 3 → 4)
    const cmp = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' })
    const m = new Map<string, typeof items>()
    for (const it of items) { const k = it.b.section; (m.get(k) ?? m.set(k, []).get(k)!).push(it) }
    const secs = [...m.entries()].sort(([a], [b]) => (a === '관제' ? -1 : b === '관제' ? 1 : cmp(a, b)))
    const byName = (a: typeof items[0], c: typeof items[0]) => cmp(c.b.name, a.b.name) // 이름 내림차순 — 날짜 접두 폴더가 최신부터
    const rank = (x: typeof items[0]) => MOOD_RANK[x.sum.mood] ?? 9
    for (const [, list] of secs) {
      list.sort((a, c) => {
        if (a.b.orchestrator !== c.b.orchestrator) return a.b.orchestrator ? -1 : 1
        if (railSort === 'manual') return a.i - c.i           // 호스트가 쥔 차례 그대로
        if (railSort === 'state') { const d = rank(a) - rank(c); if (d) return d }
        return byName(a, c)
      })
    }
    return secs
  }, [s.bots, s.sessionsByBot, s.notifications, railSort])
  if (!bot) return <div className="app"><div className="empty">봇이 없어요</div></div>
  const items = sessionId ? (s.chats[sessionId] ?? []) : []
  const pending = sessionId ? (s.pending[sessionId] ?? []) : []
  const cur = sessions.find((x) => x.id === sessionId)
  const touched = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.kind === 'files') return it.paths } return [] as string[] }, [items])
  // 좁은 창에서는 접힌 게 기본이고, 아이콘 열을 누르면 그 패널만 핀으로 편다
  const sbOpen = narrow ? lay.sbPin : lay.sbOpen; const rpOpen = narrow ? lay.rpPin : lay.rpOpen
  // 창에 맞춘 실제 폭 — 저장값(lay)은 그대로 두고 그리는 값만 줄인다. 부족분은 문서 → 오른쪽 패널 → 왼쪽 목록 순으로 양보 (대화 열이 먼저 산다)
  const fit = useMemo(() => {
    let sb = sbOpen ? lay.sb : STRIP_W, rp = rpOpen ? lay.rp : STRIP_W, doc = showDoc && !wide && !phone ? lay.doc : 0
    let over = sb + rp + doc + 3 + CHAT_MIN - winW
    if (over > 0 && doc) { const d = Math.min(over, doc - DOC_MIN); doc -= d; over -= d }
    if (over > 0 && rpOpen) { const d = Math.min(over, rp - SIDE_MIN); rp -= d; over -= d }
    if (over > 0 && sbOpen) { const d = Math.min(over, sb - SIDE_MIN); sb -= d; over -= d }
    return { sb, rp, doc }
  }, [lay.sb, lay.rp, lay.doc, sbOpen, rpOpen, showDoc, wide, phone, winW])
  const openRp = (sec?: string) => { setLay((l) => ({ ...l, rpOpen: true, rpPin: true })); if (sec) setFocusSec({ sec, n: Date.now() }) }
  const closeRp = () => setLay((l) => ({ ...l, rpOpen: false, rpPin: false }))
  const openSb = () => setLay((l) => ({ ...l, sbOpen: true, sbPin: true })); const closeSb = () => setLay((l) => ({ ...l, sbOpen: false, sbPin: false }))
  const stripBots = rows.flatMap(([, it]) => it)
  // 펼친 목록의 행 호버 → 상세 카드 (접힌 스트립의 .fly 와 같은 정보 + 세션·할 일·마지막 메시지)
  const [hov, setHov] = useState<{ id: string; top: number } | null>(null); const hovT = useRef<number | undefined>(undefined)
  const hovIn = (id: string, el: HTMLElement) => { const r = el.getBoundingClientRect(); window.clearTimeout(hovT.current); hovT.current = window.setTimeout(() => setHov({ id, top: r.top }), 300) }
  const hovOut = () => { window.clearTimeout(hovT.current); setHov(null) }
  /** 레일 우클릭 메뉴 — 폴더 줄에서 지우기(연결 해지)·은퇴 */
  const [railCtx, setRailCtx] = useState<{ x: number; y: number; id: string; name: string } | null>(null)

  const hovRow = hov ? stripBots.find((x) => x.b.id === hov.id) : undefined
  // 트리 우클릭 «여기서 에이전트 시작» · «새 폴더 만들기 → 시작» — 볼트 상대 경로로
  const startAt = async (rel: string, botId?: string) => { if (botId) { go(botId); return } if (!bot.orchestrator && !confirm(`상위 봇 ${bot.name} 와 폴더가 겹쳐요. 그래도 여기서 시작할까요?`)) return; const provider = await pickAgent(rel); if (!provider) return; try { const b = await api<Bot>('/bots/start', { body: { rel, provider } }); await refresh(); go(b.id); say(`${b.name} 에서 시작했어요`) } catch (e) { say((e as Error).message) } }
  const newFolderAt = async (parent: string) => { const name = await askName(`${parent || '볼트'} 안에 만들 폴더 이름`); if (!name?.trim()) return; const provider = await pickAgent(`${parent ? parent + '/' : ''}${name.trim()}`); if (!provider) return; try { const r = await api<{ rel: string; bot: Bot }>('/folders', { body: { section: parent, name: name.trim(), start: true, provider } }); await refresh(); go(r.bot.id); say(`${r.rel} 에서 시작했어요`) } catch (e) { say((e as Error).message) } }
  const newSession = async () => { const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}` } }); await refresh(); go(bot.id, info.id) }
  /**
   * 전역 단축키 — **맥 앱의 상식대로** (2026-09-13 Dave: «맥 기본 단축키로»).
   *
   * 🔴 **전부 ⌘(⌃) 를 낀다.** 맨 글자 단축키를 두면 **입력칸에 글자를 치는 순간 명령이 돈다** —
   *    채팅·문서·이름 바꾸기가 전부 글 쓰는 화면이라 여기서는 맨 글자를 절대 쓰지 않는다.
   * ⛔ **텍스트 편집 단축키(⌘Z·⌘C·⌘V·⌘A·⌘F)는 우리가 가로채지 않는다** — 맥의 기본 동작과
   *    편집기(CodeMirror)의 것이 이긴다. 가로채는 순간 «실행 취소가 안 되는 앱» 이 된다.
   * ⚠ 목록은 `KEYS` 한 곳에 있고 ⌘/ 가 그 목록을 그대로 보여 준다 — 표와 동작이 갈리지 않게.
   */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      const hit = (want: string, shift = false) => key === want && e.shiftKey === shift && !e.altKey
      // ⌘P — 명령 팔레트 (⌘K 는 이미 «폴더 고르기» 다). ⚠ 브라우저의 «인쇄» 를 덮으므로 반드시 막는다
      if (hit('p')) { e.preventDefault(); setModal((m) => (m === 'palette' ? null : 'palette')); return }
      if (hit('b')) { e.preventDefault(); setLay((l) => ({ ...l, sbOpen: !l.sbOpen })); return }
      if (hit('b', true)) { e.preventDefault(); setLay((l) => ({ ...l, rpOpen: !l.rpOpen })); return }
      if (hit('d', true) && bot) { e.preventDefault(); setDocOpen((d) => ({ ...d, [bot.id]: !d[bot.id] })); return }
      if (hit(',')) { e.preventDefault(); setModal('settings'); return }
      if (hit('/') || key === '?') { e.preventDefault(); setModal((m) => (m === 'keys' ? null : 'keys')); return }
      if (hit('k')) { e.preventDefault(); setModal('picker'); return }
      if (hit('n')) { e.preventDefault(); void newSession(); return }
      if (hit('n', true)) { e.preventDefault(); setModal('picker'); return }
      if (hit('u', true)) { e.preventDefault(); setModal('notify'); return }
      // ⌘1..9 · ⌘[ ⌘] — 폴더 사이를 옮긴다 (레일 순서 그대로)
      const flat = rows.flatMap(([, l]) => l.map((x) => x.b.id))
      if (/^[1-9]$/.test(key)) { const t = flat[Number(key) - 1]; if (t) { e.preventDefault(); go(t) } return }
      if (key === '[' || key === ']') {
        const i = flat.indexOf(bot?.id ?? ''); if (i < 0 || flat.length < 2) return
        e.preventDefault(); go(flat[(i + (key === ']' ? 1 : -1) + flat.length) % flat.length])
      }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [bot?.id, rows, sessions.length])
  /** 맥 메뉴바에서 온 명령 — 같은 일을 하는 문이 둘이어도 **동작은 한 곳**이다 */
  useEffect(() => {
    const off = desk?.onCmd?.((c: string) => {
      if (c === 'settings') setModal('settings')
      else if (c === 'keys') setModal('keys')
      else if (c === 'palette') setModal('palette')
      else if (c === 'picker') setModal('picker')
      else if (c === 'notify') setModal('notify')
      else if (c === 'new-session') void newSession()
      // ⚠ 보내기는 **입력칸이 쥐고 있다** — 메뉴는 그 자리에 신호만 보낸다(같은 길을 두 벌 만들지 않는다)
      else if (c === 'send') window.dispatchEvent(new Event('fb:send'))
    })
    return off
  }, [bot?.id, sessions.length])
  return <div className={`app ${isDesktop ? 'desktop' : ''} ${phone ? 'phone' : ''} ${kb ? 'kb' : ''} ${drag === 'x' ? 'dragx' : drag === 'y' ? 'dragy' : ''}`} data-view={view === 'doc' && !showDoc ? 'panel' : view}>
    {s.online === 'off' ? <div className="offline">{s.hostName || '호스트'} 와 다시 연결하는 중…</div> : null}
    {s.auth.verdict === 'unreadable' || s.auth.verdict === 'loggedout' ? <div className="banner"><span className="dot wait" /><span><b>{s.hostName} 에서 Claude 로그인이 필요해요.</b> 호스트 맥에서 <span className="mono">claude</span> → <span className="mono">/login</span>, 또는 설정 › Claude 토큰. 보낸 지시는 대기열에 두었다가 복구되면 이어서 해요.</span><span style={{ marginLeft: 'auto' }} /><button className="btn" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button></div> : null}
    <div className="cols">
      {/* ── 왼쪽 (폰은 홈 화면) ── */}
      {phone ? <Home rows={rows} bot={bot} go={go} setModal={setModal} waiting={waiting} unread={unread} onAsk={() => { go('orch'); setFocusReq(Date.now()) }} />
        : sbOpen ? <div className="col side left" style={{ width: fit.sb }}>
        <div className="hdr"><FolderBot color="#e08850" size={16} mood={waiting ? 'wait' : 'idle'} mono /><span className="ttl">Folder Bot</span><span className="sp" /><div className="acts"><button className="ib" onClick={closeSb} title="목록 접기 (⌘B)"><Icon n="panel" size={14} /></button></div></div>
        <div style={{ padding: '10px 8px 0' }}>
          <button className="nav" onClick={() => setModal('picker')}><Icon n="fplus" size={14} /><span>폴더 선택 · 시작</span><span className="bd">후보 {s.candidates.filter((c) => !c.active).length}</span></button>
          <button className="nav" onClick={() => setModal('notify')}><Icon n="bell" size={14} /><span>알림</span>{unread ? <span className="bd" style={{ color: waiting ? 'var(--wait)' : undefined }}>{unread}</span> : null}</button>
          <button className="nav" onClick={() => setModal('settings')}><Icon n="gear" size={14} /><span>설정</span></button>
        </div>
        {/* 정렬 갈래 — 이름 · 직접(끌어 놓기) · 상태. ⚠ 끌어 놓으면 «직접» 으로 알아서 넘어간다 */}
        <div className="sortbar"><span className="lb">정렬</span>{(Object.keys(RAIL_SORT_LABEL) as RailSort[]).map((k) => <button key={k} className={railSort === k ? 'on' : ''} onClick={() => setRailSort(k)} title={RAIL_SORT_HINT[k]}>{RAIL_SORT_LABEL[k]}</button>)}</div>
        <div className="sb-list">
          {rows.map(([sec, list]) => <div key={sec}>
            <div className="secl">{sec === '관제' ? '관제' : sec}</div>
            {list.map(({ b, sum }) => <button key={b.id} className={`brow ${b.id === bot.id && view !== 'list' ? 'on' : ''} ${overBot === b.id ? 'dover' : ''} ${dragBot === b.id ? 'dsrc' : ''}`}
              draggable={!b.orchestrator}
              onDragStart={(e) => { setDragBot(b.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-fb-bot', b.id) }}
              onDragEnd={() => { setDragBot(null); setOverBot(null) }}
              onDragOver={(e) => { if (!dragBot || b.orchestrator || dragBot === b.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverBot(b.id) }}
              onDragLeave={() => setOverBot((x) => (x === b.id ? null : x))}
              onDrop={(e) => { e.preventDefault(); void dropBot(b.id) }}
              onContextMenu={(e) => { e.preventDefault(); hovOut(); if (!b.orchestrator) setRailCtx({ x: e.clientX, y: e.clientY, id: b.id, name: b.name }) }} onClick={() => { hovOut(); go(b.id) }} onMouseEnter={(e) => hovIn(b.id, e.currentTarget)} onMouseLeave={hovOut}><FolderBot color={b.color} size={ICON_PX[iconSz]} mood={sum.mood} mono /><span className="n"><Mid s={b.name} />{b.rel.split('/').length > 2 ? <small>{b.rel.slice(0, b.rel.lastIndexOf('/'))}</small> : null}</span><time>{fmtTime(sum.t)}</time></button>)}
          </div>)}
        </div>
        {hovRow ? <HoverCard b={hovRow.b} sum={hovRow.sum} top={hov!.top} left={fit.sb + 6} /> : null}
        {/* 레일 우클릭 — **지우기 · 은퇴** (2026-09-13 Dave 정정).
            🔴 **«지우기» 는 폴더를 지우지 않는다 — 에이전트 연결을 끊어 레일에서 덜어낼 뿐이다**
               (Dave: *«실제 폴더를 삭제하는게 아니라 에이전트 연동 삭제라는 뜻이야. 즉 좌측에서 덜어내는거지»*).
               폴더·문서·세션 기록은 디스크에 그대로 있고, 같은 폴더를 다시 고르면 그 자리에서 이어진다.
            ⛔ **폴더를 실제로 옮기는 «폴더 삭제» 는 뺐다** — 한 번의 우클릭 뒤에 되돌리기 어려운 일을
               두지 않는다. 파일을 치우는 건 파인더(또는 트리의 휴지통)의 몫이다.
            ⚠ 은퇴는 남아 있다 — 그건 «끝난 일» 을 Archive 로 옮겨 **볼트의 일부로 남기는** 다른 일이다. */}
        {railCtx ? <Float at={{ x: railCtx.x, y: railCtx.y }} onClose={() => setRailCtx(null)} className="menu ctx"><div style={{ display: 'contents' }} onClick={() => setRailCtx(null)}>
          <div className="h">{railCtx.name}</div>
          <button onClick={async () => { try { await api(`/bots/${railCtx.id}/stop`, { body: {} }); say(`${railCtx.name} 을 레일에서 덜어냈어요 — 폴더는 그대로예요`); await refresh(); go('orch') } catch (e) { say((e as Error).message) } }}><Icon n="x" size={13} /><span style={{ flex: 1 }}>지우기 (연결 해지)</span><span className="k">폴더 유지</span></button>
          <button onClick={async () => { if (!confirm(`${railCtx.name} 을 Archive 로 옮기고 은퇴시킬까요? 세션 기록은 보관돼요.`)) return; try { const r = await api<{ to: string }>(`/bots/${railCtx.id}/retire`, { body: {} }); say(`${r.to} 로 은퇴`); await refresh(); go('orch') } catch (e) { say((e as Error).message) } }}><Icon n="archive" size={13} /><span style={{ flex: 1 }}>은퇴 (Archive 로)</span></button>
        </div></Float> : null}
        {/* ⛔ 맥에서는 사용량을 앱 안에 안 그린다 — **메뉴바에서만** 본다 (2026-09-13 Dave: «맥에서는 그냥 메뉴바 안에서만 이게 보이면 좋겠어»).
            폰은 첫 화면 위 스트립 하나로 남는다. 두 표면 다 있으면 같은 숫자가 두 번 보이고 아래 줄이 또 비좁아진다. */}
        <div className="sb-foot two">
          <div className="r2"><span className={`dot ${s.online === 'on' ? 'done' : 'err'}`} /><span className="hn">{s.hostName}</span><MrBadge />{s.inbox ? <span className="bd">Inbox {s.inbox}</span> : null}<UpdateChip version={s.version} st={upd} onCheck={updCheck} onApply={updApply} /></div>
        </div>
      </div> : <div className="strip left"><button className="ib" onClick={openSb} title="목록 펼치기 (⌘B)"><Icon n="panel" size={14} /></button><div className="gap" />
        <button className="ib" onClick={() => setModal('picker')}><Icon n="fplus" size={14} /><span className="fly"><b>폴더 선택 · 시작</b><span>후보 {s.candidates.filter((c) => !c.active).length}</span></span></button>
        <button className="ib" onClick={() => setModal('notify')}><Icon n="bell" size={14} />{unread ? <span className="bd">{unread}</span> : null}<span className="fly"><b>알림</b><span>{unread ? `읽지 않음 ${unread}` : '없음'}</span></span></button>
        <div className="gap" />
        {stripBots.map(({ b, sum }) => <button key={b.id} className={`bot ${b.id === bot.id ? 'on' : ''}`} onClick={() => go(b.id)}><FolderBot color={b.color} size={17} mood={sum.mood} mono /><span className="fly"><b><Mid s={b.name} /></b><span><span className={`dot ${stateDot(sum.state ?? undefined)}`} style={{ marginRight: 5 }} />{sum.text}</span><span className="t3">{b.section} · {fmtTime(sum.t)}</span></span></button>)}
      </div>}
      <div className="divx" onPointerDown={sbOpen ? dragX('sb', 1) : undefined} onDoubleClick={() => setLay({ ...lay, sb: DEF.sb, sbOpen: true, sbPin: true })} />

      {/* ── 채팅 ── */}
      <Chat bot={bot} sessions={sessions} cur={cur} items={items} pending={pending} prefill={prefill} onPrefilled={() => setPrefill('')} attachReq={attachReq} onAttached={() => setAttachReq([])} mentionReq={mentionReq} onMentioned={() => setMentionReq([])} focusReq={focusReq} onSession={(sid) => go(bot.id, sid)} onFile={(rel, pin) => openDoc(rel, pin)} docBadge={docs.tabs.length} docTabs={docs.tabs.map((t) => t.rel)} docOn={showDoc} onDocToggle={() => setDocOpen((d) => ({ ...d, [bot.id]: !d[bot.id] }))} say={say} refreshAll={refresh} collapsed={!phone && wide && showDoc} onUncollapse={() => setWide(false)} phone={phone} onBack={() => setView('list')} onPanel={() => setView('panel')} newSession={newSession} filesTick={s.filesTick[bot.id]} />

      {/* ── 문서 열 ── */}
      {showDoc ? <>{!phone ? <div className="divx" onPointerDown={dragX('doc', -1)} onDoubleClick={() => setLay({ ...lay, doc: DEF.doc })} /> : null}<div className="docwrap" style={{ width: wide || phone ? undefined : fit.doc, flex: wide ? 3 : 'none', display: 'flex', minWidth: 0 }}><DocPane bot={bot} docs={docs} filesTick={s.filesTick[bot.id]} onTalk={(rel) => { setPrefill(`${rel} 파일 봐 줘: `); if (phone) setView('chat') }} onHide={() => setDocOpen((d) => ({ ...d, [bot.id]: false }))} wide={wide} onWide={() => setWide(!wide)} onAttach={(rel) => addAttach({ rel, abs: `${bot.abs}/${rel}` })} say={say} phone={phone} onBack={() => setView('panel')} /></div></> : null}

      {/* ── 오른쪽 ── */}
      {!phone ? <div className="divx" onPointerDown={rpOpen ? dragX('rp', -1) : undefined} onDoubleClick={() => setLay({ ...lay, rp: DEF.rp, rpOpen: true, rpPin: true })} /> : null}
      {rpOpen || phone ? <div className="rpwrap" style={{ width: phone ? '100%' : fit.rp, flex: 'none', display: 'flex', minWidth: 0 }}><Panel bot={bot} sessions={sessions} sessionId={sessionId} go={go} onOpenFile={openDoc} onTalk={(t) => { setPrefill(t); if (phone) setView('chat') }} onAttach={(rel, dir) => addAttach({ rel, abs: `${bot.abs}/${rel}`, dir })} onMention={(rel) => { setMentionReq((m) => [...m, rel]); if (phone) setView('chat') }} onStartAt={startAt} onNewFolderAt={newFolderAt} touched={touched} filesTick={s.filesTick[bot.id]} secH={lay.secH} onSecH={(h) => setLay({ ...lay, secH: h })} onCollapse={closeRp} focusSec={focusSec} say={say} refresh={refresh} activeDoc={showDoc ? docs.active : null} onDragY={(on) => setDrag(on ? 'y' : '')} phone={phone} onBack={() => setView('chat')} /></div>
        : <div className="strip right"><button className="ib" onClick={() => openRp()} title="패널 펼치기 (⌘⇧B)"><Icon n="panelr" size={14} /></button><div className="gap" />
        <button className="ib" onClick={() => openRp('sessions')}><Icon n="clock" size={14} />{sessions.some((x) => x.state === 'running') ? <span className="dot run" style={{ position: 'absolute', right: 2, top: 2 }} /> : null}<span className="fly"><b>세션</b><span>{sessions.length}개</span></span></button>
        <button className="ib" onClick={() => openRp('todo')}><Icon n="list" size={14} />{(s.todos[bot.id] ?? []).filter((t) => !t.done).length ? <span className="bd">{(s.todos[bot.id] ?? []).filter((t) => !t.done).length}</span> : null}<span className="fly"><b>{bot.orchestrator ? 'Inbox' : '할 일'}</b><span>{bot.orchestrator ? `${s.inbox}개` : `미완료 ${(s.todos[bot.id] ?? []).filter((t) => !t.done).length}`}</span></span></button>
        <button className="ib" onClick={() => openRp('files')}><Icon n="folder" size={14} /><span className="fly"><b>파일</b><span>{bot.rel || '볼트'}</span></span></button>
        <button className="ib" onClick={() => openRp('routines')}><Icon n="cal" size={14} /><span className="fly"><b>루틴</b><span>{bot.routines.length}개</span></span></button>
      </div>}
    </div>
    {modal === 'picker' ? <FolderPicker onClose={() => setModal(null)} onStarted={(b) => { setModal(null); go(b.id); say(`${b.name} 에서 시작했어요`) }} /> : null}
    {modal === 'notify' ? <NotifyCenter onClose={() => setModal(null)} onJump={(n) => { setModal(null); api('/notifications/read', { body: { ids: [n.id] } }).then(refresh); go(n.botId, n.sessionId) }} /> : null}
    {modal === 'settings' ? <Settings onClose={() => { setModal(null); setSetSec(undefined) }} start={setSec} /> : null}
    {modal === 'keys' ? <KeysSheet onClose={() => setModal(null)} /> : null}
    {/* 🔴 **명령 팔레트 (⌘P)** — 폴더 · 문서 · 세션 · 명령이 한 목록에 선다(Rondo 이식 D1).
        ⛔ 되돌리기 어려운 일(지우기·은퇴)은 여기 두지 않는다 — 손이 빠른 자리라 한 글자 잘못 치고
        ⏎ 를 누르면 그대로 실행된다. */}
    {modal === 'palette' ? <Palette bots={s.bots} bot={bot} sessions={sessions} onClose={() => setModal(null)}
      go={(b, sid) => go(b, sid)} openDoc={(rel, pin) => openDoc(rel, pin)} setModal={setModal} newSession={newSession}
      toggle={(w) => { if (w === 'sb') setLay((l) => ({ ...l, sbOpen: !l.sbOpen })); else if (w === 'rp') setLay((l) => ({ ...l, rpOpen: !l.rpOpen })); else setDocOpen((d) => ({ ...d, [bot.id]: !d[bot.id] })) }} /> : null}
    <AskHost />
    <AgentPickHost />
    {toast ? <div className="toast">{toast}</div> : null}
  </div>
}

/** 레일 행 호버 카드 — 이름 · 경로 · 상태 · 세션(모델·컨텍스트) · 할 일 · 마지막 말 · 시간 */
function HoverCard({ b, sum, top, left }: { b: Bot; sum: ReturnType<typeof botSummary>; top: number; left: number }) {
  const { s } = useStore()
  const ss = s.sessionsByBot[b.id] ?? []; const topS = ss.find((x) => x.state === 'awaiting_input') ?? ss.find((x) => x.state === 'running') ?? ss[0]
  const todos = (s.todos[b.id] ?? []).filter((t) => !t.done).length
  const chat = topS ? s.chats[topS.id] : undefined
  const lastMsg = chat ? [...chat].reverse().find((i): i is ChatItem & { kind: 'assistant' | 'user' } => (i.kind === 'assistant' || i.kind === 'user') && !!i.text.trim()) : undefined
  const lastN = s.notifications.find((n) => n.botId === b.id)
  const pct = topS?.ctx?.window ? Math.round((topS.ctx.used / topS.ctx.window) * 100) : 0
  const y = Math.max(8, Math.min(top - 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 230))
  const say = lastMsg ? `${lastMsg.kind === 'user' ? '나' : '봇'}: ${lastMsg.text.replace(/\s+/g, ' ').slice(0, 140)}` : lastN ? `${lastN.title}: ${lastN.body}`.slice(0, 140) : ''
  return <div className="hcard" style={{ top: y, left }}>
    <div className="hh"><FolderBot color={b.color} size={28} mood={sum.mood} mono /><b><Mid s={b.name} /></b><span className={`dot ${stateDot(sum.state ?? undefined)}`} /></div>
    <div className="hp mono">{b.rel || '볼트 (오케스트레이터)'}</div>
    <div className="hs">{sum.text}</div>
    <div className="hk">
      <span>{topS ? `${topS.name} · ${modelLabel(topS.model)}${topS.hibernated ? ' · 절전' : ''}${pct ? ` · 컨텍스트 ${pct}%` : ''}` : '세션 없음 — 메시지를 보내면 시작'}</span>
      <span>할 일 {todos}{b.routines.length ? ` · 루틴 ${b.routines.length}` : ''}{ss.length > 1 ? ` · 세션 ${ss.length}` : ''}</span>
      {say ? <span className="hl">{say}</span> : null}
      <span className="t3">{b.section} · {fmtTime(sum.t)}</span>
    </div>
  </div>
}

/** 메인(호스트 맥의 창) · 원격(그 외 기기) 배지 */
function MrBadge() { const { s } = useStore(); return s.device.main ? <span className="mr main">메인</span> : <span className="mr remote">원격 · {s.device.name}</span> }

/* ── 레일 정렬 (2026-09-13 Dave) ─────────────────────────────────────────────
   섹션(PARA)은 늘 그대로다 — 여기서 정하는 것은 **한 섹션 안의 차례**뿐이다. */
type RailSort = 'name' | 'manual' | 'state'
const RAIL_SORT_KEY = 'fb:railsort'
const RAIL_SORT_LABEL: Record<RailSort, string> = { name: '이름', manual: '직접', state: '상태' }
const RAIL_SORT_HINT: Record<RailSort, string> = { name: '날짜 접두 폴더가 최신부터', manual: '끌어다 놓은 차례 (볼트에 남아요)', state: '확인 대기 → 일하는 중 → 문제 → 쉬는 중' }
/** ⚠ 값은 `moodOf` 의 갈래 그대로다 — 한쪽만 늘리면 새 상태가 조용히 맨 뒤로 간다 */
const MOOD_RANK: Record<string, number> = { wait: 0, work: 1, error: 2, done: 3, idle: 4, sleep: 5 }

function botSummary(bot: Bot, sessions: SessionInfo[], notif: NotifyEvent[]) {
  const wait = sessions.find((x) => x.state === 'awaiting_input'); const run = sessions.find((x) => x.state === 'running')
  const top = wait ?? run ?? sessions[0]; const last = notif.find((n) => n.botId === bot.id)
  const state = top?.state ?? null
  const text = wait ? `확인해 주세요 · ${wait.pending[0]?.displayName ?? wait.name}` : run ? `일하는 중 · ${run.activity || run.name}` : last ? last.body : top ? `${top.name}${top.hibernated ? ' · 절전' : ''}` : '메시지를 보내 보세요'
  return { state, text, t: Math.max(top?.lastActivity ?? bot.startedAt, last?.t ?? 0), mood: moodOf(state, !!top?.hibernated && !run && !wait) }
}

/* ── 폰 홈 — 큰 제목 · 카드 4 · 봇 목록 · 떠 있는 알약 (탭바 없음) ── */
type Row = [string, { b: Bot; sum: ReturnType<typeof botSummary> }[]]
function Home({ rows, bot, go, setModal, waiting, unread, onAsk }: { rows: Row[]; bot: Bot; go: (b: string) => void; setModal: (m: 'picker' | 'notify' | 'settings') => void; waiting: number; unread: number; onAsk: () => void }) {
  const usage = useUsage() // 폰 홈 맨 위 — 한 줄 띠. 누르면 카드가 시트로 올라온다
  const [uSheet, setUSheet] = useState(false)
  const { s } = useStore()
  const all = rows.flatMap(([, l]) => l)
  const running = all.filter((x) => x.sum.state === 'running')
  const cands = s.candidates.filter((c) => !c.active).length
  return <div className="col mhome">
    <div className="mtop"><button className="rb" onClick={() => setModal('settings')} title="설정"><FolderBot color="#e08850" size={26} mood={waiting ? 'wait' : 'idle'} mono /></button><span className="sp" /><button className="rb" onClick={() => setModal('notify')}><Icon n="bell" size={20} />{unread ? <span className="bd">{unread}</span> : null}</button><button className="rb" onClick={() => setModal('picker')}><Icon n="fplus" size={20} /></button></div>
    <div className="mscroll">
      <div className="mtitle">Folder Bot</div>
      <div className="msub"><span className={`dot ${s.online === 'on' ? 'done' : 'err'}`} style={{ width: 7, height: 7 }} />{s.hostName}<MrBadge /><span>· 봇 {s.bots.length} · 후보 {cands}</span></div>
      {usage && usage.tools.length ? <div style={{ padding: '0 16px 12px' }}><UsageStrip u={usage} onOpen={() => setUSheet(true)} /></div> : null}
      <div className="mcards">
        <button onClick={() => setModal('notify')}><Icon n="bell" size={22} color="var(--wait)" /><span className="n">확인 필요<span>{waiting}</span></span></button>
        <button onClick={() => (running[0] ? go(running[0].b.id) : go(bot.id))}><Icon n="run" size={22} color="var(--run)" /><span className="n">일하는 중<span>{running.length}</span></span></button>
        <button onClick={() => go('orch')}><Icon n="archive" size={22} color="#7fb0ff" /><span className="n">인박스<span>{s.inbox}</span></span></button>
        <button onClick={() => setModal('picker')}><Icon n="fplus" size={22} color="var(--t2)" /><span className="n">폴더 후보<span>{cands}</span></span></button>
      </div>
      {rows.map(([sec, list]) => <div key={sec}>
        <div className="secl">{sec}</div>
        {list.map(({ b, sum }) => <button key={b.id} className="mrow" onClick={() => go(b.id)}><span className="av"><FolderBot color={b.color} size={46} mood={sum.mood} mono /></span><span className="t"><span className="l1"><b><Mid s={b.name} /></b><time>{fmtTime(sum.t)}</time></span><span className="l2">{sum.text}</span></span></button>)}
      </div>)}
    </div>
    <button className="mpill glassb" onClick={onAsk}><span className="pl"><Icon n="plus" size={20} /></span><span className="tx">폴더에 시키기…</span><Icon n="sub" size={20} color="var(--t2)" /></button>
  {uSheet && usage ? <><div className="backdrop" onClick={() => setUSheet(false)} /><div className="tsheet usheet"><div className="grip" /><UsageCard u={usage} /></div></> : null}</div>
}

/* ── 대화 ───────────────────────────────────────────────────────────────── */
type ChatRow = { k: 'item'; it: ChatItem } | { k: 'group'; items: Tool[]; endT?: number }
/**
 * 대화를 줄로 편다 — 「A · 문서처럼」(2026-09-13 Dave 확정).
 *
 * 🔴 **기계는 접힌다.** 도구는 <b>한 번만 써도</b> 한 줄로 접는다. 종전에는 4회 이상일 때만 묶고
 *    그보다 적으면 도구마다 한 줄씩 폈는데, 그러면 짧은 턴일수록 대화가 로그처럼 보였다 —
 *    Dave 가 «Rondo 처럼 화려해지지 않게» 라고 한 것이 바로 이 결이다.
 * ⛔ **문턱으로 접기를 정하지 않는다.** «몇 개부터 묶나» 는 늘 틀린 질문이다 — 기계는 언제나 접히고,
 *    펼치는 것은 사람이 정한다.
 * ⚠ 도는 동안 무엇을 하는지는 <b>상태 한 줄</b>(`.live`)이 맡는다. 그게 접기의 대가를 갚는 유일한 장치라
 *    지우면 안 된다.
 */
function buildRows(items: ChatItem[], drill: string | null): ChatRow[] {
  const out: ChatRow[] = []; let run: Tool[] = []
  /** ⚠ 도구 줄에는 «끝난 시각» 이 없다 — 묶음이 끝난 시각은 **다음 줄이 생긴 시각**으로 잰다 */
  const flush = (endT?: number) => { if (run.length) out.push({ k: 'group', items: run, endT }); run = [] }
  for (const it of items) {
    if (drill) { if ((it.kind === 'tool' && it.parentId === drill)) out.push({ k: 'item', it }); continue }
    if (it.kind === 'tool' && it.parentId) continue
    if (it.kind === 'result' && it.ok) continue
    if (it.kind === 'tool') { run.push(it); continue }
    flush(it.t); out.push({ k: 'item', it })
  }
  flush(); return out
}
const BUILTIN_SLASH: SlashCmd[] = [{ name: 'compact', desc: '대화 압축 — 컨텍스트 줄이기', kind: 'cli', scope: 'cli' }, { name: 'context', desc: '컨텍스트 사용 내역', kind: 'cli', scope: 'cli' }, { name: 'clear', desc: '새 대화로 (새 세션)', kind: 'cli', scope: 'cli' }]
interface FileNode { rel: string; dir: boolean; mtime: number }
// ⚠ 맥 파일 이름은 NFD 로 저장된다 — 비교 전에 양쪽을 NFC 로 맞추지 않으면 한글이 «아예» 안 걸린다(core/search 머리말)
const fuzzy = (q: string, s: string): number => { if (!q) return 1; const t = norm(s); const nq = norm(q); if (t.includes(nq)) return t.startsWith(nq) ? 3 : 2; let i = 0; for (const c of t) if (c === nq[i]) i++; return i === nq.length ? 1 : 0 }

function Chat({ bot, sessions, cur, items, pending, prefill, onPrefilled, attachReq, onAttached, mentionReq, onMentioned, focusReq, onSession, onFile, docBadge, docTabs, docOn, onDocToggle, say, refreshAll, collapsed, onUncollapse, phone, onBack, onPanel, newSession, filesTick }: { bot: Bot; sessions: SessionInfo[]; cur?: SessionInfo; items: ChatItem[]; pending: PermissionRequest[]; prefill: string; onPrefilled: () => void; attachReq: Att[]; onAttached: () => void; mentionReq: string[]; onMentioned: () => void; focusReq: number; onSession: (sid: string) => void; onFile: (rel: string, pin?: boolean) => void; docBadge: number; docTabs: string[]; docOn: boolean; onDocToggle: () => void; say: (m: string) => void; refreshAll: () => Promise<void>; collapsed: boolean; onUncollapse: () => void; phone: boolean; onBack: () => void; onPanel: () => void; newSession: () => Promise<void>; filesTick?: number }) {
  const { s } = useStore()
  const [text, setText] = useState(''); const [caret, setCaret] = useState(0); const [sessMenu, setSessMenu] = useState(false); const [busy, setBusy] = useState(false)
  const [attach, setAttach] = useState<Att[]>([]); const [pop, setPop] = useState<'' | 'plus' | 'mode' | 'model' | 'effort' | 'ctx'>(''); const [pickOpen, setPickOpen] = useState(false); const [uploading, setUploading] = useState(false)
  const [routineDraft, setRoutineDraft] = useState<RoutineDef | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  /**
   * 쓰다 만 메시지는 앱을 껐다 켜도 남는다 (2026-09-13 Dave: «작성중인 채팅 텍스트 메시지가 앱을 껐다가 켜면 날라가»).
   *
   * 🔴 **세션마다 따로 둔다.** 하나로 두면 세션을 바꿔 놓고 돌아왔을 때 **남의 초안이 입력창에 들어와 있고**,
   *    그걸 모른 채 엔터를 치면 엉뚱한 대화에 엉뚱한 말이 간다. 아직 세션이 없으면 `new` 로 담았다가
   *    첫 메시지에서 지워진다.
   * ⚠ **첨부도 함께 저장한다** — 본문의 `@파일` 만 살아나고 첨부가 비면 파일 없이 보내진다(조용히 틀린다).
   * ⚠ `localStorage` 는 사생활 보호 창·저장 차단에서 **던진다.** 읽기·쓰기를 전부 try 로 감싸고,
   *    실패해도 입력은 그대로 되게 둔다 — 초안 보관은 편의지 기능의 전제가 아니다.
   */
  const draftKey = `fb:draft:${bot.id}:${cur?.id ?? 'new'}`
  const draftRef = useRef(draftKey)
  useEffect(() => {
    draftRef.current = draftKey                      // ⚠ setText 보다 **먼저** 바꾼다 — 저장 이펙트가 새 키로 쓰게
    let d: { text?: string; attach?: Att[] } = {}
    try { d = JSON.parse(localStorage.getItem(draftKey) ?? '{}') } catch { d = {} }
    setText(typeof d.text === 'string' ? d.text : '')
    setAttach(Array.isArray(d.attach) ? d.attach : [])
  }, [draftKey])
  useEffect(() => {
    const k = draftRef.current
    const t = window.setTimeout(() => {
      try { if (text || attach.length) localStorage.setItem(k, JSON.stringify({ text, attach })); else localStorage.removeItem(k) } catch { /* 저장이 막힌 창 — 입력은 계속된다 */ }
    }, 300)
    return () => window.clearTimeout(t)
  }, [text, attach])

  const [drill, setDrill] = useState<string | null>(null)
  const [drop, setDrop] = useState<'' | 'tree' | 'files'>('')
  const [slash, setSlash] = useState<SlashCmd[]>([]); const [files, setFiles] = useState<FileNode[] | null>(null); const [sel, setSel] = useState(0); const [dismissed, setDismissed] = useState('')
  const [pinned, setPinned] = useState(false); const [atBottom, setAtBottom] = useState(true); const atBottomRef = useRef(true); atBottomRef.current = atBottom
  /**
   * 🔴 **「최근으로」 단추는 자동 스크롤과 **다른 눈금**을 쓴다** (2026-09-13 Dave: «누르려고 하면 도망가네»).
   *    하나의 문턱(80px)으로 둘을 같이 쓰면, 글이 흘러드는 동안 그 선을 오가며 단추가 **붙었다 떨어졌다** 한다
   *    — 붙을 때마다 4px 떠오르는 등장 애니메이션이 다시 돌아서 «다가가면 움직이는» 것처럼 보였다.
   *    그래서 ① 이력(hysteresis)을 준다: **240px 넘게 멀어져야 뜨고, 40px 안으로 와야 사라진다**
   *    ② 사라질 때도 **DOM 에서 빼지 않고** 투명도만 낮춘다 — 다시 뜰 때 제자리에 그대로 있다.
   */
  const [showJump, setShowJump] = useState(false)
  useEffect(() => { const el = scRef.current; if (!el || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(() => { if (atBottomRef.current) el.scrollTop = el.scrollHeight }); ro.observe(el); return () => ro.disconnect() }, [])
  /**
   * 폰에서 키보드가 올라오면 **대화를 맨 아래로 붙인다** — 읽으려고 위로 올려 둔 채 입력칸을 누르면
   * 종전에는 그 자리에 그대로 멈춰 있어 «무엇에 답하는지» 가 안 보였다(Dave: «타이핑 위치 안 잡혀»).
   * 키보드가 자리를 잡는 데 몇 프레임 걸리므로 두 번 더 붙인다. 위로 올려 둔 것은 키보드를 내리면 그대로다.
   */
  const stickBottom = () => { const el = scRef.current; if (!el) return; const go = () => { el.scrollTop = el.scrollHeight }; go(); setTimeout(go, 120); setTimeout(go, 400); setTimeout(go, 800) }
  const [draft, setDraft] = useState<{ model?: string; effort?: string; permissionMode?: PermissionMode }>({})
  const fileRef = useRef<HTMLInputElement>(null); const endRef = useRef<HTMLDivElement>(null); const taRef = useRef<HTMLTextAreaElement>(null); const scRef = useRef<HTMLDivElement>(null); const footRef = useRef<HTMLDivElement>(null); const colRef = useRef<HTMLDivElement>(null); const lastUserRef = useRef<HTMLDivElement | null>(null)
  const state = cur?.state ?? 'idle'; const running = state === 'running'
  /** ⚠ 기본값도 벤더마다 다르다 — Codex 세션에 Claude 기본 모델이 박히면 첫 턴에 죽는다 */
  const vendOf = () => cur?.vendor ?? bot.vendor
  const cfg = { model: cur?.model || draft.model || (vendOf() === 'codex' ? (s.defaults.codex?.model || DEFAULT_MODEL.codex) : (s.defaults.model || DEFAULT_MODEL.claude)), effort: cur?.effort || draft.effort || (vendOf() === 'codex' ? (s.defaults.codex?.effort || DEFAULT_EFFORT.codex) : (s.defaults.effort || DEFAULT_EFFORT.claude)), mode: (cur?.permissionMode || draft.permissionMode || 'default') as PermissionMode }
  useEffect(() => { setDrill(null); setQueue([]); setDraft({}); setPop('') }, [cur?.id])
  useEffect(() => { if (prefill) { setText((t) => (t ? `${t} ${prefill}` : prefill)); onPrefilled(); taRef.current?.focus() } }, [prefill])
  useEffect(() => { if (focusReq) taRef.current?.focus() }, [focusReq])
  useEffect(() => { if (attachReq.length) { setAttach((a) => [...a, ...attachReq.filter((r) => !a.some((x) => x.rel === r.rel))]); onAttached() } }, [attachReq])
  useEffect(() => { if (mentionReq.length) { for (const rel of mentionReq) mention(rel); onMentioned() } }, [mentionReq])
  useEffect(() => { void api<SlashCmd[]>(`/bots/${bot.id}/slash${cur?.id ? `?sid=${cur.id}` : ''}`).then(setSlash).catch(() => {}) }, [bot.id, cur?.id])
  useEffect(() => { setFiles(null) }, [bot.id, filesTick])
  const last = items[items.length - 1]
  const lastUser = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'user') return items[i] as Extract<ChatItem, { kind: 'user' }>; return null }, [items])
  const lastAssistant = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'assistant') return items[i].id; return null }, [items])
  const streaming = !!(last && (last.kind === 'assistant' || last.kind === 'thinking') && last.streaming)
  // 컴포저 높이 → 본문 아래 여백 (유리 뒤로 글이 지나가되 가려지진 않게)
  useEffect(() => { const el = footRef.current, col = colRef.current; if (!el || !col) return; const ro = new ResizeObserver(() => col.style.setProperty('--footh', `${el.offsetHeight}px`)); ro.observe(el); return () => ro.disconnect() }, [collapsed])
  // 스크롤 위치 → ↓ 버튼(맨 아래가 아닐 때) · 직전 질문 고정(원래 메시지가 헤더 위로 사라졌을 때)
  const measure = () => { const el = scRef.current; if (!el) return; const d = el.scrollHeight - el.scrollTop - el.clientHeight; setAtBottom(d < 80); setShowJump((was) => (was ? d > 40 : d > 240)); const u = lastUserRef.current; setPinned(!!u && u.getBoundingClientRect().bottom < el.getBoundingClientRect().top + (phone ? 60 : 44)) }
  useEffect(() => { const el = scRef.current; if (!el) return; measure(); el.addEventListener('scroll', measure, { passive: true }); return () => el.removeEventListener('scroll', measure) }, [collapsed, cur?.id, phone])
  useEffect(() => { const el = scRef.current; if (atBottom && el) el.scrollTop = el.scrollHeight; measure() }, [items.length, last && (last.kind === 'assistant' || last.kind === 'thinking') ? last.text.length : 0, pending.length, cur?.activity, lastUser?.id])
  useEffect(() => { if (!pop) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.cpop, .cbtn, .ring, .plusb')) setPop('') }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(''); if (pop === 'mode' && /^[1-4]$/.test(e.key) && !(e.target as HTMLElement).matches('textarea,input')) { e.preventDefault(); void applyCfg({ permissionMode: MODES[Number(e.key) - 1].v }) } }; window.addEventListener('mousedown', off); window.addEventListener('keydown', key); return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', key) } }, [pop])
  const applyCfg = async (p: { model?: string; effort?: string; permissionMode?: PermissionMode }) => { setPop(''); if (cur) { try { await api(`/sessions/${cur.id}/settings`, { body: p }); if (cur.alive && (running || state === 'awaiting_input')) say('이 턴이 끝나면 적용돼요') } catch (e) { say((e as Error).message) } } else setDraft((d) => ({ ...d, ...p })) }
  const post = async (t: string) => { if (cur) await api(`/sessions/${cur.id}/send`, { body: { text: t } }); else { const r = await api<{ sessionId: string }>(`/bots/${bot.id}/send`, { body: { text: t, name: '메인', ...draft } }); await refreshAll(); onSession(r.sessionId) } }
  // 대기열 — 턴이 끝나면 순서대로
  useEffect(() => { if (!running && state !== 'awaiting_input' && queue.length && !busy) { const [n, ...rest] = queue; setQueue(rest); void post(n).catch((e) => say((e as Error).message)) } }, [state, queue.length, busy])
  const sendText = async (raw: string) => {
    let t = raw.trim(); if ((!t && !attach.length) || busy || uploading) return
    if (attach.length) t = `${t || '첨부한 파일을 봐 줘.'}\n\n첨부 파일 (읽어서 참고해):\n${attach.map((a) => (a.dir ? `- ${a.abs}/ (폴더 — 안의 파일들)` : `- ${a.abs}`)).join('\n')}`
    setText(''); setAttach([]); if (taRef.current) taRef.current.style.height = 'auto'
    // 보냈으면 초안은 그 자리에서 지운다. ⚠ 첫 메시지는 세션을 만들며 키가 `new` → 실제 id 로 바뀌므로
    //    지연 저장이 새 키에 대고 지우는 수가 있다 — 둘 다 명시적으로 치운다.
    try { localStorage.removeItem(draftRef.current); localStorage.removeItem(`fb:draft:${bot.id}:new`) } catch { /* */ }
    if (running || state === 'awaiting_input') { setQueue((q) => [...q, t]); return }
    setBusy(true); try { await post(t) } catch (e) { say((e as Error).message) } finally { setBusy(false) }
  }
  const send = () => sendText(text)
  /** ⏎ 가 보내기인 기기인가 — 폰 화면도 아니고 손가락 포인터도 아닐 때만 (위 `onKey` 머리말) */
  const touch = useMedia('(pointer: coarse)')
  const enterSends = !phone && !touch
  const sendKey = enterSends ? '⏎' : '⌘⏎'
  const upload = async (list: File[]) => { if (!list.length) return; setUploading(true); try { for (const f of list) { const r = await uploadFile(bot.id, f); setAttach((a) => [...a, { rel: r.rel, abs: r.abs, uploaded: true }]) } say(`${list.length}개 올렸어요 → 첨부/`) } catch (e) { say((e as Error).message) } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' } }
  const addAtt = (a: Att) => setAttach((l) => (l.some((x) => x.rel === a.rel) ? l : [...l, a]))
  const relOf = (p: string) => (p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : null)
  const rows = useMemo(() => buildRows(items, drill), [items, drill])
  const drillSub = drill ? (items.find((x) => x.id === drill) as Sub | undefined) : undefined
  // 슬래시 · @ — 캐럿 앞 토큰으로 판단
  const before = text.slice(0, caret)
  /**
   * 슬래시 — **캐럿 앞 토큰**으로 본다(@ 와 같은 규칙). 종전에는 «메시지 전체가 /낱말» 일 때만 떴다
   * (`/^\/(\S*)$/`) — 그래서 «안녕 /» 처럼 문장 중간에 치면 목록이 안 나왔다 (2026-09-13 Dave).
   * 낱말 경계 뒤의 `/` 만 인정한다 — 경로(`src/client`)의 슬래시에는 안 뜬다.
   */
  const slashM = dismissed !== text ? /(?:^|\s)\/([^\s/]*)$/.exec(before) : null
  const slashQ = slashM ? slashM[1] : null
  const atM = dismissed !== text ? /(?:^|\s)@([^\s@]*)$/.exec(before) : null
  const atQ = atM ? atM[1] : null
  const slashList = useMemo(() => { if (slashQ === null) return []; const all = [...slash, ...BUILTIN_SLASH.filter((b) => !slash.some((x) => x.name === b.name))]; const q = slashQ.toLowerCase(); return all.filter((c) => fuzzy(q, c.name) > 0).sort((a, b) => fuzzy(q, b.name) - fuzzy(q, a.name)).slice(0, 12) }, [slashQ, slash])
  useEffect(() => { if (atQ !== null && !files) { void api<{ rel: string; dir: boolean; mtime: number; children?: unknown[] }[]>(`/bots/${bot.id}/files?depth=6`).then((tree) => { const out: FileNode[] = []; const walk = (n: typeof tree) => { for (const x of n) { out.push({ rel: x.rel, dir: x.dir, mtime: x.mtime }); if (x.children) walk(x.children as typeof tree) } }; walk(tree); setFiles(out) }).catch(() => setFiles([])) } }, [atQ, files])
  const atList = useMemo(() => { if (atQ === null || !files) return []; const q = atQ.toLowerCase(); return files.map((f) => ({ f, sc: fuzzy(q, f.rel.split('/').pop() ?? '') * 2 + fuzzy(q, f.rel) + (docTabs.includes(f.rel) ? 3 : 0) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || b.f.mtime - a.f.mtime).slice(0, 8).map((x) => x.f) }, [atQ, files, docTabs])
  useEffect(() => { setSel(0) }, [slashQ, atQ])
  /** 고른 명령을 **캐럿 앞 토큰 자리에만** 끼워 넣는다 — 앞뒤 문장을 지우지 않는다 */
  const pickSlash = (c: SlashCmd) => {
    setDismissed('')
    if (c.name === 'clear') { setText(''); void newSession(); return }
    if (c.name === 'context') { setText(''); setPop('ctx'); return }
    const at = slashM ? before.length - slashM[0].length + (slashM[0].startsWith('/') ? 0 : 1) : 0
    const head = text.slice(0, at), tail = text.slice(caret)
    const ins = `/${c.name} `
    setText(head + ins + tail); const pos = at + ins.length
    setCaret(pos); taRef.current?.focus()
    requestAnimationFrame(() => taRef.current?.setSelectionRange(pos, pos))
  }
  const pickAt = (f: FileNode) => { const name = f.rel.split('/').pop() ?? f.rel; const start = caret - (atQ?.length ?? 0) - 1; const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`; setText(next); setCaret(start + name.length + 2); addAtt({ rel: f.rel, abs: `${bot.abs}/${f.rel}`, dir: f.dir }); setDismissed(''); taRef.current?.focus() }
  const mention = (rel: string) => { const name = rel.split('/').pop() ?? rel; setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${name} `); addAtt({ rel, abs: `${bot.abs}/${rel}` }); taRef.current?.focus() }
  // 맥 메뉴의 «보내기» — 단축키(⌘⏎)와 **같은 길**로 들어온다
  useEffect(() => { const f = () => void send(); window.addEventListener('fb:send', f); return () => window.removeEventListener('fb:send', f) })
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const list: (SlashCmd | FileNode)[] = slashList.length ? slashList : atList
    if (list.length && (slashQ !== null || atQ !== null)) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => (i + 1) % list.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => (i - 1 + list.length) % list.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); const it = list[sel]; if ('name' in it) pickSlash(it); else pickAt(it); return }
      if (e.key === 'Escape') { e.preventDefault(); setDismissed(text); return }
    }
    /**
     * 🔴 **⏎ 는 자판이 있으면 «보내기», 폰에서는 «줄 바꾸기»** (2026-09-15 Dave — Claude Desktop 과 같은 방향:
     *    *«맥에서는 Enter 가 전송, shift+Enter 가 줄내림. 모바일에서는 Enter 가 줄내림이고 버튼을 눌러야 전송»*).
     *
     * ⚠ 2026-09-14 에는 **양쪽 다 ⌘⏎ 만**이었다(반쯤 쓴 말이 나가는 게 싫어서). 뒤집은 이유는 «두 기기를
     *   같이 쓰니 방향을 통일하고 싶다» 이고, 통일의 기준은 **자판이 딸려 있나**다 — 자판 앞에서는 ⏎ 가
     *   보내기고 ⇧⏎ 가 줄 바꿈, 엄지로 치는 화면에서는 ⏎ 가 줄 바꿈이고 보내기는 단추뿐이다.
     *
     * 🔴 **가르는 기준은 창 너비가 아니라 «손가락이냐»** — 폰 화면(`phone`)이거나 거친 포인터(`touch`)면
     *    ⏎ 는 줄 바꿈이다. 너비만 보면 아이패드 가로(넓다)에서 소프트 자판의 ⏎ 가 말을 쏴 버린다.
     * ⚠ 한글 조합 중의 ⏎ 는 **조합 끝내기**다 — 맨 위 `isComposing` 가드가 그걸 막는다(빼면 «안녕」 치다 나간다).
     * ⚠ `/` · `@` 목록이 떠 있을 때의 ⏎ 는 **고르기**다(위 분기) — 보내기가 아니라 채우기다.
     * ⚠ ⌘⏎ 는 **어느 기기에서나** 보내기로 남긴다 — 맥 메뉴가 쓰는 길이고, 폰에 외장 자판을 붙인 사람의 길이다.
     */
    if (e.key !== 'Enter') return
    if (e.metaKey || e.ctrlKey) { e.preventDefault(); void send(); return }
    if (!enterSends || e.shiftKey || e.altKey) return
    e.preventDefault(); void send()
  }
  const hasText = !!text.trim() || attach.length > 0
  const mode: 'send' | 'queue' | 'stop' | 'off' = hasText ? (running || state === 'awaiting_input' ? 'queue' : 'send') : running ? 'stop' : 'off'
  const ctx = cur?.ctx; const pct = ctx ? Math.min(100, Math.round((ctx.used / ctx.window) * 100)) : 0
  if (collapsed) return <div className="strip" style={{ background: 'var(--bg)' }}><button className="ib" onClick={onUncollapse} title="대화 펼치기"><Icon n="sub" size={14} /></button><div className="gap" /><FolderBot color={bot.color} size={17} mood={moodOf(state, !!cur?.hibernated)} mono />{running ? <span className="pulse" style={{ marginTop: 8 }} /> : null}</div>
  const sessMenuEl = sessMenu ? <div className="menu" style={phone ? { left: 0, top: 50 } : { left: 0, top: 28 }} onClick={() => setSessMenu(false)}>{/* ⚠ 세션 이름 **오른쪽에** 회사 표식 (2026-09-13 Dave: «세션 뒤에는 모든 곳에 … 세션이름 우측에
                  아이콘이 있어야 해»). 벤더는 폴더가 아니라 세션의 성질이라 세션이 보이는 곳마다 따라다녀야 한다 */}
              {sessions.map((x) => <button key={x.id} className={x.id === cur?.id ? 'on' : ''} onClick={() => onSession(x.id)}><span className={`dot ${stateDot(x.state)}`} /><span>{x.name}</span><VendorMark vendor={x.vendor} size={11} /><span style={{ flex: 1 }} /><span className="k">{x.hibernated ? '절전' : fmtTime(x.lastActivity)}</span></button>)}<hr /><button onClick={() => void newSession()}><Icon n="plus" size={12} /><span>새 세션</span></button>{cur ? <button onClick={async () => { const n = prompt('세션 이름', cur.name); if (n) await api(`/sessions/${cur.id}/rename`, { body: { name: n } }) }}><Icon n="edit" size={12} /><span>이름 바꾸기</span></button> : null}{cur ? <button className="warn" onClick={async () => { if (confirm('이 세션 기록을 지울까요?')) { await api(`/sessions/${cur.id}`, { method: 'DELETE' }); await refreshAll() } }}><Icon n="x" size={12} /><span>세션 삭제</span></button> : null}</div> : null
  /**
   * 🔴 **채팅에 쓴 한 줄을 그대로 루틴으로** (2026-09-13 Dave: «루틴을 폴더 채팅에서 바로 채팅으로 생성»).
   *    「매주 월요일 아침 9시에 지난주 정리해 줘」 라고 써 두고 + → 루틴으로 만들기 를 누르면
   *    주기·이름·프롬프트가 **채워진 채로** 편집 화면이 뜬다. ⛔ 저장은 사람이 누른다 — 주기는 추측이라
   *    틀릴 수 있고, 틀린 추측을 조용히 저장하면 엉뚱한 시각에 봇이 혼자 일한다.
   * ⚠ 글이 비어 있으면 **직전에 보낸 말**을 쓴다 — 「아까 그거 매일 해 줘」 가 자연스러운 흐름이다.
   */
  /** 쓰는 중인 글 속의 주소 — 도메인 단위로 접는다(같은 사이트를 여러 번 쓰면 칩은 하나) */
  const draftLinks = useMemo(() => {
    const re = new RegExp(BARE_URL_RE.source, 'g'); const seen = new Set<string>(); const out: string[] = []
    for (let m = re.exec(text); m; m = re.exec(text)) { const h = faviconHost(m[0]); if (!h || seen.has(h)) continue; seen.add(h); out.push(m[0]); if (out.length >= 4) break }
    return out
  }, [text])
  const routineSrc = () => (text.trim() || items.filter((x) => x.kind === 'user').pop()?.text || '').trim()
  const routinePeek = () => { const src = routineSrc(); if (!src) return '무엇을 시킬지 먼저 쓰세요'; return cronFromText(src).label }
  const openRoutine = () => {
    const src = routineSrc()
    if (!src) { say('무엇을 시킬지 먼저 쓰세요'); return }
    const g = cronFromText(src)
    setRoutineDraft({ name: routineName(g.rest || src), cron: g.cron, prompt: g.rest || src, approve: 'readonly', push: true })
    setText('')
  }
  const modeBtn = <button className={`cbtn ${pop === 'mode' ? 'on' : ''}`} onClick={() => setPop(pop === 'mode' ? '' : 'mode')} title="모드">{modeLabel(cfg.mode)}<span className="chev">▾</span></button>
  /**
   * 🔴 **고를 목록은 «이 세션의 벤더» 가 정한다** — Claude 목록을 Codex 세션에 보여 주면
   *    고르는 순간 CLI 가 «모델이 없다» 로 그 자리에서 죽는다(이름 체계가 다르다).
   */
  const vend = cur?.vendor ?? bot.vendor
  const modelList = modelsFor(vend), effortList = effortsFor(vend)
  // 「더 많은 모델」 — 긴 문맥(1M) 과 기계에서 주워 온 이름. 평소엔 접혀 있다
  const moreList = moreModelsFor(vend)
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => { if (pop !== 'model') setMoreOpen(false) }, [pop])
  const modelBtn = <button className={`cbtn ${pop === 'model' ? 'on' : ''}`} onClick={() => setPop(pop === 'model' ? '' : 'model')} title="모델">{modelLabel(cfg.model, vend)}{phone ? <span className="chev">▾</span> : null}</button>
  const effortBtn = <button className={`cbtn ${pop === 'effort' ? 'on' : ''}`} onClick={() => setPop(pop === 'effort' ? '' : 'effort')} title="노력">{effortLabel(cfg.effort, vend)}{phone ? <span className="chev">▾</span> : null}</button>
  const ringBtn = <button className={`ring ${pct >= 80 ? 'hot' : ''}`} onClick={() => setPop(pop === 'ctx' ? '' : 'ctx')} title={ctx ? `컨텍스트 ${pct}%` : '컨텍스트'}><Ring pct={pct} size={phone ? 20 : 18} />{pct >= 80 && !phone ? <span style={{ fontSize: 11.5, marginLeft: 4 }}>압축</span> : null}</button>
  const plusBtn = <button className={phone ? 'plusb' : `cbtn ${pop === 'plus' ? 'on' : ''}`} style={phone ? undefined : { padding: '3px 6px' }} title="첨부" onClick={() => setPop(pop === 'plus' ? '' : 'plus')} disabled={uploading}><Icon n="plus" size={phone ? 20 : 14} /></button>
  const sendBtn = mode === 'stop' ? <button className="sendb" onClick={() => cur && api(`/sessions/${cur.id}/interrupt`, { body: {} })} title="중단"><Icon n="stop" size={phone ? 14 : 11} /></button>
    : mode === 'off' && phone ? <span className="sendb mic"><Icon n="mic" size={20} /></span>
      : <button className={`sendb ${mode === 'off' ? 'off' : ''}`} onClick={send} disabled={mode === 'off' || busy || uploading} title={mode === 'queue' ? `대기열에 넣기 (${sendKey})` : `보내기 (${sendKey})`}><Icon n="up" size={phone ? 16 : 12} />{mode === 'queue' ? <span className="bd">+{queue.length + 1}</span> : null}</button>
  const popEl = pop === 'mode' ? <div className="cpop"><div className="h">모드 · 이 세션</div>{MODES.map((m, i) => <button key={m.v} className={`prow2 ${cfg.mode === m.v ? 'on' : ''}`} onClick={() => void applyCfg({ permissionMode: m.v })}><div className="t"><b>{m.t}</b><small>{m.d}</small></div>{cfg.mode === m.v ? <Icon n="check" size={13} /> : <span className="k">{i + 1}</span>}</button>)}<div className="hint"><span>1~4</span><span className="sp" /><span>새 세션은 설정의 기본값으로</span></div></div>
    /**
     * 🔴 **종류별 최신 하나씩만 보인다** (2026-09-14 Dave: «다른 모델은 안쓰고 최신 버전만 종류별로만
     *    선택하게 할꺼야»). 나머지(긴 문맥·기계에서 주워 온 이름)는 **「더 많은 모델」** 아래로.
     * ⛔ 첫 목록을 늘리지 마라 — 고를 것이 많아지면 «무엇이 다른지» 를 매번 생각하게 된다.
     */
    : pop === 'model' ? <div className="cpop r"><div className="h">모델 · 이 세션{vend === 'codex' ? ' · Codex' : ''}</div>
      {modelList.map((m, i) => <button key={m.v} className={`prow2 ${cfg.model === m.v ? 'on' : ''}`} onClick={() => void applyCfg({ model: m.v })}><div className="t"><b>{m.t}</b>{m.d ? <small>{m.d}</small> : null}</div>{cfg.model === m.v ? <Icon n="check" size={13} /> : <span className="k">{i + 1}</span>}</button>)}
      {moreList.length ? (moreOpen
        ? <>{moreList.map((m) => <button key={m.v} className={`prow2 ${cfg.model === m.v ? 'on' : ''}`} onClick={() => void applyCfg({ model: m.v })}><div className="t"><b>{m.t}</b>{m.d ? <small>{m.d}</small> : null}</div>{cfg.model === m.v ? <Icon n="check" size={13} /> : null}</button>)}</>
        : <button className="prow2 more" onClick={(e) => { e.stopPropagation(); setMoreOpen(true) }}><div className="t"><b>더 많은 모델</b></div><Icon n="chev" size={12} /></button>) : null}
      <div className="hint"><span>바꾸면 이 세션을 이어서 재시작해요 (대화 유지)</span></div></div>
    : pop === 'effort' ? <div className="cpop r"><div className="effort"><div className="top"><span style={{ color: 'var(--t3)', fontSize: 12.5 }}>노력</span><b>{effortLabel(cfg.effort, vend)}</b></div><div className="lbl"><span>더 빠르게</span><span>더 스마트하게</span></div><input type="range" min={0} max={effortList.length - 1} step={1} value={Math.max(0, effortList.findIndex((e) => e.v === cfg.effort))} onChange={(e) => { const v = effortList[Number(e.target.value)].v; if (v !== cfg.effort) void (async () => { if (cur) { try { await api(`/sessions/${cur.id}/settings`, { body: { effort: v } }) } catch (er) { say((er as Error).message) } } else setDraft((d) => ({ ...d, effort: v })) })() }} /><div className="steps">{effortList.map((e) => <span key={e.v}>{e.t}</span>)}</div></div><div className="hint"><span>다음 턴부터 적용 · 기본값은 설정에서</span></div></div>
    : pop === 'ctx' ? <div className="cpop r ctxpop"><div className="big"><Ring pct={pct} size={40} stroke={3} /><div><b>컨텍스트 {ctx ? `${pct}%` : '—'}</b><small>{ctx ? `${fmtK(ctx.used)} / ${fmtK(ctx.window)} 토큰 · 이 세션` : '첫 답이 오면 잽니다'}</small></div></div><hr /><button className="prow2" onClick={() => { setPop(''); void sendText('/compact') }}><div className="t"><b>/compact 압축</b><small>대화를 요약해 컨텍스트를 줄여요</small></div></button><div className="hint"><span>80% 를 넘으면 링이 주황</span></div></div>
    : pop === 'plus' ? <div className="cpop plus">{bot.orchestrator ? null : <button className="prow2" onClick={() => { setPop(''); openRoutine() }}><Icon n="clock" size={14} color="var(--t3)" /><div className="t"><b>루틴으로 만들기</b><small>{routinePeek()}</small></div></button>}<button className="prow2" onClick={() => { setPop(''); fileRef.current?.click() }}><Icon n="phone" size={14} color="var(--t3)" /><div className="t"><b>이 기기에서 파일 올리기</b></div><span className="k">→ 첨부/</span></button><button className="prow2" onClick={() => { setPop(''); setPickOpen(true) }}><Icon n="folder" size={14} color="var(--t3)" /><div className="t"><b>{bot.orchestrator ? '볼트' : '이 폴더'}에서 고르기</b></div></button>{docTabs.length ? <button className="prow2" onClick={() => { setPop(''); for (const rel of docTabs) addAtt({ rel, abs: `${bot.abs}/${rel}` }) }}><Icon n="doc" size={14} color="var(--t3)" /><div className="t"><b>열린 문서 첨부 ({docTabs.length})</b></div></button> : null}<hr /><button className="prow2" onClick={() => { setPop(''); setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@`); setCaret(text.length + 1); taRef.current?.focus() }}><span className="mono" style={{ width: 14, textAlign: 'center', color: 'var(--t3)' }}>@</span><div className="t"><b>@ 로 이름 쳐서 넣기</b></div></button><div className="hint"><span>스크린샷은 ⌘V 로 붙여 넣으면 첨부/ 에 저장</span></div></div>
    : slashQ !== null && slashList.length ? <div className="cpop">{(['skill', 'cli'] as const).map((grp) => { const l = slashList.filter((c) => (grp === 'skill' ? c.kind !== 'cli' : c.kind === 'cli')); return l.length ? <div key={grp}><div className="h">{grp === 'skill' ? '스킬 · 이 폴더' : '명령'}</div>{l.map((c) => { const i = slashList.indexOf(c); return <button key={c.name} className={`prow2 ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pickSlash(c)}><div className="t"><b>/{c.name}</b>{c.desc ? <small>{c.desc}</small> : null}</div>{i === sel ? <span className="k">⏎</span> : c.scope !== 'cli' && c.scope !== 'folder' ? <span className="k">{c.scope}</span> : null}</button> })}</div> : null })}<div className="hint"><span>↑↓ 이동</span><span>Tab · ⏎ 선택</span><span>⎋ 닫기</span><span className="sp" /><span>{slashList.length}개</span></div></div>
    : atQ !== null && atList.length ? <div className="cpop"><div className="h">{docTabs.length ? '열린 문서 먼저 · ' : ''}이 폴더{atQ ? ` · «${atQ}»` : ''}</div>{atList.map((f, i) => { const name = f.rel.split('/').pop() ?? f.rel; const dir = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) + '/' : ''; return <button key={f.rel} className={`prow2 ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pickAt(f)}><Icon n={f.dir ? 'folder' : 'doc'} size={14} color="var(--t3)" /><div className="t"><b>{name}</b><small>{f.dir ? `폴더째${dir ? ` · ${dir}` : ''}` : dir || (docTabs.includes(f.rel) ? '열림' : '')}</small></div>{i === sel ? <span className="k">⏎</span> : null}</button> })}<div className="hint"><span>↑↓ 이동</span><span>⏎ 넣기</span><span className="sp" /><span>이름 · 경로로 찾음</span></div></div>
    : null
  return <div className="col chat" style={{ flex: 1 }} ref={colRef}>
    <div className={`hdr chat-hdr ${phone ? '' : 'glass'}`}>
      {phone ? <><button className="rb glassb" onClick={drillSub ? () => setDrill(null) : onBack} title="뒤로"><Icon n="back" size={20} /></button>
        {/* 감싸는 span 은 헤더의 flex 아이템 — 폭이 내용에 의존하는데 알약이 그 100% − 118px 을 최대폭으로 삼아 스스로를 눌러 이름이 «2026-…» 로 잘렸다(2026-09-13 Dave). 알약 최대폭은 감싸는 칸의 100%, 칸이 남는 공간을 받는다 */}
        <span style={{ position: 'relative', minWidth: 0, flex: '0 1 auto', display: 'flex' }}><button className="bpill glassb" onClick={() => setSessMenu(!sessMenu)}><FolderBot color={bot.color} size={26} mood={moodOf(state, !!cur?.hibernated)} mono /><b><Mid s={drillSub ? drillSub.name : bot.name} /></b><VendorMark vendor={cur?.vendor} size={12} />{stateDot(state) !== 'none' ? <span className={`dot ${stateDot(state)}`} style={{ width: 7, height: 7 }} /> : null}</button>{sessMenuEl}</span>
        <span className="sp" /><button className="rb glassb" onClick={onPanel} title="이 폴더에서"><Icon n="folder" size={20} /></button></>
        : drillSub ? <><button className="ib" onClick={() => setDrill(null)} title="메인 대화로"><Icon n="back" size={14} /></button><span style={{ color: 'var(--t3)' }}>/</span><span className="ttl">{drillSub.name}</span>{drillSub.status === 'run' ? <span className="spin run" /> : <Icon n={drillSub.status === 'error' ? 'x' : 'check'} size={11} color={drillSub.status === 'error' ? 'var(--err)' : 'var(--done)'} />}<span style={{ color: 'var(--t3)', fontSize: 12, whiteSpace: 'nowrap' }}>도구 {drillSub.tools}</span><span className="sp" /></>
          : <><FolderBot color={bot.color} size={16} mood={moodOf(state, !!cur?.hibernated)} mono /><span className="ttl"><Mid s={bot.name} /></span><VendorMark vendor={cur?.vendor} size={12} />
            <span style={{ position: 'relative', flex: 'none' }}><button onClick={() => setSessMenu(!sessMenu)} style={{ color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>{cur?.name ?? '새 대화'} <Icon n="chevd" size={10} /></button>{sessMenuEl}</span>
            <span className={`dot ${stateDot(state)}`} /><span className="sp" />
            <div className="acts"><button className={`ib ${docOn ? 'on' : ''}`} onClick={onDocToggle} title="문서 열 (⌘⇧D)"><Icon n="doc" size={14} />{!docOn && docBadge ? <span className="bd">{docBadge}</span> : null}</button></div></>}
    </div>
    {routineDraft ? <RoutineSheet bot={bot} draft={routineDraft} onClose={() => setRoutineDraft(null)} /> : null}
    {pinned && lastUser && !drill ? <button className="pinq glassb" onClick={() => lastUserRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })} title="직전 질문으로">{lastUser.text}</button> : null}
    <div className="chat-scroll" ref={scRef}>
      <div className="chat-body">
        {!cur && !drill ? <div className="empty" style={{ flex: 1 }}><FolderBot color={bot.color} size={40} mood="idle" /><div><b>{bot.name}</b>{bot.orchestrator ? ' — 볼트 전체를 보는 관제 봇이에요. "지금 뭐 돌고 있어?", "Inbox 정리해 줘", "X 폴더에서 시작해".' : ' 봇이에요. 이 폴더의 지침·기억·자료를 들고 일해요.'}</div></div> : null}
        {drillSub ? <div className="drill-p"><div className="meta" style={{ cursor: 'default' }}>무엇을 시켰나</div><div className="tx">{drillSub.prompt || drillSub.name}</div><hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} /></div> : null}
        {rows.map((r) => r.k === 'group'
          ? <ToolGroup key={r.items[0].id} items={r.items} endT={r.endT} base={bot.abs} onFile={(p) => { const rel = relOf(p); if (rel) onFile(rel) }} />
          : <Item key={r.it.id} it={r.it} bot={bot} items={items} onFile={(p) => { const rel = relOf(p); if (rel) onFile(rel) }} onDrill={(id) => setDrill(id)} state={state} say={say} isLastAssistant={r.it.id === lastAssistant} isLastUser={r.it.id === lastUser?.id} userRef={lastUserRef} onRetry={lastUser ? () => void sendText(lastUser.text) : undefined} />)}
        {cur && !drill ? pending.map((p) => <PermCard key={p.requestId} p={p} sid={cur.id} />) : null}
        <div style={{ flex: 1 }} />
        {cur && (running || state === 'awaiting_input') ? <Live cur={cur} state={state} color={bot.color} /> : null}
        <div ref={endRef} />
      </div>
    </div>
    <button className={`tobot rb glassb${showJump ? '' : ' off'}`} onClick={() => { const el = scRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }} title="최근으로" tabIndex={showJump ? 0 : -1} aria-hidden={!showJump}><Icon n="chevd" size={16} />{streaming ? <span className="dot run" /> : null}</button>
    <div className="chat-foot" ref={footRef}>
      {/* 🔴 **대기 메시지는 고칠 수 있어야 한다** (2026-09-14 Dave: «현재 대기 메시지 수정이 안돼»).
          아직 안 보낸 말이다 — 못 고치면 지우고 처음부터 다시 쓰는 수밖에 없었다.
          ⚠ 여기의 ⏎ 는 **고치기 끝**이다(보내기가 아니다) · ⎋ 는 되돌리기. ⛔ 빈 글로 두면 그 줄은 사라진다. */}
      {queue.map((q, i) => <QueueRow key={i} n={i + 1} text={q}
        onSave={(v) => setQueue(v.trim() ? queue.map((x, k) => (k === i ? v : x)) : queue.filter((_, k) => k !== i))}
        onDrop={() => setQueue(queue.filter((_, k) => k !== i))} />)}
      {/* 🔴 **입력창의 링크도 아이콘을 갖는다** (2026-09-13 Dave). ⚠ `textarea` 안에는 그림을 못 넣는다 —
          글자만 담는 칸이다. 그래서 쓰는 중인 주소를 **입력칸 위 칩**으로 올린다: 같은 캐시, 같은 아이콘,
          그리고 «이 주소가 맞나» 를 보내기 전에 확인할 수 있다. */}
      {draftLinks.length ? <div className="files lchips">{draftLinks.map((u) => <LinkChip key={u} url={u} />)}</div> : null}
      {attach.length ? <div className="files">{attach.map((a) => <span key={a.rel} className="chip" title={a.abs} ref={a.dir ? undefined : hoverRef({ kind: 'file', botId: bot.id, rel: a.rel })}><Icon n={a.dir ? 'folder' : 'doc'} size={11} color="var(--t3)" /><span>{a.rel}{a.dir ? '/' : ''}</span><button onClick={() => setAttach(attach.filter((x) => x.rel !== a.rel))} style={{ color: 'var(--t3)', display: 'inline-flex' }}><Icon n="x" size={10} /></button></span>)}<span style={{ fontSize: 11, color: 'var(--t3)', alignSelf: 'center' }}>{attach.length}개 · 봇이 읽어서 참고</span></div> : null}
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
      {phone ? <div className="cchips">{modeBtn}{modelBtn}{effortBtn}</div> : null}
      <div className={`composer glassb ${drop ? 'drop' : ''} ${text.includes('\n') || text.length > 40 ? 'multi' : ''}`}
        onDragOver={(e) => { const t = e.dataTransfer.types; if (t.includes('text/x-fb-rel')) { e.preventDefault(); setDrop('tree') } else if (t.includes('Files')) { e.preventDefault(); setDrop('files') } }}
        onDragLeave={() => setDrop('')}
        onDrop={(e) => { setDrop(''); const rel = e.dataTransfer.getData('text/x-fb-rel'); if (rel) { e.preventDefault(); addAtt({ rel, abs: `${bot.abs}/${rel}`, dir: e.dataTransfer.getData('text/x-fb-dir') === '1' }); return } if (e.dataTransfer.files.length) { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)) } }}
        onPaste={(e) => { const imgs = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f); if (imgs.length) { e.preventDefault(); const d = new Date(); void upload(imgs.map((f, i) => new File([f], `스크린샷_${d.getHours()}${String(d.getMinutes()).padStart(2, '0')}${i ? `-${i + 1}` : ''}.${(f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')}`, { type: f.type }))) } }}>
        {popEl}
        {drop ? <div className="drophint"><Icon n="plus" size={13} />{drop === 'files' ? '놓으면 첨부/ 에 복사하고 첨부' : '놓으면 첨부'}</div> : null}
        <div className="crow">
          {phone ? plusBtn : null}
          <textarea ref={taRef} rows={1} onFocus={() => { if (phone) stickBottom() }} placeholder={drill ? '메인 대화로 보냅니다 — 이 안에는 직접 말을 걸 수 없어요' : running ? `보내면 대기열에 들어갑니다 (${sendKey})` : state === 'awaiting_input' ? '답을 기다리는 중 — 보내면 대기열에' : enterSends ? '메시지…  ⏎ 보내기 · ⇧⏎ 줄 바꿈 · / 스킬 · @ 파일' : '메시지…  / 스킬 · @ 파일'} value={text} onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px` }} onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)} onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)} onKeyDown={onKey} />
          {phone ? <>{ringBtn}{sendBtn}</> : null}
        </div>
        {!phone ? <div className="cbar">{modeBtn}{plusBtn}<span className="sp" />{modelBtn}{effortBtn}{ringBtn}{sendBtn}</div> : null}
      </div>
      {!phone ? <div className="cfoot"><span className={`dot ${cur?.alive || running ? 'done' : 'none'}`} style={{ width: 5, height: 5 }} /><span>{cur?.hibernated && !running ? `${s.hostName} · 절전 (첫 답이 몇 초 늦어요)` : s.hostName}</span>{cur?.restartPending ? <span>· 턴이 끝나면 새 설정으로 재시작</span> : null}<span className="sp" />{uploading ? <span>올리는 중…</span> : null}</div> : null}
    </div>
    {pickOpen ? <FilePickModal bot={bot} onClose={() => setPickOpen(false)} onPick={(rel) => { addAtt({ rel, abs: `${bot.abs}/${rel}` }); setPickOpen(false) }} /> : null}
  </div>
}

function Ring({ pct, size = 18, stroke = 2 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }}><circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line2)" strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" strokeDasharray={`${(c * Math.max(0, pct)) / 100} ${c}`} strokeLinecap="round" /></svg>
}

/** 입력창 위 링크 칩 — 아이콘이 도착하면 갈아 끼운다 */
function LinkChip({ url }: { url: string }) {
  const [ic, setIc] = useState<string | null | undefined>(() => faviconNow(url))
  useEffect(() => onFavicon(url, setIc), [url])
  let host = url
  try { host = new URL(url).host } catch { /* 그대로 */ }
  // 오버하면 제목·설명·썸네일 카드 — 보내기 전에 «이 주소가 맞나» 를 눈으로 확인한다
  return <span className="chip lchip" title={url} ref={hoverRef({ kind: 'link', url })}><img className="fvic" alt="" width={13} height={13} src={ic || GLOBE} /><span>{host}</span></span>
}

/**
 * 진행 줄 — 🔴 **폴더봇 · 시간 · 짧은 행동**, 그리고 오른쪽 끝에 중단 (2026-09-13 Dave 확정).
 *  ⚠ **시간이 먼저다** — 기다리는 사람이 제일 먼저 보는 값이라 오른쪽 끝이 아니라 왼쪽에 둔다.
 *  ⛔ 도구 이름·파일 이름을 여기 쓰지 않는다. 무엇을 하는지는 **바로 위 접힌 줄**이 말하고,
 *     그 줄이 도는 동안 물결친다(`core/work.ts` 머리말).
 *  ⛔ 맥박 점(·)은 뺐다 — 마스코트가 이미 같은 말을 한다.
 */
/**
 * 대기 줄 하나 — 눌러서 고친다 (2026-09-14 Dave: *«현재 대기 메시지 수정이 안돼»*).
 *
 * 🔴 **아직 안 보낸 말이다.** 못 고치면 지우고 처음부터 다시 쓰는 수밖에 없었다 — 긴 지시문일수록
 *    아프다. 그래서 줄을 그대로 입력칸으로 바꾼다(자리·높이가 안 변해 목록이 안 출렁인다).
 * ⚠ **여기의 ⏎ 는 «고치기 끝»** 이다 — 보내기가 아니다(보내기 계약은 입력칸에 있다).
 * ⚠ ⎋ 는 되돌리기. ⛔ 빈 글로 두고 나가면 그 줄은 **사라진다** — 「지우기」를 따로 찾지 않게.
 */
function QueueRow({ n, text, onSave, onDrop }: { n: number; text: string; onSave: (v: string) => void; onDrop: () => void }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState(text)
  useEffect(() => { setV(text) }, [text])
  return <div className="queue">
    <span>대기 {n}</span>
    {edit
      ? <input className="qin" autoFocus value={v} onChange={(e) => setV(e.target.value)}
          onBlur={() => { setEdit(false); if (v !== text) onSave(v) }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') { e.preventDefault(); setEdit(false); if (v !== text) onSave(v) }
            if (e.key === 'Escape') { e.preventDefault(); setV(text); setEdit(false) }
          }} />
      : <button className="tx" title="눌러서 고치기" onClick={() => setEdit(true)}>{text}</button>}
    <button onClick={onDrop} title="대기열에서 빼기" style={{ color: 'var(--t3)', display: 'inline-flex' }}><Icon n="x" size={11} /></button>
  </div>
}

function Live({ cur, state, color }: { cur: SessionInfo; state: string; color: string }) {
  if (state === 'awaiting_input') return <div className="live"><span className="glow" /><span className="tx">확인 대기 — 위 요청에 응답해 주세요</span><span className="el"><Elapsed from={cur.turnStartedAt} /></span></div>
  const a = cur.activity ?? ''
  return <div className="live run work">
    <FolderBot color={color} size={22} mood="work" work={workMood(a)} mono />
    <span className="el mono"><Elapsed from={cur.turnStartedAt} /></span>
    <span className="sl">·</span>
    <span className="tx">{workLabel(a)}</span>
    <span className="sp" />
    {/* ⛔ **여기에 중단 단추를 다시 두지 마라** (2026-09-14 Dave: «에이전트가 생각하는 폴더 옆에
        중단 버튼은 없어도 될것 같아. 어차피 채팅 입력부에 중복으로 있어»). 같은 일을 하는 단추가
        한 화면에 둘이면, 둘 다 «진짜 그건가» 를 한 번씩 생각하게 만든다. 중단은 입력줄의 것 하나다. */}
  </div>
}

function Item({ it, bot, items, onFile, onDrill, state, say, isLastAssistant, isLastUser, userRef, onRetry }: { it: ChatItem; bot: Bot; items: ChatItem[]; onFile: (p: string) => void; onDrill: (id: string) => void; state: string; say: (m: string) => void; isLastAssistant: boolean; isLastUser: boolean; userRef: React.MutableRefObject<HTMLDivElement | null>; onRetry?: () => void }) {
  const [open, setOpen] = useState(false)
  switch (it.kind) {
    case 'user': return <div className={`umsg ${isLastUser ? 'last' : ''}`} ref={isLastUser ? userRef : undefined}>{it.text}</div>
    case 'assistant': return <div className="amsg"><Md text={it.text || ' '} streaming={!!it.streaming} botId={bot.id} onPath={onFile} />{/* 답 아래 줄 — 🔴 **아이콘만** (2026-09-13 Dave: «복사 및 기능들을 아이콘으로»). 글자를 빼면
            답과 답 사이가 조용해지고, 무엇을 하는지는 툴팁이 말한다. ⚠ 시각은 남긴다(언제 온 답인지) */}
        {!it.streaming && isLastAssistant ? <div className="acts-row"><button className="ib" onClick={() => void copySay(it.text, say)} title="답 복사"><Icon n="copy" size={14} /></button>{onRetry && state !== 'running' ? <button className="ib" onClick={onRetry} title="같은 질문 다시"><Icon n="undo" size={14} /></button> : null}<span>{fmtTime(it.t)}</span></div> : null}</div>
    case 'thinking': return <div><button className={`meta ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}><span className="lb">생각</span>{!open ? <span className="tx">· {it.text.trim() ? it.text.replace(/\s+/g, ' ').slice(0, 100) : it.streaming ? '생각 중…' : '(내용 없음)'}</span> : null}<Icon n={open ? 'chevd' : 'chev'} size={9} /></button>{open ? <div className="think">{it.text.trim() ? it.text : it.streaming ? '생각 중…' : 'Claude Code 가 headless 출력에서는 생각 내용을 주지 않아요 (서명만 옵니다).'}</div> : null}</div>
    case 'tool': return <ToolLine it={it} onFile={onFile} base={bot.abs} />
    case 'subagent': { const kids = items.filter((x) => x.kind === 'tool' && x.parentId === it.id) as Tool[]; return <div className="sub"><div className="l"><button className="ib" style={{ width: 18, height: 18, marginLeft: -4 }} onClick={() => setOpen(!open)}><Icon n={open ? 'chevd' : 'sub'} size={12} /></button><span className="nm">{it.name}</span>{it.status === 'run' ? <span className="spin run" /> : <Icon n={it.status === 'error' ? 'x' : 'check'} size={11} color={it.status === 'error' ? 'var(--err)' : 'var(--done)'} />}<span className="m"><span className="w">{it.status === 'run' ? '실행 중' : it.status === 'error' ? '실패' : '끝남'} · 도구 {it.tools}회</span><span className="ic" title={`도구 ${it.tools}회`}><Icon n="task" size={11} />{it.tools}</span>{it.last ? <> · <span className="mono">{it.last}</span></> : null}</span><button className="op" onClick={() => onDrill(it.id)} title="열기"><span className="w">열기</span><Icon n="chev" size={10} /></button></div>{open ? <div className="in">{kids.slice(-4).map((k) => <ToolLine key={k.id} it={k} onFile={onFile} base={bot.abs} />)}{it.result && it.status !== 'run' ? <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>{it.result.slice(0, 300)}</div> : null}{!kids.length ? <div className="meta">아직 도구를 안 썼어요</div> : null}</div> : null}</div> }
    case 'todos': return <TodoWidget it={it} stopped={state !== 'running'} />
    case 'files': return <div className="files">{it.paths.map((p) => <button key={p} className="chip" onClick={() => onFile(p)} title={p}><Icon n="doc" size={11} color="var(--t3)" /><span>{p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : p.split('/').pop()}</span></button>)}</div>
    case 'result': return it.ok ? null : <div className="meta" style={{ color: 'var(--err)' }}><Icon n="warn" size={11} /><span className="tx">{it.error || '오류로 끝남'}</span></div>
    default: return <div className="meta"><span className="tx">{(it as { text: string }).text}</span></div>
  }
}

function ToolLine({ it, onFile, base }: { it: Tool; onFile: (p: string) => void; base?: string }) {
  const rel = (t: string) => (base ? t.split(base + '/').join('').split(base).join('.') : t)
  const [open, setOpen] = useState(false)
  const kind = /^(Read|Glob|LS)$/.test(it.name) ? 'read' : /^Grep$/.test(it.name) ? 'grep' : /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(it.name) ? 'edit' : /^Bash$/.test(it.name) ? 'run' : /Web/.test(it.name) ? 'web' : /^mcp__/.test(it.name) ? 'plug' : 'task'
  const label = it.name.startsWith('mcp__') ? it.name.replace(/^mcp__(claude_ai_)?/, '').replace(/__/g, ' ') : it.name
  const fp = typeof it.input?.file_path === 'string' ? (it.input.file_path as string) : null
  const diff = it.name === 'Edit' && typeof it.input?.old_string === 'string' && typeof it.input?.new_string === 'string' ? { a: (it.input.old_string as string).split('\n').length, b: (it.input.new_string as string).split('\n').length } : null
  return <div className="tl"><button className="l" onClick={() => setOpen(!open)}>{it.result === undefined && !it.isError ? <span className="spin" /> : it.isError ? <Icon n="x" size={11} color="var(--err)" /> : <Icon n="check" size={11} color="var(--t3)" />}<Icon n={kind as 'read'} size={12} color="var(--t3)" /><span className="nm">{label}</span><span className="sm">{rel(it.summary)}</span>{diff ? <span className="diff"><span style={{ color: 'var(--done)' }}>+{diff.b}</span> <span style={{ color: 'var(--err)' }}>−{diff.a}</span></span> : null}</button>
    {open ? <div className="det">{fp ? <button className="chip" style={{ marginBottom: 6 }} onClick={() => onFile(fp)}><span>{fp.split('/').pop()}</span></button> : null}{diff ? <>{(it.input?.old_string as string).split('\n').map((l, i) => <div key={`a${i}`} style={{ color: 'var(--err)' }}>- {l}</div>)}{(it.input?.new_string as string).split('\n').map((l, i) => <div key={`b${i}`} style={{ color: 'var(--done)' }}>+ {l}</div>)}</> : JSON.stringify(it.input, null, 1).slice(0, 1200)}{it.result ? `\n\n${it.result}` : ''}</div> : null}</div>
}
/**
 * 접힌 기계 한 줄 — 「도구 7회 · 파일 3개」. 「A · 문서처럼」의 핵심 장치다.
 *
 * ⛔ **접힌 줄에 도구 이름을 늘어놓지 않는다.** 종전에는 `Read 3 · Bash 2 · Edit 1` 까지 한 줄에
 *    적었는데, 그 줄이 길어지는 만큼 대화가 로그가 된다. 접힌 상태에서 필요한 것은
 *    **«얼마나 했나»** 뿐이고, **«무엇을 했나»** 는 펼쳤을 때 답한다.
 * ⚠ 실패만은 접힌 채로도 말한다 — 조용히 접어 버리면 사람이 실패를 영영 못 본다.
 */
function ToolGroup({ items, onFile, base, endT }: { items: Tool[]; onFile: (p: string) => void; base?: string; endT?: number }) {
  const [open, setOpen] = useState(false)
  const fails = items.filter((t) => t.isError).length
  const running = items.some((t) => t.result === undefined)
  const files = new Set(items.map((t) => { const i = t.input ?? {}; const v = i.file_path ?? i.path ?? i.notebook_path; return typeof v === 'string' ? v : '' }).filter(Boolean))
  // 「얼마나 했나」의 마지막 한 조각 — 걸린 시간. 도는 중에는 안 적는다(진행 줄이 이미 세고 있다)
  const ms = !running && endT ? endT - items[0].t : 0
  const bits = machSummary(items.length, files.size, ms)
  return <div className="grp"><button className={`mach ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
    <Icon n={open ? 'chevd' : 'chev'} size={9} />
    {running ? <span className="spin" /> : null}
    <span className={`n${running ? ' flow' : ''}`}>{bits}</span>
    {fails ? <span className="bad">실패 {fails}</span> : null}
  </button>{open ? <div className="in">{items.map((t) => <ToolLine key={t.id} it={t} onFile={onFile} base={base} />)}</div> : null}</div>
}
function TodoWidget({ it, stopped }: { it: Extract<ChatItem, { kind: 'todos' }>; stopped: boolean }) {
  const [open, setOpen] = useState(true)
  const done = it.items.filter((x) => x.status === 'completed').length; const left = it.items.length - done
  if (!it.items.length || (left === 0 && !open)) return null
  const st = stopped && left > 0
  return <div className="todow"><button className="h" onClick={() => setOpen(!open)}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span style={{ color: 'var(--t2)' }}>작업 목록</span><span className="mono">{done}/{it.items.length}</span><span className={`bar ${st ? 'st' : ''}`}><i style={{ width: `${(done / it.items.length) * 100}%` }} /></span>{st ? <span style={{ color: 'var(--wait)' }}>멈춤</span> : null}</button>
    {open ? <div className="rows">{it.items.map((x, i) => <div key={i} className={`r ${x.status === 'completed' ? 'done' : x.status === 'in_progress' ? 'run' : 'wait'}`}>{x.status === 'completed' ? <Icon n="check" size={11} color="var(--t3)" /> : x.status === 'in_progress' ? (st ? <Icon n="pause" size={10} color="var(--wait)" /> : <span className="spin run" />) : <span className="empty" />}<span>{x.status === 'in_progress' && x.activeForm && !st ? x.activeForm : x.content}</span></div>)}</div> : null}
    {open && st ? <div className="ft">남은 {left}개는 진행되지 않았어요</div> : null}</div>
}

function FilePickModal({ bot, onClose, onPick }: { bot: Bot; onClose: () => void; onPick: (rel: string) => void }) {
  const [tree, setTree] = useState<{ name: string; rel: string; dir: boolean; mtime: number; children?: unknown[] }[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { void api<typeof tree>(`/bots/${bot.id}/files?depth=4`).then(setTree) }, [bot.id])
  const flat: { rel: string; mtime: number }[] = []
  const walk = (n: typeof tree) => { for (const x of n) { if (!x.dir) flat.push({ rel: x.rel, mtime: x.mtime }); if (x.children) walk(x.children as typeof tree) } }
  walk(tree)
  const list = flat.filter((f) => scoreName(q, f.rel.split('/').pop() ?? f.rel, f.rel) > 0).sort((a, b) => b.mtime - a.mtime).slice(0, 200)
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal" style={{ width: 'min(560px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{bot.orchestrator ? '볼트' : bot.name}에서 파일 고르기</b><small>고른 파일의 경로가 메시지에 붙고, 봇이 읽어요</small></div><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="search"><Icon n="search" size={13} /><input placeholder="파일 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="modal-b" style={{ maxHeight: '55vh' }}>{list.map((f) => <button key={f.rel} className="trow" style={{ ['--pad' as string]: '18px' }} onClick={() => onPick(f.rel)}><Icon n="doc" size={12} color="var(--t3)" /><span className="n">{f.rel}</span><time style={{ visibility: 'visible' }}>{fmtTime(f.mtime)}</time></button>)}{!list.length ? <div className="empty">파일이 없어요</div> : null}</div>
    </div>
  </>
}

function PermCard({ p, sid }: { p: PermissionRequest; sid: string }) {
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false)
  const [pick, setPick] = useState<Record<string, string>>({}); const [other, setOther] = useState('')
  const act = async (body: Record<string, unknown>, path: 'permission' | 'ask') => { setBusy(true); try { await api(`/sessions/${sid}/${path}`, { body: { requestId: p.requestId, ...body } }); setSent(true) } finally { setBusy(false) } }
  if (sent) return <div className="meta"><Icon n="check" size={11} color="var(--done)" /><span>보냈어요</span></div>
  if (p.ask) {
    const qs = (p.input.questions as { question?: string; header?: string; options?: { label?: string; description?: string }[]; multiSelect?: boolean }[] | undefined) ?? []
    const ready = qs.every((q, i) => pick[q.question ?? String(i)]) || !!other.trim()
    return <div className="card"><div className="lab">에이전트의 질문{qs[0]?.header ? ` · ${qs[0].header}` : ''}</div>
      {qs.map((q, i) => { const key = q.question ?? String(i); return <div key={i} style={{ display: 'flex', flexDirection: 'column' }}><div className="q">{q.question}</div>{(q.options ?? []).map((o) => <button key={o.label} className={`opt ${pick[key] === o.label ? 'on' : ''}`} onClick={() => setPick({ ...pick, [key]: o.label ?? '' })}><span className="r" /><div><div>{o.label}</div>{o.description ? <div className="d">{o.description}</div> : null}</div></button>)}<div className={`opt ${other ? 'on' : ''}`}><span className="r" style={{ marginTop: 7 }} /><input placeholder="기타 — 직접 입력…" value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && other.trim()) void act({ answers: { [key]: other.trim() } }, 'ask') }} /></div></div> })}
      <div className="btns"><button className="btn ghost" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>취소 ⎋</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={busy || !ready} onClick={() => act({ answers: other.trim() ? { [qs[0]?.question ?? 'answer']: other.trim() } : pick }, 'ask')}>보내기</button></div></div>
  }
  const i = p.input; const cmd = typeof i.command === 'string' ? i.command : typeof i.file_path === 'string' ? i.file_path : typeof i.url === 'string' ? i.url : JSON.stringify(i).slice(0, 400)
  const human = p.description || (typeof i.command === 'string' ? `명령을 실행합니다` : typeof i.file_path === 'string' ? `파일을 ${/Write|Edit/.test(p.toolName) ? '고칩니다' : '읽습니다'} — ${String(i.file_path).split('/').pop()}` : `${p.displayName} 를 씁니다`)
  return <div className="card"><div className="lab">권한 · {p.displayName}</div><div className="q">{human}</div><div className="cmd">{cmd}</div>
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => act({ allow: true }, 'permission')}>허용</button>{p.suggestions.length ? <button className="btn" disabled={busy} onClick={() => act({ allow: true, always: true }, 'permission')}>이 세션에서 항상 허용</button> : null}<button className="btn ghost" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>거부</button></div></div>
}
