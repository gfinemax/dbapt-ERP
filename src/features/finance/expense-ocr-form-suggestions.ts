import type { EvidenceOcrData } from "./expense-evidence";

export type ExpenseOcrFormSuggestions = {
  projectName?: string;
  reason?: string;
  subject?: string;
};

export function buildExpenseOcrFormSuggestions(input: {
  budgetItems: string[];
  ocr?: EvidenceOcrData;
  projectOptions: string[];
}): ExpenseOcrFormSuggestions {
  const ocr = input.ocr;
  if (!ocr) return {};
  const itemNames = (ocr.items?.map((item) => item.itemName) ?? [ocr.itemName]).filter((value): value is string => Boolean(value?.trim()));
  const budgetLeaves = Array.from(new Set(input.budgetItems.map((item) => item.split(" > ").at(-1)?.trim()).filter((value): value is string => Boolean(value))));
  const subjectParts = budgetLeaves.map(toSubjectPart).filter(Boolean);
  const subject = subjectParts.length
    ? `${joinKorean(subjectParts.slice(0, 2))} 구입`
    : itemNames.length
      ? `${summarizeItemName(itemNames[0])}${itemNames.length > 1 ? ` 외 ${itemNames.length - 1}종` : ""} 구입`
      : ocr.issuer
        ? `${ocr.issuer} 지출`
        : undefined;
  const itemSummary = itemNames.length
    ? `${itemNames.slice(0, 3).map(summarizeItemName).join(", ")}${itemNames.length > 3 ? ` 외 ${itemNames.length - 3}종` : ""}`
    : subjectParts.join(" 및 ") || "필요 물품";
  const reason = `조합 운영에 필요한 ${itemSummary}을(를)${ocr.issuer ? ` ${ocr.issuer}에서` : ""} 구입함`;
  const preferredProject = budgetLeaves.some((item) => /(사무용품|소모품|도서인쇄|사무등록)/.test(item))
    ? "사무국 비품 구입"
    : "사무국 운영관리";

  return {
    projectName: input.projectOptions.includes(preferredProject) ? preferredProject : undefined,
    reason,
    subject: subject?.slice(0, 60),
  };
}

function summarizeItemName(value: string) {
  return value.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
}

function toSubjectPart(value: string) {
  const normalized = value.replace(/비$/, "");
  if (normalized === "도서인쇄") return "인쇄물";
  return normalized;
}

function joinKorean(values: string[]) {
  return values.length > 1 ? `${values[0]} 및 ${values[1]}` : values[0] ?? "";
}
