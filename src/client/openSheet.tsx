import { useEffect, useState } from 'react'
import type { Bot } from '../core/types'
import { dropboxWebUrl, isExternalLink, safariUrl } from '../core/openLink'
import { token } from './api'
import { copyText } from './clip'
import { copyFiles } from './fileCopy'
import { Icon } from './FolderBot'

/**
 * 폰 «바깥으로 열기» 시트 (OL · 2026-11-04 Dave — 카드 답: Safari 에서 열기 · 다른 앱으로(공유) · 링크 복사 · 이 기기로 내려받기).
 *
 * 🔴 **홈 화면 웹 앱에서는 링크를 바로 열지 않는다.** `_blank` 가 iOS 앱 안 브라우저로 가고, 그 안의 «Safari 로» 단추가
 *    안 먹는다는 보고가 있었다(Dave 캡처 · theminda.com). 그래서 누르면 이 시트가 뜨고, 맨 위가 «Safari 에서 열기» 다.
 * ⚠ Safari 로 넘기는 길은 `x-safari-https://` 하나뿐이고 iOS 판마다 결과가 엇갈린다(`core/openLink` 머리말) — 그래서
 *    «링크 복사» 를 늘 함께 둔다. 안 넘어가면 복사해서 Safari 주소창에 붙이면 된다.
 * ⛔ **토큰이 든 호스트 주소는 Safari·클립보드로 내보내지 않는다** — 파일의 «Safari 에서 열기»·«링크 복사» 는 Dropbox 웹 주소를 쓴다.
 *    Dropbox 밖 파일이면 «경로 복사» 로 바뀌고 Safari 줄은 이유와 함께 흐려진다.
 * 브라우저 탭·맥 앱은 종전대로 — 이 시트는 standalone(홈 화면 웹 앱)에서만 링크를 가로챈다.
 */
export type OpenTarget = { kind: 'url'; url: string } | { kind: 'file'; bot: Bot; rel: string }
let setT: ((t: OpenTarget | null) => void) | null = null
let sayRef: (m: string) => void = () => {}

export function openSheet(t: OpenTarget): void { if (setT) setT(t); else if (t.kind === 'url') window.open(t.url, '_blank', 'noopener') }

/** 홈 화면 웹 앱(standalone)인가 — iOS 는 `navigator.standalone`, 나머지는 display-mode */
export function isStandalone(): boolean {
  try { return (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches } catch { return false }
}

/** 바깥 주소 열기 — 홈 화면 웹 앱이면 시트, 아니면 새 창(맥 앱은 셸이 기본 브라우저로 넘긴다) */
export function openExternal(url: string): void { if (isStandalone()) openSheet({ kind: 'url', url }); else window.open(url, '_blank', 'noopener,noreferrer') }

/** 문서 전체의 바깥 링크 누르기를 가로챈다(standalone 에서만). 끄는 함수를 돌려준다 */
export function installLinkSheet(): () => void {
  const h = (e: MouseEvent) => {
    if (!isStandalone() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || a.hasAttribute('download') || a.dataset.nosheet !== undefined) return
    if (!isExternalLink(a.href, location.origin)) return
    e.preventDefault(); e.stopPropagation()
    openSheet({ kind: 'url', url: a.href })
  }
  document.addEventListener('click', h, true)
  return () => document.removeEventListener('click', h, true)
}

const rawUrl = (bot: Bot, rel: string) => `${location.origin}/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(token())}`
const toSafari = (url: string) => { const s = safariUrl(url); if (s) location.href = s }

interface Row { icon: string; label: string; sub?: string; off?: boolean; run?: () => void | Promise<void> }

function rowsOf(t: OpenTarget, say: (m: string) => void): { title: string; sub: string; rows: Row[] } {
  if (t.kind === 'url') {
    let host = t.url; try { host = new URL(t.url).host } catch { /* */ }
    return {
      title: host, sub: t.url,
      rows: [
        { icon: 'open', label: 'Safari 에서 열기', sub: '안 넘어가면 «링크 복사» 뒤 Safari 주소창에', run: () => { toSafari(t.url); say('Safari 로 넘겼어요 — 안 열리면 «링크 복사» 를 쓰세요') } },
        { icon: 'doc', label: '앱 안에서 보기', run: () => { window.open(t.url, '_blank', 'noopener') } },
        { icon: 'up', label: '다른 앱으로', sub: '공유 시트 — 카톡·메모·메일 …', off: typeof navigator.share !== 'function', run: async () => { try { await navigator.share({ url: t.url }) } catch (e) { if ((e as Error).name !== 'AbortError') say(`공유 실패 — ${(e as Error).message}`) } } },
        { icon: 'copy', label: '링크 복사', run: async () => { say((await copyText(t.url)) ? '링크를 복사했어요' : '복사를 못 했어요') } },
      ],
    }
  }
  const name = t.rel.split('/').pop() ?? t.rel
  const dbx = dropboxWebUrl(`${t.bot.abs}/${t.rel}`)
  return {
    title: name, sub: t.rel,
    rows: [
      { icon: 'up', label: '다른 앱으로', sub: '공유 시트 — 파일 앱에 저장·카톡·메일 …', run: () => copyFiles(t.bot, [t.rel], { main: false, hostName: '', phone: true, say }) },
      { icon: 'doc', label: '이 기기로 내려받기', run: () => { const a = document.createElement('a'); a.href = rawUrl(t.bot, t.rel); a.download = name; a.dataset.nosheet = ''; document.body.appendChild(a); a.click(); a.remove() } },
      dbx
        ? { icon: 'copy', label: '링크 복사', sub: 'Dropbox 웹 주소', run: async () => { say((await copyText(dbx)) ? 'Dropbox 링크를 복사했어요' : '복사를 못 했어요') } }
        : { icon: 'copy', label: '경로 복사', sub: 'Dropbox 밖 파일 — 링크 대신 경로', run: async () => { say((await copyText(`${t.bot.abs}/${t.rel}`)) ? '경로를 복사했어요' : '복사를 못 했어요') } },
      dbx
        ? { icon: 'open', label: 'Safari 에서 열기', sub: 'Dropbox 웹으로 — 로그인 필요', run: () => { toSafari(dbx); say('Safari 로 넘겼어요 — 안 열리면 «링크 복사» 를 쓰세요') } }
        : { icon: 'open', label: 'Safari 에서 열기', sub: 'Dropbox 밖 파일이라 보낼 주소가 없어요', off: true },
    ],
  }
}

export function OpenSheetHost({ say }: { say: (m: string) => void }) {
  const [t, setTarget] = useState<OpenTarget | null>(null)
  useEffect(() => { setT = setTarget; return () => { setT = null } }, [])
  sayRef = say
  useEffect(() => installLinkSheet(), [])
  if (!t) return null
  const { title, sub, rows } = rowsOf(t, (m) => sayRef(m))
  const close = () => setTarget(null)
  return <>
    <div className="backdrop" onClick={close} />
    <div className="opensheet" role="dialog" aria-label="바깥으로 열기">
      <div className="osh"><b>{title}</b><span>{sub}</span></div>
      {rows.map((r) => <button key={r.label} className="osr" disabled={r.off} onClick={() => { close(); void r.run?.() }}>
        <Icon n={r.icon as never} size={16} /><span className="osl"><b>{r.label}</b>{r.sub ? <small>{r.sub}</small> : null}</span>
      </button>)}
      <button className="osr osx" onClick={close}><span className="osl"><b>닫기</b></span></button>
    </div>
  </>
}
