import { createSign } from "node:crypto";

import type { BankTransactionExportData } from "./bank-transaction-export.server";
import { bankTransactionExportColumnLabel } from "./bank-transaction-export-columns";
import { bankTransactionFilterSummary } from "./bank-transaction-export-summary";

type Fetch = typeof fetch;
type GoogleSheetsEnv = Record<string, string | undefined>;

type GoogleSheetsExportOptions = {
  env?: GoogleSheetsEnv;
  fetchImpl?: Fetch;
  now?: Date;
};

type GoogleApiError = {
  error?: {
    message?: string;
  };
};

export type GoogleSpreadsheetResult = {
  spreadsheetId: string;
  title: string;
  url: string;
};

export class GoogleSheetsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsConfigurationError";
  }
}

const spreadsheetMimeType = "application/vnd.google-apps.spreadsheet";
const googleScope = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export async function createBankTransactionGoogleSpreadsheet(
  data: BankTransactionExportData,
  options: GoogleSheetsExportOptions = {},
): Promise<GoogleSpreadsheetResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const credentials = readCredentials(env);
  const accessToken = await getAccessToken(credentials.email, credentials.privateKey, fetchImpl, options.now ?? new Date());
  const file = await googleRequest<{ id: string; name: string; webViewLink?: string }>(
    `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink`,
    accessToken,
    fetchImpl,
    {
      body: JSON.stringify({
        mimeType: spreadsheetMimeType,
        name: data.title,
        parents: [credentials.folderId],
      }),
      method: "POST",
    },
  );
  if (!file.id) throw new Error("Google Drive에서 생성된 스프레드시트 ID를 받지 못했어.");

  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}:batchUpdate`,
    accessToken,
    fetchImpl,
    {
      body: JSON.stringify({
        requests: [
          { updateSheetProperties: { fields: "title,gridProperties.frozenRowCount", properties: { gridProperties: { frozenRowCount: 1 }, sheetId: 0, title: "거래내역" } } },
          { addSheet: { properties: { gridProperties: { columnCount: 2, frozenRowCount: 1 }, sheetId: 1, title: "내보내기 정보" } } },
        ],
      }),
      method: "POST",
    },
  );

  const values = bankTransactionGoogleSheetValues(data);
  await writeSheetValues(file.id, "거래내역", values.transactions, accessToken, fetchImpl);
  await writeSheetValues(file.id, "내보내기 정보", values.info, accessToken, fetchImpl);
  await formatSpreadsheet(file.id, data, accessToken, fetchImpl);

  return {
    spreadsheetId: file.id,
    title: file.name || data.title,
    url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.id)}/edit`,
  };
}

export function bankTransactionGoogleSheetValues(data: BankTransactionExportData) {
  const transactions: Array<Array<string | number>> = [
    data.columns.map(bankTransactionExportColumnLabel),
    ...data.records.map((record) => data.columns.map((column) => record[column])),
  ];
  const info: Array<Array<string | number>> = [
    ["항목", "내용"],
    ["보고서명", data.title],
    ["생성일시", new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(data.generatedAt))],
    ["검색 조건", bankTransactionFilterSummary(data.filters)],
    ["선택 컬럼", data.columns.map(bankTransactionExportColumnLabel).join(", ")],
    ["거래 건수", data.records.length],
    ["입금 합계", data.totals.deposit],
    ["출금 합계", data.totals.withdrawal],
    ["외부납입 인정 합계", data.totals.externalRecognition],
    ["확정결손 합계", data.totals.confirmedLoss],
    ["신탁사 보관 합계", data.totals.trustHeld],
    ["안내", "검색 결과를 읽기 전용으로 내보낸 자료이며 ERP 원본 거래를 변경하지 않습니다."],
  ];
  return { info, transactions };
}

function readCredentials(env: GoogleSheetsEnv) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const folderId = env.GOOGLE_SHEETS_FOLDER_ID?.trim();
  if (!email || !privateKey || !folderId) {
    throw new GoogleSheetsConfigurationError("구글 스프레드시트 내보내기가 아직 설정되지 않았어. 관리자에게 Google 서비스 계정과 공유 드라이브 폴더 설정을 요청해줘.");
  }
  return { email, folderId, privateKey };
}

async function getAccessToken(email: string, privateKey: string, fetchImpl: Fetch, now: Date) {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    aud: "https://oauth2.googleapis.com/token",
    exp: issuedAt + 3_600,
    iat: issuedAt,
    iss: email,
    scope: googleScope,
  }));
  const unsignedToken = `${header}.${claims}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsignedToken).sign(privateKey, "base64url");
  } catch {
    throw new GoogleSheetsConfigurationError("Google 서비스 계정 비공개 키 형식이 올바르지 않아. 관리자 설정을 확인해줘.");
  }
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      assertion: `${unsignedToken}.${signature}`,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "Google 서비스 계정 인증에 실패했어.");
  }
  return payload.access_token;
}

async function writeSheetValues(
  spreadsheetId: string,
  sheetName: string,
  rows: Array<Array<string | number>>,
  accessToken: string,
  fetchImpl: Fetch,
) {
  const chunkSize = 1_000;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const range = `'${sheetName}'!A${offset + 1}`;
    await googleRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      accessToken,
      fetchImpl,
      { body: JSON.stringify({ majorDimension: "ROWS", values: chunk }), method: "PUT" },
    );
  }
}

async function formatSpreadsheet(spreadsheetId: string, data: BankTransactionExportData, accessToken: string, fetchImpl: Fetch) {
  const requests: Record<string, unknown>[] = [
    headerFormatRequest(0, data.columns.length),
    headerFormatRequest(1, 2),
    { autoResizeDimensions: { dimensions: { dimension: "COLUMNS", endIndex: data.columns.length, sheetId: 0, startIndex: 0 } } },
    { autoResizeDimensions: { dimensions: { dimension: "COLUMNS", endIndex: 2, sheetId: 1, startIndex: 0 } } },
  ];
  data.columns.forEach((column, index) => {
    if (column !== "amount" && column !== "balance") return;
    requests.push({
      repeatCell: {
        cell: { userEnteredFormat: { horizontalAlignment: "RIGHT", numberFormat: { pattern: "#,##0;[Red]-#,##0", type: "NUMBER" } } },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
        range: { endColumnIndex: index + 1, sheetId: 0, startColumnIndex: index, startRowIndex: 1 },
      },
    });
  });
  requests.push({
    repeatCell: {
      cell: { userEnteredFormat: { numberFormat: { pattern: "#,##0", type: "NUMBER" } } },
      fields: "userEnteredFormat.numberFormat",
      range: { endColumnIndex: 2, endRowIndex: 11, sheetId: 1, startColumnIndex: 1, startRowIndex: 5 },
    },
  });
  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    accessToken,
    fetchImpl,
    { body: JSON.stringify({ requests }), method: "POST" },
  );
}

function headerFormatRequest(sheetId: number, columnCount: number) {
  return {
    repeatCell: {
      cell: {
        userEnteredFormat: {
          backgroundColor: { blue: 0.263, green: 0.357, red: 0.051 },
          horizontalAlignment: "CENTER",
          textFormat: { bold: true, foregroundColor: { blue: 1, green: 1, red: 1 } },
          wrapStrategy: "WRAP",
        },
      },
      fields: "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,wrapStrategy)",
      range: { endColumnIndex: columnCount, endRowIndex: 1, sheetId, startColumnIndex: 0, startRowIndex: 0 },
    },
  };
}

async function googleRequest<T = unknown>(url: string, accessToken: string, fetchImpl: Fetch, init: RequestInit): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & GoogleApiError;
  if (!response.ok) throw new Error(payload.error?.message || "Google 스프레드시트를 만들지 못했어.");
  return payload;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}
