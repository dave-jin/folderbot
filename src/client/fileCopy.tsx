import { useEffect, useState } from 'react'
import type { Bot } from '../core/types'
import { api, token } from './api'
import { insecureWhy } from './clip'
import { askConfirm } from './Sheets'
import { copyResult, localBridge, vaultRelOf } from './localOpen'
import { eta, fmtBytes } from '../core/cache'
import { Icon } from './FolderBot'

/**
 * 파일·폴더를 «붙여넣을 수 있게» 복사 (M-3 · 2026-09-19). 붙는 곳은 Finder(⌘V 로 사본)·카톡 입력창(첨부).
 *
 * 🔴 **길은 기기가 정한다** — 호스트 맥 앱: 그 경로 그대로 파일 클립보드 · 원격 맥 앱: 캐시에 받은 사본의 경로(M-4 진행 표시 · 취소 · 같으면 즉시)
 *    · 폰: Web Share(파일 · 폴더는 호스트 zip) · 브라우저 탭: 내려받기. «경로 복사» 는 따로 있다(글자만 필요할 때).
 * ⚠ 폴더는 파일 50개·200MB 를 넘으면 먼저 묻는다 — 몇 분 걸릴 일을 조용히 시작하지 않는다.
 */
interface Manifest { dir: boolean; name: string; files: { rel: string; size: number; mtime: number; head: string }[]; total: number; truncated: boolean }
export interface CopyProgress { id: string; label: string; done: number; total: number; started: number; rate: number; cancel: () => void; files: number; at: number }
const listeners = new Set<(p: CopyProgress | null) => void>()
let current: CopyProgress | null = null
function emit(p: CopyProgress | null): void { current = p; for (const f of listeners) f(p) }
export function useCopyProgress(): CopyProgress | null { const [p, setP] = useState<CopyProgress | null>(current); useEffect(() => { listeners.add(setP); return () => { listeners.delete(setP) } }, []); return p }

const rawUrl = (bot: Bot, rel: string) => `/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(token())}`
const zipUrl = (bot: Bot, rel: string) => `/api/bots/${bot.id}/zip?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(token())}`
const joinRel = (a: string, b: string) => (b ? (a ? `${a}/${b}` : b) : a)

export async function copyFiles(bot: Bot, rels: string[], ctx: { main: boolean; hostName: string; phone: boolean; say: (m: string) => void }): Promise<void> {
  const b = localBridge()
  // ① 호스트 맥 앱 — 경로 그대로
  // ⚠ 결과는 셸이 **되읽어 확인한** 값이다 — 못 했으면 이유를 그대로 보여 준다(«복사했어요» 가 거짓이면 다음 보고가 «그냥 안 돼» 가 된다)
  if (ctx.main && b?.copyFiles) { const r = copyResult(await b.copyFiles(rels.map((c) => `${bot.abs}/${c}`)).catch((e: Error) => ({ ok: false, why: `맥 앱 오류 — ${e.message}` }))); ctx.say(r.ok ? `${rels.length > 1 ? rels.length + '개를 ' : ''}복사했어요 — Finder·카톡에 ⌘V` : r.why ?? '복사하지 못했어요'); return }
  // ② 원격 맥 앱 — 캐시에 받아서 그 경로를
  if (b?.copyFiles && b.fetch && b.cachePath && b.stat) {
    const mans = await Promise.all(rels.map(async (r) => ({ rel: r, m: await api<Manifest>(`/bots/${bot.id}/manifest?rel=${encodeURIComponent(r)}`) })))
    const files = mans.flatMap(({ rel, m }) => m.files.map((f) => ({ rel: joinRel(rel, f.rel), size: f.size, head: f.head })))
    const total = files.reduce((a, f) => a + f.size, 0)
    if (mans.some(({ m }) => m.truncated)) { ctx.say('파일이 5000개를 넘어요 — 폴더째 복사 대신 «공유…»(zip) 를 쓰세요'); return }
    if (files.length > 50 || total > 200 * 1024 * 1024) { if (!(await askConfirm({ title: `파일 ${files.length}개 · ${fmtBytes(total)} 를 받을까요?`, body: '호스트에서 이 기기의 캐시로 받은 뒤 복사해요. 시간이 걸릴 수 있어요.', ok: '받기' }))) return }
    const id = `c${Date.now().toString(36)}`; let cancelled = false; const started = Date.now()
    const prog: CopyProgress = { id, label: rels.length === 1 ? rels[0].split('/').pop() ?? rels[0] : `${rels.length}개`, done: 0, total, started, rate: 0, files: files.length, at: started, cancel: () => { cancelled = true; void b.cancel?.(id) } }
    emit(prog)
    const off = b.onProgress?.((p) => { if (p.id !== id) return; const now = Date.now(); const done = base + p.done; const rate = (done - prog.done) / Math.max(1, now - prog.at) * 1000; emit({ ...prog, done, rate: prog.rate ? prog.rate * 0.7 + rate * 0.3 : rate, at: now }); prog.done = done; prog.at = now })
    let base = 0; const out: string[] = []; let hits = 0
    try {
      for (const f of files) {
        if (cancelled) break
        const vrel = vaultRelOf(bot.rel, f.rel); const dest = await b.cachePath(ctx.hostName, vrel)
        const st = await b.stat(dest)
        if (st.exists && st.size === f.size && st.head === f.head) { hits++; base += f.size; prog.done = base; emit({ ...prog, done: base }); out.push(dest); continue }   // 같은 사본이 있으면 즉시
        try { out.push(await b.fetch(id, location.origin + rawUrl(bot, f.rel), ctx.hostName, vrel)) } catch (e) { if (cancelled) break; throw e }
        base += f.size
      }
    } catch (e) { off?.(); emit(null); ctx.say(`받기 실패 — ${(e as Error).message}`); return }
    off?.(); emit(null)
    if (cancelled) { ctx.say('취소했어요 — 받던 파일은 지웠어요'); return }
    // 폴더는 폴더째 — 캐시 안의 그 폴더 경로를 넣는다(안의 파일은 방금 다 받았다)
    const paths = await Promise.all(rels.map(async (r, i) => (mans[i].m.dir ? b.cachePath!(ctx.hostName, vaultRelOf(bot.rel, r)) : out.find((p) => p.endsWith(r.split('/').pop() ?? r)) ?? out[0])))
    const r = copyResult(await b.copyFiles(paths.filter(Boolean)).catch((e: Error) => ({ ok: false, why: `맥 앱 오류 — ${e.message}` })))
    ctx.say(r.ok ? `복사했어요 — Finder·카톡에 ⌘V${hits === files.length ? ' (캐시)' : ''}` : r.why ?? '복사하지 못했어요')
    return
  }
  // ③ 폰 — 공유 시트 (폴더는 zip)
  if (ctx.phone && typeof navigator.share === 'function') {
    try {
      const fs: File[] = []
      for (const r of rels) {
        const m = await api<Manifest>(`/bots/${bot.id}/manifest?rel=${encodeURIComponent(r)}`)
        const res = await fetch(m.dir ? zipUrl(bot, r) : rawUrl(bot, r)); const blob = await res.blob()
        fs.push(new File([blob], m.dir ? `${m.name}.zip` : m.name, { type: blob.type || 'application/octet-stream' }))
      }
      if (navigator.canShare && !navigator.canShare({ files: fs })) { ctx.say('이 파일은 공유 시트가 못 받아요'); return }
      await navigator.share({ files: fs, title: fs.map((f) => f.name).join(', ') })
    } catch (e) { if ((e as Error).name !== 'AbortError') ctx.say(`공유 실패 — ${(e as Error).message}`) }
    return
  }
  // ④ 브라우저 탭 — 내려받기
  for (const r of rels) { const m = await api<Manifest>(`/bots/${bot.id}/manifest?rel=${encodeURIComponent(r)}`); const a = document.createElement('a'); a.href = m.dir ? zipUrl(bot, r) : rawUrl(bot, r); a.download = m.dir ? `${m.name}.zip` : m.name; document.body.appendChild(a); a.click(); a.remove() }
  // ⚠ 폰에서 공유 시트가 없는 진짜 이유는 «http 로 열어서» 인 때가 많다 — 그냥 «없어요» 로 끝내면 사람은 앱이 고장 난 줄 안다
  ctx.say(insecureWhy() ? `내려받았어요 — ${insecureWhy()}. 공유 시트를 쓰려면 https 주소로 열어 주세요` : '내려받아요 — 이 브라우저는 파일 클립보드가 없어요')
}

/** 진행 띠 (M-4) — 용량 · 속도 · 남은 시간 · [취소]. 화면 어디서나 하나 */
export function CopyProgressHost() {
  const p = useCopyProgress()
  if (!p) return null
  const left = eta(p.done, p.total, p.rate)
  return <div className="cprog" role="status">
    <Icon n="copy" size={13} />
    <div className="t"><b>{p.label}</b><span>{fmtBytes(p.done)} / {fmtBytes(p.total)}{p.files > 1 ? ` · ${p.files}개` : ''}</span></div>
    <div className="bar"><div className="fill" style={{ width: `${p.total ? Math.min(100, (p.done / p.total) * 100) : 0}%` }} /></div>
    <span className="sp">{p.rate > 0 ? `${fmtBytes(p.rate)}/s` : '—'}{left !== null ? ` · ${left}초 남음` : ''}</span>
    <button className="btn" onClick={p.cancel}>취소</button>
  </div>
}

/** 설정 › 기기 — 캐시 크기 · 상한 · 비우기 */
export function CacheRow() {
  const b = localBridge(); const [info, setInfo] = useState<{ files: number; bytes: number; limit: number } | null>(null)
  useEffect(() => { void b?.cacheInfo?.().then(setInfo).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!b?.cacheInfo) return null
  return <div className="crow"><span>{info ? `${fmtBytes(info.bytes)} · 파일 ${info.files}개 · 상한 ${fmtBytes(info.limit)}` : '…'}</span><button className="btn" onClick={() => void b.cacheClear?.().then(setInfo)}>비우기</button></div>
}
