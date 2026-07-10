import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("print styles", () => {
  it("prints expense resolutions inside the A4 printable area without forcing an extra page", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain("@page {\n  size: A4 portrait;\n  margin: 15mm;\n}");
    expect(css).toContain("width: 180mm !important;");
    expect(css).toContain("min-height: auto !important;");
    expect(css).toContain("padding: 0 !important;");
    expect(css).not.toContain("min-height: 297mm !important;");
  });
});
