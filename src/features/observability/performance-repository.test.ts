import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: () => ({ schema: () => ({ rpc: mocks.rpc }) }) }));

import { loadPerformanceDashboard } from "./performance-repository";

const actor = { active: true, display_name: "관리자", organization_id: "org", permissions: ["ADMIN"], user_id: "user" } satisfies import("@/features/finance/reimbursement-domain").ReimbursementMember;

describe("performance repository", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("loads organization-scoped aggregates for an administrator", async () => {
    const dashboard = { days: 7, lastMeasuredAt: null, metrics: [], routeCount: 0, routes: [], sampleCount: 0 };
    mocks.rpc.mockResolvedValue({ data: dashboard, error: null });
    await expect(loadPerformanceDashboard(actor)).resolves.toEqual(dashboard);
    expect(mocks.rpc).toHaveBeenCalledWith("performance_dashboard", { p_actor: "user", p_days: 7, p_org: "org" });
  });

  it("does not expose the dashboard to non-admin users", async () => {
    await expect(loadPerformanceDashboard({ ...actor, permissions: ["APPROVE"] })).rejects.toThrow("관리자만");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
