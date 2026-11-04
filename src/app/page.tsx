import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { buildDashboardStats } from "@/features/dashboard/dashboard-data";
import { fetchPeopleOnMembersTable } from "@/lib/peopleon/members-table";
import { getApprovalBudgetSummary, listApprovalDocuments } from "@/features/approval/approval-repository";
import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-login";
import { reimbursementLogout } from "@/app/finance/reimbursements/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  let member;
  let authenticationError;
  try {
    member = await reimbursementIdentity();
  } catch (error) {
    authenticationError = error instanceof Error
      ? error.message
      : "로그인 상태를 확인하지 못했어.";
  }

  if (!member) {
    return (
      <ErpShell userLabel="로그인 필요">
        <ReimbursementLogin
          description="대시보드와 회계·자금 업무에 같은 계정을 사용해. 한 번 로그인하면 메뉴를 이동해도 로그인 상태가 유지돼."
          error={authenticationError}
          title="ERP 로그인"
        />
      </ErpShell>
    );
  }

  const [peopleOnMembers, approvalDocuments, approvalBudget] = await Promise.all([
    fetchPeopleOnMembersTable({
      page: "1",
      pageSize: "1",
      tier: "등기조합원",
    }).catch(() => null),
    listApprovalDocuments().catch(() => []),
    getApprovalBudgetSummary().catch(() => ({
      approved: 0,
      available: 0,
      executed: 0,
      reserved: 0,
    })),
  ]);

  return (
    <DashboardPage
      approvalBudget={approvalBudget}
      approvalDocuments={approvalDocuments}
      dashboardStats={buildDashboardStats(peopleOnMembers?.pagination?.totalCount)}
      logoutAction={reimbursementLogout}
      userLabel={member.display_name}
    />
  );
}
