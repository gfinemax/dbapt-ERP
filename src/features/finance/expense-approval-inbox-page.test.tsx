import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseApprovalInboxPage } from "./expense-approval-inbox-page";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

describe("ExpenseApprovalInboxPage", () => {
  it("renders an empty approval inbox without sample resolutions", () => {
    render(<ExpenseApprovalInboxPage />);

    expect(screen.getByRole("heading", { name: "결재함" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "결재함 목록" })).toBeInTheDocument();
    expect(screen.queryByText(/지결-2026-01/)).not.toBeInTheDocument();
  });

  it("keeps the inbox available when the remote data source is unavailable", () => {
    render(<ExpenseApprovalInboxPage dataLoadError="지출결의 저장소에 연결하지 못했습니다." initialResolutions={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("지출결의 저장소에 연결하지 못했습니다.");
  });

  it("persists approval through the server transition with an optimistic state guard", async () => {
    const resolution = {
      id: "approval-test-1",
      resolutionNo: "지결-2026-0001",
      createdAt: "2026-07-12",
      subject: "사무용품 구매",
      projectName: "사무국 비품 구입",
      resolutionType: "SINGLE" as const,
      representativeVendorName: "다이스",
      representativeAccountTitle: "소모품비",
      totalPaymentAmount: 11000,
      paymentStatus: "지급전" as const,
      evidenceAttached: true,
      history: [],
      expenseItems: [],
      settlementStatus: "정산없음" as const,
      paymentFlowType: "사전결의" as const,
      approvalLine: [
        { approver: "장현제", order: 1, processedAt: "2026-07-01 10:00", role: "부장", status: "승인완료" as const },
        { approver: "오학동", order: 2, role: "사무장", status: "결재대기" as const },
        { approver: "안동연", order: 3, role: "조합장", status: "대기" as const },
      ],
      approvalStatus: "승인대기" as const,
      currentApprover: "오학동 사무장",
    } as ManagedExpenseResolution;
    const transitionApproval = vi.fn().mockResolvedValue({
      ...resolution,
      approvalLine: resolution.approvalLine.map((step, index) => index === 1 ? { ...step, status: "승인완료" } : index === 2 ? { ...step, status: "결재대기" } : step),
      currentApprover: "안동연 조합장",
    });
    render(<ExpenseApprovalInboxPage initialResolutions={[resolution]} transitionApproval={transitionApproval} />);
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(transitionApproval).toHaveBeenCalledWith(expect.objectContaining({
      actorLabel: "오학동 사무장",
      command: "APPROVE",
      expectedCurrentApprover: "오학동 사무장",
      expectedStatus: "승인대기",
      resolutionId: resolution.id,
    })));
    expect(await screen.findByText("안동연 조합장")).toBeInTheDocument();
  });
});
