/**
 * «지금 무엇을 하는가» — 한 줄 활동 문자열을 **마스코트의 몸짓**과 **짧은 말**로 옮긴다
 * (2026-09-13 Dave: *«마스코트는 상황에 따라 A·B·C 로 변경되면서 보여주면 좋겠어»*).
 *
 * 🔴 **진행 줄에서 움직이는 것은 폴더봇 하나뿐이다.** Claude 는 자기 별이, Cursor 는 자기 표식이
 *    커졌다 작아진다 — 우리에겐 이미 얼굴이 있으니 그 얼굴이 일한다. 맥박 점(·)은 뺐다: 같은 말을
 *    두 번 하는 자리였다.
 * ⚠ **도구 이름은 진행 줄에 쓰지 않는다.** `Read · 2026-09/회의록.md` 같은 문자열이 앞에 서면 대화가
 *    터미널이 된다. 무엇을 읽는지는 **바로 위 접힌 줄**이 말한다(그 줄이 도는 동안 물결친다).
 */
export type WorkMood = 'think' | 'file' | 'type'

/** 파일을 만지는 도구 — 이때 폴더봇은 서류를 넘긴다(B) */
const FILE_TOOLS = /^(Read|Write|Edit|MultiEdit|NotebookEdit|Glob|Grep|LS)\b/i

export function workMood(activity?: string): WorkMood {
  const a = (activity ?? '').trim()
  if (!a || /^(생각 중|시작하는 중)/.test(a)) return 'think'
  if (/^답 쓰는 중/.test(a)) return 'type'
  const tool = a.replace(/^.*›\s*/, '')            // `서브에이전트 › Read · …` 의 앞부분을 걷어낸다
  return FILE_TOOLS.test(tool) ? 'file' : 'think'
}

/**
 * 진행 줄에 쓸 **짧은 말**. ⛔ 파일 이름·명령을 넣지 않는다 — 줄이 길어지는 만큼 대화가 로그가 된다.
 */
export function workLabel(activity?: string): string {
  const a = (activity ?? '').trim()
  if (!a) return '일하는 중'
  if (/^생각 중/.test(a)) return '생각 중'
  if (/^시작하는 중/.test(a)) return '시작하는 중'
  if (/^답 쓰는 중/.test(a)) return '답 쓰는 중'
  const tool = a.replace(/^.*›\s*/, '')
  if (/^(Read|LS)\b/i.test(tool)) return '파일 읽는 중'
  if (/^(Write|Edit|MultiEdit|NotebookEdit)\b/i.test(tool)) return '파일 고치는 중'
  if (/^(Glob|Grep)\b/i.test(tool)) return '찾는 중'
  if (/^Bash\b/i.test(tool)) return '명령 실행 중'
  if (/^(WebFetch|WebSearch)\b/i.test(tool)) return '웹 보는 중'
  if (/^에이전트\b/.test(a) || /^(Task|Agent)\b/i.test(tool)) return '서브에이전트 돌리는 중'
  if (/끝남$/.test(a)) return '정리하는 중'
  return '일하는 중'
}
