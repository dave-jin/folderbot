import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Bot, ChatItem, NotifyEvent, PermissionMode, PermissionRequest, RoutineDef, SessionInfo, SessionState, SlashCmd } from '../core/types'
import { api, setToken, token, uploadFile } from './api'
import { FolderBot, Icon, Mid, moodOf } from './FolderBot'
import { holdHeader, holdLine, holderOf, type Holder } from '../core/waiting'
import { AskHost, ConfirmHost, DiffHost, FolderPicker, Md, NotifyCenter, Onboarding, Pairing, RoutineSheet, Settings, askConfirm, askName, showDiff, useToast } from './Sheets'
import { AgentPickHost, pickAgent } from './AgentPick'
import type { SecId } from './Settings'
import { VendorMark } from './Brand'
import { Float } from './Float'
import { DocPane, useDocs } from './Doc'
import { Elapsed, Panel, type SecH } from './Panel'
import { machSummary } from '../core/chat'
import { buildRows, type ChatRow } from '../core/chatRows'
import { splitAttach } from '../core/attach'
import { chipParts } from '../core/chipName'
import { InlineInput, type InlineInputHandle } from './InlineInput'
import { norm, scoreName } from '../core/search'
import { fmtTime, useStore } from './store'
import { ACT_ICON, FOLDER_SWIPE, type SwipeAct } from './swipe'
import { CopyProgressHost } from './fileCopy'
import { attachRoom } from '../core/attach'
import { applyViewport, planViewport } from '../core/viewport'
import { canStartSwipe, dragProgress, lockOf, scrollableEats, stageOf, swipeVerdict } from '../core/drawer'
import { curOf, dismiss, goTo, navInit, type Nav, type Page } from '../core/navstack'
import { botUnread, shouldMarkRead } from '../core/unread'
import { clampDockOffset, isDockDrag, readDockOffset } from '../core/dock'
import { tabActive } from '../core/tabbar'
import { SwipeRow } from './SwipeRow'
import { dueChip } from '../core/botName'
import { LocalOpenHost, localBridge, openOnThisDevice, useLocalSettings } from './localOpen'
import { botRelOf } from '../core/paths'
import { ICON_PX, useIconSize, useTheme } from './theme'
import { UsageCard, UsageStrip, useUsage } from './Usage'
import { PermGate, usePerms } from './Perms'
import { Palette } from './Palette'
import { MODES, effortLabel, effortsFor, fmtK, modeLabel, modelLabel, modelsFor, moreModelsFor, onModels, refreshModels } from './consts'
import { rulesLabel } from '../core/permPolicy'
import { DEFAULT_EFFORT, DEFAULT_MODEL } from '../core/agents'
import { cronFromText, routineName } from '../core/routineText'
import { BARE_URL_RE, faviconHost } from '../core/favicon'
import { workLabel, workMood } from '../core/work'
import { GLOBE, faviconNow, onFavicon } from './favicons'
import { hoverable, hoverRef } from './previews'
import { copySay } from './clip'

type Tool = Extract<ChatItem, { kind: 'tool' }>
type Sub = Extract<ChatItem, { kind: 'subagent' }>
type Att = { rel: string; abs: string; dir?: boolean; uploaded?: boolean; name?: string; uploading?: boolean; /** N-3 · 올리는 진행(%) · 미리보기 · 크기 */ pct?: number; thumb?: string; size?: number }
/** 이 기기가 마지막에 보던 폴더·세션 — 앱을 다시 켤 때 그 자리로 돌아간다 */
const LAST_KEY = 'fb:last'
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
      /**
       * 🔴 계산은 core/viewport.planViewport **한 함수** (I-2 · O · P-4). `position:fixed` 인 것들(시트·백드롭)은 레이아웃 뷰포트
       *    바닥에 붙으므로 키보드가 먹은 높이를 `--kbh` 로 내보낸다(스모크가 «저장 버튼이 키보드 밑에 묻힌다» 로 잡았다).
       * P-4 · 키보드가 열린 채 당겨 문서가 밀렸으면(scrollY > 0) 되돌린다 — 주 대책은 html/body overflow:hidden 이고 이건 보험
       */
      const plan = planViewport(editing, vv, window.innerHeight, window.scrollY)
      const open = plan.open
      applyViewport(plan, document.documentElement.style, (x, y) => window.scrollTo(x, y))
      /**
       * 🔴 **화장에도 문턱을 쓰지 않는다** (2026-09-13 Dave 4차 스크린샷 — 이 문턱의 네 번째 사고).
       * 종전엔 «키보드가 140px 이상 먹었을 때만» 머리·모델 칩을 접었다. 그런데 레이아웃 뷰포트까지 함께
       * 줄어드는 판(홈 화면 앱 · 타사 키보드)에서는 `innerHeight − vv.height` 가 **0** 이라 그 문턱이
       * «안 열렸다» 로 떨어진다. 그래서 칩이 그대로 남고 `.chat-foot` 이 `--sab`(홈 인디케이터 34pt)까지
       * 계속 비워 둬 **입력창과 키보드 사이가 통째로 떴다.** 그 34pt 는 이미 키보드가 덮은 자리다.
       * 판정은 레이아웃 때와 같은 하나뿐이다 — **입력 중이냐.**
       */
      setKb(open)
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
  useEffect(() => { void refreshModels() }, [])
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
  { k: '⌘[ ⌘]', t: '뒤로 · 앞으로', d: '방문한 폴더·세션 순서대로 — 알림·칩으로 뛴 뒤 돌아오기' },
  { k: '⌥⌘[ ⌥⌘]', t: '이전 · 다음 폴더', d: '레일 순서대로' },
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

interface DesktopBridge { version?: string; onCmd?: (cb: (c: string) => void) => () => void; pathOf?: (f: File) => string; update?: { state: () => Promise<UpdState>; check: () => Promise<UpdState>; apply: () => void; onChange: (cb: (st: UpdState) => void) => () => void } }
const desk = (window as unknown as { folderbotDesktop?: DesktopBridge }).folderbotDesktop
const isDesktop = typeof desk !== 'undefined'

/** 자기 업데이트 — 셸(Electron)이 받아 두고, 여기서는 상태를 보여 주고 «재시작» 만 누른다 */
/**
 * 🔴 **업데이트는 받아만 두고, 적용은 묻는다** (2026-09-15 Dave: *«자동업데이트 하지말고 다운로드가 끝난뒤에
 *    업데이트 여부를 물어보기만 해줘. 좌측하단에 버전메뉴에서 팝업으로»*).
 *    셸(updater.js)은 이제 어느 모드에서도 스스로 적용하지 않는다. 다 받으면 이 훅이 **버전 칩 위 팝업**을 한 번
 *    연다(`ask`) — 누르는 건 사람이다. 「나중에」 하면 칩만 초록으로 남고, 칩을 누르면 같은 팝업이 다시 뜬다.
 */
function useUpdate(say: (m: string) => void): [UpdState | null, () => void, () => void, string, (v: string) => void] {
  const [st, setSt] = useState<UpdState | null>(null)
  const [ask, setAsk] = useState('')          // 팝업을 열어 둘 버전 — '' 이면 닫힘
  const readyRef = useRef('')
  useEffect(() => {
    const u = desk?.update; if (!u) return
    const seen = (n: UpdState) => { setSt(n); if (n.staged?.ready && readyRef.current !== n.staged.version) { readyRef.current = n.staged.version; setAsk(n.staged.version) } }
    void u.state().then(seen).catch(() => {})
    return u.onChange(seen)
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
  const apply = () => { const u = desk?.update; if (!u || !st?.staged?.ready) return; setAsk(''); u.apply() }
  return [st, check, apply, ask, setAsk]
}
/** 버전 칩 위 팝업 — «받아 뒀어요, 적용할까요?» 한 장. 돌고 있는 세션 수는 여기서 말한다(적용하면 끊긴다) */
function UpdateAsk({ st, onApply, onLater }: { st: UpdState; onApply: () => void; onLater: () => void }) {
  // ⚠ 레일은 overflow 로 잘린다 — 팝업은 칩 자리를 재서 **화면 좌표(fixed)** 로 띄운다 (오늘 아침 미리보기 카드와 같은 교훈)
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 12, bottom: 48 })
  useEffect(() => { const el = document.querySelector('.sb-foot .bd.upd'); if (el) { const r = el.getBoundingClientRect(); setPos({ left: Math.max(8, r.left), bottom: Math.max(8, window.innerHeight - r.top + 8) }) } }, [])
  if (!st.staged?.ready) return null
  return <div className="updask" role="dialog" style={{ position: 'fixed', left: pos.left, bottom: pos.bottom }}>
    <div className="t"><b>v{st.staged.version} 을 받아 두었어요</b><small>지금 v{st.current}</small></div>
    {st.staged.notes ? <div className="notes">{st.staged.notes.split('\n').slice(0, 4).join('\n')}</div> : null}
    <div className="warn">{st.busy > 0 ? `적용하면 돌고 있는 세션 ${st.busy}개가 끊겨요 — 끝난 뒤에 하는 게 좋아요` : '지금 돌고 있는 세션은 없어요'}</div>
    <div className="btns"><button className="btn ghost" onClick={onLater}>나중에</button><button className="btn on" onClick={onApply}>지금 재시작해서 적용</button></div>
  </div>
}
function UpdateChip({ version, st, onCheck, onApply }: { version: string; st: UpdState | null; onCheck: () => void; onApply: () => void }) {
  if (!isDesktop || !st) return <button className="bd mono upd" onClick={onCheck} title={isDesktop ? '업데이트 확인' : '호스트 버전'}>v{version}</button>
  // ⚠ 준비된 칩을 누르면 **묻는 팝업**이 뜬다 — 바로 갈아끼우지 않는다 (2026-09-15 Dave)
  if (st.staged?.ready) return <button className="bd upd" style={{ color: 'var(--done)' }} onClick={onApply} title={`v${st.staged.version} 준비됨 — 눌러서 적용할지 정하기`}><span className="dot done" style={{ width: 5, height: 5 }} />v{st.staged.version} · 적용</button>
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
  /**
   * H · 어느 단계인지는 **창 폭으로만** 정한다(2026-09-19 Dave 시안 확정) — 넓음 ≥1200 · 중간 768–1199 · 좁음 <768. 「폰이냐」는 안 따진다.
   * 중간·좁음에서 양쪽 패널은 채팅을 **밀지 않고 덮는다**(overlay) — 밀면 글이 다시 흘러 B 같은 흔들림이 또 난다.
   */
  const winW = useWinW(); const stage = stageOf(winW); const narrow = stage !== 'wide'; const phone = stage === 'narrow'; const mid = stage === 'mid'; const kb = useKeyboard()
  const [iconSz] = useIconSize() // 레일 폴더봇 크기 — 설정에서 고른다(--fbi 도 함께 나간다)
  /**
   * Z-2 · **화면은 칸이 아니라 «온 길»(스택)이다** (2026-09-22 Dave 확정 · A Safari 모델). 지금 보는 쪽은 `view`
   * 하나로 읽고, 옮길 때는 `setView`(그 쪽으로) 와 `toList`(봇 목록으로) 둘만 쓴다.
   * 🔴 **AD(2026-09-23)** — 폰에서는 **👉 쓸기·모든 좌상단 버튼이 전부 `toList` 하나**다. 앞으로 가는 길은 하단 탭이 맡는다.
   *    Z-2 의 «온 길 되짚기»(back/forward)는 길이 둘이 되는 걸 막으려고 **걷어냈다** — 스택은 `dismiss` 가 쓰는 기록으로만 남는다.
   */
  const [nav, setNav] = useState<Nav>(() => navInit(!!hash.bot || stageOf(window.innerWidth) !== 'narrow'))
  const view = curOf(nav)
  const setView = (p: Page) => setNav((n) => goTo(n, p))
  /** AD · **모든 화면의 좌상단·👉 = 봇 목록** (2026-09-23 Dave: *«무조건 폴더 리스트로 가도록 통일»*) */
  const toList = () => setView('list')
  /**
   * 🔴 **AG · 봇 목록은 «있던 화면» 위로 미끄러진다** (2026-09-24 Dave: *«왼쪽 슬라이딩 메뉴는 그 위치에서 나와야 하는데
   *    지금은 채팅창에서 슬라이딩이 나온다»*). `view` 가 하나뿐이라 목록으로 가는 순간 문서·폴더 서랍이 **먼저 사라지고**
   *    그 밑의 채팅이 드러난 뒤 목록이 덮였다 — 눈에는 «엉뚱한 화면으로 한 번 갔다 오는» 것으로 보인다.
   *    그래서 **밑에 깔린 화면**(`under`)을 따로 들고 있다가 목록이 열려도 그대로 둔다.
   */
  const underRef = useRef<'chat' | 'panel' | 'doc'>('chat')
  if (view !== 'list') underRef.current = view
  const under = view === 'list' ? underRef.current : view
  /** 어두워진 채팅 탭 · Esc · [접기] — «채팅으로 돌아가기». 「뒤로」와 갈라 둔다(봇 목록은 뒤로 열고 폴더·문서는 앞으로 열기 때문) */
  const navDismiss = () => setNav(dismiss)
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
  const [toast, say] = useToast()
  const [prefill, setPrefill] = useState('')
  const [attachReq, setAttachReq] = useState<Att[]>([])
  const [mentionReq, setMentionReq] = useState<string[]>([])
  const [focusReq, setFocusReq] = useState(0)
  const [focusSec, setFocusSec] = useState<{ sec: string; n: number } | null>(null)
  const [upd, updCheck, updApply, updAsk, setUpdAsk] = useUpdate(say)
  /**
   * 🔴 **파일을 엉뚱한 데 놓아도 앱이 그 파일로 떠나지 않는다** (2026-09-15 Dave: «finder 에서 파일 드래그 & 드롭도
   *    되어야 하는데 지금 기능이 안되는것 같더라고»). 크롬은 놓을 자리가 아닌 곳에 파일을 놓으면 창을 통째로
   *    그 파일(file://)로 옮긴다 — Folder Bot 이 그 자리에서 사라지는 것이 «안 된다» 의 정체였다.
   *    창 전체에서 기본 동작을 막고, 놓을 자리(채팅 열)는 Chat 이 따로 받는다.
   */
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', stop); window.addEventListener('drop', stop)
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop) }
  }, [])
  const docs = useDocs(bot?.id ?? '')
  useEffect(() => { if (sessionId && !s.chats[sessionId]) void loadChat(sessionId) }, [sessionId])
  useEffect(() => { if (bot) void loadTodo(bot.id) }, [bot?.id, s.filesTick[bot?.id ?? '']])
  /** 내가 놓은 해시인가 — 밖(셸의 알림 배너)에서 온 해시와 가르는 표식 (S-2). 내 걸음은 화면(칸)을 이미 스스로 챙긴다 */
  const navSelf = useRef(false)
  const setHashSelf = (p: Record<string, string>) => { navSelf.current = true; setHash(p) }
  const go = (b: string, sid?: string) => { setHashSelf(sid ? { bot: b, s: sid } : { bot: b }); setView('chat') }
  /**
   * 🔴 **대기 메시지는 «그 세션의 것»이다** (2026-09-15 Dave: *«que 메시지를 보내놓은 상태에서 다른
   *    폴더를 띄우면 거기에 큐 메시지가 전달되는 버그»*).
   *
   * 종전에는 대기열이 대화 화면(`Chat`)의 지역 상태였다. 폴더를 바꿔도 그 컴포넌트는 그대로 살아 있고
   * 세션만 갈리는데, 「세션이 바뀌면 비운다」 는 이펙트와 「한가해지면 보낸다」 는 이펙트가 **같은 commit
   * 에서** 돈다 — 비우기는 다음 렌더에나 반영되므로, 그사이 **옛 대기열이 새 폴더의 세션으로 나갔다.**
   *
   * 그래서 대기열을 여기(부모)로 올리고 **세션 id 를 열쇠로** 담는다. 보내는 일도 여기서 한다:
   * 세션이 한가해지면 **보고 있지 않아도** 그 세션으로 나간다(대기열의 존재 이유가 그것이다).
   * ⚠ 한 세션에 **한 번에 하나만** 내보낸다(`flushing`) — 두 개가 겹치면 순서가 뒤집힌다.
   * ⚠ 세션이 사라졌으면 조용히 버린다 — 지운 대화로는 보낼 곳이 없다.
   */
  const [queues, setQueues] = useState<Record<string, string[]>>({})
  const flushing = useRef<Set<string>>(new Set())
  const allSessions = useMemo(() => Object.values(s.sessionsByBot).flat(), [s.sessionsByBot])
  useEffect(() => {
    for (const [sid, list] of Object.entries(queues)) {
      if (!list.length || flushing.current.has(sid)) continue
      const info = allSessions.find((x) => x.id === sid)
      if (!info) { setQueues((q) => { const { [sid]: _gone, ...rest } = q; return rest }); continue }
      if (info.state === 'running' || info.state === 'awaiting_input') continue
      flushing.current.add(sid)
      const [next, ...rest] = list
      setQueues((q) => ({ ...q, [sid]: rest }))
      void api(`/sessions/${sid}/send`, { body: { text: next } })
        .catch((e) => say((e as Error).message))
        .finally(() => flushing.current.delete(sid))
    }
  }, [queues, allSessions])
  const queueFor = (sid?: string): string[] => (sid ? queues[sid] ?? [] : [])
  const onQueue = (sid: string, f: (q: string[]) => string[]) => setQueues((qs) => ({ ...qs, [sid]: f(qs[sid] ?? []) }))
  /**
   * 🔴 **껐다 켜면 마지막에 보던 폴더에서 시작한다** (2026-09-15 Dave: «마지막으로 작업했던 프로젝트도
   *    기억하고 그 창에서 시작되면 좋겠어»). 셸은 창을 띄울 때 주소를 **해시 없이** 연다 —
   *    그래서 매번 오케스트레이터로 떨어졌다. 어디에 있었는지는 **기기마다** 다르므로 이 기기에 적어 둔다
   *    (호스트에 두면 폰에서 연 폴더가 맥의 첫 화면을 바꾼다).
   * ⚠ 되돌리기는 **앱을 연 직후 한 번**뿐이다(`restored`) — 나중에도 계속 끌어당기면 사람이 나가려는
   *   화면을 앱이 붙잡는다.
   * ⚠ 그때 없어진 폴더(덜어내기·은퇴)면 **아무 일도 안 한다** — 비어 있는 대화로 들어가느니 기본 화면이 낫다.
   * ⚠ 폰은 첫 화면(Home)에 그대로 머문다 — `view` 는 해시가 아니라 `go()` 가 옮기고, 여기서는 해시만 놓는다.
   */
  /**
   * 🔴 **셸이 보내는 `#notify=1` 로도 알림 센터가 열린다** (2026-09-15 — 실측으로 드러난 구멍).
   *    트레이의 「알림 센터」와 옛 메뉴는 `location.hash = 'notify=1'` 을 쓰는데 **화면이 그 열쇠를
   *    아예 안 읽고 있었다** — 아무 일도 안 일어나고, 게다가 해시가 통째로 갈려 **보던 폴더까지 잃었다.**
   * ⚠ 그래서 열면서 **마지막 폴더로 되돌려 놓는다**(이 기기가 적어 둔 그 자리 · `LAST_KEY`).
   */
  useEffect(() => {
    if (!hash.notify) return
    setModal('notify')
    let back: Record<string, string> = {}
    try { const l = JSON.parse(localStorage.getItem(LAST_KEY) ?? '') as { bot?: string; s?: string }; if (l?.bot) back = l.s ? { bot: l.bot, s: l.s } : { bot: l.bot } } catch { /* 처음 켠 기기 */ }
    setHashSelf(back)
  }, [hash.notify])
  /**
   * 🔴 **뒤로/앞으로 = 방문 히스토리** (루프 2/10 · 2026-09-15). 종전의 `⌘[ ⌘]` 는 «레일의 이전·다음 폴더»
   *    였다 — 알림·칩으로 여기저기 뛴 뒤 «아까 거기» 로 돌아올 길이 없었다. 브라우저의 뒤로 가기와 같은 뜻으로
   *    고치고, 폴더 순환은 `⌥⌘[ ⌥⌘]` 로 물린다.
   * ⚠ 한 항목은 «폴더+세션» 이다 — 같은 폴더의 다른 세션도 한 걸음이다.
   * ⚠ 뒤로 갔다가 새로 다른 곳으로 가면 앞쪽 가지는 버린다(브라우저와 같다). 같은 곳을 연달아 밟으면 안 쌓는다.
   */
  const hist = useRef<{ list: string[]; i: number; nav: boolean }>({ list: [], i: -1, nav: false })
  useEffect(() => {
    if (!hash.bot) return
    const key = `${hash.bot}|${hash.s ?? ''}`
    const h = hist.current
    if (h.nav) { h.nav = false; return }                       // 히스토리로 옮긴 걸음은 다시 안 쌓는다
    if (h.list[h.i] === key) return
    h.list = h.list.slice(0, h.i + 1); h.list.push(key); if (h.list.length > 100) h.list.shift(); h.i = h.list.length - 1
  }, [hash.bot, hash.s])
  /**
   * S-2 · **밖에서 해시만 갈아끼워도 화면이 따라간다** (2026-09-21 Dave: «알림 버튼을 클릭했을 때 해당 세션으로 이동하는 문제»).
   * 🔴 실측 원인: 앱 **안**의 벨은 `go()` 라 보이는 칸까지 바꾸지만, **맥 알림 배너**는 셸이 `location.hash` 만 놓는다
   *    (`desktop/main.js` 의 `navigate`). 좁음·중간에서는 서랍·홈이 덮인 채라 **뒤에서 폴더만 바뀌고 화면은 그대로** —
   *    누른 사람 눈에는 «아무 일도 안 일어남» 이다. H 의 서랍이 생기면서 더 잘 드러났다.
   * ⚠ 내가 옮긴 걸음(`go`)은 이미 `setView('chat')` 을 한다 — 여기서는 **값이 실제로 바뀐 해시**만 받는다(첫 렌더 포함).
   */
  const seenHash = useRef('')
  useEffect(() => {
    const key = `${hash.bot ?? ''}|${hash.s ?? ''}`
    if (seenHash.current === key) return
    const first = !seenHash.current, self = navSelf.current
    seenHash.current = key; navSelf.current = false
    if (!first && !self && hash.bot && narrow) setView('chat')
  }, [hash.bot, hash.s, narrow])
  const histGo = (dir: -1 | 1) => {
    const h = hist.current; const j = h.i + dir
    if (j < 0 || j >= h.list.length) return
    h.i = j; h.nav = true
    const [b, sid] = h.list[j].split('|')
    setHashSelf(sid ? { bot: b, s: sid } : { bot: b }); setView('chat')
  }
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !s.bots.length) return
    restored.current = true
    if (hash.bot) return
    try {
      const l = JSON.parse(localStorage.getItem(LAST_KEY) ?? '') as { bot?: string; s?: string; view?: string }
      if (l?.bot && (l.bot === 'orch' || s.bots.some((b) => b.id === l.bot))) {
        setHashSelf(l.s ? { bot: l.bot, s: l.s } : { bot: l.bot })
        /**
         * 🔴 **폰은 화면도 되돌린다** (2026-09-17 Dave: «모바일에서 화면으로 들어가면 마지막 화면이 저장이 안되네»).
         *    `view` 의 초기값은 첫 렌더의 해시로 정해지는데, 해시는 **이 효과가 뒤늦게** 넣는다 — 그래서 폴더는 돌아와도
         *    화면은 «목록» 에 남았다. 마지막에 보던 화면(대화·문서)으로 함께 되돌린다.
         */
        // H · 마지막 화면을 기기별로 기억한다. Z-2 · 그 쪽 하나가 아니라 **거기까지의 온 길**을 세운다 — 되돌아와도 👉 가 제 길로 간다
        if (narrow) { const p = (l.view === 'doc' || l.view === 'panel' || l.view === 'list' ? l.view : 'chat') as Page; setNav(goTo(navInit(true), p)) }
      }
    } catch { /* 처음 켠 기기 */ }
  }, [s.bots.length])
  useEffect(() => { if (hash.bot) try { localStorage.setItem(LAST_KEY, JSON.stringify({ bot: hash.bot, s: sessionId ?? '', view })) } catch { /* */ } }, [hash.bot, sessionId, view])
  const unread = s.notifications.filter((n) => !n.read).length
  const waiting = s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length
  const showDoc = !!bot && (narrow || !!docOpen[bot.id]) && docs.tabs.length > 0   // 넓음은 열 접기(docOpen) · 중간·좁음은 서랍이 열림/닫힘을 맡는다
  const openDoc = (rel: string, pin = false) => { if (!bot) return; docs.open(rel, pin); setDocOpen((d) => ({ ...d, [bot.id]: true })); if (narrow) setView('doc') }
  /**
   * 🔴 **문서 창으로 가는 문은 하나다** — `openInDocPane` (C · 2026-09-19 Dave: «채팅에서 문서를 클릭했는데 문서 창이 닫혀 있으면
   *    열리지 않는다»). 실측 원인은 창이 아니라 **경로**였다: 답변 속 칩은 봇 기준 rel 을 주는데 받는 쪽이 절대경로만 받아
   *    `relOf()` 가 null 을 돌려주고 클릭이 조용히 죽었다(pdf·md·png·폴더 밖 전부, 창 열림/닫힘 무관). 그래서 절대경로든
   *    rel 이든 여기서 한 번 풀고(볼트 안·폴더 밖은 `../` 로 — D), 창이 닫혀 있으면 연다. 볼트 밖은 거부한다.
   *  - 사용자 클릭은 언제나 연다. 에이전트(rondo_open)는 **한 턴에 한 번**만 — 방금 손으로 닫은 창을 연달아 다시 여는
   *    짜증을 막는다(같은 세션·같은 턴이면 두 번째부터 무시).
   */
  const agentOpenRef = useRef<string | null>(null)
  const openInDocPane = (p: string, o: { pin?: boolean; source?: 'user' | 'agent'; turnKey?: string } = {}) => {
    if (!bot) return
    let rel = p
    if (p.startsWith('/')) {
      const r = botRelOf(bot.abs, s.root, p)
      if (r === null) { say('볼트 밖 경로예요 — 문서 창에서는 볼트 안 파일만 열어요'); return }
      if (r === '') return
      rel = r
    }
    if (o.source === 'agent' && o.turnKey) { if (agentOpenRef.current === o.turnKey) return; agentOpenRef.current = o.turnKey }
    openDoc(rel, o.pin)
  }
  // 파일명만 적힌 칩이 여러 곳에 있을 때 — 고르기 (G)
  const [pickFile, setPickFile] = useState<{ name: string; rels: string[] } | null>(null)
  useEffect(() => { const f = (e: Event) => setPickFile((e as CustomEvent).detail as { name: string; rels: string[] }); window.addEventListener('fb:pickfile', f); return () => window.removeEventListener('fb:pickfile', f) }, [])
  // 에이전트의 rondo_open / rondo_reveal — 지금 보고 있는 봇의 것만 (J 에서 «보낸 기기» 로 좁힌다)
  useEffect(() => {
    const r = s.docReq; if (!r || !bot || r.botId !== bot.id) return
    // J-3 · 요청이 온 기기만 연다 — 호스트(main)는 'host', 원격은 그 기기 이름. 내 것이 아니면 아무것도 안 뜬다
    if (r.device && r.device !== (s.device.main ? 'host' : s.device.name)) return
    if (r.action === 'open') openInDocPane(r.rel, { source: 'agent', turnKey: `${r.sid}:${r.turn}` })
    else void openOnThisDevice(bot, r.rel, 'reveal', { main: s.device.main, hostName: s.hostName, phone, say })
  }, [s.docReq?.n])
  const addAttach = (a: Att) => { setAttachReq((q) => [...q, { ...a, abs: a.abs || `${bot?.abs}/${a.rel}` }]); if (narrow) setView('chat') }
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
  // A · 오케스트레이터가 `bots_reorder` 로 순서를 바꾸면 **이 기기의 정렬을 «직접» 으로 자동 전환**한다 (2026-09-19 Dave 추천안 승인).
  //   안 그러면 기본값 «이름» 인 기기에서는 도구가 바꾼 차례가 **아예 안 보인다** — 도구는 성공했다는데 화면은 그대로.
  const railReorderSeen = useRef(0)
  useEffect(() => { if (s.railReorder > railReorderSeen.current) { const first = railReorderSeen.current === 0; railReorderSeen.current = s.railReorder; if (!first || railSort !== 'manual') { setRailSort('manual'); say('오케스트레이터가 레일 순서를 바꿨어요 — 정렬을 «직접» 으로 두었어요') } } }, [s.railReorder]) // eslint-disable-line react-hooks/exhaustive-deps
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
    try { await api('/bots/reorder', { body: { ids: flat, moved: from } }); await refresh() } catch (e) { say((e as Error).message) }
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
    // 🔴 고정한 봇은 제 섹션이 아니라 맨 위 「고정」 칸에 선다 (루프 3/10) — 정렬 갈래와 무관하다
    for (const it of items) { const k = it.b.pinned ? '고정' : it.b.section; (m.get(k) ?? m.set(k, []).get(k)!).push(it) }
    const top = (a: string) => (a === '관제' ? 0 : a === '고정' ? 1 : 2)
    const secs = [...m.entries()].sort(([a], [b]) => top(a) - top(b) || cmp(a, b))
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
  const sbOpen = !narrow && lay.sbOpen; const rpOpen = !narrow && lay.rpOpen   // 중간·좁음은 흐름 안 패널이 없다 — 서랍(view)뿐
  // 창에 맞춘 실제 폭 — 저장값(lay)은 그대로 두고 그리는 값만 줄인다. 부족분은 문서 → 오른쪽 패널 → 왼쪽 목록 순으로 양보 (대화 열이 먼저 산다)
  const fit = useMemo(() => {
    let sb = sbOpen ? lay.sb : STRIP_W, rp = rpOpen ? lay.rp : STRIP_W, doc = showDoc && !wide && !phone ? lay.doc : 0
    let over = sb + rp + doc + 3 + CHAT_MIN - winW
    if (over > 0 && doc) { const d = Math.min(over, doc - DOC_MIN); doc -= d; over -= d }
    if (over > 0 && rpOpen) { const d = Math.min(over, rp - SIDE_MIN); rp -= d; over -= d }
    if (over > 0 && sbOpen) { const d = Math.min(over, sb - SIDE_MIN); sb -= d; over -= d }
    return { sb, rp, doc }
  }, [lay.sb, lay.rp, lay.doc, sbOpen, rpOpen, showDoc, wide, phone, winW])
  const openRp = (sec?: string) => { if (narrow) setView('panel'); else setLay((l) => ({ ...l, rpOpen: true, rpPin: true })); if (sec) setFocusSec({ sec, n: Date.now() }) }
  /**
   * 폴더 칩 → **트리에서 그 폴더를 편다** (2026-09-15 Dave: «채팅 본문에서 폴더 및 파일 칩»). 폴더는 읽을 글이
   * 없으니 문서 탭이 아니라 파일 칸이다. `../` 로 봇 폴더 밖(볼트 안)이면 오케스트레이터의 트리로 간다.
   * ⚠ 트리는 `fb:reveal` 이벤트로 듣는다(Panel.tsx) — 화면을 바꾼 직후에는 트리가 아직 없으므로 한 박자 뒤에 쏜다.
   */
  const reveal = (rel: string) => {
    const fire = (r: string) => window.dispatchEvent(new CustomEvent('fb:reveal', { detail: r }))
    const showFiles = () => { setFocusSec({ sec: 'files', n: Date.now() }); if (narrow) setView('panel'); else setLay((l) => ({ ...l, rpOpen: true, rpPin: true })) }
    if (!rel.startsWith('..')) { showFiles(); fire(rel); return }
    const parts = [...(bot?.rel ? bot.rel.split('/') : [])]
    for (const seg of rel.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg) }
    const vrel = parts.join('/')
    go('orch'); window.setTimeout(() => { showFiles(); fire(vrel) }, 450)
  }
  /** 할 일 칸 → 그 폴더의 「할 일」 로. 폰은 패널 화면으로 넘어가고, 맥은 오른쪽 패널을 편다 */
  const goTodo = (botId: string) => { go(botId); setFocusSec({ sec: 'todo', n: Date.now() }); if (narrow) setView('panel'); else setLay((l) => ({ ...l, rpOpen: true, rpPin: true })) }
  const closeRp = () => { if (narrow) navDismiss(); else setLay((l) => ({ ...l, rpOpen: false, rpPin: false })) }
  const openSb = () => { if (narrow) setView('list'); else setLay((l) => ({ ...l, sbOpen: true, sbPin: true })) }; const closeSb = () => { if (narrow) navDismiss(); else setLay((l) => ({ ...l, sbOpen: false, sbPin: false })) }
  /**
   * H-2 · 쓸기 — 「세 칸 띠」. 판정은 전부 `core/drawer`(순수 · 유닛). 여기서는 손가락이 어디서 시작했는지와 서랍을 손가락에 붙이는 일만.
   * ⛔ 터치 지점이 있는 기기에서만(트랙패드 두 손가락은 wheel 이라 애초에 여기 안 온다) · 글 고르는 중 아님 · 입력칸·칩·발판·메뉴·쓸리는 행 위 아님.
   * ⛔ 코드 블록·표·확대 이미지(`data-consume-x`) 위에서 시작한 가로 끌기는 그 요소가 먹는다 — 끝까지 스크롤한 뒤에야 서랍.
   * ⛔ 첫 10px 이 세로면 끝까지 스크롤이다(|dx| > 2|dy| 일 때만 쓸기).
   */
  const coarse = useMedia('(pointer: coarse)') || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || isDesktop
  /**
   * V · **독을 잡아 위아래로 옮긴다** (2026-09-22 Dave). 자리는 «가운데에서 얼마나» 로 기기에 남고, 그릴 때마다 화면 안으로 가둔다(`core/dock`).
   * ⚠ 탭과 갈라야 한다 — 6px 를 안 넘긴 끌기는 «누른 것» 이라 단추가 제 일을 한다(`isDockDrag`).
   * ⚠ 독의 포인터는 서랍 쓸기로 새면 안 된다(`stopPropagation`) — 독을 잡고 세로로 끄는 동안 채팅이 넘어가면 안 된다.
   */
  /**
   * Z·AD · 폰 **하단 탭**. 2026-09-22 에 「내리면 숨음」으로 만들었다가 2026-09-23 Dave 지시로 **고정**했다 —
   * *«사라지더라도 실제 채팅창이 고정되어 있으니까 의미가 없어»*. 숨어서 버는 자리가 없으면 깜빡임만 남는다.
   * 탭이 없는 때는 둘뿐이다 — **봇 목록**(갈 곳이 목록 자체다)과 **키보드**(입력칸을 가린다).
   */
  /** AD · 폰의 「할 일」과 「폴더」는 **다른 화면**이다 (2026-09-23 Dave) — 같은 서랍을 쓰되 보여 주는 절이 다르다 */
  const [panelTab, setPanelTab] = useState<'todo' | 'files'>('files')
  /**
   * 🔴 **AE (2026-09-23 Dave) — 탭은 채팅·문서·폴더 어디서도 사라지면 안 된다.**
   *    종전 조건이 `!kb` 였는데, `kb` 는 «입력 중이냐» **하나로** 정해진다(그 판정은 사고 4건이 걸린 자리라 안 건드린다).
   *    그런데 **문서를 열면 CodeMirror 가 스스로 초점을 가져간다**(Y 라운드에서 본 그 버릇) — 사람은 아무것도 안 쳤고
   *    키보드도 안 올라왔는데(`--kbh: 0px`) 앱은 «입력 중» 으로 읽어 **문서 화면의 탭이 통째로 사라졌다.**
   *    탭이 숨을 이유는 하나뿐이다 — **키보드가 입력칸을 가리는 채팅 화면**. 문서·폴더에는 입력칸이 없으므로 숨을 이유가 없다.
   */
  const tabsHere = phone && view !== 'list' && !(kb && view === 'chat')
  const dockRef = useRef<HTMLDivElement>(null)
  const [dockY, setDockY] = useState(() => { try { return readDockOffset(localStorage.getItem('fb:docky')) } catch { return 0 } })
  const [dockDrag, setDockDrag] = useState(false)
  const dockG = useRef<{ id: number; y0: number; base: number; moved: boolean } | null>(null)
  const dockFit = (v: number) => clampDockOffset(v, window.innerHeight, dockRef.current?.getBoundingClientRect().height ?? 160)
  useEffect(() => { const f = () => setDockY((v) => dockFit(v)); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  /* 🔴 **끌기는 창에서 듣는다.** 손잡이는 독의 **맨 위**라 위로 조금만 끌면 손가락이 곧바로 독 밖으로 나간다 —
     요소에 건 `onPointerMove` 는 그 순간 끊겨 **독이 아예 안 움직인다**(실측).
     ⛔ 대신 `setPointerCapture` 를 누르자마자 걸지 마라 — 그러면 독 **단추의 클릭이 사라진다**(실측: H 중간 판 «독 📁» 가 안 열렸다).
     그래서 창(window)에 듣고, 6px 문턱을 넘은 뒤에만 자리를 옮긴다. */
  const dockOff = useRef<(() => void) | null>(null)
  useEffect(() => () => dockOff.current?.(), [])
  const dockDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || dockG.current) return
    e.stopPropagation()
    const g = { id: e.pointerId, y0: e.clientY, base: dockY, moved: false }
    dockG.current = g
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id) return
      const dy = ev.clientY - g.y0
      if (!g.moved && !isDockDrag(dy)) return
      if (!g.moved) { g.moved = true; setDockDrag(true) }
      ev.preventDefault(); setDockY(dockFit(g.base + dy))
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id) return
      dockOff.current?.(); dockG.current = null
      if (!g.moved) return
      setDockDrag(false)
      setDockY((v) => { const f = dockFit(v); try { localStorage.setItem('fb:docky', String(Math.round(f))) } catch { /* */ } return f })
    }
    const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); dockOff.current = null }
    dockOff.current = off
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const gref = useRef<{ id: number; x0: number; y0: number; t0: number; lock: '' | 'h' | 'v'; side: 'left' | 'right' | null; dir: 'r' | 'l'; mode: 'open' | 'close' | 'swap'; next: Nav | null; target: HTMLElement; dead: boolean } | null>(null)
  const [dragSide, setDragSide] = useState<'' | 'left' | 'right'>('')
  const leftRef = useRef<HTMLDivElement>(null); const rightRef = useRef<HTMLDivElement>(null); const scrimRef = useRef<HTMLDivElement>(null); const colsRef = useRef<HTMLDivElement>(null)
  const drawerEl = (side: 'left' | 'right') => (side === 'left' ? leftRef.current : rightRef.current)
  const paintDrag = (side: 'left' | 'right', dx: number, opening: boolean) => { const el = drawerEl(side); if (!el) return; const p = dragProgress(opening, side, dx, el.clientWidth || window.innerWidth * 0.85); el.style.transition = 'none'; el.style.transform = `translateX(${side === 'left' ? -(1 - p) * 100 : (1 - p) * 100}%)`; if (scrimRef.current) { scrimRef.current.style.transition = 'none'; scrimRef.current.style.opacity = String(p) } }
  const settle = (side: 'left' | 'right') => { requestAnimationFrame(() => { const el = drawerEl(side); if (el) { el.style.transition = ''; el.style.transform = '' } if (scrimRef.current) { scrimRef.current.style.transition = ''; scrimRef.current.style.opacity = '' } }); window.setTimeout(() => setDragSide(''), 260) }
  const swDown = (e: React.PointerEvent) => {
    if (!phone || e.button !== 0 || gref.current) return
    const t = e.target as HTMLElement
    const inInput = !!t.closest?.('textarea, input, select, [contenteditable="true"], .cchips, .chat-foot, .composer, .menu, .cpop, .modal, .modal-w, .tsheet, .swrow, .swwrap, .dock, .zbar')
    const sel = window.getSelection(); const selecting = !!sel && !sel.isCollapsed
    if (!canStartSwipe({ coarse, selecting, inInput, consumeX: false })) return
    gref.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), lock: '', side: null, dir: 'r', mode: 'open', next: null, target: t, dead: false }
  }
  const swMove = (e: React.PointerEvent) => {
    const g = gref.current; if (!g || g.id !== e.pointerId || g.dead || g.lock === 'v') return
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0
    if (!g.lock) {
      const lk = lockOf(dx, dy); if (!lk) return
      if (lk === 'v') { g.lock = 'v'; return }
      const dir = dx > 0 ? 'r' : 'l'
      // 가로로 움직이는 요소가 그 방향으로 더 갈 수 있으면 그 요소가 먹는다 (H-3 ①)
      for (let el: HTMLElement | null = g.target; el && el !== colsRef.current; el = el.parentElement) {
        if (el.dataset.consumeX) { g.dead = true; return }
        if (el.matches('pre, table, .tblwrap, .achips, .cchips, .chat-scroll, .md') && scrollableEats(el, dir)) { g.dead = true; return }
      }
      /**
       * 🔴 **AD (2026-09-23 Dave) — 쓸기는 👉 하나뿐이고 «어디서든 봇 목록» 이다.**
       *    *«왼쪽으로 쓸기 기능은 아예 삭제(탭으로 다 해결됨) · 오른쪽으로 쓸기만 남겨서 어디서든 바로 폴더 리스트»*.
       *    Z-2 의 온 길(스택) 되짚기는 **하단 탭이 대신**한다 — 길이 둘이면 또 «두 가지 뜻» 이 생긴다.
       * 🔴 **갈 데가 없어도 «가로 쓸기» 로는 잡는다**(`next=null`). 안 잡으면 손가락이 글 위를 지나며 **선택을 남기고**,
       *    그 선택 때문에 다음 쓸기가 «글 고르는 중» 으로 막힌다 — 실측으로 한 번 막혔다.
       */
      const goList = dir === 'r' && view !== 'list'
      g.lock = 'h'; g.dir = dir; g.side = goList ? 'left' : null; g.mode = 'open'; g.next = goList ? goTo(nav, 'list') : null
      if (goList) setDragSide('left')
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 합성 이벤트 */ }
    }
    if (g.lock === 'h' && g.side) paintDrag(g.side, dx, true)
  }
  const swUp = (e: React.PointerEvent) => {
    const g = gref.current; if (!g || g.id !== e.pointerId) return
    gref.current = null
    if (g.lock !== 'h') return
    try { window.getSelection()?.removeAllRanges() } catch { /* */ }   // 쓸면서 글 위를 지나간 선택은 쓰레기다 — 남기면 다음 쓸기가 «글 고르는 중» 으로 막힌다
    if (!g.next) { setDragSide(''); return }                            // 갈 데가 없던 쓸기 — 선택만 치우고 끝낸다
    const dx = e.clientX - g.x0, dt = performance.now() - g.t0
    let ok = swipeVerdict(dx, dt, window.innerWidth)
    // 드릴인(서브에이전트) 안에서의 👉 는 먼저 드릴에서 나온다 — Chat 이 fb:nav 를 받아 preventDefault 하면 서랍은 안 연다
    if (ok && g.dir === 'r' && view === 'chat') { const ev = new CustomEvent('fb:nav', { cancelable: true, detail: 'back' }); window.dispatchEvent(ev); if (ev.defaultPrevented) ok = false }
    if (ok && g.next) setNav(g.next)
    if (g.side) settle(g.side)
    else setDragSide('')
  }
  const swCancel = () => { const g = gref.current; gref.current = null; if (g?.side) settle(g.side) }
  useEffect(() => { if (!narrow) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && view !== 'chat' && !modal && !document.querySelector('.modal-w, .tsheet, .menu')) navDismiss() }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [narrow, view, modal])
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
  const newSession = async () => { const info = await api<SessionInfo>(`/bots/${bot.id}/sessions`, { body: { name: `세션 ${sessions.length + 1}` } }); void refreshModels(); await refresh(); go(bot.id, info.id) }
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
        e.preventDefault()
        // ⌥ 를 누르면 «레일의 이전·다음 폴더» · 아니면 «방문 히스토리 뒤로·앞으로» (루프 2/10)
        if (e.altKey) { const i = flat.indexOf(bot?.id ?? ''); if (i < 0 || flat.length < 2) return; go(flat[(i + (key === ']' ? 1 : -1) + flat.length) % flat.length]); return }
        histGo(key === ']' ? 1 : -1)
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
  // H · 같은 부품을 세 단계가 나눠 쓴다 — 넓음은 흐름 안, 중간·좁음은 서랍 안. 데이터(순서·표시 이름·확인 대기 점)는 한 곳(rows)
  const homeEl = <Home rows={rows} bot={bot} go={go} setModal={setModal} waiting={waiting} unread={unread} onAsk={() => { go('orch'); setFocusReq(Date.now()) }} onTodo={goTodo} say={say} />
  const sidebarEl = <div className="col side left" style={{ width: stage === 'wide' ? fit.sb : undefined }}>
        <div className="hdr"><FolderBot color="#e08850" size={16} mood={waiting ? 'wait' : 'idle'} mono /><span className="ttl">Folder Bot</span><span className="sp" /><div className="acts"><button className="ib" onClick={closeSb} title="목록 접기 (⌘B)"><Icon n="panel" size={14} /></button></div></div>
        <div style={{ padding: '10px 8px 0' }}>
          <button className="nav" onClick={() => setModal('picker')}><Icon n="fplus" size={14} /><span>폴더 선택 · 시작</span><span className="bd">후보 {s.candidates.filter((c) => !c.active).length}</span></button>
          <button className="nav" onClick={() => setModal('notify')}><Icon n="bell" size={14} /><span>알림</span>{unread ? <span className="bd" style={{ color: waiting ? 'var(--wait)' : undefined }}>{unread}</span> : null}</button>
          <button className="nav" onClick={() => setModal('settings')}><Icon n="gear" size={14} /><span>설정</span></button>
        </div>
        {/* 🔴 **폰과 같은 네 칸을 레일 맨 위에** (2026-09-15 Dave: «이 메뉴가 데스크탑 화면에서도 좌측
            상단에 있으면 좋겠어»). 같은 컴포넌트를 `compact` 로 쓴다 — 두 화면이 갈리지 않게. */}
        <div className="sbtiles"><ActionTiles go={go} setModal={setModal} onTodo={goTodo} say={say} compact /></div>
        {/* 정렬 갈래 — 이름 · 직접(끌어 놓기) · 상태. ⚠ 끌어 놓으면 «직접» 으로 알아서 넘어간다 */}
        <div className="sortbar"><span className="lb">정렬</span>{(Object.keys(RAIL_SORT_LABEL) as RailSort[]).map((k) => <button key={k} className={railSort === k ? 'on' : ''} onClick={() => setRailSort(k)} title={RAIL_SORT_HINT[k]}>{RAIL_SORT_LABEL[k]}</button>)}</div>
        <div className="sb-list">
          {rows.map(([sec, list]) => <div key={sec}>
            <div className="secl">{sec === '관제' ? '관제' : sec}</div>
            {list.map(({ b, sum }) => <button key={b.id} data-id={b.id} className={`brow ${b.id === bot.id && view !== 'list' ? 'on' : ''} ${sum.unread ? 'unread' : ''} ${overBot === b.id ? 'dover' : ''} ${dragBot === b.id ? 'dsrc' : ''}`}
              draggable={!b.orchestrator}
              onDragStart={(e) => { setDragBot(b.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-fb-bot', b.id) }}
              onDragEnd={() => { setDragBot(null); setOverBot(null) }}
              onDragOver={(e) => { if (!dragBot || b.orchestrator || dragBot === b.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverBot(b.id) }}
              onDragLeave={() => setOverBot((x) => (x === b.id ? null : x))}
              onDrop={(e) => { e.preventDefault(); void dropBot(b.id) }}
              onContextMenu={(e) => { e.preventDefault(); hovOut(); if (!b.orchestrator) setRailCtx({ x: e.clientX, y: e.clientY, id: b.id, name: b.name }) }} onClick={() => { hovOut(); go(b.id) }} onMouseEnter={(e) => hovIn(b.id, e.currentTarget)} onMouseLeave={hovOut}><FolderBot color={b.color} size={ICON_PX[iconSz]} mood={sum.mood} unread={sum.unread} mono /><span className="n"><BotName b={b} />{b.rel.split('/').length > 2 ? <small>{b.rel.slice(0, b.rel.lastIndexOf('/'))}</small> : null}</span>{b.due ? null : <time>{fmtTime(sum.t)}</time>}</button>)}
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
          <button onClick={async () => { const b = s.bots.find((x) => x.id === railCtx.id); try { await api('/bots/pin', { body: { id: railCtx.id, on: !b?.pinned } }); say(b?.pinned ? '고정을 풀었어요' : '맨 위에 고정했어요'); await refresh() } catch (e) { say((e as Error).message) } }}><Icon n="pin" size={13} /><span style={{ flex: 1 }}>{s.bots.find((x) => x.id === railCtx.id)?.pinned ? '고정 풀기' : '맨 위에 고정'}</span><span className="k">3개까지</span></button>
          {s.bots.find((x) => x.id === railCtx.id)?.orderedBy === 'user' ? <button className="unfix" onClick={async () => { try { await api('/bots/unfix', { body: { id: railCtx.id } }); say('순서 고정을 풀었어요 — 오케스트레이터가 옮길 수 있어요'); await refresh() } catch (e) { say((e as Error).message) } }}><Icon n="sort" size={13} /><span style={{ flex: 1 }}>순서 고정 해제</span><span className="k">끌어 놓은 자리</span></button> : null}
          <button onClick={async () => { try { await api(`/bots/${railCtx.id}/stop`, { body: {} }); say(`${railCtx.name} 을 레일에서 덜어냈어요 — 폴더는 그대로예요`); await refresh(); go('orch') } catch (e) { say((e as Error).message) } }}><Icon n="x" size={13} /><span style={{ flex: 1 }}>지우기 (연결 해지)</span><span className="k">폴더 유지</span></button>
          <button onClick={async () => { if (!confirm(`${railCtx.name} 을 Archive 로 옮기고 은퇴시킬까요? 세션 기록은 보관돼요.`)) return; try { const r = await api<{ to: string }>(`/bots/${railCtx.id}/retire`, { body: {} }); say(`${r.to} 로 은퇴`); await refresh(); go('orch') } catch (e) { say((e as Error).message) } }}><Icon n="archive" size={13} /><span style={{ flex: 1 }}>은퇴 (Archive 로)</span></button>
        </div></Float> : null}
        {/* ⛔ 맥에서는 사용량을 앱 안에 안 그린다 — **메뉴바에서만** 본다 (2026-09-13 Dave: «맥에서는 그냥 메뉴바 안에서만 이게 보이면 좋겠어»).
            폰은 첫 화면 위 스트립 하나로 남는다. 두 표면 다 있으면 같은 숫자가 두 번 보이고 아래 줄이 또 비좁아진다. */}
        <div className="sb-foot two">
          <div className="r2"><span className={`dot ${s.online === 'on' ? 'done' : 'err'}`} /><span className="hn">{s.hostName}</span><MrBadge />{s.inbox ? <span className="bd">Inbox {s.inbox}</span> : null}<UpdateChip version={s.version} st={upd} onCheck={updCheck} onApply={() => { if (upd?.staged?.ready) setUpdAsk(upd.staged.version) }} />{updAsk && upd ? <UpdateAsk st={upd} onApply={updApply} onLater={() => setUpdAsk('')} /> : null}</div>
        </div>
      </div>
  const stripEl = <div className="strip left" onClick={(e) => { if (mid && e.target === e.currentTarget) setView('list') }}><button className="ib" onClick={openSb} title={mid ? '봇 목록 (덮여서 열림)' : '목록 펼치기 (⌘B)'}><Icon n="panel" size={14} /></button><div className="gap" />
        <button className="ib" onClick={() => setModal('picker')}><Icon n="fplus" size={14} /><span className="fly"><b>폴더 선택 · 시작</b><span>후보 {s.candidates.filter((c) => !c.active).length}</span></span></button>
        <button className="ib" onClick={() => setModal('notify')}><Icon n="bell" size={14} />{unread ? <span className="bd">{unread}</span> : null}<span className="fly"><b>알림</b><span>{unread ? `읽지 않음 ${unread}` : '없음'}</span></span></button>
        <div className="gap" />
        {stripBots.map(({ b, sum }) => <button key={b.id} className={`bot ${b.id === bot.id ? 'on' : ''} ${sum.unread ? 'unread' : ''}`} onClick={() => go(b.id)}><FolderBot color={b.color} size={17} mood={sum.mood} unread={sum.unread} mono /><span className="fly"><b><Mid s={b.displayName} /></b><span><span className={`dot ${stateDot(sum.state ?? undefined)}`} style={{ marginRight: 5 }} />{sum.text}</span><span className="t3">{b.section} · {fmtTime(sum.t)}</span></span></button>)}
      </div>
  const docwrapEl = showDoc ? <div className="docwrap" style={{ width: wide || narrow ? undefined : fit.doc, flex: wide ? 3 : 'none', display: 'flex', minWidth: 0 }}><DocPane bot={bot} docs={docs} filesTick={s.filesTick[bot.id]} onTalk={(rel) => { setPrefill(`${rel} 파일 봐 줘: `); if (phone) setView('chat') }} onHide={() => setDocOpen((d) => ({ ...d, [bot.id]: false }))} wide={wide} onWide={() => setWide(!wide)} onAttach={(rel) => addAttach({ rel, abs: `${bot.abs}/${rel}` })} say={say} phone={phone} onBack={toList} /></div> : null
  /**
   * AD · **문서 탭은 비어 있어도 눌린다** (2026-09-23 Dave: *«문서가 없을 때 누르면 그냥 빈 문서 보여 주면 돼»*).
   *    종전에는 `disabled` 라 손가락이 아무 반응도 못 받았다 — 흐린 단추는 «고장» 으로 읽힌다.
   */
  const docEmptyEl = <div className="docwrap" style={{ display: 'flex', minWidth: 0, flex: 1 }}>
    <div className="pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="hdr">{phone ? <button className="rb glassb" onClick={toList} title="봇 목록"><Icon n="list" size={20} /></button> : null}<span className="ttl">문서</span><span className="sp" /></div>
      <div className="empty" style={{ flex: 1 }}><FolderBot color={bot.color} size={40} mood="idle" /><div>연 문서가 없어요.<br /><span style={{ color: 'var(--t3)' }}>아래 <b>폴더</b> 탭에서 파일을 누르면 여기에 열려요.</span></div>
        <button className="btn" onClick={() => { setPanelTab('files'); setView('panel') }}>폴더 열기</button></div>
    </div>
  </div>
  const rpwrapEl = <div className="rpwrap" style={{ width: narrow ? '100%' : fit.rp, flex: 'none', display: 'flex', minWidth: 0 }}><Panel bot={bot} sessions={sessions} sessionId={sessionId} go={go} onOpenFile={(rel, pin) => openInDocPane(rel, { pin })} onTalk={(t) => { setPrefill(t); if (phone) setView('chat') }} onAttach={(rel, dir) => addAttach({ rel, abs: `${bot.abs}/${rel}`, dir })} onMention={(rel) => { setMentionReq((m) => [...m, rel]); if (phone) setView('chat') }} onStartAt={startAt} onNewFolderAt={newFolderAt} touched={touched} filesTick={s.filesTick[bot.id]} secH={lay.secH} onSecH={(h) => setLay({ ...lay, secH: h })} onCollapse={closeRp} focusSec={focusSec} say={say} refresh={refresh} activeDoc={showDoc ? docs.active : null} onDragY={(on) => setDrag(on ? 'y' : '')} phone={phone} onBack={toList} only={phone ? panelTab : undefined} /></div>
  const stripRightEl = <div className="strip right"><button className="ib" onClick={() => openRp()} title="패널 펼치기 (⌘⇧B)"><Icon n="panelr" size={14} /></button>
    {/* S-3 · 패널을 접어 둬도 **새 세션 +** 는 우측 상단에 남는다 (2026-09-21 Dave: «상시 노출») — 펼친 패널 「세션」 줄의 + 와 같은 일 */}
    <button className="ib nsb" onClick={() => { void newSession(); openRp('sessions') }} title="새 세션 (⌘N)"><Icon n="plus" size={14} /><span className="fly"><b>새 세션</b><span>이 폴더에서</span></span></button><div className="gap" />
        <button className="ib" onClick={() => openRp('sessions')}><Icon n="clock" size={14} />{sessions.some((x) => x.state === 'running') ? <span className="dot run" style={{ position: 'absolute', right: 2, top: 2 }} /> : null}<span className="fly"><b>세션</b><span>{sessions.length}개</span></span></button>
        <button className="ib" onClick={() => openRp('todo')}><Icon n="list" size={14} />{(s.todos[bot.id] ?? []).filter((t) => !t.done).length ? <span className="bd">{(s.todos[bot.id] ?? []).filter((t) => !t.done).length}</span> : null}<span className="fly"><b>{bot.orchestrator ? 'Inbox' : '할 일'}</b><span>{bot.orchestrator ? `${s.inbox}개` : `미완료 ${(s.todos[bot.id] ?? []).filter((t) => !t.done).length}`}</span></span></button>
        <button className="ib" onClick={() => openRp('files')}><Icon n="folder" size={14} /><span className="fly"><b>파일</b><span>{bot.rel || '볼트'}</span></span></button>
        <button className="ib" onClick={() => openRp('routines')}><Icon n="cal" size={14} /><span className="fly"><b>루틴</b><span>{bot.routines.length}개</span></span></button>
      </div>
  return <div className={`app ${isDesktop ? 'desktop' : ''} ${phone ? 'phone' : ''} ${mid ? 'smid' : ''} ${kb ? 'kb' : ''} ${drag === 'x' ? 'dragx' : drag === 'y' ? 'dragy' : ''} ${phone && !tabsHere ? 'notabs' : ''}`} data-view={view === 'doc' && !showDoc && !phone ? 'panel' : view} data-nav={`${nav.stack.join('>')}${nav.fwd.length ? ' |' + [...nav.fwd].reverse().join('>') : ''}`}>
    {s.online === 'off' ? <div className="offline">{s.hostName || '호스트'} 와 다시 연결하는 중…</div> : null}
    {s.auth.verdict === 'unreadable' || s.auth.verdict === 'loggedout' ? <div className="banner"><span className="dot wait" /><span><b>{s.hostName} 에서 Claude 로그인이 필요해요.</b> 호스트 맥에서 <span className="mono">claude</span> → <span className="mono">/login</span>, 또는 설정 › Claude 토큰. 보낸 지시는 대기열에 두었다가 복구되면 이어서 해요.</span><span style={{ marginLeft: 'auto' }} /><button className="btn" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button></div> : null}
    <div className={`cols ${dragSide ? 'dragging' : ''}`} ref={colsRef} onPointerDown={swDown} onPointerMove={swMove} onPointerUp={swUp} onPointerCancel={swCancel}>
      {/* ── 왼쪽 (폰은 홈 화면) ── */}
      {/* H-1 · 넓음: 이름 있는 레일 또는 아이콘 띠(접었을 때) · 중간: 아이콘 띠(52px)만, 레일은 서랍으로 · 좁음: 아무것도 없음(☰ · 쓸기) */}
      {stage === 'wide' ? (sbOpen ? sidebarEl : stripEl) : mid ? stripEl : null}
      {stage === 'wide' ? <div className="divx" onPointerDown={sbOpen ? dragX('sb', 1) : undefined} onDoubleClick={() => setLay({ ...lay, sb: DEF.sb, sbOpen: true, sbPin: true })} /> : null}

      {/* ── 채팅 ── */}
      <Chat bot={bot} sessions={sessions} cur={cur} items={items} pending={pending} prefill={prefill} onPrefilled={() => setPrefill('')} attachReq={attachReq} onAttached={() => setAttachReq([])} mentionReq={mentionReq} onMentioned={() => setMentionReq([])} focusReq={focusReq} onSession={(sid) => go(bot.id, sid)} onFile={(rel, pin) => openInDocPane(rel, { pin })} docBadge={docs.tabs.length} docTabs={docs.tabs.map((t) => t.rel)} docOn={showDoc} onDocToggle={() => setDocOpen((d) => ({ ...d, [bot.id]: !d[bot.id] }))} say={say} refreshAll={refresh} collapsed={!phone && wide && showDoc} onUncollapse={() => setWide(false)} phone={phone} onBack={toList} onPanel={() => setView('panel')} newSession={newSession} filesTick={s.filesTick[bot.id]} queue={queueFor(sessionId)} onQueue={(f) => { if (sessionId) onQueue(sessionId, f) }} onReveal={reveal} />

      {/* ── 문서 열 (넓음만 흐름 안 · 중간·좁음은 오른쪽 서랍) ── */}
      {stage === 'wide' && showDoc ? <><div className="divx" onPointerDown={dragX('doc', -1)} onDoubleClick={() => setLay({ ...lay, doc: DEF.doc })} />{docwrapEl}</> : null}

      {/* ── 오른쪽 (넓음만 흐름 안) ── */}
      {stage === 'wide' ? <div className="divx" onPointerDown={rpOpen ? dragX('rp', -1) : undefined} onDoubleClick={() => setLay({ ...lay, rp: DEF.rp, rpOpen: true, rpPin: true })} /> : null}
      {stage === 'wide' ? (rpOpen ? rpwrapEl : stripRightEl) : null}

      {/* ── H · 중간·좁음의 서랍 — 채팅을 밀지 않고 덮는다. 끌리는 동안(dragSide) 미리 붙여 손가락을 따라온다 ── */}
      {narrow && (view !== 'chat' || dragSide) ? <div className={`scrim ${view === 'list' ? 'over' : ''}`} ref={scrimRef} onClick={navDismiss} /> : null}
      {narrow && (view === 'list' || dragSide === 'left') ? <div className={`drawer left ${view === 'list' ? 'open' : ''}`} ref={leftRef}>{phone ? homeEl : sidebarEl}</div> : null}
      {narrow && (under === 'panel' || under === 'doc' || dragSide === 'right') ? <div className={`drawer right ${under === 'panel' || under === 'doc' ? 'open' : ''}`} ref={rightRef}>{under === 'doc' ? (showDoc ? docwrapEl : docEmptyEl) : rpwrapEl}</div> : null}
      {/* H-4 · 알약 독 — 채팅 오른쪽 가장자리에 세로로. 📄 문서(없으면 흐리게) · ☑ 할 일 · 📁 파일 · ↗ 외부에서 열기(문서가 열려 있을 때). 이모지 대신 앱 아이콘 */}
      {mid && view === 'chat' && !kb ? <div className={`dock ${dockDrag ? 'dragging' : ''}`} ref={dockRef} style={{ translate: `0 ${dockY}px` }}
        onPointerDown={dockDown}>
        <span className="grip" title="잡아서 위아래로 옮기기"><i /></span>
        <button className={`db ${docs.tabs.length ? '' : 'dim'}`} title="문서" disabled={!docs.tabs.length} onClick={() => setView('doc')}><Icon n="doc" size={16} />{docs.tabs.length ? <span className="bd">{docs.tabs.length}</span> : null}</button>
        <button className="db" title={bot.orchestrator ? 'Inbox' : '할 일'} onClick={() => { setFocusSec({ sec: 'todo', n: Date.now() }); setView('panel') }}><Icon n="check" size={16} />{(s.todos[bot.id] ?? []).filter((t) => !t.done).length ? <span className="bd">{(s.todos[bot.id] ?? []).filter((t) => !t.done).length}</span> : null}</button>
        <button className="db" title="파일" onClick={() => { setFocusSec({ sec: 'files', n: Date.now() }); setView('panel') }}><Icon n="folder" size={16} /></button>
        <button className={`db ${docs.active ? '' : 'dim'}`} title="외부에서 열기" disabled={!docs.active} onClick={() => { if (docs.active) void openOnThisDevice(bot, docs.active, 'open', { main: s.device.main, hostName: s.hostName, phone, say }) }}><Icon n="open" size={16} /></button>
      </div> : null}

      {/* ── Z · 폰 하단 탭 (2026-09-22 Dave 확정 「B」) — 봇 목록만 빼고 늘 있고, 읽어 내려가면 비킨다 ── */}
      {tabsHere ? (() => {
        const on = tabActive(view, panelTab)
        const todoN = (s.todos[bot.id] ?? []).filter((t) => !t.done).length
        return <nav className="tabbar">
          <button className={`tb ${on === 'chat' ? 'on' : ''}`} data-tab="chat" onClick={() => setView('chat')}><Icon n="chat" size={19} /><span>채팅</span></button>
          <button className={`tb ${on === 'doc' ? 'on' : ''} ${docs.tabs.length ? '' : 'dim'}`} data-tab="doc" onClick={() => setView('doc')}><Icon n="doc" size={19} />{docs.tabs.length ? <span className="bd">{docs.tabs.length}</span> : null}<span>문서</span></button>
          <button className={`tb ${on === 'todo' ? 'on' : ''}`} data-tab="todo" onClick={() => { setPanelTab('todo'); setView('panel') }}><Icon n="check" size={19} />{todoN ? <span className="bd">{todoN}</span> : null}<span>{bot.orchestrator ? 'Inbox' : '할 일'}</span></button>
          <button className={`tb ${on === 'files' ? 'on' : ''}`} data-tab="files" onClick={() => { setPanelTab('files'); setView('panel') }}><Icon n="folder" size={19} /><span>폴더</span></button>
        </nav>
      })() : null}
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
    <ConfirmHost />
    <LocalOpenHost />
    {pickFile ? <><div className="backdrop" onClick={() => setPickFile(null)} /><div className="modal conf pickfile" style={{ width: 'min(520px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{pickFile.name} — {pickFile.rels.length}곳에 있어요</b></div></div>
      <div className="modal-b" style={{ padding: '2px 12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>{pickFile.rels.map((r) => <button key={r} className="prow2" onClick={() => { setPickFile(null); openInDocPane(r) }}><span className="t"><b>{r.split('/').pop()}</b><small>{r}</small></span></button>)}</div>
      <div className="modal-f"><span className="sp" /><button className="btn" onClick={() => setPickFile(null)}>취소</button></div>
    </div></> : null}
    <DiffHost />
    <AgentPickHost />
    {toast ? <div className="toast">{toast}</div> : null}
    <CopyProgressHost />
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
    <div className="hh"><FolderBot color={b.color} size={28} mood={sum.mood} mono /><b title={b.name}><Mid s={b.displayName} /></b><span className={`dot ${stateDot(sum.state ?? undefined)}`} /></div>
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
  /** AB · 턴이 끝나도 백그라운드 에이전트가 남아 있으면 그 세션이 «기다리는 중» 이다 — 레일에서도 사라지면 안 된다 */
  const held = sessions.find((x) => (x.bg ?? 0) > 0)
  const top = wait ?? run ?? held ?? sessions[0]; const last = notif.find((n) => n.botId === bot.id)
  const state = top?.state ?? null
  const unread = botUnread(sessions)   // S · 안 읽은 답이 하나라도 있나 (`core/unread`)
  /**
   * 🔴 **레일·헤더·대기 줄이 같은 값에서 나온다** (AB · 2026-09-23). 셋이 다른 말을 하면 어느 쪽도 못 믿는다 —
   *    종전에는 레일만 「일하는 중 · 생각 중」이라 말하고 채팅은 아무 말이 없었다.
   */
  const holder: Holder = top ? holderOf(top.state, top.inflight, Date.now(), top.bg ?? 0) : 'none'
  const text = wait ? `확인해 주세요 · ${wait.pending[0]?.displayName ?? wait.name}`
    : holder === 'other' ? `${holdHeader(holder, top?.inflight, top?.bg ?? 0)} · ${top?.inflight?.summary || top?.name || ''}`
      : run ? `일하는 중 · ${run.activity || run.name}` : last ? last.body : top ? `${top.name}${top.hibernated ? ' · 절전' : ''}` : '메시지를 보내 보세요'
  return { state, text, unread, holder, t: Math.max(top?.lastActivity ?? bot.startedAt, last?.t ?? 0), mood: moodOf(state, !!top?.hibernated && !run && !wait, holder) }
}

/**
 * 🔴 **네 칸은 «세는 곳» 이 아니라 «하는 곳» 이다** (2026-09-15 Dave: *«실제로 쓸일이 별로 없거든.
 *    나는 상태 및 주요 사항들을 바로 보고 액션하고 싶어»* · 고정 4칸 · 전부 액션으로 확정).
 *
 * 왜 종전 넷(확인 필요·일하는 중·인박스·폴더 후보)이 안 쓰였나 — **셋이 이미 다른 데 있는 숫자**였다.
 * 확인 필요는 위 종 배지와 같고, 일하는 중은 아래 목록이 이미 말하고, 인박스·폴더 후보는 **처음
 * 차릴 때** 한 번 보는 것이다. 숫자만 있고 **거기서 할 수 있는 일이 없으면** 그 칸은 벽지가 된다.
 *
 * 그래서 넷 다 «지금 상태 + 그 자리에서 할 일» 로 바꾼다:
 *   ① 확인 대기 — 무엇을 묻는지 보이고 **[허용]** 이 칸 안에 있다 (하나일 때)
 *   ② 일하는 중 — 어느 폴더가 무엇을 하는지 · **[중단]**
 *   ③ 오늘 할 일 — 볼트 전체에서 안 끝난 것 · 맨 앞 하나를 **[✓]** 로 접는다
 *   ④ 마지막 결과 — 방금 끝난 턴으로 바로 간다
 * ⚠ 칸 안의 작은 단추는 `<span role="button">` 이다 — 단추 안에 단추를 넣으면 HTML 이 깨진다.
 * ⚠ 폰·맥이 **같은 컴포넌트**를 쓴다(맥은 레일 맨 위 `compact`). 둘이 갈리면 설명이 두 벌이 된다.
 */
interface TodoAgg { open: number; rows: { botId: string; name: string; open: number; next: { line: number; title: string } | null }[] }
function ActionTiles({ go, setModal, onTodo, say, compact }: { go: (b: string, sid?: string) => void; setModal: (m: 'picker' | 'notify' | 'settings') => void; onTodo: (botId: string) => void; say: (m: string) => void; compact?: boolean }) {
  const { s } = useStore()
  const [todo, setTodo] = useState<TodoAgg | null>(null)
  const [busy, setBusy] = useState('')
  const load = () => { void api<TodoAgg>('/todos').then(setTodo).catch(() => { /* 없으면 숫자 없이 */ }) }
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t) }, [])
  // 봇이 할 일을 고치면 알림이 오거나 파일이 바뀐다 — 그때 한 번 더 받아 온다
  useEffect(() => { load() }, [s.notifications[0]?.id, s.bots.length])
  const all = useMemo(() => Object.values(s.sessionsByBot).flat(), [s.sessionsByBot])
  const waiting = all.filter((x) => x.state === 'awaiting_input')
  const running = all.filter((x) => x.state === 'running')
  const last = s.notifications.find((n) => n.kind === 'done' || n.kind === 'routine' || n.kind === 'error')
  const nameOf = (id?: string) => s.bots.find((b) => b.id === id)?.name ?? ''
  const w0 = waiting[0], r0 = running[0], t0 = todo?.rows[0]
  const allow = async () => {
    const req = w0?.pending[0]; if (!w0 || !req) return
    setBusy('w'); try { await api(`/sessions/${w0.id}/permission`, { body: { requestId: req.requestId, allow: true } }); say('허용했어요') } catch (e) { say((e as Error).message) } finally { setBusy('') }
  }
  const stop = async () => { if (!r0) return; setBusy('r'); try { await api(`/sessions/${r0.id}/interrupt`, { body: {} }); say('중단했어요') } catch (e) { say((e as Error).message) } finally { setBusy('') } }
  const check = async () => {
    if (!t0?.next) return
    setBusy('t'); try { await api(`/bots/${t0.botId}/todo/toggle`, { body: { line: t0.next.line, done: true } }); load(); say(`«${t0.next.title}» 완료`) } catch (e) { say((e as Error).message) } finally { setBusy('') }
  }
  const act = (on: () => void, label: string, key: string) => <span role="button" className="act" aria-label={label} onClick={(e) => { e.stopPropagation(); if (!busy) on() }}>{busy === key ? '…' : label}</span>
  return <div className={`mcards ${compact ? 'mini' : ''}`}>
    <button className={waiting.length ? 'hot' : ''} onClick={() => (w0 ? go(w0.botId, w0.id) : setModal('notify'))}>
      <Icon n="bell" size={compact ? 16 : 22} color={waiting.length ? 'var(--wait)' : 'var(--t3)'} />
      <span className="n">확인 대기<span>{waiting.length}</span></span>
      <span className="sub">{w0 ? `${nameOf(w0.botId)} · ${w0.pending[0]?.displayName ?? w0.name}` : '없음'}</span>
      {w0?.pending[0] ? act(allow, '허용', 'w') : null}
    </button>
    <button onClick={() => (r0 ? go(r0.botId, r0.id) : setModal('notify'))}>
      <Icon n="run" size={compact ? 16 : 22} color={running.length ? 'var(--run)' : 'var(--t3)'} />
      <span className="n">일하는 중<span>{running.length}</span></span>
      <span className="sub">{r0 ? `${nameOf(r0.botId)} · ${r0.activity || r0.name}` : '없음'}</span>
      {r0 ? act(stop, '중단', 'r') : null}
    </button>
    <button onClick={() => (t0 ? onTodo(t0.botId) : go('orch'))}>
      <Icon n="check" size={compact ? 16 : 22} color={todo?.open ? '#7fb0ff' : 'var(--t3)'} />
      <span className="n">할 일<span>{todo?.open ?? 0}</span></span>
      <span className="sub">{t0?.next ? `${t0.name} · ${t0.next.title}` : '다 끝냈어요'}</span>
      {t0?.next ? act(check, '✓', 't') : null}
    </button>
    <button onClick={() => (last ? go(last.botId, last.sessionId) : setModal('notify'))}>
      <Icon n="check" size={compact ? 16 : 22} color={last?.kind === 'error' ? 'var(--err)' : 'var(--done)'} />
      <span className="n">마지막 결과<span>{last ? fmtTime(last.t) : ''}</span></span>
      <span className="sub">{last ? `${nameOf(last.botId)} · ${last.body}` : '아직 없어요'}</span>
    </button>
  </div>
}

/* ── 폰 홈 — 큰 제목 · 카드 4 · 봇 목록 · 떠 있는 알약 (탭바 없음) ── */
type Row = [string, { b: Bot; sum: ReturnType<typeof botSummary> }[]]
/**
 * 레일·헤더의 봇 이름 (F · 2026-09-19 Dave 1안 확정) — «이름 굵게 · 타입 태그 · 오른쪽 날짜 칩».
 * 파생은 호스트(core/botName)가 하고 여기는 그리기만 한다. 잘릴 때는 제목 끝을 자르고 태그가 먼저 접히며
 * (태그 `flex-shrink` 가 크다), 날짜 칩은 `flex:none` 이라 끝까지 남는다. D-3 이내 강조 · 지난 날짜 흐림.
 * 툴팁은 원래 폴더명 전체. 관제·규칙 밖 폴더는 제목만 나온다.
 */
function BotName({ b, chip = true }: { b: Bot; chip?: boolean }) {
  const due = chip && b.due ? dueChip(b.due.date, b.due.precision) : null
  const ref = useRef<HTMLSpanElement>(null); const tagW = useRef(0)
  const [hideTag, setHideTag] = useState(false)
  // 태그는 «반쯤» 보이지 않는다 — 제목의 본래 폭 + 태그 + 칩이 안 들어가면 태그를 통째로 접고, 다시 들어가면 편다
  useEffect(() => {
    const el = ref.current; if (!el || !b.kind) return
    const fit = () => {
      const dn = el.querySelector('.dn') as HTMLElement | null, tag = el.querySelector('.tag') as HTMLElement | null, du = el.querySelector('.due') as HTMLElement | null
      if (!dn) return
      if (tag) tagW.current = tag.offsetWidth
      const need = dn.scrollWidth + (tagW.current + 6) + (du ? du.offsetWidth + 6 : 0)
      setHideTag(need > el.clientWidth + 1)
    }
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect()
  }, [b.kind, b.displayName, due?.text])
  return <span ref={ref} className="bname" title={b.name}><b className="dn">{b.displayName}</b>{b.kind && !hideTag ? <span className="tag">{b.kind}</span> : null}{due ? <span className={`due ${due.tone}`}>{due.text}</span> : null}</span>
}

function Home({ rows, bot, go, setModal, waiting, unread, onAsk, onTodo, say }: { rows: Row[]; bot: Bot; go: (b: string, sid?: string) => void; setModal: (m: 'picker' | 'notify' | 'settings') => void; waiting: number; unread: number; onAsk: () => void; onTodo: (botId: string) => void; say: (m: string) => void }) {
  const usage = useUsage() // 폰 홈 맨 위 — 한 줄 띠. 누르면 카드가 시트로 올라온다
  const [uSheet, setUSheet] = useState(false)
  const { s, refresh } = useStore()
  /** 폰 폴더 행 쓸기 — 자리는 `swipe.ts` 의 FOLDER_SWIPE 로 고정. 메뉴 시트는 레일 우클릭과 같은 세 가지 */
  const [fsheet, setFsheet] = useState<Bot | null>(null)
  const folderAct = async (b: Bot, a: SwipeAct) => {
    try {
      if (a === 'pin') { await api('/bots/pin', { body: { id: b.id, on: !b.pinned } }); say(b.pinned ? '고정을 풀었어요' : '맨 위에 고정했어요'); await refresh() }
      else if (a === 'unfix') { await api('/bots/unfix', { body: { id: b.id } }); say('순서 고정을 풀었어요 — 오케스트레이터가 옮길 수 있어요'); await refresh() }
      else if (a === 'unlink') { await api(`/bots/${b.id}/stop`, { body: {} }); say(`${b.name} 을 레일에서 덜어냈어요 — 폴더는 그대로예요`); await refresh() }
      else if (a === 'retire') {
        if (!(await askConfirm({ title: `${b.name} 을 은퇴시킬까요?`, body: 'Archive 로 옮기고 레일에서 내려요. 세션 기록은 보관돼요.', ok: '은퇴' }))) return
        const r = await api<{ to: string }>(`/bots/${b.id}/retire`, { body: {} }); say(`${r.to} 로 은퇴`); await refresh()
      }
      else if (a === 'menu') setFsheet(b)
    } catch (e) { say((e as Error).message) }
  }
  const all = rows.flatMap(([, l]) => l)
  const running = all.filter((x) => x.sum.state === 'running')
  const cands = s.candidates.filter((c) => !c.active).length
  return <div className="col mhome">
    <div className="mtop"><button className="rb" onClick={() => setModal('settings')} title="설정"><FolderBot color="#e08850" size={26} mood={waiting ? 'wait' : 'idle'} mono /></button><span className="sp" /><button className="rb" onClick={() => setModal('notify')}><Icon n="bell" size={20} />{unread ? <span className="bd">{unread}</span> : null}</button><button className="rb" onClick={() => setModal('picker')}><Icon n="fplus" size={20} /></button></div>
    <div className="mscroll">
      <div className="mtitle">Folder Bot</div>
      <div className="msub"><span className={`dot ${s.online === 'on' ? 'done' : 'err'}`} style={{ width: 7, height: 7 }} />{s.hostName}<MrBadge /><span>· 봇 {s.bots.length} · 후보 {cands}</span></div>
      {usage && usage.tools.length ? <div style={{ padding: '0 16px 12px' }}><UsageStrip u={usage} onOpen={() => setUSheet(true)} /></div> : null}
      <ActionTiles go={go} setModal={setModal} onTodo={onTodo} say={say} />
      {rows.map(([sec, list]) => <div key={sec}>
        <div className="secl">{sec}</div>
        {list.map(({ b, sum }) => {
          const row = <button key={b.id} className={`mrow ${sum.unread ? 'unread' : ''}`} onClick={() => go(b.id)}><span className="av"><FolderBot color={b.color} size={46} mood={sum.mood} unread={sum.unread} mono /></span><span className="t"><span className="l1"><BotName b={b} chip={false} />{b.due ? (() => { const d = dueChip(b.due.date, b.due.precision); return d ? <span className={`due ${d.tone}`}>{d.text}</span> : null })() : <time>{fmtTime(sum.t)}</time>}</span><span className="l2">{sum.text}</span></span></button>
          // 관제(오케스트레이터)는 고정·지우기·은퇴의 대상이 아니다 — 쓸리지 않는다
          return b.orchestrator ? row : <SwipeRow key={b.id} cfg={FOLDER_SWIPE} labelFor={(a) => (a === 'pin' && b.pinned ? '고정 풀기' : undefined)} onAct={(a) => void folderAct(b, a)}>{row}</SwipeRow>
        })}
      </div>)}
    </div>
    {fsheet ? <><div className="backdrop" onClick={() => setFsheet(null)} /><div className="tsheet">
      <div className="grip" />
      <div className="ti">{fsheet.name}</div>
      {([['pin', fsheet.pinned ? '고정 풀기' : '맨 위에 고정'], ...(fsheet.orderedBy === 'user' ? [['unfix', '순서 고정 해제 — 끌어 놓은 자리']] : []), ['unlink', '지우기 (연결 해지) — 폴더는 그대로'], ['retire', '은퇴 (Archive 로)']] as [SwipeAct, string][]).map(([a, l]) => <button key={a} onClick={() => { const b = fsheet; setFsheet(null); void folderAct(b, a) }}><Icon n={ACT_ICON[a] as 'edit'} size={16} />{l}</button>)}
    </div></> : null}
    <button className="mpill glassb" onClick={onAsk}><span className="pl"><Icon n="plus" size={20} /></span><span className="tx">폴더에 시키기…</span><Icon n="sub" size={20} color="var(--t2)" /></button>
  {uSheet && usage ? <><div className="backdrop" onClick={() => setUSheet(false)} /><div className="tsheet usheet"><div className="grip" /><UsageCard u={usage} /></div></> : null}</div>
}

/* ── 대화 ───────────────────────────────────────────────────────────────── */
const BUILTIN_SLASH: SlashCmd[] = [{ name: 'compact', desc: '대화 압축 — 컨텍스트 줄이기', kind: 'cli', scope: 'cli' }, { name: 'context', desc: '컨텍스트 사용 내역', kind: 'cli', scope: 'cli' }, { name: 'clear', desc: '새 대화로 (새 세션)', kind: 'cli', scope: 'cli' }]
interface FileNode { rel: string; dir: boolean; mtime: number }
// ⚠ 맥 파일 이름은 NFD 로 저장된다 — 비교 전에 양쪽을 NFC 로 맞추지 않으면 한글이 «아예» 안 걸린다(core/search 머리말)
const fuzzy = (q: string, s: string): number => { if (!q) return 1; const t = norm(s); const nq = norm(q); if (t.includes(nq)) return t.startsWith(nq) ? 3 : 2; let i = 0; for (const c of t) if (c === nq[i]) i++; return i === nq.length ? 1 : 0 }

function Chat({ bot, sessions, cur, items, pending, prefill, onPrefilled, attachReq, onAttached, mentionReq, onMentioned, focusReq, onSession, onFile, docBadge, docTabs, docOn, onDocToggle, say, refreshAll, collapsed, onUncollapse, phone, onBack, onPanel, newSession, filesTick, queue, onQueue, onReveal }: { bot: Bot; sessions: SessionInfo[]; cur?: SessionInfo; items: ChatItem[]; pending: PermissionRequest[]; prefill: string; onPrefilled: () => void; attachReq: Att[]; onAttached: () => void; mentionReq: string[]; onMentioned: () => void; focusReq: number; onSession: (sid: string) => void; onFile: (rel: string, pin?: boolean) => void; docBadge: number; docTabs: string[]; docOn: boolean; onDocToggle: () => void; say: (m: string) => void; refreshAll: () => Promise<void>; collapsed: boolean; onUncollapse: () => void; phone: boolean; onBack: () => void; onPanel: () => void; newSession: () => Promise<void>; filesTick?: number; queue: string[]; onQueue: (f: (q: string[]) => string[]) => void; onReveal: (rel: string) => void }) {
  const { s } = useStore()
  const [text, setText] = useState(''); const [caret, setCaret] = useState(0); const [sessMenu, setSessMenu] = useState(false); const [busy, setBusy] = useState(false)
  const [attach, setAttach] = useState<Att[]>([]); const [pop, setPop] = useState<'' | 'plus' | 'mode' | 'model' | 'effort' | 'ctx'>(''); const [pickOpen, setPickOpen] = useState(false); const [uploading, setUploading] = useState(false)
  const [routineDraft, setRoutineDraft] = useState<RoutineDef | null>(null)
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
  const [drop, setDrop] = useState<'' | 'tree' | 'files'>(''); const [dropN, setDropN] = useState(0); const dragN = useRef(0)
  const [slash, setSlash] = useState<SlashCmd[]>([]); const [files, setFiles] = useState<FileNode[] | null>(null); const [sel, setSel] = useState(0); const [dismissed, setDismissed] = useState('')
  const [pinnedId, setPinnedId] = useState<string | null>(null); const [atBottom, setAtBottom] = useState(true); const atBottomRef = useRef(true); atBottomRef.current = atBottom
  /**
   * 🔴 **「최근으로」 단추는 자동 스크롤과 **다른 눈금**을 쓴다** (2026-09-13 Dave: «누르려고 하면 도망가네»).
   *    하나의 문턱(80px)으로 둘을 같이 쓰면, 글이 흘러드는 동안 그 선을 오가며 단추가 **붙었다 떨어졌다** 한다
   *    — 붙을 때마다 4px 떠오르는 등장 애니메이션이 다시 돌아서 «다가가면 움직이는» 것처럼 보였다.
   *    그래서 ① 이력(hysteresis)을 준다: **240px 넘게 멀어져야 뜨고, 40px 안으로 와야 사라진다**
   *    ② 사라질 때도 **DOM 에서 빼지 않고** 투명도만 낮춘다 — 다시 뜰 때 제자리에 그대로 있다.
   */
  const [showJump, setShowJump] = useState(false)
  useEffect(() => { const el = scRef.current; if (!el || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(() => { if (atBottomRef.current) followBottom() }); ro.observe(el); return () => ro.disconnect() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * 폰에서 키보드가 올라오면 **대화를 맨 아래로 붙인다** — 읽으려고 위로 올려 둔 채 입력칸을 누르면
   * 종전에는 그 자리에 그대로 멈춰 있어 «무엇에 답하는지» 가 안 보였다(Dave: «타이핑 위치 안 잡혀»).
   * 키보드가 자리를 잡는 데 몇 프레임 걸리므로 두 번 더 붙인다. 위로 올려 둔 것은 키보드를 내리면 그대로다.
   */
  const stickBottom = () => { const el = scRef.current; if (!el) return; const go = () => { el.scrollTop = el.scrollHeight }; go(); setTimeout(go, 120); setTimeout(go, 400); setTimeout(go, 800) }
  const [draft, setDraft] = useState<{ model?: string; effort?: string; permissionMode?: PermissionMode }>({})
  const fileRef = useRef<HTMLInputElement>(null); const photoRef = useRef<HTMLInputElement>(null); const camRef = useRef<HTMLInputElement>(null); const endRef = useRef<HTMLDivElement>(null); const taRef = useRef<InlineInputHandle>(null); const scRef = useRef<HTMLDivElement>(null); const footRef = useRef<HTMLDivElement>(null); const colRef = useRef<HTMLDivElement>(null); const lastUserRef = useRef<HTMLDivElement | null>(null)
  const state = cur?.state ?? 'idle'; const running = state === 'running'
  /** AB · 지금 대화에서 **누가 공을 들고 있나** — 헤더·얼굴·대기 줄이 이 값 하나를 같이 쓴다 */
  const chatHolder: Holder = holderOf(state, cur?.inflight, Date.now(), cur?.bg ?? 0)
  /** ⚠ 기본값도 벤더마다 다르다 — Codex 세션에 Claude 기본 모델이 박히면 첫 턴에 죽는다 */
  const vendOf = () => cur?.vendor ?? bot.vendor
  const cfg = { model: cur?.model || draft.model || (vendOf() === 'codex' ? (s.defaults.codex?.model || DEFAULT_MODEL.codex) : (s.defaults.model || DEFAULT_MODEL.claude)), effort: cur?.effort || draft.effort || (vendOf() === 'codex' ? (s.defaults.codex?.effort || DEFAULT_EFFORT.codex) : (s.defaults.effort || DEFAULT_EFFORT.claude)), mode: (cur?.permissionMode || draft.permissionMode || 'default') as PermissionMode }
  // ⚠ 대기열은 여기서 비우지 않는다 — 세션마다 부모가 따로 들고 있다(위 `queues` 머리말)
  useEffect(() => { setDrill(null); setDraft({}); setPop('') }, [cur?.id])
  useEffect(() => { if (prefill) { setText((t) => (t ? `${t} ${prefill}` : prefill)); onPrefilled(); taRef.current?.focus() } }, [prefill])
  useEffect(() => { if (focusReq) taRef.current?.focus() }, [focusReq])
  useEffect(() => { if (attachReq.length) { for (const r of attachReq) addAtt(r); onAttached() } }, [attachReq])
  useEffect(() => { if (mentionReq.length) { for (const rel of mentionReq) mention(rel); onMentioned() } }, [mentionReq])
  // ⚠ `filesTick` 도 본다 — 새 슬래시 명령을 만들면(루프 8/10) 그 자리에서 `/` 메뉴에 나와야 한다
  useEffect(() => { void api<SlashCmd[]>(`/bots/${bot.id}/slash${cur?.id ? `?sid=${cur.id}` : ''}`).then(setSlash).catch(() => {}) }, [bot.id, cur?.id, filesTick])
  useEffect(() => { setFiles(null) }, [bot.id, filesTick])
  const last = items[items.length - 1]
  const lastUser = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'user') return items[i] as Extract<ChatItem, { kind: 'user' }>; return null }, [items])
  const pinnedItem = useMemo(() => (pinnedId ? (items.find((x) => x.id === pinnedId && x.kind === 'user') as Extract<ChatItem, { kind: 'user' }> | undefined) ?? null : null), [items, pinnedId])
  const lastAssistant = useMemo(() => { for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'assistant') return items[i].id; return null }, [items])
  const streaming = !!(last && (last.kind === 'assistant' || last.kind === 'thinking') && last.streaming)
  /**
   * S · **맨 아래까지 봤으면 읽음** (2026-09-21 Dave 확정). 판정은 `core/unread.shouldMarkRead` 한 곳 —
   * 화면은 «맨 아래인가 · 아직 자라는가» 만 알려 주고, 적을지 말지는 순수 함수가 정한다.
   * ⚠ 볼트에 적으므로(폰·맥 공유) 한 번 적은 것은 다시 안 적는다 — `readAt` 이 이미 앞서 있으면 함수가 false 를 낸다.
   */
  useEffect(() => {
    if (!cur || !shouldMarkRead({ atBottom, streaming, lastReplyAt: cur.lastReplyAt, readAt: cur.readAt })) return
    const t = window.setTimeout(() => { void api(`/sessions/${cur.id}/read`, { body: { at: cur.lastReplyAt } }).catch(() => {}) }, 400)
    return () => window.clearTimeout(t)
  }, [cur?.id, cur?.lastReplyAt, cur?.readAt, atBottom, streaming])
  // 컴포저 높이 → 본문 아래 여백 (유리 뒤로 글이 지나가되 가려지진 않게)
  // I-2 · 컴포저가 자라면(줄이 늘면) 본문 아래 여백(--footh)이 커진다 — 맨 아래를 보고 있었으면 **그 자리에서 따라 붙는다.**
  //   위의 스크롤 컨테이너 ResizeObserver 는 «상자 크기» 만 보므로 패딩만 커지는 이 경우를 못 본다(실측: 마지막 메시지가 52px 가려짐).
  useEffect(() => { const el = footRef.current, col = colRef.current; if (!el || !col) return; const ro = new ResizeObserver(() => { col.style.setProperty('--footh', `${el.offsetHeight}px`); if (atBottomRef.current) followBottom() }); ro.observe(el); return () => ro.disconnect() }, [collapsed]) // eslint-disable-line react-hooks/exhaustive-deps
  // 스크롤 위치 → ↓ 버튼(맨 아래가 아닐 때) · 직전 질문 고정(원래 메시지가 헤더 위로 사라졌을 때)
  /**
   * O · **따라가기는 부드럽게, 맨 아래일 때만** (2026-09-19 실측: 토큰마다 `scrollTop = scrollHeight` 로 한 줄 반씩 «툭» 붙었다 — 폰 12회·데스크톱 7회).
   *    rAF 로 프레임당 최대 10px 씩 옮긴다(120ms 안에 한 줄). 사용자가 60px 이상 올려 봤으면 따라가지 않고 「↓ 새 내용」 만 켠다 — 다시 맨 아래로 오면 재개.
   *    ⚠ 자동 따라가기가 만든 스크롤은 «사용자가 올렸다» 로 세지 않는다(`autoScrollRef`).
   */
  const followRaf = useRef(0); const autoScrollRef = useRef<number | null>(null); const smoothUntilRef = useRef(0);   /* 「최근으로」 의 smooth 스크롤이 내는 중간 scroll 이벤트는 «사람이 올렸다» 가 아니다 */ const streamingRef = useRef(false); streamingRef.current = streaming
  // O · 상태 줄이 사라지는 순간의 «툭» — 사라진 높이만큼 아래 여백(--settle)을 남겨 scrollHeight 가 줄지 않게 한다(클램프 점프 없음). 다음 내용이 자라면 0 으로
  const liveWas = useRef(false)
  useEffect(() => {
    const on = !!(cur && (running || state === 'awaiting_input')); const col = colRef.current
    if (liveWas.current && !on && col && atBottomRef.current) col.style.setProperty('--settle', '32px')
    if (on && col) col.style.setProperty('--settle', '0px')
    liveWas.current = on
  }, [cur?.id, running, state])
  const followBottom = () => {
    const el = scRef.current; if (!el || followRaf.current) return
    const step = () => {
      followRaf.current = 0; const el2 = scRef.current; if (!el2 || !atBottomRef.current) return
      const target = el2.scrollHeight - el2.clientHeight; const d = target - el2.scrollTop
      if (d <= 1) return
      // 몇 줄이 아니라 화면 하나가 넘게 벌어졌으면(처음 열기 · 한꺼번에 온 메시지) 기어가지 않고 한 번에 — 10px/프레임은 «토큰이 자라는 한 줄» 을 위한 값이다
      if (d > 160 && !streamingRef.current) { el2.scrollTop = target; autoScrollRef.current = el2.scrollTop; return }
      const before = el2.scrollTop; el2.scrollTop = before + Math.min(10, d); autoScrollRef.current = el2.scrollTop
      // ⚠ 더 못 내려가면(소수점 끝) 멈춘다 — 안 그러면 rAF 가 매 프레임 scrollTop 을 건드려 열린 메뉴(Float 는 scroll 에 닫힌다)가 바로 닫힌다(스모크 E 실측)
      if (Math.abs(el2.scrollTop - before) < 0.25) { autoScrollRef.current = null; return }
      followRaf.current = requestAnimationFrame(step)
    }
    followRaf.current = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(followRaf.current), [])
  // 🔴 «우리가 옮긴 스크롤» 은 불리언이 아니라 **우리가 놓은 scrollTop 값**으로 알아본다 (P 라운드 실측) — 불리언이면 따라가기 프레임과
  //    사용자의 위로 당기기 사이에서 사용자 scroll 이벤트가 «자동» 으로 먹혀 다시 끌려 내려갔다(O 스모크 간헐 빨강). 값이 다르면 사람이 움직인 것이다.
  const measure = (keepBottom = false) => { const el = scRef.current; if (!el) return; const d = el.scrollHeight - el.scrollTop - el.clientHeight; const ours = (autoScrollRef.current != null && Math.abs(el.scrollTop - autoScrollRef.current) < 1.5) || performance.now() < smoothUntilRef.current; if (ours || keepBottom) { autoScrollRef.current = null; setAtBottom(true) } else { const nb = d < 60; if (!nb) { /* 사람이 올렸다 — 상태 커밋을 기다리지 않고 **지금** 따라가기를 끊는다. 안 그러면 다음 rAF 가 한 번 더 내리고 그 scroll 이벤트가 «우리 것» 으로 읽힌다(O 스모크 간헐) */ atBottomRef.current = false; if (followRaf.current) { cancelAnimationFrame(followRaf.current); followRaf.current = 0 } autoScrollRef.current = null } setAtBottom(nb) }   /* 우리가 옮긴 스크롤은 «맨 아래를 보는 중» 을 유지한다 */ setShowJump((was) => (was ? d > 40 : d > 240)); /* Q-2 · 고정 질문은 «마지막 질문» 이 아니라 **화면 바로 위로 지나간 질문** — 더 올리면 그 앞 질문으로 바뀐다 (2026-09-19 Dave) */ const lim = el.getBoundingClientRect().top + (phone ? 52 : 44); let pid: string | null = null; for (const u of el.querySelectorAll<HTMLElement>('.umsg[data-id]')) { if (u.getBoundingClientRect().bottom < lim) pid = u.dataset.id ?? null; else break } setPinnedId(pid) }
  useEffect(() => { const el = scRef.current; if (!el) return; measure(); const onScroll = () => measure(); el.addEventListener('scroll', onScroll, { passive: true }); return () => el.removeEventListener('scroll', onScroll) }, [collapsed, cur?.id, phone]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⚠ 내용이 자란 직후의 거리(d)는 «사용자가 올렸다» 가 아니다 — 따라가는 중이면 맨 아래 상태를 지킨 채 잰다(keepBottom)
  useEffect(() => { const el = scRef.current; if (!el) return; if (atBottom) { followBottom(); measure(true) } else measure() }, [items.length, last && (last.kind === 'assistant' || last.kind === 'thinking') ? last.text.length : 0, pending.length, cur?.activity, lastUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // 세션을 바꿨을 때만 **즉시** 맨 아래 — 그 밖의 모든 따라가기는 부드럽게(followBottom)
  useEffect(() => { const el = scRef.current; if (el) { el.scrollTop = el.scrollHeight; autoScrollRef.current = el.scrollTop } }, [cur?.id])
  useEffect(() => { if (!pop) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.cpop, .cbtn, .ring, .plusb')) setPop('') }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(''); if (pop === 'mode' && /^[1-4]$/.test(e.key) && !(e.target as HTMLElement).matches('textarea,input')) { e.preventDefault(); void applyCfg({ permissionMode: MODES[Number(e.key) - 1].v }) } }; window.addEventListener('mousedown', off); window.addEventListener('keydown', key); return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', key) } }, [pop])
  /**
   * 🔴 **돌던 대화의 모델을 바꾸는 건 공짜가 아니다** (2026-09-15 Dave 지정 — Claude Code 와 같은 확인창).
   *    지금까지의 대화는 **지금 모델 기준으로 캐시**돼 있다. 모델을 갈면 다음 메시지에서 전체 세션을
   *    다시 읽으므로 한도를 더 쓴다. 그래서 «바꿀까요» 를 한 번 묻는다.
   * ⚠ **아직 한 마디도 안 한 세션은 안 묻는다** — 캐시된 것이 없으니 물어볼 이유가 없다.
   * ⚠ 노력·권한 모드는 안 묻는다(캐시를 안 버린다). 「다시 묻지 않기」는 이 기기에 적힌다.
   */
  const applyCfg = async (p: { model?: string; effort?: string; permissionMode?: PermissionMode }) => {
    setPop('')
    if (!cur) { setDraft((d) => ({ ...d, ...p })); return }
    if (p.model !== undefined && p.model !== (cur.model ?? '') && cur.cliSessionId) {
      const okGo = await askConfirm({
        title: '모델을 변경하시겠습니까?',
        body: `현재 세션은 ${modelLabel(cur.model, vend)} 기준으로 캐시되어 있습니다. ${modelLabel(p.model, vend)}로 전환하면 다음 메시지를 보낼 때 ${vend === 'codex' ? 'Codex' : 'Claude'}가 전체 세션을 다시 읽으며, 이는 한도를 더 많이 사용합니다.`,
        ok: '모델 변경',
        remember: 'fb:askmodel'
      })
      if (!okGo) return
    }
    try { await api(`/sessions/${cur.id}/settings`, { body: p }); if (cur.alive && (running || state === 'awaiting_input')) say('이 턴이 끝나면 적용돼요') } catch (e) { say((e as Error).message) }
  }
  // J-1 · 이 화면이 어떤 기기인지 — 호스트가 origin·device 를 붙이고, 화면은 종류·손가락·열 수 있나·모드를 말한다
  const clientCtx = () => ({ tier: phone ? 'phone' : localBridge() ? 'desktop' : 'browser', touch, canOpenOnDevice: !!localBridge() && !phone, openMode: localBridge() ? (lcfgC?.openMode ?? '') : '' })
  const post = async (t: string) => { if (cur) await api(`/sessions/${cur.id}/send`, { body: { text: t, client: clientCtx() } }); else { const r = await api<{ sessionId: string }>(`/bots/${bot.id}/send`, { body: { text: t, name: '메인', client: clientCtx(), ...draft } }); await refreshAll(); onSession(r.sessionId) } }
  // ⚠ 대기열을 내보내는 일은 **부모**가 한다 — 보고 있지 않은 세션의 것도 나가야 하기 때문(위 머리말)
  const sendText = async (raw: string) => {
    let t = raw.trim(); if ((!t && !attach.length) || busy || uploading) return
    if (attach.length) t = `${t || '첨부한 파일을 봐 줘.'}\n\n첨부 파일 (읽어서 참고해):\n${attach.map((a) => (a.dir ? `- ${a.abs}/ (폴더 — 안의 파일들)` : `- ${a.abs}`)).join('\n')}`
    setText(''); setAttach([])
    // 보냈으면 초안은 그 자리에서 지운다. ⚠ 첫 메시지는 세션을 만들며 키가 `new` → 실제 id 로 바뀌므로
    //    지연 저장이 새 키에 대고 지우는 수가 있다 — 둘 다 명시적으로 치운다.
    try { localStorage.removeItem(draftRef.current); localStorage.removeItem(`fb:draft:${bot.id}:new`) } catch { /* */ }
    if (running || state === 'awaiting_input') { onQueue((q) => [...q, t]); return }
    setBusy(true); try { await post(t) } catch (e) { say((e as Error).message) } finally { setBusy(false) }
  }
  const send = () => sendText(text)
  /** ⏎ 가 보내기인 기기인가 — 폰 화면도 아니고 손가락 포인터도 아닐 때만 (위 `onKey` 머리말) */
  const touch = useMedia('(pointer: coarse)'); const [lcfgC] = useLocalSettings()
  const enterSends = !phone && !touch
  const sendKey = enterSends ? '⏎' : '⌘⏎'
  /**
   * 🔴 **볼트 안 파일은 복사하지 않는다** — 맥 앱은 놓인 파일의 진짜 경로를 안다(`pathOf`, preload 의 webUtils).
   *    호스트에 «이 경로가 볼트 안이냐» 를 물어(`exists` 가 절대 경로도 받는다) 안이면 그대로 첨부, 밖이면
   *    `첨부/` 에 복사한다. 브라우저·폰은 경로를 모르므로 언제나 복사다.
   * ⚠ 복사 중인 파일도 **칩으로 먼저 선다**(회전 표시) — 25MB 를 올리는 몇 초 동안 «놓았는데 아무 일도 없다» 로
   *    보이면 안 된다. 실패하면 그 칩만 빠지고 이유를 말한다.
   */
  const upload = async (raw: File[]) => {
    if (!raw.length) return
    // N-3 · 10개 · 합계 50MB — 넘치면 이유와 함께 거절(들어갈 수 있는 것만 넣는다)
    const room = attachRoom(attach, raw); const list = room.ok as File[]; if (room.reason) say(room.reason)
    if (!list.length) return; setUploading(true); let copied = 0
    try {
      for (const f of list) {
        const p = desk?.pathOf?.(f)
        if (p) {
          try { const ex = await api<Record<string, { rel: string; dir: boolean } | false>>(`/bots/${bot.id}/exists`, { body: { rels: [p] } }); const hit = ex[p]; if (hit) { addAtt({ rel: hit.rel, abs: p, dir: hit.dir }); continue } } catch { /* 호스트가 모르는 경로 — 복사로 */ }
        }
        const key = `pending:${f.name}:${Date.now()}:${Math.random()}`
        const thumb = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
        addAtt({ rel: key, abs: '', name: f.name, uploading: true, pct: 0, thumb, size: f.size })
        try { const r = await uploadFile(bot.id, f, (pct) => setAttach((a) => a.map((x) => (x.rel === key ? { ...x, pct } : x)))); const nn = r.rel.split('/').pop() ?? f.name; setAttach((a) => a.map((x) => (x.rel === key ? { rel: r.rel, abs: r.abs, uploaded: true, thumb, size: f.size } : x))); if (nn !== f.name) setText((t) => t.replace(`@${f.name}`, `@${nn}`)); copied++ }
        catch (e) { setAttach((a) => a.filter((x) => x.rel !== key)); setText((t) => t.replace(`@${f.name} `, '').replace(`@${f.name}`, '')); throw e }
      }
      if (copied) say(`${copied}개 복사했어요 → 첨부/${room.reason ? ' · ' + room.reason : ''}`)   // 거절 이유가 복사 안내에 덮이지 않게 한 줄로
    } catch (e) { say((e as Error).message) } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }
  /**
   * 🔴 **첨부는 글 속 `@이름` 토큰이다** (2026-09-15 Dave: «칩이 채팅 창 안으로 들어가야 해»). 입력창(InlineInput)이 그 토큰을
   *    칩으로 그린다. 그래서 첨부를 더하는 길은 하나 — 목록에 넣고 글에 토큰이 없으면 끝(또는 캐럿)에 붙인다.
   *    반대로 사람이 글에서 칩을 지우면(⌫) 토큰이 사라지고, 아래 효과가 목록에서도 뺀다. 두 표면이 어긋날 수 없다.
   */
  const attName = (a: Att) => a.name ?? (a.rel.replace(/\/+$/, '').split('/').pop() ?? a.rel)
  const hasTok = (t: string, name: string) => new RegExp(`(^|\\s)@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`).test(t)
  const caretEnd = useRef(false)
  const addAtt = (a: Att) => {
    setAttach((l) => (l.some((x) => x.rel === a.rel) ? l : [...l, a]))
    const name = attName(a)
    if (phone) return   // N-1 · 폰은 칩이 글 위 별도 행이라 글에 토큰을 안 넣는다(보낼 때 목록이 그대로 붙는다)
    setText((t) => { if (hasTok(t, name)) return t; caretEnd.current = true; return `${t}${t && !/\s$/.test(t) ? ' ' : ''}@${name} ` })
  }
  // 토큰을 끝에 붙였으면 캐럿도 끝으로 — 안 옮기면 옛 캐럿 자리에서 «@…» 를 읽어 @ 목록이 엉뚱하게 뜬다(실측 스크린샷)
  useEffect(() => { if (!caretEnd.current) return; caretEnd.current = false; setCaret(text.length); if (document.activeElement === taRef.current?.el()) taRef.current?.setSelection(text.length) }, [text])
  useEffect(() => {
    if (phone) return   // 폰은 토큰이 없다 — 칩의 ✕ 가 목록을 뺀다 (N-1)
    const names = new Set(Array.from(text.matchAll(/@([^\s@]+)/g)).map((m) => m[1]))
    setAttach((l) => (l.every((a) => names.has(attName(a))) ? l : l.filter((a) => names.has(attName(a)))))
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  const chipsByName = useMemo(() => Object.fromEntries(attach.map((a) => { const abs = a.abs || `${bot.abs}/첨부/${a.name ?? ''}`; return [attName(a), { abs, dir: a.dir, folder: chipParts(abs, bot.abs, !!a.dir).folder, busy: a.uploading, icon: <Icon n={a.dir ? 'folder' : 'doc'} size={11} color="var(--t3)" /> }] })), [attach, bot.abs])
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
    requestAnimationFrame(() => taRef.current?.setSelection(pos))
  }
  const pickAt = (f: FileNode) => { const name = f.rel.split('/').pop() ?? f.rel; const start = caret - (atQ?.length ?? 0) - 1; const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`; setText(next); setCaret(start + name.length + 2); addAtt({ rel: f.rel, abs: `${bot.abs}/${f.rel}`, dir: f.dir }); setDismissed(''); requestAnimationFrame(() => taRef.current?.setSelection(start + name.length + 2)) }
  const mention = (rel: string) => { const name = rel.split('/').pop() ?? rel; setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${name} `); addAtt({ rel, abs: `${bot.abs}/${rel}` }); taRef.current?.focus() }
  // 맥 메뉴의 «보내기» — 단축키(⌘⏎)와 **같은 길**로 들어온다
  useEffect(() => { const f = () => void send(); window.addEventListener('fb:send', f); return () => window.removeEventListener('fb:send', f) })
  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
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
              {sessions.map((x) => <button key={x.id} className={x.id === cur?.id ? 'on' : ''} onClick={() => onSession(x.id)}><span className={`dot ${stateDot(x.state)}`} /><span>{x.name}</span><VendorMark vendor={x.vendor} size={11} /><span style={{ flex: 1 }} /><span className="k">{x.hibernated ? '절전' : fmtTime(x.lastActivity)}</span></button>)}<hr /><button onClick={() => void newSession()}><Icon n="plus" size={12} /><span>새 세션</span></button>{cur ? <button onClick={async () => { const n = await askName('세션 이름', cur.name); if (n?.trim()) await api(`/sessions/${cur.id}/rename`, { body: { name: n.trim() } }) }}><Icon n="edit" size={12} /><span>이름 바꾸기</span></button> : null}{cur ? <button className="warn" onClick={async () => { if (confirm('이 세션 기록을 지울까요?')) { await api(`/sessions/${cur.id}`, { method: 'DELETE' }); await refreshAll() } }}><Icon n="x" size={12} /><span>세션 삭제</span></button> : null}</div> : null
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
  /**
   * 🔴 **칩은 실제 워커의 모드를 말해야 한다** (2026-09-18 Dave: «중간에 권한을 바꿨는데 그 이후에도 계속
   *    실행하기 전에 물어보네»). 모드는 스폰 인자라 이 턴이 끝나야 새 워커가 뜬다 — 그 사이 칩이 새 값만
   *    보여 주면 «바꿨는데 왜 물어봐» 가 된다. 그 사이는 호스트가 새 모드를 대신 집행하고(host/session.ts
   *    `autoAllow`), 칩에는 «적용 중» 을 단다. 데스크톱 푸터에만 있던 힌트는 폰에서 안 보였다.
   */
  const modePendTitle = '이 턴은 Folder Bot 이 새 모드대로 대신 답하고, 턴이 끝나면 새 모드로 이어서 재시작해요 (대화 유지)'
  const modeBtn = <button className={`cbtn ${pop === 'mode' ? 'on' : ''}`} onClick={() => setPop(pop === 'mode' ? '' : 'mode')} title={cur?.restartPending ? modePendTitle : '모드'}>{modeLabel(cfg.mode)}{cur?.restartPending ? <span className="pend">적용 중</span> : null}<span className="chev">▾</span></button>
  /**
   * 🔴 **고를 목록은 «이 세션의 벤더» 가 정한다** — Claude 목록을 Codex 세션에 보여 주면
   *    고르는 순간 CLI 가 «모델이 없다» 로 그 자리에서 죽는다(이름 체계가 다르다).
   */
  const vend = cur?.vendor ?? bot.vendor
  // ⚠ 모델 목록은 모듈 한 곳에 있다 — 새로 받아 오면 이 화면도 다시 그린다(`consts.ts` 의 `onModels`)
  const [modelTick, setModelTick] = useState(0)
  useEffect(() => onModels(() => setModelTick((n) => n + 1)), [])
  void modelTick
  const modelList = modelsFor(vend), effortList = effortsFor(vend)
  // 「더 많은 모델」 — 긴 문맥(1M) 과 기계에서 주워 온 이름. 평소엔 접혀 있다
  const moreList = moreModelsFor(vend)
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => { if (pop !== 'model') setMoreOpen(false) }, [pop])
  // 🔴 여는 순간 한 번 더 물어본다 — 켜 둔 채 CLI 를 업데이트해도 목록이 따라온다 (2026-09-15 Dave)
  const modelBtn = <button className={`cbtn ${pop === 'model' ? 'on' : ''}`} onClick={() => { if (pop !== 'model') void refreshModels(); setPop(pop === 'model' ? '' : 'model') }} title="모델">{modelLabel(cfg.model, vend)}{phone ? <span className="chev">▾</span> : null}</button>
  const effortBtn = <button className={`cbtn ${pop === 'effort' ? 'on' : ''}`} onClick={() => setPop(pop === 'effort' ? '' : 'effort')} title="노력">{effortLabel(cfg.effort, vend)}{phone ? <span className="chev">▾</span> : null}</button>
  const ringBtn = <button className={`ring ${pct >= 80 ? 'hot' : ''}`} onClick={() => setPop(pop === 'ctx' ? '' : 'ctx')} title={ctx ? `컨텍스트 ${pct}%` : '컨텍스트'}><Ring pct={pct} size={phone ? 20 : 18} />{pct >= 80 && !phone ? <span style={{ fontSize: 11.5, marginLeft: 4 }}>압축</span> : null}</button>
  const plusBtn = <button className={phone ? 'plusb' : `cbtn ${pop === 'plus' ? 'on' : ''}`} style={phone ? undefined : { padding: '3px 6px' }} title="첨부" onClick={() => setPop(pop === 'plus' ? '' : 'plus')} disabled={uploading}><Icon n="plus" size={phone ? 20 : 14} /></button>
  const sendBtn = mode === 'stop' ? <button className="sendb" onClick={() => cur && api(`/sessions/${cur.id}/interrupt`, { body: {} })} title="중단"><Icon n="stop" size={phone ? 14 : 11} /></button>
    : mode === 'off' && phone ? <span className="sendb mic"><Icon n="mic" size={20} /></span>
      /**
       * 🔴 **보내기 단추는 초점을 뺏지 않는다** (2026-09-22 실측). 누르는 순간 입력칸에서 초점이 빠지면 키보드가 닫히고,
       *    그 바람에 입력칸이 제자리를 다시 잡느라 **mousedown 과 mouseup 사이에 단추가 움직여 click 이 아예 안 난다** —
       *    폰에서 보내기가 «눌리지도 않고 아무 일도 안 일어나는» 정체가 이것이었다(Z 의 하단 탭이 들어오며 드러났다).
       *    보낸 뒤에도 키보드가 남아 있는 것이 사람이 바라는 동작이기도 하다.
       */
      : <button className={`sendb ${mode === 'off' ? 'off' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={send} disabled={mode === 'off' || busy || uploading} title={mode === 'queue' ? `대기열에 넣기 (${sendKey})` : `보내기 (${sendKey})`}><Icon n="up" size={phone ? 16 : 12} />{mode === 'queue' ? <span className="bd">+{queue.length + 1}</span> : null}</button>
  const popEl = pop === 'mode' ? <div className="cpop"><div className="h">모드 · 이 세션</div>{MODES.map((m, i) => <button key={m.v} className={`prow2 ${cfg.mode === m.v ? 'on' : ''}`} onClick={() => void applyCfg({ permissionMode: m.v })}><div className="t"><b>{m.t}</b><small>{m.d}</small></div>{cfg.mode === m.v ? <Icon n="check" size={13} /> : <span className="k">{i + 1}</span>}</button>)}<div className="hint"><span>1~4</span><span className="sp" /><span>새 세션은 설정의 기본값으로</span></div>{cur?.restartPending ? <div className="hint pend">{modePendTitle}</div> : null}</div>
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
    : pop === 'ctx' ? <div className="cpop r ctxpop"><div className={`big ${pct >= 80 ? 'hot' : ''}`}><Ring pct={pct} size={40} stroke={3} /><div><b>컨텍스트 {ctx ? `${pct}%` : '—'}</b><small>{ctx ? `${fmtK(ctx.used)} / ${fmtK(ctx.window)} 토큰 · 이 세션` : '첫 답이 오면 잽니다'}</small></div></div><hr /><button className="prow2" onClick={() => { setPop(''); void sendText('/compact') }}><div className="t"><b>/compact 압축</b><small>대화를 요약해 컨텍스트를 줄여요</small></div></button><div className="hint"><span>80% 를 넘으면 링이 주황</span></div></div>
    : pop === 'plus' ? <div className="cpop plus">{phone ? <><button className="prow2" onClick={() => { setPop(''); camRef.current?.click() }}><span className="ic-cam" /><div className="t"><b>카메라로 찍기</b></div></button><button className="prow2" onClick={() => { setPop(''); photoRef.current?.click() }}><Icon n="file" size={14} color="var(--t3)" /><div className="t"><b>사진에서 고르기</b><small>여러 장 · 보관함 바로 열림</small></div></button></> : null}{bot.orchestrator ? null : <button className="prow2" onClick={() => { setPop(''); openRoutine() }}><Icon n="clock" size={14} color="var(--t3)" /><div className="t"><b>루틴으로 만들기</b><small>{routinePeek()}</small></div></button>}<button className="prow2" onClick={() => { setPop(''); fileRef.current?.click() }}><Icon n="phone" size={14} color="var(--t3)" /><div className="t"><b>이 기기에서 파일 올리기</b></div><span className="k">→ 첨부/</span></button><button className="prow2" onClick={() => { setPop(''); setPickOpen(true) }}><Icon n="folder" size={14} color="var(--t3)" /><div className="t"><b>{bot.orchestrator ? '볼트' : '이 폴더'}에서 고르기</b></div></button>{docTabs.length ? <button className="prow2" onClick={() => { setPop(''); for (const rel of docTabs) addAtt({ rel, abs: `${bot.abs}/${rel}` }) }}><Icon n="doc" size={14} color="var(--t3)" /><div className="t"><b>열린 문서 첨부 ({docTabs.length})</b></div></button> : null}<hr /><button className="prow2" onClick={() => { setPop(''); setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@`); setCaret(text.length + 1); taRef.current?.focus() }}><span className="mono" style={{ width: 14, textAlign: 'center', color: 'var(--t3)' }}>@</span><div className="t"><b>@ 로 이름 쳐서 넣기</b></div></button><div className="hint"><span>{phone ? '사진 앱에서 복사한 이미지는 길게 눌러 붙여넣기' : '스크린샷은 ⌘V 로 붙여 넣으면 첨부/ 에 저장'}</span></div></div>
    : slashQ !== null && slashList.length ? <div className="cpop">{(['skill', 'cli'] as const).map((grp) => { const l = slashList.filter((c) => (grp === 'skill' ? c.kind !== 'cli' : c.kind === 'cli')); return l.length ? <div key={grp}><div className="h">{grp === 'skill' ? '스킬 · 이 폴더' : '명령'}</div>{l.map((c) => { const i = slashList.indexOf(c); return <button key={c.name} className={`prow2 ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pickSlash(c)}><div className="t"><b>/{c.name}</b>{c.desc ? <small>{c.desc}</small> : null}</div>{i === sel ? <span className="k">⏎</span> : c.scope !== 'cli' && c.scope !== 'folder' ? <span className="k">{c.scope}</span> : null}</button> })}</div> : null })}<div className="hint"><span>↑↓ 이동</span><span>Tab · ⏎ 선택</span><span>⎋ 닫기</span><span className="sp" /><span>{slashList.length}개</span></div></div>
    : atQ !== null && atList.length ? <div className="cpop"><div className="h">{docTabs.length ? '열린 문서 먼저 · ' : ''}이 폴더{atQ ? ` · «${atQ}»` : ''}</div>{atList.map((f, i) => { const name = f.rel.split('/').pop() ?? f.rel; const dir = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) + '/' : ''; return <button key={f.rel} className={`prow2 ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pickAt(f)}><Icon n={f.dir ? 'folder' : 'doc'} size={14} color="var(--t3)" /><div className="t"><b>{name}</b><small>{f.dir ? `폴더째${dir ? ` · ${dir}` : ''}` : dir || (docTabs.includes(f.rel) ? '열림' : '')}</small></div>{i === sel ? <span className="k">⏎</span> : null}</button> })}<div className="hint"><span>↑↓ 이동</span><span>⏎ 넣기</span><span className="sp" /><span>이름 · 경로로 찾음</span></div></div>
    : null
  /**
   * 🔴 **놓을 자리는 입력창이 아니라 채팅 열 전체다** (2026-09-15 목업 확정). 종전에는 입력창 상자 안에만 놓을 수
   *    있었고, 대화 위에 놓으면 아무 일도 없었다(창 밖으로 떠나거나). 들어오는 순간 점선과 안내 카드가 뜬다.
   * ⚠ dragenter/leave 는 자식으로 옮길 때마다 짝으로 온다 — 세어서(`dragN`) 0 이 될 때만 걷는다. 안 세면 깜빡인다.
   */
  const dragKind = (dt: DataTransfer): '' | 'tree' | 'files' => (dt.types.includes('text/x-fb-rel') ? 'tree' : dt.types.includes('Files') ? 'files' : '')
  const dropHere = (e: React.DragEvent) => {
    dragN.current = 0; setDrop('')
    const k = dragKind(e.dataTransfer); if (!k) return
    e.preventDefault()
    if (k === 'tree') {
      let rels: string[] = []
      try { rels = JSON.parse(e.dataTransfer.getData('text/x-fb-rels') || '[]') as string[] } catch { rels = [] }
      if (!rels.length) rels = [e.dataTransfer.getData('text/x-fb-rel')]
      const dir1 = e.dataTransfer.getData('text/x-fb-dir') === '1'
      for (const rel of rels.filter(Boolean)) addAtt({ rel, abs: `${bot.abs}/${rel}`, dir: rels.length === 1 ? dir1 : undefined })
      return
    }
    if (e.dataTransfer.files.length) void upload(Array.from(e.dataTransfer.files))
  }
  // H · 쓸기는 App(.cols) 이 맡는다(세 칸 띠). 드릴인 중의 👉 만 여기서 먼저 받아 드릴에서 나온다 — preventDefault 하면 서랍은 안 열린다
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent).detail === 'back' && drillSub) { e.preventDefault(); setDrill(null) } }; window.addEventListener('fb:nav', f); return () => window.removeEventListener('fb:nav', f) }, [drillSub])
  return <div className="col chat" style={{ flex: 1 }} ref={colRef}
    onDragEnter={(e) => { const k = dragKind(e.dataTransfer); if (!k) return; e.preventDefault(); dragN.current++; setDrop(k); setDropN(e.dataTransfer.items?.length ?? 0) }}
    onDragOver={(e) => { const k = dragKind(e.dataTransfer); if (!k) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
    onDragLeave={() => { if (!dragN.current) return; dragN.current -= 1; if (!dragN.current) setDrop('') }}
    onDrop={dropHere}>
    {drop ? <div className="dropzone"><div className="card"><FolderBot color={bot.color} size={40} mood="idle" /><b>{bot.name}에게 첨부</b><small>{drop === 'tree' ? '놓으면 이 대화에 첨부해요' : <>볼트 안 파일은 그대로 첨부 · 밖의 파일은 <span className="mono">첨부/</span> 에 복사한 뒤 첨부</>}</small>{drop === 'files' && dropN ? <span className="n">파일 {dropN}개</span> : null}</div></div> : null}
    <div className={`hdr chat-hdr ${phone ? '' : 'glass'}`}>
      {/* H-5 · 좁음 헤더 한 줄 — ☰(레일 서랍 · H 전까지는 봇 목록으로) · 표시 이름 · 작업 중 ●. ‹·폴더 아이콘은 없다(폴더는 독의 📄 · 쓸기) */}
      {phone ? <><button className="rb glassb hb-menu" onClick={drillSub ? () => setDrill(null) : onBack} title={drillSub ? '메인 대화로' : '봇 목록'}><Icon n={drillSub ? 'back' : 'list'} size={20} /></button>
        {/* 감싸는 span 은 헤더의 flex 아이템 — 폭이 내용에 의존하는데 알약이 그 100% − 118px 을 최대폭으로 삼아 스스로를 눌러 이름이 «2026-…» 로 잘렸다(2026-09-13 Dave). 알약 최대폭은 감싸는 칸의 100%, 칸이 남는 공간을 받는다 */}
        <span className="hname" style={{ position: 'relative' }}><button className="hnb" onClick={() => setSessMenu(!sessMenu)} title={cur?.name ?? '세션'}>{drillSub ? <b className="dn">{drillSub.name}</b> : <BotName b={bot} chip={false} />}{chatHolder === 'other' ? <span className="dot hold" title="남을 기다리는 중" /> : running ? <span className="dot run" title="작업 중" /> : state === 'awaiting_input' ? <span className="dot wait" /> : null}</button>{sessMenuEl}</span>
        <span className="sp" /></>
        : drillSub ? <><button className="ib" onClick={() => setDrill(null)} title="메인 대화로"><Icon n="back" size={14} /></button><span style={{ color: 'var(--t3)' }}>/</span><span className="ttl">{drillSub.name}</span>{drillSub.status === 'run' ? <span className="spin run" /> : <Icon n={drillSub.status === 'error' ? 'x' : 'check'} size={11} color={drillSub.status === 'error' ? 'var(--err)' : 'var(--done)'} />}<span style={{ color: 'var(--t3)', fontSize: 12, whiteSpace: 'nowrap' }}>도구 {drillSub.tools}</span><span className="sp" /></>
          : <><FolderBot color={bot.color} size={16} mood={moodOf(state, !!cur?.hibernated, chatHolder)} mono /><span className="ttl" title={bot.name}><Mid s={bot.displayName} /></span><VendorMark vendor={cur?.vendor} size={12} />
            {/* AB · 헤더 한 줄 — 레일·대기 줄과 **같은 값**에서 나온다 */}
            {chatHolder === 'other' ? <span className="hstate"><i />{holdHeader(chatHolder, cur?.inflight, cur?.bg ?? 0)}</span> : null}
            <span style={{ position: 'relative', flex: 'none' }}><button onClick={() => setSessMenu(!sessMenu)} style={{ color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>{cur?.name ?? '새 대화'} <Icon n="chevd" size={10} /></button>{sessMenuEl}</span>
            <span className={`dot ${stateDot(state)}`} /><span className="sp" />
            <div className="acts"><button className={`ib ${docOn ? 'on' : ''}`} onClick={onDocToggle} title="문서 열 (⌘⇧D)"><Icon n="doc" size={14} />{!docOn && docBadge ? <span className="bd">{docBadge}</span> : null}</button></div></>}
    </div>
    {routineDraft ? <RoutineSheet bot={bot} draft={routineDraft} onClose={() => setRoutineDraft(null)} /> : null}
    {/* Q-2 (2026-09-19 Dave: «이전처럼 라운드 칩이 더 좋았다 · 바로 위 질문이 항상 상단 고정 · 더 올리면 그 이전 질문») — N-2 의 흐름 안 헤더(.qhdr)는 폐기. 폰·데스크톱 모두 유리 알약 하나, 탭하면 그 질문으로 */}
    {pinnedItem && !drill ? <button className="pinq glassb" onClick={() => { const sc = scRef.current; const el = sc?.querySelector<HTMLElement>(`.umsg[data-id="${CSS.escape(pinnedItem.id)}"]`); if (!sc || !el) return; /* 알약 바로 아래에 질문이 오게 — 맨 위에 붙이면 알약(그 앞 질문)이 첫 줄을 가린다 */ sc.scrollTo({ top: sc.scrollTop + (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - (phone ? 56 : 48), behavior: 'smooth' }) }} title="이 질문으로">{pinnedItem.text}</button> : null}
    <div className="chat-scroll" ref={scRef} data-autoscroll="1">
      <div className="chat-body">
        {!cur && !drill ? <div className="empty" style={{ flex: 1 }}><FolderBot color={bot.color} size={40} mood="idle" /><div><b>{bot.name}</b>{bot.orchestrator ? ' — 볼트 전체를 보는 관제 봇이에요. "지금 뭐 돌고 있어?", "Inbox 정리해 줘", "X 폴더에서 시작해".' : ' 봇이에요. 이 폴더의 지침·기억·자료를 들고 일해요.'}</div></div> : null}
        {drillSub ? <div className="drill-p"><div className="meta" style={{ cursor: 'default' }}>무엇을 시켰나</div><div className="tx">{drillSub.prompt || drillSub.name}</div><hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0', width: '100%' }} /></div> : null}
        <SidCtx.Provider value={{ sid: cur?.id ?? '', botId: bot.id }}>{rows.map((r) => r.k === 'group'
          ? <ToolGroup key={r.items[0].id} items={r.items} endT={r.endT} base={bot.abs} onFile={(p) => { const rel = relOf(p); if (rel) onFile(rel) }} />
          : <Item key={r.it.id} it={r.it} bot={bot} items={items} onFile={(p) => onFile(p)} onReveal={onReveal} onDrill={(id) => setDrill(id)} state={state} say={say} isLastAssistant={r.it.id === lastAssistant} isLastUser={r.it.id === lastUser?.id} userRef={lastUserRef} onRetry={lastUser ? () => void sendText(lastUser.text) : undefined} />)}</SidCtx.Provider>
        {cur && !drill ? pending.map((p) => <PermCard key={p.requestId} p={p} sid={cur.id} />) : null}
        {/* O · 본문과 상태 줄 사이는 8px 고정 — 남는 공간은 상태 줄 **뒤**로 보낸다(종전엔 스페이서가 앞에 있어 큰 빈 공간이 생겼다) */}
        {/* AB · 🔴 턴이 끝나도 `bg` 가 남아 있으면 대기 줄은 남는다 — 사라지는 순간이 「끝났나?」의 정체였다 */}
        {cur && (running || state === 'awaiting_input' || (cur.bg ?? 0) > 0) ? <Live cur={cur} state={state} color={bot.color} /> : null}
        <div style={{ flex: 1 }} />
        <div ref={endRef} />
      </div>
    </div>
    <button className={`tobot rb glassb${showJump || (streaming && !atBottom) ? '' : ' off'}${streaming && !atBottom ? ' newc' : ''}`} onClick={() => { const el = scRef.current; if (el) { smoothUntilRef.current = performance.now() + 900; atBottomRef.current = true; setAtBottom(true); el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) } }} title="최근으로" tabIndex={showJump ? 0 : -1} aria-hidden={!showJump && !(streaming && !atBottom)}><Icon n="chevd" size={16} />{streaming && !atBottom ? <span className="nc">새 내용</span> : streaming ? <span className="dot run" /> : null}</button>
    <div className="chat-foot" ref={footRef}>
      {/* 🔴 **대기 메시지는 고칠 수 있어야 한다** (2026-09-14 Dave: «현재 대기 메시지 수정이 안돼»).
          아직 안 보낸 말이다 — 못 고치면 지우고 처음부터 다시 쓰는 수밖에 없었다.
          ⚠ 여기의 ⏎ 는 **고치기 끝**이다(보내기가 아니다) · ⎋ 는 되돌리기. ⛔ 빈 글로 두면 그 줄은 사라진다. */}
      {queue.map((q, i) => <QueueRow key={i} n={i + 1} text={q}
        onSave={(v) => onQueue((l) => (v.trim() ? l.map((x, k) => (k === i ? v : x)) : l.filter((_, k) => k !== i)))}
        onDrop={() => onQueue((l) => l.filter((_, k) => k !== i))} />)}
      {/* 🔴 **입력창의 링크도 아이콘을 갖는다** (2026-09-13 Dave). ⚠ `textarea` 안에는 그림을 못 넣는다 —
          글자만 담는 칸이다. 그래서 쓰는 중인 주소를 **입력칸 위 칩**으로 올린다: 같은 캐시, 같은 아이콘,
          그리고 «이 주소가 맞나» 를 보내기 전에 확인할 수 있다. */}
      {draftLinks.length ? <div className="files lchips">{draftLinks.map((u) => <LinkChip key={u} url={u} />)}</div> : null}
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
      {/* N-4 · 📷 사진(여러 장) · 카메라로 찍기 — 둘 다 폰만. 사진은 2단계로 끝난다 */}
      <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      {phone ? <div className="cchips">{modeBtn}{modelBtn}{effortBtn}</div> : null}
      <div className={`composer glassb ${text.includes('\n') || text.length > (phone ? 24 : 40) ? 'multi' : ''} ${phone ? 'ph' : ''}`}
        onPaste={(e) => { const fromItems = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f); const imgs = fromItems.length ? fromItems : Array.from(e.clipboardData.files ?? []).filter((f) => f.type.startsWith('image/'));   /* N-4 · 폰 클립보드는 files 로 온다 */ if (imgs.length) { e.preventDefault(); const d = new Date(); void upload(imgs.map((f, i) => new File([f], `스크린샷_${d.getHours()}${String(d.getMinutes()).padStart(2, '0')}${i ? `-${i + 1}` : ''}.${(f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')}`, { type: f.type }))) } }}>
        {popEl}
        {phone && attach.length ? <div className="achips">{attach.map((a) => <span key={a.rel} className={`achip ${a.uploading ? 'up' : ''}`} title={a.abs || a.name}>{a.thumb ? <img src={a.thumb} alt="" /> : <span className="ai"><Icon n={a.dir ? 'folder' : 'doc'} size={14} /></span>}{a.uploading ? <span className="ring"><Ring pct={a.pct ?? 0} size={16} stroke={2} /></span> : null}<span className="nm">{attName(a)}</span><button className="x" onClick={() => { if (a.thumb) URL.revokeObjectURL(a.thumb); setAttach((l) => l.filter((x) => x.rel !== a.rel)) }} title="빼기"><Icon n="x" size={11} /></button></span>)}</div> : null}
        {/* Q-1 (2026-09-19 Dave: «+ 하나만 있는 UX가 더 좋아 · 2스텝 안에 카메라/이미지첨부») — 📷 단추는 뺐다. 카메라·사진은 + 메뉴 첫 두 줄 */}
        {phone ? <div className="cleft">{plusBtn}</div> : null}
        <div className={phone ? 'ctext' : 'crow'}>
          <InlineInput ref={taRef} placeholder={drill ? '메인 대화로 보냅니다 — 이 안에는 직접 말을 걸 수 없어요' : running ? `보내면 대기열에 들어갑니다 (${sendKey})` : state === 'awaiting_input' ? '답을 기다리는 중 — 보내면 대기열에' : enterSends ? '메시지…  ⏎ 보내기 · ⇧⏎ 줄 바꿈 · / 스킬 · @ 파일' : '메시지…  / 스킬 · @ 파일'} value={text} chips={chipsByName} onChange={(t, c) => { setText(t); setCaret(c) }} onCaret={setCaret} onKeyDown={onKey} onFocus={() => { if (phone) stickBottom() }} onChipClick={(name) => { const a = attach.find((x) => attName(x) === name); if (a && !a.uploading && !a.dir) onFile(a.rel) }} />
        </div>
        {phone ? <div className={`cright ${uploading ? 'dis' : ''}`}>{ringBtn}{sendBtn}</div> : null}
        {!phone ? <div className="cbar">{modeBtn}{plusBtn}{attach.length ? <span className="acount">첨부 {attach.length}개 · 봇이 읽어서 참고</span> : null}<span className="sp" />{modelBtn}{effortBtn}{ringBtn}{sendBtn}</div> : null}
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

/**
 * AB · **대기 줄** (2026-09-23 Dave 「B안」) — 마지막 말 **뒤**에 붙는 한 줄. 말풍선이 아니고 복사·되돌리기가 없어
 * **«아직 안 끝났다» 가 생김새로** 보인다. 누가 · 무엇을 · **얼마나 됐나** 를 적는다.
 * 🔴 **턴이 끝나도 남이 일하면 남아 있는다**(`bg`) — 종전에는 그 순간 이 줄이 통째로 사라져 「끝났나?」가 됐다.
 * 🔴 **2분이 넘으면 화면이 먼저 «가도 된다» 고 말한다** — 기다림에서 가장 필요한 한 마디다.
 */
function Live({ cur, state, color, onOpenBg }: { cur: SessionInfo; state: string; color: string; onOpenBg?: () => void }) {
  const [, tick] = useState(0)
  const from = cur.turnStartedAt ?? cur.inflight?.since ?? cur.lastActivity ?? Date.now()
  const holder = holderOf(state as SessionState, cur.inflight, Date.now(), cur.bg ?? 0)
  // 1초마다 다시 그린다 — 경과와 «30초 · 2분» 단계가 시간으로 바뀐다
  useEffect(() => { if (holder === 'none') return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [holder])
  if (holder === 'none') return null
  if (holder === 'you') return <div className="live"><span className="glow" /><span className="tx">확인 대기 — 위 요청에 응답해 주세요</span><span className="el"><Elapsed from={cur.turnStartedAt} /></span></div>
  const ms = Math.max(0, Date.now() - from)
  const a = cur.activity ?? ''
  if (holder === 'me') return <div className="live run work">
    <FolderBot color={color} size={22} mood="work" work={workMood(a)} mono />
    <span className="el mono"><Elapsed from={cur.turnStartedAt} /></span>
    <span className="sl">·</span>
    <span className="tx">{workLabel(a)}</span>
    <span className="sp" />
    {/* ⛔ **여기에 중단 단추를 다시 두지 마라** (2026-09-14 Dave). 중단은 입력줄의 것 하나다. */}
  </div>
  const L = holdLine(holder, cur.inflight, ms, cur.bg ?? 0)
  return <div className="live hold">
    <FolderBot color={color} size={22} mood="hold" mono />
    <span className="bounce"><i /><i /><i /></span>
    <span className="tx">{L.text}</span>
    {L.elapsed ? <span className="el mono">{L.elapsed}</span> : null}
    <span className="sp" />
    {L.action === 'open' && onOpenBg ? <button className="hact" onClick={onOpenBg}>{L.actionLabel}</button> : null}
    {/* 「알림 켜기」 — 끝났을 때 폰으로 알리도록 설정의 알림 칸을 연다(자리를 떠도 되게 하는 것이 이 단추의 일이다) */}
    {L.action === 'notify' ? <button className="hact" onClick={() => window.dispatchEvent(new CustomEvent('fb:settings', { detail: 'notify' }))}>{L.actionLabel}</button> : null}
  </div>
}

/**
 * 파일 칩 (B안, 2026-09-15 Dave 선택) — **이름이 본체, 폴더는 뒤의 작은 표식**, 전체 경로는 올렸을 때 툴팁.
 * 손댄 파일(답 아래) · 첨부(입력창 위) · 내 말풍선 아래가 **같은 칩**이다 — 세 자리가 다르게 생기면 «같은 파일인가» 를
 * 사람이 대조해야 한다. 조각 나누기는 core/chipName 이 한다(유닛테스트).
 */
function FileChip({ abs, dir, botAbs, botId, rel, onClick, tail, busy }: { abs: string; dir?: boolean; botAbs: string; botId?: string; rel?: string; onClick?: () => void; tail?: ReactNode; busy?: boolean }) {
  const p = chipParts(abs, botAbs, !!dir)
  const r = rel ?? (abs.startsWith(botAbs + '/') ? abs.slice(botAbs.length + 1) : undefined)
  return <button type="button" className={`chip fchip ${dir ? 'dir' : ''} ${busy ? 'busy' : ''}`} data-tip={busy ? undefined : abs} onClick={onClick} ref={!dir && !busy && r && botId ? hoverRef({ kind: 'file', botId, rel: r }) : undefined}>
    {busy ? <span className="spin" /> : <Icon n={dir ? 'folder' : 'doc'} size={11} color="var(--t3)" />}<span className="nm">{p.name}</span>{p.folder ? <span className="fb">{p.folder}</span> : null}{tail}
  </button>
}
/** 어느 세션의 줄인가 — 「전후 diff」 가 «전» 을 찾을 때 쓴다. 줄마다 prop 으로 내리면 ToolLine·Item 셋을 다 바꿔야 한다 */
const SidCtx = createContext<{ sid: string; botId: string }>({ sid: '', botId: '' })
function DiffBtn({ abs, onOpen }: { abs: string; onOpen: () => void }) {
  const { sid, botId } = useContext(SidCtx)
  return <button type="button" className="dchip" title="전후 비교" onClick={() => showDiff({ botId, sid, abs, onOpen })}><Icon n="diff" size={11} /></button>
}
function Item({ it, bot, items, onFile, onReveal, onDrill, state, say, isLastAssistant, isLastUser, userRef, onRetry }: { it: ChatItem; bot: Bot; items: ChatItem[]; onFile: (p: string) => void; onReveal: (rel: string) => void; onDrill: (id: string) => void; state: string; say: (m: string) => void; isLastAssistant: boolean; isLastUser: boolean; userRef: React.MutableRefObject<HTMLDivElement | null>; onRetry?: () => void }) {
  const [open, setOpen] = useState(false)
  switch (it.kind) {
    case 'user': {
      /**
       * 🔴 **내가 붙인 첨부는 글자가 아니라 칩이다** (2026-09-15 Dave: «채팅 안의 폴더 및 파일 칩도 구현이 안되어
       *    있어»). 봇에게는 «첨부 파일 (읽어서 참고해): - /abs/…» 가 글자로 가지만, 사람에게 그 꼬리를 그대로
       *    보여 주면 지시문 아래 경로 목록이 늘어선다. 꼬리는 떼어 칩으로, 본문의 `@이름` 도 그 칩과 같은 칩으로.
       */
      const { body, files } = splitAttach(it.text)
      const relOfAbs = (abs: string) => (abs.startsWith(bot.abs + '/') ? abs.slice(bot.abs.length + 1) : abs === bot.abs ? '' : null)
      const openRef = (f: { abs: string; dir: boolean }) => { if (f.dir) { const r = relOfAbs(f.abs); if (r !== null) onReveal(r) } else onFile(f.abs) }
      const chipOf = (f: { abs: string; dir: boolean; name: string }, k: string) => <button key={k} type="button" className={`pchip ${f.dir ? 'dir' : ''}`} title={f.abs} onClick={() => openRef(f)} ref={f.dir ? undefined : (el) => { const r = relOfAbs(f.abs); if (el && r) hoverable(el, { kind: 'file', botId: bot.id, rel: r }) }}>{f.dir ? <Icon n="folder" size={11} /> : null}<span>{f.name}</span></button>
      const parts: ReactNode[] = []
      if (files.length) {
        const re = /@([^\s@]+)/g; let last = 0; let m: RegExpExecArray | null
        while ((m = re.exec(body))) { const f = files.find((x) => x.name === m![1]); if (!f) continue; parts.push(body.slice(last, m.index)); parts.push(chipOf(f, `m${m.index}`)); last = m.index + m[0].length }
        parts.push(body.slice(last))
      }
      return <div className={`umsg ${isLastUser ? 'last' : ''}`} data-id={it.id} ref={isLastUser ? userRef : undefined}>{/* J-4 · 어느 기기에서 보냈나 — 호스트가 아닌 기기만 표시 */}{it.from && !it.from.main ? <span className="dev" title={`${it.from.device} 에서 보냄`}><Icon n={it.from.tier === 'phone' ? 'phone' : 'panel'} size={10} />{it.from.tier === 'phone' ? '폰' : '원격'} · {it.from.device}</span> : null}{files.length ? parts : it.text}{files.length ? <div className="files uatt">{files.map((f, i) => <FileChip key={`a${i}`} abs={f.abs} dir={f.dir} botAbs={bot.abs} botId={bot.id} onClick={() => openRef(f)} />)}</div> : null}</div>
    }
    case 'assistant': return <div className="amsg"><Md text={it.text || ' '} streaming={!!it.streaming} botId={bot.id} onPath={onFile} onDir={onReveal} />{/* 답 아래 줄 — 🔴 **아이콘만** (2026-09-13 Dave: «복사 및 기능들을 아이콘으로»). 글자를 빼면
            답과 답 사이가 조용해지고, 무엇을 하는지는 툴팁이 말한다. ⚠ 시각은 남긴다(언제 온 답인지) */}
        {!it.streaming && isLastAssistant ? <div className="acts-row"><button className="ib" onClick={() => void copySay(it.text, say)} title="답 복사"><Icon n="copy" size={14} /></button>{onRetry && state !== 'running' ? <button className="ib" onClick={onRetry} title="같은 질문 다시"><Icon n="undo" size={14} /></button> : null}<span>{fmtTime(it.t)}</span></div> : null}</div>
    case 'thinking': return <div><button className={`meta ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}><span className="lb">생각</span>{!open ? <span className="tx">· {it.text.trim() ? it.text.replace(/\s+/g, ' ').slice(0, 100) : it.streaming ? '생각 중…' : '(내용 없음)'}</span> : null}<Icon n={open ? 'chevd' : 'chev'} size={9} /></button>{open ? <div className="think">{it.text.trim() ? it.text : it.streaming ? '생각 중…' : 'Claude Code 가 headless 출력에서는 생각 내용을 주지 않아요 (서명만 옵니다).'}</div> : null}</div>
    case 'tool': return <ToolLine it={it} onFile={onFile} base={bot.abs} />
    case 'subagent': { const kids = items.filter((x) => x.kind === 'tool' && x.parentId === it.id) as Tool[]; return <div className="sub"><div className="l"><button className="ib" style={{ width: 18, height: 18, marginLeft: -4 }} onClick={() => setOpen(!open)}><Icon n={open ? 'chevd' : 'sub'} size={12} /></button><span className="nm">{it.name}</span>{it.status === 'run' ? <span className="spin run" /> : <Icon n={it.status === 'error' ? 'x' : 'check'} size={11} color={it.status === 'error' ? 'var(--err)' : 'var(--done)'} />}<span className="m"><span className="w">{it.status === 'run' ? '실행 중' : it.status === 'error' ? '실패' : '끝남'} · 도구 {it.tools}회</span><span className="ic" title={`도구 ${it.tools}회`}><Icon n="task" size={11} />{it.tools}</span>{it.last ? <> · <span className="mono">{it.last}</span></> : null}</span><button className="op" onClick={() => onDrill(it.id)} title="열기"><span className="w">열기</span><Icon n="chev" size={10} /></button></div>{open ? <div className="in">{kids.slice(-4).map((k) => <ToolLine key={k.id} it={k} onFile={onFile} base={bot.abs} />)}{it.result && it.status !== 'run' ? <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>{it.result.slice(0, 300)}</div> : null}{!kids.length ? <div className="meta">아직 도구를 안 썼어요</div> : null}</div> : null}</div> }
    case 'todos': return <TodoWidget it={it} stopped={state !== 'running'} />
    // 루프 6/10 — 칩 옆의 ⇄ 가 «이 턴이 손대기 전 ↔ 지금» 을 연다
    case 'files': { const list = open ? it.paths : it.paths.slice(0, 4); return <div className="files">{list.map((p) => <span key={p} className="fpair"><FileChip abs={p} botAbs={bot.abs} botId={bot.id} onClick={() => onFile(p)} /><DiffBtn abs={p} onOpen={() => onFile(p)} /></span>)}{it.paths.length > list.length ? <button type="button" className="chip more" onClick={() => setOpen(true)} title="나머지 펼치기">+{it.paths.length - list.length}</button> : null}</div> }
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
    {open ? <div className="det">{fp ? <span className="fpair" style={{ marginBottom: 6 }}><button className="chip" onClick={() => onFile(fp)}><span>{fp.split('/').pop()}</span></button>{kind === 'edit' ? <DiffBtn abs={fp} onOpen={() => onFile(fp)} /> : null}</span> : null}{diff ? <>{(it.input?.old_string as string).split('\n').map((l, i) => <div key={`a${i}`} style={{ color: 'var(--err)' }}>- {l}</div>)}{(it.input?.new_string as string).split('\n').map((l, i) => <div key={`b${i}`} style={{ color: 'var(--done)' }}>+ {l}</div>)}</> : JSON.stringify(it.input, null, 1).slice(0, 1200)}{it.result ? `\n\n${it.result}` : ''}</div> : null}</div>
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
  /**
   * 🔴 **「기타」 칸은 질문마다 따로다** (2026-09-15 Dave: *«AskUserQuestion 에서 추가 Text를 입력하면
   *    위에 전체에 나오네»* — 한 칸에 친 글이 **모든 질문의 기타 줄에 똑같이** 떴다).
   *    글 상자가 하나뿐이었다. 게다가 보낼 때도 그 글을 **첫 질문의 답**으로 넣어서, 세 번째 질문에
   *    쓴 말이 첫 질문의 답으로 갔다(조용히 틀리는 쪽이라 더 나쁘다).
   */
  /**
   * 🔴 **여러 개 고르는 질문(`multiSelect`)은 여러 개가 켜진다** (2026-09-20 Dave: *«AskUserQuestion 에서 중복 선택이 안되네»*).
   *    종전에는 답이 질문당 **글자 하나**라 새로 고르면 앞의 것이 꺼졌다 — `multiSelect: true` 인 질문도 하나만 갔다.
   *    이제 답은 질문당 **목록**이고, 여럿 질문은 토글(다시 누르면 꺼짐) · 하나 질문은 라디오처럼 갈아탄다.
   *    ⚠ 「기타」 도 갈린다 — 여럿이면 고른 것들 **뒤에 덧붙고**, 하나면 종전처럼 고른 것을 **대신한다**.
   */
  const [pick, setPick] = useState<Record<string, string[]>>({}); const [other, setOther] = useState<Record<string, string>>({})
  const act = async (body: Record<string, unknown>, path: 'permission' | 'ask') => { setBusy(true); try { await api(`/sessions/${sid}/${path}`, { body: { requestId: p.requestId, ...body } }); setSent(true) } finally { setBusy(false) } }
  if (sent) return <div className="meta"><Icon n="check" size={11} color="var(--done)" /><span>보냈어요</span></div>
  if (p.ask) {
    const qs = (p.input.questions as { question?: string; header?: string; options?: { label?: string; description?: string }[]; multiSelect?: boolean }[] | undefined) ?? []
    const keyOf = (q: { question?: string }, i: number) => q.question ?? String(i)
    const picksOf = (key: string) => pick[key] ?? []
    const toggle = (key: string, label: string, multi: boolean) => setPick((prev) => { const cur = prev[key] ?? []; if (!multi) return { ...prev, [key]: cur[0] === label ? [] : [label] }; return { ...prev, [key]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label] } })
    const answerOf = (q: { question?: string; multiSelect?: boolean }, i: number) => { const key = keyOf(q, i); const free = (other[key] ?? '').trim(); const ps = picksOf(key); return q.multiSelect ? [...ps, ...(free ? [free] : [])].join(', ') : free || ps[0] || '' }
    const answers = () => Object.fromEntries(qs.map((q, i) => [keyOf(q, i), answerOf(q, i)]).filter(([, v]) => v))
    const ready = qs.every((q, i) => !!answerOf(q, i))
    return <div className="card"><div className="lab">에이전트의 질문{qs[0]?.header ? ` · ${qs[0].header}` : ''}</div>
      {qs.map((q, i) => { const key = keyOf(q, i); const multi = !!q.multiSelect; const on = (label: string) => picksOf(key).includes(label); return <div key={i} style={{ display: 'flex', flexDirection: 'column' }}><div className="q">{q.question}{multi ? <span className="mhint">여러 개 고를 수 있어요</span> : null}</div>{(q.options ?? []).map((o) => <button key={o.label} className={`opt ${on(o.label ?? '') ? 'on' : ''}`} onClick={() => toggle(key, o.label ?? '', multi)}><span className={`r ${multi ? 'sq' : ''}`}>{multi && on(o.label ?? '') ? <Icon n="check" size={9} color="var(--bg)" /> : null}</span><div><div>{o.label}</div>{o.description ? <div className="d">{o.description}</div> : null}</div></button>)}<div className={`opt ${(other[key] ?? '').trim() ? 'on' : ''}`}><span className={`r ${multi ? 'sq' : ''}`} style={{ marginTop: 7 }}>{multi && (other[key] ?? '').trim() ? <Icon n="check" size={9} color="var(--bg)" /> : null}</span><input placeholder={multi ? '기타 — 직접 입력해 덧붙이기…' : '기타 — 직접 입력…'} value={other[key] ?? ''} onChange={(e) => setOther({ ...other, [key]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && ready) void act({ answers: answers() }, 'ask') }} /></div></div> })}
      <div className="btns"><button className="btn ghost" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>취소 ⎋</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={busy || !ready} onClick={() => act({ answers: answers() }, 'ask')}>보내기</button></div></div>
  }
  const i = p.input; const cmd = typeof i.command === 'string' ? i.command : typeof i.file_path === 'string' ? i.file_path : typeof i.url === 'string' ? i.url : JSON.stringify(i).slice(0, 400)
  const human = p.description || (typeof i.command === 'string' ? `명령을 실행합니다` : typeof i.file_path === 'string' ? `파일을 ${/Write|Edit/.test(p.toolName) ? '고칩니다' : '읽습니다'} — ${String(i.file_path).split('/').pop()}` : `${p.displayName} 를 씁니다`)
  return <div className="card"><div className="lab">권한 · {p.displayName}</div><div className="q">{human}</div><div className="cmd">{cmd}</div>
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => act({ allow: true }, 'permission')}>허용</button>{p.suggestions.length ? <button className="btn" disabled={busy} title={rulesLabel(p.suggestions)} onClick={() => act({ allow: true, always: true }, 'permission')}>이 세션에서 항상 허용</button> : null}<button className="btn ghost" disabled={busy} onClick={() => act({ allow: false }, 'permission')}>거부</button></div>
    {p.suggestions.length ? <div className="meta rule">항상 허용 = {rulesLabel(p.suggestions) || '이 도구'}</div> : null}</div>
}
