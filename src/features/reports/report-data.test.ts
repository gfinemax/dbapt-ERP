import { describe, expect, it } from "vitest";
import {
  cashFlowStatement,
  findImpactedReportRuns,
  formatKrw,
  generatedReportRuns,
  getMonthlyGenerationDate,
  getQuarterlyGenerationDate,
  getReportSummary,
  getScheduledReportRuns,
  operatingBudget,
  quarterlyPerformanceReport,
  reportFontFamily,
} from "./report-data";

describe("report data", () => {
  it("keeps the quarterly performance report structure from the DOCX template", () => {
    expect(reportFontFamily).toBe('"Trebuchet MS", "Malgun Gothic", sans-serif');
    expect(quarterlyPerformanceReport.title).toBe("대방동 지역주택조합 실적보고서");
    expect(quarterlyPerformanceReport.period).toBe("2026.1.1.부터 2026.3.31.까지");
    expect(quarterlyPerformanceReport.basis).toContain("주택법 제 12조");
    expect(quarterlyPerformanceReport.sections.map((section) => section.title)).toEqual([
      "조합원 모집 현황",
      "해당 주택건설대지의 사용권원 및 소유권 확보 현황",
      "주택조합사업에 필요한 관련 법령에 따른 신고, 승인 및 인허가 등의 추진 현황",
      "토지용역, 설계자, 시공자 및 업무대행자 등과의 계약체결 현황",
      "운영비 예산",
    ]);
    expect(quarterlyPerformanceReport.sections[0].rows[1]).toEqual(["59m(25평)", "17명", "", "1차조합원 조합변경인가 신청중(조합원 현행화)"]);
    expect(quarterlyPerformanceReport.sections[4].rows).toHaveLength(105);
  });

  it("summarizes the cash flow and budget reference amounts", () => {
    expect(cashFlowStatement.month).toBe("2026년 3월");
    expect(cashFlowStatement.detailRows.at(-1)).toEqual(["합  계", "", "8,266,110", ""]);
    expect(operatingBudget.rows[0]).toEqual(["인건비", "급여", "조합장", "4,000,000", "51,600,000", "51,600,000", "조합장 급여"]);
    expect(getReportSummary()).toEqual({
      memberTotal: "116명",
      cashFlowClosingBalance: "4,490,000원",
      monthlyOperatingExpense: "8,266,110원",
      annualBudget: "181,354,968원",
    });
    expect(formatKrw(8266110)).toBe("8,266,110원");
  });

  it("calculates automatic generation dates for monthly and quarterly reports", () => {
    expect(getQuarterlyGenerationDate(2026, 1)).toBe("2026-04-01");
    expect(getQuarterlyGenerationDate(2026, 2)).toBe("2026-07-01");
    expect(getQuarterlyGenerationDate(2026, 3)).toBe("2026-10-01");
    expect(getQuarterlyGenerationDate(2026, 4)).toBe("2027-01-01");
    expect(getMonthlyGenerationDate(2026, 1)).toBe("2026-02-01");
    expect(getMonthlyGenerationDate(2026, 12)).toBe("2027-01-01");
  });

  it("tracks generated report runs as a versioned list", () => {
    expect(generatedReportRuns.map((report) => report.title)).toContain("2026년 1분기 실적보고서");
    expect(generatedReportRuns.find((report) => report.id === "performance-2026-q1")).toMatchObject({
      generationDate: "2026-04-01",
      publicationTargets: ["홈페이지", "정보몽땅"],
      status: "수정필요",
      version: 2,
    });
    expect(generatedReportRuns.find((report) => report.id === "cash-flow-2026-03")).toMatchObject({
      generationDate: "2026-04-01",
      status: "수정필요",
      version: 2,
    });
  });

  it("finds report runs impacted by an edited expense date", () => {
    expect(findImpactedReportRuns("2026-03-15")).toEqual(["cash-flow-2026-03", "performance-2026-q1"]);
    expect(findImpactedReportRuns("2026-05-02")).toEqual(["cash-flow-2026-05", "performance-2026-q2"]);
  });

  it("returns report runs that should exist by the current date", () => {
    expect(getScheduledReportRuns("2026-06-07").map((report) => report.id)).toEqual([
      "cash-flow-2026-01",
      "cash-flow-2026-02",
      "performance-2026-q1",
      "cash-flow-2026-03",
      "cash-flow-2026-04",
      "cash-flow-2026-05",
    ]);
  });
});
