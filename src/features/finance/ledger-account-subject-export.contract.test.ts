import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20261119103000_ledger_account_subject_export.sql"), "utf8");
const repository = readFileSync(resolve("src/features/finance/ledger-account-subject-export.ts"), "utf8");
const route = readFileSync(resolve("src/app/api/integrations/ledger/account-subjects/route.ts"), "utf8");

describe("ERP account subject export contract", () => {
  it("keeps account-subject and category-link changes in a protected outbox", () => {
    expect(migration).toContain("create table finance.ledger_account_subject_export_outbox");
    expect(migration).toContain("alter table finance.ledger_account_subject_export_outbox enable row level security");
    expect(migration).toContain("revoke all on finance.ledger_account_subject_export_outbox from public,anon,authenticated");
    expect(migration).toContain("after insert or update or delete on finance.account_subjects");
    expect(migration).toContain("after insert or update or delete on finance.ledger_account_subject_links");
    expect(migration).toContain("'ACCOUNT_SUBJECT'");
    expect(migration).toContain("'CATEGORY_LINK'");
  });

  it("requires a signed request and preserves ERP UUIDs and cursors", () => {
    expect(route).toContain("exportAccountSubjectsForLedger");
    expect(repository).toContain("verifyLedgerIntegrationRequest");
    expect(repository).toContain("LEDGER_EXPORT_ORGANIZATION_ID");
    expect(repository).toContain('source_authority: "dbapt-erp"');
    expect(repository).toContain('resource: "account_subjects"');
    expect(repository).toContain("payload_hash");
    expect(repository).toContain("next_cursor");
  });
});
