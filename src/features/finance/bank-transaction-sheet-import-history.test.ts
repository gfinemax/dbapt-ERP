import { describe, expect, it } from "vitest";

import { mapBankTransactionSheetImportHistoryRow } from "./bank-transaction-sheet-import-history";

describe("bank transaction sheet import history", () => {
  it("maps database numeric values into a UI-safe audited history entry", () => {
    expect(mapBankTransactionSheetImportHistoryRow({
      bank_account_id: "bank-10054",
      id: "batch-76",
      imported_at: "2026-11-08T01:00:38.67399+00:00",
      imported_by: "user-1",
      inserted_count: "19",
      matched_count: "57",
      source_deposit_total: "490965191",
      source_document_id: "document-1",
      source_row_count: "76",
      source_sheet: "시트1",
      source_withdrawal_total: "489147570",
    }, "파인맥스", {
      currentTransactionCount: 76,
      googleSheetSourceCount: 19,
      ledgerSourceCount: 57,
      otherSourceCount: 0,
    })).toEqual({
      actorLabel: "파인맥스",
      bankAccountId: "bank-10054",
      batchId: "batch-76",
      currentTransactionCount: 76,
      googleSheetSourceCount: 19,
      importedAt: "2026-11-08T01:00:38.67399+00:00",
      insertedCount: 19,
      ledgerSourceCount: 57,
      matchedCount: 57,
      otherSourceCount: 0,
      sourceDepositTotal: 490965191,
      sourceDocumentId: "document-1",
      sourceRowCount: 76,
      sourceSheet: "시트1",
      sourceWithdrawalTotal: 489147570,
    });
  });
});
