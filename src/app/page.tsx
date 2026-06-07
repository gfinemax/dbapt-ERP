import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { buildDashboardStats } from "@/features/dashboard/dashboard-data";
import { fetchPeopleOnMembersTable } from "@/lib/peopleon/members-table";

export default async function Home() {
  const peopleOnMembers = await fetchPeopleOnMembersTable({
    page: "1",
    pageSize: "1",
    tier: "등기조합원",
  }).catch(() => null);

  return <DashboardPage dashboardStats={buildDashboardStats(peopleOnMembers?.pagination?.totalCount)} />;
}
