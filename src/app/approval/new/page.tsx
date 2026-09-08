import { requireApprovalActor } from "@/features/approval/approval-authorization";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { ApprovalNewPage } from "@/features/approval/approval-new-page";
import { listApprovalBudgets } from "@/features/approval/approval-settings-repository";
import { listBusinessPartnersFromSupabase } from "@/features/basic-info/business-partner-repository";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
export const dynamic = "force-dynamic";
export default async function Page() {
let viewer; try { viewer = await requireApprovalActor(); } catch(error) { return <ReimbursementLogin title="기안·결재" description="본인 계정으로 로그인해줘." error={error instanceof Error ? error.message : "로그인이 필요해."} />; }

  const [budgets, partners, accounts] = await Promise.all([
    listApprovalBudgets(viewer.organization_id).catch(() => []),
    listBusinessPartnersFromSupabase(viewer.organization_id)
      .then((value) => value ?? [])
      .catch(() => []),
    listAccountSubjectsFromSupabase(viewer.organization_id)
      .then((value) => value ?? [])
      .catch(() => []),
  ]);
  return (
    <ApprovalNewPage
      viewer={viewer}
      accountSubjects={accounts
        .filter((item) => item.isActive)
        .map((item) => item.name)}
      budgets={budgets}
      partners={partners.map((item) => item.name)}
    />
  );
}
