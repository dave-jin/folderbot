import { parse as parseYaml, stringify } from 'yaml'
import type { FolderRules } from './types'

export const PARA_PRESET: FolderRules = {
  preset: 'para',
  roles: {
    inbox: ['1. Inbox'],
    active: ['2. Projects/*', '3. Area/*'],
    reference: ['4. Resources'],
    archive: ['5. Archive']
  },
  naming: { project: '{YYYY}-{MM}_{이름}' },
  harness: ['CLAUDE.md', '.claude/']
}

export const JD_PRESET: FolderRules = {
  preset: 'johnny-decimal',
  roles: { inbox: ['00-09 System/00 Inbox'], active: ['*/*'], reference: [], archive: ['90-99 Archive'] },
  naming: {},
  harness: ['CLAUDE.md', '.claude/']
}

const FENCE = /```yaml\s+folder-rules\s*\n([\s\S]*?)\n```/

/** 루트 CLAUDE.md 본문에서 folder-rules 블록을 찾아 파싱한다. 없으면 null. */
export function parseRules(md: string): FolderRules | null {
  const m = FENCE.exec(md)
  if (!m) return null
  try {
    const y = parseYaml(m[1]) as Partial<FolderRules>
    return normalize(y)
  } catch {
    return null
  }
}

export function normalize(y: Partial<FolderRules> | null | undefined): FolderRules {
  const r = y?.roles ?? ({} as Partial<FolderRules['roles']>)
  const list = (v: unknown, d: string[]): string[] =>
    Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : d
  return {
    preset: (y?.preset as FolderRules['preset']) ?? 'custom',
    roles: {
      inbox: list(r.inbox, []),
      active: list(r.active, []),
      reference: list(r.reference, []),
      archive: list(r.archive, [])
    },
    naming: { project: y?.naming?.project },
    harness: list(y?.harness, ['CLAUDE.md', '.claude/']),
    ...(Array.isArray(y?.types) ? { types: (y!.types as unknown[]).map(String) } : {})
  }
}

/** 규칙 절(산문 + yaml 블록)을 만든다 — 루트 CLAUDE.md 에 덧붙일 텍스트 */
export function rulesSection(rules: FolderRules): string {
  const y = stringify({ preset: rules.preset, roles: rules.roles, naming: rules.naming, harness: rules.harness }).trimEnd()
  return [
    '## 폴더 규칙',
    '',
    '이 볼트의 폴더는 아래 규칙으로 정리한다. 오케스트레이터는 이 절을 읽고 행동하고, 사람은 이 절을 직접 고쳐도 된다.',
    '',
    `- **정리 대기(inbox)**: ${rules.roles.inbox.join(', ') || '(없음)'} — 정리하고 싶은 폴더·파일을 여기 넣는다. 오케스트레이터가 규칙대로 배정을 제안한다.`,
    `- **활성(active)**: ${rules.roles.active.join(', ') || '(없음)'} — 이 글롭에 맞는 폴더가 봇 후보다. 하네스(${rules.harness.join(', ')})가 있으면 바로 시작할 수 있다.`,
    `- **참조(reference)**: ${rules.roles.reference.join(', ') || '(없음)'} — 봇들이 읽기만 한다.`,
    `- **보관(archive)**: ${rules.roles.archive.join(', ') || '(없음)'} — 여기로 옮기면 봇은 은퇴한다.`,
    rules.naming.project ? `- **새 프로젝트 이름**: \`${rules.naming.project}\`` : '',
    '',
    '```yaml folder-rules',
    y,
    '```',
    ''
  ].filter((l) => l !== undefined).join('\n')
}

// 글롭(a/★ · ★/★ · a)이 상대 경로에 맞는가. 깊이는 글롭의 세그먼트 수와 같아야 한다.
export function globMatch(glob: string, rel: string): boolean {
  const g = glob.split('/').filter(Boolean)
  const p = rel.split('/').filter(Boolean)
  if (g.length !== p.length) return false
  return g.every((seg, i) => seg === '*' || seg === p[i])
}

// 글롭에서 "후보가 들어 있는 부모 폴더"를 뽑는다: "2. Projects/★" → "2. Projects"
export function globParents(globs: string[]): string[] {
  const out: string[] = []
  for (const g of globs) {
    const segs = g.split('/').filter(Boolean)
    if (segs.length >= 2 && segs[segs.length - 1] === '*') out.push(segs.slice(0, -1).join('/'))
  }
  return out
}

/**
 * AC · **칸(섹션) 자체는 봇이 될 수 없다** (2026-09-23 Dave: *«리소스와 아카이브도 프로젝트와 에어리어 처럼
 * 그 하단에 폴더명으로 생겨야해. 이렇게 폴더 전체가 생기면 안돼»* · 스크린샷 056 에서 `4. Resources` 통째로 봇이 됐다).
 *
 * 🔴 **봇은 「일 하나」에 붙는다.** 칸은 일이 아니라 **일들이 사는 자리**다 — 칸에 봇을 붙이면 트리에 수십 개
 *    프로젝트가 한꺼번에 딸려 들어오고, 레일에서는 상위 칸이 없어 「관제」 자리로 떠 버린다(056 이 그 모습이다).
 * 🔴 `2. Projects`·`3. Area` 는 글롭(`…/*`)의 **부모**라 자연히 막혀 있었는데, `4. Resources`·`5. Archive`·
 *    `1. Inbox` 는 글롭에 `/*` 가 없어 **칸 자체가 통과**했다. 판정을 여기 한곳에 둔다.
 */
export function sectionRoots(rules: FolderRules): string[] {
  const strip = (g: string) => g.replace(/\/\*+$/, '')
  // ⚠ `*/*` 같은 글롭의 부모는 `*` 다 — 그건 «칸» 이 아니라 «아무 폴더나» 라는 뜻이라 여기 넣지 않는다
  const out = new Set<string>(globParents(rules.roles.active).filter((g) => g && !g.includes('*')))
  for (const g of [...rules.roles.inbox, ...rules.roles.reference, ...rules.roles.archive]) {
    const r = strip(g).trim()
    if (r && !r.includes('*')) out.add(r)
  }
  return [...out]
}
/** 이 경로가 칸 자체인가 — 봇은 칸이 아니라 **그 안의 폴더**에 붙는다 */
export function isSectionRoot(rules: FolderRules, rel: string): boolean {
  const r = String(rel ?? '').replace(/^\/+|\/+$/g, '')
  return !!r && sectionRoots(rules).some((x) => x === r)
}

export function roleOf(rules: FolderRules, rel: string): 'inbox' | 'active' | 'reference' | 'archive' | null {
  const top = (list: string[]) => list.some((g) => rel === g || rel.startsWith(g.replace(/\/\*$/, '') + '/'))
  if (rules.roles.active.some((g) => globMatch(g, rel))) return 'active'
  if (top(rules.roles.inbox)) return 'inbox'
  if (top(rules.roles.archive)) return 'archive'
  if (top(rules.roles.reference)) return 'reference'
  return null
}

/** naming 템플릿 적용: `{YYYY}-{MM}_{이름}` */
export function applyNaming(tpl: string | undefined, name: string, d = new Date()): string {
  if (!tpl) return name
  const YYYY = String(d.getFullYear())
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const DD = String(d.getDate()).padStart(2, '0')
  return tpl.replace('{YYYY}', YYYY).replace('{MM}', MM).replace('{DD}', DD).replace('{이름}', name).replace('{name}', name)
}
