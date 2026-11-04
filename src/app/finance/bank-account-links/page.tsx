import Link from "next/link";

import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { ErpShell } from "@/components/erp-shell";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { LedgerBankBackfillPanel } from "@/features/finance/ledger-bank-backfill-panel";
import { emptyLedgerBankBackfillStatus } from "@/features/finance/ledger-bank-backfill-shared";
import { loadLedgerBankBackfillStatus } from "@/features/finance/ledger-bank-transaction-backfill";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import {
  setLedgerBankAccountMappingAction,
  syncLedgerBankTransactionsAction,
} from "../bank-transactions/actions";

export default async function FinanceBankAccountLinksRoute() {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;

  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "계좌 연동 권한을 확인하지 못했어.";
  }

  const remoteEnabled = hasSupabaseSecretConfig();
  const ledgerBackfill = actor && remoteEnabled
    ? loadLedgerBankBackfillStatus().then((status) => ({ error: undefined, status })).catch(() => ({
      error: "Ledger 계좌 연동 상태를 불러오지 못했어. 관리자에게 데이터베이스 반영 상태를 확인해줘.",
      status: emptyLedgerBankBackfillStatus,
    }))
    : Promise.resolve({
      error: actor ? "Ledger 연동 환경설정을 확인해줘." : "계좌 연동 설정은 로그인 후 사용할 수 있어.",
      status: emptyLedgerBankBackfillStatus,
    });
  const [bankAccounts, initialLedgerBackfill] = actor ? await Promise.all([
    listBankAccountsFromSupabase(actor.organization_id),
    ledgerBackfill,
  ]) : [[], await ledgerBackfill];

  return (
    <ErpShell
      activeDetailLabel="계좌 연동 설정"
      activeLabel="회계/자금"
      activeWorkspaceLabel="은행·카드"
      logoutAction={actor ? reimbursementLogout : undefined}
      userLabel={actor?.display_name}
    >
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:p-7">
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 은행·카드 &gt; 계좌 연동 설정
          </p>
          <h1 className="text-3xl font-bold tracking-normal">계좌 연동 설정</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
            기존 Ledger 계좌를 ERP에 등록된 실제 은행통장과 직접 연결해. 계좌명만으로 자동 연결하지 않고 원본 계좌 ID를 보존해.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold" href="/basic-info?section=bank-accounts">
              ERP 은행통장 등록
            </Link>
            <Link className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-semibold text-white" href="/finance/bank-transactions">
              은행 거래내역으로 이동
            </Link>
          </div>
          {accessError ? <p className="mt-4 rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold" role="alert">{accessError}</p> : null}
        </section>

        <LedgerBankBackfillPanel
          bankAccounts={bankAccounts ?? []}
          initialStatus={initialLedgerBackfill.status}
          loadError={initialLedgerBackfill.error}
          mapAccount={actor && remoteEnabled ? setLedgerBankAccountMappingAction : undefined}
          syncTransactions={actor && remoteEnabled ? syncLedgerBankTransactionsAction : undefined}
        />
      </div>
    </ErpShell>
  );
}
