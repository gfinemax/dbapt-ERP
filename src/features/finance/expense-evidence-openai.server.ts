import { PDFParse } from "pdf-parse";
import type { EvidenceOcrData } from "./expense-evidence";
import { preprocessExpenseEvidenceImage } from "./expense-evidence-image.server";

const maximumPdfVisionPages = 3;
const openAiEndpoint = "https://api.openai.com/v1/chat/completions";

type EvidenceImage = { label: string; url: string };

type OpenAiReceiptResult = {
  confidence: number | null;
  documentDate: string | null;
  documentType: string | null;
  issuer: string | null;
  issuerAddress: string | null;
  issuerBusinessCategory: string | null;
  issuerBusinessNumber: string | null;
  issuerBusinessType: string | null;
  issuerContact: string | null;
  issuerRepresentative: string | null;
  itemName: string | null;
  quantity: number | null;
  recognizedText: string | null;
  supplyAmount: number | null;
  totalAmount: number | null;
  vatAmount: number | null;
};

export async function extractExpenseEvidenceWithOpenAI(
  file: File,
  options: {
    apiKey?: string;
    fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
    model?: string;
    onStage?: (stage: "PREPROCESSING" | "RECOGNIZING" | "STRUCTURING") => void | Promise<void>;
  } = {},
): Promise<EvidenceOcrData> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  await options.onStage?.("PREPROCESSING");
  const images = await getEvidenceImages(file);
  if (!images.length) throw new Error("OpenAI로 분석할 이미지가 없습니다.");
  await options.onStage?.("RECOGNIZING");

  const response = await (options.fetcher ?? fetch)(openAiEndpoint, {
    body: JSON.stringify({
      messages: [{
        content: [
          {
            text: "한국어 회계 증빙을 분석해 아래 스키마로 반환하세요. 원본 컬러 이미지와 OCR용 보정 이미지는 같은 문서이므로 서로 대조하세요. 판매처는 반드시 '공급자' 영역에서만 추출하고 '공급받는 자', 수신인, 구매자를 판매처로 쓰지 마세요. 공급자의 상호, 사업자등록번호, 대표자, 주소, 업태, 종목, 연락처와 총액, 공급가액, 부가세의 관계를 확인하세요. 표의 행과 열을 따라 대표 품목명과 수량을 추출하고, 보이는 내용만 사용하며 불확실한 값은 null로 반환하세요.",
            type: "text",
          },
          ...images.flatMap((image) => [
            { text: image.label, type: "text" },
            { image_url: { detail: "high", url: image.url }, type: "image_url" },
          ]),
        ],
        role: "user",
      }],
      model: options.model ?? process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
      response_format: {
        json_schema: {
          name: "korean_expense_evidence",
          schema: {
            additionalProperties: false,
            properties: {
              confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
              documentDate: { anyOf: [{ type: "string" }, { type: "null" }] },
              documentType: { anyOf: [{ type: "string" }, { type: "null" }] },
              issuer: { anyOf: [{ type: "string" }, { type: "null" }] },
              issuerAddress: { anyOf: [{ type: "string" }, { type: "null" }] },
              issuerBusinessCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
              issuerBusinessNumber: { anyOf: [{ type: "string" }, { type: "null" }] },
              issuerBusinessType: { anyOf: [{ type: "string" }, { type: "null" }] },
              issuerContact: { anyOf: [{ type: "string" }, { type: "null" }] },
              issuerRepresentative: { anyOf: [{ type: "string" }, { type: "null" }] },
              itemName: { anyOf: [{ type: "string" }, { type: "null" }] },
              quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
              recognizedText: { anyOf: [{ type: "string" }, { type: "null" }] },
              supplyAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
              totalAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
              vatAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
            },
            required: ["confidence", "documentDate", "documentType", "issuer", "issuerAddress", "issuerBusinessCategory", "issuerBusinessNumber", "issuerBusinessType", "issuerContact", "issuerRepresentative", "itemName", "quantity", "recognizedText", "supplyAmount", "totalAmount", "vatAmount"],
            type: "object",
          },
          strict: true,
        },
        type: "json_schema",
      },
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`OpenAI 분석 실패 (${response.status}): ${await response.text()}`);
  await options.onStage?.("STRUCTURING");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI 분석 결과가 비어 있습니다.");
  return compactOpenAiResult(JSON.parse(content) as OpenAiReceiptResult);
}

async function getEvidenceImages(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type.startsWith("image/")) {
    const processed = await preprocessExpenseEvidenceImage(bytes);
    return [
      { label: "원본 컬러 이미지", url: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}` },
      { label: "OCR용 흑백 보정 이미지", url: `data:image/png;base64,${Buffer.from(processed).toString("base64")}` },
    ] satisfies EvidenceImage[];
  }
  if (file.type !== "application/pdf") return [];
  const parser = new PDFParse({ data: bytes });
  try {
    const screenshots = await parser.getScreenshot({ first: maximumPdfVisionPages, imageBuffer: true, imageDataUrl: false, scale: 2 });
    const pageImages = await Promise.all(screenshots.pages.map(async (page, index) => {
      const processed = await preprocessExpenseEvidenceImage(page.data);
      return [
        { label: `PDF ${index + 1}페이지 원본 컬러 이미지`, url: `data:image/png;base64,${Buffer.from(page.data).toString("base64")}` },
        { label: `PDF ${index + 1}페이지 OCR용 흑백 보정 이미지`, url: `data:image/png;base64,${Buffer.from(processed).toString("base64")}` },
      ] satisfies EvidenceImage[];
    }));
    return pageImages.flat();
  } finally {
    await parser.destroy();
  }
}

function compactOpenAiResult(result: OpenAiReceiptResult): EvidenceOcrData {
  return {
    ...Object.fromEntries(Object.entries(result).filter(([, value]) => value !== null && value !== "")),
    confidence: result.confidence === null ? undefined : Math.round(result.confidence <= 1 ? result.confidence * 100 : result.confidence),
    provider: "OPENAI",
  } as EvidenceOcrData;
}
