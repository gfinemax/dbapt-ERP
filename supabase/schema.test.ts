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
    expect(schemaSql).toContain("create table if not exists finance.account_subjects");
    expect(schemaSql).toContain("source text not null default '직접등록'");
    expect(schemaSql).toContain("aliases text[] not null default array[]::text[]");
    expect(schemaSql).toContain("references finance.bank_accounts(id)");
    expect(schemaSql).toContain("references finance.account_subjects(id)");
    expect(schemaSql).toContain("transaction_kind text not null default '출금'");
    expect(schemaSql).toContain("uploaded_major_category text");
    expect(schemaSql).toContain("uploaded_account_title text");
    expect(schemaSql).toContain("recommended_account_subject_id uuid references finance.account_subjects(id)");
    expect(schemaSql).toContain("match_status text not null default '미분류'");
    expect(schemaSql).toContain("raw_payload jsonb not null default '{}'::jsonb");
    expect(schemaSql).toContain("create table if not exists reports.report_definitions");
    expect(schemaSql).toContain("references reports.report_runs(id)");
    expect(schemaSql).not.toContain("create table if not exists public.bank_accounts");
    expect(schemaSql).not.toContain("create table if not exists public.report_definitions");
  });

  it("creates account subjects before bank transactions reference them", () => {
    expect(schemaSql.indexOf("create table if not exists finance.account_subjects")).toBeLessThan(
      schemaSql.indexOf("create table if not exists finance.bank_transactions"),
    );
  });
});
