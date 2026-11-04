import { afterEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock("@/features/reports/financial-report-repository",()=>({generateScheduledFinancialReports:mocks.generate}));
import { GET } from "./route";

describe("financial reports cron",()=>{
  afterEach(()=>{delete process.env.CRON_SECRET;mocks.generate.mockReset();});
  it("rejects requests without the Vercel cron bearer secret",async()=>{
    process.env.CRON_SECRET="secret-value";
    const response=await GET(new Request("https://erp.example/api/cron/financial-reports"));
    expect(response.status).toBe(401); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("generates scheduled reports only after bearer verification",async()=>{
    process.env.CRON_SECRET="secret-value"; mocks.generate.mockResolvedValue([]);
    const response=await GET(new Request("https://erp.example/api/cron/financial-reports",{headers:{authorization:"Bearer secret-value"}}));
    expect(response.status).toBe(200); expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
