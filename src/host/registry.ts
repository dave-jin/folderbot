import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, renameSync, realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'
import { EventEmitter } from 'node:events'
import { applyNaming, globMatch, globParents, PARA_PRESET, JD_PRESET, parseRules, rulesSection, roleOf } from '../core/rules'
import type { Bot, BotConfig, Candidate, FolderRules, RoutineDef } from '../core/types'
import { BOT_COLORS, ORCH_COLOR } from '../core/types'
import { atomicWrite } from './paths'

export const ORCH_ID = 'orch'
const STATE_DIR = '.folderbot'
const LEGACY_STATE_DIR = '.projectbot'
/** 가제(Project Bot) 시절 상태 폴더 → 새 이름. 새 폴더가 없고 옛 폴더만 있을 때 한 번, 통째로 옮긴다 */
export function migrateStateDir(root: string): void {
  try { const oldDir = join(root, LEGACY_STATE_DIR), newDir = join(root, STATE_DIR); if (existsSync(oldDir) && !existsSync(newDir)) renameSync(oldDir, newDir) } catch { /* 다음 부팅에 다시 */ }
}

interface ActiveRec { id: string; rel: string; color: string; startedAt: number; vendor?: 'claude' | 'codex' }

/** NFC 정규화 + realpath — 한글 경로(NFD) 사고 방지 */
export function canon(p: string): string {
  const r = resolve(p).normalize('NFC')
  try { return realpathSync.native(r) } catch { return r }
}

export class Registry extends EventEmitter {
  readonly root: string
  rules: FolderRules = PARA_PRESET
  private active: ActiveRec[] = []
  botLimit = 8

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
    const orch: Bot = { id: ORCH_ID, rel: '', abs: this.root, name: '오케스트레이터', section: '관제', color: ORCH_COLOR, orchestrator: true, startedAt: 0, vendor: 'claude', routines: this.orchRoutines() }
    const rest = this.active.map((a) => this.toBot(a)).filter((b): b is Bot => !!b)
    return [orch, ...rest]
  }
  /** 같은 폴더에 형제가 있으면 이름 뒤에 «· Codex» 를 붙여 레일에서 가른다 (V24) */
  private botName(a: ActiveRec): string {
    const base = basename(a.rel)
    const sibs = this.active.filter((x) => x.rel === a.rel)
    if (sibs.length < 2) return base
    return `${base} · ${(a.vendor ?? 'claude') === 'codex' ? 'Codex' : 'Claude'}`
  }
  /** ⚠ 벤더는 **시작할 때 고른 것**(a.vendor)이 이긴다 — `.bot.yml` 은 고르기 화면이 없던 시절의 폴백이다 */
  private toBot(a: ActiveRec): Bot | null {
    const abs = join(this.root, a.rel)
    if (!existsSync(abs)) return null
    const cfg = this.botConfig(abs)
    return { id: a.id, rel: a.rel, abs, name: this.botName(a), section: a.rel.split('/')[0] === a.rel ? '' : a.rel.split('/')[0], color: cfg.color ?? a.color, orchestrator: false, startedAt: a.startedAt, vendor: a.vendor ?? cfg.vendor ?? 'claude', repo: cfg.repo ? resolve(abs, cfg.repo.replace(/^~/, process.env.HOME ?? '')) : undefined, routines: cfg.routines ?? [] }
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
    // 같은 폴더에 **형제**를 둘 수 있다 (V24) — 폴더 하나에 에이전트 하나가 원칙이지만
    // Claude 와 Codex 는 읽는 지침(CLAUDE.md · AGENTS.md)이 달라 나란히 두는 게 자연스럽다.
    // 그래서 «이미 있나» 판정은 rel 이 아니라 **rel + vendor** 다.
    const v = vendor ?? 'claude'
    const existing = this.active.find((a) => a.rel === rel && (a.vendor ?? 'claude') === v)
    if (existing) return this.toBot(existing)!
    if (this.active.length >= this.botLimit) throw new Error(`활성 봇이 상한(${this.botLimit})에 닿았어요. 휴면 봇을 은퇴시키거나 상한을 올리세요.`)
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
    writeFileSync(join(dir, `${Date.now()}.json`), JSON.stringify({ t: Date.now(), ...entry }))
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
