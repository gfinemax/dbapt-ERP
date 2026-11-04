import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20261104115954_ledger_bank_transaction_backfill.sql"), "utf8");
const repository = readFileSync(resolve("src/features/finance/ledger-bank-transaction-backfill.ts"), "utf8");

describe("ledger bank transaction backfill contracts", () => {
  it("keeps provenance, explicit account mappings, review states, and immutable source fields", () => {
    expect(migration).toContain("ledger_bank_account_mappings");
    expect(migration).toContain("bank_transactions_source_uidx");
    expect(migration).toContain("source_readonly");
    expect(migration).toContain("guard_ledger_imported_bank_transaction");
    expect(migration).toContain("'UNRESOLVED','UNREVIEWED'");
    expect(migration).toContain("LEDGER_BANK_ACCOUNT_MAP");
    expect(migration).toContain("LEDGER_BANK_BACKFILL_SYNC");
  });

  it("uses the signed cursor API in bounded pages", () => {
    expect(repository).toContain('const path = "/api/integrations/erp/bank-transactions"');
    expect(repository).toContain("const pageSize = 200");
    expect(repository).toContain("const maxPagesPerRun = 5");
    expect(repository).toContain("signLedgerRequest(secret, url, timestamp, nonce)");
    expect(repository).toContain("if (!page.source_frozen)");
  });
});
