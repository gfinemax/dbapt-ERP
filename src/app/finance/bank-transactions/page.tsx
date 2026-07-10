import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionUploadPage } from "@/features/finance/bank-transaction-upload-page";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { createBankTransactionsAction } from "./actions";

export default async function FinanceBankTransactionsRoute() {
  const [initialAccountSubjects, initialBankAccounts] = await Promise.all([listAccountSubjectsFromSupabase(), listBankAccountsFromSupabase()]);

  return (
    <BankTransactionUploadPage
      createBankTransactions={hasSupabaseSecretConfig() ? createBankTransactionsAction : undefined}
      initialAccountSubjects={initialAccountSubjects ?? undefined}
      initialBankAccounts={initialBankAccounts ?? undefined}
    />
  );
}
