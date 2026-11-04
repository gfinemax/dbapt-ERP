"use server";
import { revalidatePath } from "next/cache";
import { generateFinancialReportSnapshots } from "@/features/reports/financial-report-repository";

export async function generateCurrentFinancialReports() {
  const result = await generateFinancialReportSnapshots("현재 ERP 통장거래·수납원장 기준 자동 생성");
  revalidatePath("/finance/reports");
  return result;
}
