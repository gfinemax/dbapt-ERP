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
