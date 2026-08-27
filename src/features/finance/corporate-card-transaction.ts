export type CorporateCardTransactionCandidate = {
  amount: number;
  approvalNo?: string;
  approvedAt: string;
  cardLastFour: string;
  cardName: string;
  category?: string;
  id: string;
  linkedResolutionId?: string;
  linkedResolutionNo?: string;
  merchantName: string;
  memo?: string;
};

export type CorporateCardReconciliationStatus = "PENDING" | "MATCHED";

export type CorporateCardMatchCandidate = CorporateCardTransactionCandidate & {
  dateDifferenceDays: number;
  matchLevel: "EXACT" | "LIKELY";
};

export function isTaxiCardTransaction(transaction: CorporateCardTransactionCandidate) {
  const searchable = `${transaction.merchantName} ${transaction.category ?? ""} ${transaction.memo ?? ""}`.toLowerCase();
  return ["택시", "카카오t", "카카오 t", "타다", "우티", "uber", "taxi"].some((keyword) => searchable.includes(keyword));
}

export function findCorporateCardMatchCandidates({ amount, cardLastFour, expenseDate, transactions }: {
  amount: number;
  cardLastFour?: string;
  expenseDate: string;
  transactions: CorporateCardTransactionCandidate[];
}): CorporateCardMatchCandidate[] {
  if (!amount || !expenseDate) return [];
  const targetTime = new Date(`${expenseDate}T00:00:00+09:00`).getTime();
  return transactions.flatMap((transaction) => {
    if (Math.abs(transaction.amount - amount) > 0.5) return [];
    if (cardLastFour?.trim() && transaction.cardLastFour !== cardLastFour.trim()) return [];
    const transactionDate = transaction.approvedAt.slice(0, 10);
    const transactionTime = new Date(`${transactionDate}T00:00:00+09:00`).getTime();
    const dateDifferenceDays = Math.abs(Math.round((transactionTime - targetTime) / 86_400_000));
    if (dateDifferenceDays > 2) return [];
    return [{ ...transaction, dateDifferenceDays, matchLevel: dateDifferenceDays === 0 ? "EXACT" as const : "LIKELY" as const }];
  }).sort((a, b) => a.dateDifferenceDays - b.dateDifferenceDays || b.approvedAt.localeCompare(a.approvedAt));
}
