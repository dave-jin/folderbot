import { useEffect, useState } from 'react'
import type { HarnessDetail } from '../core/types'
import { PROVIDER_LABEL, type Provider, type ProviderId } from '../core/agents'
import { api } from './api'
import { Mark } from './Brand'
import { FolderBot, Icon } from './FolderBot'
import { useStore } from './store'
import { MODELS } from './consts'

/**
 * 에이전트 고르기 (V24 · 2026-09-13 Dave 승인) — 폴더를 시작할 때 **누구와 일할지** 먼저 고르고,
 * 그 아래에서 **어떤 환경으로 뜨는지**(폴더 · 지침 · 모델 · 권한)를 본다.
 *
 * ⛔ **안 깔린 에이전트는 칸 자체가 안 나온다** (Dave: «Codex가 없으면 아예 안보여야 해»).
 *    판정은 호스트가 한다 — `GET /api/agents` 는 실행 파일이 실제로 있는 것만 내준다.
 * ⛔ **하나뿐이면 화면을 아예 안 띄운다** — 고를 게 없는데 묻는 건 문턱만 하나 더 만드는 것이다.
 *    그래서 `pickAgent()` 는 제공자가 1개면 물어보지 않고 그 값으로 바로 resolve 한다.
 */

let pickResolve: ((v: ProviderId | null) => void) | null = null
let pickSet: ((q: { rel: string; list: Provider[] } | null) => void) | null = null

/** 고르게 한다. 0개면 null(시작 못 함) · 1개면 묻지 않고 그것 · 2개 이상이면 화면을 띄운다 */
export async function pickAgent(rel: string): Promise<ProviderId | null> {
  let list: Provider[] = []
  try { list = await api<Provider[]>('/agents') } catch { list = [] }
  if (!list.length) return null
  if (list.length === 1) return list[0].id
  if (!pickSet) return list[0].id
  return new Promise((res) => { pickResolve?.(null); pickResolve = res; pickSet!({ rel, list }) })
}

const DESC: Record<ProviderId, string> = {
  claude: '하네스 · 스킬 · 커넥터를 그대로 씁니다. 이 폴더의 CLAUDE.md 를 읽어요.',
  codex: 'AGENTS.md 를 읽습니다. 같은 폴더에 형제로 둘 수 있어요.'
}

export function AgentPickHost() {
  const { s } = useStore()
  const [q, setQ] = useState<{ rel: string; list: Provider[] } | null>(null)
  const [sel, setSel] = useState<ProviderId>('claude')
  const [hz, setHz] = useState<HarnessDetail | null>(null)
  useEffect(() => { pickSet = (n) => { setQ(n); setSel(n?.list[0].id ?? 'claude'); setHz(null) }; return () => { pickSet = null } }, [])
  useEffect(() => { if (!q) return; void api<HarnessDetail>(`/harness?rel=${encodeURIComponent(q.rel)}`).then(setHz).catch(() => setHz(null)) }, [q?.rel])
  if (!q) return null
  const done = (v: ProviderId | null) => { setQ(null); const r = pickResolve; pickResolve = null; r?.(v) }
  const model = MODELS.find((m) => m.v === (s.defaults.model || 'claude-fable-5-1'))?.t ?? s.defaults.model
  const guide = hz ? [hz.claudeMd ? 'CLAUDE.md' : null, hz.agentsMd ? 'AGENTS.md' : null].filter(Boolean).join(' · ') : ''
  const env: [string, string, boolean][] = [
    ['폴더', q.rel, false],
    ['지침', hz ? `${guide || '없음'}${hz.skills ? ` · 스킬 ${hz.skills}` : ''}${hz.mcp ? ` · 커넥터 ${hz.mcp}` : ''}` : '읽는 중…', !!(hz && (sel === 'codex' ? hz.agentsMd : hz.claudeMd))],
    ['모델', `${model} · 생각 ${s.defaults.effort || 'high'}`, false],
    ['권한', '물어봄 — 쓰기 전에 확인', false]
  ]
  return <>
    <div className="backdrop" onClick={() => done(null)} />
    <div className="modal apick">
      <div className="ap-h">
        <FolderBot color="var(--run)" size={36} mood="idle" />
        <span className="t"><b>이 폴더에서 누구와 일할까요</b><small>{q.rel}</small></span>
        <button className="ib" onClick={() => done(null)}><Icon n="x" size={14} /></button>
      </div>
      <div className="ap-cards">
        {q.list.map((p) => <button key={p.id} className={`ap-c ${p.id} ${sel === p.id ? 'on' : ''}`} onClick={() => setSel(p.id)} aria-pressed={sel === p.id}>
          {sel === p.id ? <span className="ap-ck"><Icon n="check" size={11} color="#fff" /></span> : null}
          <span className="hd"><Mark id={p.id} size={19} /><b>{PROVIDER_LABEL[p.id]}</b></span>
          <span className="ds">{DESC[p.id]}</span>
          <span className="chips"><span className="ch mono">{p.version ?? p.bin}</span></span>
        </button>)}
      </div>
      <div className="ap-env">
        <div className="cap">환경 — 고른 에이전트가 이 조건으로 뜹니다</div>
        {env.map(([k, v, ok]) => <div className="er" key={k}><span className="k">{k}</span><span className="v mono">{v}</span>{ok ? <Icon n="check" size={11} color="var(--done)" /> : null}</div>)}
      </div>
      <div className="ap-f">
        <span className="sp" />
        <button className="btn" onClick={() => done(null)}>취소</button>
        <button className="btn on" onClick={() => done(sel)}><Mark id={sel} size={14} />{PROVIDER_LABEL[sel]} 로 시작</button>
      </div>
    </div>
  </>
}
