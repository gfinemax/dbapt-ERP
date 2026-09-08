# 업무현황의 추가 실제 조회 원천

`finance.finance_task_sources(p_org,p_actor)`는 기존 데이터에서 읽기만 하는 RPC다. 서버 `loadFinanceTaskSources()`가 검증된 로그인 조직·사용자 UUID를 전달한다. public/anon/authenticated 직접 실행은 금지하며 서비스 서버에서만 호출한다. 반환은 id/kind/title/detail/href 다섯 필드다.

| kind | 원천과 필터 | 권한·한계 |
|---|---|---|
| MY_APPROVAL | approval.approval_steps.approver_id = 로그인 UUID, PENDING, 같은 조직의 삭제되지 않은 SUBMITTED/IN_REVIEW 문서, 앞 순서 모두 APPROVED/SKIPPED | 일반 활성 사용자도 정확히 본인에게 지정된 기안만 조회. null approver_id나 같은 표시이름으로 추정하지 않는다 |
| SETTLEMENT_OVERDUE | typed settlement_due_date가 한국 현재일 이전, 승인완료된 ADVANCE+EMPLOYEE_ADVANCE, 부분/완료 지급과 양수 actual_paid_amount, 원본 또는 승인된 연결 정산결의가 정산완료가 아님 | 재무 직원 역할만 조직 전체 조회. 지급액 미확인 자료는 수령을 추정하지 않으며 별도 지급근거 확인 대상. 실제 자금 균형의 최종 정산 완료를 새로 판정하지 않는다 |
| EVIDENCE_REVIEW | 같은 조직의 삭제되지 않고 반려되지 않은 결의 중 evidence_status NONE/DEFICIENT | 재무 직원 역할만. 개인 대납의 증빙 누락 상태를 임의 생성하지 않는다 |
| BANK_UNMATCHED | 실제 조직 은행 거래 중 workflow_bank_available, workflow 지급 미연결 | 재무 직원 역할만. 기존 결의·간편지출·대납·통합 이체의 연결 제외를 기존 공용 함수로 재사용. 통합 지급 연결도 제외. 200개 한도 없이 전 범위 조회 |
| TRUST_READY | TRUST_DIRECT + VERIFIED 계약, 미확인/기존완료 지급 아님, 원본 최신 signature와 can_pay=true, requestable>0 | 재무 직원 역할만. 요청 준비 검토이며 계약 필수첨부·제출조건 완료를 보장하지 않는다. 원본 한 건 조회 실패는 해당 항목만 제외 |

재무 직원 역할은 기존 ADMIN/APPROVE/PAY/CLOSE/SENIOR다. 옛 결의의 작성자/정산담당자가 표시 문자열인 경우 UUID 소유권으로 해석하지 않으므로 일반 사용자의 조직 전체 지출 조회를 허용하지 않는다. 은행 항목은 날짜와 입출금 확인 종류만 표시하고 원본 적요·계좌번호·상대방 이름을 DTO로 전달하지 않는다.

지출 원본 링크는 실제 `/finance/expenses?source_kind=RESOLUTION&source_id=...`를 사용한다. 기안은 `/approval/[id]`, 은행은 기존 매칭 화면으로 이동한다. 이 RPC가 목록을 제공한다고 기존 화면의 승인 mutation 안전성이 개선되는 것은 아니다.

기존 `/finance/approval-inbox`는 지출결의 목록과 label 기반 승인 흐름을 사용한다. `src/app/finance/expense-resolutions/actions.ts`에는 고정 currentUserLabel 및 input.actorLabel 기반 승인자/역할 판단이 남아 있다. 별도의 검증된 UUID 권한·조직·감사 연결 정비가 필요하며, 이번 읽기 전용 작업에서 승인 mutation은 변경하지 않았다. 새 MY_APPROVAL은 기안 approval_steps의 UUID 지정 자료에 한정되고 기존 label 결의를 대신 집계하지 않는다.

검증: SQL에서 같은 이름/null UUID 제외, 다른 조직/비활성 거절, 앞 결재 미완료 제외, 일반 사용자 제한, 담당자 선지급만 기한 경과, 완료 후 재조회 제외, 실제 은행 205개 중 지급 연결 1개를 뺀 204개 조회, 민감정보 미반환, authenticated RPC 실행 금지를 확인했다. repository 테스트는 검증된 identity 사용·재조회·오류 보존·최소 DTO·외부 href 차단을 확인한다. 운영 변경 없이 격리 PostgreSQL에서 검증했다.
