# 운영 구조 호환 변경과 복원 리허설

2026-09-08. 운영 DB에는 DDL/DML을 실행하지 않는다. 기존 운영 이력 33건과 실제 구조를 기준으로 호환 변경을 준비하고, 격리 환경에서만 적용·복원한다. 실제 담당자 연결과 승인/지급은 이 작업에 포함하지 않는다.

## 변경 전 확인과 단계 완료 기준

1. 읽기 전용 preflight: `supabase/preflight/finance-operational-compatibility.sql`로 누락 컬럼/기존 타입, 6개 CHECK와 2개 FK의 기존 위반 건수, 원본 건수·금액·지문을 수집한다. 시점별 값이므로 실제 적용 직전 재실행한다.
2. 호환 SQL: `20260908053346_finance_operational_schema_compatibility.sql`에서 컬럼 15개, CHECK 6개, FK 2개와 인덱스 2개를 보완한다. 같은 이름의 다른 타입·제약·인덱스를 발견하거나 기존 값이 부적합하면 전체 명령을 실패시키고 원본을 보정하지 않는다. 재실행도 검증한다.
3. 구조 복원 리허설: 수집한 운영 catalog와 동일한 검사 범위의 구조를 별도 로컬 DB에 재현한다. 가짜 자료의 dump/restore 후 원본·첨부 바이트, 권한과 함수/제약을 대조하고 호환 SQL과 신규 업무 migration의 실제 순서를 실행한다.
4. 실제 운영 백업 리허설: 별도 PostgreSQL 접속정보와 실제 DB/Storage 백업으로 복원 검증해야 한다. 3번 성공으로 이 단계까지 완료했다고 판단하지 않는다.
5. 운영 적용: 1~4번의 결과와 앱/DB 호환 버전을 고정한 뒤 별도 적용한다. 실제 담당자 계정은 이후 명시 연결한다.

## 저장 의미와 정책 경계

과거 계정과목의 `subject_type`, `normal_balance`, `source`는 새 컬럼을 추가할 때 null로 둔다. ‘지출·차변·직접등록’으로 추정하지 않는다. 기존 컬럼이 이미 있으면 값과 기본값을 보존한다. 앱은 null을 ‘미확정’으로 표시하고 신규 등록의 필수 분류는 명시 입력한다.

은행 `transaction_kind`도 미확정 null을 허용한다. 금액이 입금 100원/출금 0원이면 표시상 입금 근거가 있지만, 호환 SQL이 저장값을 업데이트하지는 않는다. 입금 100원/출금 70원 또는 양쪽 0원은 방향을 추정하지 않는다. 출금 결의 연결은 명확한 출금 조건을 확인한다. match_status의 ‘미분류’, 빈 원본 payload/별칭/설명은 확인된 거래 내용이나 승인 결과를 의미하지 않는다.

예산·결의 금액, 실제 지출일, 지급·전표 상태와 감사는 그대로 유지한다. 기존 은행 날짜 인덱스의 조건, 소액경비 설정 기본값, 서비스 권한과 RLS는 이번 호환 변경으로 교체하거나 확대하지 않는다. 기존 자료에 위반 값이 있으면 해당 적용을 막고 정책 확인 대상으로 보고한다.

## 적용 순서

현재 운영 마지막 이력은 `20260906135650`이다. 신규 업무현황 migration이 누락된 `match_status`를 참조하므로 최신 호환 파일이 선행 필요하다. 과거 파일 날짜나 이력을 수정하지 않는다.

검토한 동일 SHA의 호환 SQL을 명시적 선행 단계로 실행한 뒤 기존 신규 후보 12개를 시간순으로 실행하고, 마지막 최신 호환 migration의 정상 순서에서 동일 파일을 다시 실행한다. 호환 SQL의 두 번째 실행은 원본과 객체 정의를 변경하지 않아야 한다. 운영 22개 이력 버전 대응 문제를 무시한 일반 `db push` 일괄 실행은 적용 절차로 사용하지 않는다. 실제 이력 기록과 실행 manifest는 운영 적용 단계에서 별도로 확인한다.

## 현재 운영 읽기 결과

2026-09-08 05:35:52 UTC 조회: PostgreSQL 17.6, 이력 33건, 누락 컬럼 15개. 은행거래·계정과목·전표는 각 0건, 지출결의는 6건/32,120,120원이다. 검사한 8개 제약 위반 건수는 모두 0건이고 결의 voucher_status는 모두 null이다. 이 결과는 자료가 비어 있는 테이블의 미래 입력이나 전체 DB 무결성을 보장하지 않는다. 원본 지문은 ignored `.tmp-repos/finance-compatibility-preflight-before.json`에 보관했다.

운영 security advisor는 기존 RLS 활성/정책 없음 INFO 50건, 함수 search_path 경고 2건, Auth 비밀번호 보호 경고 1건이다. 이번 작업에서 공개 정책이나 권한을 임의 추가하지 않는다. 함수 경고는 기존 approval.prevent_audit_mutation/guard_contract_payment 대상이며, 이 호환 SQL이 새 함수를 만들지는 않는다. [함수 search_path 안내](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [Auth 보호 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## 실제 운영 복원 검증에 필요한 것

현재 프로젝트 환경에는 앱 API 키만 있고 PostgreSQL 직접 접속 URL/DB 비밀번호가 없다. 실제 운영 백업을 받으려면 로컬 환경에 접속정보를 안전하게 준비해야 한다. 비밀번호를 문서·채팅·Git에 기록하지 않는다. 현재의 읽기 전용 MCP 쿼리 및 catalog snapshot은 전체 백업 파일이 아니다.

실제 백업에서는 DB schema/data/역할과 Storage 객체 파일을 별도로 확보해야 한다. DB 백업에는 Storage 파일 자체가 들어 있지 않다. [Supabase 공식 백업 문서](https://supabase.com/docs/guides/platform/backups). 운영 원본을 복원 대상으로 지정하지 말고 격리된 대상에서 검증한다. 실제 운영 백업·복원 성공, 복구시간/복구시점 보장과 운영 적용은 아직 완료하지 않았다.

## 격리 리허설 결과

`scripts/rehearse-finance-compatibility.mjs`는 환경변수와 `.env`를 읽거나 원격 DB에 접속하지 않는다. 기존 로컬 QA DB도 수정하지 않고 실행별 source/restore DB만 사용한다. 수집한 운영 catalog 범위와 source DB를 함수 36개, 테이블 43개, 인덱스 138개, 제약 266개, 컬럼 592개, 트리거 18개 기준으로 맞춘 뒤 차이 0건을 확인했다.

가짜 원본과 첨부를 넣은 source DB를 340,757바이트 custom dump로 만들고 별도 DB에 복원했다. 가짜 첨부 47바이트는 별도 파일 사본으로 복구해 SHA-256이 일치했다. 복원된 DB에서 호환 SQL 선행 적용, 신규 12개 migration 순차 적용, 호환 SQL 재실행과 금융 SQL 회귀 10개를 통과했다. preflight의 누락 컬럼은 15개에서 0개가 됐고 8개 위반 검사는 모두 0건이었다. 기존 컬럼만 투영한 원본과 첨부 메타 지문은 모든 단계에서 같았다.

상세 보고서와 dump는 ignored `.tmp-repos/finance-compatibility-rehearsal-*`에만 있다. 이 결과는 수집한 finance/approval 구조와 가짜 자료에 대한 리허설이다. 실제 Auth/Storage 서비스 백업, 전체 운영 schema, 운영 자료의 논리 백업과 실제 복원, PITR 및 복구시간 검증은 포함하지 않는다.
