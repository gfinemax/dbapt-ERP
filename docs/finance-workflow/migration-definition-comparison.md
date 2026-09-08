# 과거 migration 정의 비교 — 2026-09-08

## 결론과 적용 범위

운영 Supabase `takwoubezzhxtjvxecpx`의 실제 migration statements와 `pg_catalog`를 읽기 전용으로 비교했다. 다른 버전으로 등록된 동일 이름 22개 중 19개는 SQL 토큰이 같고, 3개는 실제 이력 차이가 있다. 거래처 생성 위치와 조직 인덱스 분리 이력은 후속 적용 후의 최종 객체가 동등함을 확인했다. schema reload 알림 1개 차이는 영속 객체 차이가 아니다.

그러나 **현재 로컬 schema.sql과 운영 전체 기준이 동등한 것은 아니다.** 운영에는 계정과목/은행거래의 로컬 컬럼 15개, 제약 8개, 인덱스 2개가 없고, 인덱스 조건 1개·기본값 2개·일부 테이블 권한이 다르다. 22개 이름 대응만 정리하고 곧바로 신규 파일을 일괄 적용하는 근거로 삼으면 안 된다.

과거 파일 재실행, 이력 repair, 운영 DDL/DML, 승인/지급/계정 연결은 하지 않았다. 아래 결과는 운영 적용 완료나 복원 성공 보고가 아니다.

## 방법과 증거

- 운영 이력 33건의 `version/name/statements`를 조회했다. URL 비밀번호·JWT·Supabase secret key 패턴을 검사한 뒤 Git 제외 `.tmp-repos/finance-migration-remote.private.json`에 보관했다. 원문이나 인증정보를 본 문서에 붙이지 않았다.
- 최종 운영 정의를 함수 36개, 테이블 43개, 인덱스 138개, 제약 266개, 컬럼 592개, 사용자 트리거 18개 범위로 읽었다. 조회 범위는 finance/approval 및 거래처 이동 확인 대상이다.
- 운영과 무관한 로컬 Docker `supabase_db_dbapt-finance-e2e-20260908-a7c1`에 별도 DB `finance_definition_compare_20260908`를 생성했다. 빈 Auth/Storage 참조용 구조와 현재 `supabase/schema.sql`, 로컬 과거 migration 중 `20260906135650`까지를 순서대로 적용했다. 이 DB에는 운영 업무자료를 복제하지 않았다. 클러스터 공통 설정을 바꾸는 expose 파일은 실행하지 않고 SQL/운영 role 설정을 비교했다.
- 따옴표 안 값과 식별자를 유지하고 SQL 공백·주석을 제외한 토큰을 비교했다. 토큰 동일은 동일 텍스트 구조의 근거이며, 서로 다른 SQL의 일반적인 의미 동등성 증명이나 과거 데이터 변경 효과의 재현은 아니다.
- 로컬 비교 기준은 43개 테이블/36개 함수/140개 인덱스/274개 제약/607개 컬럼이다. 운영 함수 36개의 현재 정의와 함수 권한, 18개 트리거, 테이블 RLS 설정은 전부 일치했다. 시점별 함수가 이후 migration에서 교체되는 경우 최종 정의를 기준으로 확인했다.
- 마지막 읽기 쿼리에서 지출결의 6건의 `md5(to_jsonb(row)::text)`가 기존 release inventory의 6개 지문과 모두 일치했다. 총액도 32,120,120원으로 동일했다. 이는 해당 원본 행 검증이며 전체 DB/Storage 백업 검증은 아니다.

## 버전이 다른 22개 대응

| 이름 | 로컬 버전 | 운영 버전 | 판정 |
|---|---|---|---|
| expense_evidence_ocr_jobs | 20260712130229 | 20260712131053 | 정의 동등(토큰) |
| basic_info_registration | 20260715231000 | 20260715140302 | 실질 이력 차이 — 아래 설명 |
| business_partners | 20260714191000 | 20260715140420 | 실질 이력 차이 — 아래 설명 |
| move_business_partners_to_finance | 20260715234000 | 20260715140548 | 정의 동등(토큰) |
| expense_compliance_workflow | 20260716130000 | 20260716114933 | 정의 동등(토큰) |
| expense_compliance_indexes | 20260716130100 | 20260716115132 | 정의 동등(토큰) |
| expense_compliance_default_organization | 20260716130200 | 20260716115515 | 정의 동등(토큰) |
| approval_workflow | 20260717094035 | 20260717095830 | 정의 동등(토큰) |
| expose_approval_schema | 20260717100028 | 20260717095945 | 실질 이력 차이 — 아래 설명 |
| approval_foreign_key_indexes | 20260717100632 | 20260717100651 | 정의 동등(토큰) |
| approval_contract_draft_fields | 20260717101530 | 20260717102121 | 정의 동등(토큰) |
| approval_line_rules | 20260717102140 | 20260717102518 | 정의 동등(토큰) |
| allow_out_of_budget_expense_drafts | 20260717132159 | 20260717132322 | 정의 동등(토큰) |
| direct_expense_governance | 20260717141746 | 20260717142348 | 정의 동등(토큰) |
| direct_expense_policy_options | 20260717142531 | 20260717142720 | 정의 동등(토큰) |
| corporate_card_expense_link | 20260827120000 | 20260827122744 | 정의 동등(토큰) |
| quick_expense_records | 20260827122412 | 20260827122756 | 정의 동등(토큰) |
| quick_expense_budget_guard | 20260827123035 | 20260827123217 | 정의 동등(토큰) |
| quick_expense_source_pending | 20260827124600 | 20260827124835 | 정의 동등(토큰) |
| link_quick_expense_card | 20260827130416 | 20260827130753 | 정의 동등(토큰) |
| monthly_approval_budgets | 20260827133956 | 20260827134203 | 정의 동등(토큰) |
| budget_calculation_basis | 20260827135210 | 20260827135909 | 정의 동등(토큰) |

버전·이름이 같은 나머지 10개도 실제 statements 토큰이 모두 일치했다. 현재 새 개발 파일은 위 과거 대응 집계에 포함하지 않았다.

## 이력 차이 3개와 별도 2개

| 대상 | 실제 차이 | 최종 객체 확인 / 남은 한계 |
|---|---|---|
| basic_info_registration | 운영 최초 파일에는 items/credit_cards 조직 인덱스 2개가 없음 | 운영 별도 basic_info_organization_indexes에서 생성. 현재 두 인덱스의 대상·컬럼·조건이 로컬과 일치 |
| business_partners | 운영은 core schema에서 최초 생성, 로컬 파일은 finance에서 생성. 조직 인덱스도 운영 별도 이력에 있음 | 운영 후속 move 파일이 finance로 이동. 현재 finance.business_partners의 컬럼·제약·인덱스·RLS는 로컬과 일치. 서비스 역할 추가 권한 차이는 아래 별도 기록 |
| expose_approval_schema | 운영은 reload config만, 로컬은 reload schema 알림도 포함 | 운영 authenticator의 pgrst.db_schemas는 public, graphql_public, finance, approval로 의도한 값. 당시 schema 캐시 갱신 시점은 현재 catalog로 확인 불가. 알림 재실행 필요성을 추정하지 않음 |
| 운영만 있는 basic_info_organization_indexes | business_partners/items/credit_cards 조직 인덱스 3개 생성 | 현재 3개 모두 finance 대상이고 로컬 최종 정의와 일치. 로컬 다른 파일에 흡수된 구성으로 확인 |
| 로컬만 있는 expense_disbursement_workflow | 같은 이름의 운영 이력 없음 | 관련 expense_workflow_operations/audit_logs의 컬럼·제약·인덱스·RLS·테이블 권한, 결의 지급/전표 컬럼 및 voucher_no 부분 고유 인덱스가 존재하며 해당 migration 정의와 일치. 어느 과거 배포가 적용했는지 이력 출처는 확인 불가. 현재 schema.sql에만 있는 voucher_status CHECK는 운영에 없으므로 전체 schema 동등으로 확대하지 않음 |

## 이력 대응과 별도로 남는 실제 schema 차이

| 구분 | 운영과 로컬 차이 | 조치 판단 |
|---|---|---|
| account_subjects 컬럼 7개 | 운영에 subject_type, normal_balance, business_category, source, aliases, description, sort_order 없음 | 현재 계정과목 코드 의존성과 함께 별도 호환 migration 설계 필요. 기존 운영 계정 값을 임의 보정하지 않음 |
| bank_transactions 컬럼 8개 | 운영에 transaction_kind, branch_name, uploaded_major_category, uploaded_account_title, recommended_account_subject_id, recommended_account_subject_name, match_status, raw_payload 없음 | 실제 업로드/매칭 코드와 신규 업무현황 쿼리의 의존성을 확인하고 운영 schema 리허설에 반영 |
| CHECK 6개 | 운영에 account_subjects의 normal_balance/source/subject_type, bank_transactions의 match_status/transaction_kind, expense_resolutions의 voucher_status CHECK 없음 | 새 제약 추가 전 기존 값 검사 필요. 이 보고서에서 운영 값 수정/제약 생성하지 않음 |
| FK 2개 | 운영에 bank_transactions.recommended_account_subject_id, vouchers.detail_transaction_id FK 없음 | 기존 ID 일관성 확인 후 명시 migration 검토. 전체 데이터 적합성은 미확인 |
| 인덱스 2개 | 운영에 account_subjects_org_sort_idx, bank_transactions_match_status_idx 없음 | 관련 컬럼 도입 이후 인덱스 계획. 이름만 이력에 추가하지 않음 |
| 인덱스 조건 1개 | bank_transactions_account_date_idx는 운영 전체행, 로컬은 deleted_at IS NULL 조건 | 현재 쿼리와 실행계획을 고려해 유지/교체 판단. 데이터 무결성 차이와 혼동하지 않음 |
| 기본값 2개 | petty_cash_allowed_accounts/excluded_keywords는 운영 목록 기본값, 로컬 빈 배열 | 운영 규칙/기존 설정을 빈값으로 덮어쓰지 않음. 동일 migration도 기존 컬럼 존재 여부 때문에 최종 기본값이 달라질 수 있음 |
| service_role 권한 | 운영 business_partners/credit_cards/items는 SELECT/INSERT/UPDATE 중심. 로컬은 DELETE/REFERENCES/TRIGGER/TRUNCATE도 보유 | 운영에 넓은 권한을 자동 부여하지 말고 사용 경로 기준 검토 |
| 익명/일반 인증 권한 | 운영 bank_accounts/bank_transactions에 anon/authenticated 테이블 권한이 로컬보다 넓음 | 두 테이블 모두 RLS 활성이고 정책 0개 확인. 현재 공개 행 접근이 허용된다는 뜻은 아님. 불필요 GRANT 축소는 별도 변경으로 검토 |

계정/은행 컬럼과 제약 차이는 과거 22개 SQL의 단순 버전 오차로 설명되지 않는다. 현재 schema.sql을 시작점으로 쓰는 로컬 테스트만 통과해도 운영 동일 결과를 보장하지 않는 구체적인 근거다. 신규 적용 리허설은 위 실제 운영 정의를 기준으로 수행해야 한다.

## 재현과 완료 기준

오프라인 비교 스크립트는 입력 snapshot만 읽고 요약을 stdout에 출력한다. 네트워크 접근, 운영 인증정보, SQL 실행, 파일 덮어쓰기 코드는 없다. 입력 경로는 realpath로 확인한 ignored .tmp-repos 안으로 제한한다.

```powershell
node scripts/compare-finance-migration-definitions.mjs .tmp-repos/finance-migration-remote.private.json .tmp-repos/finance-operational-catalog.private.json .tmp-repos/finance-local-historical-catalog.private.json .tmp-repos/finance-operational-details.private.json .tmp-repos/finance-local-historical-details.private.json
```

운영 조회 SQL은 ignored `finance-catalog-read.sql`과 `finance-details-read.sql`, 요약은 `finance-definition-comparison-summary.json`에 보관했다. 코드 변경이 병행되면 같은 파일명을 다시 읽더라도 SHA가 달라질 수 있으므로 요약에 기록한 migration SHA-256을 함께 확인한다. 스크립트 구문 검사와 실제 수집 snapshot 실행을 통과했다.

22개 실제 이력 비교와 최종 객체 차이 분류는 완료했다. 과거 변경의 실행 경로 추적, 실제 운영 데이터에 새 제약을 적용할 수 있는지 검사, 전체 백업/복원, 위 schema 차이 해소 migration, 신규 운영 적용은 아직 완료하지 않았다. 이 문서는 repair나 운영 적용을 자동 승인하지 않는다.
