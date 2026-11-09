export const performanceMetricNames = ["TTFB", "FCP", "LCP", "CLS", "INP", "ROUTE_READY", "NAVIGATION"] as const;
export type PerformanceMetricName = typeof performanceMetricNames[number];
export type PerformanceMetricUnit = "ms" | "score";
export type PerformanceRating = "good" | "needs-improvement" | "poor";

export type PerformanceMeasurementInput = {
  metricName: PerformanceMetricName;
  navigationType?: string;
  rating?: PerformanceRating;
  route: string;
  sampleId?: string;
  sessionId: string;
  value: number;
};

export type PerformanceMetricSummary = {
  metricName: PerformanceMetricName;
  p50: number;
  p75: number;
  p95: number;
  sampleCount: number;
  unit: PerformanceMetricUnit;
};

export type PerformanceRouteSummary = PerformanceMetricSummary & {
  lastMeasuredAt: string;
  route: string;
};

export type PerformanceDashboard = {
  days: number;
  lastMeasuredAt: string | null;
  metrics: PerformanceMetricSummary[];
  routeCount: number;
  routes: PerformanceRouteSummary[];
  sampleCount: number;
};

const metricSet = new Set<string>(performanceMetricNames);
const ratingSet = new Set<string>(["good", "needs-improvement", "poor"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const routePattern = /^\/[A-Za-z0-9_/-]*$/;

export const performanceTargetsMs: Partial<Record<PerformanceMetricName, number>> = {
  FCP: 1800,
  INP: 200,
  LCP: 2500,
  NAVIGATION: 1500,
  ROUTE_READY: 2000,
  TTFB: 800,
};

export function isPerformanceMetricName(value: string): value is PerformanceMetricName {
  return metricSet.has(value);
}

const scoreWeights: Partial<Record<PerformanceMetricName, number>> = {
  INP: 0.15,
  LCP: 0.2,
  NAVIGATION: 0.2,
  ROUTE_READY: 0.45,
};

export function normalizePerformanceRoute(value: string) {
  const route = value.split(/[?#]/, 1)[0] || "/";
  return routePattern.test(route) && route.length <= 160 ? route : null;
}

export function parsePerformanceMeasurement(value: unknown): PerformanceMeasurementInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const route = typeof input.route === "string" ? normalizePerformanceRoute(input.route) : null;
  const metricName = typeof input.metricName === "string" && isPerformanceMetricName(input.metricName)
    ? input.metricName as PerformanceMetricName
    : null;
  const measuredValue = typeof input.value === "number" ? input.value : Number.NaN;
  if (!route || !metricName || !Number.isFinite(measuredValue) || measuredValue < 0 || measuredValue > 120000) return null;
  if (metricName === "CLS" && measuredValue > 10) return null;
  if (typeof input.sessionId !== "string" || !uuidPattern.test(input.sessionId)) return null;
  const rating = typeof input.rating === "string" && ratingSet.has(input.rating)
    ? input.rating as PerformanceRating
    : undefined;
  const navigationType = typeof input.navigationType === "string" && input.navigationType.length <= 40
    ? input.navigationType
    : undefined;
  const sampleId = typeof input.sampleId === "string" && input.sampleId.length <= 128
    ? input.sampleId
    : undefined;
  return { metricName, navigationType, rating, route, sampleId, sessionId: input.sessionId, value: measuredValue };
}

export function performanceMetricUnit(metricName: PerformanceMetricName): PerformanceMetricUnit {
  return metricName === "CLS" ? "score" : "ms";
}

export function calculatePerformanceScore(metrics: PerformanceMetricSummary[]) {
  let weightedScore = 0;
  let usedWeight = 0;
  for (const metric of metrics) {
    const target = performanceTargetsMs[metric.metricName];
    const weight = scoreWeights[metric.metricName];
    if (!target || !weight || metric.p75 <= 0) continue;
    weightedScore += Math.min(100, (target / metric.p75) * 100) * weight;
    usedWeight += weight;
  }
  return usedWeight > 0 ? Math.round(weightedScore / usedWeight) : null;
}

export function performanceStatus(score: number | null) {
  if (score === null) return { label: "측정 대기", tone: "neutral" as const };
  if (score >= 90) return { label: "빠름", tone: "good" as const };
  if (score >= 75) return { label: "보통", tone: "warning" as const };
  return { label: "개선 필요", tone: "danger" as const };
}
