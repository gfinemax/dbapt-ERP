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
        items: [
          { itemName: "소봉투제작(5백매)", quantity: 1, supplyAmount: 60000, totalAmount: 60000, unitPrice: 60000, vatAmount: 0 },
        ],
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
      items: [{ itemName: "소봉투제작(5백매)" }],
      provider: "OPENAI",
      totalAmount: 60000,
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/chat/completions"), expect.objectContaining({ method: "POST" }));
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    const content = request.messages[0].content as Array<{ image_url?: unknown; text?: string }>;
    expect(content.filter((part) => part.image_url)).toHaveLength(4);
    expect(content.filter((part) => part.image_url).every((part) => (part.image_url as { detail: string }).detail === "original")).toBe(true);
    expect(content.map((part) => part.text).filter(Boolean).join(" ")).toContain("공급받는 자");
    expect(request.response_format.json_schema.schema.properties.items.type).toBe("array");
  });

  it("prefers the supplier name found next to the supplier label over a recipient guess", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      confidence: 0.8, documentDate: null, documentType: "영수증", issuer: "대방동지역주택조합",
      issuerAddress: null, issuerBusinessCategory: null, issuerBusinessNumber: null, issuerBusinessType: null,
      issuerContact: null, issuerRepresentative: null, itemName: null, quantity: null,
      recognizedText: "대방동지역주택조합 귀하\n상호 스마트기획\n합계 60,000", supplyAmount: null, totalAmount: 60000, vatAmount: null,
    }) } }] }), { status: 200 }));
    const image = await sharp({ create: { background: "white", channels: 3, height: 300, width: 300 } }).jpeg().toBuffer();

    const result = await extractExpenseEvidenceWithOpenAI(new File([new Uint8Array(image)], "receipt.jpg", { type: "image/jpeg" }), { apiKey: "test-key", fetcher });

    expect(result.issuer).toBe("스마트기획");
  });

  it("keeps the postal fee total when the receipt also contains a mail count", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      confidence: 0.99, documentDate: "2026-08-21", documentType: "우편요금 영수증", issuer: "서울신길동우체국",
      issuerAddress: null, issuerBusinessCategory: null, issuerBusinessNumber: "101-83-02925", issuerBusinessType: null,
      issuerContact: null, issuerRepresentative: null, itemName: "보통", quantity: 68,
      items: [{ itemName: "보통", quantity: 68, supplyAmount: null, totalAmount: 40120, unitPrice: 590, vatAmount: null }],
      recognizedText: "합계 68통 40,120원\n총요금: (즉납) 40,120원\n수납요금: 40,120원",
      supplyAmount: null, totalAmount: 40120, vatAmount: null,
    }) } }] }), { status: 200 }));
    const image = await sharp({ create: { background: "white", channels: 3, height: 300, width: 300 } }).jpeg().toBuffer();

    const result = await extractExpenseEvidenceWithOpenAI(new File([new Uint8Array(image)], "우편요금.jpg", { type: "image/jpeg" }), { apiKey: "test-key", fetcher });

    expect(result.totalAmount).toBe(40120);
    expect(result.quantity).toBe(68);
  });
});
