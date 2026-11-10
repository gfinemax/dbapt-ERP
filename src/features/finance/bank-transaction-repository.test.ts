import { describe, expect, it } from "vitest";
import { buildBankTransactionUid, deriveBankTransactionSourceReconciliationIssues, mapBankTransactionToInsert, mapZeroAmountLedgerSource, transactionSearchOrFilter } from "./bank-transaction-repository";
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
      classification_status: "RECOMMENDED",
      counterparty: "우리은행",
      deposit_amount: 0,
      description: "한빛세무회계",
      match_status: "업로드분류",
      raw_payload: {
        거래점: "우리은행",
        목: "세무비",
        항: "운영비",
      },
      recommendation_reason: "업로드 파일의 계정과목명과 내부 계정과목이 일치함",
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

  it("maps zero-amount Ledger rows for source audit without turning them into transactions", () => {
    expect(mapZeroAmountLedgerSource({
      issue_detail: "입금과 출금 중 정확히 한 금액만 0보다 커야 합니다.",
      payload: {
        deposit_amount: 0,
        description: "예금결산이자",
        transaction_date: "2022-12-17",
        transaction_kind: "예금결산",
        transaction_time: "10:46:59",
        withdrawal_amount: 0,
      },
      source_transaction_id: "1303",
    })).toEqual({
      description: "예금결산이자",
      issueDetail: "입금과 출금 중 정확히 한 금액만 0보다 커야 합니다.",
      sourceTransactionId: "1303",
      transactionDate: "2022-12-17",
      transactionKind: "예금결산",
      transactionTime: "10:46:59",
    });
    expect(mapZeroAmountLedgerSource({ payload: { deposit_amount: 1000, withdrawal_amount: 0 } })).toBeNull();
  });

  it("separates an ERP-only source review from matched, deferred and excluded transactions", () => {
    const issues = deriveBankTransactionSourceReconciliationIssues({
      downstreamLinks: new Map([["erp-only", []]]),
      importRows: [
        { batch_id: "batch-1", bank_transaction_id: "matched", source_payload: { 거래일자: "2021-03-24" } },
        { batch_id: "batch-1", bank_transaction_id: null, source_payload: { 거래일자: "2021-03-23" } },
      ],
      latestBatches: [{ bank_account_id: "bank-1", id: "batch-1", imported_at: "2026-11-08T10:00:00+09:00", source_document_id: "sheet-doc", source_sheet: "시트1" }],
      transactions: [
        { bank_account_id: "bank-1", classification_status: "UNREVIEWED", deposit_amount: 0, id: "matched", source_system: "dbapt-ledger", source_transaction_id: "100", transacted_at: "2021-03-24T09:52:00+09:00", withdrawal_amount: 1000000 },
        { bank_account_id: "bank-1", classification_status: "DEFERRED", deposit_amount: 9000000, id: "duplicate", source_system: "dbapt-ledger", source_transaction_id: "200", transacted_at: "2022-12-01T08:03:00+09:00", withdrawal_amount: 0 },
        { bank_account_id: "bank-1", classification_status: "EXCLUDED", deposit_amount: 0, id: "excluded", source_system: "dbapt-ledger", source_transaction_id: "300", transacted_at: "2022-01-01T08:03:00+09:00", withdrawal_amount: 1000 },
        { bank_account_id: "bank-1", classification_status: "UNREVIEWED", deposit_amount: 0, id: "erp-only", source_system: "dbapt-ledger", source_transaction_id: "3344", transacted_at: "2021-03-23T09:52:00+09:00", withdrawal_amount: 1000000 },
      ],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      bankTransactionId: "erp-only",
      depositImpact: 0,
      sourceTransactionId: "3344",
      withdrawalImpact: 1000000,
    });
    expect(issues[0].reason).toContain("대조 기간 2021-03-23~2021-03-24");
  });

  it("limits source review to the latest sheet period and accepts links from an earlier upload", () => {
    const issues = deriveBankTransactionSourceReconciliationIssues({
      importRows: [
        { batch_id: "batch-new", bank_transaction_id: "new-linked", source_payload: { 거래일자: "2026-10-28" } },
        { batch_id: "batch-new", bank_transaction_id: null, source_payload: { 거래일자: "2026.11.03" } },
        { batch_id: "batch-old", bank_transaction_id: "historically-linked", source_payload: { 거래일자: "2026-11-01" } },
      ],
      latestBatches: [{ bank_account_id: "bank-1", id: "batch-new", imported_at: "2026-11-08T10:00:00+09:00", source_document_id: "sheet-doc", source_sheet: "시트1" }],
      transactions: [
        { bank_account_id: "bank-1", classification_status: "CONFIRMED", deposit_amount: 0, id: "outside-period", source_system: "dbapt-ledger", source_transaction_id: "4863", transacted_at: "2026-09-30T04:32:00+09:00", withdrawal_amount: 313000 },
        { bank_account_id: "bank-1", classification_status: "CONFIRMED", deposit_amount: 0, id: "historically-linked", source_system: "dbapt-ledger", source_transaction_id: "4902", transacted_at: "2026-11-01T04:15:00+09:00", withdrawal_amount: 379000 },
        { bank_account_id: "bank-1", classification_status: "CONFIRMED", deposit_amount: 0, id: "in-period-unlinked", source_system: "dbapt-ledger", source_transaction_id: "5000", transacted_at: "2026-11-02T04:15:00+09:00", withdrawal_amount: 448000 },
        { bank_account_id: "bank-1", classification_status: "CONFIRMED", deposit_amount: 0, id: "new-linked", source_system: "google-sheet", source_transaction_id: "sheet:3", transacted_at: "2026-10-28T04:15:00+09:00", withdrawal_amount: 520000 },
      ],
    });

    expect(issues.map((issue) => issue.bankTransactionId)).toEqual(["in-period-unlinked"]);
  });
});

describe("bank transaction member search", () => {
  it("includes linked paid-refund withdrawals beside text matches", () => {
    expect(transactionSearchOrFilter("송동환", false, ["withdrawal-1", "withdrawal-2"])).toContain(
      "and(origin_type.eq.BANK_TRANSACTION,source_record_id.in.(withdrawal-1,withdrawal-2))",
    );
  });
});
