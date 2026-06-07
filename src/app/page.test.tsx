import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import { fetchPeopleOnMembersTable } from "@/lib/peopleon/members-table";

vi.mock("@/lib/peopleon/members-table", () => ({
  fetchPeopleOnMembersTable: vi.fn(),
}));

describe("home route", () => {
  it("uses the registered peopleON member total for the dashboard KPI", async () => {
    vi.mocked(fetchPeopleOnMembersTable).mockResolvedValueOnce({
      pagination: {
        hasNext: false,
        hasPrevious: false,
        page: 1,
        pageSize: 1,
        totalCount: 116,
        totalPages: 116,
      },
      rows: [],
    });

    render(await Home());

    expect(fetchPeopleOnMembersTable).toHaveBeenCalledWith({
      page: "1",
      pageSize: "1",
      tier: "등기조합원",
    });

    const kpiPanel = screen.getByRole("region", { name: "핵심 운영 지표" });

    expect(within(kpiPanel).getByText("등기조합원")).toBeInTheDocument();
    expect(within(kpiPanel).getByText("116명")).toBeInTheDocument();
  });
});
