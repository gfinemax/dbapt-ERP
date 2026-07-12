import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import sharp from "sharp";

const maximumPdfPages = 50;
const maximumImageDimension = 2400;

export type CompressedEvidenceFile = {
  file: File;
  originalSize: number;
  savedBytes: number;
};

export async function compressExpenseEvidenceFile(file: File): Promise<CompressedEvidenceFile> {
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return { file, originalSize: file.size, savedBytes: 0 };
  }
  const source = new Uint8Array(await file.arrayBuffer());
  const compressed = file.type === "application/pdf"
    ? await compressPdf(source)
    : await compressImage(source, file.type);
  if (!compressed || compressed.byteLength >= source.byteLength) {
    return { file, originalSize: file.size, savedBytes: 0 };
  }
  return {
    file: new File([compressed], file.name, { lastModified: file.lastModified, type: file.type }),
    originalSize: file.size,
    savedBytes: file.size - compressed.byteLength,
  };
}

async function compressImage(source: Uint8Array, contentType: string) {
  const pipeline = sharp(source)
    .rotate()
    .resize({ fit: "inside", height: maximumImageDimension, width: maximumImageDimension, withoutEnlargement: true })
    .withMetadata({ orientation: undefined });
  if (contentType === "image/jpeg") return new Uint8Array(await pipeline.jpeg({ chromaSubsampling: "4:2:0", mozjpeg: true, quality: 82 }).toBuffer());
  if (contentType === "image/png") return new Uint8Array(await pipeline.png({ compressionLevel: 9, palette: true, quality: 82 }).toBuffer());
  if (contentType === "image/webp") return new Uint8Array(await pipeline.webp({ effort: 5, quality: 82 }).toBuffer());
  return undefined;
}

async function compressPdf(source: Uint8Array) {
  const parser = new PDFParse({ data: source });
  try {
    const screenshots = await parser.getScreenshot({ first: maximumPdfPages, imageBuffer: true, imageDataUrl: false, scale: 1.5 });
    if (!screenshots.pages.length || screenshots.total > maximumPdfPages) return undefined;
    const document = await PDFDocument.create();
    for (const page of screenshots.pages) {
      const jpegBytes = await sharp(page.data).flatten({ background: "white" }).jpeg({ chromaSubsampling: "4:2:0", mozjpeg: true, quality: 78 }).toBuffer();
      const image = await document.embedJpg(jpegBytes);
      const pdfPage = document.addPage([page.width, page.height]);
      pdfPage.drawImage(image, { height: page.height, width: page.width, x: 0, y: 0 });
    }
    return new Uint8Array(await document.save({ useObjectStreams: true }));
  } finally {
    await parser.destroy();
  }
}
