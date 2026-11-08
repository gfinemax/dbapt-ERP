import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("ERP account subject master migration", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261108091002_erp_account_subject_master.sql"), "utf8");

  it("keeps ERP ownership, primary ordering and audit history in one atomic RPC", () => {
    expect(migration).toContain("add column if not exists is_primary boolean");
    expect(migration).toContain("create or replace function finance.manage_account_subject");
    expect(migration).toContain("actor := finance.workflow_actor(p_org, p_actor, 'ADMIN')");
    expect(migration).toContain("insert into finance.account_subject_audit_logs");
    expect(migration).toContain("next_action := case");
    expect(migration).toContain("'DEACTIVATE'");
    expect(migration).toContain("security invoker");
  });
});
