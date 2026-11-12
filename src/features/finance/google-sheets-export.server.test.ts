import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { BankTransactionExportData } from "./bank-transaction-export.server";
import {
  bankTransactionGoogleSheetValues,
  createBankTransactionGoogleSpreadsheet,
  GoogleSheetsConfigurationError,
} from "./google-sheets-export.server";

const data: BankTransactionExportData = {
  columns: ["transactionDate", "description", "amount"],
  filters: { dateFrom: "2026-01-01", query: "식당" },
  generatedAt: "2026-11-11T01:30:00.000Z",
  records: [{
    account: "",
    accountingTreatment: "",
    accountSubject: "",
    adminNote: "",
    amount: -520000,
    balance: "",
    cashImpact: "",
    classificationStatus: "확정",
    counterparty: "옛골식당",
    description: "옛골식당",
    details: "식대",
    originType: "은행 통장거래",
    sourceRecordId: "source-1",
    sourceStatus: "원본 대조 이상 없음",
    transactionDate: "2026-11-03",
    transactionId: "transaction-1",
    transactionKind: "출금",
    transactionTime: "03:37:00",
  }],
  title: "통합 거래내역",
  totals: { confirmedLoss: 0, deposit: 0, externalRecognition: 0, trustHeld: 0, withdrawal: 520000 },
};

describe("Google Sheets bank transaction export", () => {
  it("keeps selected column order and numeric values", () => {
    const values = bankTransactionGoogleSheetValues(data);
    expect(values.transactions[0]).toEqual(["거래일", "적요", "금액"]);
    expect(values.transactions[1]).toEqual(["2026-11-03", "옛골식당", -520000]);
    expect(values.info).toContainEqual(["검색 조건", "검색어 식당 · 전체 계좌 · 전체 원본 · 시작일 2026-01-01"]);
  });

  it("creates a spreadsheet in the configured shared folder and writes both sheets", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const requests: Array<{ body?: string; url: string }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ body: typeof init?.body === "string" ? init.body : undefined, url });
      if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "google-token" });
      if (url.includes("drive/v3/files")) return Response.json({ id: "sheet-123", name: "통합 거래내역", webViewLink: "https://docs.google.com/spreadsheets/d/sheet-123/edit" });
      return Response.json({});
    }) as typeof fetch;

    const result = await createBankTransactionGoogleSpreadsheet(data, {
      env: {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "erp-export@example.iam.gserviceaccount.com",
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        GOOGLE_SHEETS_FOLDER_ID: "shared-folder-1",
      },
      fetchImpl,
      now: new Date("2026-11-11T02:00:00.000Z"),
    });

    expect(result).toEqual({ spreadsheetId: "sheet-123", title: "통합 거래내역", url: "https://docs.google.com/spreadsheets/d/sheet-123/edit" });
    expect(JSON.parse(requests.find((request) => request.url.includes("drive/v3/files"))!.body!)).toMatchObject({
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: ["shared-folder-1"],
    });
    expect(requests.some((request) => request.url.includes(encodeURIComponent("'거래내역'!A1")))).toBe(true);
    expect(requests.some((request) => request.url.includes(encodeURIComponent("'내보내기 정보'!A1")))).toBe(true);
  });

  it("fails clearly when the service account configuration is missing", async () => {
    await expect(createBankTransactionGoogleSpreadsheet(data, { env: {} })).rejects.toBeInstanceOf(GoogleSheetsConfigurationError);
  });
});
