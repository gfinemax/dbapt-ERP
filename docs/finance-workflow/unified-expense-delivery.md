# Unified expense delivery

User-approved scope: unified navigation, expense registration, configurable shortcuts,
single-source traceability, personal reimbursement, advance settlement, monthly trust
operating funds, business-cost trust execution, payments, printing and responsive UI.

## Completion evidence required

- [x] Existing source, permissions, approval and payment mappings inspected.
- [x] Cost category, payment method, funding origin, processing route and budget state persisted independently; unknowns remain explicit.
- [x] Existing originals and audit history preserved; linked cost counted once.
- [x] Final navigation and legacy route compatibility implemented locally.
- [x] Shared decision entry routes to the authoritative conditional forms, reuses OCR/transactions and converts quick expenses to resolutions without losing the original.
- [x] Corporate card, personal reimbursement, advance usage and resolution shortcuts; configurable favorites and ordering implemented locally.
- [x] Personal reimbursement approvals and actual payment linkage, no duplicate reimbursement for advance-funded usage.
- [x] Advance usage approval, return/additional payment matching and settlement completion implemented locally.
- [x] Monthly operating fund requests, actual receipts, usage, carryover/return and reconciliation implemented locally.
- [x] Approved business resolutions linked to trust requests, supplements and partial execution.
- [x] Direct payment queue excludes trust-routed payments; actual payments counted once.
- [x] Shared filters above list/detail; selection, close, previous/next, scroll and keyboard restoration.
- [x] Responsive detail and collapsed sidebar; contextual next action, evidence and history.
- [x] Resolution, monthly expense/receipts, advance and trust print outputs verified locally.
- [ ] Permission, persistence, financial invariants, representative scenarios and production UI verified.

## Initial findings

- Advance settlements currently implement draft save only. Approval and budget posting are explicitly disabled. Full settlement remains required.
- Trust request/version/file infrastructure exists. Monthly operating receipts and usage reconciliation still require inspection and implementation.
- Expense originals currently combine resolution, quick, personal and small records at read time. This is not yet the approved independent classification model.
- The existing UI puts filters inside the shrinking list column. First layout change moves them above the split while retaining current query compatibility.

Do not mark the objective complete based on navigation or focused component tests alone.

## Incremental implementation evidence (not completion)

- Shared expense filters now sit above the list/detail split; content-width breakpoints are 800 and 1100 pixels. Visual verification remains pending.
- Sidebar expanded width is 240px; collapsed state retains a labelled 64px primary-navigation icon rail. Removed the lime vertical handle.
- Quick-menu settings now support adding/removing, ordering, cancellation, reset and browser-local persistence (versioned allowlisted IDs only). Storage failures preserve the draft and display an error. This is not account-synchronized personalization.
- Verified existing destinations for bank upload, collections, resolutions, payment waiting, advance settlement and expense list. Unavailable callback-only entries are disabled rather than silently doing nothing. New unified registration shortcuts remain required.
- Initial focused UI suite passed 41 tests across shell, quick menu and expense workspace; focused ESLint and diff whitespace check passed. Further storage-error regression added afterwards.
- Full TypeScript check exposed existing finance test fixture/API typing errors and one new quick-menu test option error. The new error was fixed; full typecheck remains to be rerun and existing errors resolved before release.
- Read-only live Supabase inspection confirms advance_settlement_drafts has no approval/completion state columns. workflow_transactions has route but not the independent classification axes. No production schema/data was changed.
- Docker is available (server 29.0.1). scripts/test-finance-workflow.mjs provisions an isolated Postgres instance and applies schema/migrations; use it for financial changes before production migration.

## Classification foundation (local, not deployed)

- Migration `20260919015614_expense_classification_axes.sql` adds independent metadata for already-enrolled expense transactions. Existing sources are not backfilled or reclassified. Unknown budget state cannot be overridden by editor input; classification edits invalidate any budget evaluation.
- Classification requires APPROVE/ADMIN, source-signature and optimistic-version checks, a reason, an immutable workflow audit event, and an idempotent operation key. The service-only API cannot be called by anon/authenticated database roles. Same-organization foreign keys protect advance links.
- Corporate-card/personal-funding contradictions and business-cost/simple-processing combinations are rejected. Advance-funded usage requires an actual advance and rejects an existing personal-reimbursement source/link to avoid silently reclassifying a refund claim.
- `expense-classification-editor.tsx` is mounted for authorized staff in an enrolled expense detail. It loads on demand, retains draft/key on uncertain save results, and does not alter original approval, amount, payment or budget allocation.
- Isolated SQL classification tests passed, including the business-cost guard and a positive actual-advance-funded personal-card purchase without creating a reimbursement/payment. Component/repository/workspace/actions focused tests: 38 passed. Focused lint passed; full TypeScript check still reports the previously identified finance test errors, with none in the new classification files.
- Full SQL runner currently fails earlier at `unified_monthly_budget.sql`: `legacy missing allocation not flagged`. This must be diagnosed, not skipped for release. Named test arguments were added to the isolated runner for focused diagnosis; the default remains the full list.
- Still required: classification for new registrations before enrollment, alias/source deduplication, server-evaluated policy/budget routing, integration with actual payment/trust/advance guards, independent filters, full typecheck, visual QA, migration deployment and production verification. This foundation is not a completed unified registration workflow.
- Budget failure lead: `20260908113000_operating_expense_evidence_policy.sql` replaced monthly unresolved-count selection with exact suggested-month/assigned-line matching; the failing legacy fixture has a resolution with no actual date and a manual executed total with no month. Diagnose unknown-month handling against the original invariant before changing either tests or production logic.

## Verification repairs and registration authorization (local)

- Added `20260919020357_budget_unknown_month_review.sql`: unknown-month/unassigned sources remain in the affected budget's unresolved count without assigning their money to an invented month. Identified other months/budgets remain excluded; manual totals are scoped to their exact budget ID/year. A period transition guard prevents closing while unknown-month sources remain unresolved.
- Added focused `budget_unknown_month_review.sql` coverage. The complete default isolated SQL runner now passes all 17 named suites plus concurrent payment/trust/accounting/advance/approval and role-denial checks (exit 0).
- Updated the OCR regression fixture to provide the now-required budget detail, without weakening that production guard.
- Replaced incomplete resolution test casts with a complete synthetic test-only fixture, removed unsupported Testing Library options and obsolete XLSX options, and copied binary test buffers to ArrayBuffer-backed values. Fixed the historical scenario clock and added a beyond-180-day rejection case. Full `tsc --noEmit` now exits 0.
- Quick-expense route reads now use the authenticated organization. Save/import/link actions require an authenticated finance actor; saved author labels come from that identity and transaction links are organization-validated. Repository writes take an explicit organization instead of selecting a default organization. Four action-authorization regression tests passed.
- Full Vitest session 52964 completed with exit 0: 136 files / 832 tests passed. The four newly added quick-action authorization tests passed separately after that run started; rerun the full current suite before release. Focused authorization lint also passed. Production data and schema remain unchanged.

## Transaction-aware shortcuts (local)

- Expense workspace now exposes corporate-card use registration, and the configurable sidebar catalog includes the same working shortcut.
- Shared quick-entry URL helper/parser supports method and source ID. The existing registration form preselects only an available transaction from its authenticated organization's server-provided candidates; unknown/already-linked IDs are not selected and display an explanatory message. Query parameters never supply amount or merchant data.
- Corporate-card shortcut opens manual temporary entry when approvals are unavailable. Bank-import result rows also offer direct quick registration with the imported withdrawal selected, alongside formal post-approval resolution.
- Added entry parser and rendered preset/unknown-source tests. Focused entry/quick/workspace/menu suite passed 47 tests, and TypeScript passed. Bank-import shortcut verification is tracked separately.
- These shortcuts reuse the existing quick-registration form; the fully unified conditional registration page, advance/personal flows and lossless formal-resolution transition still remain required.

## Persisted conversion traceability (local)

- Quick-record reads previously omitted the existing `linked_resolution_id` column. The domain/repository now retain it, and the quick list exposes an encoded direct link only when that persisted ID exists.
- `CONVERTED` alone is not evidence of a formal resolution: personal-reimbursement submission also uses that state. No destination is guessed from the status, and no historical status or total was changed.
- Focused repository/page/shortcut tests passed: 3 files, 22 tests, including organization-scoped lookup, absent resolution reference, lookup failure, and an encoded linked-resolution destination.
- The formal conversion path is now implemented locally. `quick_expense_convert_resolution` reserves the authenticated draft/author binding, hands a linked bank/card source to that draft, runs the existing child/source validations, marks the quick original converted, and records both audit and idempotency results in one transaction. A failure rolls all of those changes back.
- The shared resolution form can open from a `NEEDS_RESOLUTION` quick record. It preloads usage, amount, date, counterparty, budget/detail, payment source and evidence; the user still reviews project, account and tax treatment. Already linked quick records open the persisted resolution instead of creating another draft.
- Evidence files are not moved or deleted. The conversion requires the complete original evidence set and rebuilds file size, uploader, OCR result/status and timestamps from server-owned OCR/storage/member records, ignoring client-supplied metadata. The original quick-evidence link remains for audit.
- Linked quick originals reject direct service updates and deletes. A privileged correction path requires the last-seen timestamp, reason and idempotency key, permits only explicit descriptive/accounting fields, records before/after audit, and leaves the formal resolution unchanged so existing source-signature review guards can flag the mismatch.
- Focused isolated SQL coverage now proves authorization, tenant isolation, stale-source rejection, forged amount rollback, card handoff, authoritative evidence preservation, immutable linked originals, audit, and same-key retry. Focused component/server tests prove prefill, the shared save callback and persisted links.
- The complete isolated finance runner passes all 18 SQL suites plus concurrent budget, idempotency, trust, accounting, advance and UUID-approval checks and database-role denial after this change.
- Remaining broader work includes the fully unified registration decision flow, personal/advance lifecycle completion, trust operating/business execution, payment-route guards, final navigation, expanded filtering/next actions, print verification and production publication.

## Final navigation and operating-fund ledger (local)

- The finance sidebar now exposes workflow parents and concrete child destinations: 업무, 지출관리, 신탁 집행관리, 지급관리, 수납·환급, 회계·증빙, 예산·마감 and 설정. Legacy labels continue to resolve to the closest current destination.
- A dedicated `지출 등록·신청` route separates corporate-card use, organization-funded small expense, personal prepaid refund, formal resolution and employee-advance settlement by who paid first. It reuses the existing authoritative forms rather than creating duplicate records.
- Configurable quick-menu destinations now include corporate-card use, personal prepaid refund, monthly operating funds and business-cost trust requests. Existing browser-local ordering and allowlist validation remain in place.
- Migration `20260919023600_trust_operating_fund_periods.sql` adds an audited monthly operating-fund ledger. Requested, actually received, used, returned and carried amounts remain separate. Receipt/return links require real organization bank transactions in a contract-allowed operating account; usage requires an enrolled `OPERATING` transaction with a verified actual payment.
- Only one unsettled operating month may exist. Settlement preserves the closing balance as the next month's opening carryover and never turns the requested amount into a receipt. Service-only commands enforce tenant membership, role permissions, optimistic/idempotent writes and audit events.
- The two operating-fund sidebar destinations render distinct request/receipt and usage/settlement views. Business-cost trust requests retain their existing versioned request/reply workflow.
- Focused operating-fund SQL passed together with all existing concurrency/role-denial checks. Focused navigation, quick-menu, repository and component tests and TypeScript passed. Full current suites and production migration remain pending.

## Employee advance lifecycle (local)

- Migration `20260919024500_advance_settlement_lifecycle.sql` extends preserved draft links through submitted, approved, rejected and settled states. Submitted child links cannot be edited until a rejected item is explicitly returned to draft.
- Submission and approval require current principal/return signatures, at least one usage, evidence for every usage and no separately-paid/personal/card duplicate warning. The author/submitter cannot approve their own settlement.
- Approval does not create a payment or duplicate budget use. Completion requires the actual return or additional disbursement to be linked through the payment ledger until the authoritative balance is exactly zero; linked original expenses remain the budget sources.
- Focused lifecycle SQL proves dual control, immutable submitted children, stable retry, audit events, zero-balance completion and no duplicate budget posting. Focused repository/UI tests and TypeScript pass.

## Final local verification

- The registration decision hub now shows organization-funded, formal-resolution and advance routes only to finance staff. Ordinary applicants see their own prepaid-expense refund route without misleading access to staff workflows.
- Expense detail opens only after a row is selected. Close restores focus to the selected row; previous/next buttons and Alt+Left/Alt+Right move within the currently filtered result without reopening the page.
- Advance settlements and monthly trust operating funds now provide A4 print previews. The documents keep requested amounts separate from actual receipts/payments and point back to preserved source records instead of becoming new accounting originals.
- Final local gate on 2026-09-19 passed: ESLint, TypeScript, production build, 144 Vitest files / 874 tests, and all 20 isolated PostgreSQL suites plus concurrency and database-role denial checks. The SQL concurrency fixture uses a one-second-past transaction timestamp so clock adjustment cannot turn a valid test payment into a future transaction.
- Production database migration and authenticated production workflow verification remain separate release evidence and must not be inferred from a Git push.
