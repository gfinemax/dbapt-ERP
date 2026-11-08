export const defaultBankSheetDocumentId = "1Qxh1bMM6hUEDMHzEqAdOppKH8ZYqbVTRZa-Ci7CElQ4";
export const defaultBankSheetName = "시트1";

export const bankSheetProfiles = [
  {
    accountDigits: "07111426104017",
    documentId: defaultBankSheetDocumentId,
    reason: "기업(07111) Google 시트의 적요·항목구분·메모 보정 및 신규 거래 반영",
    sheetName: defaultBankSheetName,
  },
  {
    accountDigits: "131022540467",
    documentId: "1ygwf7JkjTMoMJJuZdsM4ifA52x-LiuZKbuhNX3z74_w",
    reason: "신협(13102) Google 시트 390건의 적요·항목구분·메모 보정 및 원본 대조",
    sheetName: defaultBankSheetName,
  },
] as const;

export const bankSheetInsertSelection = "__INSERT__";
export const bankSheetSkipSelection = "__SKIP_REVIEW__";

export type BankSheetSourceRow = {
  accountLabel: string;
  accountCategory: string;
  bankTransactionType: string;
  depositAmount: number;
  description: string;
  memo: string;
  sourceRow: number;
  transactionDate: string;
  transactionTime: string;
  withdrawalAmount: number;
};

export type BankSheetMatchCandidate = {
  depositAmount: number;
  description: string;
  id: string;
  sourceTransactionId: string;
  transactionDate: string;
  transactionTime: string;
  withdrawalAmount: number;
};

export type BankSheetPreviewStatus = "AUTO_MATCH" | "REVIEW_REQUIRED" | "NEW" | "SKIPPED_ZERO";

export type BankSheetPreviewRow = BankSheetSourceRow & {
  candidates: BankSheetMatchCandidate[];
  matchedBankTransactionId: string | null;
  status: BankSheetPreviewStatus;
};

export type BankSheetEnrichmentPreview = {
  autoMatchedCount: number;
  categorizedRowCount: number;
  erpOnlyAfterResolutionCount: number;
  expectedCurrentCount: number;
  newCount: number;
  reviewRequiredCount: number;
  rows: BankSheetPreviewRow[];
  skippedZeroCount: number;
  sourceDepositTotal: number;
  sourceRowCount: number;
  sourceWithdrawalTotal: number;
};

export type BankSheetEnrichmentResult = {
  already_applied: boolean;
  batch_id: string;
  current_count: number;
  field_override_count: number;
  inserted_count: number;
  manual_match_count: number;
  matched_count: number;
  skipped_count: number;
  source_row_count: number;
};

const headerAliases = {
  accountCategory: ["항목구분", "항", "분류"],
  accountLabel: ["계좌구분", "계좌"],
  bankTransactionType: ["거래종류", "거래구분"],
  depositAmount: ["입금", "입금액"],
  description: ["적요", "거래내용", "내용"],
  memo: ["메모", "비고"],
  transactionDate: ["거래일자", "거래일", "일자"],
  transactionTime: ["거래시간", "시간"],
  withdrawalAmount: ["출금", "출금액"],
} as const;

type ColumnName = keyof typeof headerAliases;

export function parseBankSheetText(text: string): BankSheetSourceRow[] {
  const physicalLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerLineIndex = physicalLines.findIndex((line) => line.trim().length > 0);
  if (headerLineIndex < 0) throw new Error("시트 헤더를 찾지 못했어.");
  const delimiter = physicalLines[headerLineIndex].includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(physicalLines[headerLineIndex], delimiter).map(normalizeHeader);
  const columns = resolveColumns(headers);
  const required: ColumnName[] = ["accountLabel", "transactionDate", "depositAmount", "withdrawalAmount"];
  const missing = required.filter((name) => columns[name] === undefined);
  if (missing.length) {
    throw new Error(`필수 컬럼을 확인해줘: ${missing.map((name) => headerAliases[name][0]).join(", ")}`);
  }

  return physicalLines
    .slice(headerLineIndex + 1)
    .map((line, index) => ({ cells: parseDelimitedLine(line, delimiter), sourceRow: headerLineIndex + index + 2 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim().length > 0))
    .map(({ cells, sourceRow }) => ({
      accountCategory: readCell(cells, columns.accountCategory),
      accountLabel: readCell(cells, columns.accountLabel),
      bankTransactionType: readCell(cells, columns.bankTransactionType),
      depositAmount: parseAmount(readCell(cells, columns.depositAmount), sourceRow, "입금"),
      description: readCell(cells, columns.description),
      memo: readCell(cells, columns.memo),
      sourceRow,
      transactionDate: parseDate(readCell(cells, columns.transactionDate), sourceRow),
      transactionTime: parseTime(readCell(cells, columns.transactionTime), sourceRow),
      withdrawalAmount: parseAmount(readCell(cells, columns.withdrawalAmount), sourceRow, "출금"),
    }));
}

export function matchBankSheetRows(
  sourceRows: BankSheetSourceRow[],
  existingRows: BankSheetMatchCandidate[],
): BankSheetEnrichmentPreview {
  const exactCandidates = groupCandidates(existingRows, exactKey);
  const dateCandidates = groupCandidates(existingRows, dateAmountKey);
  const used = new Set<string>();
  const rows: BankSheetPreviewRow[] = [];

  for (const row of sourceRows.filter((sourceRow) => Boolean(sourceRow.transactionTime))) {
    if (row.depositAmount === 0 && row.withdrawalAmount === 0) {
      rows.push({ ...row, candidates: [], matchedBankTransactionId: null, status: "SKIPPED_ZERO" });
      continue;
    }
    if ((row.depositAmount > 0) === (row.withdrawalAmount > 0)) {
      throw new Error(`시트 ${row.sourceRow}행의 입금·출금 방향을 확인해줘.`);
    }
    const candidates = (exactCandidates.get(exactKey(row)) ?? []).filter((candidate) => !used.has(candidate.id));
    if (candidates.length === 1) {
      addAutoMatch(rows, row, candidates[0], used);
    } else if (candidates.length > 1) {
      rows.push({ ...row, candidates, matchedBankTransactionId: null, status: "REVIEW_REQUIRED" });
    } else {
      rows.push({ ...row, candidates: [], matchedBankTransactionId: null, status: "NEW" });
    }
  }

  const dateOnlyGroups = groupSourceRows(sourceRows.filter((row) => !row.transactionTime), dateAmountKey);
  for (const [key, sourceGroup] of dateOnlyGroups) {
    const zeroRows = sourceGroup.filter((row) => row.depositAmount === 0 && row.withdrawalAmount === 0);
    for (const row of zeroRows) {
      rows.push({ ...row, candidates: [], matchedBankTransactionId: null, status: "SKIPPED_ZERO" });
    }
    const pendingSources = sourceGroup.filter((row) => row.depositAmount > 0 || row.withdrawalAmount > 0);
    for (const row of pendingSources) {
      if ((row.depositAmount > 0) === (row.withdrawalAmount > 0)) {
        throw new Error(`시트 ${row.sourceRow}행의 입금·출금 방향을 확인해줘.`);
      }
    }
    const pendingCandidates = (dateCandidates.get(key) ?? []).filter((candidate) => !used.has(candidate.id));
    matchDateOnlyGroup(pendingSources, pendingCandidates, rows, used);
  }

  rows.sort((left, right) => left.sourceRow - right.sourceRow);
  const autoMatchedCount = rows.filter((row) => row.status === "AUTO_MATCH").length;
  const reviewRequiredCount = rows.filter((row) => row.status === "REVIEW_REQUIRED").length;
  const sourceDates = sourceRows.map((row) => row.transactionDate).filter(Boolean).sort();
  const sourceDateMin = sourceDates[0];
  const sourceDateMax = sourceDates[sourceDates.length - 1];
  const inScopeExistingRows = existingRows.filter((row) =>
    !sourceDateMin || !sourceDateMax || (row.transactionDate >= sourceDateMin && row.transactionDate <= sourceDateMax),
  );
  return {
    autoMatchedCount,
    categorizedRowCount: sourceRows.filter((row) => Boolean(row.accountCategory.trim())).length,
    erpOnlyAfterResolutionCount: inScopeExistingRows.filter((row) => !used.has(row.id)).length,
    expectedCurrentCount: existingRows.length,
    newCount: rows.filter((row) => row.status === "NEW").length,
    reviewRequiredCount,
    rows,
    skippedZeroCount: rows.filter((row) => row.status === "SKIPPED_ZERO").length,
    sourceDepositTotal: sourceRows.reduce((sum, row) => sum + row.depositAmount, 0),
    sourceRowCount: sourceRows.length,
    sourceWithdrawalTotal: sourceRows.reduce((sum, row) => sum + row.withdrawalAmount, 0),
  };
}

function matchDateOnlyGroup(
  sourceRows: BankSheetSourceRow[],
  candidates: BankSheetMatchCandidate[],
  result: BankSheetPreviewRow[],
  used: Set<string>,
) {
  const unmatchedSources = [...sourceRows];
  const unmatchedCandidates = [...candidates];
  const sourceDescriptionCounts = countBy(unmatchedSources, (row) => normalizeDescription(row.description));
  const candidateDescriptionCounts = countBy(unmatchedCandidates, (row) => normalizeDescription(row.description));

  for (let index = unmatchedSources.length - 1; index >= 0; index -= 1) {
    const source = unmatchedSources[index];
    const description = normalizeDescription(source.description);
    if (!description || sourceDescriptionCounts.get(description) !== 1 || candidateDescriptionCounts.get(description) !== 1) continue;
    const candidateIndex = unmatchedCandidates.findIndex((candidate) => normalizeDescription(candidate.description) === description);
    if (candidateIndex < 0) continue;
    const [candidate] = unmatchedCandidates.splice(candidateIndex, 1);
    unmatchedSources.splice(index, 1);
    addAutoMatch(result, source, candidate, used);
  }

  if (unmatchedSources.length === 1 && unmatchedCandidates.length === 1) {
    addAutoMatch(result, unmatchedSources[0], unmatchedCandidates[0], used);
    return;
  }

  if (
    unmatchedSources.length > 1
    && unmatchedSources.length === unmatchedCandidates.length
    && new Set(unmatchedSources.map(enrichmentSignature)).size === 1
  ) {
    const orderedSources = [...unmatchedSources].sort((left, right) => left.sourceRow - right.sourceRow);
    const orderedCandidates = [...unmatchedCandidates].sort((left, right) =>
      left.sourceTransactionId.localeCompare(right.sourceTransactionId, "ko", { numeric: true }),
    );
    orderedSources.forEach((source, index) => addAutoMatch(result, source, orderedCandidates[index], used));
    return;
  }

  if (!unmatchedCandidates.length) {
    unmatchedSources.forEach((source) => result.push({
      ...source,
      candidates: [],
      matchedBankTransactionId: null,
      status: candidates.length ? "REVIEW_REQUIRED" : "NEW",
    }));
    return;
  }

  unmatchedSources.forEach((source) => result.push({
    ...source,
    candidates: unmatchedCandidates,
    matchedBankTransactionId: null,
    status: "REVIEW_REQUIRED",
  }));
}

function addAutoMatch(
  rows: BankSheetPreviewRow[],
  source: BankSheetSourceRow,
  candidate: BankSheetMatchCandidate,
  used: Set<string>,
) {
  used.add(candidate.id);
  rows.push({ ...source, candidates: [candidate], matchedBankTransactionId: candidate.id, status: "AUTO_MATCH" });
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = key(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return counts;
}

function groupSourceRows(rows: BankSheetSourceRow[], key: (row: BankSheetSourceRow) => string) {
  const grouped = new Map<string, BankSheetSourceRow[]>();
  rows.forEach((row) => grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]));
  return grouped;
}

function enrichmentSignature(row: BankSheetSourceRow) {
  return [normalizeDescription(row.description), row.accountCategory.trim(), row.memo.trim()].join("|");
}

function normalizeDescription(value: string) {
  return value.normalize("NFKC").replace(/[\s()（）._-]+/g, "").toLocaleLowerCase("ko-KR");
}

function resolveColumns(headers: string[]) {
  return Object.fromEntries(Object.entries(headerAliases).map(([name, aliases]) => [
    name,
    headers.findIndex((header) => aliases.some((alias) => normalizeHeader(alias) === header)),
  ]).map(([name, index]) => [name, index === -1 ? undefined : index])) as Partial<Record<ColumnName, number>>;
}

function parseDelimitedLine(line: string, delimiter: string) {
  if (delimiter === "\t") return line.split("\t").map((cell) => cell.trim());
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
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

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function readCell(cells: string[], index?: number) {
  return index === undefined ? "" : (cells[index] ?? "").trim();
}

function parseAmount(value: string, row: number, label: string) {
  if (!value.trim()) return 0;
  const normalized = value.replace(/[원,\s]/g, "").replace(/^\+/, "");
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`시트 ${row}행의 ${label} 금액을 확인해줘.`);
  return amount;
}

function parseDate(value: string, row: number) {
  const match = value.trim().match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (!match) throw new Error(`시트 ${row}행의 거래일자를 확인해줘.`);
  const result = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const date = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result) {
    throw new Error(`시트 ${row}행의 거래일자를 확인해줘.`);
  }
  return result;
}

function parseTime(value: string, row: number) {
  if (!value.trim()) return "";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error(`시트 ${row}행의 거래시간을 확인해줘.`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`시트 ${row}행의 거래시간을 확인해줘.`);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function groupCandidates(rows: BankSheetMatchCandidate[], key: (row: BankSheetMatchCandidate) => string) {
  const grouped = new Map<string, BankSheetMatchCandidate[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function exactKey(row: Pick<BankSheetSourceRow, "transactionDate" | "transactionTime" | "depositAmount" | "withdrawalAmount">) {
  return `${row.transactionDate}|${row.transactionTime}|${row.depositAmount}|${row.withdrawalAmount}`;
}

function dateAmountKey(row: Pick<BankSheetSourceRow, "transactionDate" | "depositAmount" | "withdrawalAmount">) {
  return `${row.transactionDate}|${row.depositAmount}|${row.withdrawalAmount}`;
}
