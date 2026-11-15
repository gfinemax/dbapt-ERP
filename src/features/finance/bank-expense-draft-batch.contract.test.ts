import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20261115150034_safe_bank_post_approval_batch_drafts.sql"), "utf8");
const detailStatusFix = readFileSync(resolve("supabase/migrations/20261116143000_fix_expense_detail_status_contract.sql"), "utf8");

describe("safe bank-post-approval draft batch migration", () => {
  it("builds a read-only manifest from authoritative source dates and stable UUIDs", () => {
    expect(migration).toContain("create or replace view finance.bank_expense_draft_manifest");
    expect(migration).toContain("nullif(b.raw_payload->>'transaction_date','')::date");
    expect(migration).toContain("account_subject_budget_links");
    expect(migration).toContain("expense_detail_items");
    expect(migration).toContain("recommendation_group_key");
    expect(migration).toContain("승인근거·증빙·세무 기준 확인 필요");
    expect(migration).toContain("revoke all on finance.bank_expense_draft_manifest from public, anon, authenticated");
  });

  it("saves one reviewed month atomically without approval, payment or vouchers", () => {
    expect(migration).toContain("create or replace function finance.legacy_expense_save_batch");
    expect(migration).toContain("perform pg_advisory_xact_lock");
    expect(migration).toContain("Validate the complete set before the first write");
    expect(migration).toContain("item->'expected'<>'null'::jsonb");
    expect(migration).toContain("rowdata->>'approval_status' is distinct from '작성중'");
    expect(migration).toContain("rowdata->>'payment_status' is distinct from '지급전'");
    expect(migration).toContain("rowdata->>'expense_kind' is distinct from 'BANK_POST_APPROVAL'");
    expect(migration).toContain("p_org,p_actor,'SAVE'");
    expect(migration).not.toContain("p_org,p_actor,'APPROVAL'");
    expect(migration).toContain("grant execute on function finance.legacy_expense_save_batch(uuid,uuid,jsonb,text,date) to service_role");
  });

  it("normalizes grouped links in both the trigger and processing view", () => {
    expect(migration).toContain("source_date:=coalesce(nullif(transaction.raw_payload->>'transaction_date','')::date");
    expect(migration).toContain("from finance.expense_resolution_bank_transactions l");
    expect(migration).toContain("create or replace view finance.bank_transaction_processing_status");
    expect(migration).toContain("when resolution.resolution_id is not null then '결의서 작성중'");
  });

  it("uses the actual confirmed expense-detail status in manifest and batch validation", () => {
    expect(detailStatusFix).toContain("detail.status='CONFIRMED'");
    expect(detailStatusFix).not.toContain("detail.status='ACTIVE'");
  });
});
