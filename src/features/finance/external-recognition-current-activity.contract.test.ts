import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("current external recognition activity", () => {
  it("keeps cancelled originals in the ledger but removes them from current financial activity", async () => {
    const sql = await readFile(path.join(
      process.cwd(),
      "supabase/migrations/20261118094500_exclude_cancelled_external_recognitions_from_current_activity.sql",
    ), "utf8");

    expect(sql).toContain("create or replace view finance.financial_activity_feed");
    expect(sql).toContain("from finance.collection_external_recognitions x");
    expect(sql).toContain("where x.status='ACTIVE'");
    expect(sql).toContain("with (security_invoker=true)");
    expect(sql).not.toMatch(/delete\s+from\s+finance\.collection_external_recognitions/i);
    expect(sql).not.toMatch(/update\s+finance\.collection_external_recognitions/i);
  });
});
