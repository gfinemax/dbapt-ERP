import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20261107144327_ledger_bank_transaction_export.sql"), "utf8");
const repository = readFileSync(resolve("src/features/finance/ledger-bank-transaction-export.ts"), "utf8");
const route = readFileSync(resolve("src/app/api/integrations/ledger/bank-transactions/route.ts"), "utf8");

describe("ERP bank transaction export contract", () => {
  it("keeps ERP-owned transactions in an immutable cursor outbox", () => {
    expect(migration).toContain("create table finance.ledger_bank_transaction_export_outbox");
    expect(migration).toContain("create table finance.ledger_bank_transaction_request_nonces");
    expect(migration).toContain("coalesce(transaction_row.source_system,'')<>'dbapt-ledger'");
    expect(migration).toContain("after insert or update or delete on finance.bank_transactions");
    expect(repository).toContain('.schema("finance")');
  });

  it("requires a signed request and returns stable source identifiers", () => {
    expect(route).toContain("exportBankTransactionsForLedger");
    expect(repository).toContain("verifyLedgerIntegrationRequest");
    expect(repository).toContain("LEDGER_EXPORT_ORGANIZATION_ID");
    expect(repository).not.toContain('.schema("core")');
    expect(repository).toContain('source_authority: "dbapt-erp"');
    expect(repository).toContain("payload_hash");
    expect(repository).toContain("next_cursor");
  });
});
