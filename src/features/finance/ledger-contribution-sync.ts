import { randomUUID } from "node:crypto";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";
import { reimbursementDb } from "./reimbursement-repository";
import { signLedgerRequest } from "./ledger-contribution-signature";

const sourceSystem = "dbapt-ledger";
const path = "/api/integrations/erp/contribution-assessments";

export type LedgerContributionSyncState = {
  last_cursor: number;
  last_synced_at: string | null;
  last_status: "NEVER" | "SUCCESS" | "PARTIAL" | "FAILED";
  last_error: string | null;
};
export type LedgerContributionSyncIssue = {
  id: string; source_assessment_id: string; source_version: number;
  issue_code: "MISSING_EXTERNAL_MEMBER_ID" | "INVALID_PAYLOAD";
  issue_detail: string; created_at: string;
};
export type LedgerContributionSyncStatus = {
  state: LedgerContributionSyncState | null;
  unresolved_issues: LedgerContributionSyncIssue[];
  sources: { id: string; source_system: string; source_assessment_id: string }[];
};
type LedgerPage = { success: true; next_cursor: number; has_more: boolean; items: Record<string, unknown>[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStatus(value: unknown): LedgerContributionSyncStatus {
  if (!record(value) || !Array.isArray(value.unresolved_issues)) throw new Error("분담금 연동 상태를 확인하지 못했어.");
  return { state: (value.state ?? null) as LedgerContributionSyncState | null,
    unresolved_issues: value.unresolved_issues as LedgerContributionSyncIssue[],
    sources: Array.isArray(value.sources) ? value.sources as LedgerContributionSyncStatus["sources"] : [] };
}

async function requireSyncActor() {
  const member = await requireReimbursementIdentity();
  const allowed = ["ADMIN", "APPROVE", "CLOSE"].some((permission) =>
    hasReimbursementPermission(member, permission as ReimbursementPermission));
  if (!member.active || !allowed) throw new Error("분담금 연동 권한이 필요해.");
  return member;
}

export async function loadLedgerContributionSyncStatus(): Promise<LedgerContributionSyncStatus> {
  const member = await requireReimbursementIdentity();
  const { data, error } = await reimbursementDb().schema("finance").rpc("ledger_contribution_sync_status", {
    p_org: member.organization_id, p_actor: member.user_id,
  });
  if (error) throw new Error(error.message);
  return parseStatus(data);
}

export async function syncLedgerContributionAssessments() {
  const member = await requireSyncActor();
  const baseUrl = process.env.LEDGER_INTEGRATION_URL?.trim().replace(/\/$/, "");
  const secret = process.env.LEDGER_INTEGRATION_SECRET?.trim();
  if (!baseUrl || !secret) throw new Error("LEDGER_INTEGRATION_URL과 LEDGER_INTEGRATION_SECRET 설정이 필요해.");
  const status = await loadLedgerContributionSyncStatus();
  let cursor = Number(status.state?.last_cursor ?? 0);
  let received = 0; let applied = 0; let issues = 0;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const url = new URL(path, `${baseUrl}/`);
    url.searchParams.set("after_cursor", String(cursor));
    url.searchParams.set("limit", "200");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomUUID();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: {
      "X-ERP-Timestamp": timestamp, "X-ERP-Nonce": nonce,
      "X-ERP-Signature": signLedgerRequest(secret, url, timestamp, nonce),
    }});
    if (!response.ok) throw new Error(`ledger 분담금 조회 실패 (${response.status})`);
    const page: unknown = await response.json();
    if (!record(page) || page.success !== true || !Array.isArray(page.items)
        || !Number.isSafeInteger(page.next_cursor) || Number(page.next_cursor) < cursor
        || typeof page.has_more !== "boolean") throw new Error("ledger 분담금 응답 형식을 확인해줘.");
    const typed = page as LedgerPage;
    const { data, error } = await reimbursementDb().schema("finance").rpc("sync_ledger_contribution_assessments", {
      p_org: member.organization_id, p_actor: member.user_id, p_source_system: sourceSystem,
      p_from_cursor: cursor, p_next_cursor: typed.next_cursor, p_items: typed.items,
    });
    if (error) throw new Error(error.message);
    if (!record(data)) throw new Error("분담금 연동 결과를 확인하지 못했어.");
    received += Number(data.received_count ?? 0); applied += Number(data.applied_count ?? 0); issues += Number(data.issue_count ?? 0);
    cursor = typed.next_cursor;
    if (!typed.has_more) return { next_cursor: cursor, received_count: received, applied_count: applied, issue_count: issues };
  }
  throw new Error("분담금 변경량이 많아 100페이지에서 멈춰어. 다시 실행하면 이어서 처리해.");
}
