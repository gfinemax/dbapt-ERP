# 성능 예산

지출결의 화면의 번들 증가를 배포 전에 감지한다. `npm run build`가 완료되면 `postbuild`가 다음 항목을 자동 검사한다.

- 초기 JavaScript 합계: 382,000바이트 이하
- 가장 큰 지연 로딩 청크: 95,000바이트 이하
- 지연 로딩 JavaScript 합계: 116,000바이트 이하

초기 JavaScript는 페이지와 공통 최상위 레이아웃의 청크를 중복 없이 합산한다. 즐겨찾기 편집 화면은 편집 버튼을 누를 때만 불러온다. 이 지연 로딩 화면을 위해 비동기 합계 예산에 9,000바이트를 추가했으며 초기 로딩 기준은 유지한다.

직접 확인할 때는 먼저 `npm run build`를 실행하거나, 기존 `.next` 결과가 있다면 `npm run performance:check`를 실행한다. 예산을 초과하면 빌드가 실패하므로 Vercel 운영 배포도 중단된다.

일시적인 확인이 필요하면 아래 환경변수로 기준을 바꿀 수 있지만, 운영 기준 변경은 번들 증가 원인을 검토한 뒤 `scripts/check-performance-budget.mjs`의 기본값과 이 문서를 함께 수정한다.

- `EXPENSE_RESOLUTION_INITIAL_JS_BUDGET`
- `EXPENSE_RESOLUTION_ASYNC_CHUNK_BUDGET`
- `EXPENSE_RESOLUTION_ASYNC_TOTAL_BUDGET`
