import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/instrumentation-client.ts"), "utf8");

describe("performance client instrumentation", () => {
  it("loads web vitals after initial rendering and batches measurements", () => {
    expect(source).toContain("requestIdleCallback");
    expect(source).toContain('import("next/dist/compiled/web-vitals")');
    expect(source).toContain("measurementQueue.splice(0, 20)");
    expect(source).toContain('metricName: "JS_TRANSFER"');
    expect(source).toContain('entryTypes: ["longtask"]');
  });

  it("sends only normalized routes and never serializes search terms", () => {
    expect(source).toContain("normalizeRoute(window.location.pathname)");
    expect(source).not.toContain("searchParams");
    expect(source).not.toContain("location.search,");
  });

  it("records route readiness only for an initial load or a matching navigation", () => {
    expect(source).toContain("if (pending && pending.targetRoute === route)");
    expect(source).toContain("if (initialNavigation)");
    expect(source).not.toContain("let routeReadyDuration = performance.now()");
    expect(source).not.toContain("history.replaceState =");
  });
});
