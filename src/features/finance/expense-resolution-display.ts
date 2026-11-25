import type { ManagedExpenseResolution } from "./expense-resolution-page";

export function isPostApprovalResolution(resolution: {
  expenseKind?: string;
  isPostApproval?: boolean;
}) {
  return resolution.isPostApproval === true || resolution.expenseKind === "BANK_POST_APPROVAL";
}

export function getResolutionListSubject(resolution: Pick<ManagedExpenseResolution,
  "expenseKind" | "isPostApproval" | "operationExpenseDetail" | "projectName" | "resolutionType" | "subject"
>) {
  const subject = resolution.subject?.trim()
    || (resolution.resolutionType === "BATCH" ? resolution.projectName : resolution.operationExpenseDetail)
    || "건명 미입력";
  if (!isPostApprovalResolution(resolution)) return subject;

  return subject.replace(/\s*사후결의$/u, "").trim() || subject;
}

export function getBudgetOverageAmount(remainingBudgetAmount: number) {
  return Math.max(0, -remainingBudgetAmount);
}

export function getResolutionOverBudgetAmount(resolution: {
  budgetSnapshot?: { remainingBudgetAmount?: number };
  resolutionType?: string;
  totalOverBudgetAmount?: number;
}) {
  if (resolution.resolutionType === "BATCH") {
    return Math.max(0, resolution.totalOverBudgetAmount ?? 0);
  }

  return getBudgetOverageAmount(resolution.budgetSnapshot?.remainingBudgetAmount ?? 0);
}

export function getResolutionAccountTitle(resolution: ManagedExpenseResolution) {
  if (resolution.correctedAccountSubjectId && resolution.representativeAccountTitle) {
    return resolution.representativeAccountTitle;
  }
  const selectedDetailTitle = resolution.resolutionType !== "BATCH"
    ? resolution.operationExpenseDetail?.trim()
    : "";
  if (selectedDetailTitle) return selectedDetailTitle;

  const titles = [...new Set((resolution.resolutionType === "BATCH"
    ? resolution.expenseItems.map((item) => item.accountTitle)
    : (resolution.accountAllocations ?? []).map((item) => item.accountTitle))
    .map((title) => title?.trim()).filter(Boolean))];
  return titles.length > 1 ? "복합계정" : titles[0] || resolution.representativeAccountTitle || "미지정";
}
