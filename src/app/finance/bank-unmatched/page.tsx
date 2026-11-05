import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { confirmBankTransactionSubjectsAction } from "@/app/finance/bank-transactions/actions";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { BankTransactionReviewPage } from "@/features/finance/bank-transaction-review-page";
import { listBankTransactionsForSubjectReview } from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";

export default async function FinanceBankUnmatchedRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const parsedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "미매칭 내역 조회 권한을 확인하지 못했어.";
  }
  const [accountSubjects, review] = actor ? await Promise.all([
    listAccountSubjectsFromSupabase(actor.organization_id),
    listBankTransactionsForSubjectReview(actor.organization_id, page),
  ]) : [[], { page, pageSize: 50, rows: [], totalCount: 0, totalPages: 1 }];

  return (
    <BankTransactionReviewPage
      accessError={accessError}
      accountSubjects={accountSubjects ?? []}
      confirmAssignments={actor && hasSupabaseSecretConfig() ? confirmBankTransactionSubjectsAction : undefined}
      initialTransactions={review.rows}
      logoutAction={actor ? reimbursementLogout : undefined}
      page={review.page}
      pageSize={review.pageSize}
      totalCount={review.totalCount}
      totalPages={review.totalPages}
      userLabel={actor?.display_name}
    />
  );
}
