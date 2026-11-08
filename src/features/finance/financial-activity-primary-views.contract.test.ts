import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("financial activity primary views migration", () => {
  it("combines review statuses and source reconciliation without changing original transactions", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20261108144912_add_financial_activity_primary_views.sql"), "utf8");

    expect(sql).toContain("security invoker");
    expect(sql).toContain("p_review_required boolean default false");
    expect(sql).toContain("classification_status in ('UNREVIEWED','DEFERRED')");
    expect(sql).toContain("source_record_id=any(p_source_record_ids)");
    expect(sql).toContain("origin_type='BANK_TRANSACTION'");
    expect(sql).not.toMatch(/insert\s+into\s+finance\.bank_transactions/i);
    expect(sql).not.toMatch(/update\s+finance\.bank_transactions/i);
    expect(sql).not.toMatch(/delete\s+from\s+finance\.bank_transactions/i);
  });
});
