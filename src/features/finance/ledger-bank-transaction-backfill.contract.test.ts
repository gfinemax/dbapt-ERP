import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20261104115954_ledger_bank_transaction_backfill.sql"), "utf8");
const auditActorMigration = readFileSync(resolve("supabase/migrations/20261104125055_ledger_bank_audit_auth_actor.sql"), "utf8");
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

  it("keeps imported-transaction detail reads inside the verified organization and source account", () => {
    expect(repository).toContain('from("ledger_bank_transaction_sources")');
    expect(repository).toContain('.eq("organization_id", actor.organization_id)');
    expect(repository).toContain('.eq("source_system", sourceSystem)');
    expect(repository).toContain('.eq("ledger_account_id", normalizedAccountId)');
    expect(repository).toContain('.eq("import_status", "IMPORTED")');
    expect(repository).toContain("source_transaction_id,payload_hash,payload,bank_transaction_id,imported_at");
  });

  it("records the authenticated finance actor without violating the legacy core-profile foreign key", () => {
    expect(auditActorMigration).toContain("auth_actor_id uuid references auth.users(id)");
    expect(auditActorMigration).toContain("normalize_ledger_bank_auth_actor");
    expect(auditActorMigration).toContain("new.actor_user_id:=null");
    expect(auditActorMigration).toContain("new.actor_label:=coalesce(new.actor_label,actor_name)");
  });
});
