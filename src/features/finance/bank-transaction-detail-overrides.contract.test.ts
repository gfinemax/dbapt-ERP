import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20261109120101_bank_transaction_detail_overrides.sql",
), "utf8");
const singleDetailMigration = readFileSync(resolve(
  "supabase/migrations/20261109122332_single_bank_transaction_detail.sql",
), "utf8");

describe("bank transaction detail override migration", () => {
  it("keeps bank source rows immutable and stores append-only display corrections", () => {
    expect(migration).toContain("create table if not exists finance.bank_transaction_detail_overrides");
    expect(migration).toContain("previous_value text not null");
    expect(migration).toContain("field_name in ('UPLOADED_CATEGORY','UPLOADED_ACCOUNT_TITLE','MEMO','BRANCH_NAME')");
    expect(migration).not.toMatch(/update\s+finance\.bank_transactions/i);
  });

  it("requires administrator authority, a reason and a shared audit record", () => {
    expect(migration).toContain("finance.workflow_actor(p_org,p_actor,'ADMIN')");
    expect(migration).toContain("BANK_TRANSACTION_DETAIL_OVERRIDE");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("revoke all on function finance.save_bank_transaction_detail_overrides");
    expect(migration).toContain("grant execute on function finance.save_bank_transaction_detail_overrides");
  });

  it("adds one searchable ERP transaction-detail value without rewriting source rows", () => {
    expect(singleDetailMigration).toContain("'TRANSACTION_DETAIL'");
    expect(singleDetailMigration).toContain("finance.bank_transaction_effective_detail");
    expect(singleDetailMigration).toContain("finance.search_bank_transaction_detail_ids");
    expect(singleDetailMigration).toContain("as transaction_detail");
    expect(singleDetailMigration).toContain("coalesce(f.transaction_detail,'') ilike");
    expect(singleDetailMigration).not.toMatch(/update\s+finance\.bank_transactions/i);
  });
});
