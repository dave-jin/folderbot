import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HarnessItem, HarnessRow } from '../core/types'
import { AGENT_EFFORTS, AGENT_MODELS, CODEX_SANDBOX, DEFAULT_EFFORT, DEFAULT_MODEL, PROVIDER_LABEL, type Provider } from '../core/agents'
import { copySay } from './clip'
import { api, setToken, subscribePush } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { Mark } from './Brand'
import { ICON_LABEL, ICON_PX, useIconSize, useTheme, type IconSize, type Theme } from './theme'
import { ACT_ICON, ACT_LABEL, SWIPE_DEFAULT, useSwipeCfg, type SwipeAct, type SwipeSlot } from './swipe'
import { fmtTime, useStore } from './store'
import { EFFORTS, MODELS } from './consts'
import { norm } from '../core/search'

/**
 * 설정 (V25 · 2026-09-13 Dave 승인) — 왼쪽 목차 · 한 화면에 한 가지.
 *
 * 종전에는 **한 장에 여덟 덩어리**가 세로로 쌓여 무엇을 찾는지 알 수 없었다(Dave: «설정 화면이 너무 복잡해졌어»).
 * 가르는 기준은 «언제 만지나» 이고, 줄은 늘 **제목 · 설명 · 조작** 세 칸이다 — 설명이 길어져도 조작 자리는 안 흔들린다.
 *
 * 🔴 **하네스는 여기서 보기만 한다.** 폴더에 딸린 것이라 설정에 목록으로만 두면 «지금 어느 폴더 이야기인가» 가
 *    사라진다. 고치는 자리는 그 폴더의 패널이고, 여기 «하네스» 칸은 전체를 훑는 표다.
 * ⛔ **위험한 것은 그 칸의 맨 아래에** — 로그아웃·토큰 지우기처럼 되돌리기 어려운 것.
 */

export type SecId = 'general' | 'host' | 'agents' | 'harness' | 'usage' | 'screen' | 'todo' | 'notify' | 'security'
const SECS: { id: SecId; label: string; icon: 'gear' }[] = [
  { id: 'general', label: '일반', icon: 'gear' },
  { id: 'host', label: '호스트 · 연결', icon: 'phone' as 'gear' },
  { id: 'agents', label: '에이전트', icon: 'sub' as 'gear' },
  { id: 'harness', label: '하네스', icon: 'folder' as 'gear' },
  { id: 'usage', label: '사용량', icon: 'clock' as 'gear' },
  { id: 'screen', label: '화면', icon: 'eye' as 'gear' },
  { id: 'todo', label: '할 일', icon: 'list' as 'gear' },
  { id: 'notify', label: '알림', icon: 'bell' as 'gear' },
  { id: 'security', label: '권한 · 보안', icon: 'check' as 'gear' }
]

/** 줄 하나 — 제목 · 설명 · 조작. 조작은 오른쪽 끝에 고정된다 */
function Row({ t, d, children, danger }: { t: string; d?: ReactNode; children?: ReactNode; danger?: boolean }) {
  return <div className={`setr ${danger ? 'danger' : ''}`} data-t={t}>
    <span className="tx"><span className="t">{t}</span>{d ? <span className="d">{d}</span> : null}</span>
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
  const hits = useMemo(() => (q.trim() ? searchRows(q) : []), [q])
  const cur = SECS.find((x) => x.id === sec)!
  const body = <Pane sec={sec} onClose={onClose} />
  /** ⎋ 로 닫는다 — 맥에서 시트를 닫는 기본 동작이고, 우리 단축키 표(⌘/)도 그렇게 적어 뒀다.
      ⚠ 찾기 칸에 글을 치는 중이면 ⎋ 는 **찾기를 먼저 비운다**(한 번 더 누르면 닫힌다). */
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.preventDefault(); if (q) setQ(''); else onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [q, onClose])

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
          <span className="ic"><Icon n="search" size={14} /></span><span className="nm">{h.t}<small>{SECS.find((x) => x.id === h.sec)!.label}</small></span><Icon n="chev" size={11} color="var(--t3)" />
        </button>)
          : SECS.map((x) => <button className="sec-row" key={x.id} onClick={() => { setSec(x.id); setDrill(true) }}>
            <span className="ic"><Icon n={x.icon} size={15} /></span><span className="nm">{x.label}</span><span className="vl">{summary(x.id, s)}</span><Icon n="chev" size={11} color="var(--t3)" />
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
          ? hits.map((h) => <button className={`nv ${sec === h.sec ? 'on' : ''}`} key={h.sec + h.t} onClick={() => { setSec(h.sec); setQ('') }}><Icon n="search" size={13} />{h.t}<small>{SECS.find((x) => x.id === h.sec)!.label}</small></button>)
          : SECS.map((x) => <button className={`nv ${sec === x.id ? 'on' : ''}`} key={x.id} onClick={() => setSec(x.id)}><Icon n={x.icon} size={14} />{x.label}</button>)}
        <span className="ver">Folder Bot v{s.version}</span>
      </div>
      <div className="spane">
        <div className="sp-h"><b>{cur.label}</b><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
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

/** 검색 — 제목과 설명을 함께 찾는다 («토큰» 을 치면 에이전트 칸의 그 줄이 나온다) */
const INDEX: { sec: SecId; t: string; d: string }[] = [
  { sec: 'general', t: '메인(호스트) 이름', d: '모든 기기에 같이 보이는 이름' },
  { sec: 'general', t: '이 기기 이름', d: '기기마다 따로' },
  { sec: 'host', t: '볼트 루트', d: '봇이 사는 폴더' },
  { sec: 'host', t: '주소', d: '포트 tailscale 원격 접속' },
  { sec: 'host', t: '기기', d: '페어링 코드 끊기' },
  { sec: 'agents', t: '깔린 CLI', d: 'Claude Code Codex 버전' },
  { sec: 'agents', t: '기본 모델 · 생각 레벨', d: '새 세션부터 적용' },
  { sec: 'agents', t: 'Codex 기본 모델 · 노력', d: 'gpt codex reasoning effort' },
  { sec: 'agents', t: 'Codex 권한', d: '샌드박스 read-only workspace-write' },
  { sec: 'agents', t: 'Codex 로그인 · OpenAI API 키', d: 'codex login openai key' },
  { sec: 'agents', t: 'Claude 로그인', d: '키체인 인증 상태' },
  { sec: 'agents', t: '장기 토큰', d: 'setup-token 헤드리스 SSH 인증' },
  { sec: 'agents', t: '커넥터 (MCP)', d: '연결된 도구 서버' },
  { sec: 'agents', t: '스킬', d: '슬래시 명령 skills' },
  { sec: 'harness', t: '폴더별 하네스', d: 'CLAUDE.md AGENTS.md 스킬 커넥터' },
  { sec: 'usage', t: '턴마다 기록하기', d: '훅 설치 사용량' },
  { sec: 'usage', t: '예산', d: '5시간 하루 한 주 달러' },
  { sec: 'screen', t: '테마', d: '시스템 라이트 다크' },
  { sec: 'screen', t: '폴더봇 크기', d: '레일 아이콘 크게 작게' },
  { sec: 'todo', t: '쓸어서 처리', d: '스와이프 네 자리 진동' },
  { sec: 'notify', t: '이 기기 푸시', d: '알림 조용한 시간' },
  { sec: 'security', t: 'macOS 권한', d: '전체 디스크 접근 알림' },
  { sec: 'security', t: '이 기기 로그아웃', d: '연결 끊기' }
]
function searchRows(q: string) { const n = norm(q); return INDEX.filter((r) => norm(r.t).includes(n) || norm(r.d).includes(n)) }
function summary(id: SecId, s: ReturnType<typeof useStore>['s']): string {
  if (id === 'general') return s.hostName
  if (id === 'host') return s.addrs[0] ? `${s.addrs[0]}:${s.port}` : ''
  if (id === 'agents') return s.auth.verdict === 'loggedin' ? '로그인됨' : s.auth.verdict
  if (id === 'screen') return ''
  return ''
}

/* ── 칸들 ──────────────────────────────────────────────────────────────── */
function Pane({ sec, onClose }: { sec: SecId; onClose: () => void }) {
  if (sec === 'general') return <GeneralPane />
  if (sec === 'host') return <HostPane />
  if (sec === 'agents') return <AgentsPane />
  if (sec === 'harness') return <HarnessPane />
  if (sec === 'usage') return <UsagePane />
  if (sec === 'screen') return <ScreenPane />
  if (sec === 'todo') return <TodoPane />
  if (sec === 'notify') return <NotifyPane />
  return <SecurityPane onClose={onClose} />
}

function GeneralPane() {
  const { s, refresh } = useStore()
  const [host, setHost] = useState(s.hostName); const [dev, setDev] = useState(s.device.name); const [msg, setMsg] = useState('')
  useEffect(() => { setHost(s.hostName); setDev(s.device.name) }, [s.hostName, s.device.name])
  const save = async (body: { hostName?: string; deviceName?: string }) => { try { await api('/names', { body }); await refresh(); setMsg('저장했어요') } catch (e) { setMsg((e as Error).message) } }
  return <>
    <p className="lead">지금 이 화면은 {s.device.main ? <><b>메인</b> ({s.hostName}) 에서</> : <><b>원격 · {s.device.name}</b> 에서 <b>{s.hostName}</b> 를</>} 보고 있어요.{msg ? ` · ${msg}` : ''}</p>
    <Row t="메인(호스트) 이름" d="봇이 사는 맥의 이름. 모든 기기에 같이 보여요.">
      <input className="sin" value={host} onChange={(e) => setHost(e.target.value)} onBlur={() => { if (host.trim() !== s.hostName) void save({ hostName: host }) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </Row>
    {!s.device.main ? <Row t="이 기기 이름" d="기기마다 따로 정합니다. 기본값은 페어링할 때 고른 기기 종류.">
      <input className="sin" value={dev} onChange={(e) => setDev(e.target.value)} onBlur={() => { if (dev.trim() && dev.trim() !== s.device.name) void save({ deviceName: dev }) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </Row> : null}
  </>
}

/**
 * 🔴 **원격에는 «메인 것» 을 안 보여 준다** (2026-09-13 Dave: «원격에서는 메인에 필요없는 내용들은 보여질 필요가 없어»).
 *
 * 가르는 기준은 «**이 기기에서 할 수 있나**» 다 — 여기서 눌러도 아무 일이 안 일어나거나, 눌러도 결과가
 * 이 기기에 없는 줄은 원격에서 줄 자체를 안 그린다. 반대로 «메인을 원격에서 고치는» 것이 존재 이유인 줄
 * (장기 토큰 · 기기 끊기)은 남긴다 — 헤드리스 메인을 밖에서 손보라고 만든 기능이다.
 * ⚠ 새 줄을 만들 때 «메인에서만 되는가» 를 먼저 정한다. 안 정하면 원격 화면에 죽은 버튼이 하나 는다.
 */
function HostPane() {
  const { s, refresh } = useStore()
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null)
  const isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  return <>
    <Row t="볼트 루트" d="봇들이 사는 폴더예요."><span className="mono sv">{s.root}</span></Row>
    <Row t="주소" d="같은 망에서 이 주소로 들어옵니다."><span className="mono sv">{s.addrs.map((a) => `${a}:${s.port}`).join(' · ')}</span></Row>
    {s.tailnet ? <Row t="Tailscale" d="밖에서 들어올 때 쓰는 길."><span className="sv">{s.tailnet.state}{s.tailnet.dnsName ? ` · ${s.tailnet.dnsName}` : ''}</span></Row> : null}
    <Group t="기기" />
    {s.devices.map((d) => <Row key={d.id} t={d.name} d={`마지막 접속 ${fmtTime(d.lastSeen)}`}><button className="btn ghost" onClick={() => api('/devices/revoke', { body: { id: d.id } }).then(refresh)}>끊기</button></Row>)}
    {/* ⛔ 페어링은 루프백에서만 열린다(호스트가 그렇게 막는다) — 원격에서는 줄 자체를 안 그린다 */}
    {isLocal ? <Row t="새 기기 연결" d="폰이나 다른 맥에서 이 코드를 넣으면 붙어요 (2분).">
      {pair ? <span className="pcode mono">{pair.code}</span> : null}<button className="btn" onClick={async () => setPair(await api('/pairing', { body: {} }))}>페어링 코드</button>
    </Row> : null}
  </>
}

/** 설정 › 에이전트 — 모든 봇이 함께 쓰는 것. 폴더마다 다른 것은 «하네스» 칸에 있다 */
/** ⚠ 화면에는 영문 판정(`loggedin`)을 그대로 내지 않는다 — 사람이 읽을 말이어야 한다 */
const VERDICT_T: Record<string, string> = { loggedin: '로그인됨', loggedout: '로그아웃', unreadable: '못 읽음', unknown: '확인 전' }
const VERDICT_D: Record<string, string> = {
  loggedin: '키체인 로그인이 읽혀요.',
  loggedout: '호스트 맥 터미널에서 claude → /login 을 해 주세요.',
  unreadable: '로그인은 있는데 이 문맥에서 못 읽어요 — 호스트를 GUI 터미널에서 띄우거나 장기 토큰을 넣으세요.',
  unknown: '아직 확인하지 않았어요.'
}

function AgentsPane() {
  const { s, refresh } = useStore()
  const main = s.device.main     // 터미널은 호스트 맥에서만 열린다
  const [list, setList] = useState<Provider[] | null>(null)
  const [gh, setGh] = useState<{ skills: HarnessItem[]; mcp: HarnessItem[] } | null>(null)
  const [all, setAll] = useState(false)
  const [model, setModel] = useState(s.defaults.model || DEFAULT_MODEL.claude); const [effort, setEffort] = useState(s.defaults.effort || DEFAULT_EFFORT.claude)
  const [cxModel, setCxModel] = useState(s.defaults.codex?.model || DEFAULT_MODEL.codex); const [cxEffort, setCxEffort] = useState(s.defaults.codex?.effort || DEFAULT_EFFORT.codex)
  const [cxKey, setCxKey] = useState('')
  const [tok, setTok] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [diag, setDiag] = useState('')
  useEffect(() => { void api<Provider[]>('/agents').then(setList).catch(() => setList([])); void api<typeof gh>('/harness/global').then(setGh).catch(() => setGh(null)) }, [])
  const saveD = async (m: string, e: string, agent: 'claude' | 'codex' = 'claude') => { await api('/defaults', { body: { model: m, effort: e, agent } }); await refresh(); setMsg('저장했어요 — 다음 세션부터 적용돼요.') }
  const saveCx = async (o: { sandbox?: string; apiKey?: string }) => { setBusy(true); try { await api('/codex', { body: o }); await refresh(); setMsg('Codex 설정을 저장했어요.') } finally { setBusy(false) } }
  const hasCodex = (list ?? []).some((p) => p.id === 'codex')
  const cxAuth = s.defaults.codex?.auth
  const saveT = async (t: string) => { setBusy(true); try { await api('/auth/token', { body: { token: t } }); await refresh(); setMsg(t ? '토큰을 저장했어요.' : '토큰을 지웠어요.'); setTok('') } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
  /**
   * 🔴 **터미널에서 로그인** — 우리가 대신 로그인할 수는 없지만(브라우저 승인이 필요한 대화형 절차)
   *    **그 창을 열어 줄 수는 있다**. 종전에는 «터미널에서 claude 를 치세요» 라는 글자만 있었고,
   *    그건 기능이 아니라 안내문이었다 (2026-09-13 Dave: «로그인 연결 기능이 안보여서 진행이 안돼»).
   */
  const openLogin = async (agent: 'claude' | 'codex') => {
    setBusy(true)
    try {
      await api('/auth/login-terminal', { body: { agent } })
      setMsg(agent === 'codex' ? '터미널을 열었어요 — codex login 이 돌아가면 마치고 [다시 연결]' : '터미널을 열었어요 — claude 가 뜨면 /login 을 치고, 끝나면 [다시 연결]')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  /** 다시 연결 — 인증을 다시 읽고 일꾼을 내린다. 몇이 지금 내려갔고 몇이 턴 뒤에 내려갈지 말해 준다 */
  const reconnect = async (agent?: 'claude' | 'codex') => {
    setBusy(true)
    try {
      const r = await api<{ now: number; pending: number }>('/auth/reconnect', { body: { agent } })
      await refresh()
      setMsg(r.pending ? `${r.now}개를 다시 연결했어요 · ${r.pending}개는 턴이 끝나면 이어서 합니다.` : r.now ? `${r.now}개를 다시 연결했어요 — 다음 메시지부터 새 환경이에요.` : '연결할 일꾼이 없었어요 — 다음 메시지부터 새 환경으로 뜹니다.')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  /** ⚠ 긴 설명은 JSX 밖에서 만든다 — 프롭 안 삼항에 조각을 통째로 넣으면 읽기도 어렵고 파서도 헷갈린다 */
  const loginD = main
    ? <span>누르면 호스트 맥에 터미널이 열립니다. <span className="mono">claude</span> 가 뜨면 <span className="mono">/login</span> 을 치고 브라우저에서 마치세요 — 그러면 <b>claude.ai 커넥터도 함께 붙습니다</b>.</span>
    : <span>로그인은 <b>호스트 맥</b>({s.hostName})에서 해야 해요. 그 맥의 Folder Bot 설정에서 누르거나, 터미널에서 <span className="mono">claude</span> → <span className="mono">/login</span>.</span>
  const cxLoginD = main
    ? <span>누르면 호스트 맥에 터미널이 열리고 <span className="mono">codex login</span> 이 돌아갑니다. 브라우저에서 마치고 [다시 연결] 을 누르세요.</span>
    : <span>로그인은 <b>호스트 맥</b>({s.hostName})에서 해야 해요.</span>
  const cut = (xs: HarnessItem[]) => (all ? xs : xs.slice(0, 4))
  return <>
    {/* ⚠ **범용 문구로 쓴다** (2026-09-13 Dave) — 이 제품은 누구나 쓴다. 특정 커넥터 이름을 예로
        박으면 «그 서비스를 쓰는 사람의 도구» 처럼 읽힌다. 우리가 말할 수 있는 것은 «이 맥에 깔린
        것을 그대로 쓴다» 까지다(설치는 우리가 하지 않는다). */}
    <p className="lead">모든 봇이 함께 쓰는 것들입니다. <b>이 맥에 설치된 MCP 커넥터와 스킬을 그대로 씁니다</b> — Folder Bot 이 따로 설치하거나 바꾸지 않아요. 폴더마다 다른 것은 <b>하네스</b> 칸에 있어요.</p>
    <Group t="깔린 CLI" />
    {(list ?? []).map((p) => <div className="hitem" key={p.id}>
      <span className="ic"><Mark id={p.id} size={16} /></span>
      <span className="tx"><span className="t">{PROVIDER_LABEL[p.id]}</span><span className="d mono">{p.version ?? ''}{p.bin ? ` · ${p.bin}` : ''}</span></span>
      <Scope s="user" /><span className="dt ok" />
    </div>)}
    {list && !list.length ? <Row t="깔린 에이전트가 없어요" d="Claude Code 를 먼저 설치하세요 — 여기 보이는 것만 폴더를 시작할 때 고를 수 있어요." /> : null}

    <Group t="기본값" />
    <Row t="모델 · 생각 레벨" d="모든 봇의 새 세션이 이 값으로 뜹니다. 세션마다 바꾸려면 입력창 아래 줄에서.">
      <select className="ssel" value={model} onChange={(e) => { setModel(e.target.value); void saveD(e.target.value, effort) }}>{MODELS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}</select>
      <select className="ssel sm" value={effort} onChange={(e) => { setEffort(e.target.value); void saveD(model, e.target.value) }}>{EFFORTS.map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}</select>
    </Row>
    {/* 🔴 **Codex 도 Claude 와 같은 칸을 갖는다** (2026-09-13 Dave: «codex도 claude와 같이 영구 토큰
        에이전트 모델 기본 설정등이 있어야 해»). ⚠ 다만 **값은 Codex 것으로 바뀐다** — 모델 이름 체계도,
        노력 단계(`model_reasoning_effort`: 최소…높음)도 다르다. 같은 목록을 쓰면 첫 턴에 죽는다. */}
    {/* 🔴 **비워 두는 것이 기본이다** (2026-09-13 실사고) — ChatGPT 계정은 쓸 수 있는 모델이 구독마다
        다르다. 이름을 박아 넘기면 그 계정에서 **모든 턴이 400 으로 죽는다**. */}
    {hasCodex ? <Row t="Codex 기본 모델 · 노력" d={<>Codex 세션이 이 값으로 뜹니다. <b>비워 두면 CLI 가 계정에 맞는 모델을 고릅니다</b> — ChatGPT 계정으로 쓰신다면 그대로 두세요(쓸 수 있는 모델이 구독마다 달라서, 이름을 박으면 그 계정에서 안 돌 수 있어요). API 키로 쓰신다면 골라도 됩니다.</>} data-t="Codex 기본 모델">
      <input className="sin mono" list="cx-models" value={cxModel} onChange={(e) => setCxModel(e.target.value)} onBlur={() => void saveD(cxModel, cxEffort, 'codex')} placeholder="비워 두면 CLI 기본" />
      <datalist id="cx-models">{AGENT_MODELS.codex.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}</datalist>
      <select className="ssel sm" value={cxEffort} onChange={(e) => { setCxEffort(e.target.value); void saveD(cxModel, e.target.value, 'codex') }}>{AGENT_EFFORTS.codex.map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}</select>
    </Row> : null}
    {hasCodex ? <Row t="Codex 권한" d={<>🔴 Codex 는 <b>우리가 승인 화면을 못 띄웁니다</b> — stdio 권한 프로토콜이 없어요. 그래서 이 값이 곧 권한 정책입니다.</>} data-t="Codex 권한">
      <select className="ssel" value={s.defaults.codex?.sandbox ?? 'read-only'} onChange={(e) => void saveCx({ sandbox: e.target.value })}>{CODEX_SANDBOX.map((x) => <option key={x.v} value={x.v}>{x.t} — {x.d}</option>)}</select>
    </Row> : null}
    {hasCodex ? <Row t="Codex 로그인" d={cxAuth?.ok ? (cxAuth.how === 'key' ? 'API 키로 인증돼 있어요.' : `${cxAuth.where ?? '~/.codex'} 의 로그인을 씁니다.`) : <>터미널에서 <span className="mono">codex login</span> 을 하거나, 아래에 API 키를 넣으세요.</>} data-t="Codex 로그인">
      <span className="sv" style={{ color: cxAuth?.ok ? 'var(--done)' : 'var(--wait)' }}>{cxAuth?.ok ? (cxAuth.how === 'key' ? '키' : '로그인') : '안 됨'}</span>
    </Row> : null}
    {hasCodex ? <Row t="OpenAI API 키" d="키체인·브라우저 로그인을 못 쓰는 문맥(헤드리스·SSH)의 대안입니다. 워커 환경에만 넣고 ~/.codex 설정 파일은 건드리지 않아요." data-t="OpenAI API 키">
      <input className="sin mono" type="password" placeholder="sk-…" value={cxKey} onChange={(e) => setCxKey(e.target.value)} />
      <button className="btn" disabled={busy || !cxKey.trim()} onClick={() => { void saveCx({ apiKey: cxKey }); setCxKey('') }}>저장</button>
    </Row> : null}
    {hasCodex ? <Row t="Codex 로그인" d={cxLoginD}>
      <button className="btn on" disabled={busy || !main} onClick={() => void openLogin('codex')}>터미널에서 로그인</button>
    </Row> : null}
    {hasCodex ? <Row t="Codex 다시 연결" d={<>터미널에서 <span className="mono">codex login</span> 을 새로 했거나 키를 바꿨으면 눌러 주세요. Codex 세션의 일꾼만 내려 다음 메시지에 새로 뜹니다.</>} data-t="Codex 다시 연결">
      <button className="btn" disabled={busy} onClick={() => void reconnect('codex')}>다시 연결</button>
    </Row> : null}
    {/* 🔴 **진단** (2026-09-13 Dave: «상황을 어떻게 알아보고 알려줄까?») — 사람이 전령이 되면 안 된다.
        바이너리 · 판 · 자격증명 파일 · CLI 의 답을 한 덩이로 찍어 준다.
        ⛔ 토큰·이메일·키 **값은 안 들어간다** — 이 글은 채팅에 붙여넣게 될 것이다. */}
    <Row t="연결 진단" d={diag ? <pre className="diag">{diag}</pre> : '로그인이 안 될 때 눌러 보세요. 무엇이 어디에 있고 CLI 가 뭐라고 하는지 한 덩이로 보여 줍니다 — 그대로 복사해서 저에게 주시면 돼요.'} data-t="연결 진단">
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ text: string }>('/auth/diagnose'); setDiag(r.text) } catch (e) { setDiag((e as Error).message) } finally { setBusy(false) } }}>진단</button>
      {diag ? <button className="btn ghost" onClick={() => void copySay(diag, setMsg, '진단을 복사했어요')}>복사</button> : null}
    </Row>
    {hasCodex && cxAuth?.how === 'key' ? <Row t="Codex 키 지우기" d="터미널 로그인(codex login) 모드로 돌아갑니다." danger><button className="btn danger" disabled={busy} onClick={() => void saveCx({ apiKey: '' })}>지우기</button></Row> : null}

    <Group t="Claude 인증" />
    {/* 🔴 **로그인은 한 번 누르면 시작된다** — 안내문이 아니라 단추다(Dave, 2026-09-13).
        ⚠ 터미널은 **호스트 맥**에 뜬다 — 원격에서 눌러도 저쪽 화면에 떠서 소용이 없으므로 안내로 바꾼다. */}
    <Row t="Claude Code 로그인" d={loginD}>
      <button className="btn on" disabled={busy || !main} onClick={() => void openLogin('claude')}>터미널에서 로그인</button>
    </Row>
    <Row t="Claude 로그인 상태" d={msg || VERDICT_D[s.auth.verdict]}>
      <span className="sv" style={{ color: s.auth.verdict === 'loggedin' ? 'var(--done)' : 'var(--wait)' }}>{VERDICT_T[s.auth.verdict]}{s.auth.email ? ` · ${s.auth.email}` : ''}</span>
      <button className="btn ghost" onClick={() => api('/auth/refresh', { body: {} }).then(refresh)}>다시 확인</button>
    </Row>
    {/* 🔴 **지금 무엇으로 붙어 있나** — 이 한 줄이 «왜 Akiflow 가 안 뜨지» 를 그 자리에서 답한다
        (2026-09-13 Dave 보고). 토큰을 쓰면 CLI 가 claude.ai 커넥터 로딩을 통째로 건너뛴다. */}
    <Row t="쓰는 인증" d={s.auth.mode === 'token'
      ? <>장기 토큰으로 붙어 있어요. ⚠ <b>이 모드에서는 claude.ai 계정에 연결해 둔 커넥터가 안 붙습니다</b> — 토큰 스코프에 <span className="mono">user:mcp_servers</span> 가 없어요. 호스트 맥 터미널에서 <span className="mono">claude</span> → <span className="mono">/login</span> 을 하면 키체인 로그인이 자동으로 우선합니다. (이 맥에 설치된 MCP·스킬은 어느 쪽이든 그대로 씁니다.)</>
      : <>키체인 로그인으로 붙어 있어요 — <b>이 맥에 설치된 MCP 커넥터·스킬과 claude.ai 계정 커넥터를 그대로 씁니다</b>. (장기 토큰이 저장돼 있어도 키체인이 읽히면 그쪽을 씁니다.)</>} data-t="쓰는 인증">
      <span className="sv" style={{ color: s.auth.mode === 'token' ? 'var(--wait)' : 'var(--done)' }}>{s.auth.mode === 'token' ? '장기 토큰' : '키체인 로그인'}</span>
    </Row>
    {/* 🔴 **다시 연결** — 도구 목록·인증은 워커가 뜰 때 고정된다. 터미널에서 로그인을 새로 해도
        이미 떠 있는 세션에는 안 닿는다. 그래서 워커만 내리고 대화는 남긴다. */}
    <Row t="다시 연결" d={<>로그인을 새로 했거나 커넥터를 붙였으면 눌러 주세요. <b>대화는 그대로 두고 일꾼만 내립니다</b> — 다음 메시지에 새 환경으로 다시 떠요. 일하는 중인 세션은 <b>턴이 끝나면</b> 내려갑니다.</>} data-t="다시 연결">
      <button className="btn" disabled={busy} onClick={() => void reconnect()}>다시 연결</button>
    </Row>

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

    <Row t="장기 토큰" d={<>키체인 로그인을 못 읽는 상황(헤드리스·SSH)이면 씁니다. 터미널에 <span className="mono">claude setup-token</span> 을 치고 나온 토큰을 넣으세요 (1년). ⚠ 토큰 모드에선 claude.ai 커넥터가 안 붙어요.</>}>
      <input className="sin mono" placeholder="sk-ant-oat01-…" value={tok} onChange={(e) => setTok(e.target.value)} />
      <button className="btn" disabled={busy || !tok.trim()} onClick={() => saveT(tok)}>저장</button>
    </Row>
    {s.auth.mode === 'token' ? <Row t="토큰 지우기" d="키체인 로그인 모드로 돌아갑니다." danger><button className="btn danger" disabled={busy} onClick={() => saveT('')}>지우기</button></Row> : null}
  </>
}

/** 설정 › 하네스 — 폴더별 한눈에. ⛔ 여기서는 고치지 않는다 */
function HarnessPane() {
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

/** 🔴 «요금제의 몇 %가 남았나» 는 CLI 가 안 내준다(실측). 남은 양은 **내 예산 − 쓴 양** 이고, 여기서 그 예산을 정한다 */
function UsagePane() {
  const main = useStore().s.device.main
  const [st, setSt] = useState<{ hook?: boolean; budget?: { window: number; day: number; week: number } } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => void api<typeof st>('/usage').then(setSt).catch(() => {})
  useEffect(load, [])
  const setB = async (k: 'window' | 'day' | 'week', v: string) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) return; await api('/usage/budget', { body: { [k]: n } }); load() }
  return <>
    <p className="lead">남은 양은 «내 예산 − 쓴 양» 입니다. 요금제 한도(%)는 CLI 밖으로 나오지 않아요.</p>
    {/* 훅은 **메인의** `~/.claude/settings.json` 을 고친다 — 원격에서는 상태만 보여 주고 버튼을 안 준다 */}
    <Row t="턴마다 기록하기" d="Claude Code 훅이 턴 끝에 읽기만 해서 이번 턴 토큰을 남깁니다. 터미널 세션까지 전부 잡혀요. 실패해도 조용히 끝나 턴을 막지 않습니다.">
      {main
        ? <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await api('/usage/hook', { body: { on: !st?.hook } }); load() } finally { setBusy(false) } }}>{st?.hook ? '설치됨 · 제거' : '훅 설치'}</button>
        : <span className="sv">{st?.hook ? '설치됨' : '설치 안 됨'} · 메인에서</span>}
    </Row>
    <Row t="예산 — 5시간 창" d="막대가 이 값을 기준으로 줄어듭니다."><input className="bud" defaultValue={st?.budget?.window ?? ''} onBlur={(e) => void setB('window', e.target.value)} /><span className="unit">달러</span></Row>
    <Row t="예산 — 하루"><input className="bud" defaultValue={st?.budget?.day ?? ''} onBlur={(e) => void setB('day', e.target.value)} /><span className="unit">달러</span></Row>
    <Row t="예산 — 한 주"><input className="bud" defaultValue={st?.budget?.week ?? ''} onBlur={(e) => void setB('week', e.target.value)} /><span className="unit">달러</span></Row>
    <p className="note">비용은 토큰 × 단가 추정입니다.</p>
  </>
}

function ScreenPane() {
  const [theme, setTheme] = useTheme(); const [sz, setSz] = useIconSize()
  return <>
    <Row t="테마" d="시스템을 고르면 맥의 밝기 설정을 따라갑니다.">
      <span className="seg">{([['auto', '시스템'], ['light', '라이트'], ['dark', '다크']] as [Theme, string][]).map(([v, l]) => <button key={v} className={theme === v ? 'on' : ''} onClick={() => setTheme(v)}>{l}</button>)}</span>
    </Row>
    <Row t="폴더봇 크기" d="목록의 폴더봇 크기예요. 마우스를 올리면 한 번 더 커져서 표정이 보여요.">
      <span className="seg">{(['s', 'm', 'l'] as IconSize[]).map((v) => <button key={v} className={sz === v ? 'on' : ''} onClick={() => setSz(v)} title={`${ICON_PX[v]}px`}>{ICON_LABEL[v]}</button>)}</span>
    </Row>
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

function NotifyPane() {
  const { s } = useStore()
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  return <>
    <Row t="이 기기 푸시" d="폰 푸시는 Tailscale serve 로 HTTPS 를 붙이고 홈 화면에 설치해야 동작해요.">
      <button className="btn" onClick={async () => setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30)))}>{pushOn === true ? '켜짐' : pushOn === false ? '실패' : '켜기'}</button>
    </Row>
    <Row t="조용한 시간" d="23:00–07:00 에는 «확인해 주세요» 만 통과합니다."><span className="sv">23:00 – 07:00</span></Row>
    <Row t="푸시 테스트" d="이 기기로 한 번 보내 봅니다."><button className="btn ghost" onClick={() => api('/push/test', { body: {} })}>보내기</button></Row>
  </>
}

function SecurityPane({ onClose }: { onClose: () => void }) {
  // ⚠ 원격 맥 앱에도 `folderbotDesktop` 은 있다 — 하지만 이 권한은 **볼트를 읽는 메인 맥**의 것이라
  //    원격에서 눌러 봐야 남의 집 문을 여는 셈이다. 그래서 «이 화면이 메인인가» 까지 함께 본다.
  const main = useStore().s.device.main
  const hasPerms = main && !!(window as unknown as { folderbotDesktop?: { perms?: unknown } }).folderbotDesktop?.perms
  return <>
    {hasPerms ? <Row t="macOS 권한" d="전체 디스크 접근 · 알림. 볼트를 읽으려면 필요해요."><button className="btn" onClick={() => { onClose(); window.dispatchEvent(new Event('fb:perm-gate')) }}>다시 확인</button></Row> : null}
    <Row t="이 기기 로그아웃" d="이 기기의 연결을 끊습니다. 다시 붙으려면 페어링 코드가 필요해요." danger>
      <button className="btn danger" onClick={() => { setToken(''); location.reload() }}>로그아웃</button>
    </Row>
  </>
}
