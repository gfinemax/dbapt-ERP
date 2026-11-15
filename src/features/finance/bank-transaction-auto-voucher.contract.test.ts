import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20261114113656_bank_transaction_processing_and_auto_vouchers.sql"),
  "utf8",
);

describe("bank transaction processing and automatic voucher migration", () => {
  it("derives processing status without overwriting the source transaction", () => {
    expect(migration).toContain("create or replace view finance.bank_transaction_processing_status");
    expect(migration).toContain("'전표 생성 완료'");
    expect(migration).toContain("'계좌대체'");
    expect(migration).toContain("'취소·환불 연결'");
    expect(migration).toContain("'확인 필요'");
    expect(migration).not.toMatch(/update finance\.bank_transactions set\s+(description|withdrawal_amount|deposit_amount)/i);
  });

  it("creates one idempotent voucher per linked bank transaction after final approval", () => {
    expect(migration).toContain("create or replace function finance.auto_finalize_bank_expense_vouchers");
    expect(migration).toContain("after update of approval_status,payment_status on finance.expense_resolutions");
    expect(migration).toContain("bank_transaction_id=bank.id and deleted_at is null");
    expect(migration).toContain("linked_total<>resolution.total_payment_amount");
    expect(migration).toContain("debit_subject is not null and credit_subject is not null");
  });

  it("keeps automatic functions server-only and supports rechecking confirmed accounts", () => {
    expect(migration).toContain("create or replace function finance.refresh_bank_expense_vouchers_for_transactions");
    expect(migration).toContain("revoke all on function finance.auto_finalize_bank_expense_vouchers");
    expect(migration).toContain("grant execute on function finance.refresh_bank_expense_vouchers_for_transactions(uuid,uuid,uuid[]) to service_role");
  });
});
