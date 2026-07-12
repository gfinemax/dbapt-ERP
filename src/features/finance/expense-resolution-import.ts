export const expenseResolutionImportHeaders = [
  "지출예정일",
  "거래처",
  "지출항목명",
  "지출구분",
  "계정항목",
  "예산항목",
  "공급가액",
  "부가세",
  "지급방법",
  "증빙유형",
  "메모",
  "예산배정액",
  "기집행액",
  "예산초과사유",
] as const;

export type ExpenseResolutionImportRow = {
  accountTitle: string;
  allocatedBudget: number;
  budgetItem: string;
  evidenceType: string;
  executedAmount: number;
  expenseDate: string;
  expenseType: string;
  itemTitle: string;
  memo: string;
  overBudgetReason: string;
  paymentMethod: string;
  supplyAmount: number;
  vatAmount: number;
  vendorName: string;
};

export type ExpenseResolutionImportError = {
  messages: string[];
  rowNumber: number;
};

export type ExpenseResolutionImportResult = {
  errors: ExpenseResolutionImportError[];
  importedRows: ExpenseResolutionImportRow[];
  totalRowCount: number;
};

const requiredHeaders = ["지출예정일", "거래처", "지출항목명", "계정항목", "예산항목", "공급가액"];
const paymentMethods = new Set(["계좌이체", "카드결제", "현금", "기타"]);

export function parseExpenseResolutionImportRows(table: unknown[][]): ExpenseResolutionImportResult {
  const normalizedTable = table.map((row) => row.map(normalizeCell));
  const headerRow = normalizedTable[0] ?? [];
  const headerIndexes = new Map(headerRow.map((header, index) => [header, index]));
  const missingHeaders = requiredHeaders.filter((header) => !headerIndexes.has(header));
  if (missingHeaders.length) {
    return {
      errors: [{ messages: [`필수 헤더 누락: ${missingHeaders.join(", ")}`], rowNumber: 1 }],
      importedRows: [],
      totalRowCount: Math.max(normalizedTable.length - 1, 0),
    };
  }

  const importedRows: ExpenseResolutionImportRow[] = [];
  const errors: ExpenseResolutionImportError[] = [];
  const dataRows = normalizedTable.slice(1).filter((row) => row.some(Boolean));

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const get = (header: string) => row[headerIndexes.get(header) ?? -1] ?? "";
    const expenseDate = normalizeDate(get("지출예정일"));
    const vendorName = get("거래처");
    const itemTitle = get("지출항목명");
    const accountTitle = get("계정항목");
    const budgetItem = get("예산항목");
    const supplyAmount = parseAmount(get("공급가액"));
    const vatText = get("부가세");
    const vatAmount = vatText ? parseAmount(vatText) : Math.round(supplyAmount * 0.1);
    const paymentMethod = get("지급방법") || "계좌이체";
    const rowErrors: string[] = [];

    if (!expenseDate) rowErrors.push("지출예정일은 YYYY-MM-DD 형식이어야 합니다.");
    if (!vendorName) rowErrors.push("거래처를 입력해야 합니다.");
    if (!itemTitle) rowErrors.push("지출항목명을 입력해야 합니다.");
    if (!accountTitle) rowErrors.push("계정항목을 입력해야 합니다.");
    if (!budgetItem) rowErrors.push("예산항목을 입력해야 합니다.");
    if (!Number.isFinite(supplyAmount) || supplyAmount < 0) rowErrors.push("공급가액은 0 이상의 숫자여야 합니다.");
    if (!Number.isFinite(vatAmount) || vatAmount < 0) rowErrors.push("부가세는 0 이상의 숫자여야 합니다.");
    if (!paymentMethods.has(paymentMethod)) rowErrors.push("지급방법은 계좌이체, 카드결제, 현금, 기타 중 하나여야 합니다.");

    if (rowErrors.length) {
      errors.push({ messages: rowErrors, rowNumber });
      return;
    }

    importedRows.push({
      accountTitle,
      allocatedBudget: parseOptionalAmount(get("예산배정액")),
      budgetItem,
      evidenceType: get("증빙유형") || "세금계산서",
      executedAmount: parseOptionalAmount(get("기집행액")),
      expenseDate,
      expenseType: get("지출구분") || "운영비",
      itemTitle,
      memo: get("메모"),
      overBudgetReason: get("예산초과사유"),
      paymentMethod,
      supplyAmount,
      vatAmount,
      vendorName,
    });
  });

  return { errors, importedRows, totalRowCount: dataRows.length };
}

export function buildExpenseResolutionImportTemplateCsv() {
  const example = [
    "2026-07-15",
    "다이스",
    "사무국 비품 구입",
    "운영비",
    "소모품비",
    "운영비 > 사무용품",
    "10000",
    "1000",
    "계좌이체",
    "세금계산서",
    "A4 복사용지",
    "500000",
    "120000",
    "",
  ];
  return `\uFEFF${expenseResolutionImportHeaders.join(",")}\r\n${example.join(",")}\r\n`;
}

function normalizeCell(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value ?? "").trim();
}

function normalizeDate(value: string) {
  const normalized = value.replace(/[./]/g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day ? "" : normalized;
}

function parseAmount(value: string) {
  if (!value) return Number.NaN;
  return Number(value.replace(/[원,\s]/g, ""));
}

function parseOptionalAmount(value: string) {
  if (!value) return 0;
  const amount = parseAmount(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}
