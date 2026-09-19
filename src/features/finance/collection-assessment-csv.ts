export type CollectionAssessmentImportInput = {
  row_number: number;
  external_member_id: string;
  member_no: string;
  member_name_snapshot: string;
  assessment_code: string;
  due_date: string;
  assessed_amount: number;
};

const headerAliases = {
  external_member_id: ["외부 조합원 ID", "외부조합원ID", "external_member_id"],
  member_no: ["조합원번호", "member_no"],
  member_name_snapshot: ["조합원명", "표시 이름", "member_name_snapshot"],
  assessment_code: ["부과코드", "부과 코드", "assessment_code"],
  due_date: ["납부기한", "납부 기한", "due_date"],
  assessed_amount: ["부과액", "부과 금액", "assessed_amount"],
} as const;

const requiredHeaders = ["external_member_id", "member_name_snapshot", "assessment_code", "assessed_amount"] as const;

export function parseCollectionAssessmentCsv(text: string): CollectionAssessmentImportInput[] {
  const records = parseCsv(text.replace(/^\uFEFF/, ""));
  if (records.length < 2) throw new Error("헤더와 부과자료를 포함한 CSV 파일을 선택해줘.");
  if (records.length > 1001) throw new Error("한 번에 최대 1,000건까지 미리볼 수 있어.");

  const headers = records[0].map(normalizeHeader);
  const indexes = Object.fromEntries(Object.entries(headerAliases).map(([key, aliases]) => [key, headers.findIndex((header) => aliases.some((alias) => normalizeHeader(alias) === header))])) as Record<keyof typeof headerAliases, number>;
  const missing = requiredHeaders.filter((key) => indexes[key] < 0);
  if (missing.length) throw new Error(`필수 열이 없어: ${missing.map((key) => headerAliases[key][0]).join(", ")}`);

  const rows = records.slice(1).filter((record) => record.some((cell) => cell.trim())).map((record, index) => {
    const rowNumber = index + 2;
    const value = (key: keyof typeof headerAliases) => indexes[key] < 0 ? "" : (record[indexes[key]] ?? "").trim();
    const amountText = value("assessed_amount").replace(/[원,\s]/g, "");
    const amount = Number(amountText);
    const dueDate = value("due_date");
    if (!value("external_member_id")) throw new Error(`${rowNumber}행: 외부 조합원 ID가 필요해. 이름으로 자동 연결하지 않아.`);
    if (!value("member_name_snapshot")) throw new Error(`${rowNumber}행: 조합원명 스냅샷이 필요해.`);
    if (!value("assessment_code")) throw new Error(`${rowNumber}행: 부과코드가 필요해.`);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`${rowNumber}행: 부과액은 1원 이상의 정수여야 해.`);
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error(`${rowNumber}행: 납부기한은 YYYY-MM-DD 형식이어야 해.`);
    return {
      row_number: rowNumber,
      external_member_id: value("external_member_id"),
      member_no: value("member_no"),
      member_name_snapshot: value("member_name_snapshot"),
      assessment_code: value("assessment_code"),
      due_date: dueDate,
      assessed_amount: amount,
    };
  });
  if (!rows.length) throw new Error("등록할 부과자료가 없어.");
  return rows;
}

export const collectionAssessmentCsvTemplate = [
  "외부 조합원 ID,조합원번호,조합원명,부과코드,납부기한,부과액",
  "peopleon-0001,M-0001,홍길동,2026-09-분담금-01,2026-09-30,1500000",
].join("\r\n");

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았어.");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
