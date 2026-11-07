import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionListPage } from "@/features/finance/bank-transaction-list-page";
import {
  countBankTransactionsByStatus,
  loadLedgerBankSourceSummary,
  listBankTransactions,
  type BankTransactionClassificationStatus,
  type BankTransactionStatusCounts,
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
  searchParams: Promise<{ accountId?: string; from?: string; page?: string; q?: string; status?: string; to?: string; transactionId?: string }>;
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
    dateFrom: validDate(query.from),
    dateTo: validDate(query.to),
    query: query.q?.trim().slice(0, 100) || undefined,
  };
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "은행거래 조회 권한을 확인하지 못했어.";
  }

  const emptyStatusCounts: BankTransactionStatusCounts = { ALL: 0, CONFIRMED: 0, DEFERRED: 0, EXCLUDED: 0, RECOMMENDED: 0, UNREVIEWED: 0 };
  const [bankAccounts, pageData, statusCounts, ledgerSourceSummary] = actor ? await Promise.all([
    listBankAccountsFromSupabase(actor.organization_id),
    listBankTransactions(actor.organization_id, page, filters),
    countBankTransactionsByStatus(actor.organization_id, {
      bankAccountId: filters.bankAccountId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      query: filters.query,
    }).catch(() => emptyStatusCounts),
    filters.bankAccountId
      ? loadLedgerBankSourceSummary(actor.organization_id, filters.bankAccountId).catch(() => undefined)
      : Promise.resolve(undefined),
  ]) : [[], { page, pageSize: 50, rows: [], totalCount: 0, totalPages: 1 }, emptyStatusCounts, undefined];

  return (
    <BankTransactionListPage
      accessError={accessError}
      bankAccounts={bankAccounts ?? []}
      filters={filters}
      logoutAction={actor ? reimbursementLogout : undefined}
      ledgerSourceSummary={ledgerSourceSummary}
      pageData={pageData}
      selectedTransactionId={query.transactionId?.trim()}
      statusCounts={statusCounts}
      userLabel={actor?.display_name}
    />
  );
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value;
}
