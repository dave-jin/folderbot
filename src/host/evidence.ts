import { existsSync, realpathSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { ChatItem } from '../core/types'
import type { CardBody, DoneLine, Evidence } from '../core/contextCard'

/**
 * 근거 확인 — 카드가 «끝냈다» 고 적은 줄에 붙은 근거를 **호스트가 코드로** 확인한다 (2026-11-01 · 맥락 상황판 1단계).
 * 인정하는 근거는 넷 — 지금 있는 파일(폴더 아님) · 커밋 해시 · 보낸 편지 파일 · 세션 기록의 **성공한** 도구 호출.
 * 모델이 쓴 근거는 믿지 않는다. 확인이 안 된 `done` 줄은 `settleCard` 가 `promised` 로 내린다.
 */
export interface EvidenceCtx { vaultRoot: string; items: ChatItem[] }

/** 할일이 우편함 — 보낸 편지는 여기 파일로 남는다 */
const LETTER_DIR = '2. Area/개인_비서실/할일이/싱크'
const COMMIT = /^[0-9a-f]{7,40}$/

/** 볼트 안에 실제로 있는 경로인가 — `../`·볼트 밖 절대경로·심링크로 빠지는 길은 거짓. 볼트 자신("." )도 거짓 */
function insideVault(root: string, ref: string, under?: string): string | null {
  if (!ref || ref.includes('\0')) return null
  let rootReal: string
  try { rootReal = realpathSync(resolve(root)) } catch { return null }
  const abs = resolve(rootReal, ref)
  if (!existsSync(abs)) return null
  let real: string
  try { real = realpathSync(abs) } catch { return null }
  const base = under ? resolve(rootReal, under) : rootReal
  const baseReal = existsSync(base) ? realpathSync(base) : base
  return real.startsWith(baseReal + sep) ? real : null
}

/** 지금 있는 **파일**만 — 폴더(봇 폴더처럼 늘 있는 것)는 근거가 아니다(최종 검토 4) */
function fileOk(ref: string, c: EvidenceCtx): boolean {
  const real = insideVault(c.vaultRoot, ref)
  if (!real) return false
  try { return statSync(real).isFile() } catch { return false }
}
function letterOk(ref: string, c: EvidenceCtx): boolean {
  const real = insideVault(c.vaultRoot, ref, LETTER_DIR)
  if (real) { try { return statSync(real).isFile() } catch { return false } }
  return fileOk(ref, c)   // 우편함 밖이면 file 과 같은 판정
}
function commitOk(ref: string, c: EvidenceCtx): boolean {
  if (!COMMIT.test(ref)) return false
  const re = new RegExp(`(?<![0-9a-f])${ref}`)
  return c.items.some((it) => it.kind === 'tool' && !it.isError && typeof it.result === 'string' && re.test(it.result))
}
function toolOk(ref: string, c: EvidenceCtx): boolean {
  const it = c.items.find((x) => x.id === ref)
  return !!it && it.kind === 'tool' && !it.isError
}

export function verifyEvidence(ev: Evidence, c: EvidenceCtx): boolean {
  switch (ev.kind) {
    case 'file': return fileOk(ev.ref, c)
    case 'letter': return letterOk(ev.ref, c)
    case 'commit': return commitOk(ev.ref, c)
    case 'tool': return toolOk(ev.ref, c)
    default: return false
  }
}

/** 확인된 근거만 남긴다. 하나도 안 남은 `done` 줄은 `promised` 로 — `done` 이 비면 `finished` 는 `claimed` 가 된다 */
export function settleCard(body: CardBody, c: EvidenceCtx): CardBody {
  const done: DoneLine[] = []
  const promised = [...body.promised]
  for (const d of body.done) {
    const ev = d.ev.filter((e) => verifyEvidence(e, c))
    if (ev.length) done.push({ text: d.text, ev })
    else if (!promised.includes(d.text)) promised.push(d.text)
  }
  const ending = done.length === 0 && body.ending === 'finished' ? 'claimed' : body.ending
  return { ...body, done, promised, ending }
}
