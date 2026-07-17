import { describe, expect, it } from "vitest";
import { buildBankTransactionUid, mapBankTransactionToInsert } from "./bank-transaction-repository";
import type { ParsedBankTransactionRow } from "./bank-transaction-import";

describe("bank transaction repository mappers", () => {
  it("maps parsed upload rows into Supabase inserts with classification metadata", () => {
    const row: ParsedBankTransactionRow = {
      balanceAmount: 12000000,
      bankAccountId: "00000000-0000-0000-0000-000000000001",
      bankAccountName: "국민은행 운영계좌",
      branchName: "우리은행",
      depositAmount: 0,
      description: "한빛세무회계",
      matchStatus: "업로드분류",
      raw: {
        거래점: "우리은행",
        목: "세무비",
        항: "운영비",
      },
      recommendedAccountSubjectId: "00000000-0000-0000-0000-000000000002",
      recommendedAccountSubjectName: "세무비",
      transactedAt: "2026-07-04T10:31:00.000+09:00",
      transactionKind: "출금",
      uploadedAccountTitle: "세무비",
      uploadedMajorCategory: "운영비",
      withdrawalAmount: 3300000,
    };

    expect(mapBankTransactionToInsert(row)).toEqual({
      balance_amount: 12000000,
      bank_account_id: "00000000-0000-0000-0000-000000000001",
      bank_transaction_uid: "FALLBACK:00000000-0000-0000-0000-000000000001:2026-07-04T10:31:00.000+09:00:3300000:한빛세무회계",
      branch_name: "우리은행",
      counterparty: "우리은행",
      deposit_amount: 0,
      description: "한빛세무회계",
      match_status: "업로드분류",
      raw_payload: {
        거래점: "우리은행",
        목: "세무비",
        항: "운영비",
      },
      recommended_account_subject_id: "00000000-0000-0000-0000-000000000002",
      recommended_account_subject_name: "세무비",
      transacted_at: "2026-07-04T10:31:00.000+09:00",
      transaction_kind: "출금",
      uploaded_account_title: "세무비",
      uploaded_major_category: "운영비",
      withdrawal_amount: 3300000,
    });
    expect(buildBankTransactionUid({ ...row, raw: { 거래고유번호: "ABC-123" } })).toBe("BANK:00000000-0000-0000-0000-000000000001:ABC-123");
  });
});
