import { readSheet } from "read-excel-file/browser";

export async function readExpenseResolutionImportFile(file: File): Promise<unknown[][]> {
  if (isExcelFile(file)) return readSheet(file);
  const text = (await readTextFile(file)).replace(/^\uFEFF/, "");
  const delimiter = file.name.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => parseDelimitedLine(line, delimiter));
}

function readTextFile(file: File) {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}
