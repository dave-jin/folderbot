# FREEBUFF Code Review — Folder Bot (Windows 11 지원 배치)

- **모델명**: `upstage/solar-pro4`
- **리뷰어**: Buffy (Freebuff 코딩 에이전트, Solar Pro 4 기반)
- **대상 배치**: 미커밋 `feat/windows-11-support` 라운드 (작업 트리 diff + 신규 파일 포함)
- **검토 범위**: Windows 포장·워크플로우, 데스크톱 셸(`desktop/*.js`), 프리로드, 클라이언트 UI/설정/권한/트레이, 코어 경로·루트 해석, 호스트 제공자·세션·환경, 관련 테스트·스모크
- **배치 요약**: Windows x64 Electron 셸 추가, 전역 플랫폼 분기(`process.platform`), Windows 경로/볼트 해석, Windows 파일·터미널 열기, Windows 클립보드 파일 드롭, 창 자리·트레이 패널 위치, Windows 전용 권한 문구/단축키/첫 연결 화면, Windows 전용 배포 워크플로우, 시험 추가
- **실행 환경**: **리눅스 호스트**. **Windows 11 런타임은 이 환경에서 unavailable** 이므로, 동작 증명은 코드·기존 그린 테스트·관점에서만 했다. 런타임 동작 확인은 Windows runner/실기기에서 별도 필요.

---

## 1. 통과 상태 (as of review)

보고된 통과 결과:

- `npm run qa` — 68 test files, **440 passed**, 1 skipped, build, smoke, fit

리뷰 결론부터 말하면 **빌드+테스트가 초록인 것은 좋다. 하지만 초록만으로 Windows 11 안전성은 결론 못 낸다.** 아래 P0/P1 중 상당수가 “런타임에서 깨질 수 있는 분기” 이기 때문이다.

---

## 2. 강점 (keep)

1. **Windows 경로를 “명령 문자열”이 아니라 환경/데이터로 넘기는 방향**
   - `src/host/platformOps.ts`, `desktop/clip-core.js`(`windowsFileDropCommand`), `desktop/main.js` 의 파일 드롭/다운로드/열기 분기. 이 결은 보안 관점에서 맞다.
2. **Windows에서 macOS 전용 권한 요구를 하지 않는 방향**
   - `desktop/perm-core.js` / `test/unit/perm-core.test.ts` 의 Windows 호스트 판정은 적절하다. 전체 디스크 접근(FDA)을 Windows에 요구하지 않는 것은 플랫폼 사실에 맞다.
3. **패키징 목록 검증 스모크**
   - `test/unit/desktopFiles.test.ts` 가 `electron-builder.yml` `files` 와 실제 `require`/`__dirname` 참조를 교차 검사한다. 이건 macOS 실사고 기억을 반영한 좋은 방어선이다.
4. **창 자리 정책 분리**
   - `desktop/winBounds.js` + `test/unit/winBounds.test.ts` 처럼 “화면 밖이면 자리만 버린다” 정책을 순수 함수로 뺀 것은 안전하다.

---

## 3. findings

### P0 — 출시 전 반드시 고쳐야 하는 것

#### P0-1. `electron-builder.yml` 에 `files` 로 `host/**` 가 없으면 Windows 앱이 뜨자마자 `Cannot find module` 로 죽는다 (런타임 미확인, 구조상 고위험)

- **경로/위치**
  - `desktop/electron-builder.yml` (신규/수정 대상)
  - `desktop/main.js` (런타임 진입: `HOST_BUNDLE = join(__dirname, 'host', 'host', 'index.mjs')`, `HOST_CLIENT = join(__dirname, 'host', 'client')`)
  - `test/unit/desktopFiles.test.ts`
- **무엇이 문제인가**
  - macOS/macOS 패키징과 달리 Windows 빌드에서 `host/` 디렉터리가 앱.asar/resources 아래로 제대로 따라오지 않으면 `startHostMode` 가 ` hostAvailable()` 에서 걸리거나 `import(pathToFileURL(HOST_BUNDLE)...)` 에서 터진다. 이 배치는 호스트를 데스크톱 앱 안에 embedding 하는 구조라서, **이 누락은 로컬 호스트 모드 자체가 아예 못 뜨는 장애**다.
- **작고 실행 가능한 수정 제안**
  - `electron-builder.yml` `files` 에 `host/**` 가 **명시**되어 있는지 확인하고, 없다면 추가한다.
  - 추가로 `test/unit/desktopFiles.test.ts` 가 `host/host/index.mjs`, `host/client/index.html` 을 실제 패키징 검증에서 잡고 있는지 확인한다. 이미 `main.js` 로컬 의존 스캔에 포함된다면 유지, 아니라면 명시적 검증 하나를 더 넣는다.

#### P0-2. Windows 호스트에서 Claude/Codex 제공 경로가 “실제 설치 환경” 과 다를 수 있다 (런타임 미확인, 구성상 P0)

- **경로/위치**
  - `src/host/providers.ts` (`CANDIDATES`, `process.platform === 'win32'` 분기)
  - `src/host/session.ts` (`claudeBin`, `cleanClaudeEnv`, Windows PATH 미보충)
- **무엇이 문제인가**
  - Windows 후보를 `~/.local/bin/claude.exe` 등으로만 두면, 실제 Windows 사용자가 쓰는 설치 위치(예: 시스템/사용자 PATH, 타 패키지 관리자, 수동 배치)와 어긋날 수 있다. macOS처럼 brew/fixed 경로를 강하게 가정하기 어렵다.
  - 게다가 Windows 셸은 macOS처럼 “node/git 이 보일 것” 을 당연하게 보충하지 않는다(`session.ts` 에서 `process.platform !== 'win32'` 일 때만 PATH 보충). Claude/Codex가 내부적으로 `node`, `git`, 기타 도구를 찾을 때 Windows에서 실패 패턴이 달라질 수 있다.
- **작고 실행 가능한 수정 제안**
  - Windows에서 제공자를 찾을 때 `where.exe` 의존만 믿지 말고, **사용자 환경변수 우선** + 명확한 안내(예: `FOLDERBOT_CLI_BIN`, `FOLDERBOT_CODEX_BIN`)를 문서/설정에서 강조한다.
  - 가능하면 Windows에서 Claude/Codex가 의존하는 도구(node 등)를 찾지 못했을 때, 시작 시점에 “必要な 바이너리/경로를 찾을 수 없음”을 일찍 안내하도록 실패 경로를 분명히 한다.

#### P0-3. Windows 무인/백그라운드 업데이트 미지원을 UI에서 “지원 안 함” 으로 처리하되, Windows 업데이트 UX가 설치/재시작 흐름을 흐리지 않는지 검증 필요 (런타임 미확인)

- **경로/위치**
  - `desktop/updater.js` (`process.platform !== 'darwin'` 분기, `supported: process.platform === 'darwin'`)
  - `src/client/App.tsx` (`useUpdate`, `isWin && !st.supported` 분기, 안내 문구)
  - `src/client/Settings.tsx` 등
- **무엇이 문제인가**
  - Windows 업데이트가 “새 설치 파일로 진행” 이라는 문구를 넣었음은 좋다. 다만 Windows 셸에서 업데이트 상태/적용 버튼이 **호스트 없이도 의미 있게 보이는지**, 그리고 설치 후 사용자가 “그냥 새 exe/DMG 대신 뭘 해야 하는지” 를 명확히 이해하는지 검증이 필요하다. 특히 Windows는 사용자가 설치 파일을 직접 실행해야 하는 경우가 많아, “업데이트 적용” 버튼과 실제 수행이 어긋나면 혼란을 만든다.
- **작고 실행 가능한 수정 제안**
  - Windows에서는 `apply` 계열 동작을 **비활성화/숨김** 하거나, 눌러도 “Windows는 앱 설치 파일로 업데이트하세요” 안내만 나오게 처리를 통일한다.
  - Windows용 릴리스 노트/INSTALL에 “Windows는 새 설치 파일로 교체” 절차를 짧게 못 박는다(`docs/WINDOWS.md`, `docs/INSTALL.md` 업데이트 반영 여부 확인).

#### P0-4. Windows 파일 열기/탐색기 선택 명령의 경로 보간이 안전한지 재확인 필요 — 특히 `explorer.exe /select,` 경로 (런타임 미확인)

- **경로/위치**
  - `src/host/platformOps.ts` (`windowsOpenCommand(..., reveal=true)`)
  - `desktop/main.js` 로컬 파일 열기/reveal IPC 핸들러
- **무엇이 문제인가**
  - `explorer.exe /select,<path>` 는 경로를 명령 줄에 직접 붙인다. 환경변수가 아니라 문자열 보간이므로, 경로에 공백/특수문자가 있을 때 인용 처리가 맞아야 한다. 일반적인 경로는 괜찮더라도, Windows 경로에는 공백·유니코드·한자·특수문자가 흔하게 들어온다.
- **작고 실행 가능한 수정 제안**
  - `reveal` 용 명령도 **가능하면 환경변수/인수 보간을 피하고** Electron `shell.showItemInFolder` 쪽을 우선 검토하는 것이 더 안전하다. 데스크톱 측에서 이미 `shell.showItemInFolder(String(p))` 를 쓰고 있다면, 호스트의 `reveal` 구현이 중복/불일치하지 않은지 확인한다.
  - 만약 호스트에서 직접 실행해야 한다면 `/select,"<path>"` 식의 인용이 필요한지에 대해 Windows 동작 기준으로 명시하거나, 경로 정제를 강화한다.

---

### P1 — 이번 배치에서 함께 잡아야 하는 구조적/보안/관측성 문제

#### P1-1. Windows “로컬 호스트” 가 실제로는 셸(Electron) 안에서 호스트를 띄우는 구조인지, 아니면 별도 터미널/호스트 프로세스 위임인지 경계가 덜 보인다

- **경로/위치**
  - `desktop/main.js` (`startHostMode`, `HOST_BUNDLE`, `HOST_CLIENT`)
  - `src/host/host.ts`, `src/host/gateway.ts`
  - `docs/WINDOWS.md`, `docs/INSTALL.md`
- **관찰**
  - macOS는 “앱 안에서 호스트를 띄우는” 그림이 어느 정도 전제되어 있다. Windows에서도 같은 그림을 의도했다면, **터미널 없이 CLI 바이너리(claude/codex)가 제대로 작동하는지, PATH/인증/샌드박스/로그인 흐름이 Windows에서 어떻게 되는지**가 훨씬 중요하다. 이 경계가 문서·UX에서 덜 선명하면, 사용자는 “앱은 켰는데 Claude가 안 붙는” 상태를 해석하기 어렵다.
- **작고 실행 가능한 수정 제안**
  - Windows 첫 연결/설정 화면에서 “이 PC에서 호스트 실행”이 실제로 무엇을 기대하는지(앱 내장 호스트 vs 외부 터미널 호스트)를 더 분명히 분리한다.
  - Windows에서 호스트가 못 뜨는 경우, 원인을 “바이너리 없음 / 인증 상태 / 포트 충돌 / 권한” 정도로 나눠 주는 초기 진단 문구를 준비한다.

#### P1-2. `process.platform` 분기가 여러 곳에 흩어져 있어서, “macOS 전용이라고 표시한 부분” 이 Windows에서도 조용히 잘못 동작할 위험이 있다

- **경로/위치**
  - `desktop/main.js` 여러 곳(`platform === 'darwin'` / `platform === 'win32'`)
  - `desktop/updater.js` (`platform !== 'darwin'`)
  - `desktop/perms.js`, `desktop/perm-core.js`
  - `src/host/gateway.ts`, `src/host/usage.ts`, `src/host/session.ts`
- **관찰**
  - 분기 자체는 불가피하다. 하지만 macOS 전용 기능을 `process.platform !== 'darwin'` 로 “아무것도 안 함” 처리하는 곳이 많을수록, **Windows에서 의도치 않게 우회/무시되는 동작**이 생기기 쉽다. 대표적으로 알림, 전체 디스크 접근, iCloud 다운로드, 메뉴바/ Dock 관련 코드 등.
- **작고 실행 가능한 수정 제안**
  - “Windows에서는 왜 아무것도 안 하는가” 를 각 분기 근처에 짧게 주석으로 남기고, Windows UI에서 그 상태를 설명하는 문구를 맞춘다.
  - 특히 **알림/권한/업데이트**처럼 사용자 기대치가 높은 기능은 Windows 분기를 “생략” 으로 끝내지 말고, Windows에서 실제 제공하는 대안(설정 앱 URL, 시스템 트레이 알림 등) 여부를 검토한 결과를 남긴다.

#### P1-3. Windows 클립보드는 “파일 드롭 명령 실행 결과 + 되읽기” 로 판정하는데, 실패 시 사용자 피드백이 충분히 구체적일지 검증 필요

- **경로/위치**
  - `desktop/clip-core.js` (`windowsFileDropCommand`)
  - `desktop/main.js` (`fb:local-copy-files`, `fb:copy-diag`)
  - `test/unit/clipCore.test.ts`
- **관찰**
  - macOS 쪽은 되읽기+osascript 폴백이 세밀하게 구성돼 있다. Windows 쪽은 `powershell.exe` 로 `SetFileDropList` 를 시도하고 실패 시 경로 텍스트만 복사하는 구조다. 방향 자체는 타당하다. 다만 Windows에서 실패했을 때 “왜 실패했는지” 가 사용자에게 충분히 전달되는지, 그리고powershell 실행이 정책/안티바이러스/권한 때문에 막히는 케이스를 얼마나 다루는지가 관건이다.
- **작고 실행 가능한 수정 제안**
  - Windows 복사 실패를 단순한 “파일 복사 실패” 로 뭉개지 말고, powershell 반환 코드를 구분할 수 있으면 구분한다.
  - `fb:copy-diag` 가 Windows에서도 의미 있게 동작하도록, Windows 전용 진단 단계를 추가 검토한다(현재 진단은 darwin/win32를 조건부로 포함하고 있음).

#### P1-4. Windows 경로·볼트 해석 테스트는 있지만, “Windows 호스트 실제 런타임” 을 모의하는 통합/스모크 커버리지가 약하다

- **경로/위치**
  - `test/unit/hostWindowsPaths.test.ts`
  - `test/unit/platformOps.test.ts`
  - `test/unit/windowsUi.test.ts`
  - `test/unit/winBounds.test.ts`
- **관찰**
  - 단위 레벨의 경로·명령·UI 문구는 잘 잡고 있다. 하지만 Windows에서 실제로 부딪힐 모드(로컬 호스트 시작, 토큰 저장/복원, 파일 열기, 복사, 업데이트 UI)는 아직 “컴포넌트별” 검증에 가깝다. Windows 11 런타임이 없으니 지금 당장 완전히 메울 수는 없지만, 적어도 **Windows에서 깨질 가능성이 큰 흐름의 연결부**는 테스트 가능성이 남아 있다.
- **작고 실행 가능한 수정 제안**
  - `src/host/paths.ts` 의 Windows data dir 경로, `src/core/rootPath.ts` 의 Windows 입력 정규화, `src/host/files.ts` 의 `portableRelative`/`withinPath` Windows 케이스는 이미 잘 잡혀 있으니 유지한다.
  - 추가 1순위는 “Windows 로컬 호스트가 못 뜨는 경우”의 실패 메시지/상태 전이를 UI가 제대로 반영하는지 확인하는 통로 테스트다.

#### P1-5. 문서/설치 안내에서 Windows 기대와 실제 구현의 불일치가 남을 여지가 있다

- **경로/위치**
  - `docs/WINDOWS.md` (신규)
  - `docs/INSTALL.md`
  - `README.md`
  - `desktop/connect.html`
- **관찰**
  - 첫 연결 화면, 시스템 트레이 안내, Windows 업데이트 안내 등을 넣은 것은 좋다. 다만 “Windows 로컬 호스트”가 어떤 조건에서 동작하는지, 트레이/시작 항목/알림이 Windows에서 실제로 어떻게 동작하는지가 문서와 구현에서 같은 약속으로 맞물려 있는지 확인이 필요하다.
- **작고 실행 가능한 수정 제안**
  - `docs/WINDOWS.md` 에 “Windows에서 지원/미지원” 을 항목별로 분명히 적고, 특히 업데이트·알림·로그인 항목·파일 열기·복사에서 Windows가 macOS와 다른 지점을 명시한다.
  - 설치/첫 실행 안내가 “Windows에서는 이렇게 된다”를 과장하지 않도록 문구를 맞춘다.

---

### P2 — 지금 당장 출시를 막지는 않지만, 나중에 꼬일 수 있는 것

#### P2-1. Windows 단축키/문구 변환(`toPlatformShortcut`)은 UI층에선 잘 되어 있으나, 데스크톱 메뉴/키 처리가 실제로 Windows에서 기대한 키로 수신되는지 교차 확인 필요

- **경로/위치**
  - `src/client/App.tsx` (`toPlatformShortcut`, `MAC_KEYS`, `WIN_KEYS`, `getKeys`)
  - `src/client/Settings.tsx`
  - `desktop/preload.js`, `desktop/main.js` (`fb:cmd`)
- **관찰**
  - 클라이언트 측 단축키 표는 Windows용으로 잘 분리되어 있다. 다만 데스크톱 메뉴가 보내는 `fb:cmd` 와 화면의 키 핸들러가 **실제 Windows 실행 환경에서 동일한 키로 동작하는지**는 런타임 확인이 필요하다.
- **작고 실행 가능한 수정 제안**
  - Windows QA 시 메뉴 단축키(Ctrl+, · Ctrl+/ · Ctrl+P · Ctrl+K · Ctrl+N 등)가 화면 동작과 1:1로 대응하는지 체크리스트로 남긴다.

#### P2-2. Windows에서 “메뉴바/트레이 패널” 과 “작업 표시줄/트레이” 개념이 macOS와 다르므로, 트레이 UI 문구가 맥 기준으로 남아 있지 않은지 점검 필요

- **경로/위치**
  - `desktop/main.js` (트레이 생성, `trayPanel`, `trayMenu`, `positionTrayPanel`)
  - `src/client/tray.tsx`
  - `docs/WINDOWS.md`
- **관찰**
  - macOS 메뉴바 팝오버를 Windows에서도 같은 UX로 이식하려는 그림이 보이면, Windows에서는 “트레이 아이콘 + 작업 표시줄/팝업” 기대치와 충돌할 수 있다. 이 배치는 아직 그 부분이 macOS 기준으로 기울 수 있다.
- **작고 실행 가능한 수정 제안**
  - Windows에서 트레이 팝오버/메뉴/위치가 실제로 어떤 UX로 노출되는지 명시하고, 맥 용어(메뉴바/ Dock) 가 Windows 문구로 남아 있지 않은지 확인한다.

#### P2-3. `electron-builder.yml` 이 macOS와 Windows에서 서로 다른 번들/리소스 기대를 갖는지, 신규 파일 쪽이 “Windows 패키징 전용 세부 설정” 을 충분히 담고 있는지 확인 필요

- **경로/위치**
  - `desktop/electron-builder.yml`
  - `desktop/package.json` (`dist:win`)
- **관찰**
  - Windows 전용 빌드가 추가됐고 패키지 검증도 강화됐다. 다만 Windows에서만 필요한 설정(명시적 타겟, 아이콘, 설치 UI, 파일 매핑)을 macOS 설정과 섞어 쓰면 나중에 변경이 어려워진다.
- **작고 실행 가능한 수정 제안**
  - macOS/Windows 빌드가 서로 다른 조항을 가질 수밖에 없다면, YAML 구조를 플랫폼별로 읽기 쉽게 정리한다.

#### P2-4. 레지스트리/상태 파일, 통신 프로토콜, 세션/인증 상태 표현은 플랫폼 중립으로 잘 유지 중이나, Windows 실행 환경이 “예약 실행/로그인 항목/상시 실행” 을 macOS와 다르게 다룰 가능성을 검토해야 한다

- **경로/위치**
  - `src/host/registry.ts`, `src/host/session.ts`, `src/host/gateway.ts`
  - `desktop/updater.js`, `desktop/main.js` (login item/재시작 관련)
- **관찰**
  - 핵심 상태/프로토콜은 플랫폼 독립적이라 좋다. 하지만 Windows에서 “앱이 로그인 항목으로 조용히 뜨고, 업데이트 후 재시작하고, 상시 호스트를 유지하는” 그림은 macOS와 다른 시스템 동작을 탄다. 이 부분은 이번 배치에서 완전히 검증하기 어렵다.
- **작고 실행 가능한 수정 제안**
  - Windows 배포 전, 로그인 항목·시작·정적 서버 포트·백그라운드 유지가 Windows에서 어떤 제약을 받는지 별도 체크한다.

---

## 4. 테스트/관측성/오류처리 관점 종합

- **좋음**: 경로·루트 해석, 클립보드 판정, 권한 상태, 창 자리, 패키징 파일 포함 검증이 단위/스모크 수준에서 남아 있다. 특히 “명령 문자열에 경로를 직접 넣지 않는” 방향은 보안 관점에서 유지돼야 한다.
- **약함**: Windows 런타임이 없으므로 **실기 동작 검증은 비어 있다.** 지금은 “의도+구조+플랫폼 사실” 기반 리뷰만 가능하다. 따라서 Windows 특화된 실패 모드(설치 위치 차이, 권한/안티바이러스, 탐색기 동작, 업데이트 실행, 클립보드 정책)가 실제로 어떻게 나타나는지는 런타임에서 확인해야 한다.
- **관측성**: `desktop/main.js` 의 복사 진단(`fb:copy-diag`), `desktop/updater.js` 로그, 호스트 로그 등은 괜찮다. 다만 Windows에서 실패할 때 사용자에게 전달되는 문구가 “무엇이 막혔는지”를 충분히 구분하는지 검토가 필요하다.

---

## 5. 결론

- 이 배치는 **구조적으로 대체로 건전**하고, 플랫폼 분기와 보안-sensitive 경로 처리도 대체로 바람직하다.
- 다만 **Windows 11 런타임 검증이 불가능한 현재 환경에서는 P0 다수를 코드/구조로만 판정**할 수밖에 없다. 그중 가장 위험한 것은:
  1. **Windows 패키징에 호스트 embedding 파일 누락 시 앱 자체 기동 실패 가능성**
  2. **Windows Claude/Codex 바이너리 발견·환경 구성의 불확실성**
  3. **Windows 업데이트/파일 열기/클립보드 실패 피드백의 완성도**
- 런타임 접근 가능해지면, 최소한 다음 순서로 확인하는 것이 좋다:
  - Windows x64 빌드 → 설치 → 로컬 호스트 시작 성공/실패
  - Claude/Codex 바이너리 발견 및 인증 상태
  - 파일 열기·탐색기 선택·클립보드 복사(특히 파일·이미지)
  - 업데이트 UI의 Windows 실제 행위 일치 여부
  - 트레이/알림/시작 항목이 Windows 11에서 기대대로 보이는지

---

## 6. 재테스트 증거 (retest evidence)

- 리뷰 전 실행 결과: `npm run qa` **통과** — 68 test files, **440 passed**, 1 skipped, build, smoke, fit
- 리뷰 범위 내 재확인한 항목:
  - `desktop/electron-builder.yml` 패키징 목록과 `main.js` 로컬 의존 간의 교차 검증이 `test/unit/desktopFiles.test.ts` 에 있는지 확인
  - Windows 경로/명령/창 자리 관련 단위 테스트가 `test/unit/hostWindowsPaths.test.ts`, `test/unit/platformOps.test.ts`, `test/unit/winBounds.test.ts` 에 있는지 확인
  - Windows 권한/단축키/첫 연결 UI 시험이 `test/unit/windowsUi.test.ts` 에 있는지 확인
  - 클립보드 판정이 `desktop/clip-core.js` + `test/unit/clipCore.test.ts` 로 순수 분리되어 있는지 확인
- **재테스트 필요 항목(런타임 의존)**:
  - Windows x64 앱 기동 후 로컬 호스트 성공 여부
  - Windows에서 Claude/Codex 제공자 발견 및 인증 흐름
  - Windows 파일 열기·클립보드·업데이트 UI의 실제 동작
  - 업데이트 제거 전: `electron-builder.yml` `files` 에 `host/**` 포함 여부 + 누락 시 런타임 실패 재현
- **비고**: 상기 재테스트 중 런타임 의존 항목은 이 환경(리눅스)에서 실행하지 못했고, Windows 11 런타임이 없으므로 실기 확인은 보류한다.

## 7. 리뷰 지적 대조와 조치

- **P0-1 기각:** `desktop/electron-builder.yml`의 `files`에 `host/**`가 이미 있으며, Windows CI가 실제 생성한 ASAR에서 `host/host/index.mjs`와 `host/client/index.html`을 확인했다. [Windows 빌드 실행](https://github.com/beausea/folderbot/actions/runs/36267051746)은 설치 파일과 SHA-256 아티팩트까지 성공했다.
- **P0-2 부분 수용:** `providers.ts`는 네이티브 `.exe` 후보, `where.exe`, 명시적 `FOLDERBOT_CLI_BIN`을 이미 사용한다. PATH 실패는 확인된 결함이 아니다. 다만 설치 조건을 찾기 쉽도록 Windows 첫 화면과 CLI 연결 안내에 `claude.exe` 필요성을 명시했다. Windows 실기기에서 네이티브 CLI 발견과 인증은 계속 확인해야 한다.
- **P0-3 기각:** `updater.state().supported`가 Windows에서 `false`이며 트레이와 앱은 적용을 제공하지 않고 수동 설치 문구를 보여 준다. 설치 안내에도 수동 재설치를 적었다.
- **P0-4 보안 문제로는 기각:** 호스트의 `explorer.exe` 호출은 셸 문자열 실행이 아니라 `spawn`의 단일 인수이고, 경로는 `guard`로 볼트 안 파일임을 검사한다. 로컬 데스크톱 위치 보기는 Electron `shell.showItemInFolder`를 사용한다. 특수 문자 경로의 실제 탐색기 동작은 실기기 검증 항목으로 남겼다.
- **P1-1·P1-5, P2-1·P2-2·P2-4 수용:** 첫 화면의 호스트 CLI 요구 사항을 보강하고 `docs/WINDOWS.md`에 설치, 페어링, 세션, 파일, 단축키, 트레이, 자동 시작의 실기기 점검 순서를 추가했다.
- **P1-2·P1-3 기각:** 플랫폼 분기가 실제 대안(Windows 설정 URI, 트레이 알림, Windows 파일 드롭)을 구현한다. `fb:copy-diag`에도 Windows 파일 드롭 진단 단계가 이미 있다.
- **P1-4 유효한 한계:** Windows CI가 타입·단위·번들·NSIS·ASAR까지 통과했지만 Windows 11 GUI에서의 설치·실행과 실제 Claude 턴은 검사하지 못했다. PR은 이 범위를 명시한 초안으로 둔다.
- **P2-3 기각:** 빌드 설정은 이미 `mac`, `win`, `nsis` 구획으로 나뉘며 Windows 전용 아이콘과 설치 형식이 선언돼 있다. 더 큰 설정 분리는 현재 이득이 없다.

안내 변경 이후 전체 `npm run qa` 재실행과 Solar Pro 4 재리뷰를 완료했다. 재리뷰 도중 발견한 스모크 검사 타이밍 문제와 그 후속 검증은 9장에 기록했다.

---

## 8. 최종 재리뷰 (re-review) — model: upstage/solar-pro4

- **기준 시점:** `feat/windows-11-support` 작업 트리 + PRD 전면 반영 이후. 리뷰 지적 대조(7장)와 CI 통과 보고(Windows x64 run 36267051746)를 다시 대조함.
- **다시 확인한 통과 상태:** `npm run qa` — 68 test files, **440 passed**, 1 skipped, build, smoke, fit. Windows 워크플로는 typecheck, Windows 단위 테스트, 번들 소스 빌드, NSIS 패키징, ASAR 필수 파일/호스트 포함 검사, 설치 파일 크기·SHA-256 아티팩트 업로드까지 끝남.
- **결론부터:** 이번 배치에서 **새로 확인된 P0/P1 미해결은 없다.** 이전 P0-1~P0-4와 P1-1~P1-4, P2-1·P2-2·P2-4는 코드·워크플로우·문서에서 전부 수용·기각·유효 한계로 정리됐고, 재점검한 현재 코드에서도 그대로 유지된다.

### 최종 게이트 결과

- **게이트 결과: 통과(조건부).** 로컬 `npm run qa` 초록, Windows CI 초록, 리뷰 지적 대조 완료. 단, 출시/배포 결정의 최종 안전 조건은 **Windows 11 실기기에서의 설치·첫 화면·로컬 호스트 시작·네이티브 `claude.exe` 발견·세션·파일 열기·클립보드·업데이트 안내** 확인이다. 이 환경은 리눅스라서 그 런타임을 실행할 수 없고, 지금까지의 코드 리뷰만으로는 그 계층을 닫을 수 없다.

### 남아 있는 실행 가능 항목 (P0–P2)

- **P0 (실기기 확인 전까진 닫힌 것으로 취급하지 말 것)**
  - **P0-A · Windows 11 GUI 런타임 미검증.** 패키징·ASAR·워크플로는 초록이지만, Windows 11에서 앱을 설치·실행해 트레이/창/메뉴/알림/로그인 항목/파일 열기/클립보드/업데이트 안내가 기대대로 보이는지는 여전히 비어 있다. `docs/WINDOWS.md` 의 실기기 검증 순서(첫 연결 화면 → 페어링 → 로컬 호스트 시작 → `claude.exe` 없음/포트 충돌 오류 → 알림·트레이·자동 시작 → 파일·이미지 클립보드 복사·진단 → 단축키 → 수동 업데이트 안내)를 Windows 11 실기기에서 끝까지 밟아야 최종 닫힌다.
  - **P0-B · Windows 네이티브 `claude.exe` 발견·인증.** `providers.ts` 와 설치 안내(`docs/INSTALL.md`, `docs/WINDOWS.md`, 첫 화면)는 네이티브 `.exe`, `where.exe`, `FOLDERBOT_CLI_BIN`, `.cmd`/`.bat` 미지원, Codex 미검증까지 이미 맞춰져 있다. 하지만 Windows에서 실제 설치 위치·PATH·로그인·권한 정책이 동작과 어떻게 만나는지는 코드만으로 결론 낼 수 없다. 실기기에서 네이티브 CLI 발견과 로그인이 의도한 대로 되는지만 확인하면 된다.

- **P1 (현재 코드에서 수용 완료 — 재조치 불필요, 단 근거만 남김)**
  - **P1-A · Windows 호스트 UX 경계.** Windows에서도 호스트는 앱 안에서 Node 호스트를 띄우는 그림이고, 그 경계는 `desktop/main.js`(`HOST_BUNDLE`/`HOST_CLIENT`, `startHostMode`)와 첫 화면·설치 안내에 이미 적혀 있다. «앱은 켰는데 Claude가 안 붙는» 상태를 해석하기 위한 초기 진단 문구는 현재 `session.ts`(인증 오류/모델 거절 재시도)와 설정 › 연결 진단으로 남아 있다. 추가 코드 변경은 지금 필요하지 않다.
  - **P1-B · `process.platform` 분기 분산.** 분기는 여전히 여러 곳에 있지만, Windows에서 «아무것도 안 함» 으로 빠지는 주요 기능(Full Disk Access, 알림 설정 URL, iCloud 다운로드, macOS 클립보드 파일 복사)은 각각 Windows 대안(`ms-settings:notifications`, 트레이 알림, Windows 탐색기/파일 드롭) 또는 명시적 제외로 처리돼 있다. 이번 재리뷰에서 그 분기가 Windows에서 잘못 동작하는 새 사례는 찾지 못했다.
  - **P1-C · Windows 클립보드 실패 피드백.** `clip-core.js`는 경로를 명령 문자열에 넣지 않고 환경변수(Base64 JSON)로 넘기며, `main.js`는 반환 시 경로 텍스트 폴백과 `fb:copy-diag` Windows 단계를 함께 제공한다. 실패 문구가 «무엇이 막혔는지»를 더 세밀하게 구분하려면 PowerShell 종료 코드를 더 뜯어볼 여지가 있지만, 현재 구조는 보안·관측성선에서 이미 수용 가능하다.
  - **P1-D · Windows 런타임 통합/스모크 약함.** 단위 테스트(`hostWindowsPaths`, `platformOps`, `windowsUi`, `winBounds`, `clipCore`, `desktopFiles`)는 현재 코드로 잘 잡혀 있다. 부족한 것은 Windows GUI 런타임을 띄우는 검사뿐이며, 이는 P0-A와 같은 실기기 확인 항목으로 흡수된다.

- **P2 (지금 출시를 막지는 않음)**
  - **P2-A · Windows 단축키 교차 확인.** `App.tsx`의 `toPlatformShortcut`/`WIN_KEYS`와 데스크톱 메뉴 가속기(`CmdOrCtrl+…`)는 분리되어 있다. Windows QA 시 Ctrl+, · Ctrl+/ · Ctrl+P · Ctrl+K · Ctrl+N 등이 화면 동작과 1:1로 맞는지 체크리스트로만 확인하면 된다.
  - **P2-B · 트레이/패널 용어.** Windows에서 트레이 팝오버·메뉴·위치가 macOS 용어(메뉴바/Dock) 없이 보이는지는 실기기 확인 항목이다. 현재 코드에는 Windows 전용 아이콘(`icon.png` 32px), `isWin` 기반 문구, `ms-settings`/`시스템 트레이` 안내가 들어가 있다.
  - **P2-C · Windows 로그인 항목·백그라운드 유지.** `app.setLoginItemSettings`, `FOLDERBOT_DATA`(`userData/host`), 포트·세션 복원은 플랫폼 중립으로 유지된다. Windows에서 로그인 항목·자동 시작·상주 호스트가 macOS와 다르게 동작할 가능성은 여전히 실기기 확인 사항이며, 이번 리뷰에서 새 결함으로는 이어지지 않았다.

### 최종 정리

- **재리뷰 결론:** 코드·워크플로우·문서·테스트는 이번 배치에서 설명된 Windows 11 지원 범위(실험적 로컬 호스트, 수동 업데이트, 미서명 NSIS, CLI 네이티브 `.exe` 요구, Windows 설정/클립보드/탐색기 사용)에 맞게 정리돼 있다. 이전 리뷰의 P0 다수는 실제 코드에서 기각·수용됐고, **남아 있는 실질 항목은 Windows 11 실기기 확인(P0-A/B) 하나**로 수렴한다.
- **최종 게이트:** `npm run qa`(68/440/1, build+smoke+fit)와 Windows CI(runs/36267051746)가 모두 초록이고, 리뷰 지적 대조가 끝났으므로 **로컬·CI 게이트는 통과**. 최종 출시 게이트는 Windows 11 실기기 검증 통과 시점까지 **조건부**로 연다.

---

## 9. 현재 배치 최종 리뷰 (현재 Solar Pro 4) — model: upstage/solar-pro4

- **기준:** `feat/windows-11-support` 최종 작업 트리 + 리뷰 이후 적용된 `test/smoke.mjs` 변경 포함. Windows x64 CI run 36268112860 결과 반영.
- **통제 사항:** 이번 Freebuff 재리뷰는 테스트나 코드를 변경하지 않았다. 최종 `npm run qa`는 재리뷰 직전에 별도로 실행해 통과했다.

### 9-1. 최근 리뷰에서 제기된 연기 정리 — smoke.mjs 스크롤 보장/대기

- **재현:** Freebuff의 중복 QA에서 스트리밍 종료 직후 스크롤이 바닥에서 24px 떨어져 실패했다. 독립 스모크 재실행에서는 데스크톱 창에 스크롤할 내용이 부족해 `scrollTop=0`인 채 “위로 올려 보기”가 실패했다.
- **적용:** `test/smoke.mjs`의 O 검사에서 스크롤 여유가 440px보다 작으면 검사 전제에 필요한 여백을 확보한다. 스트리밍 종료 후에는 최대 2초 동안 바닥 스크롤이 안정될 때까지 기다린 다음 판정한다.
- **검증:** 수정 후 전체 `npm run qa`가 68개 파일·440개 통과·1개 건너뜀, `SMOKE OK`, 화면 적합성 검사 통과로 끝났다. Freebuff는 수정된 검사와 연관 코드를 다시 읽고 새로 고칠 문제를 찾지 못했다.

### 9-2. 새로 확인된 실행 가능 항목 (P0–P2)

- **없음** (이 현재 배치 리뷰에서 새로 나온 P0/P1/P2는 없음). 이전 리뷰의 Windows 11 미해결 항목(P0-A/B 실기기 검증, 그 외 수용·기각·유효 한계 처리)은 그대로 유지되며, 이번 smoke 변경은 Windows 11 전용 결함이 아니라 공통 데스크톱 smoke의 플리키 재발 방지로 본다.

### 9-3. 남아 있는 검증 한계

- **Windows 11 GUI 런타임 검증은 여전히 비어 있다.** 패키징·ASAR·워크플로·단위·스모크(리눅스 헤드리스)까지 초록이지만, Windows 11에서 실제 설치·실행·트레이·창·메뉴·알림·로그인 항목·파일 열기·클립보드·업데이트 안내·네이티브 `claude.exe` 발견/세션은 이 환경에서 확인할 수 없다. 이를 코드 결함으로 바꾸지 않는다.
- **스모크 안정화는 리눅스 헤드리스 환경에서 검증했다.** Windows 11과 macOS GUI의 실제 동작은 각각 실기기 확인이 필요하다.

### 9-4. 최종 요약

- **새로 나온 실행 가능 결함 없음.** 이전 리뷰 지적은 교정·수용·유효 한계로 정리했고, 최근 스모크 변경은 O 데스크톱 검사의 타이밍·전제 실패를 해결했다.
- **최종 게이트:** 로컬 `npm run qa`(68/440/1, build+smoke+fit)와 Windows CI(36268112860)가 초록인 한 로컬·CI 게이트는 통과로 본다. **출시/최종 배포 게이트는 Windows 11 실기기 검증 통과 시점까지 조건부**로 유지한다.
