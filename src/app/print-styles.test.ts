import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("print styles", () => {
  it("keeps the browser print layout identical to the A4 preview", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain("@page {\n  size: A4 portrait;\n  margin: 0;\n}");
    expect(css).toContain("width: 210mm !important;");
    expect(css).toContain("min-height: 297mm !important;");
    expect(css).toContain(".expense-resolution-print-header h3 {\n    white-space: nowrap !important;");
    expect(css).not.toContain("width: 180mm !important;");
    expect(css).not.toContain("font-size: 11pt;");
  });
});
