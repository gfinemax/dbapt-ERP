import { describe, expect, it } from "vitest";
import { parseHrPayrollSection } from "./page";

describe("parseHrPayrollSection", () => {
  it("keeps valid hr payroll sections from search params", () => {
    expect(parseHrPayrollSection("payroll-entry")).toBe("payroll-entry");
    expect(parseHrPayrollSection(["payroll-ledger"])).toBe("payroll-ledger");
  });

  it("falls back to employee registration for unknown sections", () => {
    expect(parseHrPayrollSection(undefined)).toBe("employees");
    expect(parseHrPayrollSection("unknown")).toBe("employees");
  });
});
