import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  accountSubjectRepositorySchema,
  buildOperatingAccountSubjectCandidates,
  createAccountSubjectsInSupabase,
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

  it("builds authoritative account candidates from operating budgets and their detail aliases", () => {
    const candidates = buildOperatingAccountSubjectCandidates([
      {
        budget_code: "OPERATING-COMM",
        budget_item: "제세공과금>통신비",
        calculation_basis: "전화·팩스·인터넷 등",
        id: "budget-1",
        mapping_note: "AI 구독료 범위 확인",
        mapping_status: "POLICY_REVIEW",
        plan_item_label: "통신비",
        plan_section: "운영비",
      },
    ], [
      { aliases: ["인터넷", "전화"], budget_id: "budget-1", name: "통신비(AI 업무보조 구독료)", policy_note: "예산 분류 확인 필요" },
    ]);

    expect(candidates).toEqual([
      expect.objectContaining({
        aliases: expect.arrayContaining(["제세공과금>통신비", "통신비(AI 업무보조 구독료)", "인터넷", "전화"]),
        budgetIds: ["budget-1"],
        code: "OPERATING-COMM",
        mappingStatus: "POLICY_REVIEW",
        name: "통신비",
        source: "운영비 예산안",
      }),
    ]);
  });

  it("registers selected subjects through the organization-scoped atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        aliases: ["인터넷"], business_category: "운영비", code: "OPERATING-COMM", created_at: "2026-09-27",
        description: "통신비", id: "subject-1", is_active: true, name: "통신비", normal_balance: "차변",
        parent_id: null, sort_order: 100, source: "운영비 예산안", subject_type: "지출",
      }],
      error: null,
    });
    mockedGetSupabaseServerClient.mockReturnValue({ schema: vi.fn().mockReturnValue({ rpc }) } as never);

    await expect(createAccountSubjectsInSupabase([{
      aliases: ["인터넷"], budgetIds: ["budget-1"], businessCategory: "운영비", code: "OPERATING-COMM",
      description: "통신비", isActive: true, name: "통신비", normalBalance: "차변", parentId: null,
      sortOrder: 100, source: "운영비 예산안", subjectType: "지출",
    }], "org-1", "actor-1")).resolves.toEqual([expect.objectContaining({ id: "subject-1", name: "통신비" })]);
    expect(rpc).toHaveBeenCalledWith("confirm_operating_account_subjects", expect.objectContaining({
      p_actor: "actor-1",
      p_org: "org-1",
      p_items: [expect.objectContaining({ budget_ids: ["budget-1"], code: "OPERATING-COMM" })],
    }));
  });
});

it("preserves unknown historical classifications without inventing defaults", () => {
 const row = mapAccountSubjectFromRow({id:"legacy",name:"기존 항목",code:"LEG-1",is_active:true,created_at:"2026-01-01",aliases:null,business_category:null,description:null,normal_balance:null,parent_id:null,sort_order:null,source:null,subject_type:null});
 expect(row).toMatchObject({normalBalance:null,source:null,subjectType:null});
 expect(() => mapAccountSubjectToInsert(row)).toThrow("유형, 차대변과 출처");
});
