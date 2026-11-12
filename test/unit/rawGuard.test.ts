import { describe, it, expect } from 'vitest'
import { queryTokenOk, rawGuard } from '../../src/host/gateway'

describe('주소에 실은 토큰(?token=)은 파일 받기에만 통한다 (2026-11-12)', () => {
  it('원본·묶음 받기(GET · HEAD)만 통한다', () => {
    expect(queryTokenOk('GET', '/api/bots/abc123/raw')).toBe(true)
    expect(queryTokenOk('HEAD', '/api/bots/abc123/raw')).toBe(true)
    expect(queryTokenOk('GET', '/api/bots/abc123/zip')).toBe(true)
  })
  it('쓰는 요청은 어느 길이든 안 통한다 — 격리 틀 안의 글이 제 주소에서 읽은 토큰으로 볼트를 바꾸지 못하게', () => {
    expect(queryTokenOk('POST', '/api/folders')).toBe(false)
    expect(queryTokenOk('POST', '/api/bots/abc123/raw')).toBe(false)
    expect(queryTokenOk('PUT', '/api/bots/abc123/raw')).toBe(false)
    expect(queryTokenOk('DELETE', '/api/bots/abc123/zip')).toBe(false)
    expect(queryTokenOk(undefined, '/api/bots/abc123/raw')).toBe(false)
  })
  it('읽는 요청도 파일 받기가 아니면 안 통한다', () => {
    expect(queryTokenOk('GET', '/api/bots')).toBe(false)
    expect(queryTokenOk('GET', '/api/events')).toBe(false)
    expect(queryTokenOk('GET', '/api/bots/abc123/file')).toBe(false)
    expect(queryTokenOk('GET', '/api/bots/abc123/raw/x')).toBe(false)
    expect(queryTokenOk('GET', '/api/bots/a/b/raw')).toBe(false)
    expect(queryTokenOk('GET', '/x/api/bots/abc123/raw')).toBe(false)
  })
})

describe('원본 응답의 울타리 머리 (2026-11-12)', () => {
  it('스크립트가 도는 종류(html · svg)는 맨 위 창으로 열려도 격리된다', () => {
    expect(rawGuard('text/html; charset=utf-8')['content-security-policy']).toBe('sandbox allow-scripts allow-popups')
    expect(rawGuard('image/svg+xml')['content-security-policy']).toBe('sandbox allow-scripts allow-popups')
    expect(rawGuard('TEXT/HTML')['content-security-policy']).toBe('sandbox allow-scripts allow-popups')
  })
  it('PDF · 그림 · 영상 · 글은 격리 머리를 붙이지 않는다 — 크롬 PDF 보기는 격리되면 안 뜬다', () => {
    for (const t of ['application/pdf', 'image/png', 'video/mp4', 'audio/mp4', 'text/markdown; charset=utf-8', 'application/octet-stream']) expect(rawGuard(t)['content-security-policy']).toBeUndefined()
  })
  it('종류를 내용으로 짐작하지 않게 한다 — 어느 응답이든', () => {
    for (const t of ['text/html; charset=utf-8', 'application/pdf', 'application/octet-stream']) expect(rawGuard(t)['x-content-type-options']).toBe('nosniff')
  })
})
