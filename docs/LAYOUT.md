# 화면 여백 계약 — 폰에서 「빈 데」가 안 생기게

*2026-09-24 신설 (AL · Dave: «특정 모델뿐만 아니라 **어떤 환경에서도** 이런 불필요한 여백은 만들어지면 안 되거든 …
이미 만들어진 아주 정교화된 규칙 포맷들을 활용해서 만들면 어떨까»).*

> **왜 문서로 못 박나.** 같은 종류의 버그가 **네 번** 났다 — 안전영역(safe area)을 두 곳에서 세는 실수다.
> 2026-09-13 채팅 입력칸, 2026-09-23 AD 의 `.notabs`, 2026-09-24 AG-3 의 키보드, 그리고 이번 AL 의 문서 화면.
> 매번 「그 자리」만 고쳤기 때문에 다음 자리에서 또 났다. **규칙을 한 곳에 적고 검사로 잠근다.**

## 📐 바깥에서 가져온 규칙 (정본 링크)

이 절은 **우리가 정한 것이 아니다.** 업계 정본을 그대로 따른다.

| 무엇 | 규칙 | 정본 |
|---|---|---|
| 노치·홈 인디케이터 | 화면 끝까지 쓰는 레이아웃은 `env(safe-area-inset-*)` 로 피한다 (`viewport-fit=cover` 가 있어야 값이 들어온다) | [Web Interface Guidelines · Safe Areas & Layout](https://github.com/vercel-labs/web-interface-guidelines) · [MDN env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env) |
| 뷰포트 높이 | `100vh` 를 쓰지 않는다. 안 잘리는 게 중요하면 `svh`, 보이는 만큼 정확히 채우려면 `dvh` | [MDN viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths) |
| 누를 것의 크기 | 폰에서 최소 **44×44px**, 44 미만이면 주변 누를 것과 **24px** 이상 떨어뜨린다 | [WIG · Touch](https://github.com/vercel-labs/web-interface-guidelines) |
| 입력칸 글씨 | 폰에서 **16px 이상** — 작으면 사파리가 초점을 받을 때 화면을 확대한다 | [WIG · Forms](https://github.com/vercel-labs/web-interface-guidelines) |
| 레이아웃 계산 | JS 로 재서 맞추지 말고 **flex/grid** 로 푼다 | [WIG · Layout](https://github.com/vercel-labs/web-interface-guidelines) |
| 가로 스크롤 | 컨테이너에 `overflow-x` 를 막고 넘치는 내용을 고친다 | [WIG · Layout](https://github.com/vercel-labs/web-interface-guidelines) |

⚠ 검토할 때는 **그때그때 원문을 다시 받아** 본다(`web-design-guidelines` 스킬이 이 URL 을 받아 쓴다).
여기 표는 요약이라 낡을 수 있다 — **판정은 원문이 한다.**

## 🔴 이 앱의 불변식 다섯

바깥 규칙을 이 앱의 구조(하단 탭 + 떠 있는 입력칸 + 키보드)에 적용한 것이다. **어기면 검사가 빨개진다.**

1. **안전영역은 «한 곳에서만» 센다.**
   폰에서 화면 맨 아래를 차지하는 것은 **탭 바 하나**이고, 그 높이는 `--tablift`(`= --tabh + env(safe-area-inset-bottom)`) **하나로만** 나간다.
   탭 위에 얹히는 것(`.chat-foot`·`.dfoot`·시트·서랍)은 **제 `--sab` 를 더하지 않는다.**
   탭이 없을 때(`.notabs`)만 그것들이 안전영역을 직접 센다.
   *왜* — 두 곳에서 세면 화면에는 **아무것도 없는 34pt 짜리 띠**가 생긴다. 사용자 눈에는 「여백이 많다」로 보인다.

2. **스크롤 칸의 아래 여백 = 그 위에 떠 있는 것의 높이 + 탭 높이.**
   `.chat-body` 는 `calc(var(--footh) + 여유 + var(--tablift))`. **`--tablift` 를 빼먹으면 마지막 줄이 탭 뒤에 숨는다**(AK 에서 실제로 났다).
   같은 화면의 다른 요소(`.tobot` 등)와 **같은 셈**을 써야 한다 — 한쪽만 고치면 또 어긋난다.

3. **고정 UI 와 내용 사이의 「죽은 여백」은 24px 을 넘지 않는다.**
   내용의 마지막 픽셀과 그 아래 고정 UI(탭 바) 사이에 **아무것도 없는 공간**이 24px 을 넘으면 버그다.
   24px 은 WIG 의 「누를 것 사이 최소 간격」에서 가져왔다 — 그보다 큰 빈 데는 의도가 아니라 실수다.

4. **높이는 `dvh`/`svh` 로 잡고 `100vh` 는 쓰지 않는다.**
   iOS 에서 `100vh` 는 주소창을 포함한 높이라 아래가 잘리거나 튄다.

5. **키보드는 «입력 중이냐» 하나로만 판정한다** — `--kbh > 0` 으로 「진짜 키보드」를 가르려 하지 않는다.
   레이아웃 뷰포트까지 줄어드는 판에서는 키보드가 올라와도 `--kbh` 가 0 이다(사고 4건).
   탭이 숨을 이유는 **「키보드가 입력칸을 가리는 채팅 화면」 하나뿐**이다.

## ✅ 검사가 잠근다 (사람 눈에만 기대지 않는다)

* `test/smoke.mjs` 의 **「죽은 여백」 검사** — 폰 크기에서 채팅·문서·할 일·폴더 **네 화면을 돌며** 각 화면의 마지막 내용과 탭 바 윗변 사이 빈 공간을 재고, **24px 을 넘으면 빨강**이다. 화면을 새로 만들면 이 목록에 더한다.
* 고칠 때는 **고치기 전 판에서 빨간지 먼저 확인한다**(리포 규칙).
