import { describe, expect, it } from "vitest";
import { parseReportSection } from "./page";

describe("finance reports route", () => {
  it("parses supported report sections", () => {
    expect(parseReportSection("performance")).toBe("performance");
    expect(parseReportSection("cash-flow")).toBe("cash-flow");
    expect(parseReportSection("budget")).toBe("budget");
    expect(parseReportSection("overview")).toBe("overview");
    expect(parseReportSection(["cash-flow", "budget"])).toBe("cash-flow");
    expect(parseReportSection(undefined)).toBe("overview");
    expect(parseReportSection("unknown")).toBe("overview");
  });
});
