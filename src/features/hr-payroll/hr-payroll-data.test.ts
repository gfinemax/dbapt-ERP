import { describe, expect, it } from "vitest";
import { calculatePayrollTotals, formatKrw, getPayrollSummary, payrollEmployees, payrollWorkflows } from "./hr-payroll-data";

describe("hr payroll data", () => {
  it("keeps employee rows for payroll registration", () => {
    expect(payrollEmployees.map((employee) => employee.name)).toEqual(["김승민", "김현진"]);
  });

  it("defines hr payroll workflows in the requested order", () => {
    expect(payrollWorkflows.map((workflow) => workflow.title)).toEqual(["사원정보등록", "급여입력 및 전표처리", "급여대장확인"]);
  });

  it("calculates deduction totals and net pay from earning and deduction rows", () => {
    expect(calculatePayrollTotals("employee-001")).toEqual({
      totalEarnings: 3400000,
      totalDeductions: 363900,
      netPay: 3036100,
    });
  });

  it("summarizes payroll totals and formats Korean won", () => {
    expect(getPayrollSummary()).toEqual({
      employeeCount: 2,
      totalEarnings: 7300000,
      totalDeductions: 832370,
      totalNetPay: 6467630,
    });
    expect(formatKrw(3036100)).toBe("3,036,100원");
  });
});
