# Design QA — 지출결의서 작성자·증빙 별지

- source visual truth: 사용자가 제공한 지출결의서 출력 화면과 `C:/Users/finemax/OneDrive/문서/카카오톡 받은 파일/납입금 확인 2차 안내문 우편 발송(260821).jpg`
- implementation screenshot: `.next-dev/qa-artifacts/expense-resolution-receipt-page-final.png`
- verification viewport: Chrome `1280 × 1500`, device scale 1
- state: `지결-2026-0007` A4 출력 미리보기, 결의서 1페이지 + 영수증 별지 1페이지
- document geometry: 각 페이지 CSS `210mm × 297mm`, 실측 `793.70 × 1122.51px`

## Full-view comparison evidence

- 결의서 첫 페이지의 구성과 20mm 여백은 유지하면서 작성자 값만 `오학동 사무장`에서 `오학동`으로 단순화했다.
- 영수증은 결의서 본문에 축소 삽입하지 않고 다음 A4 페이지 전체를 쓰는 증빙 별지로 분리했다.
- 두 페이지 모두 `scrollHeight`와 `clientHeight`가 일치해 내부 오버플로와 잘림이 없다.
- 문서 푸터 페이지 표기가 `1 / 2`, `2 / 2`로 연결된다.

## Focused region comparison evidence

- 작성자 셀의 실제 DOM 텍스트가 `작성자오학동`이며 저장된 작성자 원본값은 변경하지 않았다.
- 원본 영수증과 별지 렌더링을 같은 비교 입력에서 확인했다. 우체국명, 접수일자, 68통, 40,120원, 카드정보와 하단 안내문이 모두 보인다.
- 영수증 원본 비율을 유지한 채 `object-contain`으로 배치해 왜곡이나 잘림이 없다.
- 실제 렌더링 이미지는 원본 `688 × 1201px`, 페이지 내 표시 크기 `424.75 × 741.46px`로 선명도를 유지한다.

## Required fidelity surfaces

- fonts and typography: 결의서와 증빙 별지 문서 제목·메타데이터에 Pretendard 우선순위를 유지한다.
- spacing and layout rhythm: 기존 A4 20mm 여백, 헤더 구분선, 하단 푸터 리듬을 별지에도 동일하게 적용한다.
- colors and visual tokens: 흑백 문서 토큰과 연한 회색 경계선만 사용해 인쇄 대비를 유지한다.
- image quality and asset fidelity: 사용자 원본 영수증을 signed URL에서 데이터 이미지로 준비해 링크 만료 없이 출력하며 원본 종횡비를 보존한다.
- copy and content: 작성자는 이름만, 증빙 별지는 결의서번호·파일명·증빙유형·원본 페이지번호를 표시한다.

## Primary interactions tested

- 지출결의서 목록에서 `지결-2026-0007` 상세 열기
- `인쇄하기 → A4 출력 미리보기` 진입
- 증빙 준비 완료 후 결의서·영수증 별지 2페이지 생성 확인
- 작성자 이름, 페이지 수, 영수증 이미지 크기와 오버플로 측정
- 브라우저 콘솔 오류 없음

## Findings

- P0/P1/P2/P3 없음.

## Comparison history

- 최초 구현 캡처에서 작성자 이름 분리, 영수증 별지 배치, 페이지 수, 원본 비율과 가독성을 확인했다.
- 수정이 필요한 P0/P1/P2 차이가 발견되지 않아 추가 시각 수정 없이 통과했다.

final result: passed
