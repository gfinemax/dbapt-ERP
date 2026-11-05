import Link from "next/link";

import { ErpShell } from "@/components/erp-shell";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import { BankTransactionDetailDrawer } from "./bank-transaction-detail-drawer";
import type {
  BankTransactionClassificationStatus,
  BankTransactionListPage as BankTransactionPageData,
} from "./bank-transaction-repository";
import { formatKrw } from "./finance-data";

type Props = {
  accessError?: string;
  bankAccounts: RegisteredBankAccount[];
  filters: {
    bankAccountId?: string;
    classificationStatus?: BankTransactionClassificationStatus;
  };
  logoutAction?: () => Promise<void>;
  pageData: BankTransactionPageData;
  selectedTransactionId?: string;
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

export function BankTransactionListPage({
  accessError,
  bankAccounts,
  filters,
  logoutAction,
  pageData,
  selectedTransactionId,
  userLabel = "로그인 필요",
}: Props) {
  const accountNames = new Map(bankAccounts.map((account) => [account.id, account.accountName]));
  const selectedTransaction = pageData.rows.find((row) => row.id === selectedTransactionId);
  const currentListHref = bankTransactionPageHref(pageData.page, filters);

  return (
    <ErpShell activeDetailLabel="은행 거래내역" activeLabel="회계/자금" activeWorkspaceLabel="은행·카드" logoutAction={logoutAction} userLabel={userLabel}>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:p-7">
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 은행·카드 &gt; 은행 거래내역
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">은행 거래내역</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
                거래 조회와 확인에 필요한 정보만 50건씩 보여줘. 가져오기·계정과목 매핑·미매칭 확정은 각각의 작업 화면에서 처리해.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold" href="/finance/bank-transactions/upload">거래내역 업로드</Link>
              <Link className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold" href="/finance/bank-account-links">계좌 연동 설정</Link>
              <Link className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-semibold text-white" href="/finance/bank-unmatched">미매칭 확인</Link>
            </div>
          </div>
          {accessError ? <p className="mt-4 rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold" role="alert">{accessError}</p> : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
          <form className="grid gap-3 border-b border-[var(--color-soft-border)] p-4 md:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_auto]" method="get">
            <label className="grid gap-2 text-sm font-semibold">
              은행통장
              <select className="h-11 rounded-lg border border-[var(--color-soft-border)] bg-white px-3" defaultValue={filters.bankAccountId ?? ""} name="accountId">
                <option value="">전체 계좌</option>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              분류 상태
              <select className="h-11 rounded-lg border border-[var(--color-soft-border)] bg-white px-3" defaultValue={filters.classificationStatus ?? ""} name="status">
                <option value="">전체 상태</option>
                {Object.entries(classificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="h-11 self-end rounded-lg bg-[var(--color-pressed-charcoal)] px-5 text-sm font-semibold text-white" type="submit">필터 적용</button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <p className="font-semibold">전체 {pageData.totalCount.toLocaleString("ko-KR")}건 · {pageData.page}/{pageData.totalPages}페이지</p>
            <p className="text-[var(--color-stone)]">행을 선택하면 오른쪽에서 상세 내용을 확인할 수 있어.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                <tr>
                  <th className="px-4 py-3">거래일시</th>
                  <th className="px-4 py-3">계좌</th>
                  <th className="px-4 py-3">적요·거래처</th>
                  <th className="px-4 py-3 text-right">입금</th>
                  <th className="px-4 py-3 text-right">출금</th>
                  <th className="px-4 py-3">계정과목</th>
                  <th className="px-4 py-3">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-soft-border)]">
                {!pageData.rows.length ? (
                  <tr><td className="px-4 py-12 text-center text-[var(--color-stone)]" colSpan={7}>조건에 맞는 은행거래가 없어.</td></tr>
                ) : pageData.rows.map((transaction) => {
                  const detailHref = `${currentListHref}${currentListHref.includes("?") ? "&" : "?"}transactionId=${encodeURIComponent(transaction.id)}`;
                  return (
                    <tr className="bg-white/70 hover:bg-[var(--color-cloud-veil)]/60" key={transaction.id}>
                      <td className="whitespace-nowrap px-4 py-4">{formatDate(transaction.transactedAt)}</td>
                      <td className="px-4 py-4 font-semibold">{accountNames.get(transaction.bankAccountId) ?? "계좌 정보 없음"}</td>
                      <td className="px-4 py-4">
                        <Link className="font-bold text-[var(--color-deep-cobalt)] underline decoration-dotted underline-offset-4" href={detailHref}>{transaction.description}</Link>
                        <p className="mt-1 text-xs text-[var(--color-stone)]">{transaction.counterparty || "-"}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right">{transaction.transactionKind === "입금" ? formatKrw(transaction.amount) : "-"}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-right">{transaction.transactionKind === "출금" ? formatKrw(transaction.amount) : "-"}</td>
                      <td className="px-4 py-4 font-semibold">{transaction.recommendedAccountSubjectName ?? "-"}</td>
                      <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classificationClasses[transaction.classificationStatus]}`}>{classificationLabels[transaction.classificationStatus]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm font-semibold">
            {pageData.page > 1 ? <Link className="rounded-full border px-4 py-2" href={bankTransactionPageHref(pageData.page - 1, filters)}>이전 50건</Link> : <span className="rounded-full border px-4 py-2 text-[var(--color-stone)] opacity-40">이전 50건</span>}
            <span className="text-[var(--color-stone)]">{pageData.totalCount ? `${(pageData.page - 1) * pageData.pageSize + 1}-${Math.min(pageData.page * pageData.pageSize, pageData.totalCount)}건 표시` : "표시할 거래 없음"}</span>
            {pageData.page < pageData.totalPages ? <Link className="rounded-full border px-4 py-2" href={bankTransactionPageHref(pageData.page + 1, filters)}>다음 50건</Link> : <span className="rounded-full border px-4 py-2 text-[var(--color-stone)] opacity-40">다음 50건</span>}
          </div>
        </section>
      </div>

      {selectedTransaction ? (
        <BankTransactionDetailDrawer
          accountName={accountNames.get(selectedTransaction.bankAccountId) ?? "계좌 정보 없음"}
          closeHref={currentListHref}
          transaction={selectedTransaction}
        />
      ) : null}
    </ErpShell>
  );
}

export function bankTransactionPageHref(page: number, filters: Props["filters"]) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.bankAccountId) params.set("accountId", filters.bankAccountId);
  if (filters.classificationStatus) params.set("status", filters.classificationStatus);
  const query = params.toString();
  return `/finance/bank-transactions${query ? `?${query}` : ""}`;
}

function formatDate(value: string) {
  return value.slice(0, 16).replace("T", " ");
}
