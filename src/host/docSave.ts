import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, basename } from 'node:path'
import { atomicWrite, dataDir } from './paths'

/**
 * 문서 창 저장 — «연 판 위에만 쓴다» (BF · 2026-09-27 Dave).
 *
 * 🔴 왜: 문서 창이 **남의 파일을 덮었다.** 12:34 Note-App state.md ← Folder Bot state 글, 12:41 Folder Bot state.md ←
 *    rondo_open 으로 띄운 다른 문서, 16:06 Folder Bot state.md ← 같은 폴더 todo.md(바이트까지 같게). 화면이 «어느 파일을
 *    고쳤나» 를 저장 순간의 화면 상태(지금 봇·지금 탭)에서 읽어서, 봇·탭을 바꾸는 틈에 옛 글이 새 경로로 갔다.
 *    호스트는 받은 글을 받은 경로에 그대로 썼다 — 그 글이 그 파일에서 나왔는지 물을 길이 없었다.
 *
 * 상용 편집기의 답을 따른다 — VS Code 의 etag(«파일이 더 새롭습니다»), Dropbox 의 «충돌 사본».
 * · 문서를 열 때 받은 **판(`ver` = 바이트 sha256 앞 16자)** 을 저장에 함께 보낸다(`base`).
 * · 지금 디스크의 판이 `base` 와 다르면 **원본은 건드리지 않고** 내 글을 옆에 «충돌 사본» 으로 둔다 — 글은 한 자도 안 잃는다.
 *   동시 편집은 없다(Dave) — 합치지 않는다. 사람이 배너에서 «내 글로 바꾸기 / 지금 파일 유지» 를 고른다.
 * · 글이 디스크와 같으면 **쓰지 않는다** — 읽기만 해도 mtime 이 바뀌어 동기화·«봇이 수정» 배너가 돌던 것을 끊는다.
 * · 사본은 호스트가 장부(`conflicts.json`)에 적고, 필요 없어지면 스스로 휴지통(`.folderbot/trash/`)에 넣는다(`sweep`).
 */
export const verOf = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex').slice(0, 16)
/** 지금 디스크의 판 — 없으면 `none` */
export function fileVer(abs: string): string { return existsSync(abs) ? verOf(readFileSync(abs)) : 'none' }

export interface Clash { botId: string; rel: string; copy: string; at: number; hash: string }

/** 충돌 사본 장부 — 호스트 데이터 폴더에 산다(볼트를 더럽히지 않는다) */
export class ConflictBook {
  private list_: Clash[] = []
  constructor(private file = join(dataDir(), 'conflicts.json')) {
    try { const j = JSON.parse(readFileSync(file, 'utf8')); if (Array.isArray(j)) this.list_ = j } catch { /* 처음 */ }
  }
  all(): Clash[] { return [...this.list_] }
  of(botId: string, rel: string): Clash[] { return this.list_.filter((c) => c.botId === botId && c.rel === rel).sort((a, b) => b.at - a.at) }
  find(botId: string, copy: string): Clash | undefined { return this.list_.find((c) => c.botId === botId && c.copy === copy) }
  add(c: Clash): void { this.list_.push(c); this.save() }
  drop(c: Clash): void { this.list_ = this.list_.filter((x) => x !== c && !(x.botId === c.botId && x.copy === c.copy)); this.save() }
  private save(): void { try { atomicWrite(this.file, JSON.stringify(this.list_, null, 1)) } catch { /* 장부를 못 써도 사본 자체는 남는다 */ } }
}

const two = (n: number) => String(n).padStart(2, '0')
/** `dir/state (충돌 사본 09-27 16.40).md` — 같은 이름이 있으면 ` 2`, ` 3` … (덮어쓰지 않는다) */
export function copyRel(rel: string, now: number, taken: (rel: string) => boolean): string {
  const d = new Date(now); const ext = extname(rel); const dir = dirname(rel); const stem = basename(rel, ext)
  const tag = `충돌 사본 ${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}`
  for (let i = 1; ; i++) {
    const name = `${stem} (${tag}${i > 1 ? ` ${i}` : ''})${ext}`
    const r = dir === '.' ? name : `${dir}/${name}`
    if (!taken(r)) return r
  }
}

export type SaveResult = { ok: true; ver: string; same?: boolean } | { ok: false; conflict: { copy: string; ver: string } }

/**
 * 저장 한 번. `base` 가 없으면 예전처럼 그대로 쓴다(스크립트·검사가 픽스처를 깔 때 쓰는 길) — 문서 창은 언제나 `base` 를 보낸다.
 * ⚠ 판은 **바이트**로 잰다 — 화면이 받은 글(utf8 로 푼 것)이 아니라 디스크 그 자체와 대조한다.
 */
export function saveDoc(o: { botId: string; botAbs: string; rel: string; abs: string; text: string; base?: string; now?: number; book: ConflictBook }): SaveResult {
  const cur = fileVer(o.abs)
  const next = verOf(o.text)
  if (cur === next) return { ok: true, ver: cur, same: true }
  if (o.base !== undefined && o.base !== cur) {
    const copy = copyRel(o.rel, o.now ?? Date.now(), (r) => existsSync(join(o.botAbs, r)))
    atomicWrite(join(o.botAbs, copy), o.text)
    o.book.add({ botId: o.botId, rel: o.rel, copy, at: o.now ?? Date.now(), hash: next })
    return { ok: false, conflict: { copy, ver: cur } }
  }
  atomicWrite(o.abs, o.text)
  return { ok: true, ver: next }
}

/**
 * 필요 없어진 사본을 치운다 — 사람이 고를 일이 아닌 것만.
 * · 사본이 사라졌다 → 장부에서만 뺀다
 * · 사본을 **사람이 고쳤다**(판이 달라졌다) → 이제 그 사람의 파일이다. 장부에서 빼고 파일은 둔다
 * · 원본이 사본과 같아졌다(내 글이 이미 들어가 있다) → 휴지통
 * · 7일 지났다 → 휴지통(`.folderbot/trash/` · 되살릴 수 있다)
 */
export const CLASH_TTL = 7 * 24 * 3600_000
export function sweep(book: ConflictBook, botAbs: (botId: string) => string | null, trash: (botId: string, rel: string) => void, now = Date.now()): { trashed: string[]; kept: string[] } {
  const trashed: string[] = []; const kept: string[] = []
  for (const c of book.all()) {
    const abs = botAbs(c.botId)
    if (!abs) { book.drop(c); continue }
    const copyAbs = join(abs, c.copy)
    if (!existsSync(copyAbs)) { book.drop(c); continue }
    if (fileVer(copyAbs) !== c.hash) { book.drop(c); kept.push(c.copy); continue }
    if (fileVer(join(abs, c.rel)) === c.hash || now - c.at > CLASH_TTL) {
      try { trash(c.botId, c.copy); trashed.push(c.copy) } catch { /* 다음에 다시 */ continue }
      book.drop(c)
    }
  }
  return { trashed, kept }
}
