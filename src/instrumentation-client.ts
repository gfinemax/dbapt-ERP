import type { PerformanceMeasurementInput, PerformanceMetricName, PerformanceRating } from "@/features/observability/performance-metrics";

type WebVitalsMetric = {
  id: string;
  name: string;
  navigationType?: string;
  rating?: PerformanceRating;
  value: number;
};
type PendingNavigation = { startedAt: number; targetRoute: string };

const endpoint = "/api/observability/performance";
const metricNames = new Set<PerformanceMetricName>(["TTFB", "FCP", "LCP", "CLS", "INP", "ROUTE_READY", "NAVIGATION"]);
const pendingNavigationKey = "erp-performance-navigation";
const sessionIdKey = "erp-performance-session";
const measurementQueue: PerformanceMeasurementInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let routeFrameOne = 0;
let routeFrameTwo = 0;

function normalizeRoute(value: string) {
  const route = value.split(/[?#]/, 1)[0] || "/";
  return /^\/[A-Za-z0-9_/-]*$/.test(route) && route.length <= 160 ? route : null;
}

function createSessionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sessionId() {
  try {
    const existing = sessionStorage.getItem(sessionIdKey);
    if (existing) return existing;
    const created = createSessionId();
    sessionStorage.setItem(sessionIdKey, created);
    return created;
  } catch {
    return createSessionId();
  }
}

function flushMeasurements() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!measurementQueue.length) return;
  const body = JSON.stringify(measurementQueue.splice(0, 20));
  if (measurementQueue.length) flushTimer = setTimeout(flushMeasurements, 100);
  const blob = new Blob([body], { type: "application/json" });
  if (navigator.sendBeacon?.(endpoint, blob)) return;
  void fetch(endpoint, { body, headers: { "content-type": "application/json" }, keepalive: true, method: "POST" }).catch(() => undefined);
}

function queueMeasurement(input: Omit<PerformanceMeasurementInput, "sessionId">) {
  measurementQueue.push({ ...input, sessionId: sessionId() });
  if (!flushTimer) flushTimer = setTimeout(flushMeasurements, 1500);
}

function readPendingNavigation(): PendingNavigation | null {
  try {
    const raw = sessionStorage.getItem(pendingNavigationKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingNavigation>;
    return typeof parsed.startedAt === "number" && typeof parsed.targetRoute === "string"
      ? { startedAt: parsed.startedAt, targetRoute: parsed.targetRoute }
      : null;
  } catch {
    return null;
  }
}

function clearPendingNavigation() {
  try { sessionStorage.removeItem(pendingNavigationKey); } catch { /* Measurement must never block ERP work. */ }
}

function scheduleRouteReady() {
  cancelAnimationFrame(routeFrameOne);
  cancelAnimationFrame(routeFrameTwo);
  routeFrameOne = requestAnimationFrame(() => {
    routeFrameTwo = requestAnimationFrame(() => {
      const route = normalizeRoute(window.location.pathname);
      if (!route) return;
      const pending = readPendingNavigation();
      let routeReadyDuration = performance.now();
      if (pending && pending.targetRoute === route) {
        const duration = Date.now() - pending.startedAt;
        if (duration >= 0 && duration <= 120000) {
          routeReadyDuration = duration;
          queueMeasurement({ metricName: "NAVIGATION", route, value: duration });
        }
      }
      queueMeasurement({ metricName: "ROUTE_READY", route, value: routeReadyDuration });
      clearPendingNavigation();
    });
  });
}

function rememberNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href, window.location.href);
  const targetRoute = normalizeRoute(url.pathname);
  if (!targetRoute || url.origin !== window.location.origin || `${url.pathname}${url.search}` === `${location.pathname}${location.search}`) return;
  try { sessionStorage.setItem(pendingNavigationKey, JSON.stringify({ startedAt: Date.now(), targetRoute } satisfies PendingNavigation)); } catch { /* Storage can be unavailable in privacy mode. */ }
}

function observeRouteChanges() {
  document.addEventListener("click", rememberNavigation, { capture: true, passive: true });
  window.addEventListener("popstate", () => {
    const targetRoute = normalizeRoute(location.pathname);
    if (targetRoute) {
      try { sessionStorage.setItem(pendingNavigationKey, JSON.stringify({ startedAt: Date.now(), targetRoute } satisfies PendingNavigation)); } catch { /* Ignore unavailable storage. */ }
    }
    scheduleRouteReady();
  });
  const pushState = history.pushState.bind(history);
  history.pushState = (data, unused, url) => {
    pushState(data, unused, url);
    scheduleRouteReady();
  };
  const replaceState = history.replaceState.bind(history);
  history.replaceState = (data, unused, url) => {
    replaceState(data, unused, url);
    scheduleRouteReady();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleRouteReady, { once: true });
  else scheduleRouteReady();
}

function reportWebVital(metric: WebVitalsMetric) {
  if (!metricNames.has(metric.name as PerformanceMetricName)) return;
  const route = normalizeRoute(location.pathname);
  if (!route) return;
  queueMeasurement({
    metricName: metric.name as PerformanceMetricName,
    navigationType: metric.navigationType,
    rating: metric.rating,
    route,
    sampleId: metric.id,
    value: metric.value,
  });
}

function loadWebVitalsWhenIdle() {
  const register = async () => {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import("next/dist/compiled/web-vitals");
    [onCLS, onFCP, onINP, onLCP, onTTFB].forEach((observe) => observe(reportWebVital));
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(() => { void register(); }, { timeout: 2500 });
  else setTimeout(() => { void register(); }, 0);
}

observeRouteChanges();
loadWebVitalsWhenIdle();
window.addEventListener("pagehide", flushMeasurements);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushMeasurements(); });
