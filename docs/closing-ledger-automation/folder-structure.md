# 폴더 구조 초안

```text
branark/
├─ orders/
│  ├─ incoming/
│  │  └─ 발주서 업로드 위치
│  ├─ processed/
│  │  └─ 처리 완료된 발주서 보관
│  └─ samples/
│     └─ 테스트용 샘플 발주서
│
├─ prices/
│  ├─ current/
│  │  └─ 현재 사용 중인 발주단가표
│  ├─ archive/
│  │  └─ 과거 단가표 백업
│  └─ samples/
│     └─ 테스트용 샘플 단가표
│
├─ generated/
│  ├─ drafts/
│  │  └─ PR 검증용 마감원장 초안
│  ├─ final/
│  │  └─ merge 이후 확정 산출물
│  └─ csv/
│     └─ Google Sheets 생성용 CSV
│
├─ reports/
│  ├─ validation/
│  │  └─ 검증 리포트
│  └─ missing-prices/
│     └─ 단가 누락 리포트
│
├─ scripts/
│  ├─ parse_order.py
│  ├─ match_prices.py
│  ├─ generate_ledger.py
│  └─ create_google_sheet.py
│
├─ docs/
│  └─ closing-ledger-automation/
│     ├─ README.md
│     ├─ process.md
│     ├─ folder-structure.md
│     ├─ validation-rules.md
│     └─ spreadsheet-spec.md
│
└─ .github/
   └─ workflows/
      ├─ closing-ledger-draft.yml
      └─ closing-ledger-publish.yml
```

## 폴더별 역할

| 폴더 | 역할 |
|---|---|
| `orders/incoming` | 신규 발주서 업로드 위치 |
| `orders/processed` | 처리 완료 발주서 보관 |
| `prices/current` | 현재 기준 발주단가표 |
| `prices/archive` | 이전 단가표 백업 |
| `generated/drafts` | PR 검증용 마감원장 초안 |
| `generated/final` | merge 이후 확정 산출물 |
| `reports/validation` | 수량·단가 검증 결과 |
| `reports/missing-prices` | 단가 누락 상품 목록 |
| `scripts` | 자동화 스크립트 위치 |
| `.github/workflows` | GitHub Actions 설정 |

## 파일명 규칙

### 발주서

```text
YYYYMMDD_업체명_발주서.xlsx
```

예시:

```text
20260702_식봄_발주서.xlsx
20260702_명동김치_발주서.xlsx
```

### 발주단가표

```text
YYYYMMDD_발주단가표.xlsx
```

예시:

```text
20260702_발주단가표.xlsx
```

### 마감원장 초안

```text
YYYYMMDD_마감원장_초안.csv
YYYYMMDD_검증리포트.md
```
