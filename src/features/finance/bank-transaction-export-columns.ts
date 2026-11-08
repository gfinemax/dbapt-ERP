export const bankTransactionExportColumns = [
  { defaultSelected: true, id: "transactionDate", label: "거래일" },
  { defaultSelected: true, id: "transactionTime", label: "일시" },
  { defaultSelected: true, id: "account", label: "계좌" },
  { defaultSelected: true, id: "description", label: "적요" },
  { defaultSelected: true, id: "details", label: "거래내역" },
  { defaultSelected: true, id: "amount", label: "금액" },
  { defaultSelected: true, id: "accountSubject", label: "계정과목" },
  { defaultSelected: false, id: "counterparty", label: "거래처" },
  { defaultSelected: false, id: "transactionKind", label: "입출금 구분" },
  { defaultSelected: false, id: "classificationStatus", label: "분류 상태" },
  { defaultSelected: false, id: "balance", label: "거래 후 잔액" },
  { defaultSelected: false, id: "adminNote", label: "관리자 비고", sensitive: true },
  { defaultSelected: false, id: "sourceStatus", label: "원본 대조 상태" },
  { defaultSelected: false, id: "transactionId", label: "ERP 거래 ID", sensitive: true },
] as const;

export type BankTransactionExportColumnId = typeof bankTransactionExportColumns[number]["id"];

const allowedColumnIds = new Set<BankTransactionExportColumnId>(bankTransactionExportColumns.map((column) => column.id));

export const defaultBankTransactionExportColumns = bankTransactionExportColumns
  .filter((column) => column.defaultSelected)
  .map((column) => column.id);

export function normalizeBankTransactionExportColumns(value: unknown): BankTransactionExportColumnId[] {
  if (!Array.isArray(value)) return [...defaultBankTransactionExportColumns];
  const result: BankTransactionExportColumnId[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || !allowedColumnIds.has(candidate as BankTransactionExportColumnId)) continue;
    const id = candidate as BankTransactionExportColumnId;
    if (!result.includes(id)) result.push(id);
  }
  return result.length ? result : [...defaultBankTransactionExportColumns];
}

export function bankTransactionExportColumnLabel(id: BankTransactionExportColumnId) {
  return bankTransactionExportColumns.find((column) => column.id === id)?.label ?? id;
}
