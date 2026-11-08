import readXlsxFile from "read-excel-file/node";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import { defaultBankTransactionExportColumns } from "./bank-transaction-export-columns";
import { buildBankTransactionExportData, buildBankTransactionPdf, buildBankTransactionWorkbook } from "./bank-transaction-export.server";
import type { BankTransactionListRow } from "./bank-transaction-repository";

const account: RegisteredBankAccount = {
  accountName: "조합 운영비",
  accountNo: "1006-901-293047",
  accountType: "운영계좌",
  bankName: "우리은행",
  createdAt: "2020-01-01",
  id: "account-1",
  lastSyncedAt: "2026-11-08",
  status: "정상",
  unmatchedCount: 0,
  usageStatus: "사용",
};

const subject: RegisteredAccountSubject = {
  aliases: [], businessCategory: "운영비", code: "OP-310", description: "식대", id: "subject-1", isActive: true,
  name: "복리후생비(식대)", normalBalance: "차변", parentId: null, sortOrder: 1, source: "직접등록", subjectType: "지출",
};

const row: BankTransactionListRow = {
  amount: 520000, balanceAmount: 1000000, bankAccountId: account.id, branchName: "신협중앙지점", classificationNote: "회의 식대",
  classificationStatus: "CONFIRMED", confirmedAccountSubjectId: subject.id, confirmedAccountSubjectName: subject.name, counterparty: "옛골식당",
  description: "옛골식당", id: "transaction-1", memo: "운영비 카드", recommendedAccountSubjectId: null, recommendedAccountSubjectName: null,
  recommendationReason: null, transactedAt: "2026-11-03T03:37:00+09:00", transactionKind: "출금", uploadedAccountTitle: "복리후생비",
  uploadedCategory: "지출-운영비",
};

describe("bank transaction export", () => {
  const data = buildBankTransactionExportData({
    accountSubjects: [subject], bankAccounts: [account], columns: [...defaultBankTransactionExportColumns], filters: { query: "옛골식당" },
    generatedAt: "2026-11-08T12:00:00Z", rows: [row], title: "운영비 거래내역",
  });

  it("keeps the requested default columns and signed amount in the Excel file", async () => {
    const workbook = await buildBankTransactionWorkbook(data);
    const sheets = await readXlsxFile(workbook);
    const transactions = sheets.find((sheet) => sheet.sheet === "거래내역")!.data;
    expect(transactions[0]).toEqual(["거래일", "일시", "계좌", "적요", "거래내역", "금액", "계정과목"]);
    expect(transactions[1][3]).toBe("옛골식당");
    expect(transactions[1][5]).toBe(-520000);
    expect(String(transactions[1][4])).toContain("항목구분: 지출-운영비");
    expect(String(transactions[1][6])).toContain("복리후생비(식대)");
  });

  it("creates a readable Korean-font PDF without changing the source row", async () => {
    const pdf = await buildBankTransactionPdf(data);
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
    expect(row.amount).toBe(520000);
    expect(pdf.byteLength).toBeGreaterThan(10_000);
  });
});
