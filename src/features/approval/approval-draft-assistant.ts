import type { ApprovalDocumentType } from "./approval-domain";
import type { ApprovalBudgetOption } from "./approval-settings-repository";

type DraftAssistantInput = {
  accountSubjects: string[];
  body: string;
  budgets: ApprovalBudgetOption[];
  counterpartyName: string;
  documentType: ApprovalDocumentType;
};

export type ApprovalDraftSuggestion = {
  accountSubject: string;
  budgetId: string;
  budgetItem: string;
  confidence: "높음" | "보통";
  reason: string;
  title: string;
};

const CLASSIFICATION_RULES = [
  { keywords: ["회의", "간담", "음료", "커피", "식사"], subjects: ["회의비", "업무추진비", "복리후생비"], label: "회의·음료" },
  { keywords: ["사무", "비품", "문구", "프린터", "토너", "용지"], subjects: ["사무용품비", "소모품비", "비품비"], label: "사무용품·비품" },
  { keywords: ["법무", "세무", "자문", "용역", "컨설팅"], subjects: ["용역비", "지급수수료", "자문료"], label: "전문용역" },
  { keywords: ["출장", "교통", "택시", "주차", "숙박"], subjects: ["여비교통비", "출장비"], label: "출장·교통" },
  { keywords: ["통신", "전화", "인터넷", "우편"], subjects: ["통신비", "우편료"], label: "통신" },
  { keywords: ["임대", "월세", "관리비"], subjects: ["임차료", "임대료", "관리비"], label: "임차·관리" },
  { keywords: ["공사", "시공", "보수", "수리"], subjects: ["공사비", "수선비", "시설비"], label: "공사·수선" },
] as const;

export function suggestApprovalDraft(input: DraftAssistantInput): ApprovalDraftSuggestion {
  const source = `${input.body} ${input.counterpartyName}`.trim();
  const normalized = source.toLowerCase();
  const rule = CLASSIFICATION_RULES.find((candidate) =>
    candidate.keywords.some((keyword) => normalized.includes(keyword)),
  );
  const preferredSubjects = rule?.subjects ?? [];
  const accountSubject =
    input.accountSubjects.find((subject) =>
      preferredSubjects.some((preferred) => subject.includes(preferred) || preferred.includes(subject)),
    ) ?? "";
  const budget = findMatchingBudget(input.budgets, accountSubject, preferredSubjects);
  const title = buildSuggestedTitle(input.body, input.documentType, rule?.label);

  return {
    accountSubject,
    budgetId: budget?.id ?? "",
    budgetItem: budget?.budgetItem ?? "",
    confidence: rule && (accountSubject || budget) ? "높음" : "보통",
    reason: rule
      ? `${rule.label} 관련 표현과 등록된 회계 정보를 기준으로 추천했어요.`
      : "작성 내용의 핵심 표현을 기준으로 제목을 정리했어요.",
    title,
  };
}

function findMatchingBudget(
  budgets: ApprovalBudgetOption[],
  accountSubject: string,
  preferredSubjects: readonly string[],
) {
  return budgets.find((budget) => {
    const label = budget.budgetItem.toLowerCase();
    return (
      (accountSubject && (label.includes(accountSubject.toLowerCase()) || accountSubject.toLowerCase().includes(label))) ||
      preferredSubjects.some((subject) => label.includes(subject.toLowerCase()) || subject.toLowerCase().includes(label))
    );
  });
}

function buildSuggestedTitle(
  body: string,
  documentType: ApprovalDocumentType,
  category?: string,
) {
  const cleaned = body
    .replace(/\d{1,3}(?:,\d{3})*(?:만원|천원|원)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/에서\s+에(?=\s|$)/g, "에서")
    .replace(/[.!?]+$/g, "")
    .trim();
  const core = cleaned.length > 30 ? `${cleaned.slice(0, 30).trim()}…` : cleaned;
  if (core) return `${core}${documentType === "EXPENSE" && !/(구입|구매|지출|지급|품의)$/.test(core) ? " 지출품의" : ""}`;
  if (category) return `${category} ${documentType === "EXPENSE" ? "지출품의" : "기안"}`;
  return documentType === "CONTRACT" ? "계약 검토 기안" : documentType === "EXPENSE" ? "지출품의" : "일반 기안";
}
