export type EvidenceOcrStatus = "EXTRACTED" | "REVIEW_REQUIRED" | "CONFIRMED" | "FAILED";

export type EvidenceOcrData = {
  confidence?: number;
  documentDate?: string;
  documentType?: string;
  issuer?: string;
  issuerAddress?: string;
  issuerBusinessCategory?: string;
  issuerBusinessNumber?: string;
  issuerBusinessType?: string;
  issuerContact?: string;
  issuerRepresentative?: string;
  itemName?: string;
  provider?: "EMBEDDED_TEXT" | "OPENAI" | "TESSERACT";
  processingNote?: string;
  quantity?: number;
  recognizedText?: string;
  supplyAmount?: number;
  totalAmount?: number;
  vatAmount?: number;
};

export type ExpenseEvidenceAttachment = {
  contentType: string;
  evidenceType: string;
  fileName: string;
  fileSize: number;
  id: string;
  itemId?: string;
  ocrJobId?: string;
  ocrData: EvidenceOcrData;
  ocrStatus: EvidenceOcrStatus;
  storageBucket: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
};

export type EvidenceOcrJobStage = "UPLOADED" | "RENDERING" | "PREPROCESSING" | "RECOGNIZING" | "STRUCTURING" | "COMPLETED" | "FAILED";

export type EvidenceOcrJobProgress = {
  errorMessage?: string;
  id: string;
  progress: number;
  resultData: EvidenceOcrData;
  stage: EvidenceOcrJobStage;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
};

export function extractEvidenceText(text: string): EvidenceOcrData {
  const normalized = text.replace(/\r/g, "");
  const issuer = matchText(normalized, /(?:공\s*급\s*자|거\s*래\s*처|상\s*호)\s*[:：]?\s*([^\n]+)/);
  const issuerBusinessNumber = matchText(normalized, /(?:사업자\s*등록\s*번호|등록\s*번호)\s*[:：]?\s*([0-9]{3}\s*-?\s*[0-9]{2}\s*-?\s*[0-9]{5})/);
  const issuerRepresentative = matchText(normalized, /(?:대표자|성\s*명)\s*[:：]?\s*([^\n]+)/);
  const issuerAddress = matchText(normalized, /(?:사업장\s*소재지|주\s*소)\s*[:：]?\s*([^\n]+)/);
  const issuerBusinessType = matchText(normalized, /(?:업\s*태)\s*[:：]?\s*([^\n]+)/);
  const issuerBusinessCategory = matchText(normalized, /(?:종\s*목)\s*[:：]?\s*([^\n]+)/);
  const documentDate = normalizeDate(matchText(normalized, /(?:작\s*성\s*(?:년\s*월\s*일|일)|발\s*행\s*일|거\s*래\s*일|일\s*자)\s*[:：]?\s*([0-9]{4}\s*[./-]\s*[0-9]{1,2}\s*[./-]\s*[0-9]{1,2})/));
  const supplyAmount = matchAmount(normalized, /(?:공\s*급\s*가\s*액|공\s*급\s*금\s*액|공\s*급\s*대\s*가\s*총\s*액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  const vatAmount = matchAmount(normalized, /(?:부가세|세액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  const totalAmount = matchAmount(normalized, /(?:합계|총액|결제금액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  return compactOcrData({ documentDate, issuer, issuerAddress, issuerBusinessCategory, issuerBusinessNumber: issuerBusinessNumber?.replace(/\s/g, ""), issuerBusinessType, issuerRepresentative, supplyAmount, totalAmount, vatAmount });
}

export function hasExtractedEvidenceData(data: EvidenceOcrData) {
  return [data.documentDate, data.issuer, data.issuerBusinessNumber, data.supplyAmount, data.totalAmount, data.vatAmount]
    .some((value) => value !== undefined && value !== "");
}

export function inferEvidenceType(fileName: string, fallback: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("세금계산서")) return "세금계산서";
  if (normalized.includes("현금영수증")) return "현금영수증";
  if (normalized.includes("영수증")) return "영수증";
  if (normalized.includes("이체") || normalized.includes("송금")) return "이체확인증";
  if (normalized.includes("계약")) return "계약서";
  if (normalized.includes("견적")) return "견적서";
  return fallback;
}

function matchText(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim();
}

function matchAmount(text: string, pattern: RegExp) {
  const value = text.match(pattern)?.[1];
  if (!value) return undefined;
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function normalizeDate(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.replace(/\s/g, "").replace(/[./]/g, "-").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compactOcrData(data: EvidenceOcrData) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== "")) as EvidenceOcrData;
}
