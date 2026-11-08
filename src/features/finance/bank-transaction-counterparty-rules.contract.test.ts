import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("bank transaction counterparty rules migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20261108130000_bank_transaction_counterparty_rules.sql"),
    "utf8",
  );

  it("stores direction-aware administrator rules with separate audit history", () => {
    expect(migration).toContain("create table if not exists finance.bank_transaction_counterparty_rules");
    expect(migration).toContain("bank_tx_counterparty_rule_unique unique (organization_id,normalized_match_text,direction)");
    expect(migration).toContain("create table if not exists finance.bank_transaction_counterparty_rule_audit_logs");
    expect(migration).toContain("direction in ('DEPOSIT','WITHDRAWAL')");
  });

  it("previews and applies only exact normalized pending matches", () => {
    expect(migration).toContain("create or replace function finance.preview_bank_transaction_counterparty_rule");
    expect(migration).toContain("create or replace function finance.save_bank_transaction_review_rule");
    expect(migration).toContain("classification_status in ('UNREVIEWED','RECOMMENDED')");
    expect(migration).toContain("finance.normalize_bank_transaction_rule_key(finance.bank_transaction_effective_description(p_org,t.id))=normalized_key");
    expect(migration).toContain("p_scope in ('MATCHING','MATCHING_AND_FUTURE')");
  });

  it("auto-applies active future rules without exposing write functions to browser roles", () => {
    expect(migration).toContain("create trigger bank_transaction_counterparty_rule_on_insert");
    expect(migration).toContain("'AUTO_RULE_APPLY'");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("revoke all on function finance.save_bank_transaction_review_rule");
    expect(migration).toContain("grant execute on function finance.save_bank_transaction_review_rule");
  });
});
