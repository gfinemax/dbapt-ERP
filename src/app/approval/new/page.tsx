import { ApprovalNewPage } from "@/features/approval/approval-new-page";
import {
  listApprovalBudgets,
  listApprovalLineRules,
} from "@/features/approval/approval-settings-repository";
import { listBusinessPartnersFromSupabase } from "@/features/basic-info/business-partner-repository";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
export const dynamic = "force-dynamic";
export default async function Page() {
  const [budgets, partners, accounts, lineRules] = await Promise.all([
    listApprovalBudgets().catch(() => []),
    listBusinessPartnersFromSupabase()
      .then((value) => value ?? [])
      .catch(() => []),
    listAccountSubjectsFromSupabase()
      .then((value) => value ?? [])
      .catch(() => []),
    listApprovalLineRules().catch(() => []),
  ]);
  return (
    <ApprovalNewPage
      accountSubjects={accounts
        .filter((item) => item.isActive)
        .map((item) => item.name)}
      budgets={budgets}
      lineRules={lineRules}
      partners={partners.map((item) => item.name)}
    />
  );
}
