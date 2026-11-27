import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("print styles", () => {
  it("keeps the browser print layout identical to the A4 preview", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replaceAll("\r\n", "\n");

    expect(css).toContain("@page {\n  size: A4 portrait;\n  margin: 20mm;\n}");
    expect(css).toContain("padding: 20mm;");
    expect(css).toContain("width: 170mm !important;");
    expect(css).toContain("min-height: 257mm !important;");
    expect(css).toContain('font-family: Pretendard, "Pretendard Variable", "Noto Sans KR", "Malgun Gothic", sans-serif;');
    expect(css).toMatch(/\.expense-approval-timestamp \{\r?\n  font-family: Pretendard, "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;\r?\n  font-style: normal;\r?\n\}/);
    expect(css).toContain(".expense-resolution-print-header h3 {\n    white-space: nowrap !important;");
    expect(css).toContain("width: 210mm !important;");
    expect(css).toMatch(/\.expense-resolution-document-page,\s*\.expense-resolution-document-probe\s*\{[^}]*--expense-resolution-page-padding: 25mm 20mm 15mm;[^}]*padding: var\(--expense-resolution-page-padding\);/);
    expect(css).toMatch(/\.expense-resolution-document-page,\s*\.expense-resolution-document-probe\s*\{[^}]*padding: var\(--expense-resolution-page-padding\) !important;/);
    expect(css).toMatch(/\.expense-resolution-evidence-page\s*\{\s*--expense-resolution-page-padding: 14mm 16mm 12mm;\s*\}/);
    expect(css).not.toContain("font-size: 11pt;");
  });
});
