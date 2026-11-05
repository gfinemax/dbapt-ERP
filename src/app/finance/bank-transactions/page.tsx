import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionUploadPage } from "@/features/finance/bank-transaction-upload-page";
import { listBankTransactionsForSubjectReview } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { emptyLedgerBankBackfillStatus } from "@/features/finance/ledger-bank-backfill-shared";
import { loadLedgerBankBackfillStatus } from "@/features/finance/ledger-bank-transaction-backfill";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { emptyLedgerBankSubjectRuleWorkboard, loadLedgerBankSubjectRuleWorkboard } from "@/features/finance/ledger-bank-subject-rules";
import {
  confirmBankTransactionSubjectsAction,
  createBankTransactionsAction,
  saveLedgerBankSubjectRulesAction,
  setLedgerBankAccountMappingAction,
  syncLedgerAccountSubjectsAction,
  syncLedgerBankTransactionsAction,
} from "./actions";

export default async function FinanceBankTransactionsRoute({
  searchParams,
}: {
  searchParams: Promise<{ reviewPage?: string }>;
}) {
  const query = await searchParams;
  const parsedReviewPage = Number.parseInt(query.reviewPage ?? "1", 10);
  const reviewPage = Number.isSafeInteger(parsedReviewPage) && parsedReviewPage > 0 ? parsedReviewPage : 1;
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
  const accountSubjectsPromise = actor
    ? listAccountSubjectsFromSupabase(actor.organization_id).then((subjects) => subjects ?? [])
    : Promise.resolve([]);
  const bankAccountsPromise = actor ? listBankAccountsFromSupabase(actor.organization_id) : Promise.resolve([]);
  const reviewTransactionsPromise = actor
    ? listBankTransactionsForSubjectReview(actor.organization_id, reviewPage)
    : Promise.resolve({ page: reviewPage, pageSize: 200, rows: [], totalCount: 0, totalPages: 1 });
  const initialAccountSubjects = await accountSubjectsPromise;
  const ledgerSubjectRules = actor && remoteEnabled
    ? loadLedgerBankSubjectRuleWorkboard(actor.organization_id, initialAccountSubjects).then((workboard) => ({ error: undefined, workboard })).catch(() => ({
      error: "Ledger 계정과목 매핑 작업대를 불러오지 못했어. 데이터베이스 마이그레이션 상태를 확인해줘.",
      workboard: emptyLedgerBankSubjectRuleWorkboard,
    }))
    : Promise.resolve({
      error: actor ? "Ledger 계정과목 매핑 환경설정을 확인해줘." : "Ledger 계정과목 매핑은 로그인 후 사용할 수 있어.",
      workboard: emptyLedgerBankSubjectRuleWorkboard,
    });
  const [initialBankAccounts, initialReviewTransactions, initialLedgerBackfill, initialLedgerSubjectRules] = await Promise.all([
    bankAccountsPromise,
    reviewTransactionsPromise,
    ledgerBackfill,
    ledgerSubjectRules,
  ]);

  return (
    <BankTransactionUploadPage
      createBankTransactions={remoteEnabled ? createBankTransactionsAction : undefined}
      confirmBankTransactionSubjects={remoteEnabled ? confirmBankTransactionSubjectsAction : undefined}
      accessError={accessError}
      initialAccountSubjects={initialAccountSubjects ?? []}
      initialBankAccounts={initialBankAccounts ?? []}
      initialLedgerBackfillStatus={initialLedgerBackfill.status}
      initialLedgerSubjectRuleWorkboard={initialLedgerSubjectRules.workboard}
      ledgerBackfillError={initialLedgerBackfill.error}
      ledgerSubjectRuleError={initialLedgerSubjectRules.error}
      initialReviewPage={initialReviewTransactions.page}
      initialReviewPageSize={initialReviewTransactions.pageSize}
      initialReviewTotalCount={initialReviewTransactions.totalCount}
      initialReviewTotalPages={initialReviewTransactions.totalPages}
      initialReviewTransactions={initialReviewTransactions.rows}
      logoutAction={actor ? reimbursementLogout : undefined}
      mapLedgerBankAccount={actor && remoteEnabled ? setLedgerBankAccountMappingAction : undefined}
      saveLedgerSubjectRules={actor && remoteEnabled ? saveLedgerBankSubjectRulesAction : undefined}
      syncLedgerAccountSubjects={actor && remoteEnabled ? syncLedgerAccountSubjectsAction : undefined}
      syncLedgerBankTransactions={actor && remoteEnabled ? syncLedgerBankTransactionsAction : undefined}
      userLabel={actor?.display_name}
    />
  );
}
