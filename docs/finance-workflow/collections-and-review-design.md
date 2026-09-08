# 수납·환급 원장과 검토 화면 조사

2026-09-08 현재 저장소 코드만 읽어 확인했다. 운영 API/DB 요청, 환경값 조회, 데이터 수정은 하지 않았다. 아래 미커밋 초안은 완성된 통합 원장으로 간주하지 않는다.

## 초안 화면별 실제 데이터와 범위

| URL / 코드 | 실제 데이터 원천 | 현재 가능한 일 | 통합 개편과의 차이 |
|---|---|---|---|
| `/finance/collections` → `FinanceReviewPage(collections)` | 없음. `loadFinanceReview`가 항상 `rows:[],count:0` 반환 | 연결 미설정 안내와 조합원/계좌거래 링크 | 수납 0건이라는 원장 조회 결과가 아니다. UI는 숫자 표를 숨기지만 repository 결과 자체는 미연결과 실제 빈 원장을 구별하지 못함 |
| `/finance/refunds` | 조직의 `bank_transactions.resolution_status='REFUND_TARGET'` | 실제 분류된 거래의 날짜·적요·금액 목록 | 환급 대상자 ID, 원수납 ID, 환급 결정, 승인액, 집행액, 지급 잔액, 취소/회수 연결 없음. 환급 원장이 아니라 검토 대상 거래 목록 |
| `/finance/evidence` | `expense_resolution_evidence`와 삭제되지 않은 부모 `expense_resolutions` 조직 join | 원본 파일 목록, 전체 건수, 50개 페이지, 부모 조직 확인 후 60초 서명 다운로드 | 개인 대납 증빙·신탁 workflow 파일·간편지출·기타 원장 증빙을 통합하지 않음. 원 결의로 이동 링크도 별도 필요 |
| `/finance/tax-documents` | 위 증빙 중 `evidence_type` 한글 4개 분류 | 등록된 계산서 파일 조회 | 발행/국세청 상태/승인번호/공급자 고유 ID/취소·수정세금계산서 연결/공제 판단 원장이 아님. OCR 분류만으로 회계 확정하면 안 됨 |
| `/finance/month-close` | 선택월 `expense_resolutions.accounting_date`와 전표 미확정 또는 증빙 미비 조건 | 지출결의 확인 링크와 개인 경비 마감 링크 | 원장 전체 마감이 아님. 회계일 null 건 제외, 연결 회계 초안·은행 미배분·신탁 미해결·대납·선지급·수납·환급 점검 미포함. 기간 잠금/재개방 실행 없음 |

공통 코드: `src/features/finance/finance-review-repository.ts`, `finance-review-page.tsx`, 해당 `src/app/finance/*/page.tsx`. 모두 현재 ADMIN만 조직 전체 조회를 허용하며 오류는 빈 배열로 바꾸지 않고 표시한다(미연결 collections의 고정 빈 결과 제외). ADMIN 제한을 임의로 다른 역할에 확대하지 않는다.

환급 검토 금액은 현재 `Number(withdrawal_amount) || Number(deposit_amount)`로 한 칸 표시한다. 입금/출금 방향이 없어 환급 지급과 환급 검토 대상 입금을 혼동할 수 있다. 신규 표시에서는 실제 방향과 두 금액을 보존하고 검토 분류를 지급 완료로 해석하지 않는다. `REFUND_TARGET`는 schema/migration의 허용 상태와 이 조회 외에 현재 `src`에서 이를 기록하는 업무 action이 검색되지 않았다.

## PeopleON 연결 조사

현재 확인된 adapter는 **조합원 목록 조회** 하나다.

- `src/lib/peopleon/members-table.ts`: API key를 서버 요청 헤더에 담아 members/table endpoint를 `no-store`로 조회. 검색·페이지·정렬·role/tier/status 등의 조건을 전달한다. 실제 납부 배분·부과 회차·환급 원본 endpoint adapter는 현재 저장소 검색에서 발견하지 못했다.
- 반환 `Member`는 성명, 조합원 번호, 연락처, 상태, 최근 납부 표시 문자열 등 화면 DTO다. `recentPayment.amount`는 문자열이며 원장 합산용 금액 자료가 아니다. 납부상태가 없으면 `미납`, 통합상태가 없으면 `정상`으로 대체되므로 재무 판단 원천으로 사용할 수 없다.
- `mapPeopleOnMemberRow`는 `id/memberId/member_id`가 없으면 `memberNo`로 id를 대체한다. 번호도 없으면 `미지정`이 될 수 있다. 이 표시용 fallback ID를 회계 조합원 고유 ID로 저장하면 안 된다.
- `src/app/members/page.tsx`는 API 실패를 null로 바꾸고 `initialMembers`를 undefined로 전달한다. `member-list-page.tsx`의 기본값은 `member-data.ts` 샘플이다. 연결 실패가 실제 조합원 목록처럼 보일 수 있어 수납 대상 선택기에서 재사용하면 안 된다.
- `/members/[id]`는 외부 상세 조회가 아니다. `member-detail-page.tsx`는 로컬 `findMemberById`를 사용하며 찾지 못하면 기본 샘플 조합원을 표시한다. 외부 고유 ID 링크가 다른 사람의 샘플 상세로 열릴 수 있으므로 수납·환급 실행 근거로 삼지 않는다.
- 현재 `supabase/schema.sql`과 migrations에서 조합원별 부과·수납·환급을 저장하는 실체 원장 테이블을 찾지 못했다. `reimbursement_members`는 경비 사용자/권한 테이블이며 조합원 수납 원장이 아니다.
- `workflow_transactions.source_kind`의 COLLECTION/REFUND enum 허용은 adapter 구현 완료 증거가 아니다. 현재 `workflow_source`의 실제 조회 분기는 RESOLUTION/QUICK/PERSONAL이며 수납·환급 실행 연결은 별도 구현이 필요하다.

이는 현재 저장소 코드 조사 결과다. PeopleON 또는 별도 운영 원장에 실제 자료가 없다는 뜻은 아니다. 외부 API 스키마·권한·원장 책임 시스템은 별도로 확인해야 한다.

## 재사용·신규 개발·정책 확인

| 구분 | 항목 |
|---|---|
| 재사용 | 조직 인증·ADMIN 검토 접근, 실제 은행 거래 ID, 기존 증빙 파일·부모 ID 및 서명 다운로드, 분개 전표·workflow 실제 지급/회수 배분, 검토 페이지의 안정 정렬·오류 표시·페이지네이션 |
| 부분 재사용 | PeopleON 서버 인증·조회 패턴. 화면 Member DTO와 fallback 동작은 회계 bridge에서 제외. 지출결의 증빙 조회는 파일 원천별 권한을 유지하며 통합 가능 |
| 신규 개발 | 외부 원장 adapter의 엄격한 DTO, 고유 ID bridge, 부과·원수납·배분·환급 결정 연결, 동기화 결과/실패 표시, 미확정·확정 집계 분리, 부분 지급·회수 연결, 검토 월의 누락 날짜/미배분/초안 전체 조회 |
| 정책 확인 | 어떤 시스템이 수납 원장 원본인지, ERP가 조회만 하는지 원장 기록도 하는지, ID 조직 매핑, 부과항목·회차·승계·탈퇴 기준, 환급 공제/권리/승인 주체, 수납 취소와 환급 구분, 전표 계정·확정 권한, 전사 마감/재개방 권한 |

## 고유 ID bridge 제안

조회 가능한 외부 계약을 확인한 후 `(organization_id, source_system, external_member_id)`로 bridge를 만든다. 실제 원장에는 `external_assessment_id`, `external_receipt_id`, `external_allocation_id`, `external_refund_decision_id` 등 각각의 고유 ID와 원본 버전을 연결한다. 이름·전화·조합원 표시번호는 검토용 정보이며 자동 병합 키가 아니다.

고유 ID가 없는 행, 조직이 불분명한 행, 중복 외부 ID, 이미 다른 대상에 연결된 행은 별도 확인 대기다. 관리자의 연결 미리보기 → 명시적 선택 → 적용 이력을 제공한다. 외부 오류·빈 응답을 이유로 기존 bridge나 원장 행을 삭제하지 않는다. 연동 요청 시각·성공 시각·현재 원본 버전을 표시하고 개인정보는 화면 전달 전에 필요한 범위만 마스킹한다.

원장 연결 예시:

`조합원 bridge → 부과 항목/회차 → 원수납 → 수납 배분 → 환급 결정 → 승인 대상 → 실제 지급 배분`

하나의 입금이 여러 회차에 배분되거나 여러 번 입금되어 한 부과액을 채울 수 있다. 총수납은 실제 수납 원본을 한 번만 합산하고, 회차별 배분은 그 원금 한도 안에서 계산한다. 환급은 새 수납의 음수로 임의 생성하지 않고 원수납·결정·실제 출금과 연결한다. 계좌 간 이체는 수납이나 환급으로 합산하지 않는다.

## 단계별 안전한 구현 순서와 완료 기준

1. **검토 화면의 사실 표현 정리**: `connectionState=NOT_CONFIGURED/READY/ERROR` 등을 데이터 상태로 구별하고 미연결 count는 null로 표현한다. 환급은 입출금 방향이 있는 검토 목록으로 유지한다. 세금계산서는 등록 증빙 목록임을 유지한다. 오류·미연결을 0건 성공으로 표시하지 않는 테스트를 통과한다.
2. **기존 파일과 월 점검 재사용**: 증빙 원천별 ID·원본 이동·권한을 확인하고, 지출 회계일 미등록 건을 독립 항목으로 조회한다. 새 회계 연결 초안과 실제 미배분 지급은 각각 실제 원천에서 집계한다. 아직 전체 점검을 하지 못하면 월 마감 완료 상태를 제공하지 않는다. 파일 존재/해시를 확인한 뒤 원본 보존을 검증한다.
3. **외부 고유 ID 읽기 연동**: API 계약 확인 후 엄격한 서버 DTO와 테스트 fixture로 구현한다. 운영 읽기 검증에서는 최소 범위만 조회한다. 누락 ID 차단, 조직 격리, 페이지 경계·중복, 실패 시 기존 자료 유지, 샘플 fallback 없음이 완료 기준이다.
4. **bridge 저장·재조회**: 관리자 preview/apply, 버전 충돌, 동일 처리키 반복, 동일 외부 ID 동시 연결, 권한·조직 위조를 DB에서 검증한다. 원수납 자료를 새 실적으로 중복 생성하지 않는다.
5. **정책 의존 실행**: 부과/수납 배분/환급 결정·신탁·실제 지급 연결과 원장 정정을 구현한다. 부분 환급, 초과 지급/회수, 중복 입금, 이전 회차 정정, 마감월 충돌을 검증한다. 모든 분담금을 수익이나 모든 토지 관련 지급을 비용으로 자동 분개하지 않는다.

정책이 미확정이어도 1~2의 독립 검토 개선과 adapter 계약 조사·테스트를 계속할 수 있다. 실제 수납·환급 실행은 확인된 외부 원본과 정책이 확보된 경로에만 제공한다. 위 조사 당시에는 제품 코드나 운영 데이터를 변경하지 않았다.

## 후속 구현: 읽기 전용 검토 화면

2026-09-08 후속 구현에서 아래 범위를 개선했다. 운영 DB 변경·수납/환급 실행·마감 잠금은 수행하지 않았다.

- collections는 DB 요청 없이 `connection=NOT_CONFIGURED`, `count=null`을 반환한다. 미연결을 실제 0건으로 표현하지 않는다.
- refunds는 기존 REFUND_TARGET 거래를 조회하되 입금과 출금을 각각 표시한다. 검토 목록과 환급 원장 미연결 안내를 함께 유지한다.
- evidence는 RESOLUTION/PERSONAL/TRUST 원본 선택에 따라 각각 실제 결의 증빙, personal_reimbursements 증빙, workflow_files를 조회한다. 조직 조건·정렬·정확한 count·50개 페이지를 적용한다. 기존 결의 다운로드 URL을 유지하고 개인/신탁은 source query로 확장했다.
- 각 다운로드는 조직과 ADMIN 권한을 다시 검사한다. 결의는 기존 부모 조직 join과 고정 bucket 검사, 개인/신탁은 조직별 행과 고정 bucket·조직 경로 검사 후 60초 서명 URL을 반환한다. 저장소 경로를 목록 DTO로 내보내지 않는다.
- month-close는 선택월의 기존 전표·증빙 점검과 전체 기간의 회계일 미등록 점검을 구분한다. 공통 지출 원본 링크는 실제 지원되는 `/finance/expenses?source_kind=RESOLUTION&source_id=...`를 사용한다.
- 조회 폼과 페이지·다시 조회 링크는 원본 종류/회계월/점검범위를 보존한다. 인증 실패나 쿼리 오류를 정상 빈 원장으로 대체하지 않는다.

focused repository/UI/download route 23개 테스트를 통해 권한 차단, 조직 query, 원본별 페이지 범위·재조회, 저장경로 차단, 미연결과 0건 구별, 입출금 방향, 회계일 미등록 조회 및 정확한 원본 링크를 확인했다. 이는 실제 운영 Storage 파일의 존재/바이트 무결성 검사나 운영 브라우저 검증을 대체하지 않는다.

미완료 범위: 외부 수납/환급 원장 bridge와 실행, 전자세금계산서 발행/세무 원장, 전표·은행 미배분·신탁·선지급까지 합친 전체 월 마감, 간편지출 자체 증빙 통합, 역할별 세분화된 조직 전체 증빙 권한. 회계정책 확인 전 마감 확정·재개방 버튼은 제공하지 않는다.
