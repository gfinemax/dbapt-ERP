import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
import type { ApprovalDocument } from "./approval-domain";
import { ApprovalDetailPage } from "./approval-detail-page";

vi.mock("@/components/erp-shell", () => ({ ErpShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("./approval-print", () => ({ ApprovalPrint: () => null }));
vi.mock("@/app/approval/actions", () => ({
  closeApprovalAction: vi.fn(),
  createContractAction: vi.fn(),
  createContractPaymentExpenseAction: vi.fn(),
  createLinkedExpenseAction: vi.fn(),
  createMeetingAgendaAction: vi.fn(),
  decideMeetingAgendaAction: vi.fn(),
  openApprovalAttachmentAction: vi.fn(),
  submitApprovalAction: vi.fn(),
  updateApprovalAction: vi.fn(),
}));

const viewer: ReimbursementMember = {
  active: true,
  display_name: "관리자",
  organization_id: "organization",
  permissions: ["ADMIN"],
  user_id: "admin",
};

function documentFixture(): ApprovalDocument {
  return {
    amount: 1000,
    approvalStatus: "APPROVED",
    approvalSteps: [],
    attachments: [],
    auditLogs: [],
    authorization: { drafter_user_id: "admin", steps: [], version: 2 },
    body: "승인된 지출",
    createdAt: "2026-11-11T00:00:00Z",
    departmentLabel: "운영팀",
    documentNo: "기안-2026-0001",
    documentType: "EXPENSE",
    drafterLabel: "관리자",
    executionLinks: [{
      expenseResolutionId: "approval-expense-document-id",
      id: "link-id",
      kind: "EXPENSE",
      status: "HANDED_OFF",
      workflowTransactionId: "workflow-id",
    }],
    executionStatus: "EXPENSE_DRAFT",
    id: "document-id",
    isOutOfBudget: false,
    meetingStatus: "NOT_REQUIRED",
    paymentSchedule: [],
    projectName: "사업",
    purpose: "승인된 목적",
    reservedAmount: 1000,
    title: "승인된 지출",
    updatedAt: "2026-11-11T00:00:00Z",
  };
}

it("opens the exact integrated resolution and does not offer a duplicate handoff", () => {
  render(<ApprovalDetailPage document={documentFixture()} viewer={viewer} />);

  expect(screen.getByRole("link", { name: "연결된 회계·자금 업무 보기 →" }))
    .toHaveAttribute("href", "/finance/expense-resolutions?resolutionId=approval-expense-document-id");
  expect(screen.queryByRole("button", { name: "회계·자금으로 넘기기" })).not.toBeInTheDocument();
});

it("offers an exact workflow-only bridge for a legacy linked resolution", () => {
  const document = documentFixture();
  document.executionLinks![0].workflowTransactionId = undefined;
  render(<ApprovalDetailPage document={document} viewer={viewer} />);

  expect(screen.getByRole("button", { name: "통합 자금 거래 연결하기" })).toBeInTheDocument();
  expect(screen.getByText("기존 지출결의는 바꾸지 않고 통합 자금 거래만 이어 붙여.")).toBeInTheDocument();
});
