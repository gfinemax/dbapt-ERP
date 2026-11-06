import { randomUUID } from "node:crypto";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";
import { reimbursementDb } from "./reimbursement-repository";
import { signLedgerRequest } from "./ledger-contribution-signature";

const sourceSystem = "dbapt-ledger";
const path = "/api/integrations/erp/external-contribution-recognitions";

export type LedgerExternalRecognitionSyncState = {
  last_cursor: number;
  last_synced_at: string | null;
  last_status: "NEVER" | "SUCCESS" | "PARTIAL" | "FAILED";
  last_error: string | null;
};

export type LedgerExternalRecognitionSyncIssue = {
  id: string;
  source_recognition_id: string;
  source_version: number;
  issue_code: "INVALID_PAYLOAD" | "UNKNOWN_ASSESSMENT" | "UNKNOWN_RECOGNITION" | "MEMBER_MISMATCH" | "EXCEEDS_ASSESSMENT";
  issue_detail: string;
  created_at: string;
};

export type LedgerExternalRecognitionSyncStatus = {
  state: LedgerExternalRecognitionSyncState | null;
  unresolved_issues: LedgerExternalRecognitionSyncIssue[];
  source_count: number;
};

type LedgerPage = {
  success: true;
  next_cursor: number;
  has_more: boolean;
  items: Record<string, unknown>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStatus(value: unknown): LedgerExternalRecognitionSyncStatus {
  if (!isRecord(value) || !Array.isArray(value.unresolved_issues) || !Number.isSafeInteger(Number(value.source_count ?? 0))) {
    throw new Error("외부 납입 인정 연동 상태를 확인하지 못했어.");
  }
  return {
    state: (value.state ?? null) as LedgerExternalRecognitionSyncState | null,
    unresolved_issues: value.unresolved_issues as LedgerExternalRecognitionSyncIssue[],
    source_count: Number(value.source_count ?? 0),
  };
}

async function requireSyncActor() {
  const member = await requireReimbursementIdentity();
  const allowed = ["ADMIN", "APPROVE", "CLOSE"].some((permission) =>
    hasReimbursementPermission(member, permission as ReimbursementPermission));
  if (!member.active || !allowed) throw new Error("외부 납입 인정 연동 권한이 필요해.");
  return member;
}

export async function loadLedgerExternalRecognitionSyncStatus(): Promise<LedgerExternalRecognitionSyncStatus> {
  const member = await requireReimbursementIdentity();
  const { data, error } = await reimbursementDb().schema("finance").rpc("ledger_external_recognition_sync_status", {
    p_org: member.organization_id,
    p_actor: member.user_id,
  });
  if (error) throw new Error(error.message);
  return parseStatus(data);
}

export async function syncLedgerExternalContributionRecognitions() {
  const member = await requireSyncActor();
  const baseUrl = process.env.LEDGER_INTEGRATION_URL?.trim().replace(/\/$/, "");
  const secret = process.env.LEDGER_INTEGRATION_SECRET?.trim();
  if (!baseUrl || !secret) throw new Error("Ledger 연동 환경설정이 필요해.");
  const status = await loadLedgerExternalRecognitionSyncStatus();
  let cursor = Number(status.state?.last_cursor ?? 0);
  let received = 0;
  let applied = 0;
  let reconciled = 0;
  let issues = 0;
  let unresolvedIssues = status.unresolved_issues.length;

  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const url = new URL(path, `${baseUrl}/`);
    url.searchParams.set("after_cursor", String(cursor));
    url.searchParams.set("limit", "200");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomUUID();
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "X-ERP-Timestamp": timestamp,
        "X-ERP-Nonce": nonce,
        "X-ERP-Signature": signLedgerRequest(secret, url, timestamp, nonce),
      },
    });
    if (!response.ok) throw new Error(`Ledger 외부 납입 인정 조회에 실패했어 (${response.status}).`);
    const value: unknown = await response.json();
    if (!isRecord(value) || value.success !== true || !Array.isArray(value.items)
      || !Number.isSafeInteger(value.next_cursor) || Number(value.next_cursor) < cursor
      || typeof value.has_more !== "boolean") {
      throw new Error("Ledger 외부 납입 인정 응답 형식을 확인해줘.");
    }
    const page = value as LedgerPage;
    const { data, error } = await reimbursementDb().schema("finance").rpc("sync_ledger_external_recognitions", {
      p_org: member.organization_id,
      p_actor: member.user_id,
      p_source_system: sourceSystem,
      p_from_cursor: cursor,
      p_next_cursor: page.next_cursor,
      p_items: page.items,
    });
    if (error) throw new Error(error.message);
    if (!isRecord(data)) throw new Error("외부 납입 인정 저장 결과를 확인하지 못했어.");
    received += Number(data.received_count ?? 0);
    applied += Number(data.applied_count ?? 0);
    reconciled += Number(data.reconciled_count ?? 0);
    issues += Number(data.issue_count ?? 0);
    unresolvedIssues = Number(data.unresolved_issue_count ?? 0);
    cursor = page.next_cursor;
    if (!page.has_more) {
      return {
        next_cursor: cursor,
        received_count: received,
        applied_count: applied,
        reconciled_count: reconciled,
        issue_count: issues,
        unresolved_issue_count: unresolvedIssues,
      };
    }
  }
  throw new Error("Ledger 외부 납입 인정 변경량이 많아 100페이지에서 멈췄어. 다시 실행하면 이어서 처리해.");
}
