import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionListPage } from "@/features/finance/bank-transaction-list-page";
import {
  listBankTransactions,
  type BankTransactionClassificationStatus,
} from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";

const classificationStatuses = new Set<BankTransactionClassificationStatus>([
  "UNREVIEWED",
  "RECOMMENDED",
  "CONFIRMED",
  "DEFERRED",
  "EXCLUDED",
]);

export default async function FinanceBankTransactionsRoute({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; page?: string; status?: string; transactionId?: string }>;
}) {
  const query = await searchParams;
  const parsedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const classificationStatus = classificationStatuses.has(query.status as BankTransactionClassificationStatus)
    ? query.status as BankTransactionClassificationStatus
    : undefined;
  const filters = {
    bankAccountId: query.accountId?.trim() || undefined,
    classificationStatus,
  };
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "은행거래 조회 권한을 확인하지 못했어.";
  }

  const [bankAccounts, pageData] = actor ? await Promise.all([
    listBankAccountsFromSupabase(actor.organization_id),
    listBankTransactions(actor.organization_id, page, filters),
  ]) : [[], { page, pageSize: 50, rows: [], totalCount: 0, totalPages: 1 }];

  return (
    <BankTransactionListPage
      accessError={accessError}
      bankAccounts={bankAccounts ?? []}
      filters={filters}
      logoutAction={actor ? reimbursementLogout : undefined}
      pageData={pageData}
      selectedTransactionId={query.transactionId?.trim()}
      userLabel={actor?.display_name}
    />
  );
}
