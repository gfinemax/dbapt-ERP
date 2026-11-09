import { ErpShell } from "@/components/erp-shell";
import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { PerformanceDashboardPage } from "@/features/observability/performance-dashboard-page";
import { loadPerformanceDashboard } from "@/features/observability/performance-repository";

export const dynamic = "force-dynamic";

export default async function Page() {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>> | null = null;
  let dashboard: Awaited<ReturnType<typeof loadPerformanceDashboard>> | null = null;
  let message: string | undefined;
  try {
    actor = await requireExpenseActor("ADMIN");
    dashboard = await loadPerformanceDashboard(actor);
  } catch (error) {
    message = error instanceof Error ? error.message : "성능 현황을 불러오지 못했어.";
  }
  return <ErpShell userLabel={actor?.display_name ?? "로그인 필요"} logoutAction={actor ? reimbursementLogout : undefined} activeLabel="회계·자금" activeWorkspaceLabel="연동·설정" activeDetailLabel="시스템 속도"><div className="mx-auto max-w-7xl">{dashboard ? <PerformanceDashboardPage dashboard={dashboard} /> : <section className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">시스템 속도</h1><p className="mt-3" role="alert">{message ?? "관리자 로그인이 필요해."}</p></section>}</div></ErpShell>;
}
