# 브랜아크 일일마감 자동화 구현 지시서

## 1. 사용자 요청 원문

index.html에서는 파일 첨부가 가능해야 한다.

올린 파일은 Google Drive에 저장되고, 단가표와 발주서를 확인해서 일일마감양식에 맞춰 작성되어야 한다.

HTML에서는 파일을 올리면 검사하고, 중복 파일인지 확인하고, 단가표와 작업 결과를 표기해야 한다.

API env는 단가표, Google Drive, Google Sheet 연결 상태를 확인해야 한다.

## 2. 최종 목표

파일 첨부부터 일일마감양식 작성까지 한 화면에서 처리한다.

처리 흐름은 아래 기준이다.

1. index.html에서 발주서 파일 첨부
2. 파일 형식 검사
3. 중복 파일명 검사
4. Google Drive 발주서 폴더 저장
5. 발주서 시트 분석
6. 단가표 조회
7. 일일마감양식 컬럼에 맞춰 데이터 생성
8. Google Sheet 일일마감양식에 반영
9. HTML 화면에 처리 결과, 단가표, 오류 내역 표시

## 3. 현재 상태 판정

현재 index.html은 파일 선택 UI와 검증 결과 표시 영역이 있는 정적 HTML 프로토타입이다.

아직 실제 Google Drive 저장, 발주서 파싱, 단가표 조회, Google Sheet 반영 API는 구현되어 있지 않다.

따라서 다음 단계에서는 정적 화면 수정이 아니라 업로드 API와 Google Drive / Sheet 연동 구현이 필요하다.

## 4. 보안 원칙

브라우저의 index.html 안에 인증 정보나 비밀값을 넣으면 안 된다.

실제 Google Drive / Google Sheet 접근은 서버, GitHub Actions, 또는 별도 백엔드 실행 환경에서 처리해야 한다.

프론트엔드는 파일을 API로 전송하고, API가 안전한 실행 환경에서 Google 연동을 처리한다.

## 5. GitHub Actions 환경 기준

현재 Repository secrets 기준으로 아래 값을 사용한다.

| 이름 | 용도 |
| --- | --- |
| GOOGLE_SERVICE_ACCOUNT_JSON | Google 연동 인증 정보 |
| DRIVE_FOLDER_ID | 발주서 파일을 저장할 Google Drive 폴더 ID |
| DAILY_SHEET_ID | 일일마감양식 Google Spreadsheet ID |
| PRICE_SHEET_ID | 단가표 파일 또는 단가표 Spreadsheet ID |

호환 이름도 함께 허용한다.

| 대표 이름 | 호환 이름 |
| --- | --- |
| DAILY_SHEET_ID | DAILY_SPREADSHEET_ID, BRANARK_CLOSING_LEDGER_SPREADSHEET_ID |
| PRICE_SHEET_ID | PRICE_FILE_ID, BRANARK_PRICE_FILE_ID |
| DRIVE_FOLDER_ID | BRANARK_ORDER_UPLOAD_FOLDER_ID |

환경 연결 점검 workflow 위치:

```text
.github/workflows/closing-ledger-env-check.yml
```

이 workflow는 수동 실행 시 아래를 확인한다.

1. 필수 env 값 존재 여부
2. Google 인증 정보 사용 가능 여부
3. Google Drive 발주서 폴더 접근 가능 여부
4. 단가표 파일 접근 가능 여부
5. 일일마감양식 Google Sheet 접근 가능 여부
6. 일일마감양식의 시트 탭 목록 출력

## 6. index.html 구현 요구사항

### 파일 첨부

- xlsx, xls, csv 파일 첨부 가능
- 파일 선택 시 파일명 표시
- 지원하지 않는 확장자는 즉시 차단

### 업로드 실행

- 업로드 버튼 클릭 시 API로 파일 전송
- API 응답 전까지 처리 중 상태 표시
- API 실패 시 화면에 오류 문구 표시

### 중복 파일 검사

- Google Drive 저장 전 같은 폴더에 동일 파일명 존재 여부 확인
- 중복이면 Drive 저장 및 일일마감 반영 중단
- 화면 문구: 중복된 파일명입니다.

### 발주서 분석

발주서 파일에서 아래 시트를 확인한다.

- 운송장
- 출고일지
- 출고일지(2)

분석 기준:

- 운송장 시트의 상품명1 기준으로 품목 집계
- 상품명 뒤 _숫자는 실제 수량으로 계산
- _숫자가 없으면 기본 수량 1
- 출고일지와 출고일지(2)가 함께 있으면 합산
- 출고일 기준으로 일일마감 처리

### 단가표 확인

- 단가표 파일을 읽어 상품명과 공급단가 매칭
- 단가표에 없는 상품은 자동 반영하지 않음
- 단가표 매칭 결과를 HTML 화면에 표기

### 일일마감양식 작성

일일마감양식에는 아래 컬럼 기준으로 추가한다.

| 컬럼 | 설명 |
| --- | --- |
| 주문일 | 주문일 또는 출고 기준일 |
| 상품명 | 정규화된 상품명 |
| 수량 | 옵션 수량 반영 후 실제 수량 |
| 공급단가 | 단가표 기준 공급단가 |
| 공급가 합계 | 수량 곱하기 공급단가 |
| 비고 | 검증 결과 또는 예외사항 |

### 화면 표시

HTML 화면에는 최소 아래 정보를 표시한다.

- 업로드 파일명
- Google Drive 저장 결과
- 중복 파일 여부
- 발주서 시트 검사 결과
- 단가표 매칭 결과
- 일일마감 추가 예정 내용
- 실제 반영 완료 여부
- 오류 메시지

## 7. 구현 우선순위

1. GitHub Actions env 연결 점검 workflow 실행
2. 업로드 API 방식 결정
3. index.html에서 API 호출 구조 반영
4. Drive 중복 파일명 검사 구현
5. Drive 저장 구현
6. 발주서 xlsx 파싱 구현
7. 단가표 조회 구현
8. 일일마감양식 append 구현
9. HTML 결과 화면에 실제 API 응답 표기

## 8. 완료 기준

- index.html에서 파일 선택이 가능하다.
- 업로드 버튼 클릭 시 실제 API 호출이 발생한다.
- 파일이 지정된 Google Drive 폴더에 저장된다.
- 중복 파일이면 저장과 반영이 중단된다.
- 발주서와 단가표가 자동 검증된다.
- 일일마감양식에 행이 추가된다.
- HTML 화면에서 단가표와 작업 결과를 확인할 수 있다.
- GitHub Actions env 점검 workflow에서 Drive / Sheet 접근 성공 로그가 출력된다.
