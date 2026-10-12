/**
 * CF-1 · 대화의 «판» 한 줄 — 다시 붙을 때 화면이 들고 있는 판과 같으면 호스트는 대화를 다시 보내지 않는다(2026-10-12 실측 A6).
 * 폰을 잠갔다 켤 때마다 본 대화를 전부 다시 받았다(264KB · 원문 471KB) — 그동안 안 바뀐 대화가 대부분이었다.
 * ⚠ 끝 몇 줄의 내용까지 넣는다 — 도는 도구 줄은 새 줄 없이 «제자리 교체» 로 바뀌기 때문이다(길이·시각만으론 못 잡는다).
 */
export function chatVer(items: readonly unknown[], state: string, lastActivity: number, pending: number): string {
  const tail = JSON.stringify(items.slice(-6))
  let h = 5381
  for (let i = 0; i < tail.length; i++) h = ((h << 5) + h + tail.charCodeAt(i)) | 0
  return `${items.length}.${lastActivity}.${state}.${pending}.${(h >>> 0).toString(36)}`
}
