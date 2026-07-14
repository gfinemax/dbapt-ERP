import { PDFParse } from "pdf-parse";
import { classifyExpenseEvidence, extractEvidenceText, normalizeEvidenceVendorFields, sanitizeVendorName, type EvidenceOcrData, type EvidenceOcrItem } from "./expense-evidence";
import { buildExpenseEvidenceImageVariants } from "./expense-evidence-image.server";

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
  items: Array<{
    itemName: string;
    quantity: number | null;
    supplyAmount: number | null;
    totalAmount: number | null;
    unitPrice: number | null;
    vatAmount: number | null;
  }>;
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
            text: "한국어 회계 증빙을 분석해 아래 스키마로 반환하세요. 모든 이미지는 압축 전 같은 원본에서 만든 전체·보정·영역 확대본입니다. 판매처(issuer)는 반드시 실제 판매자·공급자의 상호이며 수신인·공급받는 자·구매자는 판매처가 아닙니다. 사업자등록번호, 대표자, 주소, 업태, 종목도 같은 판매자 영역의 값인지 교차검증하세요. items에는 실제 구매 품목을 빠짐없이 한 행씩 넣으세요. POS 코드, 소계·과세합계·부가세·결제수단·승인금액 행은 품목에서 제외하세요. 각 품목의 수량, 표시 단가, 행 합계를 읽고 서로 검산하세요. itemName과 quantity에는 첫 번째 대표 품목을 넣어 이전 형식과 호환하세요. 공급가액+부가세=총액, 품목 행 합계=총액 관계도 확인하세요. recognizedText에는 판매처, 모든 품목, 작성일과 합계 행을 포함하세요. 보이는 내용만 사용하고 불확실한 값은 null로 반환하세요.",
            type: "text",
          },
          ...images.flatMap((image) => [
            { text: image.label, type: "text" },
            { image_url: { detail: "original", url: image.url }, type: "image_url" },
          ]),
        ],
        role: "user",
      }],
      model: options.model ?? process.env.OPENAI_VISION_MODEL ?? "gpt-5.6-terra",
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
              items: {
                items: {
                  additionalProperties: false,
                  properties: {
                    itemName: { type: "string" },
                    quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
                    supplyAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
                    totalAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
                    unitPrice: { anyOf: [{ type: "number" }, { type: "null" }] },
                    vatAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
                  },
                  required: ["itemName", "quantity", "supplyAmount", "totalAmount", "unitPrice", "vatAmount"],
                  type: "object",
                },
                type: "array",
              },
              quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
              recognizedText: { anyOf: [{ type: "string" }, { type: "null" }] },
              supplyAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
              totalAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
              vatAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
            },
            required: ["confidence", "documentDate", "documentType", "issuer", "issuerAddress", "issuerBusinessCategory", "issuerBusinessNumber", "issuerBusinessType", "issuerContact", "issuerRepresentative", "itemName", "items", "quantity", "recognizedText", "supplyAmount", "totalAmount", "vatAmount"],
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
  return compactOpenAiResult(JSON.parse(content) as OpenAiReceiptResult, file.name);
}

async function getEvidenceImages(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type.startsWith("image/")) {
    return (await buildExpenseEvidenceImageVariants(bytes)).map((variant) => ({
      label: variant.label,
      url: `data:image/png;base64,${Buffer.from(variant.bytes).toString("base64")}`,
    })) satisfies EvidenceImage[];
  }
  if (file.type !== "application/pdf") return [];
  const parser = new PDFParse({ data: bytes });
  try {
    const screenshots = await parser.getScreenshot({ first: maximumPdfVisionPages, imageBuffer: true, imageDataUrl: false, scale: 2 });
    const pageImages = await Promise.all(screenshots.pages.map(async (page, index) => {
      return (await buildExpenseEvidenceImageVariants(page.data)).map((variant) => ({
        label: `PDF ${index + 1}페이지 ${variant.label}`,
        url: `data:image/png;base64,${Buffer.from(variant.bytes).toString("base64")}`,
      })) satisfies EvidenceImage[];
    }));
    return pageImages.flat();
  } finally {
    await parser.destroy();
  }
}

function compactOpenAiResult(result: OpenAiReceiptResult, fileName: string): EvidenceOcrData {
  const structured = {
    ...Object.fromEntries(Object.entries(result).filter(([, value]) => value !== null && value !== "")),
    confidence: result.confidence === null ? undefined : Math.round(result.confidence <= 1 ? result.confidence * 100 : result.confidence),
    provider: "OPENAI",
  } as EvidenceOcrData;
  structured.items = (result.items ?? [])
    .filter((item) => item.itemName.trim())
    .map((item) => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null && value !== "")) as EvidenceOcrItem);
  if (structured.issuer) structured.issuer = sanitizeVendorName(structured.issuer).replace(/\s{2,}/g, " ").trim();
  const textResult = result.recognizedText ? extractEvidenceText(result.recognizedText) : {};
  const classification = classifyExpenseEvidence({
    fileName,
    modelDocumentType: result.documentType ?? undefined,
    recognizedText: result.recognizedText ?? undefined,
    vatAmount: result.vatAmount ?? undefined,
  });
  const amountConsistent = structured.totalAmount === undefined
    || structured.supplyAmount === undefined
    || structured.vatAmount === undefined
    || structured.supplyAmount + structured.vatAmount === structured.totalAmount;
  return normalizeEvidenceVendorFields({
    ...structured,
    ...Object.fromEntries(Object.entries(textResult).filter(([, value]) => value !== undefined)),
    ...classification,
    confidence: amountConsistent ? structured.confidence : Math.min(structured.confidence ?? 70, 60),
    processingNote: amountConsistent
      ? "판매처·날짜·금액을 OCR 원문 및 확대 영역과 교차검증했습니다."
      : "공급가액+부가세와 총액이 일치하지 않아 금액 확인이 필요합니다.",
  });
}
