import Link from "next/link";

import { ErpShell } from "@/components/erp-shell";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import {
  FinanceDataTable,
  FinancePageHeader,
  FinancePagination,
  FinanceStatusTabs,
  FinanceToolbar,
} from "./finance-list-layout";
import { BankTransactionDetailDrawer } from "./bank-transaction-detail-drawer";
import { BankTransactionExportDialog } from "./bank-transaction-export-dialog";
import type {
  BankTransactionClassificationStatus,
  BankTransactionListFilters,
  BankTransactionListPage as BankTransactionPageData,
  BankTransactionReviewInput,
  BankTransactionReviewResult,
  BankTransactionRulePreview,
  BankTransactionStatusCounts,
  BankTransactionSourceReconciliationSummary,
  FinancialActivitySummary,
  FilteredFinancialActivitySummary,
  LedgerBankSourceSummary,
} from "./bank-transaction-repository";
import { formatKrw } from "./finance-data";

type Props = {
  accessError?: string;
  accountSubjects?: RegisteredAccountSubject[];
  activitySummary?: FinancialActivitySummary;
  bankAccounts: RegisteredBankAccount[];
  canExport?: boolean;
  filters: BankTransactionListFilters;
  filteredSummary?: FilteredFinancialActivitySummary;
  ledgerSourceSummary?: LedgerBankSourceSummary;
  logoutAction?: () => Promise<void>;
  pageData: BankTransactionPageData;
  rulePreview?: BankTransactionRulePreview;
  selectedTransactionId?: string;
  saveReviewAction?: (input: BankTransactionReviewInput) => Promise<BankTransactionReviewResult>;
  sourceReconciliationSummary?: BankTransactionSourceReconciliationSummary;
  statusCounts?: BankTransactionStatusCounts;
  userLabel?: string;
};

const classificationLabels = {
  CONFIRMED: "확정",
  DEFERRED: "검토 보류",
  EXCLUDED: "제외",
  RECOMMENDED: "추천 있음",
  UNREVIEWED: "미확인",
} as const;

const classificationClasses = {
  CONFIRMED: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  DEFERRED: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  EXCLUDED: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  RECOMMENDED: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
  UNREVIEWED: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
} as const;

const statusTabLabels: Array<{ label: string; value?: BankTransactionClassificationStatus }> = [
  { label: "전체" },
  { label: "미확인", value: "UNREVIEWED" },
  { label: "추천", value: "RECOMMENDED" },
  { label: "확정", value: "CONFIRMED" },
  { label: "보류", value: "DEFERRED" },
  { label: "제외", value: "EXCLUDED" },
];

const emptyStatusCounts: BankTransactionStatusCounts = {
  ALL: 0,
  CONFIRMED: 0,
  DEFERRED: 0,
  EXCLUDED: 0,
  RECOMMENDED: 0,
  UNREVIEWED: 0,
};

export function BankTransactionListPage({
  accessError,
  accountSubjects = [],
  activitySummary,
  bankAccounts,
  canExport = false,
  filters,
  filteredSummary,
  ledgerSourceSummary,
  logoutAction,
  pageData,
  rulePreview,
  selectedTransactionId,
  saveReviewAction,
  sourceReconciliationSummary,
  statusCounts = emptyStatusCounts,
  userLabel = "로그인 필요",
}: Props) {
  const accounts = new Map(bankAccounts.map((account) => [account.id, account]));
  const accountSubjectsById = new Map(accountSubjects.map((subject) => [subject.id, subject]));
  const selectedTransaction = pageData.rows.find((row) => row.id === selectedTransactionId && row.originType !== "EXTERNAL_RECOGNITION");
  const currentListHref = bankTransactionPageHref(pageData.page, filters);
  const selectedAccount = filters.bankAccountId ? accounts.get(filters.bankAccountId) : undefined;
  const filterChips = buildFilterChips(filters, selectedAccount);

  return (
    <ErpShell activeDetailLabel="거래내역" activeLabel="회계/자금" activeWorkspaceLabel="은행·카드" logoutAction={logoutAction} userLabel={userLabel}>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4">
        <FinancePageHeader
          action={{ href: "/finance/bank-transactions/upload", label: "거래내역 업로드" }}
          breadcrumb="회계/자금 · 은행·카드 · 거래내역"
          description="실제 통장거래와 외부납입 인정을 원본별로 구분하고 필요한 범위만 한 화면에서 조회합니다."
          title="거래내역"
        />
        {accessError ? <p className="rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold" role="alert">{accessError}</p> : null}

        <ActivityViewTabs filters={filters} />

        {activitySummary ? (
          <section aria-label="통합 거래 요약" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="실제 통장 거래" value={`${activitySummary.bankTransactionCount.toLocaleString("ko-KR")}건`} note="은행 원본" />
            <SummaryCard label="통장 입금" value={formatKrw(activitySummary.bankDepositTotal)} note="조합계좌 현금" />
            <SummaryCard label="통장 출금" value={formatKrw(activitySummary.bankWithdrawalTotal)} note="조합계좌 현금" />
            <SummaryCard label="외부납입 인정" value={formatKrw(activitySummary.externalRecognitionTotal)} note={`${activitySummary.externalRecognitionCount.toLocaleString("ko-KR")}건 · 통장 입금 아님`} />
            <SummaryCard label="확정결손" value={formatKrw(activitySummary.confirmedLossTotal)} note="비현금 인정" />
            <SummaryCard label="신탁사 보관" value={formatKrw(activitySummary.trustHeldTotal)} note="조합계좌 외 보관" />
          </section>
        ) : null}

        {sourceReconciliationSummary?.issueCount ? (
          <section aria-label="원본 대조 알림" className="rounded-xl border border-[var(--color-mustard)] bg-[var(--color-butter-soft)]/55 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-lg font-black text-[var(--color-midnight-ink)]">원본 확인 필요 {sourceReconciliationSummary.issueCount.toLocaleString("ko-KR")}건</p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-stone)]">ERP에는 있지만 최신 Google 시트 반영 배치와 연결되지 않은 거래야. 계정과목의 `미확인`과는 별도의 원본 대조 상태야.</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-mustard)]">
                  집계 영향 · 입금 {formatKrw(sourceReconciliationSummary.depositImpact)} · 출금 {formatKrw(sourceReconciliationSummary.withdrawalImpact)}
                </p>
              </div>
              <Link
                className={`rounded-full px-4 py-2 text-sm font-bold ${filters.sourceReconciliationStatus ? "bg-[var(--color-midnight-ink)] text-white" : "border border-[var(--color-mustard)] bg-white text-[var(--color-midnight-ink)]"}`}
                href={bankTransactionPageHref(1, { ...filters, sourceReconciliationStatus: filters.sourceReconciliationStatus ? undefined : "SOURCE_REVIEW_REQUIRED" })}
              >
                {filters.sourceReconciliationStatus ? "전체 거래로 돌아가기" : `${sourceReconciliationSummary.issueCount.toLocaleString("ko-KR")}건 바로 보기`}
              </Link>
            </div>
          </section>
        ) : null}

        <section className="overflow-visible rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
          <FinanceStatusTabs
            items={statusTabLabels.map((item) => ({
              active: filters.classificationStatus === item.value,
              count: statusCounts[item.value ?? "ALL"],
              href: bankTransactionPageHref(1, { ...filters, classificationStatus: item.value }),
              label: item.label,
            }))}
            label="분류 상태 빠른 필터"
          />

          <FinanceToolbar>
            <form className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_minmax(210px,280px)_minmax(300px,auto)_auto_auto]" method="get">
              {filters.classificationStatus ? <input name="status" type="hidden" value={filters.classificationStatus} /> : null}
              {filters.sourceReconciliationStatus ? <input name="sourceReview" type="hidden" value="required" /> : null}
              {filters.originType ? <input name="origin" type="hidden" value={filters.originType} /> : null}
              {filters.reviewRequired ? <input name="view" type="hidden" value="review" /> : null}
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-stone)]">
                거래 검색
                <input
                  className="h-10 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 text-sm text-[var(--color-midnight-ink)]"
                  defaultValue={filters.query ?? ""}
                  name="q"
                  placeholder="적요·거래처 검색"
                  type="search"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-stone)]">
                은행통장
                <select className="h-10 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 text-sm text-[var(--color-midnight-ink)] disabled:bg-[var(--color-cloud-veil)] disabled:text-[var(--color-fog)]" defaultValue={filters.bankAccountId ?? ""} disabled={filters.originType === "EXTERNAL_RECOGNITION"} name="accountId">
                  {filters.originType === "EXTERNAL_RECOGNITION" ? <option value="">외부납입 인정에는 적용 안 됨</option> : <option value="">전체 계좌</option>}
                  {bankAccounts.map((account) => <option key={account.id} value={account.id}>{bankAccountOptionLabel(account)}</option>)}
                </select>
              </label>
              <fieldset className="grid grid-cols-[1fr_auto_1fr] items-end gap-1">
                <legend className="sr-only">거래 기간</legend>
                <label className="grid gap-1 text-xs font-semibold text-[var(--color-stone)]">
                  시작일
                  <input className="h-10 min-w-0 rounded-lg border border-[var(--color-soft-border)] bg-white px-2 text-sm text-[var(--color-midnight-ink)]" defaultValue={filters.dateFrom ?? ""} name="from" type="date" />
                </label>
                <span aria-hidden="true" className="pb-2.5 text-[var(--color-fog)]">–</span>
                <label className="grid gap-1 text-xs font-semibold text-[var(--color-stone)]">
                  종료일
                  <input className="h-10 min-w-0 rounded-lg border border-[var(--color-soft-border)] bg-white px-2 text-sm text-[var(--color-midnight-ink)]" defaultValue={filters.dateTo ?? ""} name="to" type="date" />
                </label>
              </fieldset>
              <button className="h-10 self-end rounded-lg bg-[var(--color-pressed-charcoal)] px-4 text-sm font-semibold text-white" type="submit">조회</button>
              <Link className="flex h-10 items-center justify-center self-end rounded-lg border border-[var(--color-soft-border)] bg-white px-3 text-sm font-semibold text-[var(--color-stone)]" href="/finance/bank-transactions">초기화</Link>
            </form>

            {filterChips.length ? (
              <div aria-label="적용된 필터" className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--color-stone)]">적용됨</span>
                {filterChips.map((chip) => (
                  <Link
                    aria-label={`${chip.label} 필터 제거`}
                    className="rounded-full bg-[var(--color-cloud-veil)] px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)] hover:text-[var(--color-midnight-ink)]"
                    href={bankTransactionPageHref(1, { ...filters, [chip.key]: undefined })}
                    key={chip.key}
                  >
                    {chip.label} ×
                  </Link>
                ))}
              </div>
            ) : null}
          </FinanceToolbar>

          {ledgerSourceSummary ? (
            <section aria-label="ERP 거래 원본 구성" className="border-b border-[var(--color-soft-border)] bg-[var(--color-morning-tint)]/35 px-3 py-3">
              <p className="mb-2 text-xs font-semibold text-[var(--color-stone)]">
                선택 계좌의 전체 ERP 거래를 원본 출처별로 구분했어. 각 원본 건수는 전체 ERP 거래에 포함돼.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--color-stone)]">전체 ERP 거래</p>
                  <p className="mt-0.5 text-lg font-black tabular-nums text-[var(--color-deep-cobalt)]">{ledgerSourceSummary.erpTransactionCount.toLocaleString("ko-KR")}건</p>
                </div>
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--color-stone)]">Ledger 원본 연계</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums">{ledgerSourceSummary.ledgerSourceCount.toLocaleString("ko-KR")}건</p>
                  <p className="text-xs text-[var(--color-stone)]">Ledger 원본 {ledgerSourceSummary.ledgerOriginalCount.toLocaleString("ko-KR")}건</p>
                </div>
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--color-stone)]">Google 시트 신규</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums">{ledgerSourceSummary.googleSheetSourceCount.toLocaleString("ko-KR")}건</p>
                  <p className="text-xs text-[var(--color-stone)]">ERP에 새로 등록</p>
                </div>
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--color-stone)]">기타 원본</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums">{ledgerSourceSummary.otherSourceCount.toLocaleString("ko-KR")}건</p>
                </div>
                <div className="rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--color-stone)]">금액 없는 Ledger 원본</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-mustard)]">{ledgerSourceSummary.zeroAmountSourceCount.toLocaleString("ko-KR")}건</p>
                  <p className="text-xs text-[var(--color-stone)]">회계 집계 제외</p>
                </div>
              </div>
              {ledgerSourceSummary.zeroAmountSources.length ? (
                <details className="mt-2 rounded-lg border border-[var(--color-soft-border)] bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[var(--color-midnight-ink)]">
                    금액 없는 Ledger 원본 {ledgerSourceSummary.zeroAmountSourceCount.toLocaleString("ko-KR")}건 보기
                  </summary>
                  <div className="max-h-72 overflow-auto border-t border-[var(--color-soft-border)]">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="sticky top-0 bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                        <tr>
                          <th className="px-3 py-2 text-center">Ledger 원본 ID</th>
                          <th className="px-3 py-2 text-center">거래일시</th>
                          <th className="px-3 py-2 text-center">원본 종류·적요</th>
                          <th className="px-3 py-2 text-center">처리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-soft-border)]">
                        {ledgerSourceSummary.zeroAmountSources.map((row) => (
                          <tr key={row.sourceTransactionId}>
                            <td className="px-3 py-2 text-center font-semibold tabular-nums">{row.sourceTransactionId}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{sourceTransactionDateTime(row.transactionDate, row.transactionTime)}</td>
                            <td className="px-3 py-2 text-center"><strong>{row.transactionKind}</strong><span className="mx-1 text-[var(--color-fog)]">·</span>{row.description}</td>
                            <td className="px-3 py-2 text-center"><span className="rounded-full bg-[var(--color-butter-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-mustard)]" title={row.issueDetail}>회계 집계 제외</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}

          <div className="border-b border-[var(--color-soft-border)] bg-white px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold">
                조회 결과 <strong className="text-[var(--color-deep-cobalt)]">{pageData.totalCount.toLocaleString("ko-KR")}건</strong>
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canExport ? <BankTransactionExportDialog filters={filters} totalCount={pageData.totalCount} /> : null}
                <FinancePagination
                  compact
                  hrefForPage={(targetPage) => bankTransactionPageHref(targetPage, filters)}
                  page={pageData.page}
                  pageSize={pageData.pageSize}
                  totalCount={pageData.totalCount}
                  totalPages={pageData.totalPages}
                />
              </div>
            </div>
            {filteredSummary ? <FilteredSummaryCards summary={filteredSummary} /> : null}
          </div>

          <FinanceDataTable minWidthClass="min-w-[1040px] table-fixed">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[18%]" />
              <col className="w-[25%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead className="sticky top-0 z-[3] bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)] shadow-[0_1px_0_var(--color-soft-border)]">
              <tr>
                <th className="px-2 py-2.5 text-center">거래일시</th>
                <th className="px-2 py-2.5 text-center">계좌</th>
                <th className="px-2 py-2.5 text-center">적요·거래처</th>
                <th className="px-2 py-2.5 text-center">거래내역</th>
                <th className="px-2 py-2.5 text-center">금액</th>
                <th className="px-2 py-2.5 text-center">계정과목</th>
                <th className="px-2 py-2.5 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-soft-border)]">
              {!pageData.rows.length ? (
                <tr><td className="px-3 py-12 text-center text-[var(--color-stone)]" colSpan={7}>조건에 맞는 거래내역이 없습니다.</td></tr>
              ) : pageData.rows.map((transaction) => {
                const isExternalRecognition = transaction.originType === "EXTERNAL_RECOGNITION";
                const account = accounts.get(transaction.bankAccountId);
                const accountSubjectName = transaction.confirmedAccountSubjectName ?? transaction.recommendedAccountSubjectName;
                const accountSubjectId = transaction.confirmedAccountSubjectId ?? transaction.recommendedAccountSubjectId;
                const accountSubject = accountSubjectId ? accountSubjectsById.get(accountSubjectId) : undefined;
                const accountSubjectLabel = isExternalRecognition
                  ? externalAccountingLabel(transaction.accountingTreatment)
                  : accountSubjectName && accountSubject?.businessCategory
                  ? `${accountSubject.businessCategory} · ${accountSubjectName}`
                  : accountSubjectName ?? "-";
                const detailHref = `${currentListHref}${currentListHref.includes("?") ? "&" : "?"}transactionId=${encodeURIComponent(transaction.id)}`;
                const transactionDetails = (isExternalRecognition ? [
                  ["원본", "Ledger 외부납입 인정"],
                  ["현금 영향", cashImpactLabel(transaction.cashImpact)],
                  ["회계 처리", externalAccountingLabel(transaction.accountingTreatment)],
                  ["인정 사유", transaction.memo ?? ""],
                  ["Ledger 원본 ID", transaction.sourceRecordId ?? ""],
                ] : [
                  ["항목구분", transaction.uploadedCategory ?? ""],
                  ["업로드 계정항목", transaction.uploadedAccountTitle ?? ""],
                  ["메모·비고", transaction.memo ?? ""],
                  ["취급점", transaction.branchName ?? ""],
                  ["원본 적요", transaction.originalDescription && transaction.originalDescription !== transaction.description ? transaction.originalDescription : ""],
                  ["원본 메모", transaction.originalMemo && transaction.originalMemo !== transaction.memo ? transaction.originalMemo : ""],
                ] satisfies Array<[string, string]>).filter(([, value]) => Boolean(value.trim()));
                return (
                  <tr className="h-[52px] bg-white/70 hover:bg-[var(--color-cloud-veil)]/60" key={transaction.id}>
                    <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle">{formatDate(transaction.transactedAt)}</td>
                    <td className="px-2 py-2.5 text-center align-middle font-semibold" title={account ? `${account.accountName} · ${account.accountNo}` : undefined}>
                      {isExternalRecognition ? (
                        <><span className="block">외부납입 인정</span><span className="mt-0.5 block text-xs font-normal text-[var(--color-stone)]">{cashImpactLabel(transaction.cashImpact)}</span></>
                      ) : account ? compactAccountName(account) : "계좌 정보 없음"}
                    </td>
                    <td className="break-words px-2 py-2.5 text-center align-middle">
                      {isExternalRecognition ? (
                        <Link className="font-bold text-[var(--color-green-ink)] underline decoration-dotted underline-offset-4" href="/finance/collections">{transaction.description || "외부납입 인정"}</Link>
                      ) : (
                        <Link className="font-bold text-[var(--color-deep-cobalt)] underline decoration-dotted underline-offset-4" href={detailHref}>{transaction.description || "적요 없음"}</Link>
                      )}
                      <p className="mt-0.5 text-xs text-[var(--color-stone)]">{transaction.counterparty || "-"}</p>
                    </td>
                    <td className="break-words px-2 py-2.5 text-center align-middle text-xs">
                      {transactionDetails.length ? (
                        <dl className="grid gap-0.5">
                          {transactionDetails.map(([label, value]) => (
                            <div key={label}>
                              <dt className="inline font-semibold text-[var(--color-stone)]">{label} · </dt>
                              <dd className="inline text-[var(--color-midnight-ink)]">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : <p className="text-[var(--color-fog)]">원본 참고정보 없음</p>}
                      {!isExternalRecognition && transaction.classificationNote ? (
                        <p className="mt-1 font-semibold text-[var(--color-green-ink)]">관리자 비고 · {transaction.classificationNote}</p>
                      ) : !isExternalRecognition ? <p className="mt-1 text-[var(--color-stone)]">관리자 비고 없음</p> : null}
                      {!isExternalRecognition ? <Link
                        aria-label={`${transaction.description || "적요 없음"} 관리자 비고 ${transaction.classificationNote ? "수정" : "작성"}`}
                        className="mt-1 inline-block font-bold text-[var(--color-deep-cobalt)] underline decoration-dotted underline-offset-2"
                        href={detailHref}
                      >
                        {transaction.classificationNote ? "비고 수정" : "비고 작성"}
                      </Link> : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle">
                      <p className={`font-bold tabular-nums ${transaction.transactionKind === "입금" ? "text-[var(--color-deep-cobalt)]" : "text-[var(--color-midnight-ink)]"}`}>
                        {isExternalRecognition ? formatKrw(transaction.amount) : signedAmount(transaction.amount, transaction.transactionKind)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-stone)]">{isExternalRecognition ? cashImpactLabel(transaction.cashImpact) : transaction.transactionKind ?? "구분 미확인"}</p>
                    </td>
                    <td className="break-words px-2 py-2.5 text-center align-middle font-semibold">
                      {accountSubjectLabel}
                      {isExternalRecognition ? <span className="mt-0.5 block text-xs font-normal text-[var(--color-stone)]">Ledger 원장 분류</span> : transaction.confirmedAccountSubjectName ? <span className="mt-0.5 block text-xs font-normal text-[var(--color-green-ink)]">ERP 확정</span> : transaction.recommendedAccountSubjectName ? <span className="mt-0.5 block text-xs font-normal text-[var(--color-stone)]">추천</span> : null}
                    </td>
                    <td className="px-2 py-2.5 text-center align-middle">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${classificationClasses[transaction.classificationStatus]}`}>{isExternalRecognition ? externalStatusLabel(transaction.recognitionStatus, transaction.accountingTreatment) : classificationLabels[transaction.classificationStatus]}</span>
                      {isExternalRecognition ? <span className="mt-1 block text-xs font-semibold text-[var(--color-stone)]">외부납입 원본</span> : null}
                      {transaction.sourceReconciliationIssue ? <span className="mt-1 block text-xs font-bold text-[var(--color-mustard)]">원본 확인 필요</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </FinanceDataTable>

          <div className="border-t border-[var(--color-soft-border)] bg-white px-3 py-2">
            <FinancePagination
              hrefForPage={(targetPage) => bankTransactionPageHref(targetPage, filters)}
              page={pageData.page}
              pageSize={pageData.pageSize}
              totalCount={pageData.totalCount}
              totalPages={pageData.totalPages}
            />
          </div>
        </section>
      </div>

      {selectedTransaction ? (
        <BankTransactionDetailDrawer
          accountSubjects={accountSubjects}
          accountName={accounts.get(selectedTransaction.bankAccountId)?.accountName ?? "계좌 정보 없음"}
          closeHref={currentListHref}
          key={selectedTransaction.id}
          rulePreview={rulePreview}
          saveReviewAction={saveReviewAction}
          transaction={selectedTransaction}
        />
      ) : null}
    </ErpShell>
  );
}

type FilterChip = {
  key: "bankAccountId" | "classificationStatus" | "dateFrom" | "dateTo" | "query" | "sourceReconciliationStatus";
  label: string;
};

function buildFilterChips(filters: BankTransactionListFilters, selectedAccount?: RegisteredBankAccount): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.query) chips.push({ key: "query", label: `검색: ${filters.query}` });
  if (filters.bankAccountId) chips.push({ key: "bankAccountId", label: selectedAccount ? bankAccountOptionLabel(selectedAccount) : "선택 계좌" });
  if (filters.dateFrom) chips.push({ key: "dateFrom", label: `시작: ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: "dateTo", label: `종료: ${filters.dateTo}` });
  if (filters.classificationStatus) chips.push({ key: "classificationStatus", label: classificationLabels[filters.classificationStatus] });
  if (filters.sourceReconciliationStatus) chips.push({ key: "sourceReconciliationStatus", label: "원본 확인 필요" });
  return chips;
}

export function bankTransactionPageHref(page: number, filters: BankTransactionListFilters) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.query) params.set("q", filters.query);
  if (filters.bankAccountId) params.set("accountId", filters.bankAccountId);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.originType) params.set("origin", filters.originType);
  if (filters.classificationStatus) params.set("status", filters.classificationStatus);
  if (filters.reviewRequired) params.set("view", "review");
  if (filters.sourceReconciliationStatus) params.set("sourceReview", "required");
  const query = params.toString();
  return `/finance/bank-transactions${query ? `?${query}` : ""}`;
}

function ActivityViewTabs({ filters }: { filters: BankTransactionListFilters }) {
  const activeView = filters.reviewRequired
    ? "review"
    : filters.originType === "BANK_TRANSACTION"
      ? "bank"
      : filters.originType === "EXTERNAL_RECOGNITION"
        ? "external"
        : "all";
  const items = [
    { description: "은행 + 외부납입", label: "통합 거래내역", value: "all" },
    { description: "실제 통장 입출금", label: "은행 거래내역", value: "bank" },
    { description: "비현금·신탁 인정", label: "외부납입 인정", value: "external" },
    { description: "미확인·보류·원본", label: "검토 필요", value: "review" },
  ] as const;

  return (
    <nav aria-label="거래내역 구분" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const active = activeView === item.value;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`rounded-xl border px-4 py-3 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? "border-[var(--color-green-ink)] bg-[var(--color-sprout)] text-[var(--color-green-ink)]" : "border-[var(--color-soft-border)] bg-white text-[var(--color-midnight-ink)] hover:bg-[var(--color-morning-tint)]"}`}
            href={activityViewHref(item.value, filters)}
            key={item.value}
          >
            <span className="block text-sm font-black">{item.label}</span>
            <span className="mt-0.5 block text-xs text-[var(--color-stone)]">{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function activityViewHref(view: "all" | "bank" | "external" | "review", filters: BankTransactionListFilters) {
  const shared: BankTransactionListFilters = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    query: filters.query,
  };
  if (view === "bank") return bankTransactionPageHref(1, { ...shared, bankAccountId: filters.bankAccountId, originType: "BANK_TRANSACTION" });
  if (view === "external") return bankTransactionPageHref(1, { ...shared, originType: "EXTERNAL_RECOGNITION" });
  if (view === "review") return bankTransactionPageHref(1, { ...shared, reviewRequired: true });
  return bankTransactionPageHref(1, shared);
}

function compactAccountName(account: RegisteredBankAccount) {
  const digits = account.accountNo.replace(/\D/g, "");
  return `${account.bankName} · ${digits.slice(-4) || account.accountNo}`;
}

function bankAccountOptionLabel(account: RegisteredBankAccount) {
  const digits = account.accountNo.replace(/\D/g, "");
  const prefix = digits.slice(0, 5);
  const accountLabel = `${account.bankName} · ${account.accountName}`;
  return prefix ? `${accountLabel} (${prefix})` : accountLabel;
}

function signedAmount(amount: number, kind: "입금" | "출금" | null) {
  const sign = kind === "입금" ? "+" : kind === "출금" ? "−" : "";
  return `${sign}${formatKrw(amount)}`;
}

function formatDate(value: string) {
  return value.slice(0, 16).replace("T", " ");
}

function sourceTransactionDateTime(date: string, time: string | null) {
  if (!date) return "일시 미확인";
  return time ? `${date} ${time}` : date;
}

function SummaryCard({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-3 text-center">
      <p className="text-xs font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-[var(--color-midnight-ink)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--color-stone)]">{note}</p>
    </div>
  );
}

function FilteredSummaryCards({ summary }: { summary: FilteredFinancialActivitySummary }) {
  const netCashChange = summary.bankDepositTotal - summary.bankWithdrawalTotal;
  return (
    <section aria-label="검색 결과 금액 합계" className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <SearchTotalCard label="입금 합계" note="실제 조합계좌 입금" value={formatKrw(summary.bankDepositTotal)} />
      <SearchTotalCard label="출금 합계" note="실제 조합계좌 출금" value={formatKrw(summary.bankWithdrawalTotal)} />
      <SearchTotalCard
        label="외부납입 인정 합계"
        note={`${summary.externalRecognitionCount.toLocaleString("ko-KR")}건 · 통장 입금 아님`}
        value={formatKrw(summary.externalRecognitionTotal)}
      />
      <SearchTotalCard label="순현금 증감" note="입금 − 출금" value={formatSignedKrw(netCashChange)} />
    </section>
  );
}

function SearchTotalCard({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-cloud-veil)] px-3 py-2 text-center">
      <p className="text-xs font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-0.5 font-black tabular-nums text-[var(--color-midnight-ink)]">{value}</p>
      <p className="text-[11px] text-[var(--color-stone)]">{note}</p>
    </div>
  );
}

function formatSignedKrw(value: number) {
  if (value > 0) return `+${formatKrw(value)}`;
  if (value < 0) return `−${formatKrw(Math.abs(value))}`;
  return formatKrw(0);
}

function cashImpactLabel(value?: string) {
  if (value === "BANK_CASH") return "조합계좌 현금";
  if (value === "TRUST_HELD") return "신탁사 보관";
  return "비현금 인정";
}

function externalAccountingLabel(value?: string | null) {
  if (value === "confirmed_loss") return "외부납입 인정 · 확정결손";
  if (value === "trust_receipt") return "외부납입 인정 · 신탁사 보관 수납";
  return "외부납입 인정 · 회계 처리 검토";
}

function externalStatusLabel(status?: string | null, accountingTreatment?: string | null) {
  if (status === "CANCELLED") return "취소 원본 보존";
  if (accountingTreatment === "pending_review") return "회계 검토 보류";
  return "인정 반영";
}
