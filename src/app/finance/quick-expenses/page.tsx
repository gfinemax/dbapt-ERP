import { listUnresolvedCorporateCardTransactions } from "@/features/finance/corporate-card-transaction-repository";
import { listUnresolvedWithdrawalTransactions } from "@/features/finance/expense-compliance-repository";
import { QuickExpensePage } from "@/features/finance/quick-expense-page";
import { listQuickExpenseRecords } from "@/features/finance/quick-expense-record-repository";
import { listExpenseBudgetProfiles } from "@/features/finance/budget-profile-repository";
import { listOperatingExpenseDetails } from "@/features/finance/operating-budget-repository";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { importCorporateCardTransactionsAction, linkQuickExpenseCardAction, saveQuickExpenseRecordAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function QuickExpensesRoute() {
  const [bankResult, budgetResult, cardResult, recordResult, detailResult] = await Promise.allSettled([listUnresolvedWithdrawalTransactions(), listExpenseBudgetProfiles(), listUnresolvedCorporateCardTransactions(), listQuickExpenseRecords(), listOperatingExpenseDetails()]);
  return <QuickExpensePage importCardTransactions={hasSupabaseSecretConfig() ? importCorporateCardTransactionsAction : undefined} linkCardTransaction={hasSupabaseSecretConfig() ? linkQuickExpenseCardAction : undefined} initialBankTransactions={bankResult.status === "fulfilled" ? bankResult.value : []} initialBudgetItems={budgetResult.status === "fulfilled" ? Object.keys(budgetResult.value) : []} initialExpenseDetails={detailResult.status === "fulfilled" ? detailResult.value : []} initialCardTransactions={cardResult.status === "fulfilled" ? cardResult.value : []} initialRecords={recordResult.status === "fulfilled" ? recordResult.value : []} persistRecord={hasSupabaseSecretConfig() ? saveQuickExpenseRecordAction : undefined} />;
}
