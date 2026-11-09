import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261110070010_performance_observability.sql"), "utf8");
const indexMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261110071000_performance_measurement_user_index.sql"), "utf8");

describe("performance observability migration", () => {
  it("stores sanitized metrics behind service-role-only access", () => {
    expect(migration).toContain("create table finance.performance_measurements");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on finance.performance_measurements from public,anon,authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("search_query");
    expect(migration).not.toContain("account_number");
  });

  it("requires an active administrator and aggregates percentiles server-side", () => {
    expect(migration).toContain("'ADMIN'=any(v_member.permissions)");
    expect(migration).toContain("percentile_cont(0.75)");
    expect(migration).toContain("percentile_cont(0.95)");
    expect(migration).toContain("security invoker");
  });

  it("covers both organization and user foreign-key access paths", () => {
    expect(migration).toContain("performance_measurements_org_time_idx");
    expect(indexMigration).toContain("performance_measurements_user_idx");
  });
});
