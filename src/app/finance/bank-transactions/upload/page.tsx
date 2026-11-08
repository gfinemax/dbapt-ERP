import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionUploadPage } from "@/features/finance/bank-transaction-upload-page";
import { listBankTransactionSheetImportHistory } from "@/features/finance/bank-transaction-sheet-import-history";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import {
  applyBankTransactionSheetEnrichmentAction,
  applyBankTransactionReplacementAction,
  createBankTransactionsAction,
  loadBankTransactionReplacementPreviewAction,
  previewBankTransactionSheetEnrichmentAction,
} from "../actions";

export default async function FinanceBankTransactionUploadRoute() {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "은행거래 업로드 권한을 확인하지 못했어.";
  }

  const [bankAccounts, accountSubjects, sheetImportHistory] = actor ? await Promise.all([
    listBankAccountsFromSupabase(actor.organization_id),
    listAccountSubjectsFromSupabase(actor.organization_id),
    listBankTransactionSheetImportHistory(actor.organization_id).catch(() => []),
  ]) : [[], [], []];
  const canReplaceLedgerBank = actor?.permissions.some((permission) => ["ADMIN", "CLOSE"].includes(permission)) ?? false;

  return (
    <BankTransactionUploadPage
      accessError={accessError}
      applyBankTransactionSheetEnrichment={canReplaceLedgerBank && hasSupabaseSecretConfig() ? applyBankTransactionSheetEnrichmentAction : undefined}
      createBankTransactions={actor && hasSupabaseSecretConfig() ? createBankTransactionsAction : undefined}
      applyBankTransactionReplacement={canReplaceLedgerBank && hasSupabaseSecretConfig() ? applyBankTransactionReplacementAction : undefined}
      initialAccountSubjects={accountSubjects ?? []}
      initialBankAccounts={bankAccounts ?? []}
      initialSheetImportHistory={sheetImportHistory}
      loadBankTransactionReplacementPreview={canReplaceLedgerBank && hasSupabaseSecretConfig() ? loadBankTransactionReplacementPreviewAction : undefined}
      logoutAction={actor ? reimbursementLogout : undefined}
      previewBankTransactionSheetEnrichment={canReplaceLedgerBank && hasSupabaseSecretConfig() ? previewBankTransactionSheetEnrichmentAction : undefined}
      userLabel={actor?.display_name}
    />
  );
}
