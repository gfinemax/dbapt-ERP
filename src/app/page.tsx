import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { buildDashboardStats } from "@/features/dashboard/dashboard-data";
import { fetchPeopleOnMembersTable } from "@/lib/peopleon/members-table";
import { getApprovalBudgetSummary, listApprovalDocuments } from "@/features/approval/approval-repository";

export default async function Home() {
  const peopleOnMembers = await fetchPeopleOnMembersTable({
    page: "1",
    pageSize: "1",
    tier: "등기조합원",
  }).catch(() => null);
  const approvalDocuments = await listApprovalDocuments().catch(() => []);
  const approvalBudget = await getApprovalBudgetSummary().catch(() => ({ approved: 0, available: 0, executed: 0, reserved: 0 }));

  return <DashboardPage approvalBudget={approvalBudget} approvalDocuments={approvalDocuments} dashboardStats={buildDashboardStats(peopleOnMembers?.pagination?.totalCount)} />;
}
