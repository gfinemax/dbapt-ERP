import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { extractExpenseEvidenceWithOpenAI } from "./expense-evidence-openai.server";

describe("OpenAI expense evidence analysis", () => {
  it("sends an image and returns structured Korean receipt values", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        confidence: 0.94,
        documentDate: "2026-06-19",
        documentType: "영수증",
        issuer: "스마트기획",
        itemName: "소봉투제작(5백매)",
        quantity: 1,
        recognizedText: "공급대가총액 60,000",
        supplyAmount: 60000,
        totalAmount: 60000,
        vatAmount: 0,
      }) } }],
    }), { status: 200 }));
    const image = await sharp({ create: { background: "white", channels: 3, height: 300, width: 300 } }).jpeg().toBuffer();
    const file = new File([new Uint8Array(image)], "봉투구매.jpg", { type: "image/jpeg" });

    await expect(extractExpenseEvidenceWithOpenAI(file, { apiKey: "test-key", fetcher })).resolves.toMatchObject({
      confidence: 94,
      documentDate: "2026-06-19",
      issuer: "스마트기획",
      itemName: "소봉투제작(5백매)",
      provider: "OPENAI",
      totalAmount: 60000,
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/chat/completions"), expect.objectContaining({ method: "POST" }));
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    const content = request.messages[0].content as Array<{ image_url?: unknown; text?: string }>;
    expect(content.filter((part) => part.image_url)).toHaveLength(2);
    expect(content.map((part) => part.text).filter(Boolean).join(" ")).toContain("공급받는 자");
  });
});
