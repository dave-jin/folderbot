import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, watch, writeFileSync, renameSync, type FSWatcher } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseBridges, ownsPeer, type BridgesConfig, type PeerDef } from '../core/bridges'
import { formatLetter, frontMatterClosed, ignoredLetterName, isoLocal, letterId, monthOf, normId, parseLetter, FBMF_KINDS, type Letter, type LetterKind } from '../core/fbmf'
import { addBridgeYaml, letterAt, mailboxReadme, markRead, newBridgeProblems, orderThread, unreadOf, type LetterView, type NewBridge, type PeerView } from '../core/bridgeView'

/**
 * 🔴 **연결(Bridge) — 바깥 상대와 편지 파일로 대화한다** (R1 · 2026-10-09 Dave 승인).
 * 설계 `PARA/2. Area/제품_FolderBot/01_기획/2026-10-09_기획_외부-에이전트-연결-Bridge.md` · 검토 `…_검토_연결-Bridge.md`.
 *
 * 들어오는 편지(상대 → Folder Bot)
 *  - 우편함 `to-folderbot/`(월 폴더 포함)을 **감시 + 60초 폴링**으로 본다. 감시는 빨리 받으려는 것이고, 놓치지 않는 것은 폴링 몫이다
 *    (FSEvents 는 잠자기·과부하 때 이벤트를 합치거나 놓친다 · 검토 §2-③).
 *  - 쓰는 중인 파일을 반쯤 읽지 않게: (크기, mtime) 이 `STABLE_MS` 떨어진 두 관찰에서 같고, 머리말이 닫혀 있을 때만 받는다.
 *  - 중복 판정 키는 **편지 id(파일 이름 · NFC)** 다. 배달 기록은 `<dataDir>/bridges/<상대>/delivered.jsonl` — 세션이 사는 곳과 같다
 *    (두 맥이 같은 볼트를 열어도 기록이 섞이지 않는다 · 검토 §2-②). 주인 호스트(`host:`)만 가져간다.
 *  - **처음 켤 때 이미 있던 편지는 «본 것»으로 기록만 한다**(`since:` 가 있으면 그 뒤 것은 넣는다) — 쌓인 편지 폭주 막기(§2-④).
 *  - 읽다 실패하면 기록을 쓰지 않고 다음 폴링에 다시 한다(온라인 전용 자리표시 파일).
 * 나가는 편지(Folder Bot → 상대) — `send()` 가 FBMF 파일을 `from-folderbot/<달>/` 에 **숨김 임시 파일 → 링크(있으면 실패)** 로 만든다.
 *    같은 이름이 있으면 덮지 않고 새 난수로 다시 만든다(§2-⑦). 임시 파일은 점으로 시작해 상대가 못 읽는다(§2-⑧).
 */
export const STABLE_MS = 3000
export const POLL_MS = 60_000
/** 커서 하트비트 — 편지가 없어도 이만큼마다 `at` 을 새로 쓴다(상대·감시기가 «Folder Bot 이 살아 있나» 를 본다) */
export const CURSOR_BEAT_MS = 15 * 60_000
const BRIDGES_FILE = ['.claude', 'bridges.yml']

export interface Incoming { letter: Letter; rel: string; abs: string; sha: string }
export interface BridgeDeps {
  root: string
  dataDir: string
  hostNames: () => string[]
  log: (s: string) => void
  /** 편지 묶음을 세션에 넣는다. 넣었으면 세션 id, 넣을 곳이 없으면 null(기록하지 않고 다음에 다시) */
  deliver: (peer: PeerDef, items: Incoming[]) => string | null
  /** BQ-8 · 급한 편지를 썼다 — 상대를 깨운다(웹훅). 본문은 안 보낸다 */
  wake?: (peer: PeerDef, payload: { id: string; kind: string; path: string; urgent: boolean; needs_human: boolean }) => void
  /** BQ-8 · 상대가 `expect_every` 넘게 조용하다 / 다시 살아났다 */
  onStale?: (peer: PeerDef, lastSignal: number) => void
  onAlive?: (peer: PeerDef, lastSignal: number) => void
  /** BQ-9 · 화면이 다시 읽을 일이 생겼다(편지 들어옴·보냄·끊김·설정) — 호스트가 `bridges` 프레임으로 알린다 */
  onChange?: () => void
  now?: () => number
}
/** BQ-9 · 스레드에 싣는 본문 길이 — 넘으면 앞만(파일 경로는 함께 간다) */
export const THREAD_BODY_MAX = 2000
/** 사람이 화면에서 직접 쓴 편지의 보낸쪽 이름 — README 에 «human» 으로 적어 둔다 */
export const HUMAN_FROM = 'human'

interface Seen { size: number; mtime: number; at: number }
interface Box {
  peer: PeerDef
  inDir: string
  outDir: string
  ledger: string
  delivered: Set<string>
  seen: Map<string, Seen>
  watcher?: FSWatcher
  timer?: NodeJS.Timeout
  recheck?: NodeJS.Timeout
  lastCursor: number
  scanning: boolean
  /** BQ-8 · 상대의 마지막 신호(커서 갱신·편지) · 지금 끊긴 것으로 보고 있나 */
  openedAt: number
  lastLetterAt: number
  stale: boolean
}

export class BridgeHub {
  cfg: BridgesConfig = { peers: [], errors: [] }
  private boxes = new Map<string, Box>()
  private lastErrors = ''
  constructor(private d: BridgeDeps) {}
  private now(): number { return this.d.now ? this.d.now() : Date.now() }

  configFile(): string { return join(this.d.root, ...BRIDGES_FILE) }
  /** 볼트 기준 또는 절대 경로 → 절대 경로 */
  abs(p: string): string { return isAbsolute(p) ? p : resolve(this.d.root, p) }
  peer(id: string): PeerDef | undefined { return this.cfg.peers.find((p) => p.id === id) }
  /** 이 봇이 편지를 보낼 수 있는 상대들 */
  peersFor(botId: string): PeerDef[] { return this.cfg.peers.filter((p) => p.enabled && p.maySend.includes(botId)) }

  /** 설정을 (다시) 읽고 감시를 맞춘다 — 켤 때 · `.claude/bridges.yml` 이 바뀔 때 */
  reload(): void {
    const f = this.configFile()
    this.cfg = existsSync(f) ? parseBridges(readFileSync(f, 'utf8')) : { peers: [], errors: [] }
    const errs = this.cfg.errors.join(' · ')
    if (errs && errs !== this.lastErrors) this.d.log(`⚠ 연결 설정: ${errs}`)
    this.lastErrors = errs
    const want = new Map(this.cfg.peers.filter((p) => p.enabled && ownsPeer(p, this.d.hostNames())).map((p) => [p.id, p]))
    for (const [id, b] of this.boxes) if (!want.has(id) || JSON.stringify(want.get(id)) !== JSON.stringify(b.peer)) this.close(id)
    for (const [id, p] of want) if (!this.boxes.has(id)) this.open(p)
    for (const p of this.cfg.peers) if (p.enabled && !want.has(p.id)) this.d.log(`연결 «${p.name}» 은 ${p.host} 호스트가 가져가요 — 이 호스트는 읽기만`)
    this.changed()
  }
  private changed(): void { try { this.d.onChange?.() } catch { /* 화면 알림은 덤이다 */ } }

  private open(peer: PeerDef): void {
    const mb = this.abs(peer.mailbox)
    const box: Box = { peer, inDir: join(mb, 'to-folderbot'), outDir: join(mb, 'from-folderbot'), ledger: join(this.d.dataDir, 'bridges', peer.id, 'delivered.jsonl'), delivered: new Set(), seen: new Map(), lastCursor: 0, scanning: false, openedAt: this.now(), lastLetterAt: 0, stale: false }
    mkdirSync(join(this.d.dataDir, 'bridges', peer.id), { recursive: true })
    const first = !existsSync(box.ledger)
    if (!first) for (const line of readFileSync(box.ledger, 'utf8').split('\n')) { try { const j = JSON.parse(line) as { id?: string }; if (j.id) box.delivered.add(normId(j.id)) } catch { /* 깨진 줄은 건너뛴다 */ } }
    this.boxes.set(peer.id, box)
    if (first) this.baseline(box)
    try {
      mkdirSync(box.inDir, { recursive: true })
      box.watcher = watch(box.inDir, { recursive: true, persistent: false }, (_e, name) => { if (name && !ignoredLetterName(basename(String(name)))) this.kick(box) })
      box.watcher.on('error', (e: Error) => { this.d.log(`연결 «${peer.name}» 감시 오류 — 폴링만으로 계속 · ${e.message}`); try { box.watcher?.close() } catch { /* */ } box.watcher = undefined })
    } catch (e) { this.d.log(`연결 «${peer.name}» 감시를 못 걸었어요 — 폴링만으로 계속 · ${(e as Error).message}`) }
    box.timer = setInterval(() => this.scan(box), POLL_MS); box.timer.unref?.()
    this.d.log(`연결 «${peer.name}» 열림 · ${relative(this.d.root, box.inDir) || box.inDir}${first ? ' · 처음이라 이미 있던 편지는 «본 것»으로' : ''}`)
    this.scan(box, true)
  }
  close(id: string): void {
    const b = this.boxes.get(id); if (!b) return
    try { b.watcher?.close() } catch { /* */ }
    if (b.timer) clearInterval(b.timer)
    if (b.recheck) clearTimeout(b.recheck)
    this.boxes.delete(id)
  }
  closeAll(): void { for (const id of [...this.boxes.keys()]) this.close(id) }

  /** 처음 켤 때 — 이미 있던 편지는 넣지 않고 «본 것» 으로만 기록한다. `since` 뒤에 쓰인 것은 남겨 둔다 */
  private baseline(box: Box): void {
    const lines: string[] = []
    for (const f of this.list(box, true)) {
      let mtime = 0; try { mtime = statSync(f).mtimeMs } catch { continue }
      if (box.peer.since !== undefined && mtime >= box.peer.since) continue
      const id = normId(basename(f).replace(/\.(md|txt)$/i, ''))
      box.delivered.add(id)
      lines.push(JSON.stringify({ id, state: 'baseline', rel: relative(box.inDir, f), at: new Date(this.now()).toISOString() }))
    }
    appendFileSync(box.ledger, lines.length ? `${lines.join('\n')}\n` : '')
  }

  /** 편지 후보 파일 — `to-folderbot/` 바로 아래와 그 아래 폴더 한 단계(월 폴더). `full` 이 아니면 이번 달·지난달 폴더만 */
  private list(box: Box, full: boolean): string[] { return letterFiles(box.inDir, full, new Date(this.now())) }

  /** 감시 신호 — 곧 한 번 훑는다(여러 신호는 한 번으로) */
  private kick(box: Box): void {
    if (box.recheck) return
    box.recheck = setTimeout(() => { box.recheck = undefined; this.scan(box) }, 300)
    box.recheck.unref?.()
  }
  /** 테스트·`routine_run` 류에서 바로 훑기 */
  scanNow(peerId?: string): void { for (const b of this.boxes.values()) if (!peerId || b.peer.id === peerId) this.scan(b, true) }

  private scan(box: Box, full = false): void {
    if (box.scanning || !this.boxes.has(box.peer.id)) return
    box.scanning = true
    try {
      const ready: Incoming[] = []
      let waiting = false
      for (const f of this.list(box, full)) {
        const id = normId(basename(f).replace(/\.(md|txt)$/i, ''))
        if (box.delivered.has(id)) continue
        let st; try { st = statSync(f) } catch { continue }
        const prev = box.seen.get(f), t = this.now()
        if (!prev || prev.size !== st.size || prev.mtime !== st.mtimeMs) { box.seen.set(f, { size: st.size, mtime: st.mtimeMs, at: t }); waiting = true; continue }
        if (t - prev.at < STABLE_MS) { waiting = true; continue }
        let text: string
        try { text = readFileSync(f, 'utf8') } catch (e) { this.d.log(`연결 «${box.peer.name}» 편지를 못 읽었어요(다음에 다시) · ${basename(f)} · ${(e as Error).message}`); continue }
        if (!frontMatterClosed(text) && t - prev.at < 10 * 60_000) { waiting = true; continue }   // 머리말이 아직 안 닫혔다 — 10분까지는 기다린다
        const letter = parseLetter(text, { id, from: box.peer.id })
        ready.push({ letter, rel: relative(this.d.root, f).startsWith('..') ? f : relative(this.d.root, f), abs: f, sha: createHash('sha256').update(text).digest('hex') })
      }
      if (ready.length) this.hand(box, ready)
      if (waiting) { if (box.recheck) clearTimeout(box.recheck); box.recheck = setTimeout(() => { box.recheck = undefined; this.scan(box) }, STABLE_MS + 200); box.recheck.unref?.() }
      if (this.now() - box.lastCursor > CURSOR_BEAT_MS) this.writeCursor(box)
      this.checkAlive(box)
    } finally { box.scanning = false }
  }

  /**
   * BQ-8 · 상대가 살아 있나 — 상대 커서(`cursors/<상대>.json` 또는 `cursors/<상대>/*.json`)의 갱신 시각과 마지막 편지 중 늦은 것.
   * 신호를 한 번도 못 봤으면 연결을 연 시각을 기준으로 한다(켜자마자 «끊김» 이 울리지 않게). 바뀔 때만 알린다.
   */
  lastSignal(box: Box): number {
    const cdir = join(this.abs(box.peer.mailbox), 'cursors')
    let t = Math.max(box.openedAt, box.lastLetterAt)
    try { t = Math.max(t, statSync(join(cdir, `${box.peer.id}.json`)).mtimeMs) } catch { /* */ }
    try { for (const n of readdirSync(join(cdir, box.peer.id))) if (n.endsWith('.json')) { try { t = Math.max(t, statSync(join(cdir, box.peer.id, n)).mtimeMs) } catch { /* */ } } } catch { /* */ }
    return t
  }
  private checkAlive(box: Box): void {
    const every = box.peer.expectEveryMs; if (!every) return
    const last = this.lastSignal(box), quiet = this.now() - last > every
    if (quiet && !box.stale) { box.stale = true; this.d.onStale?.(box.peer, last); this.changed() }
    else if (!quiet && box.stale) { box.stale = false; this.d.onAlive?.(box.peer, last); this.changed() }
  }

  /** 세션에 넘기고, 넘겼으면 기록 · 커서 */
  private hand(box: Box, items: Incoming[]): void {
    items.sort((a, b) => Number(b.letter.urgent) - Number(a.letter.urgent) || (a.letter.id < b.letter.id ? -1 : 1))
    let sid: string | null = null
    try { sid = this.d.deliver(box.peer, items) } catch (e) { this.d.log(`연결 «${box.peer.name}» 배달 실패(다음에 다시) · ${(e as Error).message}`); return }
    if (!sid) return
    const at = new Date(this.now()).toISOString()
    appendFileSync(box.ledger, items.map((x) => JSON.stringify({ id: x.letter.id, state: 'delivered', rel: x.rel, sha: x.sha, session: sid, urgent: x.letter.urgent || undefined, at })).join('\n') + '\n')
    for (const x of items) { box.delivered.add(x.letter.id); box.seen.delete(x.abs) }
    box.lastLetterAt = this.now()
    this.writeCursor(box, items.map((x) => x.letter.id).sort().pop())
    this.d.log(`연결 «${box.peer.name}» 편지 ${items.length}통 → 세션 ${sid}`)
    this.changed()
  }

  /** `cursors/folderbot.json` — 어디까지 읽었나 + 하트비트. 읽는 쪽(Folder Bot)만 쓴다 */
  private writeCursor(box: Box, last?: string): void {
    const f = join(this.abs(box.peer.mailbox), 'cursors', 'folderbot.json')
    try {
      let prevLast = ''
      try { prevLast = String((JSON.parse(readFileSync(f, 'utf8')) as { last?: string }).last ?? '') } catch { /* */ }
      const next = last && last > prevLast ? last : prevLast
      mkdirSync(join(this.abs(box.peer.mailbox), 'cursors'), { recursive: true })
      const tmp = join(this.abs(box.peer.mailbox), 'cursors', `.folderbot.json.${process.pid}.tmp`)
      writeFileSync(tmp, JSON.stringify({ last: next, at: isoLocal(new Date(this.now())) }))
      renameSync(tmp, f)
      box.lastCursor = this.now()
    } catch (e) { this.d.log(`연결 «${box.peer.name}» 커서를 못 썼어요 · ${(e as Error).message}`) }
  }

  /**
   * BQ-11 · 들어오는 웹훅 — 상대 대신 `to-folderbot/<달>/` 에 편지 파일을 만들고 바로 훑는다. **들어오는 길이 몇 개든 처리는 파일 하나로 모인다.**
   * 인증·주소 확인은 부르는 쪽(gateway)이 한다.
   */
  receive(peerId: string, o: { kind?: string; text: string; title?: string; re?: string; urgent?: boolean; needsHuman?: boolean }): { id: string; rel: string } {
    const peer = this.peer(peerId); if (!peer || !peer.enabled) throw new Error('그런 연결이 없어요')
    const kind = (FBMF_KINDS.includes(String(o.kind ?? 'request') as LetterKind) ? String(o.kind ?? 'request') : 'request') as LetterKind
    const out = this.writeLetter(peer, 'to-folderbot', peer.id, peer.id, peer.deliver.bot, { ...o, kind })
    const b = this.boxes.get(peer.id); if (b) this.kick(b)
    this.changed()
    return out
  }
  /** 숨김 임시 파일 → link(이미 있으면 실패 → 새 난수) — 덮지 않고, 상대가 반쯤 쓴 파일을 못 본다 */
  private writeLetter(peer: PeerDef, side: 'to-folderbot' | 'from-folderbot', slug: string, from: string, to: string, o: { kind: LetterKind; text: string; title?: string; re?: string; urgent?: boolean; needsHuman?: boolean }): { id: string; rel: string } {
    const body = String(o.text ?? '').trim(); if (!body) throw new Error('본문(text)이 비었어요')
    const d = new Date(this.now())
    for (let i = 0; i < 5; i++) {
      const id = letterId(d, slug, randomBytes(2).toString('hex'))
      const dir = join(this.abs(peer.mailbox), side, monthOf(id, d))
      mkdirSync(dir, { recursive: true })
      const final = join(dir, `${id}.md`), tmp = join(dir, `.${id}.md.${process.pid}.tmp`)
      writeFileSync(tmp, formatLetter({ id, from, to, kind: o.kind, title: o.title?.trim() || undefined, re: o.re ? normId(o.re) : undefined, urgent: !!o.urgent, needsHuman: !!o.needsHuman, created: isoLocal(d), body }))
      try { linkSync(tmp, final) } catch (e) { unlinkSync(tmp); if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue; throw e }
      unlinkSync(tmp)
      return { id, rel: relative(this.d.root, final).startsWith('..') ? final : relative(this.d.root, final) }
    }
    throw new Error('같은 이름이 계속 있어 편지를 못 만들었어요')
  }

  /**
   * 나가는 편지 — `bridge_send`. 이 호스트가 주인이 아니어도 쓴다(편지 파일은 Dropbox 로 건너간다 · 한 파일은 한 쪽만).
   * @returns 만든 편지 id 와 볼트 기준 경로
   */
  send(peerId: string, fromBot: string, o: { kind: string; text: string; title?: string; re?: string; urgent?: boolean; needsHuman?: boolean }): { id: string; rel: string } {
    const peer = this.peer(peerId)
    if (!peer || !peer.enabled) throw new Error(`그런 연결이 없어요: ${peerId}${this.cfg.peers.length ? ` (있는 것: ${this.cfg.peers.map((p) => p.id).join(', ')})` : ' — .claude/bridges.yml 에 연결이 없어요'}`)
    if (!peer.maySend.includes(fromBot)) throw new Error(`이 봇은 «${peer.name}» 에게 편지를 보낼 수 없어요 — may_send 에 없어요(${peer.maySend.join(', ') || '없음'}). 오케스트레이터를 거치세요`)
    const kind = String(o.kind) as LetterKind
    if (!FBMF_KINDS.includes(kind) || kind === 'heartbeat') throw new Error(`kind 는 ${FBMF_KINDS.filter((k) => k !== 'heartbeat').join(' · ')} 중 하나예요`)
    if (!String(o.text ?? '').trim()) throw new Error('본문(text)이 비었어요')
    const out = this.writeLetter(peer, 'from-folderbot', fromBot === 'orch' ? 'orch' : fromBot, fromBot === 'orch' ? 'orch' : `folderbot:${fromBot}`, peer.id, { ...o, kind })
    this.afterSend(peer, out, kind, o)
    return out
  }
  private afterSend(peer: PeerDef, out: { id: string; rel: string }, kind: string, o: { urgent?: boolean; needsHuman?: boolean }): void {
    if (o.urgent && peer.wake) { try { this.d.wake?.(peer, { id: out.id, kind, path: out.rel, urgent: true, needs_human: !!o.needsHuman }) } catch (e) { this.d.log(`연결 «${peer.name}» 깨우기 실패 · ${(e as Error).message}`) } }
    this.changed()
  }

  /**
   * BQ-9 · 사람이 스레드 아래에서 직접 쓴 편지 — `bridge_send` 를 사람이 누르는 것(목업 공통 화면).
   * `may_send` 는 봇을 거르는 울타리라 사람에게는 걸지 않는다. 보낸쪽은 `human`. 급하면 봇이 쓴 편지처럼 상대를 깨운다.
   */
  sendHuman(peerId: string, o: { kind: string; text: string; title?: string; re?: string; urgent?: boolean; needsHuman?: boolean }): { id: string; rel: string } {
    const peer = this.peer(peerId)
    if (!peer || !peer.enabled) throw new Error('그런 연결이 없어요')
    const kind = String(o.kind) as LetterKind
    if (!FBMF_KINDS.includes(kind) || kind === 'heartbeat' || kind === 'briefing') throw new Error('kind 는 report · request · reply · done · incident 중 하나예요')
    if (kind === 'reply' && !o.re) throw new Error('reply 는 re(답할 편지 id)가 있어야 해요')
    if (o.re && /[\r\n:#]/.test(o.re)) throw new Error('re 는 편지 id 한 줄이어야 해요')
    if (!String(o.text ?? '').trim()) throw new Error('본문이 비었어요')
    const out = this.writeLetter(peer, 'from-folderbot', HUMAN_FROM, HUMAN_FROM, peer.id, { ...o, kind })
    this.afterSend(peer, out, kind, o)
    return out
  }

  /** BQ-8 결과를 스레드에 — 웹훅 응답 코드(이번 실행에서만 안다 · 키 값은 남기지 않는다) */
  private wakes = new Map<string, { ok: boolean; status?: number }>()
  noteWake(id: string, r: { ok: boolean; status?: number }): void { this.wakes.set(id, { ok: r.ok, ...(r.status ? { status: r.status } : {}) }); if (this.wakes.size > 500) this.wakes.delete(this.wakes.keys().next().value as string); this.changed() }

  /* ── BQ-9 · 화면 — 레일 «연결» 절과 편지 스레드 ─────────────────────────── */

  /** 파일 하나 → 스레드 편지. (크기, mtime) 가 같으면 다시 파싱하지 않는다 */
  private parsed = new Map<string, { size: number; mtime: number; v: LetterView }>()
  private viewOf(abs: string, dir: 'in' | 'out', peer: PeerDef): LetterView | null {
    let st; try { st = statSync(abs) } catch { return null }
    const hit = this.parsed.get(abs)
    if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return hit.v
    let text: string; try { text = readFileSync(abs, 'utf8') } catch { return null }
    if (!frontMatterClosed(text)) return null
    const id = normId(basename(abs).replace(/\.(md|txt)$/i, ''))
    const l = parseLetter(text, { id, from: dir === 'in' ? peer.id : 'folderbot' })
    const rel = relative(this.d.root, abs)
    const v: LetterView = { id: l.id, dir, from: l.from, ...(l.to ? { to: l.to } : {}), kind: l.kind, ...(l.title ? { title: l.title } : {}), ...(l.re ? { re: l.re } : {}), urgent: l.urgent, needsHuman: l.needsHuman, at: letterAt(l.created, l.id, st.mtimeMs), body: l.body.slice(0, THREAD_BODY_MAX), ...(l.body.length > THREAD_BODY_MAX ? { cut: true } : {}), rel: rel.startsWith('..') ? abs : rel, ...(l.malformed ? { malformed: true } : {}) }
    this.parsed.set(abs, { size: st.size, mtime: st.mtimeMs, v })
    if (this.parsed.size > 4000) this.parsed.delete(this.parsed.keys().next().value as string)
    return v
  }
  /** 한쪽 폴더(to-folderbot · from-folderbot)의 이번 달·지난달 편지 */
  private side(peer: PeerDef, side: 'to-folderbot' | 'from-folderbot'): LetterView[] {
    const dir = join(this.abs(peer.mailbox), side)
    return letterFiles(dir, false, new Date(this.now())).map((f) => this.viewOf(f, side === 'to-folderbot' ? 'in' : 'out', peer)).filter((x): x is LetterView => !!x)
  }
  /** 배달 기록 — 주인 호스트에만 있다(다른 맥이면 비어 있다) */
  private ledgerOf(peerId: string): Map<string, { state: string; at: number }> {
    const m = new Map<string, { state: string; at: number }>()
    try { for (const line of readFileSync(join(this.d.dataDir, 'bridges', peerId, 'delivered.jsonl'), 'utf8').split('\n')) { try { const j = JSON.parse(line) as { id?: string; state?: string; at?: string }; if (j.id) m.set(normId(j.id), { state: String(j.state ?? ''), at: Date.parse(String(j.at ?? '')) || 0 }) } catch { /* */ } } } catch { /* 기록 없음 */ }
    return m
  }
  /** 상대 커서 — `cursors/<상대>.json` 과 `cursors/<상대>/*.json` 중 가장 늦게 쓴 것 */
  peerCursor(peer: PeerDef): { last?: string; at?: number } | null {
    const cdir = join(this.abs(peer.mailbox), 'cursors')
    const cands: string[] = [join(cdir, `${peer.id}.json`)]
    // 덮어쓰기를 못 하는 상대는 매번 새 커서 파일을 만든다(README) — 쌓여도 가장 늦게 쓴 하나만 읽는다(2026-10-19 검토)
    try {
      let newest = '', nm = 0
      for (const n of readdirSync(join(cdir, peer.id))) if (n.endsWith('.json') && !n.startsWith('.')) { let m = 0; try { m = statSync(join(cdir, peer.id, n)).mtimeMs } catch { continue } if (m > nm || (m === nm && n > newest)) { nm = m; newest = n } }
      if (newest) cands.push(join(cdir, peer.id, newest))
    } catch { /* */ }
    let best: { last?: string; at?: number; m: number } | null = null
    for (const f of cands) {
      let m = 0; try { m = statSync(f).mtimeMs } catch { continue }
      try { const j = JSON.parse(readFileSync(f, 'utf8')) as { last?: string; at?: string }; const at = Date.parse(String(j.at ?? '')) || m; if (!best || at > (best.at ?? 0)) best = { ...(j.last ? { last: normId(j.last) } : {}), at, m } } catch { /* 반쯤 쓴 커서 */ }
    }
    return best ? { ...(best.last ? { last: best.last } : {}), at: best.at } : null
  }
  /** 사람이 스레드를 마지막으로 연 시각 — 앱 데이터에(기기가 여럿이어도 하나). 처음이면 지금으로 적는다(옛 편지를 «안 읽음» 으로 쏟지 않게) */
  private seenAt(peerId: string): number {
    const f = join(this.d.dataDir, 'bridges', peerId, 'seen.json')
    try { const n = Number((JSON.parse(readFileSync(f, 'utf8')) as { at?: number }).at); if (Number.isFinite(n)) return n } catch { /* */ }
    this.markSeen(peerId); return this.now()
  }
  markSeen(peerId: string): void {
    const dir = join(this.d.dataDir, 'bridges', peerId)
    try { mkdirSync(dir, { recursive: true }); const tmp = join(dir, `.seen.${process.pid}.tmp`); writeFileSync(tmp, JSON.stringify({ at: this.now() })); renameSync(tmp, join(dir, 'seen.json')) } catch (e) { this.d.log(`연결 읽음 표시를 못 썼어요 · ${(e as Error).message}`) }
  }
  private viewPeer(p: PeerDef, all: LetterView[]): PeerView {
    const box = this.boxes.get(p.id)
    const cur = this.peerCursor(p)
    // 화면에 보이는 «마지막 신호» 는 상대가 실제로 남긴 것(커서·편지)만 — 끊김 판정의 «연 시각» 기준선은 보이지 않는다
    const sig = Math.max(cur?.at ?? 0, box?.lastLetterAt ?? 0, ...all.filter((l) => l.dir === 'in').map((l) => l.at), 0)
    const last = orderThread(all, 1)[0]
    return { id: p.id, name: p.name, icon: p.icon, trust: p.trust, mailbox: p.mailbox, ...(p.host ? { host: p.host } : {}), owner: !!box, deliverBot: p.deliver.bot, deliverSession: p.deliver.session, maySend: p.maySend, ...(p.expectEveryMs ? { expectEveryMs: p.expectEveryMs } : {}), stale: box ? box.stale : !!(p.expectEveryMs && sig && this.now() - sig > p.expectEveryMs), lastSignal: sig || null, unread: unreadOf(all, this.seenAt(p.id), (id) => this.firstSeen.get(id)), letters: all.length, ...(last ? { last: { ...(last.title ? { title: last.title } : {}), at: last.at, dir: last.dir } } : {}), inbound: !!p.inbound, wake: !!p.wake }
  }
  /**
   * 들어온 편지에 배달 표시를 붙인다. 안 읽음은 «쓴 시각» 이 아니라 «도착한 시각» 으로 센다 — Dropbox 가 늦게 내려 준 편지가
   * 사람이 스레드를 연 뒤에 왔으면 안 읽음이다(2026-10-19 검토). 도착 = 배달 기록 시각, 기록이 없으면 이 호스트가 처음 본 시각.
   */
  private firstSeen = new Map<string, number>()
  /** 이 실행에서 한 번 훑은 상대 — 처음 훑을 때 이미 있던 편지는 «쓴 시각» 에 본 것으로 적는다(다시 켤 때마다 옛 편지가 안 읽음으로 쏟아지지 않게) */
  private primed = new Set<string>()
  private inbound(p: PeerDef): LetterView[] {
    const led = this.ledgerOf(p.id), t = this.now(), warm = this.primed.has(p.id)
    const out = this.side(p, 'to-folderbot').map((l) => {
      if (!this.firstSeen.has(l.id)) { this.firstSeen.set(l.id, warm ? t : l.at); if (this.firstSeen.size > 5000) this.firstSeen.delete(this.firstSeen.keys().next().value as string) }
      const e = led.get(l.id); return e ? { ...l, ...(e.state === 'baseline' ? { baseline: true } : { delivered: e.at }) } : l
    })
    this.primed.add(p.id)
    return out
  }
  /** 레일 «연결» 절 — 켜진 연결마다 한 줄 */
  views(): PeerView[] { return this.cfg.peers.filter((p) => p.enabled).map((p) => this.viewPeer(p, [...this.inbound(p), ...this.side(p, 'from-folderbot')])) }
  /** 편지 스레드 — 오간 편지만 시간순(채널 세션의 생각·도구 줄과 따로). 배달·읽음 표시를 붙인다 */
  thread(peerId: string, limit = 150): { peer: PeerView; letters: LetterView[] } | null {
    const p = this.peer(peerId); if (!p || !p.enabled) return null
    const ins = this.inbound(p)
    const outs = markRead(this.side(p, 'from-folderbot'), this.peerCursor(p)).map((l) => { const w = this.wakes.get(l.id); return w ? { ...l, wake: w } : l })
    const all = [...ins, ...outs]
    return { peer: this.viewPeer(p, all), letters: orderThread(all, limit) }
  }

  /**
   * BQ-10 · 새 연결 — 설정 › 연결 마법사(목업 ②A). **사람이 누른 일**이라 폴더를 만든다(편지·루틴 턴은 여기 못 온다 — 화면 API 뿐).
   * ① 우편함 폴더 넷(우편함 · to-folderbot · from-folderbot · cursors) ② README(이미 있으면 그대로 둔다 — 사람이 고친 규약이 정본)
   * ③ `.claude/bridges.yml` 에 한 줄(주석·다른 키 보존 · 임시 파일 → 이름 바꾸기) ④ 다시 읽기.
   * ⛔ 키·토큰 파일은 만들지 않는다 — 자리만 알려 준다(평문 키를 앱이 만들지 않는다).
   */
  create(b: NewBridge, o: { deliverName: string; port?: number }): { mailbox: string; created: string[]; readme: string; readmeKept: boolean; configFile: string } {
    const problems = newBridgeProblems(b, { ids: this.cfg.peers.map((p) => p.id), mailboxes: this.cfg.peers.map((p) => p.mailbox) })
    if (problems.length) throw new Error(problems.join(' · '))
    const f = this.configFile()
    const before = existsSync(f) ? readFileSync(f, 'utf8') : null
    if (before !== null && parseBridges(before).errors.some((e) => /못 읽었어요/.test(e))) throw new Error('지금 .claude/bridges.yml 을 못 읽어요 — 파일을 먼저 고쳐 주세요(덮어쓰지 않았어요)')
    const next = addBridgeYaml(before, b)
    const mb = this.abs(b.mailbox.trim().replace(/\/+$/, ''))
    const created: string[] = []
    for (const d of [mb, join(mb, 'to-folderbot'), join(mb, 'from-folderbot'), join(mb, 'cursors')]) if (!existsSync(d)) { mkdirSync(d, { recursive: true }); created.push(relative(this.d.root, d)) }
    const readme = join(mb, 'README.md')
    const readmeKept = existsSync(readme)
    if (!readmeKept) { const tmp = join(mb, `.README.md.${process.pid}.tmp`); writeFileSync(tmp, mailboxReadme(b, { deliverName: o.deliverName, port: o.port, now: new Date(this.now()) })); renameSync(tmp, readme) }
    mkdirSync(dirname(f), { recursive: true })
    const tmp = join(dirname(f), `.bridges.yml.${process.pid}.tmp`); writeFileSync(tmp, next); renameSync(tmp, f)
    this.d.log(`연결 «${b.name}» 을 만들었어요 · 우편함 ${b.mailbox}${readmeKept ? ' · README 는 있던 것을 그대로' : ''}`)
    this.reload()
    return { mailbox: relative(this.d.root, mb), created, readme: relative(this.d.root, readme), readmeKept, configFile: relative(this.d.root, f) }
  }

  /** 화면·도구용 — 연결마다 주인인지, 배달 기록 수 */
  status(): { id: string; name: string; icon: string; owner: boolean; delivered: number; mailbox: string; trust: string }[] {
    return this.cfg.peers.map((p) => ({ id: p.id, name: p.name, icon: p.icon, owner: this.boxes.has(p.id), delivered: this.boxes.get(p.id)?.delivered.size ?? 0, mailbox: p.mailbox, trust: p.trust }))
  }
}

/** 편지 후보 파일 — 폴더 바로 아래와 그 아래 폴더 한 단계(월 폴더). `full` 이 아니면 이번 달·지난달 폴더만 */
export function letterFiles(dir: string, full: boolean, now: Date): string[] {
  const out: string[] = []
  let names: string[] = []
  try { names = readdirSync(dir) } catch { return out }
  const cur = monthOf('', now), prev = monthOf('', new Date(now.getFullYear(), now.getMonth() - 1, 15))
  for (const n of names) {
    const p = join(dir, n)
    let st; try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) {
      if (n.startsWith('.')) continue
      if (!full && /^\d{4}-\d{2}$/.test(n) && n !== cur && n !== prev) continue
      let sub: string[] = []; try { sub = readdirSync(p) } catch { continue }
      for (const m of sub) if (!ignoredLetterName(m)) out.push(join(p, m))
    } else if (!ignoredLetterName(n)) out.push(p)
  }
  return out
}
