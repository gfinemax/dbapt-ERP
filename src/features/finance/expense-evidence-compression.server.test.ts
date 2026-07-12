import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compressExpenseEvidenceFile } from "./expense-evidence-compression.server";

describe("expense evidence compression", () => {
  it("compresses large JPEG evidence before storage", async () => {
    const source = await sharp(randomBytes(2400 * 3200 * 3), { raw: { channels: 3, height: 3200, width: 2400 } }).jpeg({ quality: 100 }).toBuffer();
    const file = new File([new Uint8Array(source)], "영수증.jpg", { type: "image/jpeg" });
    const result = await compressExpenseEvidenceFile(file);

    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toBe("영수증.jpg");
    expect(result.file.size).toBeLessThan(file.size);
    expect(result.savedBytes).toBeGreaterThan(0);
  });

  it("leaves non-image evidence unchanged", async () => {
    const file = new File(["text"], "증빙.txt", { type: "text/plain" });
    const result = await compressExpenseEvidenceFile(file);

    expect(result.file).toBe(file);
    expect(result.savedBytes).toBe(0);
  });
});
