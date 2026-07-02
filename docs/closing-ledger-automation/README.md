# 마감원장 자동화 프로세스 초안

브랜아크 발주서와 발주단가표를 비교하여 마감원장 초안을 생성하고, 사람이 PR에서 검증한 뒤 merge 시 Google Spreadsheet 마감원장을 생성하는 구조입니다.

## 목표

- 발주서 수량 집계 오류 최소화
- 발주단가 누락 자동 감지
- PR 기반 사람 검수 단계 확보
- merge 이후에만 최종 Google Spreadsheet 생성
- 텔레그램으로 처리 결과 공유

## 기본 흐름

```text
1. 발주서 파일 업로드
2. GitHub Action 실행
3. 발주서 / 발주단가표 비교
4. 마감원장 초안 CSV 및 검증 리포트 생성
5. 자동 PR 생성
6. 담당자가 PR에서 수량·단가·누락 상품 검증
7. 승인 후 merge
8. merge 이벤트로 Google Spreadsheet 생성
9. 텔레그램 완료 알림
```

## 현재 문서

- `process.md` : 전체 업무 흐름
- `folder-structure.md` : 폴더 구조
- `validation-rules.md` : 검증 규칙
- `spreadsheet-spec.md` : 생성될 마감원장 시트 규격
