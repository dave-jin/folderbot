import { existsSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { atomicWrite, ensureDir } from './paths'
import { ymd } from '../core/due'
import { maskSensitive } from '../core/contextCard'
import {
  EMPTY_EDITS, LINK_AI_SYSTEM, STEM_AI_SYSTEM, buildLinkMap, countMentions, findNode, labelOf, linkAiPrompt, linkCard, mentionKeys, neighbors,
  parseLinkAi, parseRelayTitle, parseStemNames, renderLinksMd, resolveFolder, searchLinks, stemNamePrompt, ddText, KIND_KO,
  type LinkAi, type LinkEdits, type LinkMap, type LinkNodeIn,
} from '../core/linkMap'

/**
 * 연결 지도 서비스 (LM · 2026-11-04) — 볼트를 훑어 `core/linkMap` 으로 지도를 짓고, 봇 도구·카드·화면에 준다.
 *
 * - **어느 맥이든** 문서 언급·봇 중계는 스스로 계산한다(모델 없이 · 볼트를 읽기만). 15분마다, 파일이 바뀌면 2분 뒤.
 * - 🔒 **모델 호출(같은 사람·장소 후보 · 비슷한 일 · 줄기 이름)은 주인 맥만** — 하루 한 번, 상황판과 같은 하루 상한에 센다.
 *   결과는 볼트 `.folderbot/links/ai.json` 에 둬서 다른 맥도 같은 선을 그린다. 사람·장소는 모델이 고른 이름을
 *   호스트가 그 폴더 파일에서 **다시 센** 것만 선이 된다(파일 수가 근거로 붙는다).
 * - Dave 가 고친 줄기(이름·소속)는 볼트 `.folderbot/links/edit.json` — 어느 맥에서 고쳐도 같은 파일.
 * - 주인 맥은 `links.md`(할일이·사람이 읽는 요약 — «♻ 가져다 쓸 수 있어요»)를 같은 자리에 쓴다.
 * ⛔ 대화 원문은 읽지 않는다 — 폴더 파일 이름·글과 우편함 편지 제목만.
 */
export interface LinksHost {
  readonly root: string
  /** 활성 폴더(봇 후보) — id 는 볼트 상대 경로 */
  folders(): { id: string; name: string; botId?: string; display?: string }[]
  /** 봇 id → 참조 폴더(볼트 상대 경로) */
  refs(): Record<string, string[]>
  /** 우편함의 `from-folderbot` 폴더들(절대 경로) */
  outboxes(): string[]
  owner(): boolean
  /** 상황판과 같은 줄·상한으로 모델을 부른다 */
  model(job: 'links', model: 'haiku' | 'sonnet', prompt: string, system: string): Promise<{ ok: boolean; out: string; blocked?: true }>
  aiOff(): boolean
  hostName(): string
  dataDir(): string
  log(m: string): void
}

const DAY = 86_400_000
const SKIP_DIR = /^(\.|_|node_modules$|images$|todo\.assets$|dist$|out$)/
const TEXT_EXT = new Set(['.md', '.txt'])
const READ_EXT = new Set(['.md', '.txt', '.csv', '.json', '.yml', '.yaml', '.html', '.tsv'])
const RECENT_DIRS = /^(02_작업|03_산출물|04_기록)\//
const ROOT_FILES = /^(readme|state|state-past|todo|claude|agents)\.md$/i
const MAX_TEXT = 300_000
const MAX_FILES_PER_FOLDER = 1500
const MAX_TEXT_FILES = 600

interface FileInfo { rel: string; abs: string; mt: number; size: number }
interface Hit { mt: number; size: number; hits: Record<string, number> }

export class LinkService {
  private map: LinkMap | null = null
  private building: Promise<LinkMap> | null = null
  private dirtyT: ReturnType<typeof setTimeout> | null = null
  private lastBuild = 0
  private textCache = new Map<string, Hit>()
  private keysSig = ''
  private relayCache = new Map<string, { mt: number; rel: ReturnType<typeof parseRelayTitle> | null; title: string }>()
  private aiRunning = false
  private lastStemAsk = 0
  private lastVaultWrite = ''

  constructor(private h: LinksHost) {
    try { const j = JSON.parse(readFileSync(this.cacheFile(), 'utf8')) as LinkMap; if (j && Array.isArray(j.nodes)) this.map = j } catch { /* 처음 */ }
  }

  private dir(): string { return join(this.h.root, '.folderbot', 'links') }
  private cacheFile(): string { return join(this.h.dataDir(), 'links-map.json') }
  private readJ<T>(f: string): T | null { try { return JSON.parse(readFileSync(join(this.dir(), f), 'utf8')) as T } catch { return null } }
  private log(m: string): void { try { this.h.log(m) } catch { /* */ } }

  ai(): LinkAi | null { return this.readJ<LinkAi>('ai.json') }
  edits(): LinkEdits { const e = this.readJ<LinkEdits>('edit.json'); return { names: Array.isArray(e?.names) ? e!.names : [], moves: Array.isArray(e?.moves) ? e!.moves : [] } }

  /** 지금 지도(없으면 null) — 낡았으면 뒤에서 다시 짓는다 */
  get(): LinkMap | null {
    if (!this.map || Date.now() - this.lastBuild > 15 * 60_000) void this.rebuild().catch(() => {})
    return this.map
  }
  status(): { at: number | null; building: boolean; owner: boolean; aiAt: number | null } {
    return { at: this.map?.at ?? null, building: !!this.building, owner: this.safeOwner(), aiAt: this.ai()?.at ?? null }
  }
  private safeOwner(): boolean { try { return this.h.owner() } catch { return false } }

  /** 파일이 바뀌었다 — 2분 모아서 한 번 */
  onFiles(): void {
    if (this.dirtyT) return
    const ms = Number(process.env.FOLDERBOT_LINKS_DEBOUNCE_MS) || 120_000
    this.dirtyT = setTimeout(() => { this.dirtyT = null; void this.rebuild().catch(() => {}) }, ms)
    this.dirtyT.unref?.()
  }

  start(): void {
    const first = Number(process.env.FOLDERBOT_LINKS_FIRST_MS)
    setTimeout(() => void this.rebuild().catch(() => {}), Number.isFinite(first) && first >= 0 ? first : 30_000).unref?.()
    setInterval(() => void this.rebuild().catch(() => {}), 15 * 60_000).unref?.()
  }

  rebuild(): Promise<LinkMap> {
    if (this.building) return this.building
    this.building = this.build().then((m) => { this.map = m; this.lastBuild = Date.now(); try { ensureDir(this.h.dataDir()); atomicWrite(this.cacheFile(), JSON.stringify(m)) } catch { /* */ } this.afterBuild(m); return m })
      .catch((e) => { this.log(`연결 지도 짓기 실패: ${(e as Error).message}`); throw e })
      .finally(() => { this.building = null })
    return this.building
  }

  // ── 짓기 ──────────────────────────────────────────────────────────────────

  private walk(abs: string): FileInfo[] {
    const out: FileInfo[] = []
    const go = (d: string, depth: number) => {
      if (depth > 6 || out.length >= MAX_FILES_PER_FOLDER) return
      let names: string[] = []
      try { names = readdirSync(d) } catch { return }
      for (const n of names) {
        if (SKIP_DIR.test(n) || n === '.DS_Store') continue
        const p = join(d, n)
        let st; try { st = statSync(p) } catch { continue }
        if (st.isDirectory()) go(p, depth + 1)
        else out.push({ rel: relative(abs, p).split(sep).join('/'), abs: p, mt: st.mtimeMs, size: st.size })
        if (out.length >= MAX_FILES_PER_FOLDER) return
      }
    }
    go(abs, 0)
    return out
  }

  private async build(): Promise<LinkMap> {
    const now = Date.now(), today = ymd(new Date(now))
    const folders = this.h.folders()
    const files = new Map<string, FileInfo[]>()
    for (const f of folders) { files.set(f.id, this.walk(join(this.h.root, f.id))); await tick() }
    const base: LinkNodeIn[] = folders.map((f) => {
      const fs = files.get(f.id) ?? []
      const act = fs.filter((x) => now - x.mt < 7 * DAY && !ROOT_FILES.test(x.rel)).length
      const recent = fs.filter((x) => (RECENT_DIRS.test(x.rel) || (!x.rel.includes('/') && /\.md$/i.test(x.rel) && !ROOT_FILES.test(x.rel))) && !/\.(png|jpe?g|gif|webp|heic|mov|mp4|zip)$/i.test(x.rel))
        .sort((a, b) => b.mt - a.mt).slice(0, 5).map((x) => x.rel)
      return { id: f.id, name: f.name, ...(f.botId ? { botId: f.botId } : {}), ...(f.display ? { display: f.display } : {}), act, recent }
    })
    // 문서 언급
    const keys = mentionKeys(base.map((n) => ({ id: n.id, name: n.name, label: labelOf(n.name, n.display) })))
    const sig = JSON.stringify([...keys.entries()])
    if (sig !== this.keysSig) { this.textCache.clear(); this.keysSig = sig }
    const mentions: { a: string; b: string; count: number; files: string[] }[] = []
    let n = 0
    for (const f of folders) {
      const per = new Map<string, { c: number; files: { rel: string; c: number }[] }>()
      const texts = (files.get(f.id) ?? []).filter((x) => TEXT_EXT.has(extname(x.rel).toLowerCase()) && x.size <= MAX_TEXT).sort((a, b) => b.mt - a.mt).slice(0, MAX_TEXT_FILES)
      for (const x of texts) {
        let hit = this.textCache.get(x.abs)
        if (!hit || hit.mt !== x.mt || hit.size !== x.size) {
          let t = ''; try { t = readFileSync(x.abs, 'utf8') } catch { continue }
          hit = { mt: x.mt, size: x.size, hits: Object.fromEntries(countMentions(t, keys, f.id)) }
          this.textCache.set(x.abs, hit)
          if (++n % 40 === 0) await tick()
        }
        for (const [b, c] of Object.entries(hit.hits)) { const cur = per.get(b) ?? { c: 0, files: [] }; cur.c += c; cur.files.push({ rel: x.rel, c }); per.set(b, cur) }
      }
      for (const [b, v] of per) mentions.push({ a: f.id, b, count: v.c, files: v.files.sort((p, q) => q.c - p.c).map((z) => z.rel).slice(0, 4) })
    }
    // 봇 중계
    const relays = this.relays(base)
    const ai = this.ai()
    const map = buildLinkMap({ nodes: base, mentions, relays, ai, edits: this.edits(), refs: this.h.refs(), today, now })
    // 주인 맥 — 모델 추측이 하루 지났으면 뒤에서 새로(이번 판은 지난 추측으로)
    if (this.safeOwner() && !this.h.aiOff() && (!ai || now - ai.at > DAY) && !this.aiRunning) void this.refreshAi(base, files).catch((e) => this.log(`연결 지도 · 모델 추측 실패: ${(e as Error).message}`))
    else if (this.safeOwner() && !this.h.aiOff() && ai && !this.aiRunning && map.stems.some((s) => s.named === 'auto') && now - this.lastStemAsk > 6 * 3600_000) void this.nameStems(map).catch(() => {})
    return map
  }

  private relays(nodes: LinkNodeIn[]): { a: string; b: string; count: number; ev: string[] }[] {
    const ns = nodes.map((n) => ({ id: n.id, name: n.name, label: labelOf(n.name, n.display), display: n.display }))
    const acc = new Map<string, { a: string; b: string; count: number; ev: string[] }>()
    for (const dir of this.h.outboxes()) {
      for (const f of listLetters(dir)) {
        let st; try { st = statSync(f) } catch { continue }
        let c = this.relayCache.get(f)
        if (!c || c.mt !== st.mtimeMs) { const title = titleOf(f); c = { mt: st.mtimeMs, title, rel: title ? parseRelayTitle(title) : null }; this.relayCache.set(f, c) }
        if (!c.rel) continue
        const a = resolveFolder(c.rel.from, ns)
        if (!a) continue
        const evText = c.title.replace(/^\s*["']?중계\s*·\s*/, '').replace(/["']\s*$/, '')
        for (const t of c.rel.to) {
          const b = resolveFolder(t, ns)
          if (!b || b === a) continue
          const k = `${a}\u0000${b}`
          const cur = acc.get(k) ?? { a, b, count: 0, ev: [] }
          cur.count++; if (cur.ev.length < 4) cur.ev.push(evText.slice(0, 80))
          acc.set(k, cur)
        }
      }
    }
    return [...acc.values()]
  }

  /** 모델 추측 — 폴더 요약으로 사람·장소 후보와 비슷한 일을 묻고, 사람·장소는 그 폴더 파일에서 센다 */
  private async refreshAi(base: LinkNodeIn[], files: Map<string, FileInfo[]>): Promise<void> {
    this.aiRunning = true
    this.lastStemAsk = Date.now()   // 이 안에서 줄기 이름도 받는다 — 짓기 쪽이 따로 또 묻지 않게
    try {
      const digest = base.map((n) => ({ label: labelOf(n.name, n.display), text: digestOf(join(this.h.root, n.id), files.get(n.id) ?? []) }))
      const r = await this.h.model('links', 'sonnet', linkAiPrompt(digest), LINK_AI_SYSTEM)
      if (!r.ok) { if (!r.blocked) this.log('연결 지도 · 모델 추측 답이 비었어요'); return }
      const got = parseLinkAi(r.out)
      if (!got) { this.log('연결 지도 · 모델 추측 답을 못 읽었어요'); return }
      const ns = base.map((n) => ({ id: n.id, name: n.name, label: labelOf(n.name, n.display), display: n.display }))
      const entities: LinkAi['entities'] = []
      for (const p of got.people) {
        const ids = [...new Set(p.folders.map((x) => resolveFolder(x, ns)).filter((x): x is string => !!x))]
        if (ids.length < 2) continue
        const cnt: Record<string, number> = {}
        for (const id of ids) cnt[id] = countFilesWith(files.get(id) ?? [], p.name)
        if (Object.values(cnt).filter((v) => v > 0).length >= 2) entities.push({ name: p.name, folders: ids, files: cnt })
        await tick()
      }
      const similar = got.similar.flatMap((s) => { const a = resolveFolder(s.a, ns), b = resolveFolder(s.b, ns); return a && b && a !== b ? [{ ...s, a, b }] : [] })
      const prev = this.ai()
      const ai: LinkAi = { at: Date.now(), entities, similar, stemNames: prev?.stemNames ?? [] }
      ensureDir(this.dir()); atomicWrite(join(this.dir(), 'ai.json'), JSON.stringify(ai, null, 1))
      this.log(`연결 지도 · 모델 추측: 같은 사람·장소 ${entities.length} · 비슷한 일 ${similar.length}`)
      const m = await this.rebuildSoon()
      if (m) await this.nameStems(m)
    } finally { this.aiRunning = false }
  }

  private async rebuildSoon(): Promise<LinkMap | null> { try { if (this.building) await this.building; return await this.rebuild() } catch { return null } }

  /** 이름이 없는(자동 이름) 줄기에만 이름을 받는다 */
  private async nameStems(m: LinkMap): Promise<void> {
    this.lastStemAsk = Date.now()
    const todo = m.stems.filter((s) => s.named === 'auto')
    if (!todo.length) return
    const byId = new Map(m.nodes.map((n) => [n.id, n]))
    const r = await this.h.model('links', 'haiku', stemNamePrompt(todo.map((s) => ({ members: s.members.map((id) => byId.get(id)?.label ?? id) }))), STEM_AI_SYSTEM)
    if (!r.ok) return
    const names = parseStemNames(r.out, todo.length)
    if (!names.length) return
    const ai = this.ai() ?? { at: Date.now(), entities: [], similar: [], stemNames: [] }
    for (const x of names) { const s = todo[x.i]; ai.stemNames = [...ai.stemNames.filter((o) => jac(o.members, s.members) < 0.5), { members: s.members, name: x.name, ...(x.line ? { line: x.line } : {}) }] }
    ensureDir(this.dir()); atomicWrite(join(this.dir(), 'ai.json'), JSON.stringify(ai, null, 1))
    await this.rebuildSoon()
  }

  private afterBuild(m: LinkMap): void {
    if (!this.safeOwner()) return
    const sig = JSON.stringify([m.stems.map((s) => [s.name, s.members]), m.reuse, m.bridges, m.counts])
    if (sig === this.lastVaultWrite) return
    this.lastVaultWrite = sig
    try { ensureDir(this.dir()); atomicWrite(join(this.dir(), 'links.md'), renderLinksMd(m, this.h.hostName())) } catch (e) { this.log(`links.md 쓰기 실패: ${(e as Error).message}`) }
  }

  // ── 고치기(Dave) ──────────────────────────────────────────────────────────

  private saveEdits(e: LinkEdits): void { ensureDir(this.dir()); atomicWrite(join(this.dir(), 'edit.json'), JSON.stringify(e, null, 1)) }
  async rename(key: string, name: string): Promise<LinkMap> {
    const m = this.map ?? await this.rebuild()
    const s = m.stems.find((x) => x.key === key); if (!s) throw new Error('그 줄기를 못 찾았어요 — 지도를 다시 열어 주세요')
    const nm = name.trim().slice(0, 24); if (!nm) throw new Error('이름이 비었어요')
    const e = this.edits()
    e.names = [...e.names.filter((x) => jac(x.members, s.members) < 0.5), { members: s.members, name: nm }]
    this.saveEdits(e)
    return this.rebuild()
  }
  /** 폴더를 다른 줄기로 — to 는 줄기 key(그 줄기의 닻 폴더) · null 이면 줄기 밖 · 'auto' 면 계산대로 */
  async move(folder: string, to: string | null | 'auto'): Promise<LinkMap> {
    const m = this.map ?? await this.rebuild()
    if (!m.nodes.some((n) => n.id === folder)) throw new Error('지도에 없는 폴더예요')
    if (to && to !== 'auto' && !m.stems.some((s) => s.key === to)) throw new Error('그 줄기를 못 찾았어요')
    const e = this.edits()
    e.moves = e.moves.filter((x) => x.folder !== folder)
    if (to !== 'auto') e.moves.push({ folder, with: to })
    this.saveEdits(e)
    return this.rebuild()
  }
  async resetEdits(): Promise<LinkMap> { this.saveEdits(EMPTY_EDITS); return this.rebuild() }

  // ── 봇 쪽 ─────────────────────────────────────────────────────────────────

  /** 세션 시작 카드 — 지도가 아직 없으면 빈 글 */
  card(folderId: string): string { const m = this.map; return m ? linkCard(m, folderId) : '' }

  private async need(): Promise<LinkMap> { return this.map ?? await this.rebuild() }

  async toolGet(callerFolder: string | null, q: string): Promise<unknown> {
    const m = await this.need()
    const me = q ? findNode(m, q) : callerFolder ? m.nodes.find((n) => n.id === callerFolder) ?? null : null
    if (!me) throw new Error(q ? `«${q}» 폴더를 지도에서 못 찾았어요 — links_search 로 찾아보세요` : '폴더를 적어 주세요')
    const byId = new Map(m.nodes.map((n) => [n.id, n]))
    const st = me.stem !== undefined ? m.stems[me.stem] : null
    return {
      folder: me.id, label: me.label, due: ddText(me, m.today), stem: st ? { name: st.name, line: st.line ?? null, members: st.members.map((id) => byId.get(id)?.label ?? id) } : null,
      hub: !!me.hub,
      reuse: m.reuse.filter((r) => r.to === me.id).map((r) => ({ from: r.from, what: r.what, files: r.files, guess: !r.fact })),
      linked: neighbors(m, me.id).slice(0, 12).map((x) => { const n = byId.get(x.id)!; return { folder: x.id, label: x.label, due: ddText(n, m.today), kind: KIND_KO[x.t], evidence: x.ev, guess: !!x.guess, also: x.kinds.filter((k) => k !== x.t).map((k) => KIND_KO[k]), files: (n.recent ?? []).slice(0, 3) } }),
      note: '다른 폴더는 읽기만 — links_read(folder, path). 쓰거나 그 봇에게 시킬 일은 orch_ask.',
    }
  }
  async toolSearch(q: string): Promise<unknown> {
    const m = await this.need()
    const r = searchLinks(m, q)
    return { folders: r.nodes, links: r.edges.slice(0, 12).map((e) => ({ a: e.a, b: e.b, kind: KIND_KO[e.t], evidence: e.ev, guess: !!e.guess })) }
  }
  /** 다른 폴더 파일 읽기(읽기만) — path 를 비우면 최근 파일 목록 */
  async toolRead(folder: string, path: string): Promise<unknown> {
    const m = await this.need()
    const n = findNode(m, folder); if (!n) throw new Error(`«${folder}» 폴더를 지도에서 못 찾았어요`)
    const base = resolve(this.h.root, n.id)
    if (!path) return { folder: n.id, files: this.walk(base).sort((a, b) => b.mt - a.mt).slice(0, 40).map((x) => ({ path: x.rel, modified: new Date(x.mt).toISOString().slice(0, 16) })) }
    const abs = resolve(base, path.replace(/^\/+/, ''))
    if (abs !== base && !abs.startsWith(base + sep)) throw new Error('그 폴더 밖 경로예요')
    if (!existsSync(abs)) throw new Error(`없는 파일: ${path}`)
    if (!READ_EXT.has(extname(abs).toLowerCase())) throw new Error('글 파일(md·txt·csv·json·yml·html)만 읽어요 — 다른 파일은 경로만 알려 주세요')
    const st = statSync(abs); if (st.size > 400_000) throw new Error('너무 큰 파일이에요(400KB 넘음)')
    const t = readFileSync(abs, 'utf8')
    return { folder: n.id, path: relative(base, abs), text: maskSensitive(t.length > 60_000 ? `${t.slice(0, 60_000)}\n…(뒤는 잘림)` : t) }
  }
}

const tick = () => new Promise<void>((r) => setImmediate(r))
const jac = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1) }

/** from-folderbot 아래 편지 파일(달 폴더 포함) */
function listLetters(dir: string): string[] {
  const out: string[] = []
  let names: string[] = []
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    if (n.startsWith('.')) continue
    const p = join(dir, n)
    if (/^\d{4}-\d{2}$/.test(n)) { try { for (const m of readdirSync(p)) if (m.endsWith('.md') && !m.startsWith('.')) out.push(join(p, m)) } catch { /* */ } }
    else if (n.endsWith('.md')) out.push(p)
  }
  return out
}
/** 편지 머리말의 title — 앞 2KB 만 읽는다 */
function titleOf(f: string): string {
  try {
    const fd = openSync(f, 'r'); const buf = Buffer.alloc(2048); const n = readSync(fd, buf, 0, 2048, 0); closeSync(fd)
    const m = /^title:\s*(.+)$/m.exec(buf.subarray(0, n).toString('utf8'))
    return m ? m[1].trim() : ''
  } catch { return '' }
}
/** 모델에 줄 폴더 요약 — state.md 목표 줄 · readme 앞부분 · 최근 파일 이름 */
function digestOf(abs: string, fs: FileInfo[]): string {
  const read = (f: string, n: number) => { try { return readFileSync(join(abs, f), 'utf8').slice(0, n) } catch { return '' } }
  const goal = /현재 목표:\s*(.+)/.exec(read('state.md', 3000))?.[1]?.trim() ?? ''
  const rd = read('readme.md', 2500).replace(/^---[\s\S]*?---/, '').replace(/[#>*`|\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 450)
  const names = fs.filter((x) => !ROOT_FILES.test(x.rel) && !/\.(png|jpe?g|gif|webp|heic)$/i.test(x.rel)).sort((a, b) => b.mt - a.mt).slice(0, 8).map((x) => x.rel.split('/').pop()).join(', ')
  return maskSensitive([goal && `목표: ${goal.slice(0, 160)}`, rd && `readme: ${rd}`, names && `최근 파일: ${names}`].filter(Boolean).join('\n'))
}
/** 이름이 든 글 파일 수 — 사람·장소 선의 근거 */
function countFilesWith(fs: FileInfo[], name: string): number {
  let c = 0
  const t = name.normalize('NFC')
  for (const x of fs) {
    if (!TEXT_EXT.has(extname(x.rel).toLowerCase()) || x.size > MAX_TEXT) continue
    try { if (readFileSync(x.abs, 'utf8').normalize('NFC').includes(t)) c++ } catch { /* */ }
    if (c >= 99) break
  }
  return c
}
