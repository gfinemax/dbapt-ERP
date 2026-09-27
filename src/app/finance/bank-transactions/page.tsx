import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionUploadPage } from "@/features/finance/bank-transaction-upload-page";
import { listBankTransactionsForSubjectReview } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { confirmBankTransactionSubjectsAction, createBankTransactionsAction } from "./actions";

export default async function FinanceBankTransactionsRoute() {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "은행거래 조회 권한을 확인하지 못했어.";
  }
  const [initialAccountSubjects, initialBankAccounts, initialReviewTransactions] = actor ? await Promise.all([
    listAccountSubjectsFromSupabase(actor.organization_id),
    listBankAccountsFromSupabase(actor.organization_id),
    listBankTransactionsForSubjectReview(actor.organization_id),
  ]) : [[], [], []];

  return (
    <BankTransactionUploadPage
      createBankTransactions={hasSupabaseSecretConfig() ? createBankTransactionsAction : undefined}
      confirmBankTransactionSubjects={hasSupabaseSecretConfig() ? confirmBankTransactionSubjectsAction : undefined}
      accessError={accessError}
      initialAccountSubjects={initialAccountSubjects ?? []}
      initialBankAccounts={initialBankAccounts ?? []}
      initialReviewTransactions={initialReviewTransactions}
    />
  );
}
