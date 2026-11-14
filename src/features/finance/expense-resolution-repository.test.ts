import { describe, expect, it } from "vitest";
import {
  hydrateExpenseResolutionChildren,
  mapExpenseAccountAllocationsToRows,
  mapExpenseDisbursementUpdate,
  mapExpenseEvidenceToRows,
  mapExpenseResolutionItemsToRows,
  mapExpenseResolutionToUpsert,
} from "./expense-resolution-repository";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import { expenseResolutionFixture } from "./expense-resolution-test-fixture";

describe("expense resolution repository", () => {
  it("maps the searchable lifecycle fields and preserves the complete snapshot", () => {
    const resolution = {
      id: "expense-resolution-1",
      resolutionNo: "지결-2026-0001",
      author: "오학동 사무장",
      currentApprover: "장현제 부장",
      approvalStatus: "승인대기",
      budgetId: "00000000-0000-4000-8000-000000000001",
      budgetMonth: "2026-01-01",
      paymentStatus: "지급전",
      totalPaymentAmount: 50000,
    } as unknown as ManagedExpenseResolution;

    expect(mapExpenseResolutionToUpsert(resolution)).toMatchObject({
      id: resolution.id,
      resolution_no: resolution.resolutionNo,
      author_label: resolution.author,
      current_approver_label: resolution.currentApprover,
      approval_status: resolution.approvalStatus,
      budget_id: resolution.budgetId,
      budget_month: resolution.budgetMonth,
      payment_status: resolution.paymentStatus,
      resolution_mode: "SINGLE",
      expense_timing: "ADVANCE",
      input_method: "MANUAL",
      total_payment_amount: resolution.totalPaymentAmount,
      resolution_data: resolution,
    });
  });

  it("updates only voucher fields when the payment status does not change", () => {
    const resolution = expenseResolutionFixture({
      actualPaidAmount: 252000,
      disbursedAt: "2026-01-30",
      paymentStatus: "지급완료",
      voucherNo: "지출-2026-0001",
      voucherStatus: "초안",
    });

    const update = mapExpenseDisbursementUpdate(resolution, { paymentStatus: "지급완료" });

    expect(update).toMatchObject({
      resolution_data: expect.objectContaining({ voucherNo: "지출-2026-0001", voucherStatus: "초안" }),
      voucher_no: "지출-2026-0001",
      voucher_status: "초안",
    });
    expect(update).not.toHaveProperty("actual_paid_amount");
    expect(update).not.toHaveProperty("disbursed_at");
    expect(update).not.toHaveProperty("payment_status");
  });

  it("updates payment fields when the payment status changes", () => {
    const resolution = expenseResolutionFixture({
      actualPaidAmount: 252000,
      disbursedAt: "2026-01-30",
      paymentStatus: "지급완료",
    });

    expect(mapExpenseDisbursementUpdate(resolution, { paymentStatus: "지급대기" })).toMatchObject({
      actual_paid_amount: 252000,
      disbursed_at: "2026-01-30",
      payment_status: "지급완료",
    });
  });

  it("normalizes single items and account allocations into child rows", () => {
    const resolution = expenseResolutionFixture({
      id: "expense-resolution-1",
      expenseItems: [],
      singleItems: [
        { id: "item-1", itemName: "복사용지", memo: "", quantity: "2", unitPrice: "5000", supplyAmount: 10000, taxCategory: "TAXABLE", vatAmount: 1000, totalAmount: 11000 },
      ],
      accountAllocations: [
        { id: "allocation-1", accountTitle: "소모품비", amount: "11000", budgetItem: "운영비 > 사무용품", description: "복사용지" },
      ],
    });

    expect(mapExpenseResolutionItemsToRows(resolution)).toEqual([
      expect.objectContaining({ id: "item-1", item_kind: "SINGLE", item_no: 1, resolution_id: resolution.id, supply_amount: 10000, vat_amount: 1000, total_amount: 11000 }),
    ]);
    expect(mapExpenseAccountAllocationsToRows(resolution)).toEqual([
      expect.objectContaining({ id: "allocation-1", resolution_id: resolution.id, account_title: "소모품비", amount: 11000, budget_item: "운영비 > 사무용품" }),
    ]);
  });

  it("hydrates child rows over the legacy json snapshot", () => {
    const resolution = { id: "expense-resolution-1", expenseItems: [], singleItems: [] } as unknown as ManagedExpenseResolution;
    const item = { id: "item-1", itemName: "복사용지", memo: "", quantity: "1", unitPrice: "10000", supplyAmount: 10000, taxCategory: "TAXABLE" as const, vatAmount: 1000, totalAmount: 11000 };
    const allocation = { id: "allocation-1", accountTitle: "소모품비", amount: "11000", budgetItem: "운영비 > 사무용품", description: "" };

    expect(hydrateExpenseResolutionChildren(
      [resolution],
      [{ resolution_id: resolution.id, item_kind: "SINGLE", item_no: 1, item_data: item }],
      [{ resolution_id: resolution.id, allocation_data: allocation }],
    )[0]).toMatchObject({ singleItems: [item], accountAllocations: [allocation] });
  });

  it("groups interleaved child rows by resolution while retaining item order", () => {
    const first = expenseResolutionFixture({ id: "resolution-1", expenseItems: [], singleItems: [] });
    const second = expenseResolutionFixture({ id: "resolution-2", expenseItems: [], singleItems: [] });
    const firstLaterItem = { id: "first-2", itemName: "토너", memo: "", quantity: "1", unitPrice: "20000", supplyAmount: 20000, taxCategory: "TAXABLE" as const, vatAmount: 2000, totalAmount: 22000 };
    const firstEarlierItem = { ...firstLaterItem, id: "first-1", itemName: "복사용지" };
    const secondItem = { ...firstLaterItem, id: "second-1", itemName: "봉투" };

    const hydrated = hydrateExpenseResolutionChildren(
      [first, second],
      [
        { resolution_id: first.id, item_kind: "SINGLE", item_no: 2, item_data: firstLaterItem },
        { resolution_id: second.id, item_kind: "SINGLE", item_no: 1, item_data: secondItem },
        { resolution_id: first.id, item_kind: "SINGLE", item_no: 1, item_data: firstEarlierItem },
      ],
      [],
    );

    expect(hydrated[0].singleItems?.map((item) => item.id)).toEqual(["first-1", "first-2"]);
    expect(hydrated[1].singleItems?.map((item) => item.id)).toEqual(["second-1"]);
  });

  it("maps private evidence metadata without exposing a public URL", () => {
    const resolution = {
      id: "expense-resolution-1",
      evidenceFiles: [{
        contentType: "application/pdf",
        evidenceType: "세금계산서",
        fileName: "세금계산서.pdf",
        fileSize: 2048,
        id: "evidence-1",
        ocrData: { issuer: "다이스", totalAmount: 11000 },
        ocrStatus: "EXTRACTED",
        storageBucket: "expense-evidence",
        storagePath: "지결-2026-0001/evidence-1.pdf",
        uploadedAt: "2026-07-15T09:00:00.000Z",
        uploadedBy: "오학동 사무장",
      }],
    } as unknown as ManagedExpenseResolution;

    expect(mapExpenseEvidenceToRows(resolution)).toEqual([
      expect.objectContaining({ id: "evidence-1", resolution_id: resolution.id, storage_bucket: "expense-evidence", storage_path: "지결-2026-0001/evidence-1.pdf", ocr_status: "EXTRACTED" }),
    ]);
  });
});
