import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { ReimbursementPage } from "./reimbursement-page";
import type { ReimbursementWorkspace } from "./reimbursement-repository";
const mocks=vi.hoisted(()=>({command:vi.fn(),refresh:vi.fn(),push:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh,push:mocks.push})}));
vi.mock("@/app/finance/reimbursements/actions",()=>({runReimbursementCommand:mocks.command,reimbursementLogin:vi.fn(),reimbursementLogout:vi.fn(),submitReimbursement:vi.fn(),reimbursementEvidence:vi.fn(),saveReimbursementMember:vi.fn(),changeReimbursementPassword:vi.fn()}));
const w:ReimbursementWorkspace={month:"2026-03-01",member:{user_id:"a",organization_id:"o",display_name:"관리자",permissions:["ADMIN"],active:true},members:[],policy:null,periods:[{month:"2026-03-01",status:"CLOSED",submission_deadline:"2026-04-05",completion_deadline:"2026-04-10",long_delay_days:60,revision:1}],requests:[{id:"r",applicant_id:"b",budget_id:"budget",used_on:"2026-03-15",budget_month:"2026-03-01",amount:80000,merchant:"문구점",purpose:"사무용품",delay_reason:"영수증 누락",source_quick_id:null,status:"APPROVED",needs_exception:true,needs_senior:false,exception_approved_at:"2026-06-01",senior_approved_at:null,over_budget_approved_at:null,submitted_at:"2026-06-01",approved_at:"2026-06-02",paid_at:null,bank_transaction_id:null}],budgets:[],reports:[],audits:[],banks:[{id:"bank",transacted_at:"2026-06-15T12:00:00+09:00",withdrawal_amount:80000,counterparty:"신청자",description:"정산"}],sources:[]};
describe("reimbursement workspace",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("passes a bank ID rather than a backdated payment date and refreshes after saving",async()=>{
  mocks.command.mockResolvedValue({}); render(<ReimbursementPage workspace={w}/>);
  fireEvent.click(screen.getByRole("button",{name:"지급 연결",exact:true}));
  fireEvent.change(screen.getByRole("combobox",{name:/실제 출금거래/}),{target:{value:"bank"}});
  fireEvent.change(screen.getByRole("textbox",{name:"처리 사유"}),{target:{value:"이체 확인"}});
  fireEvent.click(screen.getByRole("button",{name:"확인·처리"}));
  await waitFor(()=>expect(mocks.command).toHaveBeenCalledWith("PAY",{id:"r",reason:"이체 확인",bank_transaction_id:"bank"}));
  expect(mocks.refresh).toHaveBeenCalled();
 });
 it("keeps the dialog and entered reason on persistence failure",async()=>{
  mocks.command.mockRejectedValue(new Error("이미 연결된 출금거래")); render(<ReimbursementPage workspace={w}/>);
  fireEvent.click(screen.getByRole("button",{name:"신청 취소"}));
  fireEvent.change(screen.getByRole("textbox",{name:"처리 사유"}),{target:{value:"중복 확인"}});
  fireEvent.click(screen.getByRole("button",{name:"확인·처리"}));
  await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("이미 연결된 출금거래"));
  expect(screen.getByRole("textbox",{name:"처리 사유"})).toHaveValue("중복 확인"); expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it("does not invent deadline defaults",()=>{
  render(<ReimbursementPage workspace={w}/>);fireEvent.click(screen.getByRole("button",{name:"운영 기준·권한"}));
  expect(screen.getByRole("spinbutton",{name:"다음 달 제출 마감일"})).toHaveValue(null);
 });
 it("allows the first request to auto-open its usage month when policy exists",()=>{
  render(<ReimbursementPage workspace={{...w,periods:[],policy:{submission_day:5,completion_day:10,long_delay_days:60}}}/>);
  expect(screen.getByText(/접수월은 신청과 함께 자동 개설돼/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"정산 신청"})).toBeEnabled();
 });
 it("blocks automatic period creation only when the operating policy is missing",()=>{
  render(<ReimbursementPage workspace={{...w,periods:[],policy:null}}/>);
  expect(screen.getByText("접수월 자동 개설에 필요한 운영 기준을 관리자가 먼저 저장해야 해.")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"정산 신청"})).toBeDisabled();
 });
});
