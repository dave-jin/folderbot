import { useEffect, useState } from 'react'
import { api } from './api'
import { FolderBot, Icon } from './FolderBot'
import type { UsageReport } from '../core/usage'

/**
 * 사용량 카드 — **남은 양**으로 본다 (V23 승인분, 2026-09-13 Dave).
 * 막대는 차오르지 않고 **줄어들고**, 색은 초록→빨강으로 거꾸로 간다. 눈금은 «20% 남음» 자리.
 * ⛔ 뺄셈은 호스트가 한 번만 한다(`core/usage.ts`) — 화면은 받은 숫자를 그리기만 한다.
 * ⛔ 기록이 없는 도구는 **줄 자체를 안 그린다** (Dave: «Codex가 없으면 아예 안보여야 해»).
 */
export const TOOL_LABEL: Record<string, string> = { claude: 'Claude', codex: 'Codex' }
export const TOOL_TINT: Record<string, string> = { claude: '#e08850', codex: '#7aa2f7' }
export const moodLeft = (l: number): 'idle' | 'work' | 'wait' | 'error' => (l > 40 ? 'idle' : l > 20 ? 'work' : l > 0 ? 'wait' : 'error')
export const colorLeft = (l: number): string => (l > 40 ? 'var(--done)' : l > 20 ? 'var(--run)' : l > 0 ? 'var(--wait)' : 'var(--err)')
const headLeft = (l: number): string => (l > 40 ? '아직 넉넉해요' : l > 20 ? '절반 아래예요' : l > 0 ? '얼마 안 남았어요' : '다 썼어요')

const money = (n: number): string => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`
export const tokens = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
const clock = (ms: number): string => { const d = new Date(ms); const h = d.getHours(); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}` }
export function until(ms: number, now: number): string {
  const s = Math.max(0, Math.round((ms - now) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h}시간 ${m}분` : `${m}분`
}

/** 30초마다 다시 묻는다 — 훅이 쌓는 속도에 견주면 충분하다 */
export function useUsage(on = true): UsageReport & { hook?: boolean } | null {
  const [u, setU] = useState<(UsageReport & { hook?: boolean }) | null>(null)
  useEffect(() => {
    if (!on) return
    let dead = false
    const f = () => { void api<UsageReport & { hook?: boolean }>('/usage').then((r) => { if (!dead) setU(r) }).catch(() => {}) }
    f(); const id = window.setInterval(f, 30_000)
    return () => { dead = true; window.clearInterval(id) }
  }, [on])
  return u
}

function LeftBar({ left, color }: { left: number; color: string }) {
  return <div className="ubar"><div className="fill" style={{ width: `${Math.max(0, Math.min(100, left))}%`, background: color }} /><div className="tick" /></div>
}

export function UsageCard({ u, compact }: { u: UsageReport; compact?: boolean }) {
  const c = colorLeft(u.left)
  return <div className={`ucard ${compact ? 'sm' : ''}`}>
    <div className="uh">
      <FolderBot color={c} size={compact ? 36 : 44} mood={moodLeft(u.left)} mono />
      <div className="t">
        <div className="l1"><b style={{ color: c }}>{u.left}%</b><span>{headLeft(u.left)}</span></div>
        <div className="l2"><Icon n="clock" size={11} />{u.resetAt ? <><b>{until(u.resetAt, u.now)}</b> 뒤 채워져요 · {clock(u.resetAt)}</> : '아직 쓴 게 없어요'}</div>
      </div>
    </div>
    {u.tools.map((t) => <div className="urow" key={t.tool}>
      <div className="n"><span className="dot" style={{ background: TOOL_TINT[t.tool] }} /><b>{TOOL_LABEL[t.tool] ?? t.tool}</b>
        <span className="pc" style={{ color: colorLeft(t.left) }}>{t.left}%</span><span className="lb">남음</span></div>
      <LeftBar left={t.left} color={colorLeft(t.left)} />
      <div className="m"><b>{money(t.leftCost)}</b> 남음<span className="sl">/</span><span className="bg">{money(t.budget)}</span><span className="sp" />쓴 <span className="tk">{tokens(t.tokens)}</span></div>
      {t.byModel.length ? <div className="by">{t.byModel.slice(0, 3).map((m) => `${m.model.replace(/^claude-/, '').replace(/-\d+$/, '')} ${tokens(m.tokens)}`).join(' · ')}</div> : null}
    </div>)}
    <div className="uf">
      <span><i>오늘 남은</i><b>{money(u.day.left)}</b><small>쓴 {money(u.day.cost)}</small></span>
      <span><i>이번 주 남은</i><b>{money(u.week.left)}</b><small>월 09:00 초기화</small></span>
      <span><i>다시 채워짐</i><b style={{ color: c }}>{u.resetAt ? clock(u.resetAt) : '—'}</b><small>{u.resetAt ? `${until(u.resetAt, u.now)} 뒤` : '5시간 창'}</small></span>
    </div>
    <div className="un"><Icon n="clock" size={10} />남은 양은 <b>내 예산</b> 기준 · 비용·시각 추정</div>
  </div>
}

/**
 * 폰 첫 화면 — **한 줄짜리 띠**. 카드는 자리를 너무 먹는다(2026-09-13 Dave: «너무 커»).
 * 얼굴 · 남은 % · 줄어드는 막대 · 다시 채워질 때까지 한 줄. 누르면 아래에서 카드가 올라온다.
 */
export function UsageStrip({ u, onOpen }: { u: UsageReport; onOpen: () => void }) {
  const c = colorLeft(u.left)
  return <button className="ustrip" onClick={onOpen}>
    <FolderBot color={c} size={18} mood={moodLeft(u.left)} mono />
    <b style={{ color: c }}>{u.left}%</b><span className="lb">남음</span>
    <span className="bar"><span style={{ width: `${u.left}%`, background: c }} /></span>
    <span className="rs">{u.resetAt ? `${until(u.resetAt, u.now)} 뒤` : '아직'}</span>
    <Icon n="chev" size={10} />
  </button>
}

