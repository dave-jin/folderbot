import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HarnessItem, HarnessRow, PermissionMode } from '../core/types'
import { AGENT_EFFORTS, CODEX_SANDBOX, DEFAULT_EFFORT, DEFAULT_MODEL, PROVIDER_LABEL, type Provider } from '../core/agents'
import { copySay } from './clip'
import { api, setToken, subscribePush } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { Mark } from './Brand'
import { ICON_LABEL, ICON_PX, useIconSize, useTheme, type IconSize, type Theme } from './theme'
import { ACT_ICON, ACT_LABEL, SWIPE_DEFAULT, useSwipeCfg, type SwipeAct, type SwipeSlot } from './swipe'
import { CacheRow } from './fileCopy'
import { fmtTime, useStore } from './store'
import { LocalOpenPicker, localBridge, useLocalSettings } from './localOpen'
import { EFFORTS, MODES, modelsFor, moreModelsFor, setFoundModels } from './consts'
import { norm } from '../core/search'

export const isWin = typeof navigator !== 'undefined' && (/Windows|Win32|Win64/i.test(navigator.userAgent) || /Win/i.test(navigator.platform || ''))

/**
 * 설정 — 2026-09-17 «1안» (Dave: «설정 메뉴가 엉망진창임 … 종류별로 정리가 필요함»).
 *
 * 가르는 기준을 «언제 만지나»(V25)에서 **«무엇의 설정인가»** 로 바꿨다. 칸은 아홉이고 하나가 한 대상이다:
 *   일반 · 호스트·볼트 · 기기 · Claude · Codex · 세션·사용량 · 알림 · 할 일(폰) · 참고(보기 전용)
 * 🔴 **줄마다 범위 배지** — `[메인]` 은 호스트(모든 기기가 같이 본다), `[이 기기]` 는 이 화면의 브라우저에만 남는다.
 *    종전엔 화면·할 일·푸시가 «이 기기 것» 인 줄 표시가 없어 폰에서 바꿨는데 맥이 그대로인 이유를 알 수 없었다.
 * 🔴 **Claude 와 Codex 는 같은 뼈대** — 인증 → 새 채팅 기본값 → 다시 연결 → (맨 아래) 위험한 것.
 *    Claude 의 «새 채팅 기본 권한» 은 이 판에서 생겼다 — 입력창 팝오버가 «새 세션은 설정의 기본값으로» 라고
 *    약속하고 있었는데 그 설정이 없었다.
 * ⛔ **참고 칸(커넥터·스킬·하네스)은 보기만 한다.** 고치는 자리는 그 폴더의 패널이다(V25 계약 그대로).
 * ⛔ **위험한 것은 그 칸의 맨 아래에** — 로그아웃·토큰 지우기·키 지우기.
 * ⚠ 검색 인덱스(`INDEX`)는 손으로 적되 **유닛이 실제 줄과 대조한다**(`settingsIndex.test.ts`) — 줄을 더하고
 *    인덱스를 빼먹으면 빨개진다. 종전엔 절전·진단·다시 연결이 검색에 안 걸렸다.
 */

export type SecId = 'general' | 'host' | 'devices' | 'claude' | 'codex' | 'sessions' | 'notify' | 'todo' | 'ref'
const SECS: { id: SecId; label: string; icon: 'gear'; phoneOnly?: boolean; ref?: boolean }[] = [
  { id: 'general', label: '일반', icon: 'gear' },
  { id: 'host', label: '호스트 · 볼트', icon: 'folder' as 'gear' },
  { id: 'devices', label: '기기', icon: 'phone' as 'gear' },
  { id: 'claude', label: 'Claude', icon: 'sub' as 'gear' },
  { id: 'codex', label: 'Codex', icon: 'sub' as 'gear' },
  { id: 'sessions', label: '세션 · 사용량', icon: 'clock' as 'gear' },
  { id: 'notify', label: '알림', icon: 'bell' as 'gear' },
  { id: 'todo', label: '할 일', icon: 'list' as 'gear', phoneOnly: true },
  { id: 'ref', label: '참고 · 커넥터 · 스킬', icon: 'eye' as 'gear', ref: true }
]

/** 범위 배지 — 이 줄의 값이 어디에 남는가. `main` 은 호스트(모든 기기), `dev` 는 이 기기의 브라우저 */
type At = 'main' | 'dev'
function AtTag({ at }: { at: At }) { return <span className={`scp at-${at}`} title={at === 'main' ? '호스트에 저장 — 모든 기기에 같이 보여요' : '이 기기에만 저장'}>{at === 'main' ? '메인' : '이 기기'}</span> }

/** 줄 하나 — 제목 · 설명 · 조작. 조작은 오른쪽 끝에 고정된다 */
function Row({ t, d, children, danger, at }: { t: string; d?: ReactNode; children?: ReactNode; danger?: boolean; at?: At }) {
  return <div className={`setr ${danger ? 'danger' : ''}`} data-t={t}>
    <span className="tx"><span className="t">{t}{at ? <AtTag at={at} /> : null}</span>{d ? <span className="d">{d}</span> : null}</span>
    {children ? <span className="c">{children}</span> : null}
  </div>
}
function Group({ t, right }: { t: string; right?: ReactNode }) {
  return <div className="sgrp"><span>{t}</span>{right}</div>
}
const SCOPE_T: Record<HarnessItem['scope'], string> = { folder: '폴더', root: '볼트', user: '사용자', builtin: '내장' }
function Scope({ s }: { s: HarnessItem['scope'] }) { return <span className={`scp ${s}`}>{SCOPE_T[s]}</span> }

export function Settings({ onClose, start }: { onClose: () => void; start?: SecId }) {
  const { s } = useStore()
  const [sec, setSec] = useState<SecId>(start ?? 'general')
  const [q, setQ] = useState('')
  const [drill, setDrill] = useState(!!start)   // 폰: 한 칸 안에 들어와 있나 (지정해서 열면 바로 그 칸)
  const phone = usePhone()
  /** 깔린 CLI — Codex 칸은 **깔려 있을 때만** 목차에 나온다(고를 게 없는 칸은 문턱일 뿐이다) */
  const [providers, setProviders] = useState<Provider[] | null>(null)
  useEffect(() => { void api<Provider[]>('/agents').then(setProviders).catch(() => setProviders([])) }, [])
  const hasCodex = (providers ?? []).some((p) => p.id === 'codex')
  const secs = SECS.filter((x) => (x.id === 'codex' ? hasCodex : true) && (x.phoneOnly ? phone : true))
  const hits = useMemo(() => (q.trim() ? searchRows(q).filter((h) => (h.sec === 'codex' ? hasCodex : true)) : []), [q, hasCodex])
  const cur = SECS.find((x) => x.id === sec)!
  const body = <Pane sec={sec} onClose={onClose} providers={providers ?? []} />
  /** ⎋ 로 닫는다 — 맥에서 시트를 닫는 기본 동작이고, 우리 단축키 표(⌘/)도 그렇게 적어 뒀다.
      ⚠ 찾기 칸에 글을 치는 중이면 ⎋ 는 **찾기를 먼저 비운다**(한 번 더 누르면 닫힌다). */
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.preventDefault(); if (q) setQ(''); else onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [q, onClose])
  const label = (id: SecId) => SECS.find((x) => x.id === id)!.label

  // ── 폰: 목차가 목록이 되고, 누르면 그 칸만 한 화면으로 ──
  if (phone) {
    if (drill) return <div className="setp">
      <div className="setp-h"><button className="ib" onClick={() => setDrill(false)}><Icon n="back" size={15} /></button><b>{cur.label}</b><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="setp-b">{body}</div>
    </div>
    return <div className="setp">
      <div className="setp-h"><b className="big">설정</b><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="setp-b">
        <div className="sfind"><Icon n="search" size={14} color="var(--t3)" /><input placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {q.trim() ? hits.map((h) => <button className="sec-row" key={h.sec + h.t} onClick={() => { setSec(h.sec); setDrill(true); setQ('') }}>
          <span className="ic"><Icon n="search" size={14} /></span><span className="nm">{h.t}<small>{label(h.sec)}</small></span><Icon n="chev" size={11} color="var(--t3)" />
        </button>)
          : secs.map((x) => <button className={`sec-row ${x.ref ? 'ref' : ''}`} key={x.id} onClick={() => { setSec(x.id); setDrill(true) }}>
            <span className="ic"><Icon n={x.icon} size={15} /></span><span className="nm">{x.label}{x.ref ? <small>보기만</small> : null}</span><span className="vl">{summary(x.id, s)}</span><Icon n="chev" size={11} color="var(--t3)" />
          </button>)}
      </div>
    </div>
  }

  // ── 데스크톱: 왼쪽 목차 + 오른쪽 한 칸 ──
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal setw">
      <div className="snav">
        <div className="sfind"><Icon n="search" size={13} color="var(--t3)" /><input placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {q.trim()
          ? hits.map((h) => <button className={`nv ${sec === h.sec ? 'on' : ''}`} key={h.sec + h.t} onClick={() => { setSec(h.sec); setQ('') }}><Icon n="search" size={13} />{h.t}<small>{label(h.sec)}</small></button>)
          : secs.map((x) => <button className={`nv ${sec === x.id ? 'on' : ''} ${x.ref ? 'ref' : ''}`} key={x.id} onClick={() => setSec(x.id)}><Icon n={x.icon} size={14} />{x.label}</button>)}
        <span className="ver">Folder Bot v{s.version}</span>
      </div>
      <div className="spane">
        <div className="sp-h"><b>{cur.label}</b>{cur.ref ? <span className="scp ref">보기만</span> : null}<button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
        <div className="sp-b">{body}</div>
      </div>
    </div>
  </>
}

function usePhone(): boolean {
  const [m, setM] = useState(() => (typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 760px)').matches : false))
  useEffect(() => { const mq = matchMedia('(max-width: 760px)'); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [])
  return m
}

/** 검색 — 제목과 설명을 함께 찾는다 («토큰» 을 치면 Claude 칸의 그 줄이 나온다). ⚠ 유닛이 실제 `<Row t=…>` 와 대조한다 */
export const INDEX: { sec: SecId; t: string; d: string }[] = [
  { sec: 'general', t: '메인(호스트) 이름', d: '모든 기기에 같이 보이는 이름' },
  { sec: 'general', t: '테마', d: '시스템 라이트 다크 화면' },
  { sec: 'general', t: '폴더봇 크기', d: '레일 아이콘 크게 작게 화면' },
  { sec: 'host', t: '볼트 루트', d: '봇이 사는 폴더 PARA' },
  { sec: 'host', t: '주소', d: '포트 접속 같은 망' },
  { sec: 'host', t: 'Tailscale', d: '밖에서 원격 접속 tailnet' },
  { sec: 'host', t: '깔린 CLI', d: 'Claude Code Codex 버전 에이전트' },
  { sec: 'host', t: '시스템 권한', d: 'macOS Windows 전체 디스크 접근 알림 보안' },
  { sec: 'devices', t: '이 기기 이름', d: '기기마다 따로' },
  { sec: 'devices', t: '연결된 기기', d: '페어링 끊기 목록' },
  { sec: 'devices', t: '새 기기 연결', d: '페어링 코드 폰 맥북' },
  { sec: 'devices', t: '이 기기에서 파일 열기', d: 'Finder 열기 동기화 볼트 Dropbox iCloud 호스트에서 받기 원격' },
  { sec: 'devices', t: '동기화 볼트 위치', d: 'Dropbox iCloud 폴더 찾기 경로 원격' },
  { sec: 'devices', t: '받은 사본 캐시', d: '호스트에서 받아 연 파일·복사한 파일의 사본 · 상한 2GB · 비우기' },
  { sec: 'devices', t: '복사 진단', d: '복사가 안 될 때 — 파일 하나로 밟아 보고 결과를 글로' },
  { sec: 'devices', t: '이 기기 로그아웃', d: '연결 끊기 보안' },
  { sec: 'claude', t: 'Claude 로그인 상태', d: '키체인 인증 상태 다시 확인' },
  { sec: 'claude', t: '쓰는 인증', d: '키체인 장기 토큰 커넥터' },
  { sec: 'claude', t: 'Claude Code 로그인', d: '터미널에서 로그인 /login' },
  { sec: 'claude', t: '장기 토큰', d: 'setup-token 헤드리스 SSH 인증' },
  { sec: 'claude', t: '모델 · 생각 레벨', d: '새 채팅 기본값 새 세션부터 적용' },
  { sec: 'claude', t: '새 채팅 기본 권한', d: '권한 모드 자동 편집 자동 수락 계획 항상 허용 permission' },
  { sec: 'claude', t: '다시 연결', d: '일꾼 내리기 커넥터 새 환경' },
  { sec: 'claude', t: '연결 진단', d: '로그인 안 될 때 진단 복사' },
  { sec: 'claude', t: '토큰 지우기', d: '키체인 로그인 모드로' },
  { sec: 'codex', t: 'Codex 로그인 상태', d: 'codex login 인증' },
  { sec: 'codex', t: 'Codex 로그인', d: '터미널에서 codex login' },
  { sec: 'codex', t: 'OpenAI API 키', d: 'openai key 헤드리스' },
  { sec: 'codex', t: 'Codex 기본 모델 · 노력', d: 'gpt codex reasoning effort 새 채팅 기본값' },
  { sec: 'codex', t: 'Codex 권한 (샌드박스)', d: 'sandbox read-only workspace-write 권한 정책' },
  { sec: 'codex', t: 'Codex 다시 연결', d: '일꾼 내리기 키 바꿈' },
  { sec: 'codex', t: 'Codex 키 지우기', d: 'codex login 모드로' },
  { sec: 'sessions', t: '유휴 세션 절전', d: '워커 내리기 절전 시간 분' },
  { sec: 'sessions', t: '턴마다 기록하기', d: '훅 설치 사용량' },
  { sec: 'sessions', t: '예산 — 5시간 창', d: '달러 사용량 예산' },
  { sec: 'sessions', t: '예산 — 하루', d: '달러 사용량 예산' },
  { sec: 'sessions', t: '예산 — 한 주', d: '달러 사용량 예산' },
  { sec: 'notify', t: '이 기기 푸시', d: '알림 폰 푸시 켜기' },
  { sec: 'notify', t: '조용한 시간', d: '알림 밤 시간 확인해 주세요만 통과' },
  { sec: 'notify', t: '푸시 테스트', d: '알림 한 번 보내기' },
  { sec: 'todo', t: '오른쪽으로 짧게', d: '쓸어서 처리 스와이프' },
  { sec: 'todo', t: '오른쪽으로 길게', d: '쓸어서 처리 스와이프' },
  { sec: 'todo', t: '왼쪽으로 짧게', d: '쓸어서 처리 스와이프' },
  { sec: 'todo', t: '왼쪽으로 길게', d: '쓸어서 처리 스와이프' },
  { sec: 'todo', t: '진동', d: '스와이프 햅틱' },
  { sec: 'todo', t: '기본값으로', d: '스와이프 되돌리기' },
  { sec: 'ref', t: '커넥터 (MCP)', d: '연결된 도구 서버 mcp' },
  { sec: 'ref', t: '스킬', d: '슬래시 명령 skills' },
  { sec: 'ref', t: '폴더별 하네스', d: 'CLAUDE.md AGENTS.md 스킬 커넥터 지침' }
]
function searchRows(q: string) { const n = norm(q); return INDEX.filter((r) => norm(r.t).includes(n) || norm(r.d).includes(n)) }
function summary(id: SecId, s: ReturnType<typeof useStore>['s']): string {
  if (id === 'general') return s.hostName
  if (id === 'host') return s.addrs[0] ? `${s.addrs[0]}:${s.port}` : ''
  if (id === 'devices') return s.devices.length ? `${s.devices.length}대` : ''
  if (id === 'claude') return s.auth.verdict === 'loggedin' ? '로그인됨' : VERDICT_T[s.auth.verdict] ?? ''
  if (id === 'codex') return s.defaults.codex?.auth?.ok ? '로그인됨' : ''
  if (id === 'sessions') return s.defaults.idleMinutes === 0 ? '안 재움' : `절전 ${s.defaults.idleMinutes ?? 60}분`
  if (id === 'notify') return s.quiet ? `조용 ${s.quiet.from}–${s.quiet.to}` : ''
  return ''
}

/* ── 칸들 ──────────────────────────────────────────────────────────────── */
function Pane({ sec, onClose, providers }: { sec: SecId; onClose: () => void; providers: Provider[] }) {
  if (sec === 'general') return <GeneralPane />
  if (sec === 'host') return <HostPane onClose={onClose} providers={providers} />
  if (sec === 'devices') return <DevicesPane />
  if (sec === 'claude') return <ClaudePane />
  if (sec === 'codex') return <CodexPane />
  if (sec === 'sessions') return <SessionsPane />
  if (sec === 'notify') return <NotifyPane />
  if (sec === 'todo') return <TodoPane />
  return <RefPane />
}

/** 일반 — 이름과 이 화면의 생김새. ⚠ 테마·크기는 **이 기기** 것이다(브라우저에 남는다) */
function GeneralPane() {
  const { s, refresh } = useStore()
  const [host, setHost] = useState(s.hostName); const [msg, setMsg] = useState('')
  const [theme, setTheme] = useTheme(); const [sz, setSz] = useIconSize()
  useEffect(() => { setHost(s.hostName) }, [s.hostName])
  const save = async (body: { hostName?: string }) => { try { await api('/names', { body }); await refresh(); setMsg('저장했어요') } catch (e) { setMsg((e as Error).message) } }
  return <>
    <p className="lead">지금 이 화면은 {s.device.main ? <><b>메인</b> ({s.hostName}) 에서</> : <><b>원격 · {s.device.name}</b> 에서 <b>{s.hostName}</b> 를</>} 보고 있어요.{msg ? ` · ${msg}` : ''} 줄의 <span className="scp at-main">메인</span> 은 모든 기기에 같이 보이는 값, <span className="scp at-dev">이 기기</span> 는 여기에만 남는 값이에요.</p>
    <Row t="메인(호스트) 이름" d="봇이 사는 호스트 기기의 이름. 모든 기기에 같이 보여요." at="main">
      <input className="sin" value={host} onChange={(e) => setHost(e.target.value)} onBlur={() => { if (host.trim() !== s.hostName) void save({ hostName: host }) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </Row>
    <Group t="화면" />
    <Row t="테마" d={isWin ? "시스템을 고르면 Windows 의 밝기 설정을 따라갑니다." : "시스템을 고르면 맥의 밝기 설정을 따라갑니다."} at="dev">
      <span className="seg">{([['auto', '시스템'], ['light', '라이트'], ['dark', '다크']] as [Theme, string][]).map(([v, l]) => <button key={v} className={theme === v ? 'on' : ''} onClick={() => setTheme(v)}>{l}</button>)}</span>
    </Row>
    <Row t="폴더봇 크기" d="목록의 폴더봇 크기예요. 마우스를 올리면 한 번 더 커져서 표정이 보여요." at="dev">
      <span className="seg">{(['s', 'm', 'l'] as IconSize[]).map((v) => <button key={v} className={sz === v ? 'on' : ''} onClick={() => setSz(v)} title={`${ICON_PX[v]}px`}>{ICON_LABEL[v]}</button>)}</span>
    </Row>
  </>
}

interface Browse { path: string; name: string; parent: string | null; home: string; dirs: { name: string; path: string }[] }
function RootRow() {
  const { s, refresh } = useStore()
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<Browse | null>(null)
  const [path, setPath] = useState(s.root)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const desk = s.device.main ? (window as unknown as { folderbotDesktop?: { hostMode?: () => void } }).folderbotDesktop : undefined
  useEffect(() => { setPath(s.root) }, [s.root])
  const load = async (p: string) => {
    try { const b = await api<Browse>(`/root/browse?path=${encodeURIComponent(p)}`); setAt(b); setPath(b.path); setMsg('') }
    catch (e) { setMsg((e as Error).message) }
  }
  const apply = async (p: string) => {
    setBusy(true); setMsg('바꾸는 중…')
    try {
      const r = await api<{ root: string; restarting: boolean; same?: boolean }>('/root', { body: { path: p } })
      if (r.same) { setMsg('이미 그 폴더예요'); setBusy(false); return }
      setOpen(false)
      if (r.restarting) { setMsg(`${r.root} 로 바꿨어요 — 호스트를 다시 세우는 중이에요`); setTimeout(() => location.reload(), 3000) }
      else { setMsg(`${r.root} 로 저장했어요 — 호스트를 다시 시작하면 적용돼요`); setBusy(false); await refresh() }
    } catch (e) { setMsg((e as Error).message); setBusy(false) }
  }
  return <>
    <Row t="볼트 루트" d={<>봇들이 사는 폴더예요. 바꾸면 호스트가 그 폴더로 다시 섭니다.{msg ? <><br /><b>{msg}</b></> : null}</>}>
      <span className="mono sv">{s.root}</span>
      <button className="btn ghost" disabled={busy} onClick={() => { const n = !open; setOpen(n); if (n && !at) void load(s.root) }}>{open ? '닫기' : '바꾸기'}</button>
    </Row>
    {open ? <div className="rootp">
      <div className="rp-h">
        <input className="sin mono" value={path} placeholder={isWin ? 'C:\\Users\\이름\\PARA' : '/Users/이름/PARA'} onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load((e.target as HTMLInputElement).value) }} />
        <button className="btn ghost" onClick={() => void load(path)}>열기</button>
        {desk?.hostMode ? <button className="btn ghost" onClick={() => desk.hostMode?.()}>{isWin ? '파일 탐색기…' : 'Finder…'}</button> : null}
      </div>
      <div className="rp-l">
        {at?.parent ? <button className="rp-i up" onClick={() => void load(at.parent as string)}>↑ 상위 폴더</button> : null}
        {at && at.dirs.length ? at.dirs.map((d) => <button key={d.path} className="rp-i" onClick={() => void load(d.path)}>{d.name}</button>)
          : <div className="rp-e">{at ? '하위 폴더가 없어요' : '읽는 중…'}</div>}
      </div>
      <div className="rp-f">
        <span className="msg mono">{at?.path ?? path}</span>
        <button className="btn" disabled={busy || !at} onClick={() => void apply(at?.path ?? path)}>이 폴더를 볼트로</button>
      </div>
    </div> : null}
  </>
}


/**
 * 호스트 · 볼트 — 봇들이 사는 맥과 폴더. 🔴 **원격에는 «메인 것» 을 안 보여 준다** (2026-09-13 Dave).
 * 가르는 기준은 «이 기기에서 할 수 있나» — 눌러도 결과가 이 기기에 없는 줄은 원격에서 줄 자체를 안 그린다.
 */
function HostPane({ onClose, providers }: { onClose: () => void; providers: Provider[] }) {
  const { s } = useStore()
  const main = s.device.main
  // ⚠ 원격 맥 앱에도 `folderbotDesktop` 은 있다 — 이 권한은 **볼트를 읽는 메인 맥**의 것이라 «메인인가» 까지 본다
  const hasPerms = main && !!(window as unknown as { folderbotDesktop?: { perms?: unknown } }).folderbotDesktop?.perms
  return <>
    <RootRow />
    <Row t="주소" d="같은 망에서 이 주소로 들어옵니다."><span className="mono sv">{s.addrs.map((a) => `${a}:${s.port}`).join(' · ')}</span></Row>
    {s.tailnet ? <Row t="Tailscale" d="밖에서 들어올 때 쓰는 길."><span className="sv">{s.tailnet.state}{s.tailnet.dnsName ? ` · ${s.tailnet.dnsName}` : ''}</span></Row> : null}
    <Group t="깔린 CLI" />
    {providers.map((p) => <div className="hitem" key={p.id}>
      <span className="ic"><Mark id={p.id} size={16} /></span>
      <span className="tx"><span className="t">{PROVIDER_LABEL[p.id]}</span><span className="d mono">{p.version ?? ''}{p.bin ? ` · ${p.bin}` : ''}</span></span>
      <Scope s="user" /><span className="dt ok" />
    </div>)}
    {!providers.length ? <Row t="깔린 에이전트가 없어요" d="Claude Code 를 먼저 설치하세요 — 여기 보이는 것만 폴더를 시작할 때 고를 수 있어요." /> : null}
    <p className="note">여기 보이는 것만 폴더를 시작할 때 고를 수 있어요. 각 CLI 의 로그인·기본값은 왼쪽의 <b>Claude</b>·<b>Codex</b> 칸에서.</p>
    {hasPerms ? <><Group t="운영체제" /><Row t="시스템 권한" d={isWin ? "알림 및 백그라운드 접근 권한이에요." : "전체 디스크 접근 · 알림. 볼트를 읽으려면 필요해요."} at="main"><button className="btn" onClick={() => { onClose(); window.dispatchEvent(new Event('fb:perm-gate')) }}>다시 확인</button></Row></> : null}
  </>
}

/** 원격 기기의 «파일을 어디서 여나» (E) — 메인에는 없다(그 맥이 곧 볼트다) */
function LocalOpenRows() {
  const { s } = useStore(); const [cfg, set] = useLocalSettings()
  return <>
    <Row t="이 기기에서 파일 열기" d={isWin ? "«파일 탐색기에서 보기»·«열기» 가 이 기기에서 열립니다. 동기화 볼트가 있으면 그 파일을(신선도 확인 뒤), 없으면 호스트에서 받은 사본을 열어요." : "«Finder 에서 보기»·«열기» 가 이 기기에서 열립니다. 동기화 볼트가 있으면 그 파일을(신선도 확인 뒤), 없으면 호스트에서 받은 사본을 열어요."} at="dev">
      <span className="seg"><button className={cfg?.openMode === 'sync' ? 'on' : ''} onClick={() => void set({ openMode: 'sync' })}>동기화 볼트</button><button className={cfg?.openMode === 'download' || !cfg?.openMode ? 'on' : ''} onClick={() => void set({ openMode: 'download' })}>호스트에서 받기</button></span>
    </Row>
    <Row t="동기화 볼트 위치" d={cfg?.vaultLocal ? cfg.vaultLocal : (isWin ? '아직 안 정했어요 — 찾기를 누르면 Dropbox·OneDrive 등에서 같은 볼트를 찾아요.' : '아직 안 정했어요 — 찾기를 누르면 Dropbox·iCloud 에서 같은 볼트를 찾아요.')} at="dev">
      <LocalOpenPicker root={s.root} compact />
    </Row>
    <Row t="받은 사본 캐시" d="호스트에서 받아 연 파일·복사한 파일의 사본. 상한(2GB)을 넘으면 오래 안 쓴 것부터 지워요." at="dev">
      <CacheRow />
    </Row>
    <Row t="복사 진단" d={isWin ? "파일 하나를 골라 클립보드에 올려 보고, PC가 그걸 파일로 받았는지 되읽어 알려줘요. 복사가 안 될 때 이 글을 그대로 보내 주세요." : "파일 하나를 골라 클립보드에 올려 보고, 맥이 그걸 파일로 받았는지 되읽어 알려줘요. 복사가 안 될 때 이 글을 그대로 보내 주세요."} at="dev">
      <CopyDiagRow />
    </Row>
  </>
}

/**
 * 복사 진단 (2026-09-21 Dave 실기기 보고: «다 안되는거 같아») — 맥 클립보드는 여기서 못 잰다.
 * 그래서 **앱이 스스로 밟아 보고 글로 남기게** 한다: 파일을 골라 올려 보고, `availableFormats()` 를 되읽어 붙인다.
 * ⚠ 맥 앱이 아니면 이 줄은 «맥 앱에서만» 이라고만 말한다 — 브라우저에는 셸 통로가 없다.
 */
function CopyDiagRow() {
  const [out, setOut] = useState(''); const [busy, setBusy] = useState(false)
  const b = localBridge()
  if (!b?.copyDiag) return <span className="hint">{isWin ? '데스크톱 앱에서만 돼요 (앱을 최신으로 올려 주세요)' : '맥 앱에서만 돼요 (앱을 최신으로 올려 주세요)'}</span>
  const run = async () => {
    setBusy(true)
    try { const p = await b.pick(); if (!p) { setBusy(false); return } setOut(await b.copyDiag!(p)) } catch (e) { setOut(`진단 실패 — ${(e as Error).message}`) } finally { setBusy(false) }
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
    <button className="btn" disabled={busy} onClick={() => void run()}>{busy ? '해 보는 중…' : '파일 골라 진단'}</button>
    {out ? <><pre className="diagout">{out}</pre><button className="btn ghost" onClick={() => void copySay(out, () => {})}>진단 글 복사</button></> : null}
  </div>
}

/** 기기 — 이 화면(기기)과 붙어 있는 기기들. 흩어져 있던 «이 기기 이름 · 기기 목록 · 페어링 · 로그아웃» 을 한 칸에 */
function DevicesPane() {
  const { s, refresh } = useStore()
  const [dev, setDev] = useState(s.device.name); const [msg, setMsg] = useState('')
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null)
  const isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  useEffect(() => { setDev(s.device.name) }, [s.device.name])
  const save = async (deviceName: string) => { try { await api('/names', { body: { deviceName } }); await refresh(); setMsg('저장했어요') } catch (e) { setMsg((e as Error).message) } }
  return <>
    <p className="lead">지금 이 화면은 {s.device.main ? <><b>메인</b> 자체</> : <><b>원격 · {s.device.name}</b></>}예요.{msg ? ` · ${msg}` : ''}</p>
    {!s.device.main ? <Row t="이 기기 이름" d="기기마다 따로 정합니다. 기본값은 페어링할 때 고른 기기 종류." at="main">
      <input className="sin" value={dev} onChange={(e) => setDev(e.target.value)} onBlur={() => { if (dev.trim() && dev.trim() !== s.device.name) void save(dev) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </Row> : null}
    {!s.device.main && localBridge() ? <LocalOpenRows /> : null}
    <Group t="연결된 기기" />
    {s.devices.map((d) => <Row key={d.id} t={d.name} d={`마지막 접속 ${fmtTime(d.lastSeen)}`}><button className="btn ghost" onClick={() => api('/devices/revoke', { body: { id: d.id } }).then(refresh)}>끊기</button></Row>)}
    {!s.devices.length ? <Row t="연결된 기기" d="아직 붙은 기기가 없어요." /> : null}
    {/* ⛔ 페어링은 루프백에서만 열린다(호스트가 그렇게 막는다) — 원격에서는 줄 자체를 안 그린다 */}
    {isLocal ? <Row t="새 기기 연결" d={isWin ? "폰이나 다른 PC·노트북에서 이 코드를 넣으면 붙어요 (2분)." : "폰이나 다른 맥에서 이 코드를 넣으면 붙어요 (2분)."} at="main">
      {pair ? <span className="pcode mono">{pair.code}</span> : null}<button className="btn" onClick={async () => setPair(await api('/pairing', { body: {} }))}>페어링 코드</button>
    </Row> : null}
    <Row t="이 기기 로그아웃" d="이 기기의 연결을 끊습니다. 다시 붙으려면 페어링 코드가 필요해요." danger at="dev">
      <button className="btn danger" onClick={() => { setToken(''); location.reload() }}>로그아웃</button>
    </Row>
  </>
}

const VERDICT_T: Record<string, string> = { loggedin: '로그인됨', loggedout: '로그아웃', unreadable: '못 읽음', unknown: '확인 전' }
const VERDICT_D: Record<string, string> = {
  loggedin: isWin ? '자격 증명 로그인이 읽혀요.' : '키체인 로그인이 읽혀요.',
  loggedout: isWin ? '호스트 터미널에서 claude → /login 을 해 주세요.' : '호스트 맥 터미널에서 claude → /login 을 해 주세요.',
  unreadable: '로그인은 있는데 이 문맥에서 못 읽어요 — 호스트를 GUI 터미널에서 띄우거나 장기 토큰을 넣으세요.',
  unknown: '아직 확인하지 않았어요.'
}


/** Claude — 인증 → 새 채팅 기본값 → 다시 연결 → (맨 아래) 위험한 것 */
function ClaudePane() {
  const { s, refresh } = useStore()
  const main = s.device.main     // 터미널은 호스트 기기에서만 열린다
  const [model, setModel] = useState(s.defaults.model || DEFAULT_MODEL.claude); const [effort, setEffort] = useState(s.defaults.effort || DEFAULT_EFFORT.claude)
  const [tok, setTok] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [diag, setDiag] = useState('')
  /**
   * 🔴 **모델 목록은 기계에서 받아 온다** (2026-09-13 Dave: «미리 설정에 fixed 하지 말고 정보를
   *    받아와서 채워줘»). 박아 둔 목록은 반드시 낡고, 낡은 이름을 넘기면 그 계정에서 턴이 죽는다.
   */
  const [found, setFound] = useState<{ claude: string[]; codex: string[] }>({ claude: [], codex: [] })
  useEffect(() => { void api<{ claude: string[]; codex: string[] }>('/agents/models').then((f) => { setFoundModels(f); setFound(f) }).catch(() => {}) }, [])
  const clModels = useMemo(() => [...modelsFor('claude'), ...moreModelsFor('claude')], [found.claude])
  const saveD = async (m: string, e: string) => { await api('/defaults', { body: { model: m, effort: e, agent: 'claude' } }); await refresh(); setMsg('저장했어요 — 다음 세션부터 적용돼요.') }
  /** 새 채팅 기본 권한 (2026-09-17 Dave) — 입력창 팝오버가 «새 세션은 설정의 기본값으로» 라고 약속하던 그 값 */
  const savePerm = async (p: PermissionMode) => { await api('/defaults', { body: { model, effort, agent: 'claude', permissionMode: p } }); await refresh(); setMsg('저장했어요 — 다음 새 채팅부터 적용돼요. 지금 세션은 입력창에서 바꿉니다.') }
  const saveT = async (t: string) => { setBusy(true); try { await api('/auth/token', { body: { token: t } }); await refresh(); setMsg(t ? '토큰을 저장했어요.' : '토큰을 지웠어요.'); setTok('') } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
  const openLogin = async () => { setBusy(true); try { await api('/auth/login-terminal', { body: { agent: 'claude' } }); setMsg('터미널을 열었어요 — claude 가 뜨면 /login 을 치고, 끝나면 [다시 연결]') } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
  const reconnect = async () => {
    setBusy(true)
    try {
      const r = await api<{ now: number; pending: number }>('/auth/reconnect', { body: {} })
      await refresh()
      setMsg(r.pending ? `${r.now}개를 다시 연결했어요 · ${r.pending}개는 턴이 끝나면 이어서 합니다.` : r.now ? `${r.now}개를 다시 연결했어요 — 다음 메시지부터 새 환경이에요.` : '연결할 일꾼이 없었어요 — 다음 메시지부터 새 환경으로 뜹니다.')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  const loginD = main
    ? <span>누르면 호스트에 터미널이 열립니다. <span className="mono">claude</span> 가 뜨면 <span className="mono">/login</span> 을 치고 브라우저에서 마치세요 — 그러면 <b>claude.ai 커넥터도 함께 붙습니다</b>.</span>
    : <span>로그인은 <b>호스트</b>({s.hostName})에서 해야 해요. 그 기기의 Folder Bot 설정에서 누르거나, 터미널에서 <span className="mono">claude</span> → <span className="mono">/login</span>.</span>
  const perm = s.defaults.permissionMode ?? 'default'
  return <>
    <p className="lead">Claude Code 세션이 어떻게 붙고 어떤 값으로 뜨는지. 커넥터·스킬 목록은 <b>참고</b> 칸에, 폴더마다 다른 지침은 그 폴더 패널에 있어요.{msg ? ` · ${msg}` : ''}</p>
    <Group t="인증" />
    <Row t="Claude 로그인 상태" d={VERDICT_D[s.auth.verdict]} at="main">
      <span className="sv" style={{ color: s.auth.verdict === 'loggedin' ? 'var(--done)' : 'var(--wait)' }}>{VERDICT_T[s.auth.verdict]}{s.auth.email ? ` · ${s.auth.email}` : ''}</span>
      <button className="btn ghost" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button>
    </Row>
    <Row t="쓰는 인증" d={s.auth.mode === 'token'
      ? <>장기 토큰으로 붙어 있어요. ⚠ <b>이 모드에서는 claude.ai 계정에 연결해 둔 커넥터가 안 붙습니다</b> — 토큰 스코프에 <span className="mono">user:mcp_servers</span> 가 없어요. 호스트 터미널에서 <span className="mono">claude</span> → <span className="mono">/login</span> 을 하고 토큰을 지우면 CLI 로그인으로 돌아갑니다.</>
      : <>CLI 로그인으로 붙어 있어요 — <b>호스트에 설치된 MCP 커넥터·스킬과 claude.ai 계정 커넥터를 그대로 씁니다</b>. (장기 토큰이 저장돼 있어도 CLI 로그인을 읽으면 그쪽을 씁니다.)</>} at="main">
      <span className="sv" style={{ color: s.auth.mode === 'token' ? 'var(--wait)' : 'var(--done)' }}>{s.auth.mode === 'token' ? '장기 토큰' : 'CLI 로그인'}</span>
    </Row>
    <Row t="Claude Code 로그인" d={loginD}>
      <button className="btn on" disabled={busy || !main} onClick={() => void openLogin()}>터미널에서 로그인</button>
    </Row>
    <Row t="장기 토큰" d={<>CLI 로그인을 못 읽는 상황(헤드리스·SSH)이면 씁니다. 터미널에 <span className="mono">claude setup-token</span> 을 치고 나온 토큰을 넣으세요 (1년). ⚠ 토큰 모드에선 claude.ai 커넥터가 안 붙어요.</>} at="main">
      <input className="sin mono" placeholder="sk-ant-oat01-…" value={tok} onChange={(e) => setTok(e.target.value)} />
      <button className="btn" disabled={busy || !tok.trim()} onClick={() => saveT(tok)}>저장</button>
    </Row>

    <Group t="새 채팅 기본값" />
    <Row t="모델 · 생각 레벨" d="모든 봇의 새 세션이 이 값으로 뜹니다. 세션마다 바꾸려면 입력창 아래 줄에서." at="main">
      <select className="ssel" value={model} onChange={(e) => { setModel(e.target.value); void saveD(e.target.value, effort) }}>{clModels.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}</select>
      <select className="ssel sm" value={effort} onChange={(e) => { setEffort(e.target.value); void saveD(model, e.target.value) }}>{EFFORTS.map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}</select>
    </Row>
    <Row t="새 채팅 기본 권한" d={<>새 세션이 이 모드로 시작해요. 세션 안에서는 입력창의 «모드» 로 바꿉니다 · 루틴은 루틴의 승인 설정이 이겨요.{perm === 'bypassPermissions' ? <><br /><b>⚠ «항상 허용» 은 묻지 않고 실행합니다 — 신뢰하는 볼트에서만 두세요.</b></> : null}</>} at="main">
      <select className="ssel" value={perm} onChange={(e) => void savePerm(e.target.value as PermissionMode)}>{MODES.map((m) => <option key={m.v} value={m.v}>{m.t} — {m.d}</option>)}</select>
    </Row>

    <Group t="연결" />
    <Row t="다시 연결" d={<>로그인을 새로 했거나 커넥터를 붙였으면 눌러 주세요. <b>대화는 그대로 두고 일꾼만 내립니다</b> — 다음 메시지에 새 환경으로 다시 떠요. 일하는 중인 세션은 <b>턴이 끝나면</b> 내려갑니다.</>}>
      <button className="btn" disabled={busy} onClick={() => void reconnect()}>다시 연결</button>
    </Row>
    <Row t="연결 진단" d={diag ? <pre className="diag">{diag}</pre> : '로그인이 안 될 때 눌러 보세요. 무엇이 어디에 있고 CLI 가 뭐라고 하는지 한 덩이로 보여 줍니다 — 그대로 복사해서 저에게 주시면 돼요.'}>
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ text: string }>('/auth/diagnose'); setDiag(r.text) } catch (e) { setDiag((e as Error).message) } finally { setBusy(false) } }}>진단</button>
      {diag ? <button className="btn ghost" onClick={() => void copySay(diag, setMsg, '진단을 복사했어요')}>복사</button> : null}
    </Row>
    {s.auth.mode === 'token' ? <Row t="토큰 지우기" d="CLI 로그인 모드로 돌아갑니다." danger at="main"><button className="btn danger" disabled={busy} onClick={() => saveT('')}>지우기</button></Row> : null}
  </>
}

/**
 * Codex — Claude 와 같은 뼈대. ⚠ **값은 Codex 것** — 모델 이름 체계도, 노력 단계도 다르다(같은 목록을 쓰면 첫 턴에 죽는다).
 * 🔴 모델은 **비워 두는 것이 기본** (2026-09-13 실사고) — ChatGPT 계정은 쓸 수 있는 모델이 구독마다 다르다.
 */
function CodexPane() {
  const { s, refresh } = useStore()
  const main = s.device.main
  const [cxModel, setCxModel] = useState(s.defaults.codex?.model || DEFAULT_MODEL.codex); const [cxEffort, setCxEffort] = useState(s.defaults.codex?.effort || DEFAULT_EFFORT.codex)
  const [cxKey, setCxKey] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const [found, setFound] = useState<{ claude: string[]; codex: string[] }>({ claude: [], codex: [] })
  useEffect(() => { void api<{ claude: string[]; codex: string[] }>('/agents/models').then((f) => { setFoundModels(f); setFound(f) }).catch(() => {}) }, [])
  const cxModels = useMemo(() => [...modelsFor('codex'), ...moreModelsFor('codex')], [found.codex])
  const saveD = async (m: string, e: string) => { await api('/defaults', { body: { model: m, effort: e, agent: 'codex' } }); await refresh(); setMsg('저장했어요 — 다음 세션부터 적용돼요.') }
  const saveCx = async (o: { sandbox?: string; apiKey?: string }) => { setBusy(true); try { await api('/codex', { body: o }); await refresh(); setMsg('Codex 설정을 저장했어요.') } finally { setBusy(false) } }
  const openLogin = async () => { setBusy(true); try { await api('/auth/login-terminal', { body: { agent: 'codex' } }); setMsg('터미널을 열었어요 — codex login 이 돌아가면 마치고 [다시 연결]') } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
  const reconnect = async () => {
    setBusy(true)
    try { const r = await api<{ now: number; pending: number }>('/auth/reconnect', { body: { agent: 'codex' } }); await refresh(); setMsg(r.pending ? `${r.now}개를 다시 연결했어요 · ${r.pending}개는 턴이 끝나면 이어서 합니다.` : r.now ? `${r.now}개를 다시 연결했어요.` : '연결할 일꾼이 없었어요 — 다음 메시지부터 새 환경으로 뜹니다.') }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  const cxAuth = s.defaults.codex?.auth
  const cxLoginD = main
    ? <span>{isWin ? '누르면 호스트에 터미널이 열리고' : '누르면 호스트 맥에 터미널이 열리고'} <span className="mono">codex login</span> 이 돌아갑니다. 브라우저에서 마치고 [다시 연결] 을 누르세요.</span>
    : <span>로그인은 <b>호스트</b>({s.hostName})에서 해야 해요.</span>
  return <>
    <p className="lead">Codex 세션이 어떻게 붙고 어떤 값으로 뜨는지. 🔴 Codex 는 <b>우리가 승인 화면을 못 띄웁니다</b>(stdio 권한 프로토콜이 없어요) — 그래서 «샌드박스» 가 곧 권한 정책이에요.{msg ? ` · ${msg}` : ''}</p>
    <Group t="인증" />
    <Row t="Codex 로그인 상태" d={cxAuth?.ok ? (cxAuth.how === 'key' ? 'API 키로 인증돼 있어요.' : `${cxAuth.where ?? '~/.codex'} 의 로그인을 씁니다.`) : <>터미널에서 <span className="mono">codex login</span> 을 하거나, 아래에 API 키를 넣으세요.</>} at="main">
      <span className="sv" style={{ color: cxAuth?.ok ? 'var(--done)' : 'var(--wait)' }}>{cxAuth?.ok ? (cxAuth.how === 'key' ? '키' : '로그인') : '안 됨'}</span>
    </Row>
    <Row t="Codex 로그인" d={cxLoginD}>
      <button className="btn on" disabled={busy || !main} onClick={() => void openLogin()}>터미널에서 로그인</button>
    </Row>
    <Row t="OpenAI API 키" d="키체인·브라우저 로그인을 못 쓰는 문맥(헤드리스·SSH)의 대안입니다. 워커 환경에만 넣고 ~/.codex 설정 파일은 건드리지 않아요." at="main">
      <input className="sin mono" type="password" placeholder="sk-…" value={cxKey} onChange={(e) => setCxKey(e.target.value)} />
      <button className="btn" disabled={busy || !cxKey.trim()} onClick={() => { void saveCx({ apiKey: cxKey }); setCxKey('') }}>저장</button>
    </Row>

    <Group t="새 채팅 기본값" />
    <Row t="Codex 기본 모델 · 노력" d={<>Codex 세션이 이 값으로 뜹니다. <b>비워 두면 CLI 가 계정에 맞는 모델을 고릅니다</b> — ChatGPT 계정으로 쓰신다면 그대로 두세요(쓸 수 있는 모델이 구독마다 달라서, 이름을 박으면 그 계정에서 안 돌 수 있어요).</>} at="main">
      <input className="sin mono" list="cx-models" value={cxModel} onChange={(e) => setCxModel(e.target.value)} onBlur={() => void saveD(cxModel, cxEffort)} placeholder="비워 두면 CLI 기본" />
      <datalist id="cx-models">{cxModels.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}</datalist>
      <select className="ssel sm" value={cxEffort} onChange={(e) => { setCxEffort(e.target.value); void saveD(cxModel, e.target.value) }}>{AGENT_EFFORTS.codex.map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}</select>
    </Row>
    <Row t="Codex 권한 (샌드박스)" d="새 Codex 세션의 권한 정책입니다. 승인 화면이 없으니 이 값이 전부예요." at="main">
      <select className="ssel" value={s.defaults.codex?.sandbox ?? 'read-only'} onChange={(e) => void saveCx({ sandbox: e.target.value })}>{CODEX_SANDBOX.map((x) => <option key={x.v} value={x.v}>{x.t} — {x.d}</option>)}</select>
    </Row>

    <Group t="연결" />
    <Row t="Codex 다시 연결" d={<>터미널에서 <span className="mono">codex login</span> 을 새로 했거나 키를 바꿨으면 눌러 주세요. Codex 세션의 일꾼만 내려 다음 메시지에 새로 뜹니다.</>}>
      <button className="btn" disabled={busy} onClick={() => void reconnect()}>다시 연결</button>
    </Row>
    {cxAuth?.how === 'key' ? <Row t="Codex 키 지우기" d="터미널 로그인(codex login) 모드로 돌아갑니다." danger at="main"><button className="btn danger" disabled={busy} onClick={() => void saveCx({ apiKey: '' })}>지우기</button></Row> : null}
  </>
}

/** 세션 · 사용량 — 어느 에이전트든 공통인 «세션이 어떻게 살고 얼마나 쓰나». 🔴 «요금제의 몇 %가 남았나» 는 CLI 가 안 내준다(실측) */
function SessionsPane() {
  const { s, refresh } = useStore()
  const main = s.device.main
  const [msg, setMsg] = useState('')
  const [st, setSt] = useState<{ hook?: boolean; budget?: { window: number; day: number; week: number } } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => void api<typeof st>('/usage').then(setSt).catch(() => {})
  useEffect(load, [])
  const setB = async (k: 'window' | 'day' | 'week', v: string) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) return; await api('/usage/budget', { body: { [k]: n } }); load() }
  return <>
    <p className="lead">모든 봇의 세션에 같이 적용되는 것들이에요.{msg ? ` · ${msg}` : ''}</p>
    {/* 🔴 절전 시간은 사람이 정한다 (루프 4/10) — 밤새 돌리는 사람과 낮에만 쓰는 사람이 다르다. 0 = 안 재움 */}
    <Row t="유휴 세션 절전" d="이만큼 조용하면 워커를 내려요. 대화·세션은 남고, 다음 메시지에 같은 자리에서 이어집니다." at="main">
      <select className="ssel" value={String(s.defaults.idleMinutes ?? 60)} onChange={async (e) => { try { await api('/idle', { body: { minutes: Number(e.target.value) } }); await refresh(); setMsg('저장했어요') } catch (err) { setMsg((err as Error).message) } }}>
        {[[15, '15분'], [30, '30분'], [60, '1시간'], [120, '2시간'], [240, '4시간'], [0, '재우지 않음']].map(([v, t]) => <option key={String(v)} value={String(v)}>{t}</option>)}
      </select>
    </Row>
    <Group t="사용량" />
    <p className="note">남은 양은 «내 예산 − 쓴 양» 입니다. 요금제 한도(%)는 CLI 밖으로 나오지 않아요. 비용은 토큰 × 단가 추정입니다.</p>
    {/* 훅은 **메인의** `~/.claude/settings.json` 을 고친다 — 원격에서는 상태만 보여 주고 버튼을 안 준다 */}
    <Row t="턴마다 기록하기" d="Claude Code 훅이 턴 끝에 읽기만 해서 이번 턴 토큰을 남깁니다. 터미널 세션까지 전부 잡혀요. 실패해도 조용히 끝나 턴을 막지 않습니다." at="main">
      {main
        ? <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await api('/usage/hook', { body: { on: !st?.hook } }); load() } finally { setBusy(false) } }}>{st?.hook ? '설치됨 · 제거' : '훅 설치'}</button>
        : <span className="sv">{st?.hook ? '설치됨' : '설치 안 됨'} · 메인에서</span>}
    </Row>
    <Row t="예산 — 5시간 창" d="막대가 이 값을 기준으로 줄어듭니다." at="main"><input className="bud" defaultValue={st?.budget?.window ?? ''} onBlur={(e) => void setB('window', e.target.value)} /><span className="unit">달러</span></Row>
    <Row t="예산 — 하루" at="main"><input className="bud" defaultValue={st?.budget?.day ?? ''} onBlur={(e) => void setB('day', e.target.value)} /><span className="unit">달러</span></Row>
    <Row t="예산 — 한 주" d="0 이면 예산 없음 — 패널에 «—» 로 보입니다." at="main"><input className="bud" defaultValue={st?.budget?.week ?? ''} onBlur={(e) => void setB('week', e.target.value)} /><span className="unit">달러</span></Row>
  </>
}

function TodoPane() {
  const [cfg, save] = useSwipeCfg()
  const slots: [SwipeSlot, string, string][] = [['rightShort', '오른쪽으로 짧게', '→ 25~45%'], ['rightLong', '오른쪽으로 길게', '→ 45% 이상'], ['leftShort', '왼쪽으로 짧게', '← 25~45%'], ['leftLong', '왼쪽으로 길게', '← 45% 이상']]
  const acts: SwipeAct[] = ['edit', 'done', 'menu', 'delete', 'delegate', 'expand', 'none']
  return <>
    <p className="lead">폰에서 할 일을 쓸어서 처리합니다. 데스크톱은 마우스를 올리면 나오는 도구를 써요.</p>
    {slots.map(([k, l, sub]) => <Row key={k} t={l} d={sub}>
      <span className="seg wrap">{acts.map((a) => <button key={a} className={cfg[k] === a ? 'on' : ''} onClick={() => save({ ...cfg, [k]: a })} title={ACT_LABEL[a]}><Icon n={ACT_ICON[a] as 'edit'} size={11} />{ACT_LABEL[a]}</button>)}</span>
    </Row>)}
    <Row t="진동" d="쓸어서 걸릴 때 짧게 울립니다."><span className="seg">{[[true, '켬'], [false, '끔']].map(([v, l]) => <button key={String(v)} className={cfg.haptics === v ? 'on' : ''} onClick={() => save({ ...cfg, haptics: v as boolean })}>{l as string}</button>)}</span></Row>
    <Row t="기본값으로" d="네 자리를 처음 설정으로 되돌립니다."><button className="btn" onClick={() => save(SWIPE_DEFAULT)}>되돌리기</button></Row>
  </>
}


/** 알림 — 이 기기의 푸시와, 모든 기기에 같이 적용되는 조용한 시간. 조용한 시간은 종전엔 글자만 있고 고칠 길이 없었다(2026-09-17) */
function NotifyPane() {
  const { s, refresh } = useStore()
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const q = s.quiet ?? { from: '23:00', to: '07:00' }
  const [from, setFrom] = useState(q.from); const [to, setTo] = useState(q.to); const [msg, setMsg] = useState('')
  useEffect(() => { setFrom(q.from); setTo(q.to) }, [q.from, q.to])
  const saveQ = async (f: string, t: string) => { if (f === q.from && t === q.to) return; try { await api('/quiet', { body: { from: f, to: t } }); await refresh(); setMsg('저장했어요') } catch (e) { setMsg((e as Error).message) } }
  return <>
    <Row t="이 기기 푸시" d="폰 푸시는 Tailscale serve 로 HTTPS 를 붙이고 홈 화면에 설치해야 동작해요." at="dev">
      <button className="btn" onClick={async () => setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30)))}>{pushOn === true ? '켜짐' : pushOn === false ? '실패' : '켜기'}</button>
    </Row>
    <Row t="조용한 시간" d={<>이 사이에는 «확인해 주세요» 만 통과합니다. 모든 기기에 같이 적용돼요.{msg ? ` · ${msg}` : ''}</>} at="main">
      <input className="sin tm" type="time" value={from} onChange={(e) => setFrom(e.target.value)} onBlur={() => void saveQ(from, to)} />
      <span className="unit">–</span>
      <input className="sin tm" type="time" value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => void saveQ(from, to)} />
    </Row>
    <Row t="푸시 테스트" d="이 기기로 한 번 보내 봅니다." at="dev"><button className="btn ghost" onClick={() => api('/push/test', { body: {} })}>보내기</button></Row>
  </>
}

/**
 * 참고 — 커넥터 · 스킬 · 폴더별 하네스. ⛔ **보기만 한다.** 고치는 자리는 그 폴더의 패널이다(V25 계약).
 * ⚠ **범용 문구로 쓴다** (2026-09-13 Dave) — 특정 커넥터 이름을 예로 박으면 «그 서비스를 쓰는 사람의 도구» 처럼 읽힌다.
 */
function RefPane() {
  const [gh, setGh] = useState<{ skills: HarnessItem[]; mcp: HarnessItem[] } | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => { void api<typeof gh>('/harness/global').then(setGh).catch(() => setGh(null)) }, [])
  const cut = (xs: HarnessItem[]) => (all ? xs : xs.slice(0, 4))
  return <>
    <p className="lead">모든 봇이 함께 쓰는 것들이에요. <b>이 {isWin ? '호스트' : '맥'}에 설치된 MCP 커넥터와 스킬을 그대로 씁니다</b> — Folder Bot 이 따로 설치하거나 바꾸지 않아요. 여기서는 보기만 하고, 폴더마다 다른 것은 그 폴더의 «이 폴더에서» 패널에서 고쳐요.</p>
    <Group t={`커넥터 (MCP)${gh ? ` · ${gh.mcp.length}` : ''}`} right={gh && gh.mcp.length > 4 ? <button className="lk" onClick={() => setAll(!all)}>{all ? '접기' : '모두 보기'}</button> : undefined} />
    {cut(gh?.mcp ?? []).map((i) => <div className="hitem" key={`m${i.name}`}>
      <span className="ic"><Icon n="plug" size={14} /></span>
      <span className="tx"><span className="t">{i.name}</span><span className="d mono">{i.desc}</span></span>
      <Scope s={i.scope} /><span className={`dt ${i.scope === 'builtin' ? 'ok' : ''}`} title={i.scope === 'builtin' ? '내장 — 늘 붙어 있어요' : '실제 연결은 봇이 뜰 때 확인돼요'} />
    </div>)}
    <p className="note">«붙어 있다» 는 <b>설정에 있다</b>는 뜻이에요. 실제 연결은 봇이 뜰 때 정해지므로 확인 전에는 회색 점으로 둡니다.</p>
    <Group t={`스킬${gh ? ` · ${gh.skills.length}` : ''}`} />
    {cut(gh?.skills ?? []).map((i) => <div className="hitem" key={`s${i.name}`}>
      <span className="ic"><Icon n="run" size={14} /></span>
      <span className="tx"><span className="t">{i.name}</span><span className="d">{i.desc}</span></span>
      <Scope s={i.scope} />
    </div>)}
    {gh && !gh.skills.length ? <Row t="스킬이 없어요" d="~/.claude/skills 나 볼트·폴더의 .claude/skills 에 SKILL.md 를 두면 여기 나옵니다." /> : null}
    <Group t="폴더별 하네스" />
    <HarnessTable />
  </>
}

/** 폴더별 하네스 표 — 검색·필터. ⛔ 고치는 버튼이 없다 */
function HarnessTable() {
  const [rows, setRows] = useState<HarnessRow[] | null>(null)
  const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'has' | 'none'>('all')
  useEffect(() => { void api<HarnessRow[]>('/harness').then(setRows).catch(() => setRows([])) }, [])
  const list = (rows ?? []).filter((r) => (f === 'all' ? true : f === 'has' ? r.claudeMd || r.agentsMd : !r.claudeMd && !r.agentsMd))
    .filter((r) => (q.trim() ? norm(r.name).includes(norm(q)) : true))
  const has = (rows ?? []).filter((r) => r.claudeMd || r.agentsMd).length
  return <>
    <p className="lead">폴더마다 다른 지침 · 스킬 · 커넥터입니다. <b>여기서는 보기만</b> 하고, 고치는 건 그 폴더의 «이 폴더에서» 패널에서 해요.</p>
    <div className="hfilter">
      <span className="sfind"><Icon n="search" size={13} color="var(--t3)" /><input placeholder="폴더 이름" value={q} onChange={(e) => setQ(e.target.value)} /></span>
      <span className="seg">
        <button className={f === 'all' ? 'on' : ''} onClick={() => setF('all')}>전체 {rows?.length ?? 0}</button>
        <button className={f === 'has' ? 'on' : ''} onClick={() => setF('has')}>지침 있음 {has}</button>
        <button className={f === 'none' ? 'on' : ''} onClick={() => setF('none')}>없음 {(rows?.length ?? 0) - has}</button>
      </span>
    </div>
    <div className="htab">
      {list.map((r) => <div className="hrow" key={r.rel}>
        <FolderBot color="var(--run)" size={22} mood="idle" />
        <span className="tx"><span className="t"><Mid s={r.name} /></span><span className="d">{r.section}</span></span>
        <span className={`yn ${r.claudeMd ? 'y' : ''}`}><Icon n={r.claudeMd ? 'check' : 'x'} size={11} color={r.claudeMd ? 'var(--done)' : 'var(--t3)'} />CLAUDE.md</span>
        <span className={`yn ${r.agentsMd ? 'y' : ''}`}><Icon n={r.agentsMd ? 'check' : 'x'} size={11} color={r.agentsMd ? 'var(--done)' : 'var(--t3)'} />AGENTS.md</span>
        <span className="n">스킬 {r.skills}</span><span className="n">MCP {r.mcp}</span>
      </div>)}
      {rows && !list.length ? <div className="hrow empty">해당하는 폴더가 없어요</div> : null}
    </div>
    <p className="note"><b>CLAUDE.md</b> 는 Claude Code 가, <b>AGENTS.md</b> 는 Codex 가 읽는 지침이에요. <b>스킬</b>·<b>MCP</b> 는 그 폴더에서 실제로 쓸 수 있는 수(사용자 것 + 볼트 것 + 폴더 것)입니다.</p>
  </>
}
