import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20261106130439_ledger_external_recognition_full_projection.sql",
), "utf8");
const repository = readFileSync(resolve(
  "src/features/finance/ledger-external-recognition-sync.ts",
), "utf8");

describe("Ledger external recognition full projection", () => {
  it("preserves every source version before applying accounting linkage", () => {
    expect(migration).toContain("ledger_external_recognition_events");
    expect(migration).toContain("source_root_recognition_id");
    expect(migration).toContain("source_current_recognition_id");
    expect(migration).toContain("source_version,event_type,sync_reason,payload_hash,payload");
    expect(migration).toContain("unique(organization_id,source_system,source_recognition_id,source_version)");
  });

  it("keeps unlinked source records while excluding them from accounting totals", () => {
    expect(migration).toContain("alter column assessment_id drop not null");
    expect(migration).toContain("'LINKED','UNLINKED','ASSESSMENT_MISSING','MEMBER_MISMATCH','EXCEEDS_ASSESSMENT'");
    expect(migration).toContain("target_assessment_id:=null");
    expect(migration).toContain("x.status='ACTIVE' and x.assessment_id is not null");
  });

  it("pulls the Ledger endpoint with the existing HMAC cursor protocol", () => {
    expect(repository).toContain('const path = "/api/integrations/erp/external-contribution-recognitions"');
    expect(repository).toContain("signLedgerRequest(secret, url, timestamp, nonce)");
    expect(repository).toContain("p_from_cursor: cursor");
  });
});
