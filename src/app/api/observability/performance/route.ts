import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { parsePerformanceMeasurement, performanceMetricUnit } from "@/features/observability/performance-metrics";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return new Response(null, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 16384) return new Response(null, { status: 413 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "성능 측정값 형식이 올바르지 않아." }, { status: 400 }); }
  const rawMeasurements = Array.isArray(body) ? body : [body];
  if (rawMeasurements.length === 0 || rawMeasurements.length > 20) return Response.json({ error: "성능 측정값 개수를 확인해줘." }, { status: 400 });
  const measurements = rawMeasurements.map(parsePerformanceMeasurement);
  if (measurements.some((measurement) => !measurement)) return Response.json({ error: "성능 측정값을 확인해줘." }, { status: 400 });

  const member = await reimbursementIdentity();
  if (!member) return new Response(null, { status: 204 });
  const db = getSupabaseServerClient();
  if (!db) return new Response(null, { status: 503 });
  const rows = measurements.map((measurement) => {
    if (!measurement) throw new Error("validated measurement missing");
    return {
      metric_name: measurement.metricName,
      metric_type: ["ROUTE_READY", "NAVIGATION"].includes(measurement.metricName) ? "NAVIGATION" : "WEB_VITAL",
      navigation_type: measurement.navigationType ?? null,
      organization_id: member.organization_id,
      rating: measurement.rating ?? null,
      route: measurement.route,
      sample_id: measurement.sampleId ?? null,
      session_id: measurement.sessionId,
      unit: performanceMetricUnit(measurement.metricName),
      user_id: member.user_id,
      value: measurement.value,
    };
  });
  const { error } = await db.schema("finance").from("performance_measurements").insert(rows);
  if (error) {
    console.warn(JSON.stringify({ code: error.code, message: "performance measurement insert failed", sampleCount: rows.length }));
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 202 });
}
