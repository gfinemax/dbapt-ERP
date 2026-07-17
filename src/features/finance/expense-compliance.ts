export const expenseKinds = ["GENERAL", "PERSONAL_REIMBURSEMENT", "BANK_POST_APPROVAL", "PETTY_CASH_BATCH", "RECURRING_BATCH"] as const;
export type ExpenseKind = (typeof expenseKinds)[number];

export const evidenceStatuses = ["QUALIFIED", "GENERAL", "ALTERNATIVE", "DEFICIENT", "NONE"] as const;
export type EvidenceStatus = (typeof evidenceStatuses)[number];

export const evidenceKinds = ["E_TAX_INVOICE", "INVOICE", "CARD_RECEIPT", "CASH_RECEIPT", "SIMPLE_RECEIPT", "BANK_TRANSFER", "TRANSACTION_STATEMENT", "BILL", "EXPENSE_FACT_CONFIRMATION", "OTHER_ALTERNATIVE", "NONE"] as const;
export type EvidenceKind = (typeof evidenceKinds)[number];

export type ExpenseComplianceSettings = {
  pettyCashLimit: number;
  monthlyPersonWarningLimit: number;
  pettyCashAllowedAccounts: string[];
  pettyCashExcludedKeywords: string[];
  allowNoEvidenceApproval: boolean;
  noEvidenceApproverRole?: string;
  allowPersonalReimbursement?: boolean;
  postApprovalMaxDays?: number;
  factConfirmerRoles?: string[];
  approvalLine?: string[];
};

export const defaultExpenseComplianceSettings: ExpenseComplianceSettings = {
  pettyCashLimit: 30_000,
  monthlyPersonWarningLimit: 100_000,
  pettyCashAllowedAccounts: ["사무용품비", "소모품비", "우편료·택배비", "복사·출력비", "소액 교통비·주차비", "업무용 생수·음료", "기타 통상적인 사무국 운영비"],
  pettyCashExcludedKeywords: ["계약금", "용역비", "자문료", "인건비", "급여", "수당", "조합장", "임원", "회의비", "식사비", "환불금", "토지매입", "사업비", "차입금", "대여금", "현금 인출", "목적 불분명", "자산"],
  allowNoEvidenceApproval: true,
  noEvidenceApproverRole: "조합장",
  allowPersonalReimbursement: true,
  postApprovalMaxDays: 180,
  factConfirmerRoles: ["사무장", "조합장"],
  approvalLine: ["부장", "사무장", "조합장"],
};

export type PettyCashTransaction = {
  id: string;
  transactionDate: string;
  spender: string;
  vendor: string;
  item: string;
  businessPurpose: string;
  accountTitle: string;
  amount: number;
  overrideReason?: string;
  evidenceKind?: EvidenceKind;
  evidenceStatus?: EvidenceStatus;
  factConfirmationId?: string;
};

export function normalizeEvidenceStatus(kind: EvidenceKind, requested: EvidenceStatus): EvidenceStatus {
  if (kind === "EXPENSE_FACT_CONFIRMATION" || kind === "OTHER_ALTERNATIVE") return requested === "DEFICIENT" ? "DEFICIENT" : "ALTERNATIVE";
  if (kind === "NONE") return "NONE";
  return requested;
}

export function validateExpenseCompliance(input: {
  expenseKind: ExpenseKind;
  actualExpenseDate?: string;
  postApprovalReason?: string;
  bankTransactionId?: string;
  evidenceKind: EvidenceKind;
  evidenceStatus: EvidenceStatus;
  missingEvidenceReason?: string;
  pettyCashItems?: PettyCashTransaction[];
  settings?: ExpenseComplianceSettings;
}) {
  const settings = input.settings ?? defaultExpenseComplianceSettings;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.actualExpenseDate) errors.push("실제 지출일을 입력해주세요.");
  if (input.expenseKind === "BANK_POST_APPROVAL") {
    if (!input.bankTransactionId) errors.push("통장 선출금 사후결의는 은행거래를 연결해야 합니다.");
    if (!input.postApprovalReason?.trim()) errors.push("사후결의 사유를 입력해주세요.");
  }
  const normalizedEvidenceStatus = normalizeEvidenceStatus(input.evidenceKind, input.evidenceStatus);
  if (["DEFICIENT", "NONE"].includes(normalizedEvidenceStatus) && !input.missingEvidenceReason?.trim()) errors.push("증빙 미첨부 사유를 입력해주세요.");
  if (normalizedEvidenceStatus === "NONE") warnings.push("증빙 없는 지출입니다. 결재권자의 추가 확인이 필요합니다.");
  if (normalizedEvidenceStatus === "NONE" && !settings.allowNoEvidenceApproval) errors.push("관리자 설정에 따라 증빙 없는 지출은 승인할 수 없습니다.");
  if (input.expenseKind === "PERSONAL_REIMBURSEMENT" && settings.allowPersonalReimbursement === false) errors.push("관리자 설정에 따라 개인 선지출 정산을 사용할 수 없습니다.");
  if (input.postApprovalReason?.trim() && input.actualExpenseDate && settings.postApprovalMaxDays) {
    const elapsedDays = Math.floor((Date.now() - new Date(`${input.actualExpenseDate}T00:00:00+09:00`).getTime()) / 86_400_000);
    if (elapsedDays > settings.postApprovalMaxDays) errors.push(`사후결의 허용기간 ${settings.postApprovalMaxDays}일을 초과했습니다.`);
  }

  const items = input.pettyCashItems ?? [];
  if (input.expenseKind === "PETTY_CASH_BATCH") {
    const monthlyBySpender = new Map<string, number>();
    for (const item of items) {
      if (item.amount > settings.pettyCashLimit) {
        if (!item.overrideReason?.trim()) errors.push(`${item.item}: 소액경비 기준을 초과했습니다. 일반 지출결의로 전환하거나 초과 사유가 필요합니다.`);
        else warnings.push(`${item.item}: 소액경비 기준 초과 사유가 입력되어 결재권자 확인이 필요합니다.`);
      }
      if (settings.pettyCashAllowedAccounts.length && !settings.pettyCashAllowedAccounts.includes(item.accountTitle)) errors.push(`${item.accountTitle}: 소액 일괄결의 허용 계정과목이 아닙니다.`);
      const searchable = `${item.accountTitle} ${item.item} ${item.businessPurpose}`;
      const excluded = settings.pettyCashExcludedKeywords.find((keyword) => searchable.includes(keyword));
      if (excluded) errors.push(`${item.item}: '${excluded}' 항목은 소액 일괄결의에서 제외됩니다.`);
      monthlyBySpender.set(item.spender, (monthlyBySpender.get(item.spender) ?? 0) + item.amount);
    }
    for (const [spender, amount] of monthlyBySpender) if (amount > settings.monthlyPersonWarningLimit) warnings.push(`${spender}의 월 누계 ${amount.toLocaleString("ko-KR")}원이 경고 기준을 초과했습니다.`);
    warnings.push(...detectSplitTransactions(items, settings.pettyCashLimit));
  }
  return { errors, normalizedEvidenceStatus, warnings };
}

export function detectSplitTransactions(items: PettyCashTransaction[], limit: number) {
  const groups = new Map<string, PettyCashTransaction[]>();
  for (const item of items) {
    const key = `${item.transactionDate}|${item.spender}|${item.vendor}|${item.accountTitle}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].filter((group) => group.length > 1 && group.every((item) => item.amount <= limit) && group.reduce((sum, item) => sum + item.amount, 0) > limit)
    .map((group) => `${group[0].vendor}의 동일·유사 거래 ${group.length}건이 분할결제로 의심됩니다.`);
}
