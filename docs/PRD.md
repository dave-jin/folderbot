# Rondo V1 — PRD (정식 버전)

> **버전**: v0.2 · 2026-09-12 · **초안 — Dave 와 함께 수정 중. 코드 작업 금지, 계획만.**
> **관계**: 알파(베타) = `dave-jin/rondo-app` v0.0.359 (동결 예정) · 정식 V1 = 이 리포 `dave-jin/rondo` (v1.0.0 부터)
> **알파 PRD**: `PARA/3. Area/제품_Rondo/PRD.md` v3.3 — V1 이 계승하는 개념(론도·그룹·마에스트로·컨텍스트 3축·상태 언어·편집기 골든 스펙)은 거기 정의를 그대로 따른다. 이 문서는 **바뀌는 것**만 적는다.

---

## 0. 한 줄 정의

**Mac mini 가 나의 개인 클라우드가 되고, Rondo 가 그 위에서 어디서든 여는 원격 에이전트 IDE 가 된다.**

알파는 *"내 맥에서 여는 에이전트 워크스페이스"* 였다. V1 은 *"항상 켜진 Mac mini 에서 세션이 살고, 나는 PC·폰 어디서든 붙어서 지시하고 확인한다"* 로 바뀐다. 화면은 알파를 차용하되, **세션이 사는 곳(호스트)과 보는 곳(클라이언트)이 분리**되는 것이 근본 변화다.

## 1. Dave 의 목표 (2026-09-12 원문 요지)

1. 원격 세션의 **환경 구축 비용**이 너무 크다 → 모든 작업(Claude·Codex)을 **Mac mini 에서** 돌린다. Mac mini = 원격 세션의 메인 공간.
2. PC·iPhone·Android 어디서든 접속해 **세션을 보고 직접 지시**한다. 화면을 덮거나 폰이 꺼져도 세션은 계속 돈다. 다시 켜면 같은 세션에 붙어 진행을 본다.
3. 구성은 둘: **① Mac mini 에 설치하는 호스트 앱** · **② 어디서든 붙는 클라이언트**.
4. 로그인은 **구글 로그인**. 세션을 내 컴퓨터처럼 관리한다.
5. 장점: Mac mini 의 저장공간·리소스 · **Dropbox 볼트** 그대로 · 리포 클론이 쉬움 · 자료 전달이 쉬움.
6. **알파 Rondo 의 화면이 원격 화면**이 된다. 세션을 열고 접근 폴더를 지정하면 그 안에서 파일 생성·세션 실행이 원격으로 전부 가능해야 한다.
7. 고민: Dropbox 와 동기화됐는지 어떻게 확인하나.

### 1.1 🔴 반박 먼저 — 이 목표는 2주 전 결정과 정면으로 충돌한다

볼트 `01_기획/` 의 기록을 시간순으로 놓으면 이렇다.

| 날짜 | 결정 | 근거 |
|---|---|---|
| 08-28 | **Main/Remote 2체제** — Mac mini 에 Rondo Main(볼트의 유일한 주인), 나머지 기기는 Remote 창. 전송은 Tailscale(T1) | 두 맥이 같은 볼트를 각자 쓰다 `workspace.json` 충돌 → *"주인을 한 명으로"* |
| 08-28~09-01 | Remote v1·v2 **출시** (v0.0.305~0.0.329) — 같은 renderer 를 브라우저에서 띄우는 shim, 페어링, SSE, 폰 3층 레이아웃 | |
| 09-02 | 릴레이(Cloudflare DO) 기획 — 폰의 Tailscale 마찰을 없애려고 | |
| **09-05** | **Remote 폐기.** *"맥미니엔 Rondo 를 설치하지 않고 원격 제어만 … Tailscale 로 Rondo 를 보는 방식은 완전히 폐기"* → 미니 = 일꾼, 폰 = 터미널 스트림 + 프롬프트, 핸드오프는 Dropbox | *"사용성이 별로"* · 폰에 Tailscale 필요 · **맥북을 닫으면 죽는다** |
| 09-06 | 🔴 실측: 미니의 헤드리스 `claude` 가 **키체인을 못 읽는다**(SSH·launchd·osascript 전부 실패). 사람이 GUI 로 띄운 `tmux -L rondo` + `/login` 만 된다 | |
| **09-12 (오늘)** | **"모든 작업을 Mac mini 에서 · 알파 화면이 원격 화면 · 어디서든 접속"** | = **08-28 모델로 복귀**, 그것도 더 강하게(미니가 "넘겨받는 곳"이 아니라 **유일한 작업 장소**) |

**짚어야 할 것.** 09-05 의 폐기 사유 세 개 중 **두 개는 오늘 전제에서 사라진다** — "맥북을 닫으면 죽는다"는 호스트가 미니면 성립하지 않고, "미니에 Rondo 를 안 깐다"는 오늘 스스로 뒤집었다. **남는 사유는 하나, 폰 쪽 접속 마찰(Tailscale)** 이고, 그래서 오늘 "구글 로그인"이 나온 것으로 읽는다. 따라서 V1 의 진짜 새 결정은 *"원격 화면을 만드나"* 가 아니라 **"폰이 미니에 어떻게 닿고 누구로 로그인하나"** 다 (§4 Q2). 이 해석이 틀리면 알려 달라 — 아래 전부가 여기에 기댄다.

또 하나: 알파 `todo.md` 의 **S 트랙(S0~S6, 핸드오프·러너)** 은 오늘 결정과 어긋난다. 미니가 유일한 작업 장소면 "맥북 → 미니로 넘기기"는 필요 없다. **S 트랙은 중단하고 V1 로 흡수**하는 것을 제안한다 (§4 Q8).

## 2. 가능성 판정 — **가능하다. 절반은 이미 알파 안에 있다.**

| 필요한 것 | 이미 있는 것 (2026-09-12 확인) | V1 이 할 일 |
|---|---|---|
| 폰·PC 에서 붙을 서버 | 알파 `main/RemoteGateway.ts` 685줄 — 페어링(6자리·메일)·기기별 토큰·RPC·SSE·정적 서빙·쓰기 정책. **출시됨** | 호스트 데몬의 뼈대로 승계 |
| 알파 화면을 브라우저에서 | 알파 `src/remote/` 578줄 — `electron` 모듈을 HTTP 로 바꿔치는 shim. renderer 46,000줄이 **한 줄도 안 바뀌고** PWA 로 뜬다. 폰 3층 레이아웃(CSS 만) | 승계. 단 V1 은 shim 이 아니라 **이 경로가 기본**이 된다 (§3 원칙 4) |
| 접속·로그인 | 알파 `main/Tailnet.ts` — Tailscale 상태·`up`. Tailscale 은 **구글 계정 로그인** · `serve` 로 HTTPS + identity 헤더 · iOS/Android 앱 | Q2 에서 확정 |
| Claude 세션을 미니에 살려두기 | `claude -p --stream-json` 상주 워커 + 절전/기상(r420) + 세션 소유권(r490) + 트랜스크립트 `~/.claude/projects/` | 승계. 🔴 단 **미니 인증 벽**(§2.1) |
| 벤더 대안 | **Claude Code Remote Control**(GA 2026-08): `claude remote-control` 서버 모드, 동시 32세션, 4시간 내 복귀, Anthropic 릴레이, Claude 앱 | 안 짓는다. "이 론도만 Claude 앱으로" 딥링크로 남긴다 |
| Codex | 알파 `CodexSession.ts`(턴마다 `codex exec --json` 스폰). 공식 경로는 **`codex app-server`**(JSON-RPC, `thread/resume`) | app-server 로 교체 (Q4) |
| Dropbox 동기화 확인 | 없음. Finder 아이콘뿐 | `content_hash` 대조 (§6) |
| 폰 푸시 | 없음 (맥 알림·메일뿐) | PWA Web Push (§7 M4) |

### 2.1 🔴 리스크 1 — 미니의 헤드리스 인증 벽 (2026-09-06 실측)

미니에서 `claude` 는 **사람이 GUI 로 띄운 셸의 자손**일 때만 키체인을 읽는다. SSH·LaunchAgent(Aqua 포함)·`osascript` 전부 실패했고, 최종적으로 `tmux -L rondo` + `/login` 으로만 됐다. 이 사실이 V1 호스트의 **기동 방식을 결정**한다.

- 가설(미검증): 실패의 실제 원인은 9/4 CLI 갱신으로 실행 파일 경로가 바뀌어 **키체인 ACL** 이 어긋난 것이고, `/login` 이 그걸 고쳤다. 그렇다면 `/login` 이후에는 **로그인 항목(Login Items)으로 자동 실행되는 GUI 앱**(= 알파 Rondo.app 와 같은 방식)이 키체인을 읽을 가능성이 높다 — 맥북의 알파가 정확히 그 조건으로 돈다.
- **M0 에서 첫 번째로 재는 것**: 미니 재부팅 → 자동 로그인 → 로그인 항목으로 뜬 Rondo 호스트가 `claude` 를 띄워 `loggedIn:true` 인가. 되면 launchd 문제는 끝. 안 되면 호스트는 "사람이 한 번 띄우는 앱" 으로 남고, 죽음 감시만 launchd 가 한다(09-05 기획 §2 의 결론과 같음).
- ⛔ `--bare` + API 키는 대안이 아니다 — Max 구독이 아니라 종량 과금이 된다.
- 알파 `main/Auth.ts` 의 `loggedIn:false` 판정은 헤드리스에서 **"못 읽었다"를 "로그아웃"으로 오판**한다 — V1 은 3갈래(로그인·로그아웃·**이 문맥에선 모름**)로 가른다.

### 2.2 리스크 2~4

2. **미니가 항상 깨어 있고 로그인돼 있어야 한다.** 절전 0 · 자동 로그인 · 재부팅 후 자동 복귀가 호스트의 첫 책임. Codex Remote(벤더 앱)도 같은 조건을 요구한다.
3. **Dropbox.** 알파에서 세 번 사고났다 — 충돌 사본이 수정을 되돌림(r453) · `node_modules` 심링크 파괴(r484·r532) · 볼트 경로 NFD(r422). V1 은 **리포는 Dropbox 밖, 볼트만 안**, 볼트는 오프라인 사용 가능 고정.
4. **알파의 구조 부채를 그대로 들고 오면 "새로 만든" 의미가 없다.** `main/index.ts` 6,699줄 · `App.tsx` 20,000줄+ · 채팅 로그 정본이 두 곳(`~/.claude` 트랜스크립트 + `.aiworkspace/chats/`) · 두 화면이 동시에 론도를 만들면 last-write-wins · `RemoteLiveState` 처럼 "선언만 하고 안 이은" 계약. **재작성 대상은 이것들**이다 (§5).

## 3. 시스템 구성 (제안)

```
[ Mac mini — 항상 켜짐 · 자동 로그인 ]
  rondo-host  (GUI 로그인 항목으로 뜨는 앱 — 창 없음 · 트레이만)   ← 리스크 1 때문에 "데몬"이 아니라 "창 없는 GUI 앱"
   ├─ 세션 엔진   Claude: stream-json 상주 워커(알파 승계) · 절전/기상 · 소유권 락
   │              Codex : codex app-server (JSON-RPC 상주)
   ├─ 워크스페이스 .aiworkspace/workspace.json (알파 스키마 유지) · 론도/그룹/마에스트로 · 유일한 writer
   ├─ 채팅 정본   호스트가 단일 소유 (`chat:append`) — 화면은 캐시만 (알파 TODO 168 의 미결을 여기서 끝냄)
   ├─ 파일 API    볼트 트리·읽기/쓰기·감시 · Dropbox content_hash 대조
   ├─ 볼트 MCP    vault_* · rondo_* (알파 §5.4·§5.5 승계)
   ├─ 이벤트      SSE(알파 승계, 의존성 0) — 상태 머신 브로드캐스트
   ├─ 푸시        Web Push (VAPID) — Fermata·Coda 를 폰으로
   └─ 인증        페어링 토큰(알파 승계) + Tailscale identity 헤더 → Q2
        ▲ tailnet HTTPS (tailscale serve)  ← Q2 에서 릴레이 이음매를 함께 정한다
        │
[ 클라이언트 — 아무 기기 ]
  rondo-client  웹(PWA) — 알파 renderer 를 **IPC 없이** 프로토콜 클라이언트로 이식. 데스크톱 4열 · 폰 3층
  rondo-desktop 얇은 macOS 셸 — 같은 클라이언트 + 네이티브 알림·파일 대화상자·트레이 (알파 `--remote <url>` 모드의 정식판)
  (+ Claude 앱 / ChatGPT 앱 딥링크 — "이 론도만 벤더 앱으로")
```

**원칙 (알파 §2 계승 + V1 추가)**
1. 파일이 진실 — 볼트·세션 파일 모두 미니 디스크의 평범한 파일. 호스트가 죽어도 `claude --resume` 이 터미널에서 된다.
2. CLI 네이티브 유지 — 세션은 벤더 CLI 가 소유. Rondo 는 스폰·관찰·지휘만.
3. **호스트가 유일한 주인** — 볼트를 쓰고 에이전트를 띄우는 프로세스는 세상에 하나. 클라이언트는 절대 파일을 직접 안 만지고 에이전트를 안 띄운다 (08-28 기획의 핵심을 구조로 강제).
4. **로컬은 원격의 특수 경우** — 같은 맥에서 호스트+클라이언트를 띄우면 알파와 같은 경험. 코드 경로는 하나. Electron IPC 결합은 V1 에 없다.
5. HITL 은 어느 기기에서든 보인다 — Fermata 는 폰 푸시로 온다.
6. **"아직 모른다" 상태를 둔다** — 인증·락·동기화 판정에 참/거짓 외 제3값 (알파 LESSONS §7).

## 4. 먼저 정해야 하는 갈림길 (Dave 결정)

| # | 질문 | 추천 1안 | 대안 | 왜 갈리나 |
|---|---|---|---|---|
| **Q1** | 폰에서 무엇까지 | **알파 Remote 와 같게 — 전체 화면(레일·채팅·문서·TODO), 폰은 3층** | 09-05 안(터미널 스트림 + 입력만) · 벤더 앱만 | Dave 오늘 원문: *"알파 화면이 원격 화면"*. 이미 만들어져 있어 비용도 낮다 |
| **Q2** 🔴 | 폰이 미니에 어떻게 닿고 누구로 로그인하나 | **Tailscale** — 구글 계정 로그인이 곧 Tailscale 로그인. 포트 0. + **릴레이 이음매**(전송 추상화)만 미리 파 둔다 | 자체 릴레이(09-02 B안, 서버 운영 + 자체 구글 OAuth) · Tailscale Funnel(공개 URL + 자체 구글 OAuth) | 09-05 폐기 사유 중 유일하게 남은 것. "구글 로그인"이 **Tailscale 로 충족되면** 서버를 안 굴린다. 안 되면(폰에 앱 못 깐다 등) 릴레이가 V1 범위로 들어오고 일정이 한 달 늘어난다 |
| **Q3** | Claude 세션 엔진 | **알파 stream-json 상주 워커 승계** (절전·기상·권한 stdio·소유권 락 검증됨) | Agent SDK(TS) 로 교체 | SDK 도 결국 같은 CLI 를 감싼다. 재작성 이득이 검증된 코드를 버리는 손실보다 작다. SDK 는 `listSessions()` 같은 조회에만 |
| **Q4** | Codex | `codex app-server` JSON-RPC 상주 | 알파 `exec --json` 턴별 스폰 | app-server 가 데스크톱 앱·VS Code 가 쓰는 공식 경로. 턴별 스폰은 컨텍스트·큐 처리가 취약 |
| **Q5** | 데스크톱 셸 | **웹 클라이언트가 정본, macOS 셸은 얇게(Electron 유지 — node-pty·알림·자동 업데이트 코드 재사용)** | Tauri 로 교체 | 셸이 하는 일이 작아지므로 프레임워크 교체 이득이 작다. 알파 배포·업데이트 파이프라인 재사용 |
| **Q6** | 알파 → V1 전환 | 알파 **동결·태그**, V1 은 별도 앱 id 로 미니에 설치. 병행 기간엔 **V1 만 볼트를 연다** | 자동 업데이트로 밀어넣기 | 같은 볼트에 주인이 둘이면 08-28 사고 재현 |
| **Q7** | 기획 정본 위치 | **이 리포 `docs/PRD.md`**, PARA 엔 링크 | 알파처럼 PARA | 원격 세션(이 세션 포함)이 PARA 를 항상 읽지는 못한다 |
| **Q8** | 알파 S 트랙(핸드오프·러너) | **중단 → V1 로 흡수** (미니가 유일 호스트면 "넘기기"가 필요 없다) | 계속 진행 | 오늘 결정과 어긋난다. S0 의 인증 실측만 V1 M0 로 가져온다 |

## 5. 알파에서 무엇을 가져오고 무엇을 버리나

### 5.1 자산 인벤토리 (2026-09-12 탐색)

| 층 | 알파 자산 | 규모 | V1 판정 |
|---|---|---|---|
| 개념·스키마 | `core/workspaceMerge.ts` (`WorkspaceDoc`: tasks·railOrder·pinned·maestro·rev·tombstones) · `.aiworkspace/{workspace.json,chats/,undo/,structure.yml,harness.json}` | — | **그대로** — 마이그레이션 0 |
| 원격 계약 | `core/remoteContract.ts` 243줄 — 프레임·에러코드·`REMOTE_WRITE_POLICY` 22채널 | S | **승계 후 확장** — 이것이 V1 의 유일한 호스트↔클라이언트 계약이 된다 |
| 게이트웨이 | `main/RemoteGateway.ts` 685줄 — tailnet 만 바인드·토큰·SSE·페어링·메일 속도제한 | M | **승계** (Electron 의존 0) |
| 원격 shim | `src/remote/` 578줄 + `vite.remote.config.ts` | S | **폐기** — V1 은 shim 이 아니라 renderer 가 계약을 직접 쓴다 |
| Tailscale | `main/Tailnet.ts` 98줄 | S | 승계 |
| 세션 엔진 | `main/ClaudeSession.ts` · `CodexSession.ts` 272줄 · `index.ts` 의 `session:start`/절전/기상 · `claudeProjects.ts`(NFC/NFD) · `core/sessionOwnership.ts` · `core/idleReclaim.ts` · `core/workerReport.ts` | L | **승계 + 분리** — `index.ts` 6,699줄에서 떼어내 호스트 모듈로 |
| 채팅 동기화 | `core/chatSync.ts` · `composerSync.ts` | S | 승계하되 **정본을 호스트로** 옮기면 절반은 필요 없어진다 |
| 핸드오프 | `core/handoff.ts` 203줄 · `main/Handoff.ts` 314줄 · `scripts/rondo-handoff` | M | **보류** — Q8. 락 개념만 "호스트 단일 주인" 에 흡수 |
| 렌더러 | `src/renderer/` 36,624줄 (`App.tsx` 20,000+) — 4열·레일·문서 편집기·채팅·하네스·온보딩·설정 | XL | **이식** — 화면은 그대로, `window.wwa`(IPC 표면) 를 계약 클라이언트로 교체. `App.tsx` 는 이 기회에 쪼갠다 |
| 문서 편집기 | CM6 라이브 프리뷰 · churn 0 하네스 · Mark 스펙 M0~M7 | L | **그대로** — 회귀 하네스까지 통째로 |
| 디자인 | `DESIGN.md` 557줄 · 폰 3층 CSS(r469~r473, JS 0) | — | 그대로 + 모바일 규칙 명문화 |
| QA | `scripts/qa.mjs` · vitest · 픽스처 볼트 · 화면 검사 · 빌드 도장 · `check-remote-*` | L | 승계 + **원격 왕복 통합 테스트** 추가 (stub CLI 로) |
| 배포 | `publish-update.sh` · `release-public.sh` · 테스트 갈래 · DMG 정리 | M | 승계 (호스트용 갈래 추가) |
| 알림 | 맥 네이티브·트레이·HUD·Dot | M | 승계 + Web Push 추가 |
| 메일 페어링 | `main/Mailer.ts` 198줄 | S | 승계 (Q2 에 따라 불필요할 수도) |

**규모 감각**: main 14,625 · renderer 36,624 · core 6,591 · remote 578 줄. "완전히 새로" 는 **main 을 호스트로 재편(대부분 이동·분리)** 하고 **renderer 의 IPC 결합을 끊는** 일이지, 5만 줄을 다시 쓰는 일이 아니다.

### 5.2 알파가 남긴 미결 — V1 이 구조로 끝낼 것

- 채팅 로그 정본 → 호스트 (`chat:append`) · 두 화면 동시 론도 생성 last-write-wins · 고아 워커 청소 · 화면 상태 중 무엇을 호스트가 갖나 (알파 `TODO.md` 156·168~173).
- QR 페어링 없음 · 폰 첫 페인트 시간 미측정 · G3(7일 실사용) 미판정.

## 6. Dropbox 볼트 — 동기화 판정 설계

- **볼트 = 미니의 Dropbox 폴더**, 에이전트 cwd 도 여기. **리포는 Dropbox 밖**(`~/dev/`).
- **필수 설정**: 볼트 전체 **오프라인 사용 가능** 고정 · `node_modules` 류는 볼트에 두지 않는다.
- **판정 (결정적)**: Dropbox 공식 `content_hash`(4MB 블록 SHA-256 → 이어붙여 SHA-256)를 로컬에서 계산 → API `files/get_metadata` 의 `content_hash` 와 비교. 같음=동기화됨 · 다름=전송 중/충돌 · 조회 실패=**모름**(회색). Finder 아이콘·File Provider 에 의존하지 않는다.
- **표면**: ③ 문서 푸터·② 트리에 동기화 점. Coda 알림에 "Dropbox 반영됨" 덧붙임 가능.
- **충돌 사본** `(conflicted copy)` 감지 → 레일 배지. 병행 기간(알파·V1)엔 **V1 만 볼트를 연다**.
- **경로**: 항상 realpath + NFC 정규화 (알파 r422 사고).

## 7. 마일스톤 (초안 — Q1~Q8 확정 후 재조정)

| 단계 | 내용 | 검증 기준 |
|---|---|---|
| **M0 스파이크** (1주) | ① 🔴 미니 인증: 재부팅→자동 로그인→로그인 항목 앱이 `claude` 를 띄워 `loggedIn:true` ② Tailscale serve 로 폰 브라우저에서 알파 Remote 접속(이미 되는 것 재확인) ③ `codex app-server` 왕복 ④ Web Push 가 잠긴 iPhone 에 도착 | 네 가지 실측 결과가 문서에 적힘. ①이 실패하면 §3 의 호스트 기동 방식을 바꾼다 |
| **M1 호스트** | 알파 main 을 호스트로 재편: 게이트웨이·세션 엔진·워크스페이스·채팅 정본·볼트 MCP · 계약 v1 확정 | 픽스처 볼트 + stub CLI 로 원격 왕복 통합 테스트 그린 |
| **M2 클라이언트** | renderer 의 `window.wwa` 를 계약 클라이언트로 교체 · `App.tsx` 분할 · 편집기 churn 0 유지 · 폰 3층 | PC 브라우저·iPhone·Android 에서 같은 론도 조작 · 편집기 회귀 0 |
| **M3 볼트·Dropbox** | 하네스 스캔·todo·마에스트로 이식 · content_hash 판정 · 충돌 배지 | Dave 실 PARA 볼트에서 일상 작업 1건 |
| **M4 HITL·알림** | Fermata/Coda Web Push · 권한 카드·AskUserQuestion 카드 원격 | 폰이 잠겨 있어도 확인 요청이 온다 |
| **M5 셸·배포** | 얇은 macOS 셸 · 호스트 갈래 배포 · 알파 데이터 무손실 인계 · 미니 셋업 가이드 | 새 미니에 30분 안에 설치 |
| **V1.0** | 알파 동결 → 제거. tryrondo.com 가이드 갱신 | Dave 가 알파를 지운 뒤 일주일 |

## 8. 알파(베타) 계획 — 요약 (상세는 `rondo-app/docs/plans/ALPHA-FREEZE.md` 로 분리 예정)

1. **동결**: v0.0.359 를 `alpha-final` 로 태그. 이후 커밋은 치명 버그·데이터 안전만.
2. **S 트랙 중단** (Q8) — 완료된 S1 코어는 남기고 S2 이후는 착수하지 않는다. `todo.md` 에 사유를 적는다.
3. **계약 유지**: `workspace.json`·`.aiworkspace/`·세션 파일 위치를 바꾸지 않는다 — V1 이 그대로 읽는다.
4. **역할**: V1 의 참조 구현. 이식이 끝난 모듈은 알파에서 더 손대지 않는다.
5. **종료 조건**: V1.0 이 일상 작업을 전부 받은 뒤 일주일 → 알파 제거·업데이트 채널 폐쇄.

## 9. 열린 질문 (Dave 에게)

§4 Q1~Q8 외에:
- 미니 현황: macOS 버전 · 자동 로그인 여부 · Dropbox/Claude/Codex/Tailscale 설치 상태 · 현재 `tmux -L rondo` 러너가 떠 있는지.
- 가장 자주 쓸 접속 기기 하나(iPhone? 맥북?). 그 경험을 먼저 완성한다.
- 볼트 밖 폴더(`~/dev/*` 리포)를 론도 폴더로 허용하나 — 알파는 볼트 안으로 제한.
- 당분간 Dave 전용인가, 남도 쓰는 제품인가 — Q2 의 답이 달라진다(남이 쓰면 Tailscale 강요가 어렵다).

## 10. 사실 확인 기록 (2026-09-12)

- Claude Code Remote Control — `code.claude.com/docs/en/remote-control`: `claude remote-control` 서버 모드(`--spawn` · `--capacity` 32 · 4시간 내 `--continue`/`--session-id`) · 모든 플랜 · Anthropic API 경유 · 로컬 프로세스 종료 시 오프라인 · GA 2026-08.
- Codex Remote — `learn.chatgpt.com/docs/remote-connections`: 호스트 = ChatGPT 데스크톱 앱, QR 페어링, 호스트 깨어 있고 로그인 필요, API 없음. GA 2026-06-25.
- Codex app-server — JSON-RPC 2.0, stdio·WebSocket, `thread/resume`, `exec-server`(실험).
- Claude Agent SDK 세션 — `~/.claude/projects/<encoded-cwd>/*.jsonl`, `resume`/`forkSession`, `listSessions()`, 같은 머신에서만 유효.
- Tailscale Serve — tailnet 내 HTTPS, identity 헤더, 구글 로그인, iOS/Android 앱.
- Dropbox — 동기화 상태 공식 API 없음. `content_hash` 알고리즘 공개.
- 알파 실측 — 볼트 `01_기획/2026-09-05_기획_맥미니를-세션-서버로.md` §2 · `2026-09-06_가이드_미니에-러너-셸-띄우기.md` (인증 벽 4경로) · 리포 탐색(§5.1 수치).

## 변경 이력

| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-09-12 | v0.2 | 알파 탐색 반영 — Rondo Remote 자산 인벤토리(§5.1) · **§1.1 09-05 결정과의 충돌 지적** · 🔴 미니 인증 벽을 리스크 1 로(§2.1) · Q3 를 "SDK 교체"에서 "stream-json 승계"로 뒤집음 · Q8(S 트랙) 추가 · 호스트를 데몬이 아닌 창 없는 GUI 앱으로 |
| 2026-09-12 | v0.1 | 초안 — 목표 정리 · 가능성 판정 · 시스템 구성 · Q1~Q7 · Dropbox 판정 · 마일스톤 · 알파 계획 요약 |
