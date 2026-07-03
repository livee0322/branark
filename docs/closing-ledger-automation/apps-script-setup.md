# 브랜아크 일일마감 자동화 - Google Apps Script 방식 설정

## 변경 목적

개인 Google Drive 환경에서는 서비스 계정이 파일을 생성할 때 `Service Accounts do not have storage quota` 오류가 발생할 수 있다.
공유 드라이브를 사용할 수 없는 경우에는 Google Apps Script Web App을 대표 Google 계정 권한으로 실행하여 개인 Drive 폴더에 파일을 생성한다.

## 전체 구조

```text
GitHub Actions
  -> Google Apps Script Web App 호출
    -> Google Drive 발주서 폴더에 테스트 파일 생성
    -> 일일 마감 Google Sheet에 테스트 행 추가
```

## 1. Apps Script 프로젝트 만들기

1. Google Drive에서 새 Google Apps Script 프로젝트를 만든다.
2. `google-apps-script/closing-ledger-webapp.gs` 파일 내용을 Apps Script 편집기에 붙여넣는다.
3. 프로젝트 이름 예시: `BRANARK Closing Ledger WebApp`.

## 2. Apps Script 속성 설정

Apps Script 편집기에서:

`프로젝트 설정` -> `스크립트 속성` -> `스크립트 속성 추가`

아래 값을 입력한다.

```text
API_TOKEN=임의의 긴 비밀번호 문자열
DRIVE_FOLDER_ID=1BKiey_Z7U8IF4M6tYGsLczeGXO6QyBDj
DAILY_SHEET_ID=18YVXMvVAPBhSvuKQ9emEYQGy3wI0iHTS3B0lJvANAZA
PRICE_SHEET_ID=1mP5w2vpYLZamGuWnG800UKIO37lBKC1Q
```

현재 Drive 구조 기준:

```text
TEST_DRIVE / 7월 / 발주서 = 1BKiey_Z7U8IF4M6tYGsLczeGXO6QyBDj
TEST_DRIVE / 7월 / 일일 마감 양식 = 18YVXMvVAPBhSvuKQ9emEYQGy3wI0iHTS3B0lJvANAZA
TEST_DRIVE / 7월 / 공급단가.XLS = 1mP5w2vpYLZamGuWnG800UKIO37lBKC1Q
```

## 3. Apps Script 배포

1. Apps Script 우측 상단 `배포` 클릭
2. `새 배포` 클릭
3. 유형 선택: `웹 앱`
4. 실행 사용자: `나`
5. 액세스 권한: `모든 사용자`
6. 배포 후 표시되는 Web App URL 복사

주의: Web App URL은 `/exec`로 끝나는 배포 URL을 사용한다.

## 4. GitHub Actions secrets 설정

GitHub 저장소에서:

`Settings` -> `Secrets and variables` -> `Actions` -> `Repository secrets`

아래 secret을 추가한다.

```text
APPS_SCRIPT_WEB_APP_URL=Apps Script Web App /exec URL
APPS_SCRIPT_API_TOKEN=Apps Script 속성에 입력한 API_TOKEN과 같은 값
```

기존 서비스 계정 직접 업로드 방식에서 쓰던 `GOOGLE_SERVICE_ACCOUNT_JSON`은 이 workflow에서는 사용하지 않는다.

## 5. 테스트 실행

GitHub Actions에서:

`Actions` -> `Branark Closing Ledger Process Test` -> `Run workflow`

기본값으로 실행하면 아래 작업을 수행한다.

1. Apps Script Web App 호출
2. `발주서` 폴더에 `branark-closing-ledger-test.txt` 생성
3. `일일 마감 양식` 첫 번째 시트에 테스트 행 추가

## 6. 중복 파일명 오류 처리

기본 파일명으로 이미 테스트 파일이 있으면 `DUPLICATE_FILE_NAME` 오류가 날 수 있다.

해결 방법:

- `test_file_name`을 다른 이름으로 변경
- 또는 `allow_duplicate_file`을 `true`로 변경

## 7. 운영 전 주의사항

- `APPS_SCRIPT_API_TOKEN`은 외부에 노출하지 않는다.
- Apps Script 배포 권한이 `모든 사용자`이므로 API_TOKEN 검증이 필수다.
- 테스트 완료 후 `링크가 있는 모든 사용자: 편집자` 권한은 제거하는 것이 좋다.
- 실제 발주서 엑셀 파싱은 추후 Apps Script 또는 별도 백엔드에서 추가 구현한다.
