# Project Bot — PRD

> **버전**: v0.4 · 2026-09-12 · **초안 — Dave 와 함께 수정 중. 코드 작업 금지, 계획만.**
> **가제**: **Project Bot** (Dave 2026-09-12). 리포는 당분간 `dave-jin/rondo` 를 그대로 쓴다.
> **위치**: 완전히 새로운 프로덕트. Rondo 알파(`rondo-app`)는 **부품 창고**로만 쓴다 (부록 A). 알파의 결정·이력은 이 문서에 적지 않는다.
> **1차 레퍼런스**: xAI **Grok Bot** (2026-08 베타). 2차: Claude Code Remote Control · Codex Remote · Cursor Cloud Agents.

---

## 0. 한 줄 정의

**내 Mac mini 위에서 사는, 폴더마다 하나씩 붙는 AI 동료들 — 그리고 그들을 PARA 로 관제하는 오케스트레이터.**

Grok Bot 이 *"봇마다 클라우드 컴퓨터 하나"* 라면, Project Bot 은 *"내 컴퓨터(Mac mini) 하나에 **폴더마다 봇 하나**"* 다. 봇을 설정하지 않는다 — **하네스가 이미 있는 PARA 폴더가 봇 후보이고, 필요할 때 깨운다.** 깨우고 재우고 폴더를 새로 파는 일은 **오케스트레이터**가 맡는다. 어디서든(PC·iPhone·Android) 동료에게 말 걸듯 봇에게 말하고, 봇은 그 폴더의 지침·기억·자료를 들고 Mac mini 에서 일한다. 내 폰이 꺼져도 일은 계속된다.

## 1. 문제

1. **환경이 곧 병목이다.** 원격 세션(Claude Code on the web 등)은 매번 환경을 새로 만든다 — 클론·의존성·자격증명·볼트 접근. 내 Mac mini 에는 그 전부가 이미 있다.
2. **세션이 폴더를 모른다.** 지금은 세션을 열 때마다 사람이 폴더를 고르고 맥락을 다시 주입한다. 일은 이미 PARA 폴더로 나뉘어 있는데, 도구는 그 구조를 모른다.
3. **관제탑이 없다.** 프로젝트 N 개가 병행되는데 "지금 어디서 무엇이 돌고 있고, 무엇이 내 결정을 기다리나" 를 한 곳에서 못 본다.
4. **책상을 떠나면 끊긴다.** 이동 중·소파에서 승인 하나 누르고 한 줄 지시하는 것이 실제 사용 형태인데, 세션은 노트북 뚜껑과 운명을 같이한다.

## 2. 레퍼런스와 차이점

| | Grok Bot | Claude Code Remote Control | **Project Bot** |
|---|---|---|---|
| 봇이 사는 곳 | xAI 클라우드 VM (봇당 1) | 내 맥의 터미널 프로세스 | **내 Mac mini** (호스트 1, 봇 N) |
| 봇의 단위 | 사람이 이름 붙여 만든 봇 | 세션 하나 | **폴더 = 봇** (후보는 자동, 활성은 필요할 때) |
| 봇의 기억 | 내부 메모리, 열람·내보내기 불가 | 세션 트랜스크립트 | **폴더 안의 파일** (CLAUDE.md·readme·todo·노트) — 열람·편집 가능 |
| 동시 세션 | 봇당 1 | 서버 모드 최대 32 | **봇당 N**, 호스트 상한 |
| 관제 | 없음(봇들이 같은 VM 공유) | 없음 | **오케스트레이터 1** — PARA 전체를 보고 봇을 부린다 |
| 스케줄 | 루틴(schedule) | 없음 | **루틴(cron)** — 봇별·오케스트레이터별 |
| 모델 | xAI 고정 | Claude | **Claude Code · Codex** (봇마다 선택, 병행 가능) |
| 접속 | 데스크톱·iOS·Android 앱 | claude.ai · Claude 앱 | **웹(PWA)** 어디서나 + 얇은 macOS 셸 |
| 자체 호스팅 | 불가 | 해당 없음 | **그 자체가 자체 호스팅** |
| 가격 | $200/월 | 구독 포함 | 내 구독(Claude Max·ChatGPT) + 전기세 |

**차별점 두 줄**: ① **폴더가 봇이다** — 봇을 "설정"하지 않는다. 폴더의 하네스(CLAUDE.md·.claude/·readme·todo)가 곧 봇이고, 필요할 때 깨울 뿐이다. ② **오케스트레이터가 PARA 를 안다** — 폴더 생성·봇 깨우기/재우기·Inbox 분류·아카이브·주간 리뷰 같은 구조 작업을 사람이 안 한다.

## 3. 개념 모델

```
Host (Mac mini · 항상 켜짐)
 ├─ Orchestrator ★ 1개 — cwd = PARA 루트. 폴더를 파고, 봇을 깨우고·재우고, 부른다. 루틴을 돌린다.
 ├─ 봇 후보 = PARA 각 범주의 **2단계 폴더** (`2. Projects/<x>` · `3. Area/<x>` …) — 하네스가 이미 구축된 폴더
 └─ Project Bot ★ 깨운 폴더당 1개 (활성)
      ├─ 정체성 = 폴더의 하네스 (CLAUDE.md/AGENTS.md · .claude/ · readme.md · todo.md)
      ├─ Session 0..N (동시) — Claude Code 또는 Codex · 각자 --resume 가능
      ├─ Routine 0..n (cron) — 이 봇 안에서 주기적으로 도는 세션
      └─ 참조 — 볼트의 다른 폴더(Resources 등) · 연결된 코드 리포 (~/dev/*)
```

### 3.1 후보는 자동, 활성은 필요할 때 (봇 수명주기)

```
후보 (PARA 2단계 폴더) ──깨우기──▶ 활성 봇 ──재우기──▶ 휴면 (기록 유지) ──Archive 이동──▶ 은퇴
        ▲                        (사람 또는 오케스트레이터)
        └── 폴더 생성 + 하네스 스캐폴드 (오케스트레이터)
```

| PARA 폴더 | 역할 | 비고 |
|---|---|---|
| `2. Projects/<x>` | **봇 후보** → 깨우면 Project Bot | 기한 있는 일. Archive 로 가면 은퇴 |
| `3. Area/<x>` | **봇 후보** → 깨우면 Area Bot (상시) | 끝나지 않는 책임. 루틴이 주로 붙는다 |
| `4. Resources/<x>` | 기본은 **읽기 참조**. 필요하면 후보로 승격 가능 (Q3) | 봇들이 `--add-dir` 로 읽는다 |
| `1. Inbox` · `5. Archive` | 봇 없음 — **오케스트레이터의 영역** | 분류·배정·아카이브 |

- **후보는 파생**(스캔)이고 **활성 목록만 저장**한다 (`PARA/.projectbot/bots.yml`). 봇이 많아지지 않도록 **활성 상한**(기본 8)을 둔다 — 넘기면 오케스트레이터가 재울 봇을 제안한다.
- **깨우는 방법 셋**: ① 사람이 후보 목록에서 선택 ② 오케스트레이터에게 "X 봇 깨워" ③ 오케스트레이터가 Inbox 분류·루틴 중 필요해서 제안(사람 승인).
- **폴더가 없으면 오케스트레이터가 판다** — PARA 규칙에 맞는 위치·이름으로 폴더를 만들고 하네스 스캐폴드(CLAUDE.md·readme.md·todo.md·`.claude/`)를 깐 뒤 깨운다. 사람은 이름만 말한다.
- 폴더 안 `.bot.yml`(선택)로 `vendor: codex` · `repo: ~/dev/foo`(코드 세션의 cwd) · `routines:` · `candidate: false`(후보에서 제외)를 선언한다.
- 볼트 밖 코드 리포는 **PARA 폴더가 가리킨다**(`repo:`). 문서는 PARA 에, 코드는 `~/dev` 에 — Dropbox 가 `node_modules` 를 건드리지 않게.

### 3.2 오케스트레이터 (Orchestrator)

- **단 하나.** cwd = PARA 루트. 하네스는 `PARA/.claude/orchestrator.md` 에만 있어 프로젝트 봇이 상속하지 않는다.
- 하는 일: ① 후보·활성 봇 목록과 상태 파악 ② **폴더 생성 + 하네스 스캐폴드** ③ **봇 깨우기·재우기·은퇴** ④ Inbox 분류 → 해당 봇에게 위임 ⑤ 봇에게 작업 지시(세션 생성)·호출 관리 ⑥ 결과 취합·보고 ⑦ 완료 프로젝트 아카이브 제안 ⑧ 루틴 관리.
- 도구 (호스트가 MCP 로 제공): `bots_candidates` · `bots_list` · `bot_wake/sleep/retire` · `folder_create`(PARA 위치·하네스 스캐폴드) · `bot_status` · `bot_send`(세션 생성/이어가기) · `bot_sessions` · `routine_list/set` · `vault_search/tree/recent` · `inbox_list/move`.
- **자율 범위** (Q5): 읽기·조사·분류 제안·**봇 깨우기/재우기**는 알아서, **폴더 생성·파일 이동·삭제·외부 발송은 승인** 후. 되돌리기(`undo/` 스냅샷)가 있는 동작만 자동 허용.

### 3.3 세션

- 봇에게 보낸 메시지는 **세션 하나**로 간다. 기본은 봇의 "메인 세션"(가장 최근 활성), `새 세션` 은 명시적. 세션에는 이름이 있다(`--name`).
- 동시 세션 상한: 봇당 4 · 호스트 전체 12 (메모리 기반 거절). 유휴 60분이면 워커를 내리고(절전) 다음 메시지에 같은 id 로 깨운다.
- 코드 리포 봇은 세션마다 **git worktree** 옵션.
- 상태 5종(단일 소스): 대기 · 실행 중 · **확인 대기(HITL)** · 완료 · 오류. 모든 표면(목록·배지·푸시)이 이 하나를 본다.

### 3.4 루틴 (cron)

- 정의는 파일: 봇 폴더의 `.bot.yml` → `routines: [{name, cron, prompt, vendor?, approve?}]`. 오케스트레이터 루틴은 `PARA/.claude/routines.yml`.
- 실행 = 그 봇 안에 세션을 하나 띄워 프롬프트를 보내는 것. 결과는 봇의 대화에 메시지로 남고, 산출물은 폴더에 파일로 남는다.
- 예: 오케스트레이터 매일 07:00 Inbox 분류 제안 · 주간 일요일 "이번 주 각 봇 진행 요약" · `제품_Rondo` 봇 매일 todo.md 미완료 리마인드.
- 루틴은 **승인 정책을 따로** 갖는다 — 사람이 없을 때 도는 것이므로 기본은 읽기 전용 + 제안.

## 4. 사용자 경험

### 4.1 폰 (1순위 표면) — "동료에게 메시지"

```
[봇 목록]                          [봇 화면: 제품_Rondo]
● 오케스트레이터   확인 대기 1        세션 ▾ 메인 · PRD 작성(실행 중) · +새 세션
● 제품_Rondo      실행 중 2         ─────────────────────────────
○ 강의_Founders   대기               ⏵ Read  docs/PRD.md
○ 재무_CFO        완료 · 2h 전        ⏵ Edit  +42 −8
＋ 후보에서 깨우기 (12)             [승인 카드] Bash: npm run qa   [허용][항상][거부]
                                    ─────────────────────────────
                                    [메시지…                    ] ▶
```

- 목록은 **활성 봇**(= 깨운 폴더)이고, 봇 안에 세션 탭. 그룹은 PARA 상위 폴더로 자동. 후보는 접힌 한 줄로만 보인다.
- 확인 대기는 목록 최상단 + 푸시. 승인 카드·선택형 질문 카드는 폰에서 그대로 누른다.
- 문서는 **읽기 + 가벼운 편집**(todo 체크·짧은 노트). 본격 편집은 데스크톱.

### 4.2 데스크톱 (같은 클라이언트, 넓은 화면)

좌측 봇 레일(PARA 트리) · 중앙 문서/터미널 · 우측 봇 대화. 문서 편집기·파일 트리·하네스 보기·터미널 모드는 여기서. 폰과 같은 코드, 레이아웃만 다르다.

### 4.3 첫 실행 (Mac mini)

호스트 설치 → PARA 루트 선택 → 폴더 스캔 → **후보 목록이 채워진다** → 오케스트레이터가 *"지금 활발한 폴더 3개를 깨울까요?"* (최근 수정 기준) → Tailscale 로그인(구글) → 폰에서 주소 열기. 만들 것은 없다.

## 5. 시스템 구성

```
[ Mac mini ]  Host 앱 (로그인 항목으로 자동 실행 · 창 없음 · 트레이)
  ├─ Bot Registry     PARA 스캔·감시 → 후보(파생) + 활성 목록(bots.yml) · 수명주기
  ├─ Session Engine   Claude Code: -p --stream-json 상주 워커(resume · 절전/기상 · stdio 권한)
  │                   Codex: codex app-server (JSON-RPC 상주 · thread/resume)
  ├─ Orchestrator     = 특별한 봇 하나 (cwd PARA 루트 · 전용 하네스 · 관제 MCP)
  ├─ Scheduler        cron → 세션 생성 (루틴)
  ├─ Vault MCP        vault_* · bots_* (봇·오케스트레이터가 쓰는 도구)
  ├─ File API         트리·읽기/쓰기·감시 · Dropbox content_hash 판정
  ├─ Gateway          HTTP + SSE · 기기 토큰 · 쓰기 정책 · 정적 서빙
  ├─ Push             Web Push (VAPID) — 확인 대기·완료
  └─ Auth Watchdog    claude 자격증명 3갈래 판정(로그인·로그아웃·이 문맥에선 못 읽음) → 푸시
        ▲ tailnet HTTPS (tailscale serve) — 전송은 추상화해 두고 릴레이는 이음매만
[ 어디서나 ]  Client (PWA) — 폰 3층 / 데스크톱 3열      [ Mac ]  얇은 셸 (알림·파일 대화상자·트레이)
```

**원칙**
1. **파일이 진실.** 봇의 기억·설정·산출물은 폴더 안 파일. 호스트가 죽어도 `claude --resume` 이 터미널에서 된다. 호스트 전용 상태(기기 토큰·푸시 구독·세션 인덱스)만 `~/Library/Application Support/projectbot/`.
2. **호스트가 유일한 주인.** 볼트를 쓰고 세션을 띄우는 프로세스는 하나. 클라이언트는 파일을 직접 안 만지고 세션을 직접 안 띄운다 → 동기화 충돌이 정의상 없다.
3. **CLI 네이티브.** 세션은 벤더 CLI 가 소유. Project Bot 은 스폰·관찰·지휘만. 벤더가 발전하면 그대로 얻는다.
4. **로컬은 원격의 특수 경우.** 호스트와 클라이언트는 프로토콜 하나로만 만난다. 같은 맥에서 띄워도 경로는 같다.
5. **"아직 모른다" 상태를 둔다.** 인증·동기화·락 판정은 참/거짓 + 제3값.

### 5.1 인증 벽 — 해결 방식

Mac mini 의 헤드리스 프로세스는 `claude` 자격증명(키체인)을 못 읽을 수 있다. 해결은 **우회가 아니라 운영**이다.

1. 호스트는 **로그인 항목으로 뜨는 GUI 앱**(창 없음)이다 — 사람이 GUI 로 로그인한 세션의 자손이 되도록. 미니는 자동 로그인 + 절전 0.
2. 호스트가 30분마다 `claude auth status` 를 3갈래로 판정한다. **"못 읽음"** 이면 폰으로 푸시: *"미니에서 `/login` 이 필요합니다."*
3. Dave 가 **Jump Desktop 으로 들어가 `/login`** 한다. 호스트는 그 뒤 자동 복귀. (Dave 확정: 이 수동 개입은 허용.)
4. 런북을 `docs/RUNBOOK-mini.md` 로 둔다 — 재부팅·CLI 갱신·키체인 ACL 사고 시 절차.
5. ⛔ API 키(`--bare`)로 우회하지 않는다 — 구독이 아니라 종량 과금이 된다.

### 5.2 접속과 로그인 — 결정 필요 (Q2)

| 안 | 구글 로그인 | 폰 설치물 | 서버 운영 | 남이 쓸 때 |
|---|---|---|---|---|
| **A. Tailscale** (추천) | Tailscale 계정 = 구글 | Tailscale 앱 | 없음 | "Tailscale 부터 까세요" 가 문턱 |
| B. Tailscale Funnel + 자체 구글 OAuth | 직접 구현 | 없음(브라우저) | 없음(공개 URL 은 생김) | 됨. OAuth·세션 관리 책임 |
| C. 자체 릴레이 + 구글 OAuth | 직접 구현 | 없음 | **있음** | 제품형. 한 달 추가 |

A 로 시작하고 전송 계층을 추상화해 B/C 를 나중에 끼운다. Dave 전용 기간엔 A 로 충분하다.

### 5.3 Dropbox

- 볼트 = 미니의 Dropbox 폴더. **오프라인 사용 가능** 고정(온라인 전용 파일은 봇이 빈 껍데기를 읽는다).
- 동기화 판정: Dropbox 공식 `content_hash`(4MB 블록 SHA-256) 로컬 계산 ↔ API 메타데이터 비교 → 같음/다름/**모름**. 문서·트리에 점으로 표시. "Dropbox 반영됨" 을 완료 알림에 덧붙일 수 있다.
- `(conflicted copy)` 감지 → 봇 배지. 고빈도 상태는 볼트에 쓰지 않는다(동기화 소음).
- 경로는 realpath + NFC 정규화.

## 6. 데이터

| 무엇 | 어디 | 형식 |
|---|---|---|
| 봇 후보 | 파생 (PARA 2단계 폴더 스캔) — 저장 안 함 | — |
| 활성 봇 목록 | `PARA/.projectbot/bots.yml` | YAML (경로·깨운 시각·벤더) |
| 봇 설정·루틴 | `<폴더>/.bot.yml` (선택) | YAML |
| 오케스트레이터 하네스·루틴 | `PARA/.claude/orchestrator.md` · `PARA/.claude/routines.yml` | md · YAML |
| 세션 트랜스크립트 | `~/.claude/projects/<cwd-slug>/*.jsonl` · Codex 스레드 | 벤더 소유 |
| 봇 대화 뷰(세션 인덱스·읽음 표시) | 호스트 userData | JSON |
| 기기·푸시·토큰 | 호스트 userData | JSON (토큰은 keychain) |
| 되돌리기 스냅샷 | `PARA/.projectbot/undo/` | JSON |

## 7. 마일스톤

| 단계 | 내용 | 검증 |
|---|---|---|
| **M0 스파이크** (1주) | ① 미니: 로그인 항목 GUI 앱이 `claude` 를 띄워 `loggedIn:true` ② Tailscale serve → 폰 브라우저 접속 ③ `codex app-server` 왕복 ④ Web Push 가 잠긴 iPhone 에 도착 ⑤ PARA 스캔 → 후보 목록 파생(하네스 유무 판정 포함) | 다섯 실측이 문서에 적힘. ①이 안 되면 §5.1 을 고친다 |
| **M1 호스트 코어** | Bot Registry · Session Engine(Claude) · Gateway · 상태 머신 · 인증 워치독 | 픽스처 볼트 + stub CLI 로 원격 왕복 테스트 그린 |
| **M2 클라이언트** | 봇 목록 · 봇 화면(세션 탭·스트림·승인 카드) · 폰 3층 · 데스크톱 3열 | iPhone·PC 에서 같은 봇에 지시·승인 |
| **M3 오케스트레이터·루틴** | 관제 MCP(깨우기·재우기·폴더 생성·스캐폴드) · Inbox 분류 · 스케줄러 · 승인 정책 | "X 봇 깨워" 한 마디로 폴더+하네스+봇이 생긴다 · 아침 루틴이 폰에 Inbox 제안을 보낸다 |
| **M4 문서·Dropbox·Codex** | 문서 뷰/편집기 이식 · content_hash · Codex app-server | 실 PARA 볼트에서 일상 작업 1주 |
| **M5 셸·배포·런북** | 얇은 macOS 셸 · 호스트 패키징·자기 업데이트 · 미니 런북 | 새 미니에 30분 안에 설치 |
| **V1.0** | Dave 의 일상 작업 전부가 여기서 돈다 | 2주 실사용 후 판정 |

## 8. 결정할 것 (Dave)

| # | 질문 | 추천 | 대안 |
|---|---|---|---|
| Q1 | 이름 | **Project Bot** (가제 유지) — 리포는 나중에 개명 | — |
| **Q2** | 접속·로그인 | **A. Tailscale** + 전송 추상화 | B · C (§5.2) |
| Q3 | 봇 후보가 되는 PARA 층 | **Projects + Area 의 2단계 폴더** | Resources 까지 |
| Q3b | 활성 봇 상한 | 8 (넘기면 오케스트레이터가 재울 봇 제안) | 상한 없음 |
| Q3c | "하네스 있음" 판정 | `CLAUDE.md` 또는 `.claude/` 존재 | `readme.md` 만으로도 후보 |
| Q4 | 봇당 동시 세션 | 4 (호스트 12) | 무제한 + 메모리 거절만 |
| Q5 | 오케스트레이터 자율 범위 | 읽기·분류 제안 자동, **이동·삭제·발송은 승인** | 되돌리기 가능한 건 전부 자동 |
| Q6 | 루틴 기본 승인 정책 | 읽기 전용 + 제안 (사람 없을 때) | 봇별 "항상 허용" 규칙 |
| Q7 | 벤더 | Claude Code 기본, Codex 봇별 선택 | Claude 만 |
| Q8 | 폰 문서 편집 범위 | todo 체크·짧은 노트만 | 편집기 전체 |
| Q9 | 기획 정본 | 이 리포 `docs/PRD.md` | PARA |

## 9. 열린 질문

- Mac mini 현황: macOS 버전 · 자동 로그인 · Dropbox·Claude·Codex·Tailscale 설치 · 절전 설정.
- 가장 자주 쓸 기기 하나(iPhone?). 그 경험을 먼저 완성한다.
- 오케스트레이터가 Inbox 를 **자동으로 옮겨도** 되는 순간이 있나(예: 명백한 영수증→재무_CFO).
- 첫 루틴 3개를 정해 달라 — M3 의 검증 기준이 된다.

## 10. 사실 확인 (2026-09-12)

- Grok Bot — xAI, 2026-08 베타. 봇당 영속 클라우드 VM(브라우저·파일·터미널·커넥터·MCP). 데스크톱·iOS·Android. 루틴(스케줄)·다중 봇 협업. 승인: 한 번 허용/항상/거부 + Auto Review 규칙. 메모리 열람·내보내기 불가, 자체 호스팅 불가. $200/월 또는 SuperGrok Heavy·Cursor Ultra 포함.
- Claude Code Remote Control — GA 2026-08. `claude remote-control` 서버 모드(동시 32, 4시간 내 복귀). 로컬 프로세스 종료 시 오프라인.
- Codex — Codex Remote(ChatGPT 앱, GA 2026-06, 호스트 로그인 상태 필요, API 없음) · `codex app-server` JSON-RPC(stdio/WebSocket, `thread/resume`).
- Claude Agent SDK — 세션 파일 `~/.claude/projects/<encoded-cwd>/*.jsonl`, `resume`/`fork`, `listSessions()`.
- Tailscale Serve — tailnet HTTPS, identity 헤더, 구글 로그인, iOS/Android 앱.
- Dropbox — 동기화 상태 공식 API 없음. `content_hash` 알고리즘 공개.
- Mac mini 헤드리스 인증 — SSH·launchd·osascript 에서 `claude` 가 키체인을 못 읽는 실측 있음(2026-09-06). 사람이 GUI 로 띄운 셸 + `/login` 은 됨.

---

## 부록 A. Rondo 알파에서 가져올 부품 (이력 아님 — 부품 목록)

| 부품 | 알파 위치 | 규모 | 용도 |
|---|---|---|---|
| 게이트웨이 | `main/RemoteGateway.ts` | 685줄 | tailnet 바인드·토큰·SSE·페어링·정적 서빙 → Gateway |
| Tailscale 연동 | `main/Tailnet.ts` | 98줄 | 상태·`up` |
| 세션 워커 | `main/ClaudeSession.ts` · 절전/기상 · `core/sessionOwnership.ts` · `core/idleReclaim.ts` · `main/claudeProjects.ts`(NFC/NFD) | L | Session Engine |
| Codex 어댑터 | `main/CodexSession.ts` | 272줄 | 이벤트 변환 참고 (app-server 로 교체) |
| 원격 계약 | `core/remoteContract.ts` | 243줄 | 프레임·쓰기 정책의 출발점 |
| 채팅 동기화 | `core/chatSync.ts` · `composerSync.ts` | S | 두 화면 동시 열람 |
| 문서 편집기 | renderer CM6 라이브 프리뷰 + churn 0 하네스 | L | 데스크톱 문서 편집 |
| 폰 3층 레이아웃 | renderer CSS (JS 0) | S | 폰 화면 |
| 디자인 시스템 | `DESIGN.md` | — | 표면·팔레트·상태 언어 |
| 볼트 MCP·하네스 스캔 | main 내장 MCP · `.claude` 정적 스캔 | M | Vault MCP · 봇 정체성 표시 |
| 알림·트레이·HUD | main | M | macOS 셸 |
| QA 관문 | `scripts/qa.mjs` · 픽스처 볼트 · stub CLI · 화면 검사 | L | 그대로 |
| 배포 | `publish-update.sh` · 자기 업데이트 · 테스트 갈래 | M | 호스트 갈래 추가 |

## 변경 이력

| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-09-12 | v0.4 | Dave 정정 반영 — 봇은 자동 생성이 아니라 **필요할 때 깨운다**(후보=PARA 2단계 폴더·활성 상한) · 오케스트레이터가 폴더 생성·하네스 스캐폴드·깨우기/재우기·호출 관리를 맡음 · Q3b·Q3c 추가 |
| 2026-09-12 | v0.3 | **새 프로덕트로 다시 씀** — Project Bot · 폴더=봇 · 오케스트레이터 · 루틴 · Grok Bot 대조 · 인증 벽은 운영(Jump Desktop `/login`)으로 해결 · 알파 이력 제거, 부품 목록만 부록으로 |
| 2026-09-12 | v0.2 | (폐기) 알파 연장선 관점의 초안 |
| 2026-09-12 | v0.1 | (폐기) 첫 초안 |
