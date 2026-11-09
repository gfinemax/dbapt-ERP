import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";

import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import {
  bankTransactionExportColumnLabel,
  type BankTransactionExportColumnId,
} from "./bank-transaction-export-columns";
import type { BankTransactionListFilters, BankTransactionListRow } from "./bank-transaction-repository";

export type BankTransactionExportRecord = Record<BankTransactionExportColumnId, string | number>;

export type BankTransactionExportData = {
  columns: BankTransactionExportColumnId[];
  filters: BankTransactionListFilters;
  generatedAt: string;
  records: BankTransactionExportRecord[];
  title: string;
  totals: { confirmedLoss: number; deposit: number; externalRecognition: number; trustHeld: number; withdrawal: number };
};

const statusLabels = {
  CONFIRMED: "확정",
  DEFERRED: "검토 보류",
  EXCLUDED: "제외",
  RECOMMENDED: "추천 있음",
  UNREVIEWED: "미확인",
} as const;

export function buildBankTransactionExportData(input: {
  accountSubjects: RegisteredAccountSubject[];
  bankAccounts: RegisteredBankAccount[];
  columns: BankTransactionExportColumnId[];
  filters: BankTransactionListFilters;
  generatedAt?: string;
  rows: BankTransactionListRow[];
  title?: string;
}): BankTransactionExportData {
  const accounts = new Map(input.bankAccounts.map((account) => [account.id, account]));
  const subjects = new Map(input.accountSubjects.map((subject) => [subject.id, subject]));
  let deposit = 0;
  let withdrawal = 0;
  let externalRecognition = 0;
  let confirmedLoss = 0;
  let trustHeld = 0;
  const records = input.rows.map((row) => {
    const isExternalRecognition = row.originType === "EXTERNAL_RECOGNITION";
    const account = accounts.get(row.bankAccountId);
    const subjectId = row.confirmedAccountSubjectId ?? row.recommendedAccountSubjectId;
    const subject = subjectId ? subjects.get(subjectId) : undefined;
    const subjectName = row.confirmedAccountSubjectName ?? row.recommendedAccountSubjectName ?? "미지정";
    const signedAmount = row.transactionKind === "입금" ? row.amount : row.transactionKind === "출금" ? -row.amount : row.amount;
    if (row.transactionKind === "입금") deposit += row.amount;
    if (row.transactionKind === "출금") withdrawal += row.amount;
    if (isExternalRecognition && row.recognitionStatus === "ACTIVE") externalRecognition += row.amount;
    if (isExternalRecognition && row.recognitionStatus === "ACTIVE" && row.accountingTreatment === "confirmed_loss") confirmedLoss += row.lossAmount ?? 0;
    if (isExternalRecognition && row.recognitionStatus === "ACTIVE" && row.accountingTreatment === "trust_receipt") trustHeld += row.actualFundAmount ?? 0;
    const { date, time } = koreaDateTimeParts(row.transactedAt);
    return {
      account: isExternalRecognition ? `${externalRecognitionKindLabel(row.sourceKind)} 원장` : account ? `${account.bankName} · ${account.accountName} · ${account.accountNo}` : "계좌 정보 없음",
      accountingTreatment: isExternalRecognition ? accountingTreatmentLabel(row.accountingTreatment) : "",
      accountSubject: isExternalRecognition ? row.confirmedAccountSubjectName ?? accountingTreatmentLabel(row.accountingTreatment) : subject?.businessCategory ? `${subject.businessCategory} · ${subjectName}` : subjectName,
      adminNote: row.classificationNote ?? "",
      amount: signedAmount,
      balance: row.balanceAmount ?? "",
      cashImpact: cashImpactLabel(row.cashImpact),
      classificationStatus: statusLabels[row.classificationStatus],
      counterparty: row.counterparty || "",
      description: row.description || "",
      details: transactionDetails(row),
      originType: isExternalRecognition ? `외부납입 인정 · ${externalRecognitionKindLabel(row.sourceKind)}` : "은행 통장거래",
      sourceRecordId: row.sourceRecordId ?? row.id,
      sourceStatus: isExternalRecognition ? `Ledger ${externalRecognitionKindLabel(row.sourceKind)} 원본` : row.sourceReconciliationIssue ? `원본 확인 필요 · ${row.sourceReconciliationIssue.reason}` : "원본 대조 이상 없음",
      transactionDate: date,
      transactionId: row.id,
      transactionKind: isExternalRecognition ? cashImpactLabel(row.cashImpact) : row.transactionKind ?? "구분 미확인",
      transactionTime: time,
    } satisfies BankTransactionExportRecord;
  });
  return {
    columns: input.columns,
    filters: input.filters,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    records,
    title: cleanTitle(input.title),
    totals: { confirmedLoss, deposit, externalRecognition, trustHeld, withdrawal },
  };
}

function transactionDetails(row: BankTransactionListRow) {
  return row.transactionDetail?.trim() || row.memo?.trim() || row.description?.trim() || "";
}

function cashImpactLabel(value?: string) {
  if (value === "BANK_CASH") return "조합계좌 현금";
  if (value === "TRUST_HELD") return "신탁사 보관";
  return "비현금 인정";
}

function accountingTreatmentLabel(value?: string | null) {
  if (value === "confirmed_loss") return "외부납입 인정 · 확정결손";
  if (value === "trust_receipt") return "외부납입 인정 · 신탁사 보관 수납";
  return "외부납입 인정 · 회계 처리 검토";
}

function externalRecognitionKindLabel(sourceKind?: string | null) {
  return sourceKind === "dongil_fixed_certificate" ? "동일건설 정액 필증 3천만원" : "일반 외부납입";
}

function cleanTitle(value?: string) {
  const title = value?.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return title || "통합 거래내역";
}

function koreaDateTimeParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const [rawDate = "", rawTime = ""] = value.replace("T", " ").split(" ");
    return { date: rawDate, time: rawTime.slice(0, 8) };
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", hour: "2-digit", hour12: false, minute: "2-digit", month: "2-digit", second: "2-digit",
    timeZone: "Asia/Seoul", year: "numeric",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

const excelHeaderStyle = { align: "center" as const, backgroundColor: "#0D5B43", color: "#FFFFFF", fontWeight: "bold" as const, wrap: true };

function excelCell(column: BankTransactionExportColumnId, value: string | number): Cell {
  if (["amount", "balance"].includes(column) && typeof value === "number") {
    return { align: "right", format: "#,##0;[Red]-#,##0", type: Number, value };
  }
  return { align: ["details", "description", "counterparty", "adminNote", "sourceStatus"].includes(column) ? "left" : "center", value, wrap: true };
}

export function bankTransactionWorkbookSheets(data: BankTransactionExportData) {
  const mainSheet: SheetData = [
    data.columns.map((column) => ({ ...excelHeaderStyle, value: bankTransactionExportColumnLabel(column) })),
    ...data.records.map((record) => data.columns.map((column) => excelCell(column, record[column]))),
  ];
  const infoSheet: SheetData = [
    [{ ...excelHeaderStyle, value: "항목" }, { ...excelHeaderStyle, value: "내용" }],
    ["보고서명", data.title],
    ["생성일시", new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(data.generatedAt))],
    ["검색 조건", bankTransactionFilterSummary(data.filters)],
    ["선택 컬럼", data.columns.map(bankTransactionExportColumnLabel).join(", ")],
    ["거래 건수", data.records.length],
    ["입금 합계", { format: "#,##0", type: Number, value: data.totals.deposit }],
    ["출금 합계", { format: "#,##0", type: Number, value: data.totals.withdrawal }],
    ["외부납입 인정 합계", { format: "#,##0", type: Number, value: data.totals.externalRecognition }],
    ["확정결손 합계", { format: "#,##0", type: Number, value: data.totals.confirmedLoss }],
    ["신탁사 보관 합계", { format: "#,##0", type: Number, value: data.totals.trustHeld }],
    ["안내", "검색 결과를 읽기 전용으로 내보낸 자료이며 ERP 원본 거래를 변경하지 않습니다."],
  ];
  return [
    { columns: data.columns.map((column) => ({ width: excelColumnWidth(column) })), data: mainSheet, sheet: "거래내역", stickyRowsCount: 1 },
    { columns: [{ width: 20 }, { width: 90 }], data: infoSheet, sheet: "내보내기 정보" },
  ];
}

export async function buildBankTransactionWorkbook(data: BankTransactionExportData) {
  return writeXlsxFile(bankTransactionWorkbookSheets(data), { fontFamily: "맑은 고딕", fontSize: 10 }).toBuffer();
}

function excelColumnWidth(column: BankTransactionExportColumnId) {
  return ({
    account: 34, accountingTreatment: 28, accountSubject: 28, adminNote: 38, amount: 18, balance: 18, cashImpact: 18,
    classificationStatus: 14, counterparty: 22, description: 24, details: 52, originType: 18, sourceRecordId: 38,
    sourceStatus: 36, transactionDate: 13, transactionId: 38, transactionKind: 14, transactionTime: 12,
  } satisfies Record<BankTransactionExportColumnId, number>)[column];
}

export function bankTransactionFilterSummary(filters: BankTransactionListFilters) {
  const parts = [
    filters.query ? `검색어 ${filters.query}` : "",
    filters.bankAccountId ? `계좌 ID ${filters.bankAccountId}` : "전체 계좌",
    filters.originType ? `원본 ${filters.originType === "BANK_TRANSACTION" ? "은행 통장거래" : "외부납입 인정"}` : "전체 원본",
    filters.externalRecognitionKind ? `외부납입 구분 ${filters.externalRecognitionKind === "FIXED_CERTIFICATE" ? "동일건설 정액 필증 3천만원" : "일반 외부납입"}` : "",
    filters.dateFrom ? `시작일 ${filters.dateFrom}` : "",
    filters.dateTo ? `종료일 ${filters.dateTo}` : "",
    filters.classificationStatus ? `상태 ${statusLabels[filters.classificationStatus]}` : "",
    filters.sourceReconciliationStatus ? "원본 확인 필요" : "",
  ].filter(Boolean);
  return parts.join(" · ") || "전체 거래";
}

const pdfColumnWeights: Record<BankTransactionExportColumnId, number> = {
  account: 1.5, accountingTreatment: 1.25, accountSubject: 1.25, adminNote: 1.5, amount: 0.85, balance: 0.85,
  cashImpact: 0.9, classificationStatus: 0.75, counterparty: 1.1, description: 1.15, details: 2.25, originType: 0.9,
  sourceRecordId: 1.5, sourceStatus: 1.45, transactionDate: 0.8, transactionId: 1.5, transactionKind: 0.75, transactionTime: 0.7,
};

export async function buildBankTransactionPdf(data: BankTransactionExportData) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "node_modules", "@embedpdf", "fonts-kr", "fonts", "NotoSansKR-Regular.otf"));
  const font = await document.embedFont(new Uint8Array(fontBytes), { subset: true });
  document.setTitle(data.title);
  document.setSubject(bankTransactionFilterSummary(data.filters));
  document.setCreator("Daebang ERP");
  const layout = createPdfLayout(data.columns);
  let page = document.addPage([841.89, 595.28]);
  let y = drawPdfPageHeader(page, font, data, layout);
  for (const record of data.records) {
    const cells = data.columns.map((column, index) => wrapPdfText(String(record[column] ?? ""), font, column === "amount" || column === "balance" ? 7.4 : 7, layout.widths[index] - 8));
    const rowHeight = Math.max(22, Math.max(...cells.map((lines) => lines.length)) * 9 + 8);
    if (y - rowHeight < 38) {
      page = document.addPage([841.89, 595.28]);
      y = drawPdfPageHeader(page, font, data, layout, true);
    }
    drawPdfRow(page, font, data.columns, record, cells, y, rowHeight, layout);
    y -= rowHeight;
  }
  const pages = document.getPages();
  pages.forEach((current, index) => current.drawText(`${index + 1} / ${pages.length}`, { color: rgb(0.35, 0.39, 0.38), font, size: 7, x: 775, y: 18 }));
  return document.save();
}

function createPdfLayout(columns: BankTransactionExportColumnId[]) {
  const left = 24;
  const available = 841.89 - left * 2;
  const totalWeight = columns.reduce((sum, column) => sum + pdfColumnWeights[column], 0);
  const widths = columns.map((column) => available * pdfColumnWeights[column] / totalWeight);
  const positions: number[] = [];
  widths.reduce((x, width) => { positions.push(x); return x + width; }, left);
  return { left, positions, widths };
}

function drawPdfPageHeader(page: PDFPage, font: PDFFont, data: BankTransactionExportData, layout: ReturnType<typeof createPdfLayout>, continuation = false) {
  page.drawText(`${data.title}${continuation ? " (계속)" : ""}`, { color: rgb(0.05, 0.24, 0.18), font, size: 15, x: layout.left, y: 566 });
  page.drawText(`검색 조건: ${bankTransactionFilterSummary(data.filters)}`, { color: rgb(0.25, 0.31, 0.29), font, size: 7.5, x: layout.left, y: 548 });
  page.drawText(`총 ${data.records.length.toLocaleString("ko-KR")}건 · 통장 입금 ${data.totals.deposit.toLocaleString("ko-KR")}원 · 통장 출금 ${data.totals.withdrawal.toLocaleString("ko-KR")}원 · 외부인정 ${data.totals.externalRecognition.toLocaleString("ko-KR")}원`, { color: rgb(0.25, 0.31, 0.29), font, size: 7.5, x: layout.left, y: 535 });
  const y = 521;
  data.columns.forEach((column, index) => {
    page.drawRectangle({ color: rgb(0.05, 0.36, 0.26), height: 22, width: layout.widths[index], x: layout.positions[index], y: y - 22 });
    const label = bankTransactionExportColumnLabel(column);
    const width = font.widthOfTextAtSize(label, 7.4);
    page.drawText(label, { color: rgb(1, 1, 1), font, size: 7.4, x: layout.positions[index] + Math.max(4, (layout.widths[index] - width) / 2), y: y - 14 });
  });
  return y - 22;
}

function drawPdfRow(
  page: PDFPage,
  font: PDFFont,
  columns: BankTransactionExportColumnId[],
  record: BankTransactionExportRecord,
  cells: string[][],
  y: number,
  height: number,
  layout: ReturnType<typeof createPdfLayout>,
) {
  page.drawRectangle({ borderColor: rgb(0.84, 0.87, 0.86), borderWidth: 0.4, color: rgb(1, 1, 1), height, width: layout.widths.reduce((sum, value) => sum + value, 0), x: layout.left, y: y - height });
  columns.forEach((column, index) => {
    if (index) page.drawLine({ color: rgb(0.88, 0.9, 0.89), end: { x: layout.positions[index], y }, start: { x: layout.positions[index], y: y - height }, thickness: 0.35 });
    cells[index].forEach((line, lineIndex) => {
      const size = column === "amount" || column === "balance" ? 7.4 : 7;
      const textWidth = font.widthOfTextAtSize(line, size);
      const rightAligned = column === "amount" || column === "balance";
      const x = rightAligned ? layout.positions[index] + layout.widths[index] - textWidth - 4 : layout.positions[index] + 4;
      page.drawText(line, { color: rgb(0.08, 0.12, 0.11), font, size, x, y: y - 11 - lineIndex * 9 });
    });
  });
}

function wrapPdfText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const char of paragraph) {
      const candidate = line + char;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) { lines.push(line); line = char; }
      else line = candidate;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}
