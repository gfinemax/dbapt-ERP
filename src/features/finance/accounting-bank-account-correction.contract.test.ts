import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("accounting bank account correction migration", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261114102220_accounting_bank_account_correction.sql"), "utf8");
  const indexes = readFileSync(join(process.cwd(), "supabase/migrations/20261114103143_accounting_bank_account_link_indexes.sql"), "utf8");

  it("links bank accounts and account subjects by stable IDs", () => {
    expect(migration).toContain("create table finance.bank_account_subject_links");
    expect(migration).toContain("bank_account_id uuid primary key");
    expect(migration).toContain("account_subject_id uuid not null");
    expect(indexes).toContain("bank_account_subject_links_subject_idx");
    expect(indexes).toContain("bank_account_subject_links_created_by_idx");
    expect(indexes).toContain("bank_account_subject_links_updated_by_idx");
  });

  it("keeps all writes service-only and verifies the authenticated workflow actor", () => {
    expect(migration).toContain("perform finance.workflow_actor(p_org, p_actor, 'ADMIN')");
    expect(migration).toContain("perform finance.workflow_actor(p_org, p_actor, 'APPROVE')");
    expect(migration).toContain("revoke all on function finance.accounting_correct_voucher_accounts");
    expect(migration).toContain("grant execute on function finance.accounting_correct_voucher_accounts(uuid, uuid, jsonb, text) to service_role");
  });

  it("records before and after values and changes only account assignments", () => {
    expect(migration).toContain("'ACCOUNTING_ACCOUNT_CORRECTION'");
    expect(migration).toContain("'lines', (select coalesce(jsonb_agg(to_jsonb(line)");
    expect(migration).toContain("set account_subject_id = case when debit_amount > 0");
    expect(migration).not.toContain("set debit_amount =");
    expect(migration).not.toContain("set credit_amount =");
  });
});
