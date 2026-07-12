import { describe, expect, it } from "vitest";
import {
  hydrateExpenseResolutionChildren,
  mapExpenseAccountAllocationsToRows,
  mapExpenseEvidenceToRows,
  mapExpenseResolutionItemsToRows,
  mapExpenseResolutionToUpsert,
} from "./expense-resolution-repository";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

describe("expense resolution repository", () => {
  it("maps the searchable lifecycle fields and preserves the complete snapshot", () => {
    const resolution = {
      id: "expense-resolution-1",
      resolutionNo: "지결-2026-0001",
      author: "오학동 사무장",
      currentApprover: "장현제 부장",
      approvalStatus: "승인대기",
      paymentStatus: "지급전",
      totalPaymentAmount: 50000,
    } as unknown as ManagedExpenseResolution;

    expect(mapExpenseResolutionToUpsert(resolution)).toMatchObject({
      id: resolution.id,
      resolution_no: resolution.resolutionNo,
      author_label: resolution.author,
      current_approver_label: resolution.currentApprover,
      approval_status: resolution.approvalStatus,
      payment_status: resolution.paymentStatus,
      resolution_mode: "SINGLE",
      expense_timing: "ADVANCE",
      input_method: "MANUAL",
      total_payment_amount: resolution.totalPaymentAmount,
      resolution_data: resolution,
    });
  });

  it("normalizes single items and account allocations into child rows", () => {
    const resolution = {
      id: "expense-resolution-1",
      expenseItems: [],
      singleItems: [
        { id: "item-1", itemName: "복사용지", memo: "", quantity: "2", unitPrice: "5000", supplyAmount: 10000, vatAmount: 1000, totalAmount: 11000 },
      ],
      accountAllocations: [
        { id: "allocation-1", accountTitle: "소모품비", amount: "11000", budgetItem: "운영비 > 사무용품", description: "복사용지" },
      ],
    } as ManagedExpenseResolution;

    expect(mapExpenseResolutionItemsToRows(resolution)).toEqual([
      expect.objectContaining({ id: "item-1", item_kind: "SINGLE", item_no: 1, resolution_id: resolution.id, supply_amount: 10000, vat_amount: 1000, total_amount: 11000 }),
    ]);
    expect(mapExpenseAccountAllocationsToRows(resolution)).toEqual([
      expect.objectContaining({ id: "allocation-1", resolution_id: resolution.id, account_title: "소모품비", amount: 11000, budget_item: "운영비 > 사무용품" }),
    ]);
  });

  it("hydrates child rows over the legacy json snapshot", () => {
    const resolution = { id: "expense-resolution-1", expenseItems: [], singleItems: [] } as unknown as ManagedExpenseResolution;
    const item = { id: "item-1", itemName: "복사용지", memo: "", quantity: "1", unitPrice: "10000", supplyAmount: 10000, vatAmount: 1000, totalAmount: 11000 };
    const allocation = { id: "allocation-1", accountTitle: "소모품비", amount: "11000", budgetItem: "운영비 > 사무용품", description: "" };

    expect(hydrateExpenseResolutionChildren(
      [resolution],
      [{ resolution_id: resolution.id, item_kind: "SINGLE", item_no: 1, item_data: item }],
      [{ resolution_id: resolution.id, allocation_data: allocation }],
    )[0]).toMatchObject({ singleItems: [item], accountAllocations: [allocation] });
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
