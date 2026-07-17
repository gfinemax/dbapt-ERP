"use server";
import { revalidatePath } from "next/cache";
import {
  addMeetingRule,
  getApprovalSettings,
  saveApprovalBudget,
  saveApprovalLineRule,
  saveApprovalSettings,
} from "@/features/approval/approval-settings-repository";
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
export async function saveApprovalBudgetAction(data: FormData) {
  const current = await getApprovalSettings();
  await saveApprovalBudget({
    approvedAmount: Number(value(data, "approvedAmount")),
    budgetItem: value(data, "budgetItem"),
    executedAmount: Number(value(data, "executedAmount")),
    fiscalYear: Number(value(data, "fiscalYear")),
    organizationId: current.organizationId,
  });
  revalidatePath("/basic-info/approval");
  revalidatePath("/approval/new");
  revalidatePath("/");
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
