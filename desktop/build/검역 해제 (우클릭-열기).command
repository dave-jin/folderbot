#!/bin/bash
# Folder Bot — 처음 설치 뒤 한 번. "손상됨 · 확인되지 않은 개발자" 를 없앤다 (ad-hoc 서명이라 검역 딱지만 떼면 된다)
APP="/Applications/Folder Bot.app"
if [ ! -d "$APP" ]; then echo "먼저 왼쪽의 Folder Bot 을 Applications 로 끌어 놓으세요."; read -n 1 -s -r -p "아무 키나 누르면 닫힘"; exit 1; fi
/usr/bin/xattr -dr com.apple.quarantine "$APP" && echo "검역 딱지를 뗐어요 → Folder Bot 을 엽니다" && /usr/bin/open -a "$APP"
read -n 1 -s -r -p "아무 키나 누르면 닫힘"
