/**
 * 보여 주기 보기 — 강의 · 자문 자리나 화면 공유 때 켜는 보기 (2026-11-12 Dave «화면을 띄워 보여 주기» · 11/15 카드 답 셋:
 * 입력칸 «남긴다» · 승인 카드 «보이고 경로만 가린다» · 폰 «폰에도 넣는다»). 켜면 다른 폴더의 이름과 작업 흔적이 화면에서 사라지고
 * 지금 세션의 말과 답이 크게 남는다.
 *
 * 이 파일은 **화면 없이 잴 수 있는 것**만 둔다 — 켬/끔 저장소와, 가린 승인 카드의 한 줄.
 * 🔴 **기억하지 않는다.** 앱을 다시 열면 꺼져 있다 — 보여 주기는 그 자리의 일이고, 켜진 채로 다시 열리면 «봇 목록이 왜 없지» 가 된다.
 */
let on = false
const subs = new Set<() => void>()
export const presentOn = (): boolean => on
export function setPresent(v: boolean): void { if (on === v) return; on = v; for (const f of [...subs]) f() }
export function subscribePresent(f: () => void): () => void { subs.add(f); return () => { subs.delete(f) } }

/**
 * 가린 승인 카드의 한 줄 — **명령 · 경로 · 주소를 싣지 않는다.**
 * ⚠ CLI 가 준 설명(`description`)은 쓰지 않는다 — «Run ls /Users/…» 처럼 명령과 경로가 그대로 들어 있을 때가 있다.
 *    파일은 이름만 말한다(파일 칩과 같은 수준). 폴더 경로는 볼트 구조를 드러낸다.
 */
export function permLinePlain(toolName: string, displayName: string, input: Record<string, unknown>): string {
  if (typeof input.command === 'string') return '명령을 실행해요'
  if (typeof input.file_path === 'string') { const name = input.file_path.split('/').pop() || '파일'; return `파일을 ${/Write|Edit/.test(toolName) ? '고쳐요' : '읽어요'} — ${name}` }
  if (typeof input.url === 'string') return '웹 주소를 열어요'
  return `${displayName} 를 써요`
}
