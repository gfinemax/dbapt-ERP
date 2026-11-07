import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261107101258_safe_bank_transaction_replacement.sql"),
  "utf8",
);
const repository = fs.readFileSync(
  path.join(root, "src/features/finance/bank-transaction-replacement.ts"),
  "utf8",
);
const supersededGuard = fs.readFileSync(
  path.join(root, "supabase/migrations/20261107102957_preserve_superseded_ledger_bank_sources.sql"),
  "utf8",
);
const incompleteMetadata = fs.readFileSync(
  path.join(root, "supabase/migrations/20261107105455_allow_incomplete_bank_statement_metadata.sql"),
  "utf8",
);
const unambiguousItemAlias = fs.readFileSync(
  path.join(root, "supabase/migrations/20261107110218_fix_bank_replacement_item_alias.sql"),
  "utf8",
);
const auditAuthActor = fs.readFileSync(
  path.join(root, "supabase/migrations/20261107110425_bank_replacement_audit_auth_actor.sql"),
  "utf8",
);
const replacementSourceLinks = fs.readFileSync(
  path.join(root, "supabase/migrations/20261107122500_restore_replacement_source_links.sql"),
  "utf8",
);

describe("safe bank ledger replacement contract", () => {
  it("preserves the old ledger rows and records a single audited replacement batch", () => {
    expect(migration).toContain("create table finance.bank_transaction_replacement_batches");
    expect(migration).toContain("superseded_by_batch_id=batch_id");
    expect(migration).toContain("import_status='SUPERSEDED'");
    expect(migration).toContain("'BANK_LEDGER_REPLACED'");
    expect(migration).not.toMatch(/delete\s+from\s+finance\.bank_transactions/i);
  });

  it("blocks replacement when the target count changed or downstream records are linked", () => {
    expect(migration).toContain("'blocker_count',blocker_count");
    expect(migration).toContain("if not coalesce((preview->>'ready')::boolean,false)");
    expect(migration).toContain("if (preview->>'target_count')::integer<>p_expected_old_count");
    expect(migration).toContain("for update of s,t");
  });

  it("keeps both RPCs server-only and requires an authorized ERP actor", () => {
    expect(migration).toContain("security invoker set search_path='' ");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role");
    expect(repository).toContain('schema("finance").rpc("preview_ledger_bank_replacement"');
    expect(repository).toContain('schema("finance").rpc("apply_ledger_bank_replacement"');
    expect(repository).toContain('["ADMIN", "CLOSE"]');
  });

  it("does not reactivate superseded Ledger rows during a later sync", () => {
    expect(supersededGuard).toContain("if old.import_status='SUPERSEDED'");
    expect(supersededGuard).toContain("new.import_status:=old.import_status");
    expect(supersededGuard).toContain("before update on finance.ledger_bank_transaction_sources");
  });

  it("preserves unavailable balance and classification metadata as null", () => {
    expect(incompleteMetadata).toContain("create or replace function finance.apply_ledger_bank_replacement");
    expect(incompleteMetadata).toContain("(item->>'balance_amount')::numeric");
    expect(incompleteMetadata).toContain("nullif(item->>'uploaded_major_category','')");
    expect(incompleteMetadata).not.toContain("or item->>'balance_amount' is null");
  });

  it("keeps PL/pgSQL row variables distinct from INSERT SELECT aliases", () => {
    expect(unambiguousItemAlias).toContain("row_item jsonb");
    expect(unambiguousItemAlias).toContain("for row_item in select value");
    expect(unambiguousItemAlias).toContain("as row_element(value)");
    expect(unambiguousItemAlias).not.toMatch(/\bitem\s+jsonb/);
  });

  it("normalizes replacement audit actors into the Auth identity column", () => {
    expect(auditAuthActor).toContain("'BANK_LEDGER_REPLACED'");
    expect(auditAuthActor).toContain("execute function audit.normalize_ledger_bank_auth_actor()");
  });

  it("keeps replacement rows eligible for later audited replacements", () => {
    expect(replacementSourceLinks).toContain("insert into finance.ledger_bank_transaction_sources");
    expect(replacementSourceLinks).toContain("t.replacement_batch_id=batch_id");
    expect(replacementSourceLinks).toContain("s.source_transaction_id is null");
    expect(replacementSourceLinks).toContain("과거 교체 이력에 이미 존재합니다");
  });
});
