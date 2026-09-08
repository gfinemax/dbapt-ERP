import { describe, it, expect } from "vitest";
import { canDecideApproval, isApprovalAuthor } from "./approval-access-model";
import type { ApprovalDocument } from "./approval-domain";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
const viewer: ReimbursementMember = { user_id: "bound-user", organization_id: "org", display_name: "동명이인", permissions: ["APPROVE"], active: true };
const document = {approvalStatus:"IN_REVIEW", drafterLabel:"동명이인", approvalSteps:[{order:1,approverLabel:"동명이인",approverRole:"담당자",status:"PENDING"}],authorization:{drafter_user_id:"bound-user",version:2,steps:[{order:1,user_id:"bound-user",legacy_step:{step_id:"s1",approver_label:"동명이인",approver_role:"담당자"}}]}} as ApprovalDocument;
describe("approval account access", () => {
 it("matches the exact UUID instead of identical names", () => {expect(canDecideApproval(document,viewer)).toBe(true);expect(isApprovalAuthor(document,viewer)).toBe(true);expect(canDecideApproval(document,{...viewer,user_id:"other"})).toBe(false);expect(isApprovalAuthor(document,{...viewer,user_id:"other"})).toBe(false);});
 it("blocks missing binding, inactive membership, wrong role, and noncurrent step", () => {expect(canDecideApproval({...document,authorization:null},viewer)).toBe(false);expect(canDecideApproval(document,{...viewer,active:false})).toBe(false);expect(canDecideApproval(document,{...viewer,permissions:["PAY"]})).toBe(false);expect(canDecideApproval({...document,approvalStatus:"APPROVED"},viewer)).toBe(false);expect(canDecideApproval({...document,approvalSteps:[{...document.approvalSteps[0],order:2}]},viewer)).toBe(false);});
});
