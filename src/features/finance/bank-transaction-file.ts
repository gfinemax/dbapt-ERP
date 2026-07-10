import { readSheet } from "read-excel-file/browser";

export async function readBankTransactionFile(file: File) {
  if (!isExcelFile(file)) {
    return file.text();
  }

  const rows = await readSheet(file);

  return rows.map((row) => trimTrailingEmptyCells(row.map(formatCell)).join("\t")).join("\n");
}

function isExcelFile(file: File) {
  const fileName = file.name.toLowerCase();

  return fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
}

function formatCell(value: unknown) {
  if (value instanceof Date) {
    return formatDateCell(value);
  }

  return `${value ?? ""}`.trim();
}

function formatDateCell(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function trimTrailingEmptyCells(row: string[]) {
  let endIndex = row.length;

  while (endIndex > 0 && row[endIndex - 1] === "") {
    endIndex -= 1;
  }

  return row.slice(0, endIndex);
}
