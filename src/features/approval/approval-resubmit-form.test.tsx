import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApprovalDocument } from "./approval-domain";
import { ApprovalResubmitForm } from "./approval-resubmit-form";

const resubmitApprovalAction = vi.fn();

vi.mock("@/app/approval/actions", () => ({
  resubmitApprovalAction: (...args: unknown[]) => resubmitApprovalAction(...args),
}));

const rejectedDocument: ApprovalDocument = {
  amount: 10_000,
  approvalStatus: "REJECTED",
  approvalSteps: [{ approverLabel: "오학동", approverRole: "사무국장", comment: "품목 보완", order: 1, status: "REJECTED" }],
  body: "복사용지 구입",
  budgetItem: "소모품비",
  counterpartyName: "문구점",
  createdAt: "2026-08-16T00:00:00Z",
  departmentLabel: "사무국",
  documentNo: "APR-2026-000002",
  documentType: "EXPENSE",
  drafterLabel: "오학동",
  executionStatus: "NOT_LINKED",
  id: "approval-2",
  meetingStatus: "NOT_REQUIRED",
  projectName: "",
  purpose: "사무용품 구매",
  reservedAmount: 0,
  title: "복사용지 구입",
  updatedAt: "2026-08-16T00:00:00Z",
};

describe("ApprovalResubmitForm", () => {
  it("shows the rejection reason and preloads editable document values", () => {
    render(<ApprovalResubmitForm document={rejectedDocument} rejectionReason="구매 수량을 적어주세요." />);

    expect(screen.getByText("구매 수량을 적어주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("제목")).toHaveValue("복사용지 구입");
    expect(screen.getByLabelText("기안 내용")).toHaveValue("복사용지 구입");
    expect(screen.getByLabelText("금액")).toHaveValue(10_000);
  });

  it("submits corrected values for a new approval round", async () => {
    resubmitApprovalAction.mockResolvedValueOnce({ success: true });
    render(<ApprovalResubmitForm document={rejectedDocument} rejectionReason="품목 보완" />);
    fireEvent.change(screen.getByLabelText("기안 내용"), { target: { value: "A4 복사용지 5박스 구입" } });

    fireEvent.click(screen.getByRole("button", { name: "수정 내용으로 재상신" }));

    await waitFor(() => expect(resubmitApprovalAction).toHaveBeenCalled());
  });

  it("shows resubmission failures inline", async () => {
    resubmitApprovalAction.mockResolvedValueOnce({ error: "기안자만 수정 후 재상신할 수 있어." });
    render(<ApprovalResubmitForm document={rejectedDocument} rejectionReason="품목 보완" />);

    fireEvent.click(screen.getByRole("button", { name: "수정 내용으로 재상신" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("기안자만 수정 후 재상신할 수 있어.");
  });
});
