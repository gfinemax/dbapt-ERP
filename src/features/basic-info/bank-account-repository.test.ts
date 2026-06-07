import { describe, expect, it } from "vitest";
import { bankAccountRepositorySchema, mapBankAccountFromRow, mapBankAccountToInsert } from "./bank-account-repository";

describe("bank account repository mappers", () => {
  it("uses the finance schema for bank account storage", () => {
    expect(bankAccountRepositorySchema).toBe("finance");
  });

  it("maps Supabase bank account rows into UI bank account rows", () => {
    expect(
      mapBankAccountFromRow({
        account_name: "우리은행 운영계좌",
        account_no: "1002-000-123456",
        account_type: "운영계좌",
        bank_name: "우리은행",
        created_at: "2026-06-06T15:00:00.000Z",
        id: "bank-db-001",
        last_synced_at: "2026-06-07T01:10:00.000Z",
        sync_status: "정상",
        unmatched_count: 2,
        usage_status: "사용",
      }),
    ).toEqual({
      accountName: "우리은행 운영계좌",
      accountNo: "1002-000-123456",
      accountType: "운영계좌",
      bankName: "우리은행",
      createdAt: "2026-06-07",
      id: "bank-db-001",
      lastSyncedAt: "2026-06-07 10:10",
      status: "정상",
      unmatchedCount: 2,
      usageStatus: "사용",
    });
  });

  it("maps UI bank account input into a Supabase insert row", () => {
    expect(
      mapBankAccountToInsert({
        accountName: "신규 운영계좌",
        accountNo: "111-222-333333",
        accountType: "운영계좌",
        bankName: "우리은행",
        createdAt: "2026-06-07",
      }),
    ).toEqual({
      account_name: "신규 운영계좌",
      account_no: "111-222-333333",
      account_type: "운영계좌",
      bank_name: "우리은행",
      created_at: "2026-06-07T00:00:00.000+09:00",
      sync_status: "확인필요",
      unmatched_count: 0,
      usage_status: "사용",
    });
  });
});
