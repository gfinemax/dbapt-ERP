import { describe, expect, it } from "vitest";

import {
  matchBankSheetRows,
  parseBankSheetText,
  type BankSheetMatchCandidate,
} from "./bank-transaction-sheet-enrichment";

describe("bank transaction sheet enrichment", () => {
  it("parses the nine-column Google sheet while preserving physical row numbers", () => {
    const rows = parseBankSheetText([
      "계좌구분\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t항목구분\t메모",
      "기업(07111)\t2025-05-17\t\t지급\t박노수\t\t3,000,500\t선급금(지구단위용역비)\tPDF에만 있음",
      "",
      "기업(07111)\t2022-02-25\t09:10:30\t입금\t정숙희\t9,000,000\t\t차입금\t",
    ].join("\n"));

    expect(rows).toEqual([
      expect.objectContaining({
        accountCategory: "선급금(지구단위용역비)",
        depositAmount: 0,
        description: "박노수",
        memo: "PDF에만 있음",
        sourceRow: 2,
        transactionDate: "2025-05-17",
        transactionTime: "",
        withdrawalAmount: 3_000_500,
      }),
      expect.objectContaining({
        depositAmount: 9_000_000,
        sourceRow: 4,
        transactionTime: "09:10:30",
        withdrawalAmount: 0,
      }),
    ]);
  });

  it("separates unique matches, manual review, new rows and zero-value evidence", () => {
    const sourceRows = parseBankSheetText([
      "계좌구분\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t항목구분\t메모",
      "기업\t2022-12-01\t10:00:00\t입금\t자동\t100\t\t차입금\t",
      "기업\t2022-12-02\t10:00:00\t입금\t중복\t200\t\t차입금\t",
      "기업\t2024-01-31\t\t출금\t시간없음\t\t300\t용역비\t",
      "기업\t2025-05-17\t\t출금\t신규\t\t400\t용역비\t",
      "기업\t2024-08-19\t07:41:58\t기타\t결산\t\t\t잡이익\t",
    ].join("\n"));
    const existing: BankSheetMatchCandidate[] = [
      candidate("one", "2022-12-01", "10:00:00", 100, 0),
      candidate("duplicate-a", "2022-12-02", "10:00:00", 200, 0),
      candidate("duplicate-b", "2022-12-02", "10:00:00", 200, 0),
      candidate("date-only", "2024-01-31", "09:32:40", 0, 300),
      candidate("erp-only", "2021-03-23", "18:52:43", 0, 1_000),
    ];

    const preview = matchBankSheetRows(sourceRows, existing);

    expect(preview).toMatchObject({
      autoMatchedCount: 2,
      categorizedRowCount: 5,
      erpOnlyAfterResolutionCount: 2,
      expectedCurrentCount: 5,
      newCount: 1,
      reviewRequiredCount: 1,
      skippedZeroCount: 1,
      sourceRowCount: 5,
    });
    expect(preview.rows.map((row) => row.status)).toEqual([
      "AUTO_MATCH",
      "REVIEW_REQUIRED",
      "AUTO_MATCH",
      "NEW",
      "SKIPPED_ZERO",
    ]);
  });

  it("auto-matches date-only rows when the amount group or normalized description is unique", () => {
    const sourceRows = parseBankSheetText([
      "계좌구분\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t항목구분\t메모",
      "신협(13102)\t2025-05-17\t\t자동대체\t법무법인월드\t\t3,000,500\t변호사비\t",
      "신협(13102)\t2025-07-06\t\t현금\t김호진(유진영)\t1,000,000\t\t분양선수금\t",
    ].join("\n"));
    const existing = [
      candidate("law", "2025-05-17", "00:00:00", 0, 3_000_500, "법무법인월드"),
      candidate("park", "2025-05-17", "00:00:00", 0, 3_000_500, "박노수"),
      candidate("kim", "2025-07-06", "00:00:00", 1_000_000, 0, "김호진"),
    ];

    const preview = matchBankSheetRows(sourceRows, existing);

    expect(preview.autoMatchedCount).toBe(2);
    expect(preview.reviewRequiredCount).toBe(0);
    expect(preview.erpOnlyAfterResolutionCount).toBe(1);
    expect(preview.rows.map((row) => row.matchedBankTransactionId)).toEqual(["law", "kim"]);
  });

  it("keeps a date-only source surplus in review so it can be inserted or excluded explicitly", () => {
    const sourceRows = parseBankSheetText([
      "계좌구분\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t항목구분\t메모",
      "신협(13102)\t2025-11-07\t\t자동대체\t안동연(KT)\t\t25,850\t통신비\t",
      "신협(13102)\t2025-11-07\t\t자동대체\t안동연 (KT)\t\t25,850\t통신비\tPDF에만 있음",
    ].join("\n"));
    const existing = [candidate("kt", "2025-11-07", "00:00:00", 0, 25_850, "안동연(KT)")];

    const preview = matchBankSheetRows(sourceRows, existing);

    expect(preview.autoMatchedCount).toBe(0);
    expect(preview.reviewRequiredCount).toBe(2);
    expect(preview.rows.every((row) => row.candidates[0]?.id === "kt")).toBe(true);
  });

  it("does not use description text to force a match", () => {
    const [source] = parseBankSheetText("계좌구분\t거래일자\t거래시간\t적요\t입금\t출금\n기업\t2026-01-01\t10:00\t같은 이름\t100\t");
    const preview = matchBankSheetRows([source], [candidate("different-amount", "2026-01-01", "10:00:00", 200, 0, "같은 이름")]);
    expect(preview.rows[0].status).toBe("NEW");
  });
});

function candidate(
  id: string,
  transactionDate: string,
  transactionTime: string,
  depositAmount: number,
  withdrawalAmount: number,
  description = id,
): BankSheetMatchCandidate {
  return {
    depositAmount,
    description,
    id,
    sourceTransactionId: id,
    transactionDate,
    transactionTime,
    withdrawalAmount,
  };
}
