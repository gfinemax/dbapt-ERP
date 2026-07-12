import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { preprocessExpenseEvidenceImage } from "./expense-evidence-image.server";

describe("expense evidence image preprocessing", () => {
  it("trims white margins and enlarges the receipt area", async () => {
    const input = await sharp({ create: { background: "white", channels: 3, height: 1000, width: 1000 } })
      .composite([{ input: { create: { background: "black", channels: 3, height: 300, width: 200 } }, left: 400, top: 350 }])
      .png()
      .toBuffer();
    const output = await preprocessExpenseEvidenceImage(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(1800);
    expect(metadata.height).toBeGreaterThan(1800);
  });
});
