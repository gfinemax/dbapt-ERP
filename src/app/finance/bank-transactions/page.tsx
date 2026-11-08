import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { saveBankTransactionReviewAction } from "@/app/finance/bank-transactions/actions";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { BankTransactionListPage } from "@/features/finance/bank-transaction-list-page";
import {
  countBankTransactionsByStatus,
  loadFilteredFinancialActivitySummary,
  loadFinancialActivitySummary,
  loadLedgerBankSourceSummary,
  loadBankTransactionSourceReconciliationSummary,
  loadBankTransactionRulePreview,
  listBankTransactions,
  type BankTransactionClassificationStatus,
  type BankTransactionSourceReconciliationStatus,
  type BankTransactionStatusCounts,
  type FinancialActivityOrigin,
} from "@/features/finance/bank-transaction-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";

const classificationStatuses = new Set<BankTransactionClassificationStatus>([
  "UNREVIEWED",
  "RECOMMENDED",
  "CONFIRMED",
  "DEFERRED",
  "EXCLUDED",
]);
const activityOrigins = new Set<Exclude<FinancialActivityOrigin, "ALL">>(["BANK_TRANSACTION", "EXTERNAL_RECOGNITION"]);

export default async function FinanceBankTransactionsRoute({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; origin?: string; page?: string; q?: string; sourceReview?: string; status?: string; to?: string; transactionId?: string }>;
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
    originType: activityOrigins.has(query.origin as Exclude<FinancialActivityOrigin, "ALL">)
      ? query.origin as Exclude<FinancialActivityOrigin, "ALL">
      : undefined,
    query: query.q?.trim().slice(0, 100) || undefined,
    sourceReconciliationStatus: query.sourceReview === "required"
      ? "SOURCE_REVIEW_REQUIRED" as BankTransactionSourceReconciliationStatus
      : undefined,
  };
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let accessError: string | undefined;
  try {
    actor = await requireExpenseActor("READ");
  } catch (error) {
    accessError = error instanceof Error ? error.message : "은행거래 조회 권한을 확인하지 못했어.";
  }

  const emptyStatusCounts: BankTransactionStatusCounts = { ALL: 0, CONFIRMED: 0, DEFERRED: 0, EXCLUDED: 0, RECOMMENDED: 0, UNREVIEWED: 0 };
  const [bankAccounts, accountSubjects, sourceReconciliationSummary, activitySummary] = actor ? await Promise.all([
    listBankAccountsFromSupabase(actor.organization_id),
    listAccountSubjectsFromSupabase(actor.organization_id),
    filters.originType === "EXTERNAL_RECOGNITION"
      ? Promise.resolve(undefined)
      : loadBankTransactionSourceReconciliationSummary(actor.organization_id, filters.bankAccountId).catch(() => undefined),
    loadFinancialActivitySummary(actor.organization_id).catch(() => undefined),
  ]) : [[], [], undefined, undefined];
  const sourceReviewTransactionIds = filters.sourceReconciliationStatus
    ? sourceReconciliationSummary?.issues.map((issue) => issue.bankTransactionId) ?? []
    : undefined;
  const [pageData, statusCounts, ledgerSourceSummary, rulePreview, filteredSummary] = actor ? await Promise.all([
    listBankTransactions(actor.organization_id, page, filters, sourceReviewTransactionIds),
    countBankTransactionsByStatus(actor.organization_id, {
      bankAccountId: filters.bankAccountId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      originType: filters.originType,
      query: filters.query,
      sourceReconciliationStatus: filters.sourceReconciliationStatus,
    }, sourceReviewTransactionIds).catch(() => emptyStatusCounts),
    filters.bankAccountId
      ? loadLedgerBankSourceSummary(actor.organization_id, filters.bankAccountId).catch(() => undefined)
      : Promise.resolve(undefined),
    query.transactionId?.trim()
      ? loadBankTransactionRulePreview(actor.organization_id, actor.user_id, query.transactionId.trim()).catch(() => undefined)
      : Promise.resolve(undefined),
    loadFilteredFinancialActivitySummary(actor.organization_id, filters, sourceReviewTransactionIds).catch(() => undefined),
  ]) : [{ page, pageSize: 50, rows: [], totalCount: 0, totalPages: 1 }, emptyStatusCounts, undefined, undefined, undefined];
  const issuesByTransaction = new Map(sourceReconciliationSummary?.issues.map((issue) => [issue.bankTransactionId, issue]) ?? []);
  const pageDataWithReconciliation = {
    ...pageData,
    rows: pageData.rows.map((row) => ({ ...row, sourceReconciliationIssue: issuesByTransaction.get(row.id) })),
  };

  return (
    <BankTransactionListPage
      accessError={accessError}
      accountSubjects={accountSubjects ?? []}
      bankAccounts={bankAccounts ?? []}
      canExport={Boolean(actor?.permissions.includes("ADMIN"))}
      filters={filters}
      activitySummary={activitySummary}
      filteredSummary={filteredSummary}
      logoutAction={actor ? reimbursementLogout : undefined}
      ledgerSourceSummary={ledgerSourceSummary}
      pageData={pageDataWithReconciliation}
      rulePreview={rulePreview}
      selectedTransactionId={query.transactionId?.trim()}
      saveReviewAction={actor?.permissions.includes("ADMIN") ? saveBankTransactionReviewAction : undefined}
      sourceReconciliationSummary={sourceReconciliationSummary}
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
