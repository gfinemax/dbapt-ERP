import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20261109135851_fixed_certificate_activity_account_subject.sql",
), "utf8");

describe("fixed certificate account subjects in financial activity", () => {
  it("projects only applied assignments into the unified activity account subject", () => {
    expect(migration).toContain("create or replace view finance.financial_activity_feed");
    expect(migration).toContain("with (security_invoker=true)");
    expect(migration).toContain("batch.status='APPLIED'");
    expect(migration).toContain("assignment.account_subject_id as confirmed_account_subject_id");
    expect(migration).toContain("coalesce(subject.name,case x.accounting_treatment");
    expect(migration).not.toContain("bank_transaction_effective_detail");
  });

  it("matches by stable root recognition ID and preserves every source table", () => {
    expect(migration).toContain("a.source_root_recognition_id=coalesce(x.source_root_recognition_id,x.source_recognition_id)");
    expect(migration).not.toMatch(/update\s+finance\./i);
    expect(migration).not.toMatch(/insert\s+into\s+finance\./i);
  });

  it("keeps the view private to the service role", () => {
    expect(migration).toContain("revoke all on finance.financial_activity_feed from public,anon,authenticated");
    expect(migration).toContain("grant select on finance.financial_activity_feed to service_role");
  });
});
