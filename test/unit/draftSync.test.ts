import { describe, expect, it } from 'vitest'
import { cleanDraft, draftSid, isEmptyDraft, pickStart, sameDraft, shouldAdopt } from '../../src/core/draft'
import { dropboxWebUrl, isExternalLink, safariUrl } from '../../src/core/openLink'

describe('DR 초안 — 기기를 건너 이어 쓰기', () => {
  it('세션 열쇠 — 없거나 이상하면 new', () => {
    expect(draftSid('s_abc-1')).toBe('s_abc-1')
    expect(draftSid(undefined)).toBe('new')
    expect(draftSid('../x')).toBe('new')
  })
  it('올리는 중인 첨부는 싣지 않는다 · 모르는 칸은 버린다', () => {
    const d = cleanDraft({ text: '안녕', attach: [{ rel: '첨부/a.png', abs: '/v/첨부/a.png', thumb: 'data:…' }, { rel: 'tmp1', abs: '', uploading: true }], at: 5 }, 10)
    expect(d).toEqual({ text: '안녕', attach: [{ rel: '첨부/a.png', abs: '/v/첨부/a.png' }], at: 5 })
  })
  it('미래 시각은 지금 근처로 자른다', () => {
    expect(cleanDraft({ text: 'x', at: 10 ** 15 }, 1000).at).toBe(61_000)
  })
  it('빈 초안 판정 — 공백뿐이면 비었다', () => {
    expect(isEmptyDraft({ text: '  \n', attach: [] })).toBe(true)
    expect(isEmptyDraft({ text: '', attach: [{ rel: 'a', abs: '' }] })).toBe(false)
  })
  it('같은 내용 — 시각은 안 본다', () => {
    expect(sameDraft({ text: 'a', attach: [] }, { text: 'a', attach: [] })).toBe(true)
    expect(sameDraft({ text: 'a', attach: [{ rel: 'x', abs: '' }] }, { text: 'a', attach: [] })).toBe(false)
  })
  it('다른 기기 초안은 들인다 · 내 것·방금 친 입력창·더 옛것은 안 들인다', () => {
    const local = { text: '맥에서', attach: [], at: 100 }
    const inc = { text: '폰에서', attach: [], at: 200, by: 'phone' }
    expect(shouldAdopt({ incoming: inc, me: 'mac', local, lastTypedAt: 0, now: 10_000 })).toBe(true)
    expect(shouldAdopt({ incoming: inc, me: 'phone', local, lastTypedAt: 0, now: 10_000 })).toBe(false)
    expect(shouldAdopt({ incoming: inc, me: 'mac', local, lastTypedAt: 9_000, now: 10_000 })).toBe(false)
    expect(shouldAdopt({ incoming: { ...inc, at: 50 }, me: 'mac', local, lastTypedAt: 0, now: 10_000 })).toBe(false)
  })
  it('다른 기기가 보내서 비운 초안(null)도 들인다', () => {
    expect(shouldAdopt({ incoming: null, me: 'mac', local: { text: '쓰던 글', attach: [], at: 100 }, lastTypedAt: 0, now: 10_000 })).toBe(true)
  })
  it('시작값 — 더 새것', () => {
    const a = { text: 'a', attach: [], at: 1 }, b = { text: 'b', attach: [], at: 2 }
    expect(pickStart(a, b)).toBe(b); expect(pickStart(b, a)).toBe(b); expect(pickStart(null, a)).toBe(a); expect(pickStart(a, null)).toBe(a)
  })
})

describe('OL 폰에서 바깥으로 열기', () => {
  it('Safari 주소', () => {
    expect(safariUrl('https://theminda.com/a?b=1')).toBe('x-safari-https://theminda.com/a?b=1')
    expect(safariUrl('HTTP://x.kr')).toBe('x-safari-http://x.kr')
    expect(safariUrl('mailto:a@b')).toBeNull()
  })
  it('Dropbox 웹 주소 — 파일은 폴더 + preview, 폴더는 그대로 · 토큰 없음', () => {
    expect(dropboxWebUrl('/Users/dave/Library/CloudStorage/Dropbox/PARA/2. Area/제품_FolderBot/readme.md'))
      .toBe('https://www.dropbox.com/home/PARA/2.%20Area/%EC%A0%9C%ED%92%88_FolderBot?preview=readme.md')
    expect(dropboxWebUrl('/Users/dave/Dropbox/PARA/0. Inbox', true)).toBe('https://www.dropbox.com/home/PARA/0.%20Inbox')
    expect(dropboxWebUrl('/Volumes/Dave HDD/dev/a.md')).toBeNull()
  })
  it('NFD 경로도 NFC 로 인코딩한다', () => {
    const nfd = '/Users/d/Dropbox/PARA/제품'.normalize('NFD')
    expect(dropboxWebUrl(nfd, true)).toBe('https://www.dropbox.com/home/PARA/%EC%A0%9C%ED%92%88')
  })
  it('바깥 링크 판정 — 같은 호스트는 아니다', () => {
    expect(isExternalLink('https://theminda.com', 'https://mac-mini.ts.net')).toBe(true)
    expect(isExternalLink('https://mac-mini.ts.net/api/x', 'https://mac-mini.ts.net')).toBe(false)
    expect(isExternalLink('/api/x', 'https://mac-mini.ts.net')).toBe(false)
  })
})
