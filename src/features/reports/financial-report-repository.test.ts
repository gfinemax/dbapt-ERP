import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({identity:vi.fn(),rpc:vi.fn()}));
vi.mock("@/features/finance/reimbursement-auth",()=>({requireReimbursementIdentity:mocks.identity}));
vi.mock("@/features/finance/reimbursement-repository",()=>({reimbursementDb:()=>({schema:()=>({rpc:mocks.rpc})})}));
import { generateFinancialReportSnapshots, loadFinancialReportWorkspace } from "./financial-report-repository";

const live={generated_at:"2026-11-04T00:00:00Z",source:"ERP",monthly:{period_start:"2026-10-01",period_end:"2026-10-31",opening_balance:0,deposit_total:100000,withdrawal_total:20000,closing_balance:80000,unclassified_count:1,categories:[],transactions:[]},quarterly:{period_start:"2026-10-01",period_end:"2026-12-31",deposit_total:100000,withdrawal_total:20000,closing_balance:80000,assessment_total:100000,receipt_total:50000,active_member_count:1}};
beforeEach(()=>{
  mocks.identity.mockReset().mockResolvedValue({user_id:"actor",organization_id:"org",active:true,permissions:["ADMIN"]});
  mocks.rpc.mockReset().mockImplementation(async(name:string)=>name==="financial_report_live"?{data:live,error:null}:{data:[],error:null});
});
describe("financial report repository",()=>{
  it("loads live ERP figures and immutable history for the authenticated organization",async()=>{
    await expect(loadFinancialReportWorkspace()).resolves.toEqual({live,history:[]});
    expect(mocks.rpc).toHaveBeenCalledWith("financial_report_live",{p_org:"org",p_actor:"actor"});
    expect(mocks.rpc).toHaveBeenCalledWith("financial_report_history",{p_org:"org",p_actor:"actor"});
  });
  it("generates snapshots only through the server verified actor",async()=>{
    mocks.rpc.mockResolvedValue({data:{reports:[]},error:null});
    await generateFinancialReportSnapshots("정기 자동 생성");
    expect(mocks.rpc).toHaveBeenCalledWith("generate_financial_reports",{p_org:"org",p_actor:"actor",p_reason:"정기 자동 생성",p_report_types:["MONTHLY_CASH","QUARTERLY_PERFORMANCE"]});
  });
  it("rejects payment-inactive viewers before any report query",async()=>{
    mocks.identity.mockResolvedValue({user_id:"actor",organization_id:"org",active:false,permissions:["ADMIN"]});
    await expect(loadFinancialReportWorkspace()).rejects.toThrow("권한");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
