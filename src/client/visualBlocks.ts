import { VISUAL_LANGS, parseVisual, type ChartBlock, type CompareBlock, type StepsBlock } from '../core/visualBlocks'

/**
 * 그림으로 받는 답 — 블록 **그리기** (2026-11-12 Dave: *«다이어그램 형태로 보여주거나 … 보다 시각화된 커뮤니케이션»* · 시각화 채팅 둘째 묶음).
 *
 * 봇이 코드 울타리(`steps` · `compare` · `chart`)로 쓴 글을 카드로 바꾼다. 읽기와 판정은 `core/visualBlocks` 가 하고 여기는 그리기만 한다.
 *
 * 🔴 **DOM 을 직접 만든다** — 답 본문은 `marked` 가 만든 HTML 문자열이다(`mediaCards.ts` · `previews.ts` 와 같은 자리 · 같은 이유).
 *    글은 전부 `textContent` 로 넣는다. 봇이 쓴 글이 태그로 풀리는 길이 없다.
 * 🔴 **못 읽으면 코드 그대로 둔다** — 반만 읽어 그린 그림은 글보다 나쁘다. 코드 아래에 한 줄로 알린다.
 * ⚠ 스트리밍 중에는 부르지 않는다(반쯤 온 블록) · `Md` 가 그리기 **전에** 부른다(`useLayoutEffect`) — 코드였다가 카드로 바뀌는 프레임이 화면에 나가지 않는다.
 * ⚠ 봇 답은 `class` 를 못 싣는다(`core/sanitize`) — 답이 `.vblk` 를 흉내 낼 수 없다.
 */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }

function shell(kind: string, title: string, meta: string, toggle?: [string, string]): { box: HTMLElement; body: HTMLElement } {
  const box = el('div', `vblk vb-${kind}`); box.dataset.vb = kind
  const hd = el('div', 'vb-hd'); hd.appendChild(el('b', undefined, title)); if (meta) hd.appendChild(el('span', 'vb-m', meta)); hd.appendChild(el('span', 'vb-sp'))
  if (toggle) {
    // 그림과 표를 오간다 — 표는 값을 그대로 읽거나 긁어 갈 때 쓴다
    const b = el('button', 'vb-tg', toggle[0]); b.type = 'button'; b.setAttribute('aria-pressed', 'false')
    b.addEventListener('click', (e) => { e.preventDefault(); const on = box.classList.toggle('vb-astbl'); b.textContent = toggle[on ? 1 : 0]; b.setAttribute('aria-pressed', String(on)) })
    hd.appendChild(b)
  }
  const body = el('div', 'vb-bd'); box.append(hd, body)
  return { box, body }
}

function table(headRow: string[], rows: string[][]): HTMLTableElement {
  const t = el('table', 'vb-tbl'); const th = el('thead'); const tr = el('tr')
  for (const h of headRow) tr.appendChild(el('th', undefined, h)); th.appendChild(tr); t.appendChild(th)
  const tb = el('tbody'); for (const r of rows) { const x = el('tr'); r.forEach((c, i) => x.appendChild(el(i ? 'td' : 'th', undefined, c))); tb.appendChild(x) } t.appendChild(tb)
  return t
}

function stepsCard(b: StepsBlock): HTMLElement {
  const n = b.steps.length; const done = b.steps.filter((s) => s.state === 'done').length; const now = b.steps.some((s) => s.state === 'now')
  const meta = now ? `단계 ${n} · 지금 ${b.at}번째` : done === n ? `단계 ${n} · 모두 끝남` : `단계 ${n} · ${done}개 끝남`
  const { box, body } = shell('steps', b.title || '어디까지 왔나', meta)
  // 다섯까지는 가로 한 줄(목업) · 넘으면 세로 — 가로로 두면 이름이 한 글자씩 꺾인다
  const row = el('div', `vb-st${n > 5 ? ' vb-tall' : ''}`); row.setAttribute('role', 'list')
  for (const s of b.steps) {
    const it = el('div', `vb-s vb-${s.state}`); it.setAttribute('role', 'listitem')
    it.setAttribute('aria-label', `${s.label} — ${s.state === 'done' ? '끝남' : s.state === 'now' ? '지금' : '남음'}`)
    it.appendChild(el('i', 'vb-dot')); const tx = el('span', 'vb-tx'); tx.appendChild(el('b', undefined, s.label)); if (s.note) tx.appendChild(el('span', undefined, s.note)); it.appendChild(tx)
    row.appendChild(it)
  }
  body.appendChild(row)
  return box
}

function compareCard(b: CompareBlock): HTMLElement {
  const { box, body } = shell('compare', b.title || '안 비교', `${b.options.length}개`, ['표로 보기', '카드로 보기'])
  const grid = el('div', 'vb-cmp'); grid.dataset.n = String(b.options.length)
  for (const o of b.options) {
    const c = el('div', `vb-opt${o.rec ? ' vb-rec' : ''}`)
    const nm = el('div', 'vb-on'); nm.appendChild(el('b', undefined, o.name)); if (o.rec) nm.appendChild(el('em', undefined, '추천')); c.appendChild(nm)
    for (const k of b.keys) { if (o.rows[k] == null) continue; c.appendChild(el('span', 'vb-k', k)); c.appendChild(el('span', 'vb-v', o.rows[k])) }
    grid.appendChild(c)
  }
  body.append(grid, table(['', ...b.options.map((o) => (o.rec ? `${o.name} (추천)` : o.name))], b.keys.map((k) => [k, ...b.options.map((o) => o.rows[k] ?? '—')])))
  return box
}

function chartCard(b: ChartBlock): HTMLElement {
  const { box, body } = shell('chart', b.title || '숫자', `막대${b.unit ? ` · ${b.unit}` : ''}`, ['숫자 보기', '막대 보기'])
  const wrap = el('div', b.layout === 'rows' ? 'vb-rows' : 'vb-cols'); wrap.setAttribute('role', 'img')
  wrap.setAttribute('aria-label', b.points.map((p) => `${p.label} ${p.text}${b.unit}`).join(', '))
  for (const p of b.points) {
    const it = el('div', `vb-pt${p.soft ? ' vb-soft' : ''}${p.value < 0 ? ' vb-neg' : ''}`)
    const track = el('span', 'vb-track'); const bar = el('i', 'vb-bar'); bar.style.setProperty('--p', `${p.pct}%`); track.appendChild(bar)
    const val = el('span', 'vb-val', p.text); const lab = el('span', 'vb-lab', p.label); lab.title = p.label
    if (b.layout === 'rows') it.append(lab, track, val); else it.append(val, track, lab)
    wrap.appendChild(it)
  }
  body.append(wrap, table(['이름', b.unit ? `값(${b.unit})` : '값'], b.points.map((p) => [p.label, p.soft ? `${p.text} (미확정)` : p.text])))
  return box
}

const SEL = VISUAL_LANGS.map((l) => `pre > code.language-${l}`).join(', ')

/**
 * `pre > code.language-{steps|compare|chart}` 를 카드로 — 못 읽은 블록은 코드로 두고 아래에 한 줄. 같은 블록을 두 번 손대지 않는다.
 * `open` — 답이 울타리를 닫지 않고 끝났다(`core/visualBlocks.fenceOpen`). 마지막 코드 블록은 반쯤 온 것이라 그리지도 알리지도 않는다.
 */
export function renderVisualBlocks(root: HTMLElement, opts: { open?: boolean } = {}): number {
  let n = 0
  const half = opts.open ? Array.from(root.querySelectorAll<HTMLElement>('pre > code')).pop() : undefined
  for (const code of Array.from(root.querySelectorAll<HTMLElement>(SEL))) {
    if (code.dataset.vb) continue
    code.dataset.vb = '1'
    if (code === half) continue
    const lang = /language-([a-z]+)/.exec(code.className)?.[1] ?? ''
    const pre = code.parentElement as HTMLElement
    const wrap = pre.parentElement?.classList.contains('cbwrap') ? (pre.parentElement as HTMLElement) : pre
    const b = parseVisual(lang, code.textContent ?? '')
    if (!b) { wrap.insertAdjacentElement('afterend', el('div', 'vb-err', '블록을 못 읽었어요 — 코드 그대로 둡니다')); continue }
    wrap.replaceWith(b.kind === 'steps' ? stepsCard(b) : b.kind === 'compare' ? compareCard(b) : chartCard(b)); n++
  }
  return n
}
