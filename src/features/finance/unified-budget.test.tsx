import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { BudgetAllocationPanel } from "./budget-allocation-panel";
import { UnifiedBudgetTable } from "./unified-budget-table";
import { budgetRemaining,budgetUsed,type ReimbursementBudget } from "./reimbursement-domain";
import type { ReimbursementWorkspace } from "./reimbursement-repository";
const mocks=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock("@/app/finance/reimbursements/actions",()=>({assignBudgetSource:mocks.save}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
const budget:ReimbursementBudget={id:"b",budget_item:"운영비",monthly_amount:100000,approved_amount:1200000,annual_recorded_amount:90000,quick_amount:10000,personal_amount:20000,resolution_amount:30000,manual_amount:5000,reserved_amount:10000,pending_amount:15000,unpaid_amount:50000};
const w:ReimbursementWorkspace={month:"2026-03-01",member:{organization_id:"org",user_id:"admin",display_name:"관리자",permissions:["ADMIN"],active:true},members:[],policy:null,periods:[{month:"2026-03-01",status:"CLOSED",submission_deadline:"2026-04-05",completion_deadline:"2026-04-10",long_delay_days:60,revision:1}],budgets:[budget],requests:[],reports:[],audits:[],banks:[],sources:[],allocationBudgets:[{id:"b",budget_item:"운영비",fiscal_year:2026}],allocationSources:[{source_kind:"RESOLUTION",source_id:"r",title:"문구 구입",amount:80000,source_state:"APPROVED",suggested_month:null,suggested_budget:"운영비",paid_at:null,signature:"source-version",revision:0,lines:[],state:null,covered_amount:0,needs_review:true,reason:"귀속 확인 필요"}]};
describe("unified monthly budgeting",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("counts every usage source once without subtracting pending, unpaid or raw manual totals again",()=>{
   expect(budgetUsed(budget)).toBe(65000);expect(budgetRemaining(budget)).toBe(25000);
   expect(budgetRemaining({...budget,unpaid_amount:0})).toBe(25000);
 });
 it("filters clickable totals by budget and state, with selection and reset",()=>{
   render(<UnifiedBudgetTable budgets={[budget]} entries={[{source_kind:"RESOLUTION",source_id:"r",title:"사용 원본",budget_id:"b",month:"2026-03-01",amount:30000,state:"USED",paid_at:null},{source_kind:"RESERVATION",source_id:"r2",title:"예약 원본",budget_id:"b",month:"2026-03-01",amount:10000,state:"RESERVED",paid_at:null}]}/>);
   const used=screen.getByRole("button",{name:"운영비 실제 사용 내역"});fireEvent.click(used);
   expect(used).toHaveAttribute("aria-pressed","true");expect(screen.getByText(/사용 원본/)).toBeInTheDocument();expect(screen.queryByText(/예약 원본/)).not.toBeInTheDocument();
   fireEvent.click(screen.getByRole("button",{name:"운영비 집행 예약 내역"}));expect(used).toHaveAttribute("aria-pressed","false");expect(screen.getByText(/예약 원본/)).toBeInTheDocument();
   fireEvent.click(screen.getByRole("button",{name:"선택 해제"}));expect(screen.queryByRole("region",{name:"선택한 예산 내역"})).not.toBeInTheDocument();
 });
 it("labels incomplete budgets rather than presenting the remainder as spendable",()=>{
   render(<UnifiedBudgetTable budgets={[{...budget,unresolved_count:6}]}/>);
   expect(screen.getByRole("status")).toHaveTextContent("귀속 확인 필요 6건");expect(screen.getByRole("columnheader",{name:"확인분 잔액"})).toBeInTheDocument();
 });
 it("requires explicit month and preserves the entered allocation when persistence fails",async()=>{
   mocks.save.mockRejectedValueOnce(new Error("원본이 변경됐습니다.")).mockResolvedValueOnce(undefined);
   render(<BudgetAllocationPanel workspace={w}/>);
   fireEvent.change(screen.getByRole("combobox",{name:"원본 선택"}),{target:{value:"RESOLUTION:r"}});
   expect(screen.getByRole("combobox",{name:"귀속월 1"})).toHaveValue("");
   fireEvent.change(screen.getByRole("combobox",{name:"귀속월 1"}),{target:{value:"2026-03-01"}});
   fireEvent.change(screen.getByRole("combobox",{name:"예산항목 1"}),{target:{value:"b"}});
   fireEvent.change(screen.getByRole("textbox",{name:"배정·수정 사유"}),{target:{value:"원본 계약과 귀속 확인"}});
   expect(screen.getByText(/마감된 월의 수정이야/)).toBeInTheDocument();
   fireEvent.click(screen.getByRole("button",{name:"배정 확인·저장"}));
   await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("원본이 변경됐습니다."));
   expect(screen.getByRole("textbox",{name:"배정·수정 사유"})).toHaveValue("원본 계약과 귀속 확인");expect(mocks.refresh).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole("button",{name:"배정 확인·저장"}));
   await waitFor(()=>expect(mocks.refresh).toHaveBeenCalled());
   expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({source_id:"r",signature:"source-version",revision:0,state:"RESERVED",lines:[{budget_id:"b",month:"2026-03-01",amount:80000,used_on:""}]}));
 });
 it("disables mismatched split totals",()=>{
   render(<BudgetAllocationPanel workspace={w}/>);fireEvent.change(screen.getByRole("combobox",{name:"원본 선택"}),{target:{value:"RESOLUTION:r"}});
   fireEvent.change(screen.getByRole("spinbutton",{name:"배정액 1"}),{target:{value:"60000"}});
   expect(screen.getByRole("button",{name:"배정 확인·저장"})).toBeDisabled();
   fireEvent.click(screen.getByRole("button",{name:"배정 추가"}));fireEvent.change(screen.getByRole("spinbutton",{name:"배정액 2"}),{target:{value:"20000"}});
   expect(screen.getByRole("button",{name:"배정 확인·저장"})).not.toBeDisabled();
 });
});
