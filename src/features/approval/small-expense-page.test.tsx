import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SmallExpensePage } from "./small-expense-page";
import { summarizeSmallExpenses, type SmallExpense } from "./small-expense-domain";
import type { SmallExpenseWorkspace } from "./small-expense-repository";
const { review, refresh } = vi.hoisted(() => ({ review: vi.fn().mockResolvedValue(undefined), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/approval/small-expense/actions", () => ({ reviewSmallExpenses: review, createSmallExpenseAction: vi.fn(), configureSmallExpenseRoles: vi.fn() }));
vi.mock("@/app/finance/reimbursements/actions", () => ({ reimbursementLogin: vi.fn() }));
const row: SmallExpense = { id:"one", expenseDate:"2026-09-07",partnerName:"문구점",description:"복사용지 구입",projectName:"",accountSubjectName:"소모품비",amount:15000,payerLabel:"사무국장",memo:"",reviewStatus:"PENDING",registeredBy:"director",spenderId:"director",confirmedLabel:null,confirmedAt:null,reviewReason:"",revision:1,budgetId:"budget",paymentMethod:"CASH",bankTransactionId:null,cardTransactionId:null,hasEvidence:true };
const workspace: SmallExpenseWorkspace = { member:{organization_id:"org",user_id:"chair",display_name:"조합장",permissions:[],active:true},roles:{director_id:"director",chair_id:"chair"},members:[],rows:[row,{...row,id:"self",description:"조합장 사용",spenderId:"chair"}],budgets:[],sources:[],month:"2026-09",limit:50000,audits:[] };

describe("소액지출 확인 화면", () => {
  it("조합장은 본인 건을 제외하고 증빙 확인 후 선택 확정한다", async () => {
    render(<SmallExpensePage workspace={workspace}/>);
    expect(screen.queryByRole("button",{name:"내역 등록"})).not.toBeInTheDocument();
    expect(screen.getByLabelText("조합장 사용 선택")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("복사용지 구입 선택"));
    const confirm=screen.getByRole("button",{name:"선택 내역 확정"});
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText("선택한 내역의 업무 목적·금액·영수증을 확인했습니다."));
    fireEvent.click(confirm);
    await waitFor(()=>expect(review).toHaveBeenCalledWith("CONFIRM",{items:[{id:"one",revision:1}],evidence_verified:true,reason:""}));
    expect(refresh).toHaveBeenCalled();
  });
  it("사무국장에게는 확정 버튼을 노출하지 않는다", () => {
    render(<SmallExpensePage workspace={{...workspace,member:{...workspace.member,user_id:"director"}}}/>);
    expect(screen.getByRole("button",{name:"내역 등록"})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"선택 내역 확정"})).not.toBeInTheDocument();
  });
  it("월별 합계는 확정 건만 포함하고 대기·취소·기존 일괄결의는 제외한다", () => {
    const summary=summarizeSmallExpenses([row,{...row,id:"2",reviewStatus:"CONFIRMED"},{...row,id:"3",amount:20000,accountSubjectName:"수선비",reviewStatus:"CONFIRMED"},{...row,id:"4",reviewStatus:"CANCELLED"},{...row,id:"5",reviewStatus:"LEGACY_BATCH"}]);
    expect(summary).toMatchObject({pendingCount:1,confirmedCount:2,confirmedAmount:35000});
    expect(summary.accounts).toHaveLength(2);
  });
});
