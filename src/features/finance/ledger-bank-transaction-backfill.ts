import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import type {
  LedgerBankBackfillStatus,
  LedgerBankImportedTransaction,
  LedgerBankImportedTransactionDetail,
} from "./ledger-bank-backfill-shared";
import { signLedgerRequest } from "./ledger-contribution-signature";

const sourceSystem = "dbapt-ledger";
const path = "/api/integrations/erp/bank-transactions";
const pageSize = 200;
const maxPagesPerRun = 5;
const detailPageSize = 50;
const detailReadBatchSize = 1_000;

type LedgerBankPage = {
  has_more: boolean;
  items: Record<string, unknown>[];
  next_cursor: number;
  source_frozen: boolean;
  success: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function database() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("ERP 저장소가 설정되지 않았어.");
  return db;
}

async function requireBackfillActor(write = false) {
  const actor = await requireReimbursementIdentity();
  const allowed = write
    ? actor.permissions.some((permission) => ["ADMIN", "APPROVE", "CLOSE"].includes(permission))
    : actor.permissions.some((permission) => ["ADMIN", "APPROVE", "CLOSE", "PAY"].includes(permission));
  if (!actor.active || !allowed) throw new Error("Ledger 거래 이관 권한이 필요해.");
  return actor;
}

function parseStatus(value: unknown): LedgerBankBackfillStatus {
  if (!isRecord(value) || !Array.isArray(value.accounts) || !isRecord(value.totals)) {
    throw new Error("Ledger 거래 이관 상태를 확인하지 못했어.");
  }
  return value as LedgerBankBackfillStatus;
}

function stringValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(payload: Record<string, unknown>, key: string) {
  const value = Number(payload[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function mapImportedTransaction(row: Record<string, unknown>): LedgerBankImportedTransaction {
  const payload = isRecord(row.payload) ? row.payload : {};
  const depositAmount = numberValue(payload, "deposit_amount");
  const withdrawalAmount = numberValue(payload, "withdrawal_amount");
  const balanceValue = payload.balance_amount;
  const balanceAmount = balanceValue === null || balanceValue === undefined || balanceValue === ""
    ? null
    : Number(balanceValue);
  return {
    balance_amount: balanceAmount !== null && Number.isFinite(balanceAmount) ? balanceAmount : null,
    bank_transaction_id: String(row.bank_transaction_id ?? ""),
    category_group: stringValue(payload, "category_group"),
    category_name: stringValue(payload, "category_name"),
    deposit_amount: depositAmount,
    description: stringValue(payload, "description") ?? "적요 없음",
    imported_at: String(row.imported_at ?? ""),
    management_memo: stringValue(payload, "management_memo") ?? stringValue(payload, "memo"),
    payload_hash: String(row.payload_hash ?? ""),
    source_transaction_id: String(row.source_transaction_id ?? ""),
    transaction_date: stringValue(payload, "transaction_date") ?? "",
    transaction_kind: depositAmount > 0 ? "입금" : withdrawalAmount > 0 ? "출금" : "금액 없음",
    transaction_time: stringValue(payload, "transaction_time"),
    withdrawal_amount: withdrawalAmount,
  };
}

function transactionSortKey(row: LedgerBankImportedTransaction) {
  return `${row.transaction_date}T${row.transaction_time ?? "00:00:00"}|${row.source_transaction_id}`;
}

export async function loadLedgerBankBackfillStatus(): Promise<LedgerBankBackfillStatus> {
  const actor = await requireBackfillActor();
  const { data, error } = await database().schema("finance").rpc("ledger_bank_backfill_status", {
    p_actor: actor.user_id,
    p_org: actor.organization_id,
  });
  if (error) throw new Error(`Ledger 거래 이관 상태를 불러오지 못했어: ${error.message}`);
  return parseStatus(data);
}

export async function loadLedgerBankImportedTransactions(
  ledgerAccountId: string,
  requestedPage = 1,
): Promise<LedgerBankImportedTransactionDetail> {
  const actor = await requireBackfillActor();
  const normalizedAccountId = ledgerAccountId.trim();
  if (!normalizedAccountId || normalizedAccountId.length > 100) throw new Error("Ledger 계좌 ID를 확인해줘.");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const rows: LedgerBankImportedTransaction[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await database().schema("finance").from("ledger_bank_transaction_sources")
      .select("source_transaction_id,payload_hash,payload,bank_transaction_id,imported_at")
      .eq("organization_id", actor.organization_id)
      .eq("source_system", sourceSystem)
      .eq("ledger_account_id", normalizedAccountId)
      .eq("import_status", "IMPORTED")
      .order("source_transaction_id", { ascending: true })
      .range(offset, offset + detailReadBatchSize - 1);
    if (error) throw new Error(`Ledger 이관 거래를 불러오지 못했어: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch.map(mapImportedTransaction));
    if (batch.length < detailReadBatchSize) break;
    offset += detailReadBatchSize;
  }

  rows.sort((left, right) => transactionSortKey(right).localeCompare(transactionSortKey(left)));
  const transactionDates = rows.map((row) => row.transaction_date).filter(Boolean).sort();
  const totalPages = Math.max(1, Math.ceil(rows.length / detailPageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * detailPageSize;
  return {
    deposit_total: rows.reduce((total, row) => total + row.deposit_amount, 0),
    first_transaction_date: transactionDates[0] ?? null,
    last_transaction_date: transactionDates.at(-1) ?? null,
    page: currentPage,
    page_size: detailPageSize,
    rows: rows.slice(pageStart, pageStart + detailPageSize),
    total_count: rows.length,
    total_pages: totalPages,
    withdrawal_total: rows.reduce((total, row) => total + row.withdrawal_amount, 0),
  };
}

export async function syncLedgerBankTransactions() {
  const actor = await requireBackfillActor(true);
  const baseUrl = process.env.LEDGER_INTEGRATION_URL?.trim().replace(/\/$/, "");
  const secret = process.env.LEDGER_INTEGRATION_SECRET?.trim();
  if (!baseUrl || !secret) throw new Error("Ledger 연동 환경설정이 필요해.");
  const current = await loadLedgerBankBackfillStatus();
  let cursor = Number(current.state?.last_cursor ?? 0);
  let received = 0;
  let imported = 0;
  let invalid = 0;
  let complete = false;

  for (let pageNumber = 0; pageNumber < maxPagesPerRun; pageNumber += 1) {
    const url = new URL(path, `${baseUrl}/`);
    url.searchParams.set("after_cursor", String(cursor));
    url.searchParams.set("limit", String(pageSize));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomUUID();
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "X-ERP-Nonce": nonce,
        "X-ERP-Signature": signLedgerRequest(secret, url, timestamp, nonce),
        "X-ERP-Timestamp": timestamp,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Ledger 거래 조회에 실패했어 (${response.status}).`);
    const value: unknown = await response.json();
    if (!isRecord(value) || value.success !== true || !Array.isArray(value.items)
      || !Number.isSafeInteger(value.next_cursor) || Number(value.next_cursor) < cursor
      || typeof value.has_more !== "boolean" || typeof value.source_frozen !== "boolean") {
      throw new Error("Ledger 거래 응답 형식을 확인해줘.");
    }
    const page = value as LedgerBankPage;
    if (!page.source_frozen) throw new Error("Ledger 통장입력을 ERP로 전환한 뒤 기존 거래를 이관할 수 있어.");
    const { data, error } = await database().schema("finance").rpc("sync_ledger_bank_transactions", {
      p_actor: actor.user_id,
      p_complete: !page.has_more,
      p_from_cursor: cursor,
      p_items: page.items,
      p_next_cursor: page.next_cursor,
      p_org: actor.organization_id,
      p_source_frozen: page.source_frozen,
      p_source_system: sourceSystem,
    });
    if (error) throw new Error(`Ledger 거래 저장에 실패했어: ${error.message}`);
    if (!isRecord(data)) throw new Error("Ledger 거래 저장 결과를 확인하지 못했어.");
    received += Number(data.received_count ?? 0);
    imported += Number(data.imported_count ?? 0);
    invalid += Number(data.invalid_count ?? 0);
    cursor = page.next_cursor;
    complete = !page.has_more;
    if (complete) break;
  }
  return {
    complete,
    imported_count: imported,
    invalid_count: invalid,
    next_cursor: cursor,
    received_count: received,
    status: await loadLedgerBankBackfillStatus(),
  };
}

export async function setLedgerBankAccountMapping(input: {
  bankAccountId: string;
  ledgerAccountId: string;
  note?: string;
}) {
  const actor = await requireBackfillActor(true);
  if (!actor.permissions.includes("ADMIN") && !actor.permissions.includes("CLOSE")) {
    throw new Error("Ledger 계좌 매핑은 관리자 또는 마감 담당자만 할 수 있어.");
  }
  const { error } = await database().schema("finance").rpc("set_ledger_bank_account_mapping", {
    p_actor: actor.user_id,
    p_bank_account_id: input.bankAccountId,
    p_ledger_account_id: input.ledgerAccountId,
    p_note: input.note?.trim() ?? "",
    p_org: actor.organization_id,
    p_source_system: sourceSystem,
  });
  if (error) throw new Error(`Ledger 계좌 매핑에 실패했어: ${error.message}`);
  return loadLedgerBankBackfillStatus();
}
