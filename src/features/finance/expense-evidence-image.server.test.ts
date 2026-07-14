import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildExpenseEvidenceImageVariants, preprocessExpenseEvidenceImage } from "./expense-evidence-image.server";

describe("expense evidence image preprocessing", () => {
  it("trims white margins and enlarges the receipt area", async () => {
    const input = await sharp({ create: { background: "white", channels: 3, height: 1000, width: 1000 } })
      .composite([{ input: { create: { background: "black", channels: 3, height: 300, width: 200 } }, left: 400, top: 350 }])
      .png()
      .toBuffer();
    const output = await preprocessExpenseEvidenceImage(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(2400);
    expect(metadata.height).toBeGreaterThan(2400);
  });

  it("creates focused supplier and item regions from the uncompressed image", async () => {
    const input = await sharp({ create: { background: "white", channels: 3, height: 1200, width: 800 } })
      .composite([{ input: { create: { background: "#eeeeee", channels: 3, height: 900, width: 500 } }, left: 150, top: 150 }])
      .png().toBuffer();
    const variants = await buildExpenseEvidenceImageVariants(input);

    expect(variants).toHaveLength(4);
    expect(variants.map((variant) => variant.label).join(" ")).toContain("판매처");
    expect(variants.map((variant) => variant.label).join(" ")).toContain("품목명");
  });
});
