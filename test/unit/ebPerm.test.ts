import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_MODE_MENU, PERM_MODES, autoAllows, autoRejected, isPermMode, modeDrift, permModeLabel, spawnMode } from '../../src/core/permPolicy'
import { DEFAULT_APPROVAL_TIMEOUT_MIN, approvalDenyMessage, approvalNote, approvalRunReason, approvalTimeoutApplies, approvalTimeoutMin, fmtWait } from '../../src/core/approvalTimeout'
import { AGENT_MODELS, fitsProvider } from '../../src/core/agents'
import { MODEL_RE } from '../../src/core/modelList'

/**
 * EB · «사람이 없어도 안전하게 돈다» (2026-11-11 Dave 승인) — 순수 판정.
 * 호스트·화면이 붙은 검사는 `test/eb-perm.mjs`(스모크)다.
 */
describe('EB 권한 모드 — 이름은 Claude Desktop 과 같다', () => {
  it('다섯 모드의 순서와 이름 — 자동(auto) · 수동(default) · 편집 자동 수락 · 계획 · 항상 허용', () => {
    expect(PERM_MODE_MENU.map((m) => m.v)).toEqual(['auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions'])
    expect(PERM_MODE_MENU.map((m) => m.t)).toEqual(['자동', '수동', '편집 자동 수락', '계획', '항상 허용'])
    expect(PERM_MODE_MENU.every((m) => m.d.length > 4)).toBe(true)
  })
  it('🔴 «자동» 은 auto 의 이름이다 — default 는 «수동» 이고, 모르는 값·빈 값도 «수동» 으로 보인다(권한이 넓어 보이지 않게)', () => {
    expect(permModeLabel('auto')).toBe('자동')
    expect(permModeLabel('default')).toBe('수동')
    expect(permModeLabel(undefined)).toBe('수동')
    expect(permModeLabel('뭔가')).toBe('수동')
    expect(permModeLabel('bypassPermissions')).toBe('항상 허용')
  })
  it('CLI 가 받는 값만 통과한다', () => {
    for (const v of ['auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk']) expect(isPermMode(v)).toBe(true)
    for (const v of ['yolo', '', undefined, null, 3, 'Auto']) expect(isPermMode(v)).toBe(false)
    expect(PERM_MODES).toContain('auto')
  })
  it('🔴 자동(auto)이어도 호스트는 대신 허용하지 않는다 — 판단은 CLI 가 하고, 물어 온 것은 사람에게 보인다', () => {
    for (const t of ['Bash', 'Write', 'Edit', 'mcp__x__y', 'AskUserQuestion']) expect(autoAllows('auto', t)).toBe(false)
  })
  it('띄울 모드 — 고른 모드는 그대로 · 모드를 안 정한 세션은 «새 채팅 기본 권한» · 없으면 수동 (2026-11-11 Dave)', () => {
    // 사람이 고른 «수동» 은 기본이 무엇이든 수동
    expect(spawnMode('default', true, 'bypassPermissions')).toBe('default')
    expect(spawnMode('plan', true, 'auto')).toBe('plan')
    // 기록에 default 가 아닌 모드가 있으면(만들 때의 기본값 · 루틴) 그대로
    expect(spawnMode('acceptEdits', false, 'bypassPermissions')).toBe('acceptEdits')
    // 모드 없음 · 고르지 않은 default → 지금의 기본 권한
    expect(spawnMode(undefined, false, 'bypassPermissions')).toBe('bypassPermissions')
    expect(spawnMode('default', false, 'auto')).toBe('auto')
    // 기본 권한도 없으면 수동 — CLI 설정에 맡기지 않는다
    expect(spawnMode(undefined, false, undefined)).toBe('default')
    expect(spawnMode(undefined, true, undefined)).toBe('default')
  })
  it('실제 모드와 요청을 견준다 — 자동을 못 켰나 · 설정을 따라 도나', () => {
    expect(modeDrift('auto', true, 'auto')).toBe('same')
    expect(modeDrift('auto', true, 'default')).toBe('auto-denied')
    expect(modeDrift('auto', true, 'bypassPermissions')).toBe('auto-denied')
    // 모드를 인자로 안 넘긴 워커가 그 맥의 설정을 따라 다른 모드로 돈다 — 고장이 아니다
    expect(modeDrift(undefined, false, 'auto')).toBe('follows-cli')
    expect(modeDrift('default', false, 'bypassPermissions')).toBe('follows-cli')
    expect(modeDrift(undefined, false, 'default')).toBe('same')
    // 수동을 명시했는데 다르게 돌면 설정을 따른 것이 아니다
    expect(modeDrift('default', true, 'auto')).toBe('other')
    expect(modeDrift('plan', true, 'default')).toBe('other')
    // CLI 가 모드를 안 알려 줬거나 모르는 값이면 아무 판단도 안 한다
    expect(modeDrift('auto', true, undefined)).toBe('same')
    expect(modeDrift('auto', true, 'weird')).toBe('same')
  })
  it('옛 CLI 가 auto 를 받지 않고 죽은 글을 알아본다 — 다른 오류는 아니다', () => {
    expect(autoRejected("error: option '--permission-mode <mode>' argument 'auto' is invalid. Allowed choices are acceptEdits, bypassPermissions, default, dontAsk, plan.")).toBe(true)
    expect(autoRejected('Auto mode is not available for your account')).toBe(true)
    expect(autoRejected("Error: The model 'claude-x' is not supported on your plan.")).toBe(false)
    expect(autoRejected('Failed to authenticate')).toBe(false)
    expect(autoRejected('')).toBe(false)
  })
})

describe('EB 승인 시간 초과 — 사람이 시작하지 않은 턴만', () => {
  it('기본은 끄기(0 · 2026-11-11 Dave) · 이상한 값은 기본값 · 하루를 넘지 않는다', () => {
    expect(DEFAULT_APPROVAL_TIMEOUT_MIN).toBe(0)
    expect(approvalTimeoutMin(undefined)).toBe(0)
    expect(approvalTimeoutMin(0)).toBe(0)
    expect(approvalTimeoutMin(30)).toBe(30)
    expect(approvalTimeoutMin(-5)).toBe(0)
    expect(approvalTimeoutMin('abc')).toBe(0)
    expect(approvalTimeoutMin(99999)).toBe(24 * 60)
    expect(approvalTimeoutMin(0.03)).toBe(0.03)   // 검사가 2초로 잰다
  })
  it('🔴 루틴 · 봇 · 바깥 편지의 턴에만 건다 — 사람이 보낸 턴과 누가 시작했는지 모르는 턴은 끝까지 기다린다', () => {
    for (const from of ['routine', 'bot', 'peer'] as const) expect(approvalTimeoutApplies(from, {}, 10)).toBe(true)
    expect(approvalTimeoutApplies('human', {}, 10)).toBe(false)
    expect(approvalTimeoutApplies(undefined, {}, 10)).toBe(false)
  })
  it('질문 카드는 건드리지 않는다 · 0 이면 아무 데도 안 건다', () => {
    expect(approvalTimeoutApplies('routine', { ask: true }, 10)).toBe(false)
    expect(approvalTimeoutApplies('routine', {}, 0)).toBe(false)
  })
  it('모델에게 가는 사유와 대화·실행 기록에 남는 글', () => {
    expect(fmtWait(10)).toBe('10분'); expect(fmtWait(0.03)).toBe('2초'); expect(fmtWait(1.5)).toBe('1.5분')
    expect(approvalDenyMessage(10)).toMatch(/^10분 동안 사람의 답이 없어 거절됐습니다\(승인 시간 초과\)/)
    expect(approvalDenyMessage(10)).toMatch(/다시 하지 말고/)
    expect(approvalNote(10, 'Bash', 'routine')).toBe('승인 시간 초과 · Bash — 10분 동안 답이 없어 거절했어요 (루틴이 시작한 턴 · 사람이 보낸 턴은 끝까지 기다려요)')
    expect(approvalNote(10, 'Bash', 'bot')).toMatch(/다른 봇의 말로 시작된 턴/)
    expect(approvalRunReason(10, ['Bash', 'Bash', 'Write'])).toBe('승인 시간 초과 · Bash · Write (10분 동안 답 없음)')
  })
})

describe('EB 루틴 — 승인 선택지에 auto · 기본값은 그대로', () => {
  it('auto 는 `--permission-mode auto` 로 · 기본값은 여전히 always(항상 허용) · 모르는 값은 가장 좁게', async () => {
    const { approveToMode, DEFAULT_ROUTINE_APPROVE, routineRun } = await import('../../src/host/routines')
    expect(approveToMode('auto')).toBe('auto')
    expect(DEFAULT_ROUTINE_APPROVE).toBe('always')
    expect(approveToMode(undefined)).toBe('bypassPermissions')
    expect(approveToMode('오타' as never)).toBe('plan')
    const r = routineRun({ name: 'x', prompt: '해 줘', approve: 'auto' })
    expect(r.mode).toBe('auto'); expect(r.text).not.toMatch(/제안만 하고|이 폴더 안 파일만/)
  })
  it('승인이 시간 초과로 거절된 회차는 루틴이 ok 라고 적어도 «실패 · 승인 시간 초과» 로 남는다', async () => {
    const { RunLog } = await import('../../src/host/runs')
    const root = mkdtempSync(join(tmpdir(), 'fb-ebrun-'))
    const rl = new RunLog(root, () => undefined, () => 'mac-mini', () => {}, () => Date.parse('2026-11-11T09:00:00'))
    rl.start('s_a', 'b1', '봇', '아침')
    expect(rl.approvalTimedOut('s_a', 'Bash', 10)).toBe(true)
    expect(rl.approvalTimedOut('s_none', 'Bash', 10)).toBe(false)   // 이 호스트가 시작하지 않은 회차
    expect(rl.end('s_a', true, '다 했어요\n결과: ok')).toEqual({ ok: false, result: 'fail' })
    rl.start('s_b', 'b1', '봇', '아침'); expect(rl.end('s_b', true, '결과: ok')).toEqual({ ok: true, result: 'ok' })   // 시간 초과가 없으면 종전대로
    const dir = join(root, '.folderbot', 'ops'); const rows = readFileSync(join(dir, readdirSync(dir)[0]), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    expect(rows.find((e) => e.event === 'approval_timeout')).toMatchObject({ run: 's_a', tool: 'Bash', minutes: 10, routine: '아침' })
    expect(rows.find((e) => e.event === 'end' && e.run === 's_a')).toMatchObject({ ok: false, result: 'fail', reason: '승인 시간 초과 · Bash (10분 동안 답 없음)', approvalTimeouts: 1 })
    expect(rows.find((e) => e.event === 'end' && e.run === 's_b').reason).toBeUndefined()
  })
})

describe('EB 설정 — 승인 시간 초과·기본 권한 auto 가 다시 읽어도 남는다', () => {
  beforeAll(() => { process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-ebcfg-')) })
  it('왕복', async () => {
    const { loadConfig, saveConfig } = await import('../../src/host/paths')
    saveConfig({ ...loadConfig(), root: '/x', defaultPermissionMode: 'auto', approvalTimeoutMinutes: 0 })
    const back = loadConfig()
    expect(back.defaultPermissionMode).toBe('auto'); expect(back.approvalTimeoutMinutes).toBe(0)
    // 손으로 고친 이상한 값은 버린다 — CLI 인자·타이머로 흘러가지 않게
    saveConfig({ ...back, defaultPermissionMode: 'yolo' as never, approvalTimeoutMinutes: -3 })
    const bad = loadConfig(); expect(bad.defaultPermissionMode).toBeUndefined(); expect(bad.approvalTimeoutMinutes).toBeUndefined()
  })
})

describe('EB Codex 대비 목록 — 옛 모델 이름을 걷었다', () => {
  it('옛 이름 넷이 없다 · 남은 이름은 Codex 이름 모양이고 주워 오는 정규식에도 맞는다', () => {
    const names = AGENT_MODELS.codex.map((m) => m.v)
    for (const old of ['gpt-5.1-codex', 'gpt-5.1-codex-mini', 'gpt-5-codex', 'gpt-5']) expect(names).not.toContain(old)
    expect(names[0]).toBe('')   // 맨 위는 여전히 «CLI 기본»
    expect(names.filter(Boolean)).toEqual(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6.1-terra', 'gpt-6-luna'])   // 맥미니 ~/.codex/models_cache.json (2026-11-11)
    for (const v of names.filter(Boolean)) { expect(fitsProvider('codex', v)).toBe(true); expect(MODEL_RE.codex.test(v)).toBe(true) }
  })
})
