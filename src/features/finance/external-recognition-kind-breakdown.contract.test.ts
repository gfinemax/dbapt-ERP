import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("external recognition kind breakdown migration", () => {
  it("separates fixed certificates only by source kind and excludes cancelled amounts", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20261109130532_external_recognition_kind_breakdown.sql"), "utf8");

    expect(sql).toContain("create or replace function finance.external_recognition_breakdown");
    expect(sql).toContain("source_kind='dongil_fixed_certificate'");
    expect(sql).toContain("source_kind is distinct from 'dongil_fixed_certificate'");
    expect(sql).toContain("recognition_status='ACTIVE'");
    expect(sql).toContain("'all_row_count',count(*)");
    expect(sql).toContain("'fixed_total'");
    expect(sql).toContain("'general_total'");
    expect(sql).not.toMatch(/activity_amount\s*=\s*30000000/i);
    expect(sql).not.toMatch(/insert\s+into\s+finance\.collection_external_recognitions/i);
    expect(sql).not.toMatch(/update\s+finance\.collection_external_recognitions/i);
  });

  it("keeps the selected kind in full filtered totals", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20261109130532_external_recognition_kind_breakdown.sql"), "utf8");

    expect(sql).toContain("p_external_recognition_kind text default null");
    expect(sql).toContain("p_external_recognition_kind='FIXED_CERTIFICATE'");
    expect(sql).toContain("p_external_recognition_kind='GENERAL'");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path=''");
    expect(sql).toContain("grant execute on function finance.external_recognition_breakdown");
  });

  it("applies the same source-kind rule to list and status queries", async () => {
    const repository = await readFile(path.join(process.cwd(), "src/features/finance/bank-transaction-repository.ts"), "utf8");

    expect(repository.match(/\.eq\("source_kind", "dongil_fixed_certificate"\)/g)).toHaveLength(2);
    expect(repository.match(/\.neq\("source_kind", "dongil_fixed_certificate"\)/g)).toHaveLength(2);
    expect(repository).not.toMatch(/amount.*30000000/i);
  });
});
