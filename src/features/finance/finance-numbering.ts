export type DocumentNumberKind = "EXPENSE_RESOLUTION" | "EXPENSE_VOUCHER" | "REFUND_RESOLUTION" | "INCOME_VOUCHER";

export const documentNumberPrefixes: Record<DocumentNumberKind, string> = {
  EXPENSE_RESOLUTION: "지결",
  EXPENSE_VOUCHER: "지출",
  REFUND_RESOLUTION: "환결",
  INCOME_VOUCHER: "수입",
};

export function createDocumentNo(kind: DocumentNumberKind, sequence: number, year = 2026) {
  return `${documentNumberPrefixes[kind]}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function getNextDocumentNo(kind: DocumentNumberKind, existingDocumentNos: string[], year = 2026) {
  const prefix = documentNumberPrefixes[kind].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)`);
  const maxSequence = existingDocumentNos.reduce((max, documentNo) => {
    const match = documentNo.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return createDocumentNo(kind, maxSequence + 1, year);
}
