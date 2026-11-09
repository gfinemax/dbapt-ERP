import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/instrumentation-client.ts"), "utf8");

describe("performance client instrumentation", () => {
  it("loads web vitals after initial rendering and batches measurements", () => {
    expect(source).toContain("requestIdleCallback");
    expect(source).toContain('import("next/dist/compiled/web-vitals")');
    expect(source).toContain("measurementQueue.splice(0, 20)");
  });

  it("sends only normalized routes and never serializes search terms", () => {
    expect(source).toContain("normalizeRoute(window.location.pathname)");
    expect(source).not.toContain("searchParams");
    expect(source).not.toContain("location.search,");
  });
});
