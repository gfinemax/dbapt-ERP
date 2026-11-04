"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import type { LedgerBankActionResult, LedgerBankBackfillStatus, LedgerBankSyncResult } from "./ledger-bank-backfill-shared";

type LedgerBankBackfillPanelProps = {
  bankAccounts: RegisteredBankAccount[];
  initialStatus: LedgerBankBackfillStatus;
  loadError?: string;
  mapAccount?: (input: { bankAccountId: string; ledgerAccountId: string; note?: string }) => Promise<LedgerBankActionResult<LedgerBankBackfillStatus>>;
  syncTransactions?: () => Promise<LedgerBankActionResult<LedgerBankSyncResult>>;
};

export function LedgerBankBackfillPanel({
  bankAccounts,
  initialStatus,
  loadError,
  mapAccount,
  syncTransactions,
}: LedgerBankBackfillPanelProps) {
  const [status, setStatus] = useState(initialStatus);
  const [selections, setSelections] = useState<Record<string, string>>(() => Object.fromEntries(
    initialStatus.accounts.map((account) => [account.ledger_account_id, account.erp_bank_account_id ?? ""]),
  ));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sync() {
    if (!syncTransactions) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await syncTransactions();
        if (!response.ok) {
          setError(response.error);
          return;
        }
        const result = response.data;
        setStatus(result.status);
        setMessage(result.complete
          ? `Ledger 원본 ${result.received_count}건을 확인했어. 계좌 매핑이 끝난 거래 ${result.imported_count}건을 ERP에 이관했어.`
          : `이번 실행에서 ${result.received_count}건을 불러왔어. 거래량을 나눠 처리하므로 같은 버튼을 눌러 이어서 불러와줘.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Ledger 거래를 불러오지 못했어.");
      }
    });
  }

  function saveMapping(ledgerAccountId: string) {
    if (!mapAccount) return;
    const bankAccountId = selections[ledgerAccountId] ?? "";
    if (!bankAccountId) {
      setError("연결할 ERP 계좌를 선택해줘.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await mapAccount({ bankAccountId, ledgerAccountId });
        if (!response.ok) {
          setError(response.error);
          return;
        }
        const next = response.data;
        setStatus(next);
        const account = next.accounts.find((item) => item.ledger_account_id === ledgerAccountId);
        setMessage(`계좌 ID ${ledgerAccountId} 매핑을 저장했고 ${account?.imported_count ?? 0}건이 ERP 원장에 반영됐어.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Ledger 계좌 매핑을 저장하지 못했어.");
      }
    });
  }

  return (
    <section
      aria-labelledby="ledger-account-linking-title"
      className="scroll-mt-36 rounded-2xl border border-[var(--color-deep-cobalt)]/25 bg-[var(--color-morning-tint)]/25 p-5 lg:p-6"
      id="ledger-account-linking"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-deep-cobalt)]">일회성 원본 이관</p>
          <h2 className="mt-1 text-xl font-bold" id="ledger-account-linking-title">기존 Ledger 통장거래 가져오기</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-stone)]">
            Ledger의 과거 거래는 원본 ID와 해시를 보존해 읽기 전용으로 이관해. 먼저 거래를 불러온 뒤 각 Ledger 계좌 ID를 실제 ERP 계좌에 직접 연결해줘. 계좌명으로 자동 연결하지 않아.
          </p>
        </div>
        <Button disabled={isPending || !syncTransactions} onClick={sync} type="button">
          {isPending ? "처리 중..." : status.state?.last_status === "PARTIAL" ? "다음 거래 이어서 불러오기" : "Ledger 거래 불러오기"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <Metric label="원본 확인" value={status.totals.staged} />
        <Metric label="계좌 연결 대기" value={status.totals.pending} />
        <Metric label="ERP 이관" value={status.totals.imported} />
        <Metric label="형식 확인" value={status.totals.invalid} />
        <Metric label="원본 충돌" value={status.totals.conflict} />
      </div>

      {loadError ? <p className="mt-4 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{loadError}</p> : null}
      {message ? <p className="mt-4 rounded-lg bg-[var(--color-sprout)] px-3 py-2 text-sm font-semibold text-[var(--color-green-ink)]" role="status">{message}</p> : null}
      {error ? <p className="mt-4 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{error}</p> : null}
      {bankAccounts.length === 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-butter-soft)] bg-white p-4">
          <p className="text-sm font-semibold text-[var(--color-stone)]">연결할 ERP 계좌가 없어. 은행통장을 먼저 등록해줘.</p>
          <Link className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-semibold text-white" href="/basic-info?section=bank-accounts">
            ERP 은행통장 등록
          </Link>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {status.accounts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-soft-border)] bg-white/70 p-5 text-sm text-[var(--color-stone)]">
            `Ledger 거래 불러오기`를 실행하면 원본 계좌 ID와 거래 건수가 표시돼.
          </p>
        ) : status.accounts.map((account) => (
          <article className="grid gap-3 rounded-xl border border-[var(--color-soft-border)] bg-white p-4 lg:grid-cols-[minmax(260px,1fr)_minmax(280px,1fr)_auto] lg:items-end" key={account.ledger_account_id}>
            <div>
              <p className="text-xs font-semibold text-[var(--color-stone)]">Ledger 계좌 ID {account.ledger_account_id}</p>
              <p className="mt-1 font-bold">{account.account_name}</p>
              <p className="mt-1 text-sm text-[var(--color-stone)]">{[account.bank_name, maskAccountNumber(account.account_number_last4)].filter(Boolean).join(" · ") || "은행 정보 없음"}</p>
              <p className="mt-2 text-xs font-semibold text-[var(--color-stone)]">
                대기 {account.pending_count}건 · 이관 {account.imported_count}건 · 확인 {account.invalid_count + account.conflict_count}건
              </p>
            </div>
            <label className="grid gap-2 text-sm font-semibold">
              연결할 ERP 계좌
              <select
                aria-label={`Ledger 계좌 ${account.ledger_account_id}의 ERP 계좌`}
                className="h-11 rounded-md border border-[var(--color-soft-border)] bg-white px-3"
                disabled={account.imported_count > 0 || isPending}
                onChange={(event) => setSelections((current) => ({ ...current, [account.ledger_account_id]: event.target.value }))}
                value={selections[account.ledger_account_id] ?? account.erp_bank_account_id ?? ""}
              >
                <option value="">ERP 계좌 선택</option>
                {bankAccounts.map((bankAccount) => (
                  <option key={bankAccount.id} value={bankAccount.id}>
                    {bankAccount.bankName} · {bankAccount.accountName} · {maskAccountNumber(bankAccount.accountNo)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={account.imported_count > 0 || isPending || !mapAccount}
              onClick={() => saveMapping(account.ledger_account_id)}
              type="button"
              variant="outline"
            >
              {account.imported_count > 0 ? "연결 확정됨" : "계좌 연결·이관"}
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold text-[var(--color-stone)]">{label}</p><p className="mt-1 text-lg font-bold">{value.toLocaleString("ko-KR")}건</p></div>;
}

function maskAccountNumber(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
}
