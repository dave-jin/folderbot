// 메뉴바 아이콘 — 🔴 **남은 사용량을 «폴더가 얼마나 찼나» 로 그린다** (2026-09-13 Dave:
// *«상단 메뉴 이름에 폴더가 얼마나 채워졌는지 정도로 (마치 배터리) 남은 사용량을 표시하고
// 숫자랑 게이지는 없애줘»*).
//
// 종전에는 제목 자리에 `▰▱▱▱▱ 27%` 를 적었다. 메뉴바에서 **글자는 읽는 것**이고, 이건 읽을
// 필요가 없는 정보다 — 배터리처럼 «얼마나 남았나» 만 한눈에 보이면 된다. 그래서 제목을 비우고
// 아이콘 자체를 채운다.
//
// ⚠ **PNG 를 직접 만든다.** 메인 프로세스에는 캔버스가 없고, 그림 라이브러리를 하나 더 들이는 것은
//    아이콘 한 장 값으로 비싸다. 회색+알파(색 타입 4) PNG 는 zlib 만으로 60줄이면 쓴다.
// ⚠ **템플릿 이미지**다 — 색은 전부 검정이고 **알파만** 다르다. 그래야 맥이 라이트/다크·강조 상태에
//    맞춰 알아서 칠한다. 여기에 색을 넣으면 다크 메뉴바에서 검은 폴더가 된다.
// ⚠ 계단을 없애려고 픽셀마다 3×3 으로 훑어 덮인 비율을 낸다(폰트만 한 크기라 계단이 그대로 보인다).
const { deflateSync } = require('node:zlib')

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return t
})()
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** 회색+알파 8비트 PNG. `alpha(x, y)` 는 0..255 */
function grayAlphaPng(w, h, alpha) {
  const raw = Buffer.alloc(h * (1 + w * 2))
  let o = 0
  for (let y = 0; y < h; y++) {
    raw[o++] = 0 // filter: none — 아이콘은 작아서 필터로 얻을 게 없다
    for (let x = 0; x < w; x++) { raw[o++] = 0; raw[o++] = alpha(x, y) }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 4; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ])
}

/** 모서리 둥근 네모 안인가 */
function inRR(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2))
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y
  const dx = x - cx, dy = y - cy
  return dx * dx + dy * dy <= r * r
}

const EMPTY_A = 46   // 안 찬 부분 — 있는 듯 없는 듯. 0 이면 «테두리만» 이라 폴더로 안 읽힌다
const FULL_A = 255
const LINE = 2.2     // 44px 기준 테두리 두께

/**
 * 폴더 아이콘 하나. `pct` 는 **남은 양**(0..100) — 배터리와 같은 방향이다(많이 남으면 많이 차 있다).
 * `pct` 가 null 이면(아직 모름) 테두리만 있는 빈 폴더를 준다.
 */
function folderIcon(pct, size = 44) {
  const k = size / 44
  const TAB = [3 * k, 7 * k, 19 * k, 15 * k, 2.5 * k]
  const BODY = [3 * k, 12 * k, 41 * k, 37 * k, 3.5 * k]
  const t = LINE * k
  const has = (x, y) => inRR(x, y, ...TAB) || inRR(x, y, ...BODY)
  const inner = (x, y) => inRR(x, y, TAB[0] + t, TAB[1] + t, TAB[2] - t, TAB[3] + t, TAB[4]) || inRR(x, y, BODY[0] + t, BODY[1] + t, BODY[2] - t, BODY[3] - t, BODY[4])
  // 차오르는 높이는 **몸통 안쪽**으로만 잰다 — 탭까지 세면 100% 와 90% 가 눈에 안 갈린다
  const top = BODY[1] + t, bot = BODY[3] - t
  const level = pct === null || pct === undefined ? bot : bot - ((bot - top) * Math.max(0, Math.min(100, pct))) / 100
  const at = (x, y) => {
    if (!has(x, y)) return 0
    if (!inner(x, y)) return FULL_A
    return y >= level ? FULL_A : EMPTY_A
  }
  // 3×3 슈퍼샘플 — 메뉴바 크기에서는 계단이 그대로 보인다
  const alpha = (px, py) => {
    let sum = 0
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) sum += at(px + (i + 0.5) / 3, py + (j + 0.5) / 3)
    return Math.round(sum / 9)
  }
  return grayAlphaPng(size, size, alpha)
}

module.exports = { folderIcon, grayAlphaPng, inRR }
