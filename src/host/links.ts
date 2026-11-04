import { existsSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { atomicWrite, ensureDir } from './paths'
import { ymd } from '../core/due'
import { maskSensitive } from '../core/contextCard'
import {
  EMPTY_EDITS, LINK_AI_SYSTEM, PLACE_AI_SYSTEM, RESHAPE_OPS, STEM_AI_SYSTEM, applyStemOp, buildLinkMap, countMentions, findNode, labelOf, linkAiPrompt, linkCard, mentionKeys, neighbors,
  parseLinkAi, parsePlace, parseRelayTitle, parseStemNames, pastFor, placePrompt, renderLinksMd, resolveFolder, searchLinks, stemNamePrompt, ddText, KIND_KO,
  type LinkAi, type LinkEdits, type LinkMap, type LinkNodeIn, type StemOp,
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
 * - 🔴 보관 폴더(archive 역할 · `4. Archive/*` 와 연도 묶음 `_이전연도/2025/*`)도 지도에 든다(11/4 Dave «아카이브와도 연결 — 정말 중요»).
 *   가볍게 훑고(파일·글 수 상한이 작다) 줄기·다리 계산에는 안 넣는다 — 줄기에 «지난 일» 로 붙고, 봇 카드·links_* 가 읽는다.
 * - 🔴 줄기 관리(11/4) — Dave 가 고치면 edit.json 의 목록이 줄기가 되고, 나머지 폴더는 주인 맥 모델이 그 목록에 맞춰 넣는다(ai.json place).
 * ⛔ 대화 원문은 읽지 않는다 — 폴더 파일 이름·글과 우편함 편지 제목만.
 */
export interface LinksHost {
  readonly root: string
  /** 활성 폴더(봇 후보) — id 는 볼트 상대 경로 */
  folders(): { id: string; name: string; botId?: string; display?: string }[]
  /** 보관(archive 역할) 폴더 — 볼트 상대 경로(`4. Archive`) */
  archiveRoots?(): string[]
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
/** 보관 폴더는 가볍게 — 끝난 일이라 글이 안 바뀌지만 아흔 개를 15분마다 훑는다 */
const PAST_MAX_FILES = 400
const PAST_TEXT_FILES = 60
const DOC_EXT = /\.(md|pdf|pptx?|key|docx?|hwpx?|html|xlsx?|csv|txt)$/i

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
  private lastFiles = new Map<string, FileInfo[]>()
  private lastStemAsk = 0
  private lastVaultWrite = ''
  private placing = false
  private lastPlaceAsk = 0
  private placeT: ReturnType<typeof setTimeout> | null = null

  constructor(private h: LinksHost) {
    try { const j = JSON.parse(readFileSync(this.cacheFile(), 'utf8')) as LinkMap; if (j && Array.isArray(j.nodes)) this.map = j } catch { /* 처음 */ }
  }

  private dir(): string { return join(this.h.root, '.folderbot', 'links') }
  private cacheFile(): string { return join(this.h.dataDir(), 'links-map.json') }
  private readJ<T>(f: string): T | null { try { return JSON.parse(readFileSync(join(this.dir(), f), 'utf8')) as T } catch { return null } }
  private log(m: string): void { try { this.h.log(m) } catch { /* */ } }

  ai(): LinkAi | null { return this.readJ<LinkAi>('ai.json') }
  edits(): LinkEdits {
    const e = this.readJ<LinkEdits>('edit.json')
    const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? x as T[] : [])
    const stems = arr<NonNullable<LinkEdits['stems']>[number]>(e?.stems).filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.members))
    return { names: arr(e?.names), moves: arr(e?.moves), ...(stems.length ? { stems } : {}), out: arr<string>(e?.out).filter((x) => typeof x === 'string'), dropped: arr<string>(e?.dropped).filter((x) => typeof x === 'string') }
  }
  /** 보관 폴더 — archive 역할 폴더 바로 아래(`_`·`.` 로 시작하는 것 빼고) + 연도 묶음(`_이전연도/2025/*` 처럼 아래가 모두 네 자리 해인 `_` 폴더) */
  private archived(): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = []
    const dirs = (abs: string) => { try { return readdirSync(abs).filter((n) => !n.startsWith('.') && (() => { try { return statSync(join(abs, n)).isDirectory() } catch { return false } })()) } catch { return [] as string[] } }
    for (const r of this.h.archiveRoots?.() ?? []) {
      const rootAbs = join(this.h.root, r)
      for (const n of dirs(rootAbs)) {
        if (!n.startsWith('_')) { out.push({ id: `${r}/${n}`, name: n }); continue }
        const years = dirs(join(rootAbs, n))
        if (!years.length || !years.every((y) => /^\d{4}$/.test(y))) continue
        for (const y of years) for (const m of dirs(join(rootAbs, n, y))) if (!m.startsWith('_')) out.push({ id: `${r}/${n}/${y}/${m}`, name: m })
      }
    }
    return out
  }

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

  private walk(abs: string, max = MAX_FILES_PER_FOLDER): FileInfo[] {
    const out: FileInfo[] = []
    const go = (d: string, depth: number) => {
      if (depth > 6 || out.length >= max) return
      let names: string[] = []
      try { names = readdirSync(d) } catch { return }
      for (const n of names) {
        if (SKIP_DIR.test(n) || n === '.DS_Store') continue
        const p = join(d, n)
        let st; try { st = statSync(p) } catch { continue }
        if (st.isDirectory()) go(p, depth + 1)
        else out.push({ rel: relative(abs, p).split(sep).join('/'), abs: p, mt: st.mtimeMs, size: st.size })
        if (out.length >= max) return
      }
    }
    go(abs, 0)
    return out
  }

  private async build(): Promise<LinkMap> {
    const now = Date.now(), today = ymd(new Date(now))
    const live = this.h.folders()
    const liveIds = new Set(live.map((f) => f.id))
    const pastF = this.archived().filter((f) => !liveIds.has(f.id))
    const pastIds = new Set(pastF.map((f) => f.id))
    const folders: { id: string; name: string; botId?: string; display?: string }[] = [...live, ...pastF]
    const files = new Map<string, FileInfo[]>()
    for (const f of folders) { files.set(f.id, this.walk(join(this.h.root, f.id), pastIds.has(f.id) ? PAST_MAX_FILES : MAX_FILES_PER_FOLDER)); await tick() }
    const base: LinkNodeIn[] = folders.map((f) => {
      const fs = files.get(f.id) ?? []
      const past = pastIds.has(f.id)
      const act = past ? 0 : fs.filter((x) => now - x.mt < 7 * DAY && !ROOT_FILES.test(x.rel)).length
      // 지난 일은 폴더 뼈대가 없던 때 것도 많다 — 문서 꼴이면 어디 있든 후보(최근 순)
      const recent = (past ? fs.filter((x) => DOC_EXT.test(x.rel) && !ROOT_FILES.test(x.rel.split('/').pop() ?? ''))
        : fs.filter((x) => (RECENT_DIRS.test(x.rel) || (!x.rel.includes('/') && /\.md$/i.test(x.rel) && !ROOT_FILES.test(x.rel))) && !/\.(png|jpe?g|gif|webp|heic|mov|mp4|zip)$/i.test(x.rel)))
        .sort((a, b) => b.mt - a.mt).slice(0, 5).map((x) => x.rel)
      return { id: f.id, name: f.name, ...(f.botId ? { botId: f.botId } : {}), ...(f.display ? { display: f.display } : {}), act, recent, ...(past ? { past: true } : {}) }
    })
    // 문서 언급
    const keys = mentionKeys(base.map((n) => ({ id: n.id, name: n.name, label: labelOf(n.name, n.display) })))
    const sig = JSON.stringify([...keys.entries()])
    if (sig !== this.keysSig) { this.textCache.clear(); this.keysSig = sig }
    const mentions: { a: string; b: string; count: number; files: string[] }[] = []
    let n = 0
    for (const f of folders) {
      const per = new Map<string, { c: number; files: { rel: string; c: number }[] }>()
      const texts = (files.get(f.id) ?? []).filter((x) => TEXT_EXT.has(extname(x.rel).toLowerCase()) && x.size <= MAX_TEXT).sort((a, b) => b.mt - a.mt).slice(0, pastIds.has(f.id) ? PAST_TEXT_FILES : MAX_TEXT_FILES)
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
    // 줄기에 안 든 폴더(새 폴더 · 새로 보관된 폴더 · Dave 가 지운 줄기의 폴더)는 모델이 Dave 의 줄기 목록에 맞춰 넣는다 — 20분에 한 번까지
    else if (this.safeOwner() && !this.h.aiOff() && ai && !this.aiRunning && !this.placing && map.undecided.length && now - this.lastPlaceAsk > 20 * 60_000) void this.place(map, files).catch((e) => this.log(`연결 지도 · 줄기 넣기 실패: ${(e as Error).message}`))
    this.lastFiles = files
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
      // 보관 폴더는 짧게(이름표에 «(보관)» · readme 앞 200자 · 파일 다섯) — 지금 일과 이어지는 비슷한 일을 찾으려는 것이다
      const digest = base.map((n) => ({ label: `${labelOf(n.name, n.display)}${n.past ? ' (보관)' : ''}`, text: digestOf(join(this.h.root, n.id), files.get(n.id) ?? [], !!n.past) }))
      const r = await this.h.model('links', 'sonnet', linkAiPrompt(digest), LINK_AI_SYSTEM)
      if (!r.ok) { if (!r.blocked) this.log('연결 지도 · 모델 추측 답이 비었어요'); return }
      const got = parseLinkAi(r.out)
      if (!got) { this.log('연결 지도 · 모델 추측 답을 못 읽었어요'); return }
      const ns = base.map((n) => ({ id: n.id, name: n.name, label: labelOf(n.name, n.display), display: n.display }))
      const unPast = (s: string) => s.replace(/\s*\(보관\)\s*$/, '')
      for (const p of got.people) p.folders = p.folders.map(unPast)
      for (const s of got.similar) { s.a = unPast(s.a); s.b = unPast(s.b) }
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
      // 줄기 넣기 판단은 남기고, «맞는 줄기 없음» 은 하루 한 번 비운다(그새 줄기가 생겼을 수 있다)
      const ai: LinkAi = { at: Date.now(), entities, similar, stemNames: prev?.stemNames ?? [], place: prev?.place ?? [], placeNone: [], proposals: prev?.proposals ?? [] }
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
    const ai: LinkAi = this.ai() ?? { at: Date.now(), entities: [], similar: [], stemNames: [] }
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
  private saveAi(ai: LinkAi): void { ensureDir(this.dir()); atomicWrite(join(this.dir(), 'ai.json'), JSON.stringify(ai, null, 1)) }

  /**
   * 🔴 줄기 관리 한 번 — edit.json 에 적고 다시 짓는다. 어느 맥에서 해도 같은 볼트 파일이다.
   * 줄기 모양을 바꾸면(만들기·합치기·지우기·제안 받기) 봇 판단을 비워 처음부터 다시 받는다 — 1분 모았다가 한 번(연달아 고쳐도 한 번만 묻는다).
   * «봇에게 맡기기» 는 그 폴더의 판단만 비운다.
   */
  async op(op: StemOp): Promise<LinkMap> {
    const m = this.map ?? await this.rebuild()
    const next = applyStemOp(m, this.edits(), op)
    this.saveEdits(next)
    const ai = this.ai()
    if (ai) {
      if (op.op === 'auto') { ai.place = (ai.place ?? []).filter((x) => x.folder !== op.folder); ai.placeNone = (ai.placeNone ?? []).filter((x) => x !== op.folder); this.saveAi(ai) }
      else if (RESHAPE_OPS.has(op.op)) {
        ai.place = []; ai.placeNone = []
        if (op.op === 'accept') ai.proposals = (ai.proposals ?? []).filter((p) => p.id !== op.proposal)
        this.saveAi(ai)
      }
      if (op.op === 'auto' || RESHAPE_OPS.has(op.op)) this.placeSoon()
    }
    return this.rebuild()
  }
  /** 옛 길(화면 r210) — 이름 바꾸기 · 옮기기 · 되돌리기 */
  rename(key: string, name: string): Promise<LinkMap> { return this.op({ op: 'rename', stem: key, name }) }
  move(folder: string, to: string | null | 'auto'): Promise<LinkMap> { return this.op(to === null ? { op: 'out', folder } : to === 'auto' ? { op: 'auto', folder } : { op: 'add', stem: to, folder }) }
  resetEdits(): Promise<LinkMap> { return this.op({ op: 'reset' }) }

  private placeSoon(): void {
    if (this.placeT) clearTimeout(this.placeT)
    const ms = Number(process.env.FOLDERBOT_LINKS_PLACE_MS) || 60_000
    this.placeT = setTimeout(() => { this.placeT = null; this.lastPlaceAsk = 0; void this.rebuildSoon() }, ms)
    this.placeT.unref?.()
  }

  /**
   * 봇이 줄기에 넣기 — 아직 판단 안 한 폴더를 Dave 의 줄기 목록(이름 · 한 줄 · 든 폴더 예시)에 맞춰 모델에게 묻는다.
   * 한 번에 60개까지, 남으면 이어서 두 번 더. 답에 없는 폴더는 «맞는 줄기 없음» 으로 적는다(같은 것을 다시 묻지 않게).
   */
  private async place(m0: LinkMap, files: Map<string, FileInfo[]>): Promise<void> {
    this.placing = true; this.lastPlaceAsk = Date.now()
    try {
      let m = m0
      for (let round = 0; round < 3 && m.undecided.length && m.stems.length; round++) {
        const byId = new Map(m.nodes.map((n) => [n.id, n]))
        const batch = m.undecided.slice(0, 60).map((id) => byId.get(id)!).filter(Boolean)
        // 이름표가 겹치면 폴더 이름으로 — 답을 폴더로 되돌릴 때 헷갈리지 않게
        const cnt = new Map<string, number>(); for (const n of m.nodes) cnt.set(n.label, (cnt.get(n.label) ?? 0) + 1)
        const tag = (n: { label: string; name: string }) => (cnt.get(n.label)! > 1 ? n.name : n.label)
        const stems = m.stems.map((s) => ({ name: s.name, ...(s.line ? { line: s.line } : {}), examples: [...s.members.filter((id) => !s.bot.includes(id)), ...s.past.filter((id) => !s.bot.includes(id))].slice(0, 10).map((id) => tag(byId.get(id)!)) }))
        const folders = batch.map((n) => ({ label: tag(n), past: !!n.past, text: digestOf(join(this.h.root, n.id), files.get(n.id) ?? [], true) }))
        const r = await this.h.model('links', 'sonnet', placePrompt(stems, folders), PLACE_AI_SYSTEM)
        if (!r.ok) { if (!r.blocked) this.log('연결 지도 · 줄기 넣기 답이 비었어요'); return }
        const got = parsePlace(r.out)
        if (!got) { this.log('연결 지도 · 줄기 넣기 답을 못 읽었어요'); return }
        const byTag = new Map(batch.map((n) => [tag(n), n.id]))
        const ns = batch.map((n) => ({ id: n.id, name: n.name, label: n.label }))
        const idOf = (s: string) => byTag.get(s) ?? byTag.get(s.replace(/\s*\(보관\)\s*$/, '')) ?? resolveFolder(s, ns)
        const ai: LinkAi = this.ai() ?? { at: 0, entities: [], similar: [], stemNames: [] }
        const place = (ai.place ?? []).filter((x) => !batch.some((n) => n.id === x.folder))
        const none = new Set((ai.placeNone ?? []).filter((x) => !batch.some((n) => n.id === x)))
        const done = new Set<string>()
        for (const p of got.place) {
          const id = idOf(p.folder); if (!id || done.has(id)) continue
          const st = p.stem ? m.stems.find((s) => s.name === p.stem) ?? m.stems.find((s) => s.name.replace(/\s/g, '') === p.stem.replace(/\s/g, '')) : undefined
          done.add(id)
          if (st) place.push({ folder: id, stem: st.key, name: st.name, why: p.why || '봇 판단', at: Date.now() })
          else none.add(id)
        }
        for (const n of batch) if (!done.has(n.id)) none.add(n.id)
        const props = [...(ai.proposals ?? [])]
        for (const f of got.fresh) {
          const ids = [...new Set(f.folders.map(idOf).filter((x): x is string => !!x))]
          if (ids.length < 2 || props.some((p) => p.name === f.name)) continue
          props.push({ id: `p-${Date.now().toString(36)}-${props.length}`, name: f.name, ...(f.line ? { line: f.line } : {}), folders: ids, why: `맞는 줄기가 없는 폴더 ${ids.length}개` })
        }
        ai.place = place; ai.placeNone = [...none]; ai.proposals = props.slice(-8)
        this.saveAi(ai)
        this.log(`연결 지도 · 봇이 줄기에 넣음 ${got.place.filter((p) => p.stem).length} · 맞는 줄기 없음 ${batch.length - got.place.filter((p) => p.stem).length} · 새 줄기 제안 ${got.fresh.length}`)
        m = (await this.rebuildSoon()) ?? m
      }
    } finally { this.placing = false }
  }

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
      folder: me.id, label: me.label, due: ddText(me, m.today), archived: !!me.past, stem: st ? { name: st.name, line: st.line ?? null, members: st.members.map((id) => byId.get(id)?.label ?? id), past: st.past.length } : null,
      hub: !!me.hub,
      past: me.past ? [] : pastFor(m, me.id, 6).map((p) => ({ folder: p.id, label: p.label, ended: p.dd, why: p.why, guess: !!p.guess, files: p.files })),
      reuse: m.reuse.filter((r) => r.to === me.id).map((r) => ({ from: r.from, what: r.what, files: r.files, guess: !r.fact })),
      linked: neighbors(m, me.id).filter((x) => !byId.get(x.id)?.past).slice(0, 12).map((x) => { const n = byId.get(x.id)!; return { folder: x.id, label: x.label, due: ddText(n, m.today), kind: KIND_KO[x.t], evidence: x.ev, guess: !!x.guess, also: x.kinds.filter((k) => k !== x.t).map((k) => KIND_KO[k]), files: (n.recent ?? []).slice(0, 3) } }),
      note: '다른 폴더는 읽기만 — links_read(folder, path). past 는 보관 폴더(끝난 일)라 가져다 쓰기만 한다. 쓰거나 그 봇에게 시킬 일은 orch_ask.',
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
function digestOf(abs: string, fs: FileInfo[], short = false): string {
  const read = (f: string, n: number) => { try { return readFileSync(join(abs, f), 'utf8').slice(0, n) } catch { return '' } }
  const goal = /현재 목표:\s*(.+)/.exec(read('state.md', 3000))?.[1]?.trim() ?? ''
  const rd = read('readme.md', 2500).replace(/^---[\s\S]*?---/, '').replace(/[#>*`|\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, short ? 200 : 450)
  const names = fs.filter((x) => !ROOT_FILES.test(x.rel) && !/\.(png|jpe?g|gif|webp|heic)$/i.test(x.rel)).sort((a, b) => b.mt - a.mt).slice(0, short ? 5 : 8).map((x) => x.rel.split('/').pop()).join(', ')
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
