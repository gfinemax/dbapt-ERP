# Design QA — 지출결의서 A4 출력

- source visual truth: 사용자가 대화에 첨부한 기존 `지결-2026-0007` A4 출력 화면과 이후 확정한 간소화 구성
- implementation screenshot: `.next-dev/qa-artifacts/expense-resolution-print-a4-final.png`
- verification viewport: `1280 × 1500`, device scale 1
- document geometry: CSS `210mm × 297mm`, 미리보기 실측 `793.70 × 1122.51px`
- print margin: `@page` 상하좌우 `20mm`; 미리보기 내부 여백 실측 `75.59px`

## Full-view comparison evidence

- 기존의 중복된 날짜·상태·업무코드 표시는 제거하고 제목, 결재선, 핵심 정보, 금액, 세부 내역, 사유·증빙 순서로 정리했다.
- 결재선은 문서 상단 우측에 유지하고 본문은 좌우 정렬선과 섹션 간격을 일관되게 맞췄다.
- 하단 여백을 활용해 조합명, 책임 문구, 문서번호·출력일·페이지 정보를 한 줄의 문서 푸터로 구성했다.
- 한 장 안에서 정보가 겹치거나 잘리지 않으며 빈 공간이 하단 푸터와 균형을 이룬다.

## Focused region comparison evidence

- 핵심 결의정보: 결의서번호, 작성일, 건명, 거래처, 예산항목, 작성자, 지출일, 정산정보만 노출한다.
- 금액 요약: `총 지출액`과 `40,120원`을 강한 가로 구분선 사이에 배치했다.
- 세부 지출내역: `지출일 | 거래처 | 내역 | 공급가액 | 부가세 | 합계`의 6개 열로 단순화했다.
- 실제 데이터: 거래처 `서울신길동우체국`, 지출일 `2026-08-21`, 증빙 `영수증 1건`이 반영됨을 확인했다.
- 푸터: `대방동 지역주택조합`과 `조합원의 소중한 자금을 투명하고 책임 있게 집행합니다.` 문구를 확인했다.

## Required fidelity surfaces

- fonts and typography: 문서 전체에 `Pretendard`를 우선 적용하고 제목, 섹션명, 값, 보조정보의 굵기 위계를 유지한다.
- spacing and layout rhythm: A4 상하좌우 20mm 여백과 섹션별 일정한 수직 간격을 적용한다.
- colors and visual tokens: 인쇄 안정성을 위해 흑백 중심, 연한 회색 셀 배경, 검은 구분선만 사용한다.
- copy and content: 내부 영문 코드, 중복 일자·상태, 세금구분 열을 제거하고 결재·회계 확인에 필요한 내용만 남긴다.

## Primary interactions tested

- 지출결의서 목록에서 `지결-2026-0007` 상세 열기
- `인쇄하기 → A4 출력 미리보기` 진입
- A4 전체 문서 및 하단 푸터 가시성 확인
- 문서 크기, 20mm 여백, Pretendard 계산 스타일 측정
- 브라우저 콘솔 오류 없음

## Findings

- P0/P1/P2/P3 없음.
- 문서의 `scrollHeight`와 `clientHeight`가 일치해 한 페이지 내부 오버플로가 없다.

final result: passed
