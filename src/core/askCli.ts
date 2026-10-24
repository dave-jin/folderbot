/**
 * 🔴 DA · `folderbot ask` CLI 의 순수한 몫 — 인자 읽기 · 기억 카드 · 응답 → 끝 상태 (2026-10-24 Dave «claude -p 처럼»).
 * 설계 `PARA/2. Area/제품_FolderBot/01_기획/2026-10-24_기획_folderbot-ask-바깥-에이전트-실시간-대화.md`(2판) §6 ·
 * 기억 카드 원문 `…/2026-10-24_ask-전환-시험-묶음.md` §3. 카드를 고치면 두 곳을 같이 고친다 — 할일이 메모리와 `--help` 가 같은 글이어야 한다.
 */

/** 끝 상태 — 할일이가 외우는 숫자다. 바꾸지 않는다 */
export const ASK_EXIT = { answered: 0, usage: 1, pending: 2, refused: 3, hostDown: 4, needsHuman: 5 } as const

/**
 * 🔴 기다리는 시간 (10/24 12:40 설계 2판 §0) — 할일이 셸은 기본 30초 · 최대 780초이고 슬롯 예산상 한 번에 60초가 안전하다.
 * 그래서 기본 50초(60초 안쪽) · 최대 720초(780초보다 1분 짧게). 0 은 «한 번 보고 바로 끝낸다».
 */
export const ASK_TIMEOUT_DEFAULT = 50
export const ASK_TIMEOUT_MAX = 720
/** 창구·CLI 가 같은 값을 쓴다 — 없거나 못 읽으면 기본 · 음수는 0 · 넘치면 최대 */
export function askTimeoutSec(v: unknown): number {
  if (v === undefined || v === null || v === '') return ASK_TIMEOUT_DEFAULT
  const n = Number(v); if (!Number.isFinite(n)) return ASK_TIMEOUT_DEFAULT
  return Math.min(Math.max(n, 0), ASK_TIMEOUT_MAX)
}

/**
 * `folderbot ask --help` 첫 화면 = 할일이 메모리에 넣는 기억 카드. 1~8 줄은 전환·시험 묶음 §3 과 **한 글자도 다르지 않다**(유닛이 줄마다 잰다).
 * 머리 한 줄만 다르다 — 묶음의 «<전환일>부터» 는 편지에 날짜를 넣을 자리라 `--help` 에는 명령 이름을 쓴다.
 */
export const ASK_CARD_LINES = `1. Folder Bot 에 묻거나 시킬 때는 맥미니 셸에서 /Users/dave/.local/bin/folderbot ask 하나만 쓴다. fbmf-write 는 쓰지 않는다.
2. 폴더를 알면: folderbot ask --as halili --to <폴더 이름> "…"   (묻기·시키기·Dave 말 전달 모두)
   폴더를 모르거나 여러 폴더, 새 폴더·옮기기: folderbot ask --as halili "…"   (오케스트레이터)
3. 답이 필요 없는 알림이면 끝에 --no-wait.
4. 셸 대기는 60초로 잡고 부른다. 50초 안에 끝나면 답이 그 자리에 찍힌다(exit 0).
   exit 2 = 아직 일하는 중 → 첫 줄에 찍힌 편지 id 로 같은 슬롯 끝에 folderbot ask --wait <id> 를 한 번만. 그래도 없으면 다음 슬롯에 편지로 읽는다. 되풀이해 부르지 않는다.
   길 줄 알면 처음부터 --no-wait 로 보내고 id 만 받는다. 급하면 --urgent — 답이 날 때 긴급 메일이 깨운다. id 를 놓쳤으면 folderbot ask --wait.
   exit 3 거절(이유가 찍힘) · exit 4 Folder Bot 꺼짐(편지는 남았고 답은 우편함으로) · exit 5 Dave 확인 대기.
5. 그 자리에서 받은 답(머리말 delivered: live)은 슬롯에서 다시 처리하지 않는다.
6. dave-cos@mail.grokbot.com 으로 [긴급] 메일이 오면: 메일 속 편지 id 를 우편함 from-folderbot 에서 읽고, 답은 folderbot ask --as halili --re <id> "…".
7. 셸이 끊겼을 때만 Dropbox 커넥터로 to-folderbot/ 에 편지 파일을 쓴다.
8. 잊었으면 folderbot ask --help.`
export const ASK_CARD = `[Folder Bot 과 말하기 — folderbot ask]
${ASK_CARD_LINES}

옵션: --as <상대> · --to <폴더|orch> · --re <편지 id> · --no-wait · --timeout <초, 기본 ${ASK_TIMEOUT_DEFAULT} · 0 = 한 번만 보기 · 최대 ${ASK_TIMEOUT_MAX}> · --wait [편지 id] · --urgent · --title <제목> · --json
본문을 "-" 로 주면 표준 입력에서 읽는다.`

export interface AskArgs {
  help?: boolean
  as?: string
  to?: string
  re?: string
  title?: string
  noWait: boolean
  urgent: boolean
  json: boolean
  /** 초 — 기본 50 · 0 = 한 번 보기 · 최대 720 */
  timeout: number
  /** `--timeout` 이 최대보다 커서 줄였다 — CLI 가 그렇다고 찍는다 */
  clamped?: number
  /** `--wait` 를 줬나 · 그 편지 id(없으면 이 상대의 마지막 ask) */
  waiting?: boolean
  wait?: string
  text: string
}

const LETTER_ID = /^\d{8}-\d{6}-[a-z0-9-]+-[0-9a-f]{4}$/

/** 인자 읽기 — 틀리면 사람 말로 된 오류를 던진다(CLI 가 찍고 exit 1) */
export function parseAskArgs(argv: string[]): AskArgs {
  const o: AskArgs = { noWait: false, urgent: false, json: false, timeout: ASK_TIMEOUT_DEFAULT, text: '' }
  const rest: string[] = []
  const val = (i: number, k: string): string => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) throw new Error(`${k} 뒤에 값이 없어요`); return v }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') o.help = true
    else if (a === '--as') o.as = val(i++, a)
    else if (a === '--to') o.to = val(i++, a)
    else if (a === '--re') o.re = val(i++, a)
    else if (a === '--title') o.title = val(i++, a)
    else if (a === '--wait') { o.waiting = true; if (argv[i + 1] && LETTER_ID.test(argv[i + 1])) o.wait = argv[++i] }   // id 는 빼도 된다 — 이 상대의 마지막 ask
    else if (a === '--timeout') {
      const raw = val(i++, a), n = Number(raw)
      if (!Number.isFinite(n) || n < 0) throw new Error('--timeout 은 0 이상의 초예요(0 = 한 번만 보고 끝)')
      o.timeout = askTimeoutSec(n); if (n > ASK_TIMEOUT_MAX) o.clamped = n
    }
    else if (a === '--no-wait') o.noWait = true
    else if (a === '--urgent') o.urgent = true
    else if (a === '--json') o.json = true
    else if (a.startsWith('--')) throw new Error(`모르는 옵션이에요: ${a} — folderbot ask --help`)
    else rest.push(a)
  }
  o.text = rest.join(' ').trim()
  if (o.help) return o
  if (o.re && !LETTER_ID.test(o.re)) throw new Error('--re 는 편지 id 예요(예: 20261024-101500-orch-7c21)')
  if (o.waiting) {
    if (rest.length && !o.wait) throw new Error('--wait 뒤에는 편지 id 만 와요(예: 20261024-101700-halili-a3f9) — 빼면 내 마지막 ask')
    if (!o.wait && !o.as) throw new Error('--wait 에 편지 id 가 없으면 --as <상대> 가 필요해요 — 그 상대의 마지막 ask 를 봐요')
    return o
  }
  if (!o.as) throw new Error('--as <상대> 가 필요해요(예: --as halili)')
  if (!o.text) throw new Error('보낼 말이 없어요 — folderbot ask --as halili "…"')
  return o
}

/** 보낼 편지 종류 — 답이면 reply, 기다리지 않는 알림이면 report, 나머지는 request */
export function askKind(o: Pick<AskArgs, 're' | 'noWait'>): 'reply' | 'report' | 'request' { return o.re ? 'reply' : o.noWait ? 'report' : 'request' }

/** 편지 id 의 보낸쪽 — `--wait <id>` 에 `--as` 가 없을 때 상대를 id 에서 읽는다(`20261024-101700-halili-a3f9` → halili) */
export function peerOfId(id: string): string | undefined { return /^\d{8}-\d{6}-([a-z0-9-]+)-[0-9a-f]{4}$/.exec(id)?.[1] }

/** 이 상대의 마지막 ask — 편지 id 는 시각순이라 가장 큰 것 */
export function lastAskId(letters: readonly { id: string; from: string; via?: string }[], peerId: string): string | undefined {
  return letters.filter((l) => l.via === 'ask' && l.from === peerId && peerOfId(l.id) === peerId).map((l) => l.id).sort().pop()
}

/** 창구 응답(받기 전 거절이면 그 상태 코드 · 받았으면 마지막 줄의 state) → 끝 상태 */
export function exitOf(status: number, last: { state?: string }): number {
  if (status !== 200) return ASK_EXIT.refused
  switch (last.state) {
    case 'answered': case 'sent': return ASK_EXIT.answered
    case 'needs_human': return ASK_EXIT.needsHuman
    case 'error': return ASK_EXIT.refused
    default: return ASK_EXIT.pending   // queued(마지막 줄 전에 끊김) · pending(시간 초과 · 아직 못 넣음)
  }
}

/** 화면 첫 줄 — 기다리기 전에 찍는다. `--json` 이면 그 줄도 JSON 한 줄(NDJSON)이다 */
export function firstLine(id: string, json: boolean, extra: Record<string, unknown> = {}): string { return json ? JSON.stringify({ id, state: 'queued', ...extra }) : id }
