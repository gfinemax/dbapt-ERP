import { describe, expect, it } from "vitest";
import { calculatePerformanceScore, normalizePerformanceRoute, parsePerformanceMeasurement, performanceMetricUnit } from "./performance-metrics";

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("performance metrics", () => {
  it("accepts only sanitized non-financial measurements", () => {
    expect(parsePerformanceMeasurement({ metricName: "LCP", route: "/finance/bank-transactions?q=홍길동", sessionId, value: 1200 })).toEqual({ metricName: "LCP", route: "/finance/bank-transactions", sessionId, value: 1200, navigationType: undefined, rating: undefined, sampleId: undefined });
    expect(parsePerformanceMeasurement({ metricName: "UNKNOWN", route: "/finance", sessionId, value: 10 })).toBeNull();
    expect(parsePerformanceMeasurement({ metricName: "LCP", route: "https://evil.example", sessionId, value: 10 })).toBeNull();
    expect(normalizePerformanceRoute("/finance?account=secret#row")).toBe("/finance");
  });

  it("calculates a normalized weighted score from p75 values", () => {
    const summary = [
      { metricName: "ROUTE_READY" as const, p50: 1000, p75: 2000, p95: 3000, sampleCount: 20, unit: "ms" as const },
      { metricName: "NAVIGATION" as const, p50: 700, p75: 1500, p95: 2500, sampleCount: 20, unit: "ms" as const },
      { metricName: "LCP" as const, p50: 1200, p75: 2500, p95: 3200, sampleCount: 20, unit: "ms" as const },
      { metricName: "INP" as const, p50: 100, p75: 200, p95: 400, sampleCount: 20, unit: "ms" as const },
    ];
    expect(calculatePerformanceScore(summary)).toBe(100);
    expect(calculatePerformanceScore(summary.map((metric) => ({ ...metric, p75: metric.p75 * 2 })))).toBe(50);
    expect(performanceMetricUnit("CLS")).toBe("score");
  });
});
