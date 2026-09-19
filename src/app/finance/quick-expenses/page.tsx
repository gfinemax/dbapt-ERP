import { listUnresolvedCorporateCardTransactions } from "@/features/finance/corporate-card-transaction-repository";
import { listUnresolvedWithdrawalTransactions } from "@/features/finance/expense-compliance-repository";
import { QuickExpensePage } from "@/features/finance/quick-expense-page";
import { listQuickExpenseRecords } from "@/features/finance/quick-expense-record-repository";
import { listExpenseBudgetProfiles } from "@/features/finance/budget-profile-repository";
import { listOperatingExpenseDetails } from "@/features/finance/operating-budget-repository";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { getQuickExpensePrintEvidenceAction, importCorporateCardTransactionsAction, linkQuickExpenseCardAction, saveQuickExpenseRecordAction } from "./actions";
import { attachQuickExpenseEvidenceAction } from "@/app/finance/expenses/actions";
import { discardUnlinkedExpenseEvidenceAction, getExpenseEvidenceOcrJobAction, retryExpenseEvidenceOcrJobAction } from "@/app/finance/expense-resolutions/actions";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { parseQuickExpenseEntry } from "@/features/finance/quick-expense-entry";

export const dynamic = "force-dynamic";

export default async function QuickExpensesRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const entry = parseQuickExpenseEntry(await searchParams);
  let actor;
  try {
    actor = await requireExpenseActor();
  } catch (error) {
    return <ReimbursementLogin title="예산 내 간편지출" description="영수증과 지출내역을 등록하려면 본인 계정으로 다시 로그인해줘." error={error instanceof Error ? error.message : "로그인이 필요해."} />;
  }
  const [bankResult, budgetResult, cardResult, recordResult, detailResult] = await Promise.allSettled([listUnresolvedWithdrawalTransactions(actor.organization_id), listExpenseBudgetProfiles(actor.organization_id), listUnresolvedCorporateCardTransactions(actor.organization_id), listQuickExpenseRecords(actor.organization_id), listOperatingExpenseDetails(actor.organization_id)]);
  return <QuickExpensePage key={`${entry.method}:${entry.sourceId}`} initialPaymentMethod={entry.method} initialSourceId={entry.sourceId} attachEvidence={hasSupabaseSecretConfig() ? attachQuickExpenseEvidenceAction : undefined} discardEvidence={hasSupabaseSecretConfig() ? discardUnlinkedExpenseEvidenceAction : undefined} getEvidenceOcrJob={hasSupabaseSecretConfig() ? getExpenseEvidenceOcrJobAction : undefined} getPrintEvidence={hasSupabaseSecretConfig() ? getQuickExpensePrintEvidenceAction : undefined} retryEvidenceOcrJob={hasSupabaseSecretConfig() ? retryExpenseEvidenceOcrJobAction : undefined} importCardTransactions={hasSupabaseSecretConfig() ? importCorporateCardTransactionsAction : undefined} linkCardTransaction={hasSupabaseSecretConfig() ? linkQuickExpenseCardAction : undefined} initialBankTransactions={bankResult.status === "fulfilled" ? bankResult.value : []} initialBudgetItems={budgetResult.status === "fulfilled" ? Object.keys(budgetResult.value) : []} initialExpenseDetails={detailResult.status === "fulfilled" ? detailResult.value : []} initialCardTransactions={cardResult.status === "fulfilled" ? cardResult.value : []} initialRecords={recordResult.status === "fulfilled" ? recordResult.value : []} persistRecord={hasSupabaseSecretConfig() ? saveQuickExpenseRecordAction : undefined} />;
}
