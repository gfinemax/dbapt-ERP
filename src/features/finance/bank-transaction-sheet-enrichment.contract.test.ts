import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108005621_bank_transaction_sheet_enrichment.sql"),
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
});
