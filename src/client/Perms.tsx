import { useEffect, useState } from 'react'
import { FolderBot, Icon } from './FolderBot'
import { Mark } from './Brand'
import { api } from './api'
import { useStore } from './store'
import { LocalOpenPicker } from './localOpen'
import type { ProviderId } from '../core/agents'

/** 데스크톱 셸이 재 주는 권한 한 줄 */
export interface PermRow { id: 'full-disk' | 'notifications' | 'local-open'; required: boolean; probeable: boolean; status: 'granted' | 'missing' | 'unknown' }
interface PermBridge { list: () => Promise<PermRow[]>; open: (id: PermRow['id']) => Promise<{ ok: boolean }>; ack: (id: PermRow['id'], ok: boolean) => Promise<PermRow[]>; reset: () => Promise<PermRow[]>; test: () => Promise<{ ok: boolean }>; relaunch: () => void; onChange: (cb: (items: PermRow[]) => void) => () => void }
export const permBridge = (): PermBridge | undefined => (window as unknown as { folderbotDesktop?: { perms?: PermBridge } }).folderbotDesktop?.perms

export const permsSatisfied = (items: PermRow[]): boolean => items.every((p) => !p.required || p.status === 'granted')

/** 권한 문구 한 벌 — 관문과 설정이 같은 걸 읽는다 */
const META: Record<PermRow['id'], { title: string; why: string; icon: 'folder' | 'bell' | 'open'; how: string[] }> = {
  'local-open': { title: '이 기기에서 파일 열기', icon: 'open', why: '«Finder 에서 보기»·«열기» 를 누르면 메인 맥이 아니라 지금 앉아 있는 이 기기에서 열려요. Dropbox·iCloud 로 같은 볼트가 이 기기에도 있으면 그 파일을, 없으면 호스트에서 받아서 엽니다.', how: ['아래에서 하나를 고르세요 — 나중에 설정 › 기기 에서 바꿀 수 있어요'] },
  'full-disk': { title: '전체 디스크 접근', icon: 'folder', why: '데스크탑·문서·iCloud·Dropbox·외장 폴더의 파일을 읽고 저장하려면 필요해요. 없으면 폴더가 열리기는 해도 저장·정리가 조용히 실패합니다.', how: ['아래 [시스템 설정 열기] 를 누르면 «개인정보 보호 › 전체 디스크 접근» 이 열립니다', '목록에서 Folder Bot 을 찾아 스위치를 켜세요 (없으면 + 로 응용 프로그램에서 추가)', '이 창으로 돌아오면 자동으로 확인합니다 — 켰는데도 꺼짐이면 [다시 시작]'] },
  notifications: { title: '알림', icon: 'bell', why: '봇이 확인을 기다리거나 일을 끝내면 알려 드려요. 없으면 다른 창에 있는 동안 아무 소식도 못 받습니다.', how: ['아래 [테스트 알림 보내기] 를 누르세요', '화면 오른쪽 위에 알림이 보이면 [보였어요]', '안 보이면 [시스템 설정 열기] → 알림 › Folder Bot 을 «허용» 으로'] }
}

/**
 * 권한 관문 — 처음 실행 · 업데이트 뒤(서명이 바뀌어 전체 디스크 접근이 풀린다) 필수가 빠져 있으면 화면 전체로 뜬다.
 * 판정·기록은 셸(desktop/perms.js)이 하고 여기는 보여 주고 버튼을 누를 뿐이다.
 * 창에 돌아오면 셸이 다시 재서 밀어 주므로 «돌아오세요» 로 끝난다 — 사용자가 기억할 절차를 하나 지운다.
 */
export function usePerms(): { items: PermRow[] | null; open: boolean; setOpen: (v: boolean) => void; refresh: () => Promise<void> } {
  const [items, setItems] = useState<PermRow[] | null>(null); const [open, setOpen] = useState(false)
  const refresh = async () => { const b = permBridge(); if (!b) return; try { setItems(await b.list()) } catch {} }
  useEffect(() => {
    const b = permBridge(); if (!b) return
    let first = true
    void b.list().then((it) => { setItems(it); if (first) { first = false; if (!permsSatisfied(it)) setOpen(true) } }).catch(() => {})
    const off = b.onChange((it) => setItems(it))
    const onGate = () => setOpen(true); window.addEventListener('fb:perm-gate', onGate)
    return () => { off(); window.removeEventListener('fb:perm-gate', onGate) }
  }, [])
  return { items, open, setOpen, refresh }
}

export function PermGate({ items, onDone, refresh }: { items: PermRow[]; onDone: () => void; refresh: () => Promise<void> }) {
  const b = permBridge()
  const [msg, setMsg] = useState(''); const [tested, setTested] = useState(false)
  const ok = permsSatisfied(items); const anyRequired = items.some((p) => p.required)
  const openPane = async (id: PermRow['id']) => { await b?.open(id); setMsg('목록에서 Folder Bot 을 켠 뒤 이 창으로 돌아오세요 — 돌아오면 자동으로 확인해요') }
  const ack = async (id: PermRow['id'], v: boolean) => { await b?.ack(id, v); await refresh(); setMsg(v ? '알림 준비 끝' : '시스템 설정 › 알림에서 Folder Bot 을 허용으로 바꿔 주세요') }
  const test = async () => { const r = await b?.test(); setTested(true); setMsg(r?.ok ? '방금 알림을 보냈어요 — 오른쪽 위에 보였나요?' : '이 시스템에서는 알림을 보낼 수 없어요') }
  return <div className="pair perm-gate"><div className="box" style={{ width: 'min(640px,100%)', alignItems: 'stretch', textAlign: 'left' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><FolderBot color="#e08850" size={32} mood="wait" /><b style={{ fontSize: 18, color: 'var(--w)' }}>Folder Bot 이 일하려면 권한이 필요해요</b></div>
    <div style={{ color: 'var(--t2)' }}>지금 한 번에 켜 두면 쓰는 중에 다시 묻지 않습니다. macOS 가 앱마다 따로 묻는 것이라 Folder Bot 이 대신 켤 수는 없어요 — 설정 창을 열어 드릴게요.</div>
    <div className="perm-rows">
      {items.map((p) => { const m = META[p.id]; const done = p.status === 'granted'; return <div key={p.id} className={`perm-row ${p.status}`}>
        <div className="ph"><Icon n={m.icon} size={14} color={done ? 'var(--done)' : 'var(--t2)'} /><b>{m.title}</b><span className="tag">{p.required ? '필수' : '권장'}</span><span className={`badge ${p.status}`}>{done ? '✓ 허용됨' : p.status === 'missing' ? '꺼짐' : '확인 필요'}</span></div>
        {!done ? <>
          <p className="why">{m.why}</p>
          <ol className="how">{m.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
          {p.id === 'local-open' ? <LocalOpenPicker root={useStore().s.root} onDone={() => void refresh()} /> : <div className="acts">
            {p.probeable ? <>
              <button className="btn" onClick={() => void openPane(p.id)}>시스템 설정 열기 ↗</button>
              <button className="btn" onClick={() => void refresh()}>다시 확인</button>
              {p.status === 'missing' ? <button className="btn" onClick={() => b?.relaunch()} title="macOS 는 이미 뜬 앱에 새 권한을 적용하지 않아요">켰는데도 꺼짐 — 다시 시작</button> : null}
            </> : <>
              <button className="btn" onClick={() => void test()}>테스트 알림 보내기</button>
              {tested || p.status === 'missing' ? <><button className="btn on" onClick={() => void ack(p.id, true)}>보였어요</button><button className="btn" onClick={() => void ack(p.id, false)}>안 보여요</button></> : null}
              <button className="btn" onClick={() => void openPane(p.id)}>시스템 설정 열기 ↗</button>
            </>}
          </div>}
        </> : null}
      </div> })}
    </div>
    <AgentConn />
    {msg ? <div className="hint">{msg}</div> : null}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <span style={{ color: 'var(--t3)', fontSize: 12.5 }}>{ok ? '권한이 모두 확인됐어요' : '필수 권한을 켜면 계속할 수 있어요'}</span><span style={{ flex: 1 }} />
      {!anyRequired && !ok ? <button className="btn" onClick={onDone}>나중에</button> : null}
      <button className="btn on" disabled={!ok} onClick={onDone}>계속</button>
    </div>
  </div></div>
}

/**
 * 에이전트 연결 — 🔴 **권한과 같은 화면에서 끝낸다** (2026-09-13 Dave: *«첫 설정화면 … 설정할때
 * claude, codex 연결도 되게 해주고»*).
 *
 * 파일·알림 권한을 다 켜도 **에이전트가 안 붙어 있으면 앱은 아무것도 못 한다** — 그런데 종전에는
 * 그 사실을 처음 화면에서 말해 주지 않았고, 사람은 첫 메시지를 보내고 나서야 알았다.
 *
 * ⛔ **여기서 막지는 않는다.** 로그인은 터미널에서 하는 일이라 우리가 대신 해 줄 수 없고,
 *    못 한 채로 들어가도 앱은 뜬다(대기열에 두었다가 복구되면 이어서 한다). 막으면 갇힌다.
 * ⚠ [다시 연결] 은 설정의 그것과 **같은 길**이다 — 일꾼만 내리고 대화는 남긴다.
 */
function AgentConn() {
  const { s, refresh } = useStore()
  const [list, setList] = useState<{ id: ProviderId; version?: string }[] | null>(null)
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  useEffect(() => { void api<{ id: ProviderId; version?: string }[]>('/agents').then(setList).catch(() => setList([])) }, [])
  const cx = s.defaults.codex?.auth
  const claudeOn = s.auth.verdict === 'loggedin' || (s.auth.verdict === 'unreadable' && s.auth.mode === 'token')
  const has = (id: string) => (list ?? []).some((p) => p.id === id)
  const act = async (agent?: 'claude' | 'codex') => {
    setBusy(true)
    try { await api('/auth/reconnect', { body: { agent } }); await refresh(); setMsg('다시 확인했어요') }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  /** 🔴 안내문이 아니라 단추다 — 누르면 호스트 맥에 터미널이 열린다(설정의 그것과 같은 길) */
  const login = async (agent: 'claude' | 'codex') => {
    setBusy(true)
    try { await api('/auth/login-terminal', { body: { agent } }); setMsg(agent === 'codex' ? '터미널을 열었어요 — codex login 을 마치고 [연결 확인]' : '터미널을 열었어요 — claude 가 뜨면 /login 을 치고 [연결 확인]') }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  if (!list) return null
  return <div className="perm-rows">
    <div className={`perm-row ${claudeOn ? 'granted' : 'missing'}`}>
      <div className="ph"><Mark id="claude" size={14} /><b>Claude Code</b><span className="tag">필요</span><span className={`badge ${claudeOn ? 'granted' : 'missing'}`}>{!has('claude') ? '안 깔림' : claudeOn ? '✓ 연결됨' : '로그인 필요'}</span></div>
      {!claudeOn ? <>
        <p className="why">{!has('claude')
          ? 'Claude Code 가 안 깔려 있어요. 터미널에서 설치한 뒤 [다시 확인] 을 누르세요.'
          : '아래 [터미널에서 로그인] 을 누르면 이 맥에 터미널이 열려요. claude 가 뜨면 /login 을 치고 브라우저에서 마치세요 — 로그인으로 붙으면 이 맥에 설치된 MCP 커넥터와 스킬, 그리고 claude.ai 계정에 연결해 둔 커넥터를 그대로 씁니다.'}</p>
        <ol className="how">{(!has('claude')
          ? ['터미널에서 Claude Code 를 설치하세요', '설치 뒤 [연결 확인]']
          : ['터미널에서 claude 를 치고 /login', '브라우저에서 로그인을 마치세요', '이 창으로 돌아와 [연결 확인]']).map((h, i) => <li key={i}>{h}</li>)}</ol>
        <div className="acts">{has('claude') && s.device.main ? <button className="btn on" disabled={busy} onClick={() => void login('claude')}>터미널에서 로그인</button> : null}<button className="btn" disabled={busy} onClick={() => void act('claude')}>연결 확인</button></div>
      </> : null}
    </div>
    <div className={`perm-row ${cx?.ok ? 'granted' : 'unknown'}`}>
      <div className="ph"><Mark id="codex" size={14} /><b>Codex</b><span className="tag">선택</span><span className={`badge ${cx?.ok ? 'granted' : ''}`}>{!has('codex') ? '안 깔림' : cx?.ok ? (cx.how === 'key' ? '✓ API 키' : '✓ 연결됨') : '로그인 필요'}</span></div>
      {has('codex') && !cx?.ok ? <>
        <p className="why">Codex 는 없어도 됩니다 — 있으면 세션마다 Claude 와 골라 쓸 수 있어요.</p>
        <ol className="how">{['터미널에서 codex login', '또는 설정 › 에이전트에 OpenAI API 키를 넣으세요', '이 창으로 돌아와 [연결 확인]'].map((h, i) => <li key={i}>{h}</li>)}</ol>
        <div className="acts">{s.device.main ? <button className="btn on" disabled={busy} onClick={() => void login('codex')}>터미널에서 로그인</button> : null}<button className="btn" disabled={busy} onClick={() => void act('codex')}>연결 확인</button></div>
      </> : null}
    </div>
    {msg ? <div className="hint">{msg}</div> : null}
  </div>
}
