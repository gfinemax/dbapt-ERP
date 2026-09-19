import { normalizeEvidenceVendorFields, type EvidenceOcrData } from "./expense-evidence";

export type ReimbursementOcrDraft = {
  amount?: string;
  evidenceKind?: "RECEIPT" | "BANK_TRANSFER" | "TRANSACTION_STATEMENT";
  merchant?: string;
  purpose?: string;
  usedOn?: string;
};

export function buildReimbursementOcrDraft(value: EvidenceOcrData): ReimbursementOcrDraft {
  const ocr = normalizeEvidenceVendorFields(value);
  const itemNames = (ocr.items?.map((item) => item.itemName) ?? [ocr.itemName])
    .filter((item): item is string => Boolean(item?.trim()))
    .map((item) => item.replace(/\s+/g, " ").trim());
  const itemSummary = itemNames.length
    ? `${itemNames.slice(0, 3).join(", ")}${itemNames.length > 3 ? ` 외 ${itemNames.length - 3}종` : ""}`
    : undefined;
  const purpose = itemSummary
    ? `${itemSummary} 구입`
    : ocr.issuer
      ? `${ocr.issuer} 업무 지출`
      : undefined;

  return {
    amount: ocr.totalAmount && ocr.totalAmount > 0 ? String(Math.round(ocr.totalAmount)) : undefined,
    evidenceKind: mapEvidenceKind(ocr.normalizedEvidenceType ?? ocr.documentType),
    merchant: ocr.issuer,
    purpose,
    usedOn: ocr.documentDate,
  };
}

function mapEvidenceKind(value?: string): ReimbursementOcrDraft["evidenceKind"] {
  if (!value) return undefined;
  if (/(이체|송금|입금)/.test(value)) return "BANK_TRANSFER";
  if (/(거래명세)/.test(value)) return "TRANSACTION_STATEMENT";
  return "RECEIPT";
}
