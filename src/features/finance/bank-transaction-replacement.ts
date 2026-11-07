import "server-only";

import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ParsedBankTransactionRow } from "./bank-transaction-import";
import { readSuppliedBankTransactionId, validateBankTransactionReplacementRows } from "./bank-transaction-import";
import { mapBankTransactionToInsert } from "./bank-transaction-repository";
import { requireReimbursementIdentity } from "./reimbursement-auth";

const sourceSystem = "dbapt-ledger";

export type BankTransactionReplacementPreview = {
  blocker_count: number;
  blockers: Record<string, number>;
  deposit_total: number;
  first_transaction_at: string | null;
  last_transaction_at: string | null;
  ledger_account_ids: string[];
  ready: boolean;
  target_count: number;
  withdrawal_total: number;
};

export type BankTransactionReplacementResult = {
  batch_id: string;
  replaced_count: number;
  replacement_count: number;
  replacement_deposit_total: number;
  replacement_withdrawal_total: number;
};

function database() {
  const db = getSupabaseServerClient();
  if (!db) throw new Error("ERP 저장소가 설정되지 않았어.");
  return db;
}

async function requireReplacementActor(write = false) {
  const actor = await requireReimbursementIdentity();
  const allowed = write
    ? actor.permissions.some((permission) => ["ADMIN", "CLOSE"].includes(permission))
    : actor.permissions.some((permission) => ["READ", "ADMIN", "CLOSE", "APPROVE", "PAY"].includes(permission));
  if (!actor.active || !allowed) throw new Error(write
    ? "은행 원장 교체는 관리자 또는 마감 담당자만 할 수 있어."
    : "은행 원장 교체 조회 권한이 필요해.");
  return actor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePreview(value: unknown): BankTransactionReplacementPreview {
  if (!isRecord(value) || !Array.isArray(value.ledger_account_ids) || !isRecord(value.blockers)) {
    throw new Error("교체 대상 원장 상태를 확인하지 못했어.");
  }
  return {
    blocker_count: Number(value.blocker_count ?? 0),
    blockers: Object.fromEntries(Object.entries(value.blockers).map(([key, count]) => [key, Number(count ?? 0)])),
    deposit_total: Number(value.deposit_total ?? 0),
    first_transaction_at: typeof value.first_transaction_at === "string" ? value.first_transaction_at : null,
    last_transaction_at: typeof value.last_transaction_at === "string" ? value.last_transaction_at : null,
    ledger_account_ids: value.ledger_account_ids.map(String),
    ready: value.ready === true,
    target_count: Number(value.target_count ?? 0),
    withdrawal_total: Number(value.withdrawal_total ?? 0),
  };
}

export async function loadBankTransactionReplacementPreview(bankAccountId: string) {
  const actor = await requireReplacementActor();
  const normalizedAccountId = bankAccountId.trim();
  if (!normalizedAccountId) throw new Error("교체할 ERP 계좌를 선택해줘.");
  const { data, error } = await database().schema("finance").rpc("preview_ledger_bank_replacement", {
    p_actor: actor.user_id,
    p_bank_account_id: normalizedAccountId,
    p_org: actor.organization_id,
    p_source_system: sourceSystem,
  });
  if (error) throw new Error(`교체 대상 원장을 확인하지 못했어: ${error.message}`);
  return parsePreview(data);
}

export async function applyBankTransactionReplacement(input: {
  bankAccountId: string;
  expectedOldCount: number;
  reason: string;
  rows: ParsedBankTransactionRow[];
}) {
  const actor = await requireReplacementActor(true);
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new Error("원장 교체 사유를 10자 이상 500자 이하로 입력해줘.");
  if (!Number.isSafeInteger(input.expectedOldCount) || input.expectedOldCount <= 0) {
    throw new Error("교체 대상 건수를 다시 확인해줘.");
  }
  if (!input.rows.length || input.rows.some((row) => row.bankAccountId !== input.bankAccountId)) {
    throw new Error("교체 파일과 선택한 계좌가 일치하는지 확인해줘.");
  }
  const validationErrors = validateBankTransactionReplacementRows(input.rows);
  if (validationErrors.length) throw new Error(validationErrors.slice(0, 3).join(" "));

  const rows = input.rows.map((row) => {
    const mapped = mapBankTransactionToInsert(row);
    const suppliedId = readSuppliedBankTransactionId(row.raw);
    const sourceTransactionId = `${row.bankAccountId}:${suppliedId}`;
    const payload = {
      balance_amount: mapped.balance_amount,
      bank_transaction_uid: mapped.bank_transaction_uid,
      branch_name: mapped.branch_name,
      counterparty: mapped.counterparty,
      deposit_amount: mapped.deposit_amount,
      description: mapped.description,
      match_status: mapped.match_status,
      memo: null,
      raw_payload: mapped.raw_payload,
      recommendation_reason: mapped.recommendation_reason,
      recommended_account_subject_id: mapped.recommended_account_subject_id,
      recommended_account_subject_name: mapped.recommended_account_subject_name,
      source_transaction_id: sourceTransactionId,
      transacted_at: mapped.transacted_at,
      transaction_kind: mapped.transaction_kind,
      uploaded_account_title: mapped.uploaded_account_title,
      uploaded_major_category: mapped.uploaded_major_category,
      withdrawal_amount: mapped.withdrawal_amount,
    };
    return {
      ...payload,
      payload_hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    };
  });
  const { data, error } = await database().schema("finance").rpc("apply_ledger_bank_replacement", {
    p_actor: actor.user_id,
    p_bank_account_id: input.bankAccountId,
    p_expected_old_count: input.expectedOldCount,
    p_org: actor.organization_id,
    p_reason: reason,
    p_rows: rows,
    p_source_system: sourceSystem,
  });
  if (error) throw new Error(`은행 원장을 교체하지 못했어: ${error.message}`);
  if (!isRecord(data)) throw new Error("은행 원장 교체 결과를 확인하지 못했어.");
  return {
    batch_id: String(data.batch_id ?? ""),
    replaced_count: Number(data.replaced_count ?? 0),
    replacement_count: Number(data.replacement_count ?? 0),
    replacement_deposit_total: Number(data.replacement_deposit_total ?? 0),
    replacement_withdrawal_total: Number(data.replacement_withdrawal_total ?? 0),
  } satisfies BankTransactionReplacementResult;
}
