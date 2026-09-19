import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, renameSync, realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'
import { EventEmitter } from 'node:events'
import { applyNaming, globMatch, globParents, PARA_PRESET, JD_PRESET, parseRules, rulesSection, roleOf } from '../core/rules'
import type { Bot, BotConfig, Candidate, FolderRules, RoutineDef } from '../core/types'
import { BOT_COLORS, ORCH_COLOR } from '../core/types'
import { atomicWrite } from './paths'
import { DEFAULT_TYPES, parseFolderName } from '../core/botName'

export const ORCH_ID = 'orch'
const STATE_DIR = '.folderbot'
const LEGACY_STATE_DIR = '.projectbot'
/** 가제(Project Bot) 시절 상태 폴더 → 새 이름. 새 폴더가 없고 옛 폴더만 있을 때 한 번, 통째로 옮긴다 */
export function migrateStateDir(root: string): void {
  try { const oldDir = join(root, LEGACY_STATE_DIR), newDir = join(root, STATE_DIR); if (existsSync(oldDir) && !existsSync(newDir)) renameSync(oldDir, newDir) } catch { /* 다음 부팅에 다시 */ }
}

interface ActiveRec { id: string; rel: string; color: string; startedAt: number; vendor?: 'claude' | 'codex'; pinned?: boolean }

/** NFC 정규화 + realpath — 한글 경로(NFD) 사고 방지 */
export function canon(p: string): string {
  const r = resolve(p).normalize('NFC')
  try { return realpathSync.native(r) } catch { return r }
}

export class Registry extends EventEmitter {
  readonly root: string
  rules: FolderRules = PARA_PRESET
  private active: ActiveRec[] = []

  constructor(root: string) {
    super()
    this.root = canon(root)
    migrateStateDir(this.root)
    this.loadRules()
    this.loadActive()
  }

  // ── 규칙 ────────────────────────────────────────────────────────────────
  rulesFile(): string {
    for (const n of ['CLAUDE.md', 'AGENTS.md']) {
      const p = join(this.root, n)
      if (existsSync(p) && parseRules(readFileSync(p, 'utf8'))) return p
    }
    return join(this.root, 'CLAUDE.md')
  }
  loadRules(): FolderRules {
    const f = this.rulesFile()
    if (existsSync(f)) {
      const r = parseRules(readFileSync(f, 'utf8'))
      if (r) { this.rules = r; return r }
    }
    this.rules = PARA_PRESET
    return this.rules
  }
  rulesInstalled(): boolean {
    const f = this.rulesFile()
    return existsSync(f) && parseRules(readFileSync(f, 'utf8')) !== null
  }
  /** 프리셋을 루트 CLAUDE.md 에 절로 설치한다 — 있으면 덮지 않고 덧붙인다 */
  installRules(preset: 'para' | 'johnny-decimal' | 'custom', custom?: FolderRules): FolderRules {
    const rules = preset === 'para' ? PARA_PRESET : preset === 'johnny-decimal' ? JD_PRESET : (custom ?? { ...PARA_PRESET, preset: 'custom' })
    const f = join(this.root, 'CLAUDE.md')
    const existing = existsSync(f) ? readFileSync(f, 'utf8') : ''
    let next: string
    if (parseRules(existing)) {
      next = existing.replace(/```yaml\s+folder-rules[\s\S]*?```/, rulesSection(rules).match(/```yaml[\s\S]*```/)![0])
    } else {
      const head = existing ? existing.replace(/\s*$/, '\n\n') : `# ${basename(this.root)}\n\n이 폴더는 Folder Bot 의 루트다. 각 하위 폴더가 봇 후보이고, 오케스트레이터가 이 파일의 규칙으로 정리한다.\n\n`
      next = head + rulesSection(rules)
    }
    atomicWrite(f, next)
    this.rules = rules
    if (preset === 'para') this.scaffoldPreset()
    this.emit('rules', rules)
    return rules
  }
  private scaffoldPreset(): void {
    const dirs = [...this.rules.roles.inbox, ...globParents(this.rules.roles.active), ...this.rules.roles.reference, ...this.rules.roles.archive]
    for (const d of dirs) {
      const p = join(this.root, d)
      if (!existsSync(p)) mkdirSync(p, { recursive: true })
    }
    const orchDir = join(this.root, '.claude')
    if (!existsSync(orchDir)) mkdirSync(orchDir, { recursive: true })
    const om = join(orchDir, 'orchestrator.md')
    if (!existsSync(om)) writeFileSync(om, ORCHESTRATOR_MD)
  }

  // ── 후보 ────────────────────────────────────────────────────────────────
  candidates(): Candidate[] {
    const out: Candidate[] = []
    const seen = new Set<string>()
    const activeRel = new Set(this.active.map((a) => a.rel))
    for (const parent of globParents(this.rules.roles.active)) {
      const dir = join(this.root, parent)
      if (!existsSync(dir)) continue
      let entries: string[] = []
      try { entries = readdirSync(dir) } catch { continue }
      for (const name of entries) {
        if (name.startsWith('.') || name.startsWith('_')) continue
        const abs = join(dir, name)
        let st
        try { st = statSync(abs) } catch { continue }
        if (!st.isDirectory()) continue
        const rel = `${parent}/${name}`
        if (seen.has(rel)) continue
        if (!this.rules.roles.active.some((g) => globMatch(g, rel))) continue
        const cfg = this.botConfig(abs)
        if (cfg.candidate === false) continue
        seen.add(rel)
        out.push({ rel, name, section: parent, harness: this.hasHarness(abs), mtime: latestMtime(abs), active: activeRel.has(rel) })
      }
    }
    // 글롭이 `*/*` 처럼 부모를 특정하지 않으면 루트 1단계를 훑는다
    if (this.rules.roles.active.some((g) => g.startsWith('*/'))) {
      for (const top of readdirSync(this.root)) {
        const tdir = join(this.root, top)
        if (top.startsWith('.') || !statSync(tdir).isDirectory()) continue
        if (roleOf(this.rules, top) && roleOf(this.rules, top) !== 'active') continue
        for (const name of readdirSync(tdir)) {
          const abs = join(tdir, name)
          if (name.startsWith('.') || !existsSync(abs) || !statSync(abs).isDirectory()) continue
          const rel = `${top}/${name}`
          if (seen.has(rel) || !this.rules.roles.active.some((g) => globMatch(g, rel))) continue
          seen.add(rel)
          out.push({ rel, name, section: top, harness: this.hasHarness(abs), mtime: latestMtime(abs), active: activeRel.has(rel) })
        }
      }
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  }
  hasHarness(abs: string): boolean {
    return this.rules.harness.some((h) => existsSync(join(abs, h.replace(/\/$/, ''))))
  }
  botConfig(abs: string): BotConfig {
    const f = join(abs, '.bot.yml')
    if (!existsSync(f)) return {}
    try { return (parseYaml(readFileSync(f, 'utf8')) as BotConfig) ?? {} } catch { return {} }
  }
  /**
   * 참조 폴더 지정 (D · 2026-09-19) — 봇당 하나(`.bot.yml repo` = `--add-dir`). 🔴 **비어 있을 때만** 넣는다 — 있으면 바꿔치기가
   * 되므로 거부하고 지금 것을 말해 준다. 빈 문자열이면 푼다. 볼트 안 폴더만.
   */
  setRepo(botId: string, absDir: string): Bot {
    const b = this.bot(botId); if (!b) throw new Error('봇을 못 찾았어요')
    const cfg = this.botConfig(b.abs)
    if (absDir) {
      if (cfg.repo) throw new Error(`참조 폴더는 하나뿐이에요 — 지금은 ${basename(b.repo ?? cfg.repo)} 예요`)
      const dir = resolve(absDir); const inVault = canon(dir) === canon(this.root) || canon(dir).startsWith(canon(this.root) + sep)
      if (!inVault || !existsSync(dir) || !statSync(dir).isDirectory()) throw new Error('볼트 안 폴더만 참조 폴더로 둘 수 있어요')
      if (canon(dir) === canon(b.abs) || canon(dir).startsWith(canon(b.abs) + sep)) throw new Error('이미 이 봇의 폴더 안이에요')
      this.saveBotConfig(b.abs, { ...cfg, repo: dir })
    } else { const { repo: _r, ...rest } = cfg; this.saveBotConfig(b.abs, rest) }
    this.emit('bots', this.bots())
    return this.bot(botId)!
  }
  saveBotConfig(abs: string, cfg: BotConfig): void {
    atomicWrite(join(abs, '.bot.yml'), stringify(cfg))
  }

  // ── 활성 봇 ──────────────────────────────────────────────────────────────
  private activeFile(): string { return join(this.root, STATE_DIR, 'bots.yml') }
  private loadActive(): void {
    try {
      const y = parseYaml(readFileSync(this.activeFile(), 'utf8')) as { bots?: ActiveRec[] }
      this.active = (y?.bots ?? []).filter((b) => b && b.rel)
    } catch { this.active = [] }
  }
  private saveActive(): void {
    const dir = join(this.root, STATE_DIR)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    atomicWrite(this.activeFile(), stringify({ bots: this.active }))
    this.emit('bots', this.bots())
  }
  bots(): Bot[] {
    const orch: Bot = { id: ORCH_ID, rel: '', abs: this.root, name: '오케스트레이터', displayName: '오케스트레이터', section: '관제', color: ORCH_COLOR, orchestrator: true, startedAt: 0, vendor: 'claude', routines: this.orchRoutines() }
    const rest = this.active.map((a) => this.toBot(a)).filter((b): b is Bot => !!b)
    return [orch, ...rest]
  }
  /**
   * 레일에 뜨는 이름은 **폴더 이름 그대로**다.
   * ⛔ «· Codex» 를 뒤에 붙이지 않는다 (2026-09-13 Dave 재정의) — 벤더는 폴더가 아니라 **세션**의
   *    성질이라 한 폴더에 Claude 세션과 Codex 세션이 섞여 산다. 폴더 이름에 회사를 박으면
   *    그 폴더가 한 회사 것처럼 보인다. 회사 표식은 **세션 목록**에만 붙는다.
   *    (옛 형제 봇이 이미 있으면 두 줄로 남지만, 새로 만들지는 않는다 — 지우는 건 사람 몫이다.)
   */
  private botName(a: ActiveRec): string { return basename(a.rel) }
  /**
   * 레일 표시 이름 (F · 2026-09-19) — 폴더명을 `날짜_타입-이름` 으로 파싱만 한다(core/botName). 봇 폴더의
   * CLAUDE.md(또는 claude.md) frontmatter 에 `display_name:` 이 있으면 제목만 덮고 날짜 칩은 폴더명 그대로다.
   * 볼트 안 파일이라 다른 맥에서 열어도 같이 따라온다. 읽기는 mtime 으로 캐시한다(bots() 가 자주 불린다).
   */
  private display(a: ActiveRec, abs: string): { displayName: string; kind?: string; due?: Bot['due'] } {
    const parsed = parseFolderName(basename(a.rel), this.rules.types?.length ? this.rules.types : DEFAULT_TYPES)
    const over = this.displayOverride(abs)
    return { displayName: over || parsed.title || basename(a.rel), ...(parsed.type ? { kind: parsed.type } : {}), ...(parsed.precision !== 'none' ? { due: { date: parsed.date, precision: parsed.precision } } : {}) }
  }
  private overrides = new Map<string, { mtime: number; v: string }>()
  private displayOverride(abs: string): string {
    for (const f of ['CLAUDE.md', 'claude.md']) {
      const file = join(abs, f)
      let st; try { st = statSync(file) } catch { continue }
      const c = this.overrides.get(file); if (c && c.mtime === st.mtimeMs) return c.v
      let v = ''
      try { const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8')); const m = fm && /^display_name:\s*(.+)$/m.exec(fm[1]); if (m) v = m[1].trim().replace(/^["']|["']$/g, '').slice(0, 80) } catch { /* */ }
      this.overrides.set(file, { mtime: st.mtimeMs, v })
      return v
    }
    return ''
  }
  /** ⚠ 벤더는 **시작할 때 고른 것**(a.vendor)이 이긴다 — `.bot.yml` 은 고르기 화면이 없던 시절의 폴백이다 */
  private toBot(a: ActiveRec): Bot | null {
    const abs = join(this.root, a.rel)
    if (!existsSync(abs)) return null
    const cfg = this.botConfig(abs)
    return { id: a.id, rel: a.rel, abs, name: this.botName(a), ...this.display(a, abs), section: a.rel.split('/')[0] === a.rel ? '' : a.rel.split('/')[0], color: cfg.color ?? a.color, orchestrator: false, startedAt: a.startedAt, vendor: a.vendor ?? cfg.vendor ?? 'claude', repo: cfg.repo ? resolve(abs, cfg.repo.replace(/^~/, process.env.HOME ?? '')) : undefined, routines: cfg.routines ?? [] , pinned: a.pinned}
  }
  bot(id: string): Bot | undefined { return this.bots().find((b) => b.id === id) }
  botByRel(rel: string): Bot | undefined { return this.bots().find((b) => b.rel === rel) }

  /**
   * 폴더에서 시작 — 후보든 아니든 활성 목록에 올린다. 하네스가 없으면 깔아 준다.
   * `vendor` 는 시작할 때 고른 에이전트다. 안 주면 `.bot.yml` → 'claude' 순으로 떨어진다.
   */
  start(rel: string, vendor?: 'claude' | 'codex'): Bot {
    rel = rel.replace(/^\/+|\/+$/g, '').normalize('NFC')
    const abs = join(this.root, rel)
    if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`폴더가 없어요: ${rel}`)
    if (!abs.startsWith(this.root + sep)) throw new Error('루트 밖 폴더는 시작할 수 없어요')
    // 🔴 **폴더 하나 = 줄 하나.** 종전에는 «이미 있나» 를 rel + vendor 로 봐서 같은 폴더가 Claude/Codex
    //    **두 줄**로 섰다(V24 의 «형제»). 2026-09-13 Dave 재정의로 벤더는 세션의 성질이 됐다 —
    //    시작할 때 고르는 것은 **첫 세션을 누가 맡나** 일 뿐이고, 그 뒤는 세션 목록의 + 에서 고른다.
    const v = vendor ?? 'claude'
    const existing = this.active.find((a) => a.rel === rel)
    if (existing) return this.toBot(existing)!
    // ⛔ **활성 봇 수에 상한을 두지 않는다** (2026-09-13 Dave: *«활성봇 상한이 왜 있어? 상한 없애줘»*).
    //    종전 8개 문턱은 «동시에 도는 CLI» 를 걱정한 것이었는데, 레일에 서 있는 것과 워커가 도는 것은
    //    다른 일이다 — 폴더를 목록에 올리는 데는 프로세스가 하나도 안 든다. 동시 실행은 세션 쪽
    //    상한(봇당 4)이 이미 막고 있다.
    if (!this.hasHarness(abs)) this.scaffold(abs, basename(rel))
    const color = BOT_COLORS[this.active.length % BOT_COLORS.length]
    const rec: ActiveRec = { id: `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, rel, color, startedAt: Date.now(), vendor: v }
    this.active.push(rec)
    this.saveActive()
    return this.toBot(rec)!
  }
  /** 정지(휴면 → 목록에서 제거, 폴더·기록은 그대로) */
  stop(id: string): void {
    this.active = this.active.filter((a) => a.id !== id)
    this.saveActive()
  }
  /**
   * 레일 순서 바꾸기 (2026-09-13 Dave: *«각 폴더가 위아래로 드래그 드롭으로 소팅이 안돼»*).
   *
   * 🔴 **순서는 볼트에 남는다** — `active.json` 의 줄 순서가 곧 레일 순서다. 기기마다 따로 두면
   *    맥에서 맞춰 놓은 차례가 폰에서 딴판이 되고, «내가 옮긴 게 어디 갔지» 가 된다.
   * ⚠ **모르는 id 는 무시하고, 빠진 것은 뒤에 붙인다.** 화면이 낡은 목록을 보냈을 때 봇이 사라지면 안 된다.
   * ⚠ 오케스트레이터는 이 목록에 없다 — 레일에서 늘 맨 위이고 끌 수 없다.
   */
  reorder(ids: string[]): void {
    const want = ids.filter((id, i) => ids.indexOf(id) === i)
    const by = new Map(this.active.map((a) => [a.id, a]))
    const next = want.map((id) => by.get(id)).filter((a): a is ActiveRec => !!a)
    const seen = new Set(next.map((a) => a.id))
    for (const a of this.active) if (!seen.has(a.id)) next.push(a)
    this.active = next
    this.saveActive()
  }
  /**
   * 🔴 **즐겨찾기 고정 — 최대 3개** (루프 3/10). 봇이 늘수록 매일 가는 폴더가 목록 속에 묻힌다.
   *    셋으로 자르는 이유: 넷부터는 «고정» 이 아니라 «또 하나의 목록» 이 된다.
   * ⚠ 고정은 볼트에 남는다(active.json) — 맥에서 고정한 것이 폰에서도 맨 위여야 한다.
   */
  static readonly MAX_PINNED = 3
  pin(id: string, on: boolean): void {
    const a = this.active.find((x) => x.id === id)
    if (!a) throw new Error('그런 봇이 없어요')
    if (on && !a.pinned && this.active.filter((x) => x.pinned).length >= Registry.MAX_PINNED) throw new Error(`고정은 ${Registry.MAX_PINNED}개까지예요 — 하나를 풀고 고정하세요`)
    a.pinned = on || undefined
    this.saveActive()
  }
  /** 은퇴 — archive 역할 폴더로 옮기고 목록에서 뺀다 */
  retire(id: string): string {
    const b = this.bot(id)
    if (!b || b.orchestrator) throw new Error('은퇴시킬 수 없는 봇')
    const archive = this.rules.roles.archive[0]
    if (!archive) throw new Error('규칙에 archive 폴더가 없어요')
    const dest = join(this.root, archive, basename(b.rel))
    if (existsSync(dest)) throw new Error(`Archive 에 같은 이름이 있어요: ${basename(b.rel)}`)
    mkdirSync(dirname(dest), { recursive: true })
    this.snapshot({ op: 'move', from: b.rel, to: relative(this.root, dest) })
    renameSync(b.abs, dest)
    this.stop(id)
    return relative(this.root, dest)
  }
  /**
   * 휴지통 — 볼트 안 경로 하나를 `.folderbot/trash/<시각>_<이름>` 으로 **옮긴다**.
   *
   * 🔴 **지우지 않고 옮긴다.** 되돌릴 수 없는 일을 한 번의 클릭 뒤에 두지 않는다 — 파인더에서
   *    꺼내면 그대로 돌아오고, `undoList()` 에도 남는다.
   * ⚠ **레일의 «지우기» 는 이걸 부르지 않는다** (2026-09-13 Dave 정정). 레일에서 덜어내는 것은
   *    `stop()` — 에이전트 연결만 끊고 폴더는 손대지 않는다. 이 함수는 **트리에서 파일을 치울 때**만 쓴다.
   * ⛔ 루트 자체는 못 치운다.
   */
  trashPath(rel: string): string {
    rel = rel.replace(/^\/+|\/+$/g, '').normalize('NFC')
    if (!rel) throw new Error('루트는 치울 수 없어요')
    const abs = join(this.root, rel)
    if (!abs.startsWith(this.root + sep)) throw new Error('루트 밖은 치울 수 없어요')
    if (!existsSync(abs)) throw new Error(`없는 경로: ${rel}`)
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
    const dest = join(this.root, '.folderbot', 'trash', `${stamp}_${basename(rel)}`)
    mkdirSync(dirname(dest), { recursive: true })
    this.snapshot({ op: 'move', from: rel, to: relative(this.root, dest) })
    renameSync(abs, dest)
    return relative(this.root, dest)
  }
  /**
   * 볼트 안에서 경로 하나를 옮긴다 — 되돌리기 기록(`snapshot`)을 함께 남긴다.
   * ⚠ 경계(봇 폴더 안인지)는 **부르는 쪽**이 본다(`gateway.inBot`). 여기서는 볼트 밖만 막는다.
   */
  movePath(fromRel: string, toRel: string): void {
    const from = join(this.root, fromRel); const to = join(this.root, toRel)
    if (!from.startsWith(this.root + sep) || !to.startsWith(this.root + sep)) throw new Error('루트 밖으로는 못 옮겨요')
    mkdirSync(dirname(to), { recursive: true })
    this.snapshot({ op: 'move', from: fromRel, to: toRel })
    renameSync(from, to)
  }
  /** 새 폴더 만들기 — 규칙 naming 적용 + 하네스 스캐폴드. 반환: rel */
  createFolder(section: string, name: string): string {
    const parents = globParents(this.rules.roles.active)
    section = section.replace(/^\/+|\/+$/g, '').normalize('NFC')
    const parentAbs = section ? join(this.root, section) : this.root
    if (!parentAbs.startsWith(this.root) || !existsSync(parentAbs) || !statSync(parentAbs).isDirectory()) throw new Error(`폴더가 없어요: ${section}`)
    const clean = name.replace(/[\/\\:\u0000-\u001f]/g, '_').trim()
    if (!clean) throw new Error('이름이 비었어요')
    const folderName = section === parents[0] ? applyNaming(this.rules.naming.project, clean) : clean
    const rel = (section ? `${section}/${folderName}` : folderName).normalize('NFC')
    const abs = join(this.root, rel)
    if (existsSync(abs)) throw new Error(`이미 있어요: ${rel}`)
    mkdirSync(abs, { recursive: true })
    this.scaffold(abs, name)
    this.emit('bots', this.bots())
    return rel
  }
  scaffold(abs: string, title: string): void {
    const w = (f: string, s: string) => { const p = join(abs, f); if (!existsSync(p)) writeFileSync(p, s) }
    w('CLAUDE.md', `# ${title}\n\n이 폴더의 봇을 위한 지침. 이 일이 무엇인지, 어떤 규칙으로 일하는지 적는다.\n\n- 산출물은 이 폴더 안에 둔다.\n- 할 일은 \`todo.md\` 에 \`- [ ] 제목: 설명\` 으로 적는다.\n`)
    w('readme.md', `# ${title}\n\n## 무엇을 왜\n\n(이 일의 목표·기간·산출물을 적어 두면 봇이 기억합니다)\n`)
    w('todo.md', `# todo\n\n- [ ] readme.md 채우기: 이 일이 무엇인지 한 문단\n\n## 완료\n`)
    const cd = join(abs, '.claude'); if (!existsSync(cd)) mkdirSync(cd)
  }

  // ── Inbox ────────────────────────────────────────────────────────────────
  inboxItems(): { rel: string; name: string; dir: boolean; mtime: number }[] {
    const out: { rel: string; name: string; dir: boolean; mtime: number }[] = []
    for (const ib of this.rules.roles.inbox) {
      const dir = join(this.root, ib)
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir)) {
        if (name.startsWith('.')) continue
        const abs = join(dir, name)
        try { const st = statSync(abs); out.push({ rel: `${ib}/${name}`, name, dir: st.isDirectory(), mtime: st.mtimeMs }) } catch { /* skip */ }
      }
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  }
  /** 루트 안 이동 (되돌리기 스냅샷 동반) */
  move(fromRel: string, toRel: string): void {
    const from = join(this.root, fromRel), to = join(this.root, toRel)
    if (!from.startsWith(this.root + sep) || !to.startsWith(this.root + sep)) throw new Error('루트 밖으로는 옮길 수 없어요')
    if (!existsSync(from)) throw new Error(`없어요: ${fromRel}`)
    if (existsSync(to)) throw new Error(`이미 있어요: ${toRel}`)
    mkdirSync(dirname(to), { recursive: true })
    this.snapshot({ op: 'move', from: fromRel, to: toRel })
    renameSync(from, to)
    this.emit('bots', this.bots())
  }
  private snapshot(entry: Record<string, unknown>): void {
    const dir = join(this.root, STATE_DIR, 'undo')
    mkdirSync(dir, { recursive: true })
    // ⚠ 시각은 **한 번만** 잰다 — 파일 이름과 안의 `t` 가 다른 밀리초에 찍히면 `undo(t)` 가 «스냅샷이 없어요» 로
    //   실패한다(2026-09-15 QA 에서 드물게 났다). 같은 값이어야 되돌리기가 그 파일을 찾는다.
    const t = Date.now()
    writeFileSync(join(dir, `${t}.json`), JSON.stringify({ t, ...entry }))
  }
  undoList(): { t: number; op: string; from: string; to: string }[] {
    const dir = join(this.root, STATE_DIR, 'undo')
    if (!existsSync(dir)) return []
    return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 20).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  }
  undo(t: number): void {
    const dir = join(this.root, STATE_DIR, 'undo')
    const f = join(dir, `${t}.json`)
    if (!existsSync(f)) throw new Error('스냅샷이 없어요')
    const e = JSON.parse(readFileSync(f, 'utf8')) as { op: string; from: string; to: string }
    if (e.op === 'move') {
      const from = join(this.root, e.to), to = join(this.root, e.from)
      if (!existsSync(from)) throw new Error('되돌릴 대상이 이미 없어요')
      mkdirSync(dirname(to), { recursive: true })
      renameSync(from, to)
    }
    renameSync(f, `${f}.undone`)
    this.emit('bots', this.bots())
  }

  private orchRoutines(): RoutineDef[] {
    const f = join(this.root, '.claude', 'routines.yml')
    if (!existsSync(f)) return []
    try { return ((parseYaml(readFileSync(f, 'utf8')) as { routines?: RoutineDef[] })?.routines) ?? [] } catch { return [] }
  }
  orchestratorPrompt(): string {
    const f = join(this.root, '.claude', 'orchestrator.md')
    return existsSync(f) ? readFileSync(f, 'utf8') : ORCHESTRATOR_MD
  }
}

function latestMtime(abs: string): number {
  let m = 0
  try {
    m = statSync(abs).mtimeMs
    for (const n of readdirSync(abs).slice(0, 80)) {
      try { const s = statSync(join(abs, n)); if (s.mtimeMs > m) m = s.mtimeMs } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return m
}

export const ORCHESTRATOR_MD = `# 오케스트레이터

너는 이 볼트(루트 폴더) 전체를 보는 단 하나의 관제 봇이다. 각 폴더의 봇들은 자기 폴더만 본다.

## 하는 일
1. 폴더 규칙(루트 CLAUDE.md 의 "폴더 규칙" 절)을 읽고 그대로 행동한다. 규칙이 바뀌면 행동도 바뀐다.
2. 후보·활성 봇 목록과 상태를 파악한다 (bots_candidates · bots_list · bot_status).
3. 사람이 "X 폴더에서 시작해" 라고 하면 bot_start. 폴더가 없으면 folder_create 를 제안하고 승인 뒤 만든다.
4. Inbox 를 정리한다 — inbox_list 로 보고, 규칙(역할·naming)대로 어디로 옮길지 제안한다. 옮기는 것(folder_move)은 사람이 승인한 뒤에만.
5. 봇에게 일을 시킨다 — bot_send 로 그 봇에 세션을 만들어 지시한다. 결과는 bot_sessions 로 본다.
6. 완료된 프로젝트는 은퇴(bot_retire)를 제안한다. 실행은 승인 뒤에.

## 자율 범위
- 읽기·조사·분류 제안·봇 시작/정지는 알아서 한다.
- 폴더 생성·이동·삭제·외부 발송은 반드시 사람의 승인을 받는다. 되돌리기가 있는 동작만 자동 허용.
- 사람이 없을 때(루틴)는 제안만 하고 파일을 쓰지 않는다.

## 말투
- 짧게. 제안은 "무엇을 어디로, 왜" 한 줄씩. 승인이 필요하면 마지막에 무엇을 승인하는지 분명히.
`
