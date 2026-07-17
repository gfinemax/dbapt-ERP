import { describe, expect, it } from "vitest";
import { buildApprovalDashboard } from "./approval-dashboard";
import { calculateBudgetAvailability, canExecute, isMaterialApprovalChange, reconcileReservation, validateSmallExpensePolicy, type ApprovalDocument } from "./approval-domain";
const base:ApprovalDocument={amount:1_000_000,approvalStatus:"APPROVED",approvalSteps:[],body:"",budgetItem:"운영비",createdAt:"2026-07-17",departmentLabel:"사무국",documentNo:"APR-2026-000001",documentType:"EXPENSE",drafterLabel:"기안자",executionStatus:"BUDGET_RESERVED",id:"doc-1",meetingStatus:"NOT_REQUIRED",purpose:"",reservedAmount:1_000_000,title:"지출품의",updatedAt:"2026-07-17"};
describe("기안·결재 통합 시나리오",()=>{
  it("A. 예산 예약과 실제 지급 차액을 분리한다",()=>{expect(calculateBudgetAvailability(10_000_000,3_000_000,2_000_000,1_000_000)).toEqual({approved:10_000_000,available:5_000_000,executed:3_000_000,expectedBalance:4_000_000,request:1_000_000,reserved:2_000_000});expect(reconcileReservation(1_000_000,900_000)).toMatchObject({released:100_000,status:"CONSUMED"});});
  it("B. 의결 전 계약 집행을 잠근다",()=>{expect(canExecute({...base,meetingStatus:"REQUIRED"})).toBe(false);expect(canExecute({...base,meetingStatus:"APPROVED"})).toBe(true);});
  it("C. 승인 후 중요 변경은 재결재 대상이다",()=>{expect(isMaterialApprovalChange(base,{...base,amount:1_100_000})).toBe(true);expect(reconcileReservation(1_000_000,1_100_000).requiresReapproval).toBe(true);});
  it("D. 소액결의 한도와 제외업무를 차단한다",()=>{expect(()=>validateSmallExpensePolicy({amount:40_000,description:"문구 구매",limit:50_000})).not.toThrow();expect(()=>validateSmallExpensePolicy({amount:10_000,description:"계약 관련 지급",limit:50_000})).toThrow("제외");});
  it("E. 여러 역할의 같은 문서를 중복 표시하지 않는다",()=>{expect(buildApprovalDashboard([base,base],undefined,["ACCOUNTING","AUDITOR"]).tasks).toHaveLength(1);});
  it("F. 의결 미연결 문서를 확인 필요로 분류한다",()=>{const result=buildApprovalDashboard([{...base,meetingStatus:"REQUIRED"}],undefined,["AUDITOR"]);expect(result.cards.find(card=>card.label==="확인 필요")?.count).toBe(1);});
});
