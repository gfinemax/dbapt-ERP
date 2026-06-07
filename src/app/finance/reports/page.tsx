import { ReportsPage } from "@/features/reports/reports-page";
import type { ReportSection } from "@/features/reports/report-data";

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

  return <ReportsPage initialSection={parseReportSection(params?.section)} />;
}
