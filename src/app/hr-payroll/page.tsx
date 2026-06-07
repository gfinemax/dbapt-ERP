import { HrPayrollPage } from "@/features/hr-payroll/hr-payroll-page";
import type { HrPayrollSection } from "@/features/hr-payroll/hr-payroll-data";

type HrPayrollRouteProps = {
  searchParams?: Promise<{
    section?: string | string[];
  }>;
};

export function parseHrPayrollSection(section: string | string[] | undefined): HrPayrollSection {
  const value = Array.isArray(section) ? section[0] : section;

  if (value === "payroll-entry" || value === "payroll-ledger") {
    return value;
  }

  return "employees";
}

export default async function HrPayrollRoute({ searchParams }: HrPayrollRouteProps) {
  const params = await searchParams;

  return <HrPayrollPage initialSection={parseHrPayrollSection(params?.section)} />;
}
