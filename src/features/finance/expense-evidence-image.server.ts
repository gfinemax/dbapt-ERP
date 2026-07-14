import sharp from "sharp";

const targetWidth = 2400;

export type ExpenseEvidenceImageVariant = {
  bytes: Uint8Array;
  label: string;
};

export async function buildExpenseEvidenceImageVariants(bytes: Uint8Array): Promise<ExpenseEvidenceImageVariant[]> {
  const receipt = await sharp(bytes)
    .rotate()
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 18 })
    .png({ compressionLevel: 4 })
    .toBuffer();
  const metadata = await sharp(receipt).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const supplierHeight = Math.max(1, Math.round(height * 0.58));
  const itemTop = Math.max(0, Math.round(height * 0.38));

  const [fullColor, enhanced, supplier, items] = await Promise.all([
    sharp(receipt).resize({ fit: "inside", width: 3200, withoutEnlargement: true }).png({ compressionLevel: 4 }).toBuffer(),
    sharp(receipt).resize({ fit: "inside", width: targetWidth, withoutEnlargement: false }).grayscale().normalize().sharpen({ sigma: 1.2 }).png({ compressionLevel: 4 }).toBuffer(),
    sharp(receipt).extract({ height: supplierHeight, left: 0, top: 0, width }).resize({ fit: "inside", width: 2800, withoutEnlargement: false }).normalize().sharpen({ sigma: 1 }).png({ compressionLevel: 4 }).toBuffer(),
    sharp(receipt).extract({ height: height - itemTop, left: 0, top: itemTop, width }).resize({ fit: "inside", width: 2800, withoutEnlargement: false }).normalize().sharpen({ sigma: 1 }).png({ compressionLevel: 4 }).toBuffer(),
  ]);

  return [
    { bytes: new Uint8Array(fullColor), label: "흰 여백을 제거한 영수증 전체 컬러 원본" },
    { bytes: new Uint8Array(enhanced), label: "문자 인식용 고대비 영수증 전체" },
    { bytes: new Uint8Array(supplier), label: "판매처는 공급자 표 안의 상호를 읽는 상단 확대 영역" },
    { bytes: new Uint8Array(items), label: "품목명과 금액을 표의 열에 맞춰 읽는 거래내역 확대 영역" },
  ];
}

export async function preprocessExpenseEvidenceImage(bytes: Uint8Array) {
  return (await buildExpenseEvidenceImageVariants(bytes))[1].bytes;
}
