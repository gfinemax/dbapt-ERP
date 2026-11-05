import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionUploadPage } from "@/features/finance/bank-transaction-upload-page";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { createBankTransactionsAction } from "../actions";

export default async function FinanceBankTransactionUploadRoute() {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "은행거래 업로드 권한을 확인하지 못했어.";
  }

  const [bankAccounts, accountSubjects] = actor ? await Promise.all([
    listBankAccountsFromSupabase(actor.organization_id),
    listAccountSubjectsFromSupabase(actor.organization_id),
  ]) : [[], []];

  return (
    <BankTransactionUploadPage
      accessError={accessError}
      createBankTransactions={actor && hasSupabaseSecretConfig() ? createBankTransactionsAction : undefined}
      initialAccountSubjects={accountSubjects ?? []}
      initialBankAccounts={bankAccounts ?? []}
      logoutAction={actor ? reimbursementLogout : undefined}
      userLabel={actor?.display_name}
    />
  );
}
