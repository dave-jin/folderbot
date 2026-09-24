import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Bot, NotifyEvent, RoutineDef } from '../core/types'
import { api, setToken, subscribePush } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { hitRange, rank } from '../core/search'
import { WHEN_EXAMPLES, describeCron, formatNext, nextRunOf, parseWhen } from '../core/when'
import { candidatePaths } from '../core/paths'
import { diffLines, diffStat, foldSame } from '../core/diff'
import { extractMath } from '../core/math'
import { renderMarkdown, renderStreaming } from './render'
import { wikiNames } from '../core/wikilinks'
import { token } from './api'
import { loadKatex, renderMath, renderMermaid } from './mathmaid'
import { decorateLinks } from './favicons'
import { boxifyLinks, decorateCode, hoverLinks, hoverable } from './previews'
import { copyText } from './clip'
import { pickAgent } from './AgentPick'
import { fmtTime, useStore } from './store'

/**
 * 답변 속 «경로처럼 보이는 글자» 를 눌러서 여는 칩으로 (2026-09-13 Dave).
 *
 * 🔴 **실제로 있는 것만 칩이 된다.** 후보는 `core/paths` 가 내고, 있는지는 호스트가 답한다
 *    (`POST /api/bots/:id/exists`). 확인 없이 만들면 죽은 링크가 대화에 쌓인다.
 * 🔴 **렌더된 HTML 문자열을 정규식으로 건드리지 않는다** — 태그 안쪽을 잘못 물면 마크업이 깨진다.
 *    대신 **그린 뒤에 텍스트 노드만 걸어** 바꾼다. `code`·`pre`·`a` 안은 건너뛴다.
 * ⚠ 스트리밍 중에는 하지 않는다 — 글자가 계속 바뀌는 동안 DOM 을 갈아 대면 선택이 튄다.
 */
/** 답 속에서 «있는 것» 으로 확인된 경로 하나 — `text` 는 답에 적힌 그대로, `rel` 은 봇 폴더 기준(`../` 가능) */
export interface PathHit { text: string; rel: string; dir: boolean; matches?: string[] }
/** 긴 이름은 가운데 생략 — 줄 폭의 60% 를 글자 수로 어림(본문 15px 기준 약 28자). 확장자는 남긴다 */
export function midEllipsis(name: string, max = 28): string { if (name.length <= max) return name; const m = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(name)!; const base = m[1], ext = m[2] ?? ''; const keep = max - ext.length - 1; const head = Math.ceil(keep * 0.6), tail = keep - head; return `${base.slice(0, head)}…${base.slice(base.length - tail)}${ext}` }
const FOLDER_SVG = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 4h4l1.5 1.5H14V13H2z"/></svg>'
function decorate(root: HTMLElement, hits: PathHit[], open: (rel: string) => void, openDir: ((rel: string) => void) | undefined, botId?: string): void {
  if (!hits.length) return
  const made: [HTMLButtonElement, string, (n: string) => HTMLSpanElement][] = []
  const chip = (h: PathHit): HTMLButtonElement => {
    const b = document.createElement('button')
    b.className = h.dir ? 'pchip dir' : 'pchip'; b.type = 'button'; b.title = h.text
    b.dataset.rel = h.rel
    const full = h.text.replace(/\/+$/, '').split('/').pop() || h.text
    // 🔴 폴더 칩은 문서 탭이 아니라 **트리를 연다** — 폴더는 읽을 글이 없다 (2026-09-15)
    // P-1 · 칩은 글자처럼 — 확장자만 흐리게, 긴 이름은 가운데 생략, 안에서 줄 바꿈 없음(CSS)
    const label = (name: string) => { const m = /^(.*)(\.[A-Za-z0-9]{1,8})$/.exec(name); const sp = document.createElement('span'); sp.className = 'nm'; if (m) { sp.textContent = m[1]; const ext = document.createElement('span'); ext.className = 'ext'; ext.textContent = m[2]; sp.appendChild(ext) } else sp.textContent = name; return sp }
    if (h.dir) { b.innerHTML = FOLDER_SVG; b.appendChild(label(midEllipsis(full))) } else b.appendChild(label(midEllipsis(full)))
    made.push([b, full, label])
    if (h.matches && h.matches.length > 1) b.title = `${h.text} — ${h.matches.length}곳에 있어요`; else if (!h.text.includes('/')) b.title = h.rel
    // 파일명만 적혀 여럿이 걸리면 고르게 한다 (G) — 화면(App)의 고르기 시트가 받는다
    b.addEventListener('click', (e) => { e.preventDefault(); if (h.dir) openDir?.(h.rel); else if (h.matches && h.matches.length > 1) window.dispatchEvent(new CustomEvent('fb:pickfile', { detail: { name: h.text, rels: h.matches } })); else open(h.rel) })
    // 첨부·문서 칩도 오버하면 미리보기 — 이미지는 그림을, 글은 앞 몇 줄을 (`previews.ts`) · 폴더는 볼 것이 없다
    if (botId && !h.dir) hoverable(b, { kind: 'file', botId, rel: h.rel })
    return b
  }
  /**
   * 🔴 **백틱에 싸인 경로도 칩이 된다** (2026-09-15 Dave: *«답변 내용안에는 바로 클릭가능한 칩이 없어»*).
   *    에이전트는 파일 이름을 거의 언제나 `` `…` `` 로 감싼다 — 인라인 코드를 통째로 건너뛰던 종전 규칙은
   *    사실상 «칩을 만들지 않는다» 와 같았다.
   * ⚠ 통째로 경로인 코드 조각은 **요소째** 칩으로 바꾼다(코드 배경 안에 칩이 앉으면 두 겹으로 보인다).
   * ⛔ 펜스 코드(`pre`)는 그대로 둔다 — 예시 코드지 이 볼트의 파일이 아니고, 복사 단추도 거기 붙어 있다.
   */
  // P-2 (2026-09-19, 09-15 규칙을 덮음) · 코드 조각은 **모양을 코드 그대로** 두고 통째로 경로일 때만 클릭할 수 있게 한다(hover 배경만). 칩으로 바꾸지 않는다
  for (const c of [...root.querySelectorAll('code')]) {
    if (c.closest('pre')) continue
    const t = (c.textContent ?? '').trim().replace(/\/+$/, '')
    const hit = hits.find((h) => h.text === t)
    if (hit) { c.classList.add('code-path'); c.title = hit.matches && hit.matches.length > 1 ? `${hit.text} — ${hit.matches.length}곳에 있어요` : hit.rel; c.dataset.rel = hit.rel; c.addEventListener('click', (e) => { e.preventDefault(); if (hit.dir) openDir?.(hit.rel); else if (hit.matches && hit.matches.length > 1) window.dispatchEvent(new CustomEvent('fb:pickfile', { detail: { name: hit.text, rels: hit.matches } })); else open(hit.rel) }) }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    // K-2 · `code` 안은 걷지 않는다 — 통째로 경로인 코드 조각은 위에서 요소째 바꿨고, 나머지는 예시라 토막 내지 않는다(스크린샷 1236)
    acceptNode: (n) => (n.parentElement?.closest('pre,code,a,.pchip,.wlink') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  })
  const texts: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text)
  for (const node of texts) {
    let cur = node
    for (const hit of hits) {
      const i = cur.data.indexOf(hit.text)
      if (i < 0) continue
      const after = cur.splitText(i)
      const rest = after.splitText(hit.text.length)
      after.replaceWith(chip(hit))
      cur = rest
    }
  }
  // P-1 · 가운데 생략은 **폭에 맞춰** 줄인다 — 글자 수 어림(28자)은 폰(줄 폭 60% ≈ 13자)에서 넘쳐 CSS 끝 생략(…)이 대신 붙었다.
  //   붙은 뒤 한 프레임에 잰다: 넘치는 동안 두 글자씩 줄여 다시 만든다(확장자는 끝까지 남는다).
  if (made.length) requestAnimationFrame(() => { for (const [b, full, label] of made) { let n = midEllipsis(full).length; let nm = b.querySelector('.nm'); for (let g = 0; g < 40 && nm && nm.scrollWidth > nm.clientWidth + 1 && n > 6; g++) { n -= 2; const next = label(midEllipsis(full, n)); nm.replaceWith(next); nm = next } } })
}

/**
 * K-1 · 위키링크 채우기 — 렌더러(core/wikilinks)는 이름만 달아 두고, 어디 있는지는 호스트가 답한다(`/exists`, 파일명만이라
 * 봇 폴더 → 참조 → 볼트 순으로 찾는다 · G). 그림은 `raw` 로 src 를 채우고(원격도 호스트 스트리밍), 노트는 눌러서 문서 창.
 * 없는 것은 「찾을 수 없음」 — 깨진 그림 아이콘이나 죽은 링크를 두지 않는다.
 */
function resolveWiki(root: HTMLElement, names: string[], ok: Record<string, { rel: string; dir: boolean; matches?: string[] } | false>, botId: string, open: (rel: string) => void): void {
  if (!names.length) return
  for (const el of [...root.querySelectorAll<HTMLElement>('[data-wiki]')]) {
    const name = el.dataset.wiki ?? ''; const r = ok[name]
    if (!r) { const m = document.createElement('span'); m.className = 'wmiss'; m.textContent = `찾을 수 없음 · ${name}`; m.title = name; el.replaceWith(m); continue }
    if (el instanceof HTMLImageElement) { el.src = `/api/bots/${botId}/raw?rel=${encodeURIComponent(r.rel)}&token=${encodeURIComponent(token())}`; el.title = name; el.addEventListener('click', () => open(r.rel)); el.addEventListener('error', () => { const m = document.createElement('span'); m.className = 'wmiss'; m.textContent = `찾을 수 없음 · ${name}`; el.replaceWith(m) }); continue }
    el.dataset.rel = r.rel; el.title = r.rel
    el.addEventListener('click', (e) => { e.preventDefault(); if (r.matches && r.matches.length > 1) window.dispatchEvent(new CustomEvent('fb:pickfile', { detail: { name, rels: r.matches } })); else open(r.rel) })
    if (!r.dir) hoverable(el, { kind: 'file', botId, rel: r.rel })
  }
}

export function Md({ text, streaming, botId, onPath, onDir }: { text: string; streaming?: boolean; botId?: string; onPath?: (rel: string) => void; onDir?: (rel: string) => void }) {
  /**
   * 수식 (루프 10/10) — `$…$` 를 marked 보다 먼저 걷어 내고(core/math), KaTeX 가 오면 끼워 넣는다.
   * ⚠ KaTeX 가 아직 안 왔으면 원문 `$…$` 이 그대로 보인다 — 빈칸보다 낫다. 오면 다시 그린다.
   */
  const [katex, setKatex] = useState<Parameters<typeof renderMath>[0] | null>(null)
  const html = useMemo(() => (streaming ? renderStreaming(text) : renderMarkdown(text, katex ? renderMath(katex) : null)), [text, katex, streaming])
  useEffect(() => { if (!katex && extractMath(text).chunks.length) void loadKatex().then(setKatex).catch(() => {}) }, [text, katex])
  const ref = useRef<HTMLDivElement>(null)
  /**
   * 🔴 **바깥 링크는 바깥에서 연다** (2026-09-13 Dave). 앱 안에서 열면 **Folder Bot 이 그 자리에서
   *    사라진다** — 데스크톱 셸은 창을 통째로 그 사이트로 끌고 가고(뒤로 가기도 없다), 폰 웹앱은
   *    홈 화면에 담긴 창 하나뿐이라 대화로 돌아올 길이 없다.
   * ⚠ `marked` 는 `target` 을 안 달아 준다 — 그린 뒤에 우리가 단다. 데스크톱 셸의
   *    `setWindowOpenHandler` 가 이 `_blank` 를 받아 기본 브라우저로 넘긴다(desktop/main.js).
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    for (const a of el.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) { a.target = '_blank'; a.rel = 'noreferrer noopener' }
    /**
     * 🔴 **혼자 선 링크는 박스가 된다** (2026-09-13 Dave: *«링크와 첨부 모두 rondo 처럼 채팅 안에
     *    박스로 … 마우스 오버했을때 미리보기»*). 글 속 링크는 밑줄 그대로 두고 **오버에만** 카드를 띄운다 —
     *    문장 가운데를 박스로 끊으면 글이 안 읽힌다(`previews.ts` 머리말).
     * ⚠ 순서가 있다: 박스를 먼저 만들고(제 파비콘을 갖는다) 그다음 남은 링크에 파비콘을 단다.
     */
    boxifyLinks(el)
    decorateLinks(el)     // 링크 앞 파비콘 — 자리표시자를 먼저 놓고 도착하면 갈아 끼운다
    hoverLinks(el)        // 글 속 링크 — 오버하면 같은 미리보기 카드
    decorateCode(el, copyText)   // 코드 블록 — 언어 이름 · 복사 단추 (B3)
    if (!streaming) void renderMermaid(el).catch(() => {})   // ```mermaid → 그림 (루프 10/10) · 답이 끝난 뒤에만
  }, [html, streaming])
  useEffect(() => {
    const el = ref.current
    if (!el || !botId || !onPath || streaming) return
    const wiki = wikiNames(text)
    const cands = [...new Set([...candidatePaths(text), ...wiki])]
    if (!cands.length) return
    let live = true
    void api<Record<string, { rel: string; dir: boolean; matches?: string[] } | false>>(`/bots/${botId}/exists`, { body: { rels: cands } })
      .then((ok) => {
        if (!live || !ref.current) return
        // 한 자리에서 여러 후보가 걸리면 **긴 것**이 이긴다 — `3. Area/…` 가 `Area/…` 보다 맞다
        const found = cands.filter((c) => !wiki.includes(c) && ok[c]).sort((a, b) => b.length - a.length)
        // K-2 · 긴 경로의 **조각**은 칩이 되지 않는다 — «PARA/첨부/x.png» 가 있으면 «PARA/»·«첨부» 는 버린다(통째 칩 하나)
        const whole = found.filter((c, i) => !found.slice(0, i).some((longer) => longer.includes(c)))
        const hits: PathHit[] = whole.map((c) => { const r = ok[c] as { rel: string; dir: boolean; matches?: string[] }; return { text: c, rel: r.rel, dir: r.dir, matches: r.matches } })
        decorate(ref.current, hits, onPath, onDir, botId)
        resolveWiki(ref.current, wiki, ok, botId, onPath)
      })
      .catch(() => { /* 못 물어봤으면 그냥 글자로 둔다 */ })
    return () => { live = false }
  }, [html, streaming, botId])
  return <div ref={ref} className={`md ${streaming ? 'streaming' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

/** 걸린 자리를 굵게 — 왜 이 폴더가 나왔는지 눈으로 보이게 (자리 판정은 core/search) */
function Hit({ s, q }: { s: string; q: string }) {
  const r = hitRange(q, s); if (!r) return <>{s.normalize('NFC')}</>
  const t = s.normalize('NFC')
  return <>{t.slice(0, r[0])}<b className="hit">{t.slice(r[0], r[1])}</b>{t.slice(r[1])}</>
}

/** 폰이냐 — 폴더 고르기는 폰에서 완전히 다른 화면을 쓴다(V17 B안) */
function useIsPhone(): boolean {
  const [m, setM] = useState(() => (typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 760px)').matches : false))
  useEffect(() => { const mq = matchMedia('(max-width: 760px)'); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [])
  return m
}

/* ── 폴더 선택 (시작) — PARA 를 Finder 처럼 접었다 펴는 트리. 어디든 시작할 수 있다 ── */
interface PNode { name: string; rel: string; dir: boolean; mtime: number; harness?: boolean; botId?: string; role?: 'inbox' | 'active' | 'reference' | 'archive' }
const ROLE_T: Record<string, [string, string]> = { active: ['활성', 'var(--done)'], reference: ['참조', 'var(--t2)'], archive: ['보관', 'var(--t3)'], inbox: ['정리 대기', 'var(--wait)'] }
const NEW_MARK = '/\u0000new'
export function FolderPicker({ onClose, onStarted }: { onClose: () => void; onStarted: (bot: Bot) => void }) {
  const { s, refresh } = useStore()
  const activeParents = useMemo(() => (s.rules?.roles.active ?? []).map((g) => g.replace(/\/\*$/, '')), [s.rules])
  const [dirs, setDirs] = useState<Record<string, PNode[]>>({})
  const [exp, setExp] = useState<Set<string>>(() => new Set(['', ...activeParents]))
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState(''); const [flat, setFlat] = useState<PNode[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'free'>('all')
  const phone = useIsPhone(); const [cur, setCur] = useState('') // 폰: 지금 들어와 있는 폴더(«» 는 루트)
  const [newIn, setNewIn] = useState<string | null>(null); const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const load = async (rel: string) => { try { const l = await api<PNode[]>(`/bots/orch/ls?dir=${encodeURIComponent(rel)}`); setDirs((d) => ({ ...d, [rel]: l.filter((n) => n.dir) })) } catch { /* */ } }
  useEffect(() => { for (const d of exp) if (!dirs[d]) void load(d) }, [exp])
  // 🔴 색인은 «폴더만» 받는다 — 종전의 files?depth=4 는 파일까지 세며 400개에서 끊겨
  //    볼트 뒤쪽 폴더가 검색에 아예 안 잡혔다 (2026-09-13 Dave 보고)
  useEffect(() => { if (q && !flat) void api<PNode[]>('/bots/orch/dirs?depth=6').then(setFlat).catch(() => setFlat([])) }, [q])
  const byRel = useMemo(() => { const m = new Map<string, PNode>(); for (const l of Object.values(dirs)) for (const n of l) m.set(n.rel, n); for (const n of flat ?? []) if (!m.has(n.rel)) m.set(n.rel, n); return m }, [dirs, flat])
  const botOfRel = (rel: string) => s.bots.find((b) => b.rel === rel)
  const topRole = (rel: string) => byRel.get(rel.split('/')[0])?.role
  /**
   * AC · **칸(섹션) 자체는 봇이 못 된다** (2026-09-23 Dave: *«이렇게 폴더 전체가 생기면 안돼»*).
   * 칸 = 맨 위 한 마디이면서 역할이 붙은 폴더(`1. Inbox`·`2. Projects`·`3. Area`·`4. Resources`·`5. Archive`).
   * 고르면 **시작이 아니라 펼쳐서** 그 안의 폴더를 보여 준다 — 봇은 칸이 아니라 **일 하나**에 붙는다.
   */
  const isSection = (n: PNode) => !n.rel.includes('/') && !!n.role
  const selIsSection = (() => { const n = sel ? byRel.get(sel) : undefined; return !!n && isSection(n) })()
  // 보이는 행 — 검색 중이면 평평하게, 아니면 트리
  const rows = useMemo(() => {
    const out: { n: PNode; depth: number; kind: 'dir' | 'new' }[] = []
    // 찾는 중 — 평평하게. 판정은 core/search 한 곳에서(NFC 맞춤 · 가운데 일치 · 초성)
    if (q.trim()) return rank(q, flat ?? [], (n) => ({ name: n.name, path: n.rel }), 200).map((n) => ({ n, depth: 0, kind: 'dir' as const }))
    const walk = (rel: string, depth: number) => {
      const list = dirs[rel] ?? []
      if (rel && exp.has(rel)) out.push({ n: { name: '새 폴더 만들기', rel: `${rel}${NEW_MARK}`, dir: true, mtime: 0 }, depth, kind: 'new' })
      for (const n of list) {
        if (filter === 'active' && topRole(n.rel) !== 'active' && !n.rel.includes('/')) continue
        if (filter === 'free' && (n.botId || botOfRel(n.rel))) continue
        out.push({ n, depth, kind: 'dir' })
        if (exp.has(n.rel)) walk(n.rel, depth + 1)
      }
    }
    walk('', 0)
    return out
  }, [dirs, exp, q, flat, filter, s.bots])
  const toggle = (rel: string) => setExp((e) => { const n = new Set(e); if (n.has(rel)) n.delete(rel); else n.add(rel); return n })
  const selNode = sel ? byRel.get(sel) : undefined
  const selBot = sel ? botOfRel(sel) : undefined
  const start = async (rel: string) => {
    if (busy) return
    const role = topRole(rel)
    if (role === 'archive' && !confirm('보관(Archive) 폴더예요. 그래도 여기서 봇을 시작할까요?')) return
    setBusy(true); setErr('')
    try { const provider = await pickAgent(rel); if (!provider) return; const bot = await api<Bot>('/bots/start', { body: { rel, provider } }); await refresh(); onStarted(bot) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const create = async () => {
    if (!newIn || !newName.trim() || busy) return
    setBusy(true); setErr('')
    try { const provider = await pickAgent(`${newIn}/${newName.trim()}`); if (!provider) return; const r = await api<{ rel: string; bot: Bot }>('/folders', { body: { section: newIn, name: newName.trim(), start: true, provider } }); await refresh(); onStarted(r.bot) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const preview = (section: string, name: string) => { const tpl = s.rules?.naming.project; if (!tpl || section !== activeParents[0] || !name) return name; const d = new Date(); return tpl.replace('{YYYY}', String(d.getFullYear())).replace('{MM}', String(d.getMonth() + 1).padStart(2, '0')).replace('{이름}', name).replace('{name}', name) }
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement; if (t.tagName === 'INPUT' && t.classList.contains('nm')) return
    const vis = rows.filter((r) => r.kind === 'dir'); const i = vis.findIndex((r) => r.n.rel === sel)
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(vis[Math.min(vis.length - 1, i + 1)]?.n.rel ?? sel) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(vis[Math.max(0, i - 1)]?.n.rel ?? sel) }
    else if (e.key === 'ArrowRight' && sel) { e.preventDefault(); setExp((x) => new Set([...x, sel])) }
    else if (e.key === 'ArrowLeft' && sel) { e.preventDefault(); if (exp.has(sel)) toggle(sel); else if (sel.includes('/')) setSel(sel.slice(0, sel.lastIndexOf('/'))) }
    else if (e.key === 'Enter' && sel) { e.preventDefault(); if (selBot) onStarted(selBot); else void start(sel) }
    else if (e.key === 'Escape') onClose()
  }
  useEffect(() => { if (!sel) return; const el = listRef.current?.querySelector(`[data-rel="${CSS.escape(sel)}"]`); (el as HTMLElement | null)?.scrollIntoView({ block: 'nearest' }) }, [sel])
  const crumbs = sel ? sel.split('/') : []

  /**
   * 폰 — **한 단계씩 들어간다** (V17 B안). 폰은 폭이 전부라 트리의 들여쓰기·배지가 이름을 잡아먹는다.
   * · 이름이 폭을 전부 쓰고, 상태는 아랫줄 아이콘 + 짧은 말 · 오른쪽엔 꺾쇠 하나뿐
   * · 푸터는 두 줄(지금 경로 + 큰 버튼) · 취소는 헤더 ✕ 로 옮겨 푸터가 넘치지 않는다
   * · 검색은 돋보기로 어느 깊이든 한 번에 (데스크톱과 같은 색인·판정을 쓴다)
   */
  if (phone) {
    const here = cur ? byRel.get(cur) : undefined
    const hereBot = cur ? botOfRel(cur) : undefined
    const kids = q.trim() ? rank(q, flat ?? [], (n2) => ({ name: n2.name, path: n2.rel }), 200) : (dirs[cur] ?? [])
    const label = (n2: PNode) => (n2.botId || botOfRel(n2.rel) ? '봇 있음 — 열기' : n2.harness ? '하네스 있음' : '시작하면 하네스를 깔아요')
    const tone = (n2: PNode) => (n2.botId || botOfRel(n2.rel) ? 'var(--run)' : n2.harness ? 'var(--done)' : 'var(--t3)')
    const mark = (n2: PNode) => (n2.botId || botOfRel(n2.rel) ? 'folder' : n2.harness ? 'check' : 'plus')
    const up = () => { if (q) { setQ(''); return } if (!cur) { onClose(); return } setCur(cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/')) : '') }
    return <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal pk phone" onKeyDown={onKey} tabIndex={-1}>
        <div className="ph-h">
          <button className="rb" onClick={up} title="위로"><Icon n="back" size={17} /></button>
          <span className="t"><Mid s={cur ? (cur.split('/').pop() ?? cur) : 'PARA'} tail={10} /></span>
          <button className={`rb ${q ? 'on' : ''}`} onClick={() => { setQ(q ? '' : ' '); setTimeout(() => (document.querySelector('.pk.phone .ph-s input') as HTMLInputElement | null)?.focus(), 30) }} title="찾기"><Icon n="search" size={16} /></button>
          <button className="rb" onClick={onClose} title="닫기"><Icon n="x" size={16} /></button>
        </div>
        {q ? <div className="ph-s"><Icon n="search" size={14} /><input placeholder="폴더 이름 · 초성도 됩니다" value={q.trim() ? q : ''} onChange={(e) => setQ(e.target.value || ' ')} /></div>
          : <div className="ph-c">{['PARA', ...(cur ? cur.split('/') : [])].map((c, i, arr) => <span key={i} className={i === arr.length - 1 ? 'on' : ''} onClick={() => setCur(arr.slice(1, i + 1).join('/'))}>{c}</span>)}</div>}
        <div className="modal-b ph-b" ref={listRef}>
          {kids.map((n2) => <button key={n2.rel} data-rel={n2.rel} className="ph-row" onClick={() => { if (q) { setQ(''); setCur(n2.rel) } else setCur(n2.rel) }}>
            <span className="ic" style={{ color: tone(n2) }}><Icon n={mark(n2) as 'folder'} size={15} /></span>
            <span className="n"><span className="nm">{q.trim() ? <Hit s={n2.name} q={q} /> : <Mid s={n2.name} tail={10} />}</span><span className="dsub">{q.trim() && n2.rel.includes('/') ? `${n2.rel.slice(0, n2.rel.lastIndexOf('/'))} · ` : ''}{label(n2)}</span></span>
            <Icon n="chev" size={11} />
          </button>)}
          {!kids.length ? <div className="empty">{q.trim() ? '찾는 폴더가 없어요' : cur ? '하위 폴더가 없어요 — 여기서 시작할 수 있어요' : '읽는 중…'}</div> : null}
          {!q && cur ? (newIn === cur ? <div className="newbox"><input className="nm" autoFocus placeholder="새 폴더 이름" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') setNewIn(null) }} /><div className="pv"><span className="mono">{cur}/{preview(cur, newName || '이름')}</span></div></div>
            : <button className="ph-row new" onClick={() => { setNewIn(cur); setNewName('') }}><span className="ic"><Icon n="fplus" size={15} /></span><span className="n"><span className="nm">여기에 새 폴더</span></span></button>) : null}
        </div>
        <div className="ph-f">
          {err ? <div className="er">{err}</div> : null}
          <div className="pa"><Mid s={cur || 'PARA (루트)'} tail={14} /></div>
          <button className="go" disabled={busy || !cur} onClick={() => (hereBot ? onStarted(hereBot) : cur ? void start(cur) : undefined)}>
            {hereBot ? '이 폴더의 봇 열기' : here && topRole(cur) === 'archive' ? '보관 폴더지만 시작' : `여기서 시작`}</button>
        </div>
      </div>
    </>
  }

  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal pk" style={{ height: 'min(720px, calc(100% - 24px))' }} onKeyDown={onKey} tabIndex={-1}>
      <div className="modal-h"><FolderBot color="#e08850" size={40} /><div className="t"><b>에이전트와 함께 일할 폴더를 선택하세요</b><small>PARA 어디든 됩니다 — 접었다 펴서 고르세요 · 활성 폴더가 먼저 · 새 폴더는 그 자리에서</small></div><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="search"><Icon n="search" size={14} /><input placeholder="폴더 이름으로 찾기 — 치면 트리가 펼쳐지며 걸러져요" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="fl">{([['all', '전체'], ['active', '활성만'], ['free', '봇 없는 폴더만']] as const).map(([k, t]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t}</button>)}<span className="hint">↑↓ 이동 · → 펼침 · ← 접음 · ⏎ 시작</span></div>
      <div className="modal-b" style={{ flex: 1 }} ref={listRef}>
        {rows.map(({ n, depth, kind }) => kind === 'new' ? (newIn === n.rel.replace(NEW_MARK, '') ? <div key={n.rel} className="newbox" style={{ marginLeft: 18 + depth * 16 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}><Icon n="fplus" size={14} />새 폴더 만들기</div><input className="nm" autoFocus placeholder="이름" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') setNewIn(null) }} /><div className="pv"><Icon n="chev" size={12} /><span className="mono">{newIn}/{preview(newIn, newName || '이름')}</span><span>· 하네스 설치 · 바로 시작</span></div></div>
            : <button key={n.rel} className="trow" style={{ ['--pad' as string]: `${18 + depth * 16 + 19}px`, color: 'var(--t2)' }} onClick={() => { setNewIn(n.rel.replace(NEW_MARK, '')); setNewName('') }}><Icon n="fplus" size={13} color="var(--t3)" /><span className="n">새 폴더 만들기</span></button>)
          : <button key={n.rel} data-rel={n.rel} className={`trow dir ${sel === n.rel ? 'on' : ''}`} style={{ ['--pad' as string]: `${18 + depth * 16}px`, minHeight: 32, opacity: topRole(n.rel) === 'archive' ? .7 : 1 }} onClick={() => setSel(n.rel)} onDoubleClick={() => (isSection(n) ? toggle(n.rel) : n.botId || botOfRel(n.rel) ? onStarted(botOfRel(n.rel)!) : void start(n.rel))} title={n.rel}>
            <span className="cv" onClick={(e) => { e.stopPropagation(); toggle(n.rel) }} style={{ width: 14, padding: 4, margin: -4 }}>{q ? null : <Icon n={exp.has(n.rel) ? 'chevd' : 'chev'} size={10} />}</span><Icon n="folder" size={13} color="var(--t2)" />
            <span className="n" style={{ color: sel === n.rel ? 'var(--w)' : undefined }}>{q ? <span className="hitn"><span className="nm"><Hit s={n.name} q={q} /></span>{n.rel.includes('/') ? <span className="pth"><Mid s={n.rel.slice(0, n.rel.lastIndexOf('/'))} tail={10} /></span> : null}</span> : <Mid s={n.name} tail={8} />}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
              {!n.rel.includes('/') && n.role ? <span className="rbg" style={{ color: ROLE_T[n.role][1] }}>{ROLE_T[n.role][0]}</span> : null}
              {n.botId || botOfRel(n.rel) ? <span className="rbg" style={{ color: 'var(--run)' }}>봇 있음 · 열기</span> : n.harness ? <span className="b" style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="check" size={11} color="var(--done)" />하네스</span> : n.rel.includes('/') ? <span style={{ fontSize: 11, color: 'var(--t3)' }}>하네스 없음 · 시작하면 깔아 줌</span> : null}
              <time style={{ visibility: 'visible', width: 52, textAlign: 'right' }}>{fmtTime(n.mtime)}</time>
            </span>
          </button>)}
        {!rows.length ? <div className="empty">{q ? '찾는 폴더가 없어요' : '읽는 중…'}</div> : null}
      </div>
      <div className="modal-f" style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}><span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--t2)', fontSize: 12, flex: 'none' }}><FolderBot color="#e08850" size={20} />또는 오케스트레이터에게 "X 폴더에서 시작해"</span><span className="crumb">{crumbs.length ? <span>{crumbs.slice(0, -1).map((c) => `${c} / `).join('')}<b>{crumbs[crumbs.length - 1]}</b></span> : <span style={{ color: 'var(--t3)' }}>폴더를 고르세요</span>}</span>{selIsSection && !err ? <span style={{ color: 'var(--t3)', fontSize: 12, flex: 'none' }}>칸이에요 — 그 안의 폴더를 고르세요</span> : null}{err ? <span className="err" style={{ color: 'var(--err)', fontSize: 12, flex: 'none' }}>{err}</span> : null}<button className="btn" onClick={onClose} style={{ flex: 'none' }}>취소</button><button className="btn primary" style={{ flex: 'none' }} disabled={busy || !sel || selIsSection} title={selIsSection ? '칸에는 봇을 만들지 않아요 — 그 안의 폴더를 고르세요' : ''} onClick={() => (selBot ? onStarted(selBot) : sel ? void start(sel) : undefined)}>{selBot ? '봇 열기' : selNode && topRole(sel!) === 'archive' ? '보관 폴더지만 시작' : '이 폴더에서 시작'}</button></div>
    </div>
  </>
}

/* ── 온보딩(규칙 프리셋) ────────────────────────────────────────────────── */
export function Onboarding() {
  const { s, refresh } = useStore()
  const [preset, setPreset] = useState<'para' | 'johnny-decimal' | 'custom'>('para'); const [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); try { await api('/rules/install', { body: { preset } }); await refresh() } finally { setBusy(false) } }
  return <div className="pair"><div className="box" style={{ width: 'min(760px,100%)', alignItems: 'stretch', textAlign: 'left' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><FolderBot color="#e08850" size={32} /><b style={{ fontSize: 18, color: 'var(--strong)' }}>폴더 규칙을 고르세요</b></div>
    <div style={{ color: 'var(--dim)' }}>루트 <span className="mono">{s.root}</span>. 오케스트레이터가 이 규칙으로 후보를 찾고 Inbox 를 정리해요. 루트 <span className="mono">CLAUDE.md</span> 에 절로 설치되고 언제든 직접 고칠 수 있어요.</div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button className={`preset ${preset === 'para' ? 'on' : ''}`} onClick={() => setPreset('para')}><b><Icon n="folder" size={15} color={preset === 'para' ? 'var(--accent)' : 'var(--faint)'} />PARA</b><small>Projects · Area · Resources · Archive. Inbox 는 정리 상자.</small></button>
      <button className={`preset ${preset === 'johnny-decimal' ? 'on' : ''}`} onClick={() => setPreset('johnny-decimal')}><b><Icon n="folder" size={15} color={preset === 'johnny-decimal' ? 'var(--accent)' : 'var(--faint)'} />Johnny.Decimal</b><small>10-19 영역 · 11 카테고리. 모든 2단계 폴더가 후보.</small></button>
      <button className={`preset ${preset === 'custom' ? 'on' : ''}`} onClick={() => setPreset('custom')}><b><Icon n="folder" size={15} color={preset === 'custom' ? 'var(--accent)' : 'var(--faint)'} />내 방식대로</b><small>PARA 로 시작하고, 오케스트레이터와 대화해 규칙 절을 고칩니다.</small></button>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 12, color: 'var(--faint)' }}>CLAUDE.md 가 이미 있으면 덮어쓰지 않고 절만 덧붙여요.</span><span style={{ flex: 1 }} /><button className="btn primary" disabled={busy} onClick={go}>규칙 설치하고 스캔</button></div>
  </div></div>
}

/* ── 페어링 ─────────────────────────────────────────────────────────────── */
export function Pairing({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const device = useMemo(() => /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'PC', [])
  const go = async () => {
    setBusy(true); setErr('')
    try { const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code.replace(/\D/g, ''), device }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? '실패'); setToken(j.token); onDone() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="pair"><div className="box">
    <FolderBot color="#e08850" size={72} />
    <b style={{ fontSize: 20, color: 'var(--strong)' }}>Folder Bot</b>
    <div style={{ color: 'var(--dim)' }}>호스트 맥의 메뉴바 폴더봇 › 페어링 코드, 또는 호스트 터미널에 보이는 6자리 코드를 넣으세요.</div>
    <input inputMode="numeric" placeholder="000 000" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go() }} autoFocus />
    {err ? <div className="err">{err}</div> : null}
    <button className="btn primary" disabled={busy || code.replace(/\D/g, '').length < 6} onClick={go} style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}>이 {device} 연결하기</button>
  </div></div>
}

/* ── 알림 센터 ───────────────────────────────────────────────────────────── */
export function NotifyCenter({ onClose, onJump }: { onClose: () => void; onJump: (n: NotifyEvent) => void }) {
  const { s, refresh } = useStore()
  const [only, setOnly] = useState(false)
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const list = s.notifications.filter((n) => !only || n.kind === 'awaiting')
  const botOf = (id: string) => s.bots.find((b) => b.id === id)
  const readAll = async () => { await api('/notifications/read', { body: {} }); await refresh() }
  const enablePush = async () => { setPushOn(await subscribePush(s.vapidPublic, navigator.userAgent.slice(0, 30))) }
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal nmodal" style={{ width: 'min(480px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>알림</b><small>모든 봇 · 한 기기에서 처리하면 다른 기기에서도 사라져요</small></div><button className={`btn ${only ? 'primary' : ''}`} onClick={() => setOnly(!only)}>확인 대기 {s.notifications.filter((n) => n.kind === 'awaiting' && !n.read).length}</button><button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      {/* ⛔ 높이를 여기서 인라인으로 묶지 않는다 — 폰에서 `.modal-b { flex:1 }` 을 «55vh» 가 이겨
          목록이 화면 중간에서 끊기고 그 아래가 통째로 비었다(2026-09-13 Dave). 상한은 데스크톱 전용 규칙으로. */}
      <div className="modal-b">
        {list.length ? list.map((n) => { const b = botOf(n.botId); return <button key={n.id} className={`nrow ${n.read ? '' : 'unread'}`} onClick={() => onJump(n)}><FolderBot color={b?.color ?? '#e08850'} size={28} mood={n.kind === 'awaiting' ? 'wait' : n.kind === 'done' ? 'done' : n.kind === 'error' ? 'error' : 'idle'} /><div className="t"><div className="l1"><b>{n.title}</b><time>{fmtTime(n.t)}</time></div><div className="l2">{n.body}</div></div></button> }) : <div className="empty">알림이 없어요</div>}
      </div>
      <div className="modal-f"><button className="btn" onClick={readAll}>모두 읽음</button><span className="sp" /><button className="btn" onClick={enablePush}>{pushOn === true ? '폰 푸시 켜짐' : pushOn === false ? '푸시 실패 (HTTPS·홈 화면 설치 필요)' : '이 기기에 푸시 켜기'}</button><button className="btn" onClick={() => api('/push/test', { body: {} })}>푸시 테스트</button></div>
    </div>
  </>
}

/* ── 루틴 시트 ─────────────────────────────────────────────────────────── */
/**
 * 루틴 편집 — `draft` 를 주면 그 루틴을 **맨 끝에 붙이고 바로 고르게** 한다.
 * 🔴 **채팅에서 온 것도 저장은 사람이 누른다** (2026-09-13 Dave: «채팅에서 바로 루틴 생성»).
 *    글에서 읽어낸 주기는 어디까지나 추측이라, 폼을 채워 주는 데서 멈춘다 — 틀려도 손해가 없다.
 */
export function RoutineSheet({ bot, onClose, draft }: { bot: Bot; onClose: () => void; draft?: RoutineDef }) {
  const { refresh } = useStore()
  /** 화면은 **사람 말**(`when`)을 들고 있고, cron 은 저장할 때 한 번 만들어진다 — 사람에게 cron 을 보여 주지 않는다 */
  type Row = RoutineDef & { when: string }
  const toRow = (r: RoutineDef): Row => ({ ...r, when: describeCron(r.cron) })
  const [list, setList] = useState<Row[]>(draft ? [...bot.routines.map(toRow), toRow(draft)] : bot.routines.map(toRow))
  const [i, setI] = useState(draft ? bot.routines.length : 0)
  const [busy, setBusy] = useState(false); const [ran, setRan] = useState('')
  const cur = list[i]
  const upd = (p: Partial<Row>) => setList(list.map((r, k) => (k === i ? { ...r, ...p } : r)))

  /** 🔴 미리보기와 스케줄러가 **같은 파서**를 쓴다 — 갈리면 «미리보기는 맞는데 안 도는» 새 사고가 난다 */
  const read = (w: string) => parseWhen(w)
  const curRead = cur ? read(cur.when) : null
  const bad = list.map((r) => read(r.when)).filter((v) => !v.ok).length

  const payload = () => list.map((r) => { const { when, lastError: _e, nextRun: _n, ...rest } = r; return { ...rest, cron: when } })
  const save = async () => {
    setBusy(true)
    try { await api(`/bots/${bot.id}/routines`, { method: 'PUT', body: { routines: payload() } }); await refresh(); return true }
    finally { setBusy(false) }
  }
  const saveClose = async () => { if (await save()) onClose() }
  /** AA-4 · 「지금 한 번 돌려보기」 — 저장 직후 동작을 사람이 확인할 수 있어야 한다(이번 사고는 그게 없어서 이틀을 몰랐다) */
  const runNow = async (name: string) => {
    setBusy(true)
    try {
      await api(`/bots/${bot.id}/routines`, { method: 'PUT', body: { routines: payload() } })
      const r = await api<{ ran: string; warn?: string | null }>(`/bots/${bot.id}/routines/run`, { method: 'POST', body: { name } })
      await refresh(); setRan(r.warn ? `${name} 을 돌렸어요 — ${r.warn}` : `${name} 을 지금 한 번 돌렸어요 · 채팅에서 결과를 보세요`)
    } catch (e) { setRan(`못 돌렸어요 — ${(e as Error).message}`) } finally { setBusy(false) }
  }

  const PRESETS = ['매일 아침 9시', '매일 저녁 8시', '평일 오전', '매주 월요일']
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="sheet" style={{ ['--sheet-w' as string]: '52%' }}>
      <div className="sheet-h"><span className="tab"><Icon n="clock" size={13} color="var(--accent)" />루틴 · {bot.name}</span><span className="acts"><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={busy || bad > 0} title={bad ? '주기를 못 읽는 줄이 있어요' : ''} onClick={saveClose}>저장</button></span></div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className="rtlist" style={{ width: 240, borderRight: '1px solid var(--border)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
          {list.map((r, k) => {
            const v = read(r.when); const next = v.ok ? nextRunOf(v.cron) : null
            const off = r.enabled === false
            return <div key={k} className={`rtrow ${k === i ? 'on' : ''} ${off ? 'off' : ''}`}>
              <button className="pick" onClick={() => setI(k)}>
                <span className="n">{r.name || '(이름 없음)'}{r.lastError ? <span className="rtwarn" title={r.lastError}><Icon n="warn" size={11} />안 걸림</span> : null}</span>
                {/* 🔴 목록에는 **원시 cron 대신 사람 말과 다음 실행**이 뜬다 — 「20」 이라고만 떠서 사고를 못 봤다 */}
                <span className="sub">{v.ok ? v.text : <span className="err">주기를 못 읽어요</span>}{next && !off ? ` · 다음 ${formatNext(next)}` : off ? ' · 꺼짐' : ''}</span>
              </button>
              <span className="rtacts">
                <button className="ib" title={off ? '켜기' : '끄기'} onClick={() => setList(list.map((x, q) => (q === k ? { ...x, enabled: off } : x)))}><Icon n={off ? 'run' : 'pause'} size={12} /></button>
                <button className="ib" title="지금 한 번 돌려보기" disabled={busy || !r.name} onClick={() => void runNow(r.name)}><Icon n="run" size={12} /></button>
              </span>
            </div>
          })}
          <button className="srow" onClick={() => { setList([...list, { name: '새 루틴', cron: '0 9 * * *', when: '매일 아침 9시', prompt: '', approve: 'always', push: true }]); setI(list.length) }}><Icon n="plus" size={12} />새 루틴</button>
          {cur ? <button className="srow" style={{ color: 'var(--error)', marginTop: 'auto' }} onClick={() => { setList(list.filter((_, k) => k !== i)); setI(0) }}><Icon n="x" size={12} />이 루틴 삭제</button> : null}
        </div>
        <div className="sheet-b" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cur ? <>
            <div className="field"><label>이름</label><input value={cur.name} onChange={(e) => upd({ name: e.target.value })} /></div>
            {/* AA-3 · 언제 — 사람 말로 넣는다. cron 식은 아래 상세에만 작게 */}
            <div className="field"><label>언제</label>
              <input value={cur.when} placeholder="매일 저녁 8시" onChange={(e) => upd({ when: e.target.value })} />
              <div className="rtpre">{PRESETS.map((p) => <button key={p} className="preset sm" onClick={() => upd({ when: p })}>{p}</button>)}</div>
              {curRead?.ok
                ? <small className="rtnext">다음 실행: <b>{formatNext(nextRunOf(curRead.cron))}</b> <span className="mono dim">{curRead.cron}</span></small>
                : curRead && 'ask' in curRead
                  ? <small className="rterr">{curRead.ask.q} <span className="rtpre">{curRead.ask.options.map((o) => <button key={o.cron} className="preset sm" onClick={() => upd({ when: o.text })}>{o.label}</button>)}</span></small>
                  : <small className="rterr">{curRead?.error} · 예: {WHEN_EXAMPLES.slice(0, 3).join(' · ')}</small>}
            </div>
            <div className="field"><label>무엇을</label>
              <textarea rows={5} value={cur.prompt} placeholder="무엇을 확인하고, 변화가 없으면 어떻게 할지까지 적어 주세요" onChange={(e) => upd({ prompt: e.target.value })} />
              <small style={{ color: 'var(--faint)' }}>힌트 — 「어제 이후 바뀐 파일을 훑고 todo.md 에 남은 일을 정리해 줘. 바뀐 게 없으면 «변화 없음» 한 줄만.」</small>
            </div>
            <div className="field"><label>끝나면 폰으로 한 줄 푸시</label><select value={cur.push === false ? 'off' : 'on'} onChange={(e) => upd({ push: e.target.value === 'on' })}><option value="on">켬</option><option value="off">끔</option></select></div>
            {/* 🔴 always 가 bypassPermissions 라는 사실을 모르고 고르면 안 된다 (AA-4) */}
            <div className="field"><label>승인 수준 · 사람이 없을 때</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{([['always', '묻지 않고 바로 한다', '기본값 · 사람이 없어도 끝까지 돈다 (모든 확인을 건너뜀)'], ['folder', '이 폴더 안에서만 쓴다', 'todo.md·노트 갱신까지 스스로'], ['readonly', '계획만 세운다', '파일을 쓰지 않아요']] as const).map(([v, t, sub]) => <button key={v} className={`preset ${(cur.approve ?? 'always') === v ? 'on' : ''}`} style={{ padding: '10px 12px', minWidth: 150 }} onClick={() => upd({ approve: v })}><b style={{ fontSize: 12 }}>{t}</b><small>{sub}</small></button>)}</div></div>
            {cur.lastError ? <div className="rterr" style={{ border: '1px solid var(--error)', borderRadius: 8, padding: '8px 10px' }}><b>이 루틴은 지금 안 걸려 있어요</b><br />{cur.lastError}</div> : null}
            {ran ? <div className="rtnext" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>{ran}</div> : null}
          </> : <div className="empty">루틴이 없어요. 왼쪽에서 추가하세요.</div>}
        </div>
      </div>
      <div className="sheet-f"><span>정본은 <span className="mono">{bot.rel || '.claude/routines.yml'}/.bot.yml</span> — 에디터로 고쳐도 몇 초 안에 따라와요</span><span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>루틴 세션은 봇당 동시 상한(4)에 포함돼요</span></div>
    </div>
  </>
}

export { Settings } from './Settings'

/**
 * 이름 묻기 — `window.prompt()` 대체. Electron 은 prompt() 를 지원하지 않아(«prompt() is and will not be supported»)
 * 데스크톱 앱에서 이름 바꾸기·새 폴더가 아무 반응 없이 끝났다 (2026-09-13 Dave: «원격에서 파일, 폴더 이름 바꾸기가 안돼»).
 * 앱 안 모달 하나로 모든 표면(맥 앱·브라우저·폰)이 같은 경험을 한다. 확장자 앞까지 미리 선택해 이름만 고치게.
 */
let askResolve: ((v: string | null) => void) | null = null
let askSet: ((q: { title: string; initial: string } | null) => void) | null = null
export function askName(title: string, initial = ''): Promise<string | null> {
  return new Promise((res) => { askResolve?.(null); askResolve = res; if (askSet) askSet({ title, initial }); else { askResolve = null; res(window.prompt(title, initial)) } })
}
export function AskHost() {
  const [q, setQ] = useState<{ title: string; initial: string } | null>(null); const [v, setV] = useState('')
  useEffect(() => { askSet = (n) => { setQ(n); setV(n?.initial ?? '') }; return () => { askSet = null } }, [])
  if (!q) return null
  const done = (val: string | null) => { setQ(null); const r = askResolve; askResolve = null; r?.(val) }
  return <>
    <div className="backdrop" onClick={() => done(null)} />
    <div className="modal ask" style={{ width: 'min(420px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{q.title}</b></div></div>
      <div className="modal-b" style={{ padding: '4px 18px 12px' }}><input className="askin" autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') done(v.trim() || null); if (e.key === 'Escape') done(null) }} onFocus={(e) => { const i = e.currentTarget; const dot = i.value.lastIndexOf('.'); i.setSelectionRange(0, dot > 0 ? dot : i.value.length) }} /></div>
      <div className="modal-f"><span className="sp" /><button className="btn" onClick={() => done(null)}>취소 (⎋)</button><button className="btn on" onClick={() => done(v.trim() || null)}>확인 (⏎)</button></div>
    </div>
  </>
}

/**
 * 🔴 **되돌리기 어려운 한 걸음 앞의 확인창** — 지금은 «모델 바꾸기» 가 쓴다 (2026-09-15 Dave 지정 문안).
 *
 * ⚠ `confirm()` 을 안 쓰는 이유는 **Electron 에 없어서가 아니라**(그건 있다) 「다시 묻지 않기」를
 *   달 수 없어서다. 같은 질문을 매번 받는 확인창은 곧 아무도 안 읽는 확인창이 된다.
 * ⚠ 「다시 묻지 않기」는 **이 기기**에 적힌다(localStorage) — 물어볼지 말지는 취향이라 기기마다 다르다.
 */
let confSet: ((c: Conf | null) => void) | null = null
let confResolve: ((v: boolean) => void) | null = null
interface Conf { title: string; body: string; ok: string; remember?: string }
export function askConfirm(c: Conf): Promise<boolean> {
  if (c.remember) { try { if (localStorage.getItem(c.remember) === '0') return Promise.resolve(true) } catch { /* */ } }
  return new Promise((res) => { confResolve?.(false); confResolve = res; if (confSet) confSet(c); else { confResolve = null; res(window.confirm(`${c.title}\n\n${c.body}`)) } })
}
export function ConfirmHost() {
  const [c, setC] = useState<Conf | null>(null); const [skip, setSkip] = useState(false)
  useEffect(() => { confSet = (n) => { setC(n); setSkip(false) }; return () => { confSet = null } }, [])
  if (!c) return null
  const done = (v: boolean) => {
    if (v && skip && c.remember) { try { localStorage.setItem(c.remember, '0') } catch { /* */ } }
    setC(null); const r = confResolve; confResolve = null; r?.(v)
  }
  return <>
    <div className="backdrop" onClick={() => done(false)} />
    <div className="modal conf" style={{ width: 'min(520px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{c.title}</b></div></div>
      <div className="modal-b" style={{ padding: '2px 22px 6px' }}><p className="cbody">{c.body}</p>
        {c.remember ? <label className="cskip"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /><span>다시 묻지 않기</span></label> : null}
      </div>
      <div className="modal-f"><span className="sp" /><button className="btn" onClick={() => done(false)}>취소</button><button className="btn on" autoFocus onClick={() => done(true)}>{c.ok}</button></div>
    </div>
  </>
}

/**
 * 「파일 전후 diff」(루프 6/10) — 봇이 손댄 파일의 «턴 전 ↔ 지금» 을 한 장으로.
 * 🔴 **비교는 여기서 한다**(core/diff) — 호스트는 «전» 글만 준다. 화면이 계산하므로 폰에서도 같은 값이다.
 * ⚠ «전을 모른다»(호스트를 다시 켰다) 는 빈 파일과 다르다 — 말로 하고, 지금 글만 보여 준다.
 * ⚠ askConfirm 과 같은 호스트 모양(`showDiff` + `DiffHost`) — 채팅 줄 어디서든 세션 id·경로만 알면 연다.
 */
interface DiffReq { botId: string; sid: string; abs: string; onOpen?: (abs: string) => void }
let diffSet: ((r: DiffReq | null) => void) | null = null
export function showDiff(r: DiffReq): void { diffSet?.(r) }
export function DiffHost() {
  const [r, setR] = useState<DiffReq | null>(null)
  useEffect(() => { diffSet = setR; return () => { diffSet = null } }, [])
  if (!r) return null
  return <DiffSheet key={`${r.sid}:${r.abs}`} req={r} onClose={() => setR(null)} />
}
function DiffSheet({ req, onClose }: { req: DiffReq; onClose: () => void }) {
  const [d, setD] = useState<{ rel: string; before?: string | null; after?: string | null; known: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [opened, setOpened] = useState<Set<number>>(new Set())
  useEffect(() => {
    api<{ rel: string; before?: string | null; after?: string | null; known: boolean }>(`/bots/${req.botId}/diff?abs=${encodeURIComponent(req.abs)}&s=${encodeURIComponent(req.sid)}`).then(setD).catch((e: Error) => setErr(e.message))
  }, [req.botId, req.sid, req.abs])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [onClose])
  const name = req.abs.split('/').pop() ?? req.abs
  const rows = useMemo(() => (d && d.known && typeof d.after === 'string' ? foldSame(diffLines(d.before ?? '', d.after)) : null), [d])
  const stat = useMemo(() => (d && d.known && typeof d.after === 'string' ? diffStat(diffLines(d.before ?? '', d.after)) : null), [d])
  let body: ReactNode
  if (err) body = <p className="dnote">{err}</p>
  else if (!d) body = <p className="dnote">읽는 중…</p>
  else if (d.after === undefined) body = <p className="dnote">글 파일이 아니라 줄로 비교할 수 없어요.</p>
  else if (!d.known) body = <><p className="dnote">이 세션이 손대기 전의 내용을 갖고 있지 않아요 — 호스트를 다시 켰거나 너무 오래된 턴이에요. 지금 내용만 보여 드려요.</p><pre className="dnow">{d.after ?? '(파일이 없어요)'}</pre></>
  else if (d.after === null) body = <p className="dnote">지금은 파일이 없어요{d.before ? ` — 전에는 ${d.before.split('\n').length}줄이 있었어요.` : '.'}</p>
  else if (stat && !stat.add && !stat.del) body = <p className="dnote">바뀐 줄이 없어요 — 같은 내용을 다시 썼어요.</p>
  else body = <div className="dlines">{rows!.map((r, i) => r.t === '~'
    ? (opened.has(i) ? r.lines.map((s, j) => <div key={`${i}.${j}`} className="ln"><span className="g"> </span>{s || ' '}</div>) : <button key={i} className="fold" onClick={() => setOpened((o) => new Set(o).add(i))}>··· 같은 {r.n}줄 펼치기</button>)
    : <div key={i} className={`ln ${r.t === '+' ? 'add' : r.t === '-' ? 'del' : ''}`}><span className="g">{r.t === '=' ? ' ' : r.t}</span>{r.s || ' '}</div>)}</div>
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="modal dif" style={{ width: 'min(860px,calc(100% - 24px))', height: 'min(720px,calc(100% - 24px))' }}>
      <div className="modal-h"><div className="t"><b>{name}</b><small>{d?.rel ?? ''}{d && !d.known ? '' : d?.before === null ? ' · 새 파일' : ''}</small></div>{stat ? <span className="dstat"><span style={{ color: 'var(--done)' }}>+{stat.add}</span> <span style={{ color: 'var(--err)' }}>−{stat.del}</span></span> : null}<button className="ib" onClick={onClose}><Icon n="x" size={14} /></button></div>
      <div className="modal-b" style={{ flex: 1, padding: '0 0 8px' }}>{body}</div>
      <div className="modal-f"><span style={{ color: 'var(--t3)', fontSize: 12 }}>이 턴이 손대기 전 ↔ 지금 디스크</span><span className="sp" />{req.onOpen ? <button className="btn" onClick={() => { req.onOpen?.(req.abs); onClose() }}>문서 열기</button> : null}<button className="btn on" onClick={onClose}>닫기 (⎋)</button></div>
    </div>
  </>
}

export function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState(''); const t = useRef<number | undefined>(undefined)
  return [msg, (m: string) => { setMsg(m); window.clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(''), 2600) }]
}
