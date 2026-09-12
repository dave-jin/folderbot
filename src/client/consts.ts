import type { PermissionMode } from '../core/types'

/** 모델 — Fable 5.1 이 기본. 이름은 id 의 마지막 단어로 폴백 */
export const MODELS: { v: string; t: string; d: string }[] = [
  { v: 'claude-fable-5-1', t: 'Fable 5.1', d: '가장 똑똑함 · 기본' },
  { v: 'claude-opus-5', t: 'Opus 5', d: '' },
  { v: 'claude-sonnet-5', t: 'Sonnet 5', d: '빠름' },
  { v: 'claude-haiku-4-5-20251001', t: 'Haiku 4.5', d: '가장 빠름' }
]
export const EFFORTS: { v: string; t: string }[] = [{ v: 'low', t: '낮음' }, { v: 'medium', t: '보통' }, { v: 'high', t: '높음' }, { v: 'xhigh', t: '매우' }, { v: 'max', t: '최대' }]
export const MODES: { v: PermissionMode; t: string; d: string }[] = [
  { v: 'default', t: '자동', d: '읽기는 바로, 쓰기·실행은 물어봄' },
  { v: 'acceptEdits', t: '편집 자동 수락', d: '파일 편집은 자동 승인' },
  { v: 'plan', t: '계획', d: '변경하기 전에 계획 만들기' },
  { v: 'bypassPermissions', t: '항상 허용', d: '묻지 않음 — 루틴·신뢰하는 폴더에서만' }
]
export const modelLabel = (id?: string): string => MODELS.find((m) => m.v === id)?.t ?? (id ? id.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/-/g, ' ') : 'Fable 5.1')
export const effortLabel = (v?: string): string => EFFORTS.find((e) => e.v === v)?.t ?? '높음'
export const modeLabel = (v?: string): string => MODES.find((m) => m.v === v)?.t ?? '자동'
export const fmtK = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
