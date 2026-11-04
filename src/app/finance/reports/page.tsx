import { ReportsPage } from "@/features/reports/reports-page";
import type { ReportSection } from "@/features/reports/report-data";
import { loadFinancialReportWorkspace } from "@/features/reports/financial-report-repository";

type ReportsRouteProps = {
  searchParams?: Promise<{
    section?: string | string[];
  }>;
};

export function parseReportSection(section: string | string[] | undefined): ReportSection {
  const value = Array.isArray(section) ? section[0] : section;

  if (value === "performance" || value === "cash-flow" || value === "budget" || value === "overview") {
    return value;
  }

  return "overview";
}

export default async function ReportsRoute({ searchParams }: ReportsRouteProps) {
  const params = await searchParams;
  let workspace; let error;
  try { workspace = await loadFinancialReportWorkspace(); }
  catch (cause) { error = cause instanceof Error ? cause.message : "ERP 보고서 자료를 불러오지 못했어."; }
  return <ReportsPage initialSection={parseReportSection(params?.section)} workspace={workspace} loadError={error} />;
}
