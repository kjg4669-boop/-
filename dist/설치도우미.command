#!/bin/bash
# Worship Projector — macOS 격리 해제 도우미
# 이 파일을 더블클릭하면 앱의 macOS 보안 경고가 제거됩니다.

APP="/Applications/worship-projector.app"

echo "=============================="
echo "  Worship Projector 설치 도우미"
echo "=============================="
echo ""

if [ ! -d "$APP" ]; then
  echo "[오류] $APP 을 찾을 수 없습니다."
  echo "먼저 DMG를 열고 앱을 응용 프로그램 폴더에 복사한 후 다시 실행하세요."
  echo ""
  read -p "엔터를 눌러 닫기..."
  exit 1
fi

echo "앱 격리 속성을 제거하는 중..."
xattr -dr com.apple.quarantine "$APP"

if [ $? -eq 0 ]; then
  echo ""
  echo "[완료] 설치가 완료되었습니다."
  echo "이제 Worship Projector를 정상적으로 실행할 수 있습니다."
  echo ""
  open "$APP"
else
  echo ""
  echo "[오류] 격리 해제에 실패했습니다. 관리자 권한이 필요할 수 있습니다."
  echo "터미널에서 다음 명령어를 실행하세요:"
  echo "  sudo xattr -dr com.apple.quarantine \"$APP\""
fi

echo ""
read -p "엔터를 눌러 닫기..."
