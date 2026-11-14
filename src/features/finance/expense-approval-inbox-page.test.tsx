import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseApprovalInboxPage } from "./expense-approval-inbox-page";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import { expenseResolutionFixture } from "./expense-resolution-test-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ExpenseApprovalInboxPage", () => {
  it("renders an empty approval inbox without sample resolutions", () => {
    render(<ExpenseApprovalInboxPage />);

    expect(screen.getByRole("heading", { name: "지출결의 승인" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "결재함 목록" })).toBeInTheDocument();
    expect(screen.queryByText(/지결-2026-01/)).not.toBeInTheDocument();
  });

  it("keeps the inbox available when the remote data source is unavailable", () => {
    render(<ExpenseApprovalInboxPage dataLoadError="지출결의 저장소에 연결하지 못했습니다." initialResolutions={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("지출결의 저장소에 연결하지 못했습니다.");
  });

  it("opens the shared A4 preview from both print menu actions", () => {
    const resolution = expenseResolutionFixture({
      id: "print-test",
      resolutionNo: "지결-2026-0033",
      subject: "1월 업무식대",
      vendorName: "옛골식당",
    });
    render(<ExpenseApprovalInboxPage initialDetailId={resolution.id} initialResolutions={[resolution]} />);

    fireEvent.click(screen.getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "A4 출력 미리보기" }));
    expect(screen.getByRole("dialog", { name: "지출결의서 출력 미리보기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출력 미리보기 닫기" }));

    fireEvent.click(screen.getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "보관용 PDF 생성" }));
    expect(screen.getByRole("dialog", { name: "지출결의서 출력 미리보기" })).toBeInTheDocument();
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
        { approver: "장현제", order: 1, processedAt: "2026-07-01 10:00", role: "담당자", status: "승인완료" as const },
        { approver: "오학동", order: 2, role: "사무국장", status: "결재대기" as const },
        { approver: "안동연", order: 3, role: "조합장", status: "대기" as const },
      ],
      approvalStatus: "승인대기" as const,
      currentApprover: "오학동 사무국장",
    authorization: { author_user_id: "author", version: 1, steps: [{ order: 2, approver_user_id: "reviewer", legacy_step: { approver: "오학동", role: "사무국장", order: 2 } }] },
    } as unknown as ManagedExpenseResolution;
    const transitionApproval = vi.fn().mockResolvedValue({
      ...resolution,
      approvalLine: resolution.approvalLine.map((step, index) => index === 1 ? { ...step, status: "승인완료" } : index === 2 ? { ...step, status: "결재대기" } : step),
      currentApprover: "안동연 조합장",
    });
    render(<ExpenseApprovalInboxPage viewer={{ user_id: "reviewer", organization_id: "org", display_name: "오학동 사무국장", permissions: ["APPROVE"], active: true }} initialResolutions={[resolution]} transitionApproval={transitionApproval} />);
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(transitionApproval).toHaveBeenCalledWith(expect.objectContaining({
      actorLabel: "오학동 사무국장",
      command: "APPROVE",
      expectedCurrentApprover: "오학동 사무국장",
      expectedStatus: "승인대기",
      resolutionId: resolution.id,
    })));
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(await screen.findByText("안동연 조합장")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "지출결의 검색" }), { target: { value: "존재하지않는거래처" } });
    expect(screen.queryByText("지결-2026-0001")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "지출결의 검색" }), { target: { value: "다이스" } });
    expect(screen.getByText("지결-2026-0001")).toBeInTheDocument();
  });

  it("creates and confirms a voucher through the server disbursement transition", async () => {
    const resolution = expenseResolutionFixture({
      approvalStatus: "승인완료",
      id: "voucher-test-1",
      paymentStatus: "지급완료",
      resolutionNo: "지결-2026-0033",
      voucherNo: undefined,
      voucherStatus: undefined,
    });
    const transitionDisbursement = vi.fn()
      .mockResolvedValueOnce({ ...resolution, voucherNo: "지출-2026-0001", voucherStatus: "전표초안" })
      .mockResolvedValueOnce({ ...resolution, voucherNo: "지출-2026-0001", voucherStatus: "전표확정" });
    render(<ExpenseApprovalInboxPage
      initialDetailId={resolution.id}
      initialResolutions={[resolution]}
      transitionDisbursement={transitionDisbursement}
      viewer={{ user_id: "chair", organization_id: "org", display_name: "안동연 조합장", permissions: ["APPROVE", "PAY"], active: true }}
    />);

    fireEvent.click(within(screen.getByRole("region", { name: "다음 할 일" })).getByRole("button", { name: "전표초안 생성" }));
    await waitFor(() => expect(transitionDisbursement).toHaveBeenNthCalledWith(1, expect.objectContaining({
      actorLabel: "안동연 조합장",
      command: "VOUCHER_CREATE",
      expectedPaymentStatus: "지급완료",
      resolutionId: resolution.id,
    })));

    fireEvent.click(within(screen.getByRole("region", { name: "다음 할 일" })).getByRole("button", { name: "전표확정" }));
    await waitFor(() => expect(transitionDisbursement).toHaveBeenNthCalledWith(2, expect.objectContaining({
      command: "VOUCHER_CONFIRM",
      expectedVoucherStatus: "전표초안",
      resolutionId: resolution.id,
    })));
  });
});
