import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schemaSql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");

describe("Supabase schema organization", () => {
  it("creates ERP domain schemas instead of keeping operational tables in public", () => {
    expect(schemaSql).toContain("create schema if not exists core;");
    expect(schemaSql).toContain("create schema if not exists finance;");
    expect(schemaSql).toContain("create schema if not exists reports;");
    expect(schemaSql).toContain("create schema if not exists documents;");
    expect(schemaSql).toContain("create schema if not exists integrations;");
    expect(schemaSql).toContain("create schema if not exists audit;");
  });

  it("stores finance and report tables under their domain schemas", () => {
    expect(schemaSql).toContain("create table if not exists finance.bank_accounts");
    expect(schemaSql).toContain("references finance.bank_accounts(id)");
    expect(schemaSql).toContain("create table if not exists reports.report_definitions");
    expect(schemaSql).toContain("references reports.report_runs(id)");
    expect(schemaSql).not.toContain("create table if not exists public.bank_accounts");
    expect(schemaSql).not.toContain("create table if not exists public.report_definitions");
  });
});
