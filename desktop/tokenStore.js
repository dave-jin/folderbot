/**
 * 여러 맥 — 맥별 토큰 (2026-11-19). 맥 앱이 받아 두는 토큰 사본을 맥 id 마다 따로 둔다.
 *
 * 🔴 평문으로 디스크에 두지 않는다 — 셸은 `safeCodec(safeStorage)`(맥 OS 열쇠고리에 묶인 암호화)를 넘긴다.
 *    검사(`FOLDERBOT_QA=1`)만 `plainCodec` 을 쓴다: 검사 맥에 열쇠고리 허용 창을 띄우지 않기 위해서다.
 * ⚠ 읽기·복호 실패는 던지지 않고 빈 값 — 그 맥은 «다시 페어링 필요» 로 보일 뿐 앱이 죽지 않는다.
 */
const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('node:fs')
const { dirname } = require('node:path')

const plainCodec = { enc: (s) => s, dec: (s) => s }
const safeCodec = (safeStorage) => ({
  enc: (s) => safeStorage.encryptString(s).toString('base64'),
  dec: (s) => safeStorage.decryptString(Buffer.from(s, 'base64'))
})

function createTokenStore(file, codec) {
  const load = () => { try { const j = JSON.parse(readFileSync(file, 'utf8')); return j && typeof j === 'object' ? j : {} } catch { return {} } }
  const write = (j) => { mkdirSync(dirname(file), { recursive: true }); const tmp = `${file}.tmp`; writeFileSync(tmp, JSON.stringify(j, null, 2), { mode: 0o600 }); renameSync(tmp, file) }
  return {
    get(id) { const v = load()[id]; if (typeof v !== 'string' || !v) return ''; try { return codec.dec(v) || '' } catch { return '' } },
    set(id, token) { const j = load(); if (token) j[id] = codec.enc(token); else delete j[id]; write(j) },
    del(id) { const j = load(); if (id in j) { delete j[id]; write(j) } },
    ids() { return Object.keys(load()) }
  }
}

module.exports = { createTokenStore, plainCodec, safeCodec }
