import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("expense resolution multi-bank links", () => {
  it("keeps every bank withdrawal linked to a grouped expense resolution", async () => {
    const migration = await readFile(
      path.join(process.cwd(), "supabase/migrations/20261112044153_expense_resolution_multi_bank_links.sql"),
      "utf8",
    );
    expect(migration).toContain("expense_resolution_bank_transactions");
    expect(migration).toContain("연결 통장거래 합계가 지출결의 총액과 다릅니다");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("to service_role");
  });

  it("shows grouped resolution links in the bank transaction downstream status", async () => {
    const repository = await readFile(
      path.join(process.cwd(), "src/features/finance/bank-transaction-repository.ts"),
      "utf8",
    );
    expect(repository).toContain('.from("expense_resolution_bank_transactions")');
    expect(repository).toContain('add(transactionId, "지출결의")');
  });
});
