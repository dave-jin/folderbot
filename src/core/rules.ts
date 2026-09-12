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
    harness: list(y?.harness, ['CLAUDE.md', '.claude/'])
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
