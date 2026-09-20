# Expense workspace design QA

- Target: the supplied expense-management screenshot and the requested unified source-list interaction.
- Verified surface: production `/finance/expenses`, desktop viewport, signed-in staff account.
- Initial state: passed. The source list uses the full content width and no empty detail placeholder is rendered.
- Selected state: passed. Selecting a source adds `source_kind` and `source_id` to the URL, marks the row selected, and opens the detail panel on the right.
- Close state: passed. `목록으로` removes the detail query and restores the full-width list.
- Source navigation: passed. `소액지출` is a first-class filter beside resolution, quick expense, and personal reimbursement; the separate small-expense history link is removed.
- Responsive/layout regression: passed. The existing selected-detail split layout and header-safe sticky offsets remain intact.
- P0/P1/P2 issues: none found.

final result: passed

## Expense detail A4 print preview

- Source visual truth: the existing expense floating-inspector target at `C:\Users\finemax\.codex\generated_images\01a0b6b2-1b1c-78f1-8037-ba25ab843b69\exec-56c9e3e4-6938-4235-9c74-6819cdbfad9a.png` and the established A4 document styling in the product.
- Implementation screenshot: direct CUA production capture of `https://dbapt-erp.vercel.app/finance/expenses?sort=CREATED_DESC&source_kind=QUICK&source_id=075f1e4f-f81c-4c98-b48b-41185cea09fd`; the CUA capture was inspected in-session and does not expose a local filesystem path.
- Viewport and density: Chrome desktop, 2190 x 1509 screenshot pixels at the browser's current desktop density.
- State: a selected quick-expense floating inspector with the new `인쇄` action, followed by the `간편지출 기록서 출력 미리보기` overlay.
- Full-view comparison: passed. The new action fits the existing compact inspector toolbar, the underlying list remains visible, and the print preview uses the established centered A4 hierarchy without clipping.
- Focused-region comparison: passed. The A4 sheet clearly separates title/status, basic expense fields, written content, processing/evidence state, and archival footer; the source-screen action remains distinct from browser printing.
- Typography: passed. The preview reuses the product's print font stack, strong document title, compact field labels, and tabular amount hierarchy.
- Spacing/layout rhythm: passed. The 210mm preview fits within the modal, keeps consistent section gaps and rules, and leaves actions outside the printable sheet.
- Colors/tokens: passed. White paper, slate rules, cloud background, and dark primary print action match the existing finance print surfaces.
- Image/asset fidelity: passed. No custom imagery was required; the printer and close affordances use the existing icon library.
- Copy/content: passed. `조회·보관용 원본 확인서` is explicitly distinguished from the formal expense-resolution output, while quick, small, and personal records route back to their source screens.
- Interactions tested in production: open preview, preserve the expense list and selected inspector, close preview, and retain the inspector after close.
- Console review: passed. No application-origin errors were observed; warnings were limited to an unrelated Chrome extension content script.
- Automated verification: focused component suite 30/30, including source-specific preview titles/routes and browser-print invocation; ESLint and production build passed.
- Comparison history: first implementation review found no P0/P1/P2 visual issue, so no corrective visual iteration was required.
- P0/P1/P2 findings: none.

final result: passed

## Reimbursement detail content and evidence preview

- Source visual truth: the user-provided personal-reimbursement detail screenshot in the implementation conversation, showing the hidden `사용내용` problem and the duplicated native PDF thumbnail/page presentation.
- Implementation target: production `/finance/reimbursements`, desktop Chrome, reimbursement detail modal for a submitted request with PDF evidence.
- Automated state coverage: passed. Component tests verify the prominent full-width `사용내용` block, the review warning for generic OCR copy, edit-mode terminology, a single rendered evidence image, loading/error/retry states, image evidence, and multi-page previous/next navigation.
- Document rendering contract: passed. PDF evidence is fetched from the authenticated same-origin route, converted to page images, and displayed one page at a time; one-page documents do not render a pager.
- Security and privacy: passed. The evidence route authenticates before proxying, accepts only PDF/image content, keeps the signed storage URL server-side, and responds with private no-store and nosniff headers.
- Responsive/layout contract: passed by component and build verification. The modal keeps the existing stacked small-screen and split large-screen layout, and the evidence panel has a minimum viewing height without adding a second document representation.
- Full-view and focused live comparison: pending. The production deployment is Ready, but the reimbursement login session expired immediately after reload, before the submitted request detail could be reopened.
- Console review: pending with the authenticated live comparison.
- P0/P1/P2 implementation issues: none found in focused tests, full tests, type checking, lint, or production build.

final result: authenticated visual verification pending

## Reimbursement receipt-first OCR

- Source visual truth: the user-provided `대납·선지급 정산` screenshot in the implementation conversation.
- Verified surface: production `/finance/reimbursements`, desktop Chrome viewport, signed-in staff account.
- Default state: passed. Expanding `개인 지출 정산 신청` starts with `영수증으로 새 정산` selected and places the evidence file control before editable expense fields.
- Hierarchy and copy: passed. `1. 정산 시작 방법` and `2. 자동입력 결과 확인·보완` make the sequence explicit without adding a separate wizard page.
- Manual path: passed. Selecting `직접 입력` hides the receipt control while preserving the editable form.
- Existing-source path: passed by automated component coverage. The option is disabled when no linkable source exists and reuses source values and evidence when available.
- Accessibility: passed. The mode controls expose pressed/disabled state, form controls have accessible labels, and OCR progress/result messaging uses a live status region.
- Visual review: passed. The receipt-first panel follows the existing card, spacing, border, and blue action hierarchy; no horizontal clipping or header/sidebar overlap was observed.
- Console review: passed. No application-origin error was observed; warnings were limited to an unrelated browser extension content script.
- Budget recommendation: passed. The receipt-first copy now includes budget-item assistance, the existing budget select remains in the same position, and automated coverage verifies available-budget matching, unknown-budget fallback, and protection of a user's manual selection.
- P0/P1/P2 issues: none found.

final result: passed

## Expense floating inspector

- Source visual: `C:\Users\finemax\.codex\generated_images\01a0b6b2-1b1c-78f1-8037-ba25ab843b69\exec-56c9e3e4-6938-4235-9c74-6819cdbfad9a.png`
- Implementation: `C:\workspace\antigravity\dbapt-erp\src\features\finance\expense-workspace-page.tsx` and `C:\workspace\antigravity\dbapt-erp\src\features\finance\expense-workspace.module.css`
- Browser target: `http://localhost:3010/design-qa` with representative personal reimbursement and quick-expense records
- Viewports reviewed: desktop 1440 x 1440 in Chrome; responsive full-screen behavior defined below 900px and covered by the production build
- Side-by-side comparison: `C:\workspace\antigravity\dbapt-erp\design-comparison.jpg`

## Comparison evidence

- Preserved the selected visual's balanced information/evidence split, compact status header, tab treatment, and single evidence surface.
- Intentionally removed the blocking overlay so the expense list remains readable and operable behind the inspector.
- Added a restrained shadow and blue focus edge to separate the inspector without dimming the working context.
- The inspector stays within the viewport, supports left/center/right placement, and exposes a native corner resize affordance.
- Narrow desktop headers wrap without overlapping. Below 900px the inspector becomes a non-resizable full-screen detail view.

## Interactions tested

- Opening with an existing selected record.
- Switching the selected expense while keeping one detail window (component test).
- Left docking while the expense list remains visible (Chrome).
- Right/default placement and reset controls (component test and Chrome accessibility tree).
- Close, Escape, previous/next navigation, URL synchronization, and focus return (component test).
- Position and size persistence through local storage (implementation review; placement state covered by the component test).

## Verification

- Focused component suite: 28 passed.
- TypeScript: passed with `npx tsc --noEmit`.
- ESLint: passed for changed TSX and test files.
- Production build: passed.
- Browser console: no application errors. Only unrelated Chrome extension listener warnings and normal Next.js development logs were present.
- Visual issues rated P0/P1/P2: none remaining.

final result: passed
