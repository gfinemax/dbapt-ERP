import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { fetchPeopleOnMembersTable } from "@/lib/peopleon/members-table";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";

vi.mock("@/lib/peopleon/members-table", () => ({
  fetchPeopleOnMembersTable: vi.fn(),
}));
vi.mock("@/features/finance/reimbursement-auth", () => ({
  reimbursementIdentity: vi.fn(),
}));
vi.mock("@/app/finance/reimbursements/actions", () => ({
  reimbursementLogin: vi.fn(),
  reimbursementLogout: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("home route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reimbursementIdentity).mockResolvedValue({
      active: true,
      display_name: "운영 관리자",
      organization_id: "organization-one",
      permissions: ["ADMIN"],
      user_id: "user-one",
    });
  });

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
    expect(screen.getByText("운영 관리자")).toBeInTheDocument();
  });

  it("requires the shared ERP session before rendering dashboard data", async () => {
    vi.mocked(reimbursementIdentity).mockResolvedValueOnce(null);

    render(await Home());

    expect(screen.getByRole("heading", { name: "ERP 로그인" })).toBeInTheDocument();
    expect(screen.getAllByText("로그인 필요").length).toBeGreaterThan(0);
    expect(fetchPeopleOnMembersTable).not.toHaveBeenCalled();
  });
});
