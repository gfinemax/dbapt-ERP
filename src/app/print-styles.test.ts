import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("print styles", () => {
  it("keeps the browser print layout identical to the A4 preview", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain("@page {\n  size: A4 portrait;\n  margin: 20mm;\n}");
    expect(css).toContain("padding: 20mm;");
    expect(css).toContain("width: 170mm !important;");
    expect(css).toContain("min-height: 257mm !important;");
    expect(css).toContain('font-family: Pretendard, "Pretendard Variable", "Noto Sans KR", "Malgun Gothic", sans-serif;');
    expect(css).toContain(".expense-resolution-print-header h3 {\n    white-space: nowrap !important;");
    expect(css).not.toContain("width: 210mm !important;");
    expect(css).not.toContain("font-size: 11pt;");
  });
});
