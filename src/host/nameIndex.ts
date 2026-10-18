import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SKIP_DIRS } from './files'

/**
 * 🔴 **파일 이름 색인 (2026-10-18 Dave: «파일 칸을 불러올 때마다 오래 걸리는 폴더가 있어»)**
 *
 * 봇 답을 그릴 때마다 화면이 «이 이름 있어?» 를 묻는다(`POST /exists`). 경로 없이 이름만 적힌 것(`Panel.tsx`)이
 * 봇 폴더에 없으면 종전에는 **볼트 전체를 동기로 훑었다** — 맥미니 볼트 4,069 폴더에 이름 하나 약 0.1초, 한 번에
 * 최대 40개. 그동안 호스트가 통째로 멈춰 파일 칸의 폴더 읽기(`ls`)가 1~3초씩 줄을 섰다
 * (호스트 기록 10/17~18 «멈췄어요» 원인 432건 중 397건이 이것).
 *
 * 그래서 **훑기는 한 번, 찾기는 표에서** 한다.
 * - 바탕 폴더마다 «이름(NFC·소문자) → 경로들» 표를 **비동기로** 만든다 — 만드는 동안에도 호스트는 다른 요청을 받는다.
 * - 폴더 감시가 뭔가 바뀌었다고 하면(`touch`) 세대가 오른다. 요청이 온 **뒤에 시작한** 표만 믿는다 —
 *   봇이 방금 만든 파일을 바로 말해도 칩이 된다. 동시에 온 요청은 같은 표 짓기를 함께 기다린다.
 * - 감시가 안 닿는 곳(연결 리포)도 있으니 `TTL_MS` 가 지나면 다시 짓는다.
 * - 훑는 규칙은 종전 `findFiles` 와 같다: SKIP·점 폴더 제외 · 깊이 8 · 이름당 앞 5개.
 */
export const TTL_MS = 60_000
const DEPTH = 8
const LIMIT = 5

type Table = Map<string, string[]>
interface Entry { gen: number; at: number; table?: Table; building?: Promise<Table>; buildGen?: number }

const key = (name: string) => name.normalize('NFC').toLowerCase()

/** 한 바탕 폴더를 비동기로 훑어 표를 만든다. 순서는 종전 동기 훑기와 같은 깊이 우선 */
export async function buildTable(base: string, depth = DEPTH): Promise<Table> {
  const table: Table = new Map()
  const walk = async (dir: string, d: number): Promise<void> => {
    if (d < 0) return
    let ents; try { ents = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(join(dir, e.name), d - 1) }
      else { const k = key(e.name); const list = table.get(k); if (!list) table.set(k, [join(dir, e.name)]); else if (list.length < LIMIT) list.push(join(dir, e.name)) }
    }
  }
  await walk(base, depth)
  return table
}

export class NameIndex {
  private gen = 0
  private m = new Map<string, Entry>()
  ttlMs = TTL_MS
  /** 지은 횟수 — 검사용 */
  builds = 0
  /** 어딘가 파일이 바뀌었다 — 다음 찾기는 새 표를 기다린다 */
  touch(): void { this.gen++ }
  private async table(base: string): Promise<Table> {
    const want = this.gen; const now = Date.now()
    let e = this.m.get(base)
    if (!e) { e = { gen: -1, at: 0 }; this.m.set(base, e) }
    if (e.table && e.gen >= want && now - e.at < this.ttlMs) return e.table
    // 이 요청보다 뒤에 시작한 짓기가 이미 돌고 있으면 그걸 기다린다
    if (e.building && (e.buildGen ?? -1) >= want) return e.building
    const ent = e; const startGen = this.gen
    this.builds++
    const p = buildTable(base).then((t) => {
      if ((ent.gen ?? -1) <= startGen) { ent.table = t; ent.gen = startGen; ent.at = Date.now() }
      if (ent.building === p) ent.building = undefined
      return t
    }, (err) => { if (ent.building === p) ent.building = undefined; throw err })
    ent.building = p; ent.buildGen = startGen
    return p
  }
  /** 바탕 폴더 아래에서 이 이름인 파일들(절대 경로 · 앞 5개) */
  async find(base: string, name: string): Promise<string[]> {
    return (await this.table(base)).get(key(name)) ?? []
  }
}
