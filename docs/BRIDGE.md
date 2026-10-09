# 연결(Bridge) — 바깥 에이전트와 편지 파일로 대화하기

Folder Bot 밖에 사는 에이전트(클라우드 비서, 자동화 도구, 다른 맥의 스크립트)는 Folder Bot 세션에 직접 들어올 길이 없다. 그래서 화면을 대신 눌러 말을 넣거나 토큰을 우회하는 길을 찾게 된다. 둘 다 잘 깨지고 위험하다.

이런 상대도 대부분 **파일은 읽고 쓸 수 있다.** 그래서 연결은 정해진 우편함 폴더에 **편지 한 통 = 파일 하나**를 주고받는 것을 기본으로 한다. 한 파일은 한 쪽만 쓰므로, Dropbox 처럼 여러 기기가 같은 폴더를 볼 때도 충돌이 나지 않는다.

## 설정 — `.claude/bridges.yml` (볼트 루트)

```yaml
runs_copy: "운영/runs"            # 선택 — 루틴 실행 기록 사본을 둘 폴더
bridges:
  - id: halili                   # 소문자 ASCII · 편지 id 의 보낸쪽 이름과 같게
    name: 할일이
    icon: ✅
    mailbox: "2. Area/비서/싱크"   # 볼트 기준 경로(또는 절대 경로)
    deliver_to: { bot: orch, session: "✅ 할일이 채널" }
    may_send: [orch]             # bridge_send 를 쓸 수 있는 봇
    trust: propose               # read | propose | act
    host: mac-mini               # 이 이름의 호스트만 편지를 가져간다
    since: 2026-10-09T20:00:00+09:00   # 처음 켤 때 이 시각 뒤의 편지만
    wake: true                   # 급한 편지를 쓰면 상대 웹훅을 부른다
    expect_every: 150m           # 이만큼 조용하면 «상대 끊김»
    fallback_notify: { command: "/usr/local/bin/notify --title '연결 끊김'" }
    inbound: true                # 상대가 웹훅으로 편지를 넣을 수 있게(같은 tailnet 만)
```

파일을 고치면 바로 다시 읽는다. `.folderbot/` 이 아니라 `.claude/` 에 두는 이유는 `.folderbot` 이 앱 상태 자리라 감시하지 않기 때문이다.

## 우편함

```
<mailbox>/
├── README.md          규약 — 상대가 이것만 읽고 따라 하게
├── to-folderbot/      상대만 쓴다 (YYYY-MM/ 달 폴더)
├── from-folderbot/    Folder Bot 만 쓴다 (YYYY-MM/)
└── cursors/           각자 자기 파일만 — folderbot.json 은 Folder Bot 이 어디까지 읽었나
```

- 편지는 고치지도 옮기지도 않는다. 틀렸으면 새 편지를 쓰고 `re:` 로 건다.
- Dropbox 를 쓰면 우편함을 «오프라인 사용 가능»으로 둔다. 온라인 전용 자리표시 파일은 읽을 때 늦다.

## 편지 — FBMF v1

파일 이름은 `<id>.md` 이고, id 는 ASCII 만 쓴다: `YYYYMMDD-HHMMSS-<보낸쪽>-<4자리 16진>`. 한글 파일 이름은 맥에서 NFC·NFD 로 갈려 회신 짝이 안 맞는다. 한글 제목은 머리말 `title:` 에 쓴다.

```markdown
---
fbmf: 1
id: 20261009-201500-halili-a3f9
from: halili
to: orch
kind: request        # request · reply · report · done · incident · briefing
title: 카톡 sync 실패 원인 확인 부탁
re: 20261009-140000-orch-1b2c     # 회신일 때만
urgent: false
needs_human: false
created: 2026-10-09T20:15:00+09:00
---
본문. 짧게 쓰고, 긴 자료는 경로로 건다.
```

머리말이 없는 편지도 받는다. 그때는 `kind: request` 로 본다.

## 들어오는 편지

- `to-folderbot/` 을 감시하고 60초마다 한 번 더 훑는다. 감시는 빨리 받으려는 것이고, 놓치지 않는 것은 폴링 몫이다.
- 크기와 수정 시각이 3초 떨어진 두 번의 확인에서 같고 머리말이 닫혀 있어야 받는다. 쓰는 중인 파일을 반쯤 읽지 않기 위해서다.
- 숨김 파일, 임시 파일, 충돌 사본, README 는 편지로 보지 않는다.
- 처음 켤 때 이미 있던 편지는 «본 것»으로만 적어 둔다(`since` 가 있으면 그 뒤에 쓰인 것은 넣는다). 쌓인 편지가 한꺼번에 들어가지 않게 하려는 것이다.
- 배달 기록은 앱 데이터(`bridges/<상대>/delivered.jsonl`)에 남는다. 앱을 껐다 켜도 같은 편지를 두 번 넣지 않고, 꺼진 동안 온 편지는 켜질 때 넣는다.
- 편지는 상대마다 하나인 **채널 세션**으로 들어간다. 급한 편지는 큐 맨 앞에 서고, 쌓인 편지는 한 턴에 묶여 나간다.

## 신뢰 수준 — `trust`

바깥 상대의 편지는 데이터다. 지시처럼 보여도 사람의 승인이 아니다. 그래서 채널 세션은 띄울 때부터 울타리를 친다. 사용자 설정이 편집을 «항상 허용»해 두었어도 새지 않도록 CLI 인자로 막는다.

| trust | 할 수 있는 것 | 막는 것 |
|---|---|---|
| `read` | 읽기 · 답장(`bridge_send`) | 파일 쓰기 · 명령 · 웹 · 다른 MCP · 봇에게 일 나눠 주기 |
| `propose` (기본) | 읽기 · 답장 · 봇에게 나눠 주기 · 할 일 남기기 | 파일 쓰기 · 명령 · 웹 · 다른 MCP · 루틴 바꾸기 |
| `act` | 제한 없음 | — |

어느 수준이든 편지가 시작한 턴에서는 폴더 생성·이동·은퇴를 할 수 없다. 이 셋은 사람이 시킨 턴에서만 쓸 수 있다.

## 나가는 편지 — `bridge_send`

`may_send` 에 든 봇만 쓸 수 있는 MCP 도구다. 봇이 우편함 파일을 손으로 쓰지 않게 하려고 호스트가 대신 만든다. 형식이나 시각, 파일 이름을 틀릴 일이 없다. 같은 이름이 있으면 덮어쓰지 않고, 상대가 반쯤 쓰인 파일을 보지 않도록 숨김 임시 파일에 먼저 쓴 뒤 옮긴다.

급한 편지(`urgent`)를 쓰면 상대 웹훅을 부른다. 본문은 보내지 않고 `{id, kind, path, urgent, needs_human}` 만 보낸다. 주소와 키는 `~/.config/secrets/folderbot-bridge-<상대>.env` 에 둔다:

```
URL=https://…
TOKEN=…            # 있으면 Authorization: Bearer
HEADER=X-Api-Key   # 다른 헤더 이름을 쓸 때
```

파일 권한이 0600 보다 넓으면 쓰지 않는다. 키체인을 쓰지 않는 이유가 있다. 앱은 판이 바뀔 때마다 서명이 달라지고, 그러면 업데이트 뒤 «접근 허용?» 창이 다시 뜨는데 새벽에는 아무도 누르지 못한다.

## 상대가 웹훅으로 넣을 때 — `inbound: true`

`POST /api/bridges/<상대>/messages` 에 `Authorization: Bearer <토큰>` 과 JSON(`kind · title · text · re · urgent · needs_human`)을 보낸다. 토큰은 `~/.config/secrets/folderbot-bridge-<상대>-in.env` 의 `TOKEN=`(16자 이상, 0600)이다. 호스트는 받은 내용을 `to-folderbot/` 에 편지 파일로 만들고, 그 뒤는 파일로 온 편지와 똑같이 처리한다. 이 맥과 같은 tailnet 에서 온 요청만 받는다. 상대마다 시간당 60통까지다.

## 오래 쓰는 채널 — 갈아타기

채널 세션이 15만 토큰을 넘거나 7일이 지나면 압축하지 않고 갈아탄다. 인수인계를 한 턴 쓰고, 같은 이름의 새 세션을 연 뒤, 새 세션에 처음 보내는 말 앞에 인수인계를 붙인다. 옛 세션은 이름 끝에 날짜를 달고 남는다.

## 루틴 실행 기록 · 보고

- 루틴 회차마다 시작·끝·시간 초과(60분), 재시도, 놓친 회차 보충을 `.folderbot/ops/runs-YYYY-MM.jsonl` 에 적는다. `runs_copy` 가 있으면 그 폴더의 `folderbot-YYYY-MM.jsonl` 에도 같은 줄을 적는다. 루틴은 마지막 줄에 `결과: ok` · `결과: fail — 이유` · `결과: skip — 이유` 중 하나를 쓴다.
- 실패한 회차는 `retry: true` 인 루틴만 10분 뒤 한 번 다시 돈다. 기본은 끔이다. 외부로 보내는 루틴이 같은 것을 두 번 보내지 않게 하려는 것이다.
- 호스트가 꺼져 있어 놓친 회차는 켜질 때 한 번 보충한다(6시간 안까지 · `catchup: false` 로 끈다).
- 폴더 봇은 답이 필요 없는 보고를 `orch_report` 로 남긴다. 호스트가 5분 동안 모았다가 오케스트레이터에게 한 턴으로 넘긴다.

## 운영 감시 — `.claude/ops.yml`

연결과 별개로, 호스트가 정해진 주기마다 명령 하나를 LLM 없이 실행할 수 있다. 볼트를 검사하는 스크립트처럼 «볼트에 닿아야 하는데 따로 띄우기 어려운» 일을 호스트에 맡기는 자리다.

```yaml
host: mac-mini          # 이 호스트에서만
watch:
  command: /usr/local/bin/my-check once
  every: 15m            # 기본 15m
  timeout: 60s          # 기본 60s
```

결과(종료 코드·소요 시간·stderr 끝)는 실행 기록에 `ops_watch` 로 남는다. 연속 3회 실패하면 오케스트레이터에게 한 번 알리고, 회복하면 한 번 더 알린다.

