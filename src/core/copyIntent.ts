/**
 * ⌘C 가 «파일 복사» 인지 «편집기·브라우저에 양보» 인지 — 트리의 ⌘C 핸들러가 부른다 (Y · 2026-09-22).
 *
 * 🔴 Dave 실기기 보고: *«여러 개는 되는데 md 한 개만 복사·붙여넣기가 안 된다»*. 원인 — md 를 트리에서 누르면 문서 창의
 *    편집기(CodeMirror)가 열리며 **초점을 가져간다**. 그 상태의 ⌘C 는 «글 쓰는 중이면 양보» 규칙에 걸려 파일 복사가
 *    안 되고, 편집기는 고른 글이 없어 아무것도 안 올린다. png·pdf(뷰어)·여러 개(문서가 안 열림)는 초점이 트리에 남아 됐다.
 *
 * 규칙 — 사람이 마지막으로 만진 것이 어디냐로 가른다.
 *   · 트리 행에 초점(편집 칸 아님) → 파일 복사
 *   · 편집기에 초점인데 **트리 행을 누른 뒤 문서 창을 한 번도 안 만졌다**(`armed`) 그리고 고른 글이 없다 → 파일 복사.
 *     초점은 편집기가 «가져간» 것이지 사람이 «준» 것이 아니다.
 *   · 문서 창을 클릭·타이핑한 순간부터(`armed` 해제) 또는 글을 골랐으면 → 양보. 편집기의 ⌘C(빈 선택이면 줄 복사)가 이긴다.
 */
export function copyIntent(a: { picked: number; hasSelection: boolean; inTree: boolean; editable: boolean; inDoc: boolean; armed: boolean }): 'files' | 'yield' {
  if (!a.picked || a.hasSelection) return 'yield'
  if (a.inTree && !a.editable) return 'files'
  if (a.editable && a.inDoc && a.armed) return 'files'
  return 'yield'
}
