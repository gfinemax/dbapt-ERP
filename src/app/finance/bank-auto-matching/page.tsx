import Link from "next/link";

import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import {
  loadLedgerBankSubjectTransactionsAction,
  saveLedgerBankSubjectRulesAction,
  syncLedgerAccountSubjectsAction,
} from "@/app/finance/bank-transactions/actions";
import { ErpShell } from "@/components/erp-shell";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { LedgerBankSubjectRuleWorkboardPanel } from "@/features/finance/ledger-bank-subject-rule-workboard";
import {
  emptyLedgerBankSubjectRuleWorkboard,
  loadLedgerBankSubjectRuleWorkboard,
} from "@/features/finance/ledger-bank-subject-rules";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";

export default async function FinanceBankAutoMatchingRoute() {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "전표 자동매칭 조회 권한을 확인하지 못했어.";
  }
  const remoteEnabled = hasSupabaseSecretConfig();
  const accountSubjects = actor ? await listAccountSubjectsFromSupabase(actor.organization_id) : [];
  const workboardResult = actor && remoteEnabled
    ? await loadLedgerBankSubjectRuleWorkboard(actor.organization_id, accountSubjects ?? []).then((workboard) => ({ error: undefined, workboard })).catch(() => ({
      error: "Ledger 계정과목 매핑 작업대를 불러오지 못했어. 데이터베이스 반영 상태를 확인해줘.",
      workboard: emptyLedgerBankSubjectRuleWorkboard,
    }))
    : {
      error: actor ? "Ledger 계정과목 매핑 환경설정을 확인해줘." : "전표 자동매칭은 로그인 후 사용할 수 있어.",
      workboard: emptyLedgerBankSubjectRuleWorkboard,
    };

  return (
    <ErpShell activeDetailLabel="전표 자동매칭" activeLabel="회계/자금" activeWorkspaceLabel="은행·카드" logoutAction={actor ? reimbursementLogout : undefined} userLabel={actor?.display_name}>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:p-7">
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 은행·카드 &gt; 전표 자동매칭
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">전표 자동매칭</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
                Ledger 분류를 ERP 계정과목에 한 번만 연결해 추천 규칙으로 저장해. 은행거래 목록과 분리해서 이 작업을 열 때만 원본 분류를 조회해.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold" href="/finance/bank-account-links">계좌 연동 설정</Link>
              <Link className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold" href="/finance/bank-unmatched">미매칭 내역</Link>
            </div>
          </div>
          {accessError ? <p className="mt-4 rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold" role="alert">{accessError}</p> : null}
        </section>

        <LedgerBankSubjectRuleWorkboardPanel
          accountSubjects={accountSubjects ?? []}
          initialWorkboard={workboardResult.workboard}
          key={`${accountSubjects?.length ?? 0}-${workboardResult.workboard.syncedCategoryCount}`}
          loadError={workboardResult.error}
          loadTransactions={actor && remoteEnabled ? loadLedgerBankSubjectTransactionsAction : undefined}
          saveRules={actor && remoteEnabled ? saveLedgerBankSubjectRulesAction : undefined}
          syncAccountSubjects={actor && remoteEnabled ? syncLedgerAccountSubjectsAction : undefined}
        />
      </div>
    </ErpShell>
  );
}
