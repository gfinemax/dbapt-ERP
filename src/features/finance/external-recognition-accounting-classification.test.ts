import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20261106223955_external_recognition_accounting_classification.sql",
), "utf8");
const repository = readFileSync(resolve(
  "src/features/finance/collection-ledger-repository.ts",
), "utf8");
const page = readFileSync(resolve(
  "src/features/finance/collection-ledger-page.tsx",
), "utf8");

describe("external recognition accounting classification", () => {
  it("separates actual trust funds from confirmed losses", () => {
    expect(migration).toContain("accounting_treatment text not null");
    expect(migration).toContain("actual_fund_amount numeric(16,0)");
    expect(migration).toContain("loss_amount numeric(16,0)");
    expect(migration).toContain("when new.accounting_treatment='trust_receipt'");
    expect(migration).toContain("when new.accounting_treatment='confirmed_loss'");
  });

  it("keeps records without an artificial assessment at member level", () => {
    expect(migration).toContain("'LINKED','MEMBER_LEVEL'");
    expect(migration).toContain("new.linkage_status:='MEMBER_LEVEL'");
    expect(migration).toContain("특정 부과를 새로 만들지 않고 조합원 전체 납부 인정 원장");
    expect(repository).toContain('"LINKED" | "MEMBER_LEVEL"');
  });

  it("shows source and accounting nature as separate concepts", () => {
    expect(page).toContain('dongil_fixed_certificate: "동일건설 정액 필증"');
    expect(page).toContain('confirmed_loss: "확정결손"');
    expect(page).toContain('trust_receipt: "신탁수납 · 결손 아님"');
    expect(page).toContain("미배분 통장 입금 후보");
  });

  it("keeps Dongil fixed certificates in a dedicated non-overlapping ledger tab", () => {
    expect(page).toContain('general: "일반 외부납입"');
    expect(page).toContain('fixed: "정액 필증 3천만원"');
    expect(page).toContain('all: "전체 감사 목록"');
    expect(page).toContain('recognition.source_kind !== "dongil_fixed_certificate"');
    expect(page).toContain('recognition.source_kind === "dongil_fixed_certificate"');
    expect(page).toContain('label: "PeopleON ID 연결 필요"');
  });
});
