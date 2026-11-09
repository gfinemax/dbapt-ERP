import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PerformanceDashboardPage } from "./performance-dashboard-page";

describe("performance dashboard", () => {
  it("shows percentile measurements and the privacy boundary", () => {
    render(<PerformanceDashboardPage dashboard={{
      days: 7,
      lastMeasuredAt: "2026-11-10T00:00:00Z",
      metrics: [{ metricName: "ROUTE_READY", p50: 1000, p75: 2000, p95: 3500, sampleCount: 25, unit: "ms" }],
      routeCount: 1,
      routes: [{ route: "/finance/bank-transactions", metricName: "ROUTE_READY", p50: 1000, p75: 2000, p95: 3500, sampleCount: 25, unit: "ms", lastMeasuredAt: "2026-11-10T00:00:00Z" }],
      sampleCount: 25,
    }} />);
    expect(screen.getByRole("heading", { name: "시스템 속도" })).toBeInTheDocument();
    expect(screen.getByText(/검색어·계좌·금액/)).toBeInTheDocument();
    expect(screen.getAllByText("2,000ms").length).toBeGreaterThan(0);
    expect(screen.getByText("전체 거래내역")).toBeInTheDocument();
  });
});
