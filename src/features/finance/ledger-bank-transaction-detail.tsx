import Link from "next/link";

import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import { formatKrw } from "./finance-data";
import type {
  LedgerBankBackfillAccount,
  LedgerBankImportedTransactionDetail,
} from "./ledger-bank-backfill-shared";

type LedgerBankTransactionDetailProps = {
  account: LedgerBankBackfillAccount;
  detail: LedgerBankImportedTransactionDetail;
  erpBankAccount?: RegisteredBankAccount;
};

export function LedgerBankTransactionDetail({ account, detail, erpBankAccount }: LedgerBankTransactionDetailProps) {
  const accountLabel = [account.bank_name, maskLast4(account.account_number_last4)].filter(Boolean).join(" · ");
  const erpAccountLabel = erpBankAccount
    ? [erpBankAccount.bankName, erpBankAccount.accountName, maskAccountNumber(erpBankAccount.accountNo)].join(" · ")
    : "연결 계좌 확인 필요";
  const range = detail.first_transaction_date && detail.last_transaction_date
    ? `${detail.first_transaction_date} ~ ${detail.last_transaction_date}`
    : "거래일 확인 필요";

  return (
    <section
      aria-labelledby="ledger-account-detail-title"
      className="scroll-mt-36 overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-white"
      id="ledger-account-detail"
    >
      <header className="border-b border-[var(--color-soft-border)] p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[var(--color-deep-cobalt)]">원본 보존 이관 내역</p>
            <h2 className="mt-1 text-2xl font-bold" id="ledger-account-detail-title">
              Ledger 계좌 ID {account.ledger_account_id} · {detail.total_count.toLocaleString("ko-KR")}건
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">
              {account.account_name} · {accountLabel || "은행 정보 없음"}
            </p>
            <p className="mt-1 text-sm font-semibold">ERP 연결 · {erpAccountLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-semibold" href="/finance/bank-account-links">
              계좌 목록으로
            </Link>
            <Link className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-semibold text-white" href="/finance/bank-transactions?origin=BANK_TRANSACTION">
              은행 거래내역
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="이관 거래" value={`${detail.total_count.toLocaleString("ko-KR")}건`} />
          <Summary label="거래 기간" value={range} />
          <Summary label="입금 합계" value={formatKrw(detail.deposit_total)} />
          <Summary label="출금 합계" value={formatKrw(detail.withdrawal_total)} />
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--color-stone)]">
          원본 ID와 해시는 Ledger 이관 당시 값이야. ERP 거래 UUID로 실제 반영 행을 대조할 수 있고, 이 원본 필드는 수정·삭제할 수 없어.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
            <tr>
              <th className="px-4 py-3">거래일시</th>
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">적요·분류</th>
              <th className="px-4 py-3 text-right">입금</th>
              <th className="px-4 py-3 text-right">출금</th>
              <th className="px-4 py-3 text-right">잔액</th>
              <th className="px-4 py-3">원본 연결</th>
              <th className="px-4 py-3">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-soft-border)]">
            {detail.rows.length ? detail.rows.map((row) => (
              <tr className="align-top" key={row.source_transaction_id}>
                <td className="whitespace-nowrap px-4 py-4">
                  <p className="font-semibold">{row.transaction_date || "일자 없음"}</p>
                  <p className="mt-1 text-xs text-[var(--color-stone)]">{row.transaction_time || "시간 없음"}</p>
                </td>
                <td className="px-4 py-4"><span className="rounded-full bg-[var(--color-cloud-veil)] px-2.5 py-1 text-xs font-bold">{row.transaction_kind}</span></td>
                <td className="max-w-sm px-4 py-4">
                  <p className="font-semibold">{row.description}</p>
                  <p className="mt-1 text-xs text-[var(--color-stone)]">{[row.category_group, row.category_name].filter(Boolean).join(" · ") || "원본 분류 없음"}</p>
                  {row.management_memo ? <p className="mt-1 text-xs text-[var(--color-stone)]">메모 · {row.management_memo}</p> : null}
                </td>
                <MoneyCell value={row.deposit_amount} />
                <MoneyCell value={row.withdrawal_amount} />
                <MoneyCell value={row.balance_amount} />
                <td className="max-w-xs px-4 py-4 font-mono text-[11px] leading-5">
                  <p className="break-all"><span className="font-sans font-semibold text-[var(--color-stone)]">원본 ID</span> {row.source_transaction_id}</p>
                  <p className="mt-1 break-all"><span className="font-sans font-semibold text-[var(--color-stone)]">ERP UUID</span> {row.bank_transaction_id}</p>
                  <p className="mt-1" title={row.payload_hash}><span className="font-sans font-semibold text-[var(--color-stone)]">해시</span> {shortHash(row.payload_hash)}</p>
                </td>
                <td className="px-4 py-4"><span className="whitespace-nowrap rounded-full bg-[var(--color-sprout)] px-2.5 py-1 text-xs font-bold text-[var(--color-green-ink)]">원본 보호</span></td>
              </tr>
            )) : (
              <tr><td className="px-4 py-10 text-center text-[var(--color-stone)]" colSpan={8}>이관된 거래가 없어.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Ledger 이관 거래 페이지" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-soft-border)] p-4 text-sm">
        <p className="text-[var(--color-stone)]">
          {detail.total_count.toLocaleString("ko-KR")}건 중 {detail.rows.length ? ((detail.page - 1) * detail.page_size + 1).toLocaleString("ko-KR") : 0}~{Math.min(detail.page * detail.page_size, detail.total_count).toLocaleString("ko-KR")}건
        </p>
        <div className="flex items-center gap-2">
          {detail.page > 1 ? <PageLink accountId={account.ledger_account_id} label="이전" page={detail.page - 1} /> : <span className="rounded-full border px-4 py-2 text-[var(--color-stone)] opacity-40">이전</span>}
          <span className="font-semibold">{detail.page} / {detail.total_pages}</span>
          {detail.page < detail.total_pages ? <PageLink accountId={account.ledger_account_id} label="다음" page={detail.page + 1} /> : <span className="rounded-full border px-4 py-2 text-[var(--color-stone)] opacity-40">다음</span>}
        </div>
      </nav>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[var(--color-cloud-veil)] p-4"><p className="text-xs font-semibold text-[var(--color-stone)]">{label}</p><p className="mt-1 font-bold tabular-nums">{value}</p></div>;
}

function MoneyCell({ value }: { value: number | null }) {
  return <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{value === null || value === 0 ? "-" : formatKrw(value)}</td>;
}

function PageLink({ accountId, label, page }: { accountId: string; label: string; page: number }) {
  const href = `/finance/bank-account-links?ledgerAccountId=${encodeURIComponent(accountId)}&page=${page}#ledger-account-detail`;
  return <Link className="rounded-full border border-[var(--color-soft-border)] px-4 py-2 font-semibold" href={href}>{label}</Link>;
}

function maskLast4(value: string | null) {
  return value ? `***${value}` : null;
}

function maskAccountNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
}

function shortHash(value: string) {
  return value.length > 16 ? `${value.slice(0, 16)}…` : value || "없음";
}
