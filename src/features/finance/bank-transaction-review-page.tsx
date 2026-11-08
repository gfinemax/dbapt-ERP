"use client";

import Link from "next/link";
import { useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import type { BankTransactionReviewRow, BankTransactionSubjectAssignment } from "./bank-transaction-repository";
import { formatKrw } from "./finance-data";

type Props = {
  accessError?: string;
  accountSubjects: RegisteredAccountSubject[];
  confirmAssignments?: (assignments: BankTransactionSubjectAssignment[]) => Promise<Array<{ account_subject_id: string; transaction_id: string }>>;
  initialTransactions: BankTransactionReviewRow[];
  logoutAction?: () => Promise<void>;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  userLabel?: string;
};

export function BankTransactionReviewPage({
  accessError,
  accountSubjects,
  confirmAssignments,
  initialTransactions,
  logoutAction,
  page,
  pageSize,
  totalCount,
  totalPages,
  userLabel = "로그인 필요",
}: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(
    initialTransactions.map((transaction) => [transaction.id, transaction.recommendedAccountSubjectId ?? ""]),
  ));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(
    initialTransactions.map((transaction) => [transaction.id, ""]),
  ));
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeSubjects = accountSubjects.filter((subject) => subject.isActive);
  const confirmableIds = selectedIds.filter((id) => assignments[id]);

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectRecommended() {
    setSelectedIds(transactions.filter((transaction) => assignments[transaction.id]).map((transaction) => transaction.id));
  }

  async function confirmSelected() {
    if (!confirmAssignments || !confirmableIds.length) return;
    setIsConfirming(true);
    setError(null);
    setMessage(null);
    try {
      const confirmed = await confirmAssignments(confirmableIds.map((transactionId) => ({
        accountSubjectId: assignments[transactionId],
        note: notes[transactionId]?.trim() || undefined,
        transactionId,
      })));
      const confirmedIds = new Set(confirmed.map((item) => item.transaction_id));
      setTransactions((current) => current.filter((transaction) => !confirmedIds.has(transaction.id)));
      setSelectedIds([]);
      setMessage(`${confirmed.length}건의 계정과목을 관리자 확정했어.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계정과목 일괄 확정에 실패했어.");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <ErpShell activeDetailLabel="미매칭 내역" activeLabel="회계/자금" activeWorkspaceLabel="은행·카드" logoutAction={logoutAction} userLabel={userLabel}>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:p-7">
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 은행·카드 &gt; 미매칭 내역
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">미매칭 내역</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
                추천값을 검토하고 사람이 선택한 거래만 계정과목으로 최종 확정해. 한 페이지에는 50건만 표시해.
              </p>
            </div>
            <Link className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold" href="/finance/bank-transactions?origin=BANK_TRANSACTION">은행 거래내역으로 이동</Link>
          </div>
          {accessError ? <p className="mt-4 rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold" role="alert">{accessError}</p> : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]" id="bank-transaction-review">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] p-4">
            <div>
              <h2 className="text-lg font-bold">계정과목 관리자 일괄 확인</h2>
              <p className="mt-1 text-sm text-[var(--color-stone)]">추천 결과를 그대로 확정하거나 내부 계정과목으로 바꾼 뒤 선택한 거래를 한 번에 확정해.</p>
              <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">전체 {totalCount.toLocaleString("ko-KR")}건 · {page}/{totalPages}페이지</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={selectRecommended} size="sm" type="button" variant="outline">추천값 전체 선택</Button>
              <Button disabled={!confirmAssignments || !confirmableIds.length || isConfirming} onClick={confirmSelected} size="sm" type="button">
                {isConfirming ? "확정 중..." : `선택 ${confirmableIds.length}건 확정`}
              </Button>
            </div>
          </div>
          {message ? <p className="mx-4 mt-4 rounded-lg bg-[var(--color-sprout)] px-3 py-2 text-sm font-semibold text-[var(--color-green-ink)]">{message}</p> : null}
          {error ? <p className="mx-4 mt-4 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]">{error}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                <tr><th className="px-4 py-3 text-center">선택</th><th className="px-4 py-3 text-center">거래일</th><th className="px-4 py-3 text-center">입출금</th><th className="px-4 py-3 text-center">적요/거래처</th><th className="px-4 py-3 text-center">금액</th><th className="px-4 py-3 text-center">추천</th><th className="px-4 py-3 text-center">확정 계정과목</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-soft-border)]">
                {!transactions.length ? <tr><td className="px-4 py-8 text-center text-[var(--color-stone)]" colSpan={7}>확인할 은행거래가 없어.</td></tr> : transactions.map((transaction) => (
                  <tr className="bg-white/70" key={transaction.id}>
                    <td className="px-4 py-4 text-center"><input aria-label={`${transaction.description} 거래 선택`} checked={selectedIds.includes(transaction.id)} onChange={() => toggle(transaction.id)} type="checkbox" /></td>
                    <td className="px-4 py-4">{transaction.transactedAt.slice(0, 10)}</td>
                    <td className="px-4 py-4">{transaction.transactionKind ?? "미확정"}</td>
                    <td className="px-4 py-4"><p className="font-semibold">{transaction.description}</p><p className="text-xs text-[var(--color-stone)]">{transaction.counterparty || "-"}</p></td>
                    <td className="px-4 py-4 text-right font-semibold">{formatKrw(transaction.amount)}</td>
                    <td className="px-4 py-4"><p className="font-semibold">{transaction.recommendedAccountSubjectName ?? "추천 없음"}</p><p className="text-xs text-[var(--color-stone)]">{transaction.recommendationReason ?? "관리자 지정 필요"}</p></td>
                    <td className="px-4 py-4">
                      <select aria-label={`${transaction.description} 확정 계정과목`} className="h-10 w-full rounded-md border bg-white px-3" onChange={(event) => setAssignments((current) => ({ ...current, [transaction.id]: event.target.value }))} value={assignments[transaction.id] ?? ""}>
                        <option value="">계정과목 선택</option>
                        {activeSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                      </select>
                      <textarea
                        aria-label={`${transaction.description} 관리자 비고`}
                        className="mt-2 min-h-16 w-full resize-y rounded-md border bg-white px-3 py-2 text-xs"
                        maxLength={2000}
                        onChange={(event) => setNotes((current) => ({ ...current, [transaction.id]: event.target.value }))}
                        placeholder="분류 판단 근거 또는 확인사항"
                        value={notes[transaction.id] ?? ""}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm font-semibold">
            {page > 1 ? <Link className="rounded-full border px-4 py-2" href={reviewPageHref(page - 1)}>이전 50건</Link> : <span className="rounded-full border px-4 py-2 text-[var(--color-stone)] opacity-40">이전 50건</span>}
            <span className="text-[var(--color-stone)]">{totalCount ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)}건 표시` : "표시할 거래 없음"}</span>
            {page < totalPages ? <Link className="rounded-full border px-4 py-2" href={reviewPageHref(page + 1)}>다음 50건</Link> : <span className="rounded-full border px-4 py-2 text-[var(--color-stone)] opacity-40">다음 50건</span>}
          </div>
        </section>
      </div>
    </ErpShell>
  );
}

export function reviewPageHref(page: number) {
  return `/finance/bank-unmatched${page > 1 ? `?page=${page}` : ""}#bank-transaction-review`;
}
