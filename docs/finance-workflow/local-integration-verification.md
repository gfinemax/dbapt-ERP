# 격리 통합 검증 — 2026-09-08

운영 데이터 대신 별도 로컬 Supabase의 실제 Auth·REST·Storage와 Next 개발 서버를 사용했다. 운영 적용 완료를 뜻하지 않는다.

## 환경과 재현 자료

- Supabase 프로젝트: `dbapt-finance-e2e-20260908-a7c1`, API `http://127.0.0.1:56321`, DB 포트 `56322`.
- Next: `http://127.0.0.1:56330`. 자식 프로세스 환경변수로 모든 Supabase URL·키를 로컬 값으로 덮어썼다. 원본 `.env.local`을 수정하지 않았다.
- 계정: `example.invalid` 가짜 관리자·조회자. 관리자 API로 생성하고 이메일을 보내지 않았다.
- 원본 `schema.sql`과 지급 업무 읽기 migration까지 적용하고, 아래 계약 수정 migration을 추가 적용했다. 진행 중 회계 migration은 적용하지 않았다.
- 재현 보조 파일은 Git 제외 경로 `.tmp-repos/finance-e2e-local/`에 있다: `prepare-local.mjs`, `apply-local.mjs`, `seed-local.mjs`, `start-next.mjs`, `verify-storage.mjs`, `verify-trust-api.mjs`, `verify-permissions.mjs`, `verify-payment-api.mjs`. 일부는 생성한 fixture를 전제로 하는 순차 검증 파일이다. 운영 환경에서 실행하지 않는다.
- 인증키·비밀번호·세션은 위 제외 경로의 private 파일에만 저장했다. 로그·문서에 인증값을 포함하지 않는다.

## 확인한 결과

| 대상 | 실제 검증 | 결과 |
| --- | --- | --- |
| 로그인 | 브라우저 로그인 후 실제 Auth 사용자와 조합 역할로 신탁·설정 화면 조회 | 통과 |
| 계약 초안 | 브라우저로 미확정 계약 생성, 원본 PDF 첨부, 이후 페이지 재조회 | 통과 |
| Storage | 브라우저 업로드→메타데이터 1건→원본과 다운로드 바이트·SHA-256 일치 | 통과 |
| 파일 열기 | UI 다운로드 준비 후 1분 유효 링크 표시, 실제 서명 URL 200과 원본 바이트 일치 | 통과 |
| 접근 통제 | 익명·인증된 조회자 Storage 직접 다운로드 거부, 직접 테이블/RPC 접근 거부, 서버 RPC의 조회자 계약 수정 거부 | 통과 |
| 기존 지출 연결 | 브라우저에서 승인된 가짜 지출결의 원본을 연결 | 통과 |
| 신탁 초안 | 브라우저에서 600원 항목 초안 저장 후 새로고침, 목록 1건·원래 금액 유지 | 통과 |
| 계약 확정·제출 | 실제 REST로 계약 조건 수정/확정, 경로 적용, 1,000원 요청 제출 | 통과 |
| 중복 요청 | 동일 제출 처리키를 두 번 호출한 뒤 제출 원본 1건 확인 | 통과 |
| 부분 승인·지급 | 실제 REST와 DB에서 1,000원 지출 중 신탁 승인 600원, 지급 300원, 같은 배분키 재시도 후 배분 1건 확인 | 통과 |
| 지급 재조회 | 브라우저에서 누적 지급 300원·미지급 700원·추가 지급 가능 300원·부분지급 1건 표시 확인 | 통과 |
| 지급 필터 | 부분지급 버튼 클릭 후 `?tab=PARTIAL` 이동 확인 | 통과 |

부분 승인과 실제 지급 배분은 이 검증에서 REST를 통해 입력했다. 해당 단계의 브라우저 입력 전체를 통과했다고 표현하지 않는다. 보완·재제출·철회는 실제 로컬 DB에서 `trust_request_versions.sql`로 검증했으며, 각각의 브라우저 조작 전체는 별도 확인 대상이다.

## 발견·수정한 결함

기존 계약 초안을 수정할 때 `trust_command`의 지역 변수 `conditions`와 테이블의 같은 이름 컬럼이 충돌하여 PostgreSQL이 `column reference "conditions" is ambiguous` 오류를 반환했다. 최초 생성만 확인하면 발견되지 않는 수정 경로 결함이었다.

`20260908030647_trust_contract_condition_update.sql`에서 지역 변수를 `v_conditions`로 분리했다. 기존 컬럼명·JSON 키·저장 계약·권한·동시성 규칙을 유지한다. 실제 로컬 Supabase에 적용한 후 REST 수정·확정·제출에 성공했다.

`supabase/tests/trust_request_versions.sql`에는 기존 초안 조건 변경 저장·재조회, 동일 키 재시도, 오래된 버전 수정 거부, 감사 이벤트 중복 방지 회귀를 추가했다. 실제 Supabase PostgreSQL에서 기존 시나리오와 새 회귀 DO 블록 모두 통과했다.

## 화면 캡처

로컬 머신의 검증 이미지이며 저장소에 인증 자료를 포함하지 않는다.

- 초안 입력: `C:/Users/finemax/.agent-browser/tmp/screenshots/screenshot-1788836429519.png`
- 신탁 초안 저장 후 재조회: `C:/Users/finemax/.agent-browser/tmp/screenshots/screenshot-1788836762842.png`
- 부분 지급 재조회: `C:/Users/finemax/.agent-browser/tmp/screenshots/screenshot-1788836982249.png`

## 운영 적용과 남은 확인

운영 Supabase에 migration을 적용하거나 운영 승인·송금·신탁 제출·메일 발송을 하지 않았다. 운영 데이터·첨부 보존 검증과 실제 배포 확인은 별도 단계다. 회계 연결, 환급/선지급 연계, 전체 공통 메뉴 개편은 이 검증의 완료 범위에 포함되지 않는다.
