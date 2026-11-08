import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

    expect(screen.getByRole("option", { name: registeredAccountSubjects[2].name })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: `${registeredAccountSubjects[2].code} · ${registeredAccountSubjects[2].name}` })).not.toBeInTheDocument();

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

  it("keeps Ledger read-only and sends missing subjects to ERP management", () => {
    render(<LedgerBankSubjectRuleWorkboardPanel accountSubjects={registeredAccountSubjects} initialWorkboard={workboard} />);
    expect(screen.getByText("없는 계정과목은 먼저 ERP 계정과목 관리에서 등록해. 확인필요와 계좌간이체는 자동 확정하지 않아.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ERP 동기화/ })).not.toBeInTheDocument();
  });

  it("loads the clicked rule transactions and closes the read-only detail", async () => {
    const loadTransactions = vi.fn().mockResolvedValue({
      page: 1,
      pageSize: 25,
      rows: [{
        accountName: "운영계좌",
        balanceAmount: 9000,
        bankName: "국민은행",
        depositAmount: 0,
        description: "토지 계약금",
        managementMemo: "계약서 확인",
        memo: "창구",
        sourceTransactionId: "ledger-1",
        transactionDate: "2026-10-01",
        transactionTime: "09:30:00",
        withdrawalAmount: 1000,
      }],
      totalCount: 455,
      totalPages: 19,
    });
    render(<LedgerBankSubjectRuleWorkboardPanel
      accountSubjects={registeredAccountSubjects}
      initialWorkboard={workboard}
      loadTransactions={loadTransactions}
    />);

    fireEvent.click(screen.getByRole("button", { name: "토지매입비 거래 455건 보기" }));
    expect(loadTransactions).toHaveBeenCalledWith({ direction: "WITHDRAWAL", matchType: "CATEGORY", page: 1, sourceKey: "12" });
    const detail = await screen.findByRole("region", { name: "토지매입비 거래 내용" });
    expect(within(detail).getByText("토지 계약금")).toBeInTheDocument();
    expect(within(detail).getByText("창구 · 계약서 확인")).toBeInTheDocument();
    expect(within(detail).getByText("1,000원")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("region", { name: "토지매입비 거래 내용" })).not.toBeInTheDocument();
  });
});
