# Design QA — 간편 기안 작성

- source visual truth: 사용자 제공 대화 첨부 화면 (`1763 × 1198`, 데스크톱)
- implementation screenshot: `approval-new-final.png` (`1440 × 1000`, CSS viewport `1440 × 1000`, device scale 1)
- responsive screenshot: `approval-new-mobile.png` (`390 × 844`, CSS viewport `390 × 844`, device scale 1)
- state: 지출품의, 내용·금액·거래처 입력 후 자동 추천 적용
- density normalization: 두 화면 모두 CSS 픽셀 기준으로 비교했으며, 원본과 구현의 viewport 폭 차이는 반응형 레이아웃 차이로 취급함

## Full-view comparison evidence

- 원본의 넓고 긴 단일 카드 구조를, 합의한 작성 영역과 우측 검토 패널의 2단 구조로 변경했다.
- 원본에서 아래로 밀리던 자동 설정과 결재선은 우측에 고정되어 작성 중에도 확인할 수 있다.
- 제목·내용·금액·거래처·첨부·예산 선택은 첫 화면에 유지되어 기존 입력 순서를 보존한다.
- 기존 색상 토큰, 둥근 카드, 입력 필드 및 타이포그래피를 그대로 사용해 ERP 전체 디자인과 일관성을 유지한다.

## Focused region comparison evidence

- 기본 내용 영역: 필드 간격과 2열 정렬, 내용 입력 높이, 추천 CTA의 활성/비활성 상태를 확인했다.
- 우측 검토 영역: 5개 필수 항목 상태, 추천 제목, 회계 추천 근거, 자동 설정, 고정 작업 버튼을 확인했다.
- 모바일: 390px에서 단일 열로 재배치되고 수평 오버플로가 없음을 확인했다.

## Required fidelity surfaces

- fonts and typography: 기존 앱의 글꼴·굵기 토큰을 재사용하며 제목, 필드 라벨, 보조 문구의 위계가 명확하다.
- spacing and layout rhythm: 20px 섹션 간격과 16–20px 카드 내부 여백을 유지하고 데스크톱 2단/모바일 1단으로 재배치한다.
- colors and visual tokens: 기존 CSS 변수와 의미색을 사용하며 완료/확인 필요 상태의 대비가 충분하다.
- image quality and assets: 이 화면에는 비교 대상 이미지 자산이 없으며 기존 아이콘 체계를 변경하지 않았다.
- copy and content: 사용자가 확인 후 적용한다는 안내, 추천 근거, 자동 저장 상태, 상신 준비도를 한국어로 명확히 표시한다.

## Primary interactions tested

- 기안 유형을 지출품의로 변경
- 내용·금액·거래처 입력
- 자동 추천 실행 및 제목 적용 확인
- 상신 준비도 5/5와 결재 요청 활성화 확인
- 자동 저장 후 새로고침 및 이전 기안 복원 확인
- 브라우저 콘솔 오류 없음

## Findings

- P0/P1/P2 없음.
- P3: 실제 예산·계정과목 데이터가 없는 개발 환경에서는 추천 신뢰도가 `보통`으로 표시된다. 운영 데이터가 연결되면 등록 목록 안에서만 후보를 적용한다.

## Comparison history

- 첫 검증에서 금액 제거 후 `메가커피에서 에 구매`라는 조사 중복을 발견했다.
- 금액 제거 후 조사 정리 규칙을 추가했다.
- 동일 입력으로 재검증하여 `운영위원회 회의용 음료 8잔을 메가커피에서 구매`로 정상 생성됨을 확인했다.

final result: passed
