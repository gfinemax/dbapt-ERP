"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { BankTransactionListRow } from "./bank-transaction-repository";
import { formatKrw } from "./finance-data";

type Props = {
  accountName: string;
  closeHref: string;
  transaction: BankTransactionListRow;
};

const classificationLabels = {
  CONFIRMED: "확정",
  DEFERRED: "검토 보류",
  EXCLUDED: "제외",
  RECOMMENDED: "추천 있음",
  UNREVIEWED: "미확인",
} as const;

export function BankTransactionDetailDrawer({ accountName, closeHref, transaction }: Props) {
  const closeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") window.location.assign(closeHref);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeHref]);

  const isWithdrawal = transaction.transactionKind === "출금";
  const amountLabel = isWithdrawal ? "출금" : transaction.transactionKind === "입금" ? "입금" : "금액";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" role="presentation">
      <Link aria-label="거래 상세 닫기" className="absolute inset-0" href={closeHref} />
      <aside
        aria-labelledby="bank-transaction-detail-title"
        aria-modal="true"
        className="relative z-10 h-full w-full max-w-lg overflow-y-auto border-l border-[var(--color-soft-border)] bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[var(--color-deep-cobalt)]">은행거래 상세</p>
            <h2 className="mt-2 text-2xl font-bold" id="bank-transaction-detail-title">{transaction.description}</h2>
          </div>
          <Link ref={closeRef} className="rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-semibold" href={closeHref}>
            닫기
          </Link>
        </div>

        <dl className="mt-8 grid gap-5 text-sm">
          <Detail label="거래일시" value={formatDateTime(transaction.transactedAt)} />
          <Detail label="계좌" value={accountName} />
          <Detail label="입출금" value={transaction.transactionKind ?? "미확정"} />
          <Detail label={amountLabel} value={formatKrw(transaction.amount)} strong />
          <Detail label="거래 후 잔액" value={transaction.balanceAmount === null ? "-" : formatKrw(transaction.balanceAmount)} />
          <Detail label="거래처" value={transaction.counterparty || "-"} />
          <Detail label="거래점" value={transaction.branchName || "-"} />
          <Detail label="분류 상태" value={classificationLabels[transaction.classificationStatus]} />
          <Detail label="추천 계정과목" value={transaction.recommendedAccountSubjectName ?? "추천 없음"} />
          <Detail label="추천 근거" value={transaction.recommendationReason ?? "관리자 확인 필요"} />
        </dl>

        <p className="mt-8 rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm leading-6 text-[var(--color-stone)]">
          이 화면은 거래 원본을 읽기 전용으로 보여줘. 계정과목 확정은 미매칭 내역에서 처리해.
        </p>
      </aside>
    </div>
  );
}

function Detail({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--color-soft-border)] pb-4">
      <dt className="text-xs font-semibold text-[var(--color-stone)]">{label}</dt>
      <dd className={strong ? "text-lg font-bold" : "font-semibold"}>{value}</dd>
    </div>
  );
}

function formatDateTime(value: string) {
  return value.replace("T", " ").replace(/\.\d{3}[+-]\d{2}:\d{2}$/, "");
}
