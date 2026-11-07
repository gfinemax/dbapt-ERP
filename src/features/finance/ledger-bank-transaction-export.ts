import "server-only";

import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { verifyLedgerIntegrationRequest } from "./ledger-bank-transaction-export-signature";

const maximumPageSize = 500;

type ExportEventRow = {
  event_id: number | string;
  event_type: "UPSERT" | "CANCEL";
  payload: Record<string, unknown>;
};

function database() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("ERP 저장소가 설정되지 않았어.");
  return db;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function resolveOrganizationId() {
  const organizationId = process.env.LEDGER_EXPORT_ORGANIZATION_ID?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    throw new Error("Ledger로 내보낼 ERP 조합 ID 환경설정이 필요해.");
  }
  return organizationId.toLowerCase();
}

async function consumeNonce(nonce: string, requestTimestamp: number) {
  const db = database().schema("finance");
  const cutoff = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
  const { error: cleanupError } = await db.from("ledger_bank_transaction_request_nonces")
    .delete().lt("used_at", cutoff);
  if (cleanupError) throw new Error(`Ledger 연동 nonce 정리에 실패했어: ${cleanupError.message}`);
  const { error } = await db.from("ledger_bank_transaction_request_nonces")
    .insert({ nonce, request_timestamp: requestTimestamp });
  if (error?.code === "23505") throw new Error("replayed integration request");
  if (error) throw new Error(`Ledger 연동 nonce 저장에 실패했어: ${error.message}`);
}

export async function exportBankTransactionsForLedger(request: Request) {
  const secret = process.env.LEDGER_INTEGRATION_SECRET?.trim();
  if (!secret) throw new Error("Ledger 연동 환경설정이 필요해.");
  const url = new URL(request.url);
  const verified = verifyLedgerIntegrationRequest({
    headers: request.headers,
    method: request.method,
    path: url.pathname,
    query: url.search.slice(1),
    secret,
  });
  await consumeNonce(verified.nonce, verified.requestTimestamp);

  const afterCursor = Number(url.searchParams.get("after_cursor") ?? "0");
  const requestedLimit = Number(url.searchParams.get("limit") ?? "200");
  if (!Number.isSafeInteger(afterCursor) || afterCursor < 0) throw new Error("after_cursor를 확인해줘.");
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) throw new Error("limit을 확인해줘.");
  const pageSize = Math.min(requestedLimit, maximumPageSize);
  const organizationId = resolveOrganizationId();
  const { data, error } = await database().schema("finance")
    .from("ledger_bank_transaction_export_outbox")
    .select("event_id,event_type,payload")
    .eq("organization_id", organizationId)
    .gt("event_id", afterCursor)
    .order("event_id", { ascending: true })
    .limit(pageSize + 1);
  if (error) throw new Error(`ERP 통장거래를 불러오지 못했어: ${error.message}`);
  const rows = (data ?? []) as ExportEventRow[];
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const items = page.map((row) => {
    const cursor = Number(row.event_id);
    if (!Number.isSafeInteger(cursor) || cursor <= 0) throw new Error("ERP 통장거래 커서를 확인해줘.");
    const unsigned = {
      ...row.payload,
      cursor,
      event_type: row.event_type,
      source_version: cursor,
    };
    return {
      ...unsigned,
      payload_hash: createHash("sha256").update(stableJson(unsigned)).digest("hex"),
    };
  });
  return {
    generated_at: new Date().toISOString(),
    has_more: hasMore,
    items,
    next_cursor: items.length ? items.at(-1)!.cursor : afterCursor,
    source_authority: "dbapt-erp",
    success: true as const,
  };
}
