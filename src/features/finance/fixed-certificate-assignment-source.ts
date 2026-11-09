import { createHash } from "node:crypto";

export const fixedCertificateReferenceSource = {
  documentId: "19RqM41iIIypykwyPuXL93ZrhFxZcJUl35_Ud6IijtoU",
  sheetId: 72846910,
  sheetName: "조합원연명부(116명)",
  range: "B4:B119",
} as const;

export type FixedCertificateReferenceName = {
  row_number: number;
  name: string;
};

export type FixedCertificateReference = typeof fixedCertificateReferenceSource & {
  sourceHash: string;
  names: FixedCertificateReferenceName[];
};

function parseSingleColumnCsv(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
      }
      if (trimmed.includes(",")) throw new Error("116명 명단의 이름 열만 읽어야 해.");
      return trimmed;
    });
}

export async function loadFixedCertificateReferenceNames(): Promise<FixedCertificateReference> {
  const { documentId, sheetId, range } = fixedCertificateReferenceSource;
  const url = new URL(`https://docs.google.com/spreadsheets/d/${documentId}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv");
  url.searchParams.set("gid", String(sheetId));
  url.searchParams.set("range", range);

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`116명 Google 시트를 읽지 못했어. (${response.status})`);
  const values = parseSingleColumnCsv(await response.text())
    .map((name) => name.normalize("NFKC").trim());
  if (values.length !== 116 || values.some((name) => !name || name.length > 100)) {
    throw new Error(`Google 시트의 이름 명단은 빈칸 없이 정확히 116명이어야 해. 현재 ${values.length}명이야.`);
  }
  const normalized = values.map((name) => name.replace(/\s+/g, "").toLocaleLowerCase("ko-KR"));
  if (new Set(normalized).size !== 116) throw new Error("Google 시트 116명 명단에 중복 이름이 있어.");

  const names = values.map((name, index) => ({ row_number: index + 4, name }));
  return {
    ...fixedCertificateReferenceSource,
    sourceHash: createHash("sha256").update(JSON.stringify(names)).digest("hex"),
    names,
  };
}
