# 브랜아크 발주서 실파일 파서 구현 메모

## 반영 내용

- `action=health`는 JSONP callback 응답을 유지합니다.
- CSV 파싱 결과에도 `temporaryFileIds: []`를 포함합니다.
- `xlsx` / `xls` 파일은 임시 Google Sheet로 변환 후 읽습니다.
- 운송장이 있으면 운송장을 기준 시트로 사용합니다.
- 출고일지 / 출고일지(2)는 검증용 비교 시트로 분리합니다.
- 공급단가표는 Google Sheet 기준으로 읽고, 상품명 / 규격 / 공급단가 / 부가세 컬럼 후보를 탐색합니다.
- 상품명 매칭은 공백 제거, 괄호 제거, 상품명 + 규격 조합 우선순위로 처리합니다.
- 프론트는 운영자용 화면과 개발자용 상세 로그를 분리합니다.

## Apps Script 재배포 체크

아래 설정이 바뀌었으면 Apps Script Web App을 다시 배포해야 합니다.

- Script Properties 변경
- `google-apps-script/closing-ledger-webapp.gs` 수정
- `ALLOW_PAGE_UPLOAD` / `ALLOWED_PAGE_ORIGIN` 정책 변경

## GitHub Actions 체크

`closing-ledger-process-test.yml`은 아래 순서로 검증합니다.

1. `action=health` 호출
2. health 응답의 `price.id` 와 `EXPECTED_PRICE_SHEET_ID` 비교
3. `sample_csv` 또는 `manual_payload` 모드 process test 실행

## 권장 확인 시나리오

1. `sample_csv` 모드에서 정상 응답이 오는지 확인
2. 운송장만 있는 파일 업로드
3. 운송장 + 출고일지 파일 업로드
4. 운송장과 출고일지 수량이 다른 파일 업로드
5. 단가표 미매칭 상품 포함 파일 업로드
6. 페이지 업로드 미허용 상태에서 health check가 업로드 버튼을 비활성화하는지 확인
