import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionUploadPage } from "@/features/finance/bank-transaction-upload-page";
import { listBankTransactionsForSubjectReview } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { emptyLedgerBankBackfillStatus } from "@/features/finance/ledger-bank-backfill-shared";
import { loadLedgerBankBackfillStatus } from "@/features/finance/ledger-bank-transaction-backfill";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import {
  confirmBankTransactionSubjectsAction,
  createBankTransactionsAction,
  setLedgerBankAccountMappingAction,
  syncLedgerBankTransactionsAction,
} from "./actions";

export default async function FinanceBankTransactionsRoute() {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "은행거래 조회 권한을 확인하지 못했어.";
  }
  const remoteEnabled = hasSupabaseSecretConfig();
  const ledgerBackfill = actor && remoteEnabled
    ? loadLedgerBankBackfillStatus().then((status) => ({ error: undefined, status })).catch(() => ({
      error: "Ledger 거래 이관 상태를 불러오지 못했어. 관리자에게 데이터베이스 반영 상태를 확인해줘.",
      status: emptyLedgerBankBackfillStatus,
    }))
    : Promise.resolve({
      error: actor ? "Ledger 연동 환경설정을 확인해줘." : "Ledger 거래 이관은 로그인 후 사용할 수 있어.",
      status: emptyLedgerBankBackfillStatus,
    });
  const [initialAccountSubjects, initialBankAccounts, initialReviewTransactions, initialLedgerBackfill] = actor ? await Promise.all([
    listAccountSubjectsFromSupabase(actor.organization_id),
    listBankAccountsFromSupabase(actor.organization_id),
    listBankTransactionsForSubjectReview(actor.organization_id),
    ledgerBackfill,
  ]) : [[], [], [], await ledgerBackfill];

  return (
    <BankTransactionUploadPage
      createBankTransactions={remoteEnabled ? createBankTransactionsAction : undefined}
      confirmBankTransactionSubjects={remoteEnabled ? confirmBankTransactionSubjectsAction : undefined}
      accessError={accessError}
      initialAccountSubjects={initialAccountSubjects ?? []}
      initialBankAccounts={initialBankAccounts ?? []}
      initialLedgerBackfillStatus={initialLedgerBackfill.status}
      ledgerBackfillError={initialLedgerBackfill.error}
      initialReviewTransactions={initialReviewTransactions}
      logoutAction={actor ? reimbursementLogout : undefined}
      mapLedgerBankAccount={actor && remoteEnabled ? setLedgerBankAccountMappingAction : undefined}
      syncLedgerBankTransactions={actor && remoteEnabled ? syncLedgerBankTransactionsAction : undefined}
      userLabel={actor?.display_name}
    />
  );
}
