import { describe, expect, it } from "vitest";
import { groupBankExpenseDraftManifest, summarizeBankExpenseDraftManifest, type BankExpenseDraftManifestRow } from "./bank-expense-draft-manifest";

function row(overrides: Partial<BankExpenseDraftManifestRow> = {}): BankExpenseDraftManifestRow {
  return {
    amount: 10_000,
    bankTransactionId: crypto.randomUUID(),
    budgetCandidateCount: 1,
    classificationStatus: "CONFIRMED",
    description: "우체국 통신비",
    eligibility: "REVIEW_REQUIRED",
    expenseDetailCandidateCount: 1,
    recommendationBasis: "stable ids",
    recommendationGroupKey: "same-stable-contract",
    sourceTransactionDate: "2026-08-10",
    ...overrides,
  };
}

describe("bank expense draft manifest", () => {
  it("groups only reviewable rows sharing the complete stable contract", () => {
    const groups = groupBankExpenseDraftManifest([
      row(),
      row({ amount: 20_000, sourceTransactionDate: "2026-08-20" }),
      row({ eligibility: "HOLD", recommendationGroupKey: "same-stable-contract" }),
      row({ recommendationGroupKey: "single-contract" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ amount: 30_000, count: 2, key: "same-stable-contract" });
  });

  it("shows preliminary groups while keeping missing detail UUID rows on hold", () => {
    const rows = [
      row({ accountSubjectId: "subject", budgetId: "budget", eligibility: "HOLD", holdReason: "세부항목 확정 필요", recommendationGroupKey: undefined }),
      row({ accountSubjectId: "subject", amount: 20_000, budgetId: "budget", eligibility: "HOLD", holdReason: "세부항목 확정 필요", recommendationGroupKey: undefined }),
    ];
    expect(groupBankExpenseDraftManifest(rows)).toMatchObject([{ amount: 30_000, count: 2 }]);
    expect(rows.every((item) => item.eligibility === "HOLD")).toBe(true);
  });

  it("separates held and existing-linked rows in the audit summary", () => {
    expect(summarizeBankExpenseDraftManifest([
      row(),
      row({ eligibility: "HOLD" }),
      row({ eligibility: "EXISTING_LINK" }),
    ])).toEqual({ existingLinkCount: 1, holdCount: 1, reviewCount: 1, totalAmount: 30_000, totalCount: 3 });
  });
});
