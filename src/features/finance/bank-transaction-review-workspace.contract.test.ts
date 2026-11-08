import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20261108120000_bank_transaction_review_workspace.sql",
), "utf8");

describe("bank transaction review workspace migration", () => {
  it("keeps source fields immutable and audits every review action", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("finance.workflow_actor(p_org, p_actor, 'ADMIN')");
    expect(migration).toContain("'NOTE'");
    expect(migration).toContain("bank_transaction_classification_audit_logs");
    expect(migration).toContain("'classification_note',saved.classification_note");
    expect(migration).toContain("grant execute on function finance.save_bank_transaction_review");
    expect(migration).not.toMatch(/set\s+(description|memo|uploaded_major_category)\s*=/i);
  });
});
