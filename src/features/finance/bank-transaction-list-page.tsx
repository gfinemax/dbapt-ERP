import Link from "next/link";

import { ErpShell } from "@/components/erp-shell";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import {
  FinanceDataTable,
  FinancePageHeader,
  FinancePagination,
  FinanceStatusTabs,
  FinanceToolbar,
} from "./finance-list-layout";
import { BankTransactionDetailDrawer } from "./bank-transaction-detail-drawer";
import type {
  BankTransactionClassificationStatus,
  BankTransactionListFilters,
  BankTransactionListPage as BankTransactionPageData,
  BankTransactionStatusCounts,
  BankTransactionSourceReconciliationSummary,
  LedgerBankSourceSummary,
} from "./bank-transaction-repository";
import { formatKrw } from "./finance-data";

type Props = {
  accessError?: string;
  bankAccounts: RegisteredBankAccount[];
  filters: BankTransactionListFilters;
  ledgerSourceSummary?: LedgerBankSourceSummary;
  logoutAction?: () => Promise<void>;
  pageData: BankTransactionPageData;
  selectedTransactionId?: string;
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
  bankAccounts,
  filters,
  ledgerSourceSummary,
  logoutAction,
  pageData,
  selectedTransactionId,
  sourceReconciliationSummary,
  statusCounts = emptyStatusCounts,
  userLabel = "로그인 필요",
}: Props) {
  const accounts = new Map(bankAccounts.map((account) => [account.id, account]));
  const selectedTransaction = pageData.rows.find((row) => row.id === selectedTransactionId);
  const currentListHref = bankTransactionPageHref(pageData.page, filters);
  const selectedAccount = filters.bankAccountId ? accounts.get(filters.bankAccountId) : undefined;
  const filterChips = buildFilterChips(filters, selectedAccount);

  return (
    <ErpShell activeDetailLabel="은행 거래내역" activeLabel="회계/자금" activeWorkspaceLabel="은행·카드" logoutAction={logoutAction} userLabel={userLabel}>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4">
        <FinancePageHeader
          action={{ href: "/finance/bank-transactions/upload", label: "거래내역 업로드" }}
          breadcrumb="회계/자금 · 은행·카드 · 은행 거래내역"
          description="계좌 거래를 빠르게 찾고 분류 상태와 계정과목을 확인합니다."
          title="은행 거래내역"
        />
        {accessError ? <p className="rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold" role="alert">{accessError}</p> : null}

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
            <form className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_minmax(300px,auto)_auto_auto]" method="get">
              {filters.classificationStatus ? <input name="status" type="hidden" value={filters.classificationStatus} /> : null}
              {filters.sourceReconciliationStatus ? <input name="sourceReview" type="hidden" value="required" /> : null}
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
                <select className="h-10 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 text-sm text-[var(--color-midnight-ink)]" defaultValue={filters.bankAccountId ?? ""} name="accountId">
                  <option value="">전체 계좌</option>
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] bg-white px-3 py-2">
            <p className="text-sm font-semibold">
              조회 결과 <strong className="text-[var(--color-deep-cobalt)]">{pageData.totalCount.toLocaleString("ko-KR")}건</strong>
            </p>
            <FinancePagination
              compact
              hrefForPage={(targetPage) => bankTransactionPageHref(targetPage, filters)}
              page={pageData.page}
              pageSize={pageData.pageSize}
              totalCount={pageData.totalCount}
              totalPages={pageData.totalPages}
            />
          </div>

          <FinanceDataTable minWidthClass="min-w-[760px] table-fixed">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[16%]" />
              <col className="w-[29%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="sticky top-0 z-[3] bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)] shadow-[0_1px_0_var(--color-soft-border)]">
              <tr>
                <th className="px-2 py-2.5 text-center">거래일시</th>
                <th className="px-2 py-2.5 text-center">계좌</th>
                <th className="px-2 py-2.5 text-center">적요·거래처</th>
                <th className="px-2 py-2.5 text-center">금액</th>
                <th className="px-2 py-2.5 text-center">계정과목</th>
                <th className="px-2 py-2.5 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-soft-border)]">
              {!pageData.rows.length ? (
                <tr><td className="px-3 py-12 text-center text-[var(--color-stone)]" colSpan={6}>조건에 맞는 은행거래가 없습니다.</td></tr>
              ) : pageData.rows.map((transaction) => {
                const account = accounts.get(transaction.bankAccountId);
                const detailHref = `${currentListHref}${currentListHref.includes("?") ? "&" : "?"}transactionId=${encodeURIComponent(transaction.id)}`;
                return (
                  <tr className="h-[52px] bg-white/70 hover:bg-[var(--color-cloud-veil)]/60" key={transaction.id}>
                    <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle">{formatDate(transaction.transactedAt)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle font-semibold" title={account ? `${account.accountName} · ${account.accountNo}` : undefined}>
                      {account ? compactAccountName(account) : "계좌 정보 없음"}
                    </td>
                    <td className="break-words px-2 py-2.5 text-center align-middle">
                      <Link className="font-bold text-[var(--color-deep-cobalt)] underline decoration-dotted underline-offset-4" href={detailHref}>{transaction.description || "적요 없음"}</Link>
                      <p className="mt-0.5 text-xs text-[var(--color-stone)]">{transaction.counterparty || "-"}</p>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle">
                      <p className={`font-bold tabular-nums ${transaction.transactionKind === "입금" ? "text-[var(--color-deep-cobalt)]" : "text-[var(--color-midnight-ink)]"}`}>
                        {signedAmount(transaction.amount, transaction.transactionKind)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-stone)]">{transaction.transactionKind ?? "구분 미확인"}</p>
                    </td>
                    <td className="break-words px-2 py-2.5 text-center align-middle font-semibold">{transaction.recommendedAccountSubjectName ?? "-"}</td>
                    <td className="px-2 py-2.5 text-center align-middle">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${classificationClasses[transaction.classificationStatus]}`}>{classificationLabels[transaction.classificationStatus]}</span>
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
          accountName={accounts.get(selectedTransaction.bankAccountId)?.accountName ?? "계좌 정보 없음"}
          closeHref={currentListHref}
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
  if (filters.classificationStatus) params.set("status", filters.classificationStatus);
  if (filters.sourceReconciliationStatus) params.set("sourceReview", "required");
  const query = params.toString();
  return `/finance/bank-transactions${query ? `?${query}` : ""}`;
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
