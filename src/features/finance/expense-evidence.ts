export type EvidenceOcrStatus = "EXTRACTED" | "REVIEW_REQUIRED" | "CONFIRMED" | "FAILED";

export type EvidenceOcrItem = {
  itemName: string;
  quantity?: number;
  supplyAmount?: number;
  totalAmount?: number;
  unitPrice?: number;
  vatAmount?: number;
};

export type EvidenceOcrData = {
  classificationConfidence?: "높음" | "보통" | "낮음";
  classificationReasons?: string[];
  confidence?: number;
  documentDate?: string;
  documentType?: string;
  normalizedEvidenceType?: string;
  issuer?: string;
  issuerAddress?: string;
  issuerBusinessCategory?: string;
  issuerBusinessNumber?: string;
  issuerBusinessType?: string;
  issuerContact?: string;
  issuerRepresentative?: string;
  itemName?: string;
  items?: EvidenceOcrItem[];
  provider?: "EMBEDDED_TEXT" | "OPENAI" | "TESSERACT";
  processingNote?: string;
  quantity?: number;
  recognizedText?: string;
  supplyAmount?: number;
  totalAmount?: number;
  vatAmount?: number;
  vatTreatment?: "VAT_DEDUCTIBLE" | "VAT_NON_DEDUCTIBLE" | "NO_VAT";
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

export function sanitizeVendorName(value: string) {
  return value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9\s]/g, "");
}

export function normalizeEvidenceVendorFields(data: EvidenceOcrData): EvidenceOcrData {
  return compactOcrData({
    ...data,
    issuer: data.issuer ? sanitizeVendorName(data.issuer).replace(/\s{2,}/g, " ").trim() : undefined,
    issuerAddress: cleanOcrCell(data.issuerAddress, /(?:업\s*태|종\s*목|연\s*락\s*처)/),
    issuerBusinessCategory: cleanOcrCell(data.issuerBusinessCategory, /(?:연\s*락\s*처|전\s*화)/),
    issuerBusinessType: cleanOcrCell(data.issuerBusinessType, /(?:종\s*목|연\s*락\s*처|전\s*화)/),
    issuerContact: cleanOcrCell(data.issuerContact),
    issuerRepresentative: cleanOcrCell(data.issuerRepresentative, /(?:사업장\s*소재지|주\s*소|업\s*태|종\s*목)/),
  });
}

export type EvidenceClassification = Pick<EvidenceOcrData, "classificationConfidence" | "classificationReasons" | "normalizedEvidenceType" | "vatTreatment">;

export function classifyExpenseEvidence(input: {
  fileName?: string;
  modelDocumentType?: string;
  recognizedText?: string;
  vatAmount?: number;
}): EvidenceClassification {
  const text = normalizeClassificationText(input.recognizedText ?? "");
  const fileName = normalizeClassificationText(input.fileName ?? "");
  const modelType = normalizeClassificationText(input.modelDocumentType ?? "");
  const searchable = `${text} ${fileName}`;
  const reasons: string[] = [];

  const explicitTypes: Array<[RegExp, string, string]> = [
    [/(현금영수증|소득공제용|지출증빙용)/, "현금영수증", "현금영수증 핵심 문구"],
    [/(이체내역|송금확인|입금확인|이체확인)/, "이체확인증", "이체·입금 확인 문구"],
    [/(계약서)/, "계약서", "계약서 제목"],
    [/(견적서|QUOTATION)/, "견적서", "견적서 제목"],
    [/(의결서|결의서)/, "의결서", "의결·결의서 제목"],
  ];
  for (const [pattern, type, reason] of explicitTypes) {
    if (pattern.test(searchable)) return withVatClassification(type, "높음", [reason], input.vatAmount);
  }

  const taxInvoiceTitle = /(?:전자)?세금계산서|TAXINVOICE/.test(text) || /(?:전자)?세금계산서|TAXINVOICE/.test(fileName);
  const dualParties = /공급자/.test(text) && /공급받는자/.test(text);
  const businessNumberCount = (text.match(/\d{3}-?\d{2}-?\d{5}/g) ?? []).length;
  const splitTaxColumns = /공급가액/.test(text) && /세액/.test(text);
  const serialStructure = /(책번호|일련번호)/.test(text) || (/권/.test(text) && /호/.test(text));
  const receiptClaim = /(영수|청구)/.test(text);
  const taxInvoiceStructureScore = Number(dualParties) * 2 + Number(businessNumberCount >= 2) * 2
    + Number(splitTaxColumns) + Number(serialStructure) + Number(receiptClaim);
  if (taxInvoiceTitle && taxInvoiceStructureScore >= 2) {
    reasons.push("세금계산서 제목");
    if (dualParties) reasons.push("공급자·공급받는자 구조");
    if (businessNumberCount >= 2) reasons.push("양측 사업자등록번호");
    if (splitTaxColumns) reasons.push("공급가액·세액 분리");
    return withVatClassification("세금계산서", taxInvoiceStructureScore >= 4 ? "높음" : "보통", reasons, input.vatAmount);
  }

  if (/(^|[^세금])계산서/.test(searchable)) {
    return withVatClassification("계산서", "높음", ["계산서 제목"], input.vatAmount);
  }

  const receiptSignals = [
    [/(영수증)/, "영수증 제목"],
    [/(공급받는자용)/, "공급받는자용 표기"],
    [/(귀하)/, "귀하 표기"],
    [/(정히영수|영수함)/, "영수 확인 문구"],
    [/(공급대가총액)/, "공급대가총액 표기"],
  ] as const;
  for (const [pattern, reason] of receiptSignals) if (pattern.test(text)) reasons.push(reason);
  if (taxInvoiceTitle || modelType.includes("세금계산서")) reasons.push("세금계산서 구조 근거 부족");
  if (!reasons.length) reasons.push("확정적인 다른 증빙 유형 근거 없음");
  const receiptSignalCount = receiptSignals.filter(([pattern]) => pattern.test(text)).length;
  return withVatClassification("영수증", receiptSignalCount >= 2 ? "높음" : receiptSignalCount === 1 ? "보통" : "낮음", reasons, input.vatAmount);
}

function normalizeClassificationText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

function withVatClassification(type: string, confidence: "높음" | "보통" | "낮음", reasons: string[], vatAmount?: number): EvidenceClassification {
  const vatTreatment = vatAmount === 0
    ? "NO_VAT"
    : type === "세금계산서" || type === "현금영수증"
      ? "VAT_DEDUCTIBLE"
      : type === "영수증" && vatAmount !== undefined
        ? "VAT_NON_DEDUCTIBLE"
        : "NO_VAT";
  return { classificationConfidence: confidence, classificationReasons: reasons, normalizedEvidenceType: type, vatTreatment };
}

export function extractEvidenceText(text: string): EvidenceOcrData {
  const normalized = text.replace(/\r/g, "");
  const issuer = cleanSupplierName(matchText(normalized, /상\s*호\s*[:：]?\s*([^\n]+)/))
    ?? matchText(normalized, /거\s*래\s*처\s*[:：]?\s*([^\n]+)/)
    ?? matchText(normalized, /공\s*급\s*자\s*[:：]?\s*([^\n]+)/);
  const issuerBusinessNumber = matchText(normalized, /(?:사업자\s*등록\s*번호|등록\s*번호)\s*[:：]?\s*([0-9]{3}\s*-?\s*[0-9]{2}\s*-?\s*[0-9]{5})/);
  const issuerRepresentative = cleanOcrCell(matchText(normalized, /(?:대표자|성\s*명)\s*[:：]?\s*([^\n]+)/), /(?:사업장\s*소재지|주\s*소|업\s*태|종\s*목)/);
  const issuerAddress = cleanOcrCell(matchText(normalized, /(?:사업장\s*소재지|주\s*소)\s*[:：]?\s*([^\n]+)/), /(?:업\s*태|종\s*목|연\s*락\s*처)/);
  const issuerBusinessType = cleanOcrCell(matchText(normalized, /(?:업\s*태)\s*[:：]?\s*([^\n]+)/), /(?:종\s*목|연\s*락\s*처|전\s*화)/);
  const issuerBusinessCategory = cleanOcrCell(matchText(normalized, /(?:종\s*목)\s*[:：]?\s*([^\n]+)/), /(?:연\s*락\s*처|전\s*화)/);
  const documentDate = normalizeDate(matchText(normalized, /(?:작\s*성\s*(?:년\s*월\s*일|일)|발\s*행\s*일|거\s*래\s*일|일\s*자)\s*[:：]?\s*([0-9]{4}\s*[./-]\s*[0-9]{1,2}\s*[./-]\s*[0-9]{1,2})/));
  const supplyAmount = matchAmount(normalized, /(?:공\s*급\s*가\s*액|공\s*급\s*금\s*액|공\s*급\s*대\s*가\s*총\s*액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  const vatAmount = matchAmount(normalized, /(?:부가세|세액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  const totalAmount = matchAmount(normalized, /(?:합계|총액|결제금액)\s*[:：]?\s*([0-9,]+)\s*원?/);
  return normalizeEvidenceVendorFields({ documentDate, issuer, issuerAddress, issuerBusinessCategory, issuerBusinessNumber: issuerBusinessNumber?.replace(/\s/g, ""), issuerBusinessType, issuerRepresentative, supplyAmount, totalAmount, vatAmount });
}

export function hasExtractedEvidenceData(data: EvidenceOcrData) {
  return [data.documentDate, data.issuer, data.issuerBusinessNumber, data.supplyAmount, data.totalAmount, data.vatAmount]
    .some((value) => value !== undefined && value !== "");
}

export function inferEvidenceType(fileName: string, fallback: string) {
  if (/(?:전자)?세금\s*계산서|TAX\s*INVOICE/i.test(fileName)) return "세금계산서";
  const classified = classifyExpenseEvidence({ fileName });
  return classified.classificationConfidence === "낮음" ? fallback : classified.normalizedEvidenceType ?? fallback;
}

function matchText(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim();
}

function cleanSupplierName(value?: string) {
  if (!value) return undefined;
  return sanitizeVendorName(value
    .split(/\s+(?:성\s*명|대\s*표\s*자|사업자\s*등록\s*번호|주\s*소|업\s*태|종\s*목)/)[0]
    ?? "")
    .replace(/\s{2,}/g, " ")
    .trim() || undefined;
}

function cleanOcrCell(value?: string, stopPattern?: RegExp) {
  if (!value) return undefined;
  const normalized = value.normalize("NFKC");
  const bounded = stopPattern ? normalized.split(stopPattern)[0] : normalized;
  return bounded
    .replace(/[|｜¦│┃]/g, " ")
    .replace(/^[\s:：;,·]+|[\s:：;,·]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim() || undefined;
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
