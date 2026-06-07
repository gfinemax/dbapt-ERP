import { describe, expect, it, vi } from "vitest";

import { fetchPeopleOnMembersTable, mapPeopleOnMemberRow } from "./members-table";

describe("peopleON members table client", () => {
  it("maps peopleON table rows into ERP member rows", () => {
    expect(
      mapPeopleOnMemberRow({
        address: "서울 동작구 대방동",
        contractStatus: "정상",
        documentStatus: "완료",
        id: "source-1",
        memberNo: "P-0001",
        name: "홍길동",
        paymentStatus: "미납",
        phone: "010-1111-2222",
        rel: "정상",
        unit: "101동 101호",
      }),
    ).toMatchObject({
      address: "서울 동작구 대방동",
      contractStatus: "정상",
      documentStatus: "완료",
      id: "source-1",
      integrationStatus: "정상",
      memberNo: "P-0001",
      name: "홍길동",
      paymentStatus: "미납",
      phone: "010-1111-2222",
      unit: "101동 101호",
    });
  });

  it("maps registered peopleON rows from the table API shape", () => {
    expect(
      mapPeopleOnMemberRow({
        address_legal: "서울시 서대문구 홍은 중앙로9나길 63",
        certificate_display: "2006-1-212",
        display_status: "정상",
        id: "4f69e517-f944-4198-b63d-eaf1881d143d",
        member_id: "4f69e517-f944-4198-b63d-eaf1881d143d",
        name: "강광자",
        phone: null,
        status: "정상",
        tier: "등기조합원",
        unit_group: "84",
      }),
    ).toMatchObject({
      address: "서울시 서대문구 홍은 중앙로9나길 63",
      id: "4f69e517-f944-4198-b63d-eaf1881d143d",
      integrationStatus: "정상",
      memberNo: "2006-1-212",
      name: "강광자",
      phone: "-",
      status: "정상",
      unit: "84",
    });
  });

  it("calls the peopleON table API with api key and query params", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        filters: { status: ["정상"] },
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        rows: [{ memberNo: "P-0001", name: "홍길동" }],
      }),
      ok: true,
    });

    const result = await fetchPeopleOnMembersTable(
      { page: "1", pageSize: "50", q: "김", sort: "name" },
      {
        env: {
          PEOPLEON_API_KEY: "test-key",
          PEOPLEON_MEMBERS_TABLE_URL: "http://localhost:3001/api/members/table",
        },
        fetcher,
      },
    );

    const [calledUrl, calledOptions] = fetcher.mock.calls[0];
    const url = new URL(calledUrl);

    expect(`${url.origin}${url.pathname}`).toBe("http://localhost:3001/api/members/table");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("q")).toBe("김");
    expect(url.searchParams.get("sort")).toBe("name");
    expect(calledOptions).toEqual(
      expect.objectContaining({
        headers: { "X-API-Key": "test-key" },
      }),
    );
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0].memberNo).toBe("P-0001");
  });

  it("normalizes snake case peopleON pagination metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        pagination: {
          has_next: true,
          has_previous: false,
          page: 1,
          page_size: 50,
          total_count: 116,
          total_pages: 3,
        },
        rows: [],
      }),
      ok: true,
    });

    const result = await fetchPeopleOnMembersTable(
      { page: "1", pageSize: "50", tier: "등기조합원" },
      {
        env: {
          PEOPLEON_MEMBERS_API_KEY: "members-key",
          PEOPLEON_MEMBERS_TABLE_URL: "http://localhost:3001/api/members/table",
        },
        fetcher,
      },
    );

    expect(result?.pagination).toEqual({
      hasNext: true,
      hasPrevious: false,
      page: 1,
      pageSize: 50,
      totalCount: 116,
      totalPages: 3,
    });
  });

  it("accepts the members table specific api key environment variable", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({ rows: [] }),
      ok: true,
    });

    await fetchPeopleOnMembersTable(
      { tier: "등기조합원" },
      {
        env: {
          PEOPLEON_MEMBERS_API_KEY: "members-key",
          PEOPLEON_MEMBERS_TABLE_URL: "http://localhost:3001/api/members/table",
        },
        fetcher,
      },
    );

    const [, calledOptions] = fetcher.mock.calls[0];

    expect(calledOptions).toEqual(
      expect.objectContaining({
        headers: { "X-API-Key": "members-key" },
      }),
    );
  });
});
