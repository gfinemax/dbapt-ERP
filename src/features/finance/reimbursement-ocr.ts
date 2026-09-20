import { normalizeEvidenceVendorFields, type EvidenceOcrData } from "./expense-evidence";
import { recommendExpenseBudget } from "./expense-budget-recommendation";

export type ReimbursementOcrDraft = {
  amount?: string;
  budgetId?: string;
  budgetItem?: string;
  evidenceKind?: "RECEIPT" | "BANK_TRANSFER" | "TRANSACTION_STATEMENT";
  merchant?: string;
  purpose?: string;
  usedOn?: string;
};

export function buildReimbursementOcrDraft(
  value: EvidenceOcrData,
  budgets: { id: string; budget_item: string }[] = [],
): ReimbursementOcrDraft {
  const ocr = normalizeEvidenceVendorFields(value);
  const itemNames = (ocr.items?.map((item) => item.itemName) ?? [ocr.itemName])
    .filter((item): item is string => Boolean(item?.trim()))
    .map((item) => item.replace(/\s+/g, " ").trim());
  const itemSummary = itemNames.length
    ? `${itemNames.slice(0, 3).join(", ")}${itemNames.length > 3 ? ` 외 ${itemNames.length - 3}종` : ""}`
    : undefined;
  const purpose = itemSummary ? `${itemSummary} 구입` : undefined;
  const recommendation = recommendExpenseBudget({
    evidenceText: ocr.recognizedText,
    itemName: itemNames.join(" ") || ocr.itemName,
    reason: purpose,
    vendorBusinessCategory: ocr.issuerBusinessCategory,
    vendorBusinessType: ocr.issuerBusinessType,
    vendorName: ocr.issuer,
  });
  const matchedBudget = recommendation
    ? budgets.find((budget) => normalizeBudgetItem(budget.budget_item) === normalizeBudgetItem(recommendation.budgetItem))
    : undefined;

  return {
    amount: ocr.totalAmount && ocr.totalAmount > 0 ? String(Math.round(ocr.totalAmount)) : undefined,
    budgetId: matchedBudget?.id,
    budgetItem: matchedBudget?.budget_item,
    evidenceKind: mapEvidenceKind(ocr.normalizedEvidenceType ?? ocr.documentType),
    merchant: ocr.issuer,
    purpose,
    usedOn: ocr.documentDate,
  };
}

function normalizeBudgetItem(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function mapEvidenceKind(value?: string): ReimbursementOcrDraft["evidenceKind"] {
  if (!value) return undefined;
  if (/(이체|송금|입금)/.test(value)) return "BANK_TRANSFER";
  if (/(거래명세)/.test(value)) return "TRANSACTION_STATEMENT";
  return "RECEIPT";
}
