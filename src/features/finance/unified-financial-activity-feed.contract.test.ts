import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20261108140109_unified_financial_activity_feed.sql"),
  "utf8",
);

describe("unified financial activity feed migration", () => {
  it("keeps external recognitions separate from immutable bank transactions", () => {
    expect(migration).toContain("create or replace view finance.financial_activity_feed");
    expect(migration).toContain("with (security_invoker=true)");
    expect(migration).toContain("from finance.bank_transactions b");
    expect(migration).toContain("from finance.collection_external_recognitions x");
    expect(migration).toContain("'EXTERNAL_RECOGNITION'::text as origin_type");
    expect(migration).toContain("'NON_CASH_RECOGNITION'");
    expect(migration).not.toMatch(/insert\s+into\s+finance\.bank_transactions/i);
    expect(migration).not.toMatch(/update\s+finance\.bank_transactions/i);
    expect(migration).not.toMatch(/delete\s+from\s+finance\.bank_transactions/i);
  });

  it("publishes separate cash, loss and trust totals", () => {
    expect(migration).toContain("create or replace function finance.financial_activity_summary");
    expect(migration).toContain("'bank_deposit_total'");
    expect(migration).toContain("'bank_withdrawal_total'");
    expect(migration).toContain("'external_recognition_total'");
    expect(migration).toContain("'confirmed_loss_total'");
    expect(migration).toContain("'trust_held_total'");
  });
});
