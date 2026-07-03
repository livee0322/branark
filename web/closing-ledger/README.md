# 브랜아크 일일마감 자동화 HTML

## 위치

`web/closing-ledger/index.html`

## 목적

발주서 파일 업로드에서 Google Drive 저장, 발주서와 단가표 검증, 일일 마감 양식 반영까지의 흐름을 화면에서 처리하기 위한 HTML입니다.

## 현재 구현 범위

- 파일 선택 UI
- 지원 파일 형식 안내
- 처리 상태 표시
- 검증 결과 카드
- Drive 저장 위치 / 작업 시트 / 연결 기준 정보 표시
- 일일 마감 추가 예정 내용 표
- 단가표 검증 표
- 오류 메시지 규칙

## 현재 기준 Drive / Sheet

| 항목 | 기준 |
| --- | --- |
| 발주서 저장 폴더 | `Google Drive / 7월 / 발주서` |
| 일일 마감 작업 시트 | `일일 마감 양식` |
| 단가표 파일 | `공급단가.XLS` |
| 발주서 분석 시트 | `운송장`, `출고일지`, `출고일지(2)` |

## 연결 설정 기준

실제 Google Drive / Google Sheet 작업은 GitHub Repository 설정값을 사용합니다.

| 이름 | 설명 |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google 연동 인증 정보 |
| `DRIVE_FOLDER_ID` | 발주서 저장 Google Drive 폴더 ID |
| `DAILY_SHEET_ID` | 일일 마감 양식 Google Spreadsheet ID |
| `PRICE_SHEET_ID` | 단가표 파일 또는 단가표 Spreadsheet ID |

연결 점검 workflow는 아래 파일입니다.

```text
.github/workflows/closing-ledger-env-check.yml
```

해당 workflow는 수동 실행 전용이며, 아래 연결 상태를 확인합니다.

1. 필수 설정값 존재 여부
2. Google 연동 인증 사용 가능 여부
3. Google Drive 발주서 폴더 접근 가능 여부
4. 단가표 파일 접근 가능 여부
5. 일일 마감 양식 Google Sheet 접근 가능 여부
6. 일일 마감 양식의 시트 탭 목록 출력

## 아직 필요한 실제 구현

현재 HTML은 업로드 API 연결을 전제로 한 화면입니다. 실제 파일 저장과 시트 작성은 후속 API 구현이 필요합니다.

1. 업로드 API 생성
2. index.html에서 업로드 API 호출
3. Google Drive 중복 파일명 검사
4. Google Drive 저장
5. 운송장 / 출고일지 읽기
6. 단가표 매칭
7. 검증 리포트 생성
8. 오류 없을 때 일일 마감 양식에 추가
9. API 응답을 HTML 화면에 표기

## 필수 운영 규칙

일일 마감 양식을 마음대로 변경하지 마세요.
