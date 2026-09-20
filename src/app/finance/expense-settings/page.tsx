import { defaultExpenseComplianceSettings } from "@/features/finance/expense-compliance";
import { getDefaultOrganizationId, getExpenseComplianceSettings } from "@/features/finance/expense-compliance-repository";
import { ExpenseComplianceSettingsPage } from "@/features/finance/expense-compliance-settings-page";
import { getExpensePolicyWorkspace } from "@/features/finance/expense-policy-repository";
import type { ExpensePolicyWorkspace } from "@/features/finance/expense-policy-settings";
import { saveExpenseComplianceSettingsAction } from "../expense-resolutions/actions";
import { createExpensePolicyDraftAction, previewExpensePolicyAction, transitionExpensePolicyAction } from "./actions";

export default async function ExpenseSettingsRoute() {
  let organizationId: string | undefined;
  let initialSettings = null;
  let policyWorkspace: ExpensePolicyWorkspace = { preview: { delayedReimbursements: 0, longDelayedReimbursements: 0, pendingExpenseResolutions: 0, pendingQuickExpenses: 0, pendingReimbursements: 0, priorYearReimbursements: 0 }, versions: [] };
  try {
    organizationId = await getDefaultOrganizationId();
    initialSettings = organizationId ? await getExpenseComplianceSettings(organizationId) : null;
    policyWorkspace = organizationId ? await getExpensePolicyWorkspace(organizationId) : policyWorkspace;
  } catch (error) {
    console.warn(`[expense-settings] Supabase data unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  return <ExpenseComplianceSettingsPage initialSettings={initialSettings ?? defaultExpenseComplianceSettings} organizationId={organizationId} policyWorkspace={policyWorkspace} previewPolicy={previewExpensePolicyAction} savePolicyDraft={createExpensePolicyDraftAction} saveSettings={saveExpenseComplianceSettingsAction} transitionPolicy={transitionExpensePolicyAction} />;
}
