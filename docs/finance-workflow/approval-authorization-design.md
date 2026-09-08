# 기안 문서 UUID 승인과 원자 처리

2026-09-08. `approval.documents`와 기존 결재 단계·항목·예약·감사를 재사용한다. 기존 지출결의의 결재와 기안 결재를 합치지 않는다.

기존 `create_document`는 첫 활성 조직을 선택하고, `decide_document`/`resubmit_document`는 표시 이름을 비교했다. 새 서버 전용 `approval.document_command(org, actor, command, id, expected_version, payload, key)`는 현재 조직 멤버의 Auth UUID를 확인하며 이름을 권한 판정에 쓰지 않는다. CREATE는 항상 DRAFT이고, 작성자는 검증된 로그인 사용자다. 기존 이름 기반 CREATE/결재/수정/재상신/취소 RPC는 서비스 역할에서도 안내 오류를 반환한다. 의결·계약·지출 연결 함수는 기존 서비스 실행을 보존하되 public/anon/authenticated 실행을 철회한다. 이들 별도 실행의 서버 권한 검증은 루트 구현 범위다.

`document_authorization_bindings`에는 document_id, organization_id, drafter_user_id, steps, version, bound_by/at/reason을 저장한다. steps는 `{order,user_id,legacy_step:{step_id,approver_label,approver_role}}`이다. 기존 조직이 명시된 문서에는 version=1, drafter_user_id=null, steps=[]인 빈 버전 행만 생성한다. 이는 자동 계정 매핑이 아니며 기존 문서·단계·항목·감사를 수정하지 않는다. 조직이 없는 문서는 임의 귀속하지 않는다. BIND는 관리자 명시 선택과 사유를 요구한다. 승인완료 문서에 계정을 연결해도 기존 approver_id/acted_at/승인 감사에 소급 서명하지 않는다.

문서/결재 단계/세부항목 변경은 버전을 증가시킨다. 한 명령이 여러 행을 바꾸면 버전이 여러 번 증가하므로 클라이언트는 반환 version을 사용한다. 조직 잠금(739), 원본 row 잠금, 예상 버전, 처리키와 actor/입력 해시로 동시 변경과 재시도를 제어한다. 조회나 BIND를 통해 표시되는 사용자 이름은 서명 결과가 아니다. 새 감사에는 기존 profile FK의 actor_id를 덮어쓰는 대신 Auth FK인 auth_actor_id를 추가한다.

| 명령 | 입력 | 결과/제한 |
|---|---|---|
| CREATE | document/steps/lines, 새 UUID, version0 | 작성자 자동 연결, 결재자 미연결 초안 |
| BIND | drafter_user_id, steps(order,user_id), reason | 관리자 명시 연결만, 기존 승인 결과 유지 |
| UPDATE | changes, 선택 lines | 미집행 DRAFT/REJECTED/REVISION_REQUESTED 수정 |
| SUBMIT | 빈 입력 | 작성자 UUID·전체 활성 결재자 연결 확인 후 상신 |
| RESUBMIT | changes, 선택 lines | 반려/보완 문서 수정·상신·단계 초기화 원자 처리 |
| APPROVE/REJECT/REVISION_REQUEST | comment | 현재 PENDING 단계의 정확한 UUID만 실행 |
| CLOSE | action WITHDRAWN/CANCELLED, reason | 기안자 회수/관리자 취소, 집행 연결이 있으면 제한 |

기존 최종 승인 시 예산 예약 정책을 유지하되, EXPENSE/CONTRACT의 예산 내 승인은 동일 조직/연도/예산항목이 실제 존재할 때만 예약한다. 없는 예산을 예약했다고 표시하지 않으며 전제가 충족되지 않으면 결재 단계와 감사까지 롤백한다. GENERAL/명시적 예산 외 문서는 예약하지 않는다. 예산 마감과 통합 예산 가드는 그대로 적용한다. 이미 지출·계약·전표나 사용된 예약이 연결된 기안은 원본 취소·중요 수정을 새 명령에서 제한하여 기존 집행 결과를 보존한다. 의결 결과/전자 서명/위임 정책은 별도 범위다.

CREATE는 기존 문서 내용과 서버가 계산한 의결 권고, 계약 시작/종료일·지급 조건·일정을 같은 트랜잭션에 저장한다. 기안 의결 완료값을 초안에 넣는 것은 거절한다. 신규 항목/결재선 실패는 헤더까지 롤백한다. 운영 DB에는 적용하지 않았으며 최종 검증 결과는 별도 작업 보고를 따른다.

## 원본 연결과 개발 구분

`approval.documents.id`를 원본으로 approval_steps/document_lines/attachments/audit_logs가 연결된다. 새로운 bindings와 operations는 이 ID를 참조한다. 계약·의결·지출결의 연결은 기존 ID를 유지하며, 기안 승인이 실제 지급이나 회계 전표를 생성하지 않는다. Storage 첨부는 기존 저장소와 경로를 유지하고 읽기 전에 부모 문서의 조직 권한을 확인한다.

| 구분 | 범위 |
|---|---|
| 재사용 | 기안·결재선·항목·첨부·예산 예약·계약 및 의결 연결 |
| 신규 | Auth UUID 연결, 버전/처리키 명령, 관리자 연결 화면, UUID 기준 현재 결재자 조회 |
| 정책 확인 | 실제 직원과 계정의 대응, 의결 결과·사실확인 서명, 회계/정산 확정 권한 |

계정 미연결 문서는 열람을 유지하고 해당 상신·결재 실행만 제한한다. 과거 문서의 표시 이름으로 계정을 추측하지 않는다. 별도 계약/의결/지출 연결 서버 경로는 같은 조직의 관리자만 실행하도록 제한한다. 이 경로 전체를 새 기안 명령으로 재구현하거나 Storage와 DB를 하나의 트랜잭션으로 만든 것은 아니다.

## 금액 예제

공급가액 90,000원과 부가세 10,000원이면 항목 합계 및 기안 총액은 100,000원이다. 총액을 110,000원으로만 바꾸면 항목과 불일치하므로 거절한다. 예산 내 지출 기안의 최종 승인 시 같은 조직/연도/항목에 100,000원을 예약한다. 실제 지급액은 이 승인으로 늘어나지 않는다. 연결 집행이 없는 허용 상태에서 취소하면 예약을 해제하고, 이미 집행이 연결된 기안을 취소해 지급 사실을 지우지 않는다.

## URL·메뉴 대응

| 기존 URL | 변경 후 역할 |
|---|---|
| /approval | 동일 목록, 본인/결재 가능 여부는 UUID 판정 |
| /approval/new | 동일 작성기, 현재 계정의 초안 저장 |
| /approval/[id] | 동일 원본 상세, 상신·결재·수정·회수 명령 |
| /approval/small-expense | 기존 소액경비 유지, 조직·실제 사용자 검증 |
| 신규 /approval/authorizations | 관리자의 명시적 기안자·단계별 계정 연결 |
| /finance/expense-authorizations | 기존 지출결의 계정 연결, 기안과 별도 유지 |

사이드바의 업무 분류를 더 늘리지 않고 기안 목록에서 관리자 연결 화면으로 진입한다. 과거 URL은 삭제하지 않는다.

## SQL 검증 결과

격리 PostgreSQL 전체 13개 suite와 실제 여러 세션의 중복·동시 실행을 통과했다. 이후 추가한 상신 필수값, 수정 후 양수 금액, NaN 거절, 이전 결재 단계 완료, 결재자 PAY 권한 제외는 최종 기안 focused suite와 모든 동시성/재시도/DB 역할 검사로 다시 검증했다. 작성자 PAY 권한은 유지한다. 같은 키의 재시도는 결정·감사를 추가하지 않으며 다른 키의 동시 승인은 한 건만 성공한다. GENERAL/예산 외 문서는 예약 0을 예약완료로 표시하지 않고, 계약조건·기간·분할일정은 기존 계약 생성에도 보존된다.
