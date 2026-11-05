import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261105124753_ledger_bank_subject_rules.sql"), "utf8");

describe("Ledger bank subject rule migration", () => {
  it("keeps rules organization-scoped, audited, and recommendation-only", () => {
    expect(migration).toContain("unique (organization_id,source_system,match_type,source_key,direction)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("ledger_bank_subject_rule_audit_logs");
    expect(migration).toContain("classification_status='RECOMMENDED'");
    expect(migration).toContain("confirmed_account_subject_id is null");
    expect(migration).not.toContain("set confirmed_account_subject_id=subject_row.id");
  });

  it("suppresses transfer and review rules from automatic account recommendations", () => {
    expect(migration).toContain("rule_status in ('CONFIRMED','POLICY_REVIEW','TRANSFER')");
    expect(migration).toContain("if status_value='CONFIRMED' then");
  });
});
