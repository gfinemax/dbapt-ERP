import type { ManagedExpenseResolution } from "./expense-resolution-page";

export function getResolutionAccountTitle(resolution: ManagedExpenseResolution) {
  const titles = [...new Set((resolution.resolutionType === "BATCH"
    ? resolution.expenseItems.map((item) => item.accountTitle)
    : (resolution.accountAllocations ?? []).map((item) => item.accountTitle))
    .map((title) => title?.trim()).filter(Boolean))];
  return titles.length > 1 ? "복합계정" : titles[0] || resolution.representativeAccountTitle || "미지정";
}
