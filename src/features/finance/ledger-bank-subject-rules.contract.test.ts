import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261105124753_ledger_bank_subject_rules.sql"), "utf8");
const syncMigration = readFileSync(join(process.cwd(), "supabase/migrations/20261105133849_ledger_account_subject_sync.sql"), "utf8");
const stableLinkMigration = readFileSync(join(process.cwd(), "supabase/migrations/20261105135359_ledger_account_subject_sync_stable_links.sql"), "utf8");
const syncAuditActorMigration = readFileSync(join(process.cwd(), "supabase/migrations/20261105140627_ledger_account_subject_sync_audit_actor.sql"), "utf8");

describe("Ledger bank subject rule migration", () => {
  it("keeps rules organization-scoped, audited, and recommendation-only", () => {
    expect(migration).toContain("unique (organization_id,source_system,match_type,source_key,direction)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("ledger_bank_subject_rule_audit_logs");
    expect(migration).toContain("classification_status='RECOMMENDED'");
    expect(migration).toContain("confirmed_account_subject_id is null");
    expect(migration).not.toContain("set confirmed_account_subject_id=subject_row.id");
  });

  it("suppresses transfer and review rules from automatic account recommendations", () => {
    expect(migration).toContain("rule_status in ('CONFIRMED','POLICY_REVIEW','TRANSFER')");
    expect(migration).toContain("if status_value='CONFIRMED' then");
  });

  it("syncs Ledger categories idempotently while retaining source links and audits", () => {
    expect(syncMigration).toContain("ledger_account_subject_links");
    expect(syncMigration).toContain("unique (organization_id,source_system,ledger_category_id,direction)");
    expect(syncMigration).toContain("ledger_account_subject_link_audit_logs");
    expect(syncMigration).toContain("finance.workflow_actor(p_org,p_actor,'ADMIN')");
    expect(syncMigration).toContain("on conflict (organization_id,source_system,ledger_category_id,direction) do update");
    expect(syncMigration).toContain("category_name_value='확인필요'");
    expect(syncMigration).toContain("category_name_value='계좌간이체'");
    expect(syncMigration).toContain("'Ledger 원장'");
    expect(syncMigration).toContain("grant execute on function finance.sync_ledger_account_subjects(uuid,uuid,jsonb) to service_role");
    expect(stableLinkMigration).toContain("link_before.account_subject_id");
    expect(stableLinkMigration).toContain("기존 Ledger category_id와 ERP 계정과목 UUID 연결을 유지");
    expect(syncAuditActorMigration).toContain("'LEDGER_ACCOUNT_SUBJECTS_SYNC'");
    expect(syncAuditActorMigration).toContain("execute function audit.normalize_ledger_bank_auth_actor()");
  });
});
