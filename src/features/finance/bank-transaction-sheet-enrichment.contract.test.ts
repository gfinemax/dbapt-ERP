import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108005621_bank_transaction_sheet_enrichment.sql"),
  "utf8",
);
const overrideMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108093000_bank_transaction_sheet_field_overrides.sql"),
  "utf8",
);
const permissionMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108110000_allow_sheet_batch_summary_update.sql"),
  "utf8",
);

describe("bank transaction sheet enrichment contract", () => {
  it("keeps matched transaction IDs and inserts only missing source rows", () => {
    expect(migration).toContain("create or replace function finance.apply_bank_transaction_sheet_enrichment");
    expect(migration).toContain("matched_bank_transaction_id");
    expect(migration).toContain("matched_count+inserted_count<>source_count");
    expect(migration).toContain("source_readonly,source_imported_at");
  });

  it("is idempotent by source document, sheet and payload", () => {
    expect(migration).toContain("source_document_id,source_sheet,source_hash");
    expect(migration).toContain("'already_applied',true");
    expect(migration).toContain("'SHEET:'||trim(p_source_document_id)");
  });

  it("indexes foreign-key lookup paths", () => {
    expect(migration).toContain("bank_transaction_sheet_import_batches_bank_account_fk_idx");
    expect(migration).toContain("bank_transaction_sheet_import_batches_imported_by_fk_idx");
    expect(migration).toContain("bank_transaction_sheet_import_rows_transaction_idx");
  });

  it("preserves date-only evidence and writes an audit record", () => {
    expect(migration).toContain("'transaction_time_precision'");
    expect(migration).toContain("'DATE'");
    expect(migration).toContain("'BANK_SHEET_ENRICHED'");
    expect(migration).toContain("DATE_ONLY_CONFIRMED");
  });

  it("stores sheet corrections separately without mutating Ledger source fields", () => {
    expect(overrideMigration).toContain("create table if not exists finance.bank_transaction_sheet_field_overrides");
    expect(overrideMigration).toContain("'ACCOUNT_CATEGORY','DESCRIPTION','MEMO'");
    expect(overrideMigration).toContain("existing_transaction.description");
    expect(overrideMigration).toContain("existing_transaction.memo");
    expect(overrideMigration).not.toContain("set description=description_value");
    expect(overrideMigration).not.toContain("set memo=memo_value");
  });

  it("keeps zero-value evidence and manual matching auditable", () => {
    expect(overrideMigration).toContain("'MATCHED','INSERTED','SKIPPED_ZERO'");
    expect(overrideMigration).toContain("'EXACT','MANUAL_CONFIRMED','DATE_ONLY_CONFIRMED','NEW','ZERO_AMOUNT'");
    expect(overrideMigration).toContain("matched_count + inserted_count + skipped_count = source_row_count");
    expect(overrideMigration).toContain("'manual_match_count',manual_match_count");
  });

  it("keeps the RPC server-only and security-invoker", () => {
    expect(overrideMigration).toContain("security invoker");
    expect(overrideMigration).toContain("revoke all on finance.bank_transaction_sheet_field_overrides from public,anon,authenticated");
    expect(overrideMigration).toContain("grant execute on function finance.apply_bank_transaction_sheet_enrichment");
    expect(overrideMigration).toContain("to service_role");
  });

  it("lets the service role update the applied batch summary", () => {
    expect(permissionMigration).toContain(
      "grant update on finance.bank_transaction_sheet_import_batches to service_role",
    );
  });
});
