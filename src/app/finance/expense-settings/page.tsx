import { defaultExpenseComplianceSettings } from "@/features/finance/expense-compliance";
import { getDefaultOrganizationId, getExpenseComplianceSettings } from "@/features/finance/expense-compliance-repository";
import { ExpenseComplianceSettingsPage } from "@/features/finance/expense-compliance-settings-page";
import { saveExpenseComplianceSettingsAction } from "../expense-resolutions/actions";

export default async function ExpenseSettingsRoute() {
  let organizationId: string | undefined;
  let initialSettings = null;
  try {
    organizationId = await getDefaultOrganizationId();
    initialSettings = organizationId ? await getExpenseComplianceSettings(organizationId) : null;
  } catch (error) {
    console.warn(`[expense-settings] Supabase data unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  return <ExpenseComplianceSettingsPage initialSettings={initialSettings ?? defaultExpenseComplianceSettings} organizationId={organizationId} saveSettings={saveExpenseComplianceSettingsAction} />;
}
