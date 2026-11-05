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
    transactionCount: 455,
  }],
  descriptionGroups: [],
  savedRuleCount: 0,
  transactionCount: 455,
};

describe("LedgerBankSubjectRuleWorkboardPanel", () => {
  it("selects exact candidates and saves recommendations without confirming transactions", async () => {
    const saveRules = vi.fn().mockResolvedValue({ recommended_count: 455, saved_count: 1 });
    render(<LedgerBankSubjectRuleWorkboardPanel accountSubjects={registeredAccountSubjects} initialWorkboard={workboard} saveRules={saveRules} />);

    fireEvent.click(screen.getByRole("button", { name: "정확 일치 후보 선택" }));
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
});
