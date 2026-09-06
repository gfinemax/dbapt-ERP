import { describe,it,expect } from "vitest";
import { budgetRemaining, budgetUsed, requestActions, periodLabel, type Reimbursement, type ReimbursementMember, type ReimbursementPeriod } from "./reimbursement-domain";
const member:ReimbursementMember={organization_id:"org",user_id:"approver",display_name:"승인자",active:true,permissions:["ADMIN"]};
const period:ReimbursementPeriod={month:"2026-03-01",status:"CLOSED",submission_deadline:"2026-04-05",completion_deadline:"2026-04-10",long_delay_days:60,revision:1};
export const request:Reimbursement={id:"r",applicant_id:"applicant",budget_id:"b",used_on:"2026-03-15",budget_month:"2026-03-01",amount:80000,merchant:"문구점",purpose:"사무용품",delay_reason:"영수증 누락",source_quick_id:null,status:"SUBMITTED",needs_exception:true,needs_senior:true,exception_approved_at:null,senior_approved_at:null,over_budget_approved_at:null,submitted_at:"2026-06-15T00:00:00Z",approved_at:null,paid_at:null,bank_transaction_id:null};
describe("personal reimbursement controls",()=>{
 it("requires exception and senior review before budget amendment",()=>{
   expect(requestActions(request,member,period)).not.toContain("APPROVE");
   expect(requestActions({...request,exception_approved_at:"now",senior_approved_at:"now"},member,period)).toContain("APPROVE");
 });
 it("prevents self approval even for administrators",()=>{
   expect(requestActions({...request,applicant_id:member.user_id},member,period)).toEqual(["CANCEL"]);
 });
 it("requires close permission for a closed period",()=>{
   expect(requestActions({...request,exception_approved_at:"now",senior_approved_at:"now"},{...member,permissions:["APPROVE"]},period)).not.toContain("APPROVE");
 });
 it("does not allow cancellation of a paid claim before reversing the link",()=>{
   expect(requestActions({...request,status:"PAID"},member,period)).toEqual(["REVERSE_PAYMENT"]);
 });
 it("counts budget use independently of cash payment and subtracts reservations",()=>{
   const b={id:"b",budget_item:"운영비",monthly_amount:100000,approved_amount:1200000,annual_recorded_amount:0,quick_amount:10000,personal_amount:80000,unpaid_amount:80000,reserved_amount:5000};
   expect(budgetUsed(b)).toBe(90000); expect(budgetRemaining(b)).toBe(5000);
   expect(budgetUsed({...b,unpaid_amount:0})).toBe(90000);
 });
 it("distinguishes deadline expiry from a confirmed close",()=>{
   expect(periodLabel({...period,status:"OPEN"},"2026-04-06")).toBe("보완 접수");
   expect(periodLabel({...period,status:"OPEN"},"2026-04-11")).toContain("마감 대기");
   expect(periodLabel(period,"2026-06-01")).toBe("마감");
 });
});
