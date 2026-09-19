/**
 * 발신 기기 컨텍스트 (J · 2026-09-19) — 메시지 앞에 붙는 `<folderbot-client …/>` 한 줄. 에이전트가 «어느 기기에서 온 질문인가» 를 알고
 * 그에 맞게 행동한다(원격이면 rondo_open 은 그 기기의 문서 창 · 폰이면 Finder 를 열자고 하지 않는다).
 * ⛔ 채팅에는 보이지 않는다 — 사람의 글은 그대로 두고, 워커에게 보내는 글에만 앞세운다.
 */
export type ClientTier = 'desktop' | 'phone' | 'browser'
export interface ClientCtx {
  origin: 'host' | 'remote'
  device: string
  tier: ClientTier
  touch: boolean
  canOpenOnDevice: boolean
  openMode: '' | 'sync' | 'download'
}
const attr = (v: string | boolean) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
export function clientBlock(c: ClientCtx): string {
  return `<folderbot-client origin="${c.origin}" device="${attr(c.device)}" tier="${c.tier}" touch="${c.touch}" canOpenOnDevice="${c.canOpenOnDevice}" openMode="${c.openMode || 'none'}"/>`
}
/** 워커로 가는 글 = 블록 + 빈 줄 + 사람의 글 */
export function withClient(text: string, c?: ClientCtx | null): string { return c ? `${clientBlock(c)}\n\n${text}` : text }
/** 블록을 읽는다(검사·스텁용) — 없으면 null. 사람의 글은 `rest` */
export function parseClientBlock(text: string): { ctx: ClientCtx; rest: string } | null {
  const m = /^<folderbot-client\s+([^>]*?)\/>\s*/.exec(text); if (!m) return null
  const a: Record<string, string> = {}; for (const mm of m[1].matchAll(/(\w+)="([^"]*)"/g)) a[mm[1]] = mm[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
  return { ctx: { origin: a.origin === 'host' ? 'host' : 'remote', device: a.device ?? '', tier: (a.tier as ClientTier) || 'browser', touch: a.touch === 'true', canOpenOnDevice: a.canOpenOnDevice === 'true', openMode: a.openMode === 'sync' || a.openMode === 'download' ? a.openMode : '' }, rest: text.slice(m[0].length) }
}
/** J-2 · 에이전트 규칙 — 볼트 CLAUDE.md 자동 생성부와 시스템 프롬프트에 같은 글 */
export const DEVICE_RULES_MD = `## 발신 기기 (Folder Bot)
- 메시지 맨 앞의 \`<folderbot-client …/>\` 는 **질문이 온 기기**다. 답에 되읊지 마라.
- \`origin="remote"\` 면 사람은 호스트 맥 앞에 없다. 파일을 보여 주려면 \`rondo_open\`(그 기기의 문서 창에서 열린다)을 쓰고, Finder·외부 앱을 여는 \`rondo_reveal\` 은 \`canOpenOnDevice="true"\` 일 때만 써라.
- \`tier="phone"\` 이면 Finder·외부 앱 얘기는 하지 말고 경로만 말해라. 긴 표 대신 짧은 목록으로 답해라.
- \`origin="host"\` 면 지금까지처럼 한다.`
