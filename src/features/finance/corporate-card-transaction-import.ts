export type CorporateCardTransactionImportRow = {
  amount: number;
  approvalNo?: string;
  approvedAt: string;
  cardLastFour: string;
  cardName: string;
  category?: string;
  merchantName: string;
  memo?: string;
  transactionUid: string;
};

const aliases = { approvedAt: ["승인일시","승인일자","이용일자","거래일자","사용일"], amount: ["승인금액","이용금액","금액","사용금액"], merchantName: ["가맹점명","이용가맹점","가맹점","사용처"], cardName: ["카드명","카드구분"], cardLastFour: ["카드번호끝4자리","카드끝4자리","카드번호"], approvalNo: ["승인번호"], category: ["업종","분류"], memo: ["메모","적요"] } as const;
const normalize = (value: string) => value.replace(/[\s_()\-]/g, "").toLowerCase();
const cell = (row: string[], index: number | undefined) => index === undefined ? "" : (row[index] ?? "").trim();

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCorporateCardTransactionText(text: string): CorporateCardTransactionImportRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string) => splitDelimitedLine(line, delimiter);
  const headers = split(lines[0]);
  const find = (names: readonly string[]) => headers.findIndex((header) => names.some((name) => normalize(name) === normalize(header)));
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, find(names)])) as Record<keyof typeof aliases, number>;
  if (indexes.approvedAt < 0 || indexes.amount < 0 || indexes.merchantName < 0) throw new Error("승인일자·금액·가맹점 열을 확인해줘.");
  return lines.slice(1).map(split).filter((row) => row.some(Boolean)).map((row, index) => {
    const amount = Number(cell(row, indexes.amount).replace(/[^0-9.-]/g, ""));
    const rawDate = cell(row, indexes.approvedAt).replace(/\./g, "-").replace(/\//g, "-");
    const date = new Date(rawDate.includes("T") ? rawDate : `${rawDate}T12:00:00+09:00`);
    const cardRaw = cell(row, indexes.cardLastFour).replace(/\D/g, "");
    const cardLastFour = cardRaw.slice(-4).padStart(4, "0");
    const approvalNo = cell(row, indexes.approvalNo) || undefined;
    const merchantName = cell(row, indexes.merchantName);
    if (!(amount > 0) || !merchantName || Number.isNaN(date.getTime())) throw new Error(`${index + 2}행의 승인일자, 금액 또는 가맹점을 확인해줘.`);
    const approvedAt = date.toISOString();
    return { amount, approvalNo, approvedAt, cardLastFour, cardName: cell(row, indexes.cardName) || "법인카드", category: cell(row, indexes.category) || undefined, merchantName, memo: cell(row, indexes.memo) || undefined, transactionUid: approvalNo ? `APPROVAL:${approvalNo}` : `CARD:${approvedAt}:${amount}:${merchantName}:${cardLastFour}` };
  });
}
