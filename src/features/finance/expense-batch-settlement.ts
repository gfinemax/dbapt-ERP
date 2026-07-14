import type { ExpenseEvidenceAttachment } from "./expense-evidence";

export type BatchSettlementAction = "ADDITIONAL_PAYMENT" | "NO_DIFFERENCE" | "REFUND_REQUIRED";

export function calculateBatchEvidenceSettlement(input: {
  advancePaidAmount: number;
  evidenceFiles: ExpenseEvidenceAttachment[];
}) {
  const duplicateIds = findDuplicateEvidenceIds(input.evidenceFiles);
  const confirmedFiles = input.evidenceFiles.filter((file) => file.ocrStatus === "CONFIRMED");
  const confirmedReceiptTotal = confirmedFiles.reduce((sum, file) => sum + getEvidenceTotal(file), 0);
  const failedCount = input.evidenceFiles.filter((file) => file.ocrStatus === "FAILED").length;
  const pendingCount = input.evidenceFiles.length - confirmedFiles.length - failedCount;
  const difference = input.advancePaidAmount - confirmedReceiptTotal;
  const action: BatchSettlementAction = difference > 0 ? "REFUND_REQUIRED" : difference < 0 ? "ADDITIONAL_PAYMENT" : "NO_DIFFERENCE";
  const errors: string[] = [];
  if (!input.evidenceFiles.length) errors.push("정산할 증빙자료를 한 개 이상 등록해주세요.");
  if (pendingCount) errors.push(`OCR 확인이 끝나지 않은 증빙이 ${pendingCount}개 있습니다.`);
  if (failedCount) errors.push(`OCR 처리에 실패한 증빙이 ${failedCount}개 있습니다.`);
  if (duplicateIds.size) errors.push("중복 가능성이 있는 증빙을 확인해주세요.");
  if (confirmedFiles.some((file) => getEvidenceTotal(file) <= 0)) errors.push("금액이 확인되지 않은 증빙이 있습니다.");

  return {
    action,
    additionalPaymentAmount: action === "ADDITIONAL_PAYMENT" ? Math.abs(difference) : 0,
    canApprove: errors.length === 0,
    confirmedCount: confirmedFiles.length,
    confirmedReceiptTotal,
    difference,
    duplicateIds,
    errors,
    failedCount,
    pendingCount,
    refundAmount: action === "REFUND_REQUIRED" ? difference : 0,
    totalCount: input.evidenceFiles.length,
  };
}

export function findDuplicateEvidenceIds(files: ExpenseEvidenceAttachment[]) {
  const signatures = new Map<string, string[]>();
  for (const file of files) {
    const total = getEvidenceTotal(file);
    const signature = [file.ocrData.issuerBusinessNumber || file.ocrData.issuer, file.ocrData.documentDate, total || ""].join("|");
    if (!file.ocrData.documentDate || !total || (!file.ocrData.issuer && !file.ocrData.issuerBusinessNumber)) continue;
    signatures.set(signature, [...(signatures.get(signature) ?? []), file.id]);
  }
  return new Set(Array.from(signatures.values()).filter((ids) => ids.length > 1).flat());
}

export function getEvidenceTotal(file: ExpenseEvidenceAttachment) {
  return file.ocrData.totalAmount ?? (file.ocrData.supplyAmount ?? 0) + (file.ocrData.vatAmount ?? 0);
}
