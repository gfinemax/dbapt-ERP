import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  accountSubjectRepositorySchema,
  listAccountSubjectsFromSupabase,
  mapAccountSubjectFromRow,
  mapAccountSubjectToInsert,
} from "./account-subject-repository";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(),
}));

const mockedGetSupabaseServerClient = vi.mocked(getSupabaseServerClient);

describe("account subject repository mappers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the finance schema for account subject storage", () => {
    expect(accountSubjectRepositorySchema).toBe("finance");
  });

  it("maps Supabase account subject rows into UI account subjects", () => {
    expect(
      mapAccountSubjectFromRow({
        aliases: ["PF 이자", "프로젝트파이낸싱 이자"],
        business_category: "금융비용",
        code: "FIN-020",
        created_at: "2026-06-07T00:00:00.000+09:00",
        description: "PF 대출 이자 비용",
        id: "account-db-001",
        is_active: true,
        name: "PF이자",
        normal_balance: "차변",
        parent_id: null,
        source: "수지분석표",
        sort_order: 20,
        subject_type: "지출",
      }),
    ).toEqual({
      aliases: ["PF 이자", "프로젝트파이낸싱 이자"],
      businessCategory: "금융비용",
      code: "FIN-020",
      description: "PF 대출 이자 비용",
      id: "account-db-001",
      isActive: true,
      name: "PF이자",
      normalBalance: "차변",
      parentId: null,
      sortOrder: 20,
      source: "수지분석표",
      subjectType: "지출",
    });
  });

  it("maps UI account subjects into Supabase insert rows", () => {
    expect(
      mapAccountSubjectToInsert({
        aliases: ["임차료", "사무실 임대료"],
        businessCategory: "운영비",
        code: "OP-310",
        description: "사무실 임차료 등",
        id: "account-local-001",
        isActive: true,
        name: "임대료",
        normalBalance: "차변",
        parentId: null,
        sortOrder: 310,
        source: "운영비 예산안",
        subjectType: "지출",
      }),
    ).toEqual({
      aliases: ["임차료", "사무실 임대료"],
      business_category: "운영비",
      code: "OP-310",
      description: "사무실 임차료 등",
      is_active: true,
      name: "임대료",
      normal_balance: "차변",
      parent_id: null,
      sort_order: 310,
      source: "운영비 예산안",
      subject_type: "지출",
    });
  });

  it("falls back without console errors when Supabase account subject loading fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const finalOrder = vi.fn().mockResolvedValue({ data: null, error: { message: "TypeError: fetch failed" } });
    const firstOrder = vi.fn().mockReturnValue({ order: finalOrder });

    mockedGetSupabaseServerClient.mockReturnValue({
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: firstOrder,
          }),
        }),
      }),
    } as never);

    await expect(listAccountSubjectsFromSupabase()).resolves.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
