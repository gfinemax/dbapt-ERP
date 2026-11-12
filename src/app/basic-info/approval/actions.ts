"use server";
import { revalidatePath } from "next/cache";
import {
  addMeetingRule,
  getApprovalSettings,
  saveApprovalLineRule,
  saveApprovalSettings,
  runBudgetGovernanceCommand,
} from "@/features/approval/approval-settings-repository";
import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";
const value = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
export async function saveApprovalSettingsAction(data: FormData) {
  const current = await getApprovalSettings();
  await saveApprovalSettings({
    ...current,
    meetingThresholdAmount: Number(value(data, "meetingThresholdAmount")),
    smallExpenseLimit: Number(value(data, "smallExpenseLimit")),
  });
  revalidatePath("/basic-info/approval");
}
export async function addMeetingRuleAction(data: FormData) {
  const current = await getApprovalSettings();
  await addMeetingRule({
    keyword: value(data, "keyword"),
    organizationId: current.organizationId,
    reason: value(data, "reason"),
    regulationReference: value(data, "regulationReference"),
    recommendedBody: value(data, "recommendedBody"),
    ruleName: value(data, "ruleName"),
  });
  revalidatePath("/basic-info/approval");
}
export async function saveApprovalLineRuleAction(data: FormData) {
  const current = await getApprovalSettings();
  const steps = [1, 2, 3, 4]
    .map((index) => ({
      approverLabel: value(data, `stepRole${index}`),
      approverRole: value(data, `stepPosition${index}`),
    }))
    .filter((step) => step.approverLabel);
  await saveApprovalLineRule({
    documentType: value(data, "documentType"),
    maxAmount: Number(value(data, "maxAmount")) || undefined,
    minAmount: Number(value(data, "minAmount")) || 0,
    organizationId: current.organizationId,
    ruleName: value(data, "ruleName"),
    steps,
  });
  revalidatePath("/basic-info/approval");
  revalidatePath("/approval/new");
}

function refreshBudgetGovernance() {
  revalidatePath("/basic-info/approval");
  revalidatePath("/approval/new");
  revalidatePath("/finance/reimbursements");
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/");
}

export async function createBudgetPlanAction(data: FormData) {
  const member=await requireReimbursementIdentity();
  await runBudgetGovernanceCommand(member,"CREATE_PLAN",{
    fiscal_year:Number(value(data,"fiscalYear")),
    source_year:Number(value(data,"sourceYear"))||null,
    title:value(data,"title"),
  });
  refreshBudgetGovernance();
}

export async function saveBudgetPlanItemAction(data: FormData) {
  const member=await requireReimbursementIdentity();
  await runBudgetGovernanceCommand(member,"SAVE_PLAN_ITEM",{
    plan_id:value(data,"planId"),
    item:{
      id:value(data,"itemId")||null,
      approved_amount:Number(value(data,"approvedAmount")),
      budget_code:value(data,"budgetCode"),
      budget_item:value(data,"budgetItem"),
      calculation_basis:value(data,"calculationBasis"),
      mapping_note:value(data,"mappingNote"),
      mapping_status:value(data,"mappingStatus")||"POLICY_REVIEW",
      monthly_amount:Number(value(data,"monthlyAmount")),
      plan_item_label:value(data,"planItemLabel"),
      plan_section:value(data,"planSection"),
      sort_order:Number(value(data,"sortOrder"))||9990,
    },
  });
  refreshBudgetGovernance();
}

export async function submitBudgetPlanAction(data: FormData) {
  const member=await requireReimbursementIdentity();
  await runBudgetGovernanceCommand(member,"SUBMIT_PLAN",{plan_id:value(data,"planId")});
  refreshBudgetGovernance();
}

export async function approveBudgetPlanAction(data: FormData) {
  const member=await requireReimbursementIdentity();
  await runBudgetGovernanceCommand(member,"APPROVE_PLAN",{
    plan_id:value(data,"planId"),
    authority_reference:value(data,"authorityReference"),
    notes:value(data,"notes"),
    title:value(data,"title"),
  });
  refreshBudgetGovernance();
}

export async function createBudgetAdjustmentAction(data: FormData) {
  const member=await requireReimbursementIdentity();
  await runBudgetGovernanceCommand(member,"CREATE_ADJUSTMENT",{
    adjustment_type:value(data,"adjustmentType"),
    amount:Number(value(data,"amount")),
    authority_reference:value(data,"authorityReference"),
    effective_month:value(data,"effectiveMonth"),
    fiscal_year:Number(value(data,"fiscalYear")),
    reason:value(data,"reason"),
    source_budget_id:value(data,"sourceBudgetId")||null,
    target_budget_id:value(data,"targetBudgetId")||null,
  });
  refreshBudgetGovernance();
}

async function decideBudgetAdjustment(data: FormData, command: string) {
  const member=await requireReimbursementIdentity();
  await runBudgetGovernanceCommand(member,command,{
    decision_note:value(data,"decisionNote"),
    id:value(data,"id"),
    reason:value(data,"reason"),
  });
  refreshBudgetGovernance();
}
export async function submitBudgetAdjustmentAction(data: FormData) {
  await decideBudgetAdjustment(data,"SUBMIT_ADJUSTMENT");
}
export async function approveBudgetAdjustmentAction(data: FormData) {
  await decideBudgetAdjustment(data,"APPROVE_ADJUSTMENT");
}
export async function rejectBudgetAdjustmentAction(data: FormData) {
  await decideBudgetAdjustment(data,"REJECT_ADJUSTMENT");
}
export async function cancelBudgetAdjustmentAction(data: FormData) {
  await decideBudgetAdjustment(data,"CANCEL_ADJUSTMENT");
}
