# 기존 지출결의 UUID 권한 연결과 원자적 저장 설계

2026-09-08 구현 전 조사와 설계, 구현 후 확정 계약을 함께 기록한다. 아래 초기 제안과 실제 구현의 차이는 마지막 `구현 계약 확정 및 로컬 검증 단위` 절을 기준으로 판단한다. 운영 DB에는 적용하지 않았다.

## 확인한 원본 구조와 위험

| 근거 | 현재 구조 | 개선 방향 |
|---|---|---|
| `supabase/schema.sql`: `core.user_profiles`, `core.user_roles` | profile.id는 auth.users.id FK이고 조직·활성 상태를 가진다. 역할과 조직도 별도 저장한다. | UUID는 Auth ID로 해석하되 새 권한 체계와의 명시적 조직 일치 검증이 필요하다. |
| 같은 파일: `finance.expense_resolutions` | text 원본 ID, nullable organization_id, author_label/current_approver_label, 한국어 상태, resolution_data JSON. 작성자·결재자 Auth UUID는 없다. | 기존 원본 ID와 표시 이름을 유지하면서 별도 권한 binding 추가. |
| `expense-resolution-repository.ts`: `upsertExpenseResolutionInSupabase` | compliance settings 첫 행 조직 선택, 헤더 저장 후 증빙/계정배분/항목 삭제·재삽입, 상세거래 순번 이동과 upsert가 여러 요청이다. | 조직은 검증된 로그인에서만 가져오고 전체를 단일 RPC 트랜잭션으로 저장. |
| 같은 파일: `updateExpenseResolutionWorkflowInSupabase` | ID + approval_status + current_approver_label로 낙관적 갱신. 전체 매핑 헤더를 update한다. | 조직 + 원본 + version + UUID 결재 단계 조건으로 제한된 승인 필드만 변경. |
| `20260717094035_approval_workflow.sql`: `approval.approval_steps` | approver_id는 profile FK지만 create_document는 label만 기록한다. decide_document는 label로 승인 권한을 확인한다. | 기안 단계 UUID 연결도 별도 이전 대상. 지출결의와 기안 문서를 같은 승인 객체로 합치지 않는다. |
| 같은 migration: `approval.create_document` | 첫 활성 조직 선택, caller JSON drafterLabel 사용. | 기존 기안 경로의 보안 변경은 별도 범위로 분명히 추적하고 열린 label RPC 경로를 안전 경계로 보지 않는다. |
| `20260907125249_fund_workflow.sql`: `workflow_actor` | reimbursement_members의 조직/Auth UUID/활성/권한을 확인한다. | 새 RPC actor 검증에 재사용한다. ADMIN 권한이 다른 사용자의 승인 서명을 대신하지는 않는다. |

## 신규 구조 제안

원본 테이블을 복제하지 않고 `finance.expense_authorization_bindings`를 추가한다. 키는 resolution_id(text), 필드는 organization_id, author_user_id(Auth UUID), binding_status(UNBOUND/BOUND), lock_version, bound_by, bound_at, binding_reason이다. 조직+원본의 일치를 RPC와 FK/트리거로 강제한다. 신규 작성은 현재 로그인 UUID와 조직을 지정한다. 기존 기록은 자동 backfill하지 않는다. 특히 같은 이름, 이메일 추정, 첫 사용자/첫 조합을 이용한 연결을 금지한다.

결재선은 `expense_authorization_steps`에 원본·승인 회차·순번·approver_user_id·표시 이름 snapshot·상태·acted_by·acted_at·comment를 저장한다. 한 회차에서 순번은 유일하고 활성 PENDING은 한 단계만 허용한다. 반려 후 재상신은 새 회차로 만들어 이전 승인 증거를 남긴다. 기존 JSON 결재선/이력은 화면 호환 자료로 보존하되 권한 판정의 근거로 사용하지 않는다.

기존 승인 완료/지급 완료 문서에는 UUID 미연결을 이유로 상태를 되돌리거나 결재 이력을 새로 만들지 않는다. 미연결 자료는 기존 조회·출력 가능, 승인·수정 등 당사자 권한에 의존하는 실행만 제한한다. 관리자 연결 화면은 원본과 실제 사용자 후보를 나란히 보여주고 명시적 선택·근거를 남긴다. 조직이 null인 원본의 귀속 역시 명시적 관리자 확인 대상으로 분리한다. 그 귀속 변경은 기존 통합 원본과의 충돌을 검증하고 임의 조합 할당을 하지 않는다.

## RPC와 상태 전환 계약

서비스 전용 `expense_authorization_command(p_org,p_actor,p_command,p_data,p_key)`를 제안한다. 서버가 검증한 조직/actor만 전달하고 공개 역할의 execute를 revoke한다. 예상 버전과 입력 해시, 조직+처리키의 유일성을 가진 operation 결과 및 append-only audit를 저장한다. 동일 actor/명령/input의 같은 키는 최초 결과를 반환하며 다른 내용으로 재사용하면 거절한다.

| 명령 | 전제 | 결과 |
|---|---|---|
| BIND_LEGACY | ADMIN, 같은 조직의 명시적 사용자 선택, 사유, expected version | UUID 연결과 감사만 변경. 원본 금액·지급·완료 이력 보존 |
| DRAFT_SAVE | 신규 로그인 작성자 또는 연결된 작성자, 작성중/반려 등 허용 상태 | 헤더·항목·계정배분·증빙 참조·소액 상세를 원자적으로 저장 |
| SUBMIT | 연결된 작성자, 활성 조직 구성원으로 연결된 결재선, 현재 버전 | 승인대기 + 첫 단계 PENDING |
| APPROVE | 현재 PENDING 단계의 정확한 Auth UUID, 활성 같은 조직, 현재 버전 | 다음 단계 PENDING 또는 최종 승인완료 |
| REJECT | 현재 PENDING UUID, 사유, 현재 버전 | 반려, 현재 단계 반려 기록, 회차 종료 |

승인 입력으로 client 전체 resolution JSON을 받아 덮어쓰지 않는다. 승인 RPC는 잠근 기존 원본에서 필요한 상태·현재 결재자·이력만 계산한다. 지급/전표/금액/계좌/증빙 필드가 승인 명령에 들어오면 거절한다. ADMIN의 타인 대결, 자기 결재, 위임, 다중 동시 결재는 기존 이름 기반 동작으로 추정하지 않고 별도 정책이 확정될 때까지 지원하지 않는다. 일반 결재자에게 전역 APPROVE 역할을 추가해야 하는지는 정책 확인 사항이며, 최소 권한은 활성 membership + 문서에 지정된 정확한 UUID이다.

원자적 저장은 헤더 잠금 후 모든 자식의 원본 소속을 확인한다. 기존 ID를 유지하며 상세 삭제는 현행 soft-delete 의미를 보존한다. 증빙 메타데이터 교체가 Storage 파일 삭제를 의미하지 않으며 업로드된 파일을 RPC 실패 시 자동 삭제하지 않는다. 외부 참조가 있는 자식의 무조건 delete/reinsert를 피하고 필요한 차이를 적용한다. 자식 합계·배분 합계·원본 총액을 같은 트랜잭션에서 검증한다. 예: 항목 60,000 + 40,000 = 총액 100,000, 계정배분 70,000 + 30,000 = 100,000. 배분 99,000 또는 다른 원본 항목 ID가 섞이면 헤더 변경까지 전부 롤백한다.

## 기존 통제 보존과 잠금

다음 트리거를 비활성화하거나 bypass 설정을 추가하지 않는다.

- `finance_guard_expense_governance`: 승인 기안 필요 여부·기안 승인액·생략 사유 검증.
- `aaa_unified_budget_source` / `budget_guard_source`: 마감 월 원본 변경 금지, 실제 지급 전 배정 검증. 승인 상태 변화도 원본 변경이므로 마감 예외는 새 RPC에서 우회하지 않는다.
- `workflow_legacy_guard`: 통합 실제 지급 연결 이후 legacy 금액/지급 상태 변경 방지.
- `accounting_resolution_guard` 및 `accounting_legacy_check`: 통합 전표 연결 이후 legacy 전표 상태 변경 차단.
- `legacy_settlement_source_guard`: 선지급 정산 원본 연결 규칙.
- `approval_sync_expense_execution`, `approval_sync_contract_payment`: 실제 지급 관련 트리거 보존. 승인 RPC는 지급 필드를 SET하지 않아서 불필요한 동기화를 유발하지 않는다.

기존 budget advisory key 0과 workflow key 739가 공존한다. 신규 RPC의 잠금 순서는 기존 경로의 실제 획득 순서를 확인하여 일관되게 정하고, 조직 advisory lock을 원본 row lock보다 먼저 얻는다. 양쪽 잠금을 쓰는 변경은 동시 예산·통합 연결 테스트로 deadlock을 검증한다. 신규 binding이 있는 원본을 옛 service-role 직접 UPDATE가 우회하지 못하도록 DB guard가 필요하다. 단순 custom GUC 하나만으로 인증을 대신하지 않으며, RPC 소유 경로/권한·일회 명령 문맥을 함께 설계한다. 이 guard 때문에 기존 연결기안 생성 경로가 깨지지 않도록 생성/상태 변경 경로를 inventory 후 한 번에 전환한다.

## 단계별 완료 기준

1. UUID binding과 조직 조회: 기존 문서 수·ID·금액·파일 참조 fingerprint 불변. 동명이인·조직 밖 UUID·비활성 UUID·null 조직의 임의 연결 거절. 미연결 조회/출력 유지.
2. 초안 원자 저장: 헤더+모든 자식 재조회 일치. 중간 항목/증빙 오류가 전체 롤백. 다른 원본 자식 ID 탈취 거절. 동시 저장 한 건만 성공, 동일 키 재시도 한 결과.
3. 승인 원자 전환: label이 같은 다른 UUID 거절, 현재 단계 외 사용자 거절, 클라이언트 금액 위조 거절, 승인/반려 경쟁 한 건만 실행. 최종 단계만 승인완료. 부작용 실패 시 상태·이력·다음 단계 전부 롤백.
4. legacy 우회 차단과 통합 회귀: 기존 직접 service writes, 공개 RPC, 타 조직 ID, 미연결 이름 경로 실행 거절. 마감/통합 지급/회계/기안 통제 기존 테스트 통과.

`scripts/test-finance-workflow.mjs`는 로컬 PostgreSQL 16 전용 컨테이너에서 schema + 정렬된 전체 migration을 시작 시 snapshot으로 적용한다. 현재 11개 SQL suite와 지급·신탁·회계·선지급 실제 두 세션 경쟁을 실행한다. 새 `legacy_expense_authorization.sql`을 추가하고 승인/초안 저장 경쟁도 별도 두 세션으로 검증한다. 기존 11개 목록과 Storage 접근 검증을 유지한다. 운영 데이터·원격 URL·환경 비밀값을 읽지 않는 runner 경계를 유지한다.

## 구현 계약 확정 및 로컬 검증 단위

조사 후 루트와 합의하여 `20260908041709_legacy_expense_authorization.sql`을 CLI로 생성했다. 위 신규 구조의 회차별 step 별도 테이블 대신 초기 단계에서는 binding.steps JSON에 `{order,approver_user_id,legacy_step}`을 저장한다. order는 기존 배열의 1-based 순번이고 legacy_step은 status/processedAt을 제외한 명시적 원본 단계 snapshot이다. 기존 완료 이력은 지출결의 JSON에 보존하며 자동 UUID 매핑하지 않는다. 회차별 독립 승인 테이블과 위임 정책은 후속 범위다.

최종 RPC는 `finance.legacy_expense_command(p_org uuid,p_actor uuid,p_command text,p_id text,p_expected jsonb,p_payload jsonb,p_key text)`이다. p_expected는 기존 resolution_data 전체이며 신규만 null이다. SAVE payload는 row/items/allocations/evidence/details, BIND는 author_user_id/steps/reason/expected_binding_version, APPROVAL은 command(REQUEST/APPROVE/REJECT/CANCEL)/after, DELETE는 reason을 받는다. 반환값은 저장 resolution_data이며 BIND만 binding row이다. 부가 expected_binding_version이 있으면 함께 검사하고 BIND에는 필수다.

기존 역사 author와 history는 초안 저장에서 덮어쓰지 않는다. 신규 author는 검증된 표시 이름, 신규 history는 빈 배열로 기록하고 실제 Auth actor는 감사 로그에 남긴다. 지정 가능한 결재자는 같은 조직 활성 ADMIN/APPROVE/PAY 멤버이다. 승인 시 JSON 허용 필드 외 차이는 거절하고 결재선 순번·현재 UUID·후속 상태·기존 지급/정산 산식을 검증한다. BANK_POST_APPROVAL의 실제 날짜는 기존 실제사용일 외 임의 변경을 거절한다. 시간대 없는 기존 한국 시각은 RPC의 트랜잭션 로컬 Asia/Seoul 설정으로 해석한다.

은행·카드의 기존 연결/검토 상태 변경도 SAVE/최종 승인/DELETE와 같은 트랜잭션에 들어간다. 같은 조직과 타 원본 연결 충돌을 검증하고 실제 지급을 새로 만들지 않는다. bound 원본의 작성자·승인·금액 및 자식 변경은 전용 RPC 문맥이 필요하며 기존 통합 지급·전표 가드는 그대로 유지한다. OCR jobs에는 nullable organization_id/created_by, 기존 지출 감사에는 nullable actor_id를 추가하며 과거 행을 추정 backfill하지 않는다.

새 격리 SQL suite는 초안 작성·재조회·원자 롤백·동명이인 거절·결재선 미연결 제한·BIND 보존·위조 금액·CAS·자식 ID 탈취·합계·soft delete·공개 역할·은행카드 연결·직접 저장 우회를 검증한다. runner에 실제 두 세션 동시 승인과 동일 키 재시도 검증을 추가했다. 최종 전체 회귀 결과는 작업 보고와 통합 검증 문서에서 별도로 확정한다. 운영 DB migration 및 운영 배포는 수행하지 않았다.

추가 호환 검토로 연결된 작성자 또는 ADMIN이 승인대기 문서를 수정하면 작성중으로 되돌리고 결재 단계 상태/처리일을 초기화하도록 했다. 기존 승인 이력은 보존하며 다시 승인요청해야 한다. 이미 승인·지급·정산 완료된 기록을 초안으로 되돌리는 것은 허용하지 않는다. 신규 완료일/전표 결과와 기존 JSON·typed 실제 지급/정산 날짜의 위조도 거절한다.

기존 사실확인서가 원본 저장 뒤 상세 연결에서 실패하지 않도록 FACT_SAVE/FACT_DELETE도 동일 RPC에 포함한다. payload는 `{input,expected_binding_version}`이며 input은 기존 사실확인 입력과 resolutionId를 사용하고 결과는 `{id}`이다. 기존 revision 보존→새 revision→상세 연결과 삭제→상세 해제를 원자 처리하며 확인서 작성자는 검증된 로그인 표시 이름을 쓴다. 원본 resolution_data/금액은 바꾸지 않고 binding.version과 UUID 감사만 증가한다. 서명/확인자 정책은 미정이므로 confirmerLabel/confirmedAt/electronicConfirmation 입력과 이미 서명된 확인서의 초안 수정은 제한한다.
