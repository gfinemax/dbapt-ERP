import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108083000_revert_sheet_replacement_to_metadata_classification.sql"),
  "utf8",
);
const auditMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108091000_metadata_correction_audit_actor.sql"),
  "utf8",
);
const indexMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261108091500_metadata_import_fk_indexes.sql"),
  "utf8",
);

describe("bank transaction metadata correction contract", () => {
  it("restores the original transaction IDs and records sheet categories separately", () => {
    expect(migration).toContain("create table if not exists finance.bank_transaction_metadata_imports");
    expect(migration).toContain("update finance.bank_transactions set\n      deleted_at=null,superseded_by_batch_id=null");
    expect(migration).toContain("recommended_account_subject_name=m.source_value");
    expect(migration).toContain("classification_status='RECOMMENDED'");
    expect(migration).not.toContain("uploaded_major_category=m.source_value");
  });

  it("keeps ambiguous duplicate classifications under manual review", () => {
    expect(migration).toContain("when n.category_variants>1 then 'REVIEW_REQUIRED'");
    expect(migration).toContain("classification_status='DEFERRED'");
    expect(migration).toContain("구글시트 중복 거래의 항목구분이 달라 수동 검토 필요");
  });

  it("preserves an auditable rollback path and restricts execution", () => {
    expect(migration).toContain("BANK_REPLACEMENTS_REVERTED_TO_METADATA");
    expect(migration).toContain("current_setting('app.bank_replacement_rollback',true)='on'");
    expect(migration).toContain("grant execute on function finance.revert_bank_replacements_to_metadata_classification");
    expect(migration).toContain("to service_role");
    expect(auditMigration).toContain("BANK_REPLACEMENTS_REVERTED_TO_METADATA");
    expect(auditMigration).toContain("audit.normalize_ledger_bank_auth_actor()");
    expect(indexMigration).toContain("bank_transaction_metadata_import_bank_transaction_fk_idx");
    expect(indexMigration).toContain("bank_transaction_metadata_import_replacement_batch_fk_idx");
  });
});
