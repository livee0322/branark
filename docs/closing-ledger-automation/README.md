# 브랜아크 일일마감 자동화

브랜아크 발주서 파일을 업로드하면 Google Apps Script가 파일을 Drive에 저장하고, 시트를 읽고, 공급단가표를 검증한 뒤 일일마감 양식 첫 번째 시트에 반영하는 자동화입니다.

## 현재 처리 흐름

1. `index.html` 또는 `web/closing-ledger/index.html`에서 발주서 파일을 업로드합니다.
2. 프론트가 Apps Script `action=health`를 먼저 호출해 업로드 가능 상태를 확인합니다.
3. Apps Script가 업로드 파일을 Drive 폴더에 저장합니다.
4. `csv`, `xlsx`, `xls` 파일을 읽어 운송장 / 출고일지 후보 시트를 탐색합니다.
5. 운송장이 있으면 운송장을 기준 수량으로 사용하고, 출고일지 / 출고일지(2)는 검증용 비교 시트로 사용합니다.
6. 상품별 집계 후 공급단가표 Google Sheet를 읽어 상품명 + 규격 기준으로 공급단가를 매칭합니다.
7. 검증이 모두 통과하면 일일마감 양식 첫 번째 시트에 결과 행을 추가합니다.

## Script Properties

- `API_TOKEN`
- `DRIVE_FOLDER_ID=1BKiey_Z7U8IF4M6tYGsLczeGXO6QyBDj`
- `DAILY_SHEET_ID=18YVXMvVAPBhSvuKQ9emEYQGy3wI0iHTS3B0lJvANAZA`
- `PRICE_SHEET_ID=1acSTjRKQSRFA4rS-OkpV042XmORCA9-8Hke0QYJd5K4`
- `ALLOW_PAGE_UPLOAD=true`
- `ALLOWED_PAGE_ORIGIN=https://livee0322.github.io`

## GitHub Repository Variables

- `EXPECTED_PRICE_SHEET_ID=1acSTjRKQSRFA4rS-OkpV042XmORCA9-8Hke0QYJd5K4`

## 검증 포인트

- `sample_csv` 모드에서도 `temporaryFileIds` 누락 없이 처리되어야 합니다.
- 운송장과 출고일지가 함께 있으면 운송장 기준 수량만 반영하고, 출고일지는 비교에만 사용해야 합니다.
- 운송장 수량과 출고일지 합계가 다르면 반영이 차단되어야 합니다.
- 공급단가표는 상품명 + 규격 기준으로 우선 매칭해야 합니다.
- 단가표에서 찾지 못한 상품이 있으면 일일마감 반영이 차단되어야 합니다.
- Health check에서 `ALLOW_PAGE_UPLOAD`, `ALLOWED_PAGE_ORIGIN`, Drive, 일일마감 시트, 공급단가표 접근 결과가 모두 실제 응답으로 보이도록 유지해야 합니다.
