import { createHash, randomUUID } from "node:crypto";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import { hasReimbursementPermission, type ReimbursementPermission } from "./reimbursement-domain";
import { reimbursementDb } from "./reimbursement-repository";
import { signLedgerRequest } from "./ledger-contribution-signature";

type FeedbackEvent = {
  event_id: number; event_type: "ALLOCATED" | "REVERSED"; source_assessment_id: string;
  erp_allocation_id: string; bank_transaction_id: string; external_member_id: string;
  amount: number; reason: string; occurred_at: string;
};

export async function pushLedgerAllocationFeedback() {
  const member = await requireReimbursementIdentity();
  const allowed = ["ADMIN", "PAY", "CLOSE", "APPROVE"].some((permission) =>
    hasReimbursementPermission(member, permission as ReimbursementPermission));
  if (!member.active || !allowed) throw new Error("수납 연동 권한이 필요해.");
  const baseUrl = process.env.LEDGER_INTEGRATION_URL?.trim().replace(/\/$/, "");
  const secret = process.env.LEDGER_INTEGRATION_SECRET?.trim();
  if (!baseUrl || !secret) throw new Error("ledger 연동 환경설정이 필요해.");
  let sent = 0;
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await reimbursementDb().schema("finance").rpc("ledger_allocation_feedback_batch", {
      p_org: member.organization_id, p_actor: member.user_id, p_limit: 200,
    });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("수납 연동 대기열을 확인하지 못했어.");
    const events = data as FeedbackEvent[];
    if (!events.length) return { sent_count: sent };
    const body = JSON.stringify({ events });
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const url = new URL("/api/integrations/erp/receipt-allocations", `${baseUrl}/`);
    const timestamp = String(Math.floor(Date.now() / 1000)); const nonce = randomUUID();
    const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      body, headers: { "Content-Type": "application/json", "X-ERP-Timestamp": timestamp,
        "X-ERP-Nonce": nonce, "X-ERP-Signature": signLedgerRequest(secret,url,timestamp,nonce,"POST",bodyHash) } });
    if (!response.ok) throw new Error(`ledger 수납 피드백 실패 (${response.status})`);
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !Array.isArray((result as { accepted_event_ids?: unknown }).accepted_event_ids))
      throw new Error("ledger 수납 피드백 응답을 확인하지 못했어.");
    const eventIds = events.map((event) => event.event_id);
    const ack = await reimbursementDb().schema("finance").rpc("ledger_allocation_feedback_ack", {
      p_org: member.organization_id, p_actor: member.user_id, p_event_ids: eventIds,
    });
    if (ack.error) throw new Error(ack.error.message);
    sent += events.length;
    if (events.length < 200) return { sent_count: sent };
  }
  throw new Error("수납 피드백이 많아 100페이지에서 멈춰어. 다시 실행해줘.");
}
