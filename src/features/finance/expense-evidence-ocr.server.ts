import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import { extractEvidenceText, type EvidenceOcrData } from "./expense-evidence";
import { preprocessExpenseEvidenceImage } from "./expense-evidence-image.server";

const minimumEmbeddedPdfTextLength = 20;
const maximumPdfOcrPages = 3;
const ocrOperationTimeoutMs = 45_000;

export async function extractExpenseEvidenceFile(file: File): Promise<EvidenceOcrData> {
  const startedAt = Date.now();
  console.info(`[expense-evidence] OCR started: ${file.name} (${file.type}, ${file.size} bytes)`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    let result: EvidenceOcrData;
    if (file.type === "text/plain" || file.type === "text/csv") {
      result = { ...withRecognizedText(new TextDecoder("utf-8").decode(bytes)), provider: "EMBEDDED_TEXT" };
    } else if (file.type === "application/pdf") {
      result = await withTimeout(extractPdfEvidence(bytes), "PDF OCR");
    } else if (file.type.startsWith("image/")) {
      result = await withTimeout(recognizeImages([bytes]), "이미지 OCR");
    } else {
      result = {};
    }
    console.info(`[expense-evidence] OCR completed: ${file.name} (${Date.now() - startedAt}ms)`);
    return result.provider ? result : { ...result, provider: "TESSERACT" };
  } catch (error) {
    console.error(`[expense-evidence] OCR failed: ${file.name} (${Date.now() - startedAt}ms): ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function extractPdfEvidence(bytes: Uint8Array) {
  const parser = new PDFParse({ data: bytes });
  try {
    const textResult = await parser.getText();
    const embeddedText = textResult.text.trim();
    if (embeddedText.replace(/\s/g, "").length >= minimumEmbeddedPdfTextLength) {
      return withRecognizedText(embeddedText, 100);
    }
    const screenshots = await parser.getScreenshot({ first: maximumPdfOcrPages, imageDataUrl: false, imageBuffer: true, scale: 2 });
    return recognizeImages(screenshots.pages.map((page) => page.data));
  } finally {
    await parser.destroy();
  }
}

async function recognizeImages(images: Uint8Array[]) {
  const worker = await createWorker(["kor", "eng"]);
  try {
    const texts: string[] = [];
    const confidences: number[] = [];
    for (const image of images) {
      const processed = await preprocessExpenseEvidenceImage(image);
      const result = await worker.recognize(Buffer.from(processed));
      texts.push(result.data.text.trim());
      if (Number.isFinite(result.data.confidence)) confidences.push(result.data.confidence);
    }
    const confidence = confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : undefined;
    return withRecognizedText(texts.filter(Boolean).join("\n"), confidence);
  } finally {
    await worker.terminate();
  }
}

function withRecognizedText(text: string, confidence?: number) {
  const structured = extractEvidenceText(text);
  return {
    ...structured,
    ...(Number.isFinite(confidence) ? { confidence } : {}),
    ...(text.trim() ? { recognizedText: text.trim().slice(0, 8000) } : {}),
  };
}

async function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} 처리시간이 45초를 초과했습니다.`)), ocrOperationTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
