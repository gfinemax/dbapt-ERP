import { ArrowLeft, CheckCircle2, FileCheck2, Link2, Pencil } from "lucide-react";
import Link from "next/link";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { findFinanceTransactionById, financeTransactions, formatKrw } from "./finance-data";

const approvalSteps = ["요청", "검토", "승인", "지급완료"];

type FinanceDetailPageProps = {
  transactionId: string;
};

export function FinanceDetailPage({ transactionId }: FinanceDetailPageProps) {
  const transaction = findFinanceTransactionById(transactionId) ?? financeTransactions[0];

  if (!transaction) {
    return null;
  }

  return (
    <ErpShell activeLabel="회계/자금">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-stone)]" href="/finance">
          <ArrowLeft className="size-4" />
          회계/자금 목록
        </Link>

        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              {transaction.type} · {transaction.approvalStatus} · {transaction.linkedModule} 연동
            </p>
            <h1 className="text-3xl font-bold tracking-normal">
              {transaction.accountTitle} / {transaction.voucherNo}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
              {transaction.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" size="lg" variant="outline">
              <FileCheck2 className="size-4" />
              증빙 첨부
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
              <Pencil className="size-4" />
              전표 수정
            </Button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">전표 정보</h2>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              <Info label="날짜" value={transaction.date} />
              <Info label="거래처" value={transaction.vendor} />
              <Info label="계정과목" value={transaction.accountTitle} />
              <Info label="결제장부" value={transaction.paymentBook} />
              <Info label="결제방법" value={transaction.paymentMethod} />
              <Info label="연동 모듈" value={transaction.linkedModule} />
            </dl>

            <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-soft-border)]">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-left text-xs font-semibold text-[var(--color-stone)]">
                  <tr>
                    <th className="px-4 py-3">구분</th>
                    <th className="px-4 py-3 text-right">공급가</th>
                    <th className="px-4 py-3 text-right">부가세</th>
                    <th className="px-4 py-3 text-right">합계금액</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="px-4 py-4 font-semibold">{transaction.type}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(transaction.supplyAmount)}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(transaction.vat)}</td>
                    <td className="px-4 py-4 text-right text-lg font-bold">{formatKrw(transaction.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">승인 흐름</h2>
            <div className="mt-5 space-y-3">
              {approvalSteps.map((step, index) => (
                <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3" key={step}>
                  <span className="flex size-8 items-center justify-center rounded-full bg-[var(--color-morning-tint)] text-sm font-bold text-[var(--color-deep-cobalt)]">
                    {index + 1}
                  </span>
                  <span className="font-semibold">{step}</span>
                  {transaction.approvalStatus === "승인완료" || index < 2 ? (
                    <CheckCircle2 className="ml-auto size-4 text-[var(--color-green-ink)]" />
                  ) : null}
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">증빙</h2>
            <div className="mt-5 rounded-xl bg-white p-4">
              <p className="text-sm font-semibold">{transaction.evidenceStatus}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">
                세금계산서, 계약서, 이사회·총회 의결 문서, 신탁 지급요청서를 전표에 연결합니다.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">은행/카드 매칭</h2>
            <div className="mt-5 rounded-xl bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Link2 className="size-4 text-[var(--color-deep-cobalt)]" />
                {transaction.integrationStatus}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">
                {transaction.paymentBook}의 입출금 내역 또는 법인카드 승인내역과 전표를 대조합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </ErpShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-4">
      <dt className="text-xs font-semibold text-[var(--color-fog)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
