export type EvidenceOcrStatus = "EXTRACTED" | "REVIEW_REQUIRED" | "CONFIRMED" | "FAILED";

export type EvidenceOcrData = {
  confidence?: number;
  documentDate?: string;
  issuer?: string;
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
  ocrData: EvidenceOcrData;
  ocrStatus: EvidenceOcrStatus;
  storageBucket: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
};

export function extractEvidenceText(text: string): EvidenceOcrData {
  const normalized = text.replace(/\r/g, "");
  const issuer = matchText(normalized, /(?:공급자|거래처|상호)\s*[:：]?\s*([^\n]+)/);
  const documentDate = normalizeDate(matchText(normalized, /(?:작성일|발행일|거래일|일자)\s*[:：]?\s*([0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})/));
  const supplyAmount = matchAmount(normalized, /(?:공급가액|공급금액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  const vatAmount = matchAmount(normalized, /(?:부가세|세액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  const totalAmount = matchAmount(normalized, /(?:합계|총액|결제금액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  return compactOcrData({ documentDate, issuer, supplyAmount, totalAmount, vatAmount });
}

export function hasExtractedEvidenceData(data: EvidenceOcrData) {
  return [data.documentDate, data.issuer, data.supplyAmount, data.totalAmount, data.vatAmount]
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
  const [year, month, day] = value.replace(/[./]/g, "-").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compactOcrData(data: EvidenceOcrData) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== "")) as EvidenceOcrData;
}
