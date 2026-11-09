import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20261109133100_fixed_certificate_account_assignment.sql",
), "utf8");

describe("fixed certificate account assignment migration", () => {
  it("preserves source recognitions and records classifications in a separate immutable ledger", () => {
    expect(migration).toContain("create table finance.fixed_certificate_account_assignments");
    expect(migration).toContain("fixed_certificate_assignments_immutable");
    expect(migration).not.toMatch(/update\s+finance\.collection_external_recognitions/i);
    expect(migration).not.toMatch(/insert\s+into\s+finance\.(bank_transactions|collection_assessments|vouchers)/i);
  });

  it("requires exactly 137 sources, 116 contribution matches, 21 suspense rows, and no stale source", () => {
    expect(migration).toContain("fixed_count<>137");
    expect(migration).toContain("matched_count<>116");
    expect(migration).toContain("'contribution_count',116,'suspense_count',21");
    expect(migration).toContain("unresolved_count<>0 or stale_count<>0");
    expect(migration).toContain("x.source_version is distinct from r.source_version");
  });

  it("resolves active account subjects by name and keeps cancelled rows out of current totals", () => {
    expect(migration).toContain("s.is_active and s.name='분담금'");
    expect(migration).toContain("s.is_active and s.name='가수금'");
    expect(migration).toContain("a.assignment_category='CONTRIBUTION' and x.status='ACTIVE'");
    expect(migration).toContain("a.assignment_category='SUSPENSE' and x.status='ACTIVE'");
  });

  it("limits tables and RPCs to the service role with RLS enabled", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path=''\n");
  });
});
