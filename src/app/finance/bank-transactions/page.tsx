import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionUploadPage } from "@/features/finance/bank-transaction-upload-page";
import { listBankTransactionsForSubjectReview } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { confirmBankTransactionSubjectsAction, createBankTransactionsAction } from "./actions";

export default async function FinanceBankTransactionsRoute() {
  const actor = await requireExpenseActor("READ");
  const [initialAccountSubjects, initialBankAccounts, initialReviewTransactions] = await Promise.all([
    listAccountSubjectsFromSupabase(actor.organization_id),
    listBankAccountsFromSupabase(actor.organization_id),
    listBankTransactionsForSubjectReview(actor.organization_id),
  ]);

  return (
    <BankTransactionUploadPage
      createBankTransactions={hasSupabaseSecretConfig() ? createBankTransactionsAction : undefined}
      confirmBankTransactionSubjects={hasSupabaseSecretConfig() ? confirmBankTransactionSubjectsAction : undefined}
      initialAccountSubjects={initialAccountSubjects ?? undefined}
      initialBankAccounts={initialBankAccounts ?? undefined}
      initialReviewTransactions={initialReviewTransactions}
    />
  );
}
