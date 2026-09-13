/**
 * 메뉴바 패널 — 🔴 **맥 기본 메뉴가 아니라 우리가 그린 창이다** (2026-09-13 Dave:
 * *«상단의 메뉴이미지는 맥 기본 OS 메뉴바가 아니라 직접 렌더링된 두번째 이미지 모습이어야 해»*).
 *
 * 종전에는 `Menu.buildFromTemplate` 에 `▰▱` 글자 막대를 넣었다. 네이티브 메뉴는 HTML 을 못 그리니
 * 그게 최선이라고 적어 뒀는데, **틀린 전제였다** — 메뉴를 안 쓰고 테두리 없는 창을 띄우면 앱 안과
 * **똑같은 카드**(`UsageCard`)를 그대로 쓸 수 있다. 그래서 여기는 새로 그린 화면이 아니라
 * **앱의 그 컴포넌트를 그대로 부르는 얇은 껍데기**다 — 숫자·색·문구가 두 곳에서 갈릴 수 없다.
 *
 * ⛔ 여기에 사용량 계산을 다시 쓰지 마라. 호스트의 `/api/usage` 하나가 정본이다.
 * ⚠ 창 높이는 **내용이 정한다** — 그릴 때마다 `fbTray.size()` 로 알려 준다(항목 수가 모드마다 다르다).
 */
import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { UsageCard, useUsage } from './Usage'
import { Icon } from './FolderBot'
import { applyTheme } from './theme'
import { setToken, token } from './api'
import './styles.css'

type TrayState = {
  waiting: number; mood: string; mode: string; hostLabel: string; root: string
  pairing: { code: string; expiresAt: number } | null
  update: { current: string; downloading?: boolean; staged?: { ready?: boolean; version?: string; progress?: number } | null }
  loginItem: boolean
}
type Bridge = { on: (f: (s: TrayState) => void) => void; act: (id: string) => void; size: (h: number) => void }
const fbTray = (window as unknown as { fbTray?: Bridge }).fbTray

const MOOD: Record<string, string> = { idle: '한가함', work: '일하는 중', wait: '확인 대기', error: '문제 있어요' }

function Row({ id, label, hint, dim, on }: { id?: string; label: string; hint?: string; dim?: boolean; on?: boolean }) {
  if (!id) return <div className="tmi dim">{label}</div>
  return <button className={`tmi ${dim ? 'dim' : ''}`} onClick={() => fbTray?.act(id)}>
    <span className="l">{label}</span>{on ? <Icon n="check" size={12} /> : null}{hint ? <span className="k">{hint}</span> : null}
  </button>
}

function Panel() {
  const [st, setSt] = useState<TrayState | null>(null)
  const u = useUsage()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { fbTray?.on(setSt) }, [])
  useLayoutEffect(() => { const h = box.current?.offsetHeight; if (h) fbTray?.size(h) })
  const up = st?.update
  const host = st?.mode === 'host'
  return <div className="traypanel" ref={box}>
    <div className="th">{st?.waiting ? `확인 대기 ${st.waiting}` : MOOD[st?.mood ?? 'idle'] ?? '한가함'}</div>
    {u && u.tools.length ? <div className="tu"><UsageCard u={u} compact /></div> : null}
    <hr />
    <Row id="open" label="Folder Bot 열기" />
    <Row id="notify" label="알림 센터" />
    <hr />
    {host ? <>
      <Row label={`이 맥이 호스트 · ${st?.root ?? ''}`} />
      <Row id="pairing" label={st?.pairing && Date.now() < st.pairing.expiresAt ? `페어링 코드 ${st.pairing.code} (클릭해 복사)` : '페어링 코드 만들기'} />
      <Row id="pairing-new" label="새 페어링 코드" />
      <Row id="copy-addr" label="폰에서 열 주소 복사" />
      <Row id="change-root" label="루트 폴더 바꾸기…" />
    </> : <>
      <Row label={st?.hostLabel ? `호스트 · ${st.hostLabel}` : '호스트 없음'} />
      <Row id="change-host" label="호스트 바꾸기…" />
    </>}
    <hr />
    {up?.staged?.ready
      ? <Row id="update-apply" label={`v${up.staged.version} 업데이트 적용 (재시작)`} />
      : up?.downloading
        ? <Row label={`업데이트 받는 중 ${Math.round((up.staged?.progress ?? 0) * 100)}%`} />
        : <Row id="update-check" label={`업데이트 확인 (v${up?.current ?? ''})`} />}
    <Row id="login-toggle" label="로그인 시 자동 실행" on={!!st?.loginItem} />
    <hr />
    <Row id="quit" label="종료" hint="⌘Q" />
  </div>
}

// ⚠ 토큰은 **같은 오리진의 localStorage** 를 그대로 쓴다 — 본 창이 이미 넣어 뒀다.
//    (셸이 `#token=` 을 붙여 주는 길도 남긴다: 본 창보다 먼저 열릴 수 있다.)
{
  const h = new URLSearchParams(location.hash.slice(1)); const t = h.get('token')
  if (t && t !== token()) setToken(t)
}
applyTheme((localStorage.getItem('fb:theme') as 'auto' | 'light' | 'dark') || 'auto')
createRoot(document.getElementById('root')!).render(<StrictMode><Panel /></StrictMode>)
