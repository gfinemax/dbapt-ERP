# 운영 적용 준비 조사 — 2026-09-08

## 완료 범위

운영 배포 기록·DB migration 이력·계정 연결 대상의 읽기 전용 조사와 적용/복구 계획을 준비했다. 운영 schema 변경, migration history repair, 계정 생성/초대/연결, 승인·송금·전표 실행은 하지 않았다. 이번 문서는 운영 적용 완료 보고가 아니다.

## 확인된 상태

| 항목 | 확인 결과 | 판단 범위 |
|---|---|---|
| 제품 코드 | `2f1616850afd2d1cdc36b2ddb68e912f34d1676a` | 조사 기준 제품 커밋 |
| 배포 | GitHub deployment `6320825874`, Production, success, 2026-09-08 13:47:27 KST | GitHub에 기록된 Vercel 성공 상태 |
| 운영 주소 | `https://dbapt-erp.vercel.app/finance/expense-resolutions`, `/finance/expense-authorizations` 모두 HTTP 200 로그인 화면 | 비로그인 GET만 확인. 로그인 후 업무 성공으로 해석하지 않음 |
| Vercel 직접 조회 | 연결 도구에서 팀 권한 403 | 현재 alias의 정확한 deployment 연결과 런타임 로그는 미확인. 배포 고유 URL은 Vercel 로그인으로 이동 |
| DB 최신 이력 | `20260906135650_unified_budget_changed_months` | 운영 이력 33건 |
| 신규 기반 | `workflow_transactions`, `workflow_contract_versions`, `expense_authorization_bindings` 없음 | 코드 배포와 DB 준비 상태 불일치. 새 업무 실행 준비 미완료 |
| 지출결의 | 6건, 32,120,120원, 작성중 3 / 승인대기 3 | 모두 지급전, 조직 누락 0 |
| 기타 원본 | 간편지출 5건, 전표 0건, 승인완료 기안 2건 | 기존 자료 보존 대상 |
| 계정 | Auth 사용자 1명, 활성 업무 멤버 ADMIN 1명, 해당 조직 core 프로필 0명 | 파인맥스 업무 계정과 기존 이름의 관계는 자동 추정하지 않음 |
| 기존 증빙 | 4개, 899,566바이트, 기존 기준과 ID 집합·크기·SHA-256 일치 | 읽기 검증이며 복원 가능한 전체 백업이 아님 |

배포 근거: [Vercel 성공 상태가 기록된 커밋](https://github.com/gfinemax/dbapt-ERP/commit/2f1616850afd2d1cdc36b2ddb68e912f34d1676a). 조회 시점 이후 변경될 수 있으므로 적용 직전 다시 확인한다.

## Migration 대응과 적용 후보 순서

로컬 44개와 운영 이력 33개를 비교했다. 버전·이름 일치 10개, 같은 이름/다른 버전 22개, 과거 별도 확인 1개, 신규 후보 11개다. 이름이나 버전의 일치는 SQL 내용 동등성 검증을 대신하지 않는다.

- 과거 별도 확인: 로컬 `20260712084046_expense_disbursement_workflow.sql`의 같은 이름 이력은 없지만 운영의 `expense_workflow_operations`, `expense_workflow_audit_logs`, `expense_resolutions_voucher_no_unique_idx`는 존재한다. 전체 정의·제약·권한이 동등한지는 추가 비교가 필요하다.
- 운영에만 이름이 있는 이력: `20260715140513_basic_info_organization_indexes`. 다른 로컬 파일에 흡수됐는지 실제 정의를 확인한다.
- `db push --include-all`, 과거 파일 일괄 재실행, 증거 없이 `migration repair` 하는 절차는 이 계획에 포함하지 않는다. 기존 이력 대응을 검토한 뒤 신규 후보만 명시한다.

| 순서 | 파일 | 작업 단위 |
|---|---|---|
| 1 | `20260907125249_fund_workflow.sql` | 원본·신탁·지급 공통 기반 |
| 2 | `20260907220007_trust_request_versions.sql` | 신탁 요청 버전 |
| 3 | `20260907222753_trust_route_revisions.sql` | 신탁 경로 변경 |
| 4 | `20260908025229_payment_workspace.sql` | 지급 관리 |
| 5 | `20260908030038_accounting_drafts.sql` | 회계 초안 |
| 6 | `20260908030647_trust_contract_condition_update.sql` | 신탁 조건 변경 |
| 7 | `20260908031029_legacy_settlement_source_guard.sql` | 기존 정산 원본 보호 |
| 8 | `20260908031305_expense_workspace.sql` | 공통 지출 원본 목록 |
| 9 | `20260908032253_advance_settlement_drafts.sql` | 선지급 정산 초안 |
| 10 | `20260908032705_finance_task_sources.sql` | 업무현황 집계 |
| 11 | `20260908041709_legacy_expense_authorization.sql` | 기존 결의 계정 연결·원자 명령 |

이 순서는 검토 대상이며 실행 승인이나 운영 적합성 검증 결과가 아니다. 로컬 전체 schema에서 통과한 이전 12개 SQL suite를 운영 schema 차이 검증으로 대체 해석하지 않는다.

## 관리자 계정 연결 확인표

실제 이름·UUID가 있는 파일은 Git에 넣지 않고 ignored `.tmp-repos/finance-release-review/`에 생성했다.

- `expense-account-review.csv`: 결의 6건의 작성자 6칸 + 결재자 18칸 = 24행. 원본 ID·문서번호·조직·순서·기존 표시·확인할 UUID·근거·검토자·검토일 포함. 확인할 UUID는 전부 빈칸이다.
- `approval-history-review.csv`: 승인 완료 기안 2건의 작성자/결재 단계 8행. 이미 승인된 이력은 소급 서명하거나 다시 승인하지 않는다. 기안 모듈은 별도 후속 정비 대상이다.
- `available-accounts.csv`: 현재 업무 계정과 Auth/프로필 존재 여부. 후보를 문서에 자동 배정하지 않는다.
- `migration-comparison.csv`, `release-manifest.json`: 전체 대응 분류와 신규 후보 파일 SHA-256. manifest의 `executionAuthorized=false`는 보고서 상태이며 보안 통제 자체는 아니다.

작성자 표시는 같은 사람처럼 보여도 서로 다른 값을 그대로 유지한다. 역할 표기도 부장/담당자, 사무장/사무국장 등을 합치지 않는다. 실제 당사자·로그인 계정·업무 역할을 관리자가 확인해야 한다. 현재 관리자 한 명을 모든 결재 단계에 임의 지정하지 않는다.

재생성은 읽기 전용 조사 결과 JSON을 입력으로 아래 명령을 실행한다. 스크립트에는 네트워크·DB 쓰기·계정 매칭 코드가 없다. 입력/출력은 ignored `.tmp-repos` 아래로 제한한다.

```powershell
node scripts/prepare-finance-release-report.mjs .tmp-repos/finance-release-inventory.json .tmp-repos/finance-release-review
```

## 운영 적용 및 복구 절차

1. **적용 전 상태 고정**: 적용 시각·담당자·쓰기 중지 범위를 정하고 신규 실행을 제한한다. 현 운영 alias의 deployment ID/제품 SHA, DB 이력, 원본/자식/감사/Storage 목록과 지문을 다시 수집한다. 현재 Vercel 팀 접근 오류를 해소해 정확한 alias와 런타임을 확인한다.
2. **복구 수단 확인**: 실제 백업 시각·보존 기간·PITR 제공 여부·복원 권한과 복구 시간을 확인한다. DB schema/data/역할 및 별도 Storage 파일 사본을 준비한다. 격리 환경에서 복원하고 원본·파일 해시를 대조한다. 현재는 백업 존재·전체 복원 성공 모두 미확인이다. DB 백업은 Storage 객체 파일을 포함하지 않으므로 파일을 별도로 보존한다. [Supabase 공식 백업 문서](https://supabase.com/docs/guides/platform/backups)
3. **운영 schema 기준 리허설**: 필요한 범위의 보호된 백업/복제본에서 과거 이력 차이를 비교한 후 신규 11개를 순서대로 적용한다. 매 단계 SQL 실패 시 다음 단계로 진행하지 않는다. 부분 적용 여부를 migration 이력과 객체 정의로 확인한다. 기존 자료의 ID·건수·금액·상태·증빙 지문이 그대로여야 한다.
4. **권한·저장 리허설**: 테스트 계정/가짜 자료로 초안 저장·재조회·동명이인/타 조직 차단·동시 승인·중복 처리·기존 URL을 확인한다. 승인과 실제 지급은 별도로 검증하며 자동 지급을 기대하지 않는다. 사실확인 초안의 브라우저 저장·수정·삭제도 이 단계에 포함한다.
5. **운영 적용**: 검토된 manifest 파일과 해시가 일치하는 DB 변경만 적용하고 검증한다. 호환되는 앱 deployment를 연결해 로그인·읽기·오류 로그를 확인한다. 실제 기존 문서 BIND는 관리자 확인표의 계정/근거가 확정된 건에만 수행하고, 연결 후 과거 승인·금액·지급·증빙 불변을 확인한다.
6. **문제 발생 시**: 쓰기를 제한하고 적용 단계·오류·직전 성공 이력을 보존한다. 상태 변경 없는 실패는 확인 후 재시도하며 무조건 전체 재실행하지 않는다. 앱만 되돌릴 때는 실제 DB와 호환성을 검증한 deployment만 사용한다. 바로 이전 커밋도 신규 DB에 의존할 수 있어 안전한 복구 버전으로 간주하지 않는다. DB 복원이 필요하면 중지 시각 이후 새 업무 자료의 보존/재반영 계획과 파일 사본을 확인한 뒤 실행한다. 새 테이블을 임의 DROP해서 되돌리지 않는다.

## 단계 완료 기준과 다음 작업

| 단계 | 상태 | 다음 완료 기준 |
|---|---|---|
| 운영 읽기 조사·연결 확인표 | 완료 | 적용 직전 최신 자료로 재생성 |
| Vercel 직접 상세·런타임 확인 | 접근 제한 | 해당 팀 접근이 가능한 연결로 alias/배포/로그 확인 |
| 기존 SQL 정의/이력 차이 분석 | 분류 완료, 동등성 미확인 | 22개 버전 차이와 과거 별도 항목의 실제 정의 비교 |
| 기존 기안 승인 경로 정비 | 미완료 | 표시 이름 기반 decide_document를 Auth UUID·조직·동시성 검사로 정비; 기안/결의 상태 독립 유지 |
| 담당자 계정 확정 | 사용자 확인 필요 | 3명의 계정과 관리자 계정의 관계 확인; 임의 생성/연결 금지 |
| 백업·복원·운영 schema 리허설 | 미완료 | 실제 복원 성공과 자료 불변 증거 |
| 운영 DB 적용·실제 계정 연결 | 미실행 | 위 검증 완료 후 검토된 대상만 적용 |

계정 확인을 기다리는 동안 기안 승인 경로 조사·정비와 migration 정의 비교를 진행할 수 있다. 회계 확정/정정, 선지급 정산 확정, 사실확인 서명, 수납 원장 선택은 각각 정책에 의존하는 실행만 제한한다.

## 2026-09-08 후속 조사 반영

위 표는 최초 조사 시점의 기록이다. 22개 이력의 실제 SQL 비교는 `migration-definition-comparison.md`에서 완료했다. 19개는 토큰 동일, 3개는 이력 구성이 다르지만 후속 최종 객체 대응을 확인했다. 다만 현재 운영에 계정과목/은행거래 컬럼 15개 등이 없으며, 신규 업무현황 함수가 사용하는 `bank_transactions.match_status`도 없다. 과거 버전 대응이 확인됐다는 이유로 신규 SQL을 곧바로 일괄 적용하면 안 된다.

기안 UUID 승인 변경으로 신규 후보는 12개가 됐다. 기안 구현·검증 범위는 `approval-authorization-design.md`와 `local-integration-verification.md`를 따른다. 운영에서는 12개 모두 미적용이며, 과거 migration repair도 하지 않았다. 다음 독립 작업은 실제 운영 정의를 기준으로 누락 컬럼·제약의 호환 변경을 설계하고 기존 값 적합성을 검사하는 것이다. 계정 연결과 정책 확정은 별도로 확인한다.

호환 변경과 가짜 자료 복원 리허설은 `operational-compatibility-plan.md`에서 완료했다. 운영 읽기 검사상 대상 자료의 제약 위반은 0건이며, 누락 컬럼을 임의 업무값 없이 추가하는 migration과 앱의 미확정 표시를 구현했다. 수집한 운영 catalog 범위의 격리 구조에서 dump/restore와 신규 12개 적용도 통과했다. 실제 운영 DB/Storage 백업을 격리 대상에 복원한 검증은 PostgreSQL 직접 접속정보가 없어 미완료이며, 운영 적용과 계정 연결도 실행하지 않았다.

운영 Storage 객체 34개/8,150,705바이트는 읽기 전용 백업 후 로컬 Storage 복원·재다운로드 해시 검증까지 완료했다. 따라서 남은 복원 준비 범위는 운영 PostgreSQL 전체 dump/격리 복원, DB와 Storage 참조 대조 및 복구시간 측정이다. 운영 DB 적용과 실제 계정 연결은 계속 미실행이다.

## 운영 PostgreSQL 논리 백업 실행 준비

Supabase CLI 로그인 계정으로 운영 프로젝트 연결을 시도했지만 프로젝트 상태 조회 권한이 없어 `LegacyLinkProjectStatusError`로 중단됐다. 운영 DB에는 쓰기를 실행하지 않았다. CLI 로그인 권한과 PostgreSQL 접속 권한은 별개이므로 Session pooler 연결 문자열과 DB 비밀번호가 필요하다.

연결 문자열은 채팅, Git, 명령행 인자에 넣지 않는다. ignored `.tmp-repos/finance-operational-db.env`에 다음처럼 저장한다.

```dotenv
DBAPT_BACKUP_SOURCE_URL="postgresql://postgres.takwoubezzhxtjvxecpx:URL_ENCODED_PASSWORD@SESSION_POOLER_HOST:5432/postgres"
DBAPT_BACKUP_PROJECT_REF="takwoubezzhxtjvxecpx"
```

비밀번호에 특수문자가 있으면 URL 인코딩한 값을 사용한다. Dashboard의 **Connect → Session pooler** 문자열을 그대로 복사해 비밀번호 자리만 채우는 방식이 안전하다. 파일을 만든 뒤 아래 명령으로 읽기 전용 논리 백업을 실행한다.

```powershell
node scripts/backup-finance-operational-db.mjs .tmp-repos/finance-operational-db.env
```

도구는 예상 프로젝트 ref, Supabase 호스트, `postgres` DB를 검사하고 비밀번호를 프로세스 인자나 로그에 기록하지 않는다. PostgreSQL 17 컨테이너에서 Supabase CLI와 같은 관리 schema 제외·역할 필터를 사용해 `roles.sql`, `schema.sql`, `data.sql`을 만들고 migration 이력도 별도 보존한다. 결과와 SHA-256 manifest는 ignored `.tmp-repos/finance-operational-db-backup-*`에만 저장한다.

이 백업은 roles/schema/data/history가 별도 명령으로 생성되므로 운영 적용 직전 최종 백업은 쓰기 중지 구간에서 다시 만든다. 현재 단계의 무중단 백업은 복원 호환성 조사에 사용한다. 백업 파일만 생성한 상태는 완료가 아니며, 격리 로컬 Supabase 복원·원본 건수/금액/ID·DB의 Storage 참조와 별도 파일 34개의 대조·복구시간 측정을 통과해야 한다.

복원 리허설은 새 로컬 Supabase 작업 폴더의 `project_id`가 `dbapt-finance-restore-*`일 때만 실행된다. 기존 QA DB나 운영 주소를 대상으로 받을 수 없고, 대상에 `finance`·`approval`·`core` 업무 테이블이 하나라도 있으면 중단한다. 백업 SHA-256을 먼저 확인한 후 단일 transaction으로 역할·schema·data를 복원하고, 핵심 지출 건수/금액·Auth 사용자·Storage 메타데이터 건수/크기를 원본 요약과 대조한다.

```powershell
node scripts/rehearse-finance-operational-db-restore.mjs `
  .tmp-repos/finance-operational-db-backup-YYYY-MM-DD `
  .tmp-repos/finance-db-restore-local
```

복원된 로컬 환경은 검토를 위해 자동 삭제하지 않는다. 여기까지 통과한 다음 호환 migration과 신규 12개 migration을 적용하고 SQL 회귀검사, DB의 Storage 경로와 별도 Storage 백업 manifest 대조를 수행한다.

도구 자체 검증은 기존 로컬 Supabase를 읽기 원본으로 사용해 완료했다. 6개 백업 파일 706,173바이트의 SHA-256을 확인했고, 별도 로컬 Supabase에 1.211초 동안 복원한 뒤 위 핵심 수치가 모두 일치했다. 이 결과는 도구와 격리 조건 검증이며 운영 DB 백업 성공 증거가 아니다. 운영 연결 문자열이 준비되면 같은 도구로 운영 읽기 백업을 만든 뒤 운영 자료로 복원·migration·Storage 참조 대조를 다시 수행해야 한다.

2026-09-08 Dashboard 확인 결과 이 프로젝트는 Free Plan이라 예약 백업이 제공되지 않는다. Session pooler는 `aws-1-ap-northeast-2.pooler.supabase.com:5432`, 사용자는 `postgres.takwoubezzhxtjvxecpx`로 확인했다. DB 비밀번호는 Dashboard에서 조회할 수 없고 재설정 시 기존 연결이 끊길 수 있다는 경고가 표시된다. 실제 비밀번호를 확인하기 전에는 재설정하거나 추정값으로 접속하지 않는다. ignored `.tmp-repos/finance-operational-db.env`에는 확인된 주소와 비밀번호 자리표시자만 준비했으며, 도구는 자리표시자가 남아 있으면 네트워크 접속 전에 중단한다.

비밀번호를 직접 파일에 편집하지 않으려면 저장소 루트의 PowerShell에서 아래 명령을 실행한다. 입력값은 화면에 표시되지 않고 URL 인코딩된 연결 파일만 ignored `.tmp-repos`에 기록된다. 비밀번호를 명령 인자나 채팅으로 전달하지 않는다.

```powershell
.\scripts\set-finance-operational-db-password.ps1
```

## 운영 백업·격리 복원 완료 결과 — 2026-09-08

실제 운영 PostgreSQL에 Session pooler로 읽기 접속해 논리 백업을 생성했다. 최종 유효 백업은 ignored `.tmp-repos/finance-operational-db-backup-2026-09-08T06-57-36-887Z-4a2447c5/`에 있으며 roles/schema/data/migration-history/원본 요약 6개 파일, 총 633,279바이트다. 각 파일 SHA-256은 private manifest에서 검증했다. 비밀번호와 연결 문자열은 백업 파일·보고서·Git·명령 인자에 기록하지 않았다.

별도 로컬 Supabase `dbapt-finance-restore-operational-20260908`에 운영 백업을 단일 transaction으로 복원했다. Supabase CLI가 긴 project ID를 컨테이너 이름에서 줄이는 동작을 확인해, 복원 도구는 이름 조합 대신 해당 workdir Docker label로 DB 컨테이너를 정확히 하나만 선택하도록 보완했다. 예약 역할 `supabase_admin` 변경문은 관리 환경 복원에서 거절되므로 Supabase 역할 필터 뒤에 명시적으로 제외했다. 최종 복원은 1.013초에 완료됐고 다음 원본 수치가 일치했다.

| 검증 항목 | 운영 백업 | 격리 복원 |
|---|---:|---:|
| 지출결의 | 6건 / 32,120,120원 | 동일 |
| 간편지출 | 5건 | 동일 |
| 전표 | 0건 | 동일 |
| 승인 기안 | 2건 | 동일 |
| Auth 사용자 | 1명 | 동일 |
| Storage 메타데이터 | 34건 / 8,150,705바이트 | 동일 |

격리 복원본에 호환 prerequisite, 신규 workflow migration 12개, 호환 migration 재실행까지 총 14단계를 적용했다. 적용 전 누락 15개 컬럼과 제약 위반 0건을 확인했고, 적용 후 누락·위반 모두 0건이었다. SQL 회귀 suite 10개가 통과했으며 기존 핵심 수치와 지출결의 원본 지문이 보존됐다. 이 실행은 격리 로컬 DB에만 수행했고 운영 migration history와 운영 DB schema는 변경하지 않았다.

운영 DB `storage.objects`의 bucket/path/size 전체와 별도 Storage 백업을 일대일 대조했다. 34개 객체 8,150,705바이트가 모두 일치했고 로컬 사본 SHA-256도 전부 유효했다. 운영 Storage 업로드·삭제는 실행하지 않았다.

이제 기술적 리허설은 완료됐다. 실제 운영 적용 전에는 짧은 쓰기 중지 구간을 정하고 같은 도구로 최종 백업을 다시 만든 뒤, 검토된 13개 파일(호환 migration 1개 + 신규 workflow migration 12개)만 적용한다. 적용 직후 원본 수치·권한·저장·재조회·중복 처리와 운영 화면을 확인한다. 실제 담당자 UUID 연결은 이 검증 다음 단계에서 관리자 확인표에 확정된 대상만 처리한다.
