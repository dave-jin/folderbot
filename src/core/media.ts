/**
 * 말풍선 안 미디어 카드 — **무엇을 카드로 펼칠지**의 판정 (2026-11-12 Dave: «파일이나 이미지 동영상 등은 채팅 창 안에서 바로 재생도 할 수 있으면»).
 *
 * 화면(`client/mediaCards`)은 답의 블록(`p`·`li`)을 훑어 여기에 넘기고, 돌려받은 계획대로 그리기만 한다.
 *
 * 규칙(목업 «언제 카드로 펼치나»):
 *   ① **혼자 선 블록만** — 블록의 글이 파일 참조와 구분 글자뿐일 때. 문장 속 파일 이름은 칩 그대로(링크 박스와 같은 규칙).
 *   ② 그림은 이웃한 것끼리 **한 묶음**(갤러리)이고 묶음 하나가 카드 하나다. 영상·음성·PDF 는 하나가 카드 하나.
 *   ③ 답 하나에 카드는 `cap` 개까지 — 넘는 블록은 손대지 않는다(칩으로 남아 있어 눌러 열 수 있다). 카드가 답의 글을 밀어내면 안 된다.
 *   ④ 폴더 · 여러 곳에 걸린 이름 · 모르는 종류가 하나라도 섞인 블록은 통째로 둔다 — 반만 카드로 바꾸면 줄이 깨진다.
 */
export type MediaKind = 'image' | 'video' | 'audio' | 'pdf'

const EXT: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  mp4: 'video', mov: 'video', webm: 'video', m4v: 'video',
  mp3: 'audio', m4a: 'audio', wav: 'audio', aac: 'audio', ogg: 'audio',
  pdf: 'pdf'
}
/** 확장자로만 본다 — 내용은 열어 보지 않는다(호스트 `kindOf` 와 같은 목록이어야 문서 창도 같은 것을 연다) */
export function mediaKind(name: string): MediaKind | null {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(String(name ?? '').trim())
  return m ? EXT[m[1].toLowerCase()] ?? null : null
}

export interface MediaRef { rel: string; kind: MediaKind | null; /** 같은 이름이 여러 곳에 있다 — 어느 것인지 모른다 */ multi?: boolean }
export interface MediaBlock {
  refs: MediaRef[]
  /** 블록의 글이 참조와 구분 글자(공백 · 쉼표 · 가운뎃점)뿐이다 */
  only: boolean
  /** 앞 블록 바로 다음 형제다 — 그림 묶음을 이어 붙일 수 있다 */
  next?: boolean
}
export interface MediaCard {
  type: 'image' | 'gallery' | 'video' | 'audio' | 'pdf'
  rels: string[]
  /** 이 카드가 놓일 블록(번호) */
  at: number
}
export interface MediaPlan { cards: MediaCard[]; /** 다른 블록의 묶음에 합쳐져 사라지는 블록 */ gone: number[] }

export const MEDIA_CAP = 4

const qualifies = (b: MediaBlock) => b.only && b.refs.length > 0 && b.refs.every((r) => r.kind && !r.multi)

export function planCards(blocks: MediaBlock[], cap = MEDIA_CAP): MediaPlan {
  const cards: MediaCard[] = []; const gone: number[] = []
  let prevOk = -2   // 바로 앞에서 카드가 된 블록 번호 — 이웃 판정용
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (!qualifies(b)) continue
    const allImg = b.refs.every((r) => r.kind === 'image')
    const last = cards[cards.length - 1]
    // 이웃한 그림 블록은 앞 묶음에 붙는다 — 카드 수가 늘지 않으니 cap 과 상관없다
    if (allImg && b.next && prevOk === i - 1 && last && (last.type === 'image' || last.type === 'gallery')) {
      last.rels.push(...b.refs.map((r) => r.rel)); last.type = 'gallery'; gone.push(i); prevOk = i; continue
    }
    // 블록 하나는 통째로 — 그림은 이어진 것끼리 한 장, 나머지는 하나씩
    const mine: MediaCard[] = []
    for (const r of b.refs) {
      const tail = mine[mine.length - 1]
      if (r.kind === 'image' && tail && (tail.type === 'image' || tail.type === 'gallery')) { tail.rels.push(r.rel); tail.type = 'gallery' }
      else mine.push({ type: r.kind as MediaCard['type'], rels: [r.rel], at: i })
    }
    if (cards.length + mine.length > cap) break   // 넘치면 여기서 멈춘다 — 뒤는 칩 그대로
    cards.push(...mine); prevOk = i
  }
  return { cards, gone }
}
