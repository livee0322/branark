# 브랜아크 일일마감 자동화 HTML 프로토타입

## 위치

`web/closing-ledger/index.html`

## 목적

발주서 파일 업로드에서 일일 마감 양식 반영까지의 흐름을 화면으로 확인하기 위한 정적 HTML 초안입니다.

## 현재 구현 범위

- 파일 선택 UI
- 지원 파일 형식 안내
- 처리 상태 표시
- 검증 결과 카드
- Drive 저장 위치 / 작업 시트 기준 정보 표시
- 일일 마감 추가 예정 내용 표
- 단가표 검증 표
- 오류 메시지 규칙

## 현재 기준 Drive / Sheet

| 항목 | 기준 |
| --- | --- |
| 월별 작업 폴더 | `7월` |
| 발주서 저장 폴더 | `7월 / 발주서` |
| 일일 마감 작업 시트 | `일일 마감 양식` |
| 단가표 파일 | `공급단가.XLS` |
| 발주서 분석 시트 | `운송장`, `출고일지`, `출고일지(2)` |

## GitHub Actions 환경변수 기준

실제 Google Drive / Google Sheets API 작업은 GitHub Actions Secrets / Variables를 사용합니다.

| 구분 | 이름 | 설명 |
| --- | --- | --- |
| Secret | `GOOGLE_SERVICE_ACCOUNT_JSON` | Google API 서비스 계정 JSON |
| Variable | `BRANARK_TARGET_MONTH_FOLDER_ID` | 월별 작업 폴더 ID |
| Variable | `BRANARK_ORDER_UPLOAD_FOLDER_ID` | 발주서 저장 폴더 ID |
| Variable | `BRANARK_CLOSING_LEDGER_SPREADSHEET_ID` | 일일 마감 양식 Spreadsheet ID |
| Variable | `BRANARK_PRICE_FILE_ID` | 공급단가 파일 ID |

환경변수 점검용 workflow는 아래 파일입니다.

```text
.github/workflows/closing-ledger-env-check.yml
```

해당 workflow는 수동 실행(`workflow_dispatch`) 전용이며, API 연결 전 GitHub Actions 설정값이 비어 있는지 먼저 확인합니다.

## 후속 개발 범위

1. 업로드 API 생성
2. Google Drive 저장 연결
3. 파일명 중복 검사
4. 운송장 / 출고일지 읽기
5. 단가표 매칭
6. 검증 리포트 생성
7. 오류 없을 때 일일 마감 양식에 추가

## 필수 운영 규칙

일일 마감 양식을 마음대로 변경하지 마세요.
