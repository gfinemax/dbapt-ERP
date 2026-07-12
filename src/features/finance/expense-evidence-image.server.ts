import sharp from "sharp";

const targetWidth = 1800;

export async function preprocessExpenseEvidenceImage(bytes: Uint8Array) {
  return new Uint8Array(await sharp(bytes)
    .rotate()
    .trim({ background: "#ffffff", threshold: 12 })
    .resize({ fit: "inside", width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1 })
    .png({ compressionLevel: 6 })
    .toBuffer());
}
