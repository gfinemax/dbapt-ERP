import { describe, expect, it } from "vitest";
import { suggestApprovalDraft } from "./approval-draft-assistant";

describe("suggestApprovalDraft", () => {
  it("recommends a title, account subject, and budget from draft content", () => {
    const suggestion = suggestApprovalDraft({
      accountSubjects: ["회의비", "용역비"],
      body: "운영위원회 회의용 음료 8잔을 주문합니다. 25,000원",
      budgets: [{ approvedAmount: 1_000_000, availableAmount: 800_000, budgetItem: "회의비", executedAmount: 200_000, fiscalYear: 2026, id: "budget-meeting", reservedAmount: 0 }],
      counterpartyName: "메가커피",
      documentType: "EXPENSE",
    });

    expect(suggestion.title).toContain("운영위원회 회의용 음료");
    expect(suggestion.accountSubject).toBe("회의비");
    expect(suggestion.budgetId).toBe("budget-meeting");
    expect(suggestion.confidence).toBe("높음");
  });

  it("removes monetary amounts without leaving duplicated particles", () => {
    const suggestion = suggestApprovalDraft({
      accountSubjects: [],
      body: "회의용 음료를 메가커피에서 25,000원에 구매",
      budgets: [],
      counterpartyName: "메가커피",
      documentType: "EXPENSE",
    });

    expect(suggestion.title).toBe("회의용 음료를 메가커피에서 구매");
  });

  it("never invents an account subject outside registered options", () => {
    const suggestion = suggestApprovalDraft({
      accountSubjects: ["용역비"],
      body: "회의용 음료 주문",
      budgets: [],
      counterpartyName: "",
      documentType: "EXPENSE",
    });

    expect(suggestion.accountSubject).toBe("");
    expect(suggestion.budgetId).toBe("");
  });
});
