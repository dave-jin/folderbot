# Windows 11 x64 빌드 결정 (2026-09-27)

- **범위:** Windows 배포물에 호스트와 클라이언트를 모두 묶는다. 검증된 호스트는 기존 Apple Silicon Mac이고, Windows 네이티브 호스트는 실험 단계다. Windows CI는 호스트/클라이언트를 빌드해 `desktop/host`로 복사하고, 패키지 안에 두 파일 트리가 있는지 검사한다.
- **형식:** electron-builder 26의 NSIS x64 설치 파일을 만든다. 기존 `build/icon.png`(1024px)를 Windows 아이콘 소스로 사용한다. 인증서가 없어 설치 파일은 미서명이다.
- **배포:** PR, `main`·`feat/windows-*` 푸시, 수동 실행에서 Windows CI가 테스트하고 설치 파일과 SHA-256을 14일 보관 아티팩트로 올린다. Windows 워크플로에는 릴리스 발행 단계가 없다. macOS `desktop-v*` 릴리스 워크플로는 그대로 둔다.
- **검증:** Windows 러너에서 타입 검사, Windows 경로 관련 단위 검사와 운영체제에 의존하지 않는 데스크톱 단위 검사, 번들 소스 빌드, NSIS 패키징, ASAR 필수 파일/호스트 포함 검사, 설치 파일 크기/체크섬 검사를 한다. Linux ARM64에서 Windows x64 압축 해제형 패키지와 ASAR 내용은 확인했으나, NSIS 실행 파일 생성은 해당 Linux의 `makensis` 바이너리가 ARM64에서 실행되지 않아 Windows CI에서 검증해야 한다. CI 검사는 Windows 11 GUI에서의 실제 실행 검사를 대신하지 않는다.
- **에이전트 CLI:** Windows 호스트는 [Claude Code 공식 네이티브 설치](https://code.claude.com/docs/en/setup#set-up-on-windows)의 `claude.exe`를 사용한다. 호스트가 셸 없이 프로세스를 실행하므로 Claude와 Codex 모두 npm의 `.cmd`/`.bat` 래퍼는 지원하지 않는다. Codex를 쓰려면 네이티브 `.exe` 경로가 필요하며 Windows Codex 실행은 아직 검증하지 않았다. WSL의 Claude는 Windows 앱과 별도 환경이다.
- **남은 한계:** Windows 자동 업데이트, 코드 서명과 실제 Windows 11 설치·호스트 세션·페어링·알림·트레이·로컬 파일 열기 수동 검증은 아직 지원/검증 범위 밖이다. 새 버전은 설치 파일을 다시 받는다. `.sha256`은 전송 중 파일 무결성 확인용이며 게시자 신원을 증명하지 않는다.

설치 절차는 [INSTALL.md](INSTALL.md)에 있다. 빌드 설정은 [electron-builder 26의 Windows 대상](https://www.electron.build/v26/docs/win/)과 [아이콘 입력 형식](https://www.electron.build/v26/docs/features/icons-and-images/)을 따른다.

## Windows 11 실기기 검증 순서

1. CI 아티팩트의 SHA-256을 대조한 뒤 설치하고 앱이 처음 연결 화면까지 뜨는지 확인한다.
2. 원격 클라이언트로 Mac 호스트에 연결해 6자리 페어링, 대화, 문서 열기와 파일 탐색기 위치 보기를 확인한다.
3. 네이티브 `claude.exe`를 설치·로그인한 PC에서 로컬 호스트를 시작하고 폴더별 봇의 첫 턴과 재시작 후 세션 복원을 확인한다. CLI가 없거나 포트가 이미 쓰이는 경우의 오류도 확인한다.
4. Windows 알림 클릭이 해당 세션을 열고, 트레이 팝오버와 로그인 시 자동 실행이 재부팅 후 동작하는지 확인한다.
5. 파일과 이미지를 클립보드에 복사해 파일 탐색기에 붙여 넣고, Windows 진단 결과를 확인한다. Ctrl+, / P / K / N 단축키와 수동 업데이트 안내도 확인한다.
