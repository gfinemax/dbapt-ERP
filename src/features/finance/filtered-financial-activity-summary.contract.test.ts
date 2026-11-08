import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("filtered financial activity summary migration", () => {
  it("aggregates the full filtered result while keeping cash and external recognition separate", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20261108143212_add_filtered_financial_activity_summary.sql"), "utf8");

    expect(sql).toContain("security invoker");
    expect(sql).toContain("from finance.financial_activity_feed");
    expect(sql).toContain("bank_deposit_total");
    expect(sql).toContain("bank_withdrawal_total");
    expect(sql).toContain("external_recognition_total");
    expect(sql).toContain("recognition_status='ACTIVE'");
    expect(sql).not.toMatch(/insert\s+into\s+finance\.bank_transactions/i);
    expect(sql).not.toMatch(/update\s+finance\.bank_transactions/i);
    expect(sql).not.toMatch(/delete\s+from\s+finance\.bank_transactions/i);
  });
});
