import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("bank transaction export audit migration", () => {
  it("stores filters, selected columns, totals, and actor identity under RLS", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20261108213000_bank_transaction_export_audit_logs.sql"), "utf8");
    expect(sql).toContain("bank_transaction_export_audit_logs");
    expect(sql).toContain("selected_columns text[] not null");
    expect(sql).toContain("filters jsonb not null");
    expect(sql).toContain("deposit_total bigint not null");
    expect(sql).toContain("withdrawal_total bigint not null");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("to service_role");
  });
});
