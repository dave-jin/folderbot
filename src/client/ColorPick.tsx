import { useEffect, useState } from 'react'
import type { Bot } from '../core/types'
import { ORCH_COLOR, PALETTE } from '../core/botColor'
import { api } from './api'
import { FolderBot } from './FolderBot'

/**
 * 🔴 **CN · 폴더봇 색 바꾸기** (2026-10-16 Dave 승인 · 기획안 §8 · 목업 `03_디자인/2026-10-16_폰-오케스트레이터-색-목업`).
 * 폰 행 쓸기 › 메뉴 · 데스크톱 레일 우클릭 · 패널 «이 봇» 세 곳이 이 시트 하나를 연다(`pickColor`).
 * 고르는 순간 호스트가 그 폴더 `.bot.yml` 에 적고(`/bots/:id/color`) 봇 목록 프레임이 돌아와 레일·목록·알림 얼굴이 함께 바뀐다.
 * ⛔ 주황은 판에 넣지 않는다 — 오케스트레이터 전용이다. 잠긴 칸으로만 보여 «왜 없지» 를 먼저 답한다.
 */
let opener: ((b: Bot) => void) | null = null
export function pickColor(b: Bot): void { opener?.(b) }

export function ColorHost({ say }: { say: (m: string) => void }) {
  const [b, setB] = useState<Bot | null>(null)
  const [busy, setBusy] = useState('')
  useEffect(() => { opener = (x) => setB(x); return () => { opener = null } }, [])
  useEffect(() => { if (!b) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setB(null) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [b])
  if (!b) return null
  const cur = (busy || b.color).toLowerCase()
  const choose = async (hex: string) => {
    if (hex === b.color.toLowerCase()) { setB(null); return }
    setBusy(hex)
    try { await api(`/bots/${b.id}/color`, { body: { color: hex } }); say(`${b.displayName || b.name} 색을 바꿨어요`); setB(null) } catch (e) { say((e as Error).message) } finally { setBusy('') }
  }
  return <>
    <div className="backdrop" onClick={() => setB(null)} />
    <div className="tsheet colsheet" role="dialog" aria-label="색 바꾸기">
      <div className="grip" />
      <div className="cprev"><FolderBot color={cur} size={40} mono /><span><b>{b.displayName || b.name}</b><small>색 바꾸기 — 이 폴더의 .bot.yml 에 저장돼요</small></span></div>
      <div className="cgrid">{PALETTE.map((p) => <button key={p.hex} className={`csw ${cur === p.hex ? 'on' : ''}`} style={{ background: p.hex }} title={p.name} aria-label={p.name} aria-pressed={cur === p.hex} disabled={!!busy} onClick={() => void choose(p.hex)} />)}</div>
      <div className="clock"><span className="csw" style={{ background: ORCH_COLOR }} aria-hidden="true" />주황은 오케스트레이터 전용이라 고를 수 없어요</div>
    </div>
  </>
}
