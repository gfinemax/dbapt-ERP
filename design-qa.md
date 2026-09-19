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
