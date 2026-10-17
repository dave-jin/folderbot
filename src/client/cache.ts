import type { ChatItem } from '../core/types'

/**
 * DA · 원격 맥의 디스크 캐시 (2026-10-17 Dave: *«원격 데스크톱 형태로 설치한 경우에는 캐시 형태로 정보들을 미리 다 다운로드 받아두면
 *      더 빠르게 동작하지 않을까?»* · 범위는 «전부 미리 받기»).
 *
 * 왜 — 원격 앱은 켤 때마다 대화를 맥미니에서 처음부터 받았고, 끄면 메모리째 사라졌다. 그래서 «안 열어 본 세션» 을 누를 때마다
 *   대화 전체가 tailnet 을 건너왔다(Dave 가 가장 오래 기다린다고 꼽은 순간). 이제 받은 대화·문서를 이 기기의 IndexedDB 에 두고,
 *   켜면 그것부터 보인 뒤 판(`ver`)만 내밀어 «그대로» 인지 묻는다.
 *
 * ⚠ **누가 쓰나** — 원격 데스크톱 앱(`folderbotDesktop` 이 있고 `device.main` 이 아님)만 쓴다. 맥미니 자신(로컬)은 이미 빠르고,
 *    폰은 데이터·저장 공간을 아낀다(번들 계약). 읽기는 들어 있으면 누구나 한다 — 쓰는 쪽이 원격 데스크톱뿐이라 결과가 같다.
 * ⚠ 저장소는 오리진(호스트 주소)마다 따로다 — 호스트가 둘이어도 섞이지 않는다.
 * ⛔ 캐시는 «먼저 보여 줄 것» 일 뿐이다. 정답은 늘 호스트다 — 판이 다르면 받은 것으로 갈아 끼운다.
 */

const DB = 'fb-cache'
const V = 1
export interface ChatRec { sid: string; ver: string; items: ChatItem[]; at: number }
export interface DocRec { key: string; ver: string; data: unknown; at: number }
/** 문서는 최근 연 것 300개까지 — 넘치면 오래된 것부터 지운다(대화는 세션 목록이 정한다) */
export const DOC_LIMIT = 300

let dbp: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null)
      const r = indexedDB.open(DB, V)
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('chats')) d.createObjectStore('chats', { keyPath: 'sid' }); if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'key' }).createIndex('at', 'at') }
      r.onsuccess = () => res(r.result)
      r.onerror = () => res(null); r.onblocked = () => res(null)
    } catch { res(null) }   // 저장이 막힌 창 — 캐시 없이 종전대로
  })
  return dbp
}
const done = (t: IDBTransaction) => new Promise<void>((res) => { t.oncomplete = () => res(); t.onerror = () => res(); t.onabort = () => res() })
const req = <T>(r: IDBRequest<T>) => new Promise<T | undefined>((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(undefined) })

/** 이 기기가 캐시를 «쓰는» 기기인가 — 원격 데스크톱 앱만 */
export function cacheWriter(main: boolean): boolean {
  const w = window as unknown as { folderbotDesktop?: unknown; __fbCacheOn?: boolean }
  return !!w.__fbCacheOn || (!!w.folderbotDesktop && !main)   // `__fbCacheOn` 은 스모크 손잡이(헤드리스엔 데스크톱 다리가 없다)
}

export async function readChats(): Promise<ChatRec[]> {
  const d = await db(); if (!d) return []
  try { return (await req(d.transaction('chats').objectStore('chats').getAll() as IDBRequest<ChatRec[]>)) ?? [] } catch { return [] }
}
export async function writeChats(put: ChatRec[], del: string[] = []): Promise<void> {
  if (!put.length && !del.length) return
  const d = await db(); if (!d) return
  try { const t = d.transaction('chats', 'readwrite'); const o = t.objectStore('chats'); for (const r of put) o.put(r); for (const k of del) o.delete(k); await done(t) } catch { /* 가득 참 등 — 캐시는 없어도 된다 */ }
}
export async function readDoc(key: string): Promise<DocRec | undefined> {
  const d = await db(); if (!d) return undefined
  try { return await req(d.transaction('docs').objectStore('docs').get(key) as IDBRequest<DocRec>) } catch { return undefined }
}
export async function writeDoc(rec: DocRec): Promise<void> {
  const d = await db(); if (!d) return
  try {
    const t = d.transaction('docs', 'readwrite'); const o = t.objectStore('docs'); o.put(rec)
    // 넘친 만큼만 오래된 것부터 — 몸통을 다 읽지 않게 수만 세고 «at» 순서로 지운다
    // ⚠ 콜백 안에서 이어 간다 — await 로 끊으면 트랜잭션이 먼저 닫힐 수 있다
    const cnt = o.count(); cnt.onsuccess = () => {
      let left = cnt.result - DOC_LIMIT; if (left <= 0) return
      const c = o.index('at').openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur || left <= 0) return; cur.delete(); left--; cur.continue() }
    }
    await done(t)
  } catch { /* */ }
}
export async function dropDoc(key: string): Promise<void> {
  const d = await db(); if (!d) return
  try { const t = d.transaction('docs', 'readwrite'); t.objectStore('docs').delete(key); await done(t) } catch { /* */ }
}

/**
 * 저장할 판 — **아직 쓰는 중인 줄(streaming)이 있으면 판을 비운다.** 판이 같다고 «그대로» 를 받으면
 * 반쯤 쓴 답이 다음 실행에 그대로 남는다. 판이 비면 다음에 켤 때 통째로 다시 받는다.
 */
export function storeVer(items: ChatItem[], ver: string | undefined): string {
  if (!ver) return ''
  return items.some((x) => (x as { streaming?: boolean }).streaming) ? '' : ver
}

/** 같은 일을 n 개씩만 나란히 — 미리 받기가 지금 누른 세션의 요청을 밀어내지 않게 */
export async function pool<T>(list: T[], n: number, f: (x: T) => Promise<unknown>, stop?: () => boolean): Promise<void> {
  let i = 0
  const run = async () => { while (i < list.length) { if (stop?.()) return; const x = list[i++]; try { await f(x) } catch { /* 하나 실패해도 나머지는 받는다 */ } } }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, run))
}
