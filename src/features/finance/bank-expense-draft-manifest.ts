export type BankExpenseDraftEligibility = "EXISTING_LINK" | "HOLD" | "REVIEW_REQUIRED";

export type BankExpenseDraftManifestRow = {
  accountSubjectId?: string;
  accountSubjectName?: string;
  amount: number;
  approvalDocumentId?: string;
  bankTransactionId: string;
  budgetCandidateCount: number;
  budgetId?: string;
  budgetName?: string;
  classificationStatus: string;
  counterparty?: string;
  description: string;
  duplicateResolutionId?: string;
  duplicateResolutionNo?: string;
  eligibility: BankExpenseDraftEligibility;
  existingResolutionId?: string;
  existingResolutionNo?: string;
  expenseDetailCandidateCount: number;
  expenseDetailId?: string;
  expenseDetailName?: string;
  holdReason?: string;
  recommendationBasis: string;
  recommendationGroupKey?: string;
  sourceTransactionDate: string;
  voucherId?: string;
  voucherNo?: string;
};

export type BankExpenseDraftManifestGroup = {
  amount: number;
  count: number;
  key: string;
  rows: BankExpenseDraftManifestRow[];
};

export function getPreliminaryBankExpenseGroupKey(row: BankExpenseDraftManifestRow) {
  const canSuggest = row.eligibility === "REVIEW_REQUIRED" || row.holdReason === "세부항목 확정 필요";
  if (!canSuggest || !row.accountSubjectId || !row.budgetId || row.duplicateResolutionId || row.existingResolutionId || row.voucherId) return undefined;
  const exactPurpose = `${row.counterparty ?? ""} ${row.description}`.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  return [row.sourceTransactionDate.slice(0, 7), row.accountSubjectId, row.budgetId, row.expenseDetailId ?? "DETAIL_REVIEW", exactPurpose].join("|");
}

export function groupBankExpenseDraftManifest(rows: BankExpenseDraftManifestRow[]): BankExpenseDraftManifestGroup[] {
  const groups = new Map<string, BankExpenseDraftManifestRow[]>();
  for (const row of rows) {
    if (row.eligibility === "EXISTING_LINK" || (row.eligibility === "HOLD" && row.holdReason !== "세부항목 확정 필요")) continue;
    const groupKey = row.recommendationGroupKey ?? getPreliminaryBankExpenseGroupKey(row);
    if (!groupKey) continue;
    const existing = groups.get(groupKey);
    if (existing) existing.push(row);
    else groups.set(groupKey, [row]);
  }
  return [...groups.entries()]
    .map(([key, matchingRows]) => ({
      amount: matchingRows.reduce((sum, row) => sum + row.amount, 0),
      count: matchingRows.length,
      key,
      rows: matchingRows.toSorted((first, second) => first.sourceTransactionDate.localeCompare(second.sourceTransactionDate)),
    }))
    .filter((group) => group.count > 1)
    .toSorted((first, second) => first.rows[0]!.sourceTransactionDate.localeCompare(second.rows[0]!.sourceTransactionDate));
}

export function summarizeBankExpenseDraftManifest(rows: BankExpenseDraftManifestRow[]) {
  return rows.reduce((summary, row) => {
    summary.totalCount += 1;
    summary.totalAmount += row.amount;
    if (row.eligibility === "EXISTING_LINK") summary.existingLinkCount += 1;
    if (row.eligibility === "HOLD") summary.holdCount += 1;
    if (row.eligibility === "REVIEW_REQUIRED") summary.reviewCount += 1;
    return summary;
  }, { existingLinkCount: 0, holdCount: 0, reviewCount: 0, totalAmount: 0, totalCount: 0 });
}
