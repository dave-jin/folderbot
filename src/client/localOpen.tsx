import { useEffect, useState } from 'react'
import { api } from './api'
import { fmtTime } from './store'
import { freshness, type HostStat, type LocalStat } from '../core/localOpen'
import type { Bot } from '../core/types'

/**
 * 원격에서 파일 열기 (E · 2026-09-19 Dave 1안 확정) — «Finder 에서 보기 · 열기» 가 **지금 앉아 있는 기기에서** 된다.
 *
 * 한 함수 `openOnThisDevice(bot, rel, mode)` 로 통일한다 — 트리의 «Finder 에서 보기», 문서의 «열기», (자리만) «끌어다 첨부».
 *  - 메인(호스트 맥)이면 종전대로 호스트가 연다(설정 없음).
 *  - 원격 Electron 이면 기기 설정(openMode)대로: ① 'sync' = 이 기기의 동기화 볼트에서 **신선도 확인 뒤** 연다,
 *    ② 'download' = 호스트에서 받아 캐시(Dropbox 밖)에 두고 연다. 아직 안 정했으면 ② 로 가고 한 줄 안내.
 *  - 브리지가 없으면(브라우저 탭) 내려받기로 끝내고, 폰은 «이 기기에서는 열 수 없어요».
 * 🔴 신선도는 mtime 이 아니라 **크기 + 앞 64KB 해시**(동기화가 mtime 을 바꾼다). 다르면 기본은 [기다렸다 열기] —
 *    폴더 감시로 도착하면 자동으로 연다. iCloud «클라우드에만» 은 자리표시자를 보고 내려받은 뒤 연다.
 */
export interface LocalCand { path: string; real: string; files: number; shell: boolean }
export interface LocalSettings { openMode: '' | 'sync' | 'download'; vaultLocal: string }
/** 셸이 돌려주는 복사 결과 — `why` 는 사람에게 그대로 보여 준다(«복사했어요» 가 거짓이면 안 된다) */
export interface CopyResult { ok: boolean; why?: string; formats?: string[] }
/** 옛 셸(boolean)과 새 셸(CopyResult) 을 한 모양으로 */
export function copyResult(r: CopyResult | boolean | undefined): CopyResult { return typeof r === 'boolean' ? { ok: r } : r ?? { ok: false, why: '셸이 답을 안 줬어요' } }
export interface LocalBridge {
  settings: () => Promise<LocalSettings>; set: (p: Partial<LocalSettings>) => Promise<LocalSettings>; detect: (hostRoot: string) => Promise<LocalCand[]>
  stat: (p: string) => Promise<LocalStat & { mtime?: number }>; open: (p: string) => Promise<string>; reveal: (p: string) => Promise<string>
  wait: (p: string, want: HostStat, ms: number) => Promise<boolean>; download: (url: string, hostName: string, rel: string) => Promise<string>; icloud: (p: string) => Promise<boolean>; pick: () => Promise<string>
  // M · 복사 · 진행 있는 받기 · 캐시 (옛 셸에는 없다 — 전부 선택)
  /** 🔴 복사 결과는 **되읽어 확인한** 값이다 — 옛 셸은 `boolean` 을 주므로 둘 다 받는다 (2026-09-21) */
  copyImage?: (a: { url?: string; path?: string }) => Promise<CopyResult | boolean>
  copyFiles?: (paths: string[]) => Promise<CopyResult | boolean>
  /** 복사 진단 — 한 파일로 두 길을 밟아 보고 결과를 글로 (설정 › 기기) */
  copyDiag?: (p: string) => Promise<string>
  fetch?: (id: string, url: string, hostName: string, rel: string) => Promise<string>
  cancel?: (id: string) => Promise<boolean>
  cachePath?: (hostName: string, rel: string) => Promise<string>
  cacheInfo?: () => Promise<{ files: number; bytes: number; limit: number }>
  cacheClear?: () => Promise<{ files: number; bytes: number; limit: number }>
  onProgress?: (cb: (p: { id: string; done: number; total: number }) => void) => () => void
}
export const localBridge = (): LocalBridge | undefined => (window as unknown as { folderbotDesktop?: { local?: LocalBridge } }).folderbotDesktop?.local

export type OpenMode = 'open' | 'reveal'
export interface OpenCtx { main: boolean; hostName: string; phone: boolean; say: (m: string) => void }

/** 봇 기준 rel → 볼트 기준 상대 경로 (`../` 를 접는다) */
export function vaultRelOf(botRel: string, rel: string): string {
  const out: string[] = []
  for (const p of `${botRel}/${rel}`.split('/')) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p) }
  return out.join('/')
}
const rawUrl = (bot: Bot, rel: string) => `${location.origin}/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}`
let hinted = false

export async function openOnThisDevice(bot: Bot, rel: string, mode: OpenMode, ctx: OpenCtx): Promise<void> {
  if (ctx.main) {
    try { await api(`/bots/${bot.id}/${mode}`, { body: { rel } }); ctx.say(mode === 'open' ? '기본 앱으로 열었어요' : 'Finder 에서 보여 드렸어요') } catch (e) { ctx.say((e as Error).message) }
    return
  }
  const b = localBridge()
  if (!b) {
    if (ctx.phone) { ctx.say('이 기기에서는 열 수 없어요 — 맥에서 열거나 «이 기기로 내려받기» 를 쓰세요'); return }
    window.open(`${rawUrl(bot, rel)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`, '_blank', 'noopener'); ctx.say('이 브라우저에서는 내려받기로 열어요'); return
  }
  const st = await b.settings()
  const vrel = vaultRelOf(bot.rel, rel)
  const doOpen = async (p: string) => { const err = mode === 'open' ? await b.open(p) : await b.reveal(p); if (err) ctx.say(err) }
  const viaDownload = async (why?: string) => {
    try {
      const p = await b.download(rawUrl(bot, rel), ctx.hostName, vrel)
      await doOpen(p); ctx.say(`${why ? why + ' — ' : ''}호스트에서 받은 사본을 열었어요 (고쳐도 되돌아가지 않아요)`)
    } catch (e) { ctx.say((e as Error).message) }
  }
  if (st.openMode !== 'sync' || !st.vaultLocal) {
    if (!st.openMode && !hinted) { hinted = true; ctx.say('설정 › 기기 에서 동기화 볼트를 지정하면 이 기기의 파일을 바로 열어요') }
    await viaDownload(); return
  }
  const local = `${st.vaultLocal.replace(/\/+$/, '')}/${vrel}`
  let host: HostStat & { mtime: number }
  try { host = await api(`/bots/${bot.id}/stat?rel=${encodeURIComponent(rel)}`) } catch (e) { ctx.say((e as Error).message); return }
  const mine = await b.stat(local)
  const f = freshness(host, mine)
  if (f === 'same') { await doOpen(local); return }
  if (f === 'placeholder') {
    ctx.say('iCloud 에서 내려받는 중…'); await b.icloud(local)
    if (await b.wait(local, host, 60_000)) { await doOpen(local); return }
    await viaDownload('iCloud 에서 못 받았어요'); return
  }
  if (f === 'missing') { await viaDownload('이 기기의 볼트에 아직 없어요'); return }
  const choice = await askLocalOpen({ name: rel.split('/').pop() ?? rel, hostAt: host.mtime, localAt: mine.mtime ?? 0 })
  if (choice === 'wait') {
    ctx.say('동기화를 기다리는 중… 도착하면 바로 열어요')
    if (await b.wait(local, host, 60_000)) { await doOpen(local); return }
    await viaDownload('60초 안에 안 왔어요'); return
  }
  if (choice === 'force') { await doOpen(local); return }
  if (choice === 'download') { await viaDownload(); return }
}

/** «다르다» 시트 — 기본은 [기다렸다 열기] */
interface Ask { name: string; hostAt: number; localAt: number }
type Choice = 'wait' | 'force' | 'download' | null
let askSet: ((a: Ask | null) => void) | null = null
let askResolve: ((c: Choice) => void) | null = null
export function askLocalOpen(a: Ask): Promise<Choice> {
  return new Promise((res) => { askResolve?.(null); askResolve = res; if (askSet) askSet(a); else { askResolve = null; res('wait') } })
}
export function LocalOpenHost() {
  const [a, setA] = useState<Ask | null>(null)
  useEffect(() => { askSet = setA; return () => { askSet = null } }, [])
  if (!a) return null
  const done = (c: Choice) => { setA(null); const r = askResolve; askResolve = null; r?.(c) }
  return <>
    <div className="backdrop" onClick={() => done(null)} />
    <div className="modal conf lopen" style={{ width: 'min(520px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>동기화 중 — {a.name}</b></div></div>
      <div className="modal-b" style={{ padding: '2px 22px 6px' }}><p className="cbody">호스트 {fmtTime(a.hostAt)} · 내 기기 {a.localAt ? fmtTime(a.localAt) : '없음'}. 이 기기의 사본이 호스트와 달라요. 도착하면 자동으로 열어 드릴까요?</p></div>
      <div className="modal-f"><button className="btn" onClick={() => done('download')}>호스트에서 받기</button><button className="btn" onClick={() => done('force')}>그래도 열기</button><span className="sp" /><button className="btn" onClick={() => done(null)}>취소</button><button className="btn on" autoFocus onClick={() => done('wait')}>기다렸다 열기</button></div>
    </div>
  </>
}

/** 이 기기 설정 훅 — 설정 화면·문서 탭 배지가 쓴다. 브리지가 없으면 null */
export function useLocalSettings(): [LocalSettings | null, (p: Partial<LocalSettings>) => Promise<void>] {
  const [st, setSt] = useState<LocalSettings | null>(null)
  useEffect(() => { const b = localBridge(); if (!b) return; void b.settings().then(setSt).catch(() => {}) ; const f = () => void b.settings().then(setSt).catch(() => {}); window.addEventListener('fb:localcfg', f); return () => window.removeEventListener('fb:localcfg', f) }, [])
  const set = async (p: Partial<LocalSettings>) => { const b = localBridge(); if (!b) return; setSt(await b.set(p)); window.dispatchEvent(new Event('fb:localcfg')) }
  return [st, set]
}

/** 온보딩 한 단계 · 설정 한 줄 — 동기화 볼트 자동 탐색 + 고르기 */
export function LocalOpenPicker({ root, compact, onDone }: { root: string; compact?: boolean; onDone?: () => void }) {
  const [st, set] = useLocalSettings()
  const [cands, setCands] = useState<LocalCand[] | null>(null); const [busy, setBusy] = useState(false)
  const detect = async () => { const b = localBridge(); if (!b) return; setBusy(true); try { setCands(await b.detect(root)) } finally { setBusy(false) } }
  useEffect(() => { void detect() }, [root])
  const choose = async (p: string) => { await set({ openMode: 'sync', vaultLocal: p }); onDone?.() }
  const pick = async () => { const b = localBridge(); const p = await b?.pick(); if (p) await choose(p) }
  return <div className="lpick">
    {cands === null ? <div className="hint">{busy ? '이 기기에서 같은 볼트를 찾는 중…' : ''}</div> : cands.length ? <>
      <div className="hint">이 기기에서 같은 볼트를 찾았어요 — 정본으로 보이는 폴더가 맨 위예요. 하나를 고르세요.</div>
      {cands.map((c, i) => <button key={c.path} className={`cand ${i === 0 && !c.shell ? 'best' : ''} ${c.shell ? 'shell' : ''} ${st?.vaultLocal === c.path ? 'on' : ''}`} onClick={() => void choose(c.path)} title={c.real}>
        <span className="p mono">{c.path}</span><span className="n">{c.shell ? '파일이 거의 없어요 — 껍데기 폴더일 수 있어요' : `파일 ${c.files >= 2000 ? '2000+' : c.files}개`}</span>
      </button>)}
    </> : <div className="hint">이 기기에서 같은 볼트를 못 찾았어요. 동기화 폴더가 없으면 호스트에서 받아서 열어요.</div>}
    <div className="acts">
      <button className="btn" onClick={() => void pick()}>폴더 고르기…</button>
      <button className="btn" onClick={() => void detect()}>다시 찾기</button>
      <button className={`btn ${st?.openMode === 'download' || (!cands?.length && !st?.openMode) ? 'on' : ''}`} onClick={async () => { await set({ openMode: 'download' }); onDone?.() }}>{compact ? '호스트에서 받기' : '호스트에서 받아서 열기 (동기화 폴더 없음)'}</button>
    </div>
  </div>
}
