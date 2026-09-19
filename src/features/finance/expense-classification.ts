export const classificationOptions = {
  cost_category: { UNKNOWN: "확인 필요", OPERATING: "운영비", BUSINESS: "사업비" },
  payment_method: { UNKNOWN: "확인 필요", CORPORATE_CARD: "법인카드", PERSONAL_CARD: "개인카드", BANK_TRANSFER: "계좌이체", CASH: "현금", UNPAID: "아직 미결제" },
  funding_origin: { UNKNOWN: "확인 필요", ORGANIZATION: "조합 자금", PERSONAL: "개인 자금", ADVANCE: "받은 선지급금" },
  processing_route: { UNKNOWN: "확인 필요", SIMPLE: "간편처리", SMALL_CONFIRMATION: "소액 확인처리", RESOLUTION: "지출결의" },
} as const;
export type ExpenseClassificationAxes = { [K in keyof typeof classificationOptions]: keyof typeof classificationOptions[K] };
export type ExpenseClassificationInput = ExpenseClassificationAxes & {
  transaction_id: string; expected_version: number; source_signature: string;
  advance_transaction_id: string | null; reason: string;
};
export type ExpenseClassification = ExpenseClassificationAxes & {
  transaction_id: string; version: number; source_signature: string;
  advance_transaction_id: string | null; reason: string;
  budget_state: "UNKNOWN" | "WITHIN" | "OVER_OR_UNBUDGETED";
};
export type ExpenseClassificationContext = {
  transactionId: string; sourceSignature: string; classification: ExpenseClassification | null;
  advances: { id: string; title: string }[];
};
export function validateClassification(input: ExpenseClassificationInput) {
  const errors: string[] = [];
  for (const key of Object.keys(classificationOptions) as (keyof ExpenseClassificationAxes)[]) {
    if (!Object.hasOwn(classificationOptions[key], input[key])) errors.push("분류 항목을 확인해줘.");
  }
  if (!Number.isSafeInteger(input.expected_version) || input.expected_version < 0) errors.push("분류 버전을 확인해줘.");
  if (!input.transaction_id || !input.source_signature) errors.push("원본 연결 정보를 확인해줘.");
  if (!input.reason?.trim() || input.reason.length > 2000) errors.push("분류 확인 사유를 2,000자 이내로 입력해줘.");
  if (input.cost_category === "BUSINESS" && !["UNKNOWN", "RESOLUTION"].includes(input.processing_route)) errors.push("사업비는 지출결의로 처리해야 해.");
  if (input.payment_method === "CORPORATE_CARD" && !["UNKNOWN", "ORGANIZATION"].includes(input.funding_origin)) errors.push("법인카드는 조합 자금으로 확인해줘.");
  if (input.funding_origin === "ADVANCE") {
    if (!input.advance_transaction_id || input.advance_transaction_id === input.transaction_id) errors.push("받은 선지급금을 선택해줘.");
    if (["UNPAID", "CORPORATE_CARD"].includes(input.payment_method)) errors.push("선지급금의 실제 사용 결제수단을 확인해줘.");
  } else if (input.advance_transaction_id) errors.push("선지급금 사용이 아닌 경우 선지급 연결을 제거해줘.");
  return errors;
}
