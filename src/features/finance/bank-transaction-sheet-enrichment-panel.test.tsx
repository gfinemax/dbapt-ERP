import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BankTransactionSheetEnrichmentPanel } from "./bank-transaction-sheet-enrichment-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const accounts = [{
  accountName: "기업(07111)",
  accountNo: "071-114261-04-017",
  accountType: "운영계좌" as const,
  bankName: "기업은행",
  createdAt: "2021-02-26",
  id: "enterprise-account",
  lastSyncedAt: "2026-11-08 10:00",
  status: "정상" as const,
  unmatchedCount: 0,
  usageStatus: "사용" as const,
}, {
  accountName: "대방동지역주택조합",
  accountNo: "131-022-540467",
  accountType: "운영계좌" as const,
  bankName: "신협은행",
  createdAt: "2024-12-04",
  id: "credit-union-account",
  lastSyncedAt: "2026-11-08 10:00",
  status: "정상" as const,
  unmatchedCount: 0,
  usageStatus: "사용" as const,
}];

describe("BankTransactionSheetEnrichmentPanel", () => {
  it("shows reconciliation groups and requires an explicit ERP ID for review rows", async () => {
    const preview = vi.fn().mockResolvedValue({
      autoMatchedCount: 1,
      categorizedRowCount: 2,
      erpOnlyAfterResolutionCount: 1,
      expectedCurrentCount: 3,
      newCount: 1,
      reviewRequiredCount: 1,
      rows: [
        {
          accountCategory: "차입금",
          accountLabel: "기업(07111)",
          bankTransactionType: "입금",
          candidates: [{ depositAmount: 100, description: "기존 원본", id: "candidate-1", sourceTransactionId: "3970", transactionDate: "2022-12-01", transactionTime: "10:00:00", withdrawalAmount: 0 }],
          depositAmount: 100,
          description: "정동헌",
          matchedBankTransactionId: null,
          memo: "",
          sourceRow: 2,
          status: "REVIEW_REQUIRED" as const,
          transactionDate: "2022-12-01",
          transactionTime: "10:00:00",
          withdrawalAmount: 0,
        },
        {
          accountCategory: "용역비",
          accountLabel: "기업(07111)",
          bankTransactionType: "출금",
          candidates: [],
          depositAmount: 0,
          description: "박노수",
          matchedBankTransactionId: null,
          memo: "PDF에만 있음",
          sourceRow: 3,
          status: "NEW" as const,
          transactionDate: "2025-05-17",
          transactionTime: "",
          withdrawalAmount: 3000500,
        },
      ],
      skippedZeroCount: 0,
      sourceDepositTotal: 100,
      sourceRowCount: 2,
      sourceWithdrawalTotal: 3000500,
    });
    const apply = vi.fn().mockResolvedValue({
      already_applied: false,
      batch_id: "batch-1",
      current_count: 4,
      field_override_count: 1,
      inserted_count: 1,
      manual_match_count: 1,
      matched_count: 1,
      skipped_count: 0,
      source_row_count: 2,
    });
    render(<BankTransactionSheetEnrichmentPanel applyEnrichment={apply} bankAccounts={accounts} previewEnrichment={preview} />);

    fireEvent.change(screen.getByLabelText("Google 시트 표 붙여넣기"), { target: { value: "계좌구분\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t항목구분\t메모\n기업(07111)\t2022-12-01\t10:00:00\t입금\t정동헌\t100\t\t차입금\t\n기업(07111)\t2025-05-17\t\t출금\t박노수\t\t3000500\t용역비\tPDF에만 있음" } });
    fireEvent.click(screen.getByRole("button", { name: "전체 대조 미리보기" }));

    expect(await screen.findByText("ERP 원본 선택 필요 · 0/1건")).toBeInTheDocument();
    expect(screen.getByText("신규로 추가할 거래 · 1건")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "시트 거래를 ERP 신규 원본으로 추가" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "시트 중복·오류로 반영 제외" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "보정·신규 거래 반영" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("시트 2행 ERP 원본"), { target: { value: "candidate-1" } });
    fireEvent.click(screen.getByRole("button", { name: "보정·신규 거래 반영" }));

    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      bankAccountId: "enterprise-account",
      selections: { "2": "candidate-1" },
      sourceDocumentId: "1Qxh1bMM6hUEDMHzEqAdOppKH8ZYqbVTRZa-Ci7CElQ4",
      sourceSheet: "시트1",
    }));
    expect(await screen.findByText("기존 연결 1건, 신규 1건, 반영 제외 0건을 처리했어.")).toBeInTheDocument();
  });

  it("loads the credit-union sheet profile when the exact account is selected", () => {
    render(<BankTransactionSheetEnrichmentPanel bankAccounts={accounts} />);

    fireEvent.change(screen.getByLabelText("대상 ERP 계좌"), { target: { value: "credit-union-account" } });

    expect(screen.getByLabelText("Google 문서 ID")).toHaveValue("1ygwf7JkjTMoMJJuZdsM4ifA52x-LiuZKbuhNX3z74_w");
    expect(screen.getByLabelText("시트명")).toHaveValue("시트1");
    expect(screen.getByLabelText("반영 사유")).toHaveValue("신협(13102) Google 시트 390건의 적요·항목구분·메모 보정 및 원본 대조");
  });
});
