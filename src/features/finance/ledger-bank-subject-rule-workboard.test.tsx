import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { registeredAccountSubjects } from "@/features/basic-info/account-subject-data";
import { LedgerBankSubjectRuleWorkboardPanel } from "./ledger-bank-subject-rule-workboard";
import type { LedgerBankSubjectRuleWorkboard } from "./ledger-bank-subject-rules";

const workboard: LedgerBankSubjectRuleWorkboard = {
  blankDescriptionCount: 319,
  categoryGroups: [{
    amountTotal: 200000,
    candidateAccountSubjectId: registeredAccountSubjects[2].id,
    candidateAccountSubjectName: registeredAccountSubjects[2].name,
    direction: "WITHDRAWAL",
    id: "CATEGORY:12:WITHDRAWAL",
    matchType: "CATEGORY",
    ruleAccountSubjectId: null,
    ruleStatus: null,
    sourceGroup: "사업비",
    sourceKey: "12",
    sourceLabel: "토지매입비",
    syncStatus: null,
    transactionCount: 455,
  }],
  descriptionGroups: [],
  savedRuleCount: 0,
  syncedCategoryCount: 0,
  transactionCount: 455,
};

describe("LedgerBankSubjectRuleWorkboardPanel", () => {
  it("selects exact candidates and saves recommendations without confirming transactions", async () => {
    const saveRules = vi.fn().mockResolvedValue({ recommended_count: 455, saved_count: 1 });
    render(<LedgerBankSubjectRuleWorkboardPanel accountSubjects={registeredAccountSubjects} initialWorkboard={workboard} saveRules={saveRules} />);

    fireEvent.click(screen.getByRole("button", { name: "연결 후보 전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 추천 저장" }));

    await waitFor(() => expect(saveRules).toHaveBeenCalledWith([{
      accountSubjectId: registeredAccountSubjects[2].id,
      direction: "WITHDRAWAL",
      matchType: "CATEGORY",
      ruleStatus: "CONFIRMED",
      sourceKey: "12",
    }]));
    expect(await screen.findByText("1개 규칙을 저장했고 455건에 추천값을 설정했어. 거래 확정은 아직 하지 않았어.")).toBeInTheDocument();
  });

  it("syncs all Ledger categories before rule selection and reports guarded outcomes", async () => {
    const syncAccountSubjects = vi.fn().mockResolvedValue({
      created_count: 1, matched_count: 0, review_count: 0, saved_count: 1, transfer_count: 0,
    });
    render(<LedgerBankSubjectRuleWorkboardPanel
      accountSubjects={registeredAccountSubjects}
      initialWorkboard={workboard}
      syncAccountSubjects={syncAccountSubjects}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Ledger 1개 ERP 동기화" }));

    await waitFor(() => expect(syncAccountSubjects).toHaveBeenCalledWith([{
      categoryGroup: "사업비",
      categoryName: "토지매입비",
      direction: "WITHDRAWAL",
      ledgerCategoryId: "12",
    }]));
    expect(await screen.findByText("Ledger 1개를 동기화했어. 기존 연결 0개 · 신규 등록 1개 · 검토 유지 0개 · 계좌간이체 0개야.")).toBeInTheDocument();
  });
});
