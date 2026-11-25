import type { ManagedExpenseResolution } from "./expense-resolution-page";
import { isLegacySmallExpenseResolution } from "./legacy-small-expense";
import type { ReimbursementMember } from "./reimbursement-domain";

export type ExpenseCorrectionOption = {
  accountId: string;
  accountName: string;
  budgetId: string;
  budgetName: string;
  detailId: string;
  detailName: string;
};

export type ExpenseCorrectionInput = {
  id: string;
  revision: number;
  key: string;
  reason: string;
  patch: {
    subject?: string;
    reason?: string;
    memo?: string;
    itemPurposes?: Record<string, string>;
    classification?: Pick<ExpenseCorrectionOption, "accountId" | "budgetId" | "detailId">;
  };
};

export type ExpenseCorrectionOptions = { options: ExpenseCorrectionOption[]; blockedReason?: string };

export function canCorrectExpense(resolution: ManagedExpenseResolution, viewer?: ReimbursementMember) {
  return Boolean(viewer?.active && resolution.approvalStatus === "승인완료"
    && !isLegacySmallExpenseResolution(resolution)
    && (viewer.permissions.includes("ADMIN") || resolution.authorization?.author_user_id === viewer.user_id));
}
