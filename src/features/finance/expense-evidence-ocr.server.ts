import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import { extractEvidenceText, type EvidenceOcrData } from "./expense-evidence";

const minimumEmbeddedPdfTextLength = 20;
const maximumPdfOcrPages = 3;

export async function extractExpenseEvidenceFile(file: File): Promise<EvidenceOcrData> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === "text/plain" || file.type === "text/csv") {
    return withRecognizedText(new TextDecoder("utf-8").decode(bytes));
  }
  if (file.type === "application/pdf") return extractPdfEvidence(bytes);
  if (file.type.startsWith("image/")) return recognizeImages([bytes]);
  return {};
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
      const result = await worker.recognize(Buffer.from(image));
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
