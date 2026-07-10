import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  bankAccountRepositorySchema,
  createBankAccountInSupabase,
  mapBankAccountFromRow,
  mapBankAccountToInsert,
  mapBankAccountToUpdate,
  updateBankAccountInSupabase,
} from "./bank-account-repository";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(),
}));

const mockedGetSupabaseServerClient = vi.mocked(getSupabaseServerClient);

describe("bank account repository mappers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("maps UI bank account input into a Supabase update row", () => {
    expect(
      mapBankAccountToUpdate({
        accountName: "수정 운영계좌",
        accountNo: "111-222-333333",
        accountType: "신탁계좌",
        bankName: "하나은행",
        createdAt: "2026-06-08",
      }),
    ).toEqual({
      account_name: "수정 운영계좌",
      account_no: "111-222-333333",
      account_type: "신탁계좌",
      bank_name: "하나은행",
      created_at: "2026-06-08T00:00:00.000+09:00",
    });
  });

  it("throws a Korean connection guide instead of raw fetch failure when Supabase insert is unreachable", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "TypeError: fetch failed" } });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });

    mockedGetSupabaseServerClient.mockReturnValue({
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          insert,
        }),
      }),
    } as never);

    await expect(
      createBankAccountInSupabase({
        accountName: "대방동지주",
        accountNo: "1006-901-293047",
        accountType: "운영계좌",
        bankName: "우리은행",
        createdAt: "2008-07-09",
      }),
    ).rejects.toThrow("Supabase 연결에 실패했습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL 주소와 프로젝트 상태를 확인해 주세요.");
  });

  it("updates a bank account row through Supabase and returns the mapped account", async () => {
    const row = {
      account_name: "수정 운영계좌",
      account_no: "111-222-333333",
      account_type: "운영계좌",
      bank_name: "우리은행",
      created_at: "2026-06-08T00:00:00.000+09:00",
      id: "bank-db-001",
      last_synced_at: null,
      sync_status: "확인필요",
      unmatched_count: 0,
      usage_status: "사용",
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });

    mockedGetSupabaseServerClient.mockReturnValue({
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update,
        }),
      }),
    } as never);

    await expect(
      updateBankAccountInSupabase("bank-db-001", {
        accountName: "수정 운영계좌",
        accountNo: "111-222-333333",
        accountType: "운영계좌",
        bankName: "우리은행",
        createdAt: "2026-06-08",
      }),
    ).resolves.toEqual({
      accountName: "수정 운영계좌",
      accountNo: "111-222-333333",
      accountType: "운영계좌",
      bankName: "우리은행",
      createdAt: "2026-06-08",
      id: "bank-db-001",
      lastSyncedAt: "미연동",
      status: "확인필요",
      unmatchedCount: 0,
      usageStatus: "사용",
    });

    expect(update).toHaveBeenCalledWith({
      account_name: "수정 운영계좌",
      account_no: "111-222-333333",
      account_type: "운영계좌",
      bank_name: "우리은행",
      created_at: "2026-06-08T00:00:00.000+09:00",
    });
    expect(eq).toHaveBeenCalledWith("id", "bank-db-001");
  });

  it("throws a Korean connection guide instead of raw fetch failure when Supabase update is unreachable", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "TypeError: fetch failed" } });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });

    mockedGetSupabaseServerClient.mockReturnValue({
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update,
        }),
      }),
    } as never);

    await expect(
      updateBankAccountInSupabase("bank-db-001", {
        accountName: "수정 운영계좌",
        accountNo: "111-222-333333",
        accountType: "운영계좌",
        bankName: "우리은행",
        createdAt: "2026-06-08",
      }),
    ).rejects.toThrow("Supabase 연결에 실패했습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL 주소와 프로젝트 상태를 확인해 주세요.");
  });
});
